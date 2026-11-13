# First-person arms (viewmodel) for the spy, headless.
# blender -b --factory-startup --python build_fp_arms.py [-- --no-render]
# Space: camera at origin looking +Y (Blender), Z up. After glTF +Y-up conversion the
# model looks down three.js -Z, so it can be parented straight to the camera.
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, geo
importlib.reload(geo)
from geo import *
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, ".."))
PREV = os.path.join(OUT, "previews")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
scene = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
scene.render.fps = 30

M = {
    "coat": material("coat_charcoal", (0.34, 0.335, 0.325), 0.9),
    "coat_dark": material("coat_shadow", (0.26, 0.255, 0.25), 0.9),
    "shirt": material("shirt_white", (0.86, 0.85, 0.82), 0.7),
    "glove": material("glove_black", (0.03, 0.03, 0.03), 0.45),
    "metal": material("metal_grey", (0.55, 0.55, 0.56), 0.3, 0.9),
    "torch": material("torch_black", (0.08, 0.08, 0.085), 0.4, 0.7),
}
lens = material("torch_lens", (1, 1, 1), 0.2)
bs = next(n for n in lens.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
for nm in ("Emission Color", "Emission"):
    if nm in bs.inputs:
        bs.inputs[nm].default_value = (1, 0.97, 0.9, 1)
        break
bs.inputs["Emission Strength"].default_value = 4.0
M["lens"] = lens

# joints (metres, camera space)
J = {
    "R": dict(sh=Vector((0.24, -0.2, -0.30)), el=Vector((0.25, 0.13, -0.27)), wr=Vector((0.18, 0.40, -0.14)), hd=Vector((0.17, 0.50, -0.11))),
    "L": dict(sh=Vector((-0.24, -0.2, -0.32)), el=Vector((-0.29, 0.10, -0.36)), wr=Vector((-0.23, 0.36, -0.22)), hd=Vector((-0.215, 0.46, -0.20))),
}
fing_end = J["L"]["hd"] + Vector((0.005, 0.07, -0.01))
bones = [("root", (0, 0, 0), (0, 0.1, 0), None, False)]
for s in ("L", "R"):
    d = J[s]
    bones += [("upperarm." + s, tuple(d["sh"]), tuple(d["el"]), "root", False),
              ("forearm." + s, tuple(d["el"]), tuple(d["wr"]), "upperarm." + s, True),
              ("hand." + s, tuple(d["wr"]), tuple(d["hd"]), "forearm." + s, True)]
bones.append(("fingers.L", tuple(J["L"]["hd"]), tuple(fing_end), "hand.L", True))
arm = make_armature("ArmsRig", bones)

parts = []


def part(ob, allowed=None, rigid=None):
    parts.append((ob, allowed, rigid))


for s in ("L", "R"):
    d = J[s]
    sx = 1 if s == "R" else -1
    back = (d["el"] - d["wr"]).normalized()
    fwd = -back
    sleeve_end = d["wr"] + back * 0.035
    part(tube("sleeve." + s, [d["sh"], d["sh"].lerp(d["el"], 0.5), d["el"], d["el"].lerp(sleeve_end, 0.5), sleeve_end],
              [0.07, 0.068, 0.064, 0.06, 0.062], 14, up=(0, 0, 1), cap0=True, cap1=False, mat=M["coat"]),
         ["upperarm." + s, "forearm." + s])
    part(tube("strap." + s, [sleeve_end + back * 0.06, sleeve_end + back * 0.03], [0.066, 0.066], 14, up=(0, 0, 1), cap0=False, cap1=False, mat=M["coat_dark"]), ["forearm." + s])
    part(tube("cuff." + s, [sleeve_end + back * 0.01, d["wr"] + fwd * 0.012], [0.047, 0.045], 14, up=(0, 0, 1), cap0=False, cap1=True, mat=M["shirt"]), ["forearm." + s, "hand." + s])
    hdir = (d["hd"] - d["wr"]).normalized()
    side = Vector((0, 0, 1)).cross(hdir).normalized()
    part(tube("palm." + s, [d["wr"], d["wr"] + hdir * 0.035, d["wr"] + hdir * 0.10], [(0.036, 0.026), (0.045, 0.022), (0.047, 0.02)], 10, up=(0, 0, 1), mat=M["glove"]), ["hand." + s, "forearm." + s])
    if s == "R":
        # fist around the flashlight
        f0 = d["wr"] + hdir * 0.10
        part(tube("fist.R", [f0, f0 + hdir * 0.03 + Vector((0, 0, -0.012))], [(0.046, 0.032), (0.04, 0.03)], 10, up=(0, 0, 1), mat=M["glove"]), None, "hand.R")
        th = d["wr"] + hdir * 0.05 + side * -0.03 + Vector((0, 0, 0.02))
        part(tube("thumb.R", [th, th + hdir * 0.05 + Vector((0, 0, 0.012))], [0.013, 0.011], 6, up=(0, 0, 1), mat=M["glove"]), None, "hand.R")
        # flashlight: held overhand, pointing forward
        c0 = d["wr"] + hdir * 0.09 + Vector((0, -0.12, 0.012))
        tdir = Vector((0, 1, 0.08)).normalized()
        part(tube("torch_body", [c0, c0 + tdir * 0.2], [0.021, 0.021], 12, up=(0, 0, 1), mat=M["torch"]), None, "hand.R")
        part(tube("torch_head", [c0 + tdir * 0.2, c0 + tdir * 0.25, c0 + tdir * 0.28], [0.023, 0.034, 0.036], 14, up=(0, 0, 1), cap1=False, mat=M["torch"]), None, "hand.R")
        part(tube("torch_lens", [c0 + tdir * 0.276, c0 + tdir * 0.279], [0.031, 0.031], 14, up=(0, 0, 1), mat=M["lens"]), None, "hand.R")
        part(box("torch_switch", c0 + tdir * 0.13 + Vector((0, 0, 0.022)), (0.012, 0.022, 0.008), M["metal"]), None, "hand.R")
    else:
        # open hand: four fingers + thumb on the fingers bone
        base = d["hd"]
        for i in range(4):
            off = side * (-0.027 + 0.018 * i)
            ln = (0.06, 0.07, 0.066, 0.052)[i]
            part(tube("finger%d" % i, [base + off, base + off + hdir * ln * 0.55 + Vector((0, 0, -0.004)), base + off + hdir * ln + Vector((0, 0, -0.012))],
                      [0.0095, 0.009, 0.008], 6, up=(0, 0, 1), mat=M["glove"]), None, "fingers.L")
        th = d["wr"] + hdir * 0.04 + side * 0.035 + Vector((0, 0, 0.008))
        part(tube("thumb.L", [th, th + hdir * 0.04 + side * 0.022], [0.012, 0.01], 6, up=(0, 0, 1), mat=M["glove"]), None, "hand.L")
        # wristwatch over the cuff
        part(tube("watch", [d["wr"] + back * 0.045, d["wr"] + back * 0.025], [0.05, 0.05], 14, up=(0, 0, 1), mat=M["metal"]), ["forearm.L"])

report = [p[0].name + ": " + auto_weight(p[0], arm, p[1] or [], rigid=p[2]) for p in parts]
arms = join([p[0] for p in parts], "FPArms")
mod = arms.modifiers.new("Armature", "ARMATURE")
mod.object = arm
arms.parent = arm
print("WEIGHTS\n" + "\n".join(report))
print("TRIS", tri_count(arms))

# idle sway: 3 s loop
idle = new_action(arm, "idle_sway")
for i in range(0, 91, 10):
    ph = 2 * math.pi * i / 90
    key(arm, 1 + i, {"root": (0.9 * math.sin(ph), 0.5 * math.sin(ph * 2), 0.7 * math.cos(ph)),
                     "forearm.R": (0.8 * math.sin(ph + 1), 0, 0), "forearm.L": (1.2 * math.sin(ph + 2), 0, 0)},
        {"root": (0, 0, 0.004 * math.sin(ph * 2))})
push_nla(arm, idle)

# reach: left hand reaches forward and closes on something (1.2 s)
reach = new_action(arm, "reach")
for f, k, op in ((1, 0, 0), (10, 0.7, 1), (16, 1, 1), (24, 1, -1), (36, 0, 0)):
    key(arm, f, {"upperarm.L": (9 * k, 0, -7 * k), "forearm.L": (8 * k, 0, -4 * k), "hand.L": (-6 * k, 0, 0),
                 "fingers.L": ((14 if op > 0 else (-75 if op < 0 else 0)), 0, 0), "root": (0, 0, 0)},
        {"upperarm.L": (0.03 * k, 0.11 * k, 0.03 * k)})
push_nla(arm, reach)
scene.frame_start, scene.frame_end = 1, 90

select_only([arm, arms], arm)
glb = os.path.join(OUT, "fp-arms.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_yup=True,
                          export_animations=True, export_animation_mode="ACTIONS", export_skins=True, export_morph=False)
print("EXPORTED", glb, os.path.getsize(glb))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "fp-arms.blend"))

if "--no-render" not in ARGS:
    import render_util as R
    importlib.reload(R)
    w = bpy.data.worlds.new("w"); scene.world = w
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.01, 0.01, 0.012, 1)
    R.eevee(scene)
    R.light("key", "AREA", (0.6, -0.2, 0.5), (0, 0.4, -0.3), 25, 0.6)
    R.light("rim", "AREA", (-0.8, 1.2, 0.3), (0, 0.3, -0.3), 18, 0.5)
    spot = R.light("torch_spill", "SPOT", (0.18, 0.66, -0.08), (0.15, 3, -0.2), 60)
    # a wall ahead to catch the beam
    R.box("wall", (0, 2.2, 0), (6, 0.05, 4), material("wall", (0.3, 0.3, 0.3), 0.9))
    cam = R.look_cam("cam_fp", (0, 0, 0), (0, 1, -0.03), lens=18)
    use_action(arm, idle); scene.frame_set(1)
    R.render(scene, cam, os.path.join(PREV, "arms_fp_idle.png"), (1280, 720))
    use_action(arm, reach); scene.frame_set(16)
    R.render(scene, cam, os.path.join(PREV, "arms_fp_reach.png"), (1280, 720))
    cam2 = R.look_cam("cam_out", (0.9, 0.9, 0.35), (0, 0.2, -0.32), lens=35)
    use_action(arm, idle); scene.frame_set(1)
    R.render(scene, cam2, os.path.join(PREV, "arms_outside.png"), (1000, 800))
