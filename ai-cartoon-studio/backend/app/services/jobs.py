"""DB-backed job queue with worker threads. Jobs persist across restarts; jobs interrupted by a restart are marked failed
(never silently reported as done) and can be retried."""
import json
import tempfile
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..config import settings
from ..db import session_scope
from ..engines import comfyui, imageops, lipsync, tts
from ..engines.registry import EngineUnavailable
from ..models import Asset, Character, Job, Project, User, now
from . import story as story_svc
from . import storage, video as video_svc
from .estimate import apply_low_resource

STYLES = {
    "cartoon_2d": "flat 2D cartoon illustration, clean bold outlines, vibrant colors, kids animation style",
    "cartoon_3d": "original stylized 3D cartoon render, soft studio lighting, smooth shading, family animation look",
    "pixar_like": "original 3D animated feature film aesthetic, expressive big eyes, soft global illumination, high detail",
    "anime": "anime style illustration, cel shading, clean line art",
    "kids_edu": "kids educational book illustration, simple shapes, bright friendly colors, white-friendly background",
    "storybook": "watercolor storybook illustration, warm soft palette",
}
NEGATIVE = "blurry, low quality, deformed, extra fingers, bad anatomy, text, watermark, scary, violent, realistic photo"
ASPECTS = {"1:1": (1, 1), "16:9": (16, 9), "9:16": (9, 16), "4:3": (4, 3), "3:4": (3, 4)}
QUALITY = {"draft": (512, 20), "standard": (768, 25), "high": (1024, 30)}
LIGHTING = {"soft": "soft diffused lighting", "sunny": "bright sunny daylight", "sunset": "warm golden sunset light", "night": "moonlit night, cool tones",
            "studio": "clean studio lighting", "dramatic": "dramatic rim lighting"}
CAMERA = {"eye": "eye-level shot", "low": "low angle shot", "high": "high angle shot", "close": "close-up", "wide": "wide shot", "full": "full body shot"}


def dims(aspect: str, quality: str) -> tuple[int, int, int]:
    base, steps = QUALITY.get(quality, QUALITY["standard"])
    a, b = ASPECTS.get(aspect, (1, 1))
    k = base / max(a, b)
    snap = lambda v: max(256, int(round(v * k / 64)) * 64)
    return snap(a), snap(b), steps


def character_profile(c: Character) -> str:
    """Canonical, immutable appearance string injected into every generation so the character stays consistent."""
    parts = [c.name and f"character {c.name}", c.age and f"{c.age} years old", c.description, c.outfit and f"wearing {c.outfit}",
             c.colors and f"color palette {c.colors}", c.features]
    return ", ".join(p for p in parts if p)


class Ctx:
    def __init__(self, job_id: int):
        self.job_id = job_id

    def progress(self, p: float, msg: str = ""):
        with session_scope() as db:
            j = db.get(Job, self.job_id)
            if j:
                j.progress, j.message = round(min(max(p, 0), 1), 3), msg[:250] or j.message

    def cancelled(self) -> bool:
        with session_scope() as db:
            j = db.get(Job, self.job_id)
            return bool(j and j.cancel_requested)


# ---------------------------------------------------------------- handlers
def h_image(job: Job, ctx: Ctx) -> dict:
    p = job.params
    with session_scope() as db:
        chars = [db.get(Character, int(i)) for i in p.get("character_ids", [])]
        chars = [c for c in chars if c and c.owner_id == job.owner_id]
        profile = "; ".join(character_profile(c) for c in chars)
        init_asset = db.get(Asset, int(p["init_asset_id"])) if p.get("init_asset_id") else None
        if init_asset and init_asset.owner_id != job.owner_id:
            raise EngineUnavailable("init image not found")
        init_path = storage.abs_path(init_asset) if init_asset else None
        if not init_path and p.get("use_reference") and chars and chars[0].reference_asset_id:
            ra = db.get(Asset, chars[0].reference_asset_id)
            init_path = storage.abs_path(ra) if ra else None
    w, h, steps = dims(p.get("aspect", "1:1"), p.get("quality", "standard"))
    w, h = int(p.get("width") or w), int(p.get("height") or h)
    style = STYLES.get(p.get("style", "cartoon_2d"), STYLES["cartoon_2d"])
    variants = p.get("variants") or [{"label": "", "extra": ""}]
    count = max(1, min(int(p.get("count", 1)), 8))
    bits = lambda extra: ", ".join(x for x in [profile, p.get("prompt", ""), extra, style, LIGHTING.get(p.get("lighting", ""), ""),
                                                CAMERA.get(p.get("camera", ""), ""), p.get("colors", ""),
                                                "plain solid background" if p.get("transparent") else ""] if x)
    image_name = comfyui.upload_image(init_path) if init_path else ""
    wf_name = "img2img_sdxl" if init_path else "txt2img_sdxl"
    total = len(variants) * count
    done, asset_ids = 0, []
    for v in variants:
        for _ in range(count):
            if ctx.cancelled():
                raise EngineUnavailable("cancelled")
            vals = comfyui.base_values({"prompt": bits(v.get("extra", "")), "negative": f"{NEGATIVE}, {p.get('negative', '')}", "width": w, "height": h,
                                        "steps": p.get("steps") or steps, "cfg": p.get("cfg", 7), "seed": p.get("seed"), "image": image_name,
                                        "denoise": p.get("denoise", 0.55), "checkpoint": p.get("checkpoint")})
            files = comfyui.run_workflow(comfyui.load_workflow(wf_name, vals), progress=lambda x: ctx.progress((done + x) / total, "generating"),
                                         cancelled=ctx.cancelled)
            with session_scope() as db, tempfile.TemporaryDirectory(dir=settings.data_dir) as td:
                for fname, data in files[:1]:
                    f = Path(td) / "out.png"
                    f.write_bytes(data)
                    if p.get("transparent"):
                        imageops.remove_background(f, f)
                    a = storage.register_file(db, job.owner_id, f, f"{v.get('label') or 'image'}-{job.id}-{done + 1}.png", "image", job.project_id, {
                        "prompt": vals["PROMPT"], "seed": vals["SEED"], "engine": "comfyui-sdxl", "width": w, "height": h, "style": p.get("style"),
                        "character_ids": [c.id for c in chars], "label": v.get("label", ""), "job_id": job.id, "transparent": bool(p.get("transparent"))})
                    asset_ids.append(a.id)
                    if p.get("sheet_for") and v.get("label"):
                        ch = db.get(Character, int(p["sheet_for"]))
                        if ch and ch.owner_id == job.owner_id:
                            ch.sheet = {**ch.sheet, v["label"]: a.id}
            done += 1
            ctx.progress(done / total, f"{done}/{total}")
    return {"asset_ids": asset_ids}


def h_tts(job: Job, ctx: Ctx) -> dict:
    p = job.params
    with tempfile.TemporaryDirectory(dir=settings.data_dir) as td:
        out = Path(td) / "speech.wav"
        ctx.progress(0.1, "synthesizing")
        tts.synthesize(p["engine"], p["voice"], p["text"], out, float(p.get("speed", 1)), float(p.get("pitch", 0)), p.get("emotion", "neutral"))
        meta = storage.validate_file(out, "audio")
        with session_scope() as db:
            a = storage.register_file(db, job.owner_id, out, f"{p.get('name') or 'voice'}-{job.id}.wav", "audio", job.project_id,
                                      {**meta, "text": p["text"][:500], "engine": p["engine"], "voice": p["voice"], "character_id": p.get("character_id")})
            return {"asset_ids": [a.id]}


def h_story(job: Job, ctx: Ctx) -> dict:
    ctx.progress(0.2, "writing")
    return {"story": story_svc.generate(job.params)}


def h_animate(job: Job, ctx: Ctx) -> dict:
    p = job.params
    with session_scope() as db:
        img = db.get(Asset, int(p["asset_id"]))
        if not img or img.owner_id != job.owner_id or img.kind != "image":
            raise EngineUnavailable("image asset not found")
        timeline = {"scenes": [{"image_asset_id": img.id, "audio_asset_id": p.get("audio_asset_id"), "duration": p.get("duration", 5),
                                "motion": p.get("motion", "zoom_in"), "transition": p.get("transition", "none")}]}
        return _render_to_asset(db, job, ctx, timeline, {"aspect": p.get("aspect", "16:9"), "resolution": p.get("resolution", 720), "fps": p.get("fps", 24)}, "animation")


def h_lipsync(job: Job, ctx: Ctx) -> dict:
    p = job.params
    if p.get("engine", "audio_reactive") != "audio_reactive":
        raise EngineUnavailable("Only the built-in audio-reactive engine is installed; see docs/AI_ENGINES.md for Wav2Lip/SadTalker adapters")
    with session_scope() as db:
        img, aud = db.get(Asset, int(p["image_asset_id"])), db.get(Asset, int(p["audio_asset_id"]))
        if not img or not aud or img.owner_id != job.owner_id or aud.owner_id != job.owner_id:
            raise EngineUnavailable("assets not found")
        ip, ap = storage.abs_path(img), storage.abs_path(aud)
    w, h = video_svc.size_for(p.get("aspect", "16:9"), int(p.get("resolution", 720)))
    with tempfile.TemporaryDirectory(dir=settings.data_dir) as td:
        out = Path(td) / "talk.mp4"
        lipsync.render_audio_reactive(ip, ap, out, w, h, int(p.get("fps", 24)), p.get("style", "talk"), lambda x: ctx.progress(x * 0.95, "animating"))
        with session_scope() as db:
            a = storage.register_file(db, job.owner_id, out, f"talk-{job.id}.mp4", "video", job.project_id, {**storage.validate_file(out, "video"), "engine": "audio_reactive"})
            return {"asset_ids": [a.id]}


def _render_to_asset(db, job, ctx, timeline, export, label) -> dict:
    with tempfile.TemporaryDirectory(dir=settings.data_dir) as td:
        out = Path(td) / "video.mp4"
        info = video_svc.render_timeline(db, job.owner_id, timeline, export, out, lambda x, m="": ctx.progress(x, m), ctx.cancelled)
        a = storage.register_file(db, job.owner_id, out, f"{label}-{job.id}.mp4", "video", job.project_id, {
            "duration": info["duration"], "width": info["width"], "height": info["height"], "fps": info["fps"], "job_id": job.id})
        res = {"asset_ids": [a.id], "duration": info["duration"]}
        for key, suffix in (("primary", ""), ("secondary", "-2"), ("both", "-bilingual")):
            txt = info["srt"][key]
            if txt:
                f = Path(td) / f"s{key}.srt"
                f.write_text(txt, encoding="utf-8")
                sa = storage.register_file(db, job.owner_id, f, f"{label}-{job.id}{suffix}.srt", "subtitle", job.project_id, {"lang": key})
                res.setdefault("subtitle_asset_ids", {})[key] = sa.id
        return res


def h_render(job: Job, ctx: Ctx) -> dict:
    p = job.params
    with session_scope() as db:
        proj = db.get(Project, int(p["project_id"]))
        if not proj or proj.owner_id != job.owner_id:
            raise EngineUnavailable("project not found")
        timeline = (proj.data or {}).get("timeline") or {}
        export = {**(proj.data or {}).get("export", {}), **{k: v for k, v in p.items() if k in ("aspect", "resolution", "fps", "subtitles")}}
        res = _render_to_asset(db, job, ctx, timeline, export, "export")
        proj.data = {**proj.data, "last_export": {"asset_id": res["asset_ids"][0], "at": now().isoformat()}}
        return res


def h_video_ai(job: Job, ctx: Ctx) -> dict:
    p = job.params
    if not comfyui.workflow_exists("video_i2v"):
        raise EngineUnavailable("No AI video workflow installed: add workflows/video_i2v.json (see docs/AI_ENGINES.md)")
    image_name = ""
    with session_scope() as db:
        if p.get("image_asset_id"):
            a = db.get(Asset, int(p["image_asset_id"]))
            if not a or a.owner_id != job.owner_id:
                raise EngineUnavailable("image asset not found")
            image_name = comfyui.upload_image(storage.abs_path(a))
    w, h = video_svc.size_for(p.get("aspect", "16:9"), 720)
    vals = comfyui.base_values({"prompt": p.get("prompt", ""), "negative": NEGATIVE, "width": min(w, 832), "height": min(h, 832), "image": image_name,
                                "frames": p.get("frames", 25), "fps": p.get("fps", 8), "steps": p.get("steps", 20), "seed": p.get("seed")})
    files = comfyui.run_workflow(comfyui.load_workflow("video_i2v", vals), timeout=3600, progress=lambda x: ctx.progress(x, "generating video"), cancelled=ctx.cancelled)
    ids = []
    with session_scope() as db, tempfile.TemporaryDirectory(dir=settings.data_dir) as td:
        for fname, data in files:
            f = Path(td) / fname
            f.write_bytes(data)
            kind = storage.kind_for(fname)
            if kind in ("video", "image"):
                ids.append(storage.register_file(db, job.owner_id, f, fname, kind, job.project_id, {**storage.validate_file(f, kind), "engine": "comfyui-video"}).id)
    return {"asset_ids": ids}


HANDLERS = {"image.generate": h_image, "tts.synthesize": h_tts, "story.generate": h_story, "video.animate": h_animate,
            "video.lipsync": h_lipsync, "video.render": h_render, "video.generate": h_video_ai}
ENGINE_OF = {"image.generate": "comfyui-sdxl", "video.generate": "comfyui-video", "tts.synthesize": "tts", "story.generate": "llm",
             "video.animate": "ffmpeg", "video.lipsync": "audio_reactive", "video.render": "ffmpeg"}


# ---------------------------------------------------------------- queue
def daily_quota(db, user: User) -> int:
    from ..models import Setting
    if user.daily_job_quota is not None:
        return user.daily_job_quota
    s = db.get(Setting, "quota")
    return int((s.value if s else {}).get("jobs_per_day", 200))


def enqueue(db, user: User, kind: str, params: dict, project_id: int | None = None) -> Job:
    from ..models import Job as J
    from sqlalchemy import func, select
    if kind not in HANDLERS:
        raise ValueError("unknown job kind")
    since = datetime.now(timezone.utc) - timedelta(days=1)
    used = db.scalar(select(func.count()).select_from(J).where(J.owner_id == user.id, J.created_at >= since)) or 0
    if user.role != "admin" and used >= daily_quota(db, user):
        raise PermissionError("daily_quota_exceeded")
    from .estimate import estimate
    params = apply_low_resource(kind, params)
    job = J(owner_id=user.id, project_id=project_id, kind=kind, engine=ENGINE_OF.get(kind, ""), params=params, estimate=estimate(kind, params))
    db.add(job)
    db.flush()
    return job


class Worker:
    def __init__(self):
        self.stop = threading.Event()
        self.threads: list[threading.Thread] = []
        self.lock = threading.Lock()

    def start(self):
        with session_scope() as db:  # recover from crash/restart
            for j in db.query(Job).filter(Job.status == "running").all():
                j.status, j.error, j.finished_at = "failed", "Interrupted by a server restart - press retry.", now()
        self.stop.clear()
        for i in range(settings.worker_threads):
            t = threading.Thread(target=self.loop, name=f"worker-{i}", daemon=True)
            t.start()
            self.threads.append(t)

    def shutdown(self):
        self.stop.set()

    def claim(self) -> int | None:
        with self.lock, session_scope() as db:
            j = db.query(Job).filter(Job.status == "queued").order_by(Job.id).first()
            if not j:
                return None
            if j.cancel_requested:
                j.status, j.finished_at = "cancelled", now()
                return None
            j.status, j.started_at = "running", now()
            return j.id

    def loop(self):
        while not self.stop.is_set():
            jid = None
            try:
                jid = self.claim()
            except Exception:
                time.sleep(1)
            if jid is None:
                time.sleep(0.4)
                continue
            self.run(jid)

    def run(self, jid: int):
        with session_scope() as db:
            job = db.get(Job, jid)
            db.expunge(job)
        try:
            res = HANDLERS[job.kind](job, Ctx(jid))
            status, err = "done", ""
        except EngineUnavailable as e:
            res, status, err = {}, ("cancelled" if str(e) == "cancelled" else "failed"), str(e)
        except Exception as e:  # unexpected: record trace tail so failures are never swallowed as success
            res, status, err = {}, "failed", f"{type(e).__name__}: {e}\n{traceback.format_exc()[-600:]}"
        with session_scope() as db:
            j = db.get(Job, jid)
            j.status, j.error, j.result, j.finished_at = status, err, res, now()
            if status == "done":
                j.progress, j.message = 1.0, "done"


worker = Worker()
