import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import current_user, log_activity
from ..models import AuthSession, ResetToken, Setting, User
from ..security import RateLimiter, hash_password, make_token, new_reset_token, sha256, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
login_limiter = RateLimiter(8, 300)
reset_limiter = RateLimiter(5, 900)
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Register(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=120)
    lang: str = "ar"


class Login(BaseModel):
    email: str
    password: str


def user_dict(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "lang": u.lang, "theme": u.theme, "created_at": u.created_at}


def issue(db: Session, user: User, request: Request) -> dict:
    tok, jti, exp = make_token(user.id)
    db.add(AuthSession(id=jti, user_id=user.id, user_agent=request.headers.get("user-agent", "")[:250],
                       ip=(request.client.host if request.client else "")[:60], expires_at=exp))
    return {"token": tok, "user": user_dict(user)}


@router.post("/register")
def register(body: Register, request: Request, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(422, "invalid_email")
    count = db.scalar(select(func.count()).select_from(User)) or 0
    reg = db.get(Setting, "registration")
    allowed = settings.allow_registration if not reg else bool(reg.value.get("open", True))
    if count > 0 and not allowed:
        raise HTTPException(403, "registration_closed")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "email_taken")
    u = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password), role="admin" if count == 0 else "user",
             lang=body.lang if body.lang in ("ar", "en") else "ar")
    db.add(u)
    db.flush()
    log_activity(db, u.id, "register", email)
    out = issue(db, u, request)
    db.commit()
    return out


@router.post("/login")
def login(body: Login, request: Request, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    key = f"{email}|{request.client.host if request.client else ''}"
    if not login_limiter.check(key):
        raise HTTPException(429, "too_many_attempts")
    u = db.scalar(select(User).where(User.email == email))
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "invalid_credentials")
    if not u.active:
        raise HTTPException(403, "account_disabled")
    login_limiter.reset(key)
    log_activity(db, u.id, "login")
    out = issue(db, u, request)
    db.commit()
    return out


@router.post("/logout")
def logout(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(AuthSession, request.state.session_id)
    if s:
        s.revoked = True
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_dict(user)


class Profile(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    lang: str | None = None
    theme: str | None = None


@router.patch("/me")
def update_me(body: Profile, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.name is not None:
        user.name = body.name.strip()
    if body.lang in ("ar", "en"):
        user.lang = body.lang
    if body.theme in ("dark", "light"):
        user.theme = body.theme
    db.commit()
    return user_dict(user)


class ChangePw(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/change-password")
def change_password(body: ChangePw, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "wrong_password")
    user.password_hash = hash_password(body.new_password)
    for s in db.scalars(select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.id != request.state.session_id)):
        s.revoked = True  # sign out other devices
    log_activity(db, user.id, "password_changed")
    db.commit()
    return {"ok": True}


@router.get("/sessions")
def sessions(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked == False).order_by(AuthSession.created_at.desc()))  # noqa
    return [{"id": s.id, "user_agent": s.user_agent, "ip": s.ip, "created_at": s.created_at, "current": s.id == request.state.session_id} for s in rows]


@router.delete("/sessions/{sid}")
def revoke(sid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(AuthSession, sid)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "not_found")
    s.revoked = True
    db.commit()
    return {"ok": True}


class Forgot(BaseModel):
    email: str


@router.post("/forgot-password")
def forgot(body: Forgot, request: Request, db: Session = Depends(get_db)):
    if not reset_limiter.check(request.client.host if request.client else "x"):
        raise HTTPException(429, "too_many_attempts")
    u = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    resp = {"ok": True, "message": "If the account exists, a reset link was issued."}
    if u and u.active:
        raw, h = new_reset_token()
        db.add(ResetToken(user_id=u.id, token_hash=h, expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)))
        log_activity(db, u.id, "password_reset_requested")
        db.commit()
        # No SMTP in a self-hosted free setup: the token is only returned when ACS_DEV_RETURN_RESET_TOKEN=true,
        # otherwise the admin must deliver it (see docs/ADMIN_GUIDE.md).
        if settings.dev_return_reset_token:
            resp["dev_token"] = raw
        else:
            print(f"[password-reset] token for {u.email}: {raw}")
    return resp


class Reset(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/reset-password")
def reset(body: Reset, db: Session = Depends(get_db)):
    t = db.scalar(select(ResetToken).where(ResetToken.token_hash == sha256(body.token), ResetToken.used == False))  # noqa
    exp = t.expires_at.replace(tzinfo=timezone.utc) if t and t.expires_at.tzinfo is None else (t.expires_at if t else None)
    if not t or exp < datetime.now(timezone.utc):
        raise HTTPException(400, "invalid_or_expired_token")
    u = db.get(User, t.user_id)
    u.password_hash = hash_password(body.new_password)
    t.used = True
    for s in db.scalars(select(AuthSession).where(AuthSession.user_id == u.id)):
        s.revoked = True
    log_activity(db, u.id, "password_reset")
    db.commit()
    return {"ok": True}
