# Camada de Tipos — types/index.ts

Todas as interfaces e tipos do projeto ficam em `types/index.ts`. Não criar arquivos de tipos separados — um único source of truth.

## Tipos Principais

```typescript
// Jogo NBA
interface NBAGame {
  id: string;
  home_team: string;
  away_team: string;
  home_team_id: number;
  away_team_id: number;
  game_date: string;           // ISO date
  status: 'scheduled' | 'live' | 'final';
  home_score?: number;
  away_score?: number;
  odds_data?: OddsData;
}

// Oportunidade de aposta (tabela bet_opportunities)
interface BetOpportunity {
  id?: string;
  game_id: string;
  bet_type: 'moneyline' | 'spread' | 'total' | 'player_prop';
  market: string;
  target?: string;
  novibet_odd: number;
  estimated_probability: number;   // 0–1
  confidence_level: 'HIGH' | 'VERY_HIGH' | 'EXTREME';
  method: string[];
  reasoning: string;
  historical_hit_rate: number;
  risk_flags: string[];
  created_at?: string;
}

// Resultado H2H
interface H2HResult {
  game_date: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  total: number;
}

// Dados de odds
interface OddsData {
  h2h?: { home: number; away: number };
  spread?: { line: number; home_odd: number; away_odd: number };
  total?: { line: number; over: number; under: number };
  player_props?: PlayerPropOdd[];
}

interface PlayerPropOdd {
  player: string;
  market: 'player_points' | 'player_rebounds' | 'player_assists';
  line: number;
  over: number;
  under: number;
}
```

## Convenções de Tipos
- Sem `any` — usar `unknown` e narrowing se necessário
- Interfaces para objetos de dados, `type` para unions e aliases
- Campos opcionais com `?` apenas quando genuinamente ausentes no contrato da API
- Não duplicar tipos entre `lib/` e `types/` — importar sempre de `types/index.ts`
