'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { NBAGame, BetOpportunity, BetType, ConfidenceLevel, PlacedBet } from '@/types'
import { ConfidenceBadge } from '@/components/ConfidenceBadge'
import { OddsDisplay } from '@/components/OddsDisplay'
import { DateNav } from '@/components/DateNav'

const FILTERS: { label: string; value: BetType | 'all' }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Total de Pontos', value: 'total' },
  { label: 'Handicap', value: 'spread' },
  { label: 'Props de Jogadores', value: 'player_prop' },
  { label: 'Moneyline', value: 'moneyline' },
]

const BET_TYPE_PT: Record<BetType, string> = {
  total: 'Total',
  spread: 'Handicap',
  player_prop: 'Prop',
  moneyline: 'Moneyline',
}

// ─── Risk flag descriptions ───────────────────────────────────────────────────

const RISK_FLAG_INFO: Record<string, { label: string; description: string }> = {
  linha_suspeita_muito_baixa: {
    label: 'Linha suspeita — muito baixa',
    description:
      'A linha de total está muito abaixo da média histórica dos dois times. Bookmakers podem ter informação privilegiada (lesão não anunciada, jogo tático com ritmo lento) ou esta é uma armadilha. Apostar OVER em linha anormalmente baixa carrega risco elevado de valor negativo.',
  },
  linha_suspeita_baixa: {
    label: 'Linha suspeita — abaixo do histórico',
    description:
      'A linha está abaixo do que o histórico combinado dos times sugere. Pode indicar que a bookmaker ajustou por fatores externos ainda não divulgados publicamente (ex: ausência de reserva-chave, plano de jogo conservador).',
  },
  linha_suspeita: {
    label: 'Linha suspeita',
    description:
      'A linha diverge do esperado pelos dados históricos. A bookmaker pode precificar algo que os dados públicos ainda não refletem. Aposte com cautela e verifique notícias de última hora antes do jogo.',
  },
  dados_conflitantes: {
    label: 'Dados conflitantes',
    description:
      'Os indicadores apontam em direções opostas: parte do histórico favorece a aposta enquanto outra parte a contradiz. Por exemplo, a média histórica apoia OVER mas o pace recente caiu. Baixa convicção — pode ser um falso positivo.',
  },
  momentum_contrario: {
    label: 'Momentum contrário',
    description:
      'O time está apostando contra o próprio momento recente. A sequência atual (derrotas, queda de pontos) contradiz a direção da aposta. O histórico de longo prazo sustenta a recomendação, mas o curto prazo é desfavorável.',
  },
  streak_negativo: {
    label: 'Sequência negativa',
    description:
      'O time está em uma sequência recente de derrotas ou baixo desempenho ofensivo. Mesmo que os dados gerais suportem a aposta, times em queda de confiança tendem a performar abaixo da média histórica.',
  },
  back_to_back: {
    label: 'Back-to-back (jogo consecutivo)',
    description:
      'Um ou ambos os times jogam pela segunda noite consecutiva. A fadiga física reduz o ritmo de jogo, aumenta a taxa de erros e pode comprimir o total de pontos em 5–8 pts abaixo da média. Risco real de desempenho abaixo do esperado.',
  },
  sem_odds_reais: {
    label: 'Odds estimadas (sem Novibet)',
    description:
      'A Novibet (via The Odds API) não está oferecendo odds para este jogo no momento. As odds foram calculadas internamente a partir do histórico dos times. A margem real da bookmaker pode ser diferente — aposte apenas se as odds aparecerem no site.',
  },
  odds_via_draftkings: {
    label: '⚠ Odd via DraftKings (não é Novibet)',
    description:
      'A Novibet não está disponível na API de odds para este jogo. A odd exibida é da DraftKings (mercado americano) e pode ser DIFERENTE da odd real na Novibet Brasil. SEMPRE verifique a odd atual no site da Novibet antes de apostar. Use este valor apenas como referência de mercado.',
  },
  odds_via_pinnacle: {
    label: '⚠ Odd via Pinnacle (não é Novibet)',
    description:
      'A Novibet não está disponível na API de odds para este jogo. A odd exibida é da Pinnacle (mercado europeu, sharp money) e pode diferir da Novibet Brasil. Pinnacle tende a ter odds mais justas que a média — use como referência mas verifique na Novibet antes de apostar.',
  },
  odds_via_fanduel: {
    label: '⚠ Odd via FanDuel (não é Novibet)',
    description:
      'A Novibet não está disponível na API de odds para este jogo. A odd exibida é da FanDuel (mercado americano) e pode ser diferente da Novibet Brasil. SEMPRE confira a odd atual no site da Novibet antes de apostar.',
  },
  lesao_key_player: {
    label: 'Lesão de jogador-chave',
    description:
      'Um jogador responsável por 20%+ dos pontos, assistências ou ritmo do time está com status "Out" ou "Questionable". Ausências de estrelas podem alterar significativamente o total de pontos, o pace e a estratégia ofensiva.',
  },
  alta_variancia: {
    label: 'Alta variância histórica',
    description:
      'Os resultados deste time têm alto desvio padrão de jogo para jogo (desvio > 15 pts). A média histórica é um preditor fraco neste caso — o resultado pode ficar bem acima ou abaixo do esperado.',
  },
  fadiga_extrema: {
    label: 'Fadiga extrema',
    description:
      'O time jogou 4 partidas nos últimos 5 dias. Fadiga acumulada pode impactar severamente o desempenho, especialmente em times com rotação curta.',
  },
}

// ─── Outcome evaluation ───────────────────────────────────────────────────────

function evaluateOutcome(opp: BetOpportunity, game: NBAGame): 'green' | 'red' | null {
  if (game.status !== 'final' || game.home_score == null || game.away_score == null) return null

  const total = game.home_score + game.away_score
  const market = opp.market.toUpperCase()
  const target = (opp.target ?? '').toUpperCase()
  const homeTeam = game.home_team.toUpperCase()
  const awayTeam = game.away_team.toUpperCase()

  if (opp.bet_type === 'total') {
    const match = market.match(/(\d+\.?\d*)/)
    if (!match) return null
    const line = parseFloat(match[1])
    if (market.includes('OVER') || market.includes('MAIS')) return total > line ? 'green' : 'red'
    if (market.includes('UNDER') || market.includes('MENOS')) return total < line ? 'green' : 'red'
  }

  if (opp.bet_type === 'moneyline') {
    const homeWon = game.home_score > game.away_score
    // match by last word of team name (e.g. "Lakers", "Celtics")
    const homeKeyword = homeTeam.split(' ').pop()!
    const awayKeyword = awayTeam.split(' ').pop()!
    if (target.includes(homeKeyword) || homeKeyword.includes(target)) return homeWon ? 'green' : 'red'
    if (target.includes(awayKeyword) || awayKeyword.includes(target)) return homeWon ? 'red' : 'green'
  }

  if (opp.bet_type === 'spread') {
    const matchLine = market.match(/([+-]?\d+\.?\d*)/)
    if (!matchLine) return null
    const line = parseFloat(matchLine[1])
    const homeMargin = game.home_score - game.away_score
    const homeKeyword = homeTeam.split(' ').pop()!
    const isHome = target.includes(homeKeyword) || homeKeyword.includes(target)
    const diff = isHome ? homeMargin : -homeMargin
    return diff + line > 0 ? 'green' : 'red'
  }

  return null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const colors = ['bg-yellow-400', 'bg-gray-300', 'bg-amber-600', 'bg-gray-600', 'bg-gray-700']
  return (
    <span className={`${colors[rank - 1] ?? 'bg-gray-700'} text-black text-[10px] font-bold font-mono w-5 h-5 rounded-full flex items-center justify-center shrink-0`}>
      {rank}
    </span>
  )
}

interface OpportunityRowProps {
  opp: BetOpportunity
  rank: number
  gameLabel?: string
  outcome?: 'green' | 'red' | null
  isPlaced?: boolean
  isPlacing?: boolean
  onPlace?: () => void
  onUnplace?: () => void
}

function RiskFlags({ flags }: { flags: string[] }) {
  if (!flags?.length) return null
  return (
    <div className="flex gap-1 mt-1 flex-wrap">
      {flags.map((f) => {
        const info = RISK_FLAG_INFO[f]
        const displayLabel = info?.label ?? f.replace(/_/g, ' ')
        return (
          <div key={f} className="relative group/flag">
            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-900/30 text-accent-yellow rounded font-mono cursor-help border border-yellow-800/20 hover:border-yellow-600/50 transition-colors">
              ⚠ {f.replace(/_/g, '_')}
            </span>
            <div className="absolute bottom-full left-0 mb-2 z-50 hidden group-hover/flag:block w-72 pointer-events-none">
              <div className="bg-gray-950 border border-yellow-700/40 rounded-lg p-3 shadow-2xl">
                <p className="text-accent-yellow text-[11px] font-bold font-mono mb-1.5 flex items-center gap-1.5">
                  <span>⚠</span> {displayLabel}
                </p>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  {info?.description ?? 'Fator de risco identificado que pode comprometer a confiabilidade desta aposta.'}
                </p>
              </div>
              <div className="w-3 h-3 bg-gray-950 border-b border-r border-yellow-700/40 rotate-45 ml-3 -mt-1.5" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OpportunityRow({ opp, rank, gameLabel, outcome, isPlaced, isPlacing, onPlace, onUnplace }: OpportunityRowProps) {
  const canRegister = !!onPlace || !!onUnplace

  return (
    <div className={`flex items-start gap-2 p-3 border rounded-lg transition-all ${
      isPlaced             ? 'bg-amber-900/10 border-amber-600/50' :
      outcome === 'green'  ? 'bg-green-900/15 border-green-800/60' :
      outcome === 'red'    ? 'bg-red-900/15 border-red-800/60' :
      'bg-bg-secondary border-gray-800'
    }`}>
      <RankBadge rank={rank} />

      {/* Outcome icon (past dates) */}
      {outcome === 'green' && !isPlaced && (
        <span className="text-accent-green font-bold text-base leading-5 shrink-0" title="Aposta correta">✓</span>
      )}
      {outcome === 'red' && !isPlaced && (
        <span className="text-red-400 font-bold text-base leading-5 shrink-0" title="Aposta errada">✗</span>
      )}

      <div className="flex-1 min-w-0">
        {/* Header row: market + badge + register button */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-mono font-bold text-white text-sm truncate">{opp.market}</span>
            <ConfidenceBadge level={opp.confidence_level as ConfidenceLevel} probability={opp.estimated_probability} />
            {isPlaced && outcome === 'green' && (
              <span className="text-accent-green text-xs font-bold font-mono">✓ acertou</span>
            )}
            {isPlaced && outcome === 'red' && (
              <span className="text-red-400 text-xs font-bold font-mono">✗ errou</span>
            )}
          </div>

          {/* Register / Unregister button */}
          {canRegister && (
            isPlaced ? (
              <button
                onClick={onUnplace}
                disabled={isPlacing}
                title="Remover do histórico"
                className="shrink-0 text-[10px] font-mono px-2 py-1 rounded border border-amber-600/50 text-amber-400 bg-amber-900/20 hover:bg-amber-900/40 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {isPlacing ? '...' : '📌 Registrado'}
              </button>
            ) : (
              <button
                onClick={onPlace}
                disabled={isPlacing}
                title="Registrar esta aposta no histórico"
                className="shrink-0 text-[10px] font-mono px-2 py-1 rounded border border-gray-700 text-gray-500 hover:border-accent-green/50 hover:text-accent-green hover:bg-accent-green/5 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {isPlacing ? '...' : '+ Registrar'}
              </button>
            )
          )}
        </div>

        {gameLabel && <p className="text-gray-500 text-xs font-mono mt-0.5">{gameLabel}</p>}
        {/* Context line: shows scope of the bet */}
        <p className="text-gray-400 text-xs mt-0.5">
          {opp.bet_type === 'total'
            ? <span>Total do jogo <span className="text-gray-600">(pontos combinados — ambas as equipes)</span></span>
            : opp.bet_type === 'player_prop' && opp.target
            ? <span>{opp.target}</span>
            : opp.target
            ? <span>{opp.target}</span>
            : null}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
            {BET_TYPE_PT[opp.bet_type as BetType] ?? opp.bet_type}
          </span>
          {opp.novibet_odd > 0 && <OddsDisplay odd={opp.novibet_odd} label="odd" />}
          {/* EV badge */}
          {opp.expected_value != null && (
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
              opp.expected_value >= 0.10 ? 'bg-accent-green/20 text-accent-green border border-accent-green/40' :
              opp.expected_value >= 0.05 ? 'bg-green-900/30 text-green-400 border border-green-700/40' :
              opp.expected_value > 0     ? 'bg-gray-800 text-gray-400 border border-gray-700' :
              'bg-red-900/20 text-red-400 border border-red-800/30'
            }`}
            title={`Expected Value: ${opp.expected_value >= 0 ? '+' : ''}${(opp.expected_value * 100).toFixed(1)}% — valor gerado por cada R$1 apostado`}
            >
              EV {opp.expected_value >= 0 ? '+' : ''}{(opp.expected_value * 100).toFixed(1)}%
            </span>
          )}
          <span
            className="text-gray-600 text-[10px] font-mono cursor-help relative group/hr"
            title=""
          >
            hit rate {(opp.historical_hit_rate * 100).toFixed(0)}%
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-gray-900 border border-gray-700 rounded-lg p-3 text-left shadow-xl opacity-0 group-hover/hr:opacity-100 transition-opacity pointer-events-none z-50 normal-case not-italic">
              <span className="block text-white text-xs font-bold mb-1">📈 Taxa de Acerto Histórica</span>
              <span className="block text-gray-300 text-[11px] leading-relaxed">
                Percentual de vezes que apostas similares (mesmo tipo, mesma direção, condições estatísticas parecidas) resultaram em <span className="text-accent-green font-semibold">WIN</span> nas partidas históricas analisadas pelo sistema.
              </span>
              <span className="block text-accent-green text-[11px] font-semibold mt-2">Quanto maior, melhor.</span>
              <span className="block text-gray-400 text-[11px] mt-1 leading-relaxed">
                Ex: {(opp.historical_hit_rate * 100).toFixed(0)}% significa que em {(opp.historical_hit_rate * 100).toFixed(0)} de cada 100 situações similares, a aposta ganhou.
              </span>
              <span className="block text-accent-yellow text-[11px] mt-2 leading-relaxed">
                ⚠ Hit rate alto não garante lucro — combine sempre com EV positivo. Uma odd baixa pode tornar uma aposta de 80% de acerto desvantajosa.
              </span>
            </span>
          </span>
        </div>
        <p className="text-gray-500 text-xs mt-1 line-clamp-1 italic">
          {opp.reasoning?.split('|')[0]?.replace('📊 DADOS:', '').trim() ?? opp.reasoning}
        </p>
        <RiskFlags flags={opp.risk_flags} />
      </div>
    </div>
  )
}

// ─── Placed bet row (for past dates history view) ────────────────────────────

function PlacedBetRow({ bet, game }: { bet: PlacedBet; game?: NBAGame }) {
  const outcome = game ? evaluateOutcome(bet as unknown as BetOpportunity, game) : null

  return (
    <div className={`flex items-start gap-3 p-3 border rounded-lg ${
      outcome === 'green' ? 'bg-green-900/15 border-green-800/60' :
      outcome === 'red'   ? 'bg-red-900/15 border-red-800/60' :
      'bg-bg-secondary border-gray-800'
    }`}>
      {/* Outcome */}
      <div className="shrink-0 w-6 h-6 flex items-center justify-center">
        {outcome === 'green' && <span className="text-accent-green text-lg font-bold">✓</span>}
        {outcome === 'red'   && <span className="text-red-400 text-lg font-bold">✗</span>}
        {outcome === null    && <span className="text-gray-600 text-lg">·</span>}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-bold text-white text-sm">{bet.market}</span>
          <ConfidenceBadge level={bet.confidence_level} probability={bet.estimated_probability} />
        </div>
        <p className="text-gray-500 text-xs font-mono mt-0.5">
          {bet.away_team} @ {bet.home_team}
          {game?.home_score != null && (
            <span className="ml-2 text-gray-400">
              · {bet.away_team} {game.away_score} — {bet.home_team} {game.home_score}
            </span>
          )}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
            {BET_TYPE_PT[bet.bet_type] ?? bet.bet_type}
          </span>
          {bet.novibet_odd && bet.novibet_odd > 0 && (
            <OddsDisplay odd={bet.novibet_odd} label="odd" />
          )}
          <span className="text-gray-500 text-[10px] font-mono">
            probabilidade registrada: <span className="text-white">{(bet.estimated_probability * 100).toFixed(0)}%</span>
          </span>
        </div>
        <RiskFlags flags={bet.risk_flags} />
      </div>
    </div>
  )
}

// ─── Performance summary (placed bets only) ──────────────────────────────────

function PerformanceSummary({ placedBets, games }: { placedBets: PlacedBet[], games: NBAGame[] }) {
  const gameMap = new Map(games.map((g) => [g.id, g]))

  const withOutcome = placedBets.map((b) => ({
    bet: b,
    outcome: gameMap.get(b.game_id)
      ? evaluateOutcome(b as unknown as BetOpportunity, gameMap.get(b.game_id)!)
      : null,
  }))

  const resolved = withOutcome.filter((x) => x.outcome !== null)
  if (resolved.length === 0 && placedBets.length === 0) return null

  const greens = resolved.filter((x) => x.outcome === 'green').length
  const reds   = resolved.filter((x) => x.outcome === 'red').length
  const hitRate = resolved.length > 0 ? (greens / resolved.length) * 100 : 0
  const pending = placedBets.length - resolved.length

  return (
    <div className="bg-bg-card border border-amber-700/30 rounded-xl p-4">
      <p className="text-xs text-amber-500/80 font-mono uppercase tracking-wider mb-3">
        📌 Minhas Apostas — Desempenho
      </p>
      <div className="flex items-center gap-6 font-mono flex-wrap">
        {resolved.length > 0 ? (
          <div className="text-center">
            <p className={`text-3xl font-bold ${hitRate >= 60 ? 'text-accent-green' : hitRate >= 40 ? 'text-accent-yellow' : 'text-red-400'}`}>
              {hitRate.toFixed(0)}%
            </p>
            <p className="text-gray-500 text-xs mt-0.5">aproveitamento</p>
          </div>
        ) : (
          <p className="text-gray-600 text-xs font-mono">Aguardando resultados...</p>
        )}

        <div className="flex gap-5">
          <div className="flex items-center gap-1.5">
            <span className="text-accent-green font-bold text-xl">✓</span>
            <div>
              <p className="text-accent-green font-bold text-xl leading-none">{greens}</p>
              <p className="text-gray-500 text-[10px]">acerto{greens !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-red-400 font-bold text-xl">✗</span>
            <div>
              <p className="text-red-400 font-bold text-xl leading-none">{reds}</p>
              <p className="text-gray-500 text-[10px]">erro{reds !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {pending > 0 && (
            <div>
              <p className="text-gray-400 font-bold text-xl leading-none">{pending}</p>
              <p className="text-gray-600 text-[10px]">pendente{pending !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>

        {resolved.length > 0 && (
          <div className="ml-auto">
            <div className="flex h-2.5 rounded-full overflow-hidden w-28 bg-gray-800">
              {greens > 0 && (
                <div className="bg-accent-green transition-all" style={{ width: `${(greens / resolved.length) * 100}%` }} />
              )}
              {reds > 0 && (
                <div className="bg-red-500 transition-all" style={{ width: `${(reds / resolved.length) * 100}%` }} />
              )}
            </div>
            <p className="text-gray-600 text-[10px] font-mono mt-1 text-right">{resolved.length} resolvidas</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const todayStr = new Date().toISOString().split('T')[0]

  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [games, setGames] = useState<NBAGame[]>([])
  const [opportunities, setOpportunities] = useState<BetOpportunity[]>([])
  const [placedBets, setPlacedBets] = useState<PlacedBet[]>([])
  const [placingId, setPlacingId] = useState<string | null>(null) // "gameId::market::betType"
  const [filter, setFilter] = useState<BetType | 'all'>('all')
  const [phase, setPhase] = useState<'loading-games' | 'analyzing' | 'done' | 'error'>('loading-games')
  const [analyzingGame, setAnalyzingGame] = useState<string | null>(null)

  const isToday = selectedDate === todayStr
  const isPast = selectedDate < todayStr

  const bootstrap = useCallback(async (date: string) => {
    const isDateToday = date === todayStr
    setPhase('loading-games')
    setGames([])
    setOpportunities([])
    try {
      const [gamesRes, oppsRes, betsRes] = await Promise.all([
        fetch(`/api/games?date=${date}`),
        fetch(`/api/opportunities?date=${date}&min_prob=0.50`),
        fetch(`/api/bets?date=${date}`),
      ])
      const gamesData: NBAGame[] = await gamesRes.json()
      const oppsData: BetOpportunity[] = await oppsRes.json()
      const betsData: PlacedBet[] = await betsRes.json()
      setGames(Array.isArray(gamesData) ? gamesData : [])
      const existingOpps = Array.isArray(oppsData) ? oppsData : []
      setOpportunities(existingOpps)
      setPlacedBets(Array.isArray(betsData) ? betsData : [])

      // Auto-analyze only for today when no opportunities exist
      if (isDateToday && !existingOpps.length && Array.isArray(gamesData) && gamesData.length) {
        await runFullAnalysis(date, gamesData)
      } else {
        setPhase('done')
      }
    } catch {
      setPhase('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr])

  async function runFullAnalysis(date: string, gamesData?: NBAGame[]) {
    setPhase('analyzing')
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data: BetOpportunity[] = await res.json()
      setOpportunities(Array.isArray(data) ? data : [])
      if (!gamesData) {
        const gr = await fetch(`/api/games?date=${date}`)
        setGames(await gr.json())
      }
      setPhase('done')
    } catch {
      setPhase('error')
    }
  }

  async function analyzeOneGame(gameId: string) {
    setAnalyzingGame(gameId)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId, date: selectedDate }),
      })
      const data: BetOpportunity[] = await res.json()
      if (Array.isArray(data)) {
        setOpportunities((prev) => [
          ...prev.filter((o) => o.game_id !== gameId),
          ...data,
        ])
      }
    } finally {
      setAnalyzingGame(null)
    }
  }

  function handleDateChange(date: string) {
    setSelectedDate(date)
  }

  // ── Place / unplace a bet ──────────────────────────────────────────────────

  function placedKey(gameId: string, market: string, betType: string) {
    return `${gameId}::${market}::${betType}`
  }

  async function placeBet(opp: BetOpportunity, game: NBAGame) {
    const key = placedKey(opp.game_id, opp.market, opp.bet_type)
    setPlacingId(key)
    try {
      const res = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_id:               opp.game_id,
          game_date:             selectedDate,
          home_team:             game.home_team,
          away_team:             game.away_team,
          bet_type:              opp.bet_type,
          market:                opp.market,
          target:                opp.target,
          novibet_odd:           opp.novibet_odd,
          estimated_probability: opp.estimated_probability,
          confidence_level:      opp.confidence_level,
          reasoning:             opp.reasoning,
          risk_flags:            opp.risk_flags,
        }),
      })
      const saved: PlacedBet = await res.json()
      setPlacedBets((prev) => [...prev, saved])
    } finally {
      setPlacingId(null)
    }
  }

  async function unplaceBet(opp: BetOpportunity) {
    const key = placedKey(opp.game_id, opp.market, opp.bet_type)
    const existing = placedBets.find(
      (b) => b.game_id === opp.game_id && b.market === opp.market && b.bet_type === opp.bet_type
    )
    if (!existing) return
    setPlacingId(key)
    try {
      await fetch(`/api/bets/${existing.id}`, { method: 'DELETE' })
      setPlacedBets((prev) => prev.filter((b) => b.id !== existing.id))
    } finally {
      setPlacingId(null)
    }
  }

  useEffect(() => {
    bootstrap(selectedDate)
  }, [selectedDate, bootstrap])

  // ── Derived state ──────────────────────────────────────────────────────────

  const gameMap = new Map(games.map((g) => [g.id, g]))

  // Fast lookup: is this opp placed?
  const placedKeySet = new Set(
    placedBets.map((b) => placedKey(b.game_id, b.market, b.bet_type))
  )

  const filtered = (filter === 'all' ? opportunities : opportunities.filter((o) => o.bet_type === filter))
    .sort((a, b) => b.estimated_probability - a.estimated_probability)

  const top5Global = [...opportunities]
    .sort((a, b) => b.estimated_probability - a.estimated_probability)
    .slice(0, 5)

  const oppsByGame = new Map<string, BetOpportunity[]>()
  for (const o of filtered) {
    const arr = oppsByGame.get(o.game_id) ?? []
    arr.push(o)
    oppsByGame.set(o.game_id, arr)
  }

  const gameLabel = (game: NBAGame) => `${game.away_team} @ ${game.home_team} · ${game.game_time} BRT`

  return (
    <div className="flex gap-8">
      {/* ── MAIN ── */}
      <div className="flex-1 space-y-5 min-w-0">

        {/* Date navigation */}
        <DateNav selectedDate={selectedDate} today={todayStr} onDateChange={handleDateChange} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-mono text-white">
              {isPast ? 'NBA' : 'NBA TODAY'}
              {isPast && <span className="text-gray-500 text-lg ml-2">{selectedDate}</span>}
            </h1>
            <p className="text-gray-500 text-sm font-mono">{selectedDate} · {games.length} jogos</p>
          </div>
          {isToday && (
            <button
              onClick={() => runFullAnalysis(selectedDate)}
              disabled={phase === 'analyzing'}
              className="px-4 py-2 bg-accent-green text-black font-bold text-sm rounded font-mono hover:bg-green-400 transition-colors disabled:opacity-50"
            >
              {phase === 'analyzing' ? 'Analisando...' : 'Reanalisar Todos'}
            </button>
          )}
        </div>

        {/* Status */}
        {phase === 'loading-games' && (
          <p className="font-mono text-gray-500 animate-pulse text-sm">Buscando jogos...</p>
        )}
        {phase === 'analyzing' && (
          <div className="bg-bg-card border border-gray-800 rounded-lg p-4">
            <p className="font-mono text-accent-green animate-pulse text-sm">
              Analisando {games.length} jogos com Claude + SportsDataIO...
            </p>
            <p className="font-mono text-gray-500 text-xs mt-1">
              Buscando histórico L10, odds, projeções e identificando padrões de alta probabilidade.
            </p>
          </div>
        )}

        {/* Performance summary — placed bets only */}
        {phase === 'done' && placedBets.length > 0 && (
          <PerformanceSummary placedBets={placedBets} games={games} />
        )}

        {/* Placed bets list for past dates */}
        {phase === 'done' && isPast && placedBets.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-amber-500/70 font-mono uppercase tracking-wider">
              📌 Apostas que você registrou
            </p>
            {placedBets.map((bet) => (
              <PlacedBetRow key={bet.id} bet={bet} game={gameMap.get(bet.game_id)} />
            ))}
          </div>
        )}

        {/* Filtros */}
        {phase === 'done' && (
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                  filter === f.value
                    ? 'bg-accent-green text-black font-bold'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {f.label}
                {f.value !== 'all' && (
                  <span className="ml-1 text-[10px] opacity-60">
                    ({opportunities.filter((o) => o.bet_type === f.value).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Jogos + apostas */}
        {phase === 'done' && games.map((game) => {
          const isLive = game.status === 'live'
          const isFinal = game.status === 'final'
          const gameOpps = (oppsByGame.get(game.id) ?? []).slice(0, 5)
          const isAnalyzing = analyzingGame === game.id

          return (
            <div key={game.id} className="bg-bg-card border border-gray-800 rounded-xl overflow-hidden">
              {/* Header do jogo */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-lg font-mono">{game.away_team}</span>
                    {isFinal && game.away_score != null && (
                      <span className="font-mono text-accent-green text-lg font-bold">{game.away_score}</span>
                    )}
                    <span className="text-gray-500 text-sm">@</span>
                    <span className="font-bold text-white text-lg font-mono">{game.home_team}</span>
                    {isFinal && game.home_score != null && (
                      <span className="font-mono text-accent-green text-lg font-bold">{game.home_score}</span>
                    )}
                    {isLive && (
                      <span className="text-xs text-red-400 font-bold animate-pulse font-mono">AO VIVO</span>
                    )}
                    {isFinal && (
                      <span className="text-[10px] text-gray-600 font-mono border border-gray-700 px-1.5 py-0.5 rounded">FINAL</span>
                    )}
                  </div>
                  <p className="text-gray-500 text-xs font-mono mt-0.5">
                    {game.game_time ? `${game.game_time} BRT` : selectedDate}
                  </p>
                </div>
                <div className="flex gap-2">
                  {isToday && (
                    <button
                      onClick={() => analyzeOneGame(game.id)}
                      disabled={isAnalyzing}
                      className="text-xs text-accent-green border border-accent-green/30 px-2 py-1 rounded hover:bg-accent-green/10 transition-colors disabled:opacity-40 font-mono"
                    >
                      {isAnalyzing ? 'Analisando...' : 'Reanalisar'}
                    </button>
                  )}
                  <Link
                    href={`/games/${game.id}`}
                    className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 font-mono"
                  >
                    Detalhes →
                  </Link>
                </div>
              </div>

              {/* Apostas do jogo */}
              <div className="p-4">
                {gameOpps.length === 0 ? (
                  <p className="text-xs text-gray-600 font-mono">
                    {isPast
                      ? 'Nenhuma aposta registrada para este jogo.'
                      : 'Nenhuma oportunidade identificada para este jogo.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-2">
                      Top {gameOpps.length} oportunidade{gameOpps.length > 1 ? 's' : ''} identificada{gameOpps.length > 1 ? 's' : ''}
                    </p>
                    {gameOpps.map((opp, i) => {
                      const outcome = evaluateOutcome(opp, game)
                      const key = placedKey(opp.game_id, opp.market, opp.bet_type)
                      const isPlaced = placedKeySet.has(key)
                      return (
                        <OpportunityRow
                          key={i}
                          opp={opp}
                          rank={i + 1}
                          outcome={outcome}
                          isPlaced={isPlaced}
                          isPlacing={placingId === key}
                          onPlace={() => placeBet(opp, game)}
                          onUnplace={() => unplaceBet(opp)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Empty states */}
        {phase === 'done' && games.length === 0 && (
          <div className="bg-bg-card border border-gray-800 rounded-lg p-6 text-center">
            <p className="text-gray-500 font-mono text-sm">Nenhum jogo encontrado para {selectedDate}.</p>
          </div>
        )}

        {phase === 'done' && games.length > 0 && opportunities.length === 0 && (
          <div className="bg-bg-card border border-gray-800 rounded-lg p-6 text-center">
            <p className="text-gray-500 font-mono text-sm">
              {isPast
                ? 'Nenhuma análise registrada para este dia.'
                : 'Nenhuma aposta com alta probabilidade identificada hoje.'}
            </p>
            {!isPast && (
              <p className="text-gray-600 text-xs font-mono mt-1">
                Claude analisou todos os jogos e não encontrou padrões suficientemente fortes.
              </p>
            )}
          </div>
        )}

        {phase === 'error' && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <p className="text-red-400 font-mono text-sm">Erro ao carregar dados. Tente novamente.</p>
          </div>
        )}
      </div>

      {/* ── SIDEBAR: TOP 5 GLOBAL ── */}
      <aside className="w-72 shrink-0 space-y-3">
        <div className="sticky top-6">
          <h2 className="font-mono font-bold text-xs text-gray-400 uppercase tracking-wider mb-3">
            Top 5 {isPast ? 'do Dia' : 'Global do Dia'}
          </h2>
          {top5Global.length === 0 ? (
            <p className="text-xs text-gray-600 font-mono">
              {phase === 'analyzing' ? 'Calculando...' : 'Sem dados.'}
            </p>
          ) : (
            <div className="space-y-2">
              {top5Global.map((opp, i) => {
                const game = gameMap.get(opp.game_id)
                const outcome = game ? evaluateOutcome(opp, game) : null
                return (
                  <OpportunityRow
                    key={i}
                    opp={opp}
                    rank={i + 1}
                    gameLabel={game ? gameLabel(game) : undefined}
                    outcome={outcome}
                  />
                )
              })}
            </div>
          )}

          {/* Legenda */}
          {top5Global.length > 0 && (
            <div className="mt-4 p-3 bg-bg-card border border-gray-800 rounded-lg space-y-1">
              <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-2">Legenda</p>
              {[
                { level: 'EXTREME' as ConfidenceLevel, range: '97%+' },
                { level: 'VERY_HIGH' as ConfidenceLevel, range: '93–96%' },
                { level: 'HIGH' as ConfidenceLevel, range: '90–92%' },
              ].map(({ level, range }) => (
                <div key={level} className="flex items-center justify-between">
                  <ConfidenceBadge level={level} probability={0} />
                  <span className="text-gray-500 text-[10px] font-mono">{range}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-800 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-accent-green font-bold text-sm">✓</span>
                  <span className="text-gray-500 text-[10px] font-mono">Aposta acertou</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-400 font-bold text-sm">✗</span>
                  <span className="text-gray-500 text-[10px] font-mono">Aposta errou</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
