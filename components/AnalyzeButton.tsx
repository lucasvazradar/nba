'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  gameId: string
  date: string
}

export function AnalyzeButton({ gameId, date }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const router = useRouter()

  async function handleAnalyze() {
    setStatus('loading')
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId, date }),
      })
      if (!res.ok) throw new Error()
      setStatus('done')
      router.refresh()
    } catch {
      setStatus('error')
    }
  }

  return (
    <button
      onClick={handleAnalyze}
      disabled={status === 'loading'}
      className={`px-4 py-2 font-bold text-sm rounded font-mono transition-colors ${
        status === 'done'
          ? 'bg-green-900/40 text-accent-green border border-accent-green/30'
          : status === 'error'
          ? 'bg-red-900/40 text-red-400 border border-red-400/30'
          : 'bg-accent-green text-black hover:bg-green-400 disabled:opacity-50'
      }`}
    >
      {status === 'loading' ? 'Analisando...' : status === 'done' ? '✓ Analisado' : status === 'error' ? 'Erro — tentar novamente' : 'Analisar com IA'}
    </button>
  )
}
