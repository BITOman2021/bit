# Backups
* **Admin → Backup now** (SQLite deployments): consistent DB snapshot + all media into `data/backups/backup-*.zip`.
* **Docker/PostgreSQL**: `scripts/backup.sh ./backups` (pg_dump + media tarball); restore with `scripts/restore.sh <db.sql.gz> <storage.tgz>`.
* Schedule with cron, e.g. `0 3 * * * cd /opt/acs && scripts/backup.sh /srv/backups`, and copy off-server. Test a restore before you need it.
