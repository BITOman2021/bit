import mimetypes

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, owned
from ..models import Asset, Character, Project, User
from ..services import storage

router = APIRouter(prefix="/api/assets", tags=["assets"])


def adict(a: Asset) -> dict:
    return {"id": a.id, "kind": a.kind, "name": a.name, "mime": a.mime, "size": a.size, "meta": a.meta, "project_id": a.project_id, "created_at": a.created_at,
            "url": f"/api/assets/{a.id}/file"}


@router.get("")
def list_assets(kind: str | None = None, project_id: int | None = None, q: str | None = None, limit: int = 200, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    stmt = select(Asset).where(Asset.owner_id == user.id).order_by(Asset.id.desc()).limit(min(limit, 500))
    if kind:
        stmt = stmt.where(Asset.kind == kind)
    if project_id:
        stmt = stmt.where(Asset.project_id == project_id)
    if q:
        stmt = stmt.where(Asset.name.ilike(f"%{q}%"))
    return [adict(a) for a in db.scalars(stmt)]


@router.post("")
async def upload(file: UploadFile = File(...), project_id: int | None = Form(None), user: User = Depends(current_user), db: Session = Depends(get_db)):
    if project_id:
        owned(db, Project, project_id, user)
    a = await storage.save_upload(db, user.id, file, project_id)
    db.commit()
    return adict(a)


@router.get("/{aid}/file")
def file(aid: int, download: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = owned(db, Asset, aid, user)
    p = storage.abs_path(a)
    if not p.exists():
        raise HTTPException(404, "file_missing")
    # force download for non-media so uploaded content can never render as HTML in the app origin
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"}
    return FileResponse(p, media_type=a.mime, filename=a.name if download else None, headers=headers,
                        content_disposition_type="attachment" if download else "inline")


@router.patch("/{aid}")
def rename(aid: int, body: dict, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = owned(db, Asset, aid, user)
    if isinstance(body.get("name"), str) and body["name"].strip():
        a.name = body["name"].strip()[:255]
    if "project_id" in body:
        if body["project_id"]:
            owned(db, Project, int(body["project_id"]), user)
        a.project_id = body["project_id"]
    db.commit()
    return adict(a)


@router.delete("/{aid}")
def delete(aid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = owned(db, Asset, aid, user)
    for c in db.scalars(select(Character).where(Character.reference_asset_id == aid)):
        if c.reference_locked:
            raise HTTPException(409, "asset_is_locked_reference")
        c.reference_asset_id = None
    storage.delete_asset_file(a)
    db.delete(a)
    db.commit()
    return {"ok": True}
