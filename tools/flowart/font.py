"""
Bake Pixel Operator into a bitmap font for the atlas.

Font: Pixel Operator by Jayvee Enaguas (HarvettFox96), CC0 1.0 Universal.
      Public domain - no attribution required.

The 5x7 bit-string font this replaces has silently corrupted six glyphs across
three rewrites, because a 34- or 36-character string throws no error - it just
shifts every row below the mistake. Baking a real font removes the whole class
of bug: nobody hand-types pixels any more.

Rendered with getmask(mode='1'), which is a hard 1-bit rasteriser. No
antialiasing anywhere in the pipeline.
"""

import os
from PIL import Image, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TTF = os.path.join(HERE, "ref", "pixelop")

CHARS = ("ABCDEFGHIJKLMNOPQRSTUVWXYZ"
         "abcdefghijklmnopqrstuvwxyz"
         "0123456789"
         ".,!?'\"-:;()/%+<>*=[]#&@ ")

FACES = {
    "small": ("PixelOperator8.ttf", 8),
    "large": ("PixelOperator.ttf", 16),
}


def bake(face, size):
    f = ImageFont.truetype(os.path.join(TTF, face), size)
    out = {}
    for ch in CHARS:
        mask = f.getmask(ch, mode="1")          # hard 1-bit, no antialiasing
        w, h = mask.size
        adv = int(round(f.getlength(ch)))
        img = Image.new("RGBA", (max(w, 1), max(h, 1)), (0, 0, 0, 0))
        if w and h:
            px = img.load()
            for y in range(h):
                for x in range(w):
                    if mask.getpixel((x, y)):
                        px[x, y] = (255, 255, 255, 255)
        # where the glyph sits relative to the text origin
        bb = f.getbbox(ch)
        out[ch] = {"img": img, "adv": adv, "dx": bb[0], "dy": bb[1]}
    return out


def faces():
    return {name: bake(f, s) for name, (f, s) in FACES.items()}


if __name__ == "__main__":
    for name, g in faces().items():
        ws = [v["img"].width for v in g.values()]
        hs = [v["img"].height for v in g.values()]
        print(name, len(g), "glyphs, max cell", max(ws), "x", max(hs))
