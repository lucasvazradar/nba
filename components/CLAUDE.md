# Camada de Componentes — UI (React + Tailwind)

## Componentes e Responsabilidades

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| `GameCard` | `GameCard.tsx` | Card de cada jogo com times, odds, últimas 10 e oportunidades |
| `BetOpportunity` | `BetOpportunity.tsx` | Card individual de uma oportunidade de aposta |
| `TeamHistory` | `TeamHistory.tsx` | Tabela das últimas 10 partidas de um time |
| `PlayerProps` | `PlayerProps.tsx` | Cards dos top 5 jogadores com hitRate vs linha |
| `ConfidenceBadge` | `ConfidenceBadge.tsx` | Badge de nível de confiança (HIGH / VERY_HIGH / EXTREME) |
| `OddsDisplay` | `OddsDisplay.tsx` | Display das odds Novibet formatadas |

## Estrutura do `GameCard`
```
┌─────────────────────────────────────────────────┐
│  [Logo] TEAM A  vs  TEAM B [Logo]    HH:MM ET   │
│  TeamA -X.X · O/U XXX.X                         │
├─────────────────────────────────────────────────┤
│  Últimas 10: A X-X · B X-X                      │
│  Pace: A XXX.X · B XXX.X                        │
│  A Over Rate: XX% · B Over Rate: XX%            │
├─────────────────────────────────────────────────┤
│  OPORTUNIDADES IDENTIFICADAS                     │
│  ┌──────────────────────────────────────────┐   │
│  │ <BetOpportunity />                       │   │
│  └──────────────────────────────────────────┘   │
│  [Ver análise completa →]                        │
└─────────────────────────────────────────────────┘
```

## `ConfidenceBadge` — Mapeamento de Cores
```typescript
const BADGE_COLORS = {
  HIGH:      'bg-yellow-500 text-black',   // 90–92%
  VERY_HIGH: 'bg-green-400 text-black',    // 93–96%
  EXTREME:   'bg-[#00ff88] text-black',    // 97%+
};
```
O badge deve exibir o percentual numérico além do label, ex: `EXTREMO · 94%`.

## `BetOpportunity` — Campos Obrigatórios
Deve exibir:
- `market` (ex: "OVER 224.5")
- `confidence_level` via `<ConfidenceBadge>`
- `estimated_probability` formatado como percentual
- `novibet_odd` via `<OddsDisplay>`
- `reasoning` (primeiras 2 linhas, expandível)
- `risk_flags` como tags amarelas (se houver)

## Convenções de Componentes
- Todos os componentes são `'use client'` apenas se tiverem estado ou eventos de browser
- Props tipadas com interfaces em `types/index.ts` — nunca `any`
- Números (odds, probabilidades, pontos, pace): sempre formatar com `Intl.NumberFormat` ou `.toFixed()`
- Não criar componentes genéricos reutilizáveis especulativos — implementar apenas o que a spec pede
