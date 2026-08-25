import { db } from '@/lib/db'
import {
  appointment,
  customer,
  feedback,
  type Appointment,
  type Customer,
} from '@/lib/db/schema'
import {
  generateAppointmentId,
  generateCustomerId,
  generateFeedbackToken,
} from '@/lib/ids'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import type { AppointmentEligibilityStatus } from '@/lib/follow-up'
import { desc, eq } from 'drizzle-orm'

/**
 * Find or create a customer, deduplicating by normalized phone number so that
 * returning customers reuse one profile. When an existing customer is found,
 * newly provided details (name/email/square id) fill in or refresh fields.
 */
export async function upsertCustomer(input: {
  name: string
  phone?: string | null
  email?: string | null
  squareCustomerId?: string | null
}): Promise<Customer> {
  const normalized = normalizePhone(input.phone ?? null)
  const squareId = input.squareCustomerId?.trim() || null

  // Match an existing profile by Square customer id first (so an existing
  // Square customer is never treated as new, even without a phone), then fall
  // back to the normalized phone number.
  let existing: Customer | undefined
  if (squareId) {
    ;[existing] = await db
      .select()
      .from(customer)
      .where(eq(customer.squareCustomerId, squareId))
      .limit(1)
  }
  if (!existing && normalized) {
    ;[existing] = await db
      .select()
      .from(customer)
      .where(eq(customer.normalizedPhoneNumber, normalized))
      .limit(1)
  }

  if (existing) {
    const [updated] = await db
      .update(customer)
      .set({
        customerName: input.name.trim() || existing.customerName,
        phoneNumber: input.phone?.trim() || existing.phoneNumber,
        normalizedPhoneNumber: normalized || existing.normalizedPhoneNumber,
        email: input.email?.trim() || existing.email,
        squareCustomerId: squareId || existing.squareCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(customer.id, existing.id))
      .returning()
    return updated
  }

  const [created] = await db
    .insert(customer)
    .values({
      id: generateCustomerId(),
      customerName: input.name.trim(),
      phoneNumber: input.phone?.trim() || null,
      normalizedPhoneNumber: normalized,
      email: input.email?.trim() || null,
      squareCustomerId: input.squareCustomerId?.trim() || null,
    })
    .returning()
  return created
}

export interface AppointmentInput {
  customerId: string
  appointmentAt?: Date | null
  durationMinutes?: number | null
  serviceName?: string | null
  staffMember?: string | null
  location?: string | null
  squareStatus?: string | null
  squareAppointmentId?: string | null
  squareCustomerId?: string | null
  squareTeamMemberId?: string | null
}

/**
 * Create an appointment for a customer with a unique feedback token and a
 * derived SMS-eligibility status. The customer is loaded to classify
 * eligibility at capture time.
 */
export async function createAppointment(
  input: AppointmentInput,
): Promise<Appointment> {
  const [cust] = await db
    .select()
    .from(customer)
    .where(eq(customer.id, input.customerId))
    .limit(1)

  const eligibility = cust
    ? computeAppointmentEligibility(cust, {
        squareStatus: input.squareStatus ?? null,
        feedbackSubmitted: false,
      })
    : 'no_phone'

  const [created] = await db
    .insert(appointment)
    .values({
      id: generateAppointmentId(),
      customerId: input.customerId,
      appointmentAt: input.appointmentAt ?? null,
      durationMinutes: input.durationMinutes ?? null,
      serviceName: input.serviceName?.trim() || null,
      staffMember: input.staffMember?.trim() || null,
      location: input.location?.trim() || null,
      squareStatus: input.squareStatus ?? null,
      squareAppointmentId: input.squareAppointmentId ?? null,
      squareCustomerId: input.squareCustomerId ?? null,
      squareTeamMemberId: input.squareTeamMemberId ?? null,
      smsEligibility: eligibility,
      feedbackToken: generateFeedbackToken(),
      updatedAt: new Date(),
    })
    .returning()
  return created
}

/**
 * Webhook-safe upsert of a Square booking. Matched by `square_appointment_id`
 * so `booking.updated` events refresh the existing row rather than creating a
 * duplicate. Returns the row and whether it was newly created.
 */
export async function upsertAppointmentFromSquare(
  input: AppointmentInput & { squareAppointmentId: string },
): Promise<{ appointment: Appointment; created: boolean }> {
  const [existing] = await db
    .select()
    .from(appointment)
    .where(eq(appointment.squareAppointmentId, input.squareAppointmentId))
    .limit(1)

  if (!existing) {
    const created = await createAppointment(input)
    return { appointment: created, created: true }
  }

  const [cust] = await db
    .select()
    .from(customer)
    .where(eq(customer.id, existing.customerId))
    .limit(1)

  const eligibility = cust
    ? computeAppointmentEligibility(cust, {
        squareStatus: input.squareStatus ?? existing.squareStatus,
        feedbackSubmitted: existing.feedbackSubmitted,
      })
    : (existing.smsEligibility as AppointmentEligibilityStatus | null)

  const [updated] = await db
    .update(appointment)
    .set({
      appointmentAt: input.appointmentAt ?? existing.appointmentAt,
      durationMinutes: input.durationMinutes ?? existing.durationMinutes,
      serviceName: input.serviceName?.trim() || existing.serviceName,
      staffMember: input.staffMember?.trim() || existing.staffMember,
      location: input.location?.trim() || existing.location,
      squareStatus: input.squareStatus ?? existing.squareStatus,
      squareTeamMemberId:
        input.squareTeamMemberId ?? existing.squareTeamMemberId,
      smsEligibility: eligibility,
      updatedAt: new Date(),
    })
    .where(eq(appointment.id, existing.id))
    .returning()

  return { appointment: updated, created: false }
}

export interface AppointmentWithCustomer {
  appointment: Appointment
  customer: Customer | null
}

/** Load an appointment (and its customer) by public feedback token. */
export async function getAppointmentByToken(
  token: string,
): Promise<AppointmentWithCustomer | null> {
  const [apt] = await db
    .select()
    .from(appointment)
    .where(eq(appointment.feedbackToken, token))
    .limit(1)
  if (!apt) return null

  const [cust] = await db
    .select()
    .from(customer)
    .where(eq(customer.id, apt.customerId))
    .limit(1)

  return { appointment: apt, customer: cust ?? null }
}

export type TokenSubmitResult =
  | { status: 'ok' }
  | { status: 'already_submitted' }
  | { status: 'not_found' }

/**
 * Record a token-linked feedback submission exactly once. Enforces the
 * one-submission-per-appointment rule and updates the customer's 5-star flag.
 */
export async function submitTokenFeedback(
  token: string,
  data: {
    rating: number
    issueCategories: string[]
    comments: string | null
    wantsContact: boolean
    contactInfo: string | null
  },
): Promise<TokenSubmitResult> {
  const existing = await getAppointmentByToken(token)
  if (!existing) return { status: 'not_found' }
  if (existing.appointment.feedbackSubmitted) {
    return { status: 'already_submitted' }
  }

  const apt = existing.appointment

  await db.transaction(async (tx) => {
    // Guard against a double submit racing in: re-check inside the tx.
    const [locked] = await tx
      .select()
      .from(appointment)
      .where(eq(appointment.id, apt.id))
      .limit(1)
    if (!locked || locked.feedbackSubmitted) {
      throw new AlreadySubmittedError()
    }

    await tx.insert(feedback).values({
      customerId: apt.customerId,
      appointmentId: apt.id,
      rating: data.rating,
      issueCategories: data.issueCategories,
      barberName: apt.staffMember ?? null,
      comments: data.comments,
      wantsContact: data.wantsContact,
      contactInfo: data.contactInfo,
    })

    await tx
      .update(appointment)
      .set({
        feedbackSubmitted: true,
        smsEligibility: 'already_submitted',
        updatedAt: new Date(),
      })
      .where(eq(appointment.id, apt.id))

    if (data.rating === 5) {
      await tx
        .update(customer)
        .set({ hasGiven5StarFeedback: true, updatedAt: new Date() })
        .where(eq(customer.id, apt.customerId))

      // From now on, this customer's other non-terminal appointments are
      // disabled due to previous 5-star feedback.
      const others = await tx
        .select()
        .from(appointment)
        .where(eq(appointment.customerId, apt.customerId))
      for (const other of others) {
        if (other.id === apt.id) continue
        if (
          isNoShowStatus(other.squareStatus) ||
          isCancelledStatus(other.squareStatus) ||
          other.feedbackSubmitted
        ) {
          continue
        }
        await tx
          .update(appointment)
          .set({ smsEligibility: 'previous_5_star', updatedAt: new Date() })
          .where(eq(appointment.id, other.id))
      }
    }
  }).catch((err) => {
    if (err instanceof AlreadySubmittedError) return
    throw err
  })

  return { status: 'ok' }
}

class AlreadySubmittedError extends Error {}

/** All feedback for a customer, newest first — their full history. */
export async function getCustomerHistory(customerId: string) {
  return db
    .select()
    .from(feedback)
    .where(eq(feedback.customerId, customerId))
    .orderBy(desc(feedback.createdAt))
}

// ---- SMS eligibility ----

export interface SmsEligibility {
  eligible: boolean
  reason: string
}

/**
 * CUSTOMER-level eligibility for *future* feedback-request SMS. Once a customer
 * has given 5 stars we never message them again; they also need a valid phone.
 */
export function customerSmsEligibility(c: Customer): SmsEligibility {
  if (!isValidPhone(c.phoneNumber)) {
    return { eligible: false, reason: 'No valid phone number on file' }
  }
  if (c.hasGiven5StarFeedback) {
    return { eligible: false, reason: 'Customer already gave 5-star feedback' }
  }
  return { eligible: true, reason: 'Eligible for future feedback SMS' }
}

/**
 * Whether a feedback-request SMS should be sent for a specific appointment.
 * Layers the per-appointment checks on top of customer eligibility.
 */
export function appointmentSmsEligibility(
  c: Customer,
  a: Appointment,
): SmsEligibility {
  if (a.smsSent) {
    return { eligible: false, reason: 'SMS already sent for this appointment' }
  }
  if (a.feedbackSubmitted) {
    return {
      eligible: false,
      reason: 'Feedback already submitted for this appointment',
    }
  }
  return customerSmsEligibility(c)
}

/** True when a Square booking status represents a cancellation/decline. */
export function isCancelledStatus(status?: string | null): boolean {
  if (!status) return false
  const s = status.toUpperCase()
  return s.includes('CANCELLED') || s === 'DECLINED'
}

/** True when a Square booking status represents a no-show. */
export function isNoShowStatus(status?: string | null): boolean {
  return (status ?? '').toUpperCase() === 'NO_SHOW'
}

/**
 * CUSTOMER + APPOINTMENT eligibility classification for a future
 * feedback-request SMS. Terminal per-appointment states (no-show, cancelled,
 * already submitted) win over customer-level states. No SMS is ever sent — this
 * only produces a status label.
 */
export function computeAppointmentEligibility(
  c: Pick<Customer, 'phoneNumber' | 'hasGiven5StarFeedback'>,
  a: { squareStatus?: string | null; feedbackSubmitted: boolean },
): AppointmentEligibilityStatus {
  if (isNoShowStatus(a.squareStatus)) return 'no_show'
  if (isCancelledStatus(a.squareStatus)) return 'cancelled'
  if (a.feedbackSubmitted) return 'already_submitted'
  if (c.hasGiven5StarFeedback) return 'previous_5_star'
  if (!isValidPhone(c.phoneNumber)) return 'no_phone'
  return 'eligible'
}

// Note: actual feedback-request SMS sending (Twilio) lives in `lib/sms.ts`,
// which layers duplicate protection, per-customer pause, and 5-star
// suppression on top of the eligibility helpers above.

// Helper so callers building a link don't reach into the schema directly.
export function feedbackPath(token: string): string {
  return `/feedback/${token}`
}
