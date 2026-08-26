import 'server-only'

import { db } from '@/lib/db'
import { webhookEvent } from '@/lib/db/schema'
import { upsertAppointmentFromSquare, upsertCustomer } from '@/lib/feedback-system'
import {
  getAutomationConfig,
  recordReconcileHeartbeat,
} from '@/lib/settings'
import { getEnrichedBooking, type SquareBookingSummary } from '@/lib/square'
import { eq } from 'drizzle-orm'

/**
 * Forward-only Square ingestion.
 *
 * A customer enters Golden Feedback ONLY through a NEW booking whose start time
 * is at or after `automation_start_at`. Nothing before activation is ever
 * imported, no historical Square customers are synced, and Square access stays
 * strictly read-only. No SMS is ever sent here — appointments are only captured
 * and classified.
 */

export type IngestOutcome =
  | 'created'
  | 'updated'
  | 'ignored_before_start'
  | 'skipped_no_customer'
  | 'not_started'
  | 'paused'

/**
 * Capture a single enriched Square booking, forward-only. Upserts the customer
 * (dedup by square_customer_id, then normalized phone) and upserts the
 * appointment (dedup by square_appointment_id so it can never be imported
 * twice). Missing phone numbers are allowed — the appointment is still stored
 * and simply classified as "No phone".
 */
export async function ingestBooking(
  summary: SquareBookingSummary,
): Promise<IngestOutcome> {
  const { startAt, status } = await getAutomationConfig()
  if (!startAt) return 'not_started'
  if (status !== 'active') return 'paused'

  if (!summary.appointmentAt) return 'ignored_before_start'
  const startMs = new Date(summary.appointmentAt).getTime()
  if (Number.isNaN(startMs) || startMs < startAt.getTime()) {
    return 'ignored_before_start'
  }

  // We need a Square customer id or a phone to anchor a profile.
  if (!summary.customerId && !summary.customerPhone) {
    return 'skipped_no_customer'
  }

  const cust = await upsertCustomer({
    name: summary.customerName || 'Square Customer',
    phone: summary.customerPhone,
    email: summary.customerEmail,
    squareCustomerId: summary.customerId,
  })

  const { created } = await upsertAppointmentFromSquare({
    customerId: cust.id,
    appointmentAt: new Date(summary.appointmentAt),
    durationMinutes: summary.durationMinutes,
    serviceName: summary.service,
    staffMember: summary.teamMember,
    location: summary.location,
    squareStatus: summary.status,
    squareAppointmentId: summary.bookingId,
    squareCustomerId: summary.customerId,
    squareTeamMemberId: summary.teamMemberId,
  })

  return created ? 'created' : 'updated'
}

export interface WebhookResult {
  outcome:
    | IngestOutcome
    | 'duplicate'
    | 'no_booking_id'
    | 'booking_not_found'
    | 'ignored_event_type'
}

const HANDLED_EVENT_TYPES = new Set(['booking.created', 'booking.updated'])

/**
 * Process one verified Square webhook event, idempotently. The event id is
 * recorded so duplicate deliveries are ignored. Only booking.created and
 * booking.updated are handled; the referenced booking is retrieved read-only
 * and passed through the forward-only ingest.
 */
export async function processBookingWebhook(input: {
  eventId: string
  eventType: string
  bookingId: string | null
}): Promise<WebhookResult> {
  if (!HANDLED_EVENT_TYPES.has(input.eventType)) {
    return { outcome: 'ignored_event_type' }
  }
  if (!input.bookingId) return { outcome: 'no_booking_id' }

  // Idempotency: recording the event id first means a duplicate delivery
  // (same event id) short-circuits before any Square call or DB write.
  const inserted = await db
    .insert(webhookEvent)
    .values({
      eventId: input.eventId,
      eventType: input.eventType,
      squareBookingId: input.bookingId,
    })
    .onConflictDoNothing({ target: webhookEvent.eventId })
    .returning({ eventId: webhookEvent.eventId })

  if (inserted.length === 0) return { outcome: 'duplicate' }

  const booking = await getEnrichedBooking(input.bookingId)
  if (!booking) return { outcome: 'booking_not_found' }

  const outcome = await ingestBooking(booking)
  return { outcome }
}

export interface ReconcileResult {
  ok: boolean
  ranAt: string
  message: string
  fetched: number
  created: number
  updated: number
  ignored: number
}

/**
 * Forward-only reconciliation fallback (for a scheduled cron). Pulls bookings
 * whose start time is at/after activation within a bounded recent window and
 * re-ingests them idempotently. It NEVER imports anything before
 * `automation_start_at`. Safe to run repeatedly.
 */
export async function runReconciliation(): Promise<ReconcileResult> {
  const ranAt = new Date().toISOString()
  const { startAt, status } = await getAutomationConfig()

  if (!startAt) {
    await recordReconcileHeartbeat({
      at: ranAt,
      ok: true,
      error: 'not_started',
    })
    return {
      ok: false,
      ranAt,
      message: 'Automation has not been started.',
      fetched: 0,
      created: 0,
      updated: 0,
      ignored: 0,
    }
  }
  if (status !== 'active') {
    await recordReconcileHeartbeat({ at: ranAt, ok: true, error: 'paused' })
    return {
      ok: false,
      ranAt,
      message: 'Automation is paused.',
      fetched: 0,
      created: 0,
      updated: 0,
      ignored: 0,
    }
  }

  // Lazy import to avoid a cycle at module load.
  const { getEnrichedBookingsSince } = await import('@/lib/square')
  const bookings = await getEnrichedBookingsSince(startAt)

  let created = 0
  let updated = 0
  let ignored = 0
  for (const b of bookings) {
    const outcome = await ingestBooking(b)
    if (outcome === 'created') created++
    else if (outcome === 'updated') updated++
    else ignored++
  }

  // NOTE: The automatic feedback-SMS pass is intentionally NOT run here. It is
  // handled by a separate lightweight cron (`/api/cron/send-sms`) that calls
  // `autoSendDueFeedbackSms()` directly against the local DB. Keeping the two
  // apart guarantees that a slow or timed-out Square re-pull can never block
  // eligible SMS from going out.
  await recordReconcileHeartbeat({
    at: ranAt,
    ok: true,
    ingested: bookings.length,
  })

  return {
    ok: true,
    ranAt,
    message: `Reconciled ${bookings.length} booking(s): ${created} new, ${updated} updated.`,
    fetched: bookings.length,
    created,
    updated,
    ignored,
  }
}
