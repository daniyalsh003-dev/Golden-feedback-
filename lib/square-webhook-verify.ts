import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify a Square webhook signature.
 *
 * Square signs `notificationUrl + rawRequestBody` with HMAC-SHA256 using the
 * subscription's Signature Key, and sends the base64 result in the
 * `x-square-hmacsha256-signature` header. We recompute it and compare in
 * constant time. The Signature Key comes only from the server environment
 * (SQUARE_WEBHOOK_SIGNATURE_KEY) and is never logged or returned.
 */
export function verifySquareSignature(params: {
  signatureKey: string
  notificationUrl: string
  rawBody: string
  signature: string | null
}): boolean {
  const { signatureKey, notificationUrl, rawBody, signature } = params
  if (!signature) return false

  const expected = createHmac('sha256', signatureKey)
    .update(notificationUrl + rawBody)
    .digest('base64')

  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
