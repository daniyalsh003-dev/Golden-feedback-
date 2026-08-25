import { cn } from '@/lib/utils'
import { Star } from 'lucide-react'
import type { FollowUpStatus } from '@/lib/follow-up'
import { formatDateTimeToronto } from '@/lib/time'

export const STATUS_META: Record<
  FollowUpStatus,
  { label: string; className: string }
> = {
  new: {
    label: 'New',
    className: 'bg-gold/15 text-gold border-gold/40',
  },
  in_progress: {
    label: 'In Progress',
    className:
      'bg-blue-400/10 text-blue-300 border-blue-400/40',
  },
  resolved: {
    label: 'Resolved',
    className:
      'bg-emerald-400/10 text-emerald-300 border-emerald-400/40',
  },
}

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as FollowUpStatus] ?? STATUS_META.new
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        meta.className,
      )}
    >
      {meta.label}
    </span>
  )
}

export function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            'size-4',
            s <= rating
              ? 'fill-gold text-gold'
              : 'fill-transparent text-muted-foreground/30',
          )}
          strokeWidth={1.75}
        />
      ))}
    </div>
  )
}

export function SmsPill({
  eligible,
  reason,
}: {
  eligible: boolean
  reason: string
}) {
  return (
    <span
      title={reason}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        eligible
          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
          : 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      {eligible ? 'SMS eligible' : 'SMS off'}
    </span>
  )
}

export function formatDate(date: Date | string) {
  // All admin timestamps display in America/Toronto (DST handled automatically).
  return formatDateTimeToronto(date)
}
