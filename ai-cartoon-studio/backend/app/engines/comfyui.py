"""ComfyUI adapter (image + video). Talks to a user-run ComfyUI server (local or a GPU server).
Workflows are plain ComfyUI API-format JSON files in `workflows/` containing %PLACEHOLDERS%, so any model or
workflow can be swapped without code changes."""
import json
import random
import time
from pathlib import Path

import httpx

from ..config import settings
from .registry import EngineInfo, EngineUnavailable

PLACEHOLDERS = ("PROMPT", "NEGATIVE", "SEED", "WIDTH", "HEIGHT", "STEPS", "CFG", "CHECKPOINT", "IMAGE", "DENOISE",
                "FRAMES", "FPS")


def _client() -> httpx.Client:
    return httpx.Client(base_url=settings.comfy_url, timeout=30)


def health() -> tuple[bool, str]:
    try:
        with _client() as c:
            r = c.get("/system_stats")
            r.raise_for_status()
            dev = r.json().get("devices", [{}])[0]
            return True, f"ComfyUI online ({dev.get('name', 'device')})"
    except Exception as e:
        return False, f"ComfyUI not reachable at {settings.comfy_url} ({type(e).__name__})"


def workflow_exists(name: str) -> bool:
    return (settings.workflows_dir / f"{name}.json").exists()


def load_workflow(name: str, values: dict) -> dict:
    path = settings.workflows_dir / f"{name}.json"
    if not path.exists():
        raise EngineUnavailable(f"Workflow '{name}.json' not found in {settings.workflows_dir}")
    text = path.read_text()
    wf = json.loads(text)

    def sub(node):
        if isinstance(node, dict):
            return {k: sub(v) for k, v in node.items()}
        if isinstance(node, list):
            return [sub(v) for v in node]
        if isinstance(node, str) and node.startswith("%") and node.endswith("%") and node[1:-1] in PLACEHOLDERS:
            return values[node[1:-1]]
        return node
    return sub(wf)


def upload_image(path: Path) -> str:
    with _client() as c, open(path, "rb") as f:
        r = c.post("/upload/image", files={"image": (path.name, f, "image/png")}, data={"overwrite": "true"})
        r.raise_for_status()
        return r.json()["name"]


def run_workflow(workflow: dict, timeout: int = 900, progress=None, cancelled=lambda: False) -> list[tuple[str, bytes]]:
    ok, detail = health()
    if not ok:
        raise EngineUnavailable(detail)
    with _client() as c:
        r = c.post("/prompt", json={"prompt": workflow})
        if r.status_code != 200:
            raise EngineUnavailable(f"ComfyUI rejected the workflow: {r.text[:400]}")
        pid = r.json()["prompt_id"]
        start = time.time()
        while True:
            if cancelled():
                c.post("/interrupt")
                raise EngineUnavailable("cancelled")
            if time.time() - start > timeout:
                raise EngineUnavailable("ComfyUI timed out")
            h = c.get(f"/history/{pid}").json()
            if pid in h:
                entry = h[pid]
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    msgs = [m for m in status.get("messages", []) if m and m[0] == "execution_error"]
                    raise EngineUnavailable(f"ComfyUI execution error: {str(msgs)[:400]}")
                files = []
                for out in entry.get("outputs", {}).values():
                    for key in ("images", "gifs", "videos"):
                        for item in out.get(key, []):
                            rv = c.get("/view", params={"filename": item["filename"], "subfolder": item.get("subfolder", ""),
                                                          "type": item.get("type", "output")}, timeout=120)
                            rv.raise_for_status()
                            files.append((item["filename"], rv.content))
                if not files:
                    raise EngineUnavailable("ComfyUI finished but produced no output files")
                return files
            if progress:
                progress(min(0.9, 0.1 + (time.time() - start) / max(timeout, 1)))
            time.sleep(1.5)


def base_values(p: dict) -> dict:
    return {"PROMPT": p["prompt"], "NEGATIVE": p.get("negative", ""), "SEED": p.get("seed") or random.randint(1, 2**31),
            "WIDTH": int(p["width"]), "HEIGHT": int(p["height"]), "STEPS": int(p.get("steps", 25)),
            "CFG": float(p.get("cfg", 7.0)), "CHECKPOINT": p.get("checkpoint") or settings.comfy_checkpoint,
            "IMAGE": p.get("image", ""), "DENOISE": float(p.get("denoise", 0.6)),
            "FRAMES": int(p.get("frames", 25)), "FPS": int(p.get("fps", 8))}


def describe() -> list[EngineInfo]:
    ok, detail = health()
    img = EngineInfo("comfyui-sdxl", "image", "ComfyUI + Stable Diffusion XL", "CreativeML OpenRAIL++-M (SDXL base 1.0)",
                     "Yes, subject to the OpenRAIL++ use restrictions; verify the license of any other checkpoint you load",
                     "NVIDIA GPU with >= 8 GB VRAM recommended (6 GB with --lowvram); 16 GB RAM; ~7 GB disk for the checkpoint",
                     available=ok and workflow_exists("txt2img_sdxl"), detail=detail)
    if ok and not workflow_exists("txt2img_sdxl"):
        img.detail = "workflows/txt2img_sdxl.json missing"
    vid_ok = ok and workflow_exists("video_i2v")
    vid = EngineInfo("comfyui-video", "video", "ComfyUI image-to-video (workflow slot)", "Depends on the model you install (e.g. Stable Video Diffusion, Wan 2.x, LTX-Video)",
                     "Check the license of the specific video model before commercial use",
                     ">= 12-24 GB VRAM depending on model; several minutes per few seconds of video",
                     available=vid_ok,
                     detail=detail if vid_ok else ("Add your ComfyUI API workflow as workflows/video_i2v.json (see docs/AI_ENGINES.md)" if ok else detail))
    return [img, vid]
