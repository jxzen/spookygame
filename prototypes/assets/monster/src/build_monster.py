"""MONSTER-01 'Kagenui' (the burn-shadow onryo). Headless build:
blender -b --factory-startup --python build_monster.py
Builds mesh (skin modifier body + hair/cloth/face cards), armature, automatic weights,
six actions, exports ../monster.glb (+Y up) and saves monster.blend next to this script.
Blender axes: Z up, character faces -Y, character's LEFT is +X.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Quaternion, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)

# ------------------------------------------------------------------ reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24

# ------------------------------------------------------------------ materials (flat PBR, palette)
def mat(name, rgb, rough=0.9, metal=0.0, emit=None, double=True):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 1.0
    m.diffuse_color = (*rgb, 1)
    m.use_backface_culling = not double
    return m

M_CHAR = mat("char", (0.012, 0.011, 0.011), 0.95)          # flash-burnt body, near black
M_ASH = mat("ash", (0.10, 0.10, 0.10), 0.9)                # ash grey crust / burnt hair ends
M_CLOTH = mat("katabira", (0.62, 0.60, 0.56), 0.85)        # burial white, dirty
M_FACE = mat("face", (0.80, 0.78, 0.74), 0.55)             # bone white face
M_RED = mat("red", (0.55, 0.02, 0.03), 0.6, emit=(0.12, 0.0, 0.0))  # thread, seam, nails
M_HAIR = mat("hair", (0.004, 0.004, 0.005), 0.85)
MATS = [M_CHAR, M_ASH, M_CLOTH, M_FACE, M_RED, M_HAIR]
MI = {m.name: i for i, m in enumerate(MATS)}

# ------------------------------------------------------------------ skeleton definition
S = {"L": 1, "R": -1}
B = {}  # name -> (head, tail, parent, deform)
def bone(n, h, t, p=None, d=True): B[n] = (Vector(h), Vector(t), p, d)

bone("root", (0, 0, 0), (0, 0, 0.25), None, False)
bone("hips", (0, 0, 0.80), (0, 0.02, 1.0), "root")
bone("spine1", (0, 0.02, 1.0), (0, 0.03, 1.18), "hips")
bone("spine2", (0, 0.03, 1.18), (0, 0.02, 1.35), "spine1")
bone("chest", (0, 0.02, 1.35), (0, 0.0, 1.48), "spine2")
bone("neck1", (0, 0.0, 1.48), (0, -0.03, 1.60), "chest")
bone("neck2", (0, -0.03, 1.60), (0, -0.05, 1.68), "neck1")
bone("head", (0, -0.05, 1.68), (0, -0.06, 1.92), "neck2")
bone("jaw", (0, -0.07, 1.74), (0, -0.17, 1.70), "head")
bone("hair1", (0, 0.06, 1.84), (0, 0.13, 1.52), "head")
bone("hair2", (0, 0.13, 1.52), (0, 0.15, 1.22), "hair1")
bone("hair3", (0, 0.15, 1.22), (0, 0.14, 0.92), "hair2")
for sd, s in S.items():
    bone(f"clav.{sd}", (s*0.03, 0.02, 1.44), (s*0.24, 0.03, 1.42), "chest")
    bone(f"upper.{sd}", (s*0.24, 0.03, 1.42), (s*0.40, 0.02, 1.06), f"clav.{sd}")
    bone(f"fore1.{sd}", (s*0.40, 0.02, 1.06), (s*0.50, 0.0, 0.70), f"upper.{sd}")   # the extra elbow
    bone(f"fore2.{sd}", (s*0.50, 0.0, 0.70), (s*0.55, -0.02, 0.38), f"fore1.{sd}")
    bone(f"hand.{sd}", (s*0.55, -0.02, 0.38), (s*0.57, -0.03, 0.24), f"fore2.{sd}")
    bone(f"fing1.{sd}", (s*0.57, -0.03, 0.24), (s*0.58, -0.04, 0.12), f"hand.{sd}")
    bone(f"fing2.{sd}", (s*0.58, -0.04, 0.12), (s*0.585, -0.05, 0.01), f"fing1.{sd}")
    bone(f"thigh.{sd}", (s*0.12, 0.0, 0.80), (s*0.21, -0.12, 0.43), "hips")
    bone(f"shin.{sd}", (s*0.21, -0.12, 0.43), (s*0.18, 0.03, 0.08), f"thigh.{sd}")
    bone(f"foot.{sd}", (s*0.18, 0.03, 0.08), (s*0.18, -0.13, 0.02), f"shin.{sd}")

# ------------------------------------------------------------------ body via skin modifier
verts, edges, radii = [], [], []
def V(p, r):
    verts.append(Vector(p)); radii.append(r if isinstance(r, tuple) else (r, r)); return len(verts) - 1
def E(a, b): edges.append((a, b))

pel = V((0, 0.01, 0.80), (0.13, 0.10))
sp1 = V((0, 0.02, 1.00), (0.12, 0.08)); E(pel, sp1)
sp2 = V((0, 0.03, 1.18), (0.19, 0.08)); E(sp1, sp2)      # wide, flat: a shadow peeled off a wall
ch = V((0, 0.02, 1.35), (0.23, 0.095)); E(sp2, ch)
nk0 = V((0, 0.0, 1.48), (0.055, 0.05)); E(ch, nk0)
nk1 = V((0, -0.03, 1.60), (0.04, 0.04)); E(nk0, nk1)
hd0 = V((0, -0.05, 1.70), (0.075, 0.08)); E(nk1, hd0)
hd1 = V((0, -0.06, 1.79), (0.095, 0.105)); E(hd0, hd1)
hd2 = V((0, -0.06, 1.90), (0.07, 0.075)); E(hd1, hd2)
for sd, s in S.items():
    sh = V((s*0.23, 0.03, 1.42), 0.06); E(ch, sh)
    el1 = V((s*0.40, 0.02, 1.06), 0.04); E(sh, el1)
    el2 = V((s*0.50, 0.0, 0.70), 0.037); E(el1, el2)
    wr = V((s*0.55, -0.02, 0.38), 0.03); E(el2, wr)
    pa = V((s*0.565, -0.03, 0.27), (0.02, 0.04)); E(wr, pa)
    for k, off in enumerate((-0.036, -0.012, 0.012, 0.036)):
        f0 = V((s*0.57, -0.03 + off, 0.22), 0.012); E(pa, f0)
        f1 = V((s*0.58, -0.04 + off*1.2, 0.12), 0.01); E(f0, f1)
        f2 = V((s*0.585, -0.05 + off*1.35, 0.01 + abs(off)*0.6), 0.006); E(f1, f2)
    hp = V((s*0.12, 0.0, 0.76), 0.085); E(pel, hp)
    kn = V((s*0.21, -0.12, 0.43), 0.055); E(hp, kn)
    an = V((s*0.18, 0.03, 0.08), 0.035); E(kn, an)
    to = V((s*0.18, -0.13, 0.025), (0.04, 0.025)); E(an, to)

me = bpy.data.meshes.new("body_src")
me.from_pydata([tuple(v) for v in verts], edges, [])
body_src = bpy.data.objects.new("body_src", me)
scene.collection.objects.link(body_src)
sk = body_src.modifiers.new("skin", "SKIN")
sk.branch_smoothing = 0.6
for i, r in enumerate(radii):
    me.skin_vertices[0].data[i].radius = r
me.skin_vertices[0].data[pel].use_root = True
ss = body_src.modifiers.new("sub", "SUBSURF"); ss.levels = 1; ss.render_levels = 1
dg = bpy.context.evaluated_depsgraph_get()
body_me = bpy.data.meshes.new_from_object(body_src.evaluated_get(dg))
bpy.data.objects.remove(body_src)
body = bpy.data.objects.new("Kagenui", body_me)
scene.collection.objects.link(body)
for m in MATS: body.data.materials.append(m)

# ash crust: faces on the back/upper surfaces become ash grey, a red seam down the back,
# red fingertips. Done per face by position.
bm = bmesh.new(); bm.from_mesh(body.data)
for f in bm.faces:
    c = f.calc_center_median(); n = f.normal
    idx = MI["char"]
    if c.z < 0.06 and abs(c.x) > 0.45: idx = MI["red"]                      # nails
    elif abs(c.x) < 0.03 and n.y > 0.6 and 0.95 < c.z < 1.45: idx = MI["red"]  # seam where it tore off the wall
    elif n.y > 0.55 and c.z > 0.9 and ((int(c.x*40) + int(c.z*30)) % 3 == 0): idx = MI["ash"]
    f.material_index = idx
bm.to_mesh(body.data); bm.free()

# ------------------------------------------------------------------ armature
arm_data = bpy.data.armatures.new("rig")
arm = bpy.data.objects.new("rig", arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for n, (h, t, p, d) in B.items():
    eb = arm_data.edit_bones.new(n); eb.head = h; eb.tail = t; eb.roll = 0; eb.use_deform = d
for n, (h, t, p, d) in B.items():
    if p:
        eb = arm_data.edit_bones[n]; eb.parent = arm_data.edit_bones[p]
        eb.use_connect = (arm_data.edit_bones[p].tail - h).length < 1e-4
bpy.ops.object.mode_set(mode="OBJECT")

# automatic (heat) weights for the body
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
# the jaw/hair bones must not take body weight (auto may leak)
for g in ("jaw", "hair1", "hair2", "hair3"):
    vg = body.vertex_groups.get(g)
    if vg: body.vertex_groups.remove(vg)

def seg_dist(p, a, b):
    ab = b - a; t = max(0, min(1, (p - a).dot(ab) / ab.length_squared)); return (a + ab * t - p).length

def weight_by_bones(ob, allowed, top=2, power=4):
    """distance-based weights for cards (hair/cloth/face) where heat weighting is unreliable."""
    for n in allowed:
        if n not in ob.vertex_groups: ob.vertex_groups.new(name=n)
    mw = ob.matrix_world
    for v in ob.data.vertices:
        p = mw @ v.co
        ds = sorted(((seg_dist(p, B[n][0], B[n][1]), n) for n in allowed))[:top]
        ws = [1 / (d + 0.02) ** power for d, _ in ds]; s = sum(ws)
        for (d, n), w in zip(ds, ws): ob.vertex_groups[n].add([v.index], w / s, "REPLACE")

# fix any unweighted body vertex (heat weighting can miss thin fingers)
deform = [n for n, b in B.items() if b[3] and n not in ("jaw", "hair1", "hair2", "hair3")]
missing = [v.index for v in body.data.vertices if sum(g.weight for g in v.groups) < 1e-3]
if missing:
    print("auto-weights missed", len(missing), "verts; distance fallback")
    for i in missing:
        p = body.data.vertices[i].co
        d, n = min((seg_dist(p, B[n][0], B[n][1]), n) for n in deform)
        if n not in body.vertex_groups: body.vertex_groups.new(name=n)
        body.vertex_groups[n].add([i], 1.0, "REPLACE")

# ------------------------------------------------------------------ cards
def card_obj(name, quads_verts, mat_name):
    """quads_verts: list of strips; each strip a list of (left, right) vertex pairs top->bottom."""
    bm = bmesh.new()
    for strip in quads_verts:
        prev = None
        for l, r in strip:
            a = bm.verts.new(l); b = bm.verts.new(r)
            if prev: bm.faces.new((prev[0], prev[1], b, a))
            prev = (a, b)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    for m in MATS: ob.data.materials.append(m)
    for p in ob.data.polygons: p.material_index = MI[mat_name]
    return ob

import random
rnd = random.Random(7)

# HAIR: long on her left side and back, burnt short on her right; a curtain over the face with one gap at the eye
hair_strips = []
cx, cy = 0.0, -0.06
for k in range(44):
    ang = math.radians(-115 + k * (300 / 43)) + rnd.uniform(-0.05, 0.05)   # her right-front, over the back, to left-front
    dx, dy = math.sin(ang), -math.cos(ang)
    burnt = dx < -0.3 and dy > -0.7                      # right side burnt short, ash ends
    length = 0.10 + rnd.random() * 0.12 if burnt else 0.6 + rnd.random() * 0.8
    w = 0.022 + rnd.random() * 0.016
    strip = []; segs = 6; jx = jy = 0.0
    for j in range(segs + 1):
        t = j / segs
        r = 0.112 + 0.045 * t
        jx += rnd.uniform(-0.012, 0.012); jy += rnd.uniform(-0.008, 0.008)
        px = cx + dx * r + jx; py = cy + dy * r + 0.05 * t * t * max(0, dy) + jy
        pz = 1.90 - length * t
        ww = w * (1 - 0.75 * t)
        tx, ty = -dy * ww, dx * ww
        strip.append(((px - tx, py - ty, pz), (px + tx, py + ty, pz)))
    hair_strips.append(strip)
# face curtain: strands hanging straight down in front of the face, a gap left at the eye (x ~ 0.03)
for x in (-0.085, -0.06, -0.04, -0.018, 0.0, 0.055, 0.075):
    ln = 0.35 + rnd.random() * 0.35; w = 0.007 + rnd.random() * 0.006
    strip = []; jx = 0
    for j in range(6):
        t = j / 5; jx += rnd.uniform(-0.006, 0.006)
        y = -0.06 - math.sqrt(max(0.0, 0.118**2 - x*x)) - 0.012 - 0.03 * t
        strip.append(((x + jx - w*(1-.6*t), y, 1.92 - ln * t), (x + jx + w*(1-.6*t), y, 1.92 - ln * t)))
    hair_strips.append(strip)
# crown: a parted scalp, thin strips from the parting
for k in range(14):
    ang = math.radians(-120 + k * (240 / 13))
    sx, sy = math.sin(ang), -math.cos(ang)
    strip = [((-0.012*sy - 0.0, -0.06 + 0.012*sx, 1.945), (0.012*sy, -0.06 - 0.012*sx, 1.945)),
             ((0.105*sx - 0.03*sy, -0.06 + 0.105*sy + 0.03*sx, 1.88), (0.105*sx + 0.03*sy, -0.06 + 0.105*sy - 0.03*sx, 1.88))]
    hair_strips.append(strip)
hair = card_obj("hair", hair_strips, "hair")
for p in hair.data.polygons:
    if p.center.z < 1.85 and p.center.x < -0.05 and p.center.y > -0.12: p.material_index = MI["ash"]
weight_by_bones(hair, ["head", "hair1", "hair2", "hair3", "neck2"])

# FACE plate: half face (her left side), split at the mouth: upper -> head, lower -> jaw
def face_plate():
    strips_up, strips_lo = [], []
    for col in range(4):
        x0 = -0.03 + col * 0.022; x1 = x0 + 0.022
        def pt(x, z):
            y = -0.06 - math.sqrt(max(0.0001, 0.112**2 - x*x - (z-1.79)**2 * 0.35)) - 0.006
            return (x, y, z)
        up = []; lo = []
        for z in (1.86, 1.82, 1.78, 1.755):
            up.append((pt(x0, z), pt(x1, z)))
        for z in (1.742, 1.72, 1.69):
            lo.append((pt(x0, z), pt(x1, z)))
        strips_up.append(up); strips_lo.append(lo)
    u = card_obj("face_up", strips_up, "face"); l = card_obj("face_lo", strips_lo, "face")
    weight_by_bones(u, ["head"], top=1); weight_by_bones(l, ["jaw"], top=1)
    return [u, l]
faces = face_plate()
# one eye: a black slit with a red pinprick, on the white side
eye = card_obj("eye", [[((0.018, -0.181, 1.808), (0.05, -0.172, 1.80)), ((0.02, -0.181, 1.798), (0.048, -0.172, 1.792))]], "char")
pin = card_obj("pin", [[((0.031, -0.184, 1.803), (0.037, -0.182, 1.802)), ((0.031, -0.184, 1.797), (0.037, -0.182, 1.796))]], "red")
for o in (eye, pin): weight_by_bones(o, ["head"], top=1)

# KATABIRA (burial white): torn strips hanging from the shoulders and hips, longer behind
cloth = []
for k in range(14):
    ang = math.radians(-160 + k * (320 / 13))
    dx, dy = math.sin(ang), -math.cos(ang)
    r0 = 0.20
    top = 1.40 if abs(dx) > 0.3 else 1.30
    ln = 0.45 + rnd.random() * 0.55 + (0.25 if dy > 0.3 else 0)
    if rnd.random() < 0.25: ln *= 0.5                      # burnt away
    w = 0.05 + rnd.random() * 0.03
    strip = []
    for j in range(6):
        t = j / 5
        rr = r0 + 0.04 * t + (0.02 if dy > 0 else 0)
        px, py, pz = dx * rr * (1.05 if abs(dx) > 0.5 else 0.95), 0.02 + dy * rr * 0.55, top - ln * t
        tx, ty = -dy * w, dx * w
        strip.append(((px - tx, py - ty * 0.55, pz), (px + tx, py + ty * 0.55, pz)))
    cloth.append(strip)
# a short skirt ring of tatters at the hips
for k in range(12):
    ang = math.radians(k * 30)
    dx, dy = math.sin(ang), -math.cos(ang)
    ln = 0.2 + rnd.random() * 0.3; w = 0.07
    strip = []
    for j in range(4):
        t = j / 3
        rr = 0.16 + 0.06 * t
        px, py, pz = dx * rr, 0.01 + dy * rr * 0.75, 0.86 - ln * t
        tx, ty = -dy * w, dx * w
        strip.append(((px - tx, py - ty*0.75, pz), (px + tx, py + ty*0.75, pz)))
    cloth.append(strip)
kat = card_obj("katabira", cloth, "katabira")
weight_by_bones(kat, ["chest", "spine2", "spine1", "hips", "thigh.L", "thigh.R", "clav.L", "clav.R"])

# RED THREAD: wound round her right wrist, one end trailing to the ground
thr = []
for k in range(3):
    z = 0.40 - k * 0.025
    ring = []
    for j in range(9):
        a = j / 8 * 2 * math.pi
        x = -0.55 + 0.042 * math.cos(a); y = -0.02 + 0.042 * math.sin(a)
        ring.append(((x, y, z + 0.006), (x, y, z - 0.006)))
    thr.append(ring)
thr.append([((-0.55 + 0.04, -0.02, 0.36), (-0.55 + 0.048, -0.02, 0.36)), ((-0.52, 0.0, 0.18), (-0.511, 0.0, 0.18)), ((-0.50, 0.03, 0.0), (-0.492, 0.03, 0.0))])
thread = card_obj("thread", thr, "red")
weight_by_bones(thread, ["hand.R", "fore2.R"], top=1)

# join cards into the body
bpy.ops.object.select_all(action="DESELECT")
for o in [hair, kat, thread, eye, pin] + faces: o.select_set(True)
body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.data.update()
for p in body.data.polygons: p.use_smooth = False

tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print("TRIS", tris, "BONES", len(arm_data.bones))

# ------------------------------------------------------------------ animation helpers
for pb in arm.pose.bones: pb.rotation_mode = "QUATERNION"
AX = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}
REST = {b.name: b.matrix_local.to_3x3() for b in arm_data.bones}

def P(**kw):
    """pose spec: bone=[('x',deg),('z',deg)...] in armature-rest axes, relative to parent.
    '_loc'=(x,y,z) root offset (Blender axes)."""
    return kw

def apply_pose(pose, frame):
    for pb in arm.pose.bones:
        key = pb.name.replace(".", "_")
        q = Quaternion()
        for ax, deg in pose.get(key, []):
            q = Quaternion(AX[ax], math.radians(deg)) @ q
        R = REST[pb.name]
        local = (R.inverted() @ q.to_matrix() @ R).to_quaternion()
        pb.rotation_quaternion = local
        pb.keyframe_insert("rotation_quaternion", frame=frame)
    loc = Vector(pose.get("_loc", (0, 0, 0)))
    rb = arm.pose.bones["root"]
    rb.location = REST["root"].inverted() @ loc
    rb.keyframe_insert("location", frame=frame)

def merge(*poses):
    out = {}
    for p in poses:
        for k, v in p.items():
            if k == "_loc":
                a = Vector(out.get("_loc", (0, 0, 0))); out["_loc"] = tuple(a + Vector(v))
            else:
                out[k] = out.get(k, []) + list(v)
    return out

def new_action(name):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    if not arm.animation_data: arm.animation_data_create()
    arm.animation_data.action = act
    return act

def finish(act, interp="BEZIER", steps_for=()):
    fcs = []
    try:
        fcs = list(act.fcurves)
    except AttributeError:
        pass
    if not fcs:  # slotted actions (4.4+)
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags: fcs += list(cb.fcurves)
    for fc in fcs:
        stepped = any(s in fc.data_path for s in steps_for)
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT" if stepped else interp

# ------------------------------------------------------------------ poses
# Base hunch: torso folded forward, head hanging BELOW the shoulder line, knees bowed.
HUNCH = P(
    spine1=[("x", 25)], spine2=[("x", 28)], chest=[("x", 22)],
    neck1=[("x", 28)], neck2=[("x", 8)], head=[("x", -75), ("y", 18)],
    clav_L=[("x", -6)], clav_R=[("x", -6), ("z", -6)],
    upper_L=[("x", -72), ("y", 12)], upper_R=[("x", -64), ("y", -14)],
    fore1_L=[("x", 32)], fore1_R=[("x", 26)], fore2_L=[("x", -50)], fore2_R=[("x", -42)],   # extra elbow bends the wrong way
    hand_L=[("x", -10)], hand_R=[("x", -16)], fing1_L=[("x", 12)], fing1_R=[("x", 20)],
    thigh_L=[("x", -45), ("y", -8)], thigh_R=[("x", -36), ("y", 8)],
    shin_L=[("x", 72)], shin_R=[("x", 64)], foot_L=[("x", -26)], foot_R=[("x", -26)],
    hair1=[("x", -36)], hair2=[("x", -6)],
    _loc=(0, 0.08, -0.2))

def act_idle():
    act = new_action("Idle")
    breath_in = P(spine2=[("x", -3)], chest=[("x", -4)], clav_L=[("z", 3)], clav_R=[("z", -3)])
    twitch_head = P(head=[("y", -40), ("z", 22)])       # sudden sideways snap, too far
    twitch_hand = P(fing1_R=[("x", 35)], fing2_R=[("x", 40)], fore2_R=[("x", -12)])
    keys = [(1, {}), (24, breath_in), (48, {}), (60, {}), (61, twitch_head), (70, twitch_head),
            (72, {}), (84, breath_in), (86, merge(breath_in, twitch_hand)), (90, merge(breath_in, twitch_hand)), (91, breath_in), (96, {})]
    for f, extra in keys: apply_pose(merge(HUNCH, extra), f)
    finish(act); return act

def act_stalk():
    """48f cycle. Limping, uneven: left leg strides, right leg drags. Head held still then snaps (stepped)."""
    act = new_action("StalkWalk")
    def leg(phase):
        # phase 0..1 for left leg, right is offset; right stride is shorter (drag)
        s = math.sin(phase * 2 * math.pi); c = math.cos(phase * 2 * math.pi)
        sr = math.sin((phase + 0.5) * 2 * math.pi); cr = math.cos((phase + 0.5) * 2 * math.pi)
        return P(thigh_L=[("x", -26 * s)], shin_L=[("x", 30 * max(0, c))], foot_L=[("x", 10 * s)],
                 thigh_R=[("x", -12 * sr)], shin_R=[("x", 10 * max(0, cr))], foot_R=[("x", 18)],
                 spine1=[("z", 6 * s), ("y", 5 * s)], chest=[("z", -9 * s)],
                 upper_L=[("x", 14 * sr)], upper_R=[("x", 22 * s), ("y", 6)],
                 fore1_L=[("x", -8 * s)], fore2_R=[("x", 10 * sr)],
                 _loc=(0.02 * s, -0.0, 0.03 * abs(s) - 0.02 * max(0, sr)))
    for f in range(1, 49, 4):
        ph = (f - 1) / 48
        apply_pose(merge(HUNCH, leg(ph)), f)
    finish(act)
    # head: stepped (stop-motion) look-arounds layered as separate keys
    head_keys = [(1, [("x", -38), ("y", 14)]), (13, [("x", -30), ("y", -20), ("z", 25)]),
                 (25, [("x", -45), ("y", 30)]), (37, [("x", -34), ("y", 4), ("z", -18)]), (48, [("x", -38), ("y", 14)])]
    pb = arm.pose.bones["head"]; R = REST["head"]
    for f, rots in head_keys:
        q = Quaternion()
        for ax, deg in rots: q = Quaternion(AX[ax], math.radians(deg)) @ q
        pb.rotation_quaternion = (R.inverted() @ q.to_matrix() @ R).to_quaternion()
        pb.keyframe_insert("rotation_quaternion", frame=f)
    finish(act, steps_for=('"head"',))
    return act

CRAWL = P(
    hips=[("x", 70)], spine1=[("x", 10)], spine2=[("x", 8)], chest=[("x", 2)],
    neck1=[("x", -28)], neck2=[("x", -22)], head=[("x", -30), ("y", 25)],
    upper_L=[("x", -118), ("y", -28)], upper_R=[("x", -118), ("y", 28)],
    fore1_L=[("x", 34)], fore1_R=[("x", 34)], fore2_L=[("x", -38)], fore2_R=[("x", -38)],
    hand_L=[("x", 30)], hand_R=[("x", 30)], fing1_L=[("x", 25)], fing1_R=[("x", 25)],
    thigh_L=[("x", -112), ("y", -38)], thigh_R=[("x", -112), ("y", 38)],
    shin_L=[("x", 115)], shin_R=[("x", 115)], foot_L=[("x", -10)], foot_R=[("x", -10)],
    hair1=[("x", -10)], hair2=[("x", -10)],
    _loc=(0, 0.35, -0.32))

def act_crawl():
    """32f cycle, low and wide, arms reaching far ahead. Same pose works on a ceiling (flip root 180 deg about Z-forward in engine)."""
    act = new_action("Crawl")
    for f in range(1, 34, 4):
        ph = (f - 1) / 32
        s = math.sin(ph * 2 * math.pi); c = math.cos(ph * 2 * math.pi)
        g = P(upper_L=[("x", -28 * s)], upper_R=[("x", 28 * s)],
              fore1_L=[("x", -15 * max(0, c))], fore1_R=[("x", -15 * max(0, -c))],
              thigh_L=[("x", 18 * s)], thigh_R=[("x", -18 * s)],
              spine1=[("z", 8 * s)], chest=[("z", -10 * s), ("y", 4 * c)],
              head=[("z", -6 * s)],
              _loc=(0.03 * s, 0, 0.02 * abs(c)))
        apply_pose(merge(CRAWL, g), f)
    finish(act); return act

def act_search():
    """head scans independently of a frozen body; past human range, in jerks."""
    act = new_action("Search")
    neck_keys = [(1, 0, 0), (14, 0, 0), (16, 75, 0), (34, 85, 10), (36, -40, -30), (50, -45, -35),
                 (52, -130, 80), (70, -135, 85), (74, 30, 0), (88, 20, 0), (96, 0, 0)]
    for f, yaw, roll in neck_keys:
        apply_pose(merge(HUNCH, P(neck2=[("z", yaw * 0.45)], head=[("z", yaw * 0.55), ("y", roll)],
                                  jaw=[("x", -12 if 52 <= f <= 70 else 0)])), f)
    finish(act, interp="LINEAR"); return act

def act_lunge():
    act = new_action("Lunge")
    wind = P(spine1=[("x", 10)], chest=[("x", 8)], thigh_L=[("x", -20)], thigh_R=[("x", -20)], shin_L=[("x", 25)], shin_R=[("x", 25)],
             upper_L=[("x", 40), ("y", -20)], upper_R=[("x", 40), ("y", 20)], head=[("x", 20)], _loc=(0, 0.1, -0.12))
    strike = P(spine1=[("x", -5)], spine2=[("x", -5)], chest=[("x", -5)],
               neck1=[("x", -10)], head=[("x", 22)], jaw=[("x", -55)],
               upper_L=[("x", -66), ("y", -14)], upper_R=[("x", -66), ("y", 14)],
               fore1_L=[("x", -32)], fore1_R=[("x", -26)], fore2_L=[("x", 45)], fore2_R=[("x", 38)],
               hand_L=[("x", -15)], hand_R=[("x", -15)], fing1_L=[("x", -25)], fing1_R=[("x", -25)],
               thigh_L=[("x", -55)], thigh_R=[("x", 25)], shin_L=[("x", 40)], shin_R=[("x", 30)],
               hair1=[("x", 30)], _loc=(0, -1.35, -0.02))
    grab = P(fing1_L=[("x", 50)], fing2_L=[("x", 70)], fing1_R=[("x", 50)], fing2_R=[("x", 70)],
             fore2_L=[("x", -30)], fore2_R=[("x", -30)])
    keys = [(1, {}), (8, wind), (14, wind), (17, strike), (24, strike), (26, merge(strike, grab)), (34, merge(strike, grab)), (48, {})]
    for f, extra in keys: apply_pose(merge(HUNCH, extra), f)
    # the strike happens in 3 frames: make that segment linear, rest smooth
    finish(act, interp="LINEAR"); return act

def act_peek():
    """Corner peek. Preview wall: front face at y=-0.495, edge at x=-0.05, wall covers x>-0.05.
    The body stays hidden behind it; only the right hand (IK, baked) curls round the edge,
    then the head slides out rolled ~80 deg sideways, stares, and snaps back."""
    act = new_action("Peek")
    tgt = bpy.data.objects.new("peek_target", None); scene.collection.objects.link(tgt)
    ik = arm.pose.bones["hand.R"].constraints.new("IK"); ik.target = tgt; ik.chain_count = 4
    base = merge(HUNCH, P(_loc=(0.42, 0.28, 0.0)))
    lean0 = P()
    lean1 = P(spine1=[("y", -14)], spine2=[("y", -18)], chest=[("y", -16)], neck1=[("y", -28), ("x", -10)],
              neck2=[("y", -18)], head=[("y", -40), ("x", 18)], hair1=[("y", 40)], hair2=[("y", 20)])
    curl0 = P(fing1_R=[("x", 10)], fing2_R=[("x", 10)])
    curl1 = P(fing1_R=[("y", 55)], fing2_R=[("y", 70)], hand_R=[("y", 25)])
    hidden_hand, edge_hand = (0.62, 0.30, 0.45), (-0.10, -0.53, 1.22)
    keys = [  # frame, lean, curl, hand target
        (1, lean0, curl0, hidden_hand), (14, lean0, curl0, hidden_hand), (30, lean0, curl1, edge_hand),
        (33, lean0, merge(curl1, P(fing2_R=[("y", -25)])), edge_hand), (34, lean0, curl1, edge_hand),  # finger tap
        (48, lean0, curl1, edge_hand), (72, lean1, curl1, edge_hand),
        (86, lean1, curl1, edge_hand), (87, merge(lean1, P(head=[("y", -22), ("z", 15)])), curl1, edge_hand),   # twitch, too far
        (100, merge(lean1, P(head=[("y", -22), ("z", 15)])), curl1, edge_hand),
        (103, lean0, curl0, hidden_hand), (120, lean0, curl0, hidden_hand)]
    for f, lean, curl, hp in keys:
        apply_pose(merge(base, lean, curl), f)
        tgt.location = hp; tgt.keyframe_insert("location", frame=f)
    finish(act, interp="LINEAR")
    # bake IK into the action
    bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(frame_start=1, frame_end=120, step=1, only_selected=False, visual_keying=True,
                     clear_constraints=True, use_current_action=True, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    act = arm.animation_data.action
    act.name = "Peek"; act.use_fake_user = True
    bpy.data.objects.remove(tgt)
    return act

acts = [act_idle(), act_stalk(), act_crawl(), act_search(), act_lunge(), act_peek()]
for a in acts:
    print("ACTION", a.name, tuple(a.frame_range))

# leave idle assigned, push all to NLA so the exporter sees them
arm.animation_data.action = None
for a in acts:
    tr = arm.animation_data.nla_tracks.new(); tr.name = a.name
    st = tr.strips.new(a.name, int(a.frame_range[0]), a)
    tr.mute = True
arm.animation_data.action = acts[0]

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "monster.blend"))

# ------------------------------------------------------------------ export
bpy.ops.object.select_all(action="SELECT")
kw = dict(filepath=os.path.join(OUT, "monster.glb"), export_format="GLB", export_yup=True,
          export_animations=True, export_skins=True, export_apply=False, use_selection=False)
try:
    bpy.ops.export_scene.gltf(**kw, export_animation_mode="ACTIONS", export_def_bones=False)
except TypeError as e:
    print("export kw fallback", e); bpy.ops.export_scene.gltf(**kw)
print("EXPORTED", os.path.getsize(os.path.join(OUT, "monster.glb")))
