'use client'

import {
  sendTestSmsAction,
  setAutomationStatusAction,
  setSmsAutoSendAction,
  startAutomationFromNow,
} from '@/app/admin/actions'
import type { AutomationOverview } from '@/lib/follow-up'
import { cn } from '@/lib/utils'
import {
  Clock,
  MessageSquare,
  Pause,
  Play,
  Plug,
  Send,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { useState, useTransition } from 'react'

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Not started'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Not started'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function AutomationPanel({
  initialOverview,
}: {
  initialOverview: AutomationOverview
}) {
  const [overview, setOverview] = useState<AutomationOverview>(initialOverview)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const started = Boolean(overview.startAt)
  const active = overview.status === 'active'

  function run<T>(fn: () => Promise<T>, after: (res: T) => void) {
    setError(null)
    startTransition(async () => {
      try {
        after(await fn())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })
  }

  function handleStart() {
    run(
      () => startAutomationFromNow(),
      (res) => {
        setOverview(res.overview)
        setConfirming(false)
      },
    )
  }

  function toggleStatus() {
    run(
      () => setAutomationStatusAction(active ? 'paused' : 'active'),
      (res) => setOverview(res),
    )
  }

  const stats: Array<{ label: string; value: number; tone?: 'gold' }> = [
    { label: 'Customers captured', value: overview.customersCaptured },
    { label: 'Appointments captured', value: overview.appointmentsCaptured },
    { label: 'SMS-eligible', value: overview.smsEligible, tone: 'gold' },
    { label: 'Skipped · 5-star', value: overview.skipped5Star },
    { label: 'No phone', value: overview.noPhone },
    { label: 'Cancelled / no-show', value: overview.cancelledOrNoShow },
  ]

  return (
    <section className="mt-6 rounded-2xl border border-gold/30 bg-card p-5">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-gold/15">
              <Plug className="size-4 text-gold" />
            </span>
            <div>
              <h2 className="font-serif text-lg text-foreground">
                Square Automation
              </h2>
              <p className="text-xs text-muted-foreground">
                Production · read-only · forward-only
              </p>
            </div>
          </div>
          <StatusChip started={started} active={active} />
        </div>

        {/* Activation time */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/60 p-3 text-sm">
          <Clock className="size-4 shrink-0 text-gold" />
          <span className="text-muted-foreground">Start point</span>
          <span className="ml-auto font-medium text-foreground">
            {formatDateTime(overview.startAt)}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border bg-background/60 p-3"
            >
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p
                className={cn(
                  'mt-1 font-serif text-2xl',
                  s.tone === 'gold' ? 'text-gold' : 'text-foreground',
                )}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!started ? (
            confirming ? (
              <>
                <button
                  onClick={handleStart}
                  disabled={pending}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity',
                    pending && 'opacity-50',
                  )}
                >
                  <Play className="size-4" />
                  {pending ? 'Starting…' : 'Confirm: Start From Now'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                <Play className="size-4" />
                Start From Now
              </button>
            )
          ) : (
            <button
              onClick={toggleStatus}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-gold/40"
            >
              {active ? (
                <>
                  <Pause className="size-4" /> Pause automation
                </>
              ) : (
                <>
                  <Play className="size-4" /> Resume automation
                </>
              )}
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Messaging (Twilio) */}
        <MessagingControls overview={overview} setOverview={setOverview} />

        {/* Safety note */}
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-gold" />
          New Square bookings flow in automatically via a signature-verified
          webhook, with a scheduled reconciliation fallback. Only appointments
          starting at or after the start point are captured — historical
          appointments are never imported. Square stays read-only. Automatic SMS
          is <strong className="text-foreground">off by default</strong> and
          only sends once you enable it below; manual sends from a customer’s
          profile always work. Customers who left 5-star feedback are never
          messaged again.
        </p>
      </div>
    </section>
  )
}

function MessagingControls({
  overview,
  setOverview,
}: {
  overview: AutomationOverview
  setOverview: (o: AutomationOverview) => void
}) {
  const [pending, startTransition] = useTransition()
  const [testPhone, setTestPhone] = useState('')
  const [notice, setNotice] = useState<{
    kind: 'ok' | 'err'
    text: string
  } | null>(null)

  function toggleAutoSend() {
    setNotice(null)
    startTransition(async () => {
      try {
        const next = await setSmsAutoSendAction(!overview.autoSendEnabled)
        setOverview(next)
      } catch (e) {
        setNotice({
          kind: 'err',
          text: e instanceof Error ? e.message : 'Something went wrong.',
        })
      }
    })
  }

  function sendTest() {
    setNotice(null)
    startTransition(async () => {
      try {
        const res = await sendTestSmsAction({ toPhone: testPhone })
        setNotice({
          kind: res.ok ? 'ok' : 'err',
          text: res.ok ? 'Test SMS sent.' : res.reason,
        })
        if (res.ok) setTestPhone('')
      } catch (e) {
        setNotice({
          kind: 'err',
          text: e instanceof Error ? e.message : 'Something went wrong.',
        })
      }
    })
  }

  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare className="size-4 text-gold" />
          Feedback SMS (Twilio)
        </p>
        {overview.twilioConfigured ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
            <Plug className="size-3" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300">
            <TriangleAlert className="size-3" /> Not configured
          </span>
        )}
      </div>

      {/* Auto-send master switch */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="max-w-xs">
          <p className="text-sm font-medium text-foreground">
            Automatic SMS
          </p>
          <p className="text-xs text-muted-foreground">
            When on, eligible new appointments are texted automatically. When
            off, nothing sends on its own.
          </p>
        </div>
        <button
          onClick={toggleAutoSend}
          disabled={pending || !overview.twilioConfigured}
          role="switch"
          aria-checked={overview.autoSendEnabled}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40',
            overview.autoSendEnabled ? 'bg-gold' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'inline-block size-4 transform rounded-full bg-background transition-transform',
              overview.autoSendEnabled ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      </div>

      {/* Test SMS */}
      <div className="mt-3">
        <label className="text-xs font-medium text-muted-foreground">
          Send a test SMS
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            type="tel"
            inputMode="tel"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="+1 416 555 0134"
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-gold/40"
          />
          <button
            onClick={sendTest}
            disabled={pending || !overview.twilioConfigured || !testPhone.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gold/50 bg-gold/15 px-3 py-2 text-xs font-medium text-gold transition-colors hover:bg-gold/25 disabled:opacity-40"
          >
            <Send className="size-3.5" />
            {pending ? 'Sending…' : 'Send test'}
          </button>
        </div>
      </div>

      {!overview.twilioConfigured && (
        <p className="mt-3 text-xs text-amber-300/90">
          Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to
          enable sending.
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
  )
}

function StatusChip({ started, active }: { started: boolean; active: boolean }) {
  const label = !started ? 'Not started' : active ? 'Active' : 'Paused'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
        !started
          ? 'border-border bg-muted/40 text-muted-foreground'
          : active
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
            : 'border-gold/40 bg-gold/10 text-gold',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          !started
            ? 'bg-muted-foreground'
            : active
              ? 'bg-emerald-400'
              : 'bg-gold',
        )}
      />
      {label}
    </span>
  )
}
