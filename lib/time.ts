/**
 * America/Toronto timezone helpers. Pure and dependency-free — safe on client
 * and server. All appointment timestamps are stored as canonical UTC instants;
 * these helpers only convert for DISPLAY and for day-boundary CALCULATIONS so
 * that daylight-saving time is handled automatically. Never hard-code -4/-5.
 */

export const TORONTO_TZ = 'America/Toronto'

function toDate(input: Date | string | null | undefined): Date | null {
  if (!input) return null
  const d = typeof input === 'string' ? new Date(input) : input
  return Number.isNaN(d.getTime()) ? null : d
}

/** e.g. "Aug 23, 2026, 3:00 PM" in Toronto local time. */
export function formatDateTimeToronto(
  input: Date | string | null | undefined,
): string {
  const d = toDate(input)
  if (!d) return '—'
  return d.toLocaleString('en-CA', {
    timeZone: TORONTO_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** e.g. "3:00 PM" in Toronto local time. */
export function formatTimeToronto(
  input: Date | string | null | undefined,
): string {
  const d = toDate(input)
  if (!d) return '—'
  return d.toLocaleString('en-CA', {
    timeZone: TORONTO_TZ,
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Today's date in Toronto as an ISO 'YYYY-MM-DD' string. */
export function torontoTodayStr(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TORONTO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Offset (Toronto localtime minus UTC) in milliseconds at the given instant.
 * Positive/negative handled automatically across DST.
 */
function torontoOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TORONTO_TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const m: Record<string, string> = {}
  for (const p of parts) m[p.type] = p.value
  const hour = m.hour === '24' ? '00' : m.hour
  const asUTC = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    Number(hour),
    Number(m.minute),
    Number(m.second),
  )
  return asUTC - date.getTime()
}

/**
 * UTC instants for the start (inclusive) and end (exclusive) of a Toronto
 * calendar day given as 'YYYY-MM-DD'. Used to filter appointments to a single
 * local day without UTC-boundary bleed.
 */
export function torontoDayBoundsUtc(dateStr: string): {
  start: Date
  end: Date
} {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const startGuess = Date.UTC(y, mo - 1, d, 0, 0, 0)
  const start = new Date(startGuess - torontoOffsetMs(new Date(startGuess)))
  const endGuess = Date.UTC(y, mo - 1, d + 1, 0, 0, 0)
  const end = new Date(endGuess - torontoOffsetMs(new Date(endGuess)))
  return { start, end }
}

/** Shift a 'YYYY-MM-DD' date string by whole days. */
export function addDaysStr(dateStr: string, delta: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, d + delta))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** e.g. "Sat, Aug 23, 2026" for a 'YYYY-MM-DD' day, labeled in Toronto. */
export function formatDayLabelToronto(dateStr: string): string {
  const { start } = torontoDayBoundsUtc(dateStr)
  return start.toLocaleDateString('en-CA', {
    timeZone: TORONTO_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
