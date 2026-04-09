# Camada de Serviços — lib/

## Arquivos e Responsabilidades

| Arquivo | Responsabilidade |
|---|---|
| `sportsdata.ts` | Client SportsDataIO — jogos, stats, lesões, projeções ML |
| `oddsapi.ts` | Client The Odds API — odds Novibet em tempo real |
| `claude.ts` | Client Anthropic — recebe métricas prontas, retorna oportunidades JSON |
| `analyzer.ts` | Lógica principal de análise e cálculo de métricas derivadas |
| `supabase.ts` | Client Supabase (servidor e cliente separados) |

---

## `sportsdata.ts` — Endpoints Utilizados (SportsDataIO)
```
Base URL: https://api.sportsdata.io/v3/nba
Header: Ocp-Apim-Subscription-Key: SPORTSDATA_API_KEY

# Jogos do dia (scores ao vivo + scheduled)
GET /scores/json/GamesByDate/{YYYY-MMM-DD}

# Últimas N partidas de um time
GET /stats/json/TeamGameStatsBySeason/{season}/{teamId}/last10

# Stats de jogadores por data (real-time no dia do jogo)
GET /stats/json/PlayerGameStatsByDate/{YYYY-MMM-DD}

# Lesões em tempo real
GET /scores/json/Injuries
# InjuryStatus: "Out" | "Questionable" | "Probable" | "FullParticipant"

# Projeções ML por jogador (atualizadas a cada 15min até tip-off, disponíveis 5 dias antes)
GET /projections/json/PlayerGameProjectionStatsByDate/{YYYY-MMM-DD}

# Standings + NetRating por time
GET /scores/json/Standings/{season}
```
As projeções do SportsDataIO substituem o cálculo manual de hitRate para player props — usar como dado adicional no payload enviado ao Claude.

## `oddsapi.ts` — Endpoint Utilizado
```
GET https://api.the-odds-api.com/v4/sports/basketball_nba/odds/
  ?apiKey=ODDS_API_KEY
  &regions=eu
  &markets=h2h,totals,spreads,player_points,player_rebounds,player_assists
  &bookmakers=novibet
```
Sempre verificar o header `x-requests-remaining` e logar quando < 50.

## `claude.ts` — Client Anthropic
- Model: `claude-sonnet-4-20250514`
- Temperatura: `0` (máxima consistência para análise quantitativa)
- Response format: JSON obrigatório (usar `tool_use` ou instruir no prompt)
- O system prompt está definido em `claude.ts` — não distribuir em outros arquivos

### System Prompt de Análise (resumo dos métodos)
Claude recebe métricas calculadas e deve identificar apostas com `estimated_probability >= 0.90`.

Métodos que Claude deve aplicar:
1. **PACE TRAP** — ambos os times top 25% pace → Over quase certo
2. **DEFENSIVE MISMATCH** — jogador ataca posição bottom-10 defensiva do adversário
3. **FATIGUE FACTOR** — visitante em 4ª partida de road trip vs mandante descansado
4. **STREAK MOMENTUM** — mandante em streak 6+ vitórias vs visitante com road record < 40%
5. **LINE VALUE** — linha defasada ≥ 8 pts após lesão/troca não refletida nas odds
6. **CONSISTENCY PROP** — jogador com Over em 9/10 ou 10/10 das últimas partidas

Formato de resposta obrigatório (JSON):
```json
{
  "opportunities": [
    {
      "bet_type": "total | spread | moneyline | player_prop",
      "market": "descrição exata",
      "target": "mercado ou jogador",
      "estimated_probability": 0.93,
      "confidence_level": "HIGH | VERY_HIGH | EXTREME",
      "methods_used": ["PACE_TRAP"],
      "reasoning": "3-5 linhas",
      "historical_hit_rate": 0.90,
      "risk_flags": []
    }
  ]
}
```

## `analyzer.ts` — Fluxo Principal
```typescript
export async function analyzeGame(gameId: string): Promise<BetOpportunity[]> {
  const game = await getGame(gameId);                              // SportsDataIO

  const [homeHistory, awayHistory, injuries, projections, odds] = await Promise.all([
    getLast10Games(game.home_team_id),                            // SportsDataIO stats
    getLast10Games(game.away_team_id),                            // SportsDataIO stats
    getInjuries(),                                                 // SportsDataIO: InjuryStatus
    getPlayerProjections(game.game_date),                         // SportsDataIO: ML projections
    getNovibetOdds(game),                                         // The Odds API
  ]);

  // Aplica RISK_FILTERS antes de qualquer análise
  if (hasKeyInjury(injuries, game) || isExtremeFatigue(homeHistory, awayHistory)) {
    return [];
  }

  const metrics = calculateMetrics(homeHistory, awayHistory, projections);
  const opportunities = await claudeAnalyze(game, metrics, odds, injuries);
  return opportunities.filter(o => o.estimated_probability >= 0.90);
}
```

### Métricas Calculadas (`TeamMetrics`)
```typescript
interface TeamMetrics {
  avgPointsScored: number;      // média L10
  avgPointsAllowed: number;
  overUnderRate: number;        // % jogos OVER na linha atual
  last10Record: string;         // ex: "7-3"
  homeAwayRecord: string;
  streak: string;               // ex: "W3" ou "L2"
  avgPace: number;
  avgPossessions: number;
  offensiveRating: number;      // pts por 100 posses
  defensiveRating: number;
  netRating: number;
  backToBack: boolean;
  restDays: number;
  injuryImpact: string[];
  h2hLast5: H2HResult[];
  h2hAvgTotal: number;
}

interface PlayerMetrics {
  player: string;
  last10Avg: { points: number; rebounds: number; assists: number; minutes: number };
  consistency: number;          // desvio padrão — menor = mais consistente
  trendSlope: number;           // positivo = em alta
  vsDefenseRating: number;
  propLine: number;             // linha Novibet
  hitRateOverLine: number;      // % Over na prop nas últimas 10
}
```

## `supabase.ts` — Dois Clients
- `createServerClient()` — para Route Handlers e Server Components (usa `SUPABASE_SERVICE_ROLE_KEY`)
- `createBrowserClient()` — para Client Components (usa `NEXT_PUBLIC_*` keys)
- Nunca usar o service role key no browser
