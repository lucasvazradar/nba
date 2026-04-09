# NBA Betting Intelligence — Regras Globais do Projeto

## Objetivo
App web fullstack para identificar oportunidades de apostas NBA com ≥ 90% de probabilidade de acerto, cruzando dados históricos, estatísticas de jogadores e odds da Novibet.

## Stack Técnica
| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend/API | Next.js Route Handlers |
| Banco de dados | Supabase (PostgreSQL) |
| Dados NBA | [SportsDataIO](https://sportsdata.io/nba-api) — jogos, stats, lesões, projeções ML (atualiza a cada 15min) |
| Análise com IA | Anthropic Claude API (`claude-sonnet-4-20250514`) — raciocínio sobre métricas das APIs |
| Odds Novibet | [The Odds API](https://the-odds-api.com) com `bookmakers=novibet` |
| Deploy | Vercel |

## Variáveis de Ambiente (`.env.local`)
```
SPORTSDATA_API_KEY=        # SportsDataIO: jogos, stats, lesões, projeções
ODDS_API_KEY=              # The Odds API: odds Novibet em tempo real
ANTHROPIC_API_KEY=         # Claude: análise inteligente
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
Nunca expor essas variáveis no cliente. Apenas `NEXT_PUBLIC_*` podem ser usadas no browser.

## Regras Globais de Desenvolvimento
- TypeScript estrito em todo o projeto — sem `any` implícito
- Todas as chamadas a APIs externas devem ter tratamento de erro explícito
- Dados sensíveis (chaves de API) só no servidor — nunca em `'use client'`
- Nunca commitar `.env.local`

## Filtros de Risco (aplicar em toda lógica de análise)
```typescript
const RISK_FILTERS = {
  keyPlayerInjury: true,        // jogador-chave lesionado com impacto > 20% dos pontos
  extremeFatigue: true,         // 4ª partida em 5 noites para qualquer time
  oddsUnavailable: true,        // odds Novibet indisponíveis
  highDivergence: (estimated: number, implied: number) =>
    Math.abs(estimated - implied) > 0.15,
};
```
Qualquer aposta que acione um filtro deve ser descartada antes de ser retornada ao usuário.

## Scheduler — Cronograma de Execução (Vercel Cron Jobs)
```
cron: "0 */2 * * *"
```
- 10h00 ET → busca jogos do dia
- 12h00 ET → primeira análise com odds
- 14h00 ET → reanálise (odds podem ter mudado)
- 16h00 ET → análise final antes dos jogos
- Durante jogos → atualiza scores ao vivo (se mercado live disponível)

## Schema do Banco de Dados (Supabase)
Ver `supabase/schema.sql`. As tabelas são:
- `nba_games` — jogos analisados (cache 6h)
- `team_history` — últimas 10 partidas por time
- `bet_opportunities` — oportunidades geradas pela IA
- `player_stats_cache` — cache de stats de jogadores
