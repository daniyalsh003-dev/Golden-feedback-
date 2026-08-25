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
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null

  let ten = digits
  // Drop a leading North American country code.
  if (ten.length === 11 && ten.startsWith('1')) ten = ten.slice(1)
  // If someone typed extra digits, keep the last 10 (local number).
  if (ten.length > 11) ten = ten.slice(-10)

  if (ten.length === 10) return `+1${ten}`
  // Fall back to a raw international form for non-NANP numbers.
  if (digits.length >= 8) return `+${digits}`
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
