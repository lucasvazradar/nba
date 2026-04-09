# Camada de Páginas — App Router (Next.js 14)

## Estrutura de Rotas
```
app/
├── page.tsx           # Dashboard principal
├── layout.tsx         # Layout raiz com fontes e providers
└── games/
    └── [id]/page.tsx  # Detalhe de um jogo específico
```

## Design System — Paleta Visual
```css
/* Cores */
--bg-primary: #0a0f1e;      /* fundo escuro estilo war room */
--accent-green: #00ff88;    /* alto confidence (≥ 90%) */
--accent-yellow: #ffd700;   /* alertas e risk flags */
--text-primary: #ffffff;

/* Fontes */
--font-data: 'JetBrains Mono'; /* números, odds, percentuais */
--font-body: 'Inter';           /* texto corrido e labels */
```
Toda exibição de número (odds, probabilidade, pontos) deve usar JetBrains Mono.

## Dashboard Principal (`app/page.tsx`)
Componentes obrigatórios na ordem:
1. Header: logo + indicador "NBA TODAY" + botão "Analisar Todos"
2. Filtros: `[Todos] [Totals] [Spreads] [Player Props] [Moneyline]`
3. Grid de `<GameCard>` para os jogos do dia
4. Sidebar direita: Top 5 oportunidades ≥ 90% do dia

O botão "Analisar Todos" dispara `POST /api/analyze` para cada `game_id` do dia em paralelo (`Promise.allSettled`).

## Página de Detalhe (`app/games/[id]/page.tsx`)
Seções obrigatórias em ordem:
1. Header do confronto — times, data, odds Novibet atuais
2. Histórico L10 por time — tabela: data | adversário | pts | pts sofridos | resultado | Over/Under
3. Análise de pace e ritmo — gráfico de barras comparativo
4. Player Props — cards top 5 jogadores por time com hitRate vs linha
5. H2H — últimos 5 confrontos diretos
6. Recomendações da IA — lista de oportunidades com reasoning completo
7. Botão "Abrir Novibet" — deeplink para o jogo em `https://www.novibet.com.br/apostas/basquetebol/nba`

## Convenções de App Router
- Todas as pages são Server Components por padrão
- Usar `'use client'` apenas para componentes com interatividade (filtros, botões)
- Dados iniciais do dashboard: `fetch` no Server Component com `{ cache: 'no-store' }` para odds e `{ next: { revalidate: 21600 } }` (6h) para histórico
- Loading states: usar `loading.tsx` por rota
