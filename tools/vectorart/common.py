# Shared Blender helpers for VECTOR's pre-rendered sprites.
# Every model renders colour-neutral, in three aliased passes per frame:
#   b_*.png  body: toon shading from the key light only
#   r_*.png  rim: a view-dependent edge highlight in grey (the game tints it the bike's colour)
#   i_*.png  ids: flat part ids (R) and an emissive flag (G) for outlines and the light mask
# post.py turns the passes into clean sprites and packs the atlas.
import bpy, bmesh, math, os
from mathutils import Vector

CELL_PX = 24                       # half a 48x24 cell diamond, in pixels along an axis
PX_PER_UNIT = CELL_PX / (2 * math.cos(math.radians(45)))   # one cell = 2 world units


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def _ramp_material(name, stops):
    m = bpy.data.materials.new(name)
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = 'CONSTANT'
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = stops[0][0], (*stops[0][1], 1)
    e[1].position, e[1].color = stops[1][0], (*stops[1][1], 1)
    for pos, col in stops[2:]:
        el = e.new(pos); el.color = (*col, 1)
    emi = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(dif.outputs[0], s2r.inputs[0])
    nt.links.new(s2r.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], emi.inputs[0])
    nt.links.new(emi.outputs[0], out.inputs[0])
    return m


def fresnel_material(name):
    """A view-dependent edge: bright where a surface turns away from the camera, whatever the lights."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    lw = nt.nodes.new("ShaderNodeLayerWeight"); lw.inputs[0].default_value = 0.35
    ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.interpolation = 'CONSTANT'
    e = ramp.color_ramp.elements
    e[0].position = 0.0; e[0].color = (0, 0, 0, 1)
    e[1].position = 0.62; e[1].color = (0.45, 0.45, 0.45, 1)
    hi = e.new(0.8); hi.color = (1, 1, 1, 1)
    emi = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(lw.outputs["Facing"], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], emi.inputs[0])
    nt.links.new(emi.outputs[0], out.inputs[0])
    return m


def flat_material(name, col, strength=1.0):
    m = bpy.data.materials.new(name)
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emi = nt.nodes.new("ShaderNodeEmission")
    emi.inputs[0].default_value = (*col, 1); emi.inputs[1].default_value = strength
    nt.links.new(emi.outputs[0], out.inputs[0])
    return m


class Model:
    """Parts with a role: ('toon', dark, mid, light) surfaces or ('light',) emissive strips."""

    def __init__(self, scene):
        self.scene = scene
        self.parts = []
        self.mats = {}

    def surface(self, key, dark, mid, light):
        self.mats[key] = ("toon", _ramp_material("b_" + key, [(0.0, dark), (0.18, mid), (0.55, light)]))
        return key

    def light(self, key, core=False):
        # neutral white; the game tints it
        self.mats[key] = ("light", flat_material("l_" + key, (1, 1, 1) if core else (0.85, 0.85, 0.85)))
        return key

    def keep(self, obj, key, part):
        obj.data.materials.clear()
        obj.data.materials.append(self.mats[key][1])
        obj["mkey"] = key; obj["part"] = part; obj["emit"] = 1 if self.mats[key][0] == "light" else 0
        self.parts.append(obj)
        return obj

    # ---- pass switching
    def use_pass(self, which):
        for p in self.parts:
            key = p["mkey"]; kind, mat = self.mats[key]
            if which == "body":
                p.data.materials[0] = mat if kind == "toon" else _cached(("black",), lambda: flat_material("black", (0, 0, 0)))
            elif which == "rim":
                if kind == "toon":
                    p.data.materials[0] = _cached(("rimfresnel",), lambda: fresnel_material("rimfresnel"))
                else:
                    p.data.materials[0] = _cached(("black",), lambda: flat_material("black", (0, 0, 0)))
            elif which == "id":
                k = ("id", p["part"], p["emit"])
                p.data.materials[0] = _cached(k, lambda: flat_material("id_%d_%d" % (p["part"], p["emit"]), (p["part"] / 16.0, float(p["emit"]), 0.0)))


_CACHE = {}
def _cached(key, make):
    if key not in _CACHE:
        _CACHE[key] = make()
    return _CACHE[key]


def profile_solid(scene, name, pts, half_w, bevel, taper=0.0, y0=0.0):
    me = bpy.data.meshes.new(name); obj = bpy.data.objects.new(name, me)
    scene.collection.objects.link(obj)
    bm = bmesh.new()
    front = [bm.verts.new((x, y0 - half_w * (1 - taper * max(0, z - 0.5)), z)) for x, z in pts]
    backv = [bm.verts.new((x, y0 + half_w * (1 - taper * max(0, z - 0.5)), z)) for x, z in pts]
    bm.faces.new(front); bm.faces.new(list(reversed(backv)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], backv[j], backv[i]))
    bm.normal_update(); bm.to_mesh(me); bm.free()
    b = obj.modifiers.new("b", 'BEVEL'); b.width = bevel; b.segments = 3; b.limit_method = 'ANGLE'
    apply_mods(obj)
    return obj


def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    for md in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=md.name)


def line_along(scene, pts3, radius):
    cu = bpy.data.curves.new("line", 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = radius; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); sp.points.add(len(pts3) - 1)
    for i, p in enumerate(pts3): sp.points[i].co = (*p, 1)
    obj = bpy.data.objects.new("line", cu); scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects: o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def rig(scene, size, look_z=0.0):
    """Orthographic 2:1 dimetric camera, a key sun and a back rim sun; aliased EEVEE output."""
    cam_data = bpy.data.cameras.new("cam"); cam_data.type = 'ORTHO'; cam_data.ortho_scale = size / PX_PER_UNIT
    cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam); scene.camera = cam
    cam.rotation_euler = (math.radians(60), 0, math.radians(45))
    d = cam.rotation_euler.to_matrix() @ Vector((0, 0, 1))
    cam.location = Vector((0, 0, look_z)) + d * 40
    key = bpy.data.lights.new("key", 'SUN'); key.energy = 4.0
    k = bpy.data.objects.new("key", key); scene.collection.objects.link(k); k.rotation_euler = (math.radians(35), 0, math.radians(-60))
    key.use_shadow = False                      # toon bands only: soft shadows at one sample are noise
    rim = bpy.data.lights.new("rim", 'SUN'); rim.energy = 3.0; rim.use_shadow = False
    r = bpy.data.objects.new("rim", rim); scene.collection.objects.link(r); r.rotation_euler = (math.radians(70), 0, math.radians(150))
    # no world light: its sampled ambient is grain at one sample
    world = bpy.data.worlds.new("void"); scene.world = world
    world.color = (0, 0, 0)
    try:
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
    except Exception:
        pass
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.filter_size = 0.0
    scene.render.film_transparent = True
    scene.render.resolution_x = size; scene.render.resolution_y = size
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    try: scene.eevee.taa_render_samples = 1
    except Exception: pass
    return {"cam": cam, "key": key, "rim": rim}


def render_passes(scene, model, lights, out, name):
    """Write b_/r_/i_ passes for the current pose."""
    model.use_pass("body"); lights["key"].energy = 4.0; lights["rim"].energy = 0.0
    scene.render.filepath = os.path.join(out, "b_" + name + ".png"); bpy.ops.render.render(write_still=True)
    model.use_pass("rim"); lights["key"].energy = 0.0; lights["rim"].energy = 3.0
    scene.render.filepath = os.path.join(out, "r_" + name + ".png"); bpy.ops.render.render(write_still=True)
    model.use_pass("id")
    scene.render.filepath = os.path.join(out, "i_" + name + ".png"); bpy.ops.render.render(write_still=True)
    lights["key"].energy = 4.0; lights["rim"].energy = 3.0
