import { NextResponse } from 'next/server'
import { getAllNovibetOdds, getNovibetEventMap } from '@/lib/novibet'

export const runtime = 'nodejs'
export const maxDuration = 30

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Origin: 'https://www.novibet.bet.br',
  Referer: 'https://www.novibet.bet.br/',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('raw') // ?raw=1 mostra estrutura crua

  // ── Modo diagnóstico: mostra o JSON bruto da Novibet passo a passo ──
  if (raw) {
    const ts = Date.now()
    const url = `https://www.novibet.bet.br/spt/feed/marketviews/location/v2/4324/6051394/?lang=pt-BR&timeZ=E.%20South%20America%20Standard%20Time&oddsR=1&usrGrp=BR&timestamp=${ts}&filterAlias=`
    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' })
    const text = await res.text()
    const parsed = JSON.parse(text)
    const pages = Array.isArray(parsed) ? parsed : [parsed]

    const diag: Record<string, unknown> = {
      status: res.status,
      bytes: text.length,
      pages_count: pages.length,
    }

    for (let pi = 0; pi < pages.length; pi++) {
      const page = pages[pi]
      const betViews = page?.betViews ?? []
      diag[`page${pi}_betViews_count`] = betViews.length

      for (let bi = 0; bi < betViews.length; bi++) {
        const bv = betViews[bi]
        const ctx: string = bv?.competitionContextCaption ?? '?'
        const comps = bv?.competitions ?? []
        diag[`page${pi}_bv${bi}_ctx`] = ctx
        diag[`page${pi}_bv${bi}_ctx_upper`] = ctx.toUpperCase()
        diag[`page${pi}_bv${bi}_isBasket`] = ctx.toUpperCase().includes('BASQUET') || ctx.toUpperCase().includes('BASKET')
        diag[`page${pi}_bv${bi}_comps`] = comps.map((c: Record<string,unknown>) => c?.caption)

        if (ctx.toUpperCase().includes('BASQUET') || ctx.toUpperCase().includes('BASKET')) {
          for (const comp of comps) {
            const cn: string = (comp?.caption ?? '').toUpperCase()
            const events = comp?.events ?? []
            diag[`BASKET_comp_${comp?.caption}_events_count`] = events.length
            diag[`BASKET_comp_${comp?.caption}_isNBA`] = cn.includes('NBA')
            if (events.length > 0) {
              diag[`BASKET_comp_${comp?.caption}_ev0_keys`] = Object.keys(events[0])
              diag[`BASKET_comp_${comp?.caption}_ev0_betContextId`] = events[0].betContextId
              diag[`BASKET_comp_${comp?.caption}_ev0_additionalCaptions`] = events[0].additionalCaptions
            }
          }
        }
      }
    }

    return NextResponse.json(diag)
  }

  // ── Modo normal: odds parseadas ──
  const [eventMap, allOdds] = await Promise.all([
    getNovibetEventMap(),
    getAllNovibetOdds(),
  ])

  return NextResponse.json({
    events_found: eventMap.size,
    event_map: Object.fromEntries(eventMap),
    odds_fetched: allOdds.size,
    odds: Object.fromEntries(allOdds),
  })
}
