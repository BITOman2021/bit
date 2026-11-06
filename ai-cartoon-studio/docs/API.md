# API reference

Interactive OpenAPI docs are served by the backend at `/docs` (Swagger UI) and `/openapi.json`.
All endpoints except `/api/health` and `/api/auth/{register,login,forgot-password,reset-password}` need `Authorization: Bearer <token>`
(media URLs may use `?token=` because `<img>`/`<video>` cannot send headers). Errors are `{"detail": "<code>"}`.

Job pattern: `POST /api/jobs {kind, params, project_id}` → poll `GET /api/jobs/{id}` (`status`: queued/running/done/failed/cancelled; `assets` on done; `error` on failed).
Job kinds: `image.generate`, `tts.synthesize`, `story.generate`, `video.animate`, `video.lipsync`, `video.render`, `video.generate`.

| Method | Path | Summary |
|---|---|---|
| GET | `/api/admin/activity` | Activity |
| POST | `/api/admin/backup` | Backup |
| GET | `/api/admin/backups` | Backups |
| GET | `/api/admin/overview` | Overview |
| PUT | `/api/admin/settings` | Put Settings |
| GET | `/api/admin/users` | Users |
| PATCH | `/api/admin/users/{uid}` | Patch User |
| GET | `/api/assets` | List Assets |
| POST | `/api/assets` | Upload |
| PATCH | `/api/assets/{aid}` | Rename |
| DELETE | `/api/assets/{aid}` | Delete |
| GET | `/api/assets/{aid}/file` | File |
| POST | `/api/auth/change-password` | Change Password |
| POST | `/api/auth/forgot-password` | Forgot |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Me |
| PATCH | `/api/auth/me` | Update Me |
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/reset-password` | Reset |
| GET | `/api/auth/sessions` | Sessions |
| DELETE | `/api/auth/sessions/{sid}` | Revoke |
| GET | `/api/characters` | List Chars |
| POST | `/api/characters` | Create |
| GET | `/api/characters/{cid}` | Get |
| PATCH | `/api/characters/{cid}` | Patch |
| DELETE | `/api/characters/{cid}` | Delete |
| POST | `/api/characters/{cid}/reference` | Set Reference |
| POST | `/api/characters/{cid}/sheet` | Make Sheet |
| GET | `/api/dashboard` | Dashboard |
| GET | `/api/engines` | Engines |
| POST | `/api/estimate` | Estimate |
| GET | `/api/health` | Health |
| POST | `/api/image-tools` | Image Tools |
| POST | `/api/jobs` | Create Job |
| GET | `/api/jobs` | List Jobs |
| GET | `/api/jobs/{jid}` | Get Job |
| POST | `/api/jobs/{jid}/cancel` | Cancel |
| POST | `/api/jobs/{jid}/retry` | Retry |
| GET | `/api/presets` | Presets |
| GET | `/api/projects` | List Projects |
| POST | `/api/projects` | Create |
| GET | `/api/projects/{pid}` | Get |
| PATCH | `/api/projects/{pid}` | Patch |
| DELETE | `/api/projects/{pid}` | Delete |
| GET | `/api/projects/{pid}/assets` | Project Assets |
| POST | `/api/projects/{pid}/duplicate` | Duplicate |
| GET | `/api/projects/{pid}/export` | Export Zip |
| GET | `/api/projects/{pid}/revisions` | Revisions |
| POST | `/api/projects/{pid}/revisions/{rid}/restore` | Restore |
| GET | `/api/projects/{pid}/srt` | Srt |
| GET | `/api/samkidz` | Overview |
| PUT | `/api/samkidz/bible` | Bible |
| POST | `/api/samkidz/characters/import` | Import Character |
| POST | `/api/samkidz/episodes` | New Episode |
| PATCH | `/api/samkidz/episodes/{pid}/status` | Episode Status |
| GET | `/api/voices` | Voices |
| POST | `/api/voices/preview` | Preview |
| POST | `/api/youtube/metadata` | Yt Metadata |
| POST | `/api/youtube/package/{pid}` | Package |
| GET | `/api/youtube/status` | Yt Status |
| POST | `/api/youtube/thumbnail` | Make Thumb |