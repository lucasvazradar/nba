# Camada de API — Route Handlers (Next.js 14)

## Rotas e Responsabilidades

### `GET /api/games`
- Fonte: SportsDataIO `/scores/json/GamesByDate/{date}`
- Query param: `?date=YYYY-MM-DD` (default: hoje)
- Retorna jogos do dia + próximos 2 dias com status ao vivo
- Cache: 5min no Supabase (scores mudam durante o dia)

### `GET /api/history`
- Query params: `?team_id=X&limit=10`
- Fonte: SportsDataIO `/stats/json/TeamGameStatsBySeason/{season}/{teamId}/last10`
- Cache: 6h no Supabase (tabela `team_history`)
- Inclui pace, netRating, over/under result por jogo

### `GET /api/odds`
- Query param: `?game_id=X`
- Fonte primária: The Odds API com `bookmakers=novibet`
- Mercados obrigatórios: `h2h,totals,spreads,player_points,player_rebounds,player_assists`
- Cache: 5 minutos no Supabase
- Fallback: Puppeteer headless em `https://www.novibet.com.br/apostas/basquetebol/nba`
- Se odds indisponíveis em ambas as fontes: retornar `{ error: 'odds_unavailable' }` — **não analisar**

### `POST /api/analyze`
- Body: `{ game_id: string }`
- Orquestra toda a análise:
  1. Busca `GET /api/history` para ambos os times
  2. Busca `GET /api/odds` para o jogo
  3. Busca stats dos top 5 jogadores por time (`GET /api/players`)
  4. Calcula métricas via `lib/analyzer.ts`
  5. Chama Claude via `lib/claude.ts`
  6. Aplica RISK_FILTERS (ver CLAUDE.md raiz)
  7. Salva em `bet_opportunities` no Supabase
  8. Retorna `BetOpportunity[]`
- Apenas oportunidades com `estimated_probability >= 0.90` são salvas e retornadas

### `GET /api/opportunities`
- Query param: `?min_prob=0.90`
- Retorna todas as oportunidades do dia filtradas por probabilidade mínima
- Ordenadas por `estimated_probability DESC`
- Fonte: tabela `bet_opportunities` do Supabase

### `GET /api/players`
- Query param: `?date=YYYY-MM-DD`
- Fonte: SportsDataIO `/stats/json/PlayerGameStatsByDate/{date}` (stats reais) + `/projections/json/PlayerGameProjectionStatsByDate/{date}` (projeções ML)
- Retorna top 5 jogadores por time com stats históricas + projeção do dia
- Cache: Supabase tabela `player_stats_cache` — 15min (projeções atualizam com frequência)

### `GET /api/injuries`
- Fonte: SportsDataIO `/scores/json/Injuries`
- Retorna todos os jogadores com `InjuryStatus != FullParticipant`
- Cache: 10min — lesões podem ser anunciadas próximo ao jogo
- Usado pelo `analyzer.ts` para aplicar RISK_FILTERS antes da análise

## Convenções de Route Handlers
- Sempre retornar `NextResponse.json()` com status code explícito
- Erros de API externa: logar o erro e retornar status 502 com `{ error: string }`
- Timeout padrão para chamadas externas: 10s
- Não expor chaves de API em respostas — nunca incluir env vars no response body
