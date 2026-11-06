# AI Cartoon Studio | استوديو الكرتون بالذكاء الاصطناعي

Bilingual (Arabic RTL / English LTR) web platform for cartoon images, characters, stories, voices, animation, video editing and YouTube packaging.
**Free-first**: no paid API, everything runs on your own hardware (CPU for the editor/library/voice/export; GPU only for AI image/video generation).

## Status (honest summary)
| Area | State |
|---|---|
| Accounts, roles, sessions, quotas, activity log, backups, upload protection | ✅ implemented + tested |
| Projects (auto-save, history/restore, duplicate, zip export), asset library, character profiles & consistency locks | ✅ implemented + tested |
| Story scaffold, Voice Studio (eSpeak tested; Piper/edge-tts adapters), audio-reactive animation, image tools | ✅ / adapters as noted in `docs/AI_ENGINES.md` |
| Timeline editor + FFmpeg renderer (motion, fades, speed, overlays, music/SFX, burned AR/EN subtitles, 16:9/9:16/1:1) | ✅ implemented + tested |
| YouTube Studio (metadata, Arabic thumbnail, SRT, package) | ✅ implemented + tested. **Auto-upload not implemented** |
| SAM KIDZ workspace (reference import unchanged + locked, episodes, status, bible) | ✅ implemented + tested |
| AI image generation (ComfyUI/SDXL) | ⚠️ adapter tested against an API double only; needs your ComfyUI + GPU |
| AI video generation, Wav2Lip lip-sync, Ollama writing | ⚠️ adapter slots; need your install (reported *unavailable* until then) |
| Docker / PostgreSQL / S3 mirror | ⚠️ written, **not run** in the authoring environment |

Real phoneme lip-sync and character-identity locking beyond prompt + reference img2img need extra GPU models; see `docs/AI_ENGINES.md`.
Nothing is faked: when an engine is missing a job fails with the reason, and the UI shows it in red.

## Quick start
```bash
sudo apt install ffmpeg espeak-ng fonts-noto-core
cd backend && pip install -r requirements.txt && ACS_DATA_DIR=./data uvicorn app.main:app --port 8000 &
cd frontend && npm install && npm run build && npm start      # http://localhost:3000
```
First registered account becomes admin. Docker: `cp .env.example .env && docker compose up -d --build` (see `docs/DEPLOYMENT.md`).

## Layout
```
backend/   FastAPI app (app/routers, app/engines = swappable adapters, app/services = jobs/video/thumbnail/story), Alembic migrations, tests, ComfyUI workflows
frontend/  Next.js 14 + React + TypeScript + Tailwind; 17 pages; every string has Arabic and English side by side (tr(ar, en))
nginx/ docker-compose.yml .env.example scripts/(backup, restore) docs/
```
## Architecture notes
* **Engines are replaceable**: `app/engines/*` expose `describe()` + a function API; ComfyUI workflows are JSON files with placeholders, so models change without code changes.
* **Jobs**: DB-backed queue + worker threads (`ACS_WORKERS`); progress, cancel, retry; jobs interrupted by restart are marked failed, never silently "done". Estimates (time/VRAM/RAM, money = 0) are shown before heavy jobs.
* **Security**: bcrypt, JWT with server-side revocable sessions, per-user isolation, upload content validation, login rate limit, quotas.
* **Storage**: local disk per user; optional S3-compatible mirror (`ACS_S3_BUCKET`, needs `boto3`; experimental/untested).
* **Free-first**: Low Resource mode (`ACS_LOW_RESOURCE`), license and hardware requirements per engine in Settings.

## Documentation
`docs/`: INSTALL · USER_GUIDE_AR · USER_GUIDE_EN · ADMIN_GUIDE · API (also `/docs`) · AI_ENGINES · YOUTUBE · BACKUP · DEPLOYMENT · TESTING.
