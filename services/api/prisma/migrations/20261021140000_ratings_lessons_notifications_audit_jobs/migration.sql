-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('push', 'whatsapp', 'email', 'in_app');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "processing_job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "processing_runner" AS ENUM ('club', 'cloud');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "lesson_id" UUID;

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" DECIMAL(7,2) NOT NULL,
    "deviation" DECIMAL(7,2) NOT NULL,
    "volatility" DECIMAL(6,5) NOT NULL,
    "matches_rated" INTEGER NOT NULL DEFAULT 0,
    "category" "player_category",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "coach_user_id" UUID,
    "price_cents" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "club_id" UUID,
    "user_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "club_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "status" "processing_job_status" NOT NULL DEFAULT 'queued',
    "stage" TEXT,
    "runner" "processing_runner" NOT NULL DEFAULT 'club',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "model_version" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "duration_ms" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ratings_user_id_key" ON "ratings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_match_id_key" ON "lessons"("match_id");

-- CreateIndex
CREATE INDEX "lessons_coach_user_id_idx" ON "lessons"("coach_user_id");

-- CreateIndex
CREATE INDEX "lessons_club_id_idx" ON "lessons"("club_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_club_id_idx" ON "notifications"("club_id");

-- CreateIndex
CREATE INDEX "audit_log_club_id_created_at_idx" ON "audit_log"("club_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");

-- CreateIndex
CREATE INDEX "processing_jobs_match_id_created_at_idx" ON "processing_jobs"("match_id", "created_at");

-- CreateIndex
CREATE INDEX "processing_jobs_status_created_at_idx" ON "processing_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "processing_jobs_club_id_idx" ON "processing_jobs"("club_id");

-- CreateIndex
CREATE INDEX "payments_lesson_id_idx" ON "payments"("lesson_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ---------------------------------------------------------------- Rules Prisma cannot express

ALTER TABLE "ratings"
    ADD CONSTRAINT "ratings_rating_check" CHECK ("rating" > 0),
    ADD CONSTRAINT "ratings_deviation_check" CHECK ("deviation" > 0),
    ADD CONSTRAINT "ratings_volatility_check" CHECK ("volatility" > 0),
    ADD CONSTRAINT "ratings_matches_rated_check" CHECK ("matches_rated" >= 0);

ALTER TABLE "lessons"
    ADD CONSTRAINT "lessons_price_check" CHECK ("price_cents" IS NULL OR "price_cents" >= 0);

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_type_check" CHECK (length(btrim("type")) > 0),
    ADD CONSTRAINT "notifications_payload_check" CHECK (jsonb_typeof("payload") = 'object');

ALTER TABLE "audit_log"
    ADD CONSTRAINT "audit_log_action_check" CHECK (length(btrim("action")) > 0),
    ADD CONSTRAINT "audit_log_entity_type_check" CHECK (length(btrim("entity_type")) > 0);

-- Append-only: nobody edits or deletes the record of who changed what.
CREATE FUNCTION "audit_log_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER "audit_log_no_update_delete"
    BEFORE UPDATE OR DELETE ON "audit_log"
    FOR EACH ROW EXECUTE FUNCTION "audit_log_immutable"();

ALTER TABLE "processing_jobs"
    ADD CONSTRAINT "processing_jobs_attempts_check" CHECK ("attempts" >= 0),
    ADD CONSTRAINT "processing_jobs_duration_check" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
    ADD CONSTRAINT "processing_jobs_finished_check"
        CHECK ("finished_at" IS NULL OR ("started_at" IS NOT NULL AND "finished_at" >= "started_at"));
