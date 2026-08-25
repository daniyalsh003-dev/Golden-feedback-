'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appointment, customer, feedback } from '@/lib/db/schema'
import {
  createAppointment,
  customerSmsEligibility,
  feedbackPath,
  isCancelledStatus,
  isNoShowStatus,
  upsertCustomer,
} from '@/lib/feedback-system'
import {
  activateAutomationFromNow,
  getAutomationConfig,
  getAutomationStartAt,
  setAutomationStatus,
  setSmsAutoSendEnabled,
  type AutomationStatus,
} from '@/lib/settings'
import { getAutomationOverview } from '@/lib/square-sync'
import {
  markAppointmentSmsSentManually,
  markCustomerSmsSentManually,
  sendAppointmentFeedbackSms,
  sendCustomerFeedbackSms,
  sendTestSms,
  type SmsSendResult,
} from '@/lib/sms'
import {
  absoluteFeedbackUrl,
  buildFeedbackSmsBody,
  firstNameFrom,
} from '@/lib/sms-message'
import { isValidPhone } from '@/lib/phone'
import {
  torontoDayBoundsUtc,
  torontoTodayStr,
} from '@/lib/time'
import {
  getResetPreview,
  resetGoldenFeedbackData,
} from '@/lib/reset'
import {
  FOLLOW_UP_STATUSES,
  type AppointmentStatusValue,
  type AutomationOverview,
  type CustomerDetail,
  type CustomerMessageStatus,
  type CustomerSummary,
  type DailyAppointment,
  type DailyAppointmentsResult,
  type EnrichedFeedback,
  type FeedbackFilters,
  type FeedbackStats,
  type FollowUpStatus,
  type ResetPreview,
  type ResetResult,
} from '@/lib/follow-up'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

export async function getFeedback(
  filters: FeedbackFilters = {},
): Promise<EnrichedFeedback[]> {
  await requireAdmin()

  const conditions = []
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(feedback.followUpStatus, filters.status))
  }
  if (typeof filters.rating === 'number') {
    conditions.push(eq(feedback.rating, filters.rating))
  }
  if (filters.contactOnly) {
    conditions.push(eq(feedback.wantsContact, true))
  }

  const rows = await db
    .select({ feedback, customer, appointment })
    .from(feedback)
    .leftJoin(customer, eq(feedback.customerId, customer.id))
    .leftJoin(appointment, eq(feedback.appointmentId, appointment.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(feedback.createdAt))

  return rows.map(({ feedback: f, customer: c, appointment: a }) => {
    const eligibility = c
      ? customerSmsEligibility(c)
      : { eligible: false, reason: 'No linked customer' }
    return {
      id: f.id,
      rating: f.rating,
      issueCategories: f.issueCategories,
      barberName: f.barberName,
      comments: f.comments,
      wantsContact: f.wantsContact,
      contactInfo: f.contactInfo,
      followUpStatus: f.followUpStatus,
      followUpNotes: f.followUpNotes,
      resolvedAt: iso(f.resolvedAt),
      createdAt: f.createdAt.toISOString(),
      customer: c
        ? {
            id: c.id,
            name: c.customerName,
            phone: c.phoneNumber,
            hasGiven5StarFeedback: c.hasGiven5StarFeedback,
          }
        : null,
      appointment: a
        ? {
            id: a.id,
            appointmentAt: iso(a.appointmentAt),
            serviceName: a.serviceName,
            staffMember: a.staffMember,
            location: a.location,
          }
        : null,
      smsEligible: eligibility.eligible,
      smsReason: eligibility.reason,
    }
  })
}

export async function getFeedbackStats(): Promise<FeedbackStats> {
  await requireAdmin()
  const rows = await db.select().from(feedback)
  const total = rows.length
  const averageRating =
    total === 0 ? 0 : rows.reduce((sum, r) => sum + r.rating, 0) / total
  const needsAttention = rows.filter(
    (r) => r.followUpStatus !== 'resolved',
  ).length
  const contactRequests = rows.filter(
    (r) => r.wantsContact && r.followUpStatus !== 'resolved',
  ).length
  return { total, averageRating, needsAttention, contactRequests }
}

export async function updateFollowUp(input: {
  id: number
  status: FollowUpStatus
  notes?: string
}): Promise<void> {
  await requireAdmin()
  if (!FOLLOW_UP_STATUSES.includes(input.status)) {
    throw new Error('Invalid status')
  }
  await db
    .update(feedback)
    .set({
      followUpStatus: input.status,
      followUpNotes: input.notes?.trim() || null,
      resolvedAt: input.status === 'resolved' ? new Date() : null,
    })
    .where(eq(feedback.id, input.id))
  revalidatePath('/admin')
}

export async function getCustomers(): Promise<CustomerSummary[]> {
  await requireAdmin()

  const [customers, appointments, feedbacks, startAt] = await Promise.all([
    db.select().from(customer).orderBy(desc(customer.createdAt)),
    db.select().from(appointment),
    db.select().from(feedback),
    getAutomationStartAt(),
  ])
  const startMs = startAt ? startAt.getTime() : null

  return customers.map((c) => {
    const visits = appointments.filter((a) => a.customerId === c.id)
    const theirFeedback = feedbacks.filter((f) => f.customerId === c.id)
    const visitTimes = visits
      .map((v) => v.appointmentAt ?? v.createdAt)
      .filter(Boolean) as Date[]
    const lastVisit =
      visitTimes.length > 0
        ? new Date(Math.max(...visitTimes.map((d) => d.getTime())))
        : null
    const sinceActivation =
      startMs === null
        ? visits.length
        : visits.filter((v) => {
            const t = (v.appointmentAt ?? v.createdAt).getTime()
            return t >= startMs
          }).length
    const latest = theirFeedback
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    const eligibility = customerSmsEligibility(c)
    return {
      id: c.id,
      name: c.customerName,
      phone: c.phoneNumber,
      email: c.email,
      squareCustomerId: c.squareCustomerId,
      hasGiven5StarFeedback: c.hasGiven5StarFeedback,
      smsEligible: eligibility.eligible,
      smsReason: eligibility.reason,
      visitCount: visits.length,
      appointmentsSinceActivation: sinceActivation,
      feedbackCount: theirFeedback.length,
      latestRating: latest ? latest.rating : null,
      lastVisitAt: lastVisit ? lastVisit.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }
  })
}

export async function getCustomerDetail(
  customerId: string,
): Promise<CustomerDetail | null> {
  await requireAdmin()

  const [c] = await db
    .select()
    .from(customer)
    .where(eq(customer.id, customerId))
    .limit(1)
  if (!c) return null

  const [rows, visits, startAt] = await Promise.all([
    db
      .select({ feedback, appointment })
      .from(feedback)
      .leftJoin(appointment, eq(feedback.appointmentId, appointment.id))
      .where(eq(feedback.customerId, customerId))
      .orderBy(desc(feedback.createdAt)),
    db.select().from(appointment).where(eq(appointment.customerId, customerId)),
    getAutomationStartAt(),
  ])
  const startMs = startAt ? startAt.getTime() : null

  // Only appointments/feedback captured at or after activation are surfaced —
  // historical Square visits are never imported or shown.
  const sinceActivation =
    startMs === null
      ? visits.length
      : visits.filter(
          (v) => (v.appointmentAt ?? v.createdAt).getTime() >= startMs,
        ).length

  const historyRows = rows.filter(({ feedback: f, appointment: a }) => {
    if (startMs === null) return true
    const t = (a?.appointmentAt ?? f.createdAt).getTime()
    return t >= startMs
  })

  const visitTimes = visits
    .map((v) => v.appointmentAt ?? v.createdAt)
    .filter(Boolean) as Date[]
  const lastVisit =
    visitTimes.length > 0
      ? new Date(Math.max(...visitTimes.map((d) => d.getTime())))
      : null
  const eligibility = customerSmsEligibility(c)

  // The customer's most recent appointment drives the messaging status and the
  // Copy Feedback Link / Copy SMS content.
  const latestAppointment =
    visits.length > 0
      ? visits.reduce((best, a) =>
          (a.appointmentAt ?? a.createdAt).getTime() >=
          (best.appointmentAt ?? best.createdAt).getTime()
            ? a
            : best,
        )
      : null
  const feedbackUrl = latestAppointment
    ? absoluteFeedbackUrl(latestAppointment.feedbackToken)
    : null
  const smsMessage =
    latestAppointment && feedbackUrl
      ? buildFeedbackSmsBody({
          firstName: c.customerName,
          barberFirstName: latestAppointment.staffMember,
          url: feedbackUrl,
        })
      : null

  return {
    id: c.id,
    name: c.customerName,
    phone: c.phoneNumber,
    email: c.email,
    squareCustomerId: c.squareCustomerId,
    hasGiven5StarFeedback: c.hasGiven5StarFeedback,
    smsEligible: eligibility.eligible,
    smsReason: eligibility.reason,
    visitCount: visits.length,
    appointmentsSinceActivation: sinceActivation,
    feedbackCount: historyRows.length,
    latestRating: rows[0] ? rows[0].feedback.rating : null,
    lastVisitAt: lastVisit ? lastVisit.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    smsPaused: c.smsPaused,
    messageStatus: deriveMessageStatus(c, latestAppointment),
    smsSent: latestAppointment?.smsSent ?? false,
    smsSentAt: latestAppointment?.smsSentAt
      ? latestAppointment.smsSentAt.toISOString()
      : null,
    smsSendMethod: latestAppointment?.smsSendMethod ?? null,
    smsMessageSid: latestAppointment?.smsMessageSid ?? null,
    smsError: latestAppointment?.smsError ?? null,
    feedbackUrl,
    smsMessage,
    latestAppointmentId: latestAppointment?.id ?? null,
    history: historyRows.map(({ feedback: f, appointment: a }) => ({
      id: f.id,
      rating: f.rating,
      comments: f.comments,
      followUpStatus: f.followUpStatus,
      createdAt: f.createdAt.toISOString(),
      serviceName: a?.serviceName ?? null,
      staffMember: a?.staffMember ?? null,
      appointmentAt: a?.appointmentAt ? a.appointmentAt.toISOString() : null,
    })),
  }
}

/**
 * Test tool: upsert a customer and create an appointment, returning a
 * ready-to-share feedback link. This simulates what the future Square
 * Appointments webhook will do automatically for each completed visit.
 */
export async function createTestAppointment(input: {
  name: string
  phone?: string
  serviceName?: string
  staffMember?: string
}): Promise<{ url: string; customerId: string; token: string }> {
  await requireAdmin()

  const name = input.name.trim()
  if (!name) throw new Error('Customer name is required')

  const cust = await upsertCustomer({
    name,
    phone: input.phone?.trim() || null,
  })
  const apt = await createAppointment({
    customerId: cust.id,
    appointmentAt: new Date(),
    serviceName: input.serviceName?.trim() || null,
    staffMember: input.staffMember?.trim() || null,
  })

  revalidatePath('/admin')
  return {
    url: feedbackPath(apt.feedbackToken),
    customerId: cust.id,
    token: apt.feedbackToken,
  }
}

// ---- Square automation (read-only prep; no SMS is sent) ----

/** Current automation state + capture counts for the admin panel. */
export async function getAutomationOverviewAction(): Promise<AutomationOverview> {
  await requireAdmin()
  return getAutomationOverview()
}

/**
 * "Start From Now": set the activation timestamp to the current server time on
 * first activation only. Never resets an existing start point (safe to press
 * again). Persists in the database and survives redeploys. From this moment,
 * Square webhooks and the reconciliation cron capture new bookings only.
 */
export async function startAutomationFromNow(): Promise<{
  overview: AutomationOverview
  alreadyActivated: boolean
}> {
  await requireAdmin()
  const { alreadyActivated } = await activateAutomationFromNow()
  const overview = await getAutomationOverview()
  revalidatePath('/admin')
  return { overview, alreadyActivated }
}

/** Pause or resume automation without touching the activation timestamp. */
export async function setAutomationStatusAction(
  status: AutomationStatus,
): Promise<AutomationOverview> {
  await requireAdmin()
  // Cannot activate before a start point exists.
  if (status === 'active') {
    const { startAt } = await getAutomationConfig()
    if (!startAt) {
      throw new Error('Press "Start From Now" before activating automation.')
    }
  }
  await setAutomationStatus(status)
  revalidatePath('/admin')
  return getAutomationOverview()
}

// ---- Reset Feedback Data (feedback/test state only; nothing is deleted) ----

/** Preview how much feedback/testing state a reset would clear. */
export async function getResetPreviewAction(): Promise<ResetPreview> {
  await requireAdmin()
  return getResetPreview()
}

/**
 * Reset ONLY feedback/testing state so the feedback flow can be tested again:
 * deletes feedback submissions + SMS log, clears each appointment's
 * feedback/SMS test flags, and clears customers' 5-star suppression. It NEVER
 * deletes customers or appointments and NEVER touches Square, Twilio,
 * automation config, or the activation start point. Requires an explicit typed
 * confirmation phrase from the admin UI.
 */
export async function resetGoldenFeedbackDataAction(
  confirmation: string,
): Promise<ResetResult> {
  await requireAdmin()
  if (confirmation.trim().toUpperCase() !== 'RESET') {
    throw new Error('Type RESET to confirm.')
  }
  const result = await resetGoldenFeedbackData()
  revalidatePath('/admin')
  return result
}

// ---- Twilio SMS controls (all admin-gated) ----

/** Derive a clear, single messaging status from existing customer/appt data. */
function deriveMessageStatus(
  c: { hasGiven5StarFeedback: boolean; phoneNumber: string | null; smsPaused: boolean },
  latest: {
    feedbackSubmitted: boolean
    smsSent: boolean
    smsError: string | null
  } | null,
): CustomerMessageStatus {
  if (c.hasGiven5StarFeedback) return 'five_star'
  if (latest?.feedbackSubmitted) return 'feedback_received'
  if (latest?.smsSent) return 'sent'
  if (latest && latest.smsError) return 'failed'
  if (!isValidPhone(c.phoneNumber)) return 'no_phone'
  if (c.smsPaused) return 'paused'
  if (!latest) return 'no_appointment'
  return 'ready'
}

/** Toggle a single customer's SMS Active/Paused (a.k.a. deactivation) flag. */
export async function setCustomerSmsPausedAction(
  customerId: string,
  paused: boolean,
): Promise<void> {
  await requireAdmin()
  await db
    .update(customer)
    .set({ smsPaused: paused, updatedAt: new Date() })
    .where(eq(customer.id, customerId))
  revalidatePath('/admin')
}

/** "Send SMS Now" (allowResend=false) / "Resend SMS" (allowResend=true). */
export async function sendCustomerSmsAction(
  customerId: string,
  opts: { resend?: boolean } = {},
): Promise<SmsSendResult> {
  await requireAdmin()
  const result = await sendCustomerFeedbackSms(customerId, {
    allowResend: opts.resend,
  })
  revalidatePath('/admin')
  return result
}

/** "Mark as Sent" — record an out-of-band manual send (no Twilio). */
export async function markCustomerSmsSentAction(
  customerId: string,
): Promise<SmsSendResult> {
  await requireAdmin()
  const result = await markCustomerSmsSentManually(customerId)
  revalidatePath('/admin')
  return result
}

/** Enable/disable the master AUTOMATIC SMS switch (defaults off). */
export async function setSmsAutoSendAction(
  enabled: boolean,
): Promise<AutomationOverview> {
  await requireAdmin()
  await setSmsAutoSendEnabled(enabled)
  revalidatePath('/admin')
  return getAutomationOverview()
}

/** Admin-only test send to a chosen phone using the real Twilio path. */
export async function sendTestSmsAction(input: {
  toPhone: string
  firstName?: string
}): Promise<SmsSendResult> {
  await requireAdmin()
  const result = await sendTestSms(input)
  revalidatePath('/admin')
  return result
}

// ---- Daily Appointments (date-based schedule; local DB only) ----

/**
 * Appointments for a single America/Toronto calendar day, ordered by start
 * time (earliest → latest). Uses only locally synced data — no Square calls.
 * Defaults to today (Toronto). Cancelled / no-show visits remain visible for
 * history but are classified so they stay excluded from automatic SMS.
 */
export async function getDailyAppointments(
  dateStr?: string,
): Promise<DailyAppointmentsResult> {
  await requireAdmin()
  const day = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : torontoTodayStr()
  const { start, end } = torontoDayBoundsUtc(day)
  const startMs = start.getTime()
  const endMs = end.getTime()

  const [rows, feedbacks] = await Promise.all([
    db
      .select({ apt: appointment, cust: customer })
      .from(appointment)
      .leftJoin(customer, eq(appointment.customerId, customer.id)),
    db.select().from(feedback),
  ])

  // Latest rating per appointment (for the feedback status column).
  const ratingByAppointment = new Map<string, number>()
  for (const f of feedbacks) {
    if (f.appointmentId && !ratingByAppointment.has(f.appointmentId)) {
      ratingByAppointment.set(f.appointmentId, f.rating)
    }
  }

  const inDay = rows.filter(({ apt }) => {
    if (!apt.appointmentAt) return false
    const t = apt.appointmentAt.getTime()
    return t >= startMs && t < endMs
  })
  inDay.sort(
    (a, b) =>
      (a.apt.appointmentAt?.getTime() ?? 0) -
      (b.apt.appointmentAt?.getTime() ?? 0),
  )

  const nowMs = Date.now()
  const appointments: DailyAppointment[] = inDay.map(({ apt, cust }) => {
    const startAt = apt.appointmentAt
    const endAt = startAt
      ? new Date(startAt.getTime() + (apt.durationMinutes ?? 0) * 60_000)
      : null
    const smsEligibleAt = endAt
      ? new Date(endAt.getTime() + 60 * 60_000)
      : null

    let status: AppointmentStatusValue = 'upcoming'
    if (isCancelledStatus(apt.squareStatus)) status = 'cancelled'
    else if (isNoShowStatus(apt.squareStatus)) status = 'no_show'
    else if (endAt && endAt.getTime() <= nowMs) status = 'completed'

    const feedbackUrl = absoluteFeedbackUrl(apt.feedbackToken)
    return {
      id: apt.id,
      customerId: apt.customerId,
      customerName: cust?.customerName ?? 'Square Customer',
      customerPhone: cust?.phoneNumber ?? null,
      barberFirstName: firstNameFrom(apt.staffMember),
      serviceName: apt.serviceName,
      startAt: iso(startAt),
      endAt: iso(endAt),
      status,
      smsEligibleAt: iso(smsEligibleAt),
      smsSent: apt.smsSent,
      smsSendMethod: apt.smsSendMethod,
      feedbackSubmitted: apt.feedbackSubmitted,
      rating: ratingByAppointment.get(apt.id) ?? null,
      smsPaused: cust?.smsPaused ?? false,
      hasGiven5StarFeedback: cust?.hasGiven5StarFeedback ?? false,
      feedbackUrl,
      smsMessage: buildFeedbackSmsBody({
        firstName: cust?.customerName,
        barberFirstName: apt.staffMember,
        url: feedbackUrl,
      }),
    }
  })

  return { dateStr: day, appointments }
}

/** Daily-page "Send SMS Now" / "Resend SMS" for a specific appointment. */
export async function sendAppointmentSmsAction(
  appointmentId: string,
  opts: { resend?: boolean } = {},
): Promise<SmsSendResult> {
  await requireAdmin()
  const result = await sendAppointmentFeedbackSms(appointmentId, {
    method: 'manual',
    allowResend: opts.resend,
  })
  revalidatePath('/admin')
  return result
}

/** Daily-page "Mark as Sent" for a specific appointment (out-of-band). */
export async function markAppointmentSmsSentAction(
  appointmentId: string,
): Promise<SmsSendResult> {
  await requireAdmin()
  const result = await markAppointmentSmsSentManually(appointmentId)
  revalidatePath('/admin')
  return result
}
