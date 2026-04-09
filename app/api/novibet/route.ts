import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Tenta buscar odds diretamente da API interna da Novibet Brasil.
 * O event_id vem da URL do site: novibet.bet.br/apostas-esportivas/matches/xxx/e44453955
 * GET /api/novibet?event_id=e44453955
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')

  if (!eventId) {
    return NextResponse.json({ error: 'Passe ?event_id=e44453955' }, { status: 400 })
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Origin': 'https://www.novibet.bet.br',
    'Referer': 'https://www.novibet.bet.br/',
  }

  const results: Record<string, unknown> = { event_id: eventId }

  // Tentar vários padrões de API que plataformas de apostas usam
  const endpoints = [
    `https://www.novibet.bet.br/api/sportsbook/v2/events/${eventId}/markets`,
    `https://www.novibet.bet.br/api/sports/events/${eventId}`,
    `https://www.novibet.bet.br/api/sportsbetting/v2/sportsbook/events/${eventId}`,
    `https://api.novibet.bet.br/v1/events/${eventId}/markets`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers, cache: 'no-store' })
      results[url.replace('https://www.novibet.bet.br', '')] = {
        status: res.status,
        preview: (await res.text()).slice(0, 300),
      }
    } catch (e) {
      results[url.replace('https://www.novibet.bet.br', '')] = { error: String(e) }
    }
  }

  return NextResponse.json(results)
}
