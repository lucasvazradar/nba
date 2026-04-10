import { NextResponse } from 'next/server'
import { getGamesByDate, getLast10Games, getInjuries, getPlayerStatsByDate } from '@/lib/sportsdata'
import { getAllOddsByMatchup } from '@/lib/oddsapi'

export const runtime = 'nodejs'
export const maxDuration = 30

// GET /api/diag — mostra o que a análise recebe para o primeiro jogo do dia
export async function GET() {
  const today = new Date().toISOString().split('T')[0]
  const result: Record<string, unknown> = { date: today }

  try {
    const games = await getGamesByDate(today)
    result.games_count = games.length
    result.games = games.map(g => ({ id: g.id, matchup: `${g.away_team}@${g.home_team}`, time: g.game_time }))

    if (!games.length) return NextResponse.json(result)

    const game = games[0]
    result.analyzing = `${game.away_team}@${game.home_team}`

    // Histórico dos dois times
    const [homeHistory, awayHistory] = await Promise.all([
      getLast10Games(game.home_team_id),
      getLast10Games(game.away_team_id),
    ])
    result.home_history_count = homeHistory.length
    result.away_history_count = awayHistory.length
    result.home_history_sample = homeHistory.slice(0, 3).map(g => ({
      date: g.game_date, scored: g.points_scored, allowed: g.points_allowed, total: g.total_points
    }))
    result.away_history_sample = awayHistory.slice(0, 3).map(g => ({
      date: g.game_date, scored: g.points_scored, allowed: g.points_allowed, total: g.total_points
    }))

    // Odds
    const oddsMap = await getAllOddsByMatchup(true)
    result.odds_map_size = oddsMap.size
    result.odds_map_keys = Array.from(oddsMap.keys())
    const matchupKey = `${game.away_team}-${game.home_team}`
    const odds = oddsMap.get(matchupKey)
    result.odds_for_game = odds ?? null
    result.matchup_key = matchupKey
    result.matchup_found = !!odds

    // Lesões
    const injuries = await getInjuries()
    result.injuries_count = injuries.length

    // Player stats
    const playerStats = await getPlayerStatsByDate(today)
    result.player_stats_count = playerStats.length

  } catch (e) {
    result.error = String(e)
  }

  return NextResponse.json(result)
}
