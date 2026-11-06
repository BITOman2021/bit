from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .db import get_db
from .models import Activity, AuthSession, User
from .security import decode_token


def log_activity(db: Session, user_id: int | None, action: str, detail: str = ""):
    db.add(Activity(user_id=user_id, action=action, detail=detail[:500]))


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else request.query_params.get("token", "")
    if not token:
        raise HTTPException(401, "not_authenticated")
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid_token")
    sess = db.get(AuthSession, payload.get("jti"))
    if not sess or sess.revoked:
        raise HTTPException(401, "session_revoked")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.active:
        raise HTTPException(401, "account_disabled")
    request.state.session_id = sess.id
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "admin_only")
    return user


def owned(db: Session, model, obj_id: int, user: User):
    obj = db.get(model, obj_id)
    if not obj or (getattr(obj, "owner_id") != user.id and user.role != "admin"):
        raise HTTPException(404, "not_found")  # 404 (not 403) so ids of other users' items are not leaked
    return obj
