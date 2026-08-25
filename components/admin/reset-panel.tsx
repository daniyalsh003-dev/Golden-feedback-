'use client'

import {
  getResetPreviewAction,
  resetGoldenFeedbackDataAction,
} from '@/app/admin/actions'
import type { ResetPreview } from '@/lib/follow-up'
import { cn } from '@/lib/utils'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Phase = 'idle' | 'previewing' | 'confirming'

export function ResetPanel() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<ResetPreview | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function openPreview() {
    setError(null)
    setDone(null)
    startTransition(async () => {
      try {
        const p = await getResetPreviewAction()
        setPreview(p)
        setPhase('confirming')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load preview.')
      }
    })
  }

  function cancel() {
    setPhase('idle')
    setPreview(null)
    setConfirmText('')
    setError(null)
  }

  function doReset() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await resetGoldenFeedbackDataAction(confirmText)
        setDone(
          `Cleared ${res.cleared.feedback} feedback record(s) and reset ${res.cleared.appointmentsToReset} appointment(s) and ${res.cleared.fiveStarCustomers} 5-star customer(s) for testing. No customers or appointments were deleted.`,
        )
        cancel()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Reset failed.')
      }
    })
  }

  const rows = preview
    ? ([
        ['Feedback records', preview.feedback],
        ['Appointments to reset', preview.appointmentsToReset],
        ['5-star customers to reset', preview.fiveStarCustomers],
        ['SMS log rows', preview.smsLogs],
      ] as const)
    : []

  return (
    <section className="mt-6 rounded-2xl border border-destructive/30 bg-card p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-destructive/15">
            <RotateCcw className="size-4 text-destructive" />
          </span>
          <div>
            <h2 className="font-serif text-lg text-foreground">
              Reset Feedback Data
            </h2>
            <p className="text-xs text-muted-foreground">
              Testing tool · customers &amp; appointments are never deleted
            </p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Clears only feedback and testing state — submitted ratings, feedback
          completion, 5-star suppression, and SMS test history — so you can run
          the customer feedback flow again. Customers, appointments, Square
          data, automation config, and your start point are all left intact.
        </p>

        {done && (
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-xs text-emerald-300">
            {done}
          </div>
        )}

        {phase !== 'confirming' ? (
          <button
            onClick={openPreview}
            disabled={pending}
            className={cn(
              'inline-flex w-fit items-center gap-2 rounded-full border border-destructive/50 px-5 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10',
              pending && 'opacity-50',
            )}
          >
            <RotateCcw className="size-4" />
            {pending ? 'Loading…' : 'Reset feedback data…'}
          </button>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p className="text-xs">
                Reset feedback data? Customer and appointment records will NOT
                be deleted. This clears the following testing state and cannot
                be undone.
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-2">
              {rows.map(([label, n]) => (
                <div
                  key={label}
                  className="rounded-lg border border-border bg-background/60 px-3 py-2"
                >
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-serif text-lg text-foreground">{n}</dd>
                </div>
              ))}
            </dl>

            <label className="text-xs text-muted-foreground" htmlFor="reset-confirm">
              Type <span className="font-semibold text-destructive">RESET</span>{' '}
              to confirm
            </label>
            <input
              id="reset-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-destructive"
              placeholder="RESET"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={doReset}
                disabled={pending || confirmText.trim().toUpperCase() !== 'RESET'}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-sm font-semibold text-destructive-foreground transition-opacity',
                  (pending || confirmText.trim().toUpperCase() !== 'RESET') &&
                    'opacity-50',
                )}
              >
                <RotateCcw className="size-4" />
                {pending ? 'Resetting…' : 'Reset feedback data'}
              </button>
              <button
                onClick={cancel}
                disabled={pending}
                className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </section>
  )
}
