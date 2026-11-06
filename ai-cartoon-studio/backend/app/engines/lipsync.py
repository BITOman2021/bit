"""Lip-sync / animation adapters.
* `audio_reactive` (built in, CPU): animates a still character image from the audio envelope (talking pulse, bob,
  sway). It does NOT move the mouth shape - it is an honest, lightweight talking animation.
* `wav2lip` / `sadtalker`: adapter slots for true lip-sync models; they need a GPU install and are reported
  unavailable unless the configured command exists."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from ..config import settings
from .registry import EngineInfo, EngineUnavailable


def audio_envelope(audio: Path, fps: int) -> np.ndarray:
    p = subprocess.run([settings.ffmpeg, "-v", "error", "-i", str(audio), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                       capture_output=True, timeout=120)
    if p.returncode != 0:
        raise EngineUnavailable("cannot decode audio")
    samples = np.frombuffer(p.stdout, dtype=np.int16).astype(np.float32) / 32768
    hop = 16000 // fps
    n = max(1, len(samples) // hop)
    env = np.array([np.sqrt(np.mean(samples[i * hop:(i + 1) * hop] ** 2)) if len(samples[i * hop:(i + 1) * hop]) else 0 for i in range(n)])
    if env.max() > 0:
        env = env / env.max()
    k = np.ones(3) / 3
    return np.convolve(env, k, mode="same")


def render_audio_reactive(image: Path, audio: Path, out_mp4: Path, width=1280, height=720, fps=24, style="talk", progress=None):
    env = audio_envelope(audio, fps)
    frames = len(env)
    base = Image.open(image).convert("RGBA")
    scale0 = min(width * 0.8 / base.width, height * 0.85 / base.height)
    bg = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    cmd = [settings.ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{width}x{height}", "-r", str(fps),
           "-i", "-", "-i", str(audio), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-c:a", "aac", "-shortest", str(out_mp4)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for i in range(frames):
            e = float(env[i])
            t = i / fps
            amp = 0.05 if style == "talk" else 0.02
            s = scale0 * (1 + amp * e + 0.01 * np.sin(t * 2.2))
            w, h = max(1, int(base.width * s)), max(1, int(base.height * s))
            sprite = base.resize((w, h), Image.BILINEAR).rotate(np.sin(t * 3.0) * 1.5 * (0.4 + e), expand=True, resample=Image.BILINEAR)
            frame = bg.copy()
            frame.alpha_composite(sprite, ((width - sprite.width) // 2, int((height - sprite.height) // 2 - e * 10)))
            proc.stdin.write(frame.tobytes())
            if progress and i % 12 == 0:
                progress(i / frames)
        proc.stdin.close()
        err = proc.stderr.read().decode()[-300:]
        if proc.wait() != 0:
            raise EngineUnavailable(f"ffmpeg failed: {err}")
    except BrokenPipeError:
        raise EngineUnavailable("ffmpeg closed early: " + proc.stderr.read().decode()[-300:])


def _ext_cmd(env_name: str):
    c = os.environ.get(env_name, "")
    return c if c and shutil.which(c.split()[0]) else ""


def describe() -> list[EngineInfo]:
    return [
        EngineInfo("audio_reactive", "lipsync", "Audio-reactive talking animation (built in)", "MIT (this project)", "Yes", "CPU only", available=True,
                   detail="Animates the whole character from speech energy. Not phoneme-accurate lip-sync."),
        EngineInfo("wav2lip", "lipsync", "Wav2Lip (adapter slot)", "Research/non-commercial for the original weights", "No for original weights - check before use",
                   "NVIDIA GPU, 4+ GB VRAM; separate install", available=bool(_ext_cmd("ACS_WAV2LIP_CMD")),
                   detail="Set ACS_WAV2LIP_CMD to a wrapper script (see docs/AI_ENGINES.md)"),
    ]
