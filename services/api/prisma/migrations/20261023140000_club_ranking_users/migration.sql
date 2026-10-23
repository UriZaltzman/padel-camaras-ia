-- The club ranking (GET /clubs/{id}/ranking) reads the names of players who played in the club
-- even when they hold no membership there. Only the `system` role gets this, scoped to the
-- session club; staff and owners keep seeing members only.
CREATE FUNCTION app_played_in_club(u uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT app_role() = 'system' AND app_club_id() IS NOT NULL AND EXISTS (
     SELECT 1 FROM match_players mp
      WHERE mp.user_id = u AND mp.club_id = app_club_id() AND mp.confirmed) $$;

DROP POLICY users_select ON "users";
CREATE POLICY users_select ON "users" FOR SELECT TO app_runtime USING (
    id = app_user_id() OR app_is_support() OR app_shares_match(id)
    OR (app_role() IN ('staff', 'owner', 'system') AND app_is_member(id))
    OR app_played_in_club(id));
