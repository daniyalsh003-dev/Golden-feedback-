import 'server-only'

/**
 * Server-only Square Production client.
 *
 * SECURITY INVARIANTS (do not weaken):
 * - The access token is read only from process.env.SQUARE_ACCESS_TOKEN on the
 *   server. It is NEVER returned to the caller, NEVER logged, and NEVER placed
 *   in any value that reaches the browser.
 * - This module is `import 'server-only'`, so importing it from a client
 *   component is a build error.
 * - Every function here is READ-ONLY: only GET requests and read-oriented
 *   `/search` POSTs are used. Nothing creates, updates, cancels, or deletes.
 */

const SQUARE_API_BASE = 'https://connect.squareup.com'
const SQUARE_VERSION = '2026-07-15'

// Read-only endpoints this integration is permitted to call. Any attempt to
// use a path outside this allow-list throws, so the module cannot mutate Square.
const READONLY_PATHS = [
  '/v2/merchants',
  '/v2/locations',
  '/v2/bookings',
  '/v2/customers/',
  '/v2/team-members/search',
  '/v2/catalog/batch-retrieve',
] as const

export interface SquareLocationInfo {
  id: string
  name: string | null
  address: string | null
  phone: string | null
  status: string | null
}

export interface SquareBookingSummary {
  bookingId: string
  status: string | null
  appointmentAt: string | null
  durationMinutes: number | null
  location: string | null
  service: string | null
  teamMember: string | null
  teamMemberId: string | null
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
}

export interface SquareConnectionResult {
  ok: boolean
  apiVersion: string
  businessName: string | null
  merchantCountry: string | null
  locations: SquareLocationInfo[]
  bookings: SquareBookingSummary[]
  totalRecentBookings: number
  warnings: string[]
  error?: string
}

class SquareError extends Error {}

function getToken(): string {
  const token = process.env.SQUARE_ACCESS_TOKEN
  if (!token) {
    throw new SquareError(
      'SQUARE_ACCESS_TOKEN is not set in the server environment.',
    )
  }
  return token
}

function assertReadOnly(path: string) {
  const allowed = READONLY_PATHS.some((p) => path.startsWith(p))
  if (!allowed) {
    throw new SquareError(`Blocked non-read-only Square path: ${path}`)
  }
}

/**
 * Minimal Square fetch wrapper. Never logs the token or full headers.
 * `method` is restricted to GET and POST (POST only for read `/search`
 * and `/batch-retrieve` endpoints).
 */
async function squareFetch<T>(
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  assertReadOnly(path)
  const token = getToken()

  let res: Response
  try {
    res = await fetch(`${SQUARE_API_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'Square-Version': SQUARE_VERSION,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    })
  } catch {
    // Network-level failure. Deliberately generic; no token/headers exposed.
    throw new SquareError('Could not reach the Square API.')
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

  if (!res.ok) {
    const errors = (data?.errors as Array<Record<string, string>>) ?? []
    const detail =
      errors[0]?.detail ||
      errors[0]?.code ||
      `Square API returned HTTP ${res.status}.`
    throw new SquareError(detail)
  }

  return data as T
}

interface SquareAddress {
  address_line_1?: string
  locality?: string
  administrative_district_level_1?: string
  postal_code?: string
}

function formatAddress(a?: SquareAddress): string | null {
  if (!a) return null
  const parts = [
    a.address_line_1,
    a.locality,
    a.administrative_district_level_1,
    a.postal_code,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** Retrieve merchant (business) info. Read-only. */
async function getMerchant(): Promise<{
  businessName: string | null
  country: string | null
}> {
  const data = await squareFetch<{
    merchant?: Array<{ business_name?: string; country?: string }>
  }>('/v2/merchants')
  const m = data.merchant?.[0]
  return {
    businessName: m?.business_name ?? null,
    country: m?.country ?? null,
  }
}

/** List active locations. Read-only. */
async function getLocations(): Promise<SquareLocationInfo[]> {
  const data = await squareFetch<{
    locations?: Array<{
      id: string
      name?: string
      status?: string
      phone_number?: string
      address?: SquareAddress
    }>
  }>('/v2/locations')
  return (data.locations ?? []).map((l) => ({
    id: l.id,
    name: l.name ?? null,
    address: formatAddress(l.address),
    phone: l.phone_number ?? null,
    status: l.status ?? null,
  }))
}

interface SquareBooking {
  id: string
  status?: string
  start_at?: string
  location_id?: string
  customer_id?: string
  appointment_segments?: Array<{
    team_member_id?: string
    service_variation_id?: string
    duration_minutes?: number
  }>
}

const DAY_MS = 24 * 60 * 60 * 1000
// Square's List Bookings endpoint rejects any range longer than 31 days
// ("Time range can be at most 31 days in length"). We stay safely under that.
const MAX_WINDOW_DAYS = 30

/**
 * Fetch every booking in a single window that is guaranteed to be <= 30 days,
 * following Square's `cursor` pagination until exhausted. Read-only.
 */
async function fetchBookingsWindow(
  min: Date,
  max: Date,
  perPage: number,
): Promise<SquareBooking[]> {
  const all: SquareBooking[] = []
  let cursor: string | undefined
  do {
    const params = new URLSearchParams({
      limit: String(perPage),
      start_at_min: min.toISOString(),
      start_at_max: max.toISOString(),
    })
    if (cursor) params.set('cursor', cursor)
    const data = await squareFetch<{
      bookings?: SquareBooking[]
      cursor?: string
    }>(`/v2/bookings?${params.toString()}`)
    all.push(...(data.bookings ?? []))
    cursor = data.cursor || undefined
  } while (cursor)
  return all
}

/**
 * List bookings over a trailing window of `days`, split into consecutive
 * sub-windows of at most 30 days each so we never violate Square's 31-day
 * range cap. For the connection test we call this with 30 days. Read-only.
 */
async function getRecentBookings(
  perPage: number,
  days = MAX_WINDOW_DAYS,
): Promise<SquareBooking[]> {
  const now = new Date()
  const overallMin = new Date(now.getTime() - days * DAY_MS)

  const bookings: SquareBooking[] = []
  // Walk backwards from now in <=30-day slices.
  let windowMax = now
  while (windowMax > overallMin) {
    const windowMin = new Date(
      Math.max(
        overallMin.getTime(),
        windowMax.getTime() - MAX_WINDOW_DAYS * DAY_MS,
      ),
    )
    bookings.push(...(await fetchBookingsWindow(windowMin, windowMax, perPage)))
    windowMax = windowMin
  }

  // Dedupe (adjacent windows share a boundary instant) and sort newest first.
  const byId = new Map<string, SquareBooking>()
  for (const b of bookings) byId.set(b.id, b)
  const unique = [...byId.values()]
  unique.sort((a, b) => (b.start_at ?? '').localeCompare(a.start_at ?? ''))
  return unique
}

/** Retrieve a single customer. Read-only. */
async function getCustomer(id: string): Promise<{
  name: string | null
  phone: string | null
  email: string | null
} | null> {
  try {
    const data = await squareFetch<{
      customer?: {
        given_name?: string
        family_name?: string
        company_name?: string
        phone_number?: string
        email_address?: string
      }
    }>(`/v2/customers/${encodeURIComponent(id)}`)
    const c = data.customer
    if (!c) return null
    const name =
      [c.given_name, c.family_name].filter(Boolean).join(' ').trim() ||
      c.company_name ||
      null
    return {
      name,
      phone: c.phone_number ?? null,
      email: c.email_address ?? null,
    }
  } catch {
    return null
  }
}

/** Look up team member display names by id. Read-only (search). */
async function getTeamMemberNames(
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  try {
    const data = await squareFetch<{
      team_members?: Array<{
        id: string
        given_name?: string
        family_name?: string
      }>
    }>('/v2/team-members/search', {
      method: 'POST',
      body: { query: { filter: { status: 'ACTIVE' } }, limit: 200 },
    })
    for (const tm of data.team_members ?? []) {
      const name = [tm.given_name, tm.family_name].filter(Boolean).join(' ')
      if (name) map.set(tm.id, name)
    }
  } catch {
    // Team member read scope may be absent; names simply stay unknown.
  }
  return map
}

/**
 * Look up the SERVICE name for each service-variation id. Read-only.
 *
 * IMPORTANT: we resolve to the parent ITEM name (e.g. "Haircut"), NOT the
 * item-variation name. In this merchant's catalog the variation name is a
 * barber-selection list (e.g. "Ali / Danial / Angelo"), which must never be
 * shown as the service or interpreted as the barber. The actual barber always
 * comes from the booking's assigned team member. The variation name is only a
 * last-resort fallback if the parent item name cannot be read.
 */
async function getServiceNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return map
  try {
    const data = await squareFetch<{
      objects?: Array<{
        id: string
        item_variation_data?: { name?: string; item_id?: string }
      }>
      related_objects?: Array<{
        id: string
        type?: string
        item_data?: { name?: string }
      }>
    }>('/v2/catalog/batch-retrieve', {
      method: 'POST',
      body: { object_ids: unique, include_related_objects: true },
    })
    const itemNames = new Map<string, string>()
    for (const rel of data.related_objects ?? []) {
      if (rel.type === 'ITEM' && rel.item_data?.name) {
        itemNames.set(rel.id, rel.item_data.name)
      }
    }
    for (const obj of data.objects ?? []) {
      const itemId = obj.item_variation_data?.item_id
      const itemName = itemId ? itemNames.get(itemId) : undefined
      // Prefer the parent item (service) name; fall back to the variation name.
      const name = itemName || obj.item_variation_data?.name
      if (name) map.set(obj.id, name)
    }
  } catch {
    // Catalog read scope may be absent; service names simply stay unknown.
  }
  return map
}

/**
 * Enrich raw bookings into display/sync-safe summaries: resolve customer
 * name+phone, service name, team-member name, and location name. Related
 * objects are batched and customer lookups are cached across the set.
 * Read-only.
 */
async function enrichBookings(
  bookings: SquareBooking[],
  locationNames: Map<string, string>,
): Promise<SquareBookingSummary[]> {
  const teamIds = bookings.flatMap((b) =>
    (b.appointment_segments ?? [])
      .map((s) => s.team_member_id)
      .filter((x): x is string => Boolean(x)),
  )
  const serviceIds = bookings.flatMap((b) =>
    (b.appointment_segments ?? [])
      .map((s) => s.service_variation_id)
      .filter((x): x is string => Boolean(x)),
  )
  const [teamNames, serviceNames] = await Promise.all([
    getTeamMemberNames(teamIds),
    getServiceNames(serviceIds),
  ])

  const customerCache = new Map<
    string,
    { name: string | null; phone: string | null; email: string | null } | null
  >()

  const summaries: SquareBookingSummary[] = []
  for (const b of bookings) {
    const seg = b.appointment_segments?.[0]
    let customerName: string | null = null
    let customerPhone: string | null = null
    let customerEmail: string | null = null
    if (b.customer_id) {
      if (!customerCache.has(b.customer_id)) {
        customerCache.set(b.customer_id, await getCustomer(b.customer_id))
      }
      const c = customerCache.get(b.customer_id)
      customerName = c?.name ?? null
      customerPhone = c?.phone ?? null
      customerEmail = c?.email ?? null
    }
    summaries.push({
      bookingId: b.id,
      status: b.status ?? null,
      appointmentAt: b.start_at ?? null,
      durationMinutes:
        typeof seg?.duration_minutes === 'number' ? seg.duration_minutes : null,
      location: b.location_id
        ? (locationNames.get(b.location_id) ?? b.location_id)
        : null,
      service: seg?.service_variation_id
        ? (serviceNames.get(seg.service_variation_id) ?? null)
        : null,
      teamMember: seg?.team_member_id
        ? (teamNames.get(seg.team_member_id) ?? null)
        : null,
      teamMemberId: seg?.team_member_id ?? null,
      customerId: b.customer_id ?? null,
      customerName,
      customerPhone,
      customerEmail,
    })
  }
  return summaries
}

/**
 * Read-only: fetch enriched bookings whose start time is at or after `startAt`.
 * The query window is bounded (never a large historical lookup): it spans from
 * `max(startAt, now - lookbackDays)` up to now, split into <=30-day slices to
 * respect Square's range cap. Bookings strictly before `startAt` are dropped.
 */
export async function getEnrichedBookingsSince(
  startAt: Date,
  opts: { lookbackDays?: number } = {},
): Promise<SquareBookingSummary[]> {
  const now = new Date()
  const lookbackDays = opts.lookbackDays ?? 35
  const floor = new Date(now.getTime() - lookbackDays * DAY_MS)
  const windowMin = startAt.getTime() > floor.getTime() ? startAt : floor

  // Collect raw bookings across <=30-day slices from windowMin..now.
  const raw: SquareBooking[] = []
  let sliceMax = now
  while (sliceMax > windowMin) {
    const sliceMin = new Date(
      Math.max(windowMin.getTime(), sliceMax.getTime() - MAX_WINDOW_DAYS * DAY_MS),
    )
    raw.push(...(await fetchBookingsWindow(sliceMin, sliceMax, 100)))
    sliceMax = sliceMin
  }

  // Dedupe by id and keep only bookings at/after the activation timestamp.
  const byId = new Map<string, SquareBooking>()
  for (const b of raw) byId.set(b.id, b)
  const startMs = startAt.getTime()
  const eligible = [...byId.values()].filter((b) => {
    if (!b.start_at) return false
    const t = new Date(b.start_at).getTime()
    return !Number.isNaN(t) && t >= startMs
  })
  eligible.sort((a, b) => (b.start_at ?? '').localeCompare(a.start_at ?? ''))

  const locations = await getLocations()
  const locationNames = new Map(locations.map((l) => [l.id, l.name ?? l.id]))
  return enrichBookings(eligible, locationNames)
}

/**
 * Read-only: retrieve a single booking by id and enrich it with customer,
 * service, team-member, and location details. Used by the webhook handler to
 * resolve the booking referenced by a `booking.created` / `booking.updated`
 * event. Returns null if the booking cannot be read.
 */
export async function getEnrichedBooking(
  bookingId: string,
): Promise<SquareBookingSummary | null> {
  let raw: SquareBooking | undefined
  try {
    const data = await squareFetch<{ booking?: SquareBooking }>(
      `/v2/bookings/${encodeURIComponent(bookingId)}`,
    )
    raw = data.booking
  } catch {
    return null
  }
  if (!raw) return null

  const locations = await getLocations()
  const locationNames = new Map(locations.map((l) => [l.id, l.name ?? l.id]))
  const [summary] = await enrichBookings([raw], locationNames)
  return summary ?? null
}

/**
 * Runs the full read-only connection test: business info, locations, and a
 * small sample of recent bookings enriched with customer / service / team
 * member details. Returns only sanitized, display-safe fields.
 */
export async function testSquareConnection(
  sampleSize = 8,
): Promise<SquareConnectionResult> {
  const warnings: string[] = []

  const merchant = await getMerchant()
  const locations = await getLocations()
  const locationNames = new Map(locations.map((l) => [l.id, l.name ?? l.id]))

  let bookings: SquareBooking[] = []
  try {
    // Connection test: only the last 30 days (a single, in-range request).
    bookings = await getRecentBookings(50, 30)
  } catch (e) {
    warnings.push(
      e instanceof Error
        ? `Bookings could not be read: ${e.message}`
        : 'Bookings could not be read.',
    )
  }

  const sample = bookings.slice(0, sampleSize)
  const summaries = await enrichBookings(sample, locationNames)

  return {
    ok: true,
    apiVersion: SQUARE_VERSION,
    businessName: merchant.businessName,
    merchantCountry: merchant.country,
    locations,
    bookings: summaries,
    totalRecentBookings: bookings.length,
    warnings,
  }
}
