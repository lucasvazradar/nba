import type {
  NBAGame,
  TeamGameStat,
  TeamMetrics,
  PlayerGameStat,
  PlayerProjection,
  PlayerInjury,
  PlayerMetrics,
  OddsData,
  BetOpportunity,
  GameAnalysisPayload,
  AlternateTotalLine,
} from '@/types'
import { getLast10Games, getInjuries, getPlayerProjections, getPlayerStatsByDate } from './sportsdata'
import { getAllOddsByMatchup, estimateOddsFromHistory, ODD_MIN, ODD_MAX } from './oddsapi'
import { claudeAnalyze } from './claude'

// ─── Risk Filters ─────────────────────────────────────────────────────────────

function hasKeyInjury(injuries: PlayerInjury[], teamId: number): boolean {
  return injuries.some((i) => i.team_id === teamId && i.injury_status === 'Out')
}

function isExtremeFatigue(history: TeamGameStat[]): boolean {
  const dates = history.slice(0, 4).map((g) => new Date(g.game_date).getTime()).sort((a, b) => b - a)
  if (dates.length < 4) return false
  return (dates[0] - dates[3]) / (1000 * 60 * 60 * 24) <= 5
}

// ─── Métricas de time ─────────────────────────────────────────────────────────

function calcStdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
}

function calcStreak(history: TeamGameStat[]): string {
  if (!history.length) return '—'
  const latest = history[0].won
  let count = 0
  for (const g of history) {
    if (g.won === latest) count++
    else break
  }
  return `${latest ? 'V' : 'D'}${count}`
}

function calcRecord(history: TeamGameStat[]): string {
  const wins = history.filter((g) => g.won).length
  return `${wins}-${history.length - wins}`
}

function calcOverUnderRate(history: TeamGameStat[], totalLine: number): number {
  if (!history.length) return 0
  return history.filter((g) => g.total_points > totalLine).length / history.length
}

export function calculateTeamMetrics(
  history: TeamGameStat[],
  injuries: PlayerInjury[],
  teamId: number,
  totalLine = 220
): TeamMetrics {
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  const lastGame = history[0]
  const today = new Date()
  const lastGameDate = lastGame ? new Date(lastGame.game_date + 'T12:00:00Z') : today
  const restDays = Math.floor((today.getTime() - lastGameDate.getTime()) / (1000 * 60 * 60 * 24))

  return {
    avgPointsScored: avg(history.map((g) => g.points_scored)),
    avgPointsAllowed: avg(history.map((g) => g.points_allowed)),
    overUnderRate: calcOverUnderRate(history, totalLine),
    last10Record: calcRecord(history),
    homeAwayRecord: calcRecord(history.filter((g) => g.is_home)),
    streak: calcStreak(history),
    avgPace: avg(history.map((g) => g.pace ?? 98)),
    avgPossessions: avg(history.map((g) => g.possessions ?? 95)),
    offensiveRating: avg(history.map((g) => g.offensive_rating ?? 110)),
    defensiveRating: avg(history.map((g) => g.defensive_rating ?? 110)),
    netRating: avg(history.map((g) => g.offensive_rating ?? 110)) - avg(history.map((g) => g.defensive_rating ?? 110)),
    backToBack: restDays === 0,
    restDays,
    injuryImpact: injuries.filter((i) => i.team_id === teamId && i.injury_status === 'Out').map((i) => i.player_name),
    h2hLast5: [],
    h2hAvgTotal: avg(history.map((g) => g.total_points)),
  }
}

// ─── Métricas de jogador ──────────────────────────────────────────────────────

export function calculatePlayerMetrics(
  playerStats: PlayerGameStat[],
  projections: PlayerProjection[],
  propOdds: OddsData['player_props'] = []
): PlayerMetrics[] {
  const playerMap = new Map<number, PlayerGameStat[]>()
  for (const stat of playerStats) {
    const arr = playerMap.get(stat.player_id) ?? []
    arr.push(stat)
    playerMap.set(stat.player_id, arr)
  }

  const result: PlayerMetrics[] = []
  for (const [playerId, stats] of Array.from(playerMap.entries())) {
    if (stats.length < 3) continue
    const proj = projections.find((p) => p.player_id === playerId)
    const propOdd = propOdds?.find((p) => p.player === stats[0].player_name && p.market === 'player_points')
    const pts = stats.map((s) => s.points)
    const avgPts = pts.reduce((a, b) => a + b, 0) / pts.length
    const propLine = propOdd?.line ?? avgPts
    const hitRate = pts.filter((p) => p > propLine).length / pts.length
    const recent3 = pts.slice(0, 3).reduce((a, b) => a + b, 0) / 3
    const older3 = pts.slice(-3).reduce((a, b) => a + b, 0) / 3

    result.push({
      player: stats[0].player_name,
      player_id: playerId,
      last10Avg: {
        points: avgPts,
        rebounds: stats.reduce((a, b) => a + b.rebounds, 0) / stats.length,
        assists: stats.reduce((a, b) => a + b.assists, 0) / stats.length,
        minutes: stats.reduce((a, b) => a + b.minutes, 0) / stats.length,
      },
      mlProjection: {
        points: proj?.projected_points ?? avgPts,
        rebounds: proj?.projected_rebounds ?? 0,
        assists: proj?.projected_assists ?? 0,
      },
      consistency: calcStdDev(pts),
      trendSlope: recent3 - older3,
      propLine,
      hitRateOverLine: hitRate,
    })
  }

  return result.sort((a, b) => b.hitRateOverLine - a.hitRateOverLine).slice(0, 10)
}

// ─── Modelo estatístico (distribuição Normal) ─────────────────────────────────

function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x < 0 ? -1 : 1
  const t = 1 / (1 + p * Math.abs(x))
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return sign * y
}

function normalCDF(x: number, mean: number, std: number): number {
  if (std <= 0) return x < mean ? 0 : 1
  return 0.5 * (1 + erf((x - mean) / (std * Math.SQRT2)))
}

/**
 * Computes expected total (μ) and standard deviation (σ) for the game's total points.
 * Uses historical game totals from both teams weighted equally.
 */
function computeTotalDistribution(
  homeHistory: TeamGameStat[],
  awayHistory: TeamGameStat[]
): { expectedTotal: number; stdDev: number } {
  // Only use valid game totals — NBA games almost never end below 160 combined pts
  // NBA real range: 180–290 combined pts. Filter corrupted/simulated data.
  const totals = [
    ...homeHistory.map((g) => g.total_points),
    ...awayHistory.map((g) => g.total_points),
  ].filter((t) => t >= 180 && t <= 290)

  if (totals.length < 4) return { expectedTotal: 225, stdDev: 15 }

  const historicalMean = totals.reduce((a, b) => a + b, 0) / totals.length

  // Matchup-specific expected total (offensive/defensive matchup)
  const homeAvgScored  = homeHistory.reduce((a, g) => a + g.points_scored, 0) / homeHistory.length
  const homeAvgAllowed = homeHistory.reduce((a, g) => a + g.points_allowed, 0) / homeHistory.length
  const awayAvgScored  = awayHistory.reduce((a, g) => a + g.points_scored, 0) / awayHistory.length
  const awayAvgAllowed = awayHistory.reduce((a, g) => a + g.points_allowed, 0) / awayHistory.length

  const homeExpected = (homeAvgScored + awayAvgAllowed) / 2
  const awayExpected = (awayAvgScored + homeAvgAllowed) / 2
  const matchupTotal = homeExpected + awayExpected  // full game total

  // Weighted average: 60% matchup model, 40% historical totals
  const expectedTotal = 0.6 * matchupTotal + 0.4 * historicalMean

  // Cap σ to realistic NBA range (8–20 pts); σ=98 means bad data crept in
  const rawStd = calcStdDev(totals)
  const stdDev = Math.min(20, Math.max(10, rawStd))

  return { expectedTotal: Math.round(expectedTotal * 2) / 2, stdDev }
}

/**
 * Generates synthetic alternate total lines by LINEARLY EXTRAPOLATING Novibet's
 * own pricing from the known main line. OUR model provides probabilities.
 * The EV gap = our model probability vs Novibet's extrapolated implied probability.
 *
 * Key insight: if our expected total (μ) differs from Novibet's implied line,
 * UNDER bets above the discrepancy zone and OVER bets below will have positive EV.
 *
 * Typical NBA alternate total increments (from observed Novibet data):
 *   OVER: each +1 pt line → odd increases ~+0.073
 *   UNDER: each +1 pt line → odd decreases ~-0.053
 */
function generateSyntheticAlternateLines(
  ourExpectedTotal: number,
  stdDev: number,
  mainLine: number,
  mainOverOdd: number,
  mainUnderOdd: number
): AlternateTotalLine[] {
  // NBA typical odds sensitivity per 1-point line movement (observed from Novibet)
  const OVER_DELTA_PER_PT  = 0.073
  const UNDER_DELTA_PER_PT = 0.053

  const candidates: AlternateTotalLine[] = []

  for (let delta = -18; delta <= 18; delta += 0.5) {
    const line = Math.round((mainLine + delta) * 2) / 2

    // Extrapolate Novibet's odds linearly from the known main line
    // (NOT from our model — this is critical for correct EV calculation)
    const novibetOver  = Math.round((mainOverOdd  + delta * OVER_DELTA_PER_PT)  * 100) / 100
    const novibetUnder = Math.round((mainUnderOdd - delta * UNDER_DELTA_PER_PT) * 100) / 100

    if (novibetOver <= 0.01 || novibetUnder <= 0.01) continue

    // Our model's probabilities (Normal distribution around our expectedTotal)
    const probOver  = 1 - normalCDF(line, ourExpectedTotal, stdDev)
    const probUnder = normalCDF(line, ourExpectedTotal, stdDev)

    // EV = our_probability × Novibet_odd - 1
    // Positive EV means our model disagrees favourably with Novibet's pricing
    const evOver  = parseFloat((probOver  * novibetOver  - 1).toFixed(4))
    const evUnder = parseFloat((probUnder * novibetUnder - 1).toFixed(4))

    const overInRange  = novibetOver  >= ODD_MIN && novibetOver  <= ODD_MAX
    const underInRange = novibetUnder >= ODD_MIN && novibetUnder <= ODD_MAX

    if (overInRange || underInRange) {
      candidates.push({
        line,
        over:       novibetOver,
        under:      novibetUnder,
        prob_over:  parseFloat(probOver.toFixed(4)),
        prob_under: parseFloat(probUnder.toFixed(4)),
        ev_over:    evOver,
        ev_under:   evUnder,
      })
    }
  }

  return candidates.sort((a, b) => a.line - b.line)
}

/**
 * Enriches real alternate lines with our model probabilities and EV.
 */
function enrichAlternateLines(
  altLines: AlternateTotalLine[],
  expectedTotal: number,
  stdDev: number
): AlternateTotalLine[] {
  return altLines.map((al) => {
    const probOver = 1 - normalCDF(al.line + 0.5, expectedTotal, stdDev)
    const probUnder = normalCDF(al.line - 0.5, expectedTotal, stdDev)
    return {
      ...al,
      prob_over: parseFloat(probOver.toFixed(4)),
      prob_under: parseFloat(probUnder.toFixed(4)),
      ev_over: parseFloat((probOver * al.over - 1).toFixed(4)),
      ev_under: parseFloat((probUnder * al.under - 1).toFixed(4)),
    }
  })
}

// ─── Post-processing: filter & deduplicate Claude output ─────────────────────

/**
 * Removes contradicting OVER/UNDER pairs on the same line for the same game.
 * If both sides of the same line appear → keep the one with higher EV; if both are similar → remove both.
 */
function removeContradictions(opportunities: BetOpportunity[]): BetOpportunity[] {
  const totals = opportunities.filter((o) => o.bet_type === 'total')
  const others = opportunities.filter((o) => o.bet_type !== 'total')

  // Group totals by line value extracted from market string
  const byLine = new Map<string, BetOpportunity[]>()
  for (const opp of totals) {
    const match = opp.market.match(/(\d+\.?\d*)/)
    const key = match ? `${opp.game_id}::${match[1]}` : null
    if (!key) { others.push(opp); continue }
    const arr = byLine.get(key) ?? []
    arr.push(opp)
    byLine.set(key, arr)
  }

  const cleanedTotals: BetOpportunity[] = []
  for (const group of Array.from(byLine.values())) {
    if (group.length === 1) {
      cleanedTotals.push(group[0])
      continue
    }
    // Both OVER and UNDER present on same line → contradiction
    const hasOver = group.some((o) => o.market.toUpperCase().includes('OVER') || o.market.toUpperCase().includes('MAIS'))
    const hasUnder = group.some((o) => o.market.toUpperCase().includes('UNDER') || o.market.toUpperCase().includes('MENOS'))
    if (hasOver && hasUnder) {
      // Keep the one with higher EV (or higher probability if EV missing), but only if the edge is clear (>5% difference)
      const sorted = group.sort((a, b) => {
        const evA = a.expected_value ?? (a.estimated_probability * a.novibet_odd - 1)
        const evB = b.expected_value ?? (b.estimated_probability * b.novibet_odd - 1)
        return evB - evA
      })
      const best = sorted[0]
      const second = sorted[1]
      const evBest = best.expected_value ?? (best.estimated_probability * best.novibet_odd - 1)
      const evSecond = second.expected_value ?? (second.estimated_probability * second.novibet_odd - 1)
      // Only keep the best if there's a meaningful edge; otherwise discard both (no conviction)
      if (evBest - evSecond > 0.03) {
        best.risk_flags = [...(best.risk_flags ?? []), 'direcao_oposta_descartada']
        cleanedTotals.push(best)
      }
      // else: both discarded — no conviction
    } else {
      cleanedTotals.push(...group)
    }
  }

  return [...cleanedTotals, ...others]
}

/**
 * Main post-processing pipeline applied to all Claude output:
 * 1. Compute EV for every opportunity
 * 2. Filter to odd range [1.33, 1.75]
 * 3. Remove contradicting OVER/UNDER
 * 4. Require EV > 0
 * 5. Sort by EV desc
 */
function postProcess(opportunities: BetOpportunity[]): BetOpportunity[] {
  // 1. Compute / update EV
  const withEV = opportunities.map((o) => ({
    ...o,
    expected_value: parseFloat((o.estimated_probability * o.novibet_odd - 1).toFixed(4)),
  }))

  // 2. Filter odd range
  const inRange = withEV.filter(
    (o) => o.novibet_odd >= ODD_MIN && o.novibet_odd <= ODD_MAX
  )

  // 3. Remove contradictions
  const noContradictions = removeContradictions(inRange)

  // 4. Require near-positive EV (allow -2% tolerance for model imprecision)
  const valueOnly = noContradictions.filter((o) => (o.expected_value ?? 0) > -0.02)

  // 5. Sort by EV desc
  return valueOnly.sort((a, b) => (b.expected_value ?? 0) - (a.expected_value ?? 0))
}

// ─── Fluxo principal — analisa UM jogo ───────────────────────────────────────

export async function analyzeGame(
  game: NBAGame,
  sharedData?: {
    injuries: PlayerInjury[]
    projections: PlayerProjection[]
    allPlayerStats: PlayerGameStat[]
    oddsMap: Map<string, OddsData>
  }
): Promise<BetOpportunity[]> {
  const injuries = sharedData?.injuries ?? await getInjuries()
  const projections = sharedData?.projections ?? await getPlayerProjections(game.game_date)
  const allPlayerStats = sharedData?.allPlayerStats ?? await getPlayerStatsByDate(game.game_date)
  const oddsMap = sharedData?.oddsMap ?? await getAllOddsByMatchup()

  const [homeHistory, awayHistory] = await Promise.all([
    getLast10Games(game.home_team_id),
    getLast10Games(game.away_team_id),
  ])

  const matchupKey = `${game.away_team}-${game.home_team}`
  let odds = oddsMap.get(matchupKey) ?? {}

  console.log(`[analyzer] ${game.away_team}@${game.home_team} — history: home=${homeHistory.length} away=${awayHistory.length} — odds: ${odds.total ? `line=${odds.total.line}` : 'NONE'}`)

  if (isExtremeFatigue(homeHistory) || isExtremeFatigue(awayHistory)) {
    console.log(`[analyzer] ${game.away_team}@${game.home_team} — SKIP: extreme fatigue`)
    return []
  }

  if (!odds.total) {
    // Estimate from historical averages if we have enough data
    const minGames = Math.min(homeHistory.length, awayHistory.length)
    if (minGames >= 1) {
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
      const homeAvgScored  = avg(homeHistory.map((g) => g.points_scored))
      const homeAvgAllowed = avg(homeHistory.map((g) => g.points_allowed))
      const awayAvgScored  = avg(awayHistory.map((g) => g.points_scored))
      const awayAvgAllowed = avg(awayHistory.map((g) => g.points_allowed))
      odds = estimateOddsFromHistory(homeAvgScored, homeAvgAllowed, awayAvgScored, awayAvgAllowed)
      console.log(`[analyzer] ${game.away_team}@${game.home_team} — odds estimated from history: line=${odds.total?.line}`)
    } else {
      console.log(`[analyzer] ${game.away_team}@${game.home_team} — SKIP: no odds + no history`)
      return []
    }
  }

  const totalData = odds.total!
  const totalLine = totalData.line

  // ── Statistical model: compute expected total and standard deviation ──
  const { expectedTotal, stdDev } = computeTotalDistribution(homeHistory, awayHistory)

  // ── Alternate lines: use real data if available, else synthesize ──
  let alternateTotals: AlternateTotalLine[]
  if (odds.alternate_totals && odds.alternate_totals.length > 0) {
    alternateTotals = enrichAlternateLines(odds.alternate_totals, expectedTotal, stdDev)
  } else {
    alternateTotals = generateSyntheticAlternateLines(
      expectedTotal, stdDev,
      totalData.line, totalData.over, totalData.under
    )
  }

  // Top 10 candidates sorted by best EV — include both positive and near-zero
  // so Claude can assess the full picture (positive EV side will dominate the pick)
  const topAlts = alternateTotals
    .map((al) => ({
      ...al,
      best_ev: Math.max(al.ev_over ?? -1, al.ev_under ?? -1),
    }))
    .sort((a, b) => b.best_ev - a.best_ev)
    .slice(0, 10)
    .map(({ best_ev: _, ...rest }) => rest)

  const home_metrics = calculateTeamMetrics(homeHistory, injuries, game.home_team_id, totalLine)
  const away_metrics = calculateTeamMetrics(awayHistory, injuries, game.away_team_id, totalLine)

  const gamePlayerStats = allPlayerStats.filter(
    (s) => s.team_id === game.home_team_id || s.team_id === game.away_team_id
  )
  const player_metrics = calculatePlayerMetrics(gamePlayerStats, projections, odds.player_props)

  const hasRealOdds = !!oddsMap.get(matchupKey)?.total
  const payload: GameAnalysisPayload = {
    game: { ...game, odds_data: odds },
    home_metrics,
    away_metrics,
    player_metrics,
    injuries: injuries.filter((i) => i.team_id === game.home_team_id || i.team_id === game.away_team_id),
    odds: {
      ...odds,
      alternate_totals: topAlts,
      _estimated: !hasRealOdds,
      _model: { expectedTotal, stdDev },
    } as typeof odds,
  }

  console.log(`[analyzer] ${game.away_team}@${game.home_team} — calling Claude. μ=${expectedTotal} σ=${stdDev} altLines=${topAlts.length}`)
  const raw = await claudeAnalyze(payload)
  console.log(`[analyzer] ${game.away_team}@${game.home_team} — Claude returned ${raw.length} opportunities`)

  // Apply full post-processing pipeline
  const processed = postProcess(raw)
  console.log(`[analyzer] ${game.away_team}@${game.home_team} — after postProcess: ${processed.length} opportunities`)
  return processed
}

// ─── Analisa todos os jogos do dia (compartilhando dados) ─────────────────────

export async function analyzeAllGames(games: NBAGame[]): Promise<BetOpportunity[]> {
  // Busca dados compartilhados uma única vez para todos os jogos
  const [injuries, projections, allPlayerStats, oddsMap] = await Promise.all([
    getInjuries(),
    getPlayerProjections(games[0]?.game_date ?? new Date().toISOString().split('T')[0]),
    getPlayerStatsByDate(games[0]?.game_date ?? new Date().toISOString().split('T')[0]),
    getAllOddsByMatchup(),
  ])

  const sharedData = { injuries, projections, allPlayerStats, oddsMap }

  const results = await Promise.allSettled(
    games.map((game) => analyzeGame(game, sharedData))
  )

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}
