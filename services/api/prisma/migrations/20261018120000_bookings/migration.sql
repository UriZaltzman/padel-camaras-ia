-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('held', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired');

-- CreateEnum
CREATE TYPE "booking_origin" AS ENUM ('app', 'panel');

-- CreateEnum
CREATE TYPE "deposit_kind" AS ENUM ('none', 'fixed', 'percent');

-- CreateTable
CREATE TABLE "booking_slots_rules" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "court_id" UUID NOT NULL,
    "days_of_week" SMALLINT[],
    "opens_at" TIME(0) NOT NULL,
    "closes_at" TIME(0) NOT NULL,
    "allowed_durations_minutes" SMALLINT[],
    "start_interval_minutes" SMALLINT NOT NULL,
    "deposit_kind" "deposit_kind" NOT NULL DEFAULT 'none',
    "deposit_amount_cents" INTEGER,
    "deposit_bps" INTEGER,
    "cancellation_hours" SMALLINT NOT NULL DEFAULT 24,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_slots_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_rule_price_bands" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "starts_at" TIME(0) NOT NULL,
    "ends_at" TIME(0) NOT NULL,
    "duration_minutes" SMALLINT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_rule_price_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "court_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'held',
    "price_cents" INTEGER NOT NULL,
    "deposit_paid_cents" INTEGER NOT NULL DEFAULT 0,
    "origin" "booking_origin" NOT NULL,
    "hold_expires_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "includes_minors" BOOLEAN NOT NULL DEFAULT false,
    "guardian_user_id" UUID,
    "guardian_permission_at" TIMESTAMPTZ(3),
    "no_record" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_players" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "user_id" UUID,
    "invited_by_user_id" UUID,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_slots_rules_court_id_idx" ON "booking_slots_rules"("court_id");

-- CreateIndex
CREATE INDEX "booking_slots_rules_club_id_idx" ON "booking_slots_rules"("club_id");

-- CreateIndex
CREATE INDEX "booking_rule_price_bands_club_id_idx" ON "booking_rule_price_bands"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_rule_price_bands_rule_id_starts_at_duration_minutes_key" ON "booking_rule_price_bands"("rule_id", "starts_at", "duration_minutes");

-- CreateIndex
CREATE INDEX "bookings_court_id_starts_at_idx" ON "bookings"("court_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_club_id_starts_at_idx" ON "bookings"("club_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_status_hold_expires_at_idx" ON "bookings"("status", "hold_expires_at");

-- CreateIndex
CREATE INDEX "booking_players_user_id_idx" ON "booking_players"("user_id");

-- CreateIndex
CREATE INDEX "booking_players_club_id_idx" ON "booking_players"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_players_booking_id_position_key" ON "booking_players"("booking_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "booking_players_booking_id_user_id_key" ON "booking_players"("booking_id", "user_id");

-- AddForeignKey
ALTER TABLE "booking_slots_rules" ADD CONSTRAINT "booking_slots_rules_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_slots_rules" ADD CONSTRAINT "booking_slots_rules_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_rule_price_bands" ADD CONSTRAINT "booking_rule_price_bands_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_rule_price_bands" ADD CONSTRAINT "booking_rule_price_bands_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "booking_slots_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guardian_user_id_fkey" FOREIGN KEY ("guardian_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_players" ADD CONSTRAINT "booking_players_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_players" ADD CONSTRAINT "booking_players_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_players" ADD CONSTRAINT "booking_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_players" ADD CONSTRAINT "booking_players_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK constraints (not expressible in Prisma schema; keep in sync by hand).
-- The exclusion constraint against overlapping bookings is added in #39.

ALTER TABLE "booking_slots_rules"
    ADD CONSTRAINT "booking_slots_rules_days_of_week_check"
        CHECK (cardinality("days_of_week") > 0 AND "days_of_week" <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]),
    ADD CONSTRAINT "booking_slots_rules_durations_check"
        CHECK (cardinality("allowed_durations_minutes") > 0 AND "allowed_durations_minutes" <@ ARRAY[60,90,120]::SMALLINT[]),
    ADD CONSTRAINT "booking_slots_rules_start_interval_check"
        CHECK ("start_interval_minutes" > 0 AND "start_interval_minutes" <= 120),
    ADD CONSTRAINT "booking_slots_rules_cancellation_hours_check"
        CHECK ("cancellation_hours" >= 0),
    ADD CONSTRAINT "booking_slots_rules_deposit_check"
        CHECK (COALESCE(
            ("deposit_kind" = 'none'    AND "deposit_amount_cents" IS NULL     AND "deposit_bps" IS NULL) OR
            ("deposit_kind" = 'fixed'   AND "deposit_amount_cents" IS NOT NULL AND "deposit_amount_cents" > 0 AND "deposit_bps" IS NULL) OR
            ("deposit_kind" = 'percent' AND "deposit_amount_cents" IS NULL     AND "deposit_bps" IS NOT NULL AND "deposit_bps" BETWEEN 1 AND 10000),
            FALSE
        ));

-- Prisma does not emit NOT NULL for scalar lists.
ALTER TABLE "booking_slots_rules"
    ALTER COLUMN "days_of_week" SET NOT NULL,
    ALTER COLUMN "allowed_durations_minutes" SET NOT NULL;

ALTER TABLE "booking_rule_price_bands"
    ADD CONSTRAINT "booking_rule_price_bands_duration_check"
        CHECK ("duration_minutes" IN (60, 90, 120)),
    ADD CONSTRAINT "booking_rule_price_bands_price_check"
        CHECK ("price_cents" >= 0);

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_time_range_check"
        CHECK ("ends_at" > "starts_at"),
    ADD CONSTRAINT "bookings_amounts_check"
        CHECK ("price_cents" >= 0 AND "deposit_paid_cents" >= 0),
    ADD CONSTRAINT "bookings_hold_expires_check"
        CHECK ("status" <> 'held' OR "hold_expires_at" IS NOT NULL),
    ADD CONSTRAINT "bookings_guardian_permission_check"
        CHECK ("guardian_permission_at" IS NULL OR "guardian_user_id" IS NOT NULL),
    -- §12: a booking with minors is only recorded with a guardian permission on it.
    ADD CONSTRAINT "bookings_minors_permission_check"
        CHECK (NOT "includes_minors" OR "no_record"
               OR ("guardian_permission_at" IS NOT NULL AND "guardian_user_id" IS NOT NULL));

ALTER TABLE "booking_players"
    ADD CONSTRAINT "booking_players_position_check"
        CHECK ("position" BETWEEN 1 AND 4),
    ADD CONSTRAINT "booking_players_accepted_check"
        CHECK (NOT "accepted" OR "accepted_at" IS NOT NULL);
