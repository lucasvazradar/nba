import { NextResponse } from 'next/server'
import { getGamesByDate } from '@/lib/sportsdata'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  try {
    const games = await getGamesByDate(date)
    return NextResponse.json(games)
  } catch (err) {
    console.error('[/api/games]', err)
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 502 })
  }
}
