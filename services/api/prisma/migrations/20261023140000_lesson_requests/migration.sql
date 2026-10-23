-- Lesson requests (#266): a student asks a coach for a lesson; accepting books the court.
CREATE TABLE "lesson_requests" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "coach_user_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "court_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "lesson_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lesson_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lesson_requests_status_check" CHECK ("status" IN ('pending', 'accepted', 'rejected', 'cancelled')),
    CONSTRAINT "lesson_requests_duration_check" CHECK ("duration_minutes" IN (60, 90, 120))
);

CREATE UNIQUE INDEX "lesson_requests_lesson_id_key" ON "lesson_requests"("lesson_id");
CREATE INDEX "lesson_requests_club_id_status_idx" ON "lesson_requests"("club_id", "status");
CREATE INDEX "lesson_requests_coach_user_id_status_idx" ON "lesson_requests"("coach_user_id", "status");
CREATE INDEX "lesson_requests_student_user_id_idx" ON "lesson_requests"("student_user_id");

ALTER TABLE "lesson_requests" ADD CONSTRAINT "lesson_requests_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lesson_requests" ADD CONSTRAINT "lesson_requests_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_requests" ADD CONSTRAINT "lesson_requests_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_requests" ADD CONSTRAINT "lesson_requests_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lesson_requests" ADD CONSTRAINT "lesson_requests_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row level security. The service decides who may do what and runs writes as `system` of the
-- club; the policies keep every club out of the others' rows and every user out of strangers'.
ALTER TABLE "lesson_requests" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lesson_requests" TO app_runtime;

CREATE POLICY lesson_requests_select ON "lesson_requests" FOR SELECT TO app_runtime USING (
    app_club_ops(club_id) OR student_user_id = app_user_id() OR coach_user_id = app_user_id());
CREATE POLICY lesson_requests_write ON "lesson_requests" FOR ALL TO app_runtime
    USING (club_id = app_club_id() AND app_role() IN ('system', 'owner'))
    WITH CHECK (club_id = app_club_id() AND app_role() IN ('system', 'owner'));
