# Shared low-poly modelling, weighting and animation helpers for the spy assets.
# Runs inside headless Blender 5.3 (bpy). Blender convention: Z up, character faces -Y.
import bpy, bmesh, math
from mathutils import Vector, Matrix, Quaternion, Euler

D2R = math.pi / 180.0


def srgb(c):
    """sRGB 0..1 -> linear."""
    return tuple(((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c)


def material(name, rgb, rough=0.8, metal=0.0, double=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    lin = srgb(rgb)
    bsdf.inputs["Base Color"].default_value = (lin[0], lin[1], lin[2], 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    m.diffuse_color = (lin[0], lin[1], lin[2], 1.0)
    m.use_backface_culling = not double
    return m


def mesh_obj(name, verts, faces, mat=None, smooth=True, coll=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    return ob


def loft(name, rings, closed=True, cap0=False, cap1=False, mat=None, smooth=True):
    """rings: list of equal-length lists of Vector. Connect ring i to i+1."""
    n = len(rings[0])
    verts = [v for r in rings for v in r]
    faces = []
    seg = n if closed else n - 1
    for i in range(len(rings) - 1):
        a, b = i * n, (i + 1) * n
        for j in range(seg):
            k = (j + 1) % n
            faces.append((a + j, a + k, b + k, b + j))
    if cap0:
        faces.append(tuple(reversed(range(0, n))))
    if cap1:
        last = (len(rings) - 1) * n
        faces.append(tuple(range(last, last + n)))
    return mesh_obj(name, verts, faces, mat, smooth)


def ellipse_ring(c, a, b, n, side, nrm, start=0.0, end=2 * math.pi, closed=True):
    out = []
    cnt = n
    for j in range(cnt):
        t = j / cnt if closed else j / (cnt - 1)
        phi = start + (end - start) * t
        out.append(c + side * (a * math.cos(phi)) + nrm * (b * math.sin(phi)))
    return out


def tube(name, pts, rads, n=10, up=(0, -1, 0), cap0=True, cap1=True, mat=None, smooth=True, twist=0.0):
    """Tube along polyline pts; rads float or (a,b) per point. a along side axis, b along normal axis."""
    pts = [Vector(p) for p in pts]
    upv = Vector(up).normalized()
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == len(pts) - 1:
            t = pts[-1] - pts[-2]
        else:
            t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        t.normalize()
        side = upv.cross(t)
        if side.length < 1e-4:
            side = Vector((1, 0, 0)).cross(t)
        side.normalize()
        nrm = t.cross(side).normalized()
        r = rads[i]
        a, b = (r, r) if isinstance(r, (int, float)) else r
        rings.append(ellipse_ring(p, a, b, n, side, nrm, start=twist, end=twist + 2 * math.pi))
    return loft(name, rings, True, cap0, cap1, mat, smooth)


def box(name, center, size, mat=None, rot=(0, 0, 0)):
    sx, sy, sz = (s / 2 for s in size)
    vs = [Vector((x, y, z)) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    R = Euler(rot).to_matrix()
    c = Vector(center)
    vs = [c + R @ v for v in vs]
    # index = xi*4 + yi*2 + zi
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return mesh_obj(name, vs, faces, mat, smooth=False)


def sphere(name, center, radii, u=12, v=8, mat=None, fn=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    for vert in bm.verts:
        p = vert.co.copy()
        if fn:
            p = fn(p)
        vert.co = Vector((p.x * radii[0], p.y * radii[1], p.z * radii[2])) + Vector(center)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def apply_solidify(ob, thickness, offset=-1.0):
    mod = ob.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = offset
    apply_all(ob)


def apply_all(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)


def transform(ob, mat):
    ob.data.transform(mat)
    ob.data.update()


def select_only(objs, active):
    bpy.context.view_layer.update()
    for o in bpy.context.scene.objects:
        if o is not None:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def join(objs, name):
    select_only(objs, objs[0])
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ---------------- weighting ----------------

def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (a + ab * t - p).length


def auto_weight(part, arm, allowed, rigid=None, falloff=4.0):
    """Blender automatic (bone heat) weights, filtered to `allowed` bones; any vertex left
    without weight falls back to inverse-distance weights of the allowed bones.
    rigid: bone name -> weight 1 on every vertex (props, hat)."""
    if rigid:
        vg = part.vertex_groups.new(name=rigid)
        vg.add(list(range(len(part.data.vertices))), 1.0, "REPLACE")
        return "rigid"
    select_only([part, arm], arm)
    status = "heat"
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except Exception as e:
        status = "heat-failed:%s" % e
    # parent_set adds an armature modifier + parent; drop them, join() later re-adds once
    part.parent = None
    part.modifiers.clear()
    for vg in list(part.vertex_groups):
        if vg.name not in allowed:
            part.vertex_groups.remove(vg)
    groups = {vg.index: vg for vg in part.vertex_groups}
    for b in allowed:
        if b not in part.vertex_groups:
            part.vertex_groups.new(name=b)
    bones = {b: (arm.matrix_world @ arm.data.bones[b].head_local, arm.matrix_world @ arm.data.bones[b].tail_local) for b in allowed}
    fallback = 0
    for v in part.data.vertices:
        tot = sum(g.weight for g in v.groups if g.group in groups)
        if tot < 1e-3:
            fallback += 1
            p = part.matrix_world @ v.co
            ws = {b: 1.0 / max(seg_dist(p, *bones[b]), 0.01) ** falloff for b in allowed}
            s = sum(ws.values())
            for b, w in ws.items():
                if w / s > 0.02:
                    part.vertex_groups[b].add([v.index], w / s, "REPLACE")
        else:
            for g in v.groups:
                if g.group in groups:
                    g.weight = g.weight / tot
    return status + (" fallback=%d" % fallback if fallback else "")


# ---------------- armature + animation ----------------

def make_armature(name, bones):
    """bones: list of (name, head, tail, parent, connect)."""
    ad = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, ad)
    bpy.context.scene.collection.objects.link(arm)
    select_only([arm], arm)
    bpy.ops.object.mode_set(mode="EDIT")
    for (bn, h, t, par, con) in bones:
        eb = ad.edit_bones.new(bn)
        eb.head = Vector(h)
        eb.tail = Vector(t)
        eb.roll = 0.0
        if par:
            eb.parent = ad.edit_bones[par]
            eb.use_connect = con
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm


def world_rot(arm, bone, rx=0, ry=0, rz=0):
    """Rotation given as armature-space euler (deg) about the bone head -> local quaternion."""
    R = Euler((rx * D2R, ry * D2R, rz * D2R), "XYZ").to_matrix()
    B = arm.data.bones[bone].matrix_local.to_3x3()
    return (B.inverted() @ R @ B).to_quaternion()


def world_loc(arm, bone, v):
    B = arm.data.bones[bone].matrix_local.to_3x3()
    return B.inverted() @ Vector(v)


def new_action(arm, name):
    ad = arm.animation_data or arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad.action = act
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    return act


def key(arm, frame, rots=None, locs=None, all_bones=True):
    """rots: bone -> (rx,ry,rz) armature-space degrees; locs: bone -> world vector."""
    rots = rots or {}
    locs = locs or {}
    for pb in arm.pose.bones:
        if pb.name in rots:
            pb.rotation_quaternion = world_rot(arm, pb.name, *rots[pb.name])
        else:
            pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = world_loc(arm, pb.name, locs[pb.name]) if pb.name in locs else Vector()
        if all_bones or pb.name in rots:
            pb.keyframe_insert("rotation_quaternion", frame=frame)
        if all_bones or pb.name in locs:
            pb.keyframe_insert("location", frame=frame)


def push_nla(arm, act, start=1):
    ad = arm.animation_data
    tr = ad.nla_tracks.new()
    tr.name = act.name
    st = tr.strips.new(act.name, start, act)
    try:
        if act.slots:
            st.action_slot = act.slots[0]
    except Exception:
        pass
    tr.mute = True
    ad.action = None
    return tr


def use_action(arm, act):
    ad = arm.animation_data
    for t in ad.nla_tracks:
        t.mute = True
    ad.action = act
    try:
        if act.slots:
            ad.action_slot = act.slots[0]
    except Exception:
        pass


def set_engine(scene, prefs=("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH")):
    for e in prefs:
        try:
            scene.render.engine = e
            return e
        except TypeError:
            continue
