import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import current_user, log_activity, owned
from ..engines import imageops, tts
from ..engines.registry import EngineUnavailable, all_engines
from ..models import Asset, Character, Job, Project, User
from ..services import estimate as est, jobs, storage, story, thumbnail
from ..services import video as video_svc
from .assets import adict

router = APIRouter(prefix="/api", tags=["studio"])


# ------------------------------------------------------------------ engines / jobs
@router.get("/engines")
def engines(user: User = Depends(current_user)):
    return {"engines": [e.dict() for e in all_engines()], "low_resource": settings.low_resource}


def jdict(j: Job) -> dict:
    return {"id": j.id, "kind": j.kind, "engine": j.engine, "status": j.status, "progress": j.progress, "message": j.message, "result": j.result,
            "error": j.error, "estimate": j.estimate, "project_id": j.project_id, "params": j.params, "created_at": j.created_at,
            "started_at": j.started_at, "finished_at": j.finished_at}


class JobIn(BaseModel):
    kind: str
    params: dict = {}
    project_id: int | None = None


class EstimateIn(BaseModel):
    kind: str
    params: dict = {}


@router.post("/estimate")
def estimate(body: EstimateIn, user: User = Depends(current_user)):
    """Shown to the user before heavy jobs. Local engines cost no money; this reports time and hardware needs."""
    return est.estimate(body.kind, est.apply_low_resource(body.kind, body.params))


@router.post("/jobs")
def create_job(body: JobIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.project_id:
        owned(db, Project, body.project_id, user)
    try:
        job = jobs.enqueue(db, user, body.kind, body.params, body.project_id)
    except ValueError:
        raise HTTPException(422, "unknown_job_kind")
    except PermissionError as e:
        raise HTTPException(429, str(e))
    log_activity(db, user.id, f"job_{body.kind}", f"#{job.id}")
    db.commit()
    return jdict(job)


@router.get("/jobs")
def list_jobs(status: str | None = None, kind: str | None = None, limit: int = 50, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Job).where(Job.owner_id == user.id).order_by(Job.id.desc()).limit(min(limit, 200))
    if status:
        stmt = stmt.where(Job.status == status)
    if kind:
        stmt = stmt.where(Job.kind == kind)
    return [jdict(j) for j in db.scalars(stmt)]


@router.get("/jobs/{jid}")
def get_job(jid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    j = owned(db, Job, jid, user)
    d = jdict(j)
    ids = (j.result or {}).get("asset_ids", [])
    d["assets"] = [adict(a) for a in db.scalars(select(Asset).where(Asset.id.in_(ids)))] if ids else []
    return d


@router.post("/jobs/{jid}/cancel")
def cancel(jid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    j = owned(db, Job, jid, user)
    if j.status in ("queued", "running"):
        j.cancel_requested = True
        if j.status == "queued":
            j.status = "cancelled"
    db.commit()
    return jdict(j)


@router.post("/jobs/{jid}/retry")
def retry(jid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    j = owned(db, Job, jid, user)
    if j.status not in ("failed", "cancelled"):
        raise HTTPException(409, "job_not_retryable")
    try:
        n = jobs.enqueue(db, user, j.kind, j.params, j.project_id)
    except PermissionError as e:
        raise HTTPException(429, str(e))
    db.commit()
    return jdict(n)


# ------------------------------------------------------------------ voice
@router.get("/voices")
def voices(user: User = Depends(current_user)):
    return {"voices": tts.list_voices(), "emotions": list(tts.EMOTIONS)}


@router.post("/voices/preview")
def preview(body: dict, user: User = Depends(current_user)):
    """Synchronous short preview (<= 200 chars) - nothing is saved until the user approves via a tts job."""
    text = str(body.get("text", ""))[:200]
    with tempfile.TemporaryDirectory(dir=settings.data_dir) as td:
        out = Path(td) / "p.wav"
        try:
            tts.synthesize(body.get("engine", ""), body.get("voice", ""), text, out, float(body.get("speed", 1)), float(body.get("pitch", 0)), body.get("emotion", "neutral"))
        except EngineUnavailable as e:
            raise HTTPException(503, str(e))
        data = out.read_bytes()
    from fastapi.responses import Response
    return Response(data, media_type="audio/wav", headers={"Cache-Control": "no-store"})


# ------------------------------------------------------------------ image tools (CPU, synchronous)
class ImgOp(BaseModel):
    asset_id: int
    op: str  # upscale | remove_background | edit
    factor: int = Field(default=2, ge=2, le=4)
    tolerance: int = Field(default=28, ge=0, le=120)
    ops: dict = {}


@router.post("/image-tools")
def image_tools(body: ImgOp, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = owned(db, Asset, body.asset_id, user)
    if a.kind != "image":
        raise HTTPException(422, "not_an_image")
    src = storage.abs_path(a)
    if body.op == "upscale" and (a.meta.get("width") or 0) * body.factor > 8192:
        raise HTTPException(422, "result_too_large")
    with tempfile.TemporaryDirectory(dir=settings.data_dir) as td:
        out = Path(td) / "out.png"
        if body.op == "upscale":
            imageops.upscale(src, out, body.factor)
        elif body.op == "remove_background":
            imageops.remove_background(src, out, body.tolerance)
        elif body.op == "edit":
            imageops.edit(src, out, body.ops)
        else:
            raise HTTPException(422, "unknown_op")
        new = storage.register_file(db, user.id, out, f"{Path(a.name).stem}-{body.op}.png", "image", a.project_id,
                                    {**storage.validate_file(out, "image"), "derived_from": a.id, "op": body.op})
    db.commit()
    return adict(new)


# ------------------------------------------------------------------ YouTube studio
class Thumb(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    background_asset_id: int | None = None
    character_asset_id: int | None = None
    badge: str = ""
    project_id: int | None = None


@router.post("/youtube/thumbnail")
def make_thumb(body: Thumb, user: User = Depends(current_user), db: Session = Depends(get_db)):
    bg = storage.abs_path(owned(db, Asset, body.background_asset_id, user)) if body.background_asset_id else None
    ch = storage.abs_path(owned(db, Asset, body.character_asset_id, user)) if body.character_asset_id else None
    with tempfile.TemporaryDirectory(dir=settings.data_dir) as td:
        out = Path(td) / "thumb.jpg"
        thumbnail.render(out, body.title, bg, ch, body.badge)
        a = storage.register_file(db, user.id, out, "thumbnail.jpg", "image", body.project_id, {"width": 1280, "height": 720, "thumbnail": True})
        if body.project_id:
            p = owned(db, Project, body.project_id, user)
            p.data = {**(p.data or {}), "thumbnail_asset_id": a.id}
    db.commit()
    return adict(a)


class MetaIn(BaseModel):
    project_id: int
    engine: str = "template"
    language: str = "ar"
    keywords: list[str] = []


@router.post("/youtube/metadata")
def yt_metadata(body: MetaIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = owned(db, Project, body.project_id, user)
    scenes = video_svc.resolve_scenes(db, user.id, (p.data or {}).get("timeline", {}))
    t, chapters = 0.0, []
    for s in scenes:
        m, sec = divmod(int(t), 60)
        chapters.append((f"{m}:{sec:02}", s.get("title") or f"Scene {s['index'] + 1}"))
        t += s["dur"]
    if chapters and chapters[0][0] != "0:00":
        chapters[0] = ("0:00", chapters[0][1])
    try:
        meta = story.youtube_meta({"title": p.name, "synopsis": p.description or (p.data or {}).get("script", {}).get("synopsis", ""), "language": body.language,
                                   "keywords": body.keywords, "engine": body.engine}, chapters if len(chapters) >= 3 else [])
    except EngineUnavailable as e:
        raise HTTPException(503, str(e))
    p.data = {**(p.data or {}), "youtube": {**((p.data or {}).get("youtube") or {}), body.language: meta}}
    db.commit()
    return meta


@router.post("/youtube/package/{pid}")
def package(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Zip with the last exported video, thumbnail, SRT files and description files (ar/en) ready for manual upload."""
    p = owned(db, Project, pid, user)
    d = p.data or {}
    last = (d.get("last_export") or {}).get("asset_id")
    if not last:
        raise HTTPException(409, "render_the_video_first")
    scenes = video_svc.resolve_scenes(db, user.id, d.get("timeline", {}))
    with tempfile.TemporaryDirectory(dir=settings.data_dir) as td:
        z = Path(td) / "youtube-package.zip"
        with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
            v = db.get(Asset, last)
            if v and storage.abs_path(v).exists():
                zf.write(storage.abs_path(v), "video.mp4")
            if d.get("thumbnail_asset_id"):
                t = db.get(Asset, d["thumbnail_asset_id"])
                if t and storage.abs_path(t).exists():
                    zf.write(storage.abs_path(t), "thumbnail.jpg")
            for k, name in (("primary", "subtitles-primary.srt"), ("secondary", "subtitles-secondary.srt"), ("both", "subtitles-bilingual.srt")):
                txt = video_svc.build_srt(scenes, k)
                if txt:
                    zf.writestr(name, txt)
            for lang, meta in (d.get("youtube") or {}).items():
                body = [f"TITLE OPTIONS:", *[f"- {x}" for x in meta.get("titles", [])], "", "DESCRIPTION:", meta.get("description", ""), "",
                        "TAGS: " + ", ".join(meta.get("tags", [])), "HASHTAGS: " + " ".join(meta.get("hashtags", []))]
                zf.writestr(f"description-{lang}.txt", "\n".join(body))
        data = z.read_bytes()
    from fastapi.responses import Response
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="youtube-package-{pid}.zip"'})


@router.get("/youtube/status")
def yt_status(user: User = Depends(current_user)):
    return {"upload_available": False, "reason": "YouTube API OAuth is not configured. Automatic upload is disabled; use the exported package and upload manually, "
                                                   "or configure the YouTube Data API (docs/YOUTUBE.md)." if not settings.youtube_client_id else
            "Client ID configured but the OAuth consent flow is not implemented in this release; upload manually."}


# ------------------------------------------------------------------ settings/presets for UI
@router.get("/presets")
def presets(user: User = Depends(current_user)):
    return {"styles": list(jobs.STYLES), "aspects": list(jobs.ASPECTS), "quality": list(jobs.QUALITY), "lighting": list(jobs.LIGHTING), "camera": list(jobs.CAMERA),
            "motions": sorted(video_svc.MOTIONS), "video_aspects": ["16:9", "9:16", "1:1"], "resolutions": [720, 1080]}
