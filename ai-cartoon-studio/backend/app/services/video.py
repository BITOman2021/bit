"""FFmpeg based timeline renderer: scenes -> normalised clips -> concat -> (music/sfx mix + burned subtitles)."""
import re
import subprocess
import tempfile
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import settings
from ..engines.registry import EngineUnavailable
from ..models import Asset
from .storage import abs_path, probe

SIZES = {("16:9", 720): (1280, 720), ("16:9", 1080): (1920, 1080), ("9:16", 720): (720, 1280), ("9:16", 1080): (1080, 1920),
         ("1:1", 720): (720, 720), ("1:1", 1080): (1080, 1080)}
MOTIONS = {"zoom_in", "zoom_out", "pan_left", "pan_right", "shake", "static"}
ARABIC_FONT = "Noto Sans Arabic"


def size_for(aspect: str, res: int) -> tuple[int, int]:
    return SIZES.get((aspect, int(res)), SIZES[("16:9", 720)])


def run_ffmpeg(args: list[str], cwd: Path | None = None):
    p = subprocess.run([settings.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", *args], capture_output=True, text=True,
                       cwd=cwd, timeout=3600)
    if p.returncode != 0:
        raise EngineUnavailable(f"ffmpeg failed: {p.stderr[-500:]}")


def _asset(db: Session, owner_id: int, aid) -> Asset | None:
    if not aid:
        return None
    a = db.get(Asset, int(aid))
    if not a or a.owner_id != owner_id:
        raise EngineUnavailable(f"asset {aid} not found")
    return a


def resolve_scenes(db: Session, owner_id: int, timeline: dict) -> list[dict]:
    """Resolve asset paths and effective durations (a scene is at least as long as its dialogue audio)."""
    out = []
    for i, s in enumerate(timeline.get("scenes", [])):
        img = _asset(db, owner_id, s.get("image_asset_id"))
        vid = _asset(db, owner_id, s.get("video_asset_id"))
        aud = _asset(db, owner_id, s.get("audio_asset_id"))
        dur = float(s.get("duration") or 4)
        speed = max(0.25, min(4.0, float(s.get("speed") or 1)))
        if vid and not s.get("duration"):
            dur = (vid.meta.get("duration") or 4) / speed
        if aud and aud.meta.get("duration"):
            dur = max(dur, float(aud.meta["duration"]) + 0.3)
        out.append({**s, "index": i, "image": abs_path(img) if img else None, "video": abs_path(vid) if vid else None,
                    "audio": abs_path(aud) if aud else None, "dur": round(dur, 3), "speed": speed})
    return out


def _ts_srt(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def build_srt(scenes: list[dict], lang: str = "primary") -> str:
    """lang: primary | secondary | both. Timings come from real scene durations."""
    t, n, out = 0.0, 1, []
    for s in scenes:
        a, b = (s.get("subtitle") or "").strip(), (s.get("subtitle2") or "").strip()
        text = {"primary": a, "secondary": b, "both": "\n".join(x for x in (a, b) if x)}[lang]
        if text:
            out.append(f"{n}\n{_ts_srt(t)} --> {_ts_srt(t + s['dur'] - 0.05)}\n{text}\n")
            n += 1
        t += s["dur"]
    return "\n".join(out)


def _ts_ass(t: float) -> str:
    cs = int(round(t * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}"


def build_ass(scenes: list[dict], w: int, h: int, mode: str = "primary") -> str | None:
    size = int(h * 0.06)
    head = (f"[Script Info]\nScriptType: v4.00+\nPlayResX: {w}\nPlayResY: {h}\nWrapStyle: 0\n\n[V4+ Styles]\n"
            "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n"
            f"Style: Sub,{ARABIC_FONT},{size},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,40,40,{int(h * 0.06)},1\n"
            f"Style: Top,{ARABIC_FONT},{int(size * 1.3)},&H0000F0FF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,1,8,40,40,{int(h * 0.05)},1\n"
            f"Style: Mid,{ARABIC_FONT},{int(size * 1.6)},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,1,5,40,40,40,1\n\n"
            "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n")
    ev, t, any_ = [], 0.0, False
    esc = lambda x: x.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", "\\N")
    for s in scenes:
        a, b = (s.get("subtitle") or "").strip(), (s.get("subtitle2") or "").strip()
        text = {"primary": a, "secondary": b, "both": "\n".join(x for x in (a, b) if x)}.get(mode, a)
        if text:
            ev.append(f"Dialogue: 0,{_ts_ass(t)},{_ts_ass(t + s['dur'] - 0.05)},Sub,,0,0,0,,{esc(text)}")
            any_ = True
        for o in s.get("overlays") or []:
            st = {"top": "Top", "center": "Mid"}.get(o.get("position", "bottom"), "Sub")
            o0, o1 = t + float(o.get("start", 0)), t + min(float(o.get("end", s["dur"])), s["dur"])
            if o.get("text") and o1 > o0:
                ev.append(f"Dialogue: 1,{_ts_ass(o0)},{_ts_ass(o1)},{st},,0,0,0,,{esc(o['text'])}")
                any_ = True
        t += s["dur"]
    return head + "\n".join(ev) + "\n" if any_ else None


def _motion_filter(motion: str, w: int, h: int, dur: float, fps: int) -> str:
    n = max(1, int(dur * fps))
    base = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
    if motion == "static" or motion not in MOTIONS:
        return f"{base},fps={fps}"
    pre = f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2}"
    cx, cy = "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    z = {"zoom_in": (f"1+0.25*on/{n}", cx, cy), "zoom_out": (f"1.25-0.25*on/{n}", cx, cy),
         "pan_left": ("1.2", f"(iw-iw/zoom)*(1-on/{n})", cy), "pan_right": ("1.2", f"(iw-iw/zoom)*on/{n}", cy),
         "shake": ("1.08", f"iw/2-(iw/zoom/2)+12*sin(on/2)", f"ih/2-(ih/zoom/2)+9*cos(on/3)")}[motion]
    return f"{pre},zoompan=z='{z[0]}':x='{z[1]}':y='{z[2]}':d={n}:s={w}x{h}:fps={fps}"


def render_scene(sc: dict, out: Path, w: int, h: int, fps: int):
    dur, speed = sc["dur"], sc["speed"]
    args, vf = [], ""
    if sc["video"]:
        args += ["-i", str(sc["video"])]
        vf = f"[0:v]setpts=PTS/{speed},scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,fps={fps},tpad=stop_mode=clone:stop_duration={dur},trim=duration={dur}"
    elif sc["image"]:
        args += ["-i", str(sc["image"])]
        vf = f"[0:v]{_motion_filter(sc.get('motion', 'zoom_in'), w, h, dur, fps)},trim=duration={dur}"
    else:
        args += ["-f", "lavfi", "-i", f"color=c=0x101830:s={w}x{h}:r={fps}:d={dur}"]
        vf = "[0:v]null"
    if sc.get("transition") == "fade":
        d = min(0.4, dur / 4)
        vf += f",fade=t=in:d={d},fade=t=out:st={dur - d}:d={d}"
    vf += ",format=yuv420p[v]"
    vol = float(sc.get("volume", 1))
    if sc["audio"]:
        args += ["-i", str(sc["audio"])]
        af = f"[1:a]aresample=44100,aformat=channel_layouts=stereo,volume={vol},apad,atrim=duration={dur}[a]"
    elif sc["video"]:
        af = f"[0:a]aresample=44100,aformat=channel_layouts=stereo,atempo={speed},apad,atrim=duration={dur}[a]" if _has_audio(sc["video"]) else \
            f"anullsrc=r=44100:cl=stereo,atrim=duration={dur}[a]"
    else:
        af = f"anullsrc=r=44100:cl=stereo,atrim=duration={dur}[a]"
    if sc.get("transition") == "fade":
        d = min(0.4, dur / 4)
        af = af[:-3] + f",afade=t=in:d={d},afade=t=out:st={dur - d}:d={d}[a]"
    run_ffmpeg([*args, "-filter_complex", f"{vf};{af}", "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-r", str(fps), "-c:a", "aac", "-ar", "44100", "-ac", "2", "-t", str(dur), str(out)])


def _has_audio(p: Path) -> bool:
    r = subprocess.run([settings.ffprobe, "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True)
    return "audio" in r.stdout


def render_timeline(db: Session, owner_id: int, timeline: dict, export: dict, out_path: Path, progress=None, cancelled=lambda: False) -> dict:
    scenes = resolve_scenes(db, owner_id, timeline)
    if not scenes:
        raise EngineUnavailable("timeline has no scenes")
    for s in scenes:
        if not (s["image"] or s["video"]) and not s.get("allow_blank"):
            raise EngineUnavailable(f"scene {s['index'] + 1} has no image or video (set allow_blank to render a blank scene)")
    aspect, res, fps = export.get("aspect", "16:9"), int(export.get("resolution", 720)), int(export.get("fps", 24))
    w, h = size_for(aspect, res)
    music = _asset(db, owner_id, (timeline.get("music") or {}).get("asset_id"))
    sfx = [(_asset(db, owner_id, x.get("asset_id")), x) for x in timeline.get("sfx") or []]
    sub_mode = export.get("subtitles", "none")  # none | primary | secondary | both
    total = sum(s["dur"] for s in scenes)
    with tempfile.TemporaryDirectory(dir=settings.data_dir) as td:
        td = Path(td)
        clips = []
        for i, s in enumerate(scenes):
            if cancelled():
                raise EngineUnavailable("cancelled")
            c = td / f"c{i:03}.mp4"
            render_scene(s, c, w, h, fps)
            clips.append(c)
            if progress:
                progress(0.05 + 0.75 * (i + 1) / len(scenes), f"scene {i + 1}/{len(scenes)}")
        (td / "list.txt").write_text("".join(f"file '{c.name}'\n" for c in clips))
        joined = td / "joined.mp4"
        run_ffmpeg(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", str(joined.name)], cwd=td)
        ass = build_ass(scenes, w, h, sub_mode) if sub_mode != "none" else None
        # overlays are always burned in; subtitles only when requested
        if sub_mode == "none":
            ass = build_ass([{**s, "subtitle": "", "subtitle2": ""} for s in scenes], w, h, "primary")
        if not (music or sfx or ass):
            Path(out_path).write_bytes(joined.read_bytes())
        else:
            args, filt, labels = ["-i", "joined.mp4"], [], ["[0:a]"]
            idx = 1
            if music:
                args += ["-stream_loop", "-1", "-i", str(abs_path(music))]
                mv = float((timeline.get("music") or {}).get("volume", 0.25))
                filt.append(f"[{idx}:a]aresample=44100,aformat=channel_layouts=stereo,volume={mv},atrim=duration={total},afade=t=out:st={max(0, total - 2)}:d=2[m]")
                labels.append("[m]")
                idx += 1
            for k, (a, x) in enumerate(sfx):
                args += ["-i", str(abs_path(a))]
                ms = int(float(x.get("at", 0)) * 1000)
                filt.append(f"[{idx}:a]aresample=44100,aformat=channel_layouts=stereo,volume={float(x.get('volume', 0.8))},adelay={ms}|{ms}[s{k}]")
                labels.append(f"[s{k}]")
                idx += 1
            if len(labels) > 1:
                filt.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=first:normalize=0[aout]")
                amap = "[aout]"
            else:
                amap = "0:a"
            if ass:
                (td / "subs.ass").write_text(ass, encoding="utf-8")
                filt.append("[0:v]subtitles=subs.ass[vout]")
                vmap, vcodec = "[vout]", ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
            else:
                vmap, vcodec = "0:v", ["-c:v", "copy"]
            fa = ["-filter_complex", ";".join(filt)] if filt else []
            run_ffmpeg([*args, *fa, "-map", vmap, "-map", amap, *vcodec, "-c:a", "aac", "-ar", "44100", "-t", str(total), "out.mp4"], cwd=td)
            Path(out_path).write_bytes((td / "out.mp4").read_bytes())
    if progress:
        progress(0.97, "finalizing")
    meta = probe(Path(out_path))
    return {"duration": meta.get("duration") or total, "width": w, "height": h, "fps": fps, "srt": {
        k: build_srt(scenes, k) for k in ("primary", "secondary", "both")}, "scenes": [{"title": s.get("title", ""), "dur": s["dur"]} for s in scenes]}
