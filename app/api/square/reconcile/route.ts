import { runReconciliation } from '@/lib/square-ingest'
import { recordReconcileHeartbeat } from '@/lib/settings'
import { NextResponse } from 'next/server'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Runs every 5 minutes via Vercel Cron; allow headroom for the Square re-pull
// plus the sequential Twilio auto-send pass without timing out.
export const maxDuration = 300


/**
 * Forward-only reconciliation + automatic feedback-SMS pass, triggered every 5
 * minutes by Vercel Cron. It re-pulls recent bookings at/after the activation
 * timestamp and re-ingests them idempotently (catching any missed webhook),
 * then runs the automatic feedback-SMS pass. It NEVER imports historical
 * appointments.
 *
 * The auto-SMS pass only sends when BOTH the automation status is "active" AND
 * the auto-send master switch is ON; it is forward-only and duplicate-safe
 * (each appointment is sent at most once, only becoming eligible 1 hour after
 * its end time, and is only marked sent on a successful Twilio send).
 *
 * SECURITY: requires CRON_SECRET. Vercel Cron automatically attaches
 * `Authorization: Bearer $CRON_SECRET`. If CRON_SECRET is not set the endpoint
 * is disabled (503), so it is never publicly runnable. Webhooks remain the
 * primary capture mechanism and work without this endpoint.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'Reconciliation is disabled (CRON_SECRET not set).' },
      { status: 503 },
    )
  }

