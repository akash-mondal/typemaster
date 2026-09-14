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
CLOUD = (0x26, 0x30, 0x4C, 255)   # wisps must sit above the sky's own value
BLD0 = (0x07, 0x0A, 0x11, 255)
BLD1 = (0x0D, 0x12, 0x20, 255)
TILE0 = (0x2A, 0x1A, 0x20, 255)
TILE1 = (0x3E, 0x28, 0x30, 255)
TILE2 = (0x56, 0x38, 0x43, 255)
TILE3 = (0x6E, 0x4A, 0x56, 255)
LAMP0 = (0x6B, 0x3A, 0x12, 255)
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


# ==========================================================================
# ROOF ARCHITECTURE v2 - real roofs, several kinds, three height lanes
# ==========================================================================
# A roof reads as a roof when it has, top to bottom: a RIDGE you stand on, a
# pitched tiled FACE that recedes, an EAVE that overhangs and casts a shadow,
# and only then the WALL of the building. The v1 roof was a 3px fringe on a
# wall, which is why it looked like a ledge.

# grey kawara for townhouses
KW0 = (0x1E, 0x22, 0x30, 255); KW1 = (0x2C, 0x32, 0x44, 255)
KW2 = (0x3C, 0x44, 0x5A, 255); KW3 = (0x50, 0x5A, 0x72, 255)
# terracotta for inns
TC0 = (0x3A, 0x1E, 0x18, 255); TC1 = (0x5E, 0x2E, 0x22, 255)
TC2 = (0x7E, 0x40, 0x2E, 255); TC3 = (0x9E, 0x56, 0x3C, 255)
# copper patina for temples
CU0 = (0x10, 0x2A, 0x2A, 255); CU1 = (0x18, 0x40, 0x3C, 255)
CU2 = (0x24, 0x5A, 0x52, 255); CU3 = (0x36, 0x76, 0x6A, 255)
# thatch for shrines and huts
TH0 = (0x3A, 0x2C, 0x14, 255); TH1 = (0x56, 0x42, 0x1E, 255)
TH2 = (0x74, 0x5A, 0x2A, 255); TH3 = (0x92, 0x74, 0x38, 255)
WOOD0 = (0x2A, 0x1C, 0x12, 255); WOOD1 = (0x46, 0x30, 0x1E, 255)
WOOD2 = (0x66, 0x48, 0x2C, 255)
PAPER = (0xC8, 0xB8, 0x94, 255)
GOLD = (0xF4, 0xB9, 0x3D, 255)
BONE = (0xE8, 0xF4, 0xEC, 255)
VERM = (0xC8, 0x2A, 0x2E, 255)


def roof_face(ramp, height=14, rows_dark_down=True):
    """64-wide pitched roof face in a 4-tone ramp. Tile rows get darker toward
    the eave so the plane reads as receding away from the moon."""
    c0, c1, c2, c3 = ramp
    g = G(64, height)
    tile_rows = height // 4
    for r in range(tile_rows + 1):
        t = r / max(1, tile_rows)
        # top rows lit, bottom rows in the eave's shadow
        hi, mid, lo = (c3, c2, c1) if t < 0.34 else (c2, c1, c0) if t < 0.7 else (c1, c0, c0)
        legend = {"#": mid, "o": hi}
        for c in range(8):
            ox = c * 8 + (4 if r % 2 else 0)      # staggered courses
            g.stamp(KAWARA, legend, ox - 8, r * 4)
            g.stamp(KAWARA, legend, ox, r * 4)
        # a dark seam under every course
        g.rect(0, r * 4 + 3, 63, r * 4 + 3, lo)
    return g


def roof_face_thatch(height=14):
    g = G(64, height)
    rnd = random.Random(31)
    for y in range(height):
        t = y / float(height)
        base = TH3 if t < 0.25 else TH2 if t < 0.6 else TH1
        for x in range(64):
            c = base
            if rnd.random() < 0.18:
                c = TH1 if base != TH1 else TH0
            g.put(x, y, c)
    # ragged bottom edge
    for x in range(64):
        if rnd.random() < 0.5:
            g.put(x, height - 1, TH0)
        if rnd.random() < 0.2:
            g.put(x, height - 2, TH0)
    return g


def ridge_plain():
    g = G(64, 4)
    g.rect(0, 1, 63, 3, KW2)
    g.rect(0, 0, 63, 0, KW3)
    for x in range(0, 64, 8):
        g.rect(x, 1, x, 3, KW1)
    return g


def ridge_ornate():
    """A temple ridge: heavier, with round onigawara bumps every 16px."""
    g = G(64, 5)
    g.rect(0, 2, 63, 4, CU1)
    g.rect(0, 1, 63, 1, CU2)
    for x in range(4, 64, 16):
        g.rect(x, 0, x + 3, 0, CU3)
        g.rect(x - 1, 1, x + 4, 1, CU3)
    return g


SHACHI = [                 # the fish ornament on a temple ridge end, 8x9
    "......##",
    ".....#gg",
    "....#ggg",
    "...#gggg",
    "..#ggg#.",
    ".#ggg#..",
    "#ggg#...",
    "gggg....",
    "gg......",
]


def shachihoko():
    g = G(8, 9)
    g.stamp(SHACHI, {"#": INK, "g": GOLD}, 0, 0)
    return g


EAVE_CURL = [              # a sweeping temple eave end, 12x8
    "..........hh",
    ".........hh.",
    "........h##.",
    ".......####.",
    ".....######.",
    "...########.",
    ".##########.",
    "############",
]


def eave_curl():
    g = G(12, 8)
    g.stamp(EAVE_CURL, {"#": CU1, "h": CU3}, 0, 0)
    return g


def eave_straight():
    g = G(6, 4)
    g.rect(0, 0, 5, 2, KW1)
    g.rect(0, 3, 5, 3, KW0)
    return g


def eave_shadow():
    """The overhang's shadow on the wall, 64x3, dithered so it feels soft."""
    g = G(64, 3)
    for x in range(64):
        g.put(x, 0, INK)
        if x % 2 == 0:
            g.put(x, 1, INK)
        if x % 4 == 0:
            g.put(x, 2, INK)
    return g


SHOJI = [                  # a paper lattice window, 10x10
    "##########",
    "#pp#pp#pp#",
    "#pp#pp#pp#",
    "##########",
    "#pp#pp#pp#",
    "#pp#pp#pp#",
    "##########",
    "#pp#pp#pp#",
    "#pp#pp#pp#",
    "##########",
]


def shoji_lit():
    g = G(10, 10)
    g.stamp(SHOJI, {"#": WOOD0, "p": LAMP2}, 0, 0)
    return g


def shoji_dark():
    g = G(10, 10)
    g.stamp(SHOJI, {"#": WOOD0, "p": (0x1A, 0x1C, 0x22, 255)}, 0, 0)
    return g


KANBAN_END = [             # the carved end of a hanging signboard, 5x14
    ".ww..",
    "ww#..",
    "w#dd.",
    "w#ddd",
    "w#ddd",
    "w#ddd",
    "w#ddd",
    "w#ddd",
    "w#ddd",
    "w#ddd",
    "w#ddd",
    "w#dd.",
    "ww#..",
    ".ww..",
]


def kanban_end():
    g = G(5, 14)
    g.stamp(KANBAN_END, {"w": WOOD2, "#": WOOD0, "d": (0x0A, 0x0D, 0x12, 255)}, 0, 0)
    return g


def kanban_mid():
    """The signboard's middle, 8x14, tiles. Wood rails top and bottom, the
    dark panel the passage is written on between them."""
    g = G(8, 14)
    g.rect(0, 0, 7, 0, WOOD2)
    g.rect(0, 1, 7, 1, WOOD0)
    g.rect(0, 2, 7, 11, (0x0A, 0x0D, 0x12, 255))
    g.rect(0, 12, 7, 12, WOOD0)
    g.rect(0, 13, 7, 13, WOOD2)
    return g


def railing():
    """A wooden railing for bridges and towers, 16x8, tiles."""
    g = G(16, 8)
    g.rect(0, 1, 15, 1, WOOD2)
    g.rect(0, 5, 15, 5, WOOD1)
    for x in (2, 10):
        g.rect(x, 0, x + 1, 7, WOOD1)
        g.put(x, 0, WOOD2)
    return g


def planks():
    """A wooden walkway, 64x6, tiles. Grain lines and the odd knot."""
    g = G(64, 6)
    rnd = random.Random(44)
    g.rect(0, 0, 63, 5, WOOD1)
    g.rect(0, 0, 63, 0, WOOD2)
    for x in range(0, 64, 16):
        g.rect(x, 0, x, 5, WOOD0)
    for _ in range(6):
        g.put(rnd.randrange(64), rnd.randrange(1, 5), WOOD0)
    return g


def yagura():
    """A watchtower cap, 28x22: a small hip roof over an open railed deck."""
    g = G(28, 22)
    # roof
    for k in range(6):
        g.rect(13 - k * 2, k, 14 + k * 2, k, KW1 if k % 2 else KW2)
    g.rect(1, 6, 26, 7, KW0)
    g.stamp(EAVE_TIP, {"#": KW0}, -1, 4)
    g.stamp(EAVE_TIP, {"#": KW0}, 23, 4, flip=True)
    # posts and deck
    for x in (4, 13, 22):
        g.rect(x, 8, x + 1, 17, WOOD1)
    g.rect(2, 12, 25, 12, WOOD2)
    g.rect(2, 18, 25, 21, WOOD0)
    g.rect(2, 18, 25, 18, WOOD2)
    # a lantern hanging in the deck
    g.rect(8, 13, 9, 15, LAMP2)
    return g


def shrine():
    """A roadside shrine, 30x24: thatched roof, red posts, a tiny torii."""
    g = G(30, 24)
    for k in range(7):
        w = 6 + k * 3
        g.rect(15 - w // 2, k, 14 + w // 2, k, TH2 if k < 5 else TH1)
    g.rect(2, 7, 27, 8, TH0)
    g.rect(6, 9, 7, 21, VERM)
    g.rect(22, 9, 23, 21, VERM)
    g.rect(8, 10, 21, 21, (0x12, 0x0C, 0x0A, 255))
    g.rect(12, 13, 17, 19, LAMP1)          # the lit interior
    g.rect(14, 15, 15, 17, LAMP3)
    # torii in front
    g.rect(24, 12, 29, 12, VERM)
    g.rect(25, 14, 28, 14, VERM)
    g.rect(25, 12, 25, 23, VERM)
    g.rect(28, 12, 28, 23, VERM)
    return g


# --------------------------------------------------------------- sky life

CRANE_A = [                # wings up, 16x9
    "..........#.....",
    ".........##.....",
    "........###.....",
    ".......####.....",
    "......##########",
    "#####wwwwww###r.",
    "....wwwwwww##...",
    ".......w........",
    "......w.........",
]
CRANE_B = [                # wings down
    "................",
    "................",
    "................",
    "................",
    "......##########",
    "#####wwwwww###r.",
    "....wwwwwww##...",
    ".....###w.......",
    "....##..w.......",
]
CRANE_LEGEND = {"#": INK, "w": BONE, "r": VERM}


def crane_a():
    g = G(16, 9); g.stamp(CRANE_A, CRANE_LEGEND, 0, 0); return g


def crane_b():
    g = G(16, 9); g.stamp(CRANE_B, CRANE_LEGEND, 0, 0); return g


CROW_A = ["#.....#", ".#...#.", "..###..", "...#..."]
CROW_B = ["...#...", "..###..", ".#...#.", "#.....#"]


def crow_a():
    g = G(7, 4); g.stamp(CROW_A, {"#": INK}, 0, 0); return g


def crow_b():
    g = G(7, 4); g.stamp(CROW_B, {"#": INK}, 0, 0); return g


SKY_LANTERN = [            # a floating paper lantern, 6x9, warm
    ".hhhh.",
    "hLLLLh",
    "hLLLLh",
    "hlLLlh",
    "hllllh",
    ".hllh.",
    "..##..",
    "..o...",
    "...o..",
]


def sky_lantern():
    g = G(6, 9)
    g.stamp(SKY_LANTERN, {"h": LAMP1, "L": LAMP3, "l": LAMP2, "#": INK, "o": LAMP1}, 0, 0)
    return g


def sky_lantern_dim():
    g = G(6, 9)
    g.stamp(SKY_LANTERN, {"h": LAMP0, "L": LAMP2, "l": LAMP1, "#": INK, "o": LAMP0}, 0, 0)
    return g


def cloud_long():
    """A thin drifting wisp, 48x5, dithered so it stays soft over the sky."""
    g = G(48, 5)
    prof = _profile([(0, 3), (12, 1), (26, 2), (38, 0), (47, 3)], 48, 7)
    for x in range(48):
        top = max(0, prof[x])
        for y in range(top, 5):
            if (x + y) % 2 == 0 or y == 4:
                g.put(x, y, CLOUD)
    return g


def cloud_short():
    g = G(22, 4)
    prof = _profile([(0, 3), (7, 0), (15, 1), (21, 3)], 22, 8)
    for x in range(22):
        for y in range(max(0, prof[x]), 4):
            if (x + y) % 2 == 0 or y == 3:
                g.put(x, y, CLOUD)
    return g


KITE = [                   # a paper kite, 9x11, vermilion with a bone cross
    "....#....",
    "...#r#...",
    "..#rrr#..",
    ".#rrwrr#.",
    "#rrwwwrr#",
    ".#rrwrr#.",
    "..#rrr#..",
    "...#r#...",
    "....#....",
    "....b....",
    "...b.b...",
]


def kite():
    g = G(9, 11)
    g.stamp(KITE, {"#": INK, "r": VERM, "w": BONE, "b": BONE}, 0, 0)
    return g


def tiles_v2():
    return {
        "face_kawara": roof_face((KW0, KW1, KW2, KW3)),
        "face_terracotta": roof_face((TC0, TC1, TC2, TC3)),
        "face_copper": roof_face((CU0, CU1, CU2, CU3)),
        "face_thatch": roof_face_thatch(),
        "ridge_plain": ridge_plain(),
        "ridge_ornate": ridge_ornate(),
        "shachihoko": shachihoko(),
        "eave_curl": eave_curl(),
        "eave_straight": eave_straight(),
        "eave_shadow": eave_shadow(),
        "shoji_lit": shoji_lit(),
        "shoji_dark": shoji_dark(),
        "kanban_end": kanban_end(),
        "kanban_mid": kanban_mid(),
        "railing": railing(),
        "planks": planks(),
        "yagura": yagura(),
        "shrine": shrine(),
        "crane_a": crane_a(),
        "crane_b": crane_b(),
        "crow_a": crow_a(),
        "crow_b": crow_b(),
        "sky_lantern": sky_lantern(),
        "sky_lantern_dim": sky_lantern_dim(),
        "cloud_long": cloud_long(),
        "cloud_short": cloud_short(),
        "kite": kite(),
    }


_tiles_v1 = tiles


def tiles():
    out = _tiles_v1()
    out.update(tiles_v2())
    return out
