export const FOLLOW_UP_STATUSES = ['new', 'in_progress', 'resolved'] as const
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number]

export interface FeedbackFilters {
  status?: FollowUpStatus | 'all'
  rating?: number | 'all'
  contactOnly?: boolean
}

export interface FeedbackStats {
  total: number
  averageRating: number
  needsAttention: number
  contactRequests: number
}

/** Customer/appointment context attached to a feedback row for the admin UI. */
export interface FeedbackCustomer {
  id: string
  name: string
  phone: string | null
  hasGiven5StarFeedback: boolean
}

export interface FeedbackAppointment {
  id: string
  appointmentAt: string | null
  serviceName: string | null
  staffMember: string | null
  location: string | null
}

/** A feedback row enriched with its linked customer, visit, and SMS status. */
export interface EnrichedFeedback {
  id: number
  rating: number
  issueCategories: string[]
  barberName: string | null
  comments: string | null
  wantsContact: boolean
  contactInfo: string | null
  followUpStatus: string
  followUpNotes: string | null
  resolvedAt: string | null
  createdAt: string
  customer: FeedbackCustomer | null
  appointment: FeedbackAppointment | null
  smsEligible: boolean
  smsReason: string
}

/** A customer summary row for the Customers tab. */
export interface CustomerSummary {
  id: string
  name: string
  phone: string | null
  email: string | null
  squareCustomerId: string | null
  hasGiven5StarFeedback: boolean
  smsEligible: boolean
  smsReason: string
  visitCount: number
  /** Appointments captured at/after the automation start point. */
  appointmentsSinceActivation: number
  feedbackCount: number
  /** Most recent rating this customer has given, or null. */
  latestRating: number | null
  lastVisitAt: string | null
  /** When Golden Feedback first captured this customer. */
  createdAt: string
}

/** A single entry in a customer's feedback history. */
export interface CustomerHistoryEntry {
  id: number
  rating: number
  comments: string | null
  followUpStatus: string
  createdAt: string
  serviceName: string | null
  staffMember: string | null
  appointmentAt: string | null
}

/**
 * Clear, admin-facing messaging status for a customer, derived from existing
 * data (no duplicate state system). Terminal feedback states win over send
 * states.
 */
export type CustomerMessageStatus =
  | 'ready' // Ready to Send
  | 'sent' // Sent
  | 'paused' // SMS Paused
  | 'feedback_received' // Feedback Received (1–4 stars)
  | 'five_star' // 5-Star Completed
  | 'failed' // Send Failed
  | 'no_phone' // No phone on file
  | 'no_appointment' // Nothing captured yet

export const MESSAGE_STATUS_LABELS: Record<CustomerMessageStatus, string> = {
  ready: 'Ready to Send',
  sent: 'Sent',
  paused: 'SMS Paused',
  feedback_received: 'Feedback Received',
  five_star: '5-Star Completed',
  failed: 'Send Failed',
  no_phone: 'No Phone',
  no_appointment: 'No Visit Yet',
}

export interface CustomerDetail extends CustomerSummary {
  history: CustomerHistoryEntry[]
  /** Per-customer SMS pause / deactivation flag. */
  smsPaused: boolean
  /** Derived messaging status for the profile header. */
  messageStatus: CustomerMessageStatus
  /** Latest appointment send bookkeeping (for troubleshooting + labels). */
  smsSent: boolean
  smsSentAt: string | null
  smsSendMethod: string | null
  smsMessageSid: string | null
  smsError: string | null
  /** Absolute feedback URL for the latest appointment (Copy Feedback Link). */
  feedbackUrl: string | null
  /** Fully personalized SMS body for the latest appointment (Copy SMS). */
  smsMessage: string | null
  latestAppointmentId: string | null
}

// ---- Daily Appointments (date-based schedule view) ----

/** Real-world state of a scheduled appointment. */
export type AppointmentStatusValue =
  | 'upcoming'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatusValue, string> =
  {
    upcoming: 'Upcoming',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No-show',
  }

/**
 * One appointment on the Daily Appointments schedule. All timestamps are ISO
 * UTC; the UI formats them in America/Toronto. Quick actions reuse the existing
 * customer/appointment messaging logic — this view adds no new SMS workflow.
 */
export interface DailyAppointment {
  id: string
  customerId: string
  customerName: string
  customerPhone: string | null
  /** Barber FIRST name from the assigned Square team member (never service text). */
  barberFirstName: string | null
  serviceName: string | null
  startAt: string | null
  endAt: string | null
  status: AppointmentStatusValue
  /** When an automatic feedback SMS becomes eligible: appointment END + 1 hour. */
  smsEligibleAt: string | null
  smsSent: boolean
  smsSendMethod: string | null
  feedbackSubmitted: boolean
  rating: number | null
  /** Per-customer pause flag (SMS Active / Paused). */
  smsPaused: boolean
  hasGiven5StarFeedback: boolean
  /** Absolute feedback URL for this specific visit (Copy Feedback Link). */
  feedbackUrl: string
  /** Fully personalized SMS body for this visit (Copy SMS). */
  smsMessage: string
}

export interface DailyAppointmentsResult {
  /** The selected day as 'YYYY-MM-DD' (America/Toronto). */
  dateStr: string
  appointments: DailyAppointment[]
}

// ---- Square automation ----

export type AutomationStatusValue = 'active' | 'paused'

/**
 * Per-appointment eligibility for a future feedback-request SMS. No SMS is sent
 * yet — this only classifies each captured appointment.
 */
export type AppointmentEligibilityStatus =
  | 'eligible'
  | 'previous_5_star'
  | 'no_phone'
  | 'cancelled'
  | 'no_show'
  | 'already_submitted'

/** Human-readable labels for each eligibility status. */
export const ELIGIBILITY_LABELS: Record<AppointmentEligibilityStatus, string> = {
  eligible: 'Eligible',
  previous_5_star: 'Previous 5-star feedback',
  no_phone: 'No phone',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  already_submitted: 'Feedback already submitted',
}

/**
 * What a "Reset Feedback Data" will clear. This ONLY resets feedback/testing
 * state — it NEVER deletes customers, appointments, Square data, automation
 * config, or the activation start point.
 */
export interface ResetPreview {
  /** Feedback submissions (star ratings + 1–4 star details) to delete. */
  feedback: number
  /** Appointments whose feedback/SMS test state will be cleared (not deleted). */
  appointmentsToReset: number
  /** Customers whose 5-star suppression will be cleared (not deleted). */
  fiveStarCustomers: number
  /** SMS test/history log rows to clear so the flow can be tested again. */
  smsLogs: number
}

/** Result of a completed feedback reset: what was cleared. */
export interface ResetResult {
  cleared: ResetPreview
}

/** Snapshot of automation state + capture counts for the admin panel. */
export interface AutomationOverview {
  status: AutomationStatusValue
  /** Whether AUTOMATIC Twilio SMS is enabled (defaults off until turned on). */
  autoSendEnabled: boolean
  /** Whether Twilio credentials are present in the environment. */
  twilioConfigured: boolean
  /** ISO activation timestamp, or null if never started. */
  startAt: string | null
  /** Distinct customers captured since activation. */
  customersCaptured: number
  /** Square appointments captured (start time at/after activation). */
  appointmentsCaptured: number
  /** Appointments currently eligible for a feedback-request SMS. */
  smsEligible: number
  /** Skipped because the customer already gave 5-star feedback. */
  skipped5Star: number
  /** Appointments with no usable phone number. */
  noPhone: number
  /** Appointments that were cancelled or marked no-show. */
  cancelledOrNoShow: number
}
