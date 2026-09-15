# VECTOR light bike and rider: modelled in code, rendered to isometric pixel sprite passes.
#   blender -b -P tools/vectorart/bike.py -- <outdir> <variant> [dirs]
# variant: rider   the bike with its rider, 16 directions x 3 leans x 3 wheel frames
#          warden  the same with armour plates
#          derez   the bike and rider breaking into voxel shards, 8 directions x 12 frames
#          runner  the rider on foot: 6 run frames and 2 leap frames, 8 directions
# The look: black glass bodies with a hard white sheen, thick continuous rings of light on
# hubless wheels, one unbroken light line from nose to tail, and a rider in a black suit traced
# by thin lines of light. Our own shapes throughout.
import bpy, bmesh, math, sys, os, random
sys.path.insert(0, os.path.dirname(__file__))
import common as C
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/vector_bike"
VARIANT = argv[1] if len(argv) > 1 else "rider"
DIRS = int(argv[2]) if len(argv) > 2 else 16
SIZE = 128
LEANS = [0, -22, 22]
SPINS = 3
BIKE_SCALE = 1.5
os.makedirs(OUT, exist_ok=True)

scene = C.reset()
M = C.Model(scene)
# glossy black: mostly dark, with a narrow hard highlight where the key light catches
GLOSS = M.surface("gloss", (0.012, 0.014, 0.02), (0.035, 0.04, 0.055), (0.62, 0.68, 0.78))
SUIT = M.surface("suit", (0.01, 0.011, 0.016), (0.03, 0.033, 0.045), (0.45, 0.5, 0.58))
VISOR = M.surface("visor", (0.02, 0.025, 0.035), (0.08, 0.1, 0.14), (0.85, 0.9, 1.0))
DARK = M.surface("dark", (0.02, 0.02, 0.028), (0.05, 0.055, 0.07), (0.22, 0.25, 0.3))
PLATE = M.surface("plate", (0.04, 0.035, 0.035), (0.14, 0.12, 0.12), (0.55, 0.5, 0.48))
LIGHT = M.light("light")
CORE = M.light("core", core=True)
# sharpen the gloss: the highlight band starts late so only true catches light up
for key in ("gloss", "suit", "visor"):
    ramp = [n for n in M.mats[key][1].node_tree.nodes if n.type == 'VALTORGB'][0].color_ramp
    ramp.elements[1].position = 0.35
    ramp.elements[2].position = 0.82


# ---------------------------------------------------------------- helpers
def capsule(a, b, r, key, part, joint=True):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    M.keep(o, key, part)
    if joint:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=r, location=b)
        M.keep(bpy.context.object, key, part)
    return o


def ball(c, r, key, part, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=12, radius=r, location=c)
    o = bpy.context.object; o.scale = scale
    return M.keep(o, key, part)


def light_line(pts, radius=0.03, key=None):
    return M.keep(C.line_along(scene, pts, radius), key or LIGHT, 3)


def figure(J, armour=False):
    """A rider from joint positions: black suit, glossy helmet, lines of light along the limbs."""
    # torso and head
    capsule(J["pelvis"], J["chest"], 0.17, SUIT, 9)
    capsule(J["chest"], J["neck"], 0.12, SUIT, 9, joint=False)
    ball(J["head"], 0.19, VISOR, 8, scale=(1.12, 0.95, 1.0))
    for s in (-1, 1):
        sh = Vector(J["chest"]) + Vector((0.05, 0.2 * s, 0.08)) if "sh" not in J else Vector(J["sh"][s])
        capsule(J["chest"], sh, 0.1, SUIT, 9)
        capsule(sh, J["elbow"][s], 0.075, SUIT, 9)
        capsule(J["elbow"][s], J["hand"][s], 0.065, SUIT, 9)
        capsule(J["hip"][s], J["knee"][s], 0.1, SUIT, 9)
        capsule(J["knee"][s], J["foot"][s], 0.08, SUIT, 9)
        # light: along the outside of each arm and leg
        out = Vector((0, 0.07 * s, 0.02))
        light_line([tuple(Vector(sh) + out), tuple(Vector(J["elbow"][s]) + out), tuple(Vector(J["hand"][s]) + out)], 0.022)
        light_line([tuple(Vector(J["hip"][s]) + out * 1.3), tuple(Vector(J["knee"][s]) + out * 1.3), tuple(Vector(J["foot"][s]) + out)], 0.024)
        if armour:
            ball(tuple(sh + Vector((0, 0.05 * s, 0.04))), 0.14, PLATE, 10, scale=(1.3, 0.9, 0.7))
    # the spine line and a band round the helmet
    back = Vector((-0.02, 0, 0.14))
    light_line([tuple(Vector(J["pelvis"]) + back), tuple(Vector(J["chest"]) + back), tuple(Vector(J["neck"]) + back * 0.8)], 0.026)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.2, minor_radius=0.022, major_segments=32, minor_segments=6, location=J["head"])
    band = bpy.context.object; band.rotation_euler = (0, math.radians(-20), 0); band.scale = (1.12, 0.95, 1)
    M.keep(band, CORE, 7)


# ---------------------------------------------------------------- the bike
def ring_wheel(x, r_out, r_in, width):
    grp = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r_out, depth=width, location=(x, 0, r_out), rotation=(math.pi / 2, 0, 0))
    tyre = bpy.context.object
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r_in, depth=width * 1.4, location=(x, 0, r_out), rotation=(math.pi / 2, 0, 0))
    hole = bpy.context.object
    md = tyre.modifiers.new("hole", 'BOOLEAN'); md.object = hole; md.operation = 'DIFFERENCE'
    bv = tyre.modifiers.new("b", 'BEVEL'); bv.width = 0.02; bv.segments = 2
    C.apply_mods(tyre); bpy.data.objects.remove(hole)
    grp.append(M.keep(tyre, GLOSS, 2))
    # one thick unbroken ring of light on each face, and a hot inner rim
    for side in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=(r_out + r_in) / 2 + 0.02, minor_radius=0.058, major_segments=64, minor_segments=8,
                                         location=(x, side * width * 0.5, r_out), rotation=(math.pi / 2, 0, 0))
        grp.append(M.keep(bpy.context.object, LIGHT, 3))
    bpy.ops.mesh.primitive_torus_add(major_radius=r_in + 0.015, minor_radius=0.028, major_segments=64, minor_segments=6, location=(x, 0, r_out), rotation=(math.pi / 2, 0, 0))
    t = bpy.context.object; t.scale = (1, 1, width * 16); grp.append(M.keep(t, CORE, 7))
    # a short bright tick that travels round the ring shows the spin
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x + r_out - 0.02, 0, r_out))
    tick = bpy.context.object; tick.scale = (0.05, width * 1.05, 0.14); tick["spin"] = 1; tick["cx"] = x; tick["r"] = r_out - 0.02
    grp.append(M.keep(tick, CORE, 7))
    return grp


def build_bike(armour=False):
    # the body: a long low sweep that arches over both wheels, narrower than the wheels
    SHELL = [(1.7, 0.5), (1.55, 0.86), (1.2, 1.06), (0.7, 1.02), (0.25, 0.9), (-0.35, 0.92), (-0.95, 1.08),
             (-1.5, 1.02), (-1.8, 0.72), (-1.62, 0.52), (-1.05, 0.62), (-0.3, 0.44), (0.5, 0.46), (1.1, 0.6)]
    M.keep(C.profile_solid(scene, "shell", SHELL, 0.13, 0.05, taper=0.45), GLOSS, 1)
    M.keep(C.profile_solid(scene, "belly", [(0.6, 0.5), (0.25, 0.26), (-0.6, 0.26), (-0.9, 0.5), (0.0, 0.62)], 0.09, 0.03), DARK, 5)
    wheels = ring_wheel(1.12, 0.52, 0.34, 0.32) + ring_wheel(-1.12, 0.54, 0.34, 0.38)
    # the light line: unbroken from nose to tail along each flank, rising over the arches
    for s in (-1, 1):
        light_line([(x, s * 0.135, z) for x, z in [(1.72, 0.56), (1.5, 0.86), (1.15, 1.0), (0.7, 0.94), (0.25, 0.78),
                                                   (-0.35, 0.8), (-0.95, 0.98), (-1.45, 0.94), (-1.76, 0.7)]], 0.036)
    if armour:
        for s in (-1, 1):
            M.keep(C.profile_solid(scene, "skirt", [(1.2, 0.74), (-1.2, 0.82), (-1.5, 0.56), (1.35, 0.52)], 0.03, 0.02, y0=s * 0.2), PLATE, 10)
    # the rider, low and forward, head up
    J = {
        "pelvis": (-0.5, 0, 1.08), "chest": (0.08, 0, 1.32), "neck": (0.36, 0, 1.44), "head": (0.54, 0, 1.54),
        "sh": {-1: (0.22, -0.21, 1.4), 1: (0.22, 0.21, 1.4)},
        "elbow": {-1: (0.58, -0.26, 1.2), 1: (0.58, 0.26, 1.2)}, "hand": {-1: (0.95, -0.2, 1.06), 1: (0.95, 0.2, 1.06)},
        "hip": {-1: (-0.48, -0.14, 1.04), 1: (-0.48, 0.14, 1.04)}, "knee": {-1: (-0.05, -0.25, 0.86), 1: (-0.05, 0.25, 0.86)},
        "foot": {-1: (-0.62, -0.21, 0.64), 1: (-0.62, 0.21, 0.64)},
    }
    figure(J, armour)
    return wheels


def run_pose(phase, leap=0.0):
    """Joints for a running rider (phase 0..1), or a leap (leap 0..1: crouch, then tuck)."""
    a = math.sin(phase * 2 * math.pi) * 0.75
    lift = abs(math.sin(phase * 2 * math.pi)) * 0.06
    z0 = 1.05 + lift + leap * 0.5
    lean = 0.22 + leap * 0.25
    J = {"pelvis": (0, 0, z0), "chest": (0.5 * math.sin(lean), 0, z0 + 0.5 * math.cos(lean))}
    ch = Vector(J["chest"])
    J["neck"] = tuple(ch + Vector((0.1, 0, 0.18)))
    J["head"] = tuple(ch + Vector((0.18, 0, 0.36)))
    J["sh"] = {s: tuple(ch + Vector((0.02, 0.21 * s, 0.1))) for s in (-1, 1)}
    J["elbow"], J["hand"], J["hip"], J["knee"], J["foot"] = {}, {}, {}, {}, {}
    for s in (-1, 1):
        sw = a * s * (1 - leap)
        tuck = leap * 1.1
        sh = Vector(J["sh"][s])
        J["elbow"][s] = tuple(sh + Vector((-math.sin(sw) * 0.32, 0.03 * s, -math.cos(sw) * 0.32)))
        J["hand"][s] = tuple(Vector(J["elbow"][s]) + Vector((0.28 * math.cos(sw * 0.5) + 0.05, 0, 0.12)))
        hip = Vector((0, 0.13 * s, z0 - 0.04))
        J["hip"][s] = tuple(hip)
        th = sw + tuck
        knee = hip + Vector((math.sin(th) * 0.5, 0.02 * s, -math.cos(th) * 0.5))
        bend = max(0.0, -math.sin(phase * 2 * math.pi) * s) * 1.3 + 0.15 + tuck * 1.2
        J["knee"][s] = tuple(knee)
        J["foot"][s] = tuple(knee + Vector((math.sin(th - bend) * 0.5, 0, -math.cos(th - bend) * 0.5)))
    return J


def setup_root():
    root = bpy.data.objects.new("root", None); scene.collection.objects.link(root)
    root.scale = (BIKE_SCALE,) * 3
    lean = bpy.data.objects.new("lean", None); scene.collection.objects.link(lean); lean.parent = root
    for p in M.parts:
        if p.parent is None: p.parent = lean
    return root, lean


if VARIANT in ("rider", "warden"):
    wheels = build_bike(armour=VARIANT == "warden")
    root, lean = setup_root()
    lights = C.rig(scene, SIZE)
    ticks = [o for o in wheels if o.get("spin")]
    for di in range(DIRS):
        root.rotation_euler = (0, 0, 2 * math.pi * di / DIRS)
        for li, deg in enumerate(LEANS):
            lean.rotation_euler = (math.radians(deg), 0, 0)
            for w in range(SPINS):
                for tk in ticks:
                    ang = -w / SPINS * 2 * math.pi
                    tk.location = (tk["cx"] + math.cos(ang) * tk["r"], 0, tk["r"] + 0.02 + math.sin(ang) * tk["r"])
                    tk.rotation_euler = (0, -ang, 0)
                C.render_passes(scene, M, lights, OUT, "%02d_%d_%d" % (di, li, w))
    print("bike done", VARIANT, DIRS)

elif VARIANT == "runner":
    lights = None
    frames = [("run", k / 6) for k in range(6)] + [("leap", 0.35), ("leap", 1.0)]
    for fi, (kind, v) in enumerate(frames):
        # rebuild the figure for each pose: simplest, and the model is small
        for o in list(bpy.data.objects):
            if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)
        M.parts.clear()
        J = run_pose(v if kind == "run" else 0.25, leap=v if kind == "leap" else 0.0)
        figure(J)
        root = bpy.data.objects.get("root")
        if root is None:
            root = bpy.data.objects.new("root", None); scene.collection.objects.link(root)
        root.scale = (BIKE_SCALE,) * 3
        for p in M.parts: p.parent = root
        if lights is None: lights = C.rig(scene, SIZE)
        for di in range(DIRS):
            root.rotation_euler = (0, 0, 2 * math.pi * di / DIRS)
            C.render_passes(scene, M, lights, OUT, "%02d_%d" % (di, fi))
    print("runner done", DIRS)

elif VARIANT == "derez":
    build_bike()
    root, lean = setup_root()
    lights = C.rig(scene, SIZE)
    rnd = random.Random(7)
    bpy.context.view_layer.update()
    body, glow = [], []
    for p in M.parts:
        mw = p.matrix_world.copy()
        for v in p.data.vertices:
            (glow if p["emit"] else body).append((mw @ v.co, p["mkey"], p["part"]))
    rnd.shuffle(body); rnd.shuffle(glow)
    samples = body[:150] + glow[:60]
    for p in list(M.parts): p.hide_render = True
    shards = []
    for v, key, part in samples:
        bpy.ops.mesh.primitive_cube_add(size=0.13 if M.mats[key][0] == "light" else 0.17, location=v)
        s = bpy.context.object
        M.keep(s, key, part)
        s.parent = root
        s.matrix_parent_inverse = root.matrix_world.inverted()
        horiz = Vector((v.x * 0.4, v.y * 2.4 + rnd.uniform(-0.6, 0.6), 0))
        out = horiz.normalized() if horiz.length > 1e-6 else Vector((1, 0, 0))
        vel = out * rnd.uniform(1.2, 3.4) + Vector((rnd.uniform(-0.8, 0.8), rnd.uniform(-0.8, 0.8), rnd.uniform(1.4, 3.8)))
        shards.append((s, v.copy(), vel, Vector((rnd.uniform(-9, 9), rnd.uniform(-9, 9), rnd.uniform(-9, 9)))))
    FR = 12
    for di in range(DIRS):
        root.rotation_euler = (0, 0, 2 * math.pi * di / DIRS)
        bpy.context.view_layer.update()
        for f in range(FR):
            t = f / (FR - 1) * 0.9
            for s, p0, vel, rot in shards:
                pos = p0 + vel * t + Vector((0, 0, -9.8 * 0.5 * t * t))
                pos.z = max(0.05, pos.z)
                s.location = pos
                s.rotation_euler = (rot.x * t, rot.y * t, rot.z * t)
                k = max(0.0, 1.0 - (t / 0.9) ** 1.6)
                s.scale = (k, k, k)
            C.render_passes(scene, M, lights, OUT, "%02d_%02d" % (di, f))
    print("derez done", DIRS)
