import { notFound } from 'next/navigation'
import { getGamesByDate, getLast10Games, getPlayerStatsByDate, getPlayerProjections, getInjuries } from '@/lib/sportsdata'
import { getNovibetOdds } from '@/lib/oddsapi'
import { calculateTeamMetrics, calculatePlayerMetrics } from '@/lib/analyzer'
import { createServerClient } from '@/lib/supabase'
import { TeamHistory } from '@/components/TeamHistory'
import { PlayerProps } from '@/components/PlayerProps'
import { BetOpportunity } from '@/components/BetOpportunity'
import { OddsDisplay } from '@/components/OddsDisplay'
import { AnalyzeButton } from '@/components/AnalyzeButton'

interface Props {
  params: { id: string }
}

export default async function GameDetailPage({ params }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const games = await getGamesByDate(today)
  const game = games.find((g) => g.id === params.id)

  if (!game) notFound()

  const [homeHistory, awayHistory, injuries, projections, odds, playerStats] = await Promise.all([
    getLast10Games(game.home_team_id),
    getLast10Games(game.away_team_id),
    getInjuries(),
    getPlayerProjections(today),
    getNovibetOdds(),
    getPlayerStatsByDate(today),
  ])

  const totalLine = odds.total?.line ?? 220
  const homeMetrics = calculateTeamMetrics(homeHistory, injuries, game.home_team_id, totalLine)
  const awayMetrics = calculateTeamMetrics(awayHistory, injuries, game.away_team_id, totalLine)

  const gamePlayerStats = playerStats.filter(
    (s) => s.team_id === game.home_team_id || s.team_id === game.away_team_id
  )
  const playerMetrics = calculatePlayerMetrics(gamePlayerStats, projections, odds.player_props)

  const supabase = createServerClient()
  const { data: opportunities } = await supabase
    .from('bet_opportunities')
    .select('*')
    .eq('game_id', game.id)
    .order('estimated_probability', { ascending: false })

  const novibetUrl = `https://www.novibet.com.br/apostas/basquetebol/nba`

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono text-white">
            {game.away_team} <span className="text-gray-500">@</span> {game.home_team}
          </h1>
          <p className="text-gray-500 font-mono text-sm mt-1">{game.game_date} · {game.game_time} BRT</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <AnalyzeButton gameId={game.id} date={today} />
          <a
            href={novibetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-accent-yellow text-black font-bold text-sm rounded font-mono hover:bg-yellow-400 transition-colors"
          >
            Abrir Novibet →
          </a>
        </div>
      </div>

      {/* Odds Novibet */}
      {(odds.total || odds.h2h) && (
        <div className="bg-bg-card border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-3">Odds Novibet</p>
          <div className="flex gap-8 flex-wrap font-mono text-sm">
            {odds.h2h && (
              <div>
                <p className="text-gray-500 text-xs mb-1">Moneyline</p>
                <div className="flex gap-3">
                  <OddsDisplay odd={odds.h2h.away} label={game.away_team} />
                  <OddsDisplay odd={odds.h2h.home} label={game.home_team} />
                </div>
              </div>
            )}
            {odds.total && (
              <div>
                <p className="text-gray-500 text-xs mb-1">Total de Pontos</p>
                <div className="flex gap-3">
                  <OddsDisplay odd={odds.total.over} label={`Mais de ${odds.total.line}`} />
                  <OddsDisplay odd={odds.total.under} label={`Menos de ${odds.total.line}`} />
                </div>
              </div>
            )}
            {odds.spread && (
              <div>
                <p className="text-gray-500 text-xs mb-1">Handicap</p>
                <div className="flex gap-3">
                  <OddsDisplay odd={odds.spread.home_odd} label={`${game.home_team} ${odds.spread.line > 0 ? '+' : ''}${odds.spread.line}`} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Histórico L10 */}
      <div>
        <p className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-3">Últimos 10 Jogos</p>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-bg-card border border-gray-800 rounded-lg p-4">
            <TeamHistory history={awayHistory} teamName={game.away_team} totalLine={totalLine} />
          </div>
          <div className="bg-bg-card border border-gray-800 rounded-lg p-4">
            <TeamHistory history={homeHistory} teamName={game.home_team} totalLine={totalLine} />
          </div>
        </div>
      </div>

      {/* Pace & Métricas */}
      <div className="bg-bg-card border border-gray-800 rounded-lg p-4">
        <p className="text-xs text-gray-500 font-mono uppercase tracking-wider mb-4">Análise de Ritmo e Eficiência</p>
        <div className="grid grid-cols-2 gap-6 font-mono text-sm">
          {[
            { label: game.away_team, m: awayMetrics },
            { label: game.home_team, m: homeMetrics },
          ].map(({ label, m }) => (
            <div key={label} className="space-y-2">
              <p className="text-gray-300 text-xs font-bold">{label}</p>
              <div className="space-y-1.5">
                {[
                  ['Pace (posses/jogo)', m.avgPace.toFixed(1)],
                  ['Rating Ofensivo', m.offensiveRating.toFixed(1)],
                  ['Rating Defensivo', m.defensiveRating.toFixed(1)],
                  ['Net Rating', m.netRating.toFixed(1)],
                  ['Taxa Over L10', `${(m.overUnderRate * 100).toFixed(0)}%`],
                  ['Sequência', m.streak],
                  ['Dias de descanso', m.restDays],
                  ['Recorde L10', m.last10Record],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between text-xs">
                    <span className="text-gray-500">{k}</span>
                    <span className={
                      k === 'Taxa Over L10' && parseFloat(String(v)) >= 70 ? 'text-accent-green font-bold' :
                      k === 'Net Rating' && parseFloat(String(v)) > 0 ? 'text-accent-green' :
                      k === 'Net Rating' && parseFloat(String(v)) < 0 ? 'text-red-400' :
                      'text-white'
                    }>{v}</span>
                  </div>
                ))}
                {m.backToBack && (
                  <p className="text-accent-yellow text-xs">⚠ Back-to-back</p>
                )}
                {m.injuryImpact.length > 0 && (
                  <p className="text-accent-yellow text-xs">⚠ Lesionados: {m.injuryImpact.join(', ')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Player Props */}
      {playerMetrics.length > 0 && (
        <div className="bg-bg-card border border-gray-800 rounded-lg p-4">
          <PlayerProps players={playerMetrics} />
        </div>
      )}

      {/* Oportunidades identificadas pela IA */}
      <div className="space-y-3">
        <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">
          Oportunidades de Aposta (≥90% confiança)
        </p>
        {!opportunities?.length ? (
          <div className="bg-bg-card border border-gray-800 rounded-lg p-6 text-center">
            <p className="text-gray-500 font-mono text-sm mb-3">
              Nenhuma análise realizada ainda para este jogo.
            </p>
            <p className="text-gray-600 text-xs font-mono">
              Clique em "Analisar com IA" acima para identificar oportunidades.
            </p>
          </div>
        ) : (
          opportunities.map((o, i) => <BetOpportunity key={i} opportunity={o} />)
        )}
      </div>
    </div>
  )
}
