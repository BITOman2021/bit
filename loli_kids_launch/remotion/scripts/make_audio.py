#!/usr/bin/env python3
"""Generate the original music bed + SFX stems and the Arabic SRT from
src/data/storyboard.json (the single global timeline).

Outputs:
  public/audio/music.wav  — 60 s cheerful instrumental (C major, 120 bpm) ending
                            with a short musical signature at the final lock-up
  public/audio/sfx.wav    — whooshes, chimes, pops, flutters, hops, water, twinkles
  out/loli_kids_launch_ar.srt

Everything is synthesised here with numpy (no samples, no licences needed).
"""
import json
import os
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD = json.load(open(os.path.join(ROOT, "src", "data", "storyboard.json"), encoding="utf-8"))
SR = 44100
SCENE = BOARD["sceneSeconds"]
DUR = SCENE * len(BOARD["scenes"])
N = DUR * SR
RNG = np.random.default_rng(7)


def start_of(scene_id):
    return [s["id"] for s in BOARD["scenes"]].index(scene_id) * SCENE


def cue(scene_id, name):
    s = next(s for s in BOARD["scenes"] if s["id"] == scene_id)
    return start_of(scene_id) + s["cues"][name]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def tone(freq, dur, decay=6.0, partials=((1, 1.0),), attack=0.004):
    n = int(dur * SR)
    ts = np.arange(n) / SR
    sig = sum(a * np.sin(2 * np.pi * freq * h * ts) for h, a in partials)
    return sig * np.exp(-ts * decay) * np.minimum(1, ts / attack)


def lowpass(x, k):
    return np.convolve(x, np.ones(k) / k, mode="same")


def add(buf, t, sig, gain=1.0):
    i = int(t * SR)
    if i < 0 or i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    buf[i:i + len(sig)] += sig * gain


# ------------------------------------------------------------------- music ---
def make_music():
    m = np.zeros(N)
    beat = 0.5  # 120 bpm -> 20 beats per 10 s scene
    prog = [(60, (0, 4, 7)), (67, (0, 4, 7)), (69, (0, 3, 7)), (65, (0, 4, 7))]  # C G Am F
    arp = [0, 1, 2, 1, 3, 2, 1, 2]
    hook = [7, 9, 7, 4, 2, 4, 7, 12]
    sig_t = cue("s6", "signature")
    bars = int(sig_t / (4 * beat))
    for bar in range(bars):
        t0 = bar * 4 * beat
        root, chord = prog[bar % 4]
        tones = [root + c for c in chord] + [root + 12]
        for c in chord:  # soft pad
            add(m, t0, tone(hz(root + c - 12), 2.0, 1.2, ((1, 1), (2, 0.3)), attack=0.08), 0.05)
        for b, off in ((0, 0), (1.5, 0), (2, 7), (3, 0)):  # bass
            add(m, t0 + b * beat, tone(hz(root - 24 + off), 0.45, 7, ((1, 1), (2, 0.35), (3, 0.12))), 0.2)
        for s in range(8):  # marimba arpeggio / hook every 4th bar
            note = 72 + hook[s] if bar % 4 == 3 else tones[arp[s] % len(tones)] + 12
            add(m, t0 + s * beat / 2, tone(hz(note), 0.5, 9, ((1, 1), (4, 0.25), (10, 0.05))), 0.11)
        if bar % 2 == 0:  # glockenspiel sparkle
            add(m, t0, tone(hz(tones[2] + 24), 1.2, 3.5, ((1, 1), (2.76, 0.3))), 0.05)
        for b in range(4):  # light drums
            tb = t0 + b * beat
            if b in (0, 2):
                n = int(0.25 * SR)
                ts = np.arange(n) / SR
                f = 50 + 90 * np.exp(-ts * 30)
                add(m, tb, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-ts * 14), 0.4)
            else:
                n = int(0.18 * SR)
                nz = RNG.standard_normal(n)
                add(m, tb, (nz - lowpass(nz, 6)) * np.exp(-np.arange(n) / SR * 22), 0.1)
            for h in (0, 0.5):
                n = int(0.05 * SR)
                nz = RNG.standard_normal(n)
                add(m, tb + h * beat, (nz - lowpass(nz, 3)) * np.exp(-np.arange(n) / SR * 80), 0.045)
    ts = np.arange(N) / SR
    m *= np.clip(ts / 0.8, 0, 1)
    # musical signature: "Lo-li Kids!" — rising motif + bright final chord
    for i, note in enumerate((72, 76, 79, 84)):
        add(m, sig_t + 0.1 + i * 0.16, tone(hz(note), 0.6, 5, ((1, 1), (2, 0.3), (4, 0.12))), 0.2)
        add(m, sig_t + 0.1 + i * 0.16, tone(hz(note + 24), 0.5, 6, ((1, 1), (2.76, 0.3))), 0.06)
    for note in (48, 60, 64, 67, 72, 76):
        add(m, sig_t + 0.85, tone(hz(note), 1.6, 2.2, ((1, 1), (2, 0.35), (4, 0.1))), 0.11)
    n = int(0.3 * SR)
    add(m, sig_t + 0.85, np.sin(2 * np.pi * np.cumsum(50 + 100 * np.exp(-np.arange(n) / SR * 25)) / SR) * np.exp(-np.arange(n) / SR * 10), 0.5)
    m *= np.clip((DUR - ts) / 0.4, 0, 1)
    return m


# --------------------------------------------------------------------- sfx ---
def make_sfx():
    s = np.zeros(N)

    def chime(t, base=84, g=0.08):
        for k, d in enumerate((0, 4, 7, 12, 16)):
            add(s, t + k * 0.05, tone(hz(base + d), 0.8, 5, ((1, 1), (2.76, 0.25))), g)

    def shimmer(t, dur=0.9):
        for k in range(14):
            add(s, t + k * dur / 14, tone(hz(84 + (k * 5) % 24), 0.4, 8, ((1, 1), (2.76, 0.2))), 0.035)

    def whoosh(t, dur=0.5, g=0.35):
        n = int(dur * SR)
        nz = RNG.standard_normal(n)
        out = np.zeros(n)
        seg = n // 10
        for j in range(10):
            k = max(1, int(40 - 36 * j / 9))
            out[j * seg:(j + 1) * seg] = lowpass(nz, k)[j * seg:(j + 1) * seg]
        add(s, t, out * np.sin(np.pi * np.arange(n) / n) ** 2, g)

    def pop(t, g=0.3):
        n = int(0.09 * SR)
        ts = np.arange(n) / SR
        f = 900 * np.exp(-ts * 25) + 250
        add(s, t, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-ts * 35), g)

    def boing(t, g=0.25):
        n = int(0.28 * SR)
        ts = np.arange(n) / SR
        f = 260 + 180 * np.sin(ts * 40) * np.exp(-ts * 8) + ts * 400
        add(s, t, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-ts * 9), g)

    def flutter(t, dur=0.9):
        for k in range(int(dur / 0.045)):
            n = int(0.03 * SR)
            nz = RNG.standard_normal(n)
            add(s, t + k * 0.045, lowpass(nz, 8) * np.exp(-np.arange(n) / SR * 90), 0.18)

    def tap(t):
        n = int(0.06 * SR)
        nz = RNG.standard_normal(n)
        add(s, t, lowpass(nz, 20) * np.exp(-np.arange(n) / SR * 70), 0.25)

    def water(t, dur):
        n = int(dur * SR)
        nz = lowpass(RNG.standard_normal(n), 4) - lowpass(RNG.standard_normal(n), 40)
        env = np.minimum(1, np.arange(n) / (0.3 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.3 * SR))
        add(s, t, nz * env, 0.12)
        for k in range(int(dur / 0.13)):
            add(s, t + k * 0.13 + RNG.uniform(0, 0.05), tone(RNG.uniform(900, 1600), 0.08, 40), 0.05)

    def ding(t, note=88, g=0.18):
        add(s, t, tone(hz(note), 1.4, 3, ((1, 1), (2.4, 0.35), (5.4, 0.12))), g)

    # scene hand-offs: whoosh as the bubble iris closes, chime as it opens
    for sc in BOARD["scenes"][1:]:
        st = start_of(sc["id"])
        whoosh(st - 0.4)
        chime(st + 0.05)
    # s1
    shimmer(0.1, 0.9)
    pop(cue("s1", "loliEnter") + 0.05, 0.35)
    chime(cue("s1", "titleIn"), 88, 0.1)
    # s2
    flutter(cue("s2", "safsoof"), 0.9)
    for k in range(3):
        boing(cue("s2", "bony") + k * 0.33)
    whoosh(cue("s2", "birro"), 0.4, 0.25)
    pop(cue("s2", "sarah") + 0.1)
    for name, d in (("safsoof", 0.45), ("bony", 0.85), ("birro", 0.35), ("sarah", 0.3)):
        ding(cue("s2", name) + d, 91, 0.08)
    # s3
    for k in range(3):
        pop(cue("s3", "colors") + k * 0.15)
        pop(cue("s3", "numbers") + k * 0.2)
    for k in range(2):
        pop(cue("s3", "puzzle") + k * 0.25)
    flutter(cue("s3", "animals") + 0.5, 1.0)
    chime(cue("s3", "title"), 86, 0.08)
    # s4
    for k in range(3):
        pop(cue("s4", "title") + k * 0.35, 0.22)
    water(cue("s4", "watering") + 0.7, 4.6 - 0.7 - BOARD["scenes"][3]["cues"]["watering"])
    shimmer(cue("s4", "bloom"), 0.7)
    ding(cue("s4", "bloom") + 0.2, 93, 0.12)
    # s5
    shimmer(cue("s5", "logoIn"), 0.8)
    for k in range(8):
        tap(start_of("s5") + 0.3 + k * (np.pi / 6.5))
    ding(cue("s5", "invite"), 88, 0.2)
    chime(cue("s5", "invite") + 0.1, 91, 0.08)
    # s6
    shimmer(cue("s6", "logoIn"), 1.0)
    return s


def write_wav(path, x, peak=0.89):
    x = np.tanh(x * 1.1) / np.tanh(1.1)
    x = x * (peak / max(1e-9, np.max(np.abs(x))))
    pcm = (x * 32767).astype(np.int16)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(np.stack([pcm, pcm], axis=1).tobytes())


def write_srt(path):
    def ts(x):
        ms = int(round(x * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        i = 0
        for sc in BOARD["scenes"]:
            for line in sc["dialogue"]:
                i += 1
                a = start_of(sc["id"]) + line["from"]
                b = start_of(sc["id"]) + line["to"]
                fh.write(f"{i}\n{ts(a)} --> {ts(b)}\nلولي: {line['text']}\n\n")


if __name__ == "__main__":
    write_wav(os.path.join(ROOT, "public", "audio", "music.wav"), make_music(), 0.8)
    write_wav(os.path.join(ROOT, "public", "audio", "sfx.wav"), make_sfx(), 0.7)
    write_srt(os.path.join(ROOT, "out", "loli_kids_launch_ar.srt"))
    print("audio + srt written")
