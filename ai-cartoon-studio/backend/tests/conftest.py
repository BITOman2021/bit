import io
import os
import tempfile

import pytest
from PIL import Image

_tmp = tempfile.mkdtemp(prefix="acs-test-")
os.environ["ACS_DATA_DIR"] = _tmp
os.environ["ACS_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["ACS_WORKERS"] = "2"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def _reg(client, email, name="T"):
    r = client.post("/api/auth/register", json={"email": email, "password": "password123", "name": name})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"Authorization": f"Bearer {d['token']}"}, d["user"]


@pytest.fixture(scope="session")
def admin(client):
    return _reg(client, "admin@example.com", "Admin")  # first user -> admin


@pytest.fixture(scope="session")
def user(client, admin):
    return _reg(client, "user@example.com", "User")


def png_bytes(color=(200, 60, 60), size=(320, 240), box=True):
    im = Image.new("RGB", size, (255, 255, 255))
    if box:
        from PIL import ImageDraw
        ImageDraw.Draw(im).ellipse((size[0] // 4, size[1] // 4, size[0] * 3 // 4, size[1] * 3 // 4), fill=color)
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def upload(client, headers, data, name="a.png", **form):
    r = client.post("/api/assets", headers=headers, files={"file": (name, data)}, data=form)
    return r


def wait_job(client, headers, jid, timeout=60):
    import time
    t = time.time()
    while time.time() - t < timeout:
        j = client.get(f"/api/jobs/{jid}", headers=headers).json()
        if j["status"] in ("done", "failed", "cancelled"):
            return j
        time.sleep(0.3)
    raise AssertionError("job timeout")
