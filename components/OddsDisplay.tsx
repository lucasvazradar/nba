interface Props {
  odd: number
  label?: string
}

export function OddsDisplay({ odd, label }: Props) {
  return (
    <span className="font-mono text-accent-yellow text-sm">
      {label && <span className="text-gray-400 text-xs mr-1">{label}</span>}
      {odd.toFixed(2)}
    </span>
  )
}
