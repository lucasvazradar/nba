/**
 * Novibet Brazil Internal API Client
 *
 * Endpoint discovered via Chrome DevTools (Network tab on novibet.bet.br):
 *   GET https://www.novibet.bet.br/spt/feed/marketviews/event/{categoryId}/{eventId}
 *       ?lang=pt-BR&timeZ=E.%20South%20America%20Standard%20Time
 *       &oddsR=1&usrGrp=BR&timestamp={Date.now()}&filterAlias=
 *
 * Response: { marketSysname, betItems: [{ id, caption, price, isAvailable }] }
 *
 * NBA competition ID: 6051394 (returns all today's NBA events)
 * Category path for per-market endpoint: 4324
 */

import type { OddsData, AlternateTotalLine } from '@/types'

const NOVIBET_BASE = 'https://www.novibet.bet.br'
// ID da competição NBA (do browser URL: /popular/4795953/nba/nba/6680136)
const NBA_COMPETITION_ID = 6680136
// Fallback: popular page ID (contém todos os esportes misturados)
const POPULAR_PAGE_ID = 6051394
// Used in the per-event-market URL: /spt/feed/marketviews/event/4324/{eventId}
const NBA_CATEGORY_PATH = 4324

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Origin: NOVIBET_BASE,
  Referer: `${NOVIBET_BASE}/`,
}

function qParams(extra: Record<string, string> = {}): string {
  const base = {
    lang: 'pt-BR',
    timeZ: 'E. South America Standard Time',
    oddsR: '1',
    usrGrp: 'BR',
    timestamp: String(Date.now()),
    filterAlias: '',
  }
  return new URLSearchParams({ ...base, ...extra }).toString()
}

// ─── Team name normalisation ───────────────────────────────────────────────────

// Novibet captions: "TOR Raptors", "MIA Heat", "GS Warriors", etc.
// Some use full names, some abbreviated. We normalise both.
const ABBR_TO_NOVIBET: Record<string, string[]> = {
  ATL: ['ATL', 'Atlanta'],
  BOS: ['BOS', 'Boston'],
  BKN: ['BKN', 'Brooklyn', 'Net'],
  CHA: ['CHA', 'Charlotte'],
  CHI: ['CHI', 'Chicago'],
  CLE: ['CLE', 'Cleveland'],
  DAL: ['DAL', 'Dallas'],
  DEN: ['DEN', 'Denver'],
  DET: ['DET', 'Detroit'],
  GS:  ['GS', 'Golden State', 'Warriors'],
  HOU: ['HOU', 'Houston'],
  IND: ['IND', 'Indiana'],
  LAC: ['LAC', 'Clippers'],
  LAL: ['LAL', 'Lakers', 'L.A. Lakers', 'Los Angeles Lakers'],
  MEM: ['MEM', 'Memphis'],
  MIA: ['MIA', 'Miami'],
  MIL: ['MIL', 'Milwaukee'],
  MIN: ['MIN', 'Minnesota'],
  NO:  ['NO', 'New Orleans', 'Pelicans'],
  NY:  ['NY', 'New York', 'Knicks'],
  OKC: ['OKC', 'Oklahoma City', 'Oklahoma'],
  ORL: ['ORL', 'Orlando'],
  PHI: ['PHI', 'Philadelphia', '76ers'],
  PHX: ['PHX', 'Phoenix', 'Suns'],
  POR: ['POR', 'Portland'],
  SAC: ['SAC', 'Sacramento'],
  SA:  ['SA', 'San Antonio', 'Spurs'],
  TOR: ['TOR', 'Toronto'],
  UTA: ['UTA', 'Utah'],
  WAS: ['WAS', 'Washington'],
}

/**
 * Returns the team abbreviation (ATL, BOS, etc.) for a Novibet team caption.
 * Novibet uses "TOR Raptors", "MIA Heat", "GS Warriors", etc.
 */
function novibetCaptionToAbbr(caption: string): string | null {
  const up = caption.toUpperCase()
  for (const [abbr, aliases] of Object.entries(ABBR_TO_NOVIBET)) {
    for (const alias of aliases) {
      if (up.includes(alias.toUpperCase())) return abbr
    }
  }
  return null
}

// ─── Raw API types ─────────────────────────────────────────────────────────────

interface NovibetBetItem {
  id: string
  code: string
  caption: string
  price: number
  oddsText: string
  isAvailable: boolean
}

interface NovibetMarket {
  marketId: number
  marketEntityId: number
  marketSysname: string
  caption?: string
  betItems: NovibetBetItem[]
}

interface NovibetEvent {
  eventId: number
  caption: string         // "TOR Raptors - MIA Heat"
  startDate?: string
  markets?: NovibetMarket[]
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      cache: 'no-store',
      // Next.js: no caching on this fetch
      next: { revalidate: 0 },
    } as RequestInit)

    if (!res.ok) {
      console.warn(`[Novibet] HTTP ${res.status} for ${url.slice(0, 120)}`)
      return null
    }

    const text = await res.text()
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.warn(`[Novibet] Non-JSON response for ${url.slice(0, 120)}: ${text.slice(0, 80)}`)
      return null
    }

    return JSON.parse(text) as T
  } catch (e) {
    console.error(`[Novibet] Fetch error for ${url.slice(0, 120)}: ${e}`)
    return null
  }
}

// ─── Event listing ─────────────────────────────────────────────────────────────

/**
 * Fetches all today's NBA events from Novibet.
 * Returns a map of "AWAY-HOME" → novibet eventId.
 */
export async function getNovibetEventMap(): Promise<Map<string, number>> {
  // Popular page (6051394) tem todos esportes mas inclui NBA — NBA ID direto (6680136) retorna vazio
  const urls = [
    `${NOVIBET_BASE}/spt/feed/marketviews/location/v2/${NBA_CATEGORY_PATH}/${POPULAR_PAGE_ID}/?${qParams()}`,
    `${NOVIBET_BASE}/spt/feed/marketviews/location/v2/${NBA_CATEGORY_PATH}/${NBA_COMPETITION_ID}/?${qParams()}`,
  ]

  let events: NovibetEvent[] = []

  for (const url of urls) {
    console.log(`[Novibet] Fetching from: ${url.slice(0, 130)}`)
    const raw = await fetchJSON<unknown>(url)
    if (!raw) continue
    events = extractEvents(raw)
    if (events.length > 0) {
      console.log(`[Novibet] Found ${events.length} NBA events from ${url.slice(60, 100)}`)
      break
    }
    console.log(`[Novibet] No NBA events from that URL, trying next...`)
  }

  const map = new Map<string, number>()

  for (const ev of events) {
    // Caption format: "TOR Raptors - MIA Heat" or "TOR Raptors x MIA Heat"
    const parts = ev.caption.split(/\s[-xX–]\s/)
    if (parts.length < 2) {
      console.warn(`[Novibet] Could not parse event caption: "${ev.caption}"`)
      continue
    }
    const awayAbbr = novibetCaptionToAbbr(parts[0].trim())
    const homeAbbr = novibetCaptionToAbbr(parts[1].trim())
    if (awayAbbr && homeAbbr) {
      const key = `${awayAbbr}-${homeAbbr}`
      map.set(key, ev.eventId)
      console.log(`[Novibet] Event ${ev.eventId}: ${key} ("${ev.caption}")`)
    } else {
      console.warn(`[Novibet] No abbr for "${ev.caption}" (away=${awayAbbr}, home=${homeAbbr})`)
    }
  }

  return map
}

/**
 * Extracts NBA events from Novibet's response structure:
 * raw[] → betViews[] (filtered by competitionContextCaption ≈ "Basquetebol")
 *       → competitions[] → events[]
 */
function extractEvents(raw: unknown): NovibetEvent[] {
  if (!Array.isArray(raw)) {
    console.warn('[Novibet] Expected array at root, got:', typeof raw)
    return []
  }

  const BASKETBALL_LABELS = ['BASQUETE', 'BASKETBALL', 'NBA', 'EUA']

  const events: NovibetEvent[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const page of raw as any[]) {
    const betViews = page?.betViews
    if (!Array.isArray(betViews)) continue

    for (const bv of betViews) {
      const ctx: string = (bv?.competitionContextCaption ?? '').toUpperCase()
      const isBasketball = BASKETBALL_LABELS.some((k) => ctx.includes(k))
      if (!isBasketball) continue

      console.log(`[Novibet] Basketball betView found: "${bv.competitionContextCaption}"`)

      const competitions = bv?.competitions
      if (!Array.isArray(competitions)) continue

      for (const comp of competitions) {
        const compCaption: string = comp?.caption ?? ''
        // Only NBA competitions
        if (!compCaption.toUpperCase().includes('NBA') && !compCaption.toUpperCase().includes('EUA')) {
          console.log(`[Novibet] Skipping competition: "${compCaption}"`)
          continue
        }

        const evs = comp?.events
        if (!Array.isArray(evs)) continue

        for (const ev of evs) {
          if (typeof ev.eventId === 'number' && typeof ev.caption === 'string') {
            events.push(ev as NovibetEvent)
          }
        }
      }
    }
  }

  console.log(`[Novibet] extractEvents: found ${events.length} NBA events`)
  if (events.length > 0) {
    console.log('[Novibet] Events:', events.map(e => `${e.eventId}:"${e.caption}"`).join(' | '))
  }

  return events
}

// ─── Market fetching for a specific event ────────────────────────────────────

/**
 * Fetches all available markets for a specific Novibet event.
 * Returns null if the request fails.
 */
export async function getNovibetMarkets(eventId: number): Promise<NovibetMarket[] | null> {
  // First try the category endpoint (returns one market at a time? or all?)
  // The category URL format: /spt/feed/marketviews/event/{categoryPath}/{eventId}
  const url = `${NOVIBET_BASE}/spt/feed/marketviews/event/${NBA_CATEGORY_PATH}/${eventId}?${qParams()}`
  const data = await fetchJSON<NovibetMarket | NovibetMarket[]>(url)

  if (!data) return null
  return Array.isArray(data) ? data : [data]
}

// ─── Odds parsing ─────────────────────────────────────────────────────────────

/**
 * Parses Novibet markets into our OddsData format.
 * Market sysnamecontains keywords like:
 *   TOTALS / OVER_UNDER → total points market
 *   HANDICAP → spread
 *   MATCH_RESULT / MONEYLINE / 1X2 → h2h
 */
function parseMarkets(markets: NovibetMarket[]): OddsData {
  const odds: OddsData = {}
  const altTotalsMap = new Map<number, { over: number; under: number }>()

  for (const market of markets) {
    if (!market.betItems?.length) continue
    const sysname = (market.marketSysname ?? '').toUpperCase()
    const caption = (market.caption ?? '').toUpperCase()

    // ── Moneyline / H2H ──
    if (
      sysname.includes('MATCH_RESULT') ||
      sysname.includes('MONEYLINE') ||
      sysname.includes('1X2') ||
      (caption.includes('RESULTADO') && !sysname.includes('HANDICAP'))
    ) {
      const home = market.betItems.find(
        (b) => b.code === '1' || b.caption.includes('Casa') || b.caption.includes('home')
      )
      const away = market.betItems.find(
        (b) => b.code === '2' || b.caption.includes('Fora') || b.caption.includes('away')
      )
      if (home && away && home.isAvailable && away.isAvailable) {
        odds.h2h = { home: home.price, away: away.price }
      }
    }

    // ── Total Points (main line) ──
    if (
      (sysname.includes('TOTAL') || sysname.includes('OVER_UNDER')) &&
      !sysname.includes('ALTERNATE') &&
      !sysname.includes('ADDITIONAL') &&
      !sysname.includes('PLAYER')
    ) {
      const over = market.betItems.find(
        (b) =>
          b.caption.toLowerCase().includes('over') ||
          b.caption.includes('Mais') ||
          b.code === 'over'
      )
      const under = market.betItems.find(
        (b) =>
          b.caption.toLowerCase().includes('under') ||
          b.caption.includes('Menos') ||
          b.code === 'under'
      )
      if (over && under && over.isAvailable && under.isAvailable) {
        // Extract line from caption: "Over 236.5" → 236.5
        const lineMatch = over.caption.match(/[\d]+[.,][\d]+|[\d]+/)
        const line = lineMatch ? parseFloat(lineMatch[0].replace(',', '.')) : 0
        if (line > 0 && !odds.total) {
          odds.total = { line, over: over.price, under: under.price }
        }
      }
    }

    // ── Alternate Totals ──
    if (
      sysname.includes('TOTAL') &&
      (sysname.includes('ALTERNATE') || sysname.includes('ADDITIONAL'))
    ) {
      for (const item of market.betItems) {
        if (!item.isAvailable) continue
        const lineMatch = item.caption.match(/[\d]+[.,][\d]+|[\d]+/)
        if (!lineMatch) continue
        const line = parseFloat(lineMatch[0].replace(',', '.'))
        const isOver =
          item.caption.toLowerCase().includes('over') || item.caption.includes('Mais')
        const isUnder =
          item.caption.toLowerCase().includes('under') || item.caption.includes('Menos')
        if (!isOver && !isUnder) continue

        const entry = altTotalsMap.get(line) ?? { over: 0, under: 0 }
        if (isOver) entry.over = item.price
        if (isUnder) entry.under = item.price
        altTotalsMap.set(line, entry)
      }
    }

    // ── Spread / Handicap ──
    if (sysname.includes('HANDICAP') && !sysname.includes('PLAYER')) {
      const home = market.betItems.find(
        (b) => b.code === '1' || b.caption.includes('+') || b.caption.includes('-')
      )
      const away = market.betItems.find(
        (b) => b.code === '2' && b !== home
      )
      if (home && away && home.isAvailable && away.isAvailable) {
        const lineMatch = home.caption.match(/[+-]?[\d]+[.,][\d]+/)
        const line = lineMatch ? parseFloat(lineMatch[0].replace(',', '.')) : 0
        if (!odds.spread) {
          odds.spread = { line, home_odd: home.price, away_odd: away.price }
        }
      }
    }
  }

  // Convert alternate totals map to sorted array
  if (altTotalsMap.size > 0) {
    const altLines: AlternateTotalLine[] = []
    for (const [line, { over, under }] of Array.from(altTotalsMap)) {
      if (over > 0 && under > 0) {
        altLines.push({ line, over, under })
      }
    }
    if (altLines.length > 0) {
      odds.alternate_totals = altLines.sort((a, b) => a.line - b.line)
    }
  }

  return odds
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetches live Novibet odds for an NBA matchup.
 * @param awayAbbr - e.g. "TOR"
 * @param homeAbbr - e.g. "MIA"
 * @returns OddsData with _bookmaker='novibet_direct', or null if not found
 */
export async function getNovibetDirectOdds(
  awayAbbr: string,
  homeAbbr: string
): Promise<OddsData | null> {
  const eventMap = await getNovibetEventMap()
  const key = `${awayAbbr}-${homeAbbr}`
  const eventId = eventMap.get(key)

  if (!eventId) {
    console.warn(`[Novibet] No event found for matchup ${key}`)
    return null
  }

  const markets = await getNovibetMarkets(eventId)
  if (!markets || markets.length === 0) {
    console.warn(`[Novibet] No markets returned for event ${eventId}`)
    return null
  }

  const parsed = parseMarkets(markets)
  parsed._bookmaker = 'novibet_direct'
  console.log(
    `[Novibet] ${key} (event ${eventId}) — total: ${parsed.total ? `${parsed.total.line} over=${parsed.total.over} under=${parsed.total.under}` : 'NONE'} — alt lines: ${parsed.alternate_totals?.length ?? 0}`
  )
  return parsed
}

/**
 * Builds a full odds map for all today's NBA games directly from Novibet.
 * Returns Map<"AWAY-HOME", OddsData>
 */
export async function getAllNovibetOdds(): Promise<Map<string, OddsData>> {
  const eventMap = await getNovibetEventMap()
  if (eventMap.size === 0) return new Map()

  const results = await Promise.allSettled(
    Array.from(eventMap.entries()).map(async ([matchupKey, eventId]) => {
      const markets = await getNovibetMarkets(eventId)
      if (!markets || markets.length === 0) return [matchupKey, null] as const
      const odds = parseMarkets(markets)
      odds._bookmaker = 'novibet_direct'
      return [matchupKey, odds] as const
    })
  )

  const map = new Map<string, OddsData>()
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value[1]) {
      map.set(result.value[0], result.value[1])
    }
  }
  return map
}
