#!/usr/bin/env bash
# Backup for the docker-compose deployment: PostgreSQL dump + media volume. Usage: scripts/backup.sh [outdir]
set -euo pipefail
OUT="${1:-./backups}"; STAMP=$(date +%Y%m%d-%H%M%S); mkdir -p "$OUT"
docker compose exec -T db pg_dump -U acs acs | gzip > "$OUT/db-$STAMP.sql.gz"
docker compose run --rm --no-deps -v "$(cd "$OUT" && pwd)":/backup api tar czf "/backup/storage-$STAMP.tgz" -C /data storage
echo "Backup written to $OUT ($STAMP)"
