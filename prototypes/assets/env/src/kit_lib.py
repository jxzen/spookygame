# ENV-01 town kit: helper library. Exec'd inside Blender (5.3).
# Conventions (Blender, Z-up, metres): a module's street front is the plane y=0,
# the module body extends into +Y, x is centred, z=0 is street level.
# glTF export converts to three.js +Y up: (x, y, z)_three = (x, z, -y)_blender,
# so in three.js the front faces +Z and the body sits at negative z.
import bpy, bmesh, math, random
import numpy as np
from mathutils import Vector, Matrix, Euler

ROOT = r"C:\Users\jxzen\Documents\test_claude\epic_megajam_game\proto1\prototypes\assets\env"
SCN = "ENV_town_kit"
TEX_N = 256


def scene():
    s = bpy.data.scenes.get(SCN)
    if s is None:
        s = bpy.data.scenes.new(SCN)
    return s


def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or scene().collection).children.link(c)
    return c


def wipe_coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        return
    for o in list(c.all_objects):
        d = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if d is not None and d.users == 0:
            if isinstance(d, bpy.types.Mesh):
                bpy.data.meshes.remove(d)
            elif isinstance(d, bpy.types.Light):
                bpy.data.lights.remove(d)
    for ch in list(c.children):
        wipe_coll(ch.name)
        bpy.data.collections.remove(ch)


# ---------------------------------------------------------------- textures
def fft_noise(n, beta=1.6, aniso=(1.0, 1.0), seed=0):
    """Tileable fractal noise in [0,1]. aniso=(1,8) stretches features vertically (rain streaks)."""
    rng = np.random.default_rng(seed)
    F = np.fft.fft2(rng.standard_normal((n, n)))
    fy = np.fft.fftfreq(n)[:, None] * aniso[1]
    fx = np.fft.fftfreq(n)[None, :] * aniso[0]
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1.0
    F = F / f ** beta
    F[0, 0] = 0
    r = np.real(np.fft.ifft2(F))
    return (r - r.min()) / (r.max() - r.min() + 1e-9)


def new_image(name, rgba, noncolor=False):
    n = rgba.shape[0]
    img = bpy.data.images.get(name)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, n, n, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    if noncolor:
        img.colorspace_settings.name = "Non-Color"
    img.pack()
    return img


def _sock(node, ident):
    for s in node.inputs:
        if s.identifier == ident:
            return s
    for s in node.inputs:
        if s.name == ident:
            return s
    raise KeyError(ident)


def _out(node, ident):
    for s in node.outputs:
        if s.identifier == ident or s.name == ident:
            return s
    raise KeyError(ident)


MATS = {}


def make_mat(name, base, rough=(0.5, 0.85), metal=0.0, var=0.3, streak=True, emit=None,
             emit_strength=1.0, seed=1, alpha_img=None, n=TEX_N):
    """PBR material with a generated grime albedo map and a wet-streak roughness map (glTF-exportable)."""
    if isinstance(base, (int, float)):
        base = (base, base, base)
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (500, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(_out(bsdf, "BSDF"), _sock(out, "Surface"))

    g = fft_noise(n, 1.7, seed=seed)
    s = fft_noise(n, 1.3, (1, 10), seed=seed + 7) if streak else fft_noise(n, 1.2, seed=seed + 7)
    m = np.clip(0.55 * g + 0.45 * s, 0, 1)
    shade = 1.0 - var * m
    rgba = np.ones((n, n, 4), np.float32)
    for i in range(3):
        rgba[..., i] = np.clip(base[i] * shade, 0, 1)
    if alpha_img is not None:
        rgba[..., 3] = alpha_img
    alb = new_image("T_" + name + "_albedo", rgba)
    w = fft_noise(n, 1.5, (1, 6) if streak else (1, 1), seed=seed + 13)
    w = np.clip((w - 0.35) * 1.8, 0, 1)  # wet patches -> low roughness
    rv = rough[0] + (rough[1] - rough[0]) * w
    orm = np.ones((n, n, 4), np.float32)
    orm[..., 1] = rv
    orm[..., 2] = metal
    ormi = new_image("T_" + name + "_orm", orm, noncolor=True)

    t1 = nt.nodes.new("ShaderNodeTexImage"); t1.image = alb; t1.location = (-500, 200)
    t2 = nt.nodes.new("ShaderNodeTexImage"); t2.image = ormi; t2.location = (-500, -200)
    sep = nt.nodes.new("ShaderNodeSeparateColor"); sep.location = (-200, -200)
    nt.links.new(_out(t1, "Color"), _sock(bsdf, "Base Color"))
    nt.links.new(_out(t2, "Color"), _sock(sep, "Color"))
    outs = list(sep.outputs)
    nt.links.new(outs[1], _sock(bsdf, "Roughness"))
    nt.links.new(outs[2], _sock(bsdf, "Metallic"))
    if alpha_img is not None:
        nt.links.new(_out(t1, "Alpha"), _sock(bsdf, "Alpha"))
        try:
            mat.surface_render_method = "BLENDED"
        except Exception:
            pass
        try:
            mat.blend_method = "BLEND"
        except Exception:
            pass
    if emit is not None:
        _sock(bsdf, "Emission Color").default_value = (*emit, 1.0)
        _sock(bsdf, "Emission Strength").default_value = emit_strength
    MATS[name] = mat
    return mat


def build_materials():
    # sRGB greys. Red is the only colour (danger / the way forward).
    RED = (0.55, 0.035, 0.03)
    make_mat("plaster", 0.42, (0.5, 0.9), var=0.35, seed=11)
    make_mat("concrete", 0.34, (0.45, 0.9), var=0.4, seed=21)
    make_mat("wood_dark", 0.12, (0.35, 0.8), var=0.35, seed=31)
    make_mat("wood_black", 0.05, (0.3, 0.7), var=0.3, seed=37)
    make_mat("roof_tile", 0.09, (0.12, 0.45), var=0.3, seed=41)
    make_mat("metal", 0.30, (0.25, 0.6), metal=0.6, var=0.35, seed=51)
    make_mat("metal_dark", 0.10, (0.3, 0.6), metal=0.5, var=0.3, seed=55)
    make_mat("glass", 0.02, (0.03, 0.18), var=0.2, streak=True, seed=61)
    make_mat("asphalt", 0.07, (0.04, 0.55), var=0.35, streak=False, seed=71)
    make_mat("floor_tile", 0.22, (0.35, 0.7), var=0.3, streak=False, seed=81)
    make_mat("cloth_black", 0.04, (0.8, 0.95), var=0.2, seed=91)
    make_mat("ink_white", 0.75, (0.6, 0.8), var=0.15, streak=False, seed=95)
    make_mat("sign_white", 0.62, (0.3, 0.7), var=0.4, seed=101)
    make_mat("stone", 0.30, (0.5, 0.95), var=0.45, streak=False, seed=111)
    make_mat("black", 0.02, (0.25, 0.6), var=0.1, streak=False, seed=121)
    make_mat("plastic_bag", 0.03, (0.08, 0.3), var=0.2, streak=False, seed=131)
    make_mat("cardboard", 0.28, (0.6, 0.95), var=0.4, streak=False, seed=135)
    make_mat("red_paint", RED, (0.25, 0.6), var=0.35, seed=141)
    make_mat("red_lantern", (0.62, 0.05, 0.04), (0.5, 0.7), var=0.2, streak=False,
             emit=(0.9, 0.08, 0.05), emit_strength=3.0, seed=151)
    make_mat("paper_glow", 0.82, (0.6, 0.8), var=0.15, streak=False,
             emit=(0.85, 0.85, 0.82), emit_strength=2.0, seed=161)
    make_mat("vend_glow", 0.8, (0.1, 0.2), var=0.1, streak=False,
             emit=(0.9, 0.9, 0.9), emit_strength=2.5, seed=171)
    # puddle decal: alpha blob, black mirror
    n = TEX_N
    a = fft_noise(n, 2.2, seed=181)
    yy, xx = np.mgrid[0:n, 0:n] / (n - 1) * 2 - 1
    r = np.sqrt(xx ** 2 + yy ** 2)
    blob = np.clip((1.0 - r) * 2.2 + (a - 0.5) * 1.6, 0, 1)
    make_mat("puddle", 0.01, (0.0, 0.04), var=0.0, streak=False, alpha_img=blob, seed=191)
    return MATS


def M(name):
    return MATS.get(name) or bpy.data.materials[name]


# ---------------------------------------------------------------- mesh builder
_FONT = {}


def font(bold=True):
    key = "YuGothB" if bold else "YuGothM"
    f = bpy.data.fonts.get(key)
    if f is None:
        f = bpy.data.fonts.load(r"C:\Windows\Fonts\%s.ttc" % key)
        f.name = key
    return f


def text_geo(body, size=0.3, extrude=0.0, bold=True):
    """Return (verts, faces) of a text mesh centred on origin, glyphs in XY plane facing +Z.
    Newlines stack characters vertically."""
    cu = bpy.data.curves.new("tmp_txt", "FONT")
    cu.body = body
    cu.font = font(bold)
    cu.size = size
    cu.extrude = extrude
    cu.resolution_u = 2
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.space_line = 0.9
    ob = bpy.data.objects.new("tmp_txt", cu)
    scene().collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    verts = [v.co.copy() for v in me.vertices]
    faces = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.curves.remove(cu)
    return verts, faces


def T(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return Matrix.LocRotScale(Vector(loc), Euler([math.radians(a) for a in rot]), Vector(scale))


class Builder:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def mi(self, mat):
        if isinstance(mat, str):
            mat = M(mat)
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _tag(self, verts, mat, smooth=False):
        idx = self.mi(mat)
        fs = set()
        for v in verts:
            fs.update(v.link_faces)
        for f in fs:
            f.material_index = idx
            f.smooth = smooth
        return fs

    def box(self, x0, x1, y0, y1, z0, z1, mat):
        """Axis-aligned box by min/max."""
        c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
        s = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
        return self.boxc(c, s, mat)

    def boxc(self, c, s, mat, rot=(0, 0, 0), pre=None):
        m = T(c, rot, s)
        if pre is not None:
            m = pre @ m
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        return self._tag(r["verts"], mat)

    def cyl(self, c, r1, r2, h, mat, seg=8, rot=(0, 0, 0), smooth=False, caps=True, pre=None):
        """Cylinder/cone; c is the BOTTOM centre in local axis (axis = local Z)."""
        m = T(c, rot) @ Matrix.Translation((0, 0, h / 2))
        if pre is not None:
            m = pre @ m
        r = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg,
                                  radius1=r1, radius2=r2, depth=h, matrix=m)
        return self._tag(r["verts"], mat, smooth)

    def sphere(self, c, r, mat, seg=10, rings=6, scale=(1, 1, 1), smooth=True, pre=None):
        m = T(c, (0, 0, 0), scale)
        if pre is not None:
            m = pre @ m
        rr = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=r, matrix=m)
        return self._tag(rr["verts"], mat, smooth)

    def geo(self, verts, faces, mat, m):
        vs = [self.bm.verts.new(m @ v) for v in verts]
        idx = self.mi(mat)
        for f in faces:
            try:
                face = self.bm.faces.new([vs[i] for i in f])
                face.material_index = idx
            except ValueError:
                pass

    def text(self, body, size, mat, m, extrude=0.0, bold=True):
        v, f = text_geo(body, size, extrude, bold)
        self.geo(v, f, mat, m)

    def quad(self, pts, mat):
        vs = [self.bm.verts.new(Vector(p)) for p in pts]
        f = self.bm.faces.new(vs)
        f.material_index = self.mi(mat)
        return f

    def finish(self, collection, uv_scale=0.5):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.normal_update()
        uvl = bm.loops.layers.uv.new("UVMap")
        for f in bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for l in f.loops:
                co = l.vert.co
                if ax == 0:
                    uv = (co.y, co.z)
                elif ax == 1:
                    uv = (co.x, co.z)
                else:
                    uv = (co.x, co.y)
                l[uvl].uv = (uv[0] * uv_scale, uv[1] * uv_scale)
        me = bpy.data.meshes.get(self.name)
        if me is not None:
            me.name = self.name + "_old"
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        return ob


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def empty(name, loc, parent, collection, size=0.3, kind="PLAIN_AXES", props=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind
    e.empty_display_size = size
    e.location = loc
    collection.objects.link(e)
    if parent is not None:
        e.parent = parent
    for k, v in (props or {}).items():
        e[k] = v
    return e


def module_root(name, collection, info):
    root = empty("MOD_" + name, (0, 0, 0), None, collection, 0.5, "ARROWS")
    for k, v in info.items():
        root[k] = v
    return root
