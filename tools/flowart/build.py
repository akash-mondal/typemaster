#!/usr/bin/env python3
"""
TYPEMAXX / FLOW - pixel asset builder.

Authors sprites at the real 320x240 target scale, writes a packed atlas PNG plus
a JSON manifest. Nothing here is antialiased: every pixel is placed explicitly.

    python3 build.py

Output lands in ../../assets/flow/
"""

import json
import math
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "assets", "flow"))

# --------------------------------------------------------------------------
# palette - 32 colours, shared by every asset in the game
# --------------------------------------------------------------------------

PAL = {
    # night sky, far to near
    "sky0": "#05070E", "sky1": "#0A0F1C", "sky2": "#111829", "sky3": "#1A2338",
    # architecture
    "bld0": "#070A11", "bld1": "#0D1220", "bld2": "#151D2E", "bld3": "#222D44",
    "tile0": "#2A1A20", "tile1": "#3E2830", "tile2": "#563843", "tile3": "#6E4A56",
    # the ninja
    "k0": "#04050A", "k1": "#0C111C", "k2": "#161E30", "k3": "#243149", "k4": "#3A4A68",
    # scarf
    "s0": "#4E0F14", "s1": "#7C1A20", "s2": "#AE2A32", "s3": "#D8454E",
    # skin and eyes
    "f0": "#8A7458", "f1": "#B99C78", "f2": "#E2CFAE", "eye": "#EAF4EE",
    # light
    "lamp0": "#6B3A12", "lamp1": "#B8721E", "lamp2": "#F2A63C", "lamp3": "#FFD98A",
    # text and ui
    "ink": "#E8F4EC", "dim": "#4F7A62", "hot": "#8DF0B4", "gold": "#F4B93D",
}


def hexrgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def rgb(name):
    h = PAL[name].lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


CLEAR = (0, 0, 0, 0)


# --------------------------------------------------------------------------
# tiny pixel canvas
# --------------------------------------------------------------------------

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[CLEAR] * w for _ in range(h)]

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return CLEAR

    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.put(x, y, c)

    def capsule(self, x0, y0, x1, y1, r0, r1, ramp):
        """A tapered limb. ramp is a list of colours, dark to light; the lit side
        is upper-right, matching the moon in the scene."""
        steps = int(max(abs(x1 - x0), abs(y1 - y0), 1)) * 4
        for i in range(steps + 1):
            t = i / steps
            cx = x0 + (x1 - x0) * t
            cy = y0 + (y1 - y0) * t
            r = r0 + (r1 - r0) * t
            ri = int(math.ceil(r))
            for dy in range(-ri, ri + 1):
                for dx in range(-ri, ri + 1):
                    d = math.hypot(dx, dy)
                    if d > r:
                        continue
                    # light from upper right
                    lit = (dx - dy) / (r * 2 + 0.001) + 0.5
                    idx = int(lit * (len(ramp) - 1) + 0.5)
                    idx = max(0, min(len(ramp) - 1, idx))
                    self.put(cx + dx, cy + dy, ramp[idx])

    def outline(self, c):
        """1px dark edge around the whole silhouette, drawn outward."""
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x][3] != 0:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.get(x + dx, y + dy)[3] != 0:
                        add.append((x, y))
                        break
        for x, y in add:
            self.put(x, y, c)

    def stamp(self, art, legend, ox, oy):
        """Hand-authored rows. '.' is transparent."""
        for j, row in enumerate(art):
            for i, ch in enumerate(row):
                if ch == ".":
                    continue
                self.put(ox + i, oy + j, legend[ch])

    def to_image(self):
        im = Image.new("RGBA", (self.w, self.h))
        im.putdata([self.px[y][x] for y in range(self.h) for x in range(self.w)])
        return im


# --------------------------------------------------------------------------
# the ninja - derived from a real human base, see derive.py
# --------------------------------------------------------------------------

import derive as DV
import font as FT
from PIL import ImageFont as _IF

NW, NH = DV.OUT_W, DV.OUT_H

# --------------------------------------------------------------------------
# atlas packing
# --------------------------------------------------------------------------

def build():
    dv = DV.clips()
    ms = {
        "ninja_run": 78, "ninja_jump": 105, "ninja_idle": 420,
        "ninja_strike": 62, "ninja_die": 120,
        "enemy_idle": 460, "enemy_wind": 150, "enemy_strike": 70,
        "enemy_die": 110, "slash": 45,
        "blood_spray": 55, "blood_pool": 90,
    }
    clips = {k: (v, ms.get(k, 100)) for k, v in dv.items()}

    # Anchors are PER CLIP, from that clip's own frame size. Using one anchor
    # taken from the largest cell drew the 16x16 slash 39px above its target -
    # it appeared over the fighters' heads instead of between their blades.
    #   'foot'   the point the character stands on: bottom centre
    #   'centre' the point an effect happens at: middle of the sprite
    ANCHOR = {
        "slash": "centre", "blood_spray": "centre",
        "blood_pool": "foot",
    }

    entries = []
    for name, (frames, ms) in clips.items():
        for i, f in enumerate(frames):
            entries.append((name, i, f, ms))

    cols = 8
    cw = max(e[2].w for e in entries)
    ch = max(e[2].h for e in entries)
    rows = (len(entries) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * cw, rows * ch), (0, 0, 0, 0))

    manifest = {
        "grid": {"width": 320, "height": 240},
        "credits": [
            "Character animation derived from 'Platformer Animations' by "
            "Clint Bellanger, CC-BY 3.0 - opengameart.org/content/platformer-animations"
        ],
        "palette": PAL,
        "atlas": {"file": "atlas.png", "cell": [cw, ch]},
        "clips": {},
    }

    for n, (name, i, f, ms) in enumerate(entries):
        x, y = (n % cols) * cw, (n // cols) * ch
        atlas.paste(f.to_image(), (x, y))
        mode = ANCHOR.get(name, "foot")
        anchor = ([f.w // 2, f.h // 2] if mode == "centre"
                  else [f.w // 2, f.h - 1])
        clip = manifest["clips"].setdefault(
            name, {"ms": ms, "anchor": anchor, "anchorMode": mode,
                   "frames": []})
        clip["frames"].append([x, y, f.w, f.h])

    # ---- fonts: bake Pixel Operator (CC0) into the same atlas
    faces = FT.faces()
    fy = rows * ch                      # start below the sprite rows
    manifest["fonts"] = {}
    pad_rows = []
    for fname, (ttf, size) in FT.FACES.items():
        ft = _IF.truetype(os.path.join(FT.TTF, ttf), size)
        asc, desc = ft.getmetrics()
        g = faces[fname]
        entry = {"height": asc + desc, "line": asc + desc + 2,
                 "baseline": asc, "glyphs": {}}
        fx = 0
        rowh = 0
        for cch in FT.CHARS:
            e = g[cch]
            im = e["img"]
            if fx + im.width > 512:
                fx = 0
                fy += rowh + 1
                rowh = 0
            pad_rows.append((im, fx, fy))
            entry["glyphs"][cch] = [fx, fy, im.width, im.height,
                                    e["adv"], e["dx"], e["dy"]]
            fx += im.width + 1
            rowh = max(rowh, im.height)
        fy += rowh + 2
        manifest["fonts"][fname] = entry

    # grow the atlas to fit the font rows, then paste them
    need_h = fy + 2
    if need_h > atlas.height or 512 > atlas.width:
        bigger = Image.new("RGBA", (max(atlas.width, 512),
                                    max(atlas.height, need_h)), (0, 0, 0, 0))
        bigger.paste(atlas, (0, 0))
        atlas = bigger
    for im, x, y in pad_rows:
        atlas.paste(im, (x, y))

    manifest["credits"].append(
        "Text font: Pixel Operator by Jayvee Enaguas (HarvettFox96), CC0 1.0 - "
        "public domain, no attribution required")

    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, "atlas.png"))
    with open(os.path.join(OUT, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)

    # loose PNGs, purely so the inspector can show each frame large
    loose = os.path.join(OUT, "frames")
    os.makedirs(loose, exist_ok=True)
    for name, i, f, ms in entries:
        f.to_image().save(os.path.join(loose, "%s_%02d.png" % (name, i)))

    print("atlas %dx%d, %d frames, %d clips"
          % (atlas.width, atlas.height, len(entries), len(clips)))
    for name, (frames, ms) in clips.items():
        print("  %-12s %d frames @ %dms" % (name, len(frames), ms))


if __name__ == "__main__":
    build()
