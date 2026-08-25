import type { LucideIcon } from 'lucide-react'
import {
  Armchair,
  CalendarDays,
  CircleDollarSign,
  Clock,
  Handshake,
  MoreHorizontal,
  Scissors,
  Sparkles,
  Star,
} from 'lucide-react'

/**
 * Selectable "what could we have done better?" categories.
 * `id` is the stable key stored with each submission; `label` is display copy.
 */
export interface IssueCategory {
  id: string
  label: string
  icon: LucideIcon
}

export const ISSUE_CATEGORIES: IssueCategory[] = [
  { id: 'barber_service', label: 'My Barber / Service', icon: Scissors },
  { id: 'booking', label: 'Booking & Appointment', icon: CalendarDays },
  { id: 'wait_time', label: 'Wait Time', icon: Clock },
  { id: 'atmosphere', label: 'Shop Vibe & Atmosphere', icon: Armchair },
  { id: 'cleanliness', label: 'Cleanliness', icon: Sparkles },
  { id: 'price_value', label: 'Price / Value', icon: CircleDollarSign },
  { id: 'customer_service', label: 'Customer Service', icon: Handshake },
  { id: 'overall', label: 'Overall Experience', icon: Star },
  { id: 'something_else', label: 'Something Else', icon: MoreHorizontal },
]

/**
 * Customer / appointment context. Populated from Square Appointments in a
 * future integration; all fields optional so the form works standalone today.
 */
export interface CustomerContext {
  name?: string
  email?: string
  phone?: string
}

export interface AppointmentContext {
  appointmentId?: string
  barberId?: string
  serviceName?: string
  startAt?: string
}

/** Everything we persist for a single internal (1–4 star) feedback entry. */
export interface FeedbackSubmission {
  rating: number
  issueCategories: string[]
  barberName: string
  comments: string
  managerContactRequested: boolean
  contactInfo: string | null
  customer: CustomerContext | null
  appointment: AppointmentContext | null
  submittedAt: string
}

/**
 * Persist a feedback submission to the database via the public feedback API.
 * `customer` / `appointment` context is sent along for future Square
 * Appointments enrichment; the server currently stores the core fields.
 */
export async function submitFeedback(
  submission: FeedbackSubmission,
): Promise<void> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(submission),
  })
  if (!res.ok) {
    throw new Error('Failed to submit feedback')
  }
}
