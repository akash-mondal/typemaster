import bpy

# ── strip everything that is scene, not television ─────────────────────────
for n in ['Camera','Empty','Sun','Sun.001','Plane']:
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.scene.world = None          # an 8K HDRI is a third of the file

# ── name the parts so JS can find them ─────────────────────────────────────
# The artist yawed the set 238.58 deg about Z to pose it for the beauty render
# (pure Z rotation, no pitch or roll, scale 1). Zero it and the mesh returns to
# its authored frame, which faces -Y in Blender = +Z once glTF flips to Y-up.
# Correcting this here beats inferring it at runtime from averaged normals.
bpy.data.objects['Cube'].rotation_euler = (0.0, 0.0, 0.0)
bpy.data.objects['Cube'].name = 'CRT'
# Cube.001 is a duplicate front panel: 490 tris carrying a second screen face
# that protrudes past the cabinet and double-renders the tube. Drop it here
# rather than hiding it at runtime.
dup = bpy.data.objects.get('Cube.001')
if dup: bpy.data.objects.remove(dup, do_unlink=True)
RENAME = {'Material.001':'CRT_BODY','Material.002':'CRT_SCREEN','Material.003':'CRT_GRILLE'}
for a,b in RENAME.items():
    m = bpy.data.materials.get(a)
    if m: m.name = b
m4 = bpy.data.materials.get('Material.004')
if m4: bpy.data.materials.remove(m4)

# ── rebuild each material as a clean Principled BSDF ───────────────────────
# The originals are Cycles node graphs mixing dust, smudge and fingerprint
# overlays. glTF carries only base/metal-rough/normal/emissive, so those
# overlays cannot survive the trip — exporting them just drags 60 Mpx of
# textures along for nothing. Keep the one map that actually reads (the grille
# weave) and re-grade the rest in JS, as with the typewriter.
def rebuild(name, base, rough, metal=0.0, emis=None, col_img=None, nrm_img=None):
    m = bpy.data.materials.get(name)
    if not m: return
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (*base, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emis:
        for k in ('Emission Color','Emission'):
            if k in bsdf.inputs: bsdf.inputs[k].default_value = (*emis,1); break
        if 'Emission Strength' in bsdf.inputs: bsdf.inputs['Emission Strength'].default_value = 1.0
    if col_img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = col_img
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if nrm_img:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = nrm_img
        t.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

KEEP = {'FabricDenim003_COL_VAR1_3K.jpg','FabricDenim003_NRM_3K.jpg'}
for img in bpy.data.images:
    if img.name not in KEEP: continue
    # scale() only touches the in-memory buffer; without re-packing, the
    # exporter copies the ORIGINAL packed bytes straight through and the resize
    # silently does nothing (this normal map shipped at 3K, 10.6 MB of an 11 MB
    # file, while the colour map beside it resized fine).
    img.scale(1024, 1024)
    img.pack()
    print('resized', img.name, img.size[:], 'packed bytes', len(img.packed_file.data))

col = bpy.data.images.get('FabricDenim003_COL_VAR1_3K.jpg')
nrm = bpy.data.images.get('FabricDenim003_NRM_3K.jpg')
rebuild('CRT_BODY',   (0.030,0.030,0.032), 0.48)
rebuild('CRT_SCREEN', (0.010,0.012,0.014), 0.12, emis=(0.02,0.03,0.03))
rebuild('CRT_GRILLE', (0.35,0.33,0.30),   0.85, col_img=col, nrm_img=nrm)

for img in list(bpy.data.images):
    if img.name not in KEEP and img.users == 0:
        bpy.data.images.remove(img)

print("meshes:", [(o.name, len(o.data.polygons)) for o in bpy.data.objects if o.type=='MESH'])
print("materials:", [m.name for m in bpy.data.materials])
print("images:", [(i.name, i.size[:]) for i in bpy.data.images if i.size[0]])

bpy.ops.export_scene.gltf(filepath='/tmp/crt.glb', export_format='GLB',
    export_apply=True, export_yup=True, export_materials='EXPORT',
    export_cameras=False, export_lights=False, export_animations=False,
    export_skins=False, export_morph=False, export_normals=True, export_tangents=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10,
    export_draco_position_quantization=14, export_draco_normal_quantization=10,
    export_image_format='JPEG', export_jpeg_quality=88,
    export_draco_texcoord_quantization=12)
