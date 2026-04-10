import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const NV_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Origin: 'https://www.novibet.bet.br',
  Referer: 'https://www.novibet.bet.br/',
}

const ABBR_MAP: Record<string, string[]> = {
  ATL: ['ATL', 'Atlanta'],   BOS: ['BOS', 'Boston'],    BKN: ['BKN', 'Brooklyn'],
  CHA: ['CHA', 'Charlotte'], CHI: ['CHI', 'Chicago'],   CLE: ['CLE', 'Cleveland'],
  DAL: ['DAL', 'Dallas'],    DEN: ['DEN', 'Denver'],    DET: ['DET', 'Detroit'],
  GS:  ['GS', 'Golden State'], HOU: ['HOU', 'Houston'], IND: ['IND', 'Indiana'],
  LAC: ['LAC', 'Clippers'],  LAL: ['LAL', 'Lakers'],    MEM: ['MEM', 'Memphis'],
  MIA: ['MIA', 'Miami'],     MIL: ['MIL', 'Milwaukee'], MIN: ['MIN', 'Minnesota'],
  NO:  ['NO', 'New Orleans'], NY: ['NY', 'New York', 'Knicks'], OKC: ['OKC', 'Oklahoma'],
  ORL: ['ORL', 'Orlando'],   PHI: ['PHI', 'Philadelphia'], PHX: ['PHX', 'Phoenix'],
  POR: ['POR', 'Portland'],  SAC: ['SAC', 'Sacramento'], SA: ['SA', 'San Antonio'],
  TOR: ['TOR', 'Toronto'],   UTA: ['UTA', 'Utah'],      WAS: ['WAS', 'Washington'],
}

function toAbbr(caption: string): string | null {
  const up = caption.toUpperCase()
  for (const [abbr, aliases] of Object.entries(ABBR_MAP)) {
    for (const a of aliases) {
      if (up.includes(a.toUpperCase())) return abbr
    }
  }
  return null
}

function parseLine(s: string): number {
  const m = (s ?? '').match(/[\d]+[,.][\d]+|[\d]+/)
  return m ? parseFloat(m[0].replace(',', '.')) : 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseOdds(markets: any[]) {
  let total = null, h2h = null, spread = null
  for (const mkt of markets ?? []) {
    const sys: string = mkt.betTypeSysname ?? ''
    const items = mkt.betItems ?? []
    if (sys === 'BASKETBALL_MATCH_RESULT_NODRAW' && !h2h) {
      const i1 = items.find((b: any) => b.code === '1')
      const i2 = items.find((b: any) => b.code === '2')
      if (i1?.isAvailable && i2?.isAvailable) h2h = { home: i2.price, away: i1.price }
    }
    if (sys === 'BASKETBALL_MATCH_RESULT_HANDICAP' && !spread) {
      const i1 = items.find((b: any) => b.code === '1')
      const i2 = items.find((b: any) => b.code === '2')
      if (i1?.isAvailable && i2?.isAvailable) {
        const line = parseLine(i1.instanceCaption ?? i1.caption)
        spread = { line, home_odd: i2.price, away_odd: i1.price }
      }
    }
    if (sys === 'BASKETBALL_UNDER_OVER' && !total) {
      const ov = items.find((b: any) => b.code === 'O')
      const un = items.find((b: any) => b.code === 'U')
      if (ov?.isAvailable && un?.isAvailable) {
        const line = parseLine(ov.instanceCaption ?? ov.caption)
        if (line > 150) total = { line, over: ov.price, under: un.price }
      }
    }
  }
  return { total, h2h, spread, _bookmaker: 'novibet_direct' }
}

async function fetchNovibetNBA() {
  const ts = Date.now()
  const url = `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4324/6051394/?lang=pt-BR&timeZ=E.%20South%20America%20Standard%20Time&oddsR=1&usrGrp=BR&timestamp=${ts}&filterAlias=`
  const res = await fetch(url, { headers: NV_HEADERS, cache: 'no-store' })
  const text = await res.text()
  const parsed = JSON.parse(text)
  const pages = Array.isArray(parsed) ? parsed : [parsed]

  const result: Record<string, ReturnType<typeof parseOdds>> = {}

  for (const page of pages) {
    for (const bv of (page?.betViews ?? [])) {
      const ctx: string = (bv?.competitionContextCaption ?? '').toUpperCase()
      if (!ctx.includes('BASQUET') && !ctx.includes('BASKET')) continue
      for (const comp of (bv?.competitions ?? [])) {
        if (!(comp?.caption ?? '').toUpperCase().includes('NBA')) continue
        for (const ev of (comp?.events ?? [])) {
          const ac = ev.additionalCaptions
          if (!ac) continue
          const away = toAbbr(ac.competitor1 ?? '')
          const home = toAbbr(ac.competitor2 ?? '')
          if (!away || !home) continue
          result[`${away}-${home}`] = parseOdds(ev.markets ?? [])
        }
      }
    }
  }
  return result
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  if (searchParams.get('raw')) {
    // Testa múltiplos endpoints para encontrar jogos NBA agendados
    const ts = Date.now()
    const qs = `lang=pt-BR&timeZ=E.%20South%20America%20Standard%20Time&oddsR=1&usrGrp=BR&timestamp=${ts}&filterAlias=`
    const endpoints = [
      // popular (ao vivo / prestes a começar)
      `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4324/6051394/?${qs}`,
      // variações de category path com o ID da NBA
      `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4323/6680136/?${qs}`,
      `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4325/6680136/?${qs}`,
      `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4326/6680136/?${qs}`,
      `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4327/6680136/?${qs}`,
      `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4328/6680136/?${qs}`,
      // sem category path
      `https://www.novibet.bet.br/spt/feed/marketviews/competition/6680136/?${qs}`,
      `https://www.novibet.bet.br/spt/feed/marketviews/competition/v2/6680136/?${qs}`,
      // betcontext direto
      `https://www.novibet.bet.br/spt/feed/betcontext/6680136/?${qs}`,
      // upcoming
      `https://www.novibet.bet.br/spt/feed/upcoming/6680136/?${qs}`,
    ]

    const diag: Record<string, unknown> = {}
    for (const url of endpoints) {
      const key = url.replace('https://www.novibet.bet.br/spt/feed/', '').split('?')[0]
      try {
        const res = await fetch(url, { headers: NV_HEADERS, cache: 'no-store' })
        const text = await res.text()
        const isJson = text.trim().startsWith('[') || text.trim().startsWith('{')
        diag[key] = {
          status: res.status,
          bytes: text.length,
          isJson,
          preview: text.slice(0, 200),
        }
        if (isJson && text.length > 10) {
          const parsed = JSON.parse(text)
          const pages = Array.isArray(parsed) ? parsed : [parsed]
          const sports: string[] = []
          for (const page of pages) {
            for (const bv of (page?.betViews ?? [])) {
              sports.push(`${bv?.competitionContextCaption}(${(bv?.competitions ?? []).map((c: any) => c?.caption).join(',')})`)
            }
          }
          if (sports.length) (diag[key] as any).sports = sports
        }
      } catch (e) {
        diag[key] = { error: String(e) }
      }
    }
    return NextResponse.json(diag)
  }

  try {
    const odds = await fetchNovibetNBA()
    return NextResponse.json({
      events_found: Object.keys(odds).length,
      odds,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
