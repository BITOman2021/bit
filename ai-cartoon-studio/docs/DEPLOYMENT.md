# Production deployment (Linux + Docker)
> The Docker files in this repo were written but **not built in the authoring environment (no Docker daemon)**. Expect to fix small issues on first build.

1. Install Docker + Compose plugin. `git clone`, `cd ai-cartoon-studio`.
2. `cp .env.example .env`, set `POSTGRES_PASSWORD`, `ACS_SECRET_KEY`, `ACS_PUBLIC_URL`.
3. `docker compose up -d --build`; open `http://SERVER`. Register the first account (it becomes **admin**), then optionally set `ACS_ALLOW_REGISTRATION=false` or close registration in Admin.
4. HTTPS: put Caddy/Traefik/Certbot in front of nginx (port 80) or add TLS to `nginx/nginx.conf`.
5. GPU server: run ComfyUI on a GPU machine and set `ACS_COMFYUI_URL` (protect it with a firewall/VPN: ComfyUI has no authentication). Same for Ollama.
6. Password reset has no SMTP: with `ACS_DEV_RETURN_RESET_TOKEN=false` the token is written to the API log for the admin to hand over.
7. Updates: `git pull && docker compose up -d --build` (Alembic migrations run on start).
8. Hardening checklist: strong secrets, HTTPS, firewall everything except 80/443, backups scheduled, `docker compose logs api` monitored.
