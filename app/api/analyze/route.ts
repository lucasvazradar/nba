import { NextResponse } from 'next/server'
import { getGamesByDate } from '@/lib/sportsdata'
import { analyzeAllGames, analyzeGame } from '@/lib/analyzer'
import { getAllOddsByMatchup } from '@/lib/oddsapi'
import { getInjuries, getPlayerProjections, getPlayerStatsByDate } from '@/lib/sportsdata'
import { createServerClient } from '@/lib/supabase'
import { lastClaudeRawResponse, lastClaudePayloadSummary } from '@/lib/claude'
import type { BetOpportunity } from '@/types'

export async function GET(req: Request) {
  // GET /api/analyze?game_id=23597&debug=1 — diagnóstico sem salvar no Supabase
  const { searchParams } = new URL(req.url)
  const game_id = searchParams.get('game_id')
  const debug = searchParams.get('debug') === '1'
  if (!game_id) return NextResponse.json({ error: 'Passe ?game_id=23597' }, { status: 400 })

  const today = new Date().toISOString().split('T')[0]
  const games = await getGamesByDate(today)
  const game = games.find((g) => g.id === game_id)
  if (!game) return NextResponse.json({ error: 'Jogo não encontrado' }, { status: 404 })

  const [injuries, projections, allPlayerStats, oddsMap] = await Promise.all([
    getInjuries(),
    getPlayerProjections(today),
    getPlayerStatsByDate(today),
    getAllOddsByMatchup(true),
  ])

  if (debug) {
    const matchupKey = `${game.away_team}-${game.home_team}`
    const odds = oddsMap.get(matchupKey)

    // Chama Claude diretamente para ver resposta bruta
    let claudeRaw = ''
    let analyzeError = ''
    let opportunities: BetOpportunity[] = []

    try {
      opportunities = await analyzeGame(game, { injuries, projections, allPlayerStats, oddsMap })
      claudeRaw = lastClaudeRawResponse
    } catch (e) {
      analyzeError = String(e)
    }

    // Se Claude não foi chamado, tenta chamar direto com payload mínimo
    if (!claudeRaw && !analyzeError) {
      const { claudeAnalyze } = await import('@/lib/claude')
      const { calculateTeamMetrics } = await import('@/lib/analyzer')
      const { getLast10Games } = await import('@/lib/sportsdata')
      const [homeHist, awayHist] = await Promise.all([
        getLast10Games(game.home_team_id),
        getLast10Games(game.away_team_id),
      ])
      try {
        const minimalPayload = {
          game: { ...game, odds_data: odds },
          home_metrics: calculateTeamMetrics(homeHist, [], game.home_team_id, odds?.total?.line ?? 220),
          away_metrics: calculateTeamMetrics(awayHist, [], game.away_team_id, odds?.total?.line ?? 220),
          player_metrics: [],
          injuries: [],
          odds: odds ?? {},
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await claudeAnalyze(minimalPayload as any)
        claudeRaw = lastClaudeRawResponse
        return NextResponse.json({
          game: matchupKey,
          odds,
          home_games: homeHist.length,
          away_games: awayHist.length,
          claude_called: true,
          claude_raw: claudeRaw.slice(0, 3000),
          claude_parsed_count: result.length,
          claude_parsed: result,
          final_opportunities: opportunities.length,
        })
      } catch (e2) {
        analyzeError = `analyzeGame ok but direct claude failed: ${e2}`
      }
    }

    return NextResponse.json({
      game: matchupKey,
      odds_found: !!odds,
      odds,
      home_games: (await import('@/lib/sportsdata').then(m => m.getLast10Games(game.home_team_id))).length,
      analyze_error: analyzeError || null,
      claude_was_called: !!claudeRaw,
      claude_raw: claudeRaw.slice(0, 3000),
      opportunities_count: opportunities.length,
      opportunities,
    })
  }

  const opportunities = await analyzeGame(game, { injuries, projections, allPlayerStats, oddsMap })
  return NextResponse.json(opportunities)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { game_id, date } = body as { game_id?: string; date?: string }
  const today = date ?? new Date().toISOString().split('T')[0]

  try {
    const games = await getGamesByDate(today)
    if (!games.length) return NextResponse.json([])

    let opportunities: BetOpportunity[]

    if (game_id) {
      // Analisa jogo específico
      const game = games.find((g) => g.id === game_id)
      if (!game) return NextResponse.json({ error: 'Jogo não encontrado' }, { status: 404 })

      const [injuries, projections, allPlayerStats, oddsMap] = await Promise.all([
        getInjuries(),
        getPlayerProjections(today),
        getPlayerStatsByDate(today),
        getAllOddsByMatchup(),
      ])
      opportunities = await analyzeGame(game, { injuries, projections, allPlayerStats, oddsMap })
    } else {
      // Analisa todos os jogos do dia
      opportunities = await analyzeAllGames(games)
    }

    if (opportunities.length) {
      const supabase = createServerClient()
      // Remove análises antigas do dia antes de inserir
      if (game_id) {
        await supabase.from('bet_opportunities').delete().eq('game_id', game_id)
          .gte('created_at', `${today}T00:00:00Z`)
      } else {
        const gameIds = games.map((g) => g.id)
        await supabase.from('bet_opportunities').delete().in('game_id', gameIds)
          .gte('created_at', `${today}T00:00:00Z`)
      }
      await supabase.from('bet_opportunities').insert(opportunities)
    }

    return NextResponse.json(opportunities)
  } catch (err) {
    console.error('[/api/analyze]', err)
    return NextResponse.json({ error: 'Análise falhou' }, { status: 500 })
  }
}
