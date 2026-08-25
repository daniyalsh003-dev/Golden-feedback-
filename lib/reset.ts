import 'server-only'

import { db } from '@/lib/db'
import { appointment, customer, feedback, smsLog } from '@/lib/db/schema'
import type { ResetPreview, ResetResult } from '@/lib/follow-up'
import { eq, or, sql } from 'drizzle-orm'

/**
 * "Reset Feedback Data" — clears ONLY feedback/testing state so the customer
 * feedback flow can be exercised again. It NEVER deletes customers or
 * appointments, and NEVER touches Square, Twilio, environment variables,
 * webhook/idempotency ledger, the database schema, automation configuration,
 * or the activation start point.
 *
 * Specifically it:
 *   - deletes feedback submissions (star ratings + 1–4 star details)
 *   - clears the SMS log (test/send history)
 *   - resets each appointment's feedback/SMS test flags (feedbackSubmitted,
 *     smsSent + related bookkeeping) WITHOUT deleting the appointment
 *   - clears each customer's 5-star suppression flag WITHOUT deleting the
 *     customer or their Square identity, name, phone, or SMS Active/Paused
 *     preference
 */

/**
 * Reset ONLY one specific customer's submitted feedback state so that
 * customer's existing feedback link(s) become usable again for a new rating.
 *
 * Scoped strictly to the given customer — it NEVER touches any other customer,
 * the automation config, the activation start point, the cron, or Square. It
 * does NOT delete the customer or their appointments; only feedback/SMS test
 * state tied to this one customer is cleared:
 *   - deletes this customer's feedback submissions
 *   - deletes this customer's SMS log rows (their test/send history)
 *   - clears this customer's appointments' feedback/SMS test flags so the same
 *     feedback token can be submitted again (feedbackSubmitted → false, and
 *     SMS bookkeeping reset), WITHOUT deleting the appointment or any Square id
 *   - clears this customer's 5-star suppression flag
 *
 * Returns false when the customer does not exist.
 */
export async function resetCustomerFeedback(
  customerId: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(eq(customer.id, customerId))
    .limit(1)
  if (!existing) return false

  const now = new Date()

  await db.transaction(async (tx) => {
    // Delete only THIS customer's feedback + SMS history.
    await tx.delete(feedback).where(eq(feedback.customerId, customerId))
    await tx.delete(smsLog).where(eq(smsLog.customerId, customerId))

    // Clear only THIS customer's appointments' feedback/SMS test flags. The
    // appointment rows (Square ids, times, barber, service, feedback token)
    // are preserved so the existing link keeps working.
    await tx
      .update(appointment)
      .set({
        feedbackSubmitted: false,
        smsSent: false,
        smsSentAt: null,
        smsSendMethod: null,
        smsMessageSid: null,
        smsError: null,
        smsLastAttemptAt: null,
        smsEligibility: null,
        updatedAt: now,
      })
      .where(eq(appointment.customerId, customerId))

    // Clear only THIS customer's 5-star suppression. Name, phone, Square id,
    // and SMS Active/Paused preference are all preserved.
    await tx
      .update(customer)
      .set({ hasGiven5StarFeedback: false, updatedAt: now })
      .where(eq(customer.id, customerId))
  })

  return true
}

/** Counts of what a feedback reset will clear (nothing is ever deleted here). */
export async function getResetPreview(): Promise<ResetPreview> {
  const [feedbacks, appts, fiveStar, logs] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(feedback),
    db
      .select({ n: sql<number>`count(*)` })
      .from(appointment)
      .where(
        or(eq(appointment.feedbackSubmitted, true), eq(appointment.smsSent, true)),
      ),
    db
      .select({ n: sql<number>`count(*)` })
      .from(customer)
      .where(eq(customer.hasGiven5StarFeedback, true)),
    db.select({ n: sql<number>`count(*)` }).from(smsLog),
  ])
  return {
    feedback: Number(feedbacks[0]?.n ?? 0),
    appointmentsToReset: Number(appts[0]?.n ?? 0),
    fiveStarCustomers: Number(fiveStar[0]?.n ?? 0),
    smsLogs: Number(logs[0]?.n ?? 0),
  }
}

/**
 * Reset only feedback/testing state inside a single transaction so a failure
 * cannot leave partial state. Customers and appointments are preserved (only
 * their feedback/SMS test flags are cleared); automation config and the
 * activation start point are left completely untouched.
 */
export async function resetGoldenFeedbackData(): Promise<ResetResult> {
  const cleared = await getResetPreview()
  const now = new Date()

  await db.transaction(async (tx) => {
    // Delete feedback submissions and SMS test/history — these are the actual
    // feedback records, never customer or appointment identity.
    await tx.delete(feedback)
    await tx.delete(smsLog)

    // Clear per-appointment feedback/SMS test flags so the same visit can be
    // tested again. The appointment row itself (Square ids, times, barber,
    // service, history) is preserved.
    await tx.update(appointment).set({
      feedbackSubmitted: false,
      smsSent: false,
      smsSentAt: null,
      smsSendMethod: null,
      smsMessageSid: null,
      smsError: null,
      smsLastAttemptAt: null,
      smsEligibility: null,
      updatedAt: now,
    })

    // Clear only the 5-star suppression flag. Everything else about the
    // customer — name, phone, Square id, SMS Active/Paused — is preserved.
    await tx.update(customer).set({
      hasGiven5StarFeedback: false,
      updatedAt: now,
    })
  })

  return { cleared }
}
