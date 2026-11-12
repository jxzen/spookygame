"""Render preview PNG frames from monster.blend (headless). Tiling is done with ffmpeg afterwards.
blender -b src/monster.blend --python src/render_previews.py -- <outdir>
"""
import bpy, os, sys, math
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
arm = bpy.data.objects["rig"]
body = bpy.data.objects["Kagenui"]
sc.render.engine = "BLENDER_WORKBENCH"
sh = sc.display.shading
sc.render.film_transparent = False
w = bpy.data.worlds.new("w"); sc.world = w

def cam_at(pos, target, lens=50, ortho=None):
    cam = bpy.data.objects.get("cam")
    if not cam:
        cd = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam)
        tgt = bpy.data.objects.new("tgt", None); sc.collection.objects.link(tgt)
        c = cam.constraints.new("TRACK_TO"); c.target = tgt; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
        sc.camera = cam
    cam.location = pos; bpy.data.objects["tgt"].location = target
    cam.data.lens = lens
    if ortho: cam.data.type = "ORTHO"; cam.data.ortho_scale = ortho
    else: cam.data.type = "PERSP"

# 1.8 m human box, beside the monster
hb = bpy.data.meshes.new("human"); bpy_box = bpy.data.objects.new("human_box", hb); sc.collection.objects.link(bpy_box)
import bmesh
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(hb); bm.free()
bpy_box.scale = (0.45, 0.28, 1.8); bpy_box.location = (1.3, 0, 0.9)
hm = bpy.data.materials.new("hbox"); hm.diffuse_color = (0.35, 0.35, 0.38, 1); hb.materials.append(hm)

def shaded():
    sh.light = "STUDIO"; sh.color_type = "MATERIAL"; sh.show_shadows = True; sh.show_cavity = True
    w.color = (0.32, 0.32, 0.33)

def silhouette():
    sh.light = "FLAT"; sh.color_type = "SINGLE"; sh.single_color = (0, 0, 0); sh.show_shadows = False; sh.show_cavity = False
    w.color = (0.85, 0.85, 0.85)

def set_action(name):
    a = bpy.data.actions[name]; arm.animation_data.action = a
    try:
        if a.slots: arm.animation_data.action_slot = a.slots[0]
    except Exception: pass
    return a

def shot(path, frame, res=(512, 512)):
    sc.frame_set(frame); sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

mode = sys.argv[sys.argv.index("--") + 2] if len(sys.argv) > sys.argv.index("--") + 2 else "all"

# ground + peek wall (shaded views only)
def box(name, scale, loc, col):
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    ob.scale = scale; ob.location = loc; m = bpy.data.materials.new(name); m.diffuse_color = (*col, 1); me.materials.append(m)
    return ob
ground = box("ground", (12, 12, 0.02), (0, 0, -0.01), (0.22, 0.22, 0.23))
wall = box("wall", (3, 0.15, 3), (1.45, -0.42, 1.5), (0.45, 0.44, 0.42)); wall.hide_render = True

def rest_pose():
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)

# --- hero views: front / side, idle frame 1 (hunch), box visible
shaded(); set_action("Idle"); bpy_box.hide_render = False
cam_at((0.4, -5.5, 1.1), (0.4, 0, 0.9), lens=50); shot(f"{out}/v_front.png", 1, (640, 640))
bpy_box.location = (0, 1.4, 0.9)
cam_at((5.5, 0.4, 1.1), (0, 0.4, 0.9), lens=50); shot(f"{out}/v_side.png", 1, (640, 640))
bpy_box.location = (1.3, 0, 0.9); bpy_box.hide_render = True
cam_at((2.2, 3.4, 1.4), (0, 0, 0.9), lens=45); shot(f"{out}/v_back.png", 1, (512, 512))
rest_pose()
cam_at((0.25, -1.3, 1.82), (0, -0.05, 1.76), lens=70); shot(f"{out}/v_face.png", 1, (512, 512))
cam_at((0.4, -5.5, 1.1), (0.4, 0, 0.95), lens=50); shot(f"{out}/v_rest.png", 1, (512, 512))

# --- silhouettes at gameplay distance (12 m, 35 mm) next to the 1.8 m box
silhouette(); bpy_box.hide_render = False; ground.hide_render = True
for i, (act, f) in enumerate([("Idle", 1), ("StalkWalk", 13), ("Crawl", 9), ("Search", 60), ("Lunge", 22), ("Peek", 80)]):
    set_action(act)
    side = act in ("Crawl", "Lunge")
    cam_at((12, 0.0, 1.5), (0, -0.3, 1.0), lens=35) if side else cam_at((0.6, -12, 1.5), (0.6, 0, 1.0), lens=35)
    shot(f"{out}/sil_{i}.png", f, (320, 320))
bpy_box.hide_render = True; ground.hide_render = False

# --- frame strips per action: row 1 three-quarter, row 2 side
shaded()
for act in ["Idle", "StalkWalk", "Crawl", "Search", "Lunge", "Peek"]:
    a = set_action(act); f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
    wall.hide_render = act != "Peek"
    views = [((-2.6, -4.6, 1.5), (0, -0.2, 0.8)), ((5.0, -0.4, 1.0), (0, -0.4, 0.8))]
    if act == "Lunge": views = [((-3.2, -5.2, 1.5), (0, -0.7, 0.8)), ((5.5, -0.7, 1.0), (0, -0.7, 0.8))]
    if act == "Peek": views = [((-0.6, -4.5, 1.5), (0.1, 0, 1.2)), ((-2.6, -1.4, 1.6), (0.3, 0, 1.2))]
    for r, (pos, tgt) in enumerate(views):
        cam_at(pos, tgt, lens=40)
        for k in range(8):
            f = round(f0 + (f1 - f0) * k / 7)
            shot(f"{out}/strip_{act}_{r}{k}.png", f, (300, 360))
wall.hide_render = True
print("DONE")
