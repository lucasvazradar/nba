import type { OddsData, PlayerPropOdd, AlternateTotalLine } from '@/types'

const BASE_URL = 'https://api.the-odds-api.com/v4'
const API_KEY = process.env.ODDS_API_KEY!

export const ODD_MIN = 1.33
export const ODD_MAX = 1.75

const TEAM_NAME_TO_ABBR: Record<string, string> = {
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GS', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NO', 'New York Knicks': 'NY', 'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SA',
  'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractOddsData(bookmakers: any[]): OddsData {
  // Prefer Novibet → Pinnacle → DraftKings → FanDuel → any bookmaker
  const bm = bookmakers.find((b: any) => b.key === 'novibet')
    ?? bookmakers.find((b: any) => b.key === 'pinnacle')
    ?? bookmakers.find((b: any) => b.key === 'draftkings')
    ?? bookmakers.find((b: any) => b.key === 'fanduel')
    ?? bookmakers[0]
  if (!bm) return {}

  const result: OddsData = {}
  const playerProps: PlayerPropOdd[] = []
  const altTotalsMap = new Map<number, { over: number; under: number }>()

  for (const market of bm.markets ?? []) {
    if (market.key === 'h2h') {
      const home = market.outcomes[0]
      const away = market.outcomes[1]
      result.h2h = { home: home?.price ?? 0, away: away?.price ?? 0 }
    }
    if (market.key === 'spreads') {
      const home = market.outcomes[0]
      const away = market.outcomes[1]
      result.spread = { line: home?.point ?? 0, home_odd: home?.price ?? 0, away_odd: away?.price ?? 0 }
    }
    if (market.key === 'totals') {
      const over = market.outcomes.find((o: any) => o.name === 'Over')
      const under = market.outcomes.find((o: any) => o.name === 'Under')
      result.total = { line: over?.point ?? 0, over: over?.price ?? 0, under: under?.price ?? 0 }
    }
    // Alternate totals — available on some API tiers
    if (market.key === 'alternate_totals') {
      for (const outcome of market.outcomes ?? []) {
        const line: number = outcome.point
        const entry = altTotalsMap.get(line) ?? { over: 0, under: 0 }
        if (outcome.name === 'Over') entry.over = outcome.price
        if (outcome.name === 'Under') entry.under = outcome.price
        altTotalsMap.set(line, entry)
      }
    }
    const propMap: Record<string, PlayerPropOdd['market']> = {
      player_points: 'player_points', player_rebounds: 'player_rebounds', player_assists: 'player_assists',
    }
    if (propMap[market.key]) {
      const players: string[] = Array.from(new Set(market.outcomes.map((o: any) => String(o.description))))
      for (const player of players) {
        const over = market.outcomes.find((o: any) => o.description === player && o.name === 'Over')
        const under = market.outcomes.find((o: any) => o.description === player && o.name === 'Under')
        if (over && under) playerProps.push({ player: String(player), market: propMap[market.key], line: over.point, over: over.price, under: under.price })
      }
    }
  }

  // Convert alternate totals map to array, filtering to target odd range
  if (altTotalsMap.size > 0) {
    const altLines: AlternateTotalLine[] = []
    for (const [line, { over, under }] of Array.from(altTotalsMap)) {
      if (
        (over >= ODD_MIN && over <= ODD_MAX) ||
        (under >= ODD_MIN && under <= ODD_MAX)
      ) {
        altLines.push({ line, over, under })
      }
    }
    if (altLines.length > 0) {
      result.alternate_totals = altLines.sort((a, b) => a.line - b.line)
    }
  }

  if (playerProps.length) result.player_props = playerProps
  return result
}

// Retorna mapa com TODAS as odds disponíveis indexadas por "AWAY-HOME"
export async function getAllOddsByMatchup(): Promise<Map<string, OddsData>> {
  // Include alternate_totals — gracefully ignored if not on plan
  const markets = 'h2h,totals,spreads,alternate_totals'
  // us,eu,uk,au — cast wide net; Pinnacle/FanDuel always have NBA (us region)
  const url = `${BASE_URL}/sports/basketball_nba/odds?apiKey=${API_KEY}&regions=us,eu,uk,au&markets=${markets}`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[OddsAPI] HTTP ${res.status} — ${body.slice(0, 200)}`)
    return new Map()
  }

  const remaining = res.headers.get('x-requests-remaining')
  console.log(`[OddsAPI] Requests remaining: ${remaining ?? 'unknown'}`)
  if (remaining && parseInt(remaining) < 50) console.warn(`[OddsAPI] LOW quota: ${remaining} left`)

  const data: any[] = await res.json()
  console.log(`[OddsAPI] Events returned: ${data.length}`)

  const map = new Map<string, OddsData>()

  for (const event of data) {
    const awayAbbr = TEAM_NAME_TO_ABBR[event.away_team]
    const homeAbbr = TEAM_NAME_TO_ABBR[event.home_team]
    if (awayAbbr && homeAbbr) {
      map.set(`${awayAbbr}-${homeAbbr}`, extractOddsData(event.bookmakers ?? []))
    } else {
      console.warn(`[OddsAPI] No abbreviation for: ${event.away_team} @ ${event.home_team}`)
    }
  }

  return map
}

export async function getNovibetOdds(): Promise<OddsData> {
  const url = `${BASE_URL}/sports/basketball_nba/odds?apiKey=${API_KEY}&regions=eu&markets=h2h,totals,spreads`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) return {}
  const data: any[] = await res.json()
  return extractOddsData(data[0]?.bookmakers ?? [])
}

// Gera odds estimadas a partir das médias históricas dos times (quando a bookmaker não tem o jogo)
export function estimateOddsFromHistory(
  homeAvgScored: number, homeAvgAllowed: number,
  awayAvgScored: number, awayAvgAllowed: number
): OddsData {
  const expectedHome = (homeAvgScored + awayAvgAllowed) / 2
  const expectedAway = (awayAvgScored + homeAvgAllowed) / 2
  const totalLine = Math.round((expectedHome + expectedAway) * 2) / 2  // round to nearest 0.5

  const homeEdge = expectedHome - expectedAway
  const homeWinProb = Math.min(0.85, Math.max(0.15, 0.5 + homeEdge / 40))
  const awayWinProb = 1 - homeWinProb
  const toOdd = (p: number) => Math.round((1 / p) * 100) / 100

  return {
    h2h: { home: toOdd(homeWinProb), away: toOdd(awayWinProb) },
    total: { line: totalLine, over: 1.87, under: 1.87 },
    spread: { line: -(homeEdge / 2), home_odd: 1.87, away_odd: 1.87 },
  }
}
