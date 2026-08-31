import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// ---- Better Auth tables (do not rename columns) ----
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  issuer: text('issuer'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

// ---- App tables ----

// System-level key/value settings that must survive redeploys, e.g.
// `automation_start_at` (the "start from now" activation time) and
// `automation_status` ('active' | 'paused'). One row per key.
export const appSetting = pgTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type AppSetting = typeof appSetting.$inferSelect

// A customer profile, deduplicated by normalized phone number so returning
// customers map to one record. The `id` is an internal generated id — never
// the phone number itself.
export const customer = pgTable('customer', {
  id: text('id').primaryKey(),
  customerName: text('customer_name').notNull(),
  phoneNumber: text('phone_number'),
  normalizedPhoneNumber: text('normalized_phone_number'),
  email: text('email'),
  squareCustomerId: text('square_customer_id'),
  // Once a customer gives 5 stars, no further feedback-request SMS are sent.
  hasGiven5StarFeedback: boolean('has_given_5_star_feedback')
    .default(false)
    .notNull(),
  // Per-customer SMS pause / deactivation. When true, this customer is skipped
  // by AUTOMATIC SMS only; admins can still send manually. Reactivatable.
  smsPaused: boolean('sms_paused').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Customer = typeof customer.$inferSelect

// A single visit captured from Square (or a test tool). Each appointment
// carries a unique feedback token, a stored Square booking status, and a
// derived SMS-eligibility status. Square access stays read-only.
export const appointment = pgTable('appointment', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  squareAppointmentId: text('square_appointment_id'),
  squareCustomerId: text('square_customer_id'),
  squareTeamMemberId: text('square_team_member_id'),
  appointmentAt: timestamp('appointment_at'),
  durationMinutes: integer('duration_minutes'),
  serviceName: text('service_name'),
  staffMember: text('staff_member'),
  location: text('location'),
  // Raw Square booking status (ACCEPTED, CANCELLED_*, NO_SHOW, etc.).
  squareStatus: text('square_status'),
  feedbackToken: text('feedback_token').notNull(),
  feedbackSubmitted: boolean('feedback_submitted').default(false).notNull(),
  // True once the one-time Google review action for this link has been used —
  // either the customer tapped the review button or the 6s auto-redirect fired.
  // Persisted server-side so reopening the link (any browser/device) always
  // shows the completed/Thank You screen instead of the review request again.
  googleReviewConsumed: boolean('google_review_consumed')
    .default(false)
    .notNull(),
  // Derived, display-safe eligibility status for a future feedback-request SMS.
  smsEligibility: text('sms_eligibility'),
  // True once the AUTOMATIC cron has attempted a Twilio send for this
  // appointment — set BEFORE the Twilio call and regardless of the outcome
  // (sent, failed, undelivered, geo/invalid-number error, etc.). The cron uses
  // this to guarantee exactly ONE automatic attempt per appointment and to
  // never auto-retry. It is per-appointment, so a future NEW appointment for
  // the same customer still gets its own attempt. Manual send/resend/test are
  // NOT gated by this flag.
  smsAttempted: boolean('sms_attempted').default(false).notNull(),
  // True once a feedback-request SMS is confirmed sent (Twilio success) OR the
  // admin manually marks it as sent. A failed Twilio attempt never sets this.
  smsSent: boolean('sms_sent').default(false).notNull(),
  smsSentAt: timestamp('sms_sent_at'),
  // How it was sent: 'auto' (automatic), 'manual' (admin via Twilio), or
  // 'manual_marked' (admin recorded an out-of-band send, no Twilio).
  smsSendMethod: text('sms_send_method'),
  smsMessageSid: text('sms_message_sid'),
  // Last Twilio error (if any) and the last attempt time — for troubleshooting.
  smsError: text('sms_error'),
  smsLastAttemptAt: timestamp('sms_last_attempt_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Appointment = typeof appointment.$inferSelect

// Idempotency ledger for Square webhook deliveries. Storing each event_id lets
// us safely ignore duplicate deliveries so a booking is never processed twice.
export const webhookEvent = pgTable('webhook_event', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type'),
  squareBookingId: text('square_booking_id'),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
})

export type WebhookEvent = typeof webhookEvent.$inferSelect

// Full history of every Twilio SMS attempt (and manual "mark as sent" record).
// One row per attempt so resends and failures are all preserved for auditing.
export const smsLog = pgTable('sms_log', {
  id: serial('id').primaryKey(),
  customerId: text('customer_id'),
  appointmentId: text('appointment_id'),
  toPhone: text('to_phone'),
  body: text('body'),
  messageSid: text('message_sid'),
  // 'sent' | 'failed' | 'manual_marked'
  status: text('status').notNull(),
  // 'auto' | 'manual' | 'manual_marked'
  method: text('method').notNull(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type SmsLog = typeof smsLog.$inferSelect

// Feedback is submitted by customers, so there is no userId scoping.
// Access is gated at the route/action level: only authenticated admins can read it.
// `customerId` / `appointmentId` link token-based submissions to a customer and
// visit; they are null for legacy/anonymous submissions.
export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  customerId: text('customer_id'),
  appointmentId: text('appointment_id'),
  rating: integer('rating').notNull(),
  issueCategories: text('issue_categories').array().default([]).notNull(),
  barberName: text('barber_name'),
  comments: text('comments'),
  wantsContact: boolean('wants_contact').default(false).notNull(),
  contactInfo: text('contact_info'),
  followUpStatus: text('follow_up_status').default('new').notNull(),
  followUpNotes: text('follow_up_notes'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type Feedback = typeof feedback.$inferSelect
