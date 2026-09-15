#!/usr/bin/env python3
"""Build VECTOR's sprite atlas from the Blender models.

  python3 tools/vectorart/build.py [--skip-render]

1. Renders every model through Blender (bike.py, models.py) into tools/vectorart/out/raw.
2. Cleans each frame (post.clean): toon body with seams and outline, plus a tint mask.
3. Trims and shelf-packs all frames into two same-layout atlases:
     assets/vector/sprites.png  RGBA body
     assets/vector/mask.png     RGB: R rim, G light, B outline
4. Writes assets/vector/sprites.json: for each sprite, [x, y, w, h, ox, oy], where (ox, oy)
   is the world origin (the point on the floor under the model) inside the trimmed frame.
"""
import json, math, os, subprocess, sys
from PIL import Image, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
from post import clean

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(HERE, "out", "raw")
OUT = os.path.join(ROOT, "assets", "vector")
PX_PER_UNIT = 24 / (2 * math.cos(math.radians(45)))
UP = math.sin(math.radians(60))   # screen pixels per world unit of height, per px-per-unit

JOBS = [
    ("bike.py", "rider", ["16"]), ("bike.py", "warden", ["16"]), ("bike.py", "derez", ["8"]),
    ("models.py", "boss", []), ("models.py", "cell", []), ("models.py", "pylon", []),
]
# render size and camera look height per model family, to find the origin pixel
FAMILY = {"rider": (128, 0.0), "warden": (128, 0.0), "derez": (128, 0.0), "boss": (384, 2.2), "cell": (48, 0.6), "pylon": (128, 1.8)}


def render():
    for script, variant, extra in JOBS:
        out = os.path.join(RAW, variant)
        os.makedirs(out, exist_ok=True)
        cmd = ["blender", "-b", "-P", os.path.join(HERE, script), "--", out, variant, *extra]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if "done" not in r.stdout:
            print(r.stdout[-2000:], r.stderr[-2000:]); raise SystemExit("render failed: " + variant)
        print("rendered", variant)


def frames():
    """(sprite key, family, raw folder, pass name) for every frame, in manifest order."""
    for variant in ("rider", "warden"):
        for d in range(16):
            for l in range(3):
                for w in range(3):
                    yield f"{variant}_{d:02d}_{l}_{w}", variant, f"{d:02d}_{l}_{w}"
    for d in range(8):
        for f in range(12):
            yield f"derez_{d:02d}_{f:02d}", "derez", f"{d:02d}_{f:02d}"
    for c in range(2):
        for f in range(12):
            yield f"boss_{c}_{f:02d}", "boss", f"boss_{c}_{f:02d}"
    for f in range(8):
        yield f"cell_{f:02d}", "cell", f"cell_{f:02d}"
    yield "pylon", "pylon", "pylon"


MONOGRAM = os.path.join(ROOT, "tools", "wagonart", "ref", "font-monogram", "monogram.ttf")   # CC0, datagoblin
CHARS = "".join(chr(c) for c in range(32, 127))


def bake_font():
    """monogram at its native 16px: a strip of 1-bit glyphs and [x, y, w, h, adv, dx, dy] each."""
    f = ImageFont.truetype(MONOGRAM, 16)
    glyphs, imgs, x = {}, [], 0
    for ch in CHARS:
        m = f.getmask(ch, mode="1")
        w, h = m.size
        bb = f.getbbox(ch)
        img = Image.new("RGBA", (max(1, w), max(1, h)))
        if w and h:
            p = img.load()
            for yy in range(h):
                for xx in range(w):
                    if m.getpixel((xx, yy)): p[xx, yy] = (255, 255, 255, 255)
        glyphs[ch] = [x, 0, w, h, int(round(f.getlength(ch))), bb[0], bb[1]]
        imgs.append((x, img)); x += max(1, w) + 1
    strip = Image.new("RGBA", (x, 20))
    for gx, img in imgs: strip.alpha_composite(img, (gx, 0))
    asc, desc = f.getmetrics()
    return strip, {"height": asc + desc, "ascent": asc, "glyphs": glyphs}


def pack(items, width=2048):
    items = sorted(items, key=lambda it: -it[1].height)
    x = y = shelf = 0
    places = {}
    for key, body, mask, origin in items:
        w, h = body.size
        if x + w > width:
            x = 0; y += shelf + 1; shelf = 0
        places[key] = (x, y)
        x += w + 1; shelf = max(shelf, h)
    height = y + shelf
    return places, 1 << math.ceil(math.log2(max(1, height)))


def main():
    if "--skip-render" not in sys.argv:
        render()
    items = []
    for key, fam, name in frames():
        size, look = FAMILY[fam]
        body, mask = clean(os.path.join(RAW, fam), name)
        box = body.getbbox()
        if not box:
            box = (size // 2, size // 2, size // 2 + 1, size // 2 + 1)
        ox = size / 2 - box[0]
        oy = size / 2 + look * PX_PER_UNIT * UP - box[1]
        items.append((key, body.crop(box), mask.crop(box), (round(ox), round(oy))))
    places, height = pack([(k, b, m, o) for k, b, m, o in items])
    sheet = Image.new("RGBA", (2048, height)); msheet = Image.new("RGB", (2048, height))
    manifest = {"cell": [48, 24], "sprites": {}}
    for key, body, mask, (ox, oy) in items:
        x, y = places[key]
        sheet.alpha_composite(body, (x, y)); msheet.paste(mask, (x, y))
        manifest["sprites"][key] = [x, y, body.width, body.height, ox, oy]
    os.makedirs(OUT, exist_ok=True)
    sheet.save(os.path.join(OUT, "sprites.png"), optimize=True)
    msheet.save(os.path.join(OUT, "mask.png"), optimize=True)
    strip, font = bake_font()
    strip.save(os.path.join(OUT, "font.png"), optimize=True)
    manifest["font"] = font
    with open(os.path.join(OUT, "sprites.json"), "w") as f:
        json.dump(manifest, f, separators=(",", ":"))
    print("atlas", sheet.size, len(items), "sprites")


if __name__ == "__main__":
    main()
