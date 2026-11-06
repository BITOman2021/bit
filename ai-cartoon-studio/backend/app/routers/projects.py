import io
import json
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, log_activity, owned
from ..models import Asset, Character, Project, Revision, User, now
from ..config import settings
from ..services import video as video_svc
from ..services.storage import abs_path

router = APIRouter(prefix="/api/projects", tags=["projects"])


def pdict(p: Project, full=False) -> dict:
    d = {"id": p.id, "name": p.name, "description": p.description, "lang": p.lang, "kind": p.kind, "parent_id": p.parent_id, "status": p.status,
         "created_at": p.created_at, "updated_at": p.updated_at}
    d["data"] = p.data or {}
    if not full:
        d["data"] = {"scene_count": len((p.data or {}).get("timeline", {}).get("scenes", [])), "thumbnail_asset_id": (p.data or {}).get("thumbnail_asset_id")}
    return d


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    lang: str = "ar"


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    lang: str | None = None
    status: str | None = None
    data: dict | None = None  # merged shallowly; auto-save sends only the changed sections
    revision_note: str | None = None


@router.get("")
def list_projects(kind: str | None = None, parent_id: int | None = None, q: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Project).where(Project.owner_id == user.id).order_by(Project.updated_at.desc())
    if kind:
        stmt = stmt.where(Project.kind == kind)
    else:
        stmt = stmt.where(Project.kind.in_(["general"]))
    if parent_id:
        stmt = stmt.where(Project.parent_id == parent_id)
    rows = db.scalars(stmt).all()
    if q:
        rows = [r for r in rows if q.lower() in r.name.lower()]
    return [pdict(r) for r in rows]


@router.post("")
def create(body: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = Project(owner_id=user.id, name=body.name.strip(), description=body.description, lang=body.lang,
                data={"script": {}, "timeline": {"scenes": []}, "export": {"aspect": "16:9", "resolution": 720, "fps": 24, "subtitles": "none"}})
    db.add(p)
    db.flush()
    log_activity(db, user.id, "project_created", p.name)
    db.commit()
    return pdict(p, True)


@router.get("/{pid}")
def get(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return pdict(owned(db, Project, pid, user), True)


@router.patch("/{pid}")
def patch(pid: int, body: ProjectPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = owned(db, Project, pid, user)
    for f in ("name", "description", "lang", "status"):
        v = getattr(body, f)
        if v is not None:
            setattr(p, f, v)
    if body.data is not None:
        # snapshot before overwriting (edit history), keep last 30
        db.add(Revision(project_id=p.id, summary=body.revision_note or "autosave", snapshot=p.data or {}))
        p.data = {**(p.data or {}), **body.data}
        old = db.scalars(select(Revision).where(Revision.project_id == p.id).order_by(Revision.id.desc()).offset(30)).all()
        for r in old:
            db.delete(r)
    p.updated_at = now()
    db.commit()
    return pdict(p, True)


@router.delete("/{pid}")
def delete(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = owned(db, Project, pid, user)
    log_activity(db, user.id, "project_deleted", p.name)
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/{pid}/duplicate")
def duplicate(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = owned(db, Project, pid, user)
    n = Project(owner_id=user.id, name=f"{p.name} (copy)", description=p.description, lang=p.lang, kind=p.kind, parent_id=p.parent_id,
                data=json.loads(json.dumps(p.data or {})))
    db.add(n)
    db.flush()
    log_activity(db, user.id, "project_duplicated", p.name)
    db.commit()
    return pdict(n, True)


@router.get("/{pid}/revisions")
def revisions(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned(db, Project, pid, user)
    rows = db.scalars(select(Revision).where(Revision.project_id == pid).order_by(Revision.id.desc()).limit(30))
    return [{"id": r.id, "summary": r.summary, "created_at": r.created_at} for r in rows]


@router.post("/{pid}/revisions/{rid}/restore")
def restore(pid: int, rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = owned(db, Project, pid, user)
    r = db.get(Revision, rid)
    if not r or r.project_id != pid:
        raise HTTPException(404, "not_found")
    db.add(Revision(project_id=pid, summary="before restore", snapshot=p.data or {}))
    p.data = r.snapshot
    p.updated_at = now()
    db.commit()
    return pdict(p, True)


@router.get("/{pid}/assets")
def project_assets(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned(db, Project, pid, user)
    from .assets import adict
    return [adict(a) for a in db.scalars(select(Asset).where(Asset.project_id == pid).order_by(Asset.id.desc()))]


@router.get("/{pid}/export")
def export_zip(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Download a self-contained archive: project.json, characters.json and all project asset files."""
    p = owned(db, Project, pid, user)
    assets = db.scalars(select(Asset).where(Asset.project_id == pid)).all()
    chars = db.scalars(select(Character).where(Character.project_id == pid)).all()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("project.json", json.dumps(pdict(p, True), default=str, ensure_ascii=False, indent=2))
        z.writestr("characters.json", json.dumps([{c.name: {"description": c.description, "outfit": c.outfit, "colors": c.colors, "voice": c.voice}} for c in chars],
                                                  ensure_ascii=False, indent=2))
        z.writestr("assets.json", json.dumps([{"id": a.id, "name": a.name, "kind": a.kind, "meta": a.meta} for a in assets], default=str, ensure_ascii=False, indent=2))
        for a in assets:
            fp = abs_path(a)
            if fp.exists():
                z.write(fp, f"assets/{a.id}_{a.name}")
    buf.seek(0)
    log_activity(db, user.id, "project_exported", p.name)
    db.commit()
    return StreamingResponse(buf, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="project-{pid}.zip"'})


@router.get("/{pid}/srt")
def srt(pid: int, lang: str = "primary", user: User = Depends(current_user), db: Session = Depends(get_db)):
    """SRT from the timeline using real scene durations (dialogue audio length counted)."""
    p = owned(db, Project, pid, user)
    scenes = video_svc.resolve_scenes(db, user.id, (p.data or {}).get("timeline", {}))
    if lang not in ("primary", "secondary", "both"):
        raise HTTPException(422, "bad_lang")
    return StreamingResponse(io.BytesIO(video_svc.build_srt(scenes, lang).encode("utf-8")), media_type="application/x-subrip",
                             headers={"Content-Disposition": f'attachment; filename="project-{pid}-{lang}.srt"'})
