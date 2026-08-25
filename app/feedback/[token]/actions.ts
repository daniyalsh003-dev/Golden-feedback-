'use server'

import {
  consumeGoogleReview,
  submitTokenFeedback,
  type TokenSubmitResult,
} from '@/lib/feedback-system'

export async function submitTokenFeedbackAction(
  token: string,
  input: {
    rating: number
    issueCategories?: string[]
    comments?: string | null
    wantsContact?: boolean
    contactInfo?: string | null
  },
): Promise<TokenSubmitResult> {
  const rating = Number(input.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Invalid rating')
  }

  const issueCategories = Array.isArray(input.issueCategories)
    ? input.issueCategories
        .filter((c) => typeof c === 'string')
        .slice(0, 20)
    : []

  const wantsContact = Boolean(input.wantsContact)
  const contactInfo =
    wantsContact && typeof input.contactInfo === 'string'
      ? input.contactInfo.trim().slice(0, 500) || null
      : null

  const comments =
    typeof input.comments === 'string' && input.comments.trim()
      ? input.comments.trim().slice(0, 4000)
      : null

  return submitTokenFeedback(token, {
    rating,
    issueCategories,
    comments,
    wantsContact,
    contactInfo,
  })
}

/**
 * Mark the one-time Google review action for this link as used. Invoked by the
 * 5-star screen when the customer taps the review button or when the 6s
 * auto-redirect fires — whichever comes first. Awaited before navigation so
 * the consumed state reliably persists.
 */
export async function consumeGoogleReviewAction(
  token: string,
): Promise<{ ok: boolean }> {
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false }
  }
  await consumeGoogleReview(token.trim())
  return { ok: true }
}
