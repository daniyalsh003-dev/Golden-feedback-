'use server'

import {
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
