'use client'

import {
  getDailyAppointments,
  markAppointmentSmsSentAction,
  sendAppointmentSmsAction,
  setCustomerSmsPausedAction,
} from '@/app/admin/actions'
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatusValue,
  type DailyAppointment,
  type DailyAppointmentsResult,
} from '@/lib/follow-up'
import { formatPhone } from '@/lib/phone'
import {
  addDaysStr,
  formatDayLabelToronto,
  formatTimeToronto,
  torontoTodayStr,
} from '@/lib/time'
import { cn } from '@/lib/utils'
import {
  BellOff,
  BellRing,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Send,
  Star,
  User,
} from 'lucide-react'
import { useState, useTransition } from 'react'

const STATUS_STYLES: Record<AppointmentStatusValue, string> = {
  upcoming: 'border-blue-400/40 bg-blue-400/10 text-blue-300',
  completed: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  cancelled: 'border-destructive/50 bg-destructive/10 text-destructive',
  no_show: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
}

export function DailyAppointments({
  initial,
  onOpenCustomer,
}: {
  initial: DailyAppointmentsResult
  onOpenCustomer: (id: string) => void
}) {
  const [dateStr, setDateStr] = useState(initial.dateStr)
  const [appointments, setAppointments] = useState<DailyAppointment[]>(
    initial.appointments,
  )
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null,
  )

  const today = torontoTodayStr()

  function load(next: string) {
    setNotice(null)
    startTransition(async () => {
      const res = await getDailyAppointments(next)
      setDateStr(res.dateStr)
      setAppointments(res.appointments)
    })
  }

  // Reload the current day after an action so statuses stay fresh.
  function reload() {
    startTransition(async () => {
      const res = await getDailyAppointments(dateStr)
      setAppointments(res.appointments)
    })
  }

  function runAction(
    fn: () => Promise<{ ok: boolean; reason: string }>,
    okText: string,
  ) {
    setNotice(null)
    startTransition(async () => {
      try {
        const res = await fn()
        setNotice({ kind: res.ok ? 'ok' : 'err', text: res.ok ? okText : res.reason })
        reload()
      } catch (e) {
        setNotice({
          kind: 'err',
          text: e instanceof Error ? e.message : 'Something went wrong.',
        })
      }
    })
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice({ kind: 'ok', text: `${label} copied` })
    } catch {
      setNotice({ kind: 'err', text: 'Copy failed — copy manually.' })
    }
  }

  return (
    <section className="mt-6">
      {/* Date navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center gap-1.5">
          <NavButton onClick={() => load(addDaysStr(dateStr, -1))} label="Previous day">
            <ChevronLeft className="size-4" />
          </NavButton>
          <NavButton onClick={() => load(addDaysStr(dateStr, 1))} label="Next day">
            <ChevronRight className="size-4" />
          </NavButton>
          <button
            onClick={() => load(today)}
            disabled={dateStr === today}
            className="ml-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-gold/40 disabled:opacity-40"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-3">
          <p className="font-serif text-lg text-foreground">
            {formatDayLabelToronto(dateStr)}
          </p>
          <label className="sr-only" htmlFor="daily-date">
            Select date
          </label>
          <input
            id="daily-date"
            type="date"
            value={dateStr}
            onChange={(e) => e.target.value && load(e.target.value)}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-gold/40"
          />
        </div>
      </div>

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

      {/* Schedule */}
      <div
        className={cn(
          'mt-4 flex flex-col gap-3 transition-opacity',
          pending && 'opacity-50',
        )}
      >
        {appointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
            No appointments scheduled for this day.
          </div>
        ) : (
          appointments.map((a) => (
            <AppointmentCard
              key={a.id}
              appt={a}
              pending={pending}
              onOpenCustomer={onOpenCustomer}
              onTogglePause={() =>
                runAction(
                  () =>
                    setCustomerSmsPausedAction(a.customerId, !a.smsPaused).then(
                      () => ({ ok: true, reason: '' }),
                    ),
                  a.smsPaused ? 'SMS set to Active' : 'SMS Paused for customer',
                )
              }
              onSend={() =>
                runAction(
                  () => sendAppointmentSmsAction(a.id, { resend: false }),
                  'SMS sent via Twilio',
                )
              }
              onResend={() =>
                runAction(
                  () => sendAppointmentSmsAction(a.id, { resend: true }),
                  'SMS resent via Twilio',
                )
              }
              onMarkSent={() =>
                runAction(
                  () => markAppointmentSmsSentAction(a.id),
                  'Marked as sent (manual)',
                )
              }
              onCopyLink={() => copy(a.feedbackUrl, 'Feedback link')}
              onCopySms={() => copy(a.smsMessage, 'SMS')}
            />
          ))
        )}
      </div>
    </section>
  )
}

function AppointmentCard({
  appt: a,
  pending,
  onOpenCustomer,
  onTogglePause,
  onSend,
  onResend,
  onMarkSent,
  onCopyLink,
  onCopySms,
}: {
  appt: DailyAppointment
  pending: boolean
  onOpenCustomer: (id: string) => void
  onTogglePause: () => void
  onSend: () => void
  onResend: () => void
  onMarkSent: () => void
  onCopyLink: () => void
  onCopySms: () => void
}) {
  const terminal = a.status === 'cancelled' || a.status === 'no_show'
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Time range */}
          <p className="font-serif text-lg text-foreground">
            {formatTimeToronto(a.startAt)}
            {a.endAt ? ` – ${formatTimeToronto(a.endAt)}` : ''}
          </p>
          {/* Customer + service + barber */}
          <p className="mt-1 text-sm font-medium text-foreground">
            {a.customerName}
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              a.serviceName,
              a.barberFirstName && `by ${a.barberFirstName}`,
              a.customerPhone ? formatPhone(a.customerPhone) : 'No phone',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
              STATUS_STYLES[a.status],
            )}
          >
            {APPOINTMENT_STATUS_LABELS[a.status]}
          </span>
          {a.rating !== null && (
            <span className="inline-flex items-center gap-1 text-xs text-gold">
              <Star className="size-3 fill-current" />
              {a.rating}
            </span>
          )}
        </div>
      </div>

      {/* SMS + feedback status line */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          SMS:{' '}
          <span className={a.smsSent ? 'text-emerald-300' : 'text-foreground'}>
            {a.smsSent
              ? a.smsSendMethod === 'manual_marked'
                ? 'Marked sent'
                : 'Sent'
              : a.smsPaused
                ? 'Paused'
                : 'Not sent'}
          </span>
        </span>
        <span>
          Feedback:{' '}
          <span className={a.feedbackSubmitted ? 'text-emerald-300' : 'text-foreground'}>
            {a.hasGiven5StarFeedback
              ? '5-Star Completed'
              : a.feedbackSubmitted
                ? 'Received'
                : 'None'}
          </span>
        </span>
        {a.status === 'completed' && a.smsEligibleAt && !a.smsSent && (
          <span>
            SMS eligible at{' '}
            <span className="text-foreground">
              {formatTimeToronto(a.smsEligibleAt)}
            </span>
          </span>
        )}
      </div>

      {/* Quick actions (reuse existing messaging logic) */}
      <div className="mt-3 flex flex-wrap gap-2">
        <QuickButton onClick={() => onOpenCustomer(a.customerId)} icon={User}>
          Profile
        </QuickButton>
        <QuickButton onClick={onTogglePause} icon={a.smsPaused ? BellOff : BellRing}>
          {a.smsPaused ? 'Paused' : 'Active'}
        </QuickButton>
        <QuickButton
          onClick={onSend}
          icon={Send}
          disabled={pending || terminal}
          primary
        >
          Send SMS Now
        </QuickButton>
        <QuickButton onClick={onResend} icon={Send} disabled={pending || terminal}>
          Resend
        </QuickButton>
        <QuickButton onClick={onCopyLink} icon={Link2}>
          Copy Link
        </QuickButton>
        <QuickButton onClick={onCopySms} icon={Copy}>
          Copy SMS
        </QuickButton>
        <QuickButton onClick={onMarkSent} icon={CheckCheck} disabled={pending}>
          Mark Sent
        </QuickButton>
        <a
          href={a.feedbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-gold/40"
        >
          <ExternalLink className="size-3.5" />
          Open
        </a>
      </div>
    </div>
  )
}

function NavButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-lg border border-border p-1.5 text-foreground transition-colors hover:border-gold/40"
    >
      {children}
    </button>
  )
}

function QuickButton({
  onClick,
  icon: Icon,
  disabled,
  primary,
  children,
}: {
  onClick: () => void
  icon: typeof Send
  disabled?: boolean
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
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
