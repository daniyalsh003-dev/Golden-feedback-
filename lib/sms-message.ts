/**
 * Pure, dependency-free helpers for building the feedback-request SMS text and
 * the absolute feedback URL. Kept free of secrets so it is safe to import
 * anywhere; Twilio credentials live only in lib/twilio.ts.
 */

export const BUSINESS_NAME = 'Toronto Golden Barbers'

const PLACEHOLDER_NAMES = new Set([
  '',
  'square customer',
  'customer',
  'guest',
  'undefined',
  'null',
])

/**
 * Extract a usable FIRST name from a stored customer name. Returns null when
 * there is no real name to greet with (empty, a known placeholder, or a value
 * that would render as "undefined"/"null"). Never returns an empty string.
 */
export function firstNameFrom(name: string | null | undefined): string | null {
  if (!name) return null
  const cleaned = name.trim().replace(/\s+/g, ' ')
  if (PLACEHOLDER_NAMES.has(cleaned.toLowerCase())) return null
  const first = cleaned.split(' ')[0]?.trim()
  if (!first) return null
  if (PLACEHOLDER_NAMES.has(first.toLowerCase())) return null
  return first
}

/**
 * Build the personalized feedback SMS body. Greets the customer by first name
 * and thanks them for visiting their assigned barber by first name, gracefully
 * falling back when either is unavailable — never emitting "undefined", "null",
 * or an empty variable.
 *
 * Examples:
 *   Hi Darren, thank you for visiting Danial at Toronto Golden Barbers! ...
 *   Hi Darren, thank you for visiting Toronto Golden Barbers! ...        (no barber)
 *   Hi, thank you for visiting Danial at Toronto Golden Barbers! ...     (no name)
 *   Hi, thank you for visiting Toronto Golden Barbers! ...               (neither)
 */
export function buildFeedbackSmsBody(input: {
  firstName?: string | null
  barberFirstName?: string | null
  url: string
}): string {
  const first = firstNameFrom(input.firstName)
  const barber = firstNameFrom(input.barberFirstName)
  const greeting = first ? `Hi ${first},` : 'Hi,'
  const visit = barber
    ? `thank you for visiting ${barber} at ${BUSINESS_NAME}!`
    : `thank you for visiting ${BUSINESS_NAME}!`
  return `${greeting} ${visit} We'd love to hear about your experience.\n\n${input.url}`
}

/**
 * Absolute base URL of the deployed app, mirroring the derivation used by
 * Better Auth (lib/auth.ts) so links work in every environment. Server-side.
 */
export function getAppBaseUrl(): string {
  const explicit =
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL) ||
    'http://localhost:3000'
  return explicit.replace(/\/+$/, '')
}

/** Absolute feedback URL for a token, e.g. https://host/feedback/<token>. */
export function absoluteFeedbackUrl(token: string): string {
  return `${getAppBaseUrl()}/feedback/${token}`
}
