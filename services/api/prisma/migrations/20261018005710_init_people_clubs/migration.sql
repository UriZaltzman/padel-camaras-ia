-- CreateEnum
CREATE TYPE "player_category" AS ENUM ('cat_8', 'cat_7', 'cat_6', 'cat_5', 'cat_4', 'cat_3', 'cat_2', 'cat_1');

-- CreateEnum
CREATE TYPE "handedness" AS ENUM ('right', 'left');

-- CreateEnum
CREATE TYPE "playing_side" AS ENUM ('drive', 'reves', 'both');

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('whatsapp', 'google', 'apple', 'email');

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('owner', 'staff', 'coach', 'player');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('invited', 'active', 'revoked');

-- CreateEnum
CREATE TYPE "club_plan" AS ENUM ('loan', 'purchase');

-- CreateEnum
CREATE TYPE "court_status" AS ENUM ('active', 'maintenance', 'inactive');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "photo_url" TEXT,
    "declared_category" "player_category",
    "handedness" "handedness",
    "playing_side" "playing_side",
    "birth_date" DATE,
    "terms_accepted_at" TIMESTAMPTZ(3),
    "terms_version" TEXT,
    "privacy_accepted_at" TIMESTAMPTZ(3),
    "privacy_version" TEXT,
    "training_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "training_opt_out_at" TIMESTAMPTZ(3),
    "deletion_requested_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "auth_provider" NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "cuit" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "logo_url" TEXT,
    "sponsor_name" TEXT,
    "sponsor_logo_url" TEXT,
    "plan" "club_plan" NOT NULL,
    "player_extra_price_cents" INTEGER,
    "deposit_cents" INTEGER,
    "mercadopago_collector_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courts" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "covered" BOOLEAN NOT NULL DEFAULT false,
    "status" "court_status" NOT NULL DEFAULT 'active',
    "current_calibration_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "plan" "club_plan" NOT NULL,
    "fee_per_court_amount_cents" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "minimum_months" INTEGER NOT NULL,
    "commission_bps" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_external_id_key" ON "auth_identities"("provider", "external_id");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_club_id_user_id_role_key" ON "memberships"("club_id", "user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_cuit_key" ON "clubs"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "courts_club_id_name_key" ON "courts"("club_id", "name");

-- CreateIndex
CREATE INDEX "contracts_club_id_starts_on_idx" ON "contracts"("club_id", "starts_on");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courts" ADD CONSTRAINT "courts_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
