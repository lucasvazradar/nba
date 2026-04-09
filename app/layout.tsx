import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NBA Betting Intelligence',
  description: 'Oportunidades de apostas NBA com ≥ 90% de probabilidade',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-bg-primary text-white antialiased">
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-accent-green text-lg">NBA</span>
            <span className="text-gray-500 text-sm font-mono">BETTING INTELLIGENCE</span>
          </div>
          <span className="text-xs text-gray-600 font-mono">powered by Claude + SportsDataIO</span>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
