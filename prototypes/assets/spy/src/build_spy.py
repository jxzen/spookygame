# Build the player character (third-person / title-sequence spy) headless.
# blender -b --factory-startup --python build_spy.py [-- --no-render]
# Output: ../spy.glb, ../spy.blend, ../previews/*.png
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, geo
importlib.reload(geo)
from geo import *
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, ".."))
PREV = os.path.join(OUT, "previews")
os.makedirs(PREV, exist_ok=True)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

# ---------------- proportions (metres; Blender Z up, faces -Y) ----------------
HEIGHT = 1.83            # crown of head, no hat
H = HEIGHT / 7.5         # one head = 0.244
HEAD_C = HEIGHT - H / 2  # head centre z
SH_Z = HEIGHT - 1.38 * H  # shoulder joint height (~1.49)
SH_X = 0.185             # shoulder joint x
HIP_Z = HEIGHT / 2 + 0.02  # hip joint (~0.935)
HIP_X = 0.095
KNEE_Z = 0.50
ANKLE_Z = 0.085
COAT_HEM = 0.40          # mid-calf, as in the 1940s trench references
FLARE = 1.0              # hem flare multiplier (iterated)

scene = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
scene.render.fps = 30

# ---------------- materials (flat PBR; black / white / grey / red) ----------------
M = {
    "coat": material("coat_charcoal", (0.34, 0.335, 0.325), 0.9, double=True),
    "coat_dark": material("coat_shadow", (0.26, 0.255, 0.25), 0.9, double=True),
    "trouser": material("trouser_black", (0.09, 0.09, 0.095), 0.85),
    "shoe": material("shoe_black", (0.03, 0.03, 0.03), 0.35, 0.1),
    "shirt": material("shirt_white", (0.86, 0.85, 0.82), 0.7),
    "tie": material("tie_red", (0.62, 0.03, 0.04), 0.6),
    "skin": material("skin_grey", (0.58, 0.555, 0.53), 0.6),
    "hair": material("hair_black", (0.06, 0.06, 0.06), 0.7),
    "hat": material("hat_black", (0.07, 0.07, 0.075), 0.75, double=True),
    "band": material("hatband_red", (0.55, 0.03, 0.04), 0.6),
    "glove": material("glove_black", (0.03, 0.03, 0.03), 0.45),
    "gun": material("pistol_black", (0.05, 0.05, 0.055), 0.35, 0.8),
    "case": material("briefcase_black", (0.06, 0.055, 0.05), 0.45),
    "suit": material("suit_black", (0.12, 0.12, 0.125), 0.8),
    "skin_shadow": material("skin_shadow", (0.24, 0.225, 0.215), 0.8),
    "metal": material("metal_grey", (0.55, 0.55, 0.56), 0.3, 0.9),
}

parts = []  # (object, allowed bones or None, rigid bone or None)


def part(ob, allowed=None, rigid=None):
    parts.append((ob, allowed, rigid))
    return ob


# ---------------- skeleton landmarks ----------------
L = {}
for s, sx in (("L", 1), ("R", -1)):
    out = 15 if s == "L" else 13          # left arm carries the case: a little wider
    sh = Vector((sx * SH_X, 0.0, SH_Z))
    el = sh + Vector((sx * math.sin(out * D2R), 0.02, -math.cos(out * D2R))) * 0.32
    fwd = 12 if s == "L" else 22         # right forearm a bit forward (pistol)
    wr = el + Vector((sx * 0.05, -math.sin(fwd * D2R), -math.cos(fwd * D2R))).normalized() * 0.27
    hd = wr + Vector((sx * 0.01, -0.02, -0.17))
    L[s] = dict(sh=sh, el=el, wr=wr, hd=hd,
                hip=Vector((sx * HIP_X, 0, HIP_Z)), knee=Vector((sx * 0.10, -0.015, KNEE_Z)),
                ank=Vector((sx * 0.105, 0.0, ANKLE_Z)), toe=Vector((sx * 0.115, -0.16, 0.02)))

bones = [
    ("hips", (0, 0, HIP_Z), (0, 0, 1.05), None, False),
    ("spine", (0, 0, 1.05), (0, 0, 1.24), "hips", True),
    ("chest", (0, 0, 1.24), (0, 0, SH_Z + 0.02), "spine", True),
    ("neck", (0, 0, SH_Z + 0.03), (0, -0.01, HEAD_C - 0.09), "chest", False),
    ("head", (0, -0.01, HEAD_C - 0.09), (0, -0.01, HEIGHT + 0.02), "neck", True),
]
for s in ("L", "R"):
    d = L[s]
    sx = 1 if s == "L" else -1
    bones += [
        ("shoulder." + s, (sx * 0.03, -0.01, SH_Z - 0.01), tuple(d["sh"]), "chest", False),
        ("upperarm." + s, tuple(d["sh"]), tuple(d["el"]), "shoulder." + s, True),
        ("forearm." + s, tuple(d["el"]), tuple(d["wr"]), "upperarm." + s, True),
        ("hand." + s, tuple(d["wr"]), tuple(d["hd"]), "forearm." + s, True),
        ("thigh." + s, tuple(d["hip"]), tuple(d["knee"]), "hips", False),
        ("shin." + s, tuple(d["knee"]), tuple(d["ank"]), "thigh." + s, True),
        ("foot." + s, tuple(d["ank"]), tuple(d["toe"]), "shin." + s, True),
    ]
arm = make_armature("SpyRig", bones)
TORSO = ["hips", "spine", "chest", "neck", "shoulder.L", "shoulder.R"]

# ---------------- coat (open-front loft, double sided) ----------------
# (z, rx, ry, front gap deg, y offset)
coat_rings = [
    (COAT_HEM, 0.285 * FLARE, 0.235 * FLARE, 64, 0.02),
    (0.60, 0.268 * FLARE, 0.215 * FLARE, 50, 0.015),
    (0.76, 0.245, 0.19, 34, 0.01),
    (0.94, 0.215, 0.16, 16, 0.0),
    (1.09, 0.184, 0.14, 6, 0.0),
    (1.20, 0.198, 0.146, 12, 0.0),
    (1.31, 0.226, 0.152, 34, 0.0),
    (1.40, 0.240, 0.150, 50, 0.0),
    (SH_Z - 0.03, 0.248, 0.142, 60, 0.004),
    (SH_Z + 0.015, 0.228, 0.128, 66, 0.008),
    (SH_Z + 0.05, 0.168, 0.108, 74, 0.01),
    (SH_Z + 0.08, 0.098, 0.086, 92, 0.012),
]
BELT_I = 4
N = 30


def coat_pt(z, rx, ry, gap, yo, theta):
    return Vector((rx * math.sin(theta), -ry * math.cos(theta) + yo, z))


def coat_ring(r, scale=1.0, n=N, a0=None, a1=None):
    z, rx, ry, gap, yo = r
    g = gap * D2R / 2
    lo = g if a0 is None else a0
    hi = 2 * math.pi - g if a1 is None else a1
    return [coat_pt(z, rx * scale, ry * scale, gap, yo, lo + (hi - lo) * j / (n - 1)) for j in range(n)]


coat = loft("coat", [coat_ring(r) for r in coat_rings], closed=False, mat=M["coat"])
apply_solidify(coat, 0.012, offset=1.0)
part(coat, TORSO + ["thigh.L", "thigh.R"])

# belt
belt_r = [(1.065, 0.19, 0.143, 4, 0.0), (1.115, 0.19, 0.142, 6, 0.0)]
belt = loft("belt", [coat_ring(r, 1.04) for r in belt_r], closed=False, mat=M["coat_dark"])
part(belt, TORSO)
part(box("buckle", (0.035, -0.158, 1.09), (0.05, 0.012, 0.05), M["metal"]), TORSO)
# belt tail hanging from the buckle
part(box("belt_tail", (0.07, -0.156, 1.02), (0.04, 0.008, 0.12), M["coat_dark"], (0, 0.15, 0)), TORSO)

# lapels: wide notch lapels folded out from the V edge (Big Sleep frame 00706 / 01129)
for side in (1, -1):
    rows = []
    for (zi, w) in ((4, 0), (5, 16), (6, 30), (7, 38), (8, 34), (9, 14), (10, 8)):
        r = coat_rings[zi]
        g = r[3] * D2R / 2
        a_in = g if side == 1 else 2 * math.pi - g
        a_out = a_in + side * w * D2R
        p_in = coat_pt(r[0], r[1] * 1.035, r[2] * 1.07, r[3], r[4], a_in)
        p_out = coat_pt(r[0] - w * 0.0004, r[1] * 1.03, r[2] * 1.075, r[3], r[4], a_out)
        rows.append([p_in, p_out])
    lap = loft("lapel_" + str(side), rows, closed=False, mat=M["coat_dark"])
    apply_solidify(lap, 0.006)
    part(lap, TORSO)
# double-breasted buttons on the wearer's left panel + epaulettes
for (z, a) in ((1.17, 22), (1.17, 52), (1.27, 30), (1.27, 62)):
    r = coat_rings[5]
    p = coat_pt(z, r[1] * 1.04, r[2] * 1.1, r[3], r[4], a * D2R)
    part(box("button", p, (0.022, 0.01, 0.022), M["suit"]), TORSO)
for sx in (1, -1):
    part(box("epaulette", (sx * 0.17, 0.0, SH_Z + 0.03), (0.13, 0.05, 0.012), M["coat_dark"], (0, sx * 24 * D2R, 0)), ["chest", "shoulder." + ("L" if sx > 0 else "R")])

# turned-up collar
collar_r = [(SH_Z + 0.03, 0.135, 0.105, 70, 0.012), (SH_Z + 0.09, 0.105, 0.097, 64, 0.01), (SH_Z + 0.15, 0.118, 0.11, 58, 0.0)]
col = loft("collar", [coat_ring(r, 1.0, 22) for r in collar_r], closed=False, mat=M["coat_dark"])
apply_solidify(col, 0.01, offset=1.0)
part(col, ["chest"])

# ---------------- shirt + tie ----------------
# dark suit jacket under the trench (value: coat mid-grey > suit near-black > shirt white)
suit_rows = []
for r in coat_rings[3:11]:
    z, rx, ry, gap, yo = r
    suit_rows.append([coat_pt(z, rx * 0.95, ry * 0.95, gap, yo, a) for a in [(-70 + 140 * j / 8) * D2R for j in range(9)]])
part(loft("suit", suit_rows, closed=False, mat=M["suit"]), TORSO)
# white shirt V: narrow at the chest, widening to the collar
shirt_rows = []
for r, half in zip(coat_rings[6:11], (4, 12, 20, 26, 30)):
    z, rx, ry, gap, yo = r
    shirt_rows.append([coat_pt(z, rx * 0.955, ry * 0.96 + 0.002, gap, yo, a) for a in [(-half + 2 * half * j / 6) * D2R for j in range(7)]])
part(loft("shirt", shirt_rows, closed=False, mat=M["shirt"]), TORSO)
# shirt collar around the neck
sc = tube("shirt_collar", [(0, 0.005, SH_Z + 0.04), (0, 0.005, SH_Z + 0.09)], [(0.068, 0.066), (0.064, 0.062)], 14, up=(0, -1, 0), cap0=False, cap1=False, mat=M["shirt"])
part(sc, ["chest", "neck"])
# tie: knot + blade following the shirt front
tie_pts = []
for z in (SH_Z + 0.045, 1.42, 1.32, 1.22, 1.13):
    ry = None
    for a, b in zip(coat_rings, coat_rings[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            ry = (a[2] + (b[2] - a[2]) * t) * 0.96 + 0.002
    ry = ry or 0.07
    tie_pts.append((z, -ry - 0.005))
tie = tube("tie", [(0, y, z) for z, y in tie_pts], [(0.016, 0.004), (0.02, 0.004), (0.026, 0.004), (0.03, 0.004), (0.032, 0.004)], 6, up=(0, -1, 0), mat=M["tie"], smooth=False)
part(tie, TORSO)
part(box("tie_knot", (0, tie_pts[0][1] - 0.004, SH_Z + 0.055), (0.03, 0.02, 0.03), M["tie"]), TORSO)
# pocket square accent? no: red stays the tie and hat band only (H5).

# ---------------- neck + head ----------------
part(tube("neck", [(0, 0.005, SH_Z + 0.02), (0, -0.005, HEAD_C - 0.06)], [0.052, 0.05], 10, up=(0, -1, 0), cap0=False, cap1=False, mat=M["skin"]), ["chest", "neck", "head"])


def _g(v, c, w):
    return math.exp(-((v - c) / w) ** 2)


def head_shape(p):
    """Unit-sphere point -> sculpted head (front is -y): square jaw, brow ridge, sunken sockets, cheekbones."""
    x, y, z = p.x, p.y, p.z
    front = max(0.0, -y)
    if z < 0:
        k = -z
        x *= 1 - 0.18 * k - 0.12 * k * k
        if y < 0:
            y = y * (1 - 0.08 * k) - 0.10 * k * k
        else:
            y *= 1 - 0.45 * k
    if y > 0:
        y *= 0.94
    fz = min(1.0, max(0.0, (front - 0.55) / 0.3))
    y -= 0.075 * _g(z, 0.27, 0.08) * fz * (1 - 0.6 * min(1, abs(x) / 0.6))       # brow ridge
    y += 0.10 * _g(abs(x), 0.34, 0.15) * _g(z, 0.09, 0.09) * fz                   # eye sockets
    x += math.copysign(0.05, x) * _g(z, -0.08, 0.12) * _g(front, 0.6, 0.25)     # cheekbones
    return Vector((x, y, z))


HEAD_R = (0.079, 0.099, H / 2)
head = sphere("head", (0, -0.012, HEAD_C), HEAD_R, 18, 14, M["skin"], head_shape)
head.data.materials.append(M["skin_shadow"])
for poly in head.data.polygons:
    c = poly.center
    nx, nz = c.x / HEAD_R[0], (c.z - HEAD_C) / HEAD_R[2]
    if c.y < -0.06 and 0.18 < abs(nx) < 0.58 and -0.02 < nz < 0.2:
        poly.material_index = 1
part(head, None, "head")


def front_y(zw):
    vs = [v.co for v in head.data.vertices if abs(v.co.x) < 0.012 and abs(v.co.z - zw) < 0.012]
    return min(v.y for v in vs) if vs else -0.1


part(tube("nose", [(0, front_y(HEAD_C + 0.02) + 0.004, HEAD_C + 0.022), (0, front_y(HEAD_C - 0.03) - 0.016, HEAD_C - 0.03)],
          [(0.008, 0.006), (0.016, 0.011)], 5, up=(0, 0, 1), mat=M["skin"], smooth=False), None, "head")
for sx in (1, -1):
    part(sphere("ear", (sx * 0.08, 0.004, HEAD_C - 0.005), (0.012, 0.024, 0.032), 6, 5, M["skin"]), None, "head")
part(box("mouth", (0, front_y(HEAD_C - 0.06) + 0.002, HEAD_C - 0.06), (0.038, 0.006, 0.005), M["skin_shadow"]), None, "head")


def hair_shape(p):
    return p


hair = sphere("hair", (0, -0.006, HEAD_C + 0.004), (0.081, 0.102, H / 2 + 0.006), 14, 10, M["hair"])
import bmesh as _bm
bm = _bm.new(); bm.from_mesh(hair.data)
kill = [v for v in bm.verts if (v.co.y - (-0.006)) / 0.102 < -0.45 or (v.co.z - HEAD_C) < -0.02]
_bm.ops.delete(bm, geom=kill, context="VERTS"); bm.to_mesh(hair.data); bm.free()
part(hair, None, "head")

# ---------------- hat (fedora: pinched crown, snap brim) ----------------
HAT_Z = HEAD_C + 0.052
hat_parts = []
crown_rings = []
for (zr, rx, ry) in ((0.0, 0.097, 0.115), (0.065, 0.094, 0.111), (0.112, 0.087, 0.103), (0.140, 0.07, 0.088)):
    ring = []
    for j in range(20):
        a = 2 * math.pi * j / 20
        x, y = rx * math.sin(a), -ry * math.cos(a)
        if zr > 0.08 and y < 0:  # front pinch
            x *= 1 - 0.38 * (-y / ry) * (zr / 0.140)
        ring.append(Vector((x, y, HAT_Z + zr)))
    crown_rings.append(ring)
crown = loft("crown", crown_rings, closed=True, mat=M["hat"])
# dented top: fan to a lowered centre vertex
me = crown.data
bm = _bm.new(); bm.from_mesh(me)
bm.verts.ensure_lookup_table()
top = [bm.verts[3 * 20 + j] for j in range(20)]
c = bm.verts.new((0, 0.01, HAT_Z + 0.118))
for j in range(20):
    bm.faces.new((top[j], top[(j + 1) % 20], c))
bm.to_mesh(me); bm.free()
for p in me.polygons:
    p.use_smooth = True
hat_parts.append(crown)
band = loft("band", [[Vector((v.x * 1.012, v.y * 1.012, HAT_Z + 0.004)) for v in crown_rings[0]],
                     [Vector((v.x * 1.010, v.y * 1.010, HAT_Z + 0.036)) for v in crown_rings[0]]], closed=True, mat=M["band"])
hat_parts.append(band)
brim_rows = []
for (rx, ry) in ((0.098, 0.116), (0.14, 0.158), (0.178, 0.192)):
    ring = []
    for j in range(20):
        a = 2 * math.pi * j / 20
        x, y = rx * math.sin(a), -ry * math.cos(a)
        t = (rx - 0.098) / 0.08
        front = max(0.0, -math.cos(a))
        lift = (0.024 * abs(math.sin(a)) + 0.034 * max(0.0, math.cos(a)) - 0.06 * front ** 2) * t * t
        ring.append(Vector((x, y, HAT_Z + lift)))
    brim_rows.append(ring)
brim = loft("brim", brim_rows, closed=True, mat=M["hat"])
apply_solidify(brim, 0.008, offset=0.0)
hat_parts.append(brim)
hat = join(hat_parts, "hat")
pivot = Vector((0, 0, HAT_Z))
transform(hat, Matrix.Translation(pivot) @ Euler((-9 * D2R, 3 * D2R, 0)).to_matrix().to_4x4() @ Matrix.Translation(-pivot))
part(hat, None, "head")

# ---------------- arms: sleeves, cuffs, gloves ----------------
for s in ("L", "R"):
    d = L[s]
    sx = 1 if s == "L" else -1
    sleeve_end = d["wr"] + (d["el"] - d["wr"]).normalized() * 0.035
    sl = tube("sleeve." + s, [d["sh"] + Vector((sx * 0.0, 0, -0.005)), d["sh"] + Vector((sx * 0.012, 0, -0.06)), d["el"], sleeve_end],
              [(0.072, 0.072), (0.07, 0.068), (0.06, 0.058), (0.056, 0.054)], 10, up=(0, -1, 0), cap0=True, cap1=False, mat=M["coat"])
    part(sl, ["chest", "shoulder." + s, "upperarm." + s, "forearm." + s])
    part(sphere("deltoid." + s, d["sh"] + Vector((sx * 0.004, 0.0, -0.012)), (0.074, 0.074, 0.07), 10, 7, M["coat"]), ["chest", "shoulder." + s, "upperarm." + s])
    # visible strap at the sleeve end (trench detail) and the white shirt cuff
    part(tube("strap." + s, [sleeve_end + (d["el"] - d["wr"]).normalized() * 0.05, sleeve_end + (d["el"] - d["wr"]).normalized() * 0.025],
              [0.06, 0.06], 10, up=(0, -1, 0), cap0=False, cap1=False, mat=M["coat_dark"]), ["forearm." + s])
    part(tube("cuff." + s, [sleeve_end + (d["el"] - d["wr"]).normalized() * 0.01, d["wr"] + (d["wr"] - d["el"]).normalized() * 0.012],
              [0.045, 0.043], 10, up=(0, -1, 0), cap0=False, cap1=True, mat=M["shirt"]), ["forearm." + s, "hand." + s])
    # glove: palm block + finger mass + thumb
    hand_dir = (d["hd"] - d["wr"]).normalized()
    palm_end = d["wr"] + hand_dir * 0.10
    part(tube("palm." + s, [d["wr"], d["wr"] + hand_dir * 0.03, palm_end], [(0.038, 0.028), (0.045, 0.024), (0.046, 0.022)], 8,
              up=(sx, 0, 0), mat=M["glove"]), ["hand." + s, "forearm." + s])
    if s == "R":
        # fist round the pistol grip
        part(tube("fist." + s, [palm_end, palm_end + hand_dir * 0.035 + Vector((0, -0.02, 0))], [(0.044, 0.03), (0.04, 0.03)], 8, up=(sx, 0, 0), mat=M["glove"]), None, "hand.R")
    else:
        # fingers curled round the case handle
        part(tube("fingers." + s, [palm_end, palm_end + hand_dir * 0.05 + Vector((0, 0, 0)), palm_end + hand_dir * 0.06 + Vector((-sx * 0.02, 0, 0.0))],
                  [(0.044, 0.02), (0.04, 0.02), (0.035, 0.018)], 8, up=(sx, 0, 0), mat=M["glove"]), None, "hand.L")
    th0 = d["wr"] + hand_dir * 0.035 + Vector((0, -0.03, 0))
    part(tube("thumb." + s, [th0, th0 + hand_dir * 0.045 + Vector((-sx * 0.012, -0.012, 0))], [0.013, 0.011], 6, up=(sx, 0, 0), mat=M["glove"]), None, "hand." + s)

# ---------------- pistol (right hand, held low) ----------------
dR = L["R"]
hd = (dR["hd"] - dR["wr"]).normalized()
grip_c = dR["wr"] + hd * 0.11 + Vector((0, -0.01, 0))
gun_parts = [
    box("grip", (0, 0, 0), (0.028, 0.032, 0.11), M["gun"], (-15 * D2R, 0, 0)),
    box("slide", (0, -0.085, 0.05), (0.026, 0.19, 0.034), M["gun"]),
    box("frame", (0, -0.06, 0.025), (0.024, 0.13, 0.02), M["gun"]),
    box("guard", (0, -0.035, 0.0), (0.008, 0.04, 0.025), M["gun"]),
]
gun = join(gun_parts, "pistol")
# point the barrel forward/down: gun local -Y forward; tilt nose down 55 deg
transform(gun, Matrix.Translation(grip_c) @ Euler((-30 * D2R, 0, -6 * D2R)).to_matrix().to_4x4())
part(gun, None, "hand.R")

# ---------------- briefcase (left hand) ----------------
dL = L["L"]
hdl = dL["wr"] + (dL["hd"] - dL["wr"]).normalized() * 0.115
case_parts = [
    box("case", (0, 0, -0.17), (0.08, 0.38, 0.27), M["case"]),
    box("lid_seam", (0, 0, -0.06), (0.088, 0.422, 0.012), M["coat_dark"]),
    box("handle_a", (0, -0.05, -0.022), (0.016, 0.014, 0.05), M["case"]),
    box("handle_b", (0, 0.05, -0.022), (0.016, 0.014, 0.05), M["case"]),
    box("handle_t", (0, 0, 0.0), (0.02, 0.12, 0.016), M["case"]),
    box("clasp_a", (0.045, -0.12, -0.065), (0.006, 0.03, 0.02), M["metal"]),
    box("clasp_b", (0.045, 0.12, -0.065), (0.006, 0.03, 0.02), M["metal"]),
]
case = join(case_parts, "briefcase")
transform(case, Matrix.Translation(hdl + Vector((0.01, 0, 0.0))) @ Euler((0, 0, -4 * D2R)).to_matrix().to_4x4())
part(case, None, "hand.L")

# ---------------- legs + shoes ----------------
part(tube("pelvis", [(0, 0.0, 0.80), (0, 0.0, 1.06)], [(0.165, 0.115), (0.175, 0.12)], 12, up=(0, -1, 0), mat=M["trouser"]), ["hips", "spine", "thigh.L", "thigh.R"])
for s in ("L", "R"):
    d = L[s]
    sx = 1 if s == "L" else -1
    leg = tube("leg." + s, [d["hip"] + Vector((sx * -0.005, 0, 0.04)), d["hip"].lerp(d["knee"], 0.5), d["knee"], d["knee"].lerp(d["ank"], 0.6), d["ank"] + Vector((0, 0, 0.015))],
               [0.088, 0.075, 0.066, 0.06, 0.058], 10, up=(0, -1, 0), cap0=True, cap1=True, mat=M["trouser"])
    part(leg, ["hips", "thigh." + s, "shin." + s])
    a = d["ank"]
    rows = []
    for (dy, zc, rx, rz) in ((0.055, 0.055, 0.045, 0.05), (0.02, 0.06, 0.05, 0.058), (-0.06, 0.042, 0.05, 0.042), (-0.14, 0.032, 0.045, 0.032), (-0.19, 0.026, 0.03, 0.024)):
        c = Vector((a.x + sx * 0.003, a.y + dy, 0))
        rows.append([Vector((c.x + rx * math.cos(2 * math.pi * j / 10), c.y, max(0.0, zc + rz * math.sin(2 * math.pi * j / 10)))) for j in range(10)])
    shoe = loft("shoe." + s, rows, closed=True, cap0=True, cap1=True, mat=M["shoe"])
    part(shoe, ["foot." + s, "shin." + s])

# ---------------- weights + join ----------------
report = []
for ob, allowed, rigid in parts:
    st = auto_weight(ob, arm, allowed or [], rigid=rigid)
    report.append("%s: %s" % (ob.name, st))
spy = join([p[0] for p in parts], "Spy")
mod = spy.modifiers.new("Armature", "ARMATURE")
mod.object = arm
spy.parent = arm
print("WEIGHTS\n" + "\n".join(report))
print("TRIS", tri_count(spy))

# ---------------- actions ----------------
# idle: breathing, 4 s loop
idle = new_action(arm, "idle")
for f, k in ((1, 0.0), (61, 1.0), (121, 0.0)):
    key(arm, f, {
        "spine": (-0.6 * k, 0, 0), "chest": (-1.8 * k, 0, 0),
        "shoulder.L": (0, 1.2 * k, 0), "shoulder.R": (0, -1.2 * k, 0),
        "neck": (1.2 * k, 0, 0), "head": (0.6 * k, 0, 0),
        "upperarm.L": (0, 0, 0), "upperarm.R": (-2 * k, 0, 0),
    })
push_nla(arm, idle)

# walk: 1 s cycle (30 frames), in place
walk = new_action(arm, "walk")
cyc = 30
for i in range(0, cyc + 1, 3):
    ph = 2 * math.pi * i / cyc
    sw = math.sin(ph)
    lk = max(0.0, math.sin(ph + math.pi / 2)) if False else 0
    kneeL = 32 * max(0.0, -math.sin(ph - 0.6)) + 6
    kneeR = 32 * max(0.0, math.sin(ph - 0.6)) + 6
    bob = 0.025 * abs(math.cos(ph))
    key(arm, 1 + i, {
        "thigh.L": (-22 * sw, 0, 0), "thigh.R": (22 * sw, 0, 0),
        "shin.L": (kneeL, 0, 0), "shin.R": (kneeR, 0, 0),
        "foot.L": (-8 * sw - 0.3 * kneeL, 0, 0), "foot.R": (8 * sw - 0.3 * kneeR, 0, 0),
        "hips": (0, 0, 5 * sw), "spine": (-3, 0, -3 * sw), "chest": (-2, 0, -4 * sw),
        "neck": (2, 0, 4 * sw), "head": (2, 0, 2 * sw),
        "upperarm.L": (8 * sw, 0, 0), "upperarm.R": (-14 * sw, 0, 0),
        "forearm.L": (0, 0, 0), "forearm.R": (-8 - 6 * max(0, -sw), 0, 0),
    }, {"hips": (0, 0, -bob)})
push_nla(arm, walk)

# title: slow turn of the head toward camera (5 s); starts looking away over his left shoulder, chin down
title = new_action(arm, "title")
for f, k in ((1, 0.0), (20, 0.0), (110, 1.0), (150, 1.0)):
    e = k * k * (3 - 2 * k)  # smoothstep
    key(arm, f, {
        "chest": (0, 0, 10 * (1 - e)), "neck": (6 * (1 - e) - 1.5 * e, 0, 18 * (1 - e)),
        "head": (10 * (1 - e) - 2 * e, 0, 32 * (1 - e)),
        "upperarm.R": (-4, 0, 0),
    })
push_nla(arm, title)
scene.frame_start, scene.frame_end = 1, 150

# ---------------- export ----------------
select_only([arm, spy], arm)
glb = os.path.join(OUT, "spy.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_yup=True,
                          export_animations=True, export_animation_mode="ACTIONS", export_apply=False,
                          export_skins=True, export_morph=False)
print("EXPORTED", glb, os.path.getsize(glb))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "spy.blend"))

# ---------------- previews ----------------
if "--no-render" not in ARGS:
    import render_util
    importlib.reload(render_util)
    render_util.render_character(scene, arm, spy, {"idle": idle, "walk": walk, "title": title}, PREV, H)
