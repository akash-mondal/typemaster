#!/usr/bin/env python3
"""Pixel pass and packing for VECTOR's pre-rendered sprites.

A frame arrives as three passes from Blender (common.py): b_ body, r_ rim, i_ ids.
clean() turns them into two same-sized images:
  body  RGBA  toon-shaded surfaces with darkened part seams; outline pixels are opaque black
  mask  RGB   R = rim light intensity, G = emissive light (255 strip, 200 core), B = outline flag
The game tints mask R and G with a bike's colour at load, so one render serves every colour.
tint() does the same thing here, for previews.
"""
from PIL import Image


def clean(folder, name):
    b = Image.open(f"{folder}/b_{name}.png").convert("RGBA")
    r = Image.open(f"{folder}/r_{name}.png").convert("RGBA")
    i = Image.open(f"{folder}/i_{name}.png").convert("RGBA")
    w, h = b.size
    bp, rp, ip = b.load(), r.load(), i.load()
    body = Image.new("RGBA", (w, h)); op = body.load()
    mask = Image.new("RGB", (w, h)); mp = mask.load()
    solid = lambda x, y: 0 <= x < w and 0 <= y < h and ip[x, y][3] > 0
    part = lambda x, y: round(ip[x, y][0] / 255 * 16)
    emit = lambda x, y: ip[x, y][1] > 128
    for y in range(h):
        for x in range(w):
            if not solid(x, y):
                if any(solid(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    op[x, y] = (0, 0, 0, 255)
                    mp[x, y] = (0, 0, 255)
                continue
            if emit(x, y):
                op[x, y] = (255, 255, 255, 255)
                mp[x, y] = (0, 255 if part(x, y) != 7 else 200, 0)
                continue
            cr, cg, cb, _ = bp[x, y]
            seam = any(solid(x + dx, y + dy) and not emit(x + dx, y + dy) and part(x + dx, y + dy) != part(x, y) for dx, dy in ((1, 0), (0, 1)))
            k = 0.62 if seam else 1.0
            op[x, y] = (int(cr * k), int(cg * k), int(cb * k), 255)
            rim = rp[x, y][0]
            mp[x, y] = (rim, 0, 0)
    return body, mask


def tint(body, mask, col):
    """What the game does at load: rim and light take the colour, outlines take a dark shade of it."""
    w, h = body.size
    out = body.copy(); op = out.load(); bp = body.load(); mp = mask.load()
    glow = Image.new("RGBA", (w, h)); gp = glow.load()
    ink = tuple(int(c * 0.16) for c in col)
    for y in range(h):
        for x in range(w):
            r, g, b, a = bp[x, y]
            if a == 0:
                continue
            mr, mg, mb = mp[x, y]
            if mb:
                op[x, y] = (*ink, 255)
            elif mg:
                k = 0.45 if mg == 255 else 0.7
                op[x, y] = tuple(min(255, int(c * (1 - k) + 255 * k)) for c in col) + (255,)
                gp[x, y] = (*col, 255)
            elif mr:
                f = mr / 255 * 0.8
                op[x, y] = (min(255, int(r + col[0] * f)), min(255, int(g + col[1] * f)), min(255, int(b + col[2] * f)), 255)
    return out, glow


def trim_box(images):
    """The union bounding box of several same-sized RGBA images."""
    box = None
    for im in images:
        bb = im.getbbox()
        if bb:
            box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
    return box


if __name__ == "__main__":
    import sys
    folder, out = sys.argv[1], sys.argv[2]
    cols = [(40, 235, 255), (255, 130, 30), (255, 60, 200)]
    names = sys.argv[3].split(",")
    sheet = Image.new("RGBA", (128 * len(names), 128 * len(cols)), (8, 10, 22, 255))
    for ci, col in enumerate(cols):
        for ni, n in enumerate(names):
            body, mask = clean(folder, n)
            im, _ = tint(body, mask, col)
            sheet.alpha_composite(im, (ni * 128, ci * 128))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(out)
    print("ok")
