-- Pro listening tiers: thresholds are tunable without code deploys.
-- Both listen_hours and total_plays must be met to qualify for a rank (plays column = minimum plays).

CREATE TABLE IF NOT EXISTS pro_levels (
  rank         SMALLINT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  listen_hours NUMERIC NOT NULL,
  total_plays  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO pro_levels (rank, name, listen_hours, total_plays) VALUES
  (1, 'Bronze',    0,   0),
  (2, 'Silver',   15,   0),
  (3, 'Gold',     45,   0),
  (4, 'Sapphire', 90,   0),
  (5, 'Ruby',    160,   0),
  (6, 'Amethyst', 240,  0),
  (7, 'Emerald', 333,   0)
ON CONFLICT (rank) DO UPDATE SET
  name = EXCLUDED.name,
  listen_hours = EXCLUDED.listen_hours,
  total_plays = EXCLUDED.total_plays;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS total_listen_seconds BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_plays          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pro_level            SMALLINT REFERENCES pro_levels(rank);

UPDATE users SET pro_level = 1 WHERE plan = 'pro' AND pro_level IS NULL;

ALTER TABLE pro_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read pro_levels" ON pro_levels;
CREATE POLICY "Anyone can read pro_levels"
  ON pro_levels FOR SELECT
  USING (true);
