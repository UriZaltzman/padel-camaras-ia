-- RLS hardening (issue #112, docs/security/rls-matrix.md). Hand-written, like the RLS migration.
--
-- Holes closed here
--   H1  No table had FORCE ROW LEVEL SECURITY: the owner role (migrations, and any connection that
--       forgets `SET LOCAL ROLE app_runtime`) read and wrote every club. FORCE makes RLS apply to
--       the owner too. The migration role and the owner of the SECURITY DEFINER helpers must be a
--       superuser or have BYPASSRLS (superusers / BYPASSRLS always skip FORCE); see the doc.
--   H2  UPDATE policies of player/coach/system writers only pinned the *owner* of the row, not the
--       row's `club_id` or parent key: a player could `UPDATE bookings SET club_id = <other club>`
--       (or point their match_players row at another match) and pull the row, or read access,
--       across clubs. A trigger now makes `club_id` and the parent keys immutable for everyone.
--   H3  The RLS helper functions were executable by PUBLIC.
--   H4  app_runtime could read and write `_prisma_migrations` (the migration history).
--   H5  Internal support writes on any club left no trace unless the API remembered to log them:
--       a trigger now records every support write in audit_log (ids only).
--   H6  Support could grant itself video access: the grant is an audit_log row and any role could
--       insert one. Only the API (role system, after the club or the player agreed) may now.

-- ------------------------------------------------------------------ H1: FORCE everywhere

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
       AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------------ H3: helper functions

DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND (p.proname LIKE 'app\_%' OR p.proname = 'audit_log_immutable')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_runtime', f);
  END LOOP;
END $$;
-- Functions created by later migrations are not callable by PUBLIC either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_runtime;

-- ------------------------------------------------------------------ H4: migration history

DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM app_runtime;
  END IF;
END $$;

-- ------------------------------------------------------------------ H2: immutable keys

-- Usage: EXECUTE FUNCTION forbid_key_change('club_id', 'match_id'). Columns a row is anchored
-- by (its club, its parent) never change; to "move" a row you delete and re-create it, which the
-- policies check from scratch.
CREATE FUNCTION forbid_key_change() RETURNS trigger LANGUAGE plpgsql AS
$$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF to_jsonb(NEW) -> col IS DISTINCT FROM to_jsonb(OLD) -> col THEN
      RAISE EXCEPTION 'column % of % is immutable', col, TG_TABLE_NAME
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION forbid_key_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forbid_key_change() TO app_runtime;

-- club_id on every table that has it, plus the parent keys of the rows players/coaches write.
DO $$
DECLARE
  t text;
  keys text[];
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'club_id' AND NOT a.attisdropped
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    keys := CASE t
      WHEN 'match_players'   THEN ARRAY['club_id', 'match_id']
      WHEN 'booking_players' THEN ARRAY['club_id', 'booking_id']
      WHEN 'clips'           THEN ARRAY['club_id', 'match_id']
      WHEN 'lesson_students' THEN ARRAY['club_id', 'lesson_id']
      WHEN 'lesson_notes'    THEN ARRAY['club_id', 'lesson_id']
      WHEN 'notifications'   THEN ARRAY['club_id', 'user_id']
      ELSE ARRAY['club_id']
    END;
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_key_change(%s)',
      t || '_immutable_keys', t,
      (SELECT string_agg(quote_literal(k), ', ') FROM unnest(keys) k));
  END LOOP;
END $$;

-- ------------------------------------------------------------------ H5: support writes are audited

-- Internal support can write technical rows of any club (policies of the RLS migration). Whatever
-- the API does, the database records who touched which row: ids only, never the row's content.
CREATE FUNCTION audit_support_write() RETURNS trigger LANGUAGE plpgsql AS
$$
DECLARE
  rec jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
BEGIN
  INSERT INTO audit_log (id, club_id, actor_user_id, action, entity_type, entity_id)
  VALUES (
    gen_random_uuid(),
    CASE WHEN TG_TABLE_NAME = 'clubs' THEN (CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE (rec ->> 'id')::uuid END)
         ELSE (rec ->> 'club_id')::uuid END,
    app_user_id(),
    'support.' || lower(TG_OP),
    TG_TABLE_NAME,
    nullif(rec ->> 'id', '')::uuid);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION audit_support_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_support_write() TO app_runtime;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
       AND c.relname NOT IN ('audit_log', 'users', 'auth_identities', 'ratings', '_prisma_migrations')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW
         WHEN (app_role() = ''support'') EXECUTE FUNCTION audit_support_write()',
      t || '_support_audit', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------------ H6: video grants

DROP POLICY audit_log_insert ON "audit_log";
CREATE POLICY audit_log_insert ON "audit_log" FOR INSERT TO app_runtime WITH CHECK (
    app_role() IS NOT NULL AND (club_id IS NULL OR club_id = app_club_id() OR app_is_support())
    AND (actor_user_id IS NULL OR actor_user_id = app_user_id() OR app_role() = 'system')
    -- Nobody grants themselves access to a video: only the API acting as system does.
    AND (action <> 'video.access_granted' OR app_role() = 'system'));
