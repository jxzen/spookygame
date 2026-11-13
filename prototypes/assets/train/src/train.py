# Generic bullet train: lead car (long nose) + 2 middle cars + tail car.
# Blender coords: +Y = train forward (-Z in three.js), +Z up, rail top at z=0, track centre x=0.
# Left side (platform side) = -X. Every car node's origin is its front end on the track centre.
import math
import bmesh, bpy
from mathutils import Vector
from lib import *

# Half cross-section (x, z) from bottom centre to roof centre. Extra vertices sit at the stripe,
# window and door edges so faces can carry those materials or be cut out.
PROF_R = [(0, 0.32), (0.9, 0.32), (1.45, 0.36), (1.62, 0.52), (1.68, 0.8), (1.68, 1.3),
          (1.68, 1.70), (1.68, 1.92), (1.68, 2.1), (1.68, 2.75), (1.68, 3.1), (1.6, 3.32),
          (1.42, 3.5), (1.05, 3.62), (0.55, 3.67), (0, 3.68)]
RING = PROF_R + [(-x, z) for x, z in reversed(PROF_R[1:-1])]
N = len(RING)
Z0, Z1 = 0.32, 3.68
HALF_W = 1.68
FLOOR = 1.3
WIN = (2.1, 2.75)
STRIPE = (1.70, 1.92)
DOOR_Z = (1.3, 3.1)
DOOR_W = 1.0
NOSE_L = 10.5
CAR_GAP = 0.3

# material slots for car bodies
M_BODY, M_SKIRT, M_STRIPE, M_GLASS, M_LAMP, M_UNDER = range(6)


def nose_shape(t):
    """Return (bottom z, top z, x scale) of the nose cross-section at t (0 root .. 1 tip)."""
    g = lambda s: 1.0 / (1.0 + math.exp((s - 0.3) / 0.09))
    f = (g(t) - g(1)) / (g(0) - g(1))
    h = 1.42 + 1.45 * f + 0.81 * (1 - t)
    b = 0.32 + 0.18 * t * t
    sx = 1 - 0.3 * t * t
    if t > 0.85:
        u = min(1.0, (t - 0.85) / 0.15)
        r = math.sqrt(max(0.0, 1 - u * u))
        c = (b + h) / 2
        b, h, sx = c - (c - b) * r, c + (h - c) * r, sx * r
    return b, h, sx


def ring_pts(y, t):
    if t <= 0:
        return [Vector((x, y, z)) for x, z in RING]
    b, h, sx = nose_shape(t)
    return [Vector((x * sx, y, b + (z - Z0) / (Z1 - Z0) * (h - b))) for x, z in RING]


NOSE_T = [i / 26 * 0.86 for i in range(27)] + [0.9, 0.93, 0.955, 0.975, 0.988, 0.996, 0.9995]
NOSE_T = sorted(set([round(t, 4) for t in NOSE_T] + [0.1, 0.27, 0.66, 0.76]))


def seg_class(k):
    (xa, za), (xb, zb) = RING[k], RING[(k + 1) % N]
    zs = {round(za, 2), round(zb, 2)}
    if za == Z0 and zb == Z0:
        return 'under'
    if max(za, zb) <= 0.8 + 1e-6:
        return 'skirt'
    side = 'L' if (xa + xb) < 0 else 'R'
    if zs == {1.7, 1.92}:
        return 'stripe_' + side
    if zs == {2.1, 2.75}:
        return 'win_' + side
    if abs(xa) == HALF_W and abs(xb) == HALF_W and min(za, zb) >= DOOR_Z[0] and max(za, zb) <= DOOR_Z[1]:
        return 'door_' + side
    if min(za, zb) >= 3.32 - 1e-6:
        return 'top'
    if zs == {1.92, 2.1}:
        return 'lampband_' + side
    return 'body'


def car_layout(kind, length):
    """Door centres and window ranges in car-local y (front = 0, back = -length)."""
    front_root = -NOSE_L if kind == 'lead' else 0.0
    back_root = -length + NOSE_L if kind == 'tail' else -length
    if kind == 'lead':
        doors = [front_root - 1.5, back_root + 1.6]
    elif kind == 'tail':
        doors = [front_root - 1.6, back_root - 1.5 + 0.0 + 3.0 - 3.0]  # placeholder fixed below
        doors = [front_root - 1.6, back_root + 1.5]
    else:
        doors = [front_root - 1.6, back_root + 1.6]
    w0 = doors[0] - DOOR_W / 2 - 1.1   # first window centre limit
    w1 = doors[1] + DOOR_W / 2 + 1.1
    pitch = 1.04
    n = int((w0 - w1) / pitch) + 1
    mid = (w0 + w1) / 2
    first = mid + (n - 1) * pitch / 2
    wins = [first - i * pitch for i in range(n)]
    return front_root, back_root, doors, wins


def build_body(name, kind, length, interior, mats, parent, coll, inner_mat=None):
    front_root, back_root, doors, wins = car_layout(kind, length)
    ww = 0.6
    win_ranges = [(c - ww / 2, c + ww / 2) for c in wins]
    door_ranges = [(c - DOOR_W / 2, c + DOOR_W / 2) for c in doors]
    st = {}
    def add(y, t, nose):
        key = round(y, 4)
        if key not in st or t > st[key][0]:
            st[key] = (t, nose)
    if kind == 'lead':
        for t in NOSE_T:
            add(front_root + NOSE_L * t, t, 'F')
    else:
        add(0.0, 0.0, None)
    if kind == 'tail':
        for t in NOSE_T:
            add(back_root - NOSE_L * t, t, 'B')
    else:
        add(-length, 0.0, None)
    add(front_root, 0.0, None)
    add(back_root, 0.0, None)
    for a, b in win_ranges + door_ranges:
        add(a, 0.0, None)
        add(b, 0.0, None)
    stations = sorted(st.items(), key=lambda kv: -kv[0])  # front to back
    bm = bmesh.new()
    rings, ts = [], []
    for y, (t, nose) in stations:
        rings.append([bm.verts.new(p) for p in ring_pts(y, t)])
        ts.append(t)
    ys = [s[0] for s in stations]

    def cls_face(f, k, yc, tc):
        c = seg_class(k)
        mi = M_BODY
        if c == 'under':
            mi = M_UNDER
        elif c == 'skirt':
            mi = M_SKIRT
        elif c.startswith('stripe'):
            mi = M_STRIPE
        if tc <= 0:
            if c.startswith('win') and any(a <= yc <= b for a, b in win_ranges):
                mi = M_GLASS
        else:
            if c == 'top' and 0.1 <= tc <= 0.27:
                mi = M_GLASS
            if (c.startswith('win') or c.startswith('lampband')) and 0.66 <= tc <= 0.76:
                mi = M_LAMP
        f.material_index = mi
        return c

    cut = []
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        yc = (ys[i] + ys[i + 1]) / 2
        tc = (ts[i] + ts[i + 1]) / 2
        for k in range(N):
            k2 = (k + 1) % N
            f = bm.faces.new((A[k], B[k], B[k2], A[k2]))
            c = cls_face(f, k, yc, tc)
            if interior and tc <= 0:
                if c.startswith('win') and any(a <= yc <= b for a, b in win_ranges):
                    cut.append(f)
                elif c.startswith('door') and any(a <= yc <= b for a, b in door_ranges):
                    cut.append(f)
    # ends: nose tip fan or flat cap (end wall)
    for idx, end in ((0, 'front'), (len(rings) - 1, 'back')):
        R = rings[idx]
        if ts[idx] > 0.9:
            b, h, sx = nose_shape(1.0)
            tipy = ys[idx] + (0.004 if end == 'front' else -0.004)
            tip = bm.verts.new((0, tipy, (b + h) / 2))
            for k in range(N):
                f = bm.faces.new((R[k], R[(k + 1) % N], tip))
                f.material_index = M_BODY if seg_class(k) not in ('under', 'skirt') else M_SKIRT
        else:
            f = bm.faces.new(R)
            f.material_index = M_UNDER
    # outward normals: compare each face normal with the vector from the ring axis
    bm.normal_update()
    for f in bm.faces:
        c = f.calc_center_median()
        if len(f.verts) > 4:
            want = Vector((0, 1 if c.y > -length / 2 else -1, 0))
        else:
            want = c - Vector((0, c.y, 2.0 if c.z > 0 else 0))
            if any(v.co.y > ys[0] - 1e-3 for v in f.verts) and ts[0] > 0.9 and len(f.verts) == 3:
                want = Vector((0, 1, 0)) + want * 0.2
            if ts[-1] > 0.9 and len(f.verts) == 3 and any(v.co.y < ys[-1] + 1e-3 for v in f.verts):
                want = Vector((0, -1, 0)) + want * 0.2
            # nose sections are low: use the local section centre
            ring_c_z = None
        if f.normal.dot(want) < 0:
            f.normal_flip()
    # finer pass for nose quads: centre of the local section
    for f in bm.faces:
        if len(f.verts) != 4:
            continue
        c = f.calc_center_median()
        zs = [v.co.z for v in f.verts]
        # section centre ~ average of that section's ring: approximate with nose_shape via y
        t = None
        if kind == 'lead' and c.y > front_root:
            t = (c.y - front_root) / NOSE_L
        if kind == 'tail' and c.y < back_root:
            t = (back_root - c.y) / NOSE_L
        if t is None:
            continue
        b, h, sx = nose_shape(min(t, 0.999))
        want = c - Vector((0, c.y, (b + h) / 2))
        if f.normal.dot(want) < 0:
            f.normal_flip()
    if cut:
        bmesh.ops.delete(bm, geom=cut, context='FACES')
    ob = obj_from_bm(name + '_body', bm, mats, parent=parent, coll=coll, smooth=True)
    if interior:
        mod = ob.modifiers.new('shell', 'SOLIDIFY')
        mod.thickness = 0.05
        mod.offset = -1
        mod.use_rim = True
        mod.material_offset_rim = len(mats)
        mod.material_offset = len(mats)
        for _ in mats:
            ob.data.materials.append(inner_mat)
        bpy.context.view_layer.update()
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = bpy.data.meshes.new_from_object(ev)
        ob.modifiers.clear()
        ob.data = me
    # sharp edges above 40 deg so window reveals / door holes / caps do not smear the smooth shading
    bm2 = bmesh.new()
    bm2.from_mesh(ob.data)
    for e in bm2.edges:
        if len(e.link_faces) != 2 or e.calc_face_angle(0) > math.radians(40):
            e.smooth = False
    bm2.to_mesh(ob.data)
    bm2.free()
    return ob, doors, wins


def build_doors(car_name, doors, length, car_ob, mats, coll, counter):
    out = []
    for i, yc in enumerate(doors):
        toward_centre = -1 if yc > -length / 2 else 1   # slide into the panel toward car centre
        for side in ('L', 'R'):
            sgn = -1 if side == 'L' else 1
            counter[side] += 1
            name = 'door_%s_%d' % (side, counter[side])
            bm = bmesh.new()
            add_box(bm, (0, 0, 0), (0.024, DOOR_W, DOOR_Z[1] - DOOR_Z[0]), 0)
            # small dark door window on the outer face
            xo = sgn * 0.0125
            add_quad(bm, [(xo, -0.15, 0.35), (xo, 0.15, 0.35), (xo, 0.15, 0.75), (xo, -0.15, 0.75)][::(1 if sgn > 0 else -1)], 1)
            zc = (DOOR_Z[0] + DOOR_Z[1]) / 2
            ob = obj_from_bm(name, bm, mats, parent=car_ob, coll=coll,
                             location=(sgn * (HALF_W + 0.014), yc, zc))
            out.append(dict(node=name, car=car_name, side=side, local=(sgn * (HALF_W + 0.014), yc, zc),
                            slide=(sgn * 0.05, toward_centre * (DOOR_W + 0.05), 0)))
    return out


def build_under(name, kind, length, mats, parent, coll, pantograph=False, gangway=True):
    bm = bmesh.new()
    for yb in (-2.6 - (NOSE_L - 4.0 if kind == 'lead' else 0), -length + 2.6 + (NOSE_L - 4.0 if kind == 'tail' else 0)):
        add_box(bm, (0, yb, 0.62), (2.3, 3.2, 0.32), 0)
        for xw in (-0.72, 0.72):
            for dy in (-1.25, 1.25):
                add_cyl(bm, (xw, yb + dy, 0.43), 0.43, 0.14, 'X', 8, 1)
    if gangway and kind != 'tail':
        add_box(bm, (0, -length - CAR_GAP / 2, 2.25), (2.5, CAR_GAP + 0.2, 2.1), 0)
    if pantograph:
        y = -length / 2
        add_box(bm, (0, y, 3.72), (1.2, 1.4, 0.1), 0)
        add_box(bm, (0, y - 0.35, 4.05), (0.08, 0.06, 0.8), 0, rot_x=0.9)
        add_box(bm, (0, y + 0.25, 4.25), (0.08, 0.06, 0.9), 0, rot_x=-0.7)
        add_box(bm, (0, y - 0.05, 4.48), (1.9, 0.08, 0.05), 1)
    return obj_from_bm(name + '_under', bm, mats, parent=parent, coll=coll)


def build_interior(name, length, doors, wins, mats, parent, coll):
    """Saloon of one car: floor, ceiling, light strips, racks, partitions, 2+3 seats, glass."""
    MI_FLOOR, MI_WALL, MI_SEAT, MI_COVER, MI_LIGHT, MI_DARK, MI_CEIL = range(7)
    bm = bmesh.new()
    xi = HALF_W - 0.06
    add_box_mm(bm, -xi, xi, -length + 0.06, -0.06, FLOOR - 0.08, FLOOR, MI_FLOOR)
    p_front = doors[0] - DOOR_W / 2 - 0.6
    p_back = doors[1] + DOOR_W / 2 + 0.6
    # partitions with a central doorway (aisle at x = -0.38)
    ax0, ax1 = -0.8, 0.05
    for py in (p_front, p_back):
        add_box_mm(bm, -xi, ax0, py - 0.05, py + 0.05, FLOOR, 3.25, MI_WALL)
        add_box_mm(bm, ax1, xi, py - 0.05, py + 0.05, FLOOR, 3.25, MI_WALL)
        add_box_mm(bm, ax0, ax1, py - 0.05, py + 0.05, FLOOR + 2.0, 3.25, MI_WALL)
        add_box_mm(bm, ax0 + 0.6, ax1 + 0.1, py - 0.03, py + 0.03, FLOOR + 0.02, FLOOR + 2.0, MI_DARK)  # door leaf, slid half open
    # ceiling panel + light strips + luggage racks
    add_box_mm(bm, -1.25, 1.25, p_back, p_front, 3.22, 3.26, MI_CEIL)
    for xs in (-0.55, 0.55):
        add_box_mm(bm, xs - 0.09, xs + 0.09, p_back + 0.3, p_front - 0.3, 3.19, 3.22, MI_LIGHT)
    for sgn in (-1, 1):
        add_box_mm(bm, sgn * 1.2, sgn * xi, p_back, p_front, 2.86, 2.9, MI_WALL)
        add_box_mm(bm, sgn * 1.2, sgn * 1.24, p_back, p_front, 2.9, 2.98, MI_WALL)
        # lower wall lining (warm grey) below the windows
        add_box_mm(bm, sgn * (xi - 0.03), sgn * xi, p_back, p_front, FLOOR, 2.0, MI_WALL)
    # seats: 2 on the left (platform side), 3 on the right, facing forward (+Y)
    blocks = [(-1.52, -0.8, 2), (0.05, 1.55, 3)]
    rows = [w + 0.15 for w in wins]
    for y0 in rows:
        for x0, x1, nseat in blocks:
            xc, w = (x0 + x1) / 2, x1 - x0
            add_box(bm, (xc, y0, FLOOR + 0.44), (w, 0.5, 0.12), MI_SEAT)
            add_box(bm, (xc, y0 - 0.02, FLOOR + 0.2), (w * 0.7, 0.3, 0.38), MI_DARK)
            add_box(bm, (xc, y0 - 0.3, FLOOR + 0.86), (w, 0.1, 0.78), MI_SEAT, rot_x=0.2)
            sw = w / nseat
            for s in range(nseat):
                xs = x0 + sw * (s + 0.5)
                add_box(bm, (xs, y0 - 0.33, FLOOR + 1.15), (sw * 0.78, 0.04, 0.22), MI_COVER, rot_x=0.2)
            for s in range(nseat + 1):
                xa = x0 + sw * s
                add_box(bm, (xa, y0 - 0.05, FLOOR + 0.66), (0.05, 0.45, 0.05), MI_DARK)
    ob = obj_from_bm(name + '_interior', bm, mats, parent=parent, coll=coll)
    # glass
    gbm = bmesh.new()
    for w in wins:
        for sgn in (-1, 1):
            x = sgn * (HALF_W - 0.02)
            pts = [(x, w - 0.3, WIN[0]), (x, w + 0.3, WIN[0]), (x, w + 0.3, WIN[1]), (x, w - 0.3, WIN[1])]
            add_quad(gbm, pts if sgn > 0 else pts[::-1], 0)
    for d in doors:  # door windows are part of the door; nothing to add
        pass
    glass = obj_from_bm(name + '_glass', gbm, [mats[-1]], parent=parent, coll=coll)
    return ob, glass, rows, (p_front, p_back)
