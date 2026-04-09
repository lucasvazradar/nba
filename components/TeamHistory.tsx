import type { TeamGameStat } from '@/types'

interface Props {
  history: TeamGameStat[]
  teamName: string
  totalLine?: number
}

export function TeamHistory({ history, teamName, totalLine }: Props) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-300 mb-2 font-mono">{teamName} — L10</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-1 pr-3">Data</th>
              <th className="text-left py-1 pr-3">Adversário</th>
              <th className="text-right py-1 pr-3">Pts</th>
              <th className="text-right py-1 pr-3">Sofridos</th>
              <th className="text-right py-1 pr-3">Resultado</th>
              {totalLine && <th className="text-right py-1">O/U</th>}
            </tr>
          </thead>
          <tbody>
            {history.map((g) => {
              const isOver = totalLine ? g.total_points > totalLine : null
              return (
                <tr key={g.game_id} className="border-b border-gray-900 hover:bg-gray-900/40">
                  <td className="py-1 pr-3 text-gray-500">{g.game_date}</td>
                  <td className="py-1 pr-3 text-gray-300">
                    {g.is_home ? '' : '@'}{g.opponent}
                  </td>
                  <td className="py-1 pr-3 text-right text-white">{g.points_scored}</td>
                  <td className="py-1 pr-3 text-right text-gray-400">{g.points_allowed}</td>
                  <td className={`py-1 pr-3 text-right font-bold ${g.won ? 'text-accent-green' : 'text-red-400'}`}>
                    {g.won ? 'W' : 'L'}
                  </td>
                  {totalLine && (
                    <td className={`py-1 text-right ${isOver ? 'text-accent-green' : 'text-gray-500'}`}>
                      {isOver ? 'OVER' : 'UNDER'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
