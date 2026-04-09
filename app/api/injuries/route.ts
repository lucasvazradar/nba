import { NextResponse } from 'next/server'
import { getInjuries } from '@/lib/sportsdata'

export async function GET() {
  try {
    const injuries = await getInjuries()
    return NextResponse.json(injuries)
  } catch (err) {
    console.error('[/api/injuries]', err)
    return NextResponse.json({ error: 'Failed to fetch injuries' }, { status: 502 })
  }
}
