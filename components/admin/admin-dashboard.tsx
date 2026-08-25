'use client'

import { getCustomerDetail, getCustomers, getFeedback } from '@/app/admin/actions'
import type {
  AutomationOverview,
  CustomerDetail,
  CustomerSummary,
  DailyAppointmentsResult,
  EnrichedFeedback,
  FeedbackFilters,
  FeedbackStats,
  FollowUpStatus,
} from '@/lib/follow-up'
import { normalizePhone } from '@/lib/phone'
import { cn } from '@/lib/utils'
import { CalendarDays, MessageSquare, Phone, Search, Star, TriangleAlert } from 'lucide-react'
import { useCallback, useMemo, useState, useTransition } from 'react'
import { AdminHeader } from './admin-header'
import { CustomerDetailDrawer } from './customer-detail'
import { DailyAppointments } from './daily-appointments'
import { FeedbackDetail } from './feedback-detail'
import { formatDate, SmsPill, StarRow, StatusBadge } from './shared'
import { AutomationPanel } from './automation-panel'
import { ResetPanel } from './reset-panel'

type StatusFilter = FollowUpStatus | 'all'
type RatingFilter = number | 'all'
type Tab = 'feedback' | 'customers' | 'daily'

export function AdminDashboard({
  adminName,
  initialFeedback,
  initialCustomers,
  stats,
  automation,
  initialDaily,
}: {
  adminName: string
  initialFeedback: EnrichedFeedback[]
  initialCustomers: CustomerSummary[]
  stats: FeedbackStats
  automation: AutomationOverview
  initialDaily: DailyAppointmentsResult
}) {
  const [tab, setTab] = useState<Tab>('feedback')
  const [items, setItems] = useState<EnrichedFeedback[]>(initialFeedback)
  const [customers] = useState<CustomerSummary[]>(initialCustomers)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [rating, setRating] = useState<RatingFilter>('all')
  const [contactOnly, setContactOnly] = useState(false)
  const [selected, setSelected] = useState<EnrichedFeedback | null>(null)
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(
    null,
  )
  const [pending, startTransition] = useTransition()
  const [loadingCustomer, startCustomerTransition] = useTransition()

  const refetch = useCallback((next: FeedbackFilters) => {
    startTransition(async () => {
      const data = await getFeedback(next)
      setItems(data)
    })
  }, [])

  function applyStatus(next: StatusFilter) {
    setStatus(next)
    refetch({ status: next, rating, contactOnly })
  }
  function applyRating(next: RatingFilter) {
    setRating(next)
    refetch({ status, rating: next, contactOnly })
  }
  function applyContactOnly(next: boolean) {
    setContactOnly(next)
    refetch({ status, rating, contactOnly: next })
  }

  function handleUpdated(updated: EnrichedFeedback) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    setSelected(updated)
  }

  function openCustomer(id: string) {
    startCustomerTransition(async () => {
      const detail = await getCustomerDetail(id)
      if (detail) setCustomerDetail(detail)
    })
  }

  // Re-fetch the currently open customer after a messaging action, without
  // showing the full-drawer loading state.
  function refreshCustomer() {
    setCustomerDetail((current) => {
      if (current) {
        void getCustomerDetail(current.id).then((detail) => {
          if (detail) setCustomerDetail(detail)
        })
      }
      return current
    })
  }

  // Client-side search over the already-loaded customer database — matches
  // first/last/full name and phone (formatting-insensitive). No Square calls,
  // no per-keystroke fetching.
  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    const qDigits = q.replace(/\D/g, '')
    return customers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true
      if (qDigits) {
        const raw = (c.phone ?? '').replace(/\D/g, '')
        const norm = (normalizePhone(c.phone) ?? '').replace(/\D/g, '')
        if (raw.includes(qDigits) || norm.includes(qDigits)) return true
      }
      return false
    })
  }, [customers, query])

  const statCards = useMemo(
    () => [
      {
        label: 'Total feedback',
        value: stats.total.toString(),
        icon: MessageSquare,
      },
      {
        label: 'Average rating',
        value: stats.averageRating.toFixed(1),
        icon: Star,
      },
      {
        label: 'Needs attention',
        value: stats.needsAttention.toString(),
        icon: TriangleAlert,
      },
      {
        label: 'Contact requests',
        value: stats.contactRequests.toString(),
        icon: Phone,
      },
    ],
    [stats],
  )

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-6 sm:px-6">
      <AdminHeader adminName={adminName} />

      {/* Square automation — one card, pinned near the top */}
      <AutomationPanel initialOverview={automation} />

      {/* Stats */}
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <s.icon className="size-4 text-gold" />
            </div>
            <p className="mt-2 font-serif text-2xl text-foreground">
              {s.value}
            </p>
          </div>
        ))}
      </section>

      {/* Tabs */}
      <div className="mt-6 flex items-center gap-1 border-b border-border">
        {(
          [
            ['feedback', 'Feedback'],
            ['customers', `Customers (${customers.length})`],
            ['daily', 'Daily Appointments'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === value
                ? 'border-gold text-gold'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'feedback' ? (
        <>
          {/* Filters */}
          <section className="mt-6 flex flex-wrap items-center gap-2">
            <FilterGroup
              label="Status"
              options={[
                { value: 'all', label: 'All' },
                { value: 'new', label: 'New' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'resolved', label: 'Resolved' },
              ]}
              value={status}
              onChange={(v) => applyStatus(v as StatusFilter)}
            />
            <FilterGroup
              label="Rating"
              options={[
                { value: 'all', label: 'All' },
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
                { value: '5', label: '5' },
              ]}
              value={rating === 'all' ? 'all' : String(rating)}
              onChange={(v) => applyRating(v === 'all' ? 'all' : Number(v))}
            />
            <button
              onClick={() => applyContactOnly(!contactOnly)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                contactOnly
                  ? 'border-gold/40 bg-gold/15 text-gold'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              Contact requested
            </button>
          </section>

          {/* Feedback list */}
          <section
            className={cn(
              'mt-5 flex flex-col gap-3 transition-opacity',
              pending && 'opacity-50',
            )}
          >
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
                No feedback matches these filters yet.
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-gold/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <StarRow rating={item.rating} />
                      <StatusBadge status={item.followUpStatus} />
                      {item.wantsContact && (
                        <span className="inline-flex items-center gap-1 text-xs text-gold">
                          <Phone className="size-3" />
                          Contact
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {item.customer?.name ??
                        (item.barberName
                          ? `Barber: ${item.barberName}`
                          : 'Anonymous')}
                      {item.appointment?.serviceName && (
                        <span className="font-normal text-muted-foreground">
                          {' · '}
                          {item.appointment.serviceName}
                        </span>
                      )}
                    </p>
                    <p className="line-clamp-1 max-w-md text-sm text-muted-foreground">
                      {item.comments || 'No comment left'}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </p>
                </button>
              ))
            )}
          </section>
        </>
      ) : tab === 'daily' ? (
        <DailyAppointments
          initial={initialDaily}
          onOpenCustomer={openCustomer}
        />
      ) : (
        /* Customers list */
        <section
          className={cn(
            'mt-6 flex flex-col gap-3 transition-opacity',
            loadingCustomer && 'opacity-50',
          )}
        >
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or phone number"
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-gold/40"
            />
          </div>

          {customers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
              No customers captured yet. Once automation is active, new Square
              bookings will appear here automatically.
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
              No customers match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filteredCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => openCustomer(c.id)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-gold/40"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {c.name}
                    </span>
                    <SmsPill eligible={c.smsEligible} reason={c.smsReason} />
                    {c.latestRating !== null && (
                      <span className="inline-flex items-center gap-1 text-xs text-gold">
                        <Star className="size-3 fill-current" />
                        {c.latestRating}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.phone ?? 'No phone'} · {c.appointmentsSinceActivation}{' '}
                    appointment
                    {c.appointmentsSinceActivation === 1 ? '' : 's'} ·{' '}
                    {c.feedbackCount} review
                    {c.feedbackCount === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {c.lastVisitAt ? formatDate(c.lastVisitAt) : '—'}
                </p>
              </button>
            ))
          )}
        </section>
      )}

      <ResetPanel />

      {selected && (
        <FeedbackDetail
          item={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onOpenCustomer={(id) => {
            setSelected(null)
            openCustomer(id)
          }}
        />
      )}

      {customerDetail && (
        <CustomerDetailDrawer
          customer={customerDetail}
          loading={loadingCustomer}
          onClose={() => setCustomerDetail(null)}
          onRefresh={refreshCustomer}
        />
      )}
    </main>
  )
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              value === o.value
                ? 'border-gold/40 bg-gold/15 text-gold'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
