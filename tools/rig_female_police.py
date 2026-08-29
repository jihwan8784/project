import bpy
import bmesh
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "아바타 용" / "여성경찰" / "Meshy_AI_Cyber_Police_Uniform__0829013328_generate.glb"
OUTPUT = ROOT / "아바타 용" / "여성경찰" / "female_police_rigged.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
body = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")

# The source contains four disconnected turnaround figures across X. Keep only
# the left-most front figure and discard the three reference duplicates.
mesh = body.data
bm = bmesh.new()
bm.from_mesh(mesh)
remove = [vertex for vertex in bm.verts if vertex.co.x > -0.32]
bmesh.ops.delete(bm, geom=remove, context="VERTS")
bm.to_mesh(mesh)
bm.free()
mesh.update()

# Center the retained figure, place the boots on Z=0 and normalize height.
coordinates = [vertex.co for vertex in mesh.vertices]
minimum = Vector((min(v.x for v in coordinates), min(v.y for v in coordinates), min(v.z for v in coordinates)))
maximum = Vector((max(v.x for v in coordinates), max(v.y for v in coordinates), max(v.z for v in coordinates)))
center_x = (minimum.x + maximum.x) * 0.5
center_y = (minimum.y + maximum.y) * 0.5
height = maximum.z - minimum.z
scale = 1.68 / height
for vertex in mesh.vertices:
    vertex.co.x = (vertex.co.x - center_x) * scale
    vertex.co.y = (vertex.co.y - center_y) * scale
    vertex.co.z = (vertex.co.z - minimum.z) * scale
mesh.update()
body.name = "FemalePoliceBody"

# Reduce generated surface noise and excessive triangles before rigging.
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.00035)
bpy.ops.object.mode_set(mode="OBJECT")
decimate = body.modifiers.new("CleanUniformTopology", "DECIMATE")
decimate.ratio = 0.48
decimate.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=decimate.name)

# Keep only the supplied uniform body. Head, face, hair, and neck connector
# geometry are intentionally omitted.
body.name = "FemalePoliceBody"

# Generate UVs and normals on the completed mesh.
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.02)
bpy.ops.object.mode_set(mode="OBJECT")
for polygon in body.data.polygons:
    polygon.use_smooth = True

def make_material(name, color, metallic=0.0, roughness=0.55):
    image = bpy.data.images.new(f"{name}Texture", width=4, height=4, alpha=True)
    image.generated_color = (*color, 1.0)
    image.pack()
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    return material

uniform = make_material("PoliceUniformNavy", (0.025, 0.10, 0.28), 0.12, 0.45)
dark = make_material("PoliceBootsAndBelt", (0.012, 0.018, 0.035), 0.35, 0.34)
skin = make_material("PoliceSkin", (0.80, 0.47, 0.35), 0.0, 0.62)
accent = make_material("PoliceNeonAccent", (0.02, 0.50, 1.0), 0.25, 0.28)
for material in (uniform, dark, skin, accent):
    body.data.materials.append(material)

# Assign coherent materials by anatomical region. The source has no original
# material data, so geometry position is the only trustworthy signal.
for polygon in body.data.polygons:
    center = polygon.center
    abs_x = abs(center.x)
    if center.z > 1.68 or (abs_x > 0.40 and 0.70 < center.z < 0.92):
        polygon.material_index = 2
    elif center.z < 0.28 or (0.65 < center.z < 0.86):
        polygon.material_index = 1
    elif (abs_x > 0.30 and 0.86 < center.z < 1.30) or (0.30 < center.z < 0.58):
        polygon.material_index = 3
    else:
        polygon.material_index = 0

# Build a humanoid armature in the retained figure's relaxed A-pose.
armature_data = bpy.data.armatures.new("FemalePoliceHumanoid")
armature = bpy.data.objects.new("FemalePoliceHumanoid", armature_data)
bpy.context.scene.collection.objects.link(armature)
bpy.context.view_layer.objects.active = armature
armature.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")

def bone(name, head_position, tail_position, parent=None, connected=False):
    item = armature.data.edit_bones.new(name)
    item.head = head_position
    item.tail = tail_position
    item.parent = parent
    item.use_connect = connected
    return item

hips = bone("Hips", (0, 0, 0.78), (0, 0, 0.96))
spine = bone("Spine", (0, 0, 0.96), (0, 0, 1.20), hips, True)
chest = bone("Chest", (0, 0, 1.20), (0, 0, 1.48), spine, True)
neck_bone = bone("Neck", (0, 0, 1.48), (0, 0, 1.74), chest, True)
head_bone = bone("Head", (0, 0, 1.74), (0, 0, 2.12), neck_bone, True)

for side, sign in (("Left", 1), ("Right", -1)):
    shoulder = bone(f"{side}Shoulder", (0, 0, 1.43), (0.27 * sign, 0, 1.43), chest)
    upper = bone(f"{side}UpperArm", (0.27 * sign, 0, 1.43), (0.43 * sign, 0, 1.18), shoulder, True)
    forearm = bone(f"{side}Forearm", (0.43 * sign, 0, 1.18), (0.49 * sign, 0, 0.91), upper, True)
    bone(f"{side}Hand", (0.49 * sign, 0, 0.91), (0.50 * sign, 0, 0.76), forearm, True)
    thigh = bone(f"{side}Thigh", (0.145 * sign, 0, 0.83), (0.15 * sign, 0, 0.49), hips)
    shin = bone(f"{side}Shin", (0.15 * sign, 0, 0.49), (0.15 * sign, 0, 0.15), thigh, True)
    foot = bone(f"{side}Foot", (0.15 * sign, 0, 0.15), (0.15 * sign, -0.17, 0.06), shin, True)

bpy.ops.object.mode_set(mode="OBJECT")

# Deterministic region weights avoid unreliable automatic heat weighting on the
# disconnected clothing accessories in the source mesh.
def region_for_position(x, z):
    side = "Left" if x >= 0 else "Right"
    abs_x = abs(x)
    if z > 1.74:
        return "Head"
    if z > 1.48 and abs_x < 0.26:
        return "Neck"
    if abs_x > 0.25 and 1.18 < z < 1.54:
        return f"{side}UpperArm"
    if abs_x > 0.29 and 0.91 < z <= 1.18:
        return f"{side}Forearm"
    if abs_x > 0.32 and 0.70 < z <= 0.91:
        return f"{side}Hand"
    if z > 1.20:
        return "Chest"
    if z > 0.92:
        return "Spine"
    if z > 0.78 and abs_x < 0.29:
        return "Hips"
    if z > 0.49:
        return f"{side}Thigh"
    if z > 0.14:
        return f"{side}Shin"
    return f"{side}Foot"

bone_names = [bone.name for bone in armature.data.bones]
groups = {
    name: body.vertex_groups.get(name) or body.vertex_groups.new(name=name)
    for name in bone_names
}
all_vertex_indices = list(range(len(body.data.vertices)))
for group in groups.values():
    group.remove(all_vertex_indices)

def distance_to_bone(point, bone_name):
    item = armature.data.bones[bone_name]
    start = item.head_local
    segment = item.tail_local - start
    length_squared = segment.length_squared
    if length_squared < 1e-8:
        return (point - start).length
    amount = max(0.0, min(1.0, (point - start).dot(segment) / length_squared))
    return (point - (start + segment * amount)).length

def candidate_bones(point):
    side = "Left" if point.x >= 0 else "Right"
    abs_x = abs(point.x)
    if point.z > 0.68 and abs_x > 0.22:
        return [
            "Chest", f"{side}Shoulder", f"{side}UpperArm",
            f"{side}Forearm", f"{side}Hand",
        ]
    if point.z < 0.92:
        return ["Hips", "Spine", f"{side}Thigh", f"{side}Shin", f"{side}Foot"]
    return ["Hips", "Spine", "Chest", "Neck"]

# Smooth skinning: each vertex follows the nearest bones, with up to three
# influences. Joint rings therefore bend continuously instead of separating.
for vertex in body.data.vertices:
    distances = sorted(
        ((distance_to_bone(vertex.co, name), name) for name in candidate_bones(vertex.co)),
        key=lambda item: item[0],
    )[:3]
    nearest = distances[0][0]
    weighted = []
    for distance, name in distances:
        relative = max(0.0, distance - nearest)
        weight = math.exp(-((relative / 0.105) ** 2))
        if weight > 0.015:
            weighted.append((name, weight))
    total = sum(weight for _, weight in weighted) or 1.0
    for name, weight in weighted:
        groups[name].add([vertex.index], weight / total, "REPLACE")

modifier = body.modifiers.new("FemalePoliceArmature", "ARMATURE")
modifier.object = armature
body.parent = armature

bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
armature.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_animations=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
)
print(f"OUTPUT={OUTPUT}")
