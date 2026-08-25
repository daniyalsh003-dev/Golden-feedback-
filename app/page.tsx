import { GoldenFeedback } from '@/components/golden-feedback'
import { getGoogleReviewUrl } from '@/lib/google-review'

export default async function Page() {
  const { url } = await getGoogleReviewUrl()
  return <GoldenFeedback reviewUrl={url} />
}
