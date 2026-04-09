'use client'

interface DateNavProps {
  selectedDate: string
  today: string
  onDateChange: (date: string) => void
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function formatDayLabel(isoDate: string, today: string): string {
  const yesterday = addDays(today, -1)
  const tomorrow = addDays(today, 1)
  if (isoDate === today) return 'Hoje'
  if (isoDate === yesterday) return 'Ontem'
  if (isoDate === tomorrow) return 'Amanhã'
  const d = new Date(isoDate + 'T12:00:00Z')
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
  const dayMonth = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  return `${weekday.replace('.', '')} ${dayMonth}`
}

export function DateNav({ selectedDate, today, onDateChange }: DateNavProps) {
  // Show: 3 past days + today + 4 future days = 8 tabs
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i - 3))

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex gap-1 flex-wrap">
        {days.map((day) => {
          const isPast = day < today
          const isToday = day === today
          const isSelected = day === selectedDate
          return (
            <button
              key={day}
              onClick={() => onDateChange(day)}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors whitespace-nowrap ${
                isSelected
                  ? 'bg-accent-green text-black font-bold'
                  : isToday
                  ? 'bg-gray-700 text-white border border-accent-green/40'
                  : isPast
                  ? 'bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {formatDayLabel(day, today)}
            </button>
          )
        })}
      </div>

      {/* Calendar picker */}
      <div className="relative ml-1">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-400 text-xs font-mono rounded px-2 py-1.5 cursor-pointer hover:border-gray-500 transition-colors [color-scheme:dark]"
          title="Selecionar data"
        />
      </div>
    </div>
  )
}
