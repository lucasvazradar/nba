import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const minProb = parseFloat(searchParams.get('min_prob') ?? '0.50')
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('bet_opportunities')
      .select('*')
      .gte('estimated_probability', minProb)
      .gte('created_at', `${date}T00:00:00Z`)
      .lte('created_at', `${date}T23:59:59Z`)
      .order('estimated_probability', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/opportunities]', err)
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 })
  }
}
