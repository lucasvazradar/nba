import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('placed_bets')
    .select('*')
    .eq('game_date', date)
    .order('placed_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('placed_bets')
    .insert([{
      game_id:               body.game_id,
      game_date:             body.game_date,
      home_team:             body.home_team,
      away_team:             body.away_team,
      bet_type:              body.bet_type,
      market:                body.market,
      target:                body.target ?? null,
      novibet_odd:           body.novibet_odd ?? null,
      estimated_probability: body.estimated_probability,
      confidence_level:      body.confidence_level,
      reasoning:             body.reasoning ?? null,
      risk_flags:            body.risk_flags ?? [],
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
