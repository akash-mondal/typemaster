"""
Derive the FLOW ninja from a correctly-proportioned human base.

Base: "Platformer Animations" by Clint Bellanger, CC-BY 3.0
      https://opengameart.org/content/platformer-animations
      64x64 frames, 32px = 1 metre, figure is about six feet tall.

The base is an unclothed grey mannequin rendered from 3D, so it has real
anatomy and real run-cycle timing - the two things hand-guessing got wrong.
We scale it down to our target height, quantise it into a small suit ramp, then
paint the ninja over it: hood, face band, headband, sash, wraps, scarf, sword.

Attribution is REQUIRED by CC-BY and belongs on the credits screen.
"""

import math
import os
import random

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "ref", "platformer_base.png")

CELL = 64
SHEET_COLS = 8

# frame indices on the base sheet. The sheet runs in the order documented on
# OpenGameArt: stance 4, run 8, swing 4, block 2, hit+die 6, cast 4, shoot 4,
# walk 8, duck 2, jump+fall 6, ascend 8, descend 8, stand 1.
RUN = list(range(4, 12))         # 8 frames
SWING = list(range(12, 16))      # 4 frames - the sword strike
DIE = list(range(18, 24))        # 6 frames - staggered, then down
JUMP = [42, 43, 44, 45, 46, 47]  # crouch, launch, rise, apex, fall, reach
GUARD = [16, 17]                 # braced, blade up - the block
HIT = [18, 19]                   # staggered - the stumble
CROUCH = [40, 41]                # low - the slide under a shuriken
CHEER = [26, 27]                 # arms raised - victory
SHOOT = [28, 29, 30, 31]         # nock, draw, full draw, loose
STAND = [64]
STANCE = list(range(0, 4))

TARGET_H = 34            # STANDING figure height in pixels
STAND_H_IN_CELL = 61     # measured height of the standing figure in the base cell
SCALE = TARGET_H / float(STAND_H_IN_CELL)
CELL_OUT = int(round(CELL * SCALE))   # the whole cell scales by one constant
OUT_W, OUT_H = 40, 40    # cell size, leaves room for limbs and the scarf

# ---------------------------------------------------------------- palette
C = {
    "K": (0x08, 0x08, 0x0F, 255),   # outline
    "D": (0x16, 0x1B, 0x33, 255),   # suit shadow
    "M": (0x24, 0x2C, 0x4E, 255),   # suit
    "L": (0x39, 0x45, 0x72, 255),   # suit lit edge
    "W": (0xE4, 0xE0, 0xD2, 255),   # bone: face band, wraps, scarf
    "G": (0x9A, 0x96, 0x86, 255),   # bone shadow
    "R": (0xC0, 0x24, 0x2C, 255),   # headband, sash
    "R2": (0x8A, 0x18, 0x1E, 255),  # headband shadow
    "S": (0xA8, 0xAE, 0xC0, 255),   # steel
    "H": (0x6B, 0x45, 0x26, 255),   # hilt
    "F": (0xB9, 0x9C, 0x78, 255),   # skin around the eyes
    # the ronin: warm ochre against the ninja's cold blue, so the two never
    # read as the same figure even in silhouette
    "ED": (0x24, 0x1A, 0x12, 255),  # robe shadow
    "EM": (0x3E, 0x2C, 0x1B, 255),  # robe
    "EL": (0x60, 0x45, 0x27, 255),  # robe lit
    "EO": (0x7A, 0x1E, 0x22, 255),  # obi
    "EO2": (0x52, 0x14, 0x18, 255),
    "HT": (0xC9, 0xA9, 0x6A, 255),  # straw hat
    "HT2": (0x8A, 0x6F, 0x3E, 255),
    # the archer: black-clad like the kage, but hooded with a blood-red sash
    "AD": (0x07, 0x07, 0x0B, 255),
    "AM": (0x13, 0x13, 0x1A, 255),
    "AL": (0x2A, 0x2C, 0x38, 255),
    "AO": (0x6E, 0x16, 0x1C, 255),
    "AO2": (0x46, 0x0E, 0x12, 255),
    "AW": (0x34, 0x34, 0x3E, 255),
    # the kage: an enemy shinobi, all black. A cold rim keeps the silhouette
    # readable against night skies; the only colour is the eye.
    "KD": (0x05, 0x05, 0x08, 255),
    "KM": (0x10, 0x10, 0x16, 255),
    "KL": (0x2C, 0x30, 0x40, 255),
    "KB": (0x22, 0x22, 0x2C, 255),
    "KB2": (0x16, 0x16, 0x1E, 255),
    "KW": (0x1C, 0x1C, 0x24, 255),
    "EYE": (0xE8, 0x3A, 0x36, 255),
    "BOW": (0x7A, 0x52, 0x2C, 255),
    "STR": (0xC8, 0xC0, 0xA8, 255),
    # blood, dark to bright. Kept to four steps so a spray still reads as one
    # colour family at 320x240 rather than turning to confetti.
    "BL0": (0x3A, 0x07, 0x0A, 255),
    "BL1": (0x76, 0x0E, 0x13, 255),
    "BL2": (0xB4, 0x1A, 0x1F, 255),
    "BL3": (0xE0, 0x3A, 0x3E, 255),
}
CLEAR = (0, 0, 0, 0)

# tone ramp per character
KINDS = {
    "ninja": {"D": "D", "M": "M", "L": "L", "band": "R", "band2": "R2",
              "accent": "W", "accent2": "G", "scarf": True, "hat": False},
    "ronin": {"D": "ED", "M": "EM", "L": "EL", "band": "EO", "band2": "EO2",
              "accent": "HT", "accent2": "HT2", "scarf": False, "hat": True},
    "archer": {"D": "AD", "M": "AM", "L": "AL", "band": "AO", "band2": "AO2",
               "accent": "AW", "accent2": "AO2", "scarf": False, "hat": False,
               "hood": True, "eye": "EYE"},
    "kage": {"D": "KD", "M": "KM", "L": "KL", "band": "KB", "band2": "KB2",
             "accent": "KW", "accent2": "KB2", "scarf": False, "hat": False,
             "eye": "EYE"},
}

# A conical kasa. Hand-authored, because the silhouette is the whole point:
# it is what tells you at a glance that this is not the ninja.
HAT = [
    ".....KKK.....",
    "...KKhhhKK...",
    "..KhhhhhhhK..",
    ".KhhhhhhhhhK.",
    "KHHHHHHHHHHHK",
    ".KKKKKKKKKKK.",
]
HAT_LEGEND = {"K": "K", "h": "HT", "H": "HT2"}


def _sheet():
    if not os.path.exists(BASE):
        raise SystemExit("missing base sprite: " + BASE)
    return Image.open(BASE).convert("RGBA")


def _cell(sheet, i):
    c, r = i % SHEET_COLS, i // SHEET_COLS
    return sheet.crop((c * CELL, r * CELL, c * CELL + CELL, r * CELL + CELL))


def _shrink(img):
    """Scale the WHOLE cell by one constant factor.

    Normalising each frame's own height was a bug: a prone death frame is 12px
    tall in the base, so scaling it to 34 stretched it into a slab. Scaling the
    cell keeps every pose the same size AND keeps the feet on the ground, since
    every base figure stands on the bottom row of its cell.
    """
    if img.getbbox() is None:
        return None, None
    small = img.resize((CELL_OUT, CELL_OUT), Image.LANCZOS)
    return small, None


def _tone(px):
    """Map the mannequin's shading into the suit ramp."""
    r, g, b, a = px
    if a < 110:
        return None
    lum = (r * 299 + g * 587 + b * 114) // 1000
    if lum < 96:
        return "D"
    if lum < 168:
        return "M"
    return "L"


class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[CLEAR] * w for _ in range(h)]

    def put(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return CLEAR

    def solid(self, x, y):
        return self.get(x, y)[3] != 0

    def outline(self, c):
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.solid(x, y):
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.solid(x + dx, y + dy):
                        add.append((x, y))
                        break
        for x, y in add:
            self.put(x, y, c)

    def to_image(self):
        im = Image.new("RGBA", (self.w, self.h))
        im.putdata([self.px[y][x] for y in range(self.h) for x in range(self.w)])
        return im


def _body_rows(g):
    """Row extents of the figure, used to place costume features by proportion."""
    rows = [y for y in range(g.h) if any(g.solid(x, y) for x in range(g.w))]
    return (rows[0], rows[-1]) if rows else (0, g.h - 1)


def _row_span(g, y):
    xs = [x for x in range(g.w) if g.solid(x, y)]
    return (xs[0], xs[-1]) if xs else None


def _torso_span(g, y, cx):
    """The contiguous run of solid pixels containing the body centre. Using the
    full row span paints the sash straight through the arms."""
    if not g.solid(int(cx), y):
        for d in range(1, 6):
            if g.solid(int(cx) - d, y):
                cx = cx - d
                break
            if g.solid(int(cx) + d, y):
                cx = cx + d
                break
        else:
            return None
    a = b = int(cx)
    while a > 0 and g.solid(a - 1, y):
        a -= 1
    while b < g.w - 1 and g.solid(b + 1, y):
        b += 1
    return (a, b)


def _c(v):
    return C[v] if isinstance(v, str) else v


def rgba(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


# Every world dresses its own enemies. Same bodies, same animation, same
# behaviour in the game - only the costume changes, so a fighter still reads by
# silhouette (ronin: hat, kage: bare head, archer: bow) wherever he stands.
BIOMES = {
    "grove": {
        # a wandering komuso monk: basket hat over the whole head
        "ronin": {"D": rgba('#2A2620'), "M": rgba('#4A4234'), "L": rgba('#6E6250'), "band": rgba('#6A5A2E'), "band2": rgba('#46381C'),
                  "accent": rgba('#8A7A58'), "accent2": rgba('#5A4E36'), "scarf": False, "hat": "basket",
                  "hat1": rgba('#A88E52'), "hat2": rgba('#6E5A30')},
        # leaf-green shinobi with a yellow eye
        "kage": {"D": rgba('#0C1A10'), "M": rgba('#1A3020'), "L": rgba('#3A5C34'), "band": rgba('#2E4A22'), "band2": rgba('#1C3016'),
                 "accent": rgba('#24401E'), "accent2": rgba('#16280F'), "scarf": False, "hat": False, "eye": rgba('#E8D84A')},
        # a hunter in a straw hood
        "archer": {"D": rgba('#241C12'), "M": rgba('#3E3220'), "L": rgba('#5E4C30'), "band": rgba('#4E6A2A'), "band2": rgba('#324618'),
                   "accent": rgba('#8C7A50'), "accent2": rgba('#5A4C30'), "scarf": False, "hat": False, "hood": True,
                   "hoodc": rgba('#9C8448'), "eye": rgba('#E8D84A')},
    },
    "snow": {
        # a yamabushi: white robe, orange tassels, the small black tokin cap
        "ronin": {"D": rgba('#8A94A8'), "M": rgba('#C8D0DC'), "L": rgba('#EEF2F8'), "band": rgba('#E8782C'), "band2": rgba('#A8501C'),
                  "accent": rgba('#E8782C'), "accent2": rgba('#A8501C'), "scarf": False, "hat": "tokin",
                  "hat1": rgba('#101014'), "hat2": rgba('#2A2A32')},
        # snow-white shinobi with an ice-blue eye
        "kage": {"D": rgba('#7888A0'), "M": rgba('#B8C4D4'), "L": rgba('#E4ECF4'), "band": rgba('#8A98B0'), "band2": rgba('#6A7890'),
                 "accent": rgba('#9AA8BE'), "accent2": rgba('#6A7890'), "scarf": False, "hat": False, "eye": rgba('#48B8F0')},
        # a fur-hooded archer
        "archer": {"D": rgba('#3A2E24'), "M": rgba('#5E4C3A'), "L": rgba('#86705A'), "band": rgba('#2A4A6A'), "band2": rgba('#1A3048'),
                   "accent": rgba('#B8A488'), "accent2": rgba('#7A6852'), "scarf": False, "hat": False, "hood": True,
                   "hoodc": rgba('#D8CCB8'), "eye": rgba('#48B8F0')},
    },
    "castle": {
        # an armoured samurai: red lacquer, a horned kabuto
        "ronin": {"D": rgba('#3A0C10'), "M": rgba('#7A1A20'), "L": rgba('#B03030'), "band": rgba('#1A1A20'), "band2": rgba('#0C0C10'),
                  "accent": rgba('#C8A040'), "accent2": rgba('#8A6A22'), "scarf": False, "hat": "kabuto",
                  "hat1": rgba('#1E1E26'), "hat2": rgba('#E8B040')},
        # a castle shinobi in deep purple
        "kage": {"D": rgba('#14081C'), "M": rgba('#2A1438'), "L": rgba('#4A2A64'), "band": rgba('#3A2050'), "band2": rgba('#221234'),
                 "accent": rgba('#301A44'), "accent2": rgba('#1E0E2C'), "scarf": False, "hat": False, "eye": rgba('#F4B93D')},
        # an ashigaru in blue armour under a flat lacquered jingasa
        "archer": {"D": rgba('#0E1628'), "M": rgba('#1C2C4A'), "L": rgba('#34507A'), "band": rgba('#A83A2A'), "band2": rgba('#6E2218'),
                   "accent": rgba('#C8B890'), "accent2": rgba('#8A7C5A'), "scarf": False, "hat": "jingasa",
                   "hat1": rgba('#101016'), "hat2": rgba('#E8B040')},
    },
    "harbour": {
        # a wako captain: indigo coat over a striped shirt, a red hachimaki
        "ronin": {"D": rgba('#101830'), "M": rgba('#1E2C50'), "L": rgba('#34487A'), "band": rgba('#C0242C'), "band2": rgba('#8A181E'),
                  "accent": rgba('#B99C78'), "accent2": rgba('#8A7458'), "scarf": False, "hat": False, "stripes": rgba('#D8D0C0')},
        # a pirate shinobi in a striped head-scarf
        "kage": {"D": rgba('#0A0E1C'), "M": rgba('#16203A'), "L": rgba('#2E3E62'), "band": rgba('#D8D0C0'), "band2": rgba('#3A5A8A'),
                 "accent": rgba('#1E2A48'), "accent2": rgba('#121A30'), "scarf": False, "hat": False, "eye": rgba('#E8783A')},
        # a sailor archer: tan clothes, blue bandana, striped shirt
        "archer": {"D": rgba('#3A2C1C'), "M": rgba('#6A5234'), "L": rgba('#96784E'), "band": rgba('#2A5A9A'), "band2": rgba('#1A3A6A'),
                   "accent": rgba('#B99C78'), "accent2": rgba('#8A7458'), "scarf": False, "hat": False, "hood": False,
                   "stripes": rgba('#D8C8A8')},
    },
}

HATS = {
    "kasa": [".....KKK.....", "...KKhhhKK...", "..KhhhhhhhK..", ".KhhhhhhhhhK.", "KHHHHHHHHHHHK", ".KKKKKKKKKKK."],
    "basket": ["..KKKKKKK..", ".KhHhHhHhK.", ".KHhHhHhHK.", ".KhHhHhHhK.", ".KHhHhHhHK.", ".KhHhHhHhK.", ".KHhHhHhHK.", "..KKKKKKK.."],
    "tokin": ["...KK...", "..KhhK..", ".KhhhhK.", "..KKKK.."],
    "kabuto": ["H.......H", "HH.....HH", ".HHKKKHH.", "..KhhhK..", ".KhhhhhK.", "KhhhhhhhK", "KKKKKKKKK"],
    "jingasa": ["....KK....", "..KhhhhK..", "KhhhHhhhhK", "KKKKKKKKKK"],
}
# where each hat sits relative to the crown
HAT_DY = {"kasa": -2, "basket": -1, "tokin": -3, "kabuto": -5, "jingasa": -3}


def costume(g, scarf_phase, kind="ninja", blade=None, wet=False, bow=None, upright=False, star=False,
            scarf_hang=False, gear=None):
    """Paint a character over correct anatomy. Everything is placed by body
    proportion, so it follows the pose instead of being pinned to a cell.
    `kind` is a name in KINDS or a costume dict (see BIOMES)."""
    K = kind if isinstance(kind, dict) else KINDS[kind]
    top, bot = _body_rows(g)
    if upright:
        # arms raised above the head: the first solid row is a hand, not the
        # crown. An upright figure's crown is a fixed standing height above
        # its feet, because every pose shares one scale.
        top = max(top, bot - (TARGET_H - 1))
    H = bot - top + 1

    head_bot = top + int(H * 0.20)
    band_y = top + int(H * 0.115)
    eye_y = top + int(H * 0.155)
    waist = top + int(H * 0.50)
    elbow = top + int(H * 0.42)
    ankle = top + int(H * 0.90)

    # --- head: flatten to one tone so the face reads
    for y in range(top, head_bot + 1):
        for x in range(g.w):
            if g.solid(x, y):
                g.put(x, y, _c(K["M"] if y <= band_y else K["D"]))

    # --- headband, or the hat brim line for the ronin
    if not K["hat"]:
        hs = _row_span(g, head_bot)
        hcx = (hs[0] + hs[1]) / 2.0 if hs else g.w / 2.0
        for y in (band_y, band_y + 1):
            sp = _torso_span(g, y, hcx) if upright else _row_span(g, y)
            if sp:
                for x in range(sp[0], sp[1] + 1):
                    g.put(x, y, _c(K["band"] if y == band_y else K["band2"]))

    # --- face band and eye, on the leading half of the head
    hs2 = _row_span(g, head_bot)
    hcx2 = (hs2[0] + hs2[1]) / 2.0 if hs2 else g.w / 2.0
    for y in (eye_y, eye_y + 1):
        sp = _torso_span(g, y, hcx2) if upright else _row_span(g, y)
        if not sp:
            continue
        a, b = sp
        mid = (a + b) // 2
        for x in range(mid, b + 1):
            g.put(x, y, _c(K["accent"]) if not K["hat"] else C["F"])
        if y == eye_y + 1:
            g.put(b - 1, y, _c(K.get("eye", "K")))

    # --- obi / sash, torso only
    cx = sum(_row_span(g, band_y) or (g.w // 2, g.w // 2)) / 2
    for y in (waist, waist + 1):
        sp = _torso_span(g, y, cx)
        if sp:
            for x in range(sp[0], sp[1] + 1):
                g.put(x, y, _c(K["band"] if y == waist else K["band2"]))

    # --- stripes across the chest, for sailors
    if K.get("stripes"):
        for y in range(band_y + 5, waist - 1, 2):
            sp = _torso_span(g, y, cx)
            if sp:
                for x in range(sp[0] + 1, sp[1]):
                    g.put(x, y, _c(K["stripes"]))

    # --- shin wraps and feet
    for y in range(ankle - 3, ankle - 1):
        for x in range(g.w):
            if g.solid(x, y):
                g.put(x, y, _c(K["accent"]))
    for y in range(ankle, bot + 1):
        for x in range(g.w):
            if g.solid(x, y):
                g.put(x, y, C["K"] if y >= bot - 1 else _c(K["D"]))

    # --- forearm wraps
    for y in range(elbow, elbow + 2):
        sp = _row_span(g, y)
        if not sp:
            continue
        a, b = sp
        for x in list(range(a, min(a + 2, b + 1))) + \
                 list(range(max(b - 1, a), b + 1)):
            if g.solid(x, y):
                g.put(x, y, _c(K["accent"]))

    # --- the hat sits over everything on the head
    if K["hat"]:
        sp = _torso_span(g, band_y, hcx2) if upright else _row_span(g, band_y)
        if sp:
            hname = "kasa" if K["hat"] is True else K["hat"]
            art = HATS[hname]
            legend = {"K": C["K"], "h": _c(K.get("hat1", "HT")), "H": _c(K.get("hat2", "HT2"))}
            hx = (sp[0] + sp[1]) // 2 - len(art[0]) // 2
            hy = top + HAT_DY[hname]
            for j, row in enumerate(art):
                for i, ch in enumerate(row):
                    if ch != ".":
                        g.put(hx + i, hy + j, legend[ch])

    # --- scarf, streaming behind the neck
    if K["scarf"]:
        ny = band_y + 3
        sp = _row_span(g, ny)
        nx = sp[0] if sp else None
        if nx is not None:
            pts = []
            px, py = float(nx), float(ny)
            for i in range(0, 10):
                t = i / 9.0
                pts.append((px, py))
                if scarf_hang:
                    # hanging off a wall: the scarf falls and sways
                    py += 1.3
                    px += math.sin(scarf_phase + t * 3.0) * (0.3 + t * 0.9) * 0.7 - 0.35
                else:
                    px -= 1.45
                    py += math.sin(scarf_phase + t * 4.0) * (0.9 + t * 1.6) * 0.55 - 0.28
            for i in range(len(pts) - 1):
                x0, y0 = pts[i]
                x1, y1 = pts[i + 1]
                t = i / float(len(pts) - 1)
                th = 2 if t < 0.5 else 1
                col = C["W"] if t < 0.72 else C["G"]
                steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 2
                for st in range(steps + 1):
                    u = st / steps
                    x = int(round(x0 + (x1 - x0) * u))
                    y = int(round(y0 + (y1 - y0) * u))
                    for k in range(th):
                        if not g.solid(x, y + k):
                            g.put(x, y + k, col)

    # --- the sword, only on strike frames. Angle sweeps across the four frames
    # so the blade itself carries the arc.
    if blade is not None:
        hand = None
        for y in range(top + int(H * 0.24), top + int(H * 0.56)):
            sp = _row_span(g, y)
            if sp and (hand is None or sp[1] >= hand[0]):
                hand = (sp[1], y)
        if hand:
            hx, hy = hand
            ang = math.radians(blade)
            # hilt
            for k in range(2):
                g.put(hx - 1 + k, hy, C["H"])
            for i in range(1, 15):
                x = hx + math.cos(ang) * i
                y = hy - math.sin(ang) * i
                g.put(x, y, C["S"] if i < 13 else C["W"])
                if i < 11:
                    g.put(x, y + 1, C["K"])
            if wet:
                # blood sits along the cutting edge, thickest at the tip
                for i in range(4, 15):
                    x = hx + math.cos(ang) * i
                    y = hy - math.sin(ang) * i
                    g.put(x, y, C["BL2"] if i > 9 else C["BL1"])

    # --- hood for the archer: a darker cap swept back over the head
    if K.get("hood"):
        for y in range(top, band_y + 2):
            sp = _torso_span(g, y, hcx2) if upright else _row_span(g, y)
            if sp:
                for x in range(sp[0] - (1 if y > top + 1 else 0), sp[1] + 1):
                    g.put(x, y, _c(K.get("hoodc", K["D"])))

    # --- the bow, held in the leading hand. 'rest' is slack, 'draw' pulls the
    # string back to the other hand, which is what telegraphs the shot.
    if bow is not None:
        hand = None
        for y in range(top + int(H * 0.24), top + int(H * 0.50)):
            sp = _row_span(g, y)
            if sp and (hand is None or sp[1] > hand[0]):
                hand = (sp[1], y)
        if hand:
            hx, hy = hand
            span = 9
            for dy in range(-span, span + 1):
                bulge = int(round(3.2 * (1 - (dy / float(span)) ** 2)))
                g.put(hx + 1 + bulge, hy + dy, C["BOW"])
            pull = 9 if bow == "draw" else 1
            for dy in range(-span, span + 1):
                u = 1 - abs(dy) / float(span)
                g.put(hx + 1 - int(round(pull * u)), hy + dy, C["STR"])
            if bow == "draw":
                for i in range(0, 12):
                    g.put(hx - 8 + i, hy, C["AW"] if i < 10 else C["S"])

    # --- climbing gear: what the ninja grips the wall with in each world
    if gear:
        hands = []
        for y in range(top - 4, top + 6):
            xs = [x for x in range(g.w) if g.solid(x, y)]
            if xs:
                hands.append((xs[-1], y))
        hands = hands[:3]
        STEEL, STEEL2 = C["S"], (0x6A, 0x70, 0x80, 255)
        TAN, TAN2 = (0xB8, 0x98, 0x68, 255), (0x7A, 0x60, 0x3C, 255)
        if hands:
            hx, hy = max(hands)
            if gear == "claws":           # tekagi, steel hooks over the knuckles
                for dx, dy in ((0, -2), (1, -3), (2, -2), (-1, -1), (1, -1)):
                    g.put(hx + dx, hy + dy, STEEL)
            elif gear == "picks":         # ice picks, and a fur cloak on the shoulders
                for i in range(5):
                    g.put(hx + 1 + i // 2, hy - i, STEEL if i else C["R"])
                g.put(hx + 3, hy - 4, STEEL2)
                for y in (band_y + 3, band_y + 4):
                    sp = _torso_span(g, y, hcx2)
                    if sp:
                        for x in range(sp[0], sp[1] + 1):
                            if (x + y) % 3:
                                g.put(x, y, C["W"])
            elif gear == "kunai":         # kunai driven into the plaster
                for i in range(1, 5):
                    g.put(hx + i, hy + 1, STEEL if i < 4 else STEEL2)
                g.put(hx, hy + 1, C["H"])
                g.put(hx - 3, bot - 12, STEEL); g.put(hx - 2, bot - 12, STEEL)
            elif gear == "rope":          # hand over hand up a rope line
                for y in range(0, g.h):
                    if not g.solid(hx + 1, y):
                        g.put(hx + 1, y, TAN if y % 3 else TAN2)
            elif gear == "pole":          # a bamboo pole, and a rope coil on the back
                for y in range(0, g.h):
                    if not g.solid(hx + 2, y):
                        g.put(hx + 2, y, (0x5E, 0x74, 0x30, 255) if y % 9 else (0xA8, 0xC0, 0x60, 255))
                        g.put(hx + 3, y, (0x3A, 0x4A, 0x22, 255))
                sp = _torso_span(g, band_y + 6, hcx2)
                if sp:
                    for dx, dy in ((-1, 0), (-2, 1), (-2, 2), (-1, 3), (0, 1), (0, 2)):
                        g.put(sp[0] + dx, band_y + 6 + dy, TAN)

    # --- a shuriken held at the leading hand, for the throw wind-up
    if star:
        hand = None
        for y in range(top + int(H * 0.10), top + int(H * 0.56)):
            sp = _row_span(g, y)
            if sp and (hand is None or sp[1] > hand[0]):
                hand = (sp[1], y)
        if hand:
            hx, hy = hand
            for dx, dy in ((1, 0), (2, -1), (2, 1), (3, 0), (2, 0)):
                g.put(hx + dx, hy + dy, C["S"])

    g.outline(C["K"])
    return g


def _torso_x(img, y):
    """Centre of the widest solid run on a row of a base cell: the torso."""
    px = img.load()
    runs, start = [], None
    for x in range(img.width + 1):
        on = x < img.width and px[x, y][3] > 110
        if on and start is None:
            start = x
        if not on and start is not None:
            runs.append((start, x - 1)); start = None
    if not runs:
        return img.width / 2.0
    a, b = max(runs, key=lambda r: r[1] - r[0])
    return (a + b) / 2.0


def composite(sheet, upper, lower, lean=0, waist=34):
    """A pose the base sheet does not have: the upper body of one frame over the
    legs of another, joined at the waist and aligned on the torso. `lean` shifts
    the chest toward the wall, so a climber hugs the building."""
    up, lo = _cell(sheet, upper), _cell(sheet, lower)
    ux, lx = _torso_x(up, waist - 2), _torso_x(lo, waist + 2)
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    dx = int(round(ux - lx))
    for y in range(CELL):
        if y < waist:
            shift = int(round(lean * (waist - y) / float(waist)))
            for x in range(CELL):
                p = up.getpixel((x, y))
                if p[3] > 0 and 0 <= x + shift < CELL:
                    out.putpixel((x + shift, y), p)
        else:
            for x in range(CELL):
                p = lo.getpixel((x, y))
                if p[3] > 0 and 0 <= x + dx < CELL:
                    out.putpixel((x + dx, y), p)
    return out


def frame(sheet, idx, scarf_phase, kind="ninja", flip=False, blade=None,
          wet=False, bow=None, upright=False, star=False, scarf_hang=False, img=None, gear=None):
    small, _ = _shrink(img if img is not None else _cell(sheet, idx))
    if small is None:
        return None
    g = Grid(OUT_W, OUT_H)
    K = kind if isinstance(kind, dict) else KINDS[kind]
    ox = (OUT_W - small.width) // 2
    oy = OUT_H - 2 - small.height
    for y in range(small.height):
        for x in range(small.width):
            t = _tone(small.getpixel((x, y)))
            if t:
                g.put(x + ox, y + oy, _c(K[t]))
    costume(g, scarf_phase, kind, blade, wet, bow, upright, star, scarf_hang, gear)
    if flip:
        f = Grid(g.w, g.h)
        for y in range(g.h):
            for x in range(g.w):
                f.px[y][g.w - 1 - x] = g.px[y][x]
        return f
    return g


# --------------------------------------------------------------------- slash
# The arc the blade leaves behind. Hand-authored: a crescent has to be drawn,
# not computed, or it reads as a smear.
SLASH = [
    [
        "..........",
        "......WW..",
        "....WW....",
        "...W......",
        "..W.......",
        "..W.......",
        "...W......",
        "....W.....",
        "..........",
        "..........",
    ],
    [
        ".......WW.",
        ".....WWGG.",
        "...WWG....",
        "..WG......",
        ".WG.......",
        ".WG.......",
        "..WG......",
        "...WG.....",
        ".....WWG..",
        ".......WW.",
    ],
    [
        "........G.",
        "......GG..",
        "....GG....",
        "...G......",
        "..G.......",
        "..G.......",
        "...G......",
        "....GG....",
        "......GG..",
        "........G.",
    ],
]


# ---------------------------------------------------------------------- blood
# The burst is BAKED here with a fixed seed, so it is a deterministic sprite,
# not a per-frame random effect. The game just plays the frames.

def blood_spray(seed=7, frames=6, w=24, h=24):
    rnd = random.Random(seed)
    parts = []
    for _ in range(34):
        ang = math.radians(rnd.uniform(-72, 34))     # up and forward
        spd = rnd.uniform(1.5, 4.6)
        parts.append({
            "x": w * 0.32 + rnd.uniform(-1.5, 1.5),
            "y": h * 0.52 + rnd.uniform(-2.0, 2.0),
            "vx": math.cos(ang) * spd,
            "vy": -abs(math.sin(ang)) * spd,
            "big": rnd.random() < 0.30,
        })
    # advance one step before recording: frame 0 of a burst that has not moved
    # yet is a solid red clump, which reads as a square rather than a spray
    for p in parts:
        p["x"] += p["vx"] * 0.7
        p["y"] += p["vy"] * 0.7
    out = []
    for f in range(frames):
        g = Grid(w, h)
        for p in parts:
            # colour cools as the droplet ages
            t = f / float(frames - 1)
            col = C["BL3"] if t < 0.25 else C["BL2"] if t < 0.55 \
                else C["BL1"] if t < 0.8 else C["BL0"]
            x, y = int(round(p["x"])), int(round(p["y"]))
            g.put(x, y, col)
            if p["big"] and f < frames - 2:
                g.put(x + 1, y, col)
                g.put(x, y + 1, col)
            p["x"] += p["vx"]
            p["y"] += p["vy"]
            p["vy"] += 0.62          # gravity
            p["vx"] *= 0.94
        out.append(g)
    return out


def blood_pool(frames=4, w=30, h=8):
    """Spreads under a body. Hard-edged, darker at the rim."""
    out = []
    for f in range(frames):
        g = Grid(w, h)
        rx = 3.5 + f * 4.2
        ry = 1.2 + f * 0.8
        cx, cy = w / 2.0, h - 2
        for y in range(h):
            for x in range(w):
                d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if d <= 1.0:
                    g.put(x, y, C["BL1"] if d > 0.55 else C["BL2"])
                elif d <= 1.35:
                    g.put(x, y, C["BL0"])
        out.append(g)
    return out


def slash_frames():
    out = []
    for art in SLASH:
        g = Grid(16, 16)
        for j, row in enumerate(art):
            for i, ch in enumerate(row):
                if ch != ".":
                    g.put(i + 3, j + 3, C["W"] if ch == "W" else C["S"])
        out.append(g)
    return out


def clips():
    sheet = _sheet()
    out = {}
    out["ninja_run"] = [frame(sheet, i, n * 0.9)
                        for n, i in enumerate(RUN)]
    out["ninja_jump"] = [frame(sheet, i, n * 0.7)
                         for n, i in enumerate(JUMP)]
    out["ninja_idle"] = [frame(sheet, i, n * 1.3)
                         for n, i in enumerate(STANCE)]
    # the strike: blade sweeps from high behind to low in front
    angles = [58, 22, -18, -46]
    out["ninja_strike"] = [frame(sheet, i, n * 0.6, blade=angles[n], wet=(n >= 2))
                           for n, i in enumerate(SWING)]
    out["ninja_die"] = [frame(sheet, i, 3.4 - n * 0.4)
                        for n, i in enumerate(DIE)]

    out["enemy_idle"] = [frame(sheet, i, 0, "ronin", flip=True)
                         for i in STANCE]
    out["enemy_wind"] = [frame(sheet, i, 0, "ronin", flip=True, blade=a)
                         for i, a in zip(SWING[:2], (64, 40))]
    out["enemy_strike"] = [frame(sheet, i, 0, "ronin", flip=True, blade=a)
                           for i, a in zip(SWING[2:], (-6, -40))]
    out["enemy_die"] = [frame(sheet, i, 0, "ronin", flip=True)
                        for i in DIE]

    # ---- new ninja moves
    out["ninja_block"] = [frame(sheet, i, 1.0 + n, blade=84) for n, i in enumerate(GUARD)]
    out["ninja_stumble"] = [frame(sheet, i, 2.0 + n * 0.8) for n, i in enumerate(HIT)]
    out["ninja_slide"] = [frame(sheet, i, 0.5 + n * 1.1) for n, i in enumerate(CROUCH)]
    out["ninja_victory"] = [frame(sheet, i, n * 1.4, upright=True) for n, i in enumerate(CHEER)]

    # ---- the archer, facing left toward the ninja
    out["archer_idle"] = [frame(sheet, i, 0, "archer", flip=True, bow="rest") for i in STANCE]
    out["archer_draw"] = [frame(sheet, i, 0, "archer", flip=True, bow="draw") for i in SHOOT[:3]]
    out["archer_loose"] = [frame(sheet, SHOOT[3], 0, "archer", flip=True, bow="rest")]
    out["archer_die"] = [frame(sheet, i, 0, "archer", flip=True) for i in DIE]

    # ---- the kage, facing left: idle, a three-frame throw, and the fall
    THROW = [28, 24, 25]
    out["kage_idle"] = [frame(sheet, i, 0, "kage", flip=True) for i in STANCE]
    out["kage_throw"] = [frame(sheet, i, 0, "kage", flip=True, star=(n < 2), upright=(n == 2))
                         for n, i in enumerate(THROW)]
    out["kage_strike"] = [frame(sheet, i, 0, "kage", flip=True, blade=a)
                          for i, a in zip(SWING[1:3], (40, -10))]
    out["kage_die"] = [frame(sheet, i, 0, "kage", flip=True) for i in DIE]
    out["archer_strike"] = [frame(sheet, i, 0, "archer", flip=True, blade=a, upright=True)
                            for i, a in zip(SWING[1:3], (40, -10))]

    # ---- the ninja's kaginawa: throw the hook, hang and swing, catch a star
    out["ninja_throw"] = [frame(sheet, i, n * 0.8, upright=(n == 2)) for n, i in enumerate(THROW)]
    out["ninja_swing"] = [frame(sheet, i, n * 1.6, upright=True) for n, i in enumerate(CHEER)]
    out["ninja_catch"] = [frame(sheet, i, n * 0.8, star=True, upright=(n == 1)) for n, i in enumerate([24, 25])]

    # ---- climbing a building: composites, hugging the wall on the right
    CLIMB = [(26, 44, 3), (27, 16, 2), (25, 43, 3), (27, 17, 2)]
    out["ninja_climb"] = [frame(sheet, 0, n * 1.2, upright=True, scarf_hang=True, img=composite(sheet, u, l, lean))
                          for n, (u, l, lean) in enumerate(CLIMB)]
    out["ninja_hang"] = [frame(sheet, 0, n * 1.5, upright=True, scarf_hang=True, img=composite(sheet, 26, 17, 2))
                         for n in range(2)]
    out["ninja_mantle"] = [frame(sheet, 0, 0.5, upright=True, scarf_hang=True, img=composite(sheet, 26, 41, 5)),
                           frame(sheet, 41, 1.0), frame(sheet, 40, 1.4), frame(sheet, 0, 1.8)]
    out["ninja_glide"] = [frame(sheet, i, n * 0.9) for n, i in enumerate((46, 45))]
    out["kage_lean"] = [frame(sheet, i, 0, "kage", flip=True, star=(n < 2), upright=(n == 2))
                        for n, i in enumerate(THROW)]
    out["archer_lean"] = [frame(sheet, i, 0, "archer", flip=True, bow=("draw" if n else "rest"))
                          for n, i in enumerate(SHOOT[:2])]

    # ---- every world climbs its own way
    for wk, gear in (("city", "claws"), ("grove", "pole"), ("snow", "picks"), ("castle", "kunai"), ("harbour", "rope")):
        out["ninja_climb_" + wk] = [frame(sheet, 0, n * 1.2, upright=True, scarf_hang=True, gear=gear,
                                          img=composite(sheet, u, l, lean)) for n, (u, l, lean) in enumerate(CLIMB)]
        out["ninja_hang_" + wk] = [frame(sheet, 0, n * 1.5, upright=True, scarf_hang=True, gear=gear,
                                         img=composite(sheet, 26, 17, 2)) for n in range(2)]

    # ---- and dresses its own enemies: same frames, same timing, new costumes
    for wk, B in BIOMES.items():
        ro, kg, ar = B["ronin"], B["kage"], B["archer"]
        out["enemy_idle_" + wk] = [frame(sheet, i, 0, ro, flip=True) for i in STANCE]
        out["enemy_wind_" + wk] = [frame(sheet, i, 0, ro, flip=True, blade=a) for i, a in zip(SWING[:2], (64, 40))]
        out["enemy_strike_" + wk] = [frame(sheet, i, 0, ro, flip=True, blade=a) for i, a in zip(SWING[2:], (-6, -40))]
        out["enemy_die_" + wk] = [frame(sheet, i, 0, ro, flip=True) for i in DIE]
        out["kage_idle_" + wk] = [frame(sheet, i, 0, kg, flip=True) for i in STANCE]
        out["kage_throw_" + wk] = [frame(sheet, i, 0, kg, flip=True, star=(n < 2), upright=(n == 2)) for n, i in enumerate(THROW)]
        out["kage_strike_" + wk] = [frame(sheet, i, 0, kg, flip=True, blade=a) for i, a in zip(SWING[1:3], (40, -10))]
        out["kage_die_" + wk] = [frame(sheet, i, 0, kg, flip=True) for i in DIE]
        out["archer_idle_" + wk] = [frame(sheet, i, 0, ar, flip=True, bow="rest") for i in STANCE]
        out["archer_draw_" + wk] = [frame(sheet, i, 0, ar, flip=True, bow="draw") for i in SHOOT[:3]]
        out["archer_loose_" + wk] = [frame(sheet, SHOOT[3], 0, ar, flip=True, bow="rest")]
        out["archer_die_" + wk] = [frame(sheet, i, 0, ar, flip=True) for i in DIE]
        out["archer_strike_" + wk] = [frame(sheet, i, 0, ar, flip=True, blade=a, upright=True) for i, a in zip(SWING[1:3], (40, -10))]

    out["slash"] = slash_frames()
    out["blood_spray"] = blood_spray()
    out["blood_pool"] = blood_pool()
    return out


if __name__ == "__main__":
    cs = clips()
    for k, v in cs.items():
        print(k, len(v), "frames")


# ------------------------------------------------------------ the back climb
# Climbing reads best from behind, the way the old ninja games drew it: the
# ninja faces the wall, arms reaching up alternately, knees stepping. Built from
# shaded capsule limbs on a posed skeleton, not from the side-view mannequin,
# whose poses were never meant to hug a wall.

def _capsule(g, x0, y0, x1, y1, r0, r1, ramp):
    steps = int(max(abs(x1 - x0), abs(y1 - y0), 1)) * 4
    for i in range(steps + 1):
        t = i / float(steps)
        cx, cy, r = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t
        ri = int(math.ceil(r))
        for dy in range(-ri, ri + 1):
            for dx in range(-ri, ri + 1):
                if dx * dx + dy * dy > r * r + 0.3:
                    continue
                lit = (dx - dy) / (r * 2 + 0.001) + 0.5     # light from the upper right
                g.put(int(round(cx + dx)), int(round(cy + dy)), ramp[max(0, min(len(ramp) - 1, int(lit * len(ramp))))])


# (left hand, right hand, left foot, right foot) targets per frame, cell coordinates.
# The figure hangs with its shoulders at y=15 and hips at y=25, centred on x=20.
CLIMB_POSES = [
    ((11, 2), (29, 13), (15, 31), (25, 38)),    # left hand high, left knee up
    ((12, 8), (28, 8), (16, 35), (24, 35)),     # passing: both hands level
    ((11, 13), (29, 2), (15, 38), (25, 31)),    # right hand high, right knee up
    ((12, 8), (28, 8), (16, 35), (24, 35)),
]


def climb_back_frames(gear=None, phase=0.0):
    ramp = [C["D"], C["M"], C["L"]]
    frames = []
    for n, (lh, rh, lf, rf) in enumerate(CLIMB_POSES):
        g = Grid(OUT_W, OUT_H)
        bob = 1 if n % 2 else 0                       # the body rises as the arms pull
        sy, hy = 15 - bob, 25 - bob
        # legs, behind the torso
        for hip_x, foot in ((18, lf), (22, rf)):
            fx, fy = foot
            knee = ((hip_x + fx) / 2.0 + (-2 if hip_x < 20 else 2), (hy + fy) / 2.0 - (3 if fy < 36 else 0))
            _capsule(g, hip_x, hy, knee[0], knee[1], 2.2, 1.9, ramp)
            _capsule(g, knee[0], knee[1], fx, fy - 1, 1.9, 1.5, ramp)
            # shin wraps and the tabi at the foot
            g.put(fx, fy - 3, C["W"]); g.put(fx + 1, fy - 3, C["W"])
            g.put(fx, fy - 1, C["K"]); g.put(fx + 1, fy - 1, C["K"]); g.put(fx - 1, fy - 1, C["K"])
        # torso
        _capsule(g, 20, sy + 1, 20, hy - 1, 4.3, 3.6, ramp)
        # the sash
        for x in range(16, 25):
            if g.solid(x, hy - 2):
                g.put(x, hy - 2, C["R"]); g.put(x, hy - 1, C["R2"])
        # arms, reaching past the head
        for sh_x, hand in ((16, lh), (24, rh)):
            hx, hy2 = hand
            elbow = ((sh_x + hx) / 2.0 + (-2 if sh_x < 20 else 2), (sy + hy2) / 2.0 + 1)
            _capsule(g, sh_x, sy, elbow[0], elbow[1], 1.9, 1.6, ramp)
            _capsule(g, elbow[0], elbow[1], hx, hy2 + 1, 1.6, 1.3, ramp)
            g.put(hx, hy2, C["W"]); g.put(hx + 1, hy2, C["W"])      # wrapped hands on the wall
            g.put(int(elbow[0]), int(elbow[1]) + 1, C["W"])
        # the sword across the back, hilt over the left shoulder
        for i in range(15):
            x, y = 15 + i * 0.7, sy - 3 + i
            g.put(x, y, C["S"] if i > 3 else C["H"])
        g.put(14, sy - 4, C["H"])
        # the head from behind: a dark hood, the red band, its tails trailing
        for dy in range(-4, 4):
            for dx in range(-4, 4):
                if dx * dx + dy * dy <= 13:
                    g.put(20 + dx, sy - 6 + dy, C["M"] if dy < 0 else C["D"])
        for x in range(16, 24):
            if g.solid(x, sy - 6):
                g.put(x, sy - 6, C["R"])
        for i in range(7):
            sway = int(round(math.sin(phase + n * 1.6 + i * 0.7) * 1.2))
            g.put(23 + i // 2 + sway, sy - 6 + i, C["R"] if i < 5 else C["R2"])
            g.put(24 + i // 2 + sway, sy - 5 + i, C["R2"])
        # the world's gear, at the high hand
        hi = lh if lh[1] < rh[1] else rh
        hx, hy2 = hi
        if gear == "claws":
            for dx, dy in ((-1, -1), (0, -2), (1, -2), (2, -1)):
                g.put(hx + dx, hy2 + dy, C["S"])
        elif gear == "picks":
            for i in range(4):
                g.put(hx + 1, hy2 - 1 - i, C["S"])
            g.put(hx, hy2 - 4, C["S"]); g.put(hx + 2, hy2 - 4, C["S"])
            for x in range(16, 25):                   # a fur collar
                if g.solid(x, sy):
                    g.put(x, sy, C["W"])
        elif gear == "kunai":
            g.put(hx, hy2 - 1, C["S"]); g.put(hx, hy2 - 2, C["S"]); g.put(hx, hy2 - 3, (0x6A, 0x70, 0x80, 255))
        elif gear == "rope":
            for y in range(0, OUT_H):
                if not g.solid(20, y):
                    g.put(20, y, (0xB8, 0x98, 0x68, 255) if y % 3 else (0x7A, 0x60, 0x3C, 255))
        elif gear == "pole":
            for y in range(0, OUT_H):
                if not g.solid(27, y):
                    g.put(27, y, (0x5E, 0x74, 0x30, 255) if y % 9 else (0xA8, 0xC0, 0x60, 255))
                    g.put(28, y, (0x3A, 0x4A, 0x22, 255))
        g.outline(C["K"])
        frames.append(g)
    return frames


_clips_before_back = clips


def clips():
    out = _clips_before_back()
    out["ninja_climb"] = climb_back_frames(None)
    out["ninja_hang"] = [climb_back_frames(None, 0.5)[1], climb_back_frames(None, 1.5)[1]]
    for wk, gear in (("city", "claws"), ("grove", "pole"), ("snow", "picks"), ("castle", "kunai"), ("harbour", "rope")):
        fr = climb_back_frames(gear)
        out["ninja_climb_" + wk] = fr
        out["ninja_hang_" + wk] = [fr[1], climb_back_frames(gear, 1.5)[1]]
    return out
