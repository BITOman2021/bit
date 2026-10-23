#!/usr/bin/env python3
"""Generate Loli's Omani Gulf Arabic dialogue with ElevenLabs and master it.

Needs (environment):
  ELEVENLABS_API_KEY   API key (never commit it)
  ELEVENLABS_VOICE_ID  the chosen voice (Voice Library voice, designed voice or
                       a consented clone) — find it with `--list-voices`
  ELEVENLABS_MODEL     optional, default "eleven_multilingual_v2"
and network access to api.elevenlabs.io.

Usage:
  python3 scripts/make_voice_elevenlabs.py --list-voices
  python3 scripts/make_voice_elevenlabs.py --design "warm young Omani boy ..."   # saves previews
  python3 scripts/make_voice_elevenlabs.py --design-presets   # the 3 approved descriptions
  python3 scripts/make_voice_elevenlabs.py --create <generated_voice_id> --name "Loli (OM boy)"
  python3 scripts/make_voice_elevenlabs.py                                       # all 12 lines
  python3 scripts/make_voice_elevenlabs.py --from-takes .cache/elevenlabs/takes  # use downloaded takes

Per line: TTS (with previous/next line as context for consistent delivery and a
fixed seed) -> trim silence -> gentle mastering (high-pass, light EQ, de-ess,
2:1 compression, -16 LUFS) -> 48 kHz. Lines are placed back-to-back from each
scene's first cue. No pitch shifting. If a scene does not fit in 10 s a mild
tempo correction (<= MAX_TEMPO, pitch kept) is applied; beyond that the script
stops and reports instead of shortening the approved text.

Writes:
  public/audio/voice/<lineId>.wav        16-bit/48k, used by the Remotion render
  out/dialogue/<lineId>.wav              24-bit/48k line masters
  out/dialogue_master_48k_24bit.wav      full 60 s dialogue stem, 24-bit/48k
and rewrites dialogue from/to in src/data/storyboard.json.
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD_PATH = os.path.join(ROOT, "src", "data", "storyboard.json")
BOARD = json.load(open(BOARD_PATH, encoding="utf-8"))
API = "https://api.elevenlabs.io/v1"
CACHE = os.path.join(ROOT, ".cache", "elevenlabs")
VOICE_OUT = os.path.join(ROOT, "public", "audio", "voice")
MASTER_DIR = os.path.join(ROOT, "out", "dialogue")
SR = 48000
LINE_GAP = 0.25
SCENE_END = 9.7
MAX_TEMPO = 1.08  # mild, pitch-preserving; never used to fake a voice
SEED = 20261023
VOICE_SETTINGS = {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35, "use_speaker_boost": True}
MASTER_CHAIN = (
    "highpass=f=80,"
    "equalizer=f=250:t=q:w=1.2:g=-2,"
    "equalizer=f=3200:t=q:w=1.0:g=1.5,"
    "deesser=i=0.35:m=0.5:f=0.5,"
    "acompressor=threshold=-20dB:ratio=2:attack=8:release=120:makeup=2,"
    "loudnorm=I=-16:TP=-1.5:LRA=7"
)


def key():
    k = os.environ.get("ELEVENLABS_API_KEY")
    if not k:
        sys.exit("ELEVENLABS_API_KEY is not set (add it to the environment's secrets, then start a new session).")
    return k


def call(method, path, body=None, accept="application/json"):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"xi-api-key": key(), "Content-Type": "application/json", "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs {method} {path} -> HTTP {e.code}: {e.read().decode(errors='replace')[:400]}")
    except urllib.error.URLError as e:
        sys.exit(f"Cannot reach api.elevenlabs.io ({e.reason}); allow it in the environment's network settings.")


def ffmpeg(args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def all_lines():
    return [(s, l) for s in BOARD["scenes"] for l in s["dialogue"]]


# ------------------------------------------------------------- voice setup ---
def list_voices():
    data = json.loads(call("GET", "/voices"))
    for v in data.get("voices", []):
        labels = ", ".join(f"{k}={x}" for k, x in (v.get("labels") or {}).items())
        print(f"{v['voice_id']}  {v['name']}  [{labels}]")


def design(description, tag="custom"):
    sample = " ".join(l["text"] for _, l in all_lines()[:3])
    data = json.loads(call("POST", "/text-to-voice/design",
                           {"voice_description": description, "text": sample, "model_id": "eleven_multilingual_ttv_v2"}))
    os.makedirs(os.path.join(ROOT, "out", "voice_previews"), exist_ok=True)
    for i, p in enumerate(data.get("previews", [])):
        path = os.path.join(ROOT, "out", "voice_previews", f"{tag}_{i + 1}_{p['generated_voice_id']}.mp3")
        open(path, "wb").write(base64.b64decode(p["audio_base_64"]))
        print("preview:", path)
    print("Listen, then: --create <generated_voice_id> --name \"Loli\"")


def create(generated_voice_id, name, description):
    data = json.loads(call("POST", "/text-to-voice",
                           {"voice_name": name, "voice_description": description, "generated_voice_id": generated_voice_id}))
    print("ELEVENLABS_VOICE_ID =", data.get("voice_id"))


# --------------------------------------------------------------- dialogue ---
def tts(voice_id, model, line, prev_text, next_text):
    os.makedirs(CACHE, exist_ok=True)
    raw = os.path.join(CACHE, f"{line['id']}.mp3")
    body = {"text": line["text"], "model_id": model, "voice_settings": VOICE_SETTINGS, "seed": SEED}
    if prev_text:
        body["previous_text"] = prev_text
    if next_text:
        body["next_text"] = next_text
    audio = call("POST", f"/text-to-speech/{voice_id}?output_format=mp3_44100_192", body, accept="audio/mpeg")
    open(raw, "wb").write(audio)
    return raw


def master(raw, dst24):
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,"
            "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse")
    ffmpeg(["-i", raw, "-af", f"{trim},{MASTER_CHAIN}", "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s24le", dst24])


def retempo(src, dst, tempo):
    ffmpeg(["-i", src, "-af", f"rubberband=tempo={tempo:.4f}:formant=preserved", "-ar", str(SR), "-c:a", "pcm_s24le", dst])


def build_master_stem(placements, path):
    total = np.zeros(int(len(BOARD["scenes"]) * BOARD["sceneSeconds"] * SR), dtype=np.float32)
    for start, f in placements:
        pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", f, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                             capture_output=True, check=True).stdout
        x = np.frombuffer(pcm, dtype=np.float32)
        i = int(start * SR)
        total[i:i + len(x)] += x[: len(total) - i]
    tmp = path + ".f32"
    total.tofile(tmp)
    ffmpeg(["-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", tmp, "-c:a", "pcm_s24le", path])
    os.remove(tmp)


def generate(takes_dir=None):
    """takes_dir: use already-generated takes (<lineId>.mp3, e.g. downloaded from the
    ElevenLabs connector) instead of calling the API."""
    if not takes_dir:
        key()
        voice_id = os.environ.get("ELEVENLABS_VOICE_ID") or sys.exit("ELEVENLABS_VOICE_ID is not set (see --list-voices / --design).")
        model = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")
    os.makedirs(VOICE_OUT, exist_ok=True)
    os.makedirs(MASTER_DIR, exist_ok=True)
    lines = all_lines()
    placements = []
    problems = []
    for si, scene in enumerate(BOARD["scenes"]):
        masters = []
        for line in scene["dialogue"]:
            k = lines.index((scene, line))
            prev_text = lines[k - 1][1]["text"] if k > 0 else None
            next_text = lines[k + 1][1]["text"] if k + 1 < len(lines) else None
            if takes_dir:
                raw = os.path.join(takes_dir, f"{line['id']}.mp3")
                if not os.path.exists(raw):
                    sys.exit(f"missing take {raw}")
            else:
                raw = tts(voice_id, model, line, prev_text, next_text)
            dst = os.path.join(MASTER_DIR, f"{line['id']}.wav")
            master(raw, dst)
            masters.append(dst)
        start = scene["dialogue"][0]["from"]
        need = sum(duration(m) for m in masters) + LINE_GAP * (len(masters) - 1)
        room = SCENE_END - start
        tempo = 1.0 if need <= room else need / room
        if tempo > MAX_TEMPO:
            problems.append(f"{scene['id']}: needs {need:.2f}s but only {room:.2f}s fit (x{tempo:.2f})")
            tempo = MAX_TEMPO
        t = start
        for line, m in zip(scene["dialogue"], masters):
            if tempo > 1.0:
                retempo(m, m + ".tmp.wav", tempo)
                os.replace(m + ".tmp.wav", m)
            d = duration(m)
            ffmpeg(["-i", m, "-ar", str(SR), "-c:a", "pcm_s16le", os.path.join(VOICE_OUT, f"{line['id']}.wav")])
            line["from"], line["to"] = round(t, 2), round(t + d, 2)
            placements.append((si * BOARD["sceneSeconds"] + t, m))
            print(f"{line['id']}: {line['from']:.2f}-{line['to']:.2f}s ({d:.2f}s{f', tempo x{tempo:.2f}' if tempo > 1 else ''})")
            t += d + LINE_GAP
    with open(BOARD_PATH, "w", encoding="utf-8") as fh:
        json.dump(BOARD, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    build_master_stem(placements, os.path.join(ROOT, "out", "dialogue_master_48k_24bit.wav"))
    print("dialogue master written; storyboard re-timed")
    if problems:
        print("\nTIMING PROBLEMS (text not shortened — decide: allow faster delivery, longer scene, or trim):")
        for p in problems:
            print("  !", p)
        sys.exit(2)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--list-voices", action="store_true")
    ap.add_argument("--design", metavar="DESCRIPTION")
    ap.add_argument("--design-presets", action="store_true", help="design every approved preset in src/data/voice_presets.json")
    ap.add_argument("--create", metavar="GENERATED_VOICE_ID")
    ap.add_argument("--from-takes", metavar="DIR", help="master/time existing <lineId>.mp3 takes instead of calling the API")
    ap.add_argument("--name", default="Loli - Omani boy")
    ap.add_argument("--description", default="Warm, bright young Omani boy, natural Omani Gulf Arabic accent, friendly and expressive cartoon lead")
    a = ap.parse_args()
    if a.list_voices:
        list_voices()
    elif a.design:
        design(a.design)
    elif a.design_presets:
        presets = json.load(open(os.path.join(ROOT, "src", "data", "voice_presets.json"), encoding="utf-8"))["presets"]
        for tag, desc in presets.items():
            print(f"== {tag}: {desc}")
            design(desc, tag)
    elif a.create:
        create(a.create, a.name, a.description)
    else:
        generate(a.from_takes)
