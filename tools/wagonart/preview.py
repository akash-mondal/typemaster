#!/usr/bin/env python3
"""Compose a still of each biome from the built assets, for review."""
import json, os, sys
from PIL import Image, ImageDraw
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
A = os.path.join(ROOT, "assets", "wagonheart")
M = json.load(open(os.path.join(A, "manifest.json")))
atlas = Image.open(os.path.join(A, "atlas.png")).convert("RGBA")
land = Image.open(os.path.join(A, "land.png")).convert("RGBA")
def clip(name, i=0):
    c = M["clips"][name]; f = c["frames"][i % len(c["frames"])]
    return atlas.crop((f[0], f[1], f[0] + f[2], f[1] + f[3])), c["anchor"]
def layer(name):
    L = M["land"]["layers"][name]; r = L["rect"]
    return land.crop((r[0], r[1], r[0] + r[2], r[1] + r[3])), L["y"]
def put(scene, name, x, y, i=0):
    im, a = clip(name, i); scene.alpha_composite(im, (int(x - a[0]), int(y - a[1])))
def tile(scene, im, y, off=0):
    x = -(off % im.width)
    while x < 320:
        scene.alpha_composite(im, (x, y)); x += im.width
SKY = {"meadow": ("#5A9AE0", "#D8ECF0"), "river": ("#68A8E0", "#E0F0F0"), "barrens": ("#6A9ACE", "#E8E0D0"), "highwood": ("#5A98C8", "#D0E4C8"),
       "pass": ("#3A80E0", "#E8F4FF"), "saltmere": ("#8AB8F0", "#FFFFFF"), "coast": ("#2A98E8", "#C8F4F4")}
def hexrgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
shots = []
GROUND = 190
for b, s in M["land"]["biomes"].items():
    sc = Image.new("RGBA", (320, 240))
    d = ImageDraw.Draw(sc)
    t, bo = hexrgb(SKY[b][0]), hexrgb(SKY[b][1])
    for y in range(240):
        u = min(1, y / 170); d.line([(0, y), (319, y)], fill=tuple(int(t[k] + (bo[k] - t[k]) * u) for k in range(3)) + (255,))
    if s["clouds"]:
        cl, cy = layer("clouds_" + s["clouds"]); tile(sc, cl, cy - 30, 40)
    far, fy = layer(b + "_far"); tile(sc, far, s["farBase"] - far.height, 30)
    if s["sea"]:
        sea, _ = layer("coast_sea"); tile(sc, sea, 158)
    if not s["noMid"]:
        mid, my = layer(b + "_mid"); tile(sc, mid, s["midBase"] - mid.height, 60)
    gr, _ = layer(b + "_ground"); tile(sc, gr, GROUND - 14, 90)
    # the ground continues below the strip
    sc.alpha_composite(Image.new("RGBA", (320, 240 - (GROUND - 14 + gr.height)), gr.getpixel((10, gr.height - 1))), (0, GROUND - 14 + gr.height))
    road = GROUND + 12
    put(sc, "tree_oak" if b in ("meadow", "river", "coast") else "tree_pine" if b in ("highwood", "pass") else "tree_joshua" if b == "saltmere" else "stone_0", 40, GROUND + 4)
    if b in ("meadow", "barrens"): put(sc, "stone_2", 270, GROUND + 3)
    put(sc, "horse_walk_far", 104, road - 2, 4)
    put(sc, "horse_walk", 96, road + 1, 0)
    put(sc, "wagon_%d" % (1 if b == "pass" else 0), 186, road + 4, 2)
    put(sc, "man_bowler_walk", 128, road + 10, 1)
    put(sc, "woman_blue_walk", 250, road + 9, 2)
    put(sc, "man_coat_walk", 268, road + 10, 3)
    shots.append(sc.resize((640, 480), Image.NEAREST))
sheet = Image.new("RGBA", (1280, 480 * 4), (0, 0, 0, 255))
for i, s in enumerate(shots): sheet.alpha_composite(s, ((i % 2) * 640, (i // 2) * 480))
sheet.save("/tmp/wh_scenes.png")
# sprites
sp = Image.new("RGBA", (1280, 560), (70, 90, 70, 255)); x = y = 6; rowh = 0
for n in ["wagon_0", "wagon_1", "wagon_2", "horse_walk", "horse_walk_far", "deer_run", "boar_run", "bear_walk", "wolf_run", "fox_run", "rabbit_hop", "man_bowler_walk", "man_tophat_walk", "man_coat_walk", "woman_red_walk", "woman_blue_walk", "woman_green_walk", "campfire", "crow_fly", "stone_0", "stone_1", "stone_2", "stone_2_awake", "grave_stone", "grave_cross", "fort", "cabin", "tent", "signpost", "raft", "water_river", "tree_oak", "tree_pine", "tree_joshua", "rock_a", "bush_berry"] + [k for k in M["clips"] if k.startswith("icon_")]:
    im, _ = clip(n); im = im.resize((im.width * 2, im.height * 2), Image.NEAREST)
    if x + im.width > 1274: x = 6; y += rowh + 6; rowh = 0
    sp.alpha_composite(im, (x, y)); x += im.width + 6; rowh = max(rowh, im.height)
for t in ["logo_wagonheart", "icon_wagonheart"]:
    r = M["tiles"][t]; im = atlas.crop((r[0], r[1], r[0] + r[2], r[1] + r[3])).resize((r[2] * 3, r[3] * 3), Image.NEAREST)
    if x + im.width > 1274: x = 6; y += rowh + 6; rowh = 0
    sp.alpha_composite(im, (x, y)); x += im.width + 6; rowh = max(rowh, im.height)
sp.save("/tmp/wh_sprites.png")
