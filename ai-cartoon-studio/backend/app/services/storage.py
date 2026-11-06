"""Local file storage per user, with an optional S3-compatible mirror (experimental)."""
import mimetypes
import shutil
import subprocess
import uuid
from pathlib import Path

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Asset

ALLOWED = {
    "image": {".png", ".jpg", ".jpeg", ".webp", ".gif"},
    "audio": {".wav", ".mp3", ".ogg", ".m4a", ".flac"},
    "video": {".mp4", ".webm", ".mov", ".mkv"},
    "subtitle": {".srt", ".vtt", ".ass"},
}
EXT_KIND = {e: k for k, v in ALLOWED.items() for e in v}


def kind_for(filename: str) -> str:
    return EXT_KIND.get(Path(filename).suffix.lower(), "")


def abs_path(asset: Asset) -> Path:
    p = (settings.storage_dir / asset.rel_path).resolve()
    if settings.storage_dir.resolve() not in p.parents:
        raise HTTPException(400, "bad_path")
    return p


def _s3():
    if not settings.s3_bucket:
        return None
    try:
        import boto3  # type: ignore
        return boto3.client("s3", endpoint_url=settings.s3_endpoint or None)
    except Exception:  # boto3 missing -> mirror disabled, local storage still authoritative
        return None


def probe(path: Path) -> dict:
    try:
        out = subprocess.run(
            [settings.ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
             "-of", "default=nw=1", str(path)], capture_output=True, text=True, timeout=30)
        info = {}
        for line in out.stdout.splitlines():
            k, _, v = line.partition("=")
            info.setdefault(k, v)
        return {"duration": float(info["duration"]) if info.get("duration", "N/A") != "N/A" else None,
                "width": int(info["width"]) if "width" in info else None,
                "height": int(info["height"]) if "height" in info else None,
                "ok": out.returncode == 0}
    except Exception:
        return {"ok": False}


def validate_file(path: Path, kind: str) -> dict:
    """Reject files whose content does not match their claimed type (malicious-upload protection)."""
    if kind == "image":
        try:
            with Image.open(path) as im:
                im.verify()
            with Image.open(path) as im:
                return {"width": im.width, "height": im.height}
        except (UnidentifiedImageError, OSError, SyntaxError):
            raise HTTPException(400, "invalid_image")
    if kind in ("audio", "video"):
        meta = probe(path)
        if not meta.get("ok"):
            raise HTTPException(400, f"invalid_{kind}")
        return {k: v for k, v in meta.items() if k != "ok"}
    if kind == "subtitle":
        try:
            path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise HTTPException(400, "invalid_subtitle")
    return {}


def register_file(db: Session, user_id: int, src: Path, name: str, kind: str, project_id: int | None = None,
                  meta: dict | None = None, move: bool = True) -> Asset:
    """Place an already-written file into the user's storage and create the Asset row."""
    ext = src.suffix.lower()
    rel = f"u{user_id}/{kind}/{uuid.uuid4().hex}{ext}"
    dest = settings.storage_dir / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    (shutil.move if move else shutil.copyfile)(str(src), str(dest))
    mime = mimetypes.guess_type(dest.name)[0] or "application/octet-stream"
    a = Asset(owner_id=user_id, project_id=project_id, kind=kind, name=name[:255], rel_path=rel, mime=mime,
              size=dest.stat().st_size, meta=meta or {})
    db.add(a)
    db.flush()
    s3 = _s3()
    if s3:
        try:
            s3.upload_file(str(dest), settings.s3_bucket, rel)
        except Exception as e:  # mirror failure must not lose the local copy
            a.meta = {**a.meta, "s3_error": str(e)[:200]}
    return a


async def save_upload(db: Session, user_id: int, upload, project_id: int | None = None, expect: str | None = None) -> Asset:
    name = upload.filename or "file"
    kind = kind_for(name)
    if not kind or (expect and kind != expect):
        raise HTTPException(400, "unsupported_file_type")
    tmp = settings.data_dir / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    tmp_file = tmp / f"{uuid.uuid4().hex}{Path(name).suffix.lower()}"
    limit = settings.max_upload_mb * 1024 * 1024
    size = 0
    with open(tmp_file, "wb") as f:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                f.close()
                tmp_file.unlink(missing_ok=True)
                raise HTTPException(413, "file_too_large")
            f.write(chunk)
    try:
        meta = validate_file(tmp_file, kind)
    except HTTPException:
        tmp_file.unlink(missing_ok=True)
        raise
    return register_file(db, user_id, tmp_file, name, kind, project_id, meta)


def delete_asset_file(asset: Asset):
    try:
        abs_path(asset).unlink(missing_ok=True)
    except Exception:
        pass
