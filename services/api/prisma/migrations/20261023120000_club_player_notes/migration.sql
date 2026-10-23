-- Club CRM (CL-06): tags and a private note per person and club.
CREATE TABLE "club_player_notes" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tags" TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "club_player_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "club_player_notes_tags_check" CHECK (cardinality("tags") <= 10),
    CONSTRAINT "club_player_notes_notes_check" CHECK ("notes" IS NULL OR char_length("notes") <= 1000)
);

CREATE UNIQUE INDEX "club_player_notes_club_id_user_id_key" ON "club_player_notes"("club_id", "user_id");
CREATE INDEX "club_player_notes_user_id_idx" ON "club_player_notes"("user_id");

ALTER TABLE "club_player_notes" ADD CONSTRAINT "club_player_notes_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "club_player_notes" ADD CONSTRAINT "club_player_notes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security: only the operators of exactly this club (staff, owner) read and write.
ALTER TABLE "club_player_notes" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "club_player_notes" TO app_runtime;

CREATE POLICY club_player_notes_all ON "club_player_notes" FOR ALL TO app_runtime
    USING (app_club_ops(club_id) AND app_role() <> 'club_device')
    WITH CHECK (app_club_ops(club_id) AND app_role() <> 'club_device');

-- The club's operators may read the profile (name, phone, email) of anyone with a booking at
-- the club, not only of its members: that is who the CRM lists.
CREATE FUNCTION app_booked_here(u uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM booking_players bp
                   WHERE bp.user_id = u AND bp.club_id = app_club_id()) $$;
GRANT EXECUTE ON FUNCTION app_booked_here(uuid) TO app_runtime;

DROP POLICY users_select ON "users";
CREATE POLICY users_select ON "users" FOR SELECT TO app_runtime USING (
    id = app_user_id() OR app_is_support() OR app_shares_match(id)
    OR (app_role() IN ('staff', 'owner', 'system') AND (app_is_member(id) OR app_booked_here(id))));
