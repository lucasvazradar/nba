import { NextResponse } from 'next/server'
import { getGamesByDate } from '@/lib/sportsdata'
import { analyzeAllGames, analyzeGame } from '@/lib/analyzer'
import { getAllOddsByMatchup } from '@/lib/oddsapi'
import { getInjuries, getPlayerProjections, getPlayerStatsByDate } from '@/lib/sportsdata'
import { createServerClient } from '@/lib/supabase'
import type { BetOpportunity } from '@/types'

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
