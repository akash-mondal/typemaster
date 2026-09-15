# VECTOR light bike: modelled in code, rendered to isometric pixel sprite passes.
#   blender -b -P tools/vectorart/bike.py -- <outdir> <variant> [dirs]
# variant: rider (the player's and most rivals') | warden (armoured) | derez (the shatter)
# Our own design: a narrow spine bridging two wide hubless ring wheels with segmented light,
# a rider lying flat along it, flank light lines and a split tail fin.
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
SHELL = M.surface("shell", (0.05, 0.055, 0.08), (0.15, 0.17, 0.24), (0.52, 0.58, 0.7))
SUIT = M.surface("suit", (0.03, 0.03, 0.045), (0.09, 0.1, 0.14), (0.3, 0.33, 0.42))
DARK = M.surface("dark", (0.03, 0.03, 0.045), (0.08, 0.09, 0.12), (0.24, 0.27, 0.34))
GLASS = M.surface("glass", (0.02, 0.05, 0.08), (0.06, 0.14, 0.2), (0.45, 0.8, 0.95))
PLATE = M.surface("plate", (0.06, 0.05, 0.05), (0.2, 0.18, 0.18), (0.6, 0.55, 0.52))
LIGHT = M.light("light")
CORE = M.light("core", core=True)

# ---------------------------------------------------------------- shell, canopy, belly, fins
SHELL_PTS = [(1.62, 0.52), (1.42, 0.78), (1.02, 0.96), (0.55, 0.98), (0.1, 0.86), (-0.45, 0.9), (-0.95, 1.0),
             (-1.45, 0.94), (-1.75, 0.72), (-1.55, 0.58), (-1.0, 0.66), (-0.3, 0.46), (0.5, 0.48), (1.05, 0.62)]
M.keep(C.profile_solid(scene, "shell", SHELL_PTS, 0.12, 0.05, taper=0.4), SHELL, 1)
M.keep(C.profile_solid(scene, "canopy", [(1.4, 0.8), (1.05, 1.02), (0.6, 1.04), (0.75, 0.96), (1.05, 0.93)], 0.09, 0.03), GLASS, 4)
M.keep(C.profile_solid(scene, "belly", [(0.55, 0.52), (0.2, 0.26), (-0.55, 0.26), (-0.8, 0.5), (0.0, 0.62)], 0.1, 0.03), DARK, 5)
for side in (-1, 1):
    M.keep(C.profile_solid(scene, "fin", [(-1.35, 0.95), (-1.9, 1.16), (-1.84, 1.04), (-1.5, 0.82)], 0.02, 0.008, y0=side * 0.1), DARK, 6)

# ---------------------------------------------------------------- the rider
def blob(loc, scale, key, part, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = scale
    return M.keep(o, key, part)
blob((0.62, 0, 1.18), (0.2, 0.15, 0.16), GLASS, 8)
blob((0.55, 0, 1.2), (0.19, 0.155, 0.17), SUIT, 9)
blob((0.02, 0, 1.12), (0.52, 0.19, 0.16), SUIT, 9, rot=(0, math.radians(-8), 0))
for side in (-1, 1):
    blob((0.72, side * 0.17, 0.98), (0.3, 0.06, 0.06), SUIT, 9, rot=(0, math.radians(25), 0))
    blob((-0.55, side * 0.19, 0.88), (0.34, 0.08, 0.1), SUIT, 9, rot=(0, math.radians(30), 0))
    blob((-0.72, side * 0.2, 0.62), (0.22, 0.07, 0.07), SUIT, 9, rot=(0, math.radians(-50), 0))

# the warden rides armoured: shoulder plates, a raised cowl and side skirts
if VARIANT == "warden":
    for side in (-1, 1):
        M.keep(C.profile_solid(scene, "skirt", [(1.2, 0.72), (-1.2, 0.8), (-1.5, 0.55), (1.35, 0.5)], 0.03, 0.02, y0=side * 0.19), PLATE, 10)
        blob((0.25, side * 0.22, 1.2), (0.28, 0.08, 0.09), PLATE, 10)
    M.keep(C.profile_solid(scene, "cowl", [(1.3, 0.95), (0.75, 1.3), (0.35, 1.3), (0.55, 1.05)], 0.16, 0.03), PLATE, 10)

# ---------------------------------------------------------------- hubless ring wheels
def ring_wheel(x, r_out, r_in, width):
    grp = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r_out, depth=width, location=(x, 0, r_out), rotation=(math.pi / 2, 0, 0))
    tyre = bpy.context.object
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r_in, depth=width * 1.4, location=(x, 0, r_out), rotation=(math.pi / 2, 0, 0))
    hole = bpy.context.object
    md = tyre.modifiers.new("hole", 'BOOLEAN'); md.object = hole; md.operation = 'DIFFERENCE'
    bv = tyre.modifiers.new("b", 'BEVEL'); bv.width = 0.02; bv.segments = 2
    C.apply_mods(tyre); bpy.data.objects.remove(hole)
    grp.append(M.keep(tyre, DARK, 2))
    for side in (-1, 1):
        for k in range(8):
            a0 = k / 8 * 2 * math.pi
            bpy.ops.mesh.primitive_torus_add(major_radius=(r_out + r_in) / 2, minor_radius=0.034, major_segments=48, minor_segments=6,
                                             location=(x, side * width * 0.52, r_out), rotation=(math.pi / 2, 0, 0))
            t = bpy.context.object
            bm = bmesh.new(); bm.from_mesh(t.data)
            span = 2 * math.pi / 8 * 0.62
            kill = [v for v in bm.verts if not (0 <= ((math.atan2(v.co.y, v.co.x) - a0) % (2 * math.pi)) <= span)]
            bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(t.data); bm.free()
            t["spin"] = 1
            grp.append(M.keep(t, LIGHT, 3))
    bpy.ops.mesh.primitive_torus_add(major_radius=r_in + 0.02, minor_radius=0.018, major_segments=48, minor_segments=6, location=(x, 0, r_out), rotation=(math.pi / 2, 0, 0))
    t = bpy.context.object; t.scale = (1, 1, width * 18); grp.append(M.keep(t, CORE, 7))
    return grp

wheels = ring_wheel(1.12, 0.5, 0.34, 0.3) + ring_wheel(-1.12, 0.52, 0.34, 0.38)

for side in (-1, 1):
    M.keep(C.line_along(scene, [(x, side * 0.13, z) for x, z in [(1.58, 0.56), (1.3, 0.72), (0.9, 0.8), (0.45, 0.72), (0.0, 0.62), (-0.5, 0.72), (-1.0, 0.86), (-1.55, 0.76)]], 0.034), LIGHT, 3)
    M.keep(C.line_along(scene, [(0.25, side * 0.17, 1.1), (-0.3, side * 0.17, 1.08)], 0.03), LIGHT, 3)

root = bpy.data.objects.new("root", None); scene.collection.objects.link(root)
root.scale = (BIKE_SCALE,) * 3
lean = bpy.data.objects.new("lean", None); scene.collection.objects.link(lean); lean.parent = root
for p in M.parts: p.parent = lean
lights = C.rig(scene, SIZE)


def spin(frame):
    for o in wheels:
        if o.get("spin"):
            o.rotation_euler = (math.pi / 2, frame / SPINS * (2 * math.pi / 8), 0)


if VARIANT in ("rider", "warden"):
    for di in range(DIRS):
        root.rotation_euler = (0, 0, 2 * math.pi * di / DIRS)
        for li, deg in enumerate(LEANS):
            lean.rotation_euler = (math.radians(deg), 0, 0)
            for w in range(SPINS):
                spin(w)
                C.render_passes(scene, M, lights, OUT, "%02d_%d_%d" % (di, li, w))
    print("bike done", VARIANT, DIRS)

elif VARIANT == "derez":
    # break the bike into voxel shards sampled over its surfaces; each flies out, tumbles and falls
    rnd = random.Random(7)
    bpy.context.view_layer.update()
    body, glow = [], []
    for p in M.parts:
        mw = p.matrix_world.copy()
        for v in p.data.vertices:
            (glow if p["emit"] else body).append((mw @ v.co, p["mkey"], p["part"]))
    rnd.shuffle(body); rnd.shuffle(glow)
    samples = body[:130] + glow[:45]     # mostly hull, so the first frames still read as the bike
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
