import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "아바타 용" / "여성경찰" / "Meshy_AI_Cyber_Police_Uniform__0829013328_generate.glb"
OUTPUT = ROOT / "tools" / "female_police_glb_preview.png"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
print(f"MESH_COUNT={len(meshes)}")
for obj in meshes:
    print(f"MESH={obj.name} VERTICES={len(obj.data.vertices)} POLYGONS={len(obj.data.polygons)} DIMENSIONS={tuple(round(v, 5) for v in obj.dimensions)}")

corners = []
for obj in meshes:
    corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
minimum = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
maximum = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
center = (minimum + maximum) * 0.5
size = maximum - minimum
print(f"BOUNDS_MIN={tuple(round(v, 5) for v in minimum)}")
print(f"BOUNDS_MAX={tuple(round(v, 5) for v in maximum)}")

for obj in meshes:
    if not obj.data.materials:
        material = bpy.data.materials.new("InspectionMaterial")
        material.diffuse_color = (0.08, 0.22, 0.55, 1.0)
        material.metallic = 0.15
        material.roughness = 0.5
        obj.data.materials.append(material)

camera_data = bpy.data.cameras.new("InspectionCamera")
camera = bpy.data.objects.new("InspectionCamera", camera_data)
bpy.context.scene.collection.objects.link(camera)
bpy.context.scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = max(size.x, size.z, size.y) * 1.25
camera.location = center + Vector((0, -max(size.length, 2.0) * 2.2, 0))
direction = center - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

key_data = bpy.data.lights.new("Key", "AREA")
key_data.energy = 1100
key_data.shape = "DISK"
key_data.size = 5
key = bpy.data.objects.new("Key", key_data)
bpy.context.scene.collection.objects.link(key)
key.location = center + Vector((2.5, -3.5, 4.0))

bpy.context.scene.render.engine = "BLENDER_EEVEE"
bpy.context.scene.render.resolution_x = 900
bpy.context.scene.render.resolution_y = 900
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.render.film_transparent = False
world = bpy.data.worlds.new("InspectionWorld")
world.color = (0.025, 0.025, 0.035)
bpy.context.scene.world = world
bpy.context.scene.render.filepath = str(OUTPUT)
bpy.ops.render.render(write_still=True)
print(f"PREVIEW={OUTPUT}")
