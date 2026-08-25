'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check, Star } from 'lucide-react'

/**
 * Send a happy (5-star) customer to their Google review destination.
 *
 * The `url` is the official Places API (New) `googleMapsLinks.reviewsUri`,
 * resolved on the SERVER (see lib/google-review.ts) and passed down as a prop —
 * the GOOGLE_MAPS_API_KEY is never referenced in client code. As a real Google
 * Maps link, on supported devices it opens the native Google Maps app directly
 * on the Toronto Golden Barbers Reviews section.
 */
export function openGoogleReview(url: string) {
  if (typeof window === 'undefined' || !url) return
  // In an embedded preview, open a new tab so the app isn't replaced;
  // on the live (top-level) page, navigate directly to the review page.
  if (window.self !== window.top) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    window.location.href = url
  }
}

/** Full-screen luxury page shell shared by every feedback surface. */
export function FeedbackShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center overflow-hidden bg-background px-5 pb-8 pt-8">
      <Backdrop />
      <CornerAccents />
      <div className="relative z-10 flex w-full max-w-md flex-1 flex-col">
        <Brand />
        <div className="flex flex-1 flex-col justify-center">{children}</div>
        <Footer />
      </div>
    </main>
  )
}

export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      <img
        src="/golden-barbers-backdrop.png"
        alt=""
        className="h-full w-full object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.16_0.006_60_/_55%)_0%,oklch(0.16_0.006_60_/_75%)_38%,oklch(0.14_0.006_60_/_96%)_72%,oklch(0.13_0.006_60)_100%)]" />
      <div className="absolute left-1/2 top-[6%] h-56 w-[130%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,oklch(0.82_0.13_86_/_14%),transparent_65%)]" />
    </div>
  )
}

export function CornerAccents() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      <span className="absolute -left-16 -top-16 size-40 rotate-45 border-b-2 border-gold/60 shadow-[0_2px_16px_oklch(0.82_0.13_86_/_35%)]" />
      <span className="absolute -right-16 -top-16 size-40 -rotate-45 border-b-2 border-gold/60 shadow-[0_2px_16px_oklch(0.82_0.13_86_/_35%)]" />
      <span className="absolute -bottom-16 -left-16 size-40 -rotate-45 border-t-2 border-gold/50 shadow-[0_-2px_16px_oklch(0.82_0.13_86_/_30%)]" />
      <span className="absolute -bottom-16 -right-16 size-40 rotate-45 border-t-2 border-gold/50 shadow-[0_-2px_16px_oklch(0.82_0.13_86_/_30%)]" />
    </div>
  )
}

export function LuxuryCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative rounded-[1.75rem] border border-gold/30 bg-[oklch(0.17_0.006_60_/_82%)] p-7 shadow-[0_0_0_1px_oklch(0.82_0.13_86_/_8%),0_24px_60px_-20px_oklch(0_0_0_/_80%),inset_0_1px_0_oklch(0.82_0.13_86_/_12%)] backdrop-blur-md sm:p-8',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[3px] rounded-[1.55rem] border border-gold/10"
      />
      <div className="relative">{children}</div>
    </div>
  )
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold/60" />
      <span className="text-center text-[0.7rem] font-medium uppercase tracking-[0.28em] text-gold">
        {children}
      </span>
      <span className="h-px w-8 bg-gradient-to-l from-transparent to-gold/60" />
    </div>
  )
}

export function ContinueButton({
  disabled,
  onClick,
}: {
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      size="lg"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'mt-8 h-13 w-full rounded-full text-base font-semibold transition-all duration-300',
        disabled
          ? 'cursor-not-allowed bg-secondary text-muted-foreground shadow-none'
          : 'bg-gradient-to-b from-gold to-gold-soft text-primary-foreground shadow-[0_0_28px_oklch(0.82_0.13_86_/_35%)] hover:opacity-95',
      )}
    >
      Continue
      <span aria-hidden="true" className="ml-1">
        &rarr;
      </span>
    </Button>
  )
}

export function Brand() {
  return (
    <div className="flex flex-col items-center pb-6 pt-2">
      <img
        src="/toronto-golden-barbers-logo-trimmed.png"
        alt="Toronto Golden Barbers"
        width={1017}
        height={952}
        className="h-auto w-44 select-none drop-shadow-[0_6px_24px_oklch(0_0_0_/_60%)] sm:w-48"
        draggable={false}
      />
    </div>
  )
}

export function Footer() {
  return (
    <footer className="relative z-10 mx-auto mt-8 w-full max-w-xs text-center">
      <div className="flex items-center justify-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/40" />
        <span className="whitespace-nowrap text-[0.7rem] uppercase tracking-[0.24em] text-gold/80">
          Toronto Golden Barbers
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/40" />
      </div>
      <p className="mt-2 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground/70">
        Precision <span className="text-gold/70">&bull;</span> Style{' '}
        <span className="text-gold/70">&bull;</span> Luxury
      </p>
    </footer>
  )
}

export function RatingSummary({ rating }: { rating: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            'size-6',
            s <= rating
              ? 'fill-gold text-gold'
              : 'fill-transparent text-muted-foreground/30',
          )}
          strokeWidth={1.5}
        />
      ))}
    </div>
  )
}

export function ConfirmationMark() {
  return (
    <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-gold/40 bg-gold/10 shadow-[0_0_24px_oklch(0.82_0.13_86_/_25%)]">
      <Check className="size-8 text-gold" strokeWidth={2.5} />
    </div>
  )
}

export function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean | null
  onChange: (v: boolean) => void
}) {
  const options: { label: string; val: boolean }[] = [
    { label: 'Yes', val: true },
    { label: 'No', val: false },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Would you like a manager to contact you?"
      className="mt-2 grid grid-cols-2 gap-2.5"
    >
      {options.map((opt) => {
        const selected = value === opt.val
        return (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.val)}
            className={cn(
              'h-12 rounded-2xl border text-base font-medium transition-all duration-200',
              selected
                ? 'border-gold bg-gold/15 text-gold shadow-[0_0_16px_oklch(0.82_0.13_86_/_22%)]'
                : 'border-border bg-background/40 text-muted-foreground hover:border-gold/50',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/** Submit button used across feedback forms (gold gradient). */
export function SubmitButton({
  children = 'Submit Feedback',
}: {
  children?: React.ReactNode
}) {
  return (
    <Button
      type="submit"
      size="lg"
      className="mt-7 h-13 w-full rounded-full bg-gradient-to-b from-gold to-gold-soft text-base font-semibold text-primary-foreground shadow-[0_0_24px_oklch(0.82_0.13_86_/_30%)] hover:opacity-95"
    >
      {children}
    </Button>
  )
}
