-- CreateEnum
CREATE TYPE "match_status" AS ENUM ('scheduled', 'recording', 'recorded', 'processing', 'published', 'needs_review', 'archived', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "match_type" AS ENUM ('match', 'lesson');

-- CreateEnum
CREATE TYPE "point_end_reason" AS ENUM ('double_fault', 'own_floor', 'net', 'direct_wall', 'double_bounce', 'out_of_court', 'ball_lost', 'other');

-- CreateEnum
CREATE TYPE "shot_type" AS ENUM ('serve', 'forehand', 'backhand', 'forehand_volley', 'backhand_volley', 'bandeja', 'vibora', 'smash', 'lob', 'off_the_wall', 'unknown');

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "court_id" UUID NOT NULL,
    "booking_id" UUID,
    "type" "match_type" NOT NULL DEFAULT 'match',
    "status" "match_status" NOT NULL DEFAULT 'scheduled',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "golden_point" BOOLEAN NOT NULL DEFAULT true,
    "best_of_sets" SMALLINT NOT NULL DEFAULT 3,
    "super_tiebreak" BOOLEAN NOT NULL DEFAULT false,
    "final_score" JSONB,
    "winner_team" SMALLINT,
    "model_version" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_players" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID,
    "team" SMALLINT NOT NULL,
    "initial_side" "camera_end" NOT NULL,
    "track_index" SMALLINT NOT NULL,
    "thumbnail_url" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "set_number" SMALLINT NOT NULL,
    "game_number" SMALLINT NOT NULL,
    "server_player_id" UUID,
    "winner_team" SMALLINT NOT NULL,
    "end_reason" "point_end_reason" NOT NULL,
    "start_ms" INTEGER NOT NULL,
    "end_ms" INTEGER NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "corrected_by_user" BOOLEAN NOT NULL DEFAULT false,
    "corrected_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shots" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "point_id" UUID NOT NULL,
    "match_player_id" UUID,
    "time_ms" INTEGER NOT NULL,
    "shot_type" "shot_type" NOT NULL DEFAULT 'unknown',
    "player_x" DOUBLE PRECISION NOT NULL,
    "player_y" DOUBLE PRECISION NOT NULL,
    "target_x" DOUBLE PRECISION,
    "target_y" DOUBLE PRECISION,
    "speed_kmh" DECIMAL(5,1),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_stats" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stats" JSONB NOT NULL,
    "formula_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "match_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matches_court_id_starts_at_idx" ON "matches"("court_id", "starts_at");

-- CreateIndex
CREATE INDEX "matches_club_id_starts_at_idx" ON "matches"("club_id", "starts_at");

-- CreateIndex
CREATE INDEX "matches_booking_id_idx" ON "matches"("booking_id");

-- CreateIndex
CREATE INDEX "matches_status_idx" ON "matches"("status");

-- CreateIndex
CREATE INDEX "match_players_user_id_idx" ON "match_players"("user_id");

-- CreateIndex
CREATE INDEX "match_players_club_id_idx" ON "match_players"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_players_match_id_track_index_key" ON "match_players"("match_id", "track_index");

-- CreateIndex
CREATE UNIQUE INDEX "match_players_match_id_user_id_key" ON "match_players"("match_id", "user_id");

-- CreateIndex
CREATE INDEX "points_club_id_idx" ON "points"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "points_match_id_number_key" ON "points"("match_id", "number");

-- CreateIndex
CREATE INDEX "shots_point_id_time_ms_idx" ON "shots"("point_id", "time_ms");

-- CreateIndex
CREATE INDEX "shots_match_id_time_ms_idx" ON "shots"("match_id", "time_ms");

-- CreateIndex
CREATE INDEX "shots_match_player_id_idx" ON "shots"("match_player_id");

-- CreateIndex
CREATE INDEX "shots_club_id_idx" ON "shots"("club_id");

-- CreateIndex
CREATE INDEX "match_stats_user_id_idx" ON "match_stats"("user_id");

-- CreateIndex
CREATE INDEX "match_stats_club_id_idx" ON "match_stats"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_stats_match_id_user_id_key" ON "match_stats"("match_id", "user_id");

-- CreateIndex
CREATE INDEX "insights_user_id_idx" ON "insights"("user_id");

-- CreateIndex
CREATE INDEX "insights_club_id_idx" ON "insights"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "insights_match_id_user_id_position_key" ON "insights"("match_id", "user_id", "position");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points" ADD CONSTRAINT "points_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points" ADD CONSTRAINT "points_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points" ADD CONSTRAINT "points_server_player_id_fkey" FOREIGN KEY ("server_player_id") REFERENCES "match_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shots" ADD CONSTRAINT "shots_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shots" ADD CONSTRAINT "shots_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shots" ADD CONSTRAINT "shots_point_id_fkey" FOREIGN KEY ("point_id") REFERENCES "points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shots" ADD CONSTRAINT "shots_match_player_id_fkey" FOREIGN KEY ("match_player_id") REFERENCES "match_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_stats" ADD CONSTRAINT "match_stats_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_stats" ADD CONSTRAINT "match_stats_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_stats" ADD CONSTRAINT "match_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------- Rules Prisma cannot express

ALTER TABLE "matches"
    ADD CONSTRAINT "matches_time_range_check" CHECK ("ends_at" > "starts_at"),
    ADD CONSTRAINT "matches_best_of_sets_check" CHECK ("best_of_sets" BETWEEN 1 AND 3),
    ADD CONSTRAINT "matches_winner_team_check" CHECK ("winner_team" IS NULL OR "winner_team" IN (1, 2)),
    ADD CONSTRAINT "matches_final_score_check"
        CHECK ("final_score" IS NULL OR jsonb_typeof("final_score") = 'array'),
    ADD CONSTRAINT "matches_model_version_check"
        CHECK ("model_version" IS NULL OR length(btrim("model_version")) > 0);

ALTER TABLE "match_players"
    ADD CONSTRAINT "match_players_team_check" CHECK ("team" IN (1, 2)),
    ADD CONSTRAINT "match_players_track_index_check" CHECK ("track_index" BETWEEN 0 AND 3),
    ADD CONSTRAINT "match_players_confirmed_check"
        CHECK (NOT "confirmed" OR ("user_id" IS NOT NULL AND "confirmed_at" IS NOT NULL));

ALTER TABLE "points"
    ADD CONSTRAINT "points_number_check" CHECK ("number" >= 1),
    ADD CONSTRAINT "points_set_game_check" CHECK ("set_number" >= 1 AND "game_number" >= 1),
    ADD CONSTRAINT "points_winner_team_check" CHECK ("winner_team" IN (1, 2)),
    ADD CONSTRAINT "points_time_range_check" CHECK ("start_ms" >= 0 AND "end_ms" >= "start_ms"),
    ADD CONSTRAINT "points_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1),
    ADD CONSTRAINT "points_corrected_check"
        CHECK (NOT "corrected_by_user" OR "corrected_at" IS NOT NULL);

-- Court is 10 x 20 m; positions may fall slightly outside (players behind the glass), so the
-- check only rejects values that are clearly wrong units (pixels, centimetres).
ALTER TABLE "shots"
    ADD CONSTRAINT "shots_time_check" CHECK ("time_ms" >= 0),
    ADD CONSTRAINT "shots_player_position_check"
        CHECK ("player_x" BETWEEN -5 AND 15 AND "player_y" BETWEEN -5 AND 25),
    ADD CONSTRAINT "shots_target_position_check"
        CHECK (("target_x" IS NULL) = ("target_y" IS NULL)
               AND ("target_x" IS NULL OR ("target_x" BETWEEN -5 AND 15 AND "target_y" BETWEEN -5 AND 25))),
    ADD CONSTRAINT "shots_speed_check" CHECK ("speed_kmh" IS NULL OR "speed_kmh" BETWEEN 0 AND 400);

ALTER TABLE "match_stats"
    ADD CONSTRAINT "match_stats_stats_check" CHECK (jsonb_typeof("stats") = 'object'),
    ADD CONSTRAINT "match_stats_formula_version_check" CHECK (length(btrim("formula_version")) > 0);

ALTER TABLE "insights"
    ADD CONSTRAINT "insights_type_check" CHECK (length(btrim("type")) > 0),
    ADD CONSTRAINT "insights_text_check" CHECK (length(btrim("text")) > 0),
    ADD CONSTRAINT "insights_facts_check" CHECK (jsonb_typeof("facts") = 'object'),
    ADD CONSTRAINT "insights_position_check" CHECK ("position" >= 1);
