"""
Kata splash art - the sumi-e slam when a special is triggered.

Four kanji, brush-rendered from Yuji Boku (SIL OFL 1.1) and rasterised 1-bit:
    TIGER  虎    CRANE  鶴    SHADOW 影    STILL  静

Each kata is a clip of 8 frames, 80x80:
    0-1  ink burst: black and vermilion droplets flung outward (seeded, baked)
    2-5  the kanji is PAINTED ON - revealed top to bottom as the brush would
         lay it, over a vermilion enso that rings the glyph
    6-7  hold, with the burst settling into a few falling drips

No alpha fades anywhere. Progressive reveal is what pixel art uses instead, and
it happens to look like brushwork.
"""

import math
import os
import random

from PIL import Image, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BRUSH = os.path.join(HERE, "ref", "brush", "YujiBoku-Regular.ttf")

W = H = 80
KANJI = [("tiger", "虎"), ("crane", "鶴"), ("shadow", "影"), ("still", "静")]

INK = (0x08, 0x08, 0x0F, 255)       # sumi black
INK2 = (0x1C, 0x1C, 0x28, 255)      # thinned ink
BONE = (0xE8, 0xF4, 0xEC, 255)      # the paper-white glyph
VERM = (0xC8, 0x2A, 0x2E, 255)      # vermilion seal red
VERM2 = (0x8A, 0x18, 0x1E, 255)


class G:
    def __init__(self):
        self.w, self.h = W, H
        self.px = [[(0, 0, 0, 0)] * W for _ in range(H)]

    def put(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H:
            self.px[y][x] = c

    def solid(self, x, y):
        return 0 <= x < W and 0 <= y < H and self.px[y][x][3] != 0

    def img(self):
        im = Image.new("RGBA", (W, H))
        im.putdata([self.px[y][x] for y in range(H) for x in range(W)])
        return im

    to_image = img


def glyph_mask(ch, size=58):
    f = ImageFont.truetype(BRUSH, size)
    m = f.getmask(ch, mode="1")
    bb = f.getbbox(ch)
    gw, gh = bb[2] - bb[0], bb[3] - bb[1]
    ox = (W - gw) // 2 - bb[0]
    oy = (H - gh) // 2 - bb[1]
    on = set()
    for y in range(m.size[1]):
        for x in range(m.size[0]):
            if m.getpixel((x, y)):
                X, Y = x + ox + bb[0], y + oy + bb[1]
                if 0 <= X < W and 0 <= Y < H:
                    on.add((X, Y))
    return on


def enso(rnd):
    """A rough brush circle. Thickness wobbles and the ring is left open at the
    end of the stroke, the way an enso is."""
    pts = set()
    cx, cy, r = W / 2.0, H / 2.0, 34.0
    for i in range(0, 340):                      # open at the top-right
        a = math.radians(i + 200)
        th = 2.2 + 1.6 * math.sin(i / 23.0) + rnd.uniform(-0.4, 0.4)
        for k in range(int(th) + 1):
            rr = r - k * 0.9 + rnd.uniform(-0.3, 0.3)
            pts.add((int(round(cx + math.cos(a) * rr)),
                     int(round(cy + math.sin(a) * rr))))
    return pts


def burst(rnd, n=42):
    parts = []
    for _ in range(n):
        a = rnd.uniform(0, math.tau)
        spd = rnd.uniform(3.0, 9.5)
        parts.append({"x": W / 2.0, "y": H / 2.0,
                      "vx": math.cos(a) * spd, "vy": math.sin(a) * spd,
                      "big": rnd.random() < 0.35,
                      "red": rnd.random() < 0.55})
    return parts


def kata_clip(name, ch, seed):
    rnd = random.Random(seed)
    mask = glyph_mask(ch)
    ring = enso(random.Random(seed + 1))
    parts = burst(rnd)
    ys = sorted({y for _, y in mask})
    y0, y1 = ys[0], ys[-1]
    frames = []
    for f in range(8):
        g = G()
        # --- ink burst, frames 0..3 fling, then settle as drips
        if f <= 3:
            for p in parts:
                # ink on a night sky is invisible, so the burst is mostly
                # vermilion and paper-white with black only as the heavy core
                col = VERM if p["red"] else (BONE if f <= 1 else INK2)
                x, y = p["x"], p["y"]
                g.put(x, y, col)
                if p["big"]:
                    g.put(x + 1, y, col); g.put(x, y + 1, col)
                    g.put(x + 1, y + 1, col if f <= 1 else INK)
                p["x"] += p["vx"]; p["y"] += p["vy"]
                p["vx"] *= 0.72; p["vy"] = p["vy"] * 0.72 + 0.9
        else:
            # a few drips still running down from the outer droplets
            for p in parts[:10]:
                p["y"] += 1.6
                g.put(p["x"], p["y"], INK2)
        # --- enso appears with the first brush stroke
        if f >= 2:
            for (x, y) in ring:
                g.put(x, y, VERM if (x + y) % 7 else VERM2)
        # --- the kanji, painted top to bottom over frames 2..5
        if f >= 2:
            reveal = min(1.0, (f - 2) / 3.0)
            cut = y0 + (y1 - y0 + 1) * reveal
            for (x, y) in mask:
                if y <= cut:
                    g.put(x, y, BONE)
            # a wet leading edge on the stroke being laid
            if reveal < 1.0:
                for (x, y) in mask:
                    if cut - 2 <= y <= cut:
                        g.put(x, y, INK2)
        frames.append(g)
    return frames


def clips():
    out = {}
    for i, (name, ch) in enumerate(KANJI):
        out["kata_" + name] = kata_clip(name, ch, 100 + i * 7)
    return out


if __name__ == "__main__":
    for k, v in clips().items():
        print(k, len(v), "frames")
