-- Favorite clubs of a player (#325): the clubs they usually play at, in the order they chose.
CREATE TABLE "player_favorite_clubs" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_favorite_clubs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "player_favorite_clubs_position_check" CHECK ("position" >= 0)
);

CREATE UNIQUE INDEX "player_favorite_clubs_user_id_club_id_key" ON "player_favorite_clubs"("user_id", "club_id");
CREATE INDEX "player_favorite_clubs_club_id_idx" ON "player_favorite_clubs"("club_id");

ALTER TABLE "player_favorite_clubs" ADD CONSTRAINT "player_favorite_clubs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_favorite_clubs" ADD CONSTRAINT "player_favorite_clubs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security. The list belongs to the player: only they read and write their rows, in any
-- role they act with. No club role, internal support or worker reads it; a club only gets the
-- anonymous count below.
ALTER TABLE "player_favorite_clubs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "player_favorite_clubs" FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "player_favorite_clubs" TO app_runtime;

CREATE POLICY player_favorite_clubs_own ON "player_favorite_clubs" FOR ALL TO app_runtime
    USING (user_id = app_user_id())
    WITH CHECK (user_id = app_user_id());

CREATE TRIGGER player_favorite_clubs_immutable_keys BEFORE UPDATE ON "player_favorite_clubs"
    FOR EACH ROW EXECUTE FUNCTION forbid_key_change('club_id', 'user_id');
CREATE TRIGGER player_favorite_clubs_support_audit AFTER INSERT OR UPDATE OR DELETE ON "player_favorite_clubs"
    FOR EACH ROW WHEN (app_role() = 'support') EXECUTE FUNCTION audit_support_write();

-- How many players starred the club: a number, never who. Only the club's staff and owner ask.
CREATE FUNCTION app_favorite_count(club uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT CASE WHEN app_club_ops(club)
               THEN (SELECT count(*)::int FROM player_favorite_clubs f WHERE f.club_id = club)
               ELSE 0 END $$;
REVOKE EXECUTE ON FUNCTION app_favorite_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_favorite_count(uuid) TO app_runtime;
