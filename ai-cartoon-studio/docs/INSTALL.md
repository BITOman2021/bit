# Installation (development, no Docker)
Requirements: Python 3.11+, Node 20+, `ffmpeg`+`ffprobe`, fonts with Arabic glyphs (Noto Sans Arabic), optional `espeak-ng`.
```bash
# Debian/Ubuntu
sudo apt install ffmpeg espeak-ng fonts-noto-core fontconfig
cd backend && pip install -r requirements.txt && python -m pytest -q      # 19 tests
ACS_DATA_DIR=./data uvicorn app.main:app --port 8000
cd ../frontend && npm install && npm run build && npm start             # http://localhost:3000 (proxies /api to :8000; set ACS_API_URL at build time otherwise)
```
Use `npm run dev` for development. SQLite is the default (`data/acs.db`); set `ACS_DATABASE_URL=postgresql+psycopg://user:pw@host/db` for PostgreSQL.
Configuration variables are listed in `backend/app/config.py` and `.env.example`. Health: `GET /api/health`.
