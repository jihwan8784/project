import bpy
import bmesh
from mathutils import Vector
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / "아바타 용" / "여성경찰" / "Meshy_AI_Cyber_Police_Uniform__0829013328_generate.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
obj = next(item for item in bpy.context.scene.objects if item.type == "MESH")
bm = bmesh.new()
bm.from_mesh(obj.data)
remaining = set(bm.verts)
islands = []
while remaining:
    seed = remaining.pop()
    stack = [seed]
    component = [seed]
    while stack:
        vertex = stack.pop()
        for edge in vertex.link_edges:
            other = edge.other_vert(vertex)
            if other in remaining:
                remaining.remove(other)
                component.append(other)
                stack.append(other)
    coordinates = [vertex.co for vertex in component]
    minimum = Vector((min(v.x for v in coordinates), min(v.y for v in coordinates), min(v.z for v in coordinates)))
    maximum = Vector((max(v.x for v in coordinates), max(v.y for v in coordinates), max(v.z for v in coordinates)))
    islands.append((len(component), minimum, maximum))
for count, minimum, maximum in sorted(islands, reverse=True)[:40]:
    print("ISLAND", count, tuple(round(v, 3) for v in minimum), tuple(round(v, 3) for v in maximum))
bm.free()
