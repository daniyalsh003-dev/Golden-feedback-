'use client'

import { updateFollowUp } from '@/app/admin/actions'
import {
  FOLLOW_UP_STATUSES,
  type EnrichedFeedback,
  type FollowUpStatus,
} from '@/lib/follow-up'
import { Button } from '@/components/ui/button'
import { ISSUE_CATEGORIES } from '@/lib/feedback'
import { formatPhone } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { Ban, BellRing, Loader2, Phone, Star, User, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDate, StarRow, STATUS_META } from './shared'

const CATEGORY_LABELS = new Map(ISSUE_CATEGORIES.map((c) => [c.id, c.label]))

export function FeedbackDetail({
  item,
  onClose,
  onUpdated,
  onOpenCustomer,
}: {
  item: EnrichedFeedback
  onClose: () => void
  onUpdated: (updated: EnrichedFeedback) => void
  onOpenCustomer?: (customerId: string) => void
}) {
  const [status, setStatus] = useState<FollowUpStatus>(
    item.followUpStatus as FollowUpStatus,
  )
  const [notes, setNotes] = useState(item.followUpNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await updateFollowUp({ id: item.id, status, notes })
      onUpdated({
        ...item,
        followUpStatus: status,
        followUpNotes: notes.trim() || null,
        resolvedAt: status === 'resolved' ? new Date().toISOString() : null,
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const appt = item.appointment
  const cust = item.customer

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close details"
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Feedback #{item.id}
            </p>
            <div className="mt-2">
              <StarRow rating={item.rating} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatDate(item.createdAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Customer + visit context */}
        <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">
              {cust?.name ?? item.barberName ?? 'Anonymous submission'}
            </p>
            <SmsBadge eligible={item.smsEligible} reason={item.smsReason} />
          </div>
          {cust?.phone && (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatPhone(cust.phone)}
            </p>
          )}

          <dl className="mt-3 grid grid-cols-1 gap-1.5 text-sm">
            {appt?.serviceName && (
              <ContextRow label="Service" value={appt.serviceName} />
            )}
            {appt?.staffMember && (
              <ContextRow label="Staff" value={appt.staffMember} />
            )}
            {appt?.appointmentAt && (
              <ContextRow
                label="Appointment"
                value={formatDate(appt.appointmentAt)}
              />
            )}
            {appt?.location && (
              <ContextRow label="Location" value={appt.location} />
            )}
          </dl>

          {cust && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <FiveStarBadge given={cust.hasGiven5StarFeedback} />
              {onOpenCustomer && (
                <button
                  type="button"
                  onClick={() => onOpenCustomer(cust.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <User className="size-3" />
                  View history
                </button>
              )}
            </div>
          )}
        </div>

        {item.issueCategories.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-medium text-muted-foreground">
              Reported issues
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.issueCategories.map((id) => (
                <span
                  key={id}
                  className="rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs text-foreground"
                >
                  {CATEGORY_LABELS.get(id) ?? id}
                </span>
              ))}
            </div>
          </div>
        )}

        {item.comments && (
          <div className="mt-5">
            <p className="text-sm font-medium text-muted-foreground">Comments</p>
            <p className="mt-2 whitespace-pre-wrap rounded-xl border border-border bg-secondary/50 p-3 text-sm leading-relaxed text-foreground">
              {item.comments}
            </p>
          </div>
        )}

        {item.wantsContact && (
          <div className="mt-5 rounded-xl border border-gold/40 bg-gold/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-gold">
              <Phone className="size-4" />
              Contact requested
            </p>
            <p className="mt-1 text-sm text-foreground">
              {item.contactInfo || 'No contact details provided.'}
            </p>
          </div>
        )}

        <div className="mt-6 border-t border-border pt-5">
          <p className="text-sm font-semibold text-foreground">Follow-up</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {FOLLOW_UP_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  status === s
                    ? STATUS_META[s].className
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>

          <label
            htmlFor="follow-up-notes"
            className="mt-4 block text-sm text-muted-foreground"
          >
            Internal notes
          </label>
          <textarea
            id="follow-up-notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              setSaved(false)
            }}
            rows={4}
            placeholder="Log manager actions, resolution details, etc."
            className="mt-2 w-full resize-none rounded-xl border border-border bg-input/40 p-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-gold"
          />

          <Button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 h-11 w-full rounded-full bg-gradient-to-b from-gold to-gold-soft font-semibold text-primary-foreground hover:from-gold hover:to-gold"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : saved ? (
              'Saved'
            ) : (
              'Save follow-up'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  )
}

export function FiveStarBadge({ given }: { given: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
        given
          ? 'border-gold/40 bg-gold/15 text-gold'
          : 'border-border text-muted-foreground',
      )}
    >
      <Star className={cn('size-3', given && 'fill-gold')} />
      {given ? '5-star given' : 'No 5-star yet'}
    </span>
  )
}

export function SmsBadge({
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
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
        eligible
          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
          : 'border-border bg-secondary/60 text-muted-foreground',
      )}
    >
      {eligible ? <BellRing className="size-3" /> : <Ban className="size-3" />}
      {eligible ? 'SMS eligible' : 'SMS off'}
    </span>
  )
}
