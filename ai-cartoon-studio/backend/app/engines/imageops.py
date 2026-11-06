"""CPU image operations: upscale, background removal (flat backgrounds), crop/resize/adjust. Real, no GPU."""
from collections import deque
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from .registry import EngineInfo


def upscale(src: Path, dst: Path, factor: int = 2):
    im = Image.open(src).convert("RGBA")
    im = im.resize((im.width * factor, im.height * factor), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    im.save(dst)


def remove_background(src: Path, dst: Path, tolerance: int = 28):
    """Flood-fill from the image border over pixels close to the border colour. Works well for flat/solid backgrounds
    (typical for generated character sheets); it is not a segmentation model."""
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def close(p):
        return sum(abs(p[i] - bg[i]) for i in range(3)) <= tolerance * 3

    seen = bytearray(w * h)
    dq = deque()
    for x in range(w):
        dq.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        dq.extend([(0, y), (w - 1, y)])
    while dq:
        x, y = dq.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
            continue
        seen[y * w + x] = 1
        p = px[x, y]
        if not close(p):
            continue
        px[x, y] = (p[0], p[1], p[2], 0)
        dq.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    a = im.getchannel("A").filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(a)
    im.save(dst)


def edit(src: Path, dst: Path, ops: dict):
    im = Image.open(src).convert("RGBA")
    if ops.get("crop"):
        x, y, w, h = ops["crop"]
        im = im.crop((x, y, x + w, y + h))
    if ops.get("resize"):
        im = im.resize((int(ops["resize"][0]), int(ops["resize"][1])), Image.LANCZOS)
    if ops.get("flip"):
        im = ImageOps.mirror(im)
    if ops.get("rotate"):
        im = im.rotate(float(ops["rotate"]), expand=True)
    rgb, a = im.convert("RGB"), im.getchannel("A")
    for key, cls in (("brightness", ImageEnhance.Brightness), ("contrast", ImageEnhance.Contrast), ("saturation", ImageEnhance.Color)):
        if key in ops:
            rgb = cls(rgb).enhance(float(ops[key]))
    out = rgb.convert("RGBA")
    out.putalpha(a)
    out.save(dst)


def describe() -> list[EngineInfo]:
    return [EngineInfo("imageops", "image_ops", "Pillow image tools (upscale, background removal, edit)", "HPND (Pillow)", "Yes", "CPU only", available=True,
                       detail="Lanczos upscale + sharpen (not AI super-resolution); flood-fill background removal for flat backgrounds")]
