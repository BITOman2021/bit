#!/usr/bin/env python3
"""Render a DXF model space to PNG (white background) for quick preview.

Usage:  python3 preview_png.py drawing.dxf [out.png] [dpi]
"""
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import ezdxf  # noqa: E402
from ezdxf.addons.drawing import Frontend, RenderContext  # noqa: E402
from ezdxf.addons.drawing.config import BackgroundPolicy, Configuration, LineweightPolicy  # noqa: E402
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend  # noqa: E402


def render(dxf_path, png_path=None, dpi=300):
    png_path = png_path or dxf_path.rsplit(".", 1)[0] + ".png"
    doc = ezdxf.readfile(dxf_path)
    fig = plt.figure(figsize=(23.4, 16.5))          # A2 landscape, inches
    ax = fig.add_axes((0, 0, 1, 1))
    cfg = Configuration(background_policy=BackgroundPolicy.WHITE,
                        lineweight_policy=LineweightPolicy.ABSOLUTE,
                        lineweight_scaling=0.6)
    Frontend(RenderContext(doc), MatplotlibBackend(ax), config=cfg).draw_layout(
        doc.modelspace(), finalize=True)
    fig.set_size_inches(23.4, 16.5)
    fig.savefig(png_path, dpi=dpi, facecolor="white")
    plt.close(fig)
    return png_path


if __name__ == "__main__":
    a = sys.argv[1:]
    print(render(a[0], a[1] if len(a) > 1 else None, int(a[2]) if len(a) > 2 else 300))
