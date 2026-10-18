-- CreateEnum
CREATE TYPE "camera_end" AS ENUM ('a', 'b');

-- CreateEnum
CREATE TYPE "camera_status" AS ENUM ('active', 'offline', 'disabled');

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "software_version" TEXT,
    "last_seen_at" TIMESTAMPTZ(3),
    "free_disk_bytes" BIGINT,
    "gpu_temperature_c" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cameras" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "court_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "end" "camera_end" NOT NULL,
    "rtsp_url_ciphertext" BYTEA NOT NULL,
    "rtsp_url_key_id" TEXT NOT NULL,
    "resolution_width" SMALLINT NOT NULL,
    "resolution_height" SMALLINT NOT NULL,
    "status" "camera_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibrations" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "camera_id" UUID NOT NULL,
    "points_px" DOUBLE PRECISION[],
    "homography" DOUBLE PRECISION[],
    "error_cm" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calibrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_serial_number_key" ON "devices"("serial_number");

-- CreateIndex
CREATE INDEX "devices_club_id_idx" ON "devices"("club_id");

-- CreateIndex
CREATE INDEX "cameras_device_id_idx" ON "cameras"("device_id");

-- CreateIndex
CREATE INDEX "cameras_club_id_idx" ON "cameras"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "cameras_court_id_end_key" ON "cameras"("court_id", "end");

-- CreateIndex
CREATE INDEX "calibrations_camera_id_created_at_idx" ON "calibrations"("camera_id", "created_at");

-- CreateIndex
CREATE INDEX "calibrations_club_id_idx" ON "calibrations"("club_id");

-- CreateIndex
CREATE UNIQUE INDEX "courts_current_calibration_id_key" ON "courts"("current_calibration_id");

-- AddForeignKey
ALTER TABLE "courts" ADD CONSTRAINT "courts_current_calibration_id_fkey" FOREIGN KEY ("current_calibration_id") REFERENCES "calibrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibrations" ADD CONSTRAINT "calibrations_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibrations" ADD CONSTRAINT "calibrations_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------- Rules Prisma cannot express

-- Prisma does not emit NOT NULL for scalar lists.
ALTER TABLE "calibrations"
    ALTER COLUMN "points_px" SET NOT NULL,
    ALTER COLUMN "homography" SET NOT NULL;

ALTER TABLE "devices"
    ADD CONSTRAINT "devices_serial_number_check"
        CHECK (length(btrim("serial_number")) > 0),
    ADD CONSTRAINT "devices_free_disk_check"
        CHECK ("free_disk_bytes" IS NULL OR "free_disk_bytes" >= 0),
    ADD CONSTRAINT "devices_gpu_temperature_check"
        CHECK ("gpu_temperature_c" IS NULL OR "gpu_temperature_c" BETWEEN -40 AND 150);

-- §12: the RTSP address is stored only as AES-256-GCM ciphertext
-- (12-byte nonce || ciphertext || 16-byte tag), so it is always longer than 28 bytes.
-- The API encrypts it; see the comment on model Camera in schema.prisma.
ALTER TABLE "cameras"
    ADD CONSTRAINT "cameras_rtsp_ciphertext_check"
        CHECK (octet_length("rtsp_url_ciphertext") > 28),
    -- Defence in depth: a plain-text address written by mistake starts with "rtsp".
    ADD CONSTRAINT "cameras_rtsp_not_plaintext_check"
        CHECK (lower(encode(substring("rtsp_url_ciphertext" FROM 1 FOR 4), 'escape')) <> 'rtsp'),
    ADD CONSTRAINT "cameras_rtsp_key_id_check"
        CHECK (length(btrim("rtsp_url_key_id")) > 0),
    ADD CONSTRAINT "cameras_resolution_check"
        CHECK ("resolution_width" > 0 AND "resolution_height" > 0);

-- §5: exactly 12 points (24 coordinates) and a 3x3 homography (9 values), no NULL elements.
ALTER TABLE "calibrations"
    ADD CONSTRAINT "calibrations_points_check"
        CHECK (array_ndims("points_px") = 1 AND cardinality("points_px") = 24
               AND array_position("points_px", NULL) IS NULL),
    ADD CONSTRAINT "calibrations_homography_check"
        CHECK (array_ndims("homography") = 1 AND cardinality("homography") = 9
               AND array_position("homography", NULL) IS NULL),
    ADD CONSTRAINT "calibrations_error_check"
        CHECK ("error_cm" >= 0);
