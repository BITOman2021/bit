"""Text-to-speech adapters: Piper (local neural), eSpeak-NG (local, robotic, Arabic supported), edge-tts (free but
online, uses Microsoft's service - not local). All output WAV files; speed/pitch applied through ffmpeg when the
engine has no native control. No voice cloning of real people is implemented (consent policy)."""
import shutil
import subprocess
import tempfile
from pathlib import Path

from ..config import settings
from .registry import EngineInfo, EngineUnavailable

EMOTIONS = {  # emotion preset -> (speed multiplier, pitch semitones)
    "neutral": (1.0, 0), "happy": (1.08, 2), "excited": (1.15, 3), "sad": (0.88, -2), "angry": (1.05, -1), "calm": (0.93, 0),
    "child": (1.05, 4),
}


def _piper_models() -> list[Path]:
    d = settings.piper_models_dir
    return sorted(d.glob("*.onnx")) if d.exists() else []


def _piper_available() -> bool:
    return bool(shutil.which(settings.piper_bin)) and bool(_piper_models())


def _espeak_available() -> bool:
    return bool(shutil.which("espeak-ng") or shutil.which("espeak"))


def _edge_available() -> bool:
    try:
        import edge_tts  # noqa: F401
        return True
    except ImportError:
        return False


def list_voices() -> list[dict]:
    voices = []
    for m in _piper_models():
        voices.append({"engine": "piper", "id": m.stem, "label": m.stem, "lang": m.stem.split("_")[0].split("-")[0]})
    if _espeak_available():
        for lang, label in (("ar", "Arabic (eSpeak)"), ("en-us", "English US (eSpeak)"), ("en-gb", "English UK (eSpeak)")):
            for var, vl in (("m1", "male"), ("f2", "female"), ("m7", "child-like")):
                voices.append({"engine": "espeak", "id": f"{lang}+{var}", "label": f"{label} - {vl}", "lang": lang[:2]})
    if _edge_available():
        for vid, lab, lang in (("ar-OM-AbdullahNeural", "Arabic (Oman) male", "ar"), ("ar-OM-AyshaNeural", "Arabic (Oman) female", "ar"),
                               ("ar-SA-HamedNeural", "Arabic (Saudi) male", "ar"), ("ar-SA-ZariyahNeural", "Arabic (Saudi) female", "ar"),
                               ("en-US-AnaNeural", "English child-like female", "en"), ("en-US-GuyNeural", "English male", "en"),
                               ("en-US-JennyNeural", "English female", "en")):
            voices.append({"engine": "edge", "id": vid, "label": f"{lab} (online)", "lang": lang})
    return voices


def _run(cmd, input_text=None):
    p = subprocess.run(cmd, input=input_text, capture_output=True, text=True, timeout=300)
    if p.returncode != 0:
        raise EngineUnavailable(f"{cmd[0]} failed: {p.stderr[-300:]}")


def _post(src: Path, out: Path, speed: float, pitch: float):
    """Apply speed/pitch with ffmpeg (pitch via asetrate + atempo compensation)."""
    filters = []
    if pitch:
        rate = 2 ** (pitch / 12)
        filters += [f"asetrate=22050*{rate:.5f}", "aresample=22050", f"atempo={1 / rate:.5f}"]
    if abs(speed - 1) > 0.01:
        filters.append(f"atempo={max(0.5, min(2.0, speed)):.4f}")
    if not filters:
        shutil.copyfile(src, out)
        return
    _run([settings.ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-af", ",".join(filters), str(out)])


def synthesize(engine: str, voice: str, text: str, out_wav: Path, speed: float = 1.0, pitch: float = 0.0, emotion: str = "neutral"):
    if not text.strip():
        raise EngineUnavailable("empty text")
    e_speed, e_pitch = EMOTIONS.get(emotion, (1.0, 0))
    speed, pitch = speed * e_speed, pitch + e_pitch
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "raw.wav"
        if engine == "piper":
            model = settings.piper_models_dir / f"{voice}.onnx"
            if not _piper_available() or not model.exists():
                raise EngineUnavailable("Piper binary or voice model not installed (see docs/AI_ENGINES.md)")
            _run([settings.piper_bin, "--model", str(model), "--output_file", str(raw)], input_text=text)
        elif engine == "espeak":
            if not _espeak_available():
                raise EngineUnavailable("espeak-ng is not installed")
            _run([shutil.which("espeak-ng") or "espeak", "-v", voice, "-s", "150", "-w", str(raw), text])
        elif engine == "edge":
            if not _edge_available():
                raise EngineUnavailable("edge-tts is not installed (pip install edge-tts) or no internet access")
            import asyncio
            import edge_tts
            mp3 = Path(td) / "e.mp3"
            try:
                asyncio.run(edge_tts.Communicate(text, voice).save(str(mp3)))
            except Exception as ex:
                raise EngineUnavailable(f"edge-tts failed (internet required): {ex}")
            _run([settings.ffmpeg, "-y", "-loglevel", "error", "-i", str(mp3), str(raw)])
        else:
            raise EngineUnavailable(f"unknown TTS engine '{engine}'")
        if not raw.exists() or raw.stat().st_size < 100:
            raise EngineUnavailable("TTS engine produced no audio")
        _post(raw, out_wav, speed, pitch)


def describe() -> list[EngineInfo]:
    return [
        EngineInfo("piper", "tts", "Piper TTS (local neural)", "MIT (engine); each voice model has its own license - check the .onnx.json card",
                   "Most Piper voices allow commercial use; verify per voice", "CPU only, ~100-500 MB RAM per voice",
                   available=_piper_available(),
                   detail=f"{len(_piper_models())} voice model(s) in {settings.piper_models_dir}" if shutil.which(settings.piper_bin) else "piper binary not found"),
        EngineInfo("espeak", "tts", "eSpeak-NG (local, robotic)", "GPL-3.0", "Output audio is generally usable; GPL applies to the software, not generated speech - verify for your case",
                   "CPU only, a few MB", available=_espeak_available(), detail="installed" if _espeak_available() else "espeak-ng not installed"),
        EngineInfo("edge", "tts", "edge-tts (free, online)", "MIT (wrapper); uses Microsoft's online service", "Subject to Microsoft's terms; not guaranteed - treat as best-effort",
                   "Internet access; no GPU", available=_edge_available(), detail="installed (needs internet)" if _edge_available() else "pip install edge-tts"),
    ]
