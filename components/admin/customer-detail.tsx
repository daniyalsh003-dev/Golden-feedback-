'use client'

import {
  markCustomerSmsSentAction,
  resetCustomerFeedbackAction,
  sendCustomerSmsAction,
  setCustomerSmsPausedAction,
} from '@/app/admin/actions'
import {
  MESSAGE_STATUS_LABELS,
  type CustomerDetail,
  type CustomerMessageStatus,
} from '@/lib/follow-up'
import { formatPhone } from '@/lib/phone'
import { cn } from '@/lib/utils'
import {
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  Copy,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Plug,
  RotateCcw,
  Send,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { FiveStarBadge, SmsBadge } from './feedback-detail'
import { formatDate, StarRow, StatusBadge } from './shared'

const STATUS_STYLES: Record<CustomerMessageStatus, string> = {
  ready: 'border-gold/40 bg-gold/10 text-gold',
  sent: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  paused: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  feedback_received: 'border-blue-400/40 bg-blue-400/10 text-blue-300',
  five_star: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  failed: 'border-destructive/50 bg-destructive/10 text-destructive',
  no_phone: 'border-border bg-muted/40 text-muted-foreground',
  no_appointment: 'border-border bg-muted/40 text-muted-foreground',
}

function MessageStatusBadge({ status }: { status: CustomerMessageStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLES[status],
      )}
    >
      {MESSAGE_STATUS_LABELS[status]}
    </span>
  )
}

export function CustomerDetailDrawer({
  customer,
  loading,
  onClose,
  onRefresh,
}: {
  customer: CustomerDetail | null
  loading: boolean
  onClose: () => void
  onRefresh: () => void
}) {
  const [notice, setNotice] = useState<{
    kind: 'ok' | 'err'
    text: string
  } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Clear the transient notice + any open confirm dialog when the shown
  // customer changes.
  useEffect(() => {
    setNotice(null)
    setConfirmReset(false)
  }, [customer?.id])

  function runAction(
    fn: () => Promise<{ ok: boolean; reason: string }>,
    okText: string,
  ) {
    setNotice(null)
    startTransition(async () => {
      try {
        const res = await fn()
        setNotice({
          kind: res.ok ? 'ok' : 'err',
          text: res.ok ? okText : res.reason,
        })
        onRefresh()
      } catch (e) {
        setNotice({
          kind: 'err',
          text: e instanceof Error ? e.message : 'Something went wrong.',
        })
      }
    })
  }

  async function copy(text: string | null, label: string) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setNotice({ kind: 'ok', text: `${label} copied \u2713` })
    } catch {
      setNotice({ kind: 'err', text: 'Copy failed — copy manually.' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close customer"
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Customer
            </p>
            <h2 className="mt-1 font-serif text-xl text-foreground">
              {loading || !customer ? 'Loading…' : customer.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {loading || !customer ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-gold" />
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-1.5 text-sm">
              {customer.phone && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="size-4 text-gold" />
                  {formatPhone(customer.phone)}
                </p>
              )}
              {customer.email && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="size-4 text-gold" />
                  {customer.email}
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <MessageStatusBadge status={customer.messageStatus} />
              <FiveStarBadge given={customer.hasGiven5StarFeedback} />
              <SmsBadge
                eligible={customer.smsEligible}
                reason={customer.smsReason}
              />
            </div>

            {customer.squareCustomerId && (
              <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs text-gold">
                <Plug className="size-3" />
                Linked to Square
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat
                label="Since start"
                value={customer.appointmentsSinceActivation}
              />
              <Stat label="Feedback" value={customer.feedbackCount} />
              <Stat label="Latest ★" value={customer.latestRating ?? 0} />
            </div>

            {/* ---- Messaging controls ---- */}
            <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MessageSquare className="size-4 text-gold" />
                  Feedback SMS
                </p>
                {/* SMS Active / Paused toggle (this customer only) */}
                <button
                  onClick={() =>
                    runAction(
                      () =>
                        setCustomerSmsPausedAction(
                          customer.id,
                          !customer.smsPaused,
                        ).then(() => ({
                          ok: true,
                          reason: '',
                        })),
                      customer.smsPaused
                        ? 'SMS set to Active'
                        : 'SMS Paused for this customer',
                    )
                  }
                  disabled={pending}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                    customer.smsPaused
                      ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                      : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
                  )}
                >
                  {customer.smsPaused ? (
                    <>
                      <BellOff className="size-3.5" /> SMS Paused
                    </>
                  ) : (
                    <>
                      <BellRing className="size-3.5" /> SMS Active
                    </>
                  )}
                </button>
              </div>

              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {customer.smsPaused
                  ? 'Automatic SMS is paused for this customer only. Manual actions below still work.'
                  : 'Automatic SMS follows the system rules. Manual actions below always work.'}
              </p>

              {/* SMS message preview */}
              {customer.smsMessage && (
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-3 text-xs text-foreground">
                  {customer.smsMessage}
                </p>
              )}

              {/* Action buttons */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ActionButton
                  onClick={() =>
                    runAction(
                      () => sendCustomerSmsAction(customer.id, { resend: false }),
                      'SMS sent via Twilio',
                    )
                  }
                  disabled={pending || !customer.feedbackUrl}
                  icon={Send}
                  primary
                >
                  Send SMS Now
                </ActionButton>
                <ActionButton
                  onClick={() =>
                    runAction(
                      () => sendCustomerSmsAction(customer.id, { resend: true }),
                      'SMS resent via Twilio',
                    )
                  }
                  disabled={pending || !customer.feedbackUrl}
                  icon={Send}
                >
                  Resend SMS
                </ActionButton>
                <ActionButton
                  onClick={() => copy(customer.feedbackUrl, 'Feedback link')}
                  disabled={!customer.feedbackUrl}
                  icon={Link2}
                >
                  Copy Feedback Link
                </ActionButton>
                <ActionButton
                  onClick={() => copy(customer.smsMessage, 'SMS')}
                  disabled={!customer.smsMessage}
                  icon={Copy}
                >
                  Copy SMS
                </ActionButton>
                <ActionButton
                  onClick={() =>
                    runAction(
                      () => markCustomerSmsSentAction(customer.id),
                      'Marked as sent (manual)',
                    )
                  }
                  disabled={pending || !customer.latestAppointmentId}
                  icon={CheckCheck}
                >
                  Mark as Sent
                </ActionButton>
              </div>

              {/* Send bookkeeping / errors */}
              {customer.smsSent && customer.smsSentAt && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="size-3.5 text-emerald-400" />
                  {customer.smsSendMethod === 'manual_marked'
                    ? 'Manually marked sent'
                    : customer.smsSendMethod === 'auto'
                      ? 'Sent automatically'
                      : 'Sent by admin'}{' '}
                  · {formatDate(customer.smsSentAt)}
                </p>
              )}
              {customer.smsError && !customer.smsSent && (
                <p className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  Last send failed: {customer.smsError}
                </p>
              )}

              {notice && (
                <p
                  className={cn(
                    'mt-3 rounded-lg border p-2 text-xs',
                    notice.kind === 'ok'
                      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                      : 'border-destructive/40 bg-destructive/10 text-destructive',
                  )}
                >
                  {notice.text}
                </p>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
              <p className="font-medium text-foreground">
                {customer.hasGiven5StarFeedback
                  ? '5-Star Feedback Completed'
                  : 'Awaiting 5-star feedback'}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Future automatic SMS:{' '}
                <span
                  className={
                    customer.smsEligible && !customer.smsPaused
                      ? 'text-emerald-300'
                      : 'text-muted-foreground'
                  }
                >
                  {customer.smsEligible && !customer.smsPaused
                    ? 'Enabled'
                    : 'Disabled'}
                </span>
              </p>
            </div>

            <div className="mt-6 border-t border-border pt-5">
              <p className="text-sm font-semibold text-foreground">
                Feedback history
              </p>
              {customer.history.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No feedback submitted yet.
                </p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2.5">
                  {customer.history
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <li
                        key={h.id}
                        className="rounded-xl border border-border bg-secondary/40 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Visit {i + 1}
                          </span>
                          <StarRow rating={h.rating} />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            {[h.serviceName, h.staffMember]
                              .filter(Boolean)
                              .join(' · ') ||
                              formatDate(h.appointmentAt ?? h.createdAt)}
                          </p>
                          <StatusBadge status={h.followUpStatus} />
                        </div>
                        {h.comments && (
                          <p className="mt-2 text-sm text-foreground">
                            {h.comments}
                          </p>
                        )}
                      </li>
                    ))}
                </ol>
              )}
            </div>

            {/* ---- Reset this customer's feedback (scoped, non-destructive) ---- */}
            <div className="mt-6 border-t border-border pt-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <RotateCcw className="size-4 text-gold" />
                Reset Feedback
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Clears only this customer&apos;s submitted feedback and 5-star
                lock so their existing feedback link works again for a new
                rating. Does not delete the customer or appointment, and
                doesn&apos;t affect Square, other customers, or SMS automation.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNotice(null)
                  setConfirmReset(true)
                }}
                disabled={pending}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-40"
              >
                <RotateCcw className="size-3.5" />
                Reset Feedback
              </button>
            </div>
          </>
        )}

        {confirmReset && customer && (
          <ResetConfirmDialog
            customerName={customer.name}
            pending={pending}
            onCancel={() => setConfirmReset(false)}
            onConfirm={() => {
              setConfirmReset(false)
              runAction(
                () => resetCustomerFeedbackAction(customer.id),
                'Feedback reset — the feedback link is usable again.',
              )
            }}
          />
        )}
      </div>
    </div>
  )
}

function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  primary,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  icon: typeof Send
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40',
        primary
          ? 'border-gold/50 bg-gold/15 text-gold hover:bg-gold/25'
          : 'border-border text-foreground hover:border-gold/40',
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}

function ResetConfirmDialog({
  customerName,
  pending,
  onCancel,
  onConfirm,
}: {
  customerName: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-confirm-title"
      className="absolute inset-0 z-10 flex items-center justify-center p-6"
    >
      <button
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Cancel"
        disabled={pending}
      />
      <div className="animate-in fade-in zoom-in-95 relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl duration-200">
        <div className="flex size-11 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
          <TriangleAlert className="size-5 text-destructive" />
        </div>
        <h3
          id="reset-confirm-title"
          className="mt-4 font-serif text-xl text-foreground"
        >
          Reset feedback for {customerName}?
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This clears this customer&apos;s submitted feedback and 5-star lock so
          their existing feedback link can be used again. The customer and
          appointment are kept, and Square, other customers, and SMS automation
          are untouched. This can&apos;t be undone.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/50 bg-destructive/15 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/25 disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Reset Feedback
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-xl text-foreground">{value}</p>
    </div>
  )
}
