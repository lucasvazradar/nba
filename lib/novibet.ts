/**
 * Novibet Brazil Internal API Client
 *
 * Endpoint confirmado via Chrome DevTools:
 *   GET https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4324/6051394/
 *       ?lang=pt-BR&timeZ=E.%20South%20America%20Standard%20Time
 *       &oddsR=1&usrGrp=BR&timestamp={Date.now()}&filterAlias=
 *
 * Estrutura da resposta:
 *   Array de páginas → betViews[] (por esporte) → competitions[] → events[]
 *   Cada evento já traz markets[] embutidos — NÃO precisa de chamada extra.
 *
 * Campos do evento:
 *   betContextId  → ID numérico do evento
 *   additionalCaptions.competitor1 → time visitante (ex: "TOR Raptors")
 *   additionalCaptions.competitor2 → time mandante (ex: "MIA Heat")
 *   markets[].betTypeSysname → tipo de mercado
 *   markets[].betItems[].code → "O"=over, "U"=under, "1"=home, "2"=away
 *   markets[].betItems[].instanceCaption → linha (ex: "236,5")
 *   markets[].betItems[].price → odd decimal
 */

import type { OddsData, AlternateTotalLine } from '@/types'

const NOVIBET_BASE = 'https://www.novibet.bet.br'
// Página popular que contém todos os esportes — inclui NBA em betViews
const LISTING_URL = `${NOVIBET_BASE}/spt/feed/marketviews/location/v2/4324/6051394/`

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Origin: NOVIBET_BASE,
  Referer: `${NOVIBET_BASE}/`,
}

function qParams(): string {
  return new URLSearchParams({
    lang: 'pt-BR',
    timeZ: 'E. South America Standard Time',
    oddsR: '1',
    usrGrp: 'BR',
    timestamp: String(Date.now()),
    filterAlias: '',
  }).toString()
}

// ─── Abreviações dos times NBA ────────────────────────────────────────────────

// Novibet usa: "TOR Raptors", "MIA Heat", "GS Warriors", etc.
const ABBR_TO_NOVIBET: Record<string, string[]> = {
  ATL: ['ATL', 'Atlanta'],
  BOS: ['BOS', 'Boston'],
  BKN: ['BKN', 'Brooklyn'],
  CHA: ['CHA', 'Charlotte'],
  CHI: ['CHI', 'Chicago'],
  CLE: ['CLE', 'Cleveland'],
  DAL: ['DAL', 'Dallas'],
  DEN: ['DEN', 'Denver'],
  DET: ['DET', 'Detroit'],
  GS:  ['GS', 'Golden State'],
  HOU: ['HOU', 'Houston'],
  IND: ['IND', 'Indiana'],
  LAC: ['LAC', 'Clippers'],
  LAL: ['LAL', 'Lakers'],
  MEM: ['MEM', 'Memphis'],
  MIA: ['MIA', 'Miami'],
  MIL: ['MIL', 'Milwaukee'],
  MIN: ['MIN', 'Minnesota'],
  NO:  ['NO', 'New Orleans'],
  NY:  ['NY', 'New York', 'Knicks'],
  OKC: ['OKC', 'Oklahoma'],
  ORL: ['ORL', 'Orlando'],
  PHI: ['PHI', 'Philadelphia'],
  PHX: ['PHX', 'Phoenix'],
  POR: ['POR', 'Portland'],
  SAC: ['SAC', 'Sacramento'],
  SA:  ['SA', 'San Antonio'],
  TOR: ['TOR', 'Toronto'],
  UTA: ['UTA', 'Utah'],
  WAS: ['WAS', 'Washington'],
}

function captionToAbbr(caption: string): string | null {
  const up = caption.toUpperCase()
  for (const [abbr, aliases] of Object.entries(ABBR_TO_NOVIBET)) {
    for (const alias of aliases) {
      if (up.includes(alias.toUpperCase())) return abbr
    }
  }
  return null
}

// ─── Parser de linha ──────────────────────────────────────────────────────────

function parseLine(caption: string): number {
  // "236,5" → 236.5 | "122,5" → 122.5
  const m = caption.match(/[\d]+[,.][\d]+|[\d]+/)
  return m ? parseFloat(m[0].replace(',', '.')) : 0
}

// ─── Parser de mercados ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMarkets(markets: any[]): OddsData {
  const odds: OddsData = {}
  const altTotalsMap = new Map<number, { over: number; under: number }>()

  for (const market of markets) {
    const sysname: string = market.betTypeSysname ?? ''
    const items = market.betItems ?? []

    // ── Moneyline ──
    if (sysname === 'BASKETBALL_MATCH_RESULT_NODRAW') {
      const home = items.find((b: any) => b.code === '1')
      const away = items.find((b: any) => b.code === '2')
      if (home?.isAvailable && away?.isAvailable) {
        // code "1" = competitor1 = visitante (away), code "2" = competitor2 = mandante (home)
        odds.h2h = { home: away.price, away: home.price }
      }
    }

    // ── Handicap / Spread ──
    if (sysname === 'BASKETBALL_MATCH_RESULT_HANDICAP') {
      const item1 = items.find((b: any) => b.code === '1')
      const item2 = items.find((b: any) => b.code === '2')
      if (item1?.isAvailable && item2?.isAvailable && !odds.spread) {
        const line = parseLine(item1.instanceCaption ?? item1.caption)
        odds.spread = { line, home_odd: item2.price, away_odd: item1.price }
      }
    }

    // ── Total de pontos (jogo completo) ──
    if (sysname === 'BASKETBALL_UNDER_OVER') {
      const over = items.find((b: any) => b.code === 'O')
      const under = items.find((b: any) => b.code === 'U')
      if (over?.isAvailable && under?.isAvailable && !odds.total) {
        const line = parseLine(over.instanceCaption ?? over.caption)
        if (line > 150) { // garante que é total do jogo, não de 1º quarto
          odds.total = { line, over: over.price, under: under.price }
        }
      }
    }

    // ── Linhas alternativas de total ──
    if (
      sysname === 'BASKETBALL_UNDER_OVER_ADDITIONAL' ||
      sysname === 'BASKETBALL_UNDER_OVER_ALTERNATE' ||
      sysname.includes('ALTERNATE') ||
      sysname.includes('ADDITIONAL')
    ) {
      for (const item of items) {
        if (!item.isAvailable) continue
        const line = parseLine(item.instanceCaption ?? item.caption)
        if (line < 150) continue
        const entry = altTotalsMap.get(line) ?? { over: 0, under: 0 }
        if (item.code === 'O') entry.over = item.price
        if (item.code === 'U') entry.under = item.price
        altTotalsMap.set(line, entry)
      }
    }
  }

  if (altTotalsMap.size > 0) {
    const altLines: AlternateTotalLine[] = []
    for (const [line, { over, under }] of Array.from(altTotalsMap)) {
      if (over > 0 && under > 0) altLines.push({ line, over, under })
    }
    if (altLines.length > 0) {
      odds.alternate_totals = altLines.sort((a, b) => a.line - b.line)
    }
  }

  return odds
}

// ─── Busca e extrai todos os jogos NBA com odds ───────────────────────────────

/**
 * Busca os jogos NBA de hoje na Novibet e retorna mapa "AWAY-HOME" → OddsData.
 * Os mercados já vêm embutidos no evento — sem chamada extra por jogo.
 */
export async function getAllNovibetOdds(): Promise<Map<string, OddsData>> {
  const ts = Date.now()
  const url = `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4324/6051394/?lang=pt-BR&timeZ=E.%20South%20America%20Standard%20Time&oddsR=1&usrGrp=BR&timestamp=${ts}&filterAlias=`
  console.log(`[Novibet] Fetching odds...`)

  let pages: any[]
  try {
    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' })
    if (!res.ok) {
      console.warn(`[Novibet] HTTP ${res.status}`)
      return new Map()
    }
    const text = await res.text()
    console.log(`[Novibet] Response: ${res.status}, ${text.length} bytes`)
    const parsed = JSON.parse(text)
    pages = Array.isArray(parsed) ? parsed : [parsed]
  } catch (e) {
    console.error(`[Novibet] Fetch error: ${e}`)
    return new Map()
  }

  const map = new Map<string, OddsData>()
  console.log(`[Novibet] Pages: ${pages.length}`)

  for (const page of pages) {
    const betViews = page?.betViews ?? []
    console.log(`[Novibet] betViews count: ${betViews.length}`)

    for (const bv of betViews) {
      const ctx: string = bv?.competitionContextCaption ?? ''
      const ctxUp = ctx.toUpperCase()
      console.log(`[Novibet] betView: "${ctx}" isBasket=${ctxUp.includes('BASQUET') || ctxUp.includes('BASKET')}`)

      if (!ctxUp.includes('BASQUET') && !ctxUp.includes('BASKET')) continue

      for (const comp of (bv?.competitions ?? [])) {
        const compName: string = comp?.caption ?? ''
        const isNBA = compName.toUpperCase().includes('NBA')
        console.log(`[Novibet] competition: "${compName}" isNBA=${isNBA} events=${comp?.events?.length ?? 0}`)
        if (!isNBA) continue

        for (const ev of (comp?.events ?? [])) {
          const id: number = ev.betContextId
          const ac = ev.additionalCaptions
          if (!id || !ac) continue

          const c1: string = ac.competitor1 ?? ''
          const c2: string = ac.competitor2 ?? ''
          const awayAbbr = captionToAbbr(c1)
          const homeAbbr = captionToAbbr(c2)
          console.log(`[Novibet] Event ${id}: "${c1}" vs "${c2}" → away=${awayAbbr} home=${homeAbbr}`)

          if (!awayAbbr || !homeAbbr) continue

          const odds = parseMarkets(ev.markets ?? [])
          odds._bookmaker = 'novibet_direct'
          const key = `${awayAbbr}-${homeAbbr}`
          map.set(key, odds)
          console.log(`[Novibet] ${key} — total: ${odds.total ? `${odds.total.line} over=${odds.total.over}` : 'NONE'}`)
        }
      }
    }
  }

  console.log(`[Novibet] Resultado final: ${map.size} jogos NBA`)
  return map
}

/**
 * Compat: retorna mapa de "AWAY-HOME" → eventId (betContextId).
 * Usado apenas pela rota /api/novibet para diagnóstico.
 */
export async function getNovibetEventMap(): Promise<Map<string, number>> {
  const oddsMap = await getAllNovibetOdds()
  // getNovibetEventMap não é mais necessário separado — extraímos do mesmo fetch
  // Retorna um mapa vazio de IDs (IDs não são necessários para a análise)
  const map = new Map<string, number>()
  for (const key of Array.from(oddsMap.keys())) map.set(key, 0)
  return map
}

/**
 * Compat: não precisa mais de chamada separada por evento.
 * Mantido para não quebrar /api/novibet?event_id=...
 */
export async function getNovibetMarkets(eventId: number): Promise<null> {
  console.log(`[Novibet] getNovibetMarkets(${eventId}) — mercados já vêm no listing, use getAllNovibetOdds()`)
  return null
}
