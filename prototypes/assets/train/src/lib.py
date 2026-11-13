# Shared helpers for the train/platform build (Blender 5.3, headless, factory startup).
import bpy, bmesh, math
from mathutils import Vector, Matrix


def mat(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0, coat=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    m.diffuse_color = (*color, alpha)
    return m


def tex_mat(name, img, emit_strength=1.5):
    """Material whose base colour and emission come from an image (signage)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = img
    nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tn.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = emit_strength
    bsdf.inputs['Roughness'].default_value = 0.4
    return m


def new_bm():
    return bmesh.new()


def add_box(bm, center, size, mi=0, rot_x=0.0, rot_z=0.0):
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret['verts']
    M = (Matrix.Translation(Vector(center)) @ Matrix.Rotation(rot_z, 4, 'Z') @
         Matrix.Rotation(rot_x, 4, 'X') @ Matrix.Diagonal((*size, 1)))
    bmesh.ops.transform(bm, matrix=M, verts=verts)
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = mi
    return verts


def add_box_mm(bm, x0, x1, y0, y1, z0, z1, mi=0):
    return add_box(bm, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                   (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)), mi)


def add_cyl(bm, center, radius, depth, axis='X', segs=8, mi=0):
    ret = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                                radius1=radius, radius2=radius, depth=depth)
    verts = ret['verts']
    R = Matrix.Identity(4)
    if axis == 'X':
        R = Matrix.Rotation(math.pi / 2, 4, 'Y')
    elif axis == 'Y':
        R = Matrix.Rotation(math.pi / 2, 4, 'X')
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ R, verts=verts)
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = mi
    return verts


def add_quad(bm, pts, mi=0):
    vs = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(vs)
    f.material_index = mi
    return f


def obj_from_bm(name, bm, mats, parent=None, coll=None, location=(0, 0, 0), smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    ob.location = location
    if parent:
        ob.parent = parent
    return ob


def empty(name, location=(0, 0, 0), parent=None, coll=None, size=0.2):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = size
    (coll or bpy.context.scene.collection).objects.link(ob)
    ob.location = location
    if parent:
        ob.parent = parent
    return ob


def tri_count(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for ob in objs:
        if ob.type != 'MESH':
            continue
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
        ev.to_mesh_clear()
    return total


def world_pos(ob):
    return ob.matrix_world.translation.copy()


def to_three(v):
    """Blender Z-up (x, y, z) -> three.js Y-up (x, z, -y), rounded."""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def export_glb(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_extras=True,
                              export_cameras=False, export_lights=False)
