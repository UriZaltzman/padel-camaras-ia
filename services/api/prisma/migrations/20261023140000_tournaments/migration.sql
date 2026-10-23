-- Tournaments (CL-08, #263). Matches are `bookings` rows with origin 'tournament', so
-- bookings_no_overlap_excl (#39) applies to them unchanged.
ALTER TYPE "booking_origin" ADD VALUE 'tournament';

CREATE TYPE "tournament_status" AS ENUM ('registration', 'in_progress', 'finished', 'cancelled');
CREATE TYPE "tournament_stage" AS ENUM ('group', 'round_of_16', 'quarter', 'semi', 'final');
CREATE TYPE "tournament_match_status" AS ENUM ('scheduled', 'awaiting_confirmation', 'confirmed');

CREATE TABLE "tournaments" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" SMALLINT NOT NULL,
    "status" "tournament_status" NOT NULL DEFAULT 'registration',
    "entry_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "match_minutes" SMALLINT NOT NULL DEFAULT 90,
    "points_config" JSONB NOT NULL,
    "created_by_user_id" UUID,
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tournaments_category_check" CHECK ("category" BETWEEN 1 AND 6),
    CONSTRAINT "tournaments_fee_check" CHECK ("entry_fee_cents" >= 0),
    CONSTRAINT "tournaments_minutes_check" CHECK ("match_minutes" BETWEEN 30 AND 180)
);
CREATE INDEX "tournaments_club_id_status_idx" ON "tournaments"("club_id", "status");

CREATE TABLE "tournament_groups" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tournament_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tournament_groups_tournament_id_position_key" ON "tournament_groups"("tournament_id", "position");
CREATE INDEX "tournament_groups_club_id_idx" ON "tournament_groups"("club_id");

CREATE TABLE "tournament_registrations" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "player1_user_id" UUID NOT NULL,
    "player2_user_id" UUID NOT NULL,
    "strength" DOUBLE PRECISION,
    "seed" SMALLINT,
    "group_id" UUID,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMPTZ(3),
    "withdrawn_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "tournament_registrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tournament_registrations_distinct_check" CHECK ("player1_user_id" <> "player2_user_id")
);
CREATE INDEX "tournament_registrations_tournament_id_idx" ON "tournament_registrations"("tournament_id");
CREATE INDEX "tournament_registrations_club_id_idx" ON "tournament_registrations"("club_id");
-- A player is in one active pair per tournament, on either side.
CREATE UNIQUE INDEX "tournament_registrations_p1_active_key"
    ON "tournament_registrations"("tournament_id", "player1_user_id") WHERE "withdrawn_at" IS NULL;
CREATE UNIQUE INDEX "tournament_registrations_p2_active_key"
    ON "tournament_registrations"("tournament_id", "player2_user_id") WHERE "withdrawn_at" IS NULL;

CREATE TABLE "tournament_matches" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "stage" "tournament_stage" NOT NULL,
    "group_id" UUID,
    "round" SMALLINT NOT NULL,
    "bracket_key" TEXT,
    "pair_a_id" UUID,
    "pair_b_id" UUID,
    "next_match_id" UUID,
    "next_side" TEXT,
    "booking_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "court_id" UUID NOT NULL,
    "status" "tournament_match_status" NOT NULL DEFAULT 'scheduled',
    "sets" JSONB,
    "winner_pair_id" UUID,
    "reported_by_user_id" UUID,
    "confirmed_by_user_id" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tournament_matches_side_check" CHECK ("next_side" IS NULL OR "next_side" IN ('a', 'b'))
);
CREATE UNIQUE INDEX "tournament_matches_booking_id_key" ON "tournament_matches"("booking_id");
CREATE INDEX "tournament_matches_tournament_id_idx" ON "tournament_matches"("tournament_id");
CREATE INDEX "tournament_matches_club_id_idx" ON "tournament_matches"("club_id");

CREATE TABLE "tournament_points" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "awarded_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "tournament_points_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tournament_points_nonneg_check" CHECK ("points" >= 0)
);
CREATE UNIQUE INDEX "tournament_points_tournament_id_user_id_key" ON "tournament_points"("tournament_id", "user_id");
CREATE INDEX "tournament_points_club_id_awarded_at_idx" ON "tournament_points"("club_id", "awarded_at");

ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "tournament_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_p1_fkey"
    FOREIGN KEY ("player1_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_p2_fkey"
    FOREIGN KEY ("player2_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "tournament_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_court_id_fkey"
    FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tournament_points" ADD CONSTRAINT "tournament_points_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournament_points" ADD CONSTRAINT "tournament_points_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security: the club's operators (and the system role the API uses after it has
-- authorised a player) see and write only the rows of the club in the session.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tournaments', 'tournament_groups', 'tournament_registrations',
                           'tournament_matches', 'tournament_points']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_runtime', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO app_runtime USING (app_club_ops(club_id) AND app_role() <> ''club_device'') WITH CHECK (app_club_ops(club_id) AND app_role() <> ''club_device'')',
      t || '_club', t);
  END LOOP;
END $$;
