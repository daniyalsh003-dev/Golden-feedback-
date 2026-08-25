import 'server-only'

// Toronto Golden Barbers Google Place ID.
const PLACE_ID = 'ChIJu6Wo63E1K4gRfBplsKlNwV8'

// Emergency fallback ONLY if the Places API is unavailable: a Place ID-based
// Google Maps link that still opens the correct listing (and prefers the Maps
// app). This is deliberately NOT the forbidden /maps/search/ or
// search.google.com/local/writereview forms.
const FALLBACK_REVIEW_URL = `https://www.google.com/maps/place/?q=place_id:${PLACE_ID}`

interface PlaceResult {
  displayName?: { text?: string }
  googleMapsLinks?: { reviewsUri?: string }
}

export interface ResolvedReview {
  /** The URL to send a happy (5-star) customer to. */
  url: string
  /** The Google-reported business name (used to verify the Place ID). */
  placeName: string | null
  /** Whether we got the official reviewsUri or fell back. */
  source: 'reviewsUri' | 'fallback'
}

/**
 * Resolve the official Google Maps "Reviews" deep link for Toronto Golden
 * Barbers via the Places API (New) `googleMapsLinks.reviewsUri` field.
 *
 * The GOOGLE_MAPS_API_KEY is read here on the SERVER only and is never exposed
 * to the client — callers pass just the resolved URL down to the browser. The
 * Places response is cached (24h) so the API is not hit on every 5-star.
 */
export async function getGoogleReviewUrl(): Promise<ResolvedReview> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) {
    return { url: FALLBACK_REVIEW_URL, placeName: null, source: 'fallback' }
  }
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${PLACE_ID}`,
      {
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'id,displayName,googleMapsLinks',
        },
        next: { revalidate: 86400, tags: ['google-review'] },
      },
    )
    if (!res.ok) {
      return { url: FALLBACK_REVIEW_URL, placeName: null, source: 'fallback' }
    }
    const data = (await res.json()) as PlaceResult
    const reviewsUri = data.googleMapsLinks?.reviewsUri
    const placeName = data.displayName?.text ?? null
    if (!reviewsUri) {
      return { url: FALLBACK_REVIEW_URL, placeName, source: 'fallback' }
    }
    return { url: reviewsUri, placeName, source: 'reviewsUri' }
  } catch {
    return { url: FALLBACK_REVIEW_URL, placeName: null, source: 'fallback' }
  }
}
