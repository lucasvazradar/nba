// ─── Jogos ───────────────────────────────────────────────────────────────────

export interface NBAGame {
  id: string
  home_team: string
  away_team: string
  home_team_id: number
  away_team_id: number
  game_date: string // ISO date YYYY-MM-DD
  game_time?: string // HH:MM ET
  status: 'scheduled' | 'live' | 'final'
  home_score?: number
  away_score?: number
  odds_data?: OddsData
}

// ─── Odds ─────────────────────────────────────────────────────────────────────

export interface AlternateTotalLine {
  line: number
  over: number              // Novibet odd (real or estimated)
  under: number
  prob_over?: number        // our model P(total > line)
  prob_under?: number       // our model P(total < line)
  ev_over?: number          // EV = prob_over * over - 1
  ev_under?: number         // EV = prob_under * under - 1
}

export interface OddsData {
  h2h?: { home: number; away: number; draw?: number }
  spread?: { line: number; home_odd: number; away_odd: number }
  total?: { line: number; over: number; under: number }
  alternate_totals?: AlternateTotalLine[]
  player_props?: PlayerPropOdd[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface PlayerPropOdd {
  player: string
  market: 'player_points' | 'player_rebounds' | 'player_assists'
  line: number
  over: number
  under: number
}

// ─── Estatísticas ─────────────────────────────────────────────────────────────

export interface TeamGameStat {
  game_id: string
  game_date: string
  opponent: string
  is_home: boolean
  points_scored: number
  points_allowed: number
  won: boolean
  pace?: number
  possessions?: number
  offensive_rating?: number
  defensive_rating?: number
  three_point_pct?: number
  total_points: number // pontos_scored + points_allowed
}

export interface TeamMetrics {
  avgPointsScored: number
  avgPointsAllowed: number
  overUnderRate: number       // % jogos OVER na linha atual
  last10Record: string        // ex: "7-3"
  homeAwayRecord: string
  streak: string              // ex: "W3" ou "L2"
  avgPace: number
  avgPossessions: number
  offensiveRating: number
  defensiveRating: number
  netRating: number
  backToBack: boolean
  restDays: number
  injuryImpact: string[]
  h2hLast5: H2HResult[]
  h2hAvgTotal: number
}

export interface H2HResult {
  game_date: string
  home_team: string
  away_team: string
  home_score: number
  away_score: number
  total: number
}

// ─── Jogadores ────────────────────────────────────────────────────────────────

export interface PlayerGameStat {
  player_id: number
  player_name: string
  team_id: number
  game_date: string
  points: number
  rebounds: number
  assists: number
  minutes: number
  fantasy_points?: number
}

export interface PlayerProjection {
  player_id: number
  player_name: string
  team_id: number
  projected_points: number
  projected_rebounds: number
  projected_assists: number
  projected_minutes: number
  updated_at: string
}

export interface PlayerMetrics {
  player: string
  player_id: number
  last10Avg: {
    points: number
    rebounds: number
    assists: number
    minutes: number
  }
  mlProjection: {
    points: number
    rebounds: number
    assists: number
  }
  consistency: number         // desvio padrão — menor = mais consistente
  trendSlope: number          // positivo = em alta
  propLine: number            // linha Novibet
  hitRateOverLine: number     // % Over na prop nas últimas 10
}

// ─── Lesões ───────────────────────────────────────────────────────────────────

export interface PlayerInjury {
  player_id: number
  player_name: string
  team_id: number
  team_name: string
  injury_status: 'Out' | 'Questionable' | 'Probable' | 'FullParticipant'
  injury_description?: string
  body_part?: string
}

// ─── Oportunidades de Aposta ──────────────────────────────────────────────────

export type BetType = 'moneyline' | 'spread' | 'total' | 'player_prop'
export type ConfidenceLevel = 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'EXTREME'

export interface BetOpportunity {
  id?: string
  game_id: string
  bet_type: BetType
  market: string
  target?: string
  novibet_odd: number
  estimated_probability: number  // 0–1
  expected_value?: number        // EV = prob * odd - 1  (positivo = valor real)
  confidence_level: ConfidenceLevel
  method: string[]
  reasoning: string
  historical_hit_rate: number
  risk_flags: string[]
  created_at?: string
}

// ─── Apostas registradas pelo usuário ────────────────────────────────────────

export interface PlacedBet {
  id: string
  game_id: string
  game_date: string
  home_team: string
  away_team: string
  bet_type: BetType
  market: string
  target?: string
  novibet_odd?: number
  estimated_probability: number
  confidence_level: ConfidenceLevel
  reasoning?: string
  risk_flags: string[]
  placed_at: string
}

// ─── Análise ──────────────────────────────────────────────────────────────────

export interface GameAnalysisPayload {
  game: NBAGame
  home_metrics: TeamMetrics
  away_metrics: TeamMetrics
  player_metrics: PlayerMetrics[]
  injuries: PlayerInjury[]
  odds: OddsData
}
