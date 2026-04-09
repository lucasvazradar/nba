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

  // Analisa estrutura do 6051394 (que tem dados)
  try {
    const ts = Date.now()
    const url = `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4324/6051394/?lang=pt-BR&timeZ=E.%20South%20America%20Standard%20Time&oddsR=1&usrGrp=BR&timestamp=${ts}&filterAlias=`
    const r = await fetch(url, { headers: HEADERS, cache: 'no-store' })
    const text = await r.text()
    results.novibet_status = r.status
    results.novibet_bytes = text.length

    if (text.length > 10) {
      const parsed = JSON.parse(text)
      const pages = Array.isArray(parsed) ? parsed : [parsed]

      // Listar TODOS os betViews e competitions para entender a estrutura
      const betViewSummary: Record<string, string[]> = {}

      for (const page of pages) {
        for (const bv of (page?.betViews ?? [])) {
          const ctx: string = bv?.competitionContextCaption ?? '(sem caption)'
          const comps: string[] = (bv?.competitions ?? []).map((c: Record<string, unknown>) => String(c?.caption ?? ''))
          betViewSummary[ctx] = comps
        }
      }

      results.novibet_betViews = betViewSummary

      // Para cada competition de basquete, mostrar chaves e valores do primeiro evento
      for (const page of pages) {
        for (const bv of (page?.betViews ?? [])) {
          const ctx: string = (bv?.competitionContextCaption ?? '').toUpperCase()
          if (!ctx.includes('BASQUET') && !ctx.includes('BASKET') && !ctx.includes('NBA')) continue
          for (const comp of (bv?.competitions ?? [])) {
            const evts = (comp?.events ?? [])
            if (evts.length > 0) {
              results[`nba_comp_${comp?.caption}_event0_keys`] = Object.keys(evts[0])
              results[`nba_comp_${comp?.caption}_event0_raw`] = evts[0]
            }
          }
        }
      }
    }
  } catch (e) {
    results.novibet_error = String(e)
  }

  return NextResponse.json(results)
}
