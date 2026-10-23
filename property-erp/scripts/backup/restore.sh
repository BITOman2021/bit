#!/usr/bin/env bash
# استعادة نسخة احتياطية مشفرة إلى قاعدة بيانات (يفضل قاعدة جديدة فارغة)
# الاستخدام: BACKUP_PASSPHRASE=... TARGET_DATABASE_URL=... TARGET_STORAGE_DIR=... scripts/backup/restore.sh backups/gsw-backup-XXXX.tar.enc
set -euo pipefail
FILE="${1:?backup file required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL required}"
TARGET_STORAGE_DIR="${TARGET_STORAGE_DIR:-./storage-restored}"
[ -f "$FILE.sha256" ] && sha256sum -c "$FILE.sha256"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$FILE" -out "$TMP/bundle.tar" -pass env:BACKUP_PASSPHRASE
tar -C "$TMP" -xf "$TMP/bundle.tar"
( cd "$TMP" && sha256sum -c SHA256SUMS )
DB_URL="${TARGET_DATABASE_URL%%\?*}"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$DB_URL" "$TMP/db.dump"
mkdir -p "$TARGET_STORAGE_DIR"
tar -C "$TMP" -xzf "$TMP/storage.tgz"
cp -a "$TMP"/"$(tar -tzf "$TMP/storage.tgz" | head -1 | cut -d/ -f1)"/. "$TARGET_STORAGE_DIR"/
echo "✓ Restored database and files into $TARGET_STORAGE_DIR"
