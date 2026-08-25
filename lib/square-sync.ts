import 'server-only'

import { db } from '@/lib/db'
import { appointment, customer } from '@/lib/db/schema'
import { computeAppointmentEligibility } from '@/lib/feedback-system'
import { getAutomationConfig, getSmsAutoSendEnabled } from '@/lib/settings'
import { isTwilioConfigured } from '@/lib/twilio'
import type { AutomationOverview } from '@/lib/follow-up'
import { and, eq, gte, isNotNull } from 'drizzle-orm'

/**
 * Compute the automation overview purely from the database. Every count is
 * derived from appointments captured at/after the activation timestamp, so the
 * numbers are stable and never depend on when the last webhook or reconcile
 * ran. Appointments before `startAt` are never captured, so they can never
 * appear here. This performs NO Square calls and NO writes.
 */
export async function getAutomationOverview(): Promise<AutomationOverview> {
  const { startAt, status } = await getAutomationConfig()
  const autoSendEnabled = await getSmsAutoSendEnabled()
  const twilioConfigured = isTwilioConfigured()

  const empty: AutomationOverview = {
    status,
    autoSendEnabled,
    twilioConfigured,
    startAt: startAt ? startAt.toISOString() : null,
    customersCaptured: 0,
    appointmentsCaptured: 0,
    smsEligible: 0,
    skipped5Star: 0,
    noPhone: 0,
    cancelledOrNoShow: 0,
  }
  if (!startAt) return empty

  const rows = await db
    .select({ appointment, customer })
    .from(appointment)
    .leftJoin(customer, eq(appointment.customerId, customer.id))
    .where(
      and(
        isNotNull(appointment.appointmentAt),
        gte(appointment.appointmentAt, startAt),
      ),
    )

  const customerIds = new Set<string>()
  let smsEligible = 0
  let skipped5Star = 0
  let noPhone = 0
  let cancelledOrNoShow = 0

  for (const { appointment: a, customer: c } of rows) {
    customerIds.add(a.customerId)
    const eligibility = c
      ? computeAppointmentEligibility(c, {
          squareStatus: a.squareStatus,
          feedbackSubmitted: a.feedbackSubmitted,
        })
      : 'no_phone'
    switch (eligibility) {
      case 'eligible':
        smsEligible++
        break
      case 'previous_5_star':
        skipped5Star++
        break
      case 'no_phone':
        noPhone++
        break
      case 'cancelled':
      case 'no_show':
        cancelledOrNoShow++
        break
      default:
        break
    }
  }

  return {
    ...empty,
    customersCaptured: customerIds.size,
    appointmentsCaptured: rows.length,
    smsEligible,
    skipped5Star,
    noPhone,
    cancelledOrNoShow,
  }
}
