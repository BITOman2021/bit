#!/usr/bin/env bash
# اختبار الاستعادة: يستعيد النسخة في قاعدة مؤقتة ويقارن فحوص السلامة مع المصدر ثم يحذفها.
# وجود ملف نسخة احتياطية ليس دليلًا كافيًا؛ هذا الاختبار هو الدليل.
# الاستخدام: BACKUP_PASSPHRASE=... DATABASE_URL=... ADMIN_DATABASE_URL=postgresql://user:pw@host:5432/postgres scripts/backup/verify-restore.sh <file>
set -euo pipefail
FILE="${1:?backup file required}"
: "${DATABASE_URL:?source DATABASE_URL required}"
: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL (with CREATEDB) required}"
SRC="${DATABASE_URL%%\?*}"
TMPDB="gsw_restore_check_$(date +%s)"
BASE="${ADMIN_DATABASE_URL%/*}"
psql "$ADMIN_DATABASE_URL" -qc "CREATE DATABASE $TMPDB"
cleanup() { psql "$ADMIN_DATABASE_URL" -qc "DROP DATABASE IF EXISTS $TMPDB" || true; rm -rf "$STORE"; }
STORE="$(mktemp -d)"; trap cleanup EXIT
TARGET_DATABASE_URL="$BASE/$TMPDB" TARGET_STORAGE_DIR="$STORE" "$(dirname "$0")/restore.sh" "$FILE" >/dev/null

CHECK="SELECT json_build_object(
  'properties',(SELECT count(*) FROM properties),
  'leases',(SELECT count(*) FROM leases),
  'charges',(SELECT count(*) FROM lease_charges),
  'payments',(SELECT count(*) FROM payments),
  'journal_entries',(SELECT count(*) FROM journal_entries),
  'audit_logs',(SELECT count(*) FROM audit_logs),
  'documents',(SELECT count(*) FROM documents),
  'total_debit',(SELECT COALESCE(sum(debit),0) FROM journal_lines l JOIN journal_entries e ON e.id=l.\"entryId\" WHERE e.status='POSTED'),
  'total_credit',(SELECT COALESCE(sum(credit),0) FROM journal_lines l JOIN journal_entries e ON e.id=l.\"entryId\" WHERE e.status='POSTED'),
  'unbalanced_entries',(SELECT count(*) FROM (SELECT e.id FROM journal_entries e JOIN journal_lines l ON l.\"entryId\"=e.id WHERE e.status='POSTED' GROUP BY e.id HAVING sum(l.debit)<>sum(l.credit)) x),
  'migrations',(SELECT count(*) FROM _prisma_migrations)
)::text"
A="$(psql "$SRC" -tAc "$CHECK")"
B="$(psql "$BASE/$TMPDB" -tAc "$CHECK")"
echo "source:   $A"
echo "restored: $B"
FILES_SRC=$(psql "$SRC" -tAc "select count(*) from documents")
FILES_RESTORED=$(find "$STORE" -type f ! -name .gitkeep | wc -l)
echo "files in restored storage: $FILES_RESTORED (documents rows: $FILES_SRC)"
if [ "$A" != "$B" ]; then echo "✗ RESTORE CHECK FAILED: data mismatch"; exit 1; fi
if echo "$B" | grep -q '"unbalanced_entries" : [1-9]'; then echo "✗ unbalanced entries after restore"; exit 1; fi
if [ "$FILES_RESTORED" -lt "$FILES_SRC" ]; then echo "✗ missing files"; exit 1; fi
echo "✓ Restore verified: counts, ledger totals and files match"
