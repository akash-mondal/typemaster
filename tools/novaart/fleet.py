"""
fleet.py - NOVA's ships, effects and sky, cut from CC0 reference packs.

Sources (all CC0, no attribution required; credited in the manifest anyway):
  Foozle "Void" Main Ship, Enemy Fleets 1-3, Pickups, Environment - foozlecc.itch.io
  GrafxKid "Mini Pixel Pack 3" - grafxkid.itch.io

Every clip is cut from its sheet, composited (engines under hulls), flipped so
enemies face down the screen, and trimmed to the union of its frames. Anchors
are kept at the ship's own centre so a ship and its destruction line up.

Rotating sprites use a small RotSprite: Scale2x twice, rotate nearest-neighbour,
then sample back down, which keeps pixel art crisp at every angle.
"""

import math
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, "ref")
FZ = os.path.join(REF, "foozle-void")
MAIN = os.path.join(FZ, "void-main-ship", "Foozle_2DS0011_Void_MainShip")
FLEET = {
    "klaed": (os.path.join(FZ, "void-fleet-pack-1", "Foozle_2DS0012_Void_EnemyFleet_1", "Kla'ed"), {
        "base": "Base/PNGs/Kla'ed - {r} - Base.png",
        "engine": "Engine/PNGs/Kla'ed - {r} - Engine.png",
        "die": "Destruction/PNGs/Kla'ed - {r} - Destruction.png",
        "roles": {"scout": "Scout", "fighter": "Fighter", "bomber": "Bomber", "torpedo": "Torpedo Ship", "dread": "Dreadnought"},
    }),
    "nairan": (os.path.join(FZ, "void-fleet-pack-2", "Foozle_2DS0013_Void_EnemyFleet_2", "Nairan"), {
        "base": "Designs - Base/PNGs/Nairan - {r} - Base.png",
        "engine": "Engine Effects/PNGs/Nairan - {r} - Engine.png",
        "die": "Destruction/PNGs/Nairan - {r} -  Destruction.png",
        "roles": {"scout": "Scout", "fighter": "Fighter", "bomber": "Bomber", "torpedo": "Torpedo Ship", "dread": "Dreadnought"},
    }),
    "nautolan": (os.path.join(FZ, "void-fleet-pack-3", "Foozle_2DS0014_Void_EnemyFleet_3", "Nautolan"), {
        "base": "Designs - Base/PNGs/Nautolan Ship - {r} - Base.png",
        "engine": "Engine Effects/PNGs/Nautolan Ship - {r} - Engine Effect.png",
        "die": "Destruction/PNGs/Nautolan Ship - {r}.png",
        "roles": {"scout": "Scout", "fighter": "Fighter", "bomber": "Bomber", "torpedo": "Torpedo Ship", "dread": "Dreadnought"},
    }),
}
PROJ = {
    "klaed": ("Projectiles/PNGs/Kla'ed - Torpedo.png", "Projectiles/PNGs/Kla'ed - Bullet.png"),
    "nairan": ("Weapon Effects - Projectiles/PNGs/Nairan - Rocket.png", "Weapon Effects - Projectiles/PNGs/Nairan - Bolt.png"),
    "nautolan": ("Weapon Effects - Projectiles/PNGs/Nautolan - Rocket.png", "Weapon Effects - Projectiles/PNGs/Nautolan - Spinning Bullet.png"),
}
# game role -> fleet role
ROLE = {"drone": "scout", "raptor": "fighter", "gemini": "bomber", "warden": "torpedo", "boss": "dread"}


def load(path):
    return Image.open(path).convert("RGBA")


def frames_of(path, fw=None, fh=None, pick=None):
    im = load(path)
    fh = fh or im.height
    fw = fw or fh
    n = max(1, im.width // fw)
    out = [im.crop((i * fw, 0, i * fw + fw, fh)) for i in range(n)]
    if pick:
        out = [out[i] for i in pick(len(out))]
    return out


def subsample(n, k):
    if n <= k:
        return list(range(n))
    return [round(i * (n - 1) / (k - 1)) for i in range(k)]


def trim(frames, pad=0):
    """crop every frame to the union of their content; return frames and the
    offset of the original canvas centre inside the trimmed box"""
    box = None
    for f in frames:
        b = f.getbbox()
        if not b:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    if box is None:
        box = (0, 0, 1, 1)
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(frames[0].width, box[2] + pad), min(frames[0].height, box[3] + pad))
    cx, cy = frames[0].width // 2, frames[0].height // 2
    return [f.crop(box) for f in frames], [cx - box[0], cy - box[1]]


def trim_to(frames, box):
    cx, cy = frames[0].width // 2, frames[0].height // 2
    return [f.crop(box) for f in frames], [cx - box[0], cy - box[1]]


def union_box(*lists):
    box = None
    for frames in lists:
        for f in frames:
            b = f.getbbox()
            if not b:
                continue
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box


def flipv(frames):
    return [f.transpose(Image.FLIP_TOP_BOTTOM) for f in frames]


# ---------------------------------------------------------------- rotsprite
def scale2x(im):
    w, h = im.size
    src = im.load()
    out = Image.new("RGBA", (w * 2, h * 2))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            P = src[x, y]
            A = src[x, y - 1] if y > 0 else P
            B = src[x + 1, y] if x < w - 1 else P
            C = src[x - 1, y] if x > 0 else P
            D = src[x, y + 1] if y < h - 1 else P
            e0 = A if (C == A and C != D and A != B) else P
            e1 = B if (A == B and A != C and B != D) else P
            e2 = C if (D == C and D != B and C != A) else P
            e3 = D if (B == D and B != A and D != C) else P
            dst[2 * x, 2 * y] = e0
            dst[2 * x + 1, 2 * y] = e1
            dst[2 * x, 2 * y + 1] = e2
            dst[2 * x + 1, 2 * y + 1] = e3
    return out


def rotsprite(im, angles):
    """im: square RGBA; returns one frame per angle (radians, clockwise from up)"""
    big = scale2x(scale2x(im))
    W = im.width
    out = []
    for a in angles:
        r = big.rotate(-math.degrees(a), resample=Image.NEAREST, expand=False)
        small = Image.new("RGBA", (W, W))
        sp, rp = small.load(), r.load()
        for y in range(W):
            for x in range(W):
                sp[x, y] = rp[x * 4 + 2, y * 4 + 2]
        out.append(small)
    return out


def pad_square(im, size):
    c = Image.new("RGBA", (size, size))
    c.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return c


# ---------------------------------------------------------------- builders
def enemy_clips():
    clips = {}
    for fac, (root, spec) in FLEET.items():
        for game_role, role in ROLE.items():
            name = spec["roles"][role]
            base_p = os.path.join(root, spec["base"].format(r=name))
            eng_p = os.path.join(root, spec["engine"].format(r=name))
            die_p = os.path.join(root, spec["die"].format(r=name))
            if not os.path.exists(base_p):
                # Nautolan's torpedo ship base has no " - Base" suffix
                alt = base_p.replace(" - Base.png", ".png")
                base_p = alt if os.path.exists(alt) else base_p
            base = load(base_p)
            size = base.height
            engine = frames_of(eng_p, size, size) if os.path.exists(eng_p) else [Image.new("RGBA", (size, size))]
            engine = [engine[i] for i in subsample(len(engine), 6)]
            fly = []
            for e in engine:
                c = Image.new("RGBA", (size, size))
                c.alpha_composite(e)
                c.alpha_composite(base)
                fly.append(c)
            die = frames_of(die_p, size, size)
            die = [die[i] for i in subsample(len(die), 12 if size > 64 else 10)]
            fly, die = flipv(fly), flipv(die)
            box = union_box(fly)
            fly_t, anchor = trim_to(fly, box)
            dbox = union_box(die)
            die_t, danchor = trim_to(die, dbox)
            clips["%s_%s" % (game_role, fac)] = (fly_t, 90, anchor)
            clips["%s_%s_die" % (game_role, fac)] = (die_t, 70, danchor)
        # projectiles: missile rotates; orb spins in place
        mp, op = PROJ[fac]
        mi = load(os.path.join(root, mp))
        mframes = frames_of(os.path.join(root, mp), mi.height, mi.height)
        m0 = mframes[0]
        m0, _ = trim([m0])
        m0 = m0[0]
        # authored pointing up? most face right; normalise so the long axis points up
        if m0.width > m0.height:
            m0 = m0.rotate(90, expand=True)
        side = max(m0.width, m0.height) + 4
        sq = pad_square(m0, side)
        rots = rotsprite(sq, [i * math.tau / 24 for i in range(24)])
        rots_t, anchor = trim(rots)
        clips["missile_%s" % fac] = (rots_t, 100, anchor)
        oi = load(os.path.join(root, op))
        of = frames_of(os.path.join(root, op), oi.height, oi.height)
        of_t, oa = trim(of)
        clips["orb_%s" % fac] = (of_t, 80, oa)
    return clips


def player_clips():
    base = load(os.path.join(MAIN, "Main Ship", "Main Ship - Bases", "PNGs", "Main Ship - Base - Full health.png"))
    eng = load(os.path.join(MAIN, "Main Ship", "Main Ship - Engines", "PNGs", "Main Ship - Engines - Base Engine.png"))
    idle = frames_of(os.path.join(MAIN, "Main Ship", "Main Ship - Engine Effects", "PNGs", "Main Ship - Engines - Base Engine - Idle.png"), 48, 48)
    angles = [i * math.tau / 32 for i in range(32)]
    frames = []
    per_angle = []
    for e in idle[:3]:
        c = Image.new("RGBA", (48, 48))
        c.alpha_composite(e)
        c.alpha_composite(eng)
        c.alpha_composite(base)
        per_angle.append(rotsprite(c, angles))
    for ai in range(32):
        for k in range(len(per_angle)):
            frames.append(per_angle[k][ai])
    frames_t, anchor = trim(frames)
    shield = frames_of(os.path.join(MAIN, "Main Ship", "Main Ship - Shields", "PNGs", "Main Ship - Shields - Round Shield.png"), 64, 64)
    shield_t, sa = trim(shield)
    return {"player": (frames_t, 100, anchor), "shield": (shield_t, 60, sa)}


def pickup_clips():
    P = os.path.join(FZ, "void-pickups-pack", "Foozle_2DS0016_Void_PickupsPack")
    src = {
        "nova": os.path.join(P, "Weapons", "PNGs", "Pickup Icon - Weapons - Zapper.png"),
        "repair": os.path.join(P, "Shield Generators", "PNGs", "Pickup Icon - Shield Generator - All around shield.png"),
        "stasis": os.path.join(P, "Engines", "PNGs", "Pickup Icon - Engines - Supercharged Engine.png"),
    }
    out = {}
    for k, p in src.items():
        fr = frames_of(p, 32, 32)
        fr = [fr[i] for i in subsample(len(fr), 10)]
        t, a = trim(fr)
        out["cap_" + k] = (t, 90, a)
    return out


def small_fx():
    G = os.path.join(REF, "grafxkid-mini-pixel-pack-3", "Mini Pixel Pack 3")
    ex = frames_of(os.path.join(G, "Effects", "Explosion (16 x 16).png"), 16, 16)
    sp = frames_of(os.path.join(G, "Effects", "Sparkle (16 x 16).png"), 16, 16)
    mites = frames_of(os.path.join(G, "Enemies", "Alan (16 x 16).png"), 16, 16)
    ex_t, ea = trim(ex)
    sp_t, sa = trim(sp)
    mi_t, ma = trim(mites)
    return {"pop": (ex_t, 60, ea), "sparkle": (sp_t, 70, sa), "mite": (mi_t, 90, ma)}


def sky_layers():
    """two transparent star layers, turned upright for a vertical scroll"""
    # the split-up layers: stars only, without the big flares and black holes,
    # which on a busy screen read as enemies
    B = os.path.join(FZ, "void-environment-pack", "Foozle_2DS0015_Void_EnvironmentPack", "Backgrounds", "PNGs", "Split up")
    out = []
    im = load(os.path.join(B, "Starry background  - Layer 03 - Stars.png"))
    # "Stars 2" carries decorative objects too; the near layer is the far layer
    # from further along the strip, mirrored, so the two never line up
    for x0, mirror in ((0, False), (2400, True)):
        seg = im.crop((x0, 0, x0 + 960, 360)).rotate(90, expand=True)      # 360 x 960
        seg = seg.crop((20, 0, 340, 960))
        if mirror:
            seg = seg.transpose(Image.FLIP_LEFT_RIGHT)
        out.append(seg)
    return out


CREDITS = [
    "Ships, engines, destruction, shields and pickups: Foozle 'Void' packs (foozlecc.itch.io), CC0",
    "Small explosions, sparkle, mite: GrafxKid 'Mini Pixel Pack 3' (grafxkid.itch.io), CC0",
    "Star layers: Foozle 'Void Environment Pack', CC0",
]
