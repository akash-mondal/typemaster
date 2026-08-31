import bpy
bpy.ops.export_scene.gltf(
    filepath='/tmp/typewriter.glb', export_format='GLB',
    export_apply=True, export_yup=True,
    export_materials='EXPORT', export_image_format='AUTO',
    export_cameras=False, export_lights=False,
    export_animations=False, export_skins=False, export_morph=False,
    export_normals=True, export_tangents=False,
    export_draco_mesh_compression_enable=False)
print("exported")
