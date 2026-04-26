-- Abuse-signal columns: set on Google sign-in only (see NextAuth upsertUser).
-- Not exposed to clients. Use for manual review before any IP-based blocking.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_ip     text,
  ADD COLUMN IF NOT EXISTS last_seen_ip  text,
  ADD COLUMN IF NOT EXISTS last_seen_at  timestamptz;

-- Optional: speed up “many accounts from one IP” reviews in Supabase SQL editor.
CREATE INDEX IF NOT EXISTS users_signup_ip_idx ON users (signup_ip) WHERE signup_ip IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_last_seen_ip_idx ON users (last_seen_ip) WHERE last_seen_ip IS NOT NULL;

-- Manual review examples (run in Supabase SQL):
--
-- Signups per IP (first-seen address):
--   SELECT signup_ip, count(*) AS accounts
--   FROM users
--   WHERE signup_ip IS NOT NULL
--   GROUP BY signup_ip
--   HAVING count(*) >= 3
--   ORDER BY accounts DESC;
--
-- Recent activity per last-seen IP:
--   SELECT last_seen_ip, count(*) AS accounts
--   FROM users
--   WHERE last_seen_ip IS NOT NULL AND last_seen_at > now() - interval '7 days'
--   GROUP BY last_seen_ip
--   HAVING count(*) >= 3
--   ORDER BY accounts DESC;
