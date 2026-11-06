#!/usr/bin/env bash
# Usage: scripts/restore.sh backups/db-STAMP.sql.gz backups/storage-STAMP.tgz   (STOPS the api first; overwrites data)
set -euo pipefail
docker compose stop api web
gunzip -c "$1" | docker compose exec -T db psql -U acs -d acs
docker compose run --rm --no-deps -v "$(cd "$(dirname "$2")" && pwd)":/backup api sh -c "rm -rf /data/storage && tar xzf /backup/$(basename "$2") -C /data"
docker compose up -d
