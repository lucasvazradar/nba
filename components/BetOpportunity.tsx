'use client'

import { useState } from 'react'
import type { BetOpportunity as BetOpportunityType } from '@/types'
import { ConfidenceBadge } from './ConfidenceBadge'
import { OddsDisplay } from './OddsDisplay'

interface Props {
  opportunity: BetOpportunityType
}

// Separa o reasoning em seções se vier no formato estruturado
function parseReasoning(text: string) {
  if (!text.includes('|')) return { raw: text }
  const parts = text.split('|').map((s) => s.trim())
  return {
    dados: parts.find((p) => p.startsWith('📊'))?.replace('📊 DADOS:', '').trim(),
    analise: parts.find((p) => p.startsWith('🔍'))?.replace('🔍 ANÁLISE:', '').trim(),
    conclusao: parts.find((p) => p.startsWith('✅'))?.replace('✅ CONCLUSÃO:', '').trim(),
    raw: undefined,
  }
}

export function BetOpportunity({ opportunity: o }: Props) {
  const [expanded, setExpanded] = useState(false)
  const reasoning = parseReasoning(o.reasoning ?? '')

  return (
    <div className="bg-bg-secondary border border-gray-800 rounded-lg p-4 space-y-2">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono font-bold text-white text-sm">{o.market}</span>
        <ConfidenceBadge level={o.confidence_level} probability={o.estimated_probability} />
      </div>

      {o.target && <p className="text-gray-400 text-xs">{o.target}</p>}

      {/* Métricas rápidas */}
      <div className="flex items-center gap-4 text-xs flex-wrap">
        {o.novibet_odd > 0 && <OddsDisplay odd={o.novibet_odd} label="Odd" />}
        <span className="text-gray-500 font-mono">
          Hit rate histórico:{' '}
          <span className="text-gray-300">{(o.historical_hit_rate * 100).toFixed(0)}%</span>
        </span>
      </div>

      {/* Métodos usados */}
      {o.method?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {o.method.map((m) => (
            <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
              {m}
            </span>
          ))}
        </div>
      )}

      {/* Risk flags */}
      {o.risk_flags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {o.risk_flags.map((flag) => (
            <span key={flag} className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/40 text-accent-yellow font-mono">
              ⚠ {flag}
            </span>
          ))}
        </div>
      )}

      {/* Botão expandir */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gray-500 hover:text-accent-green transition-colors font-mono flex items-center gap-1"
      >
        {expanded ? '▲' : '▼'} {expanded ? 'Esconder análise detalhada' : 'Ver análise detalhada'}
      </button>

      {/* Reasoning detalhado */}
      {expanded && (
        <div className="border-t border-gray-800 pt-3 space-y-3">
          {reasoning.raw ? (
            <p className="text-gray-300 text-xs leading-relaxed">{reasoning.raw}</p>
          ) : (
            <>
              {reasoning.dados && (
                <div>
                  <p className="text-[10px] font-mono text-accent-green uppercase tracking-wider mb-1">
                    📊 Dados utilizados
                  </p>
                  <p className="text-gray-300 text-xs leading-relaxed">{reasoning.dados}</p>
                </div>
              )}
              {reasoning.analise && (
                <div>
                  <p className="text-[10px] font-mono text-accent-yellow uppercase tracking-wider mb-1">
                    🔍 Análise do padrão
                  </p>
                  <p className="text-gray-300 text-xs leading-relaxed">{reasoning.analise}</p>
                </div>
              )}
              {reasoning.conclusao && (
                <div>
                  <p className="text-[10px] font-mono text-[#00ff88] uppercase tracking-wider mb-1">
                    ✅ Conclusão
                  </p>
                  <p className="text-gray-300 text-xs leading-relaxed">{reasoning.conclusao}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
