"""SAM KIDZ workspace: an independent workspace (project kind 'samkidz_workspace') with reference characters that are
imported as-is (locked, never redesigned), episodes (project kind 'samkidz_episode') and an archive."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, log_activity, owned
from ..models import Character, Project, User
from ..services import storage
from .characters import cdict
from .projects import pdict

router = APIRouter(prefix="/api/samkidz", tags=["samkidz"])
REFERENCE_NAMES = ["Bonnie", "Bro", "Safsoof", "Sara"]
STATUSES = ["idea", "script", "production", "review", "published", "archived"]


def workspace(db: Session, user: User) -> Project:
    w = db.scalar(select(Project).where(Project.owner_id == user.id, Project.kind == "samkidz_workspace"))
    if not w:
        w = Project(owner_id=user.id, name="SAM KIDZ | سام كيدز", kind="samkidz_workspace", lang="ar", description="SAM KIDZ workspace",
                    data={"series_bible": "", "reference_names": REFERENCE_NAMES})
        db.add(w)
        db.flush()
    return w


@router.get("")
def overview(user: User = Depends(current_user), db: Session = Depends(get_db)):
    w = workspace(db, user)
    chars = db.scalars(select(Character).where(Character.owner_id == user.id, Character.workspace == "samkidz").order_by(Character.id)).all()
    eps = db.scalars(select(Project).where(Project.owner_id == user.id, Project.kind == "samkidz_episode").order_by(Project.id.desc())).all()
    have = {c.name.lower() for c in chars}
    db.commit()
    return {"workspace": pdict(w, True), "characters": [cdict(c) for c in chars], "episodes": [pdict(e) for e in eps],
            "missing_references": [n for n in REFERENCE_NAMES if n.lower() not in have], "statuses": STATUSES}


@router.put("/bible")
def bible(body: dict, user: User = Depends(current_user), db: Session = Depends(get_db)):
    w = workspace(db, user)
    w.data = {**w.data, "series_bible": str(body.get("series_bible", ""))[:20000]}
    db.commit()
    return {"ok": True}


@router.post("/characters/import")
async def import_character(name: str = Form(...), description: str = Form(""), voice_engine: str = Form(""), voice: str = Form(""),
                           file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Imports a reference image unchanged and locks the character's identity: the system never redesigns it."""
    w = workspace(db, user)
    name = name.strip()
    if not name:
        raise HTTPException(422, "name_required")
    if db.scalar(select(Character).where(Character.owner_id == user.id, Character.workspace == "samkidz", Character.name == name)):
        raise HTTPException(409, "character_exists")
    a = await storage.save_upload(db, user.id, file, w.id, expect="image")
    c = Character(owner_id=user.id, project_id=w.id, workspace="samkidz", name=name, description=description, reference_asset_id=a.id, reference_locked=True,
                  voice={"engine": voice_engine, "voice": voice} if voice else {})
    db.add(c)
    log_activity(db, user.id, "samkidz_character_imported", name)
    db.commit()
    return cdict(c)


class Episode(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    number: int | None = None


@router.post("/episodes")
def new_episode(body: Episode, user: User = Depends(current_user), db: Session = Depends(get_db)):
    w = workspace(db, user)
    n = body.number or (len(db.scalars(select(Project.id).where(Project.owner_id == user.id, Project.kind == "samkidz_episode")).all()) + 1)
    p = Project(owner_id=user.id, parent_id=w.id, kind="samkidz_episode", name=body.name, description=body.description, lang="ar", status="idea",
                data={"number": n, "script": {}, "timeline": {"scenes": []}, "export": {"aspect": "16:9", "resolution": 1080, "fps": 24, "subtitles": "primary"}})
    db.add(p)
    log_activity(db, user.id, "samkidz_episode_created", body.name)
    db.commit()
    return pdict(p, True)


@router.patch("/episodes/{pid}/status")
def episode_status(pid: int, body: dict, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = owned(db, Project, pid, user)
    if p.kind != "samkidz_episode" or body.get("status") not in STATUSES:
        raise HTTPException(422, "bad_status")
    p.status = body["status"]
    db.commit()
    return pdict(p)
