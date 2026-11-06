# Admin guide
* First registered user = admin. Admin menu: overview, users (role, disable, per-user daily job quota), global quota, registration open/closed, activity log, backups.
* Disabling a user revokes their sessions immediately. Admins cannot disable/demote themselves.
* Quotas count jobs created in the last 24h (admins are exempt). Default 200/day.
* Password resets: see DEPLOYMENT.md step 6. Files are private per user; admins can read any project through the API.
* Upload protection: extension allow-list + content validation (Pillow/ffprobe), size cap `ACS_MAX_UPLOAD_MB` (50), random storage names, `nosniff`, never rendered as HTML.
* Login brute-force limit: 8 attempts / 5 min per email+IP (in-memory, per API process).
* Logs: `docker compose logs -f api`. Jobs interrupted by a restart are marked failed and can be retried from the UI/API.
