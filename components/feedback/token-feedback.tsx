'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { StarRating } from '@/components/star-rating'
import {
  ConfirmationMark,
  ContinueButton,
  Eyebrow,
  FeedbackShell,
  LuxuryCard,
  openGoogleReview,
  RatingSummary,
  SubmitButton,
  YesNoToggle,
} from '@/components/feedback/chrome'
import { submitTokenFeedbackAction } from '@/app/feedback/[token]/actions'
import { ISSUE_CATEGORIES } from '@/lib/feedback'
import { cn } from '@/lib/utils'

export interface TokenFeedbackProps {
  token: string
  customerName: string
  staffMember: string | null
  appointmentLabel: string | null
  /** Server-resolved official Google reviews URL (see lib/google-review.ts). */
  reviewUrl: string
}

type Step = 'rating' | 'feedback' | 'submitting' | 'done' | 'review' | 'already'

export function TokenFeedback({
  token,
  customerName,
  staffMember,
  appointmentLabel,
  reviewUrl,
}: TokenFeedbackProps) {
  const [step, setStep] = useState<Step>('rating')
  const [rating, setRating] = useState(0)
  const [issues, setIssues] = useState<string[]>([])
  const [comments, setComments] = useState('')
  const [wantsContact, setWantsContact] = useState<boolean | null>(null)
  const [contact, setContact] = useState('')
  const [error, setError] = useState<string | null>(null)

  const firstName = customerName.trim().split(/\s+/)[0] || 'there'

  function toggleIssue(id: string) {
    setIssues((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    )
  }

  async function handleRatingChange(value: number) {
    setRating(value)
    if (value === 5) {
      // Record the 5-star (sets the customer's stop-SMS flag), then show the
      // celebratory confirmation screen. The redirect to Google now happens
      // from that screen (after a short visible countdown, or instantly if the
      // customer taps the button) — see FiveStarReview.
      try {
        const result = await submitTokenFeedbackAction(token, { rating: 5 })
        if (result.status === 'already_submitted') {
          setStep('already')
          return
        }
      } catch {
        // Even if recording hiccups, still route them to Google.
      }
      setStep('review')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStep('submitting')
    try {
      const result = await submitTokenFeedbackAction(token, {
        rating,
        issueCategories: issues,
        comments: comments.trim() || null,
        wantsContact: wantsContact === true,
        contactInfo: wantsContact === true ? contact.trim() || null : null,
      })
      if (result.status === 'already_submitted') {
        setStep('already')
      } else if (result.status === 'not_found') {
        setError('This feedback link is no longer valid.')
        setStep('feedback')
      } else {
        setStep('done')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setStep('feedback')
    }
  }

  // Show ONLY the actual assigned barber (Square team member first name) and
  // the appointment date/time. Never the service or service-variation text —
  // that field can contain a list of barbers and must not be shown or used to
  // guess the barber. If no barber is reliably resolved, it is simply omitted.
  const barberName = staffMember?.trim() || null
  const visitContext = [barberName, appointmentLabel].filter(Boolean).join(' \u00b7 ')

  return (
    <FeedbackShell>
      {step === 'rating' && (
        <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
          <LuxuryCard>
            <Eyebrow>Your Feedback Matters</Eyebrow>

            <h1 className="mt-5 text-balance text-center font-serif text-[2rem] leading-[1.1] text-foreground sm:text-4xl">
              Hi {firstName}, how was your{' '}
              <span className="bg-gradient-to-b from-gold to-gold-soft bg-clip-text italic text-transparent">
                experience
              </span>
              ?
            </h1>
            {visitContext ? (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                {visitContext}
              </p>
            ) : (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Tap a star to rate your visit.
              </p>
            )}

            <div className="mt-7">
              <StarRating value={rating} onChange={handleRatingChange} />
            </div>

            <ContinueButton
              disabled={rating === 0}
              onClick={() => setStep('feedback')}
            />
          </LuxuryCard>
        </section>
      )}

      {(step === 'feedback' || step === 'submitting') && (
        <section className="animate-in fade-in slide-in-from-right-3 duration-500">
          <button
            type="button"
            onClick={() => setStep('rating')}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gold"
          >
            <ArrowLeft className="size-4" />
            Back
          </button>

          <form onSubmit={handleSubmit}>
            <LuxuryCard>
              <RatingSummary rating={rating} />

              <h2 className="mt-4 text-balance text-center font-serif text-[1.75rem] leading-tight text-foreground">
                What could we have done better?
              </h2>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Optional — select any that apply:
              </p>

              <div className="mt-6 grid grid-cols-3 gap-2.5">
                {ISSUE_CATEGORIES.map((cat) => {
                  const selected = issues.includes(cat.id)
                  const Icon = cat.icon
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleIssue(cat.id)}
                      className={cn(
                        'flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center transition-all duration-200',
                        selected
                          ? 'border-gold bg-gold/15 shadow-[0_0_18px_oklch(0.82_0.13_86_/_25%),inset_0_1px_0_oklch(0.82_0.13_86_/_20%)]'
                          : 'border-border bg-background/40 hover:border-gold/50',
                      )}
                    >
                      <Icon
                        className={cn(
                          'size-6 transition-colors',
                          selected ? 'text-gold' : 'text-gold/70',
                        )}
                        strokeWidth={1.75}
                      />
                      <span
                        className={cn(
                          'text-[0.7rem] font-medium leading-tight transition-colors',
                          selected ? 'text-gold' : 'text-muted-foreground',
                        )}
                      >
                        {cat.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-6">
                <label
                  htmlFor="comments"
                  className="text-sm font-medium text-foreground"
                >
                  Want to tell us more?{' '}
                  <span className="text-muted-foreground">(Optional)</span>
                </label>
                <textarea
                  id="comments"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={4}
                  placeholder="Additional comments..."
                  className="mt-2 w-full resize-none rounded-2xl border border-input bg-background/60 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>

              <div className="mt-5">
                <p className="text-sm font-medium text-foreground">
                  Would you like a manager to contact you?
                </p>
                <YesNoToggle value={wantsContact} onChange={setWantsContact} />
              </div>

              {wantsContact === true && (
                <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-300">
                  <label htmlFor="contact" className="sr-only">
                    Phone or email
                  </label>
                  <input
                    id="contact"
                    type="text"
                    inputMode="email"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="Best phone or email to reach you"
                    className="w-full rounded-2xl border border-input bg-background/60 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                </div>
              )}

              {error && (
                <p className="mt-4 text-center text-sm text-red-400">{error}</p>
              )}

              {step === 'submitting' ? (
                <div className="mt-7 flex h-13 w-full items-center justify-center rounded-full bg-gradient-to-b from-gold to-gold-soft text-primary-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : (
                <SubmitButton />
              )}
            </LuxuryCard>
          </form>
        </section>
      )}

      {step === 'done' && (
        <section className="animate-in fade-in zoom-in-95 duration-500">
          <LuxuryCard className="text-center">
            <ConfirmationMark />
            <h2 className="mt-6 text-balance font-serif text-3xl text-foreground">
              Thank you, {firstName}.
            </h2>
            <p className="mx-auto mt-3 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
              Your feedback helps us improve your experience at Toronto Golden
              Barbers.
            </p>
          </LuxuryCard>
        </section>
      )}

      {step === 'review' && (
        <FiveStarReview barberName={barberName} reviewUrl={reviewUrl} />
      )}

      {step === 'already' && <AlreadySubmittedCard />}
    </FeedbackShell>
  )
}

/**
 * Minimal, premium 5-star success screen. The Google review button is the
 * focus. There is NO visible countdown and NO status text.
 *
 * Navigation behavior:
 *  - AUTO redirect: fires exactly ONCE per page visit, 6 seconds after the
 *    screen appears, opening the SAME server-resolved Google review URL.
 *  - MANUAL button: ALWAYS functional. Tapping it opens Google immediately and
 *    cancels the pending auto-redirect (so Google never opens twice). If the
 *    customer returns to this page, the button still works every time — only
 *    the automatic redirect is one-time.
 */
function FiveStarReview({
  barberName,
  reviewUrl,
}: {
  barberName: string | null
  reviewUrl: string
}) {
  // One-time guard + handle for the AUTOMATIC redirect only. The manual button
  // is intentionally NOT gated by this, so it keeps working on every return.
  const autoFiredRef = useRef(false)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelAutoRedirect = useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
    // Mark as done so it can never fire later in this session.
    autoFiredRef.current = true
  }, [])

  // Manual click: always opens Google, and cancels any pending auto-redirect.
  const openManually = useCallback(() => {
    cancelAutoRedirect()
    openGoogleReview(reviewUrl)
  }, [cancelAutoRedirect, reviewUrl])

  // Silent one-time auto-redirect after exactly 6 seconds (no visible
  // countdown, no status text).
  useEffect(() => {
    if (autoFiredRef.current) return
    autoTimerRef.current = setTimeout(() => {
      autoFiredRef.current = true
      autoTimerRef.current = null
      openGoogleReview(reviewUrl)
    }, 6_000)
    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current)
        autoTimerRef.current = null
      }
    }
  }, [reviewUrl])

  const reviewName = barberName?.trim() || 'us'

  return (
    <section className="animate-in fade-in zoom-in-95 duration-500">
      <LuxuryCard className="text-center">
        <h2 className="text-balance font-serif text-3xl leading-[1.15] text-foreground sm:text-4xl">
          One last favor {'\u2764\uFE0F'}
        </h2>

        <p className="mx-auto mt-5 max-w-xs text-pretty text-base leading-relaxed text-muted-foreground">
          Would you leave a Google review for{' '}
          <span className="font-medium text-foreground">{reviewName}</span>? It
          would mean a lot to them!
        </p>

        <button
          type="button"
          onClick={openManually}
          className="mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-gold to-gold-soft text-base font-semibold text-primary-foreground shadow-[0_0_28px_oklch(0.82_0.13_86_/_38%)] transition-all duration-200 hover:opacity-95 active:scale-[0.98]"
        >
          <span aria-hidden="true">{'\u2B50'}</span>
          {barberName?.trim()
            ? `Leave ${reviewName} a Review`
            : 'Leave a Review'}
        </button>
      </LuxuryCard>
    </section>
  )
}

/**
 * Standalone 5-star review screen for the server page to render when a customer
 * RETURNS to a feedback link whose submitted rating was 5 stars. It shows the
 * same FiveStarReview UI (working button + one-time 6s auto-redirect) inside
 * the feedback shell, so the "Leave [Barber] a Review" button is available and
 * functional on every return visit.
 */
export function FiveStarReviewScreen({
  barberName,
  reviewUrl,
}: {
  barberName: string | null
  reviewUrl: string
}) {
  return (
    <FeedbackShell>
      <FiveStarReview barberName={barberName} reviewUrl={reviewUrl} />
    </FeedbackShell>
  )
}

export function AlreadySubmittedCard() {
  return (
    <section className="animate-in fade-in zoom-in-95 duration-500">
      <LuxuryCard className="text-center">
        <ConfirmationMark />
        <h2 className="mt-6 text-balance font-serif text-3xl text-foreground">
          Thank you.
        </h2>
        <p className="mx-auto mt-3 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
          Feedback for this appointment has already been submitted.
        </p>
      </LuxuryCard>
    </section>
  )
}
