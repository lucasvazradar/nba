export type ConfidenceLevel = 'EXTREME' | 'VERY_HIGH' | 'HIGH' | 'MODERATE'

const CONFIG: Record<ConfidenceLevel, { label: string; className: string }> = {
  EXTREME:   { label: 'EXTREMO',    className: 'bg-[#00ff88] text-black' },
  VERY_HIGH: { label: 'MUITO ALTO', className: 'bg-green-400 text-black' },
  HIGH:      { label: 'ALTO',       className: 'bg-yellow-500 text-black' },
  MODERATE:  { label: 'MODERADO',   className: 'bg-gray-600 text-white' },
}

interface Props {
  level: ConfidenceLevel | string
  probability: number
}

export function ConfidenceBadge({ level, probability }: Props) {
  const config = CONFIG[level as ConfidenceLevel] ?? { label: level, className: 'bg-gray-700 text-white' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold font-mono ${config.className}`}>
      {config.label}{probability > 0 ? ` · ${(probability * 100).toFixed(0)}%` : ''}
    </span>
  )
}
