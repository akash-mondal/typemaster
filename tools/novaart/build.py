#!/usr/bin/env python3
"""
NOVA - pixel asset builder.

Every sprite is authored here as vector parts, then rasterised at its real
pixel size with no antialiasing. Rotating ships are rasterised once per angle
from the rotated shapes, so each angle is crisp pixel art rather than a rotated
bitmap. Parts are shaded from a fixed light (upper left) and outlined.

    python3 tools/novaart/build.py

Writes assets/nova/atlas.png and assets/nova/manifest.json. The manifest has
the same shape as KATA's: clips (animated frames with an anchor), tiles
(single images) and fonts (Pixel Operator, CC0, baked hard 1-bit).
"""

import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "nova")
sys.path.insert(0, os.path.join(ROOT, "tools", "flowart"))
import font as FT  # noqa: E402
sys.path.insert(0, HERE)
import fleet as FL  # noqa: E402

TAU = math.pi * 2


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# --------------------------------------------------------------------------
# palette
# --------------------------------------------------------------------------
# ramps run dark -> light; shading picks a step from the part's ramp
RAMP = {
    "hull":   ["#0B1A2A", "#1C4466", "#2F7AA8", "#5FB8E0", "#B8F0FF"],   # the player's ship
    "canopy": ["#2A1A06", "#8A5A12", "#F4B93D", "#FFE08A", "#FFF8DC"],
    "steel":  ["#0E0C14", "#2A2436", "#4A4058", "#766A86", "#B2A8C0"],   # enemy armour
    "rust":   ["#1A0A0C", "#4A1A1E", "#8A2E2E", "#C8543C", "#F09A6A"],
    "venom":  ["#12061A", "#3A0E4A", "#7A1E8A", "#C048C8", "#F4A8F0"],
    "glowr":  ["#3A0610", "#9A1426", "#FF3A4E", "#FF8A8A", "#FFE0E0"],   # enemy lights
    "glowc":  ["#06283A", "#0E6A8A", "#3AD8FF", "#9CF4FF", "#F0FFFF"],   # player lights
    "gold":   ["#2A1A06", "#7A5210", "#E0A62C", "#FFD86A", "#FFF6C8"],
    "leaf":   ["#062014", "#0E5A30", "#2AB860", "#7CF0A0", "#DCFFE8"],
    "iris":   ["#140A2E", "#3A2078", "#7A4AE0", "#B48CFF", "#EAD8FF"],
    "bone":   ["#1C1A22", "#4A4652", "#8A8494", "#C8C2D0", "#F4F2F8"],
}
OUTLINE = (6, 6, 12, 255)


def ramp(name, i):
    r = RAMP[name]
    return hexrgb(r[max(0, min(len(r) - 1, i))]) + (255,)


# --------------------------------------------------------------------------
# a sprite: parts drawn into a mask, shaded, outlined
# --------------------------------------------------------------------------
class Sprite:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.part = [[None] * w for _ in range(h)]    # (ramp, level) per pixel

    def poly(self, pts, rampname, level=2):
        m = Image.new("L", (self.w, self.h), 0)
        ImageDraw.Draw(m).polygon([(round(x), round(y)) for x, y in pts], fill=255)
        px = m.load()
        for y in range(self.h):
            for x in range(self.w):
                if px[x, y]:
                    self.part[y][x] = (rampname, level)

    def disc(self, cx, cy, r, rampname, level=2):
        for y in range(self.h):
            for x in range(self.w):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                    self.part[y][x] = (rampname, level)

    def dot(self, x, y, rampname, level):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.part[y][x] = (rampname, level)

    def image(self, shade=True, outline=True, glow=()):
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        px = img.load()
        P = self.part
        get = lambda x, y: P[y][x] if 0 <= x < self.w and 0 <= y < self.h else None
        for y in range(self.h):
            for x in range(self.w):
                p = P[y][x]
                if not p:
                    continue
                rn, lv = p
                if shade and rn not in glow:
                    up, lf = get(x, y - 1), get(x - 1, y)
                    dn, rt = get(x, y + 1), get(x + 1, y)
                    # lit from the upper left: an exposed top/left edge catches it
                    if (up is None or up[0] != rn) or (lf is None or lf[0] != rn):
                        lv += 1
                    if (dn is None or dn[0] != rn) and (rt is None or rt[0] != rn):
                        lv -= 1
                px[x, y] = ramp(rn, lv)
        if outline:
            src = img.copy().load()
            for y in range(self.h):
                for x in range(self.w):
                    if src[x, y][3]:
                        continue
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < self.w and 0 <= yy < self.h and src[xx, yy][3]:
                            px[x, y] = OUTLINE
                            break
        return img


def rot(pts, a, cx, cy, s=1.0):
    ca, sa = math.cos(a), math.sin(a)
    return [(cx + (x * ca - y * sa) * s, cy + (x * sa + y * ca) * s) for x, y in pts]


def mirror(pts):
    return [(-x, y) for x, y in reversed(pts)]


# --------------------------------------------------------------------------
# ships (all authored pointing UP, i.e. toward -y)
# --------------------------------------------------------------------------
def player_frame(a):
    S = Sprite(23, 23)
    c = 11.5
    wing = [(-2, -1), (-8, 4), (-8, 6.5), (-5, 6), (-2, 4)]
    S.poly(rot(wing, a, c, c), "hull", 1)
    S.poly(rot(mirror(wing), a, c, c), "hull", 1)
    S.poly(rot([(-1.5, 6), (-1.5, 7.5), (1.5, 7.5), (1.5, 6)], a, c, c), "canopy", 2)
    S.poly(rot([(0, -9), (2.5, -3), (2.5, 4), (1, 6.5), (-1, 6.5), (-2.5, 4), (-2.5, -3)], a, c, c), "hull", 2)
    S.poly(rot([(0, -5), (1.2, -2.5), (0, 0.5), (-1.2, -2.5)], a, c, c), "glowc", 3)
    for sx in (-7, 7):
        x, y = rot([(sx, 5.5)], a, c, c)[0]
        S.dot(x, y, "glowc", 3)
    return S.image(glow=("glowc",))


def drone_frame(spin, r=4.2, spikes=6, size=15, rampname="steel", eye="glowr"):
    S = Sprite(size, size)
    c = size / 2
    for k in range(spikes):
        a = spin + k * TAU / spikes
        S.poly(rot([(-1.2, -r + 1), (0, -r - 3), (1.2, -r + 1)], a, c, c), rampname, 2)
    S.disc(c, c, r, rampname, 2)
    S.disc(c, c, 1.6, eye, 2)
    S.dot(c - 0.5, c - 0.5, eye, 4)
    return S.image(glow=(eye,))


def raptor_frame(a):
    S = Sprite(25, 25)
    c = 12.5
    wing = [(-2, -1), (-9, -4), (-9, -1), (-6, 3), (-2, 4)]
    S.poly(rot(wing, a, c, c), "rust", 1)
    S.poly(rot(mirror(wing), a, c, c), "rust", 1)
    S.poly(rot([(0, -8), (2.5, -3), (3, 5), (0, 7), (-3, 5), (-2.5, -3)], a, c, c), "steel", 2)
    S.poly(rot([(0, -6), (1, -3), (0, -1), (-1, -3)], a, c, c), "glowr", 2)
    for sx in (-2, 2):
        x, y = rot([(sx, 7)], a, c, c)[0]
        S.dot(x, y, "glowr", 3)
    return S.image(glow=("glowr",))


def missile_frame(a):
    S = Sprite(13, 13)
    c = 6.5
    S.poly(rot([(0, -4.5), (1.3, -2), (1.3, 3), (-1.3, 3), (-1.3, -2)], a, c, c), "bone", 2)
    S.poly(rot([(-1.3, 1.5), (-3, 3.5), (-1.3, 3)], a, c, c), "rust", 2)
    S.poly(rot([(1.3, 1.5), (3, 3.5), (1.3, 3)], a, c, c), "rust", 2)
    x, y = rot([(0, -3.6)], a, c, c)[0]
    S.dot(x, y, "glowr", 3)
    return S.image(glow=("glowr",))


def warden_frame(blink):
    """the heavy: faces DOWN, never turns"""
    S = Sprite(45, 33)
    cx = 22.5
    S.poly([(cx - 20, 4), (cx - 13, 1), (cx - 9, 10), (cx - 12, 24), (cx - 19, 22)], "venom", 1)
    S.poly([(cx + 20, 4), (cx + 13, 1), (cx + 9, 10), (cx + 12, 24), (cx + 19, 22)], "venom", 1)
    S.poly([(cx - 11, 2), (cx + 11, 2), (cx + 13, 16), (cx + 7, 28), (cx - 7, 28), (cx - 13, 16)], "steel", 2)
    S.poly([(cx - 6, 5), (cx + 6, 5), (cx + 7, 13), (cx - 7, 13)], "steel", 3)
    for k, bx in enumerate((cx - 7, cx, cx + 7)):
        S.poly([(bx - 1.5, 26), (bx + 1.5, 26), (bx + 1, 32), (bx - 1, 32)], "bone", 2)
    S.disc(cx, 19, 3.2, "glowr" if not blink else "venom", 2 if not blink else 3)
    for k in range(4):
        S.dot(cx - 17 + (1 if k % 2 else 0), 8 + k * 4, "glowr", 3 if (k + blink) % 2 else 1)
        S.dot(cx + 17 - (1 if k % 2 else 0), 8 + k * 4, "glowr", 3 if (k + blink) % 2 else 1)
    return S.image(glow=("glowr",))


def gemini_frame(ph):
    """the splitter: two drones bound by a tether; they wobble apart"""
    S = Sprite(25, 17)
    off = 5 + math.sin(ph * TAU) * 1.2
    cy = 8.5
    S.poly([(12.5 - off, cy - 1), (12.5 + off, cy - 1), (12.5 + off, cy + 1), (12.5 - off, cy + 1)], "iris", 3)
    for sx in (-1, 1):
        x = 12.5 + sx * off
        S.disc(x, cy, 4.2, "iris", 2)
        for k in range(4):
            a = ph * TAU * sx + k * TAU / 4
            S.poly(rot([(-1, -3.5), (0, -6), (1, -3.5)], a, x, cy), "iris", 1)
        S.disc(x, cy, 1.4, "glowr", 3)
    return S.image(glow=("glowr",))


def boss_frame(blink):
    """the mothership: faces down, 104x46; turret sockets are drawn by the game"""
    S = Sprite(105, 47)
    cx = 52.5
    S.poly([(cx - 50, 14), (cx - 30, 4), (cx - 22, 20), (cx - 30, 38), (cx - 46, 30)], "rust", 1)
    S.poly([(cx + 50, 14), (cx + 30, 4), (cx + 22, 20), (cx + 30, 38), (cx + 46, 30)], "rust", 1)
    S.poly([(cx - 28, 3), (cx + 28, 3), (cx + 34, 22), (cx + 18, 42), (cx - 18, 42), (cx - 34, 22)], "steel", 2)
    S.poly([(cx - 16, 7), (cx + 16, 7), (cx + 19, 20), (cx - 19, 20)], "steel", 3)
    S.poly([(cx - 9, 24), (cx + 9, 24), (cx + 6, 40), (cx - 6, 40)], "venom", 2)
    S.disc(cx, 31, 4.5, "glowr", 3 if blink else 2)
    for k in range(7):
        x = cx - 42 + k * 14
        if abs(x - cx) < 20:
            continue
        S.dot(x, 20 + (k % 2) * 3, "glowr", 3 if (k + blink) % 2 else 1)
    for bx in (cx - 26, cx - 13, cx + 13, cx + 26):
        S.poly([(bx - 2, 36), (bx + 2, 36), (bx + 1.5, 45), (bx - 1.5, 45)], "bone", 2)
    return S.image(glow=("glowr",))


def turret_frame(a):
    S = Sprite(13, 13)
    c = 6.5
    S.disc(c, c, 4.2, "steel", 2)
    S.poly(rot([(-1, -2), (-1, -6.2), (1, -6.2), (1, -2)], a, c, c), "bone", 2)
    S.disc(c, c, 1.5, "glowr", 3)
    return S.image(glow=("glowr",))


def capsule_frame(kind, ph):
    rn = {"nova": "glowc", "repair": "leaf", "stasis": "iris"}[kind]
    S = Sprite(13, 13)
    c = 6.5
    squash = abs(math.cos(ph * TAU))
    w = 1.5 + 3.3 * squash
    S.poly([(c - w, 3), (c + w, 3), (c + w, 10), (c - w, 10)], rn, 2)
    S.poly([(c - w, 2), (c + w, 2), (c + w * 0.6, 1), (c - w * 0.6, 1)], "bone", 3)
    S.poly([(c - w, 11), (c + w, 11), (c + w * 0.6, 12), (c - w * 0.6, 12)], "bone", 3)
    if squash > 0.45:
        sym = {"nova": [(c, 4), (c, 9), (c - 2, 6.5), (c + 2, 6.5)],
               "repair": [(c, 4), (c, 9), (c - 2, 6.5), (c + 2, 6.5)],
               "stasis": [(c - 1.5, 4.5), (c + 1.5, 8.5), (c + 1.5, 4.5), (c - 1.5, 8.5)]}[kind]
        for x, y in sym:
            S.dot(x, y, rn, 4)
        S.dot(c, 6.5, rn, 4)
    return S.image(glow=(rn,))


# --------------------------------------------------------------------------
# effects
# --------------------------------------------------------------------------
FIRE = ["#FFFFFF", "#FFF4B0", "#FFD060", "#FF9A30", "#E0502A", "#9A2A2A", "#4A1E2A", "#221A26"]
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def explosion_frames(size, n, seed, puffs=7):
    rnd = random.Random(seed)
    blobs = [(rnd.uniform(0, TAU), rnd.uniform(0.1, 0.55), rnd.uniform(0.35, 0.6)) for _ in range(puffs)]
    frames = []
    c = size / 2
    for i in range(n):
        u = i / (n - 1)
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        px = img.load()
        for y in range(size):
            for x in range(size):
                best = 0
                for a, dist, rad in blobs:
                    bx = c + math.cos(a) * dist * c * (0.4 + u)
                    by = c + math.sin(a) * dist * c * (0.4 + u)
                    rr = rad * c * (0.35 + 0.75 * math.sin(min(1, u * 1.6) * math.pi / 2))
                    d = math.hypot(x + 0.5 - bx, y + 0.5 - by) / max(0.5, rr)
                    best = max(best, 1 - d)
                if best <= 0:
                    continue
                heat = best * (1.25 - u * 1.1)          # hot at birth, smoke at the end
                t = BAYER[y % 4][x % 4] / 16 * 0.18
                idx = int((1 - min(1, max(0, heat + t))) * (len(FIRE) - 1))
                if u > 0.75 and best < 0.25 + (u - 0.75) * 2:
                    continue
                px[x, y] = hexrgb(FIRE[idx]) + (255,)
        frames.append(img)
    return frames


def spark_frames():
    out = []
    for i, pts in enumerate([[(2, 2)], [(2, 1), (1, 2), (3, 2), (2, 3), (2, 2)], [(2, 0), (0, 2), (4, 2), (2, 4)]]):
        img = Image.new("RGBA", (5, 5), (0, 0, 0, 0))
        for x, y in pts:
            img.putpixel((x, y), hexrgb("#FFF4B0" if i < 2 else "#FF9A30") + (255,))
        out.append(img)
    return out


def bolt_frames():
    out = []
    for i in range(2):
        img = Image.new("RGBA", (7, 7), (0, 0, 0, 0))
        px = img.load()
        for y in range(7):
            for x in range(7):
                d = math.hypot(x - 3, y - 3)
                if d <= 1.0:
                    px[x, y] = (240, 255, 255, 255)
                elif d <= 2.2:
                    px[x, y] = hexrgb("#6CF0FF") + (255 if (x + y + i) % 2 else 200,)
                elif d <= 3.0 and (x + y + i) % 2 == 0:
                    px[x, y] = hexrgb("#1F7AA8") + (180,)
        out.append(img)
    return out


def orb_frames():
    out = []
    for i in range(4):
        img = Image.new("RGBA", (9, 9), (0, 0, 0, 0))
        px = img.load()
        r = 2.6 + (0.6 if i in (1, 2) else 0)
        for y in range(9):
            for x in range(9):
                d = math.hypot(x - 4, y - 4)
                if d <= 1.2:
                    px[x, y] = (255, 230, 250, 255)
                elif d <= r:
                    px[x, y] = hexrgb("#F048C8") + (255,)
                elif d <= r + 1:
                    px[x, y] = hexrgb("#6A1460") + (255,)
        out.append(img)
    return out


def reticle_frames():
    out = []
    for i in range(4):
        s = 21
        img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        g = 10 - i * 1.5 if i < 3 else 6
        col = hexrgb("#FFB43C") + (255,)
        c = s // 2
        L = 3
        for sx in (-1, 1):
            for sy in (-1, 1):
                x0, y0 = c + sx * g, c + sy * g
                d.line([(x0, y0), (x0 - sx * L, y0)], fill=col)
                d.line([(x0, y0), (x0, y0 - sy * L)], fill=col)
        out.append(img)
    return out


# --------------------------------------------------------------------------
# backdrops: one nebula per sector, 320x240, dithered into its ramp
# --------------------------------------------------------------------------
SECTORS = {
    "drift": ["#05050E", "#0C0A20", "#1A1240", "#32205E", "#5A3490", "#9A64D0"],
    "ember": ["#0A0406", "#180A10", "#2E1218", "#521E22", "#86382E", "#C0704A"],
    "tide":  ["#02080C", "#06141C", "#0C2A34", "#145060", "#2A8A8C", "#7CD8CC"],
    "storm": ["#08040C", "#180A20", "#341238", "#5A1A58", "#9A3A7A", "#E8A0C8"],
}


def vnoise(seed):
    rnd = random.Random(seed)
    G = 64
    grid = [[rnd.random() for _ in range(G)] for _ in range(G)]

    def at(x, y):
        x0, y0 = int(math.floor(x)) % G, int(math.floor(y)) % G
        x1, y1 = (x0 + 1) % G, (y0 + 1) % G
        fx, fy = x - math.floor(x), y - math.floor(y)
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        a = grid[y0][x0] + (grid[y0][x1] - grid[y0][x0]) * fx
        b = grid[y1][x0] + (grid[y1][x1] - grid[y1][x0]) * fx
        return a + (b - a) * fy
    return at


def nebula(name, seed):
    ramp_ = [hexrgb(c) for c in SECTORS[name]]
    n1, n2 = vnoise(seed), vnoise(seed + 7)
    W, H = 320, 240
    img = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    px = img.load()
    rnd = random.Random(seed)
    for y in range(H):
        for x in range(W):
            # fbm, warped once so the clouds swirl
            wx = x / 70 + n2(x / 90, y / 90) * 2.2
            wy = y / 70 + n2(x / 90 + 5, y / 90 + 3) * 2.2
            v = 0
            amp, f, tot = 1, 1, 0
            for _ in range(4):
                v += n1(wx * f, wy * f) * amp
                tot += amp
                amp *= 0.5
                f *= 2.03
            v /= tot
            v = max(0.0, (v - 0.38) / 0.5)
            v = v ** 1.6
            # the band: heavier through a diagonal
            band = math.exp(-((y - H * 0.5 - (x - W / 2) * 0.35) / 90) ** 2)
            v = v * (0.45 + 0.75 * band)
            t = BAYER[y % 4][x % 4] / 16 - 0.5
            idx = int(max(0, min(len(ramp_) - 1, v * (len(ramp_) - 1) * 1.15 + t * 0.9)))
            px[x, y] = ramp_[idx] + (255,)
    # dust: faint fixed stars baked into the far layer
    for _ in range(140):
        x, y = rnd.randrange(W), rnd.randrange(H)
        b = rnd.random()
        col = ramp_[-1] if b > 0.85 else ramp_[-2] if b > 0.5 else ramp_[2]
        px[x, y] = col + (255,)
    return img


def planet(size, ramp_hex, seed, ring=False):
    rnd = random.Random(seed)
    n = vnoise(seed)
    W = size + (14 if ring else 0)
    img = Image.new("RGBA", (W, size), (0, 0, 0, 0))
    px = img.load()
    c = size / 2
    ox = (W - size) / 2
    ramp_ = [hexrgb(h) for h in ramp_hex]
    r = size / 2 - 1
    for y in range(size):
        for x in range(size):
            dx, dy = x + 0.5 - c, y + 0.5 - c
            d = math.hypot(dx, dy)
            if d > r:
                continue
            nz = math.sqrt(max(0, 1 - (d / r) ** 2))
            light = max(0, (-dx * 0.55 - dy * 0.45) / r + nz * 0.75)
            band = n(x / 6, y / 2.2) * 0.35
            v = light * 0.85 + band
            t = BAYER[y % 4][x % 4] / 16 - 0.5
            idx = int(max(0, min(len(ramp_) - 1, v * (len(ramp_) - 1) + t * 0.8)))
            px[int(x + ox), y] = ramp_[idx] + (255,)
    if ring:
        for k in range(900):
            a = k / 900 * TAU
            x = W / 2 + math.cos(a) * (size * 0.72)
            y = c + math.sin(a) * (size * 0.18) - math.cos(a) * size * 0.08
            behind = math.sin(a) < 0
            xi, yi = int(x), int(y)
            if 0 <= xi < W and 0 <= yi < size:
                if behind and px[xi, yi][3]:
                    continue
                px[xi, yi] = hexrgb(ramp_hex[-2]) + (255,)
    return img


# --------------------------------------------------------------------------
# the mark: NOVA in chunky sheared letters, the O a burst
# --------------------------------------------------------------------------
LOGO_GRAD = ["#FFFFFF", "#DFF8FF", "#9CEBFF", "#5FB8E0", "#7A64E0", "#B048C8"]


def logo_tile():
    W, H = 132, 40
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    shear = 0.28
    top, bot = 4, 34

    def P(pts, ox):
        return [(ox + x + (bot - y) * shear, y) for x, y in pts]
    # N
    ox = 4
    d.polygon(P([(0, top), (7, top), (18, 22), (18, top), (25, top), (25, bot), (18, bot), (7, 16), (7, bot), (0, bot)], ox), fill=255)
    # V
    ox = 66
    d.polygon(P([(0, top), (8, top), (14, 24), (20, top), (28, top), (17, bot), (11, bot)], ox), fill=255)
    # A
    ox = 97
    d.polygon(P([(10, top), (18, top), (29, bot), (21, bot), (19, 27), (9, 27), (7, bot), (-1, bot)], ox), fill=255)
    d.polygon(P([(11, 21), (17, 21), (14, 12)], ox), fill=0)
    mask = m.load()
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = img.load()
    grad = [hexrgb(h) for h in LOGO_GRAD]
    for y in range(H):
        for x in range(W):
            if mask[x, y]:
                u = (y - top) / (bot - top)
                t = BAYER[y % 4][x % 4] / 16 - 0.5
                idx = int(max(0, min(len(grad) - 1, u * (len(grad) - 1) + t * 0.9)))
                px[x, y] = grad[idx] + (255,)
    # the O: a ring with a four-point burst through it
    cx, cy = 50, 19
    for y in range(H):
        for x in range(W):
            dd = math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.05)
            if 9.5 <= dd <= 14.5:
                u = (y - top) / (bot - top)
                idx = int(max(0, min(len(grad) - 1, u * (len(grad) - 1))))
                px[x, y] = grad[idx] + (255,)
    # a star flaring in the O: long rays up and down, shorter across, tiny diagonals
    for k in range(8):
        a = k * TAU / 8 - math.pi / 2
        reach = (19 if k in (0, 4) else 15 if k in (2, 6) else 5)
        for s in range(0, reach):
            w = max(0, (1.6 if k % 2 == 0 else 0.6) - s * 0.08)
            for o in (-1, 0, 1):
                if abs(o) > w:
                    continue
                x = cx + math.cos(a) * s - math.sin(a) * o
                y = cy + math.sin(a) * s + math.cos(a) * o
                xi, yi = int(round(x)), int(round(y))
                if 0 <= xi < W and 0 <= yi < H:
                    px[xi, yi] = (255, 255, 255, 255) if s < 8 else hexrgb("#9CEBFF") + (255,)
    for x in range(int(cx - 3), int(cx + 4)):
        for y in range(int(cy - 3), int(cy + 4)):
            if math.hypot(x - cx, y - cy) <= 3:
                px[x, y] = (255, 255, 255, 255)
    # outline
    src = img.copy().load()
    for y in range(H):
        for x in range(W):
            if src[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < W and 0 <= yy < H and src[xx, yy][3]:
                    px[x, y] = (8, 6, 20, 255)
                    break
    return img


def icon_tile(neb):
    S = 64
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    src = neb.crop((120, 70, 120 + S, 70 + S))
    px, sp = img.load(), src.load()
    r = 10
    for y in range(S):
        for x in range(S):
            cxr = min(max(x, r), S - 1 - r)
            cyr = min(max(y, r), S - 1 - r)
            if math.hypot(x - cxr, y - cyr) > r:
                continue
            px[x, y] = sp[x, y]
    # the nova ring behind the ship
    for y in range(S):
        for x in range(S):
            if not px[x, y][3]:
                continue
            d = math.hypot(x + 0.5 - 32, y + 0.5 - 30)
            if 16 <= d <= 18:
                px[x, y] = hexrgb("#9CEBFF") + (255,)
            elif 18 < d <= 19.5 and (x + y) % 2 == 0:
                px[x, y] = hexrgb("#3A8AD8") + (255,)
            elif d < 16:
                glow = max(0, 1 - d / 16) * 0.35
                p = px[x, y]
                px[x, y] = tuple(min(255, int(p[i] + (200 - p[i]) * glow)) for i in range(3)) + (255,)
    ship = player_frame(0).resize((46, 46), Image.NEAREST)
    img.alpha_composite(ship, (9, 7))
    # a trail of three plasma bolts up and out of frame
    for k, y in enumerate((3, 9, 14)):
        for dx in (-1, 0, 1):
            img.putpixel((32 + dx, y), (240, 255, 255, 255) if dx == 0 else hexrgb("#6CF0FF") + (255,))
    # rim
    for y in range(S):
        for x in range(S):
            if not px[x, y][3]:
                continue
            edge = any(not (0 <= x + dx < S and 0 <= y + dy < S) or not px[x + dx, y + dy][3]
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge:
                px[x, y] = hexrgb("#6CF0FF") + (255,)
    return img


# --------------------------------------------------------------------------
# packing
# --------------------------------------------------------------------------
def build():
    clips = {}      # name -> (frames, ms, anchorMode)
    A32 = [i * TAU / 32 for i in range(32)]
    A24 = [i * TAU / 24 for i in range(24)]
    # ships, projectiles, pickups and small effects from the CC0 reference packs
    for name, (frames, ms, anchor) in FL.enemy_clips().items():
        clips[name] = (frames, ms, anchor)
    for name, (frames, ms, anchor) in FL.player_clips().items():
        clips[name] = (frames, ms, anchor)
    for name, (frames, ms, anchor) in FL.pickup_clips().items():
        clips[name] = (frames, ms, anchor)
    for name, (frames, ms, anchor) in FL.small_fx().items():
        clips[name] = (frames, ms, anchor)
    # drawn here: the mothership's weak points, and the generic effects
    clips["turret"] = ([turret_frame(a) for a in A24], 100, "centre")
    clips["boom_s"] = (explosion_frames(19, 8, 3), 55, "centre")
    clips["boom_m"] = (explosion_frames(33, 10, 11, 9), 60, "centre")
    clips["boom_l"] = (explosion_frames(61, 12, 29, 13), 70, "centre")
    clips["spark"] = (spark_frames(), 50, "centre")
    clips["bolt"] = (bolt_frames(), 60, "centre")
    clips["orb"] = (orb_frames(), 80, "centre")
    clips["reticle"] = (reticle_frames(), 60, "centre")

    tiles = {}
    nebs = {}
    for i, name in enumerate(SECTORS):
        nebs[name] = nebula(name, {"drift": 101, "ember": 173, "tide": 135, "storm": 152}[name])
        tiles["neb_" + name] = nebs[name]
    tiles["planet_a"] = planet(48, ["#1A0E24", "#3A1E48", "#6A3A70", "#A86A90", "#E8B0B8"], 5, ring=True)
    tiles["planet_b"] = planet(30, ["#06141C", "#0E3040", "#1E6070", "#4AA0A0", "#A8E8D8"], 9)
    tiles["planet_c"] = planet(22, ["#1C0A06", "#4A1E10", "#8A4020", "#D07A40", "#F8C890"], 13)
    tiles["logo_nova"] = logo_tile()
    tiles["icon_nova"] = icon_tile(nebs["drift"])

    ATLAS_W = 640
    entries = []
    for name, (frames, ms, mode) in clips.items():
        for i, f in enumerate(frames):
            entries.append((name, i, f))
    order = sorted(range(len(entries)), key=lambda n: (-entries[n][2].height, n))
    placed = {}
    x = y = shelf = 0
    for n in order:
        f = entries[n][2]
        if x + f.width > ATLAS_W:
            x, y, shelf = 0, y + shelf + 1, 0
        placed[n] = (x, y)
        x += f.width + 1
        shelf = max(shelf, f.height)
    y += shelf + 2

    manifest = {
        "grid": {"width": 320, "height": 240},
        "credits": ["Text font: Pixel Operator by Jayvee Enaguas (HarvettFox96), CC0 1.0"] + FL.CREDITS +
                   ["Nebulae, planets, logo, icon, explosions, bolts: generated by tools/novaart/build.py"],
        "atlas": {"file": "atlas.png"},
        "clips": {}, "tiles": {}, "fonts": {},
    }
    pastes = []
    for n, (name, i, f) in enumerate(entries):
        px_, py_ = placed[n]
        pastes.append((f, px_, py_))
        ms, mode = clips[name][1], clips[name][2]
        if isinstance(mode, list):
            anchor, mode = mode, "custom"
        else:
            anchor = [f.width // 2, f.height // 2] if mode == "centre" else [f.width // 2, f.height - 1]
        c = manifest["clips"].setdefault(name, {"ms": ms, "anchor": anchor, "anchorMode": mode, "frames": []})
        c["frames"].append([px_, py_, f.width, f.height])

    # fonts
    faces = FT.faces()
    fy = y
    for fname, (ttf, size) in FT.FACES.items():
        ft = ImageFont.truetype(os.path.join(FT.TTF, ttf), size)
        asc, desc = ft.getmetrics()
        g = faces[fname]
        entry = {"height": asc + desc, "line": asc + desc + 2, "baseline": asc, "glyphs": {}}
        fx = rowh = 0
        for ch in FT.CHARS:
            e = g[ch]
            im = e["img"]
            if fx + im.width > 512:
                fx, fy, rowh = 0, fy + rowh + 1, 0
            pastes.append((im, fx, fy))
            entry["glyphs"][ch] = [fx, fy, im.width, im.height, e["adv"], e["dx"], e["dy"]]
            fx += im.width + 1
            rowh = max(rowh, im.height)
        fy += rowh + 2
        manifest["fonts"][fname] = entry

    # tiles
    names = sorted(tiles, key=lambda k: (-tiles[k].height, k))
    tx, ty, sh = 0, fy, 0
    for name in names:
        t = tiles[name]
        if tx + t.width > ATLAS_W:
            tx, ty, sh = 0, ty + sh + 1, 0
        pastes.append((t, tx, ty))
        manifest["tiles"][name] = [tx, ty, t.width, t.height]
        tx += t.width + 1
        sh = max(sh, t.height)
    H = ty + sh + 2

    atlas = Image.new("RGBA", (ATLAS_W, H), (0, 0, 0, 0))
    for im, px_, py_ in pastes:
        atlas.alpha_composite(im.convert("RGBA"), (px_, py_))
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, "atlas.png"), optimize=True)
    # the star layers are tall; they get their own sheet
    layers = FL.sky_layers()
    sky = Image.new("RGBA", (sum(l.width for l in layers) + len(layers), max(l.height for l in layers)))
    sx = 0
    manifest["sky"] = {"file": "sky.png", "layers": []}
    for l in layers:
        sky.alpha_composite(l, (sx, 0))
        manifest["sky"]["layers"].append([sx, 0, l.width, l.height])
        sx += l.width + 1
    sky.save(os.path.join(OUT, "sky.png"), optimize=True)
    with open(os.path.join(OUT, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, separators=(",", ":"))
    print("atlas %dx%d, %d frames, %d clips, %d tiles" % (ATLAS_W, H, len(entries), len(clips), len(tiles)))


if __name__ == "__main__":
    build()
