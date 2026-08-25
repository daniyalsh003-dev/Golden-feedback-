import { randomBytes } from 'node:crypto'

/** URL-safe random string of the given byte length (base64url). */
function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

/** Internal customer id, e.g. "cus_9f8a...". Never the phone number. */
export function generateCustomerId(): string {
  return `cus_${randomToken(12)}`
}

/** Internal appointment id, e.g. "apt_9f8a...". */
export function generateAppointmentId(): string {
  return `apt_${randomToken(12)}`
}

/**
 * Secure, unguessable feedback token used in the public /feedback/[token] URL.
 * ~24 chars of URL-safe entropy.
 */
export function generateFeedbackToken(): string {
  return randomToken(18)
}
