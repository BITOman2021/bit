from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, log_activity, owned
from ..models import Asset, Character, Project, User, now
from ..services import jobs, storage

router = APIRouter(prefix="/api/characters", tags=["characters"])
APPEARANCE = ("description", "outfit", "colors", "features", "age", "style")


def cdict(c: Character) -> dict:
    return {"id": c.id, "name": c.name, "age": c.age, "description": c.description, "outfit": c.outfit, "colors": c.colors, "features": c.features,
            "style": c.style, "voice": c.voice, "reference_asset_id": c.reference_asset_id, "reference_locked": c.reference_locked, "sheet": c.sheet,
            "version": c.version, "workspace": c.workspace, "project_id": c.project_id, "history": c.history[-10:], "profile": jobs.character_profile(c),
            "created_at": c.created_at}


class CharIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    age: str = ""
    description: str = ""
    outfit: str = ""
    colors: str = ""
    features: str = ""
    style: str = "cartoon_2d"
    voice: dict = {}
    project_id: int | None = None
    workspace: str = "general"


class CharPatch(BaseModel):
    name: str | None = None
    age: str | None = None
    description: str | None = None
    outfit: str | None = None
    colors: str | None = None
    features: str | None = None
    style: str | None = None
    voice: dict | None = None
    confirm_appearance_change: bool = False


@router.get("")
def list_chars(workspace: str | None = None, project_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Character).where(Character.owner_id == user.id).order_by(Character.id.desc())
    if workspace:
        stmt = stmt.where(Character.workspace == workspace)
    if project_id:
        stmt = stmt.where(Character.project_id == project_id)
    return [cdict(c) for c in db.scalars(stmt)]


@router.post("")
def create(body: CharIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.project_id:
        owned(db, Project, body.project_id, user)
    c = Character(owner_id=user.id, **body.model_dump())
    db.add(c)
    db.flush()
    log_activity(db, user.id, "character_created", c.name)
    db.commit()
    return cdict(c)


@router.get("/{cid}")
def get(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return cdict(owned(db, Character, cid, user))


@router.patch("/{cid}")
def patch(cid: int, body: CharPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Appearance fields only change when the user explicitly confirms - this protects character consistency."""
    c = owned(db, Character, cid, user)
    data = body.model_dump(exclude_none=True)
    data.pop("confirm_appearance_change", None)
    changed = [k for k in APPEARANCE if k in data and data[k] != getattr(c, k)]
    if changed:
        if c.reference_locked:
            raise HTTPException(409, "reference_locked_character_cannot_be_redesigned")
        if not body.confirm_appearance_change and (c.sheet or c.version > 1 or c.reference_asset_id):
            raise HTTPException(409, "appearance_change_requires_confirmation")
        c.history = [*c.history, {"version": c.version, "at": now().isoformat(), "before": {k: getattr(c, k) for k in changed}}]
        c.version += 1
    for k, v in data.items():
        setattr(c, k, v)
    db.commit()
    return cdict(c)


@router.delete("/{cid}")
def delete(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = owned(db, Character, cid, user)
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/{cid}/reference")
async def set_reference(cid: int, file: UploadFile = File(...), lock: bool = Form(False), user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = owned(db, Character, cid, user)
    if c.reference_locked:
        raise HTTPException(409, "reference_locked")
    a = await storage.save_upload(db, user.id, file, c.project_id, expect="image")
    c.reference_asset_id, c.reference_locked = a.id, bool(lock)
    db.commit()
    return cdict(c)


SHEET_VARIANTS = [
    {"label": "pose:front", "extra": "front view, full body, standing, neutral pose"},
    {"label": "pose:side", "extra": "side view, full body, standing"},
    {"label": "pose:back", "extra": "back view, full body, standing"},
    {"label": "expr:happy", "extra": "close-up face, happy smiling expression"},
    {"label": "expr:sad", "extra": "close-up face, sad expression"},
    {"label": "expr:angry", "extra": "close-up face, angry expression"},
    {"label": "expr:surprised", "extra": "close-up face, surprised expression"},
]


@router.post("/{cid}/sheet")
def make_sheet(cid: int, body: dict | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Queue a character sheet (poses + expressions) generated with the locked appearance profile."""
    c = owned(db, Character, cid, user)
    body = body or {}
    wanted = body.get("labels")
    variants = [v for v in SHEET_VARIANTS if not wanted or v["label"] in wanted]
    try:
        job = jobs.enqueue(db, user, "image.generate", {"prompt": "character reference sheet, plain background", "character_ids": [c.id], "variants": variants,
                                                       "sheet_for": c.id, "style": c.style, "aspect": "1:1", "quality": body.get("quality", "standard"),
                                                       "use_reference": bool(c.reference_asset_id), "denoise": 0.5, "transparent": bool(body.get("transparent"))}, c.project_id)
    except PermissionError as e:
        raise HTTPException(429, str(e))
    db.commit()
    return {"job_id": job.id, "estimate": job.estimate}
