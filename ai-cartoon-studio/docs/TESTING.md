# Testing report
Run: `cd backend && python -m pytest -q tests`

Result at the time of writing:
```
...................                                                      [100%]
19 passed in 14.45s
```
Covered (real code paths, no mocks of our own logic): registration/login/logout/session revocation, login rate limit, single-use password reset, project CRUD/duplicate/revisions/restore/zip export, per-user isolation (404 for other users),
upload validation (fake image, .exe, .html, fake wav rejected; files private; nosniff), character consistency rules and locks, job queue incl. honest failure when ComfyUI is down and retry, quota enforcement, admin permissions + backup,
the ComfyUI adapter against a protocol double (prompt injection of character profile, aspect ratio, img2img upload, character sheet storage), eSpeak Arabic TTS, full timeline render (motion, fade, dialogue-length stretching, music mix,
burned bilingual subtitles, 9:16 output; pixel check that scene 2 appears after scene 1), SRT, YouTube metadata/thumbnail/package, audio-reactive animation, image tools, story scaffold, SAM KIDZ import (byte-identical) and episodes.

Manual end-to-end (Playwright, production build): register → dashboard (RTL) → create project → generate voice (audio plays) → image job fails with "ComfyUI not reachable" → language toggle flips to LTR; no console errors; mobile layout 390px checked.

**Not tested here** (needs hardware/services): real ComfyUI/SDXL generation, video models, Piper voices, Ollama, edge-tts, S3 mirror, PostgreSQL runtime, Docker builds, large-scale load.
