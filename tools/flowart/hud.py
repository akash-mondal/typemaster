"""
HUD and projectile art for KATA.

    kunai_full / kunai_empty   one heart, 9x16
    kata_seg_full / _empty     one segment of the kata meter, a brush stroke 20x6
    hanko_genin..hanko_kage    rank seals, 30x30, kanji carved out of vermilion
    shuriken                   4 frames, 9x9, spinning
    arrow                      14x3
    spark                      3 frames, 15x15, the deflect burst
    dust                       4 frames, 18x6, landing and slide dust
    lantern_pick               4 frames, 8x12, a floating lantern that bobs and glows
"""

import math
import os
import random

from PIL import Image, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BRUSH = os.path.join(HERE, "ref", "brush", "YujiBoku-Regular.ttf")

CLEAR = (0, 0, 0, 0)
INK = (0x08, 0x08, 0x0F, 255)
STEEL = (0xA8, 0xAE, 0xC0, 255)
STEEL2 = (0x6A, 0x70, 0x84, 255)
STEEL3 = (0xE0, 0xE6, 0xF0, 255)
VERM = (0xC8, 0x2A, 0x2E, 255)
VERM2 = (0x8A, 0x18, 0x1E, 255)
BONE = (0xE8, 0xF4, 0xEC, 255)
DIM = (0x2A, 0x34, 0x40, 255)
DIM2 = (0x1A, 0x20, 0x2A, 255)
GOLD = (0xF4, 0xB9, 0x3D, 255)
GOLD2 = (0xB8, 0x72, 0x1E, 255)
GOLD3 = (0xFF, 0xE6, 0xA8, 255)
WOOD = (0x7A, 0x52, 0x2C, 255)
DUST = (0x5A, 0x50, 0x48, 255)
DUST2 = (0x3A, 0x34, 0x30, 255)
LAMP1 = (0xB8, 0x72, 0x1E, 255)
LAMP2 = (0xF2, 0xA6, 0x3C, 255)
LAMP3 = (0xFF, 0xD9, 0x8A, 255)


class G:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[CLEAR] * w for _ in range(h)]

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def stamp(self, art, legend, ox=0, oy=0):
        for j, row in enumerate(art):
            for i, ch in enumerate(row):
                if ch != ".":
                    self.put(ox + i, oy + j, legend[ch])

    def to_image(self):
        im = Image.new("RGBA", (self.w, self.h))
        im.putdata([self.px[y][x] for y in range(self.h) for x in range(self.w)])
        return im

    img = to_image


KUNAI = [
    "....#....",
    "...#h#...",
    "...#hs#..",
    "..#hhs#..",
    "..#hss#..",
    "..#hss#..",
    ".#hhsss#.",
    ".#######.",
    "...#r#...",
    "...#R#...",
    "...#r#...",
    "...#R#...",
    "...#r#...",
    "..#...#..",
    "..#...#..",
    "...###...",
]


def kunai_full():
    g = G(9, 16)
    g.stamp(KUNAI, {"#": INK, "h": STEEL3, "s": STEEL, "r": VERM, "R": VERM2})
    return g


def kunai_empty():
    g = G(9, 16)
    g.stamp(KUNAI, {"#": DIM, "h": DIM2, "s": DIM2, "r": DIM2, "R": DIM2})
    return g


def brush_stroke(colour, colour2, seed):
    """A single horizontal brush stroke, heavy at the start, tailing off."""
    g = G(20, 6)
    rnd = random.Random(seed)
    for x in range(20):
        t = x / 19.0
        th = 5.0 * (1 - t) ** 0.6 + 1.0
        mid = 3 + math.sin(t * 2.2) * 0.6
        for y in range(6):
            d = abs(y - mid)
            if d <= th / 2:
                c = colour if d < th / 2 - 0.8 else colour2
                if t > 0.75 and rnd.random() < (t - 0.75) * 2.4:
                    continue          # dry-brush break-up at the tail
                g.put(x, y, c)
    return g


def hanko(ch, seed):
    """A carved vermilion seal: the kanji is cut out, the border is uneven."""
    W = 30
    g = G(W, W)
    rnd = random.Random(seed)
    for y in range(W):
        for x in range(W):
            edge = min(x, y, W - 1 - x, W - 1 - y)
            if edge == 0 and rnd.random() < 0.35:
                continue
            g.put(x, y, VERM if (x * 7 + y * 3) % 11 else VERM2)
    f = ImageFont.truetype(BRUSH, 22)
    m = f.getmask(ch, mode="1")
    bb = f.getbbox(ch)
    ox = (W - (bb[2] - bb[0])) // 2 - bb[0]
    oy = (W - (bb[3] - bb[1])) // 2 - bb[1]
    for yy in range(m.size[1]):
        for xx in range(m.size[0]):
            if m.getpixel((xx, yy)):
                g.put(xx + ox + bb[0], yy + oy + bb[1], BONE)
    # a few flecks of worn ink inside the border
    for _ in range(6):
        g.put(rnd.randrange(3, W - 3), rnd.randrange(3, W - 3), VERM2)
    return g


SHURIKEN = [
    [
        "....#....",
        "...#s#...",
        "...#s#...",
        "####o####",
        "#sssoosss#"[:9],
        "####o####",
        "...#s#...",
        "...#s#...",
        "....#....",
    ],
]


def shuriken_frames():
    """Four-pointed star at 0, 22, 45 and 67 degrees - reads as a spin at 12fps."""
    out = []
    for f in range(4):
        g = G(9, 9)
        a0 = math.radians(f * 22.5)
        for k in range(4):
            a = a0 + k * math.pi / 2
            for r in range(0, 5):
                x = 4 + math.cos(a) * r
                y = 4 + math.sin(a) * r
                g.put(x, y, STEEL3 if r < 2 else STEEL)
            # the blade's trailing edge
            b = a + 0.5
            g.put(4 + math.cos(b) * 2.3, 4 + math.sin(b) * 2.3, STEEL2)
        g.put(4, 4, INK)
        out.append(g)
    return out


def arrow():
    g = G(14, 3)
    for x in range(3, 12):
        g.put(x, 1, WOOD)
    g.put(0, 1, STEEL3); g.put(1, 1, STEEL); g.put(2, 0, STEEL); g.put(2, 2, STEEL)
    for x in (11, 12, 13):
        g.put(x, 0, BONE); g.put(x, 2, BONE)
    return g


def spark_frames():
    out = []
    for f in range(3):
        g = G(15, 15)
        r = 2 + f * 2.6
        for k in range(8):
            a = k * math.pi / 4 + 0.3
            for d in range(int(r * 0.4), int(r) + 1):
                c = GOLD3 if f == 0 else GOLD if f == 1 else GOLD2
                if f == 2 and d < r * 0.7:
                    continue
                g.put(7 + math.cos(a) * d, 7 + math.sin(a) * d, c)
        if f == 0:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    g.put(7 + dx, 7 + dy, BONE)
        out.append(g)
    return out


def dust_frames():
    out = []
    rnd = random.Random(9)
    puffs = [(rnd.uniform(-1, 1), rnd.uniform(0.2, 1.0)) for _ in range(14)]
    for f in range(4):
        g = G(18, 6)
        for i, (vx, vy) in enumerate(puffs):
            x = 9 + vx * (2 + f * 2.4) + (1 if i % 2 else -1) * f * 0.6
            y = 5 - vy * (1 + f * 1.1)
            if f == 3 and i % 2:
                continue
            g.put(x, y, DUST if f < 2 else DUST2)
        out.append(g)
    return out


def lantern_pick_frames():
    ART = [
        "...##...",
        "..#oo#..",
        ".#oLLo#.",
        "#oLWWLo#",
        "#oLWWLo#",
        "#oLLLLo#",
        ".#oLLo#.",
        "..#oo#..",
        "...##...",
        "...rr...",
        "...r....",
        "....r...",
    ]
    out = []
    for f in range(4):
        g = G(8, 12)
        glow = f in (1, 2)
        g.stamp(ART, {"#": INK, "o": LAMP1, "L": LAMP3 if glow else LAMP2,
                      "W": BONE if glow else LAMP3, "r": VERM})
        out.append(g)
    return out


def clips():
    return {
        "shuriken": shuriken_frames(),
        "spark": spark_frames(),
        "dust": dust_frames(),
        "lantern_pick": lantern_pick_frames(),
    }


def tiles():
    return {
        "kunai_full": kunai_full(),
        "kunai_empty": kunai_empty(),
        "kata_seg_full": brush_stroke(GOLD, GOLD2, 3),
        "kata_seg_empty": brush_stroke(DIM, DIM2, 3),
        "hanko_genin": hanko("下", 1),
        "hanko_chunin": hanko("中", 2),
        "hanko_jonin": hanko("上", 3),
        "hanko_kage": hanko("影", 4),
        "arrow": arrow(),
    }
