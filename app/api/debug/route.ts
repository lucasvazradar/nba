import { NextResponse } from 'next/server'

const OA_KEY = process.env.ODDS_API_KEY ?? 'MISSING'

async function probe(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const text = await res.text()
    return { status: res.status, preview: text.slice(0, 500) }
  } catch (err) {
    return { status: 0, preview: String(err) }
  }
}

export async function GET() {
  try {
    const [eu, us, uk, euAll] = await Promise.all([
      probe(`https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=eu&bookmakers=novibet&markets=totals`),
      probe(`https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=us&bookmakers=novibet&markets=totals`),
      probe(`https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=uk&bookmakers=novibet&markets=totals`),
      probe(`https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=eu,us,uk,au&markets=totals`),
    ])

    // Extract bookmakers from the wide-net call
    let bookmakers: string[] = []
    try {
      const data = JSON.parse(euAll.preview)
      if (Array.isArray(data) && data[0]?.bookmakers) {
        bookmakers = [...new Set(data.flatMap((e: { bookmakers: { key: string }[] }) => e.bookmakers.map((b) => b.key)))]
      }
    } catch { /* truncated json */ }

    return NextResponse.json({
      novibet_in_eu: { status: eu.status, has_data: eu.preview.includes('"key":"novibet"') },
      novibet_in_us: { status: us.status, has_data: us.preview.includes('"key":"novibet"') },
      novibet_in_uk: { status: uk.status, has_data: uk.preview.includes('"key":"novibet"') },
      all_bookmakers_available: bookmakers,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
