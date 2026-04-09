import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const OA_KEY = process.env.ODDS_API_KEY ?? ''

  const results: Record<string, unknown> = {}

  try {
    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=eu,us,uk,au&markets=totals`,
      { cache: 'no-store' }
    )
    const text = await r.text()
    results.odds_status = r.status
    results.odds_preview = text.slice(0, 800)
    results.has_novibet = text.includes('"novibet"')
    results.remaining = r.headers.get('x-requests-remaining')
  } catch (e) {
    results.odds_error = String(e)
  }

  return NextResponse.json(results)
}
