"""
Derive the FLOW ninja from a correctly-proportioned human base.

Base: "Platformer Animations" by Clint Bellanger, CC-BY 3.0
      https://opengameart.org/content/platformer-animations
      64x64 frames, 32px = 1 metre, figure is about six feet tall.

The base is an unclothed grey mannequin rendered from 3D, so it has real
anatomy and real run-cycle timing - the two things hand-guessing got wrong.
We scale it down to our target height, quantise it into a small suit ramp, then
paint the ninja over it: hood, face band, headband, sash, wraps, scarf, sword.

Attribution is REQUIRED by CC-BY and belongs on the credits screen.
"""

import math
import os
import random

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "ref", "platformer_base.png")

CELL = 64
SHEET_COLS = 8

# frame indices on the base sheet. The sheet runs in the order documented on
# OpenGameArt: stance 4, run 8, swing 4, block 2, hit+die 6, cast 4, shoot 4,
# walk 8, duck 2, jump+fall 6, ascend 8, descend 8, stand 1.
RUN = list(range(4, 12))         # 8 frames
SWING = list(range(12, 16))      # 4 frames - the sword strike
DIE = list(range(18, 24))        # 6 frames - staggered, then down
JUMP = [42, 43, 44, 45, 46, 47]  # crouch, launch, rise, apex, fall, reach
STAND = [64]
STANCE = list(range(0, 4))

TARGET_H = 34            # STANDING figure height in pixels
STAND_H_IN_CELL = 61     # measured height of the standing figure in the base cell
SCALE = TARGET_H / float(STAND_H_IN_CELL)
CELL_OUT = int(round(CELL * SCALE))   # the whole cell scales by one constant
OUT_W, OUT_H = 40, 40    # cell size, leaves room for limbs and the scarf

# ---------------------------------------------------------------- palette
C = {
    "K": (0x08, 0x08, 0x0F, 255),   # outline
    "D": (0x16, 0x1B, 0x33, 255),   # suit shadow
    "M": (0x24, 0x2C, 0x4E, 255),   # suit
    "L": (0x39, 0x45, 0x72, 255),   # suit lit edge
    "W": (0xE4, 0xE0, 0xD2, 255),   # bone: face band, wraps, scarf
    "G": (0x9A, 0x96, 0x86, 255),   # bone shadow
    "R": (0xC0, 0x24, 0x2C, 255),   # headband, sash
    "R2": (0x8A, 0x18, 0x1E, 255),  # headband shadow
    "S": (0xA8, 0xAE, 0xC0, 255),   # steel
    "H": (0x6B, 0x45, 0x26, 255),   # hilt
    "F": (0xB9, 0x9C, 0x78, 255),   # skin around the eyes
    # the ronin: warm ochre against the ninja's cold blue, so the two never
    # read as the same figure even in silhouette
    "ED": (0x24, 0x1A, 0x12, 255),  # robe shadow
    "EM": (0x3E, 0x2C, 0x1B, 255),  # robe
    "EL": (0x60, 0x45, 0x27, 255),  # robe lit
    "EO": (0x7A, 0x1E, 0x22, 255),  # obi
    "EO2": (0x52, 0x14, 0x18, 255),
    "HT": (0xC9, 0xA9, 0x6A, 255),  # straw hat
    "HT2": (0x8A, 0x6F, 0x3E, 255),
    # blood, dark to bright. Kept to four steps so a spray still reads as one
    # colour family at 320x240 rather than turning to confetti.
    "BL0": (0x3A, 0x07, 0x0A, 255),
    "BL1": (0x76, 0x0E, 0x13, 255),
    "BL2": (0xB4, 0x1A, 0x1F, 255),
    "BL3": (0xE0, 0x3A, 0x3E, 255),
}
CLEAR = (0, 0, 0, 0)

# tone ramp per character
KINDS = {
    "ninja": {"D": "D", "M": "M", "L": "L", "band": "R", "band2": "R2",
              "accent": "W", "accent2": "G", "scarf": True, "hat": False},
    "ronin": {"D": "ED", "M": "EM", "L": "EL", "band": "EO", "band2": "EO2",
              "accent": "HT", "accent2": "HT2", "scarf": False, "hat": True},
}

# A conical kasa. Hand-authored, because the silhouette is the whole point:
# it is what tells you at a glance that this is not the ninja.
HAT = [
    ".....KKK.....",
    "...KKhhhKK...",
    "..KhhhhhhhK..",
    ".KhhhhhhhhhK.",
    "KHHHHHHHHHHHK",
    ".KKKKKKKKKKK.",
]
HAT_LEGEND = {"K": "K", "h": "HT", "H": "HT2"}


def _sheet():
    if not os.path.exists(BASE):
        raise SystemExit("missing base sprite: " + BASE)
    return Image.open(BASE).convert("RGBA")


def _cell(sheet, i):
    c, r = i % SHEET_COLS, i // SHEET_COLS
    return sheet.crop((c * CELL, r * CELL, c * CELL + CELL, r * CELL + CELL))


def _shrink(img):
    """Scale the WHOLE cell by one constant factor.

    Normalising each frame's own height was a bug: a prone death frame is 12px
    tall in the base, so scaling it to 34 stretched it into a slab. Scaling the
    cell keeps every pose the same size AND keeps the feet on the ground, since
    every base figure stands on the bottom row of its cell.
    """
    if img.getbbox() is None:
        return None, None
    small = img.resize((CELL_OUT, CELL_OUT), Image.LANCZOS)
    return small, None


def _tone(px):
    """Map the mannequin's shading into the suit ramp."""
    r, g, b, a = px
    if a < 110:
        return None
    lum = (r * 299 + g * 587 + b * 114) // 1000
    if lum < 96:
        return "D"
    if lum < 168:
        return "M"
    return "L"


class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[CLEAR] * w for _ in range(h)]

    def put(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return CLEAR

    def solid(self, x, y):
        return self.get(x, y)[3] != 0

    def outline(self, c):
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.solid(x, y):
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.solid(x + dx, y + dy):
                        add.append((x, y))
                        break
        for x, y in add:
            self.put(x, y, c)

    def to_image(self):
        im = Image.new("RGBA", (self.w, self.h))
        im.putdata([self.px[y][x] for y in range(self.h) for x in range(self.w)])
        return im


def _body_rows(g):
    """Row extents of the figure, used to place costume features by proportion."""
    rows = [y for y in range(g.h) if any(g.solid(x, y) for x in range(g.w))]
    return (rows[0], rows[-1]) if rows else (0, g.h - 1)


def _row_span(g, y):
    xs = [x for x in range(g.w) if g.solid(x, y)]
    return (xs[0], xs[-1]) if xs else None


def _torso_span(g, y, cx):
    """The contiguous run of solid pixels containing the body centre. Using the
    full row span paints the sash straight through the arms."""
    if not g.solid(int(cx), y):
        for d in range(1, 6):
            if g.solid(int(cx) - d, y):
                cx = cx - d
                break
            if g.solid(int(cx) + d, y):
                cx = cx + d
                break
        else:
            return None
    a = b = int(cx)
    while a > 0 and g.solid(a - 1, y):
        a -= 1
    while b < g.w - 1 and g.solid(b + 1, y):
        b += 1
    return (a, b)


def costume(g, scarf_phase, kind="ninja", blade=None, wet=False):
    """Paint a character over correct anatomy. Everything is placed by body
    proportion, so it follows the pose instead of being pinned to a cell."""
    K = KINDS[kind]
    top, bot = _body_rows(g)
    H = bot - top + 1

    head_bot = top + int(H * 0.20)
    band_y = top + int(H * 0.115)
    eye_y = top + int(H * 0.155)
    waist = top + int(H * 0.50)
    elbow = top + int(H * 0.42)
    ankle = top + int(H * 0.90)

    # --- head: flatten to one tone so the face reads
    for y in range(top, head_bot + 1):
        for x in range(g.w):
            if g.solid(x, y):
                g.put(x, y, C[K["M"] if y <= band_y else K["D"]])

    # --- headband, or the hat brim line for the ronin
    if not K["hat"]:
        for y in (band_y, band_y + 1):
            sp = _row_span(g, y)
            if sp:
                for x in range(sp[0], sp[1] + 1):
                    g.put(x, y, C[K["band"] if y == band_y else K["band2"]])

    # --- face band and eye, on the leading half of the head
    for y in (eye_y, eye_y + 1):
        sp = _row_span(g, y)
        if not sp:
            continue
        a, b = sp
        mid = (a + b) // 2
        for x in range(mid, b + 1):
            g.put(x, y, C[K["accent"]] if not K["hat"] else C["F"])
        if y == eye_y + 1:
            g.put(b - 1, y, C["K"])

    # --- obi / sash, torso only
    cx = sum(_row_span(g, band_y) or (g.w // 2, g.w // 2)) / 2
    for y in (waist, waist + 1):
        sp = _torso_span(g, y, cx)
        if sp:
            for x in range(sp[0], sp[1] + 1):
                g.put(x, y, C[K["band"] if y == waist else K["band2"]])

    # --- shin wraps and feet
    for y in range(ankle - 3, ankle - 1):
        for x in range(g.w):
            if g.solid(x, y):
                g.put(x, y, C[K["accent"]])
    for y in range(ankle, bot + 1):
        for x in range(g.w):
            if g.solid(x, y):
                g.put(x, y, C["K"] if y >= bot - 1 else C[K["D"]])

    # --- forearm wraps
    for y in range(elbow, elbow + 2):
        sp = _row_span(g, y)
        if not sp:
            continue
        a, b = sp
        for x in list(range(a, min(a + 2, b + 1))) + \
                 list(range(max(b - 1, a), b + 1)):
            if g.solid(x, y):
                g.put(x, y, C[K["accent"]])

    # --- the hat sits over everything on the head
    if K["hat"]:
        sp = _row_span(g, band_y)
        if sp:
            hx = (sp[0] + sp[1]) // 2 - len(HAT[0]) // 2
            hy = top - 2
            for j, row in enumerate(HAT):
                for i, ch in enumerate(row):
                    if ch != ".":
                        g.put(hx + i, hy + j, C[HAT_LEGEND[ch]])

    # --- scarf, streaming behind the neck
    if K["scarf"]:
        ny = band_y + 3
        sp = _row_span(g, ny)
        nx = sp[0] if sp else None
        if nx is not None:
            pts = []
            px, py = float(nx), float(ny)
            for i in range(0, 10):
                t = i / 9.0
                pts.append((px, py))
                px -= 1.45
                py += math.sin(scarf_phase + t * 4.0) * (0.9 + t * 1.6) * 0.55 - 0.28
            for i in range(len(pts) - 1):
                x0, y0 = pts[i]
                x1, y1 = pts[i + 1]
                t = i / float(len(pts) - 1)
                th = 2 if t < 0.5 else 1
                col = C["W"] if t < 0.72 else C["G"]
                steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 2
                for st in range(steps + 1):
                    u = st / steps
                    x = int(round(x0 + (x1 - x0) * u))
                    y = int(round(y0 + (y1 - y0) * u))
                    for k in range(th):
                        if not g.solid(x, y + k):
                            g.put(x, y + k, col)

    # --- the sword, only on strike frames. Angle sweeps across the four frames
    # so the blade itself carries the arc.
    if blade is not None:
        hand = None
        for y in range(top + int(H * 0.24), top + int(H * 0.56)):
            sp = _row_span(g, y)
            if sp and (hand is None or sp[1] >= hand[0]):
                hand = (sp[1], y)
        if hand:
            hx, hy = hand
            ang = math.radians(blade)
            # hilt
            for k in range(2):
                g.put(hx - 1 + k, hy, C["H"])
            for i in range(1, 15):
                x = hx + math.cos(ang) * i
                y = hy - math.sin(ang) * i
                g.put(x, y, C["S"] if i < 13 else C["W"])
                if i < 11:
                    g.put(x, y + 1, C["K"])
            if wet:
                # blood sits along the cutting edge, thickest at the tip
                for i in range(4, 15):
                    x = hx + math.cos(ang) * i
                    y = hy - math.sin(ang) * i
                    g.put(x, y, C["BL2"] if i > 9 else C["BL1"])

    g.outline(C["K"])
    return g


def frame(sheet, idx, scarf_phase, kind="ninja", flip=False, blade=None,
          wet=False):
    small, _ = _shrink(_cell(sheet, idx))
    if small is None:
        return None
    g = Grid(OUT_W, OUT_H)
    K = KINDS[kind]
    ox = (OUT_W - small.width) // 2
    oy = OUT_H - 2 - small.height
    for y in range(small.height):
        for x in range(small.width):
            t = _tone(small.getpixel((x, y)))
            if t:
                g.put(x + ox, y + oy, C[K[t]])
    costume(g, scarf_phase, kind, blade, wet)
    if flip:
        f = Grid(g.w, g.h)
        for y in range(g.h):
            for x in range(g.w):
                f.px[y][g.w - 1 - x] = g.px[y][x]
        return f
    return g


# --------------------------------------------------------------------- slash
# The arc the blade leaves behind. Hand-authored: a crescent has to be drawn,
# not computed, or it reads as a smear.
SLASH = [
    [
        "..........",
        "......WW..",
        "....WW....",
        "...W......",
        "..W.......",
        "..W.......",
        "...W......",
        "....W.....",
        "..........",
        "..........",
    ],
    [
        ".......WW.",
        ".....WWGG.",
        "...WWG....",
        "..WG......",
        ".WG.......",
        ".WG.......",
        "..WG......",
        "...WG.....",
        ".....WWG..",
        ".......WW.",
    ],
    [
        "........G.",
        "......GG..",
        "....GG....",
        "...G......",
        "..G.......",
        "..G.......",
        "...G......",
        "....GG....",
        "......GG..",
        "........G.",
    ],
]


# ---------------------------------------------------------------------- blood
# The burst is BAKED here with a fixed seed, so it is a deterministic sprite,
# not a per-frame random effect. The game just plays the frames.

def blood_spray(seed=7, frames=6, w=24, h=24):
    rnd = random.Random(seed)
    parts = []
    for _ in range(34):
        ang = math.radians(rnd.uniform(-72, 34))     # up and forward
        spd = rnd.uniform(1.5, 4.6)
        parts.append({
            "x": w * 0.32 + rnd.uniform(-1.5, 1.5),
            "y": h * 0.52 + rnd.uniform(-2.0, 2.0),
            "vx": math.cos(ang) * spd,
            "vy": -abs(math.sin(ang)) * spd,
            "big": rnd.random() < 0.30,
        })
    # advance one step before recording: frame 0 of a burst that has not moved
    # yet is a solid red clump, which reads as a square rather than a spray
    for p in parts:
        p["x"] += p["vx"] * 0.7
        p["y"] += p["vy"] * 0.7
    out = []
    for f in range(frames):
        g = Grid(w, h)
        for p in parts:
            # colour cools as the droplet ages
            t = f / float(frames - 1)
            col = C["BL3"] if t < 0.25 else C["BL2"] if t < 0.55 \
                else C["BL1"] if t < 0.8 else C["BL0"]
            x, y = int(round(p["x"])), int(round(p["y"]))
            g.put(x, y, col)
            if p["big"] and f < frames - 2:
                g.put(x + 1, y, col)
                g.put(x, y + 1, col)
            p["x"] += p["vx"]
            p["y"] += p["vy"]
            p["vy"] += 0.62          # gravity
            p["vx"] *= 0.94
        out.append(g)
    return out


def blood_pool(frames=4, w=30, h=8):
    """Spreads under a body. Hard-edged, darker at the rim."""
    out = []
    for f in range(frames):
        g = Grid(w, h)
        rx = 3.5 + f * 4.2
        ry = 1.2 + f * 0.8
        cx, cy = w / 2.0, h - 2
        for y in range(h):
            for x in range(w):
                d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if d <= 1.0:
                    g.put(x, y, C["BL1"] if d > 0.55 else C["BL2"])
                elif d <= 1.35:
                    g.put(x, y, C["BL0"])
        out.append(g)
    return out


def slash_frames():
    out = []
    for art in SLASH:
        g = Grid(16, 16)
        for j, row in enumerate(art):
            for i, ch in enumerate(row):
                if ch != ".":
                    g.put(i + 3, j + 3, C["W"] if ch == "W" else C["S"])
        out.append(g)
    return out


def clips():
    sheet = _sheet()
    out = {}
    out["ninja_run"] = [frame(sheet, i, n * 0.9)
                        for n, i in enumerate(RUN)]
    out["ninja_jump"] = [frame(sheet, i, n * 0.7)
                         for n, i in enumerate(JUMP)]
    out["ninja_idle"] = [frame(sheet, i, n * 1.3)
                         for n, i in enumerate(STANCE)]
    # the strike: blade sweeps from high behind to low in front
    angles = [58, 22, -18, -46]
    out["ninja_strike"] = [frame(sheet, i, n * 0.6, blade=angles[n], wet=(n >= 2))
                           for n, i in enumerate(SWING)]
    out["ninja_die"] = [frame(sheet, i, 3.4 - n * 0.4)
                        for n, i in enumerate(DIE)]

    out["enemy_idle"] = [frame(sheet, i, 0, "ronin", flip=True)
                         for i in STANCE]
    out["enemy_wind"] = [frame(sheet, i, 0, "ronin", flip=True, blade=a)
                         for i, a in zip(SWING[:2], (64, 40))]
    out["enemy_strike"] = [frame(sheet, i, 0, "ronin", flip=True, blade=a)
                           for i, a in zip(SWING[2:], (-6, -40))]
    out["enemy_die"] = [frame(sheet, i, 0, "ronin", flip=True)
                        for i in DIE]

    out["slash"] = slash_frames()
    out["blood_spray"] = blood_spray()
    out["blood_pool"] = blood_pool()
    return out


if __name__ == "__main__":
    cs = clips()
    for k, v in cs.items():
        print(k, len(v), "frames")
