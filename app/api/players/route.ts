import { NextResponse } from 'next/server'
import { getPlayerStatsByDate, getPlayerProjections } from '@/lib/sportsdata'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  try {
    const [stats, projections] = await Promise.all([
      getPlayerStatsByDate(date),
      getPlayerProjections(date),
    ])
    return NextResponse.json({ stats, projections })
  } catch (err) {
    console.error('[/api/players]', err)
    return NextResponse.json({ error: 'Failed to fetch player data' }, { status: 502 })
  }
}
