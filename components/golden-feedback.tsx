'use client'

import { useState } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
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
import {
  ISSUE_CATEGORIES,
  submitFeedback,
  type FeedbackSubmission,
} from '@/lib/feedback'
import { cn } from '@/lib/utils'

type Step = 'rating' | 'feedback' | 'done' | 'review'

export function GoldenFeedback({ reviewUrl }: { reviewUrl: string }) {
  const [step, setStep] = useState<Step>('rating')
  const [rating, setRating] = useState(0)
  const [issues, setIssues] = useState<string[]>([])
  const [barberName, setBarberName] = useState('')
  const [comments, setComments] = useState('')
  const [wantsContact, setWantsContact] = useState<boolean | null>(null)
  const [contact, setContact] = useState('')

  function resetAll() {
    setStep('rating')
    setRating(0)
    setIssues([])
    setBarberName('')
    setComments('')
    setWantsContact(null)
    setContact('')
  }

  function handleRatingChange(value: number) {
    setRating(value)
    // 5 stars → straight to Google, no interstitial and no internal form.
    if (value === 5) {
      openGoogleReview(reviewUrl)
      setStep('review')
    }
  }

  function toggleIssue(id: string) {
    setIssues((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const submission: FeedbackSubmission = {
      rating,
      issueCategories: issues,
      barberName: barberName.trim(),
      comments: comments.trim(),
      managerContactRequested: wantsContact === true,
      contactInfo: wantsContact ? contact.trim() || null : null,
      customer: null, // populated from Square Appointments in the future
      appointment: null, // populated from Square Appointments in the future
      submittedAt: new Date().toISOString(),
    }
    await submitFeedback(submission)
    setStep('done')
  }

  return (
    <FeedbackShell>
      {step === 'rating' && (
        <section className="animate-in fade-in slide-in-from-bottom-3 duration-500">
          <LuxuryCard>
            <Eyebrow>Your Feedback Matters</Eyebrow>

            <h1 className="mt-5 text-balance text-center font-serif text-[2rem] leading-[1.1] text-foreground sm:text-4xl">
              How was your{' '}
              <span className="bg-gradient-to-b from-gold to-gold-soft bg-clip-text italic text-transparent">
                experience
              </span>{' '}
              today?
            </h1>
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Tap a star to rate your visit.
            </p>

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

      {step === 'feedback' && (
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
                Please select the main reason:
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
                  htmlFor="barber"
                  className="text-sm font-medium text-foreground"
                >
                  Who was your barber?
                </label>
                <input
                  id="barber"
                  type="text"
                  value={barberName}
                  onChange={(e) => setBarberName(e.target.value)}
                  placeholder="Enter your barber's name"
                  autoComplete="off"
                  className="mt-2 w-full rounded-2xl border border-input bg-background/60 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                />
              </div>

              <div className="mt-5">
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

              <SubmitButton />
            </LuxuryCard>
          </form>
        </section>
      )}

      {step === 'done' && (
        <section className="animate-in fade-in zoom-in-95 duration-500">
          <LuxuryCard className="text-center">
            <ConfirmationMark />
            <h2 className="mt-6 text-balance font-serif text-3xl text-foreground">
              Thank you for your feedback.
            </h2>
            <p className="mx-auto mt-3 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
              Your feedback helps us improve your experience at Toronto Golden
              Barbers.
            </p>
            <button
              type="button"
              onClick={resetAll}
              className="mt-7 text-sm text-muted-foreground transition-colors hover:text-gold"
            >
              Done
            </button>
          </LuxuryCard>
        </section>
      )}

      {step === 'review' && (
        <section className="animate-in fade-in zoom-in-95 duration-500">
          <LuxuryCard className="text-center">
            <ConfirmationMark />
            <h2 className="mt-6 text-balance font-serif text-3xl text-foreground">
              Thank you!
            </h2>
            <p className="mx-auto mt-3 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
              We&apos;re taking you to Google to share your experience. If it
              didn&apos;t open, tap below.
            </p>
            <button
              type="button"
              onClick={() => openGoogleReview(reviewUrl)}
              className="mt-7 inline-flex h-13 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-gold to-gold-soft text-base font-semibold text-primary-foreground shadow-[0_0_24px_oklch(0.82_0.13_86_/_30%)] transition-opacity hover:opacity-95"
            >
              Leave a Google Review
              <ExternalLink className="size-4" />
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="mt-4 text-sm text-muted-foreground transition-colors hover:text-gold"
            >
              Done
            </button>
          </LuxuryCard>
        </section>
      )}
    </FeedbackShell>
  )
}
