import { db } from '@/lib/db'
import { feedback } from '@/lib/db/schema'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate rating server-side.
    const rating = Number(body?.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
    }

    const issueCategories = Array.isArray(body?.issueCategories)
      ? body.issueCategories.filter((c: unknown) => typeof c === 'string').slice(0, 20)
      : []

    const wantsContact = Boolean(body?.managerContactRequested)
    const contactInfo =
      wantsContact && typeof body?.contactInfo === 'string'
        ? body.contactInfo.trim().slice(0, 500) || null
        : null

    await db.insert(feedback).values({
      rating,
      issueCategories,
      barberName:
        typeof body?.barberName === 'string' && body.barberName.trim()
          ? body.barberName.trim().slice(0, 200)
          : null,
      comments:
        typeof body?.comments === 'string' && body.comments.trim()
          ? body.comments.trim().slice(0, 4000)
          : null,
      wantsContact,
      contactInfo,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] feedback insert failed', error)
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  }
}
