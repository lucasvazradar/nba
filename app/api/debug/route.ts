import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const OA_KEY = process.env.ODDS_API_KEY ?? ''
  const BETS_KEY = process.env.BETSAPI_KEY ?? ''

  const results: Record<string, unknown> = {}

  // 1. The Odds API — check which bookmakers are actually available for NBA
  try {
    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=eu,us,uk,au&markets=totals`,
      { cache: 'no-store' }
    )
    const data = await r.json()
    results.odds_api_status = r.status
    results.odds_api_remaining = r.headers.get('x-requests-remaining')

    if (Array.isArray(data)) {
      const bkSet = new Set<string>()
      for (const event of data) {
        for (const bm of event.bookmakers ?? []) bkSet.add(bm.key)
      }
      results.odds_api_bookmakers = Array.from(bkSet).sort()
      results.odds_api_has_novibet = bkSet.has('novibet')
      results.odds_api_events = data.length
    } else {
      results.odds_api_raw = JSON.stringify(data).slice(0, 200)
    }
  } catch (e) {
    results.odds_api_error = String(e)
  }

  // 2. BetsAPI — test if key is configured and what sports are available
  if (BETS_KEY) {
    try {
      const r = await fetch(
        `https://api.betsapi.com/v1/bet365/prematch?token=${BETS_KEY}&sport_id=18`, // 18 = basketball
        { cache: 'no-store' }
      )
      const text = await r.text()
      results.betsapi_status = r.status
      results.betsapi_has_nba = text.toLowerCase().includes('nba')
      results.betsapi_preview = text.slice(0, 400)
    } catch (e) {
      results.betsapi_error = String(e)
    }
  } else {
    results.betsapi_status = 'BETSAPI_KEY not set in environment'
    results.betsapi_signup = 'Create free account at betsapi.com to get token'
  }

  return NextResponse.json(results)
}
