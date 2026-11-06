"""Rough, clearly-labelled run-time estimates shown before heavy jobs. Local processing has no money cost; the real
cost is time and hardware. Numbers are order-of-magnitude guides (GPU = mid-range 8-12 GB card)."""
from ..config import settings
from ..engines import comfyui


def apply_low_resource(kind: str, p: dict) -> dict:
    if not settings.low_resource and not p.get("low_resource"):
        return p
    p = dict(p)
    if kind == "image.generate":
        p["width"], p["height"] = min(int(p.get("width", 768)), 768), min(int(p.get("height", 768)), 768)
        p["steps"] = min(int(p.get("steps", 20)), 20)
        p["count"] = min(int(p.get("count", 1)), 1)
    if kind in ("video.render", "video.animate", "video.lipsync"):
        p["resolution"] = 720
        p["fps"] = min(int(p.get("fps", 24)), 24)
    return p


def estimate(kind: str, p: dict) -> dict:
    ok, _ = comfyui.health()
    gpu_note = "ComfyUI reachable" if ok else "ComfyUI not reachable - job will fail until an engine is configured"
    if kind == "image.generate":
        n = int(p.get("count", 1)) * max(1, len(p.get("variants") or [1]))
        px = int(p.get("width", 1024)) * int(p.get("height", 1024)) / (1024 * 1024)
        sec = n * (3 + 0.12 * int(p.get("steps", 25)) * px)
        return {"seconds": round(sec), "vram_gb": 8, "ram_gb": 16, "money": 0, "note": f"~{round(sec)}s on a mid-range GPU (CPU-only: 20-60x slower). {gpu_note}"}
    if kind == "video.generate":
        fr = int(p.get("frames", 25))
        return {"seconds": round(60 + fr * 12), "vram_gb": 16, "ram_gb": 32, "money": 0, "note": f"AI video is heavy: ~{round((60 + fr * 12) / 60)} min on a 16+ GB GPU. {gpu_note}"}
    if kind in ("video.render", "video.animate", "video.lipsync"):
        dur = float(p.get("duration") or p.get("estimated_duration") or 30)
        mult = 2.0 if int(p.get("resolution", 720)) >= 1080 else 1.0
        return {"seconds": round(dur * 0.8 * mult + 5), "vram_gb": 0, "ram_gb": 2, "money": 0, "note": "CPU/FFmpeg only; no GPU needed"}
    if kind == "tts.synthesize":
        return {"seconds": max(2, round(len(p.get("text", "")) / 60)), "vram_gb": 0, "ram_gb": 1, "money": 0, "note": "CPU only"}
    if kind == "story.generate":
        return {"seconds": 60 if p.get("engine") == "ollama" else 1, "vram_gb": 0, "ram_gb": 8 if p.get("engine") == "ollama" else 0, "money": 0,
                "note": "Local LLM on CPU can take minutes" if p.get("engine") == "ollama" else "Instant (template scaffold)"}
    return {"seconds": 5, "vram_gb": 0, "ram_gb": 1, "money": 0, "note": ""}
