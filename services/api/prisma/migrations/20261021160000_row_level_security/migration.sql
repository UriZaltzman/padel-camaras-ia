-- Row level security (spec §12): a bug in the API must never expose another club's rows.
-- Hand-written, not expressible in the Prisma schema; keep in sync by hand.
--
-- How it works
--   The API opens each request/job in a transaction and sets, with set_config(..., true):
--     app.user_id  uuid of the authenticated user (empty for devices/jobs)
--     app.club_id  uuid of the club the request acts on (empty for a player's own data)
--     app.role     player | coach | staff | owner | support | club_device | system
--   Policies read those settings. Unset or unknown => no rows (fail closed).
--   The API MUST connect as (or SET LOCAL ROLE to) `app_runtime`. Superusers and the
--   table owner (migrations, seeds) bypass RLS because FORCE is not used.
--
-- Roles
--   player       own bookings, own matches (+ co-players of those matches), own stats, own payments
--   coach        matches/lessons of their own lessons, own lesson payments
--   staff        club bookings, devices, cameras, matches (no personal stats, no payments)
--   owner        staff + payments and settlements of own club + club config
--   support      technical data of any club; video only with a fresh audit_log grant
--   club_device  club's own calendar; uploads matches/media of own club
--   system       API workers (webhooks, pipeline) acting on one club; same club scoping

-- ------------------------------------------------------------------ runtime role

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
-- The audit log is append-only for the runtime.
REVOKE UPDATE, DELETE ON "audit_log" FROM app_runtime;

-- ------------------------------------------------------------------ session helpers

CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION app_club_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.club_id', true), '')::uuid $$;

CREATE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.role', true), '') $$;

-- Reads (staff view, no personal stats): operators of exactly this club.
CREATE FUNCTION app_club_ops(club uuid) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT club IS NOT NULL AND club = app_club_id()
          AND app_role() IN ('staff', 'owner', 'club_device', 'system') $$;

CREATE FUNCTION app_club_owner(club uuid) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT club IS NOT NULL AND club = app_club_id() AND app_role() IN ('owner', 'system') $$;

CREATE FUNCTION app_is_support() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT app_role() = 'support' $$;

-- SECURITY DEFINER helpers read the underlying tables bypassing RLS; they are what
-- keeps policies from recursing into each other. They only answer yes/no for the
-- current session user.
CREATE FUNCTION app_plays_in(m uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT app_role() = 'player' AND EXISTS (
     SELECT 1 FROM match_players mp WHERE mp.match_id = m AND mp.user_id = app_user_id()) $$;

CREATE FUNCTION app_coaches(m uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT app_role() = 'coach' AND EXISTS (
     SELECT 1 FROM lessons l WHERE l.match_id = m AND l.coach_user_id = app_user_id()) $$;

CREATE FUNCTION app_plays_booking(b uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT app_role() = 'player' AND (
     EXISTS (SELECT 1 FROM bookings x WHERE x.id = b AND x.created_by_user_id = app_user_id())
     OR EXISTS (SELECT 1 FROM booking_players bp WHERE bp.booking_id = b AND bp.user_id = app_user_id())) $$;

-- Is `u` a co-player of the session user in some match? (names of teammates)
CREATE FUNCTION app_shares_match(u uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT app_role() = 'player' AND EXISTS (
     SELECT 1 FROM match_players me JOIN match_players other ON other.match_id = me.match_id
      WHERE me.user_id = app_user_id() AND other.user_id = u) $$;

-- Is `u` a member of the session club?
CREATE FUNCTION app_is_member(u uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM memberships ms
                   WHERE ms.user_id = u AND ms.club_id = app_club_id() AND ms.status = 'active') $$;

-- Support may open a video only while a fresh grant exists in audit_log (spec §12).
CREATE FUNCTION app_support_video_grant(asset uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT app_is_support() AND EXISTS (
     SELECT 1 FROM audit_log a
      WHERE a.actor_user_id = app_user_id() AND a.action = 'video.access_granted'
        AND a.entity_type = 'media_asset' AND a.entity_id = asset
        AND a.created_at > now() - interval '1 hour') $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_runtime;

-- ------------------------------------------------------------------ enable RLS everywhere

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clubs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "courts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cameras" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calibrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking_slots_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking_rule_price_bands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking_players" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "match_players" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "points" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "match_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ratings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "processing_jobs" ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------ people

CREATE POLICY users_select ON "users" FOR SELECT TO app_runtime USING (
    id = app_user_id() OR app_is_support() OR app_shares_match(id)
    OR (app_role() IN ('staff', 'owner', 'system') AND app_is_member(id)));
CREATE POLICY users_write ON "users" FOR ALL TO app_runtime
    USING (id = app_user_id() OR app_role() = 'system')
    WITH CHECK (id = app_user_id() OR app_role() = 'system');

CREATE POLICY auth_identities_all ON "auth_identities" FOR ALL TO app_runtime
    USING (user_id = app_user_id() OR app_role() = 'system')
    WITH CHECK (user_id = app_user_id() OR app_role() = 'system');

CREATE POLICY memberships_select ON "memberships" FOR SELECT TO app_runtime USING (
    user_id = app_user_id() OR app_is_support()
    OR (app_club_ops(club_id) AND app_role() <> 'club_device'));
CREATE POLICY memberships_write ON "memberships" FOR ALL TO app_runtime
    USING (app_club_owner(club_id)) WITH CHECK (app_club_owner(club_id));

-- ------------------------------------------------------------------ clubs, courts, config

-- The club directory (find a club, §10) is readable by players; everyone else sees only their club.
CREATE POLICY clubs_select ON "clubs" FOR SELECT TO app_runtime USING (
    app_role() = 'player' OR app_is_support()
    OR (id = app_club_id() AND app_role() IN ('coach', 'staff', 'owner', 'club_device', 'system')));
CREATE POLICY clubs_write ON "clubs" FOR UPDATE TO app_runtime
    USING (app_club_owner(id) OR app_is_support())
    WITH CHECK (app_club_owner(id) OR app_is_support());
CREATE POLICY clubs_insert ON "clubs" FOR INSERT TO app_runtime
    WITH CHECK (app_is_support() OR app_role() = 'system');

CREATE POLICY courts_select ON "courts" FOR SELECT TO app_runtime USING (
    app_role() = 'player' OR app_is_support()
    OR (club_id = app_club_id() AND app_role() IN ('coach', 'staff', 'owner', 'club_device', 'system')));
CREATE POLICY courts_write ON "courts" FOR ALL TO app_runtime
    USING (app_club_owner(club_id) OR app_is_support())
    WITH CHECK (app_club_owner(club_id) OR app_is_support());

CREATE POLICY contracts_select ON "contracts" FOR SELECT TO app_runtime
    USING (app_club_owner(club_id) OR app_is_support());
CREATE POLICY contracts_write ON "contracts" FOR ALL TO app_runtime
    USING (app_is_support()) WITH CHECK (app_is_support());

CREATE POLICY booking_slots_rules_select ON "booking_slots_rules" FOR SELECT TO app_runtime USING (
    app_role() = 'player' OR app_is_support() OR app_club_ops(club_id));
CREATE POLICY booking_slots_rules_write ON "booking_slots_rules" FOR ALL TO app_runtime
    USING (app_club_owner(club_id)) WITH CHECK (app_club_owner(club_id));

CREATE POLICY booking_rule_price_bands_select ON "booking_rule_price_bands" FOR SELECT TO app_runtime USING (
    app_role() = 'player' OR app_is_support() OR app_club_ops(club_id));
CREATE POLICY booking_rule_price_bands_write ON "booking_rule_price_bands" FOR ALL TO app_runtime
    USING (app_club_owner(club_id)) WITH CHECK (app_club_owner(club_id));

-- ------------------------------------------------------------------ hardware (technical)

CREATE POLICY devices_select ON "devices" FOR SELECT TO app_runtime
    USING (app_club_ops(club_id) OR app_is_support());
CREATE POLICY devices_write ON "devices" FOR ALL TO app_runtime
    USING (app_is_support() OR (app_club_ops(club_id) AND app_role() IN ('club_device', 'system')))
    WITH CHECK (app_is_support() OR (app_club_ops(club_id) AND app_role() IN ('club_device', 'system')));

CREATE POLICY cameras_select ON "cameras" FOR SELECT TO app_runtime
    USING (app_club_ops(club_id) OR app_is_support());
CREATE POLICY cameras_write ON "cameras" FOR ALL TO app_runtime
    USING (app_is_support() OR (app_club_ops(club_id) AND app_role() IN ('club_device', 'system')))
    WITH CHECK (app_is_support() OR (app_club_ops(club_id) AND app_role() IN ('club_device', 'system')));

CREATE POLICY calibrations_select ON "calibrations" FOR SELECT TO app_runtime
    USING (app_club_ops(club_id) OR app_is_support());
CREATE POLICY calibrations_write ON "calibrations" FOR ALL TO app_runtime
    USING (app_is_support() OR (club_id = app_club_id() AND app_role() = 'system'))
    WITH CHECK (app_is_support() OR (club_id = app_club_id() AND app_role() = 'system'));

CREATE POLICY processing_jobs_select ON "processing_jobs" FOR SELECT TO app_runtime
    USING (app_club_ops(club_id) OR app_is_support());
CREATE POLICY processing_jobs_write ON "processing_jobs" FOR ALL TO app_runtime
    USING (app_is_support() OR (club_id = app_club_id() AND app_role() = 'system'))
    WITH CHECK (app_is_support() OR (club_id = app_club_id() AND app_role() = 'system'));

-- ------------------------------------------------------------------ bookings

CREATE POLICY bookings_select ON "bookings" FOR SELECT TO app_runtime
    USING (app_club_ops(club_id) OR app_plays_booking(id));
CREATE POLICY bookings_staff_write ON "bookings" FOR ALL TO app_runtime
    USING (app_club_ops(club_id) AND app_role() <> 'club_device')
    WITH CHECK (app_club_ops(club_id) AND app_role() <> 'club_device');
-- A player books for themselves.
CREATE POLICY bookings_player_insert ON "bookings" FOR INSERT TO app_runtime
    WITH CHECK (app_role() = 'player' AND created_by_user_id = app_user_id());
CREATE POLICY bookings_player_update ON "bookings" FOR UPDATE TO app_runtime
    USING (app_role() = 'player' AND created_by_user_id = app_user_id())
    WITH CHECK (app_role() = 'player' AND created_by_user_id = app_user_id());

CREATE POLICY booking_players_select ON "booking_players" FOR SELECT TO app_runtime
    USING (app_club_ops(club_id) OR user_id = app_user_id() OR app_plays_booking(booking_id));
CREATE POLICY booking_players_staff_write ON "booking_players" FOR ALL TO app_runtime
    USING (app_club_ops(club_id) AND app_role() <> 'club_device')
    WITH CHECK (app_club_ops(club_id) AND app_role() <> 'club_device');
CREATE POLICY booking_players_player_write ON "booking_players" FOR ALL TO app_runtime
    USING (app_plays_booking(booking_id)) WITH CHECK (app_plays_booking(booking_id));

-- ------------------------------------------------------------------ matches

CREATE POLICY matches_select ON "matches" FOR SELECT TO app_runtime USING (
    app_club_ops(club_id) OR app_is_support() OR app_plays_in(id) OR app_coaches(id));
CREATE POLICY matches_write ON "matches" FOR ALL TO app_runtime
    USING (app_club_ops(club_id) OR app_is_support())
    WITH CHECK (app_club_ops(club_id) OR app_is_support());

CREATE POLICY match_players_select ON "match_players" FOR SELECT TO app_runtime USING (
    app_club_ops(club_id) OR app_is_support() OR app_plays_in(match_id) OR app_coaches(match_id));
-- A player may only claim/confirm their own slot.
CREATE POLICY match_players_player_write ON "match_players" FOR UPDATE TO app_runtime
    USING (app_role() = 'player' AND (user_id = app_user_id() OR user_id IS NULL) AND app_plays_in(match_id))
    WITH CHECK (app_role() = 'player' AND user_id = app_user_id());
CREATE POLICY match_players_write ON "match_players" FOR ALL TO app_runtime
    USING (app_club_ops(club_id) OR app_is_support())
    WITH CHECK (app_club_ops(club_id) OR app_is_support());

CREATE POLICY points_select ON "points" FOR SELECT TO app_runtime USING (
    app_club_ops(club_id) OR app_is_support() OR app_plays_in(match_id) OR app_coaches(match_id));
CREATE POLICY points_write ON "points" FOR ALL TO app_runtime
    USING (app_club_ops(club_id) OR app_is_support())
    WITH CHECK (app_club_ops(club_id) OR app_is_support());

CREATE POLICY shots_select ON "shots" FOR SELECT TO app_runtime USING (
    app_club_ops(club_id) OR app_is_support() OR app_plays_in(match_id) OR app_coaches(match_id));
CREATE POLICY shots_write ON "shots" FOR ALL TO app_runtime
    USING (app_club_ops(club_id) OR app_is_support())
    WITH CHECK (app_club_ops(club_id) OR app_is_support());

-- Personal statistics: only the player. Staff, owner, coach and support do not read them.
CREATE POLICY match_stats_select ON "match_stats" FOR SELECT TO app_runtime
    USING (app_role() = 'player' AND user_id = app_user_id());
CREATE POLICY match_stats_write ON "match_stats" FOR ALL TO app_runtime
    USING (club_id = app_club_id() AND app_role() = 'system')
    WITH CHECK (club_id = app_club_id() AND app_role() = 'system');

CREATE POLICY insights_select ON "insights" FOR SELECT TO app_runtime
    USING (app_role() = 'player' AND user_id = app_user_id());
CREATE POLICY insights_write ON "insights" FOR ALL TO app_runtime
    USING (club_id = app_club_id() AND app_role() = 'system')
    WITH CHECK (club_id = app_club_id() AND app_role() = 'system');

-- ------------------------------------------------------------------ media

CREATE POLICY media_assets_select ON "media_assets" FOR SELECT TO app_runtime USING (
    app_club_ops(club_id) OR app_plays_in(match_id) OR app_coaches(match_id)
    OR app_support_video_grant(id));
CREATE POLICY media_assets_write ON "media_assets" FOR ALL TO app_runtime
    USING (app_club_ops(club_id) AND app_role() <> 'staff')
    WITH CHECK (app_club_ops(club_id) AND app_role() <> 'staff');

CREATE POLICY clips_select ON "clips" FOR SELECT TO app_runtime USING (
    app_club_ops(club_id) OR user_id = app_user_id() OR app_plays_in(match_id) OR app_coaches(match_id));
CREATE POLICY clips_ops_write ON "clips" FOR ALL TO app_runtime
    USING (app_club_ops(club_id)) WITH CHECK (app_club_ops(club_id));
CREATE POLICY clips_player_write ON "clips" FOR ALL TO app_runtime
    USING (app_role() = 'player' AND user_id = app_user_id() AND app_plays_in(match_id))
    WITH CHECK (app_role() = 'player' AND user_id = app_user_id() AND app_plays_in(match_id));

-- ------------------------------------------------------------------ money

CREATE POLICY payments_select ON "payments" FOR SELECT TO app_runtime USING (
    app_club_owner(club_id) OR (app_role() = 'player' AND user_id = app_user_id())
    OR (app_role() = 'coach' AND user_id = app_user_id()));
CREATE POLICY payments_write ON "payments" FOR ALL TO app_runtime
    USING (club_id = app_club_id() AND app_role() = 'system')
    WITH CHECK (club_id = app_club_id() AND app_role() = 'system');

CREATE POLICY settlements_select ON "settlements" FOR SELECT TO app_runtime
    USING (app_club_owner(club_id));
CREATE POLICY settlements_write ON "settlements" FOR ALL TO app_runtime
    USING (club_id = app_club_id() AND app_role() = 'system')
    WITH CHECK (club_id = app_club_id() AND app_role() = 'system');

-- ------------------------------------------------------------------ misc

-- Ratings follow the player between clubs (no club_id): self, co-players, workers.
CREATE POLICY ratings_select ON "ratings" FOR SELECT TO app_runtime USING (
    user_id = app_user_id() OR app_shares_match(user_id) OR app_role() = 'system');
CREATE POLICY ratings_write ON "ratings" FOR ALL TO app_runtime
    USING (app_role() = 'system') WITH CHECK (app_role() = 'system');

CREATE POLICY lessons_select ON "lessons" FOR SELECT TO app_runtime USING (
    app_club_ops(club_id) OR (app_role() = 'coach' AND coach_user_id = app_user_id()));
CREATE POLICY lessons_ops_write ON "lessons" FOR ALL TO app_runtime
    USING (app_club_owner(club_id)) WITH CHECK (app_club_owner(club_id));
CREATE POLICY lessons_coach_write ON "lessons" FOR UPDATE TO app_runtime
    USING (app_role() = 'coach' AND coach_user_id = app_user_id())
    WITH CHECK (app_role() = 'coach' AND coach_user_id = app_user_id());

CREATE POLICY notifications_select ON "notifications" FOR SELECT TO app_runtime
    USING (user_id = app_user_id());
CREATE POLICY notifications_update ON "notifications" FOR UPDATE TO app_runtime
    USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
CREATE POLICY notifications_insert ON "notifications" FOR INSERT TO app_runtime
    WITH CHECK (app_role() = 'system' AND (club_id IS NULL OR club_id = app_club_id()));

-- Append-only (UPDATE/DELETE also revoked above). `club_id` is null for global events.
CREATE POLICY audit_log_select ON "audit_log" FOR SELECT TO app_runtime
    USING (app_club_owner(club_id) OR app_is_support());
CREATE POLICY audit_log_insert ON "audit_log" FOR INSERT TO app_runtime WITH CHECK (
    app_role() IS NOT NULL AND (club_id IS NULL OR club_id = app_club_id() OR app_is_support())
    AND (actor_user_id IS NULL OR actor_user_id = app_user_id() OR app_role() = 'system'));
