"""YouTube thumbnail renderer (1280x720 JPEG < 2 MB). Uses Pillow + Raqm so Arabic text is shaped and RTL-correct."""
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 720
HAS_ARABIC = re.compile(r"[؀-ۿ]")


def _font_path(bold=True) -> str:
    for q in (f"Noto Sans Arabic:{'bold' if bold else 'regular'}", "Noto Naskh Arabic:bold", "DejaVu Sans:bold"):
        try:
            p = subprocess.run(["fc-match", "-f", "%{file}", q], capture_output=True, text=True, timeout=5).stdout
            if p and Path(p).exists():
                return p
        except Exception:
            pass
    return "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _wrap(draw, text, font, max_w, rtl):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if draw.textlength(t, font=font, direction="rtl" if rtl else None, language="ar" if rtl else None) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render(out: Path, title: str, background: Path | None = None, character: Path | None = None, badge: str = "",
           accent=(255, 214, 0), side: str | None = None):
    rtl = bool(HAS_ARABIC.search(title))
    side = side or ("right" if rtl else "left")
    if background:
        bg = Image.open(background).convert("RGB")
        scale = max(W / bg.width, H / bg.height)
        bg = bg.resize((int(bg.width * scale) + 1, int(bg.height * scale) + 1), Image.LANCZOS)
        bg = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H))
    else:
        bg = Image.new("RGB", (W, H))
        d = ImageDraw.Draw(bg)
        for y in range(H):
            t = y / H
            d.line([(0, y), (W, y)], fill=(int(20 + 40 * t), int(30 + 20 * t), int(90 + 80 * t)))
    # darken the text side for contrast
    shade = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(shade)
    for x in range(W):
        t = (1 - x / (W * 0.65)) if side == "left" else (1 - (W - x) / (W * 0.65))
        sd.line([(x, 0), (x, H)], fill=int(max(0, min(1, t)) * 170))
    bg = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), bg, shade)
    if character:
        ch = Image.open(character).convert("RGBA")
        s = (H * 0.95) / ch.height
        ch = ch.resize((int(ch.width * s), int(ch.height * s)), Image.LANCZOS)
        x = W - ch.width - 20 if side == "left" else 20
        bg.paste(ch, (x, H - ch.height), ch)
    draw = ImageDraw.Draw(bg)
    fp = _font_path()
    box_w = int(W * 0.58)
    x0 = 50 if side == "left" else W - 50 - box_w
    size = 130
    while size > 50:
        font = ImageFont.truetype(fp, size, layout_engine=ImageFont.Layout.RAQM)
        lines = _wrap(draw, title, font, box_w, rtl)
        if len(lines) <= 3 and size * 1.25 * len(lines) <= H * 0.7:
            break
        size -= 6
    y = (H - size * 1.25 * len(lines)) / 2
    for ln in lines:
        kw = dict(font=font, direction="rtl" if rtl else None, language="ar" if rtl else None)
        tw = draw.textlength(ln, **kw)
        x = x0 + (box_w - tw if rtl else 0)
        draw.text((x, y), ln, fill=accent, stroke_width=max(4, size // 14), stroke_fill=(10, 20, 60), **kw)
        y += size * 1.25
    if badge:
        bf = ImageFont.truetype(fp, 44, layout_engine=ImageFont.Layout.RAQM)
        brtl = bool(HAS_ARABIC.search(badge))
        kw = dict(font=bf, direction="rtl" if brtl else None, language="ar" if brtl else None)
        tw = draw.textlength(badge, **kw)
        bx = 40 if side == "left" else W - 40 - tw - 40
        draw.rounded_rectangle((bx, 36, bx + tw + 40, 112), 24, fill=(230, 40, 70))
        draw.text((bx + 20, 44), badge, fill="white", **kw)
    q = 92
    while True:
        bg.save(out, "JPEG", quality=q, optimize=True)
        if out.stat().st_size < 2_000_000 or q <= 50:
            break
        q -= 8
