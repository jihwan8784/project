import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "아바타 용" / "여성경찰" / "female_police_rigged.glb"
OUTPUT = ROOT / "tools" / "female_police_rig_test.png"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))

armature = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
if armature:
    armature.pose.bones["LeftUpperArm"].rotation_mode = "XYZ"
    armature.pose.bones["LeftUpperArm"].rotation_euler.y = math.radians(-42)
    armature.pose.bones["LeftForearm"].rotation_mode = "XYZ"
    armature.pose.bones["LeftForearm"].rotation_euler.y = math.radians(-38)
    armature.pose.bones["RightUpperArm"].rotation_mode = "XYZ"
    armature.pose.bones["RightUpperArm"].rotation_euler.y = math.radians(34)
    armature.pose.bones["RightForearm"].rotation_mode = "XYZ"
    armature.pose.bones["RightForearm"].rotation_euler.y = math.radians(45)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
maximum = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
center = (minimum + maximum) * 0.5
size = maximum - minimum

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
bpy.context.scene.collection.objects.link(camera)
bpy.context.scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = max(size.x, size.z) * 1.2
camera.location = center + Vector((0, -4.5, 0))
camera.rotation_euler = (math.radians(90), 0, 0)

light_data = bpy.data.lights.new("Key", "AREA")
light_data.energy = 1200
light_data.size = 5
light = bpy.data.objects.new("Key", light_data)
bpy.context.scene.collection.objects.link(light)
light.location = center + Vector((2, -3, 4))

world = bpy.data.worlds.new("World")
world.color = (0.03, 0.03, 0.04)
bpy.context.scene.world = world
bpy.context.scene.render.engine = "BLENDER_EEVEE"
bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 900
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.render.filepath = str(OUTPUT)
bpy.ops.render.render(write_still=True)
print(f"OUTPUT={OUTPUT}")
