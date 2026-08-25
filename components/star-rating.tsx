'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  value: number
  onChange: (value: number) => void
}

const LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Great',
  5: 'Exceptional',
}

export function StarRating({ value, onChange }: StarRatingProps) {
  const [hovered, setHovered] = useState(0)
  const active = hovered || value

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="flex items-center gap-2 sm:gap-3"
        role="radiogroup"
        aria-label="Rate your experience from 1 to 5 stars"
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= active
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
              onClick={() => onChange(star)}
              onMouseEnter={() => setHovered(star)}
              onFocus={() => setHovered(star)}
              onBlur={() => setHovered(0)}
              className={cn(
                'group flex flex-col items-center gap-2 rounded-2xl p-1 transition-transform duration-200 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                filled ? 'scale-105' : 'scale-100 hover:scale-110',
              )}
            >
              <Star
                className={cn(
                  'size-12 transition-all duration-200 sm:size-[3.25rem]',
                  filled
                    ? 'fill-gold text-gold drop-shadow-[0_0_14px_oklch(0.82_0.13_86_/_55%)]'
                    : 'fill-transparent text-gold/70 drop-shadow-[0_0_6px_oklch(0.82_0.13_86_/_20%)]',
                )}
                strokeWidth={1.75}
              />
              <span
                className={cn(
                  'text-sm font-medium tabular-nums transition-colors',
                  filled ? 'text-gold' : 'text-muted-foreground/70',
                )}
              >
                {star}
              </span>
            </button>
          )
        })}
      </div>
      <p
        className={cn(
          'h-6 font-serif text-lg tracking-wide transition-colors',
          active ? 'text-gold' : 'text-muted-foreground/0',
        )}
        aria-live="polite"
      >
        {active ? LABELS[active] : ''}
      </p>
    </div>
  )
}
