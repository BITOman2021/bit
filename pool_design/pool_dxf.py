#!/usr/bin/env python3
"""
Swimming pool - general arrangement drawing (Plan + Section A-A + Section B-B).

Generates a clean, native AutoCAD DXF (R2010) built from real entities:
closed LWPOLYLINEs, associative-style DIMENSIONs, HATCHes, LEADERs, TEXT.

Drawing conventions
-------------------
* Units: millimetres (INSUNITS = 4), model space drawn 1:1.
* Annotation sized for plotting at 1:50 on an A2 sheet
  (text 2.5 mm -> 125 units, LTSCALE = 50, DIMSCALE = 50).
* Levels in metres, relative to top of coping = +-0.000.
* Plan origin (0,0) = inner face of the shallow-end wall / long wall y=0.
  The pool runs from the shallow end (x = 0) to the deep end (x = L).

Usage:  python3 pool_dxf.py [output.dxf]
"""
import math
import sys

import ezdxf
from ezdxf import units
from ezdxf.enums import TextEntityAlignment as TA
from ezdxf.render.arrows import ARROWS

# ===================================================================
#  DESIGN PARAMETERS (mm) - change here, everything else follows
# ===================================================================
L = 10_000              # inner length, shallow end x=0 -> deep end x=L
W = 5_000               # inner width
T_WALL = 250            # RC wall thickness
T_SLAB = 300            # RC floor slab thickness
T_BLIND = 75            # lean-concrete blinding under the slab
BLIND_EXT = 100         # blinding projection beyond the wall face
COPING_W = 350          # coping width, from pool inner face outwards
COPING_T = 50           # coping thickness
DECK_W = 1_500          # paved deck beyond the coping
DECK_BASE = 150         # compacted granular base under the paving
WL_DROP = 150           # water level below top of coping
D_SHALLOW = 1_200       # water depth at the shallow end
D_DEEP = 2_000          # water depth at the deep end
X_SLOPE_START = 4_000   # end of the shallow flat floor
X_SLOPE_END = 7_000     # start of the deep flat floor
STEP_R = 300            # step riser
STEP_T = 300            # step tread
STEP_N = 3              # treads above the floor
STEP_W = 2_400          # step width, centred on the long axis
SKIMMERS_X = (2_500, 7_500)               # skimmers in wall y = 0
INLETS_X = (1_500, 3_800, 6_100, 8_400)   # return inlets in wall y = W
INLET_LEVEL = -450                        # inlet centre level
DRAIN_X = 8_500                           # main drains (2 No.)
DRAIN_SPACING = 1_200                     # centre-to-centre (>= 1 m)
DRAIN_SIZE = 400                          # square grate
DRAIN_SUMP = 150                          # sump depth into the slab
LIGHTS_Y = (1_250, 3_750)                 # underwater lights, wall x = L
LIGHT_LEVEL = -600
LADDER_X = 9_300                          # ladder centre, wall y = W
LADDER_GAUGE = 500                        # rail centres

SCALE = 50              # plot scale 1:SCALE
TXT = 2.5 * SCALE       # standard text height (2.5 mm on paper)
TXT_S = 1.8 * SCALE     # small text
TXT_T = 5.0 * SCALE     # view titles
SECTION_A_Y = -4_800    # Y of +-0.000 in section A-A
SECTION_B_X = 16_200    # X of the inner face y=0 in section B-B

# ---- derived levels (mm, relative to top of coping) ----
WL = -WL_DROP                       # water level
TOW = -COPING_T                     # top of RC wall (under coping)
FL_S = WL - D_SHALLOW               # shallow floor level
FL_D = WL - D_DEEP                  # deep floor level
XD = COPING_W + DECK_W              # distance inner face -> deck edge
STEP_Y1 = (W - STEP_W) / 2
STEP_Y2 = STEP_Y1 + STEP_W

assert (STEP_N + 1) * STEP_R == D_SHALLOW, "risers must divide the shallow depth"
assert 0 < X_SLOPE_START < X_SLOPE_END < L
assert X_SLOPE_START > STEP_N * STEP_T

# ===================================================================
#  LAYERS  (name, ACI colour, linetype, lineweight 1/100 mm)
# ===================================================================
LAYERS = [
    ("P-SHELL",     7, "Continuous", 50),   # RC shell, cut / visible
    ("P-SHELL-HID", 7, "HIDDEN",     25),   # RC shell, hidden in plan
    ("P-COPING",    3, "Continuous", 25),
    ("P-DECK",      8, "Continuous", 18),
    ("P-STEPS",     5, "Continuous", 25),
    ("P-SLOPE",     1, "HIDDEN",     18),   # floor slope break lines
    ("P-WATER",     4, "DASHED",     18),
    ("P-EQUIP",     6, "Continuous", 25),
    ("P-PIPE",      6, "HIDDEN",     18),
    ("P-BEYOND",    8, "Continuous", 13),   # seen beyond the cut
    ("P-CENTER",    1, "CENTER",     13),
    ("P-HATCH",     8, "Continuous",  9),
    ("P-DIMS",      2, "Continuous", 13),
    ("P-TEXT",      7, "Continuous", 18),
    ("P-SECMARK",   1, "Continuous", 50),
    ("P-FRAME",     7, "Continuous", 50),
]

# ISO linetypes (acadiso.lin values, mm) -> correct with LTSCALE = SCALE
LINETYPES = [
    ("CENTER", "Center ____ _ ____ _ ____", [50.8, 31.75, -6.35, 6.35, -6.35]),
    ("HIDDEN", "Hidden __ __ __ __ __",     [9.525, 6.35, -3.175]),
    ("DASHED", "Dashed __ __ __ __ __",     [19.05, 12.7, -6.35]),
]


# ===================================================================
#  DOCUMENT SETUP
# ===================================================================
def new_document():
    doc = ezdxf.new("R2010", setup=False, units=units.MM)
    doc.header["$MEASUREMENT"] = 1
    doc.header["$LTSCALE"] = SCALE
    doc.header["$PSLTSCALE"] = 1
    doc.header["$LWDISPLAY"] = 1

    for name, desc, pattern in LINETYPES:
        doc.linetypes.add(name, pattern=pattern, description=desc)
    for name, color, ltype, lw in LAYERS:
        doc.layers.add(name, color=color, linetype=ltype, lineweight=lw)

    doc.styles.add("POOL-TXT", font="arial.ttf")

    ds = doc.dimstyles.add("POOL50", dxfattribs={
        "dimscale": SCALE,
        "dimtxt": 2.5, "dimasz": 2.0, "dimexo": 1.5, "dimexe": 1.5,
        "dimgap": 0.8, "dimdli": 7.0,
        "dimtad": 1, "dimtih": 0, "dimtoh": 0,   # text above, aligned
        "dimdec": 0, "dimlunit": 2, "dimzin": 8,
        "dimtxsty": "POOL-TXT",
        "dimclrd": 256, "dimclre": 256, "dimclrt": 256,  # ByLayer
    })
    ds.set_arrows(blk=ARROWS.architectural_tick, ldrblk=ARROWS.closed_filled)
    return doc


# ===================================================================
#  DRAWING HELPERS
# ===================================================================
class Pen:
    """Thin wrapper that draws into model space with an X/Y offset."""

    def __init__(self, msp, ox=0.0, oy=0.0):
        self.msp, self.ox, self.oy = msp, ox, oy

    def p(self, x, y):
        return (self.ox + x, self.oy + y)

    def line(self, a, b, layer):
        return self.msp.add_line(self.p(*a), self.p(*b), dxfattribs={"layer": layer})

    def pline(self, pts, layer, closed=False, width=None):
        attribs = {"layer": layer}
        if width:
            attribs["const_width"] = width
        return self.msp.add_lwpolyline([self.p(*q) for q in pts], close=closed,
                                       dxfattribs=attribs)

    def rect(self, x1, y1, x2, y2, layer):
        return self.pline([(x1, y1), (x2, y1), (x2, y2), (x1, y2)], layer, closed=True)

    def circle(self, c, r, layer):
        return self.msp.add_circle(self.p(*c), r, dxfattribs={"layer": layer})

    def hatch(self, pts, pattern, scale, angle=0.0, layer="P-HATCH"):
        h = self.msp.add_hatch(dxfattribs={"layer": layer})
        h.set_pattern_fill(pattern, scale=scale, angle=angle)
        h.paths.add_polyline_path([self.p(*q) for q in pts], is_closed=True)
        return h

    def solid_fill(self, pts, layer):
        h = self.msp.add_hatch(dxfattribs={"layer": layer})
        h.set_solid_fill(color=256)
        h.paths.add_polyline_path([self.p(*q) for q in pts], is_closed=True)
        return h

    def text(self, s, at, h=TXT, align=TA.LEFT, rot=0.0, layer="P-TEXT"):
        t = self.msp.add_text(s, height=h, rotation=rot,
                              dxfattribs={"layer": layer, "style": "POOL-TXT"})
        t.set_placement(self.p(*at), align=align)
        return t

    def dim_h(self, x1, x2, y_pts, y_base):
        self.msp.add_linear_dim(base=self.p(x1, y_base), p1=self.p(x1, y_pts),
                                p2=self.p(x2, y_pts), angle=0, dimstyle="POOL50",
                                dxfattribs={"layer": "P-DIMS"}).render()

    def dim_v(self, y1, y2, x_pts, x_base):
        self.msp.add_linear_dim(base=self.p(x_base, y1), p1=self.p(x_pts, y1),
                                p2=self.p(x_pts, y2), angle=90, dimstyle="POOL50",
                                dxfattribs={"layer": "P-DIMS"}).render()

    def chain_h(self, xs, y_pts, y_base):
        for a, b in zip(xs, xs[1:]):
            self.dim_h(a, b, y_pts, y_base)

    def chain_v(self, ys, x_pts, x_base):
        for a, b in zip(ys, ys[1:]):
            self.dim_v(a, b, x_pts, x_base)

    def note(self, tip, knee, s, h=TXT):
        """LEADER with arrow at `tip`, text placed beyond `knee`."""
        side = 1 if knee[0] >= tip[0] else -1
        land = (knee[0] + side * 150, knee[1])
        self.msp.add_leader([self.p(*tip), self.p(*knee), self.p(*land)],
                            dimstyle="POOL50", dxfattribs={"layer": "P-TEXT"})
        self.text(s, (land[0] + side * 60, land[1]), h=h,
                  align=TA.MIDDLE_LEFT if side > 0 else TA.MIDDLE_RIGHT)

    def level(self, x, y, s, side=1):
        """Level marker: filled triangle with its apex on the level line."""
        a = 0.6 * TXT
        self.solid_fill([(x, y), (x - a, y + 1.6 * a), (x + a, y + 1.6 * a)], "P-TEXT")
        top = y + 1.6 * a
        end = x + side * 7.5 * TXT
        self.line((x, top), (end, top), "P-TEXT")
        self.text(s, (x + side * 0.8 * a, top + 0.4 * TXT), h=TXT,
                  align=TA.BOTTOM_LEFT if side > 0 else TA.BOTTOM_RIGHT)

    def arrow(self, a, b, layer="P-TEXT"):
        """Simple leader arrow pointing from a to b (arrowhead at b)."""
        self.msp.add_leader([self.p(*b), self.p(*a)], dimstyle="POOL50",
                            dxfattribs={"layer": layer})

    def view_title(self, s, x, y):
        t = self.text(s, (x, y), h=TXT_T, align=TA.BOTTOM_CENTER)
        w = len(s) * TXT_T * 0.62
        self.pline([(x - w / 2, y - 120), (x + w / 2, y - 120)], "P-TEXT", width=40)
        self.line((x - w / 2, y - 240), (x + w / 2, y - 240), "P-TEXT")
        return t


def floor_level(x):
    """Finished floor level at distance x from the shallow-end wall."""
    if x <= X_SLOPE_START:
        return FL_S
    if x >= X_SLOPE_END:
        return FL_D
    k = (x - X_SLOPE_START) / (X_SLOPE_END - X_SLOPE_START)
    return FL_S + k * (FL_D - FL_S)


def water_volume_m3():
    profile = ((X_SLOPE_START * D_SHALLOW)
               + (X_SLOPE_END - X_SLOPE_START) * (D_SHALLOW + D_DEEP) / 2
               + (L - X_SLOPE_END) * D_DEEP)
    steps = sum(i * STEP_R * STEP_T for i in range(1, STEP_N + 1))
    return (profile * W - steps * STEP_W) / 1e9


# ===================================================================
#  PLAN
# ===================================================================
def draw_plan(msp):
    pen = Pen(msp)

    # --- shell ---
    pen.rect(0, 0, L, W, "P-SHELL")                                   # inner face
    pen.rect(-T_WALL, -T_WALL, L + T_WALL, W + T_WALL, "P-SHELL-HID")  # outer face

    # --- coping with mitred corners ---
    pen.rect(-COPING_W, -COPING_W, L + COPING_W, W + COPING_W, "P-COPING")
    for (xi, yi), (xo, yo) in (((0, 0), (-COPING_W, -COPING_W)),
                               ((L, 0), (L + COPING_W, -COPING_W)),
                               ((L, W), (L + COPING_W, W + COPING_W)),
                               ((0, W), (-COPING_W, W + COPING_W))):
        pen.line((xi, yi), (xo, yo), "P-COPING")

    # --- deck ---
    pen.rect(-XD, -XD, L + XD, W + XD, "P-DECK")

    # --- steps (shallow end) ---
    depth = STEP_N * STEP_T
    pen.rect(0, STEP_Y1, depth, STEP_Y2, "P-STEPS")
    for i in range(1, STEP_N):
        pen.line((i * STEP_T, STEP_Y1), (i * STEP_T, STEP_Y2), "P-STEPS")
    y_up = STEP_Y1 + 300
    pen.arrow((depth + 600, y_up), (depth + 80, y_up))
    pen.text("UP", (depth + 650, y_up), align=TA.MIDDLE_LEFT)

    # --- floor slope ---
    for x in (X_SLOPE_START, X_SLOPE_END):
        pen.line((x, 0), (x, W), "P-SLOPE")
    ratio = (X_SLOPE_END - X_SLOPE_START) / (D_DEEP - D_SHALLOW)
    ya = W / 2 + 700
    pen.arrow((X_SLOPE_START + 400, ya), (X_SLOPE_END - 400, ya))
    pen.text(f"FALL 1:{ratio:.2f}", ((X_SLOPE_START + X_SLOPE_END) / 2, ya + 120),
             align=TA.BOTTOM_CENTER)

    # --- zone labels ---
    pen.text("SHALLOW END", (2_500, W / 2 - 150), align=TA.BOTTOM_CENTER)
    pen.text(f"W.D. {D_SHALLOW / 1000:.2f} m", (2_500, W / 2 - 300), align=TA.TOP_CENTER)
    pen.text("DEEP END", (DRAIN_X, 4_000), align=TA.BOTTOM_CENTER)
    pen.text(f"W.D. {D_DEEP / 1000:.2f} m", (DRAIN_X, 3_850), align=TA.TOP_CENTER)

    # --- depth markings on the coping ---
    cy_lo, cy_hi = -COPING_W / 2, W + COPING_W / 2
    for x, d in ((800, D_SHALLOW), (L - 700, D_DEEP)):
        pen.text(f"{d / 1000:.1f} m", (x, cy_lo), h=TXT_S, align=TA.MIDDLE_CENTER)
    pen.text(f"{D_SHALLOW / 1000:.1f} m", (800, cy_hi), h=TXT_S, align=TA.MIDDLE_CENTER)
    pen.text(f"{D_DEEP / 1000:.1f} m", (LADDER_X - 900, cy_hi), h=TXT_S,
             align=TA.MIDDLE_CENTER)
    pen.text(f"{D_SHALLOW / 1000:.1f} m", (-COPING_W / 2, W / 2), h=TXT_S,
             align=TA.MIDDLE_CENTER, rot=90)
    pen.text(f"{D_DEEP / 1000:.1f} m", (L + COPING_W / 2, W / 2), h=TXT_S,
             align=TA.MIDDLE_CENTER, rot=90)

    # --- skimmers (wall y=0) ---
    for c in SKIMMERS_X:
        pen.rect(c - 200, -750, c + 200, 0, "P-EQUIP")
        pen.circle((c, -550), 150, "P-EQUIP")
    pen.note((SKIMMERS_X[0] + 150, -550), (SKIMMERS_X[0] + 900, -1_250),
             f"SKIMMER ({len(SKIMMERS_X)} No.)")

    # --- return inlets (wall y=W) ---
    for x in INLETS_X:
        pen.circle((x, W - 60), 50, "P-EQUIP")
    pen.note((INLETS_X[0], W - 10), (INLETS_X[0] + 700, W + XD - 500),
             f"RETURN INLET ({len(INLETS_X)} No.) @ {INLET_LEVEL / 1000:+.3f}")

    # --- main drains + suction pipe ---
    ys = (W / 2 - DRAIN_SPACING / 2, W / 2 + DRAIN_SPACING / 2)
    s = DRAIN_SIZE / 2
    for y in ys:
        pen.rect(DRAIN_X - s, y - s, DRAIN_X + s, y + s, "P-EQUIP")
        for k in (-s / 2, 0, s / 2):            # grate bars
            pen.line((DRAIN_X + k, y - s), (DRAIN_X + k, y + s), "P-EQUIP")
    pen.pline([(DRAIN_X, ys[0] + s), (DRAIN_X, ys[1] - s)], "P-PIPE")
    pen.pline([(DRAIN_X, W / 2), (DRAIN_X + 500, 2_000), (L + XD, 2_000)], "P-PIPE")
    pen.text("TO PLANT ROOM", (L + XD + 80, 2_000), h=TXT_S, align=TA.MIDDLE_LEFT)
    pen.note((DRAIN_X - s, ys[1]), (DRAIN_X - 1_300, ys[1] + 900),
             "MAIN DRAIN 2 No. (ANTI-VORTEX)")

    # --- underwater lights (wall x=L) ---
    for y in LIGHTS_Y:
        pen.rect(L - 80, y - 150, L, y + 150, "P-EQUIP")
        pen.circle((L - 200, y), 100, "P-EQUIP")
        d = 100 * math.sqrt(0.5)
        pen.line((L - 200 - d, y - d), (L - 200 + d, y + d), "P-EQUIP")
        pen.line((L - 200 - d, y + d), (L - 200 + d, y - d), "P-EQUIP")
    pen.note((L - 200, LIGHTS_Y[0] - 100), (L - 1_000, 500),
             f"U/W LIGHT ({len(LIGHTS_Y)} No.)")

    # --- ladder (wall y=W) ---
    for x in (LADDER_X - LADDER_GAUGE / 2, LADDER_X + LADDER_GAUGE / 2):
        pen.line((x, W - 200), (x, W + COPING_W + 250), "P-EQUIP")
        pen.circle((x, W + COPING_W + 250), 40, "P-EQUIP")
    for y in (W - 80, W - 200):
        pen.line((LADDER_X - LADDER_GAUGE / 2, y), (LADDER_X + LADDER_GAUGE / 2, y),
                 "P-EQUIP")
    pen.note((LADDER_X + LADDER_GAUGE / 2, W + COPING_W + 250),
             (LADDER_X + 900, W + COPING_W + 900), "S.S. LADDER")

    # --- centre lines ---
    pen.line((-XD - 300, W / 2), (L + XD + 300, W / 2), "P-CENTER")
    pen.line((L / 2, -XD - 300), (L / 2, W + XD + 300), "P-CENTER")
    pen.text("CL", (L / 2, W + XD + 350), h=TXT_S, align=TA.BOTTOM_CENTER)

    # --- section marks ---
    section_mark(pen, "A", (-XD - 1_300, W / 2), (-XD - 1_900, W / 2), (0, 1))
    section_mark(pen, "A", (L + XD + 1_300, W / 2), (L + XD + 1_900, W / 2), (0, 1))
    xb = DRAIN_X
    section_mark(pen, "B", (xb, -XD - 150), (xb, -XD - 750), (-1, 0))
    section_mark(pen, "B", (xb, W + XD + 1_450), (xb, W + XD + 2_050), (-1, 0))

    # --- dimensions ---
    top = W + XD
    pen.chain_h([-XD, -COPING_W, 0, X_SLOPE_START, X_SLOPE_END, L, L + COPING_W, L + XD],
                top, top + 450)
    pen.dim_h(-XD, L + XD, top, top + 950)
    pen.chain_v([-XD, -COPING_W, 0, STEP_Y1, STEP_Y2, W, W + COPING_W, W + XD],
                -XD, -XD - 450)
    pen.dim_v(-XD, W + XD, -XD, -XD - 950)
    pen.dim_h(0, STEP_N * STEP_T, STEP_Y1, STEP_Y1 - 350)

    pen.view_title(f"PLAN  1:{SCALE}", L / 2, -XD - 1_650)


def section_mark(pen, letter, a, b, look):
    """Cut-line end: thick bar a-b, arrow showing the view direction, tag."""
    pen.pline([a, b], "P-SECMARK", width=60)
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    tip = (mx + look[0] * 550, my + look[1] * 550)
    pen.arrow((mx, my), tip, "P-SECMARK")
    pen.text(letter, (tip[0] + look[0] * 120, tip[1] + look[1] * 120),
             h=TXT_T, align=TA.BOTTOM_CENTER if look[1] > 0 else TA.MIDDLE_RIGHT,
             layer="P-SECMARK")


# ===================================================================
#  SECTIONS
# ===================================================================
def draw_section(pen, span, floor_top, floor_bot):
    """
    Common section body. Horizontal axis u: 0 = inner face of the left wall,
    span = inner face of the right wall. Vertical axis = level (mm).
    floor_top / floor_bot: [(u, level), ...] from u=0 to u=span.
    """
    b_first, b_last = floor_bot[0][1], floor_bot[-1][1]

    # RC shell (walls + slab) as one closed outline
    shell = ([(-T_WALL, TOW), (0, TOW)] + floor_top
             + [(span, TOW), (span + T_WALL, TOW), (span + T_WALL, b_last)]
             + floor_bot[::-1] + [(-T_WALL, b_first)])
    pen.pline(shell, "P-SHELL", closed=True)
    pen.hatch(shell, "ANSI31", scale=SCALE * 0.6)
    pen.hatch(shell, "AR-CONC", scale=SCALE * 0.03)

    # blinding
    blind_top = ([(-T_WALL - BLIND_EXT, b_first)] + floor_bot
                 + [(span + T_WALL + BLIND_EXT, b_last)])
    blind = blind_top + [(u, z - T_BLIND) for u, z in blind_top[::-1]]
    pen.pline(blind, "P-SHELL", closed=True)
    pen.hatch(blind, "AR-SAND", scale=SCALE * 0.02)

    # coping, paving, base course, backfill - both sides
    for sgn, face in ((-1, 0), (1, span)):
        def u(d):           # distance d outward from the inner face
            return face + sgn * d
        cop = [(u(0), 0), (u(COPING_W), 0), (u(COPING_W), -COPING_T), (u(0), -COPING_T)]
        pen.pline(cop, "P-COPING", closed=True)
        pav = [(u(COPING_W), 0), (u(XD), 0), (u(XD), -COPING_T), (u(COPING_W), -COPING_T)]
        pen.pline(pav, "P-DECK", closed=True)
        base = [(u(T_WALL), -COPING_T), (u(XD), -COPING_T),
                (u(XD), -COPING_T - DECK_BASE), (u(T_WALL), -COPING_T - DECK_BASE)]
        pen.pline(base, "P-DECK", closed=True)
        pen.hatch(base, "GRAVEL", scale=SCALE * 0.05)
        b = b_first if sgn < 0 else b_last
        earth = [(u(T_WALL), -COPING_T - DECK_BASE), (u(XD), -COPING_T - DECK_BASE),
                 (u(XD), b - T_BLIND), (u(T_WALL + BLIND_EXT), b - T_BLIND),
                 (u(T_WALL + BLIND_EXT), b), (u(T_WALL), b)]
        pen.hatch(earth, "EARTH", scale=SCALE * 0.8)
        pen.line((u(XD), -COPING_T - DECK_BASE), (u(XD), b - T_BLIND), "P-BEYOND")

    # water line
    pen.line((0, WL), (span, WL), "P-WATER")
    pen.level(span * 0.45, WL, f"W.L. {WL / 1000:+.3f}")
    pen.level(span + COPING_W + 300, 0, "+-0.000 T.O.C.")


def draw_section_a(msp):
    oy = SECTION_A_Y
    pen = Pen(msp, 0, oy)
    top = [(0, FL_S), (X_SLOPE_START, FL_S), (X_SLOPE_END, FL_D), (L, FL_D)]
    bot = [(u, z - T_SLAB) for u, z in top]
    draw_section(pen, L, top, bot)

    # steps (cut on the centre line) - part of the RC shell
    pts = [(0, WL - STEP_R)]
    for i in range(1, STEP_N + 1):
        z = WL - i * STEP_R
        pts += [(i * STEP_T, z), (i * STEP_T, z - STEP_R)]
    pts += [(0, FL_S)]
    pen.pline(pts, "P-SHELL", closed=True)
    pen.hatch(pts, "ANSI31", scale=SCALE * 0.6)

    # seen beyond: inlets and ladder in the far wall (y = W)
    for x in INLETS_X:
        pen.circle((x, INLET_LEVEL), 50, "P-BEYOND")
    for x in (LADDER_X - LADDER_GAUGE / 2, LADDER_X + LADDER_GAUGE / 2):
        pen.line((x, -1_350), (x, 900), "P-BEYOND")
    for z in (-450, -750, -1_050):
        pen.line((LADDER_X - LADDER_GAUGE / 2, z), (LADDER_X + LADDER_GAUGE / 2, z),
                 "P-BEYOND")

    # levels
    pen.level(1_900, FL_S, f"F.L. {FL_S / 1000:+.3f}")
    pen.level(8_000, FL_D, f"F.L. {FL_D / 1000:+.3f}")

    # slope text along the floor
    ang = math.degrees(math.atan2(FL_D - FL_S, X_SLOPE_END - X_SLOPE_START))
    ratio = (X_SLOPE_END - X_SLOPE_START) / (D_DEEP - D_SHALLOW)
    xm = (X_SLOPE_START + X_SLOPE_END) / 2
    pen.text(f"FALL 1:{ratio:.2f}", (xm, floor_level(xm) + 120), rot=ang,
             align=TA.BOTTOM_CENTER)

    # notes
    pen.note((STEP_T * 1.5, WL - 2 * STEP_R), (1_700, -650),
             f"{STEP_N} STEPS R{STEP_R} x T{STEP_T}")
    pen.note((L + T_WALL / 2, -1_100), (L - 1_000, -700), f"RC WALL {T_WALL} THK")
    pen.note((L - 600, FL_D - T_SLAB / 2), (L - 1_400, -1_500), f"RC SLAB {T_SLAB} THK")
    pen.note((-COPING_W / 2, -COPING_T / 2), (-900, 700), f"COPING {COPING_W}x{COPING_T}")
    pen.note((L + XD - 200, -COPING_T / 2), (L + XD + 100, 900),
             f"PAVING ON {DECK_BASE} GRANULAR BASE")
    pen.note((L + T_WALL + BLIND_EXT - 20, FL_D - T_SLAB - T_BLIND / 2),
             (L + XD + 300, FL_D - T_SLAB - 500), f"BLINDING {T_BLIND} THK")

    # dimensions
    yb = FL_D - T_SLAB - T_BLIND
    pen.chain_h([0, STEP_N * STEP_T, X_SLOPE_START, X_SLOPE_END, L], yb, yb - 500)
    pen.chain_h([-XD, -T_WALL, 0], 0, yb - 500)
    pen.chain_h([L, L + T_WALL, L + XD], 0, yb - 500)
    pen.dim_h(-T_WALL, L + T_WALL, yb, yb - 1_000)
    pen.chain_v([FL_S, WL, 0], -XD, -XD - 450)
    pen.chain_v([FL_D - T_SLAB, FL_D, WL], L + XD, L + XD + 450)

    pen.view_title(f"SECTION A-A  1:{SCALE}", L / 2, yb - 1_650)


def draw_section_b(msp):
    """Cross section at x = DRAIN_X, looking towards the shallow end."""
    pen = Pen(msp, SECTION_B_X, SECTION_A_Y)
    s = DRAIN_SIZE / 2
    centres = (W / 2 - DRAIN_SPACING / 2, W / 2 + DRAIN_SPACING / 2)
    top = [(0, FL_D)]
    for c in centres:                     # drain sumps notched into the slab
        top += [(c - s, FL_D), (c - s, FL_D - DRAIN_SUMP),
                (c + s, FL_D - DRAIN_SUMP), (c + s, FL_D)]
    top += [(W, FL_D)]
    bot = [(0, FL_D - T_SLAB), (W, FL_D - T_SLAB)]
    draw_section(pen, W, top, bot)

    for c in centres:                     # grates
        pen.pline([(c - s, FL_D), (c + s, FL_D)], "P-EQUIP", width=25)
    pen.note((centres[1] + 100, FL_D - 30), (centres[1] + 600, -1_700), "MAIN DRAIN")

    # seen beyond: shallow floor break and steps at the far end
    pen.line((0, FL_S), (W, FL_S), "P-BEYOND")
    for i in range(1, STEP_N + 1):
        pen.line((STEP_Y1, WL - i * STEP_R), (STEP_Y2, WL - i * STEP_R), "P-BEYOND")
    pen.line((STEP_Y1, WL - STEP_R), (STEP_Y1, FL_S), "P-BEYOND")
    pen.line((STEP_Y2, WL - STEP_R), (STEP_Y2, FL_S), "P-BEYOND")
    pen.text("STEPS BEYOND", (W / 2, WL - STEP_R + 60), h=TXT_S, align=TA.BOTTOM_CENTER)

    pen.level(600, FL_D, f"F.L. {FL_D / 1000:+.3f}")
    pen.level(200, FL_S, f"{FL_S / 1000:+.3f} BEYOND", side=1)

    yb = FL_D - T_SLAB - T_BLIND
    pen.chain_h([-T_WALL, 0, centres[0], centres[1], W, W + T_WALL], yb, yb - 500)
    pen.dim_h(-XD, W + XD, yb, yb - 1_000)
    pen.chain_v([FL_D - T_SLAB, FL_D, WL, 0], W + XD, W + XD + 450)

    pen.view_title(f"SECTION B-B  1:{SCALE}", W / 2, yb - 1_650)


# ===================================================================
#  SHEET: A2 frame, notes, title block
# ===================================================================
SHEET_W, SHEET_H = 594 * SCALE, 420 * SCALE
SHEET_X0, SHEET_Y0 = -5_000, -11_800


def draw_sheet(msp):
    pen = Pen(msp)
    x0, y0 = SHEET_X0, SHEET_Y0
    x1, y1 = x0 + SHEET_W, y0 + SHEET_H
    pen.rect(x0, y0, x1, y1, "P-FRAME")
    m, ml = 10 * SCALE, 20 * SCALE                  # margins (left = binding)
    ix0, iy0, ix1, iy1 = x0 + ml, y0 + m, x1 - m, y1 - m
    pen.rect(ix0, iy0, ix1, iy1, "P-FRAME")

    # ---- title block (bottom right): 4 rows ----
    tw, rh = 180 * SCALE, 10 * SCALE
    tx0, ty0 = ix1 - tw, iy0
    rows = [ty0 + i * rh for i in range(5)]          # row boundaries, bottom up
    pen.rect(tx0, ty0, ix1, rows[4], "P-FRAME")
    for y in rows[1:4]:
        pen.line((tx0, y), (ix1, y), "P-FRAME")
    cx, cx2 = tx0 + tw * 0.55, tx0 + tw * 0.8
    for x in (cx, cx2):
        pen.line((x, ty0), (x, rows[2]), "P-FRAME")

    pad = 150
    pen.text("GLOBAL SNOW WING INTERNATIONAL", (tx0 + pad, rows[3] + rh / 2),
             h=TXT * 1.6, align=TA.MIDDLE_LEFT)
    pen.text("SWIMMING POOL - GENERAL ARRANGEMENT: PLAN & SECTIONS A-A, B-B",
             (tx0 + pad, rows[2] + rh / 2), h=TXT * 1.2, align=TA.MIDDLE_LEFT)

    def cell(label, value, x, y):
        pen.text(label, (x + pad, y + rh - 80), h=TXT_S * 0.8, align=TA.TOP_LEFT)
        pen.text(value, (x + pad, y + 80), h=TXT * 1.1, align=TA.BOTTOM_LEFT)

    cell("DRAWING No.", "POOL-GA-001", tx0, rows[1])
    cell("SCALE", f"1:{SCALE} @ A2", cx, rows[1])
    cell("REV", "0", cx2, rows[1])
    cell("UNITS", "mm / LEVELS m", tx0, rows[0])
    cell("DATE", "2026-10-26", cx, rows[0])
    cell("SHEET", "1 / 1", cx2, rows[0])

    # ---- general notes (top right, beside the plan) ----
    area = L * W / 1e6
    notes = [
        "GENERAL NOTES",
        "1. ALL DIMENSIONS IN MILLIMETRES, LEVELS IN METRES. DO NOT SCALE.",
        "2. LEVELS RELATIVE TO TOP OF COPING +-0.000.",
        f"3. WATER LEVEL {WL / 1000:+.3f}. WATER DEPTH {D_SHALLOW / 1000:.2f} m"
        f" SHALLOW / {D_DEEP / 1000:.2f} m DEEP.",
        f"4. WATER SURFACE {area:.1f} m2,  WATER VOLUME approx."
        f" {water_volume_m3():.1f} m3.",
        f"5. RC SHELL: WALLS {T_WALL} THK, SLAB {T_SLAB} THK ON {T_BLIND} THK BLINDING.",
        "    REINFORCEMENT AND WATERPROOFING TO STRUCTURAL ENGINEER'S DETAILS.",
        "6. MAIN DRAINS ANTI-VORTEX, MIN. 1.0 m APART, ON ONE SUCTION LINE.",
        "7. EQUIPMENT POSITIONS INDICATIVE - CONFIRM WITH POOL SPECIALIST.",
    ]
    nx, ny = 14_600, iy1 - 600
    for i, s in enumerate(notes):
        pen.text(s, (nx, ny - i * TXT * 1.75), h=TXT * (1.2 if i == 0 else 1.0),
                 align=TA.TOP_LEFT)


# ===================================================================
def build(path="POOL-GA-001.dxf"):
    doc = new_document()
    msp = doc.modelspace()
    draw_plan(msp)
    draw_section_a(msp)
    draw_section_b(msp)
    draw_sheet(msp)
    doc.set_modelspace_vport(height=SHEET_H * 1.05,
                             center=(SHEET_X0 + SHEET_W / 2, SHEET_Y0 + SHEET_H / 2))
    doc.saveas(path)
    return path


if __name__ == "__main__":
    out = build(sys.argv[1] if len(sys.argv) > 1 else "POOL-GA-001.dxf")
    print(f"written {out}  |  water volume ~ {water_volume_m3():.1f} m3")
