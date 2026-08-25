import {
  FeedbackShell,
  LuxuryCard,
} from '@/components/feedback/chrome'
import {
  AlreadySubmittedCard,
  FiveStarReviewScreen,
  TokenFeedback,
} from '@/components/feedback/token-feedback'
import {
  getAppointmentByToken,
  getSubmittedRatingForAppointment,
} from '@/lib/feedback-system'
import { getGoogleReviewUrl } from '@/lib/google-review'
import { firstNameFrom } from '@/lib/sms-message'
import { formatDateTimeToronto } from '@/lib/time'

export const dynamic = 'force-dynamic'

function formatAppointment(date: Date | null): string | null {
  if (!date) return null
  return formatDateTimeToronto(date)
}

export default async function FeedbackTokenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const record = await getAppointmentByToken(token)

  if (!record) {
    return (
      <FeedbackShell>
        <section className="animate-in fade-in zoom-in-95 duration-500">
          <LuxuryCard className="text-center">
            <h2 className="text-balance font-serif text-3xl text-foreground">
              Link not found
            </h2>
            <p className="mx-auto mt-3 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
              This feedback link is invalid or has expired. Please check the
              link from your message and try again.
            </p>
          </LuxuryCard>
        </section>
      </FeedbackShell>
    )
  }

  if (record.appointment.feedbackSubmitted) {
    // If the submitted rating was 5 stars, a returning visitor should still be
    // able to leave a Google review — re-show the same 5-star screen (working
    // button + one-time 6s auto-redirect) instead of the generic card. Any
    // other rating keeps the generic already-submitted card.
    const submittedRating = await getSubmittedRatingForAppointment(
      record.appointment.id,
    )
    if (submittedRating === 5) {
      const { url: reviewUrl } = await getGoogleReviewUrl()
      return (
        <FiveStarReviewScreen
          barberName={firstNameFrom(record.appointment.staffMember)}
          reviewUrl={reviewUrl}
        />
      )
    }
    return (
      <FeedbackShell>
        <AlreadySubmittedCard />
      </FeedbackShell>
    )
  }

  const { appointment, customer } = record
  const { url: reviewUrl } = await getGoogleReviewUrl()

  return (
    <TokenFeedback
      token={token}
      customerName={customer?.customerName ?? ''}
      // Barber FIRST name only, resolved from the assigned Square team member
      // stored on the appointment — never derived from the service text.
      staffMember={firstNameFrom(appointment.staffMember)}
      appointmentLabel={formatAppointment(appointment.appointmentAt)}
      reviewUrl={reviewUrl}
    />
  )
}
