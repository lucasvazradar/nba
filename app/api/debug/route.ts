import { NextResponse } from 'next/server'
import { getGamesByDate, getLast10Games } from '@/lib/sportsdata'
import { getAllOddsByMatchup } from '@/lib/oddsapi'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  const report: Record<string, unknown> = { date }

  const games = await getGamesByDate(date)
  report.games_count = games.length

  if (!games.length) return NextResponse.json(report)

  // History for first game
  const g = games[0]
  const [homeHist, awayHist] = await Promise.all([
    getLast10Games(g.home_team_id),
    getLast10Games(g.away_team_id),
  ])

  report.history = {
    game: `${g.away_team}@${g.home_team}`,
    home_count: homeHist.length,
    away_count: awayHist.length,
    home_totals: homeHist.map((h) => h.total_points),
    away_totals: awayHist.map((h) => h.total_points),
    home_avg_total: homeHist.length
      ? Math.round(homeHist.reduce((a, h) => a + h.total_points, 0) / homeHist.length)
      : 0,
  }

  // Odds for all matchups
  const oddsMap = await getAllOddsByMatchup()
  report.odds_found = oddsMap.size
  report.odds_per_game = games.map((game) => {
    const key = `${game.away_team}-${game.home_team}`
    const odds = oddsMap.get(key)
    return {
      key,
      found: !!odds?.total,
      total_line: odds?.total?.line ?? null,
      total_over: odds?.total?.over ?? null,
      total_under: odds?.total?.under ?? null,
      h2h_home: odds?.h2h?.home ?? null,
      h2h_away: odds?.h2h?.away ?? null,
    }
  })

  return NextResponse.json(report)
}
