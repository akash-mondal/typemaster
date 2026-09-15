#!/usr/bin/env python3
"""
WAGONHEART - pixel asset builder.

    python3 tools/wagonart/build.py

Writes assets/wagonheart/atlas.png (sprites, icons, fonts, logo, icon),
assets/wagonheart/land.png (every biome's parallax layers) and manifest.json.

Sources (all CC0 unless noted, see tools/wagonart/ref/*/LICENSE.txt):
  ScratchIO: horse, deer, boar, bear, wolf, fox, rabbit, woman, trees, bushes, rocks, cacti
  Skab: frontier walkers (bowler, top hat, blue coat)
  ansimuz: Country, Magical Road, Rocky Pass, Magic Cliffs, Super Mountain Dusk layers
  atariboy: snow mountain layers;  Foozle: desert dunes;  ArlanTR: campfire
  SmithyGames: crow;  daungames: rain;  NotJam Old Style 11, monogram: fonts
Drawn here: the wagon, standing stones, graves, forts, cabins, tents, ferry,
water, the road, icons, the logo and the app icon.

Every layer of land is gradient-mapped into its biome's own daylight ramp, so
the game's light system (games/wagonheart-light.js) owns time of day.
"""

import json
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
REF = os.path.join(HERE, "ref")
OUT = os.path.join(ROOT, "assets", "wagonheart")
TAU = math.pi * 2
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def R(*p):
    return os.path.join(REF, *p)


def load(*p):
    return Image.open(R(*p)).convert("RGBA")


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def strip(path, fw, fh=None, row=0, cols=None, pick=None):
    im = load(*path) if isinstance(path, (list, tuple)) else load(path)
    fh = fh or im.height
    n = cols or im.width // fw
    fr = [im.crop((i * fw, row * fh, i * fw + fw, row * fh + fh)) for i in range(n)]
    return [fr[i] for i in pick] if pick else fr


def union_bbox(frames):
    box = None
    for f in frames:
        b = f.getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box or (0, 0, 1, 1)


def trim(frames, anchor="foot"):
    b = union_bbox(frames)
    out = [f.crop(b) for f in frames]
    w, h = b[2] - b[0], b[3] - b[1]
    a = [w // 2, h - 1] if anchor == "foot" else [w // 2, h // 2]
    return out, a


def flip(frames):
    return [f.transpose(Image.FLIP_LEFT_RIGHT) for f in frames]


def tone(im, mul=1.0, sat=1.0):
    """darken and desaturate, for the far horse of a team"""
    px = im.load()
    out = im.copy()
    op = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            l = (r + g + b) / 3
            r, g, b = l + (r - l) * sat, l + (g - l) * sat, l + (b - l) * sat
            op[x, y] = (int(r * mul), int(g * mul), int(b * mul), a)
    return out


def hue_swap(im, rules):
    """rules: list of (test(h,s,v) -> bool, (dh, smul, vmul))"""
    import colorsys
    out = im.copy()
    px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            for test, (nh, sm, vm) in rules:
                if test(h, s, v):
                    h2 = nh if nh is not None else h
                    rr, gg, bb = colorsys.hsv_to_rgb(h2 % 1, min(1, s * sm), min(1, v * vm))
                    px[x, y] = (int(rr * 255), int(gg * 255), int(bb * 255), a)
                    break
    return out


# --------------------------------------------------------------------------
# a tiny vector sprite kit (same idea as NOVA's): parts, shading, outline
# --------------------------------------------------------------------------
OUTLINE = (34, 22, 18, 255)


class Canvas:
    def __init__(self, w, h):
        self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        self.w, self.h = w, h

    def poly(self, pts, col):
        self.d.polygon([(round(x), round(y)) for x, y in pts], fill=col)

    def rect(self, x0, y0, x1, y1, col):
        self.d.rectangle([x0, y0, x1, y1], fill=col)

    def line(self, pts, col, w=1):
        self.d.line([(round(x), round(y)) for x, y in pts], fill=col, width=w)

    def px(self, x, y, col):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((int(x), int(y)), col)

    def ellipse(self, box, col, outline=None):
        self.d.ellipse(box, fill=col, outline=outline)

    def outline(self, col=OUTLINE):
        src = self.im.copy().load()
        out = self.im.load()
        for y in range(self.h):
            for x in range(self.w):
                if src[x, y][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < self.w and 0 <= yy < self.h and src[xx, yy][3] > 128:
                        out[x, y] = col
                        break
        return self


def dither_fill(c, x0, y0, x1, y1, ca, cb, t0, t1, axis="y"):
    """a dithered two-tone gradient inside an existing shape's alpha"""
    px = c.im.load()
    for y in range(max(0, y0), min(c.h, y1)):
        for x in range(max(0, x0), min(c.w, x1)):
            if not px[x, y][3]:
                continue
            u = (y - y0) / max(1, y1 - y0) if axis == "y" else (x - x0) / max(1, x1 - x0)
            u = t0 + (t1 - t0) * u
            if BAYER[y % 4][x % 4] / 16 < u:
                px[x, y] = cb
            else:
                px[x, y] = ca


# --------------------------------------------------------------------------
# the wagon: canvas bonnet, plank bed, spoked wheels that turn
# --------------------------------------------------------------------------
WOOD = [hexrgb(h) + (255,) for h in ["#3A2416", "#5C3A22", "#7E5230", "#A06E40", "#C28E58"]]
IRON = [hexrgb(h) + (255,) for h in ["#1E1C20", "#3A3840", "#5E5C66"]]
CANVAS = [hexrgb(h) + (255,) for h in ["#8E8068", "#B8A888", "#D8CCAE", "#EEE6D0", "#FAF6EA"]]
PATCH = [hexrgb(h) + (255,) for h in ["#7A5A3A", "#9A7A52", "#6A7A5A"]]


def wheel(c, cx, cy, r, ang):
    c.ellipse([cx - r, cy - r, cx + r, cy + r], IRON[1])
    c.ellipse([cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2], (0, 0, 0, 0))
    ring = Image.new("L", (c.w, c.h), 0)
    rd = ImageDraw.Draw(ring)
    rd.ellipse([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1], outline=255)
    for y in range(c.h):
        for x in range(c.w):
            if ring.getpixel((x, y)):
                c.px(x, y, WOOD[1])
    for k in range(8):
        a = ang + k * TAU / 8
        c.line([(cx + math.cos(a) * 2, cy + math.sin(a) * 2), (cx + math.cos(a) * (r - 2), cy + math.sin(a) * (r - 2))], WOOD[2])
    c.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], WOOD[0])
    c.px(cx, cy, IRON[2])
    # iron tyre highlight on the top-left
    for k in range(6):
        a = math.pi * 1.1 + k * 0.12
        c.px(round(cx + math.cos(a) * r), round(cy + math.sin(a) * r), IRON[2])


def wagon_frame(step, wear):
    W, H = 104, 62
    c = Canvas(W, H)
    # bonnet: a soft arch over the bed
    top, bed = 6, 38
    x0, x1 = 16, 92
    pts = [(x0, bed)]
    for i in range(0, 21):
        u = i / 20
        x = x0 + (x1 - x0) * u
        bulge = math.sin(u * math.pi) ** 0.55
        y = bed - (bed - top) * bulge - (2 if 0.1 < u < 0.9 else 0)
        pts.append((x, y))
    pts.append((x1, bed))
    c.poly(pts, CANVAS[3])
    # shading: lit from the upper left
    px = c.im.load()
    for y in range(H):
        for x in range(W):
            if px[x, y][3] and px[x, y] == CANVAS[3]:
                u = (x - x0) / (x1 - x0) * 0.8 + (y - top) / (bed - top) * 0.5
                d = BAYER[y % 4][x % 4] / 16
                idx = 4 if u < 0.25 else 3 if u < 0.55 + d * 0.1 else 2 if u < 0.95 + d * 0.1 else 1
                px[x, y] = CANVAS[idx]
    # hoops under the canvas
    for hx in (26, 42, 58, 74, 86):
        for y in range(top + 3, bed):
            if px[hx, y][3] and px[hx, y] not in (CANVAS[0],):
                px[hx, y] = CANVAS[1]
    # the puckered opening at the back
    c.ellipse([88, 16, 96, 36], CANVAS[0])
    c.ellipse([90, 19, 95, 34], hexrgb("#3E3228") + (255,))
    # wear: stains, then patches and a frayed edge
    rnd = random.Random(7)
    if wear >= 1:
        for _ in range(5):
            sx, sy = rnd.randint(22, 82), rnd.randint(14, 34)
            for dx in range(-2, 3):
                for dy in range(-1, 2):
                    if px[sx + dx, sy + dy][3] and rnd.random() < 0.6:
                        px[sx + dx, sy + dy] = CANVAS[1]
        c.rect(60, 20, 66, 25, PATCH[1])
        c.line([(60, 20), (66, 20)], PATCH[0])
    if wear >= 2:
        c.rect(30, 26, 37, 32, PATCH[2])
        c.line([(30, 26), (37, 26)], PATCH[0])
        c.rect(70, 12, 75, 17, PATCH[0])
        for x in range(40, 56, 3):
            c.px(x, bed - 1, (0, 0, 0, 0))
    # the bed: planks, a darker side board, the jockey box up front
    c.rect(10, bed, 96, bed + 9, WOOD[2])
    c.line([(10, bed), (96, bed)], WOOD[4])
    c.line([(10, bed + 4), (96, bed + 4)], WOOD[1])
    for bx in range(14, 96, 12):
        c.line([(bx, bed + 1), (bx, bed + 8)], WOOD[1])
    c.rect(4, bed - 6, 14, bed + 4, WOOD[3])
    c.line([(4, bed - 6), (14, bed - 6)], WOOD[4])
    # water cask and a bucket hanging at the side
    c.ellipse([50, bed + 2, 58, bed + 12], WOOD[3])
    c.line([(50, bed + 7), (58, bed + 7)], IRON[1])
    # the tongue reaching to the team
    c.line([(0, bed + 10), (10, bed + 7)], WOOD[1], 2)
    # wheels: the rear is bigger; spokes turn with the step
    ang = step / 8 * TAU / 8
    wheel(c, 80, 49, 12, ang)
    wheel(c, 24, 51, 10, ang * 1.2)
    c.outline()
    return c.im


# --------------------------------------------------------------------------
# stones, graves, buildings, props
# --------------------------------------------------------------------------
STONE = [hexrgb(h) + (255,) for h in ["#2E2E36", "#4A4A54", "#6A6A76", "#8C8C98", "#B0B0BA"]]
MOSS = [hexrgb(h) + (255,) for h in ["#3A5A2A", "#5A7E36"]]
GLOW = hexrgb("#9CF0D8") + (255,)


def shade_rock(c, seed, lit=(-0.7, -0.7)):
    rnd = random.Random(seed)
    px = c.im.load()
    ys = [y for y in range(c.h) for x in range(c.w) if px[x, y][3]]
    if not ys:
        return
    cx = sum(x for y in range(c.h) for x in range(c.w) if px[x, y][3]) / len(ys)
    cy = sum(ys) / len(ys)
    for y in range(c.h):
        for x in range(c.w):
            if not px[x, y][3]:
                continue
            nx, ny = (x - cx) / max(1, c.w / 2), (y - cy) / max(1, c.h / 2)
            u = nx * lit[0] + ny * lit[1] + (rnd.random() - 0.5) * 0.35
            d = BAYER[y % 4][x % 4] / 16 - 0.5
            idx = max(0, min(4, int(2.2 + u * 2.2 + d * 0.9)))
            px[x, y] = STONE[idx]


def standing_stone(kind, awake=False):
    if kind == 0:     # tall monolith
        c = Canvas(22, 50)
        c.poly([(6, 49), (4, 20), (7, 4), (13, 1), (17, 8), (18, 30), (16, 49)], STONE[2])
    elif kind == 1:   # leaning
        c = Canvas(28, 44)
        c.poly([(4, 43), (6, 22), (12, 3), (19, 2), (22, 12), (20, 43)], STONE[2])
    else:             # a pair with a lintel
        c = Canvas(44, 42)
        c.poly([(3, 41), (4, 12), (9, 10), (12, 41)], STONE[2])
        c.poly([(31, 41), (32, 11), (38, 12), (40, 41)], STONE[2])
        c.poly([(1, 11), (3, 5), (40, 4), (43, 10)], STONE[2])
    shade_rock(c, kind)
    px = c.im.load()
    rnd = random.Random(kind + 3)
    # moss on the shaded feet
    for y in range(c.h - 10, c.h):
        for x in range(c.w):
            if px[x, y][3] and rnd.random() < 0.35:
                px[x, y] = MOSS[rnd.randint(0, 1)]
    # carved marks
    marks = [(c.w // 2 - 2, 16), (c.w // 2, 20), (c.w // 2 - 1, 24), (c.w // 2 + 1, 28)]
    for mx, my in marks:
        if 0 <= my < c.h and px[mx, my][3]:
            px[mx, my] = GLOW if awake else STONE[0]
            if my + 1 < c.h and px[mx, my + 1][3]:
                px[mx, my + 1] = GLOW if awake else STONE[0]
    c.outline(hexrgb("#16161C") + (255,))
    return c.im


def tombstone(kind):
    if kind == 0:
        c = Canvas(16, 20)
        c.poly([(2, 19), (2, 6), (4, 2), (8, 0), (12, 2), (14, 6), (14, 19)], STONE[3])
        shade_rock(c, 11)
        c.line([(8, 5), (8, 13)], STONE[0]); c.line([(5, 8), (11, 8)], STONE[0])
    else:
        c = Canvas(14, 22)
        c.rect(6, 1, 8, 21, WOOD[2]); c.rect(1, 6, 13, 8, WOOD[2])
        c.line([(6, 1), (6, 21)], WOOD[3]); c.line([(1, 6), (13, 6)], WOOD[3])
    # a mound of earth
    c.ellipse([0, c.h - 5, c.w - 1, c.h + 3], WOOD[1])
    c.outline()
    return c.im


def fort():
    c = Canvas(140, 76)
    # palisade of sharpened logs
    for x in range(8, 132, 5):
        h = 44 + (x * 7 % 5)
        c.poly([(x, 75), (x, 75 - h + 4), (x + 2, 75 - h), (x + 4, 75 - h + 4), (x + 4, 75)], WOOD[2] if x % 10 else WOOD[3])
        c.line([(x, 75 - h + 5), (x, 75)], WOOD[4])
    # the gate
    c.rect(56, 42, 84, 75, WOOD[1])
    c.line([(70, 42), (70, 75)], WOOD[0])
    for y in (50, 62):
        c.line([(56, y), (84, y)], IRON[1])
    # a watchtower with a flag
    c.rect(106, 12, 128, 40, WOOD[2])
    c.poly([(102, 14), (117, 2), (132, 14)], WOOD[1])
    c.rect(110, 20, 124, 26, hexrgb("#1A120C") + (255,))
    c.line([(117, 2), (117, -8)], WOOD[0])
    c.poly([(118, 0), (130, 3), (118, 6)], hexrgb("#B83A2A") + (255,))
    for y in range(40, 76, 6):
        c.line([(108, y), (126, y + 6)], WOOD[1]); c.line([(126, y), (108, y + 6)], WOOD[1])
    c.outline()
    return c.im


def cabin():
    c = Canvas(72, 52)
    c.rect(6, 20, 66, 51, WOOD[2])
    for y in range(20, 52, 4):
        c.line([(6, y), (66, y)], WOOD[1]); c.line([(6, y + 1), (66, y + 1)], WOOD[3])
    c.poly([(0, 22), (36, 2), (72, 22)], WOOD[1])
    for k in range(0, 36, 4):
        c.line([(k, 22 - k * 20 / 36), (k + 36, 2 + k * 20 / 36)], WOOD[0])
    c.rect(52, 0, 58, 12, STONE[2])
    c.rect(28, 32, 40, 51, WOOD[0])
    c.rect(12, 28, 22, 36, hexrgb("#F2C66A") + (255,))
    c.line([(17, 28), (17, 36)], WOOD[0]); c.line([(12, 32), (22, 32)], WOOD[0])
    c.outline()
    return c.im


def tent():
    c = Canvas(40, 28)
    c.poly([(0, 27), (20, 2), (40, 27)], CANVAS[2])
    dither_fill(c, 0, 0, 40, 28, CANVAS[3], CANVAS[1], 0.1, 0.9, axis="x")
    c.poly([(16, 27), (20, 12), (24, 27)], hexrgb("#3E3228") + (255,))
    c.line([(20, 2), (20, -2)], WOOD[0])
    c.outline()
    return c.im


def signpost():
    c = Canvas(26, 30)
    c.rect(11, 6, 13, 29, WOOD[2])
    c.poly([(1, 5), (20, 5), (25, 9), (20, 13), (1, 13)], WOOD[3])
    c.line([(4, 9), (18, 9)], WOOD[1])
    c.outline()
    return c.im


def raft():
    c = Canvas(100, 18)
    for x in range(4, 96, 6):
        c.rect(x, 6, x + 5, 12, WOOD[2]); c.line([(x, 6), (x + 5, 6)], WOOD[4])
    c.rect(2, 8, 97, 9, WOOD[1])
    c.line([(10, 6), (10, 0)], WOOD[0]); c.line([(90, 6), (90, 0)], WOOD[0])
    c.outline()
    return c.im


def water_frames(pal, n=4, w=64, h=28):
    out = []
    cols = [hexrgb(x) + (255,) for x in pal]
    for f in range(n):
        im = Image.new("RGBA", (w, h))
        px = im.load()
        for y in range(h):
            for x in range(w):
                wave = math.sin((x / w) * TAU * 2 + f / n * TAU + y * 0.35) * 0.5 + math.sin((x / w) * TAU * 3 - f / n * TAU) * 0.3
                u = y / h + wave * 0.12
                d = BAYER[y % 4][x % 4] / 16 - 0.5
                idx = max(0, min(len(cols) - 1, int(u * (len(cols) - 1) + d * 0.6 + 0.3)))
                px[x, y] = cols[idx]
                if y > 1 and ((x + f * 4 + y * 3) % 41 == 0) and y % 7 == f % 7:
                    px[x, y] = cols[-1]
        out.append(im)
    return out


def icon(kind):
    c = Canvas(12, 12)
    if kind == "food":
        c.ellipse([1, 3, 10, 11], hexrgb("#B88A52") + (255,)); c.rect(4, 1, 7, 4, hexrgb("#8A6238") + (255,)); c.line([(3, 6), (8, 6)], hexrgb("#7A5230") + (255,))
    elif kind == "water":
        c.ellipse([2, 1, 9, 11], WOOD[3]); c.line([(2, 4), (9, 4)], IRON[1]); c.line([(2, 8), (9, 8)], IRON[1])
    elif kind == "clothing":
        c.poly([(1, 3), (4, 1), (7, 1), (10, 3), (9, 5), (8, 4), (8, 11), (3, 11), (3, 4), (2, 5)], hexrgb("#5A7AB8") + (255,))
    elif kind == "shot":
        for i, x in enumerate((2, 5, 8)):
            c.rect(x, 3, x + 1, 10, hexrgb("#C8A040") + (255,)); c.rect(x, 2, x + 1, 3, IRON[2])
    elif kind == "wheel":
        c.ellipse([1, 1, 10, 10], None, outline=WOOD[1])
        c.line([(5, 1), (5, 10)], WOOD[2]); c.line([(1, 5), (10, 5)], WOOD[2]); c.line([(2, 2), (9, 9)], WOOD[2]); c.line([(9, 2), (2, 9)], WOOD[2])
    elif kind == "medicine":
        c.rect(3, 3, 8, 11, hexrgb("#6AB8A0") + (255,)); c.rect(4, 1, 7, 3, WOOD[2]); c.rect(5, 5, 6, 9, (255, 255, 255, 255)); c.rect(4, 6, 7, 7, (255, 255, 255, 255))
    elif kind == "money":
        c.ellipse([1, 2, 10, 11], hexrgb("#E0B040") + (255,)); c.ellipse([3, 4, 8, 9], hexrgb("#F4D070") + (255,))
    elif kind == "team":
        c.poly([(2, 11), (3, 5), (6, 2), (9, 1), (10, 4), (8, 6), (8, 11)], hexrgb("#8A5A34") + (255,)); c.px(8, 3, (20, 12, 8, 255))
    elif kind == "heart":
        c.poly([(6, 11), (1, 5), (1, 3), (3, 1), (6, 3), (9, 1), (11, 3), (11, 5)], hexrgb("#D84A4A") + (255,))
    elif kind == "morale":
        c.ellipse([1, 1, 10, 10], hexrgb("#F0C850") + (255,)); c.px(4, 4, (40, 30, 10, 255)); c.px(7, 4, (40, 30, 10, 255)); c.line([(3, 7), (5, 8), (6, 8), (8, 7)], (40, 30, 10, 255))
    elif kind == "sun":
        c.ellipse([2, 2, 9, 9], hexrgb("#FFD060") + (255,))
    elif kind == "moon":
        c.ellipse([2, 2, 9, 9], hexrgb("#E8ECFF") + (255,)); c.ellipse([4, 1, 11, 8], (0, 0, 0, 0))
    c.outline()
    return c.im


# --------------------------------------------------------------------------
# land: gradient-map every source layer into its biome's daylight ramp
# --------------------------------------------------------------------------
def gradient_map(im, ramp, key=None, lift=0.0, contrast=1.0):
    cols = [hexrgb(h) for h in ramp]
    out = Image.new("RGBA", im.size)
    src, px = im.load(), out.load()
    keyc = set(key or [])
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = src[x, y]
            if a < 10 or (r, g, b) in keyc:
                continue
            l = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            l = min(1, max(0, (l - 0.5) * contrast + 0.5 + lift))
            f = l * (len(cols) - 1)
            i = int(f)
            u = f - i
            d = BAYER[y % 4][x % 4] / 16
            j = min(len(cols) - 1, i + (1 if u > d else 0))
            px[x, y] = cols[j] + (a,)
    return out


def top_colors(im, rows=4):
    from collections import Counter
    c = Counter()
    px = im.load()
    for y in range(min(rows, im.height)):
        for x in range(im.width):
            c[px[x, y][:3]] += 1
    return [k for k, _ in c.most_common(3)]


def key_sky(im, tol=18, rows=6):
    """make the flat sky behind a painted layer transparent"""
    keys = top_colors(im, rows)
    out = im.copy()
    px = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            for kr, kg, kb in keys:
                if abs(r - kr) + abs(g - kg) + abs(b - kb) < tol:
                    px[x, y] = (0, 0, 0, 0)
                    break
    return out


def flood_sky(im, tol=26):
    """clear the sky by flooding in from the top edge: only colour connected to
    the sky goes, so a pale ridge of the same tone below it survives"""
    out = im.copy()
    px = out.load()
    W, H = im.size
    seen = bytearray(W * H)
    stack = [(x, 0) for x in range(W)]
    for x in range(W):
        seen[x] = 1
    while stack:
        x, y = stack.pop()
        r, g, b, a = px[x, y]
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                r2, g2, b2, a2 = px[nx, ny]
                if a2 == 0 or abs(r2 - r) + abs(g2 - g) + abs(b2 - b) <= tol:
                    seen[ny * W + nx] = 1
                    stack.append((nx, ny))
    return out


def half(im):
    return im.resize((im.width // 2, im.height // 2), Image.NEAREST)


def crop_alpha(im):
    b = im.getbbox()
    return (im.crop(b), b[1]) if b else (im, 0)


def ground_strip_painted(ramp):
    """ansimuz's tall grass, sand path and near grass, recoloured into the biome"""
    src = load("ansimuz-country-platform", "layers", "country-platform-tileset.png").crop((32, 106, 96, 160))
    return gradient_map(src, ramp, contrast=1.08)


def ground_strip(pal, seed, kind):
    """a 320x56 tileable ground band: fringe, verge, the wheel road, near edge"""
    W, H = 320, 56
    rnd = random.Random(seed)
    im = Image.new("RGBA", (W, H))
    px = im.load()
    C = [hexrgb(h) + (255,) for h in pal]     # 0 dark .. 5 light; road colours 6,7
    for y in range(H):
        for x in range(W):
            n = (math.sin(x * 0.21 + seed) + math.sin(x * 0.047 + y * 0.3 + seed * 2)) * 0.5
            d = BAYER[y % 4][x % 4] / 16 - 0.5
            if y < 6:
                base = 3
            elif 18 <= y < 34:     # the road
                base = 6 if (y in (21, 22, 29, 30)) else 7
            else:
                base = 2 if y < 18 else 1 if y > 46 else 2
            if base in (6, 7):
                col = C[6] if (base == 6 or (n + d * 0.8) > 0.55) else C[7]
            else:
                idx = max(0, min(5, base + int(round(n * 1.2 + d))))
                col = C[idx]
            px[x, y] = col
    # a ragged top edge and blades of grass (or stones / snow crust)
    for x in range(W):
        h = int(3 + 3 * abs(math.sin(x * 0.9 + seed)) + rnd.random() * 2)
        for y in range(0, 6 - min(5, h // 2)):
            px[x, y] = (0, 0, 0, 0)
        if kind in ("grass", "snow") and rnd.random() < 0.4:
            top = rnd.randint(0, 3)
            for y in range(top, top + rnd.randint(2, 5)):
                if y < H:
                    px[x, y] = C[5] if rnd.random() < 0.5 else C[4]
    # pebbles in the road, tufts on the verges
    for _ in range(40):
        x, y = rnd.randrange(W), rnd.randint(19, 32)
        px[x, y] = C[5]; px[(x + 1) % W, y] = C[4]
    for _ in range(90):
        x, y = rnd.randrange(W), rnd.choice([rnd.randint(8, 16), rnd.randint(36, 54)])
        if 0 <= y < H:
            px[x, y] = C[4 if kind != "salt" else 5]
    return im


LAND = {
    "meadow": {
        "far": (("atariboy-snow", "Background layers", "layer 4 mountain.png"), ["#6A82A8", "#86A0C0", "#A6BED4", "#C8D8E4", "#E6EEF2"], 0.5, 170),
        "mid": (("ansimuz-country-platform", "layers", "country-platform-forest.png"), ["#1E3A2A", "#2E5234", "#44703E", "#62904C", "#88B060"], 1.0, 192),
        "ground": (["#2A4418", "#3E6222", "#5A8430", "#7EA83E", "#A8CC5C", "#D0E88A", "#8A6A42", "#A8845A"], "grass"),
        "clouds": "cliffs", "midRows": 64,
    },
    "river": {
        "far": (("ansimuz-rocky-pass", "PNG", "middle.png"), ["#5A7A94", "#7894AA", "#98B0C0", "#BACCD6", "#DCE8EC"], 1.0, 172),
        "mid": (("ansimuz-magical-road", "Layers", "middle.png"), ["#143228", "#1E4A36", "#2E6844", "#4A8A52", "#78AE62"], 1.0, 196),
        "ground": (["#24402A", "#345A34", "#4A7A40", "#68A050", "#90C068", "#C0E098", "#6A5A42", "#86745A"], "grass"),
        "clouds": "cliffs", "midRows": 70,
    },
    "barrens": {
        "far": (("ansimuz-rocky-pass", "PNG", "middle.png"), ["#4A4450", "#6A6070", "#8C8090", "#B0A4AC", "#D4CACA"], 1.0, 176),
        "mid": (("ansimuz-rocky-pass", "PNG", "near.png"), ["#3A2A28", "#5A4038", "#7E5A48", "#A07A5E", "#C8A080"], 1.0, 196),
        "ground": (["#3A302A", "#524238", "#6E5A4A", "#8C765E", "#AE9678", "#D0BA98", "#7A6852", "#968268"], "stone"),
        "clouds": "cliffs", "midRows": 120,
    },
    "highwood": {
        "far": (("atariboy-snow", "Background layers", "layer 4 mountain.png"), ["#2A3A40", "#3A5054", "#50686A", "#6E8884", "#94AEA4"], 0.5, 172),
        "mid": (("atariboy-snow", "Background layers", "layer 1 florest.png"), ["#0E2018", "#163022", "#20442C", "#2E5A38", "#467A48"], 0.5, 194),
        "ground": (["#1C2C18", "#2A4020", "#3A5A2A", "#527A36", "#709A48", "#98BC68", "#5A4A34", "#72604A"], "grass"),
        "clouds": None,
    },
    "pass": {
        "far": (("atariboy-snow", "Background layers", "layer 4 mountain.png"), ["#6A7AA0", "#8A9AC0", "#AEBCDA", "#D2DCEE", "#F4F8FF"], 0.5, 172),
        "mid": (("atariboy-snow", "Background layers", "layer 1 florest.png"), ["#2A3448", "#3E4A62", "#566680", "#7A8CA8", "#A8B8D0"], 0.5, 194),
        "ground": (["#8A94AC", "#A8B2C8", "#C4CCDC", "#DCE2EE", "#EEF2F8", "#FFFFFF", "#9AA2B4", "#B4BAC8"], "snow"),
        "clouds": "cliffs",
    },
    "saltmere": {
        "far": (("ansimuz-super-mountain-dusk", "Assets", "Version C", "layers", "far-mountains.png"), ["#4E4A78", "#6A6690", "#8A86AC", "#AEAAC8", "#D4D2E4"], 1.0, 262),
        "mid": (("foozle-desert", "Foozle_2DT0007_Cave_and_Desert_Tileset_Pixel_Art", "Backgrounds", "Desert", "PNGs", "Desert Background Desert Layer 3.png"), ["#9A8A78", "#B8A690", "#D2C2AA", "#E8DCC6", "#F8F0E0"], 0.5, 196),
        "ground": (["#B8B2A8", "#CCC6BC", "#DCD8CE", "#EAE6DE", "#F4F2EC", "#FFFFFF", "#C2BCB0", "#D4D0C6"], "salt"),
        "clouds": "dusk", "midRows": 58,
    },
    "coast": {
        "far": (("ansimuz-magic-cliffs", "PNG", "far-grounds.png"), ["#2A5A50", "#3E7A62", "#5A9A72", "#86BA86", "#B8D8A0"], 1.0, 150),
        "mid": (("ansimuz-magical-road", "Layers", "middle.png"), ["#1A3A34", "#26523E", "#3A704C", "#5A905E", "#86B278"], 1.0, 196),
        "ground": (["#2A4424", "#3E6230", "#588240", "#78A450", "#A0C46C", "#CCE09A", "#8A7A5A", "#A69474"], "grass"),
        "clouds": "cliffs",
        "sea": True, "noMid": True,
    },
}
CLOUDS = {
    "cliffs": (("ansimuz-magic-cliffs", "PNG", "clouds.png"), 1.0),
    "rocky": (("ansimuz-rocky-pass", "PNG", "back.png"), 1.0),
    "dusk": (("ansimuz-super-mountain-dusk", "Assets", "Version C", "layers", "clouds.png"), 1.0),
}


def build_land():
    pieces = {}   # name -> image
    meta = {}
    for name, (path, scale) in CLOUDS.items():
        im = load(*path)
        if scale != 1:
            im = half(im)
        if name == "rocky":
            im = key_sky(im, tol=22)
        # clouds become a neutral white ramp; the light tints them
        g = gradient_map(im, ["#8A8AA0", "#B0B0C4", "#D0D0DE", "#EAEAF2", "#FFFFFF"], key=None)
        g, oy = crop_alpha(g)
        pieces["clouds_" + name] = g
        meta["clouds_" + name] = {"y": oy}
    for biome, spec in LAND.items():
        for depth in ("far", "mid"):
            path, ramp, scale, _ = spec[depth]
            im = load(*path)
            if scale != 1:
                im = half(im)
            im = flood_sky(im, tol=14) if spec.get("flood") else key_sky(im, tol=20)
            g = gradient_map(im, ramp)
            g, oy = crop_alpha(g)
            keep = spec.get(depth + "Rows")
            if keep and g.height > keep:
                g = g.crop((0, 0, g.width, keep))      # just the skyline; the ground covers the rest
            key = biome + "_" + depth
            pieces[key] = g
            meta[key] = {"y": oy, "bottomPad": im.height - (oy + g.height)}
        pal, kind = spec["ground"]
        ramp = [pal[0], pal[1], pal[2], pal[3], pal[4], pal[7], pal[5]]
        pieces[biome + "_ground"] = ground_strip_painted(ramp)
        meta[biome + "_ground"] = {"y": 0}
    # the sea band for the coast
    sea = load("ansimuz-magic-cliffs", "PNG", "sea.png")
    pieces["coast_sea"] = gradient_map(sea, ["#2A6A80", "#3E88A0", "#5AA8BC", "#86C8D4", "#C0E8EC"])
    meta["coast_sea"] = {"y": 0}
    return pieces, meta


# --------------------------------------------------------------------------
# logo and icon
# --------------------------------------------------------------------------
FONT_OLD = R("font-notjam-old-style-11", "NotJamOldStyle11", "NotJamOldStyle14.ttf")
FONT_OLD11 = R("font-notjam-old-style-11", "NotJamOldStyle11", "NotJamOldStyle11.ttf")
FONT_MONO = R("font-monogram", "monogram.ttf")


def wheel_heart(size):
    """the O of the mark: a spoked wagon wheel with a heart for a hub"""
    c = Canvas(size, size)
    cx = cy = size / 2 - 0.5
    r = size / 2 - 1
    c.ellipse([0, 0, size - 1, size - 1], WOOD[1])
    c.ellipse([3, 3, size - 4, size - 4], (0, 0, 0, 0))
    ring = Image.new("L", (size, size))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([1, 1, size - 2, size - 2], outline=255, width=2)
    for y in range(size):
        for x in range(size):
            if ring.getpixel((x, y)):
                c.px(x, y, WOOD[3] if (x + y) < size else WOOD[2])
    for k in range(8):
        a = k * TAU / 8 + TAU / 16
        c.line([(cx + math.cos(a) * 4, cy + math.sin(a) * 4), (cx + math.cos(a) * (r - 2), cy + math.sin(a) * (r - 2))], WOOD[3], 2)
    hs = size * 0.32
    heart = [(cx, cy + hs * 0.75), (cx - hs * 0.75, cy - hs * 0.05), (cx - hs * 0.6, cy - hs * 0.55), (cx - hs * 0.2, cy - hs * 0.6), (cx, cy - hs * 0.3),
             (cx + hs * 0.2, cy - hs * 0.6), (cx + hs * 0.6, cy - hs * 0.55), (cx + hs * 0.75, cy - hs * 0.05)]
    c.poly(heart, hexrgb("#D8483E") + (255,))
    c.px(int(cx - hs * 0.35), int(cy - hs * 0.3), hexrgb("#FFB0A0") + (255,))
    c.outline(hexrgb("#1E120C") + (255,))
    return c.im


def logo_tile():
    font = ImageFont.truetype(FONT_OLD, 28)     # 14px design at 2x
    text = "WAGONHEART"
    # draw each letter; the O becomes the wheel
    mask = Image.new("L", (300, 40))
    d = ImageDraw.Draw(mask)
    d.fontmode = "1"
    x = 2
    o_at = None
    for ch in text:
        if ch == "O":
            o_at = x
            x += 26
            continue
        d.text((x, 2), ch, font=font, fill=255)
        x += int(font.getlength(ch)) + 1
    W = x + 2
    mask = mask.crop((0, 0, W, 40))
    b = mask.getbbox()
    top, bot = b[1], b[3]
    img = Image.new("RGBA", (W, 40))
    px, mk = img.load(), mask.load()
    grad = [hexrgb(h) for h in ["#FFF4D8", "#F8DCA0", "#E8B060", "#C88040", "#9A5A2C"]]
    for y in range(40):
        for xx in range(W):
            if mk[xx, y]:
                u = (y - top) / max(1, bot - top)
                dd = BAYER[y % 4][xx % 4] / 16 - 0.5
                i = max(0, min(4, int(u * 4 + dd * 0.8 + 0.2)))
                px[xx, y] = grad[i] + (255,)
    # wood grain lines through the letters
    for y in range(top + 5, bot, 6):
        for xx in range(W):
            if mk[xx, y] and (xx + y) % 7:
                r, g, bb, a = px[xx, y]
                px[xx, y] = (int(r * 0.88), int(g * 0.85), int(bb * 0.8), 255)
    # a hard drop shadow and outline
    sh = Image.new("RGBA", (W + 3, 44))
    shp = sh.load()
    for y in range(40):
        for xx in range(W):
            if px[xx, y][3]:
                for dx, dy in ((1, 1), (2, 2), (2, 3)):
                    if xx + dx < W + 3 and y + dy < 44:
                        shp[xx + dx, y + dy] = (40, 20, 10, 255)
    sh.alpha_composite(img, (0, 0))
    c = Canvas(sh.width, sh.height)
    c.im = sh
    c.d = ImageDraw.Draw(sh)
    c.w, c.h = sh.size
    c.outline(hexrgb("#1E120C") + (255,))
    w = wheel_heart(24)
    c.im.alpha_composite(w, (o_at, top + (bot - top) // 2 - 12))
    return c.im


def icon_tile(wagon, horse):
    S = 64
    im = Image.new("RGBA", (S, S))
    px = im.load()
    sky = [hexrgb(h) for h in ["#2E2A5A", "#6A3E6E", "#C0605A", "#F0A050", "#FFD080"]]
    for y in range(S):
        for x in range(S):
            u = y / 44
            dd = BAYER[y % 4][x % 4] / 16 - 0.5
            i = max(0, min(4, int(u * 4 + dd * 0.7)))
            px[x, y] = sky[i] + (255,)
    # the sun, huge and low
    for y in range(S):
        for x in range(S):
            dist = math.hypot(x - 32, y - 40)
            if dist < 17:
                px[x, y] = hexrgb("#FFE6A0" if dist < 14 else "#FFC870") + (255,)
    # the hill
    for x in range(S):
        hy = int(46 + 5 * math.sin(x / S * math.pi * 1.4 + 0.4))
        for y in range(hy, S):
            px[x, y] = hexrgb("#2A3A20" if y > hy + 1 else "#4A5A2A") + (255,)
    # the wagon and team as a silhouette on the ridge
    sil = wagon.copy().resize((wagon.width // 2, wagon.height // 2), Image.NEAREST)
    hs = horse.copy().resize((horse.width // 2, horse.height // 2), Image.NEAREST)
    for spr, ox, oy in ((sil, 6, 20), (hs, 40, 29)):
        sp = spr.load()
        for y in range(spr.height):
            for x in range(spr.width):
                if sp[x, y][3] > 100 and 0 <= ox + x < S and 0 <= oy + y < S:
                    px[ox + x, oy + y] = hexrgb("#1A1210") + (255,)
    # rounded corners and a warm rim
    r = 10
    for y in range(S):
        for x in range(S):
            cxr, cyr = min(max(x, r), S - 1 - r), min(max(y, r), S - 1 - r)
            if math.hypot(x - cxr, y - cyr) > r:
                px[x, y] = (0, 0, 0, 0)
    for y in range(S):
        for x in range(S):
            if not px[x, y][3]:
                continue
            edge = any(not (0 <= x + dx < S and 0 <= y + dy < S) or not px[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge:
                px[x, y] = hexrgb("#F8DCA0") + (255,)
    return im


# --------------------------------------------------------------------------
# fonts
# --------------------------------------------------------------------------
CHARS = ("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" ".,!?'\"-:;()/%+<>*=[]#&@$ ")


def bake(path, size):
    f = ImageFont.truetype(path, size)
    out = {}
    for ch in CHARS:
        mask = f.getmask(ch, mode="1")
        w, h = mask.size
        img = Image.new("RGBA", (max(w, 1), max(h, 1)))
        if w and h:
            p = img.load()
            for y in range(h):
                for x in range(w):
                    if mask.getpixel((x, y)):
                        p[x, y] = (255, 255, 255, 255)
        bb = f.getbbox(ch)
        out[ch] = {"img": img, "adv": int(round(f.getlength(ch))), "dx": bb[0], "dy": bb[1]}
    asc, desc = f.getmetrics()
    return out, asc, desc


# --------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------
def build():
    clips = {}       # name -> (frames, ms, anchor)

    def add(name, frames, ms, mode="foot"):
        fr, a = trim(frames, mode)
        clips[name] = (fr, ms, a)

    H = ("scratchio-animated-horse",)
    walk = strip(H + ("Horse_Walk.png",), 60)
    add("horse_walk", walk, 95)
    add("horse_walk_far", [tone(f, 0.72, 0.8) for f in walk], 95)
    add("horse_idle", strip(H + ("Horse_Idle.png",), 60), 140)
    add("horse_idle_far", [tone(f, 0.72, 0.8) for f in strip(H + ("Horse_Idle.png",), 60)], 140)
    add("horse_run", strip(H + ("Horse_Run.png",), 60), 75)
    add("horse_eat", strip(H + ("Horse_Eat.png",), 60), 150)
    A = ("scratchio-wild-animals",)
    for animal, fw, anims in (("Deer", 72, ("Walk", "Run", "Idle")), ("Boar", 64, ("Walk", "Run", "Idle")), ("Bear", 64, ("Walk", "Run", "Idle")),
                              ("Wolf", 64, ("Walk", "Run", "Howl")), ("Fox", 64, ("Walk", "Run", "Idle")), ("Rabbit", 32, ("Hop", "Run", "Idle"))):
        for an in anims:
            add("%s_%s" % (animal.lower(), an.lower()), strip(A + (animal, "%s_%s.png" % (animal, an)), fw), 80 if an == "Run" else 110 if an != "Idle" else 150)
    # people: three frontier men (Skab: side walk is columns 3-5) and three women (ScratchIO, recoloured)
    sk = ("skab-walkcycles", "walkcyclevarious.png")
    for i, name in enumerate(("man_bowler", "man_tophat", "man_coat")):
        fr = flip(strip(sk, 64, 59, row=i, cols=12, pick=[3, 4, 5, 4]))
        add(name + "_walk", fr, 170)
        add(name + "_idle", [fr[1]], 400)
    W_ = ("scratchio-slavic-woman",)
    wwalk, widle = flip(strip(W_ + ("Woman_Walk.png",), 22)), flip(strip(W_ + ("Woman_Idle.png",), 22))
    variants = {
        "woman_red": [],
        "woman_blue": [(lambda h, s, v: s > 0.35 and (h < 0.06 or h > 0.92), (0.6, 0.9, 0.9))],
        "woman_green": [(lambda h, s, v: s > 0.35 and (h < 0.06 or h > 0.92), (0.3, 0.8, 0.8)), (lambda h, s, v: 0.1 < h < 0.18 and s > 0.3, (0.07, 0.9, 0.55))],
    }
    for name, rules in variants.items():
        add(name + "_walk", [hue_swap(f, rules) for f in wwalk], 130)
        add(name + "_idle", [hue_swap(f, rules) for f in widle], 150)
    add("campfire", strip(("arlantr-campfire", "campfire-sprite-sheet.png"), 32), 110)
    crow = load("smithygames-crow", "Crow.png")
    add("crow_fly", [crow.crop((i * 48, 0, i * 48 + 48, 48)) for i in range(7)], 90, "centre")
    rain = strip(("daungames-rain", "rain effect.png"), 25)
    add("rain", rain, 60, "centre")

    # drawn here
    for wear in range(3):
        clips["wagon_%d" % wear] = trim([wagon_frame(s, wear) for s in range(8)], "foot")[0], 90, None
        fr = clips["wagon_%d" % wear][0]
        clips["wagon_%d" % wear] = (fr, 90, [fr[0].width // 2, fr[0].height - 1])
    for k in range(3):
        add("stone_%d" % k, [standing_stone(k)], 1000)
        add("stone_%d_awake" % k, [standing_stone(k, True)], 1000)
    add("grave_stone", [tombstone(0)], 1000)
    add("grave_cross", [tombstone(1)], 1000)
    add("fort", [fort()], 1000)
    add("cabin", [cabin()], 1000)
    add("tent", [tent()], 1000)
    add("signpost", [signpost()], 1000)
    add("raft", [raft()], 1000, "centre")
    add("water_river", water_frames(["#1E4A5A", "#2A6A7A", "#3E8A94", "#62AAAE", "#A8DCD4"]), 180, "centre")
    add("water_sea", water_frames(["#1A4A6A", "#2A6A8A", "#3E8AAA", "#62AAC4", "#B0E0EC"]), 200, "centre")
    # props from ScratchIO
    fd = load("scratchio-props", "forest_decorations.png")
    add("tree_oak", [fd.crop((88, 2, 153, 96))], 1000)
    add("tree_oak2", [fd.crop((171, 12, 228, 96))], 1000)
    add("bush_berry", [fd.crop((33, 43, 63, 64))], 1000)
    add("bush", [fd.crop((1, 43, 31, 64))], 1000)
    dd = load("scratchio-props", "desert_decorations.png")
    add("tree_joshua", [dd.crop((7, 3, 80, 80))], 1000)
    add("tree_joshua2", [dd.crop((92, 22, 144, 80))], 1000)
    add("rock_a", [dd.crop((305, 27, 336, 48))], 1000)
    add("rock_b", [dd.crop((304, 58, 336, 80))], 1000)
    add("shrub", [dd.crop((213, 58, 251, 80))], 1000)
    pine = load("ansimuz-magical-road", "Layers", "tree.png")
    add("tree_pine", [pine], 1000)
    for k in ("food", "water", "clothing", "shot", "wheel", "medicine", "money", "team", "heart", "morale", "sun", "moon"):
        add("icon_" + k, [icon(k)], 1000, "centre")

    tiles = {}
    wagon_im = clips["wagon_0"][0][0]
    tiles["logo_wagonheart"] = logo_tile()
    tiles["icon_wagonheart"] = icon_tile(wagon_im, clips["horse_walk"][0][0])
    tiles["wheel_heart"] = wheel_heart(32)

    # ---- pack the sprite atlas
    ATLAS_W = 1024
    entries = [(n, i, f) for n, (frs, ms, a) in clips.items() for i, f in enumerate(frs)]
    order = sorted(range(len(entries)), key=lambda k: (-entries[k][2].height, k))
    placed, x, y, shelf = {}, 0, 0, 0
    for k in order:
        f = entries[k][2]
        if x + f.width > ATLAS_W:
            x, y, shelf = 0, y + shelf + 1, 0
        placed[k] = (x, y)
        x += f.width + 1
        shelf = max(shelf, f.height)
    y += shelf + 2
    manifest = {"grid": {"width": 320, "height": 240}, "atlas": {"file": "atlas.png"}, "clips": {}, "tiles": {}, "fonts": {}, "land": {"file": "land.png", "layers": {}}}
    pastes = []
    for k, (n, i, f) in enumerate(entries):
        px_, py_ = placed[k]
        pastes.append((f, px_, py_))
        frs, ms, a = clips[n]
        c = manifest["clips"].setdefault(n, {"ms": ms, "anchor": a, "frames": []})
        c["frames"].append([px_, py_, f.width, f.height])
    # fonts
    fy = y
    for fname, (path, size) in {"old": (FONT_OLD11, 11), "big": (FONT_OLD, 14), "mono": (FONT_MONO, 16)}.items():
        faces, asc, desc = bake(path, size)
        entry = {"height": asc + desc, "line": asc + desc + 2, "baseline": asc, "glyphs": {}}
        fx = rowh = 0
        for ch in CHARS:
            e = faces[ch]
            im = e["img"]
            if fx + im.width > ATLAS_W:
                fx, fy, rowh = 0, fy + rowh + 1, 0
            pastes.append((im, fx, fy))
            entry["glyphs"][ch] = [fx, fy, im.width, im.height, e["adv"], e["dx"], e["dy"]]
            fx += im.width + 1
            rowh = max(rowh, im.height)
        fy += rowh + 2
        manifest["fonts"][fname] = entry
    tx, ty, sh = 0, fy, 0
    for name in sorted(tiles, key=lambda k: -tiles[k].height):
        t = tiles[name]
        if tx + t.width > ATLAS_W:
            tx, ty, sh = 0, ty + sh + 1, 0
        pastes.append((t, tx, ty))
        manifest["tiles"][name] = [tx, ty, t.width, t.height]
        tx += t.width + 1
        sh = max(sh, t.height)
    atlas = Image.new("RGBA", (ATLAS_W, ty + sh + 2))
    for im, a, b in pastes:
        atlas.alpha_composite(im, (a, b))

    # ---- land
    pieces, meta = build_land()
    LW = 1024
    lx = ly = lsh = 0
    lp = []
    for name in sorted(pieces, key=lambda k: -pieces[k].height):
        im = pieces[name]
        if lx + im.width > LW:
            lx, ly, lsh = 0, ly + lsh + 1, 0
        lp.append((im, lx, ly))
        manifest["land"]["layers"][name] = {"rect": [lx, ly, im.width, im.height], "y": meta[name]["y"]}
        lx += im.width + 1
        lsh = max(lsh, im.height)
    land = Image.new("RGBA", (LW, ly + lsh + 2))
    for im, a, b in lp:
        land.alpha_composite(im, (a, b))
    # base: the screen row the bottom of each layer rests on
    manifest["land"]["biomes"] = {b: {"clouds": s["clouds"], "farBase": s["far"][3], "midBase": s["mid"][3], "sea": bool(s.get("sea")), "noMid": bool(s.get("noMid"))} for b, s in LAND.items()}
    manifest["credits"] = [
        "Horse, wild animals, woman, props: ScratchIO (CC0)", "Frontier walkers: Skab (CC0)",
        "Landscapes: ansimuz (CC0), atariboy (CC0), Foozle (CC0)", "Campfire: ArlanTR (CC0)", "Crow: SmithyGames (CC0)", "Rain: daungames (CC0)",
        "Fonts: NotJam Old Style (CC0), monogram by datagoblin (CC0)",
        "Wagon, stones, graves, buildings, water, road, icons, logo: generated by tools/wagonart/build.py",
    ]
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, "atlas.png"), optimize=True)
    land.save(os.path.join(OUT, "land.png"), optimize=True)
    with open(os.path.join(OUT, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, separators=(",", ":"))
    print("atlas %dx%d, %d clips, land %dx%d, %d layers" % (atlas.width, atlas.height, len(clips), land.width, land.height, len(pieces)))


if __name__ == "__main__":
    build()
