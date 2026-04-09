-- Tabela de apostas registradas pelo usuário
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS placed_bets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               TEXT NOT NULL,
  game_date             DATE NOT NULL,
  home_team             TEXT NOT NULL,
  away_team             TEXT NOT NULL,
  bet_type              TEXT NOT NULL,
  market                TEXT NOT NULL,
  target                TEXT,
  novibet_odd           NUMERIC,
  estimated_probability NUMERIC NOT NULL,  -- probabilidade no momento da aposta
  confidence_level      TEXT NOT NULL,
  reasoning             TEXT,
  risk_flags            TEXT[]   DEFAULT '{}',
  placed_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS placed_bets_game_date_idx ON placed_bets (game_date);
CREATE INDEX IF NOT EXISTS placed_bets_game_id_idx   ON placed_bets (game_id);
