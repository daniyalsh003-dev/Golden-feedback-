import 'server-only'

import { db } from '@/lib/db'
import { appointment, customer, smsLog } from '@/lib/db/schema'
import type { Appointment, Customer } from '@/lib/db/schema'
import {
  appointmentSmsEligibility,
  createAppointment,
  isCancelledStatus,
  isNoShowStatus,
  upsertCustomer,
} from '@/lib/feedback-system'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import {
  absoluteFeedbackUrl,
  buildFeedbackSmsBody,
  firstNameFrom,
} from '@/lib/sms-message'
import {
  getAutomationConfig,
  getSmsAutoSendEnabled,
} from '@/lib/settings'
import { sendSms } from '@/lib/twilio'
import { eq } from 'drizzle-orm'

/**
 * SMS send orchestration. This is the single place that talks to Twilio for
 * feedback-request messages. It layers duplicate protection, per-customer pause,
 * and 5-star suppression on top of the existing eligibility rules, and records
 * every attempt to `sms_log`. A failed Twilio attempt is NEVER recorded as sent.
 */

export type SmsSendMethod = 'auto' | 'manual' | 'manual_marked'

export interface SmsSendResult {
  ok: boolean
  status: 'sent' | 'skipped' | 'failed' | 'not_found' | 'marked'
  reason: string
  sid?: string
  to?: string
  body?: string
}

/** Pick a customer's most recent appointment (by visit time, then capture time). */
async function latestAppointmentForCustomer(
  customerId: string,
): Promise<Appointment | null> {
  const rows = await db
    .select()
    .from(appointment)
    .where(eq(appointment.customerId, customerId))
  if (rows.length === 0) return null
  return rows.reduce((best, a) => {
    const at = (a.appointmentAt ?? a.createdAt).getTime()
    const bt = (best.appointmentAt ?? best.createdAt).getTime()
    return at >= bt ? a : best
  })
}

async function logSms(entry: {
  customerId: string | null
  appointmentId: string | null
  toPhone: string | null
  body: string | null
  messageSid?: string | null
  status: 'sent' | 'failed' | 'manual_marked'
  method: SmsSendMethod
  errorCode?: string | null
  errorMessage?: string | null
}): Promise<void> {
  await db.insert(smsLog).values({
    customerId: entry.customerId,
    appointmentId: entry.appointmentId,
    toPhone: entry.toPhone,
    body: entry.body,
    messageSid: entry.messageSid ?? null,
    status: entry.status,
    method: entry.method,
    errorCode: entry.errorCode ?? null,
    errorMessage: entry.errorMessage ?? null,
  })
}

/**
 * Send (via Twilio) the feedback-request SMS for a single appointment.
 *
 * - method 'auto': fully guarded — respects customer pause, 5-star suppression,
 *   feedback-already-submitted, and duplicate protection (never re-sends).
 * - method 'manual': admin action. Bypasses pause / 5-star suppression, and may
 *   re-send an already-sent message only when `allowResend` is true.
 *
 * On Twilio success the appointment is marked sent; on failure it records the
 * error but is NOT marked sent, so it stays retriable.
 */
export async function sendAppointmentFeedbackSms(
  appointmentId: string,
  opts: { method: 'auto' | 'manual'; allowResend?: boolean },
): Promise<SmsSendResult> {
  const [apt] = await db
    .select()
    .from(appointment)
    .where(eq(appointment.id, appointmentId))
    .limit(1)
  if (!apt) return { ok: false, status: 'not_found', reason: 'Appointment not found' }

  const [cust] = await db
    .select()
    .from(customer)
    .where(eq(customer.id, apt.customerId))
    .limit(1)
  if (!cust) return { ok: false, status: 'not_found', reason: 'Customer not found' }

  if (!isValidPhone(cust.phoneNumber)) {
    return { ok: false, status: 'skipped', reason: 'No valid phone number on file' }
  }

  if (opts.method === 'auto') {
    if (cust.smsPaused) {
      return { ok: false, status: 'skipped', reason: 'Customer SMS is paused' }
    }
    const eligibility = appointmentSmsEligibility(cust, apt)
    if (!eligibility.eligible) {
      return { ok: false, status: 'skipped', reason: eligibility.reason }
    }
  } else {
    // Manual admin override.
    if (apt.smsSent && !opts.allowResend) {
      return {
        ok: false,
        status: 'skipped',
        reason: 'SMS already sent — use Resend to send again',
      }
    }
  }

  const to = normalizePhone(cust.phoneNumber) as string
  const body = buildFeedbackSmsBody({
    firstName: cust.customerName,
    // Barber = the appointment's assigned Square team member (never service text).
    barberFirstName: apt.staffMember,
    url: absoluteFeedbackUrl(apt.feedbackToken),
  })

  const result = await sendSms({ to, body })
  const now = new Date()

  if (!result.ok) {
    await db
      .update(appointment)
      .set({
        smsError: result.errorMessage ?? 'Twilio send failed',
        smsLastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(appointment.id, apt.id))
    await logSms({
      customerId: cust.id,
      appointmentId: apt.id,
      toPhone: to,
      body,
      status: 'failed',
      method: opts.method,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    })
    return {
      ok: false,
      status: 'failed',
      reason: result.errorMessage ?? 'Twilio send failed',
      to,
      body,
    }
  }

  await db
    .update(appointment)
    .set({
      smsSent: true,
      smsSentAt: now,
      smsSendMethod: opts.method,
      smsMessageSid: result.sid ?? null,
      smsError: null,
      smsLastAttemptAt: now,
      updatedAt: now,
    })
    .where(eq(appointment.id, apt.id))
  await logSms({
    customerId: cust.id,
    appointmentId: apt.id,
    toPhone: to,
    body,
    messageSid: result.sid,
    status: 'sent',
    method: opts.method,
  })

  return { ok: true, status: 'sent', reason: 'SMS sent', sid: result.sid, to, body }
}

/** "Send SMS Now" / "Resend SMS": send for a customer's latest appointment. */
export async function sendCustomerFeedbackSms(
  customerId: string,
  opts: { allowResend?: boolean } = {},
): Promise<SmsSendResult> {
  const apt = await latestAppointmentForCustomer(customerId)
  if (!apt) {
    return {
      ok: false,
      status: 'skipped',
      reason: 'No appointment on file to send for',
    }
  }
  return sendAppointmentFeedbackSms(apt.id, {
    method: 'manual',
    allowResend: opts.allowResend,
  })
}

/**
 * "Mark as Sent": record that the admin sent the message out-of-band (not via
 * Twilio). Sets the appointment as sent with method 'manual_marked' so the
 * distinction from an actual Twilio send is preserved.
 */
export async function markCustomerSmsSentManually(
  customerId: string,
): Promise<SmsSendResult> {
  const apt = await latestAppointmentForCustomer(customerId)
  if (!apt) {
    return { ok: false, status: 'skipped', reason: 'No appointment on file' }
  }
  return markAppointmentSmsSentManually(apt.id)
}

/** Appointment-scoped "Mark as Sent" — used by the Daily Appointments page. */
export async function markAppointmentSmsSentManually(
  appointmentId: string,
): Promise<SmsSendResult> {
  const [apt] = await db
    .select()
    .from(appointment)
    .where(eq(appointment.id, appointmentId))
    .limit(1)
  if (!apt) {
    return { ok: false, status: 'not_found', reason: 'Appointment not found' }
  }
  const now = new Date()
  await db
    .update(appointment)
    .set({
      smsSent: true,
      smsSentAt: now,
      smsSendMethod: 'manual_marked',
      updatedAt: now,
    })
    .where(eq(appointment.id, apt.id))
  await logSms({
    customerId: apt.customerId,
    appointmentId: apt.id,
    toPhone: null,
    body: null,
    status: 'manual_marked',
    method: 'manual_marked',
  })
  return { ok: true, status: 'marked', reason: 'Marked as sent (manual)' }
}

/**
 * Admin-only test send to a chosen phone. Reuses the real customer/appointment
 * machinery so the feedback link, feedback page, and 5-star / 1–4 star flows can
 * all be verified end-to-end with the same Twilio path production uses.
 */
export async function sendTestSms(input: {
  toPhone: string
  firstName?: string
}): Promise<SmsSendResult & { url?: string }> {
  if (!isValidPhone(input.toPhone)) {
    return { ok: false, status: 'failed', reason: 'Enter a valid phone number' }
  }

  // A named first name tests personalization; leaving it blank tests the
  // graceful fallback greeting.
  const name = input.firstName?.trim() || 'Guest'
  const cust = await upsertCustomer({ name, phone: input.toPhone })
  const apt = await createAppointment({
    customerId: cust.id,
    appointmentAt: new Date(),
    serviceName: 'Test — SMS verification',
  })

  const url = absoluteFeedbackUrl(apt.feedbackToken)
  const to = normalizePhone(input.toPhone) as string
  const body = buildFeedbackSmsBody({ firstName: name, url })

  const result = await sendSms({ to, body })
  const now = new Date()

  if (!result.ok) {
    await logSms({
      customerId: cust.id,
      appointmentId: apt.id,
      toPhone: to,
      body,
      status: 'failed',
      method: 'manual',
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    })
    return {
      ok: false,
      status: 'failed',
      reason: result.errorMessage ?? 'Twilio send failed',
      to,
      body,
      url,
    }
  }

  await db
    .update(appointment)
    .set({
      smsSent: true,
      smsSentAt: now,
      smsSendMethod: 'manual',
      smsMessageSid: result.sid ?? null,
      smsLastAttemptAt: now,
      updatedAt: now,
    })
    .where(eq(appointment.id, apt.id))
  await logSms({
    customerId: cust.id,
    appointmentId: apt.id,
    toPhone: to,
    body,
    messageSid: result.sid,
    status: 'sent',
    method: 'manual',
  })

  return {
    ok: true,
    status: 'sent',
    reason: 'Test SMS sent',
    sid: result.sid,
    to,
    body,
    url,
  }
}

export interface AutoSendSummary {
  enabled: boolean
  due: number
  sent: number
  skipped: number
  failed: number
}

/**
 * Max automatic sends per cron run. The cron fires every 5 minutes, so a
 * backlog of N drains in ceil(N / this) runs. Sized to comfortably fit within
 * the reconcile route's maxDuration alongside the Square re-pull. In normal
 * operation only a few appointments are ever due per run, so this never delays
 * a routine 1-hour-after send.
 */
const AUTO_SEND_MAX_PER_RUN = 25

/**
 * AUTOMATIC send pass, invoked by the dedicated lightweight SMS cron
 * (`/api/cron/send-sms`) every 5 minutes — INDEPENDENT of the heavy Square
 * reconciliation, so a slow/timed-out Square sync can never block SMS sending.
 * It only reads the local DB (no Square API calls) and sends the feedback SMS
 * for appointments whose visit time has passed and that are still eligible —
 * but ONLY when the master auto-send switch is ON. Fully forward-only (these
 * appointments were only captured at/after the activation start point) and
 * duplicate-safe (already-sent, cancelled, and no-show appointments are
 * skipped).
 */
export async function autoSendDueFeedbackSms(): Promise<AutoSendSummary> {
  const summary: AutoSendSummary = {
    enabled: false,
    due: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  }

  const enabled = await getSmsAutoSendEnabled()
  if (!enabled) return summary
  summary.enabled = true

  const { startAt, status } = await getAutomationConfig()
  if (!startAt || status !== 'active') return summary

  const rows = await db
    .select({ apt: appointment, cust: customer })
    .from(appointment)
    .leftJoin(customer, eq(appointment.customerId, customer.id))
  const nowMs = Date.now()

  // Collect everything that is due this run (forward-only + duplicate-safe),
  // then process the OLDEST-eligible first so a backlog drains in visit order.
  const due: Array<{ apt: (typeof rows)[number]['apt']; cust: Customer }> = []
  for (const { apt, cust } of rows) {
    if (!cust) continue
    if (apt.smsSent) continue
    if (cust.smsPaused) continue
    // Never auto-message cancelled/declined or no-show appointments.
    if (isCancelledStatus(apt.squareStatus)) continue
    if (isNoShowStatus(apt.squareStatus)) continue

    // Visit must be at/after activation (forward-only) and eligibility only
    // opens 1 HOUR AFTER the appointment END time (start + duration + 1h),
    // computed from the canonical Square timestamps.
    const visitAt = apt.appointmentAt ? apt.appointmentAt.getTime() : null
    if (visitAt === null) continue
    if (visitAt < startAt.getTime()) continue
    const endMs = visitAt + (apt.durationMinutes ?? 0) * 60_000
    const eligibleAtMs = endMs + 60 * 60_000
    if (eligibleAtMs > nowMs) continue

    const eligibility = appointmentSmsEligibility(cust as Customer, apt)
    if (!eligibility.eligible) continue

    due.push({ apt, cust: cust as Customer })
  }

  due.sort(
    (a, b) =>
      (a.apt.appointmentAt?.getTime() ?? 0) -
      (b.apt.appointmentAt?.getTime() ?? 0),
  )
  summary.due = due.length

  // Cap per run so a single invocation stays well within the function's time
  // budget (sequential Twilio calls) and a large backlog is drained gradually
  // across successive 5-minute cron runs instead of blasting all at once. In
  // steady state only a handful are ever due per run, so this cap never delays
  // normal 1-hour-after sends. Anything not sent this run is picked up next run
  // (still duplicate-safe: each is only marked sent on a successful send).
  const batch = due.slice(0, AUTO_SEND_MAX_PER_RUN)
  for (const { apt } of batch) {
    const res = await sendAppointmentFeedbackSms(apt.id, { method: 'auto' })
    if (res.status === 'sent') summary.sent++
    else if (res.status === 'failed') summary.failed++
    else summary.skipped++
  }

  return summary
}
