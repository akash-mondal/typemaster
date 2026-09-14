#!/usr/bin/env python3
"""
Trace the Commonsmade birds logo into an exact vector outline.

Marching squares over the PNG's anti-aliased alpha channel, with linear
interpolation along each cell edge, so every contour point lands at sub-pixel
accuracy on the 50% coverage line - the true edge of the artwork. The loop is
then simplified with Douglas-Peucker at a tolerance well under a pixel, which
keeps the long wedge edges dead straight and the rounded nose smooth.

Output: ../../assets/logo/commons_birds.json
    { "width": 1, "height": h/w, "outlines": [[[x, y], ...]], "holes": [...] }
normalised so the logo is 1 unit wide, centred on the origin, y up.
"""

import json
import math
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "logo_birds.png")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "assets", "logo", "commons_birds.json"))
ISO = 0.5
TOL = 0.18          # simplification tolerance in source pixels


def load_alpha():
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    a = im.split()[3]
    px = a.load()
    pad = 2                         # a clear border so every contour closes
    W, H = w + pad * 2, h + pad * 2
    grid = [[0.0] * W for _ in range(H)]
    for y in range(h):
        for x in range(w):
            grid[y + pad][x + pad] = px[x, y] / 255.0
    return grid, W, H, pad


def marching(grid, W, H):
    """Segments on the ISO line, as ((x0,y0),(x1,y1)) with consistent winding."""
    segs = []

    def lerp(p, q, vp, vq):
        t = (ISO - vp) / (vq - vp) if vq != vp else 0.5
        return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)

    for y in range(H - 1):
        for x in range(W - 1):
            tl, tr = grid[y][x], grid[y][x + 1]
            br, bl = grid[y + 1][x + 1], grid[y + 1][x]
            idx = (tl >= ISO) * 8 + (tr >= ISO) * 4 + (br >= ISO) * 2 + (bl >= ISO) * 1
            if idx in (0, 15):
                continue
            T = lerp((x, y), (x + 1, y), tl, tr)
            R = lerp((x + 1, y), (x + 1, y + 1), tr, br)
            B = lerp((x, y + 1), (x + 1, y + 1), bl, br)
            L = lerp((x, y), (x, y + 1), tl, bl)
            # inside is on the left of each segment's direction
            table = {
                1: [(L, B)], 2: [(B, R)], 3: [(L, R)], 4: [(R, T)],
                6: [(B, T)], 7: [(L, T)], 8: [(T, L)], 9: [(T, B)],
                11: [(T, R)], 12: [(R, L)], 13: [(R, B)], 14: [(B, L)],
            }
            if idx in (5, 10):
                centre = (tl + tr + br + bl) / 4
                if idx == 5:
                    table[5] = [(L, T), (R, B)] if centre >= ISO else [(T, R), (B, L)]
                else:
                    table[10] = [(T, L), (B, R)] if centre >= ISO else [(R, T), (L, B)]
            segs.extend(table[idx])
    return segs


def chain(segs):
    key = lambda p: (round(p[0], 6), round(p[1], 6))
    nxt = {}
    for a, b in segs:
        nxt[key(a)] = (a, b)
    loops, used = [], set()
    for k0 in list(nxt.keys()):
        if k0 in used:
            continue
        loop, k = [], k0
        while k in nxt and k not in used:
            used.add(k)
            a, b = nxt[k]
            loop.append(a)
            k = key(b)
        if len(loop) > 8:
            loops.append(loop)
    return loops


def area(loop):
    s = 0.0
    for i in range(len(loop)):
        x0, y0 = loop[i]
        x1, y1 = loop[(i + 1) % len(loop)]
        s += x0 * y1 - x1 * y0
    return s / 2


def dp(points, tol):
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1e-9
    best, idx = -1, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = abs(dy * px - dx * py + b[0] * a[1] - b[1] * a[0]) / L
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [a, b]
    return dp(points[:idx + 1], tol)[:-1] + dp(points[idx:], tol)


def simplify_loop(loop, tol):
    # split the closed loop at its two farthest-apart points, simplify halves
    i0 = 0
    far, i1 = -1, 0
    for i, p in enumerate(loop):
        d = (p[0] - loop[0][0]) ** 2 + (p[1] - loop[0][1]) ** 2
        if d > far:
            far, i1 = d, i
    half1 = loop[i0:i1 + 1]
    half2 = loop[i1:] + loop[:1]
    return dp(half1, tol)[:-1] + dp(half2, tol)[:-1]


def main():
    grid, W, H, pad = load_alpha()
    loops = chain(marching(grid, W, H))
    loops.sort(key=lambda l: -abs(area(l)))
    xs = [p[0] for l in loops for p in l]
    ys = [p[1] for l in loops for p in l]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    w, h = maxx - minx, maxy - miny
    s = 1.0 / w
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2

    outer_sign = 1 if area(loops[0]) > 0 else -1
    outlines, holes = [], []
    raw = simplified = 0
    for l in loops:
        raw += len(l)
        sl = simplify_loop(l, TOL)
        simplified += len(sl)
        norm = [[round((x - cx) * s, 5), round(-(y - cy) * s, 5)] for x, y in sl]
        (outlines if (area(l) > 0) == (outer_sign > 0) else holes).append(norm)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"source": "https://commonsmade.com/assets/logo_birds-CO8N2PNW.png",
               "width": 1.0, "height": round(h / w, 5),
               "colour": "#F3EEDD", "outlines": outlines, "holes": holes},
              open(OUT, "w"), separators=(",", ":"))
    print("loops", len(loops), "outlines", len(outlines), "holes", len(holes))
    print("points", raw, "->", simplified, " aspect h/w", round(h / w, 4))

    # verification render: fill the traced polygon at 4x and overlay the source
    S = 4
    from PIL import ImageDraw
    img = Image.new("RGBA", (int(w * S) + 20, int(h * S) + 20), (22, 26, 34, 255))
    d = ImageDraw.Draw(img)
    for poly in outlines:
        pts = [((x / s) * S + img.width / 2, (-y / s) * S + img.height / 2) for x, y in poly]
        d.polygon(pts, fill=(243, 238, 221, 255))
        d.line(pts + [pts[0]], fill=(200, 40, 46, 255), width=1)
        for p in pts:
            d.point(p, fill=(141, 240, 180, 255))
    img.convert("RGB").save("/tmp/logo_trace.png")


if __name__ == "__main__":
    main()
