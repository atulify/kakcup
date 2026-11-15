-- Run against the intended PostgreSQL database only:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f rust-backend/seed-kaks.sql
-- Requires the existing current schema, including kaks and teams.kak_1..kak_4.
-- The transaction inserts missing names without changing existing statuses and
-- fills missing IDs when any existing IDs match the mapped roster. It never
-- changes legacy name columns or replaces a conflicting existing ID.
BEGIN;

INSERT INTO kaks (name, status) VALUES
  ('Pope', 'active'), ('Dump Bear', 'active'), ('Dyer', 'active'), ('Bopper', 'active'),
  ('Nych', 'active'), ('Colster', 'active'), ('Norton', 'active'), ('Booya', 'active'),
  ('Body', 'active'), ('Boxy', 'active'), ('Tank', 'active'), ('Muldoon', 'active'),
  ('Murray', 'active'), ('Sewter', 'active'), ('Burnie', 'active'), ('Newt', 'active'),
  ('Stubby', 'active'), ('Pete', 'active'), ('No Show', 'active'), ('Mckay', 'active'),
  ('Hooper', 'active'), ('Burns', 'active'), ('Jocquo', 'active'), ('Fatty', 'active'),
  ('TBone', 'active'), ('Sub', 'active'), ('Dano', 'active'), ('Morash', 'active'),
  ('Draper', 'in-memoriam'), ('Nate', 'retired'), ('Needham', 'retired'),
  ('Murray Kightly', 'retired'), ('Snake', 'retired'), ('Chateauvert', 'retired'),
  ('Dave Draper', 'retired'), ('Kittner', 'retired')
ON CONFLICT (name) DO NOTHING;

WITH roster(team_name, member1, member2, member3, member4) AS (
  VALUES ('Champs', 'Pope', 'Dump Bear', 'Dyer', 'Bopper'),
         ('Team 1', 'Nych', 'Colster', 'Norton', 'Booya'),
         ('Team 2', 'Body', 'Boxy', 'Tank', 'Muldoon'),
         ('Team 3', 'Murray', 'Sewter', 'Burnie', 'Newt'),
         ('Team 4', 'Stubby', 'Pete', 'No Show', 'Mckay'),
         ('Team 5', 'Hooper', 'Burns', 'Jocquo', 'Fatty'),
         ('Team 6', 'TBone', 'Sub', 'Dano', 'Morash')
), resolved AS (
  SELECT roster.team_name, k1.id AS id1, k2.id AS id2, k3.id AS id3, k4.id AS id4
  FROM roster
  JOIN kaks k1 ON k1.name = roster.member1
  JOIN kaks k2 ON k2.name = roster.member2
  JOIN kaks k3 ON k3.name = roster.member3
  JOIN kaks k4 ON k4.name = roster.member4
), updated AS (
  UPDATE teams t
  SET kak_1 = r.id1, kak_2 = r.id2, kak_3 = r.id3, kak_4 = r.id4
  FROM years y, resolved r
  WHERE y.year = 2025 AND t.year_id = y.id AND t.name = r.team_name
    AND (t.kak_1 IS NULL OR t.kak_1 = r.id1)
    AND (t.kak_2 IS NULL OR t.kak_2 = r.id2)
    AND (t.kak_3 IS NULL OR t.kak_3 = r.id3)
    AND (t.kak_4 IS NULL OR t.kak_4 = r.id4)
    AND (t.kak_1 IS NULL OR t.kak_2 IS NULL OR t.kak_3 IS NULL OR t.kak_4 IS NULL)
  RETURNING t.name
)
SELECT count(*) AS teams_backfilled FROM updated;

SELECT count(*) AS total_kaks FROM kaks;
COMMIT;
