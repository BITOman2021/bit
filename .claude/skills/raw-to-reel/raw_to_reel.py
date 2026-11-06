#!/usr/bin/env python3
"""
raw_to_reel.py - the four "Raw to Reel" edits with ffmpeg only.

  1. drop bad takes     (needs an SRT: of consecutive near-identical cues, keep the last)
  2. cut silences       (ffmpeg silencedetect, no transcript needed)
  3. burn captions      (needs an SRT; Arabic via libass, Cairo font bundled)
  4. sound effects      (a synthesized whoosh at every cut)

Nothing is uploaded. Needs ffmpeg with libass. Run with -I so the script directory
is not on the import path:

  python3 -I raw_to_reel.py in.mp4 out.mp4 --silence --sfx
  python3 -I raw_to_reel.py in.mp4 out.mp4 --silence --srt in.srt --captions --dedupe-takes --sfx
  python3 -I raw_to_reel.py in.mp4 --analyze          # report only, writes nothing
"""
import argparse, difflib, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, text=True, capture_output=True, **kw)


def duration(path):
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout
    return float(out.strip())


def detect_silences(path, db, min_len):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af",
                        f"silencedetect=noise={db}dB:d={min_len}", "-f", "null", "-"],
                       text=True, capture_output=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    out = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else None
        out.append((s, e))
    return out


def parse_srt(path):
    txt = open(path, encoding="utf-8-sig").read().replace("\r", "")
    cues = []
    for blk in re.split(r"\n\s*\n", txt.strip()):
        lines = blk.split("\n")
        m = None
        for i, l in enumerate(lines):
            m = re.match(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)", l.strip())
            if m:
                g = [int(x) for x in m.groups()]
                a = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
                b = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
                cues.append((a, b, " ".join(x.strip() for x in lines[i + 1:] if x.strip())))
                break
    return cues


def bad_take_ranges(cues, thresh):
    """Of a run of consecutive cues that are near-duplicates, the earlier ones are false starts."""
    cut = []
    for i in range(len(cues) - 1):
        a, b = cues[i], cues[i + 1]
        if not a[2] or not b[2]:
            continue
        if difflib.SequenceMatcher(None, a[2], b[2]).ratio() >= thresh:
            cut.append((a[0], b[0]))          # from start of the false start to start of the retake
    return cut


def subtract(keep, cuts):
    out = []
    for ks, ke in keep:
        pieces = [(ks, ke)]
        for cs, ce in cuts:
            nxt = []
            for ps, pe in pieces:
                if ce <= ps or cs >= pe:
                    nxt.append((ps, pe))
                else:
                    if cs > ps:
                        nxt.append((ps, cs))
                    if ce < pe:
                        nxt.append((ce, pe))
            pieces = nxt
        out += pieces
    return [(s, e) for s, e in out if e - s >= 0.15]


def remap(t, keep):
    acc = 0.0
    for s, e in keep:
        if t < s:
            return acc
        if t <= e:
            return acc + (t - s)
        acc += e - s
    return acc


def ass_time(t):
    h, m = int(t // 3600), int(t % 3600 // 60)
    return f"{h}:{m:02d}:{t % 60:05.2f}"


def write_ass(cues, keep, path, w, h, size):
    hdr = (f"[Script Info]\nScriptType: v4.00+\nPlayResX: {w}\nPlayResY: {h}\nWrapStyle: 0\n\n"
           "[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,"
           "Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,"
           "MarginL,MarginR,MarginV,Encoding\n"
           f"Style: C,Cairo ExtraBold,{size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,"
           f"{max(3, size // 14)},0,2,60,60,{int(h * 0.30)},1\n\n"
           "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n")
    ev = []
    for a, b, text in cues:
        if not any(s <= a < e or s < b <= e for s, e in keep):
            continue
        na, nb = remap(a, keep), remap(b, keep)
        if nb - na < 0.1:
            continue
        pop = r"{\fscx80\fscy80\t(0,120,\fscx100\fscy100)}"      # small pop-in
        ev.append(f"Dialogue: 0,{ass_time(na)},{ass_time(nb)},C,,0,0,0,,{pop}{text}")
    open(path, "w", encoding="utf-8").write(hdr + "\n".join(ev) + "\n")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("inp"); p.add_argument("out", nargs="?")
    p.add_argument("--analyze", action="store_true")
    p.add_argument("--silence", action="store_true", help="cut silences")
    p.add_argument("--db", type=float, default=-35, help="silence threshold dB (default -35)")
    p.add_argument("--min-silence", type=float, default=0.35)
    p.add_argument("--pad", type=float, default=0.08, help="seconds kept around speech")
    p.add_argument("--srt"); p.add_argument("--captions", action="store_true")
    p.add_argument("--dedupe-takes", action="store_true")
    p.add_argument("--take-similarity", type=float, default=0.6)
    p.add_argument("--sfx", action="store_true"); p.add_argument("--sfx-max", type=int, default=12)
    p.add_argument("--vertical", action="store_true", help="scale/crop to 1080x1920")
    p.add_argument("--caption-size", type=int, default=0)
    a = p.parse_args()

    total = duration(a.inp)
    keep = [(0.0, total)]
    sil = detect_silences(a.inp, a.db, a.min_silence)
    if a.silence:
        cuts = []
        for s, e in sil:
            e = total if e is None else e
            cs, ce = s + a.pad, e - a.pad
            if ce - cs > 0.1:
                cuts.append((cs, ce))
        keep = subtract(keep, cuts)
    cues = parse_srt(a.srt) if a.srt else []
    takes = bad_take_ranges(cues, a.take_similarity) if (a.dedupe_takes and cues) else []
    if takes:
        keep = subtract(keep, takes)
    new_len = sum(e - s for s, e in keep)

    print(f"input        {total:.1f}s")
    print(f"silences     {len(sil)} found, {sum((total if e is None else e) - s for s, e in sil):.1f}s total")
    print(f"bad takes    {len(takes)} removed" + (" (needs --srt)" if a.dedupe_takes and not cues else ""))
    print(f"output       {new_len:.1f}s in {len(keep)} segments  (saved {total - new_len:.1f}s)")
    if a.analyze or not a.out:
        return

    tmp = tempfile.mkdtemp(prefix="r2r_")
    probe = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                 "-of", "csv=p=0", a.inp]).stdout.strip().split(",")
    W, H = (1080, 1920) if a.vertical else (int(probe[0]), int(probe[1]))
    parts = []
    for i, (s, e) in enumerate(keep):
        parts.append(f"[0:v]trim={s:.3f}:{e:.3f},setpts=PTS-STARTPTS[v{i}];"
                     f"[0:a]atrim={s:.3f}:{e:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st={max(0, e - s - 0.01):.3f}:d=0.01[a{i}]")
    cat = "".join(f"[v{i}][a{i}]" for i in range(len(keep)))
    parts.append(f"{cat}concat=n={len(keep)}:v=1:a=1[vc][ac]")
    vchain = "[vc]"
    if a.vertical:
        parts.append(f"{vchain}scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}[vs]"); vchain = "[vs]"
    if a.captions and cues:
        ass = os.path.join(tmp, "cap.ass")
        write_ass(cues, keep, ass, W, H, a.caption_size or int(W * 0.075))
        fd = os.path.join(HERE, "fonts").replace(":", r"\:")
        parts.append(f"{vchain}ass={ass}:fontsdir={fd}[vo]"); vchain = "[vo]"
    inputs = ["-i", a.inp]
    alast = "[ac]"
    if a.sfx and len(keep) > 1:
        wh = os.path.join(tmp, "whoosh.wav")
        run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anoisesrc=d=0.28:c=pink:a=0.5",
             "-af", "highpass=f=700,lowpass=f=7000,afade=t=in:d=0.12,afade=t=out:st=0.14:d=0.14,volume=0.5", wh])
        pts, acc = [], 0.0
        for s, e in keep[:-1]:
            acc += e - s; pts.append(acc)
        step = max(1, len(pts) // a.sfx_max)
        pts = pts[::step][:a.sfx_max]
        for n, t in enumerate(pts):
            inputs += ["-i", wh]
            parts.append(f"[{n + 1}:a]adelay={int(max(0, t - 0.12) * 1000)}|{int(max(0, t - 0.12) * 1000)}[s{n}]")
        mix = "[ac]" + "".join(f"[s{n}]" for n in range(len(pts)))
        parts.append(f"{mix}amix=inputs={len(pts) + 1}:normalize=0:duration=first[am]"); alast = "[am]"
    parts.append(f"{alast}loudnorm=I=-16:TP=-1.5:LRA=11[ao]")
    fc = os.path.join(tmp, "fc.txt"); open(fc, "w").write(";\n".join(parts))
    cmd = ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex_script", fc, "-map", vchain, "-map", "[ao]",
           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
           "-movflags", "+faststart", a.out]
    r = subprocess.run(cmd, text=True, capture_output=True)
    if r.returncode:
        sys.exit(r.stderr[-1500:])
    print(f"wrote        {a.out}  ({duration(a.out):.1f}s)")


if __name__ == "__main__":
    main()
