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

  // 2. Novibet direct — analisa estrutura do JSON para encontrar eventos NBA
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    Origin: 'https://www.novibet.bet.br',
    Referer: 'https://www.novibet.bet.br/',
  }

  // Testa vários IDs possíveis
  const novibetIds = [6051394, 6680136, 4795953]
  for (const id of novibetIds) {
    try {
      const ts = Date.now()
      const url = `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4324/${id}/?lang=pt-BR&timeZ=E.%20South%20America%20Standard%20Time&oddsR=1&usrGrp=BR&timestamp=${ts}&filterAlias=`
      const r = await fetch(url, { headers: HEADERS, cache: 'no-store' })
      const text = await r.text()
      const key = `novibet_${id}`
      results[`${key}_status`] = r.status
      results[`${key}_bytes`] = text.length
      results[`${key}_preview`] = text.slice(0, 600)

      // Se tiver dados, mostrar as chaves do primeiro elemento
      if (text.length > 10 && (text.startsWith('[') || text.startsWith('{'))) {
        try {
          const parsed = JSON.parse(text)
          const first = Array.isArray(parsed) ? parsed[0] : parsed
          if (first && typeof first === 'object') {
            results[`${key}_top_keys`] = Object.keys(first)
            // Se tiver betViews, mostrar as chaves do primeiro betView
            if (Array.isArray(first.betViews) && first.betViews[0]) {
              results[`${key}_betViews_keys`] = Object.keys(first.betViews[0])
              const bv0 = first.betViews[0]
              // Ver se tem items/events dentro do betView
              for (const k of Object.keys(bv0)) {
                if (Array.isArray(bv0[k]) && bv0[k].length > 0) {
                  results[`${key}_betViews[0].${k}[0]_keys`] = Object.keys(bv0[k][0] ?? {})
                }
              }
            }
          }
        } catch { /* ignore parse errors */ }
      }
    } catch (e) {
      results[`novibet_${id}_error`] = String(e)
    }
  }

  return NextResponse.json(results)
}
