#!/usr/bin/env python3
"""Synthesize Loli's Arabic dialogue locally and re-time the storyboard to it.

Engine: Piper TTS (`pip install piper-tts`) with the open "ar_JO-kareem-medium"
voice (downloaded once from the sherpa-onnx GitHub release into .cache/). Each
line's fully diacritized `voiceText` from src/data/storyboard.json is used —
the diacritics are what make names such as «لولي كيدز» pronounced correctly.

Per line: every sentence is synthesized separately, silence-trimmed and joined
with short natural gaps. The source voice is an adult male; a cartoon treatment
turns it into Loli (formants x1.30 via asetrate, i.e. child-like vocal tract,
then pitch x1.62 with formants preserved via rubberband: about +13 semitones,
median F0 ~100 Hz -> ~215 Hz) plus compression and loudness
normalisation. Each scene is sped up uniformly (rubberband tempo, pitch kept)
only as much as needed to fit its 10 s, capped at MAX_TEMPO.

Finally the dialogue `from`/`to` times in storyboard.json are rewritten to the
real recording lengths (subtitles, ducking and the SRT follow automatically).
Writes public/audio/voice/<lineId>.wav.
"""
import json
import os
import subprocess
import tarfile
import urllib.request
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD_PATH = os.path.join(ROOT, "src", "data", "storyboard.json")
BOARD = json.load(open(BOARD_PATH, encoding="utf-8"))
OUT = os.path.join(ROOT, "public", "audio", "voice")
CACHE = os.path.join(ROOT, ".cache", "tts")
MODEL_NAME = "vits-piper-ar_JO-kareem-medium"
MODEL_URL = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/{MODEL_NAME}.tar.bz2"

LENGTH_SCALE = 0.9  # Piper speaking rate (lower = faster)
BASE_TEMPO = 1.06  # a touch livelier than the source voice
MAX_TEMPO = 1.22
SENTENCE_GAP = 0.16  # s between sentences inside a line
LINE_GAP = 0.22  # s between lines
SCENE_END = 9.7  # latest end of speech inside a 10 s scene (before the transition)
FORMANT = 1.30
PITCH = 1.62


def model_path():
    onnx = os.path.join(CACHE, MODEL_NAME, "ar_JO-kareem-medium.onnx")
    if not os.path.exists(onnx):
        os.makedirs(CACHE, exist_ok=True)
        tarball = os.path.join(CACHE, MODEL_NAME + ".tar.bz2")
        print("downloading", MODEL_URL)
        urllib.request.urlretrieve(MODEL_URL, tarball)
        with tarfile.open(tarball) as tf:
            tf.extractall(CACHE, filter="data")
    return onnx


def synth_tight(voice, text):
    """Synthesize sentence by sentence, trim silences, join with short gaps."""
    from piper import SynthesisConfig

    cfg = SynthesisConfig(length_scale=LENGTH_SCALE, noise_scale=0.6, noise_w_scale=0.8)
    sr = voice.config.sample_rate
    parts = []
    for chunk in voice.synthesize(text, syn_config=cfg):
        x = chunk.audio_float_array
        idx = np.nonzero(np.abs(x) > 0.025)[0]
        if len(idx):
            parts.append(x[max(0, idx[0] - 200): idx[-1] + 400])
    out = []
    for i, p in enumerate(parts):
        if i:
            out.append(np.zeros(int(SENTENCE_GAP * sr), dtype=np.float32))
        out.append(p)
    return np.concatenate(out), sr


def write_wav(path, x, sr):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def duration(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def cartoonize(src, dst, rate, tempo):
    af = (
        f"asetrate={int(rate * FORMANT)},aresample=44100,atempo={1 / FORMANT:.6f},"
        f"rubberband=pitch={PITCH}:tempo={tempo:.4f}:formant=preserved,"
        "highpass=f=120,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,"
        "loudnorm=I=-16:TP=-1.5:LRA=7,apad=pad_dur=0.05"
    )
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-af", af, "-ac", "1", "-ar", "44100",
                    "-c:a", "pcm_s16le", dst], check=True)


def main():
    from piper import PiperVoice

    voice = PiperVoice.load(model_path())
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    for scene in BOARD["scenes"]:
        lines = scene["dialogue"]
        raw = []
        for line in lines:
            x, sr = synth_tight(voice, line.get("voiceText") or line["text"])
            path = os.path.join(CACHE, f"raw_{line['id']}.wav")
            write_wav(path, x, sr)
            raw.append((path, len(x) / sr, sr))
        start = lines[0]["from"]
        need = sum(d for _, d, _ in raw)
        room = SCENE_END - start - LINE_GAP * (len(lines) - 1)
        tempo = min(MAX_TEMPO, max(BASE_TEMPO, need / room))
        t = start
        for line, (path, _, sr) in zip(lines, raw):
            dst = os.path.join(OUT, f"{line['id']}.wav")
            cartoonize(path, dst, sr, tempo)
            d = duration(dst)
            line["from"] = round(t, 2)
            line["to"] = round(t + d, 2)
            t += d + LINE_GAP
            print(f"{line['id']}: {line['from']:.2f}-{line['to']:.2f}s  ({d:.2f}s, tempo x{tempo:.2f})")
        if t - LINE_GAP > 10.0:
            print(f"! {scene['id']}: dialogue ends at {t - LINE_GAP:.2f}s, past the scene end; shorten a line")
    with open(BOARD_PATH, "w", encoding="utf-8") as fh:
        json.dump(BOARD, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("storyboard dialogue re-timed to the recordings")


if __name__ == "__main__":
    main()
