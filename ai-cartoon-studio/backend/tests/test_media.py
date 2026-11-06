import io
import json
import socket
import threading
import time

import pytest
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import Response

from app.config import settings
from .conftest import png_bytes, upload, wait_job


def probe(client, h, aid):
    return client.get(f"/api/assets/{aid}", headers=h)


@pytest.fixture(scope="module")
def fake_comfy():
    """A minimal ComfyUI protocol double (system_stats / prompt / history / view / upload) to test the real adapter code path."""
    app = FastAPI()
    state = {"prompts": [], "uploads": []}

    @app.get("/system_stats")
    def stats():
        return {"devices": [{"name": "fake-gpu"}]}

    @app.post("/prompt")
    async def prompt(req: Request):
        body = await req.json()
        state["prompts"].append(body["prompt"])
        return {"prompt_id": f"p{len(state['prompts'])}"}

    @app.get("/history/{pid}")
    def history(pid: str):
        return {pid: {"status": {"status_str": "success"}, "outputs": {"9": {"images": [{"filename": f"{pid}.png", "subfolder": "", "type": "output"}]}}}}

    @app.get("/view")
    def view(filename: str, subfolder: str = "", type: str = "output"):
        return Response(png_bytes((30, 120, 220), (512, 512)), media_type="image/png")

    @app.post("/upload/image")
    async def up(req: Request):
        state["uploads"].append(1)
        return {"name": "uploaded.png"}

    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    while not server.started:
        time.sleep(0.05)
    old = settings.comfy_url
    settings.comfy_url = f"http://127.0.0.1:{port}"
    yield state
    settings.comfy_url = old
    server.should_exit = True


def test_image_generation_and_character_sheet_through_comfy_adapter(client, user, fake_comfy):
    h = user[0]
    eng = {e["id"]: e for e in client.get("/api/engines", headers=h).json()["engines"]}
    assert eng["comfyui-sdxl"]["available"]
    c = client.post("/api/characters", headers=h, json={"name": "Bonnie", "description": "brown bunny", "outfit": "yellow dress", "colors": "brown, yellow"}).json()
    j = client.post("/api/jobs", headers=h, json={"kind": "image.generate", "params": {"prompt": "in a garden", "character_ids": [c["id"]], "style": "cartoon_3d",
                                                                                    "aspect": "16:9", "quality": "draft", "lighting": "sunny", "count": 2}}).json()
    done = wait_job(client, h, j["id"])
    assert done["status"] == "done", done["error"]
    assert len(done["assets"]) == 2 and done["assets"][0]["meta"]["width"] % 64 == 0
    sent = fake_comfy["prompts"][-1]
    text = sent["6"]["inputs"]["text"]
    assert "yellow dress" in text and "brown bunny" in text and "in a garden" in text  # character profile is locked into every prompt
    assert sent["5"]["inputs"]["width"] > sent["5"]["inputs"]["height"]  # 16:9
    sheet = client.post(f"/api/characters/{c['id']}/sheet", headers=h, json={"labels": ["pose:front", "expr:happy"]}).json()
    d = wait_job(client, h, sheet["job_id"])
    assert d["status"] == "done", d["error"]
    ch = client.get(f"/api/characters/{c['id']}", headers=h).json()
    assert set(ch["sheet"]) == {"pose:front", "expr:happy"}


def test_img2img_uses_reference(client, user, fake_comfy):
    h = user[0]
    c = client.post("/api/characters", headers=h, json={"name": "Ref", "description": "robot"}).json()
    client.post(f"/api/characters/{c['id']}/reference", headers=h, files={"file": ("r.png", png_bytes())}, data={"lock": "true"})
    j = client.post("/api/jobs", headers=h, json={"kind": "image.generate", "params": {"prompt": "waving", "character_ids": [c["id"]], "use_reference": True, "quality": "draft"}}).json()
    assert wait_job(client, h, j["id"])["status"] == "done"
    assert "LoadImage" in json.dumps(fake_comfy["prompts"][-1]) and fake_comfy["uploads"]
    # locked reference characters cannot be redesigned or have their reference removed
    assert client.patch(f"/api/characters/{c['id']}", headers=h, json={"outfit": "x", "confirm_appearance_change": True}).status_code == 409
    assert client.delete(f"/api/assets/{client.get(f'/api/characters/{c['id']}', headers=h).json()['reference_asset_id']}", headers=h).status_code == 409


def test_tts_espeak_arabic(client, user):
    h = user[0]
    voices = client.get("/api/voices", headers=h).json()["voices"]
    ar = [v for v in voices if v["engine"] == "espeak" and v["lang"] == "ar"]
    if not ar:
        pytest.skip("espeak-ng not installed")
    r = client.post("/api/voices/preview", headers=h, json={"engine": "espeak", "voice": ar[0]["id"], "text": "مرحبا يا أصدقائي", "emotion": "happy"})
    assert r.status_code == 200 and r.content[:4] == b"RIFF"
    j = client.post("/api/jobs", headers=h, json={"kind": "tts.synthesize", "params": {"engine": "espeak", "voice": ar[0]["id"], "text": "مرحبا يا أصدقائي، هيا نلعب", "name": "loli"}}).json()
    d = wait_job(client, h, j["id"])
    assert d["status"] == "done", d["error"]
    assert d["assets"][0]["meta"]["duration"] > 0.5
    bad = client.post("/api/voices/preview", headers=h, json={"engine": "piper", "voice": "nope", "text": "hi"})
    assert bad.status_code == 503  # honest failure when a model is not installed


def test_full_video_pipeline_with_arabic_subtitles(client, user):
    """image -> motion clip, dialogue audio, timeline render with fade, burned Arabic+English subtitles, music bed, SRT, YouTube package."""
    h = user[0]
    voices = [v for v in client.get("/api/voices", headers=h).json()["voices"] if v["engine"] == "espeak" and v["lang"] == "ar"]
    if not voices:
        pytest.skip("espeak-ng not installed")
    p = client.post("/api/projects", headers=h, json={"name": "حلقة تجريبية"}).json()
    imgs = [upload(client, h, png_bytes(c, (640, 360)), f"s{i}.png", project_id=p["id"]).json()["id"] for i, c in enumerate([(220, 60, 60), (60, 160, 60), (60, 60, 220)])]
    tts_job = client.post("/api/jobs", headers=h, json={"kind": "tts.synthesize", "project_id": p["id"],
                                                         "params": {"engine": "espeak", "voice": voices[0]["id"], "text": "مرحبا بكم في حلقتنا الجديدة"}}).json()
    aud = wait_job(client, h, tts_job["id"])["assets"][0]
    # synthetic music bed
    import subprocess, tempfile, pathlib
    td = pathlib.Path(tempfile.mkdtemp())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=3", str(td / "m.mp3")], check=True)
    music = upload(client, h, (td / "m.mp3").read_bytes(), "music.mp3", project_id=p["id"])
    assert music.status_code == 200
    timeline = {"scenes": [
        {"title": "المقدمة", "image_asset_id": imgs[0], "audio_asset_id": aud["id"], "duration": 2, "motion": "zoom_in", "transition": "fade",
         "subtitle": "مرحبا بكم في حلقتنا الجديدة", "subtitle2": "Welcome to our new episode", "overlays": [{"text": "سام كيدز", "start": 0, "end": 1.5, "position": "top"}]},
        {"title": "المشهد الثاني", "image_asset_id": imgs[1], "duration": 2, "motion": "pan_left", "subtitle": "هيا نلعب", "subtitle2": "Let's play"},
        {"title": "الخاتمة", "image_asset_id": imgs[2], "duration": 1.5, "motion": "shake", "transition": "fade", "subtitle": "إلى اللقاء", "subtitle2": "Bye"},
    ], "music": {"asset_id": music.json()["id"], "volume": 0.2}}
    client.patch(f"/api/projects/{p['id']}", headers=h, json={"data": {"timeline": timeline, "export": {"aspect": "9:16", "resolution": 720, "fps": 24, "subtitles": "both"}}})
    j = client.post("/api/jobs", headers=h, json={"kind": "video.render", "project_id": p["id"], "params": {"project_id": p["id"]}}).json()
    d = wait_job(client, h, j["id"], timeout=180)
    assert d["status"] == "done", d["error"]
    v = [a for a in d["assets"] if a["kind"] == "video"][0]
    assert (v["meta"]["width"], v["meta"]["height"]) == (720, 1280)
    assert abs(v["meta"]["duration"] - (max(2, aud["meta"]["duration"] + 0.3) + 2 + 1.5)) < 0.4  # scene 1 stretches to fit its dialogue
    # content check: scene 2 (green) must really be in the output after scene 1 ends
    f = td / "frame.png"
    (td / "out.mp4").write_bytes(client.get(v["url"], headers=h).content)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(max(2, aud["meta"]["duration"] + 0.3) + 0.8), "-i", str(td / "out.mp4"), "-frames:v", "1", str(f)], check=True)
    from PIL import Image
    px = Image.open(f).convert("RGB").getpixel((360, 640))
    assert px[1] > px[0] and px[1] > px[2], px
    srt = client.get(f"/api/projects/{p['id']}/srt?lang=both", headers=h).text
    assert "مرحبا بكم" in srt and "Welcome" in srt and "00:00:00,000 --> " in srt
    # metadata -> thumbnail -> package
    m = client.post("/api/youtube/metadata", headers=h, json={"project_id": p["id"], "language": "ar", "keywords": ["كرتون", "أطفال"]}).json()
    assert m["titles"] and m["engine"] == "template" and "كرتون" in m["tags"]
    t = client.post("/api/youtube/thumbnail", headers=h, json={"title": "مغامرة لولي الجديدة", "background_asset_id": imgs[0], "badge": "سام كيدز", "project_id": p["id"]})
    assert t.status_code == 200 and (t.json()["meta"]["width"], t.json()["meta"]["height"]) == (1280, 720)
    pkg = client.post(f"/api/youtube/package/{p['id']}", headers=h)
    assert pkg.status_code == 200
    import zipfile
    names = zipfile.ZipFile(io.BytesIO(pkg.content)).namelist()
    assert {"video.mp4", "thumbnail.jpg", "subtitles-primary.srt", "description-ar.txt"} <= set(names)
    assert client.get("/api/youtube/status", headers=h).json()["upload_available"] is False


def test_render_rejects_scene_without_media(client, user):
    h = user[0]
    p = client.post("/api/projects", headers=h, json={"name": "empty"}).json()
    client.patch(f"/api/projects/{p['id']}", headers=h, json={"data": {"timeline": {"scenes": [{"title": "x", "duration": 2}]}}})
    j = client.post("/api/jobs", headers=h, json={"kind": "video.render", "project_id": p["id"], "params": {"project_id": p["id"]}}).json()
    d = wait_job(client, h, j["id"])
    assert d["status"] == "failed" and "no image or video" in d["error"]


def test_lipsync_audio_reactive_and_animate(client, user):
    h = user[0]
    voices = [v for v in client.get("/api/voices", headers=h).json()["voices"] if v["engine"] == "espeak"]
    if not voices:
        pytest.skip("espeak-ng not installed")
    img = upload(client, h, png_bytes((240, 180, 40), (400, 400))).json()["id"]
    aud = wait_job(client, h, client.post("/api/jobs", headers=h, json={"kind": "tts.synthesize", "params": {"engine": "espeak", "voice": voices[0]["id"], "text": "hello my friends how are you today"}}).json()["id"])["assets"][0]["id"]
    j = wait_job(client, h, client.post("/api/jobs", headers=h, json={"kind": "video.lipsync", "params": {"image_asset_id": img, "audio_asset_id": aud, "resolution": 720}}).json()["id"], 120)
    assert j["status"] == "done", j["error"]
    assert j["assets"][0]["meta"]["duration"] > 1
    a = wait_job(client, h, client.post("/api/jobs", headers=h, json={"kind": "video.animate", "params": {"asset_id": img, "motion": "pan_right", "duration": 3, "aspect": "1:1"}}).json()["id"], 90)
    assert a["status"] == "done", a["error"]
    w = client.post("/api/jobs", headers=h, json={"kind": "video.lipsync", "params": {"image_asset_id": img, "audio_asset_id": aud, "engine": "wav2lip"}}).json()
    assert wait_job(client, h, w["id"])["status"] == "failed"  # unavailable engines fail honestly


def test_image_tools(client, user):
    h = user[0]
    a = upload(client, h, png_bytes((200, 40, 40), (200, 200))).json()
    up = client.post("/api/image-tools", headers=h, json={"asset_id": a["id"], "op": "upscale", "factor": 2}).json()
    assert up["meta"]["width"] == 400
    nb = client.post("/api/image-tools", headers=h, json={"asset_id": a["id"], "op": "remove_background"}).json()
    from PIL import Image
    im = Image.open(io.BytesIO(client.get(nb["url"], headers=h).content))
    assert im.mode == "RGBA" and im.getpixel((2, 2))[3] == 0 and im.getpixel((100, 100))[3] == 255  # corner transparent, subject kept
    ed = client.post("/api/image-tools", headers=h, json={"asset_id": a["id"], "op": "edit", "ops": {"flip": True, "brightness": 1.2}})
    assert ed.status_code == 200


def test_story_template_and_engine_labels(client, user):
    h = user[0]
    j = wait_job(client, h, client.post("/api/jobs", headers=h, json={"kind": "story.generate", "params": {"idea": "لولي تتعلم ترتيب غرفتها", "scenes": 6, "duration_minutes": 3, "language": "ar", "characters": ["لولي", "بوني"]}}).json()["id"])
    s = j["result"]["story"]
    assert s["engine"] == "template" and len(s["scenes"]) == 6 and abs(sum(x["duration"] for x in s["scenes"]) - 180) < 1 and "notice" in s
    ol = wait_job(client, h, client.post("/api/jobs", headers=h, json={"kind": "story.generate", "params": {"idea": "x", "engine": "ollama"}}).json()["id"])
    assert ol["status"] == "failed" and "Ollama" in ol["error"]


def test_samkidz_workspace(client, user):
    h = user[0]
    ov = client.get("/api/samkidz", headers=h).json()
    assert ov["missing_references"] == ["Loli", "Bonnie", "Bro", "Safsoof", "Sara"]
    raw = png_bytes((250, 200, 50), (300, 300))
    r = client.post("/api/samkidz/characters/import", headers=h, data={"name": "Loli", "description": "reference"}, files={"file": ("loli.png", raw)})
    assert r.status_code == 200 and r.json()["reference_locked"]
    # the reference image is stored byte-for-byte (not redesigned / re-encoded)
    stored = client.get(f"/api/assets/{r.json()['reference_asset_id']}/file", headers=h).content
    assert stored == raw
    assert client.post("/api/samkidz/characters/import", headers=h, data={"name": "Loli"}, files={"file": ("l.png", raw)}).status_code == 409
    assert "Loli" not in client.get("/api/samkidz", headers=h).json()["missing_references"]
    ep = client.post("/api/samkidz/episodes", headers=h, json={"name": "الحلقة 1"}).json()
    assert ep["kind"] == "samkidz_episode" and ep["data"]["number"] == 1
    assert client.patch(f"/api/samkidz/episodes/{ep['id']}/status", headers=h, json={"status": "production"}).json()["status"] == "production"
    assert client.patch(f"/api/samkidz/episodes/{ep['id']}/status", headers=h, json={"status": "bogus"}).status_code == 422
    assert not any(p["kind"] != "general" for p in client.get("/api/projects", headers=h).json())  # episodes not mixed into general projects
