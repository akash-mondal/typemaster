# VECTOR's other pre-rendered models.
#   blender -b -P tools/vectorart/models.py -- <outdir> <boss|cell|pylon>
# boss   the Overseer: a floating hexagonal warden with three long arms and hanging emitter pods.
#        12 frames of a slow 120-degree turn (it is three-fold symmetric, so that loops), idle and charged.
# cell   a power cell: a faceted crystal in a thin ring. 8 frames of a 90-degree turn.
# pylon  an anchor pylon: a tapered obelisk with light seams and a crown emitter.
import bpy, bmesh, math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import common as C
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/vector_models"
WHAT = argv[1] if len(argv) > 1 else "boss"
os.makedirs(OUT, exist_ok=True)

scene = C.reset()
M = C.Model(scene)
HULL = M.surface("hull", (0.04, 0.045, 0.065), (0.13, 0.15, 0.21), (0.46, 0.52, 0.64))
DARK = M.surface("dark", (0.025, 0.025, 0.035), (0.07, 0.075, 0.1), (0.22, 0.24, 0.3))
LENS = M.surface("lens", (0.02, 0.04, 0.06), (0.08, 0.16, 0.22), (0.5, 0.85, 1.0))
LIGHT = M.light("light")
CORE = M.light("core", core=True)


def prism(name, sides, radius, height, z, key, part, rot=0.0, bevel=0.03, taper=1.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=height, location=(0, 0, z), rotation=(0, 0, rot))
    o = bpy.context.object; o.name = name
    if taper != 1.0:
        bm = bmesh.new(); bm.from_mesh(o.data)
        for v in bm.verts:
            if v.co.z > 0: v.co.x *= taper; v.co.y *= taper
        bm.to_mesh(o.data); bm.free()
    b = o.modifiers.new("b", 'BEVEL'); b.width = bevel; b.segments = 2
    C.apply_mods(o)
    return M.keep(o, key, part)


def ring(name, major, minor, z, key, part, segs=64):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=segs, minor_segments=8, location=(0, 0, z))
    o = bpy.context.object; o.name = name
    return M.keep(o, key, part)


if WHAT == "boss":
    SIZE = 384
    S = 1.8                                   # it should fill a quarter of the screen
    pivot = bpy.data.objects.new("pivot", None); scene.collection.objects.link(pivot)
    Z = 2.8   # it floats: the sprite's origin stays on the floor, where its shadow falls
    HULLD = M.surface("hulld", (0.02, 0.022, 0.03), (0.06, 0.065, 0.09), (0.2, 0.22, 0.29))
    HULLM = M.surface("hullm", (0.03, 0.032, 0.045), (0.1, 0.11, 0.15), (0.3, 0.33, 0.42))
    prism("disc", 6, 1.8 * S, 0.5 * S, Z, HULLD, 1, rot=math.radians(30), bevel=0.1)
    prism("groove", 6, 1.84 * S, 0.1 * S, Z + 0.02, DARK, 2, rot=math.radians(30), bevel=0.02)
    prism("lower", 6, 1.45 * S, 0.4 * S, Z - 0.42 * S, DARK, 2, rot=math.radians(30), taper=1.22)
    prism("deck", 6, 1.3 * S, 0.22 * S, Z + 0.34 * S, HULLM, 3, rot=0.0, taper=0.85)
    prism("crown", 6, 0.8 * S, 0.3 * S, Z + 0.62 * S, HULLD, 11, rot=math.radians(30), taper=0.62)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.4 * S, location=(0, 0, Z + 0.8 * S), segments=24, ring_count=12)
    eye = bpy.context.object; eye.scale = (1, 1, 0.5); M.keep(eye, CORE, 4)
    ring("eyering", 0.52 * S, 0.07, Z + 0.78 * S, LIGHT, 5)
    # a crown of short fins, and a ring of lamps round the rim
    for k in range(6):
        a = math.radians(60 * k)
        o = C.profile_solid(scene, "fin", [(0.0, 0.0), (0.7, 0.0), (0.45, 0.5), (0.1, 0.42)], 0.05, 0.02)
        o.location = (1.0 * S * math.cos(a), 1.0 * S * math.sin(a), Z + 0.44 * S); o.rotation_euler = (0, 0, a)
        M.keep(o, DARK, 10)
    # lamps set into the six flanks, three to a face
    apo = 1.8 * S * math.cos(math.radians(30)) + 0.02
    for f in range(6):
        a = math.radians(60 * f)
        ca, sa = math.cos(a), math.sin(a)
        for j in (-1, 0, 1):
            t = j * 0.55 * S
            bpy.ops.mesh.primitive_cube_add(size=1, location=(apo * ca - sa * t, apo * sa + ca * t, Z + 0.02), rotation=(0, 0, a))
            lamp = bpy.context.object; lamp.scale = (0.06, 0.34, 0.12); M.keep(lamp, LIGHT, 6)
    ring("under", 1.1 * S, 0.07, Z - 0.66 * S, LIGHT, 6)
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.radians(60)
        ca, sa = math.cos(a), math.sin(a)
        bm = bmesh.new()
        prof = [(1.4 * S, 0.34), (2.6 * S, 0.24), (3.6 * S, 0.14)]
        verts = []
        for r, w in prof:
            for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                verts.append(bm.verts.new((r, sx * w, Z + 0.1 + sz * w * 0.7 - (r - 1.4 * S) * 0.2)))
        for i in range(len(prof) - 1):
            for j in range(4):
                a0, a1 = verts[i * 4 + j], verts[i * 4 + (j + 1) % 4]
                b0, b1 = verts[(i + 1) * 4 + j], verts[(i + 1) * 4 + (j + 1) % 4]
                bm.faces.new((a0, a1, b1, b0))
        bm.faces.new(verts[0:4][::-1]); bm.faces.new(verts[-4:])
        me = bpy.data.meshes.new("arm"); bm.to_mesh(me); bm.free()
        arm = bpy.data.objects.new("arm", me); scene.collection.objects.link(arm)
        arm.rotation_euler = (0, 0, a)
        bv = arm.modifiers.new("b", 'BEVEL'); bv.width = 0.04; bv.segments = 2; C.apply_mods(arm)
        M.keep(arm, HULLM, 7)
        tipx, tipy, tipz = 3.6 * S * ca, 3.6 * S * sa, Z - 0.75
        # a heavy claw pod: a hex housing, two prongs, and a core that swells when charged
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.34, depth=0.7, location=(tipx, tipy, tipz))
        M.keep(bpy.context.object, DARK, 8)
        for side in (-1, 1):
            px, py = -sa * side * 0.28, ca * side * 0.28
            bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.1, radius2=0.01, depth=0.8, location=(tipx + px, tipy + py, tipz - 0.62), rotation=(math.pi, 0, 0))
            M.keep(bpy.context.object, HULL, 8)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.17, location=(tipx, tipy, tipz - 0.46), segments=12, ring_count=8)
        tip = bpy.context.object; M.keep(tip, CORE, 9); tip["pod"] = 1
        M.keep(C.line_along(scene, [(1.5 * S * ca, 1.5 * S * sa, Z + 0.38), (3.5 * S * ca, 3.5 * S * sa, Z - 0.02)], 0.045), LIGHT, 6)
    for p in M.parts: p.parent = pivot
    lights = C.rig(scene, SIZE, look_z=2.2)
    for charged in (0, 1):
        for p in M.parts:
            if p.get("pod"): p.scale = (2.2, 2.2, 2.2) if charged else (1, 1, 1)
        for f in range(12):
            pivot.rotation_euler = (0, 0, (2 * math.pi / 3) * f / 12)
            C.render_passes(scene, M, lights, OUT, "boss_%d_%02d" % (charged, f))
    print("boss done")

elif WHAT == "cell":
    SIZE = 48
    pivot = bpy.data.objects.new("pivot", None); scene.collection.objects.link(pivot)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.55, segments=4, ring_count=2, location=(0, 0, 0.95))
    gem = bpy.context.object; gem.scale = (0.8, 0.8, 1.25); M.keep(gem, LENS, 1)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, segments=4, ring_count=2, location=(0, 0, 0.95))
    M.keep(bpy.context.object, CORE, 2)
    r = ring("halo", 0.72, 0.045, 0.95, LIGHT, 3); r.rotation_euler = (math.radians(70), 0, 0)
    for p in M.parts: p.parent = pivot
    lights = C.rig(scene, SIZE, look_z=0.6)
    for f in range(8):
        pivot.rotation_euler = (0, 0, (math.pi / 2) * f / 8)
        C.render_passes(scene, M, lights, OUT, "cell_%02d" % f)
    print("cell done")

elif WHAT == "pylon":
    SIZE = 128
    prism("base", 8, 0.8, 0.26, 0.13, DARK, 1, bevel=0.05)
    prism("step", 8, 0.6, 0.2, 0.36, HULL, 1, bevel=0.03)
    prism("shaft", 4, 0.42, 3.2, 2.05, HULL, 2, rot=math.radians(45), bevel=0.03, taper=0.4)
    for z in (1.1, 2.0, 2.8):
        prism("collar", 4, 0.44 - (z - 1.1) * 0.1, 0.1, z, DARK, 3, rot=math.radians(45), bevel=0.015)
    prism("crown", 4, 0.34, 0.36, 3.8, DARK, 3, rot=math.radians(45), bevel=0.02, taper=0.5)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=(0, 0, 4.18), segments=12, ring_count=8)
    M.keep(bpy.context.object, CORE, 4)
    ring("halo", 0.34, 0.03, 4.18, LIGHT, 5, segs=24)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        M.keep(C.line_along(scene, [(0.4 * math.cos(a), 0.4 * math.sin(a), 0.5), (0.17 * math.cos(a), 0.17 * math.sin(a), 3.55)], 0.03), LIGHT, 5)
    ring("band", 0.82, 0.04, 0.28, LIGHT, 5, segs=32)
    lights = C.rig(scene, SIZE, look_z=1.8)
    C.render_passes(scene, M, lights, OUT, "pylon")
    print("pylon done")
