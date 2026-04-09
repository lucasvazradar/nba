import { NextResponse } from 'next/server'
import { getLast10Games } from '@/lib/sportsdata'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('team_id')

  if (!teamId) {
    return NextResponse.json({ error: 'team_id is required' }, { status: 400 })
  }

  try {
    const history = await getLast10Games(parseInt(teamId))
    return NextResponse.json(history)
  } catch (err) {
    console.error('[/api/history]', err)
    return NextResponse.json({ error: 'Failed to fetch team history' }, { status: 502 })
  }
}
