#!/usr/bin/env bash
# نسخة احتياطية مشفرة لقاعدة البيانات والمرفقات — GSW Property ERP
# الاستخدام: BACKUP_PASSPHRASE=... DATABASE_URL=... STORAGE_DIR=... BACKUP_DIR=... scripts/backup/backup.sh
# التشفير: AES-256 (openssl enc -pbkdf2). احفظ عبارة المرور منفصلة عن النسخ.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
DB_URL="${DATABASE_URL%%\?*}"   # pg_dump لا يقبل ?schema=
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

pg_dump --format=custom --no-owner --no-privileges "$DB_URL" > "$TMP/db.dump"
tar -C "$(dirname "$STORAGE_DIR")" -czf "$TMP/storage.tgz" "$(basename "$STORAGE_DIR")"
( cd "$TMP" && sha256sum db.dump storage.tgz > SHA256SUMS && tar -cf bundle.tar db.dump storage.tgz SHA256SUMS )
OUT="$BACKUP_DIR/gsw-backup-$STAMP.tar.enc"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -in "$TMP/bundle.tar" -out "$OUT" -pass env:BACKUP_PASSPHRASE
sha256sum "$OUT" > "$OUT.sha256"
echo "✓ Backup written: $OUT ($(du -h "$OUT" | cut -f1))"
# سياسة الاحتفاظ
find "$BACKUP_DIR" -name 'gsw-backup-*.tar.enc*' -mtime +"$RETENTION_DAYS" -print -delete || true
