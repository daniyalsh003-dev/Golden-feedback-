/**
 * Phone helpers used to deduplicate customers by phone number.
 * Pure functions — safe to import on client or server.
 */

/**
 * Normalize a phone number to a canonical E.164-style string so that
 * "4165551234", "+1 416 555 1234" and "(416) 555-1234" all collapse to the
 * same value ("+14165551234"). Returns null when there aren't enough digits
 * to be a usable phone number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const hadPlus = raw.trim().startsWith('+')
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null

  // Standard North American (NANP) shapes — unchanged behavior:
  //   "4165551234"        -> +14165551234
  //   "14165551234"       -> +14165551234
  //   "+1 416 555 1234"   -> +14165551234
  //   "(416) 555-1234"    -> +14165551234
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1${digits.slice(1)}`
  }

  // Explicit international number (typed with a leading "+", country code != 1):
  // preserve the full E.164 digits AS-IS. Never coerce it into a +1 number.
  // e.g. "+49 173 8453562" -> +491738453562 (previously mangled to +11738453562).
  if (hadPlus && digits.length >= 8) return `+${digits}`

  // No leading "+" but too many digits for NANP: best-effort international.
  if (digits.length >= 11) return `+${digits}`

  return null
}

/** Format a stored phone number for display, e.g. "(416) 555-1234". */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  const ten =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (ten.length === 10) {
    return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
  }
  return value
}

/** Whether a phone number is usable for sending SMS. */
export function isValidPhone(value: string | null | undefined): boolean {
  return normalizePhone(value ?? null) !== null
}
