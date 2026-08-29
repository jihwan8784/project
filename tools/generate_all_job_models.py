import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JOBS = {
    "student": ((0.08, 0.18, 0.38), (0.03, 0.06, 0.12), (0.88, 0.74, 0.18)),
    "astronaut": ((0.72, 0.77, 0.82), (0.25, 0.30, 0.36), (0.06, 0.55, 0.95)),
    "hacker": ((0.035, 0.045, 0.07), (0.02, 0.025, 0.04), (0.10, 0.95, 0.58)),
    "teacher": ((0.30, 0.20, 0.13), (0.08, 0.07, 0.06), (0.80, 0.56, 0.22)),
    "doctor": ((0.82, 0.86, 0.88), (0.22, 0.34, 0.40), (0.04, 0.62, 0.76)),
    "police": ((0.025, 0.10, 0.28), (0.012, 0.018, 0.035), (0.02, 0.50, 1.0)),
    "firefighter": ((0.42, 0.055, 0.035), (0.045, 0.035, 0.025), (0.95, 0.55, 0.04)),
    "chef": ((0.82, 0.80, 0.74), (0.16, 0.13, 0.11), (0.72, 0.12, 0.08)),
    "singer": ((0.28, 0.06, 0.38), (0.055, 0.025, 0.09), (0.92, 0.18, 0.70)),
}
FOLDERS = {
    ("male", "student"): "남성학생", ("female", "student"): "여성학생",
    ("male", "astronaut"): "남성우주비행사", ("female", "astronaut"): "여성우주비행사",
    ("male", "hacker"): "남성해커", ("female", "hacker"): "여성해커",
    ("male", "teacher"): "남성교사", ("female", "teacher"): "여성교사",
    ("male", "doctor"): "남성의사", ("female", "doctor"): "여성의사",
    ("male", "police"): "남성경찰", ("female", "police"): "여성경찰",
    ("male", "firefighter"): "남성소방관", ("female", "firefighter"): "여성소방관",
    ("male", "chef"): "남성요리사", ("female", "chef"): "여성요리사",
    ("male", "singer"): "남성가수", ("female", "singer"): "여성가수",
}

def material(name, color, metallic=0.05):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*color, 1)
    item.metallic = metallic
    item.roughness = 0.48
    return item

def make_model(gender, job):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    top_color, bottom_color, accent_color = JOBS[job]
    mats = [
        material("UniformTop", top_color, 0.10), material("UniformBottom", bottom_color, 0.12),
        material("Accent", accent_color, 0.22), material("Skin", (0.68, 0.37, 0.25)),
        material("Boot", (0.018, 0.022, 0.03), 0.30),
    ]
    parts = []
    female = gender == "female"
    shoulder = 0.29 if female else 0.33
    hip = 0.16 if female else 0.145

    def sphere(name, pos, scale, mat=0):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=1, location=pos)
        obj = bpy.context.object; obj.name = name; obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(mats[mat]); parts.append(obj); return obj

    def box(name, pos, scale, mat=0, rotation=(0, 0, 0), bevel=0.018):
        bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
        obj = bpy.context.object; obj.name = name; obj.scale = scale; obj.rotation_euler = rotation
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        if bevel:
            modifier = obj.modifiers.new("SoftTailoring", "BEVEL")
            modifier.width = bevel; modifier.segments = 3
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.data.materials.append(mats[mat]); parts.append(obj); return obj

    def limb(name, start, end, radius, mat=0):
        a, b = Vector(start), Vector(end); d = b - a
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=d.length, location=(a+b)/2)
        obj = bpy.context.object; obj.name = name
        obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.data.materials.append(mats[mat]); parts.append(obj); return obj

    sphere("Torso", (0, 0, 1.22), ((0.30 if female else 0.34), 0.19, 0.36), 0)
    sphere("Pelvis", (0, 0, 0.86), ((0.28 if female else 0.25), 0.18, 0.19), 1)
    sphere("HeadMesh", (0, 0, 1.82), ((0.145 if female else 0.155), 0.13, 0.19), 3)
    sphere("HairMesh", (0, 0.018, 1.88), ((0.154 if female else 0.164), 0.137, 0.16), 4)
    box("NeckMesh", (0, 0, 1.59), (.072, .065, .09), 3, bevel=.025)
    for side, sign in (("Left", 1), ("Right", -1)):
        limb(side+"UpperArmMesh", (shoulder*sign,0,1.43), (0.42*sign,0,1.16), .075, 0)
        sphere(side+"Elbow", (0.42*sign,0,1.16), (.078,.072,.078), 2)
        limb(side+"ForearmMesh", (0.42*sign,0,1.16), (0.47*sign,0,.90), .064, 0)
        sphere(side+"HandMesh", (0.48*sign,0,.82), (.06,.052,.11), 3)
        limb(side+"ThighMesh", (hip*sign,0,.84), (.16*sign,0,.50), .105, 1)
        sphere(side+"Knee", (.16*sign,0,.49), (.108,.10,.10), 2)
        limb(side+"ShinMesh", (.16*sign,0,.49), (.16*sign,0,.16), .087, 1)
        box(side+"Boot", (.16*sign,-.035,.075), (.105,.17,.075), 4)

    # Shared tailored layers add silhouette and surface detail comparable to
    # the supplied police mesh while remaining suitable for live skinning.
    box("WaistBand", (0, -.175, .94), ((.285 if female else .30), .035, .045), 1, bevel=.015)
    box("LeftFrontPanel", (.13, -.175, 1.20), (.125, .028, .27), 0, bevel=.025)
    box("RightFrontPanel", (-.13, -.175, 1.20), (.125, .028, .27), 0, bevel=.025)
    box("LeftCollar", (.075, -.205, 1.45), (.09, .022, .055), 2, rotation=(0, 0, -.48), bevel=.012)
    box("RightCollar", (-.075, -.205, 1.45), (.09, .022, .055), 2, rotation=(0, 0, .48), bevel=.012)
    for side, sign in (("Left", 1), ("Right", -1)):
        sphere(side+"ShoulderCap", (shoulder*sign, -.005, 1.415), (.105, .105, .09), 0)
        limb(side+"WristCuff", (.458*sign,0,.96), (.472*sign,0,.90), .073, 2)
        box(side+"KneeGuard", (.16*sign, -.098, .49), (.085, .025, .065), 2, bevel=.018)
        box(side+"BootSole", (.16*sign, -.075, .018), (.115, .19, .022), 4, bevel=.012)

    # Occupation-specific 3D design, not a flat image overlay.
    if job in ("student", "teacher"):
        box("Tie", (0,-.195,1.25), (.035,.018,.18), 2)
        box("LeftPocket", (.15,-.215,1.08), (.065,.016,.055), 1, bevel=.012)
        box("RightPocket", (-.15,-.215,1.08), (.065,.016,.055), 1, bevel=.012)
    if job == "student":
        box("ShirtFront", (0,-.208,1.31), (.09,.014,.13), 3, bevel=.01)
        box("SchoolCrest", (.16,-.231,1.34), (.032,.009,.042), 2, bevel=.008)
    if job == "teacher":
        box("JacketButton", (0,-.225,1.18), (.022,.012,.022), 2, bevel=.01)
        for side, sign in (("Left",1),("Right",-1)):
            box(side+"ElbowPatch", (.42*sign,-.075,1.15), (.055,.018,.075), 1, bevel=.018)
    if job == "doctor":
        box("CoatLeft", (.13,-.17,1.10), (.12,.025,.34), 0); box("CoatRight", (-.13,-.17,1.10), (.12,.025,.34), 0)
        limb("Stethoscope", (-.10,-.205,1.40), (0,-.22,1.13), .012, 2)
        box("DoctorPocket", (.15,-.225,1.08), (.07,.014,.07), 2, bevel=.01)
        for z in (1.30,1.20,1.10): sphere("CoatButton", (0,-.235,z), (.018,.009,.018), 2)
    if job == "astronaut":
        box("Backpack", (0,.22,1.20), (.25,.12,.32), 1); box("ChestPanel", (0,-.21,1.17), (.15,.035,.10), 2)
        for x in (-.07,0,.07): sphere("ControlLight", (x,-.255,1.18), (.018,.012,.018), 2)
        for side,sign in (("Left",1),("Right",-1)):
            limb(side+"SuitRing", (.405*sign,0,1.20), (.425*sign,0,1.14), .095, 2)
            box(side+"Tank", (.13*sign,.35,1.23), (.085,.09,.26), 1, bevel=.035)
    if job == "firefighter":
        box("ChestStripe", (0,-.205,1.25), (.30,.025,.035), 2); box("Belt", (0,-.19,.94), (.28,.035,.045), 4)
        box("BreathingTank", (0,.24,1.20), (.13,.11,.30), 4, bevel=.055)
        for side,sign in (("Left",1),("Right",-1)):
            limb(side+"ReflectiveArmBand", (.405*sign,0,1.12), (.42*sign,0,1.06), .082, 2)
            limb(side+"ReflectiveLegBand", (.16*sign,0,.38), (.16*sign,0,.32), .097, 2)
    if job == "police":
        box("Badge", (.14,-.205,1.34), (.035,.018,.05), 2); box("UtilityBelt", (0,-.19,.94), (.28,.04,.05), 4)
        box("Radio", (-.19,-.215,1.08), (.045,.025,.08), 4, bevel=.012)
        box("BeltPouch", (.18,-.235,.94), (.065,.035,.065), 4, bevel=.015)
        box("ShoulderPatch", (.295,-.105,1.39), (.04,.018,.055), 2, rotation=(0,0,-.25), bevel=.012)
    if job == "chef":
        box("Apron", (0,-.205,1.13), (.22,.025,.30), 0); sphere("Buttons", (0,-.235,1.27), (.025,.012,.025), 2)
        for z in (1.36,1.26,1.16):
            sphere("LeftChefButton", (.065,-.24,z), (.018,.01,.018), 1)
            sphere("RightChefButton", (-.065,-.24,z), (.018,.01,.018), 1)
        box("ApronPocket", (0,-.245,1.02), (.10,.014,.065), 2, bevel=.012)
    if job == "hacker":
        box("TechPanel", (0,-.205,1.20), (.17,.025,.09), 2); box("TechBelt", (0,-.19,.94), (.27,.035,.04), 2)
        box("HighCollar", (0,-.015,1.50), (.20,.15,.06), 4, bevel=.025)
        for index,z in enumerate((1.34,1.26,1.18,1.10)):
            box(f"Circuit{index}", (.11 if index%2 else -.11,-.225,z), (.08,.009,.012), 2, bevel=.006)
    if job == "singer":
        box("StageBelt", (0,-.19,.94), (.27,.035,.045), 2); box("ChestAccent", (0,-.205,1.28), (.21,.02,.035), 2)
        box("LeftStagePanel", (.13,-.218,1.18), (.09,.014,.18), 2, rotation=(0,0,-.22), bevel=.015)
        box("RightStagePanel", (-.13,-.218,1.18), (.09,.014,.18), 2, rotation=(0,0,.22), bevel=.015)
        sphere("StageGem", (0,-.245,1.35), (.035,.014,.045), 2)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join(); body = bpy.context.object; body.name = f"{gender}_{job}_Body"
    for polygon in body.data.polygons: polygon.use_smooth = True

    arm_data = bpy.data.armatures.new("Humanoid"); arm = bpy.data.objects.new("Humanoid", arm_data)
    bpy.context.scene.collection.objects.link(arm); bpy.context.view_layer.objects.active=arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    def bone(name, head, tail, parent=None, connected=False):
        b=arm.data.edit_bones.new(name); b.head=head; b.tail=tail; b.parent=parent; b.use_connect=connected; return b
    hips=bone("Hips",(0,0,.78),(0,0,.96)); spine=bone("Spine",(0,0,.96),(0,0,1.20),hips,True)
    chest=bone("Chest",(0,0,1.20),(0,0,1.48),spine,True); neck=bone("Neck",(0,0,1.48),(0,0,1.70),chest,True); bone("Head",(0,0,1.70),(0,0,2.0),neck,True)
    for side,sign in (("Left",1),("Right",-1)):
        sh=bone(side+"Shoulder",(0,0,1.43),(shoulder*sign,0,1.43),chest)
        up=bone(side+"UpperArm",(shoulder*sign,0,1.43),(.42*sign,0,1.16),sh,True)
        fore=bone(side+"Forearm",(.42*sign,0,1.16),(.47*sign,0,.90),up,True); bone(side+"Hand",(.47*sign,0,.90),(.48*sign,0,.72),fore,True)
        thigh=bone(side+"Thigh",(hip*sign,0,.84),(.16*sign,0,.50),hips)
        shin=bone(side+"Shin",(.16*sign,0,.50),(.16*sign,0,.16),thigh,True); bone(side+"Foot",(.16*sign,0,.16),(.16*sign,-.18,.07),shin,True)
    bpy.ops.object.mode_set(mode="OBJECT")

    groups={b.name:body.vertex_groups.new(name=b.name) for b in arm.data.bones}
    def dist(point,b):
        a=b.head_local; d=b.tail_local-a; t=max(0,min(1,(point-a).dot(d)/max(d.length_squared,1e-8))); return (point-(a+d*t)).length
    deform=list(arm.data.bones)
    for v in body.data.vertices:
        nearest=sorted(((dist(v.co,b),b.name) for b in deform))[:3]; base=nearest[0][0]
        ws=[(n,math.exp(-((d-base)/.11)**2)) for d,n in nearest]; total=sum(w for _,w in ws)
        for n,w in ws: groups[n].add([v.index],w/total,"REPLACE")
    mod=body.modifiers.new("Armature","ARMATURE"); mod.object=arm; body.parent=arm
    bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active=arm
    output=ROOT/"아바타 용"/FOLDERS[(gender,job)]/f"{gender}_{job}_rigged.glb"
    bpy.ops.export_scene.gltf(filepath=str(output),export_format="GLB",use_selection=True,export_skins=True,export_animations=False,export_materials="EXPORT")
    print(f"OUTPUT={output}")

for gender in ("male", "female"):
    for job in JOBS:
        if gender == "female" and job == "police":
            continue
        make_model(gender, job)
