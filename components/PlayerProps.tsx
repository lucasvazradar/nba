import type { PlayerMetrics } from '@/types'

interface Props {
  players: PlayerMetrics[]
}

export function PlayerProps({ players }: Props) {
  if (!players.length) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-gray-300 font-mono">Player Props</h3>
      <div className="grid gap-2">
        {players.map((p) => {
          const hitPct = (p.hitRateOverLine * 100).toFixed(0)
          const isHot = p.hitRateOverLine >= 0.8

          return (
            <div
              key={p.player_id}
              className="bg-bg-secondary border border-gray-800 rounded p-3 flex items-center justify-between"
            >
              <div>
                <p className="text-white text-sm font-medium">{p.player}</p>
                <p className="text-gray-500 text-xs font-mono">
                  Média L10: {p.last10Avg.points.toFixed(1)} pts ·{' '}
                  Proj: {p.mlProjection.points.toFixed(1)} pts
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-xs text-gray-400">
                  Linha: <span className="text-white">{p.propLine}</span>
                </p>
                <p className={`font-mono text-sm font-bold ${isHot ? 'text-accent-green' : 'text-gray-400'}`}>
                  {hitPct}% Over
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
