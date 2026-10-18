#!/usr/bin/env bash
# Smoke test of the club box: brings infra/club-box up against the camera simulator for a
# short shift and checks the recording is continuous and reached storage.
#
#   infra/club-box/smoke-test.sh            # from anywhere; needs docker compose >= 2.24.4
#   SMOKE_SHIFT_SECONDS=120 infra/club-box/smoke-test.sh
#
# Steps:
#   1. Start the simulator (infra/camsim, 1 court: court-1-a and court-1-b).
#   2. Write a throwaway .env and horario.json: one shift starting in 2.5 min, so the
#      2-minute pre-margin opens after the recorder is up.
#   3. Bring the club box up with docker-compose.smoke.yml (simulator + MinIO).
#   4. Wait until the shift and its 2-minute post-margin are over.
#   5. edge-recorder check --schedule: exit 0 only if every 10 s segment is there.
#   6. At least one segment object in the MinIO bucket (uploader works).
# Exit code 0 = pass. Logs of every container are printed on failure. ~6 minutes.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
shift_s="${SMOKE_SHIFT_SECONDS:-60}"
work="$(mktemp -d)"
project=club-box-smoke

compose() {
  docker compose -p "$project" --env-file "$work/.env" \
    -f "$here/docker-compose.yml" -f "$here/docker-compose.smoke.yml" "$@"
}
camsim() {
  CAMSIM_COURTS=1 CAMSIM_TEST_VIDEO_SIZE="${CAMSIM_TEST_VIDEO_SIZE:-1280x720}" \
    docker compose -f "$repo/infra/camsim/docker-compose.yml" "$@"
}
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "--- smoke test FAILED, container logs:" >&2
    compose logs --no-color --tail 200 >&2 || true
    camsim logs --no-color --tail 100 >&2 || true
  fi
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  [ "${SMOKE_KEEP_CAMSIM:-0}" = 1 ] || camsim down -v >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

iso() { python3 -c 'import sys,datetime as d; print((d.datetime.now(d.timezone.utc)+d.timedelta(seconds=int(sys.argv[1]))).isoformat(timespec="seconds"))' "$1"; }

echo "1/6 camera simulator"
camsim up -d --build --wait

echo "2/6 settings and schedule in $work"
mkdir -p "$work/state" "$work/recordings" "$work/config"
chmod 0777 "$work/state" "$work/recordings"   # the containers run as uid 10001
start="$(iso 150)"
end="$(iso $((150 + shift_s)))"
cat > "$work/config/horario.json" <<JSON
{"shifts": [{"id": "smoke", "cameras": ["court-1-a", "court-1-b"], "start": "$start", "end": "$end"}]}
JSON
cat > "$work/.env" <<ENV
EDGE_IMAGE=edge-agent:smoke
EDGE_CLUB_ID=00000000-0000-4000-8000-000000000001
EDGE_DEVICE_ID=00000000-0000-4000-8000-000000000002
EDGE_API_BASE_URL=https://api.example.invalid
EDGE_STATE_DIR=$work/state
EDGE_RECORDINGS_DIR=$work/recordings
EDGE_CONFIG_DIR=$work/config
CAMERA_NIC=unused
EDGE_RECORDER_CAMERAS={"court-1-a": "rtsp://mediamtx:8554/court-1-a", "court-1-b": "rtsp://mediamtx:8554/court-1-b"}
EDGE_UPLOADER_ENDPOINT_URL=http://minio:9000
EDGE_UPLOADER_BUCKET=smoke
EDGE_UPLOADER_ACCESS_KEY_ID=smoke-test-user
EDGE_UPLOADER_SECRET_ACCESS_KEY=smoke-test-password-not-secret
EDGE_UPLOADER_REGION=us-east-1
EDGE_UPLOADER_BANDWIDTH_LIMIT_BYTES_PER_S=50000000
ENV

echo "3/6 club box up (shift $start -> $end)"
compose build recorder
compose up -d

echo "4/6 waiting for the shift and its margins"
wait_s=$((150 + shift_s + 120 + 20))
for _ in $(seq 1 "$wait_s"); do
  for svc in recorder uploader; do
    if [ "$(compose ps -q --status running "$svc" | wc -l)" -eq 0 ]; then
      echo "$svc is not running" >&2
      exit 1
    fi
  done
  sleep 1
done

echo "5/6 continuity check"
compose exec -T recorder edge-recorder check --schedule /etc/edge-agent/horario.json

echo "6/6 segments in storage"
sleep 15   # let the uploader catch up with the last segments
count="$(docker run --rm --network "${project}_uplink" --entrypoint /bin/sh \
  -e MC_USER=smoke-test-user -e MC_PASS=smoke-test-password-not-secret \
  minio/mc:RELEASE.2024-10-08T09-37-26Z -c \
  'mc alias set s http://minio:9000 "$MC_USER" "$MC_PASS" >/dev/null && mc ls -r s/smoke | wc -l')"
echo "objects in bucket: $count"
[ "$count" -gt 0 ]

echo "smoke test PASSED"
