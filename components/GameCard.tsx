'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { NBAGame, BetOpportunity, TeamMetrics } from '@/types'
import { BetOpportunity as BetOpportunityCard } from './BetOpportunity'

interface Props {
  game: NBAGame
  homeMetrics?: TeamMetrics
  awayMetrics?: TeamMetrics
  opportunities?: BetOpportunity[]
  onAnalyze?: (gameId: string) => Promise<void>
}

export function GameCard({ game, homeMetrics, awayMetrics, opportunities = [], onAnalyze }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleAnalyze() {
    if (!onAnalyze) return
    setLoading(true)
    await onAnalyze(game.id)
    setLoading(false)
  }

  return (
    <div className="bg-bg-card border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white text-lg">{game.away_team}</span>
            <span className="text-gray-500 text-sm">@</span>
            <span className="font-bold text-white text-lg">{game.home_team}</span>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm text-gray-400">{game.game_time} ET</p>
            {game.status === 'live' && (
              <span className="text-xs text-red-400 font-bold animate-pulse">AO VIVO</span>
            )}
          </div>
        </div>
        {game.odds_data?.total && (
          <p className="text-xs text-gray-500 font-mono mt-1">
            O/U {game.odds_data.total.line}
          </p>
        )}
      </div>

      {/* Stats */}
      {(homeMetrics || awayMetrics) && (
        <div className="p-4 border-b border-gray-800 grid grid-cols-2 gap-4 text-xs font-mono">
          {[
            { label: game.away_team, m: awayMetrics },
            { label: game.home_team, m: homeMetrics },
          ].map(({ label, m }) =>
            m ? (
              <div key={label}>
                <p className="text-gray-500 mb-1">{label}</p>
                <p className="text-white">L10: <span className="text-accent-green">{m.last10Record}</span></p>
                <p className="text-gray-400">Pace: {m.avgPace.toFixed(1)}</p>
                <p className="text-gray-400">
                  Over rate: <span className={m.overUnderRate >= 0.7 ? 'text-accent-green' : 'text-gray-400'}>
                    {(m.overUnderRate * 100).toFixed(0)}%
                  </span>
                </p>
                {m.backToBack && (
                  <p className="text-accent-yellow">⚠ Back-to-back</p>
                )}
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Oportunidades */}
      <div className="p-4 space-y-3">
        {opportunities.length > 0 ? (
          <>
            <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">
              Oportunidades identificadas
            </p>
            {opportunities.slice(0, 2).map((o, i) => (
              <BetOpportunityCard key={i} opportunity={o} />
            ))}
          </>
        ) : (
          <p className="text-xs text-gray-600 font-mono">Nenhuma oportunidade analisada ainda</p>
        )}

        <div className="flex gap-2 pt-1">
          {onAnalyze && (
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="text-xs text-accent-green border border-accent-green/30 px-3 py-1.5 rounded hover:bg-accent-green/10 transition-colors disabled:opacity-40 font-mono"
            >
              {loading ? 'Analisando...' : 'Analisar'}
            </button>
          )}
          <Link
            href={`/games/${game.id}`}
            className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5"
          >
            Ver análise completa →
          </Link>
        </div>
      </div>
    </div>
  )
}
