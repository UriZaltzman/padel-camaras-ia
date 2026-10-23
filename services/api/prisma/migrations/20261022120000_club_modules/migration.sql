-- Club feature flags (SA-05).
CREATE TABLE "club_modules" (
    "club_id" UUID NOT NULL,
    "deposit_enabled" BOOLEAN NOT NULL DEFAULT false,
    "deposit_kind" TEXT NOT NULL DEFAULT 'percent',
    "deposit_percent" INTEGER,
    "deposit_amount_cents" INTEGER,
    "branding_mode" TEXT NOT NULL DEFAULT 'generic',
    "branding_logo_url" TEXT,
    "primary_color" TEXT,
    "secondary_color" TEXT,
    "lesson_mode" TEXT NOT NULL DEFAULT 'app',
    "ai_video" TEXT NOT NULL DEFAULT 'off',
    "tournaments" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "club_modules_pkey" PRIMARY KEY ("club_id"),
    CONSTRAINT "club_modules_deposit_kind_check" CHECK ("deposit_kind" IN ('percent', 'fixed')),
    CONSTRAINT "club_modules_deposit_percent_check" CHECK ("deposit_percent" IS NULL OR "deposit_percent" BETWEEN 1 AND 100),
    CONSTRAINT "club_modules_deposit_amount_check" CHECK ("deposit_amount_cents" IS NULL OR "deposit_amount_cents" >= 1),
    CONSTRAINT "club_modules_branding_mode_check" CHECK ("branding_mode" IN ('own', 'generic')),
    CONSTRAINT "club_modules_primary_color_check" CHECK ("primary_color" IS NULL OR "primary_color" ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT "club_modules_secondary_color_check" CHECK ("secondary_color" IS NULL OR "secondary_color" ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT "club_modules_lesson_mode_check" CHECK ("lesson_mode" IN ('app', 'whatsapp')),
    CONSTRAINT "club_modules_ai_video_check" CHECK ("ai_video" IN ('off', 'club_pays', 'player_pays'))
);

ALTER TABLE "club_modules" ADD CONSTRAINT "club_modules_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security: readable like the club itself (the app reads the flags to hide what is
-- off); written only by internal staff (the /admin console), never by the club.
ALTER TABLE "club_modules" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "club_modules" TO app_runtime;

CREATE POLICY club_modules_select ON "club_modules" FOR SELECT TO app_runtime USING (
    app_role() = 'player' OR app_is_support()
    OR (club_id = app_club_id() AND app_role() IN ('coach', 'staff', 'owner', 'club_device', 'system')));
CREATE POLICY club_modules_write ON "club_modules" FOR ALL TO app_runtime
    USING (app_is_support()) WITH CHECK (app_is_support());
