import hashlib
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import settings


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def make_token(user_id: int) -> tuple[str, str, datetime]:
    jti = uuid.uuid4().hex
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.token_ttl_hours)
    tok = jwt.encode({"sub": str(user_id), "jti": jti, "exp": exp}, settings.secret_key, algorithm="HS256")
    return tok, jti, exp


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def new_reset_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


class RateLimiter:
    """Tiny in-memory sliding-window limiter (login brute-force protection)."""

    def __init__(self, limit: int, window: int):
        self.limit, self.window, self.hits = limit, window, {}

    def check(self, key: str) -> bool:
        now = time.time()
        q = [t for t in self.hits.get(key, []) if now - t < self.window]
        if len(q) >= self.limit:
            self.hits[key] = q
            return False
        q.append(now)
        self.hits[key] = q
        return True

    def reset(self, key: str):
        self.hits.pop(key, None)
