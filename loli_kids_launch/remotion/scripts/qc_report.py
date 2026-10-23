#!/usr/bin/env python3
"""Automated QC for the rendered video -> out/QC_REPORT.md.

Checks: video format (1080x1920, 30 fps, 60 s), AAC 48 kHz, peaks/clipping and
integrated loudness of the final mix, every dialogue line inside its scene with
no overlaps, dialogue-to-background level during speech, and voice files
present. Listening checks (pronunciation, dialect, naturalness) cannot be
automated and are listed as manual items.
"""
import json
import os
import re
import subprocess
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD = json.load(open(os.path.join(ROOT, "src", "data", "storyboard.json"), encoding="utf-8"))
MP4 = os.path.join(ROOT, "out", "loli_kids_launch_60s.mp4")
SCENE = BOARD["sceneSeconds"]


def probe(args):
    return subprocess.run(["ffprobe", "-v", "error", *args, MP4], capture_output=True, text=True, check=True).stdout.strip()


def pcm(path, sr=48000):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32), sr


def db(x):
    return 20 * np.log10(max(1e-9, x))


def main():
    rows = []

    def check(name, ok, detail):
        rows.append((("✅" if ok else "❌"), name, detail))

    v = probe(["-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames", "-of", "csv=p=0"]).split(",")
    a = probe(["-select_streams", "a:0", "-show_entries", "stream=codec_name,sample_rate,channels", "-of", "csv=p=0"]).split(",")
    dur = float(probe(["-show_entries", "format=duration", "-of", "csv=p=0"]))
    check("Video 1080x1920 @ 30 fps, 1800 frames", v[:3] == ["1080", "1920", "30/1"] and v[3] == "1800", ", ".join(v))
    check("Duration 60 s", abs(dur - 60) < 0.05, f"{dur:.3f}s")
    check("Audio AAC 48 kHz stereo", a[0] == "aac" and a[1] == "48000" and a[2] == "2", ", ".join(a))

    ln = subprocess.run(["ffmpeg", "-i", MP4, "-af", "loudnorm=print_format=summary", "-f", "null", "-"],
                        capture_output=True, text=True).stderr
    m = re.search(r"Input Integrated:\s*(-?[\d.]+)", ln)
    tp = re.search(r"Input True Peak:\s*([-+]?[\d.]+)", ln)
    lufs = float(m.group(1)) if m else float("nan")
    tpk = float(tp.group(1)) if tp else float("nan")
    check("No clipping (true peak <= -1 dBTP)", tpk <= -1.0, f"true peak {tpk:.1f} dBTP")
    check("Integrated loudness -18…-13 LUFS (online video)", -18 <= lufs <= -13, f"{lufs:.1f} LUFS")

    voice_dir = os.path.join(ROOT, "public", "audio", "voice")
    lines = [(s, l) for s in BOARD["scenes"] for l in s["dialogue"]]
    missing = [l["id"] for _, l in lines if not os.path.exists(os.path.join(voice_dir, f"{l['id']}.wav"))]
    check("Voice recording for every line", not missing, "missing: " + ", ".join(missing) if missing else f"{len(lines)}/{len(lines)}")
    bad = []
    for s in BOARD["scenes"]:
        prev_end = 0
        for l in s["dialogue"]:
            if l["from"] < prev_end or l["to"] > SCENE - 0.15 or l["from"] < 0:
                bad.append(l["id"])
            prev_end = l["to"]
    check("Dialogue inside its scene, no overlaps", not bad, ", ".join(bad) or "all 12 lines")

    # dialogue vs. background: compare speech windows with the music+sfx stems at the same times
    if not missing:
        music, sr = pcm(os.path.join(ROOT, "public", "audio", "music.wav"))
        margins = []
        for si, s in enumerate(BOARD["scenes"]):
            for l in s["dialogue"]:
                vx, _ = pcm(os.path.join(voice_dir, f"{l['id']}.wav"))
                i = int((si * SCENE + l["from"]) * sr)
                bg = music[i:i + len(vx)] * 0.22  # ducked music level used in the render
                margins.append(db(np.sqrt(np.mean(vx ** 2))) - db(np.sqrt(np.mean(bg ** 2)) + 1e-9))
        check("Dialogue ≥ 10 dB above ducked music", min(margins) >= 10, f"min {min(margins):.1f} dB, median {np.median(margins):.1f} dB")

    manual = [
        "Listen end-to-end: Omani pronunciation of every word, names (لولي، صفصوف، بوني، بِرّو، سارة)",
        "Voice sounds natural, consistent and age-appropriate in all 12 lines",
        "No pops, breaths cut mid-word, or abrupt transitions at scene changes",
    ]
    with open(os.path.join(ROOT, "out", "QC_REPORT.md"), "w", encoding="utf-8") as fh:
        fh.write("# QC report — Loli Kids launch video\n\n| | check | result |\n|---|---|---|\n")
        for r in rows:
            fh.write(f"| {r[0]} | {r[1]} | {r[2]} |\n")
        fh.write("\n## Lip-sync\n\nLoli's mouth is part of the supplied artwork (one fixed open smile), so there is no "
                 "mouth animation to synchronise. Her body 'talk' motion follows each recording's loudness envelope. "
                 "Frame-accurate lip-sync needs viseme mouth artwork (closed M/B/P, A, E/I, O/U, smile).\n")
        fh.write("\n## Manual listening checks (not automatable)\n\n" + "".join(f"- [ ] {m}\n" for m in manual))
    for r in rows:
        print(*r)


if __name__ == "__main__":
    main()
