"""
Stage art for the rooftop setting - the world the run happens in.

Hiroshige, not a skyline generator. Every layer is authored from a small number
of hand-placed control points or hand-drawn pieces, then tiled. Nothing here is
noise. Layers, back to front:

    moon         blood moon, 30x30, cratered, rim-lit
    ridge_far    mountain silhouette strip, 320 wide, tiles
    ridge_mid    nearer ridge, darker
    ridge_near   nearest ridge, darkest, mist at its foot
    pagoda_a/b   temple silhouettes with lit windows and curled eaves
    torii        a gate
    roof_*       the tiles the player runs on: kawara pattern, ridge cap,
                 eave ends, gable
    bamboo_*     foreground stalks that pass in FRONT of the ninja
    lantern      paper lantern, lit
    leaf, rain   the small drifting things

All strips are 320 wide so they tile with a single modulo.
"""

import math
import random

from PIL import Image

SKY0 = (0x05, 0x07, 0x0E, 255)
IND0 = (0x0A, 0x0F, 0x1C, 255)    # far ridge
IND1 = (0x07, 0x0B, 0x16, 255)    # mid ridge
IND2 = (0x04, 0x06, 0x0C, 255)    # near ridge, almost black
MIST = (0x12, 0x18, 0x2A, 255)
BLD0 = (0x07, 0x0A, 0x11, 255)
BLD1 = (0x0D, 0x12, 0x20, 255)
TILE0 = (0x2A, 0x1A, 0x20, 255)
TILE1 = (0x3E, 0x28, 0x30, 255)
TILE2 = (0x56, 0x38, 0x43, 255)
TILE3 = (0x6E, 0x4A, 0x56, 255)
LAMP1 = (0xB8, 0x72, 0x1E, 255)
LAMP2 = (0xF2, 0xA6, 0x3C, 255)
LAMP3 = (0xFF, 0xD9, 0x8A, 255)
MOON0 = (0x5A, 0x1A, 0x1E, 255)
MOON1 = (0x7E, 0x2A, 0x2E, 255)
MOON2 = (0xA8, 0x38, 0x3A, 255)
INK = (0x08, 0x08, 0x0F, 255)
BAM0 = (0x0E, 0x1A, 0x14, 255)
BAM1 = (0x1C, 0x33, 0x24, 255)
BAM2 = (0x2E, 0x4E, 0x36, 255)
LEAF = (0x8E, 0x1F, 0x22, 255)
LEAF2 = (0xC4, 0x32, 0x2B, 255)
RAIN = (0x3A, 0x4A, 0x68, 255)
CLEAR = (0, 0, 0, 0)


class G:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[CLEAR] * w for _ in range(h)]

    def put(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.put(x, y, c)

    def stamp(self, art, legend, ox, oy, flip=False):
        for j, row in enumerate(art):
            for i, ch in enumerate(row):
                if ch == ".":
                    continue
                x = (len(row) - 1 - i) if flip else i
                self.put(ox + x, oy + j, legend[ch])

    def img(self):
        im = Image.new("RGBA", (self.w, self.h))
        im.putdata([self.px[y][x] for y in range(self.h) for x in range(self.w)])
        return im


# ------------------------------------------------------------------ helpers

def _profile(points, width, seed, jitter=0.0):
    """Cosine-interpolated height profile through hand-placed (x, y) control
    points. Wraps so the strip tiles."""
    rnd = random.Random(seed)
    pts = sorted(points)
    pts = pts + [(pts[0][0] + width, pts[0][1])]
    out = []
    k = 0
    for x in range(width):
        while x >= pts[k + 1][0]:
            k += 1
        x0, y0 = pts[k]
        x1, y1 = pts[k + 1]
        t = (x - x0) / float(max(1, x1 - x0))
        t = (1 - math.cos(t * math.pi)) / 2.0
        y = y0 + (y1 - y0) * t
        if jitter:
            y += rnd.uniform(-jitter, jitter)
        out.append(int(round(y)))
    return out


# ---------------------------------------------------------------------- sky

SKY_STEPS = [(0x04,0x06,0x0C),(0x06,0x09,0x12),(0x09,0x0D,0x19),(0x0C,0x12,0x21),
             (0x10,0x17,0x29),(0x14,0x1C,0x31),(0x18,0x21,0x38),(0x1C,0x26,0x3E)]
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def sky():
    """320x120 night gradient. Eight indigo steps with a 4x4 ordered dither
    across each boundary, so it reads as a smooth sky rather than stripes."""
    g = G(320, 120)
    n = len(SKY_STEPS)
    for y in range(120):
        t = y / 119.0 * (n - 1)
        i = int(t)
        frac = t - i
        for x in range(320):
            thr = (BAYER[y % 4][x % 4] + 0.5) / 16.0
            k = min(n - 1, i + (1 if frac > thr else 0))
            g.put(x, y, SKY_STEPS[k] + (255,))
    return g


# --------------------------------------------------------------------- moon

def moon():
    g = G(30, 30)
    rnd = random.Random(3)
    cx = cy = 14.5
    for y in range(30):
        for x in range(30):
            d = math.hypot(x - cx, y - cy)
            if d <= 13.5:
                # lit from the upper left, terminator across the lower right
                lit = ((x - cx) * -0.6 + (y - cy) * -0.8) / 13.5
                g.put(x, y, MOON2 if lit > 0.25 else MOON1 if lit > -0.35 else MOON0)
    # craters: a handful of darker discs, placed by hand-ish seed
    for _ in range(7):
        rx, ry = rnd.uniform(6, 23), rnd.uniform(6, 23)
        rr = rnd.uniform(1.4, 3.2)
        if math.hypot(rx - cx, ry - cy) > 11:
            continue
        for y in range(30):
            for x in range(30):
                if math.hypot(x - rx, y - ry) <= rr and g.px[y][x][3]:
                    g.put(x, y, MOON0 if g.px[y][x] != MOON2 else MOON1)
    # rim
    for y in range(30):
        for x in range(30):
            d = math.hypot(x - cx, y - cy)
            if 12.6 < d <= 13.5 and (x - cx) * -0.6 + (y - cy) * -0.8 > 2:
                g.put(x, y, (0xD0, 0x50, 0x52, 255))
    return g


# ------------------------------------------------------------------- ridges

def ridge(points, colour, seed, height=70, mist=False):
    g = G(320, height)
    prof = _profile(points, 320, seed, jitter=0.35)
    for x in range(320):
        top = max(0, min(height - 1, prof[x]))
        for y in range(top, height):
            g.put(x, y, colour)
    if mist:
        # a soft band of mist at the foot of the near ridge, dithered
        for x in range(320):
            for y in range(height - 9, height):
                if (x + y) % 3 == 0 or y >= height - 4:
                    g.put(x, y, MIST)
    return g


def ridge_far():
    return ridge([(0, 44), (38, 30), (72, 40), (104, 22), (140, 36), (176, 28),
                  (214, 44), (248, 26), (286, 38), (310, 46)],
                 IND0, 11, height=60)


def ridge_mid():
    return ridge([(0, 36), (52, 22), (90, 34), (130, 18), (166, 30), (206, 20),
                  (240, 32), (276, 24), (300, 34)],
                 IND1, 12, height=56)


def ridge_near():
    return ridge([(0, 30), (44, 40), (96, 28), (150, 38), (196, 26), (238, 36),
                  (282, 30), (312, 38)],
                 IND2, 13, height=50, mist=True)


# ------------------------------------------------------------------ pagoda

EAVE_TIP = [          # the upturned corner of a roof tier, 6x4, drawn at the left
    "....#.",
    "...##.",
    "..###.",
    "######",
]


def pagoda(tiers, width, seed):
    """A tiered temple silhouette. Each tier is a roof wider than the body
    below it, with curled tips, and a lit window row under it."""
    rnd = random.Random(seed)
    tier_h = 11
    total = tiers * tier_h + 10
    g = G(width + 12, total)
    cx = g.w // 2
    y = 8
    # finial
    g.rect(cx, 0, cx, 7, INK)
    g.rect(cx - 1, 2, cx + 1, 2, INK)
    g.rect(cx - 1, 5, cx + 1, 5, INK)
    for t in range(tiers):
        # roof for this tier: wider at the bottom, curled tips
        rw = int(width * (0.55 + 0.45 * (t + 1) / tiers))
        x0, x1 = cx - rw // 2, cx + rw // 2
        for k in range(4):
            g.rect(x0 + 3 - k, y + k, x1 - 3 + k, y + k, INK)
        g.stamp(EAVE_TIP, {"#": INK}, x0 - 3, y)
        g.stamp(EAVE_TIP, {"#": INK}, x1 - 2, y, flip=True)
        # body under the roof
        bw = int(rw * 0.62)
        bx0, bx1 = cx - bw // 2, cx + bw // 2
        g.rect(bx0, y + 4, bx1, y + tier_h - 1, BLD1)
        # windows: two or three lit, one dark
        n = 3 if bw > 22 else 2
        for i in range(n):
            wx = bx0 + 3 + i * ((bw - 6) // max(1, n - 1)) if n > 1 else cx - 1
            lit = rnd.random() < 0.75
            g.rect(wx, y + 6, wx + 1, y + 8, LAMP2 if lit else BLD0)
        y += tier_h
    return g


def pagoda_a():
    return pagoda(3, 40, 21)


def pagoda_b():
    return pagoda(5, 34, 22)


def torii():
    g = G(30, 26)
    g.rect(0, 0, 29, 1, INK)          # kasagi, the top beam
    g.rect(2, 2, 27, 2, INK)
    g.rect(4, 6, 25, 7, INK)          # nuki, the tie beam
    g.rect(5, 0, 7, 25, INK)          # posts
    g.rect(22, 0, 24, 25, INK)
    return g


# -------------------------------------------------------------- roof tiles

KAWARA = [                 # one tile, 8x4, repeated across a roof face
    "..#####.",
    ".#o###o#",
    "#oo#oo##",
    "########",
]
KAWARA_LEGEND = {"#": TILE1, "o": TILE2}

EAVE_END = [               # left end of an eave with its upturn, 10x7
    "........h.",
    ".......hh.",
    "......h##.",
    ".....####.",
    "...######.",
    ".#########",
    "##########",
]


def roof_tiles():
    """A 64-wide strip of the tiled roof face, 8 rows, tiling horizontally."""
    g = G(64, 8)
    for r in range(2):
        for c in range(8):
            g.stamp(KAWARA, KAWARA_LEGEND, c * 8, r * 4)
    # a lighter ridge line along the very top row, then the dark underline
    g.rect(0, 0, 63, 0, TILE3)
    return g


def roof_cap():
    """The ridge cap: 64 wide, 3 tall. Rounded caps every 8px."""
    g = G(64, 3)
    g.rect(0, 1, 63, 2, TILE2)
    g.rect(0, 0, 63, 0, TILE3)
    for x in range(0, 64, 8):
        g.rect(x, 0, x + 1, 2, TILE1)
    return g


def eave_end():
    g = G(10, 7)
    g.stamp(EAVE_END, {"#": TILE1, "h": TILE3}, 0, 0)
    g.rect(3, 5, 9, 5, TILE2)
    return g


def gable():
    """The dark triangular end wall of a roof, 12x10."""
    g = G(12, 10)
    for y in range(10):
        half = int(y * 0.6)
        g.rect(6 - half, y, 5 + half, y, BLD0)
    return g


# ------------------------------------------------------------------ bamboo

BAMBOO_LEAF = [
    "......##",
    "...#####",
    ".#######",
    "###.....",
]


def bamboo_stalk():
    """A 6-wide, 48-tall stalk segment that tiles vertically. Node every 16."""
    g = G(14, 48)
    for y in range(48):
        g.rect(4, y, 8, y, BAM1)
        g.put(4, y, BAM0)
        g.put(8, y, BAM2)
    for ny in (7, 23, 39):
        g.rect(3, ny, 9, ny, BAM2)
        g.rect(3, ny + 1, 9, ny + 1, BAM0)
    g.stamp(BAMBOO_LEAF, {"#": BAM1}, 6, 10)
    g.stamp(BAMBOO_LEAF, {"#": BAM1}, 0, 26, flip=True)
    g.stamp(BAMBOO_LEAF, {"#": BAM2}, 6, 42)
    return g


# --------------------------------------------------------------- lantern

LANTERN = [
    "...##...",
    "..####..",
    ".#llll#.",
    "#lllLll#",
    "#llLLll#",
    "#lllLll#",
    "#llllll#",
    ".#llll#.",
    "..####..",
    "...##...",
    "...oo...",
    "....o...",
]
LANTERN_LEGEND = {"#": INK, "l": LAMP2, "L": LAMP3, "o": LAMP1}


def lantern():
    g = G(8, 12)
    g.stamp(LANTERN, LANTERN_LEGEND, 0, 0)
    return g


# --------------------------------------------------------------- small bits

def leaf():
    g = G(4, 3)
    g.stamp(["##..", ".###", "..#."], {"#": LEAF}, 0, 0)
    return g


def leaf_hot():
    g = G(4, 3)
    g.stamp(["##..", ".###", "..#."], {"#": LEAF2}, 0, 0)
    return g


def rain():
    g = G(3, 7)
    for y in range(7):
        g.put(2 - (y // 3), y, RAIN)
    return g


# --------------------------------------------------------------------- all

def tiles():
    return {
        "sky": sky(),
        "moon": moon(),
        "ridge_far": ridge_far(),
        "ridge_mid": ridge_mid(),
        "ridge_near": ridge_near(),
        "pagoda_a": pagoda_a(),
        "pagoda_b": pagoda_b(),
        "torii": torii(),
        "roof_tiles": roof_tiles(),
        "roof_cap": roof_cap(),
        "eave_end": eave_end(),
        "gable": gable(),
        "bamboo": bamboo_stalk(),
        "lantern": lantern(),
        "leaf": leaf(),
        "leaf_hot": leaf_hot(),
        "rain": rain(),
    }


if __name__ == "__main__":
    for k, v in tiles().items():
        print("%-12s %dx%d" % (k, v.w, v.h))
