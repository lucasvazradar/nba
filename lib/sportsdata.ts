import type {
  NBAGame,
  TeamGameStat,
  PlayerGameStat,
  PlayerProjection,
  PlayerInjury,
} from '@/types'

const BASE_URL = 'https://api.sportsdata.io/v3/nba'
const API_KEY = process.env.SPORTSDATA_API_KEY!

async function fetchSportsData<T>(endpoint: string): Promise<T> {
  const url = `${BASE_URL}${endpoint}?key=${API_KEY}`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`SportsDataIO error: ${res.status} ${endpoint}`)
  return res.json() as Promise<T>
}

// ─── Jogos ────────────────────────────────────────────────────────────────────

// date format: YYYY-MMM-DD (ex: 2025-APR-08)
function toSportsDataDate(isoDate: string): string {
  // Input: "2026-04-08" → Output: "2026-APR-08"
  const [year, month, day] = isoDate.split('-')
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return `${year}-${months[parseInt(month) - 1]}-${day}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGame(raw: any): NBAGame {
  return {
    id: String(raw.GameID),
    home_team: raw.HomeTeam,
    away_team: raw.AwayTeam,
    home_team_id: raw.HomeTeamID,
    away_team_id: raw.AwayTeamID,
    game_date: raw.Day?.split('T')[0] ?? '',
    game_time: raw.DateTime
      ? (() => {
          // SportsDataIO returns Eastern Time (ET) without timezone indicator.
          // April = EDT (UTC-4). Append offset so JS parses correctly before converting to BRT.
          const etString = raw.DateTime.includes('Z') || raw.DateTime.includes('+')
            ? raw.DateTime
            : raw.DateTime + '-04:00'
          return new Date(etString).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo',
          })
        })()
      : undefined,
    status:
      raw.Status === 'Final'
        ? 'final'
        : raw.Status === 'InProgress'
        ? 'live'
        : 'scheduled',
    home_score: raw.HomeTeamScore ?? undefined,
    away_score: raw.AwayTeamScore ?? undefined,
  }
}

export async function getGamesByDate(isoDate: string): Promise<NBAGame[]> {
  const sdDate = toSportsDataDate(isoDate)
  const raw = await fetchSportsData<unknown[]>(`/scores/json/GamesByDate/${sdDate}`)
  return raw.map(mapGame)
}

// ─── Histórico do time (últimas 10) ──────────────────────────────────────────


export async function getLast10Games(teamId: number): Promise<TeamGameStat[]> {
  const now = new Date()

  // GamesByDate for past 21 days in parallel — works on all SportsDataIO plans.
  // team_season_all returns CUMULATIVE season stats (not per-game), so we avoid it.
  const dates = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (i + 1))
    return d.toISOString().split('T')[0]
  })

  const allResults = await Promise.allSettled(dates.map((d) => getGamesByDate(d)))

  const games: TeamGameStat[] = []
  for (const r of allResults) {
    if (games.length >= 10) break
    if (r.status !== 'fulfilled') continue
    for (const game of r.value) {
      // Only include completed games with realistic NBA scores
      if (game.home_score == null || game.away_score == null) continue
      if (game.home_score < 60 || game.away_score < 60) continue   // impossibly low
      if (game.home_score > 175 || game.away_score > 175) continue // impossibly high

      const isHome = game.home_team_id === teamId
      const isAway = game.away_team_id === teamId
      if (!isHome && !isAway) continue

      const scored  = isHome ? game.home_score : game.away_score
      const allowed = isHome ? game.away_score : game.home_score

      games.push({
        game_id: game.id,
        game_date: game.game_date,
        opponent: isHome ? game.away_team : game.home_team,
        is_home: isHome,
        points_scored: scored,
        points_allowed: allowed,
        won: scored > allowed,
        pace: undefined,
        possessions: undefined,
        offensive_rating: undefined,
        defensive_rating: undefined,
        three_point_pct: undefined,
        total_points: scored + allowed,
      })
    }
  }

  return games
}

// ─── Stats de jogadores por data ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPlayerStat(raw: any): PlayerGameStat {
  return {
    player_id: raw.PlayerID,
    player_name: raw.Name,
    team_id: raw.TeamID,
    game_date: raw.Day?.split('T')[0] ?? '',
    points: raw.Points ?? 0,
    rebounds: raw.Rebounds ?? 0,
    assists: raw.Assists ?? 0,
    minutes: parseFloat(raw.Minutes ?? '0'),
    fantasy_points: raw.FantasyPoints ?? undefined,
  }
}

export async function getPlayerStatsByDate(isoDate: string): Promise<PlayerGameStat[]> {
  // Tenta o dia solicitado e os 3 dias anteriores até encontrar dados (jogos podem não ter ocorrido ainda)
  for (let daysBack = 0; daysBack <= 3; daysBack++) {
    try {
      const d = new Date(isoDate + 'T12:00:00Z')
      d.setDate(d.getDate() - daysBack)
      const dateStr = d.toISOString().split('T')[0]
      const sdDate = toSportsDataDate(dateStr)
      const raw = await fetchSportsData<unknown[]>(`/stats/json/PlayerGameStatsByDate/${sdDate}`)
      if (Array.isArray(raw) && raw.length > 0) return raw.map(mapPlayerStat)
    } catch {
      continue
    }
  }
  return []
}

// ─── Projeções ML ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProjection(raw: any): PlayerProjection {
  return {
    player_id: raw.PlayerID,
    player_name: raw.Name,
    team_id: raw.TeamID,
    projected_points: raw.Points ?? 0,
    projected_rebounds: raw.Rebounds ?? 0,
    projected_assists: raw.Assists ?? 0,
    projected_minutes: parseFloat(raw.Minutes ?? '0'),
    updated_at: new Date().toISOString(),
  }
}

export async function getPlayerProjections(isoDate: string): Promise<PlayerProjection[]> {
  try {
    const sdDate = toSportsDataDate(isoDate)
    const raw = await fetchSportsData<unknown[]>(
      `/projections/json/PlayerGameProjectionStatsByDate/${sdDate}`
    )
    return raw.map(mapProjection)
  } catch {
    return []
  }
}

// ─── Lesões ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInjury(raw: any): PlayerInjury {
  return {
    player_id: raw.PlayerID,
    player_name: raw.Name,
    team_id: raw.TeamID,
    team_name: raw.Team,
    injury_status: raw.InjuryStatus ?? 'FullParticipant',
    injury_description: raw.InjuryBodyPart
      ? `${raw.InjuryBodyPart} — ${raw.InjuryNotes ?? ''}`
      : undefined,
    body_part: raw.InjuryBodyPart ?? undefined,
  }
}

export async function getInjuries(): Promise<PlayerInjury[]> {
  try {
    const raw = await fetchSportsData<unknown[]>('/scores/json/Injuries')
    return raw
      .map(mapInjury)
      .filter((p) => p.injury_status !== 'FullParticipant')
  } catch {
    // Endpoint não disponível no plano atual — retorna vazio
    return []
  }
}
