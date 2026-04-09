import { NextResponse } from 'next/server'
import { getNovibetOdds } from '@/lib/oddsapi'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id') ?? undefined

  try {
    const odds = await getNovibetOdds()
    return NextResponse.json(odds)
  } catch (err) {
    console.error('[/api/odds]', err)
    return NextResponse.json({ error: 'odds_unavailable' }, { status: 502 })
  }
}
