"""Central configuration. Everything is overridable through environment variables.
No paid API key is required or shipped by default (Free-First)."""
import os
import secrets
from pathlib import Path


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


class Settings:
    def __init__(self) -> None:
        self.reload()

    def reload(self) -> None:
        self.data_dir = Path(_env("ACS_DATA_DIR", "./data")).resolve()
        self.storage_dir = self.data_dir / "storage"
        self.backup_dir = self.data_dir / "backups"
        self.database_url = _env("ACS_DATABASE_URL", f"sqlite:///{self.data_dir}/acs.db")
        secret_file = self.data_dir / ".secret"
        self.secret_key = _env("ACS_SECRET_KEY")
        if not self.secret_key:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            if secret_file.exists():
                self.secret_key = secret_file.read_text().strip()
            else:
                self.secret_key = secrets.token_urlsafe(48)
                secret_file.write_text(self.secret_key)
                secret_file.chmod(0o600)
        self.token_ttl_hours = int(_env("ACS_TOKEN_TTL_HOURS", "24"))
        self.allow_registration = _env("ACS_ALLOW_REGISTRATION", "true").lower() == "true"
        self.max_upload_mb = int(_env("ACS_MAX_UPLOAD_MB", "50"))
        self.worker_threads = int(_env("ACS_WORKERS", "2"))
        self.cors_origins = [o for o in _env("ACS_CORS_ORIGINS", "http://localhost:3000").split(",") if o]
        # AI engines (all optional, all replaceable)
        self.comfy_url = _env("ACS_COMFYUI_URL", "http://127.0.0.1:8188")
        self.comfy_checkpoint = _env("ACS_COMFYUI_CHECKPOINT", "sd_xl_base_1.0.safetensors")
        self.workflows_dir = Path(_env("ACS_WORKFLOWS_DIR", str(Path(__file__).resolve().parent.parent / "workflows")))
        self.ollama_url = _env("ACS_OLLAMA_URL", "http://127.0.0.1:11434")
        self.ollama_model = _env("ACS_OLLAMA_MODEL", "qwen2.5:7b-instruct")
        self.piper_bin = _env("ACS_PIPER_BIN", "piper")
        self.piper_models_dir = Path(_env("ACS_PIPER_MODELS", str(self.data_dir / "piper-models")))
        self.ffmpeg = _env("ACS_FFMPEG", "ffmpeg")
        self.ffprobe = _env("ACS_FFPROBE", "ffprobe")
        self.low_resource = _env("ACS_LOW_RESOURCE", "false").lower() == "true"
        # optional S3-compatible mirror (experimental)
        self.s3_bucket = _env("ACS_S3_BUCKET")
        self.s3_endpoint = _env("ACS_S3_ENDPOINT")
        # YouTube API (optional; upload only works once the user configures OAuth)
        self.youtube_client_id = _env("ACS_YOUTUBE_CLIENT_ID")
        # dev convenience: return password-reset token in API response when no SMTP is configured
        self.dev_return_reset_token = _env("ACS_DEV_RETURN_RESET_TOKEN", "true").lower() == "true"
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
