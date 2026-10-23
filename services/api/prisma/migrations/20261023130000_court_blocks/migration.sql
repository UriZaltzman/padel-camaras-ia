-- Court blocks (§3.1, CL-04, #256).
-- A block is a booking row, so bookings_no_overlap_excl (#39) applies to it unchanged.
ALTER TYPE "booking_origin" ADD VALUE 'block';

CREATE TYPE "court_block_kind" AS ENUM ('maintenance', 'holiday', 'closure');

CREATE TABLE "court_blocks" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "kind" "court_block_kind" NOT NULL,
    "reason" TEXT,
    "series_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "court_blocks_booking_id_key" ON "court_blocks"("booking_id");
CREATE INDEX "court_blocks_club_id_idx" ON "court_blocks"("club_id");
CREATE INDEX "court_blocks_series_id_idx" ON "court_blocks"("series_id");

ALTER TABLE "court_blocks" ADD CONSTRAINT "court_blocks_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "court_blocks" ADD CONSTRAINT "court_blocks_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security: the club's staff reads and writes its blocks; the system role too.
ALTER TABLE "court_blocks" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "court_blocks" TO app_runtime;
CREATE POLICY court_blocks_ops ON "court_blocks" FOR ALL TO app_runtime
    USING (app_club_ops(club_id) AND app_role() <> 'club_device')
    WITH CHECK (app_club_ops(club_id) AND app_role() <> 'club_device');
