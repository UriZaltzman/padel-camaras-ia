-- CreateEnum
CREATE TYPE "media_asset_type" AS ENUM ('full', 'clip', 'reel', 'thumbnail');

-- CreateEnum
CREATE TYPE "clip_origin" AS ENUM ('button', 'app', 'auto');

-- CreateEnum
CREATE TYPE "payment_concept" AS ENUM ('player_extra', 'lesson', 'deposit', 'subscription');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'approved', 'rejected', 'refunded');

-- CreateEnum
CREATE TYPE "settlement_status" AS ENUM ('draft', 'approved', 'invoiced', 'paid');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "type" "media_asset_type" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "size_bytes" BIGINT,
    "expires_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clips" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "media_asset_id" UUID,
    "user_id" UUID,
    "start_ms" INTEGER NOT NULL,
    "end_ms" INTEGER NOT NULL,
    "origin" "clip_origin" NOT NULL,
    "highlight_score" DECIMAL(4,3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "user_id" UUID,
    "concept" "payment_concept" NOT NULL,
    "booking_id" UUID,
    "match_id" UUID,
    "settlement_id" UUID,
    "amount_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL DEFAULT 0,
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "mercadopago_payment_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "collected_cents" INTEGER NOT NULL DEFAULT 0,
    "fee_cents" INTEGER NOT NULL DEFAULT 0,
    "payout_cents" INTEGER NOT NULL DEFAULT 0,
    "status" "settlement_status" NOT NULL DEFAULT 'draft',
    "invoice_number" TEXT,
    "invoice_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_path_key" ON "media_assets"("storage_path");

-- CreateIndex
CREATE INDEX "media_assets_match_id_type_idx" ON "media_assets"("match_id", "type");

-- CreateIndex
CREATE INDEX "media_assets_expires_at_idx" ON "media_assets"("expires_at");

-- CreateIndex
CREATE INDEX "media_assets_club_id_idx" ON "media_assets"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "clips_media_asset_id_key" ON "clips"("media_asset_id");

-- CreateIndex
CREATE INDEX "clips_match_id_start_ms_idx" ON "clips"("match_id", "start_ms");

-- CreateIndex
CREATE INDEX "clips_user_id_idx" ON "clips"("user_id");

-- CreateIndex
CREATE INDEX "clips_club_id_idx" ON "clips"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_mercadopago_payment_id_key" ON "payments"("mercadopago_payment_id");

-- CreateIndex
CREATE INDEX "payments_club_id_created_at_idx" ON "payments"("club_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_settlement_id_idx" ON "payments"("settlement_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "settlements_status_idx" ON "settlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_club_id_period_start_key" ON "settlements"("club_id", "period_start");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------- Rules Prisma cannot express

ALTER TABLE "media_assets"
    ADD CONSTRAINT "media_assets_storage_path_check" CHECK (length(btrim("storage_path")) > 0),
    ADD CONSTRAINT "media_assets_duration_check" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
    ADD CONSTRAINT "media_assets_size_check" CHECK ("size_bytes" IS NULL OR "size_bytes" >= 0);

ALTER TABLE "clips"
    ADD CONSTRAINT "clips_time_range_check" CHECK ("start_ms" >= 0 AND "end_ms" > "start_ms"),
    ADD CONSTRAINT "clips_highlight_score_check"
        CHECK ("highlight_score" IS NULL OR "highlight_score" BETWEEN 0 AND 1);

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_amount_check" CHECK ("amount_cents" > 0),
    ADD CONSTRAINT "payments_fee_check" CHECK ("fee_cents" >= 0 AND "fee_cents" <= "amount_cents");

ALTER TABLE "settlements"
    ADD CONSTRAINT "settlements_period_check" CHECK ("period_end" >= "period_start"),
    ADD CONSTRAINT "settlements_amounts_check"
        CHECK ("collected_cents" >= 0 AND "fee_cents" >= 0 AND "fee_cents" <= "collected_cents"
               AND "payout_cents" = "collected_cents" - "fee_cents");
