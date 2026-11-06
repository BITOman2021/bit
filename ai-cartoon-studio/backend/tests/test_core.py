from .conftest import png_bytes, upload, wait_job


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_auth_flow(client, admin, user):
    h, u = admin
    assert u["role"] == "admin" and user[1]["role"] == "user"
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=h).json()["email"] == "admin@example.com"
    assert client.post("/api/auth/register", json={"email": "admin@example.com", "password": "password123"}).status_code == 409
    assert client.post("/api/auth/register", json={"email": "x@example.com", "password": "short"}).status_code == 422
    assert client.post("/api/auth/login", json={"email": "user@example.com", "password": "wrong-pass"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "user@example.com", "password": "password123"})
    assert r.status_code == 200
    h2 = {"Authorization": f"Bearer {r.json()['token']}"}
    assert any(s["current"] for s in client.get("/api/auth/sessions", headers=h2).json())
    client.post("/api/auth/logout", headers=h2)
    assert client.get("/api/auth/me", headers=h2).status_code == 401  # revoked session


def test_login_rate_limit(client, admin):
    codes = [client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "nope-nope"}).status_code for _ in range(10)]
    assert 429 in codes


def test_password_reset(client, user):
    client.post("/api/auth/register", json={"email": "resetme@example.com", "password": "password123"})
    r = client.post("/api/auth/forgot-password", json={"email": "resetme@example.com"}).json()
    tok = r["dev_token"]
    assert client.post("/api/auth/reset-password", json={"token": "bad", "new_password": "newpassword1"}).status_code == 400
    assert client.post("/api/auth/reset-password", json={"token": tok, "new_password": "newpassword1"}).status_code == 200
    assert client.post("/api/auth/reset-password", json={"token": tok, "new_password": "newpassword2"}).status_code == 400  # single use
    assert client.post("/api/auth/login", json={"email": "resetme@example.com", "password": "newpassword1"}).status_code == 200


def test_project_lifecycle_and_isolation(client, admin, user):
    ha, hu = admin[0], user[0]
    p = client.post("/api/projects", headers=hu, json={"name": "Proj A", "lang": "ar"}).json()
    pid = p["id"]
    r = client.patch(f"/api/projects/{pid}", headers=hu, json={"data": {"script": {"title": "x"}}, "revision_note": "edit"})
    assert r.json()["data"]["script"]["title"] == "x" and "timeline" in r.json()["data"]
    assert client.get(f"/api/projects/{pid}", headers=ha).status_code == 200  # admin can see
    other = client.post("/api/auth/register", json={"email": "third@example.com", "password": "password123"}).json()
    ho = {"Authorization": f"Bearer {other['token']}"}
    assert client.get(f"/api/projects/{pid}", headers=ho).status_code == 404  # other user cannot
    assert client.patch(f"/api/projects/{pid}", headers=ho, json={"name": "hack"}).status_code == 404
    d = client.post(f"/api/projects/{pid}/duplicate", headers=hu).json()
    assert d["id"] != pid and d["data"]["script"]["title"] == "x"
    revs = client.get(f"/api/projects/{pid}/revisions", headers=hu).json()
    assert revs
    client.patch(f"/api/projects/{pid}", headers=hu, json={"data": {"script": {"title": "y"}}})
    assert client.post(f"/api/projects/{pid}/revisions/{revs[0]['id']}/restore", headers=hu).json()["data"]["script"] == {}
    z = client.get(f"/api/projects/{pid}/export", headers=hu)
    assert z.status_code == 200 and z.content[:2] == b"PK"
    assert client.delete(f"/api/projects/{pid}", headers=hu).json()["ok"]


def test_upload_security(client, user):
    h = user[0]
    ok = upload(client, h, png_bytes())
    assert ok.status_code == 200 and ok.json()["meta"]["width"] == 320
    assert upload(client, h, b"<script>alert(1)</script>", "evil.png").status_code == 400  # fake image
    assert upload(client, h, b"MZ....", "evil.exe").status_code == 400
    assert upload(client, h, b"<html>", "x.html").status_code == 400
    assert upload(client, h, b"not audio", "x.wav").status_code == 400
    a = ok.json()
    assert client.get(a["url"]).status_code == 401  # private files need auth
    r = client.get(a["url"], headers=h)
    assert r.status_code == 200 and r.headers["x-content-type-options"] == "nosniff"


def test_character_consistency_rules(client, user):
    h = user[0]
    c = client.post("/api/characters", headers=h, json={"name": "Lulu", "description": "small fox", "outfit": "red hoodie", "colors": "orange"}).json()
    assert "red hoodie" in c["profile"]
    ref = upload(client, h, png_bytes()).json()["id"]
    r = client.post(f"/api/characters/{c['id']}/reference", headers=h, files={"file": ("r.png", png_bytes())}, data={"lock": "false"})
    assert r.status_code == 200
    # appearance change needs explicit confirmation once the character has a reference
    assert client.patch(f"/api/characters/{c['id']}", headers=h, json={"outfit": "blue coat"}).status_code == 409
    ok = client.patch(f"/api/characters/{c['id']}", headers=h, json={"outfit": "blue coat", "confirm_appearance_change": True}).json()
    assert ok["version"] == 2 and ok["history"][0]["before"]["outfit"] == "red hoodie"
    assert client.patch(f"/api/characters/{c['id']}", headers=h, json={"name": "Lulu2"}).json()["version"] == 2  # name is not appearance


def test_image_job_fails_honestly_without_engine(client, user):
    h = user[0]
    j = client.post("/api/jobs", headers=h, json={"kind": "image.generate", "params": {"prompt": "a cat"}}).json()
    done = wait_job(client, h, j["id"])
    assert done["status"] == "failed" and "ComfyUI" in done["error"]  # never a fake success
    assert done["assets"] == []
    assert client.post(f"/api/jobs/{j['id']}/retry", headers=h).status_code == 200


def test_estimate_and_engines(client, user):
    h = user[0]
    e = client.post("/api/estimate", headers=h, json={"kind": "image.generate", "params": {"count": 4, "width": 1024, "height": 1024}}).json()
    assert e["money"] == 0 and e["seconds"] > 0 and e["vram_gb"] >= 8
    eng = {x["id"]: x for x in client.get("/api/engines", headers=h).json()["engines"]}
    assert eng["comfyui-sdxl"]["available"] is False and eng["template"]["available"] is True
    assert eng["comfyui-sdxl"]["license"] and eng["comfyui-sdxl"]["requirements"]


def test_admin_controls(client, admin, user):
    ha, hu = admin[0], user[0]
    assert client.get("/api/admin/users", headers=hu).status_code == 403
    users = client.get("/api/admin/users", headers=ha).json()
    assert len(users) >= 2
    assert client.put("/api/admin/settings", headers=ha, json={"jobs_per_day": 2}).status_code == 200
    # quota enforced for normal users
    statuses = [client.post("/api/jobs", headers=hu, json={"kind": "story.generate", "params": {"idea": "x"}}).status_code for _ in range(4)]
    assert 429 in statuses
    client.put("/api/admin/settings", headers=ha, json={"jobs_per_day": 500})
    b = client.post("/api/admin/backup", headers=ha).json()
    assert b["size"] > 0
    assert client.get("/api/admin/activity", headers=ha).json()
