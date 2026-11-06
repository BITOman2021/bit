import shutil
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import admin_user, current_user, log_activity
from ..engines.registry import all_engines
from ..models import Activity, Asset, AuthSession, Character, Job, Project, Setting, User

router = APIRouter(prefix="/api", tags=["admin"])


def dir_size(p: Path) -> int:
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) if p.exists() else 0


@router.get("/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = lambda m, *w: db.scalar(select(func.count()).select_from(m).where(*w)) or 0
    mine = Asset.owner_id == user.id
    my_storage = db.scalar(select(func.coalesce(func.sum(Asset.size), 0)).where(mine)) or 0
    recent = db.scalars(select(Activity).where(Activity.user_id == user.id).order_by(Activity.id.desc()).limit(12)).all()
    return {
        "projects": c(Project, Project.owner_id == user.id, Project.kind == "general"),
        "images": c(Asset, mine, Asset.kind == "image"), "videos": c(Asset, mine, Asset.kind == "video"), "characters": c(Character, Character.owner_id == user.id),
        "processing": c(Job, Job.owner_id == user.id, Job.status.in_(["queued", "running"])),
        "completed": c(Job, Job.owner_id == user.id, Job.status == "done"), "failed": c(Job, Job.owner_id == user.id, Job.status == "failed"),
        "storage_bytes": int(my_storage),
        "engines": [{"id": e.id, "name": e.name, "kind": e.kind, "available": e.available, "detail": e.detail} for e in all_engines()],
        "recent": [{"action": a.action, "detail": a.detail, "at": a.created_at} for a in recent],
    }


@router.get("/admin/overview")
def overview(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    c = lambda m, *w: db.scalar(select(func.count()).select_from(m).where(*w)) or 0
    return {"users": c(User), "active_users": c(User, User.active == True), "projects": c(Project), "assets": c(Asset), "jobs": c(Job),  # noqa
            "jobs_failed": c(Job, Job.status == "failed"), "jobs_running": c(Job, Job.status.in_(["queued", "running"])),
            "storage_bytes": dir_size(settings.storage_dir), "disk_free_bytes": shutil.disk_usage(settings.data_dir).free,
            "quota": (db.get(Setting, "quota").value if db.get(Setting, "quota") else {"jobs_per_day": 200}),
            "registration_open": (db.get(Setting, "registration").value.get("open", True) if db.get(Setting, "registration") else settings.allow_registration)}


@router.get("/admin/users")
def users(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    out = []
    for u in db.scalars(select(User).order_by(User.id)):
        out.append({"id": u.id, "email": u.email, "name": u.name, "role": u.role, "active": u.active, "daily_job_quota": u.daily_job_quota, "created_at": u.created_at,
                    "projects": db.scalar(select(func.count()).select_from(Project).where(Project.owner_id == u.id)),
                    "storage_bytes": int(db.scalar(select(func.coalesce(func.sum(Asset.size), 0)).where(Asset.owner_id == u.id)) or 0)})
    return out


@router.patch("/admin/users/{uid}")
def patch_user(uid: int, body: dict, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "not_found")
    if u.id == admin.id and (body.get("active") is False or body.get("role") == "user"):
        raise HTTPException(409, "cannot_demote_or_disable_self")
    if body.get("role") in ("user", "admin"):
        u.role = body["role"]
    if isinstance(body.get("active"), bool):
        u.active = body["active"]
        if not u.active:
            for s in db.scalars(select(AuthSession).where(AuthSession.user_id == u.id)):
                s.revoked = True
    if "daily_job_quota" in body:
        u.daily_job_quota = None if body["daily_job_quota"] in (None, "") else max(0, int(body["daily_job_quota"]))
    log_activity(db, admin.id, "admin_user_update", f"{u.email}: {sorted(body)}")
    db.commit()
    return {"ok": True}


@router.put("/admin/settings")
def put_settings(body: dict, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    if "jobs_per_day" in body:
        db.merge(Setting(key="quota", value={"jobs_per_day": max(0, int(body["jobs_per_day"]))}))
    if "registration_open" in body:
        db.merge(Setting(key="registration", value={"open": bool(body["registration_open"])}))
    log_activity(db, admin.id, "admin_settings", str(body))
    db.commit()
    return {"ok": True}


@router.get("/admin/activity")
def activity(limit: int = 100, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Activity, User.email).outerjoin(User, User.id == Activity.user_id).order_by(Activity.id.desc()).limit(min(limit, 500))).all()
    return [{"id": a.id, "user": e, "action": a.action, "detail": a.detail, "at": a.created_at} for a, e in rows]


@router.post("/admin/backup")
def backup(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """SQLite: consistent online backup + storage files into one zip. PostgreSQL: use pg_dump (docs/BACKUP.md)."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out = settings.backup_dir / f"backup-{stamp}.zip"
    if not settings.database_url.startswith("sqlite"):
        raise HTTPException(501, "Use pg_dump for PostgreSQL backups - see docs/BACKUP.md")
    src_path = settings.database_url.replace("sqlite:///", "")
    tmp_db = settings.backup_dir / f"db-{stamp}.sqlite"
    src, dst = sqlite3.connect(src_path), sqlite3.connect(tmp_db)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(tmp_db, "acs.db")
        for f in settings.storage_dir.rglob("*"):
            if f.is_file():
                z.write(f, f"storage/{f.relative_to(settings.storage_dir)}")
    tmp_db.unlink()
    log_activity(db, admin.id, "backup", out.name)
    db.commit()
    return {"file": out.name, "size": out.stat().st_size}


@router.get("/admin/backups")
def backups(admin: User = Depends(admin_user)):
    return [{"file": f.name, "size": f.stat().st_size} for f in sorted(settings.backup_dir.glob("backup-*.zip"), reverse=True)]
