import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_BONES = {
    "Hips", "Spine", "Chest", "Neck", "Head",
    "LeftUpperArm", "LeftForearm", "LeftHand",
    "RightUpperArm", "RightForearm", "RightHand",
    "LeftThigh", "LeftShin", "LeftFoot",
    "RightThigh", "RightShin", "RightFoot",
}


def read_glb_json(path):
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("not a GLB file")
    version, total_length = struct.unpack_from("<II", data, 4)
    if version != 2 or total_length != len(data):
        raise ValueError("invalid GLB header")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("missing JSON chunk")
    return json.loads(data[20:20 + json_length].decode("utf-8"))


def validate(path):
    gltf = read_glb_json(path)
    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    skins = gltf.get("skins", [])
    node_names = {node.get("name") for node in nodes}
    missing_bones = sorted(REQUIRED_BONES - node_names)
    skinned_nodes = [node for node in nodes if "mesh" in node and "skin" in node]
    weighted_primitives = 0
    for mesh in meshes:
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            if "JOINTS_0" in attributes and "WEIGHTS_0" in attributes:
                weighted_primitives += 1
    errors = []
    if missing_bones:
        errors.append("missing bones: " + ", ".join(missing_bones))
    if not skins:
        errors.append("missing skin")
    if not skinned_nodes:
        errors.append("missing skinned mesh node")
    if not weighted_primitives:
        errors.append("missing JOINTS_0/WEIGHTS_0")
    return errors


def main():
    paths = sorted((ROOT / "아바타 용").glob("*/*_rigged.glb"))
    failures = []
    for path in paths:
        errors = validate(path)
        status = "PASS" if not errors else "FAIL: " + "; ".join(errors)
        print(f"{status}  {path.relative_to(ROOT)}")
        if errors:
            failures.append(path)
    if len(paths) != 18:
        raise SystemExit(f"Expected 18 rigged GLBs, found {len(paths)}")
    if failures:
        raise SystemExit(f"{len(failures)} model(s) failed validation")
    print("All 18 rigged GLBs passed validation.")


if __name__ == "__main__":
    main()
