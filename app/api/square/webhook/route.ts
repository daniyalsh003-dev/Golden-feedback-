import { processBookingWebhook } from '@/lib/square-ingest'
import { verifySquareSignature } from '@/lib/square-webhook-verify'
import { NextResponse } from 'next/server'

// Must run on Node.js (uses node:crypto) and never be statically optimized.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Square Production Booking webhook.
 *
 * SECURITY: every request is signature-verified with HMAC-SHA256 before any
 * work is done. Unverified requests are rejected with 401 — the endpoint never
 * trusts an incoming body it cannot authenticate. Handles booking.created and
 * booking.updated only. Processing is idempotent (deduped by Square event id)
 * and strictly forward-only. Square is read-only; no SMS is ever sent.
 */
export async function POST(req: Request) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!signatureKey) {
    // Not configured yet — signal so Square retries once the key is added.
    return NextResponse.json(
      { error: 'Webhook signature key not configured.' },
      { status: 503 },
    )
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-square-hmacsha256-signature')

  // Reconstruct the exact notification URL Square signed. Prefer an explicit
  // override, otherwise derive it from the forwarded host.
  const host = req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const notificationUrl =
    process.env.SQUARE_WEBHOOK_URL ?? `${proto}://${host}/api/square/webhook`

  const valid = verifySquareSignature({
    signatureKey,
    notificationUrl,
    rawBody,
    signature,
  })
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  }

  let body: {
    event_id?: string
    type?: string
    data?: {
      id?: string
      object?: { booking?: { id?: string } }
    }
  }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const eventId = body.event_id
  const eventType = body.type
  const bookingId = body.data?.object?.booking?.id ?? body.data?.id ?? null

  if (!eventId || !eventType) {
    // Acknowledge malformed-but-signed payloads so Square stops retrying.
    return NextResponse.json({ ok: true, outcome: 'ignored' })
  }

  try {
    const result = await processBookingWebhook({ eventId, eventType, bookingId })
    return NextResponse.json({ ok: true, outcome: result.outcome })
  } catch (e) {
    console.log(
      '[v0] square webhook processing error:',
      e instanceof Error ? e.message : 'unknown',
    )
    // Return 500 so Square retries a transient failure.
    return NextResponse.json({ error: 'Processing failed.' }, { status: 500 })
  }
}
