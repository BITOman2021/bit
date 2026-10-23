#!/usr/bin/env python3
"""Cut the five characters out of the official group art (assets/ref_group.png).

Uses rembg's `isnet-anime` model locally (weights downloaded once from the rembg
GitHub release), then splits the foreground into one transparent PNG per
character with hand-tuned polygons and keeps each character's largest
connected region. Output: remotion/public/characters/<name>.png
"""
import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, "assets", "ref_group.png")
OUT = os.path.join(HERE, "remotion", "public", "characters")
BOX = (0, 40, 1536, 640)  # scene band of the group art (excludes the cards)

# polygons in BOX coordinates (1536 x 600)
# polygons in BOX pixel coordinates (1536 x 600), traced on a gridded preview
POLYS = {
    "safsoof": [(20, 225), (205, 225), (318, 280), (318, 548), (60, 548), (60, 470), (20, 440)],
    "bony": [(215, 75), (500, 75), (500, 262), (548, 350), (548, 560), (320, 560), (318, 280), (205, 225)],
    "loli": [(500, 30), (930, 30), (930, 185), (860, 222), (845, 330), (965, 395), (978, 480), (890, 520),
             (852, 580), (752, 580), (752, 548), (700, 548), (700, 580), (568, 580), (548, 350), (500, 262)],
    "birro": [(930, 90), (1240, 90), (1240, 300), (1175, 345), (1175, 525), (1110, 548), (1110, 556),
              (930, 556), (978, 480), (965, 395), (862, 330), (868, 225), (905, 205), (930, 185)],
    "sarah": [(1250, 150), (1536, 150), (1536, 522), (1180, 522), (1185, 400), (1205, 345), (1250, 300)],
}


def largest_component(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        comp, q = [], deque([(y0, x0)])
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            comp.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(comp) > len(best):
            best = comp
    keep = np.zeros_like(mask, dtype=bool)
    if best:
        ys, xs = zip(*best)
        keep[list(ys), list(xs)] = True
    return keep


def main():
    from rembg import new_session, remove

    os.makedirs(OUT, exist_ok=True)
    band = Image.open(SRC).convert("RGB").crop(BOX)
    fg = remove(band, session=new_session("isnet-anime"))
    alpha = np.array(fg.split()[3])
    for name, poly in POLYS.items():
        pm = Image.new("L", band.size, 0)
        ImageDraw.Draw(pm).polygon(poly, fill=255)
        a = np.where(np.array(pm) > 0, alpha, 0)
        solid = largest_component(a > 140)
        # fill holes (eyes/teeth highlights can be semi-transparent): keep alpha inside component bbox
        a = np.where(solid, 255, 0).astype(np.uint8)
        am = Image.fromarray(a).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(5))
        am = am.filter(ImageFilter.GaussianBlur(1.2))
        rgba = band.convert("RGBA")
        rgba.putalpha(am)
        rgba = rgba.crop(am.getbbox())
        rgba.save(os.path.join(OUT, f"{name}.png"))
        print(name, rgba.size)


if __name__ == "__main__":
    main()
