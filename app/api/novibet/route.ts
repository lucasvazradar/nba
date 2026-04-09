import { NextResponse } from 'next/server'
import { getNovibetEventMap, getNovibetMarkets, getAllNovibetOdds } from '@/lib/novibet'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Diagnostic + integration endpoint for Novibet Brazil internal API.
 *
 * GET /api/novibet
 *   → Returns all today's NBA events found on Novibet + parsed odds for each.
 *
 * GET /api/novibet?event_id=44453955
 *   → Returns raw markets for that specific numeric Novibet event ID.
 *
 * GET /api/novibet?matchup=TOR-MIA
 *   → Returns parsed OddsData for that AWAY-HOME matchup key.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')
  const matchup = searchParams.get('matchup')

  // ── Raw market inspection for a specific event ──
  if (eventId) {
    const numericId = parseInt(eventId.replace(/^e/, ''), 10)
    if (isNaN(numericId)) {
      return NextResponse.json({ error: 'event_id must be numeric (e.g. 44453955)' }, { status: 400 })
    }
    await getNovibetMarkets(numericId)
    return NextResponse.json({
      event_id: numericId,
      note: 'Mercados já vêm embutidos no listing. Use /api/novibet?matchup=TOR-MIA para ver as odds.',
    })
  }

  // ── Parsed odds for a specific matchup ──
  if (matchup) {
    const parts = matchup.toUpperCase().split('-')
    if (parts.length !== 2) {
      return NextResponse.json({ error: 'matchup must be AWAY-HOME, e.g. TOR-MIA' }, { status: 400 })
    }
    const eventMap = await getNovibetEventMap()
    const eventIdForMatchup = eventMap.get(matchup.toUpperCase())
    const allOdds = await getAllNovibetOdds()
    const oddsForMatchup = allOdds.get(matchup.toUpperCase())

    return NextResponse.json({
      matchup: matchup.toUpperCase(),
      event_id: eventIdForMatchup ?? null,
      event_map_size: eventMap.size,
      event_map: Object.fromEntries(eventMap),
      odds: oddsForMatchup ?? null,
    })
  }

  // ── Full overview: all NBA events + odds ──
  const [eventMap, allOdds] = await Promise.all([
    getNovibetEventMap(),
    getAllNovibetOdds(),
  ])

  return NextResponse.json({
    events_found: eventMap.size,
    event_map: Object.fromEntries(eventMap),
    odds_fetched: allOdds.size,
    odds: Object.fromEntries(allOdds),
    tip: 'If events_found=0, the competition endpoint returned an unexpected shape. Check server logs for [Novibet] entries.',
  })
}
