import { NextResponse } from 'next/server'

const OA_KEY = process.env.ODDS_API_KEY ?? 'MISSING'

async function probe(label: string, url: string) {
  const res = await fetch(url, { cache: 'no-store' })
  const text = await res.text()
  return { label, status: res.status, preview: text.slice(0, 600) }
}

export async function GET() {
  const results = await Promise.all([
    // 1. Check if 'novibet' bookmaker appears in ANY region for NBA
    probe('novibet_eu', `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=eu&bookmakers=novibet&markets=totals`),
    probe('novibet_us', `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=us&bookmakers=novibet&markets=totals`),
    probe('novibet_uk', `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=uk&bookmakers=novibet&markets=totals`),

    // 2. Full bookmaker list for NBA in EU to see what's available
    probe('eu_bookmakers_nba', `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${OA_KEY}&regions=eu&markets=totals`),

    // 3. Try Novibet's internal web API (reverse engineered from browser requests)
    probe('novibet_internal', 'https://www.novibet.com.br/api/sportsbetting/v2/sportsbook/events?sportId=2&competitionId=251'),
  ])

  // Extract bookmaker keys from eu_bookmakers_nba
  let euBookmakers: string[] = []
  try {
    const data = JSON.parse(results[3].preview)
    if (Array.isArray(data) && data[0]?.bookmakers) {
      euBookmakers = data[0].bookmakers.map((b: { key: string }) => b.key)
    }
  } catch { /* truncated */ }

  return NextResponse.json({
    novibet_available: results.slice(0, 3).map((r) => ({
      region: r.label,
      status: r.status,
      has_data: r.preview.includes('"bookmakers":[{'),
      preview: r.preview.slice(0, 200),
    })),
    eu_bookmakers_available: euBookmakers,
    novibet_internal_api: {
      status: results[4].status,
      preview: results[4].preview.slice(0, 300),
    },
  })
}
