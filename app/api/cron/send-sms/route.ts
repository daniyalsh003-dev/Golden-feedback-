import { autoSendDueFeedbackSms } from '@/lib/sms'
import { recordSmsCronHeartbeat } from '@/lib/settings'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Lightweight: only reads the local DB and makes sequential Twilio calls for the
// (usually tiny) set of due appointments. No Square API calls happen here.
export const maxDuration = 60

/**
 * DEDICATED automatic feedback-SMS cron, triggered every 5 minutes by Vercel
 * Cron. It calls `autoSendDueFeedbackSms()` DIRECTLY against the local DB and
 * does NOT perform the heavy 35-day Square re-pull. This guarantees that a slow
 * or timed-out Square reconciliation can never delay or block eligible SMS.
 *
 * All existing eligibility rules are preserved by `autoSendDueFeedbackSms`:
 * send only 1 hour after appointment end, forward-only, duplicate-safe, never
 * when `sms_sent = true`, respect per-customer pause, suppress customers who
 * already gave 5 stars, exclude cancelled/no-show, and only mark `sms_sent`
 * after a successful Twilio send.
 *
 * SECURITY: requires CRON_SECRET. Vercel Cron automatically attaches
 * `Authorization: Bearer $CRON_SECRET`. If CRON_SECRET is not set the endpoint
 * is disabled (503) so it is never publicly runnable.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'SMS cron is disabled (CRON_SECRET not set).' },
      { status: 503 },
    )
  }

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const at = new Date().toISOString()
  try {
    const summary = await autoSendDueFeedbackSms()
    await recordSmsCronHeartbeat({
      at,
      ok: true,
      enabled: summary.enabled,
      due: summary.due,
      sent: summary.sent,
      failed: summary.failed,
      skipped: summary.skipped,
    })
    return NextResponse.json({ ok: true, at, ...summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Record a failure heartbeat so a broken run is still visible in the DB.
    await recordSmsCronHeartbeat({
      at,
      ok: false,
      error: message.slice(0, 300),
    }).catch(() => {})
    console.log('[v0] send-sms cron failed:', message)
    return NextResponse.json(
      { ok: false, error: 'SMS cron failed.' },
      { status: 500 },
    )
  }
}
