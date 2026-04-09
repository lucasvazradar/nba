import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function DELETE(
  _: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { error } = await supabase
    .from('placed_bets')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
