-- Lessons (#153): kind and focus, invited students, coach notes and student consent.
ALTER TABLE "lessons" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'private';
ALTER TABLE "lessons" ADD COLUMN "focus" TEXT;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_kind_check" CHECK ("kind" IN ('private', 'group', 'school'));

CREATE TABLE "lesson_students" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_students_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lesson_notes" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "student_user_id" UUID,
    "text" TEXT NOT NULL,
    "at_ms" INTEGER,
    "drawing" JSONB,
    "is_plan" BOOLEAN NOT NULL DEFAULT false,
    "visible_to_students" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lesson_notes_at_ms_check" CHECK ("at_ms" IS NULL OR "at_ms" >= 0),
    CONSTRAINT "lesson_notes_drawing_check" CHECK ("drawing" IS NULL OR "at_ms" IS NOT NULL)
);

CREATE TABLE "coach_access_grants" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "coach_user_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "coach_access_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lesson_students_lesson_id_user_id_key" ON "lesson_students"("lesson_id", "user_id");
CREATE INDEX "lesson_students_user_id_idx" ON "lesson_students"("user_id");
CREATE INDEX "lesson_students_club_id_idx" ON "lesson_students"("club_id");
CREATE INDEX "lesson_notes_lesson_id_idx" ON "lesson_notes"("lesson_id");
CREATE INDEX "lesson_notes_club_id_idx" ON "lesson_notes"("club_id");
CREATE UNIQUE INDEX "coach_access_grants_club_id_coach_user_id_student_user_id_key"
    ON "coach_access_grants"("club_id", "coach_user_id", "student_user_id");
CREATE INDEX "coach_access_grants_student_user_id_idx" ON "coach_access_grants"("student_user_id");

ALTER TABLE "lesson_students" ADD CONSTRAINT "lesson_students_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lesson_students" ADD CONSTRAINT "lesson_students_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_students" ADD CONSTRAINT "lesson_students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_access_grants" ADD CONSTRAINT "coach_access_grants_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coach_access_grants" ADD CONSTRAINT "coach_access_grants_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_access_grants" ADD CONSTRAINT "coach_access_grants_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security. The service decides who may do what and runs writes as `system` of the
-- club; the policies keep every club out of the others' rows and every user out of strangers'.
ALTER TABLE "lesson_students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coach_access_grants" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lesson_students", "lesson_notes", "coach_access_grants" TO app_runtime;

CREATE POLICY lesson_students_select ON "lesson_students" FOR SELECT TO app_runtime USING (
    app_club_ops(club_id) OR user_id = app_user_id()
    OR (app_role() = 'coach' AND EXISTS (
        SELECT 1 FROM lessons l WHERE l.id = lesson_id AND l.coach_user_id = app_user_id())));
CREATE POLICY lesson_students_write ON "lesson_students" FOR ALL TO app_runtime
    USING (club_id = app_club_id() AND app_role() IN ('system', 'owner'))
    WITH CHECK (club_id = app_club_id() AND app_role() IN ('system', 'owner'));
-- A student accepts their own invitation.
CREATE POLICY lesson_students_accept ON "lesson_students" FOR UPDATE TO app_runtime
    USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

CREATE POLICY lesson_notes_select ON "lesson_notes" FOR SELECT TO app_runtime USING (
    app_club_ops(club_id)
    OR (app_role() = 'coach' AND EXISTS (
        SELECT 1 FROM lessons l WHERE l.id = lesson_id AND l.coach_user_id = app_user_id()))
    OR (visible_to_students AND (student_user_id IS NULL OR student_user_id = app_user_id())
        AND EXISTS (SELECT 1 FROM lesson_students s
                     WHERE s.lesson_id = lesson_notes.lesson_id AND s.user_id = app_user_id())));
CREATE POLICY lesson_notes_write ON "lesson_notes" FOR ALL TO app_runtime
    USING (club_id = app_club_id() AND app_role() IN ('system', 'owner'))
    WITH CHECK (club_id = app_club_id() AND app_role() IN ('system', 'owner'));

CREATE POLICY coach_access_grants_select ON "coach_access_grants" FOR SELECT TO app_runtime USING (
    student_user_id = app_user_id() OR coach_user_id = app_user_id()
    OR (club_id = app_club_id() AND app_role() = 'system'));
-- Only the student gives or takes back access to their own matches.
CREATE POLICY coach_access_grants_write ON "coach_access_grants" FOR ALL TO app_runtime
    USING (student_user_id = app_user_id()) WITH CHECK (student_user_id = app_user_id());
