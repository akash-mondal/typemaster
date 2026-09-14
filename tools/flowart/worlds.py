"""
The four worlds beyond the night city - KATA's road runs through all five in a
shuffled order, so each one must read as a different place at a glance.

    grove    Bamboo Grove at dawn: teal mist, rounded hills, thatched huts on
             stilts, bamboo decks, dragonflies
    snow     Snow Shrine Pass by moonlight: jagged white-capped peaks, snow on
             every roof, icicles, stone lanterns, pines
    castle   Castle Walls at sunset: a burning sky, a tiered keep, white plaster
             and black tile, gold ridge ends, sakura
    harbour  Harbour at dusk: a red sea, islands, a lighthouse, junks under
             sail, weathered warehouses and boat decks

Plus the pieces every world shares: the grappling post, the post lantern the
player can snuff, the archer's torch, footing cracks, and the gate torii.

Same rules as stage.py: authored shapes, control-point profiles and ordered
dither. No noise fields.
"""

import math
import random

import stage as ST
from stage import G, _profile, BAYER, INK, KAWARA, EAVE_TIP

CLEAR = (0, 0, 0, 0)


def rgb(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


# ------------------------------------------------------------------ helpers

def sky(steps, h=120):
    """Vertical gradient through the given colours, ordered-dithered at every
    boundary so it reads as a smooth sky rather than bands."""
    g = G(320, h)
    n = len(steps)
    for y in range(h):
        t = y / float(h - 1) * (n - 1)
        i = int(t)
        frac = t - i
        for x in range(320):
            thr = (BAYER[y % 4][x % 4] + 0.5) / 16.0
            k = min(n - 1, i + (1 if frac > thr else 0))
            g.put(x, y, steps[k])
    return g


def disc(r, lit, mid, dark, rim=None, glow=None):
    size = r * 2 + (8 if glow else 2)
    g = G(size, size)
    c = size / 2.0 - 0.5
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c)
            if d <= r:
                l = ((x - c) * -0.6 + (y - c) * -0.8) / r
                g.put(x, y, lit if l > 0.2 else mid if l > -0.45 else dark)
                if rim and r - 1.0 < d and l > 0.1:
                    g.put(x, y, rim)
            elif glow and d <= r + 3.5 and (BAYER[y % 4][x % 4] < (8 if d < r + 2 else 3)):
                g.put(x, y, glow)
    return g


def ridge(points, colour, seed, height, jitter=0.35, cap=None, cap_depth=3, band=None):
    """A silhouette strip. `cap` paints snow on the steep, high parts of the
    profile; `band` is (colour, rows) of mist or snow at the foot."""
    g = G(320, height)
    prof = _profile(points, 320, seed, jitter=jitter)
    lo = min(prof)
    for x in range(320):
        top = max(0, min(height - 1, prof[x]))
        for y in range(top, height):
            g.put(x, y, colour)
        if cap:
            slope = abs(prof[(x + 1) % 320] - prof[x - 1])
            depth = cap_depth + (2 if top - lo < 8 else 0) - (1 if slope < 1 else 0)
            if top - lo < height * 0.45:
                for y in range(top, min(height, top + max(1, depth))):
                    if y == top + depth - 1 and (x + y) % 2:
                        continue
                    g.put(x, y, cap)
    if band:
        bc, rows = band
        for x in range(320):
            for y in range(height - rows, height):
                if y >= height - rows // 2 or BAYER[y % 4][x % 4] < 7:
                    g.put(x, y, bc)
    return g


def tile_face(ramp, height=14, snow=None, seed=5):
    """A tiled roof face in the given ramp, optionally with snow lying on the
    upper courses and in lumps along the tile ends."""
    g = ST.roof_face(ramp, height)
    if snow:
        s0, s1 = snow
        rnd = random.Random(seed)
        prof = _profile([(0, 3), (13, 5), (27, 2), (41, 6), (54, 3)], 64, seed)
        for x in range(64):
            depth = prof[x]
            for y in range(0, depth):
                g.put(x, y, s0 if y < depth - 1 else s1)
            if rnd.random() < 0.18:
                g.put(x, depth + 4, s1)
    return g


def stamp_tile(w, h, rows, legend):
    g = G(w, h)
    g.stamp(rows, legend, 0, 0)
    return g


# ====================================================================== GROVE
GR = dict(
    sky=[rgb('#1A2E2C'), rgb('#22403A'), rgb('#2E5244'), rgb('#3E644E'),
         rgb('#557858'), rgb('#728C60'), rgb('#94A26C'), rgb('#B8B67C')],
    far=rgb('#3E5E4C'), mid=rgb('#2C4838'), near=rgb('#1A3024'), mist=rgb('#7E9676'),
    stalk0=rgb('#0F2218'), stalk1=rgb('#1E3A28'), stalk2=rgb('#34583C'), leaf=rgb('#2A4C30'),
    th0=rgb('#3C3018'), th1=rgb('#5A4822'), th2=rgb('#7A6230'), th3=rgb('#9C8040'),
    bam0=rgb('#3A4A22'), bam1=rgb('#5E7430'), bam2=rgb('#86A044'), bam3=rgb('#A8C060'),
    wall=rgb('#1C2616'),
)


def grove_tiles():
    c = GR
    t = {}
    t['sky_grove'] = sky(c['sky'])
    t['sun_grove'] = disc(12, rgb('#F6EEC0'), rgb('#EADCA0'), rgb('#D8C88A'), glow=rgb('#C8C488'))
    t['ridge_grove_far'] = ridge([(0, 40), (40, 26), (90, 34), (140, 20), (190, 30), (240, 22), (290, 36)],
                                 c['far'], 41, 60, jitter=0.2)
    t['ridge_grove_mid'] = ridge([(0, 30), (60, 18), (120, 30), (170, 16), (230, 28), (280, 20)],
                                 c['mid'], 42, 56, jitter=0.2)
    t['ridge_grove_near'] = ridge([(0, 26), (50, 34), (110, 22), (160, 32), (220, 24), (270, 34)],
                                  c['near'], 43, 50, jitter=0.3, band=(c['mist'], 10))

    # a stand of bamboo, silhouette with a few lit edges, 56x96
    g = G(56, 96)
    rnd = random.Random(7)
    for k, sx in enumerate((6, 15, 22, 31, 40, 48)):
        top = rnd.randint(0, 18)
        lean = rnd.uniform(-0.12, 0.12)
        for y in range(top, 96):
            x = int(sx + (96 - y) * lean)
            g.rect(x, y, x + 2, y, c['stalk1'] if k % 2 else c['stalk0'])
            g.put(x + 2, y, c['stalk2'] if (y // 3) % 3 == 0 else c['stalk1'])
            if (y - top) % 13 == 0:
                g.rect(x - 1, y, x + 3, y, c['stalk2'])
        for _ in range(4):
            ly = rnd.randint(top + 4, 60)
            lx = int(sx + (96 - ly) * lean)
            g.stamp(ST.BAMBOO_LEAF, {'#': c['leaf']}, lx + (1 if rnd.random() < 0.5 else -7), ly,
                    flip=rnd.random() < 0.5)
    t['bamboo_stand'] = g

    # a farmhouse with a steep thatched roof, far off, 46x30
    g = G(46, 30)
    for k in range(16):
        g.rect(22 - k * 1.4, k, 23 + k * 1.4, k, c['near'])
    g.rect(1, 16, 44, 16, c['near'])
    g.rect(6, 17, 39, 29, rgb('#142018'))
    g.rect(11, 21, 15, 25, rgb('#D8A850'))
    g.rect(29, 21, 33, 25, rgb('#8A6A34'))
    t['minka_far'] = g

    # roofs
    t['face_thatch_grove'] = ST.roof_face_thatch()
    g = G(64, 5)
    g.rect(0, 1, 63, 4, c['th1'])
    g.rect(0, 0, 63, 0, c['th3'])
    for x in range(3, 64, 10):
        g.rect(x, 1, x + 1, 4, c['th0'])
        g.put(x + 4, 2, c['th2'])
    t['ridge_thatch'] = g
    g = G(6, 4)
    g.rect(0, 0, 5, 1, c['th2']); g.rect(0, 2, 5, 3, c['th0'])
    t['eave_thatch'] = g
    # bamboo slat wall, 16x16, tiles both ways
    g = G(16, 16)
    for x in range(16):
        col = c['bam0'] if x % 4 == 0 else c['bam1'] if x % 4 in (1, 3) else c['bam2']
        g.rect(x, 0, x, 15, col)
    g.rect(0, 7, 15, 7, c['th0'])
    g.rect(0, 8, 15, 8, c['bam0'])
    t['wall_bamboo'] = g
    # bamboo deck for platforms: poles laid side by side, 64x6
    g = G(64, 6)
    g.rect(0, 0, 63, 5, c['bam1'])
    g.rect(0, 0, 63, 0, c['bam3'])
    g.rect(0, 1, 63, 1, c['bam2'])
    g.rect(0, 5, 63, 5, c['bam0'])
    for x in range(0, 64, 12):
        g.rect(x, 0, x, 5, c['bam0'])
        g.put(x + 1, 2, c['th0'])
    t['deck_bamboo'] = g
    # a rope rail, 16x8
    g = G(16, 8)
    for x in range(16):
        g.put(x, 2 + int(round(math.sin(x / 15.0 * math.pi) * 1.5)), c['th2'])
    g.rect(0, 0, 1, 7, c['bam1']); g.put(1, 0, c['bam3'])
    t['rail_rope'] = g
    # a lattice window with lamplight, 10x10
    t['window_grove'] = stamp_tile(10, 10, ST.SHOJI, {'#': c['bam0'], 'p': rgb('#D8B45A')})
    # dragonfly, two frames, 9x5
    DF = ["...#.#...", "wwww#wwww", "...###...", "....#....", "....#...."]
    DF2 = [".........", "...#.#...", "ww.###.ww", "..w.#.w..", "....#...."]
    t['dragonfly_a'] = stamp_tile(9, 5, DF, {'#': rgb('#1C5A5A'), 'w': rgb('#B8D8C8')})
    t['dragonfly_b'] = stamp_tile(9, 5, DF2, {'#': rgb('#1C5A5A'), 'w': rgb('#B8D8C8')})
    # a scarecrow-ish bamboo fence topper, 26x18
    g = G(26, 18)
    for x in (1, 9, 17, 24):
        g.rect(x, 2, x + 1, 17, c['bam1']); g.put(x, 2, c['bam3'])
    g.rect(0, 6, 25, 6, c['th2']); g.rect(0, 12, 25, 12, c['th2'])
    t['fence_bamboo'] = g
    return t


# ======================================================================= SNOW
SN = dict(
    sky=[rgb('#090E22'), rgb('#0E1630'), rgb('#141E3E'), rgb('#1C284C'),
         rgb('#26345A'), rgb('#324268'), rgb('#405076'), rgb('#505E82')],
    far=rgb('#2C3A5C'), mid=rgb('#1E2A46'), near=rgb('#131B30'),
    snow=rgb('#DCE6F4'), snow2=rgb('#A8B8D2'), snow3=rgb('#7888A8'),
    pine0=rgb('#0C1A18'), pine1=rgb('#16302A'),
    stone0=rgb('#3A4052'), stone1=rgb('#5A6276'), stone2=rgb('#7E879C'),
    ice=rgb('#BCD8EE'),
)


def snow_tiles():
    c = SN
    t = {}
    t['sky_snow'] = sky(c['sky'])
    t['moon_snow'] = disc(11, rgb('#F0F4FA'), rgb('#CDD6E6'), rgb('#9EAAC2'), glow=rgb('#3A4A72'))
    t['ridge_snow_far'] = ridge([(0, 44), (26, 14), (48, 34), (78, 8), (104, 30), (138, 12), (166, 38),
                                 (200, 16), (228, 34), (262, 6), (292, 30)], c['far'], 51, 64,
                                jitter=0.6, cap=c['snow2'], cap_depth=4)
    t['ridge_snow_mid'] = ridge([(0, 34), (40, 16), (70, 30), (110, 12), (150, 32), (186, 18),
                                 (230, 30), (268, 14), (300, 28)], c['mid'], 52, 56,
                                jitter=0.5, cap=c['snow3'], cap_depth=3)
    t['ridge_snow_near'] = ridge([(0, 28), (60, 22), (120, 30), (180, 20), (240, 28), (290, 22)],
                                 c['near'], 53, 50, jitter=0.4, band=(c['snow3'], 8))
    # pagoda with snow on every tier
    g = ST.pagoda(4, 36, 23)
    for y in range(g.h):
        for x in range(g.w):
            if g.px[y][x] == INK and (y == 0 or g.px[y - 1][x][3] == 0):
                g.put(x, y, c['snow'])
    t['pagoda_snow'] = g
    # a snow-laden pine, 26x42
    g = G(26, 42)
    for tier in range(5):
        y0 = 2 + tier * 7
        w = 3 + tier * 2.6
        for k in range(9):
            half = int(w * k / 8.0)
            g.rect(13 - half, y0 + k, 12 + half, y0 + k, c['pine1'] if k < 5 else c['pine0'])
        for k in range(3):
            half = int(w * k / 8.0) + 1
            g.rect(13 - half, y0 + k + 1, 12 + half - 1, y0 + k + 1, c['snow'] if k < 2 else c['snow2'])
    g.rect(12, 38, 13, 41, rgb('#2A1C12'))
    t['pine_snow'] = g
    # a stone lantern (toro) with a snow cap, 14x22
    TORO = [
        "....ssss......",
        "..ssssssss....",
        ".SSSSSSSSSS...",
        "..LLLLLLLL....",
        "...LyyyyL.....",
        "...LyYYyL.....",
        "...LyyyyL.....",
        "..LLLLLLLL....",
        "....LLLL......",
        "....LmmL......",
        "....LmmL......",
        "....LmmL......",
        "...LLLLLL.....",
        "..LmmmmmmL....",
    ]
    g = G(14, 22)
    g.stamp(TORO, {'s': c['snow'], 'S': c['snow2'], 'L': c['stone0'], 'm': c['stone1'],
                   'y': rgb('#E8A848'), 'Y': rgb('#FFE0A0')}, 0, 4)
    t['toro'] = g
    # roofs
    t['face_snow'] = tile_face((rgb('#1A2030'), rgb('#283044'), rgb('#384258'), rgb('#4C586E')),
                               snow=(c['snow'], c['snow2']), seed=9)
    t['face_snow_temple'] = tile_face((rgb('#10262A'), rgb('#18383A'), rgb('#244E4C'), rgb('#346660')),
                                      snow=(c['snow'], c['snow2']), seed=13)
    g = G(64, 5)
    prof = _profile([(0, 1), (16, 0), (33, 1), (48, 0)], 64, 3)
    for x in range(64):
        g.rect(x, prof[x], x, 4, c['snow'])
        g.put(x, 4, c['snow2'])
    t['ridge_snow'] = g
    # icicles hanging from an eave, 64x7
    g = G(64, 7)
    rnd = random.Random(17)
    g.rect(0, 0, 63, 0, c['snow2'])
    x = 1
    while x < 63:
        ln = rnd.choice((2, 3, 3, 4, 6))
        for y in range(1, ln + 1):
            g.put(x, y, c['ice'] if y < ln else rgb('#E8F4FF'))
        if ln > 3:
            g.put(x + 1, 1, c['ice'])
        x += rnd.randint(3, 6)
    t['icicles'] = g
    g = G(6, 4)
    g.rect(0, 0, 5, 1, c['snow']); g.rect(0, 2, 5, 3, rgb('#283044'))
    t['eave_snow'] = g
    t['pine_small'] = t['pine_snow']
    return t


# ===================================================================== CASTLE
CA = dict(
    sky=[rgb('#361C3C'), rgb('#562646'), rgb('#7A324C'), rgb('#A0424A'),
         rgb('#C45842'), rgb('#DE7646'), rgb('#EC9854'), rgb('#F4BA70')],
    far=rgb('#6E3048'), mid=rgb('#4E223C'), near=rgb('#32162A'), mist=rgb('#B8607A'),
    plaster=rgb('#D8D0C2'), plaster2=rgb('#B4AC9E'), plaster3=rgb('#8E8676'),
    black0=rgb('#121216'), black1=rgb('#1E1E26'), black2=rgb('#2E2E38'), black3=rgb('#44444E'),
    gold=rgb('#E8B040'), gold2=rgb('#A87A22'),
    pink0=rgb('#B45A7A'), pink1=rgb('#DC86A2'), pink2=rgb('#F4B8CA'), trunk=rgb('#2A1620'),
)


def castle_tiles():
    c = CA
    t = {}
    t['sky_castle'] = sky(c['sky'])
    t['sun_castle'] = disc(15, rgb('#FFE2A0'), rgb('#FFB468'), rgb('#F28A52'), glow=rgb('#F6A86A'))
    # a far town skyline of roofs, 320x60
    g = G(320, 60)
    rnd = random.Random(61)
    x = 0
    while x < 320:
        w = rnd.randint(14, 30)
        top = rnd.randint(30, 44)
        for k in range(5):
            g.rect(x - 2 + k, top + k, x + w + 2 - k, top + k, c['far'])
        g.rect(x, top + 5, x + w, 59, c['far'])
        if rnd.random() < 0.6:
            g.rect(x + 4, top + 9, x + 5, top + 10, rgb('#F2A63C'))
        x += w + rnd.randint(2, 8)
    t['ridge_castle_far'] = g
    t['ridge_castle_mid'] = ridge([(0, 36), (70, 24), (140, 34), (200, 22), (260, 32)],
                                  c['mid'], 62, 56, jitter=0.2)
    t['ridge_castle_near'] = ridge([(0, 30), (80, 26), (160, 32), (240, 24)],
                                   c['near'], 63, 50, jitter=0.2, band=(c['mist'], 8))
    # the keep (tenshu), 70x84: stone base, five tiers of white wall and black roof
    g = G(70, 84)
    for y in range(66, 84):                       # battered stone base
        inset = int((84 - y) * 0.35)
        g.rect(4 + inset, y, 65 - inset, y, c['near'] if y % 4 else c['mid'])
    widths = [52, 44, 36, 28, 20]
    y = 66
    for k, w in enumerate(widths):
        h = 9
        cx = 35
        g.rect(cx - w // 2, y - h + 3, cx + w // 2, y - 1, c['mid'])          # wall in shade
        for wx in range(cx - w // 2 + 3, cx + w // 2 - 3, 6):
            g.rect(wx, y - h + 5, wx + 1, y - h + 6, rgb('#F2A63C'))
        ry = y - h
        rw = w + 10
        for j in range(3):
            g.rect(cx - rw // 2 + j, ry + j, cx + rw // 2 - j, ry + j, c['near'])
        g.stamp(EAVE_TIP, {'#': c['near']}, cx - rw // 2 - 4, ry - 2)
        g.stamp(EAVE_TIP, {'#': c['near']}, cx + rw // 2 - 1, ry - 2, flip=True)
        y = ry
    g.rect(33, y - 4, 36, y, c['near'])
    g.put(31, y - 5, c['gold']); g.put(38, y - 5, c['gold'])
    t['castle_keep'] = g
    # a sakura tree, 44x36
    g = G(44, 36)
    rnd = random.Random(64)
    g.rect(20, 18, 23, 35, c['trunk'])
    g.rect(14, 16, 20, 18, c['trunk']); g.rect(23, 14, 30, 16, c['trunk'])
    for _ in range(170):
        a = rnd.uniform(0, math.pi * 2)
        r = rnd.uniform(0, 1) ** 0.6
        x = 22 + math.cos(a) * r * 20
        y = 13 + math.sin(a) * r * 11
        col = c['pink2'] if y < 9 else c['pink1'] if y < 16 else c['pink0']
        g.rect(x, y, x + 1, y, col)
    t['sakura_tree'] = g
    # roofs: black kawara, gold-tipped ridge
    t['face_black'] = ST.roof_face((c['black0'], c['black1'], c['black2'], c['black3']))
    g = G(64, 5)
    g.rect(0, 1, 63, 4, c['black1'])
    g.rect(0, 0, 63, 0, c['black3'])
    for x in range(6, 64, 16):
        g.rect(x, 0, x + 3, 0, c['gold'])
        g.rect(x, 1, x + 3, 1, c['gold2'])
    t['ridge_gold'] = g
    g = G(12, 8)
    g.stamp(ST.EAVE_CURL, {'#': c['black1'], 'h': c['gold']}, 0, 0)
    t['eave_gold'] = g
    # plaster wall 16x16 and the namako band (black tile set diagonally in white)
    g = G(16, 16)
    for y in range(16):
        for x in range(16):
            g.put(x, y, c['plaster'] if BAYER[y % 4][x % 4] > 1 else c['plaster2'])
    t['wall_plaster'] = g
    g = G(16, 16)
    for y in range(16):
        for x in range(16):
            on = (x + y) % 8 in (0, 1) or (x - y) % 8 in (0, 1)
            g.put(x, y, c['plaster'] if on else c['black1'])
    t['namako'] = g
    SLIT = ["#####", "#...#", "#.#.#", "#...#", "#.#.#", "#...#", "#####"]
    t['window_slit'] = stamp_tile(5, 7, SLIT, {'#': c['plaster3'], '.': c['black0']})
    WIN = ["##########", "#bbbbbbbb#", "#b#b#b#bb#", "#b#b#b#bb#", "#b#b#b#bb#", "#bbbbbbbb#", "##########"]
    t['window_castle'] = stamp_tile(10, 7, WIN, {'#': c['plaster3'], 'b': c['black0']})
    # a small white turret for rooftops, 30x24
    g = G(30, 24)
    for k in range(5):
        g.rect(4 - k + 4, k, 25 + k - 4, k, c['black2'] if k < 2 else c['black1'])
    g.stamp(EAVE_TIP, {'#': c['black1']}, 1, 1)
    g.stamp(EAVE_TIP, {'#': c['black1']}, 23, 1, flip=True)
    g.put(15, 0, c['gold'])
    g.rect(7, 5, 22, 20, c['plaster'])
    g.rect(7, 20, 22, 23, c['plaster2'])
    g.rect(10, 9, 12, 13, c['black0']); g.rect(17, 9, 19, 13, c['black0'])
    t['turret'] = g
    g = G(30, 24)
    rnd = random.Random(65)
    g.rect(14, 12, 15, 23, c['trunk'])
    for _ in range(80):
        a = rnd.uniform(0, math.pi * 2); r = rnd.uniform(0, 1) ** 0.6
        x = 15 + math.cos(a) * r * 13; y = 9 + math.sin(a) * r * 8
        g.put(x, y, c['pink2'] if y < 6 else c['pink1'] if y < 11 else c['pink0'])
    t['sakura_small'] = g
    return t


# ==================================================================== HARBOUR
HB = dict(
    sky=[rgb('#22143A'), rgb('#381A42'), rgb('#542244'), rgb('#782C44'),
         rgb('#9C3A40'), rgb('#C0503C'), rgb('#DA6E3E'), rgb('#EA924C')],
    isle=rgb('#4A2440'), sea0=rgb('#2A1434'), sea1=rgb('#44203E'), sea2=rgb('#6A3044'),
    glint=rgb('#F2A05A'), near=rgb('#1C0E22'),
    board0=rgb('#2E2626'), board1=rgb('#46383A'), board2=rgb('#62504C'), board3=rgb('#806A60'),
    hull0=rgb('#1E120E'), hull1=rgb('#3A2418'), hull2=rgb('#5A3822'), hull3=rgb('#7A4E2E'),
    sail=rgb('#D8C4A0'), sail2=rgb('#A89274'),
)


def harbour_tiles():
    c = HB
    t = {}
    t['sky_harbour'] = sky(c['sky'])
    t['sun_harbour'] = disc(14, rgb('#FFD890'), rgb('#FFA860'), rgb('#F07A48'), glow=rgb('#F29A58'))
    t['ridge_harbour_far'] = ridge([(0, 52), (30, 44), (70, 50), (120, 40), (160, 50), (230, 46), (280, 52)],
                                   c['isle'], 71, 60, jitter=0.15)
    # the open sea, 320x56, with long glints under the sun
    g = G(320, 56)
    rnd = random.Random(72)
    for y in range(56):
        for x in range(320):
            g.put(x, y, c['sea0'] if y > 30 else c['sea1'] if y > 10 else c['sea2'])
    for _ in range(140):
        y = rnd.randint(0, 50)
        x = rnd.randint(0, 319)
        ln = rnd.randint(3, 14) * (2 if y < 16 else 1)
        col = c['glint'] if (abs(x - 250) < 40 and y < 26) else c['sea2']
        g.rect(x, y, min(319, x + ln), y, col)
    t['sea'] = g
    t['ridge_harbour_near'] = ridge([(0, 40), (40, 34), (90, 42), (150, 32), (210, 40), (270, 34)],
                                    c['near'], 73, 50, jitter=0.1)
    # a junk under sail, 44x40
    g = G(44, 40)
    for y in range(30, 38):
        inset = (y - 30) // 2
        g.rect(2 + inset * 2, y, 41 - inset, y, c['near'])
    g.rect(20, 2, 21, 30, c['near'])
    for y in range(4, 28):
        w = 6 + (y - 4) // 2
        g.rect(22, y, 22 + w, y, c['sail'] if y % 5 else c['sail2'])
    for y in range(10, 28):
        w = 3 + (y - 10) // 2
        g.rect(19 - w, y, 19, y, c['sail2'] if y % 5 else c['near'])
    t['junk'] = g
    # a lighthouse lantern tower (todai), 18x50
    g = G(18, 50)
    g.rect(8, 0, 9, 1, c['near'])
    for k in range(4):
        g.rect(8 - k * 2, 2 + k, 9 + k * 2, 2 + k, c['near'])
    g.rect(4, 6, 13, 13, rgb('#F2B858'))
    g.rect(6, 8, 11, 11, rgb('#FFE8B0'))
    g.rect(3, 14, 14, 15, c['near'])
    for y in range(16, 50):
        inset = max(0, 5 - (y - 16) // 7)
        g.rect(3 + inset - 2, y, 14 - inset + 2, y, c['near'])
    t['lighthouse'] = g
    # gulls, two frames, 9x4
    GA = ["#.......#", ".##...##.", "...###...", "........."]
    GB = [".........", "...###...", ".##...##.", "#.......#"]
    t['gull_a'] = stamp_tile(9, 4, GA, {'#': rgb('#F0E6D8')})
    t['gull_b'] = stamp_tile(9, 4, GB, {'#': rgb('#F0E6D8')})
    # roofs: weathered board roofs with battens
    g = G(64, 14)
    for y in range(14):
        t_ = y / 13.0
        base = c['board3'] if t_ < 0.2 else c['board2'] if t_ < 0.55 else c['board1']
        g.rect(0, y, 63, y, base)
    for x in range(0, 64, 8):
        g.rect(x, 0, x, 13, c['board0'])
        g.rect(x + 1, 0, x + 1, 13, c['board3'] if x % 16 == 0 else c['board2'])
    rnd = random.Random(74)
    for _ in range(18):
        g.put(rnd.randrange(64), rnd.randrange(14), c['board0'])
    t['face_boards'] = g
    g = G(64, 4)
    g.rect(0, 0, 63, 3, c['board1']); g.rect(0, 0, 63, 0, c['board3'])
    for x in range(0, 64, 12):
        g.rect(x, 1, x + 2, 3, c['board0'])
    t['ridge_boards'] = g
    g = G(6, 4)
    g.rect(0, 0, 5, 2, c['board1']); g.rect(0, 3, 5, 3, c['board0'])
    t['eave_boards'] = g
    # horizontal plank wall, 16x16
    g = G(16, 16)
    for y in range(16):
        g.rect(0, y, 15, y, c['board1'] if y % 4 else c['board0'])
        if y % 4 == 1:
            g.rect(0, y, 15, y, c['board2'])
    g.put(5, 2, c['board0']); g.put(12, 10, c['board0'])
    t['wall_planks'] = g
    PORT = ["..####..", ".#oooo#.", "#oOOoo##", "#oOooo##", "#oooooo#", ".#oooo#.", "..####.."]
    t['window_port'] = stamp_tile(8, 7, PORT, {'#': c['hull3'], 'o': rgb('#E0903C'), 'O': rgb('#FFD088')})
    # a boat hull: 16 wide middle that tiles, 24 tall, and a bow end
    g = G(16, 24)
    for y in range(24):
        col = c['hull3'] if y < 2 else c['hull2'] if y < 9 else c['hull1'] if y < 18 else c['hull0']
        g.rect(0, y, 15, y, col)
    for y in (6, 13, 20):
        g.rect(0, y, 15, y, c['hull0'])
    g.rect(0, 2, 15, 3, rgb('#A83A2A'))
    t['hull_mid'] = g
    g = G(18, 24)
    for y in range(24):
        cut = int((y / 23.0) ** 1.6 * 16)
        col = c['hull3'] if y < 2 else c['hull2'] if y < 9 else c['hull1'] if y < 18 else c['hull0']
        g.rect(0, y, 17 - cut, y, col)
        if y in (6, 13, 20):
            g.rect(0, y, 17 - cut, y, c['hull0'])
        if y in (2, 3):
            g.rect(0, y, 17 - cut, y, rgb('#A83A2A'))
    t['hull_bow'] = g
    # stacked barrels and a coil of rope, 24x14
    g = G(24, 14)
    for bx, by in ((0, 6), (8, 6), (4, 0)):
        g.rect(bx + 1, by, bx + 6, by + 7, c['hull2'])
        g.rect(bx, by + 1, bx + 7, by + 6, c['hull2'])
        g.rect(bx, by + 2, bx + 7, by + 2, c['board0'])
        g.rect(bx, by + 5, bx + 7, by + 5, c['board0'])
        g.rect(bx + 2, by + 1, bx + 2, by + 6, c['hull3'])
    for k in range(3):
        g.rect(16, 8 + k * 2, 23, 8 + k * 2, c['sail2'])
        g.rect(17, 9 + k * 2, 22, 9 + k * 2, c['sail'])
    t['barrels'] = g
    # the mast used as a topper on boats, 28x40
    g = G(28, 40)
    g.rect(13, 0, 14, 39, c['hull1'])
    for y in range(4, 30):
        w = 4 + (y - 4) // 3
        g.rect(15, y, 15 + w, y, c['sail'] if (y // 4) % 2 else c['sail2'])
    g.rect(10, 3, 26, 3, c['hull0'])
    t['mast'] = g
    return t


# ===================================================================== SHARED

def shared_tiles():
    t = {}
    WOOD0, WOOD1, WOOD2 = ST.WOOD0, ST.WOOD1, ST.WOOD2
    IRON = rgb('#8C93A4'); IRON2 = rgb('#4E5566')
    # the grappling post: stands on the far roof, arm reaching back over the gap
    g = G(56, 64)
    g.rect(50, 4, 52, 63, WOOD1); g.rect(52, 4, 52, 63, WOOD2)
    g.rect(2, 4, 53, 6, WOOD1); g.rect(2, 4, 53, 4, WOOD2)
    for k in range(18):                                   # the brace
        g.rect(50 - k, 7 + k, 51 - k, 7 + k, WOOD0)
    g.rect(49, 0, 53, 3, WOOD0)
    # iron ring hanging from the arm's end
    for a in range(0, 360, 20):
        x = 5 + math.cos(math.radians(a)) * 3
        y = 12 + math.sin(math.radians(a)) * 3
        g.put(round(x), round(y), IRON)
    g.rect(5, 7, 5, 8, IRON2)
    # rope wraps
    for y in (20, 26, 32):
        g.rect(49, y, 53, y, rgb('#B89868'))
    t['hook_post'] = g
    HOOK = ["#...#", "##.##", ".###.", "..#..", "..#.."]
    t['hook'] = stamp_tile(5, 5, HOOK, {'#': IRON})
    # the post lantern: lit and snuffed, 8x24
    PL = ["..####..", ".#llll#.", "#lLLLLl#", "#lLLLLl#", "#llllll#", ".#llll#.", "..####..",
          "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...",
          "...##...", "...##...", "...##...", "...##...", "..####..", ".######."]
    t['post_lantern_lit'] = stamp_tile(8, 20, PL, {'#': INK, 'l': ST.LAMP2, 'L': ST.LAMP3})
    t['post_lantern_dark'] = stamp_tile(8, 20, PL, {'#': INK, 'l': rgb('#2A2A30'), 'L': rgb('#3A3A42')})
    # glow halo behind a lit lantern, dithered, 20x20
    g = G(20, 20)
    for y in range(20):
        for x in range(20):
            d = math.hypot(x - 9.5, y - 9.5)
            if d < 9.5 and BAYER[y % 4][x % 4] < (6 if d < 5 else 2):
                g.put(x, y, ST.LAMP1)
    t['lantern_glow'] = g
    # the archer's torch, two flame frames, 6x16
    for n, fl in enumerate((["..y...", ".yYy..", ".yYYy.", "..rr..", "..##.."],
                            ["...y..", "..yYy.", ".yYYy.", "..rr..", "..##.."])):
        g = G(6, 16)
        g.stamp(fl, {'y': ST.LAMP2, 'Y': ST.LAMP3, 'r': ST.LAMP1, '#': WOOD0}, 0, 0)
        g.rect(2, 5, 3, 15, WOOD1)
        t['torch_%s' % 'ab'[n]] = g
    # footing: a crack in the ridge tiles, and a broken hole
    t['crack_1'] = stamp_tile(8, 4, ["...#....", "..#.#...", ".#...#..", "......#."], {'#': INK})
    t['crack_2'] = stamp_tile(10, 5, ["....#.....", "..##.#....", ".#....##..", "#.......#.", ".........#"], {'#': INK})
    g = G(14, 8)
    g.rect(2, 0, 11, 7, rgb('#05060A'))
    for x, y in ((1, 0), (12, 0), (0, 1), (13, 1), (3, 7), (10, 7)):
        g.put(x, y, rgb('#05060A'))
    g.put(4, 1, ST.TILE2); g.put(9, 2, ST.TILE3)
    t['hole'] = g
    # the gate: a great vermilion torii that stands between worlds, 60x52
    V = ST.VERM; V2 = rgb('#8A1A1E')
    g = G(60, 52)
    g.rect(0, 0, 59, 2, INK)
    g.rect(2, 3, 57, 5, V)
    g.rect(0, 1, 2, 3, V); g.rect(57, 1, 59, 3, V)
    g.rect(6, 12, 53, 14, V)
    g.rect(28, 6, 31, 12, V)
    for px in (10, 46):
        g.rect(px, 6, px + 4, 51, V)
        g.rect(px + 4, 6, px + 4, 51, V2)
        g.rect(px - 1, 46, px + 5, 51, INK)
    t['gate_torii'] = g
    return t


def tiles():
    out = {}
    for f in (grove_tiles, snow_tiles, castle_tiles, harbour_tiles, shared_tiles):
        out.update(f())
    return out


if __name__ == '__main__':
    for k, v in tiles().items():
        print('%-20s %dx%d' % (k, v.w, v.h))
