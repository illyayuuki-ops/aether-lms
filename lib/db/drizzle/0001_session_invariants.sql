-- Enforce session invariants at the database level.
--
-- Drizzle cannot express partial unique indexes, and these two are what make
-- the transactional login in routes/sessions.ts safe rather than merely
-- "probably fine":
--
--   1. A computer can have at most one active session.
--   2. A student can have at most one active session.
--
-- Before this, concurrent logins could both pass the "is it in use?" check and
-- insert duplicate active rows.
--
-- The two UPDATEs below close pre-existing duplicate active sessions (stale
-- "ghost" sessions left behind by that race) so the unique indexes can be
-- created without failing. They are safe to run on a live database.

-- Keep one active session per computer (the oldest); close the rest.
UPDATE "sessions" s
   SET is_active      = false,
       logout_reason  = COALESCE(s.logout_reason, 'inactivity'),
       logout_time    = COALESCE(s.logout_time, now())
 WHERE s.is_active = true
   AND s.id NOT IN (
     SELECT min(id) FROM "sessions" WHERE is_active = true GROUP BY computer_number
   );

-- Keep one active session per student (the oldest); close the rest.
UPDATE "sessions" s
   SET is_active      = false,
       logout_reason  = COALESCE(s.logout_reason, 'inactivity'),
       logout_time    = COALESCE(s.logout_time, now())
 WHERE s.is_active = true
   AND s.id NOT IN (
     SELECT min(id) FROM "sessions" WHERE is_active = true GROUP BY student_id
   );

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_one_active_per_computer"
  ON "sessions" ("computer_number")
  WHERE "is_active" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_one_active_per_student"
  ON "sessions" ("student_id")
  WHERE "is_active" = true;

-- Indexes for the hot read paths (session lists, sweeper, analytics).
CREATE INDEX IF NOT EXISTS "sessions_login_time_idx" ON "sessions" ("login_time");
CREATE INDEX IF NOT EXISTS "sessions_active_idx" ON "sessions" ("is_active");
