import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const OA_KEY = process.env.ODDS_API_KEY ?? ''
  const results: Record<string, unknown> = {}

  // 1. The Odds API — check which bookmakers are available for NBA
  try {
    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=us,eu,uk,au&markets=totals`,
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

  // 2. Novibet direct — check competition listing endpoint
  try {
    const ts = Date.now()
    const novibetUrl = `https://www.novibet.bet.br/spt/feed/marketviews/event/6051394?lang=pt-BR&timeZ=E.%20South%20America%20Standard%20Time&oddsR=1&usrGrp=BR&timestamp=${ts}&filterAlias=`
    const r = await fetch(novibetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        Origin: 'https://www.novibet.bet.br',
        Referer: 'https://www.novibet.bet.br/',
      },
      cache: 'no-store',
    })
    const text = await r.text()
    results.novibet_direct_status = r.status
    results.novibet_direct_content_type = r.headers.get('content-type')
    results.novibet_direct_size_bytes = text.length
    results.novibet_direct_preview = text.slice(0, 400)
    results.novibet_direct_is_json = text.trim().startsWith('{') || text.trim().startsWith('[')
  } catch (e) {
    results.novibet_direct_error = String(e)
  }

  return NextResponse.json(results)
}
