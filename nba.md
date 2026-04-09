# NBA Betting Intelligence — Especificação para Claude Code

> App web para identificar oportunidades de apostas NBA com ≥ 90% de probabilidade de acerto, cruzando dados históricos, estatísticas de jogadores e odds da Novibet.

---

## 1. Visão Geral

### Objetivo
Construir uma aplicação web fullstack que:
1. Busca jogos NBA do dia/próximos dias via API pública
2. Analisa as últimas 10 partidas de cada equipe envolvida
3. Analisa estatísticas individuais dos jogadores quando relevante para props
4. Classifica oportunidades de aposta com probabilidade estimada ≥ 90%
5. Exibe odds em tempo real da Novibet para validação da entrada
6. Gera recomendações estruturadas com nível de confiança, método e justificativa

---

## 2. Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend/API | Next.js Route Handlers (API Routes) |
| Banco de dados | Supabase (PostgreSQL) |
| Dados NBA | [SportsDataIO NBA API](https://sportsdata.io/nba-api) — jogos, stats, lesões, projeções ML |
| Análise com IA | Anthropic Claude API (`claude-sonnet-4-20250514`) — raciocínio sobre dados recebidos das APIs |
| Odds Novibet | [The Odds API](https://the-odds-api.com) com `bookmakers=novibet` |
| Autenticação | Supabase Auth (opcional para MVP) |
| Deploy | Vercel |

---

## 3. Fontes de Dados

### 3.1 Jogos, Estatísticas, Lesões e Projeções — SportsDataIO
```
Base URL: https://api.sportsdata.io/v3/nba

# Jogos do dia
GET /scores/json/GamesByDate/{YYYY-MMM-DD}
  ?key=SPORTSDATA_API_KEY

# Últimas 10 partidas de um time (season logs)
GET /stats/json/TeamGameStatsBySeason/{season}/{teamId}/last10
  ?key=SPORTSDATA_API_KEY

# Stats de jogadores por jogo
GET /stats/json/PlayerGameStatsByDate/{YYYY-MMM-DD}
  ?key=SPORTSDATA_API_KEY

# Lesões em tempo real (InjuryStatus: Out | Questionable | Probable)
GET /scores/json/Injuries
  ?key=SPORTSDATA_API_KEY

# Projeções de jogadores (atualizadas a cada 15min até o tip-off)
GET /projections/json/PlayerGameProjectionStatsByDate/{YYYY-MMM-DD}
  ?key=SPORTSDATA_API_KEY

# Standings e NetRating
GET /scores/json/Standings/{season}
  ?key=SPORTSDATA_API_KEY
```
> Projeções ficam disponíveis 5 dias antes e são customizadas às 9h30 ET do dia do jogo.

### 3.2 Odds Novibet — The Odds API
```
GET https://api.the-odds-api.com/v4/sports/basketball_nba/odds/
  ?apiKey=ODDS_API_KEY
  &regions=eu
  &markets=h2h,totals,spreads,player_points,player_rebounds,player_assists
  &bookmakers=novibet
```
Sempre verificar header `x-requests-remaining` — logar quando < 50.

### 3.3 Como o Claude usa esses dados
Claude **não acessa APIs diretamente**. O fluxo é:
1. As APIs (SportsDataIO + The Odds API) fornecem os dados do dia
2. `lib/analyzer.ts` calcula as métricas derivadas (pace, netRating, hitRate, etc.)
3. Claude recebe as métricas prontas e raciocina para identificar padrões de ≥ 90%
4. Claude retorna JSON estruturado com as oportunidades

```
POST https://api.anthropic.com/v1/messages
Model: claude-sonnet-4-20250514
```

---

## 4. Estrutura do Projeto

```
nba-betting/
├── app/
│   ├── page.tsx                    # Dashboard principal
│   ├── layout.tsx
│   ├── games/
│   │   └── [id]/page.tsx          # Detalhe de um jogo
│   └── api/
│       ├── games/route.ts          # Busca jogos do dia
│       ├── history/route.ts        # Últimas 10 partidas de um time
│       ├── players/route.ts        # Stats de jogadores
│       ├── odds/route.ts           # Odds Novibet via The Odds API
│       └── analyze/route.ts        # Análise IA com Claude
├── components/
│   ├── GameCard.tsx               # Card de cada jogo
│   ├── BetOpportunity.tsx         # Card de oportunidade de aposta
│   ├── TeamHistory.tsx            # Tabela das últimas 10 partidas
│   ├── PlayerProps.tsx            # Props de jogadores
│   ├── ConfidenceBadge.tsx        # Badge 90%+ verde
│   └── OddsDisplay.tsx            # Display de odds Novibet
├── lib/
│   ├── sportsdata.ts              # Client SportsDataIO (jogos, stats, lesões, projeções)
│   ├── oddsapi.ts                 # Client The Odds API (odds Novibet)
│   ├── claude.ts                  # Client Anthropic (recebe métricas, retorna oportunidades)
│   ├── analyzer.ts                # Lógica principal de análise e cálculo de métricas
│   └── supabase.ts                # Client Supabase
├── types/
│   └── index.ts                   # Tipos TypeScript
├── .env.local                     # Variáveis de ambiente
└── CLAUDE.md                      # Este arquivo
```

---

## 5. Variáveis de Ambiente

```env
# .env.local
SPORTSDATA_API_KEY=sua_chave_sportsdata_io      # dados NBA: jogos, stats, lesões, projeções
ODDS_API_KEY=sua_chave_the_odds_api              # odds Novibet em tempo real
ANTHROPIC_API_KEY=sua_chave_anthropic            # análise inteligente com Claude
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
```

---

## 6. Schema do Banco de Dados (Supabase)

```sql
-- Jogos analisados (cache para evitar re-chamadas à API)
CREATE TABLE nba_games (
  id TEXT PRIMARY KEY,               -- ID do jogo (Ball Don't Lie)
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  game_date DATE NOT NULL,
  status TEXT,                       -- scheduled | live | final
  home_score INT,
  away_score INT,
  odds_data JSONB,                   -- odds brutas da Novibet
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Histórico das últimas 10 partidas por time
CREATE TABLE team_history (
  id SERIAL PRIMARY KEY,
  team_id INT NOT NULL,
  team_name TEXT NOT NULL,
  game_id TEXT NOT NULL,
  game_date DATE,
  opponent TEXT,
  points_scored INT,
  points_allowed INT,
  won BOOLEAN,
  pace FLOAT,
  three_point_pct FLOAT,
  raw_stats JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Oportunidades de aposta geradas pela IA
CREATE TABLE bet_opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id TEXT REFERENCES nba_games(id),
  bet_type TEXT NOT NULL,            -- moneyline | spread | total | player_prop
  market TEXT NOT NULL,              -- ex: "over 224.5 pts", "Curry +25.5 pts"
  target TEXT,                       -- jogador ou mercado
  novibet_odd FLOAT,
  estimated_probability FLOAT,       -- entre 0 e 1
  confidence_level TEXT,             -- HIGH | VERY_HIGH | EXTREME
  method TEXT[],                     -- métodos usados na análise
  reasoning TEXT,                    -- justificativa gerada pela IA
  historical_hit_rate FLOAT,         -- taxa de acerto do padrão histórico
  risk_flags TEXT[],                 -- alertas (lesão, back-to-back, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache de estatísticas de jogadores
CREATE TABLE player_stats_cache (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL,
  player_name TEXT NOT NULL,
  last_10_games JSONB NOT NULL,
  averages JSONB,                    -- média calculada das últimas 10
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Lógica de Análise — `lib/analyzer.ts`

### 7.1 Fluxo Principal

```typescript
export async function analyzeGame(gameId: string): Promise<BetOpportunity[]> {
  // 1. Busca dados do jogo
  const game = await getGame(gameId);
  
  // 2. Busca últimas 10 partidas de cada time
  const [homeHistory, awayHistory] = await Promise.all([
    getLast10Games(game.home_team_id),
    getLast10Games(game.away_team_id)
  ]);
  
  // 3. Busca odds Novibet (h2h, totals, spreads, player props)
  const odds = await getNovibetOdds(game);
  
  // 4. Busca stats dos principais jogadores (top 5 por time)
  const playerStats = await getKeyPlayersStats(game);
  
  // 5. Calcula métricas derivadas
  const metrics = calculateMetrics(homeHistory, awayHistory, playerStats);
  
  // 6. Envia tudo para Claude analisar
  const opportunities = await claudeAnalyze(game, metrics, odds);
  
  // 7. Filtra apenas oportunidades ≥ 90%
  return opportunities.filter(o => o.estimated_probability >= 0.90);
}
```

### 7.2 Métricas Calculadas Automaticamente

```typescript
interface TeamMetrics {
  // Tendências ofensivas/defensivas
  avgPointsScored: number;       // média de pontos marcados (L10)
  avgPointsAllowed: number;      // média de pontos sofridos (L10)
  overUnderRate: number;         // % de jogos que foram OVER da linha atual
  
  // Performance recente
  last10Record: string;          // ex: "7-3"
  homeAwayRecord: string;        // desempenho como mandante/visitante
  streak: string;                // ex: "W3" ou "L2"
  
  // Ritmo de jogo
  avgPace: number;               // posses por jogo (impacta totals)
  avgPossessions: number;
  
  // Eficiência
  offensiveRating: number;       // pontos por 100 posses
  defensiveRating: number;
  netRating: number;
  
  // Situacional
  backToBack: boolean;           // time jogou ontem?
  restDays: number;              // dias de descanso
  injuryImpact: string[];        // jogadores ausentes (se disponível)
  
  // H2H
  h2hLast5: H2HResult[];        // últimos 5 confrontos diretos
  h2hAvgTotal: number;          // média de pontos totais no H2H
}

interface PlayerMetrics {
  player: string;
  last10Avg: {
    points: number;
    rebounds: number;
    assists: number;
    minutes: number;
  };
  consistency: number;           // desvio padrão (menor = mais consistente)
  trendSlope: number;            // positivo = em alta, negativo = em queda
  vsDefenseRating: number;       // performance vs defesa do adversário de hoje
  propLine: number;              // linha proposta pela Novibet
  hitRateOverLine: number;       // % que passou a linha nas últimas 10
}
```

### 7.3 Prompt para Claude — Sistema de Análise

```typescript
const SYSTEM_PROMPT = `
Você é um analista quantitativo especialista em apostas NBA com foco em alta probabilidade.

Seu objetivo é identificar apostas com ≥ 90% de probabilidade real de acerto.
A odd não importa — o que importa é a certeza estatística do resultado.

MÉTODOS DE ANÁLISE que você deve aplicar:

1. TENDÊNCIA DE TOTAIS (Over/Under)
   - Se um time teve Over em 8+ das últimas 10: forte tendência Over
   - Cruzar com pace do adversário: dois times de alto pace = Over quase certo
   - Verificar se a linha da Novibet está desatualizada em relação à tendência

2. SPREAD/HANDICAP
   - Analisar ATS (Against The Spread) das últimas 10 partidas
   - Times favoritos em casa com +5 de diferença de NetRating = cobertura frequente
   - Identificar situações de "motivação assimétrica" (time sem nada a perder vs playoff race)

3. PLAYER PROPS
   - Jogador com hitRate > 80% na linha proposta nas últimas 10 = forte
   - Verificar se adversário de hoje tem defesa fraca na posição do jogador
   - Evitar se o jogador tiver padrão de gestão de minutos (back-to-back)
   - Analisar tendência: médias das últimas 3 vs últimas 10

4. MONEYLINE
   - Evitar surpresas: só recomendar moneyline se houver desequilíbrio claro
   - Critério: diferença de NetRating > 8 pontos + mandante + adversário em back-to-back

5. PADRÕES DE ALTO ACERTO (≥90%)
   - Time de alto pace (top 5 NBA) vs defesa lenta → Over quase garantido
   - Jogador estrela com média 28+ pts vs bottom-5 defesa → prop Over pts
   - Time em streak de 5+ vitórias em casa vs visitante em road trip de 4+ jogos
   - Dois times com médias de pontos combinadas de 240+ → Over na linha de 220-225

FORMATO DE RESPOSTA (JSON obrigatório):
{
  "opportunities": [
    {
      "bet_type": "total | spread | moneyline | player_prop",
      "market": "descrição exata da aposta",
      "target": "nome do mercado ou jogador",
      "estimated_probability": 0.93,
      "confidence_level": "HIGH | VERY_HIGH | EXTREME",
      "methods_used": ["TENDÊNCIA_TOTAL", "PACE_MATCHUP"],
      "reasoning": "explicação em 3-5 linhas do porquê desta aposta",
      "historical_hit_rate": 0.90,
      "risk_flags": ["back_to_back", "injury_concern"] // ou []
    }
  ]
}

Só inclua apostas com estimated_probability ≥ 0.90.
Se não houver oportunidades claras, retorne { "opportunities": [] }.
`;
```

---

## 8. Interface do Usuário

### 8.1 Dashboard Principal (`app/page.tsx`)

**Layout:**
- Header com logo + indicador "NBA TODAY" + botão "Analisar Todos"
- Filtros: [Todos] [Totals] [Spreads] [Player Props] [Moneyline]
- Grid de GameCards para jogos do dia
- Sidebar direita: Top 5 oportunidades ≥ 90% do dia

**Paleta visual:**
- Fundo escuro (#0a0f1e) estilo war room
- Accent verde (#00ff88) para alto confidence
- Accent amarelo (#ffd700) para alertas
- Fonte: JetBrains Mono para dados, Inter para texto corrido

### 8.2 GameCard Component

```
┌─────────────────────────────────────────────────┐
│  [Logo] CELTICS  vs  LAKERS [Logo]    21h30 ET  │
│  Boston -4.5 · O/U 224.5                        │
├─────────────────────────────────────────────────┤
│  📊 Últimas 10:  BOS 8-2  ·  LAL 4-6           │
│  ⚡ Pace:  BOS 102.1  ·  LAL 98.4              │
│  🔥 BOS Over Rate:  70%  ·  LAL Over Rate: 60%  │
├─────────────────────────────────────────────────┤
│  🎯 OPORTUNIDADES IDENTIFICADAS                 │
│  ┌──────────────────────────────────────────┐   │
│  │ OVER 224.5  · Confiança: 94%  🟢 EXTREMO │   │
│  │ "Dois times de alto pace. BOS teve       │   │
│  │  Over em 8/10, LAL em 6/10..."           │   │
│  │ Odd Novibet: 1.87                        │   │
│  └──────────────────────────────────────────┘   │
│  [Ver análise completa →]                       │
└─────────────────────────────────────────────────┘
```

### 8.3 Página de Detalhe do Jogo (`app/games/[id]/page.tsx`)

**Seções:**
1. **Header do confronto** — times, data, odds Novibet atuais
2. **Histórico L10 por time** — tabela: data | adversário | pts | pts sofridos | resultado | Over/Under
3. **Análise de pace e ritmo** — gráfico de barras comparativo
4. **Player Props** — cards dos top 5 jogadores por time com hitRate vs linha
5. **H2H (Histórico direto)** — últimos 5 confrontos entre os dois times
6. **Recomendações da IA** — lista de oportunidades com reasoning completo
7. **Botão** — "Abrir Novibet" deeplink para o jogo

---

## 9. API Routes

### `GET /api/games`
```typescript
// Retorna jogos do dia + próximos 2 dias
// Query params: ?date=2025-04-08
// Fonte: Ball Don't Lie API
```

### `GET /api/history?team_id=X&limit=10`
```typescript
// Retorna últimas 10 partidas do time
// Cache no Supabase por 6h
```

### `GET /api/odds?game_id=X`
```typescript
// Retorna odds Novibet via The Odds API
// Mercados: h2h, totals, spreads, player_points, player_rebounds, player_assists
// Cache no Supabase por 5min
```

### `POST /api/analyze`
```typescript
// Body: { game_id: string }
// Orquestra toda a análise e chama Claude
// Salva resultado no Supabase
// Retorna BetOpportunity[]
```

### `GET /api/opportunities?min_prob=0.90`
```typescript
// Retorna todas as oportunidades do dia filtradas por probabilidade mínima
// Ordenadas por estimated_probability DESC
```

---

## 10. Métodos e Estratégias de Alta Probabilidade

### Método 1 — PACE TRAP (Over Totals)
**Quando usar:** Ambos os times no top 25% de pace da liga  
**Indicador:** avgPace > 100 para os dois times  
**Hit rate histórico:** ~85-92% nos jogos que se encaixam  
**Ação:** Apostar Over na linha proposta

### Método 2 — DEFENSIVE MISMATCH (Player Props)
**Quando usar:** Jogador ataca posição onde o adversário é bottom-10 na liga  
**Indicador:** adversário permite +5 pts acima da média para aquela posição  
**Hit rate histórico:** ~80-88%  
**Ação:** Apostar Over na prop de pontos do jogador

### Método 3 — FATIGUE FACTOR (Spread/Moneyline)
**Quando usar:** Visitante em 4ª partida de road trip ou back-to-back  
**Cruzar com:** Mandante com ≥ 3 dias de descanso  
**Hit rate histórico:** ~82-90%  
**Ação:** Apostar no mandante -spread ou moneyline

### Método 4 — STREAK MOMENTUM (Moneyline)
**Quando usar:** Time em streak de 6+ vitórias consecutivas em casa  
**Cruzar com:** Adversário com road record negativo (< 40% como visitante)  
**Hit rate histórico:** ~87-93%  
**Ação:** Apostar no mandante moneyline

### Método 5 — LINE VALUE (Totals)
**Quando usar:** Casa de apostas não atualizou a linha após troca de titulares ou lesão anunciada  
**Indicador:** Linha de total defasada ≥ 8 pontos em relação ao expected  
**Hit rate histórico:** ~88-95% (quando bem identificado)  
**Ação:** Apostar no lado favorecido pela defasagem

### Método 6 — CONSISTENCY PROP (Player Props)
**Quando usar:** Jogador teve Over na prop em 9/10 ou 10/10 últimas partidas  
**Cruzar com:** Sem lesão, sem back-to-back, adversário não é top-3 defesa  
**Hit rate histórico:** ~90-95%  
**Ação:** Apostar Over na prop — máxima confiança

---

## 11. Regras de Risco e Filtros de Segurança

```typescript
// Nunca recomendar aposta se:
const RISK_FILTERS = {
  // Time principal com jogador-chave lesionado (impacto > 20% dos pontos)
  keyPlayerInjury: true,
  
  // Jogo é o 4º em 5 noites para qualquer um dos times
  extremeFatigue: true,
  
  // Odds Novibet indisponíveis (não conseguiu buscar)
  oddsUnavailable: true,
  
  // Divergência entre estimated_probability e implied_probability da odd > 15%
  // (pode indicar erro na análise)
  highDivergence: (estimated: number, implied: number) => 
    Math.abs(estimated - implied) > 0.15,
};
```

---

## 12. Cronograma de Execução Automática

```typescript
// Scheduler (pode usar Vercel Cron Jobs)
// cron: "0 */2 * * *" — atualiza a cada 2 horas durante o dia NBA

// Fluxo automático:
// 1. 10h00 ET — busca jogos do dia
// 2. 12h00 ET — primeira análise com odds do dia
// 3. 14h00 ET — reanálise (odds podem ter mudado)
// 4. 16h00 ET — análise final antes do início dos jogos
// 5. Durante jogos — atualiza scores ao vivo (se mercados live disponíveis)
```

---

## 13. Como Executar (Setup)

```bash
# 1. Clonar e instalar
npx create-next-app@latest nba-betting --typescript --tailwind --app
cd nba-betting
npm install @supabase/supabase-js @anthropic-ai/sdk puppeteer axios

# 2. Configurar variáveis
cp .env.example .env.local
# Preencher todas as chaves no .env.local

# 3. Rodar migrations Supabase
# Colar o schema SQL no Supabase Studio > SQL Editor

# 4. Iniciar
npm run dev
# Acessar http://localhost:3000
```

---

## 14. Roadmap de Melhorias Futuras

| Feature | Prioridade | Complexidade |
|---------|-----------|-------------|
| Notificação WhatsApp (Uazapi) quando nova oportunidade ≥ 95% | Alta | Média |
| Backtesting automático das recomendações passadas | Alta | Alta |
| Live odds tracking (websocket durante jogos) | Média | Alta |
| Score tracker para validar acerto das apostas | Alta | Média |
| Dashboard de ROI acumulado | Alta | Média |
| Multi-liga (WNBA, Eurocup) | Baixa | Baixa |
| App mobile (PWA) | Média | Baixa |
| Alertas de value bet por email/Telegram | Alta | Baixa |

---

## 15. Referências e APIs

- [Ball Don't Lie API Docs](https://www.balldontlie.io/home.html#introduction)
- [The Odds API Docs](https://the-odds-api.com/liveapi/guides/v4/)
- [Anthropic Claude API](https://docs.anthropic.com)
- [Supabase Docs](https://supabase.com/docs)
- [Next.js 14 App Router](https://nextjs.org/docs)
- [Novibet Brasil](https://www.novibet.com.br/apostas/basquetebol/nba)

---

*Gerado para uso com Claude Code — `claude nba.md` para iniciar a implementação*
