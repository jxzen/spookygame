# ENV-01: assemble a ~40 m preview street from the kit, light it, add rain and fog, set cameras.
# Street runs along +Y; left facade line x=-2.5, right x=+2.5 (5 m lane, shotengai width).
STREET_W = 5.0
HALF = STREET_W / 2

LEFT = ["facade_machiya", "shop_izakaya", "shop_tobacco", "shop_pharmacy", "facade_apartment",
        "facade_machiya", "shop_izakaya", "shop_tobacco"]
RIGHT = ["shop_izakaya", "facade_machiya", "shop_pharmacy", "shop_tobacco", "facade_machiya",
         "shop_izakaya", "facade_apartment", "shop_tobacco"]


def place_matrix(side, yc):
    if side == "L":
        return Matrix.Translation((-HALF, yc, 0)) @ Matrix.Rotation(math.radians(90), 4, "Z")
    return Matrix.Translation((HALF, yc, 0)) @ Matrix.Rotation(math.radians(-90), 4, "Z")


def inst(name, Mw, c, tag=""):
    """Linked copy of a kit module (mesh children) at world matrix Mw."""
    root = KIT[name]["root"]
    out = []
    for ch in root.children:
        if ch.type != "MESH":
            continue
        o = bpy.data.objects.new("S_%s%s_%s" % (name, tag, ch.name), ch.data)
        o.matrix_world = Mw @ ch.matrix_parent_inverse @ ch.matrix_basis
        c.objects.link(o)
        out.append(o)
    return out


def markers(name, prefix):
    return [ch for ch in KIT[name]["root"].children if ch.type == "EMPTY" and ch.name.split(".")[0].startswith(prefix)]


def light(c, name, kind, loc, energy, color=(1, 1, 1), size=0.1, rot=(0, 0, 0), spot=None, blend=0.3):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind in ("POINT", "SPOT"):
        ld.shadow_soft_size = size
    if kind == "AREA":
        ld.size = size
    if kind == "SPOT":
        ld.spot_size = math.radians(spot or 45)
        ld.spot_blend = blend
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    o.rotation_euler = [math.radians(a) for a in rot]
    c.objects.link(o)
    return o


def build_street():
    c = coll("STREET")
    wipe_coll("STREET")
    rnd = random.Random(3)
    attach_world = []  # (side, Vector) service wire anchors on facades
    sign_cycle = ["sign_vertical_snack", "sign_vertical_red", "sign_vertical_lit", "sign_vertical_snack", "sign_vertical_red"]
    si = 0
    for side, seq in (("L", LEFT), ("R", RIGHT)):
        y = 0.0
        for i, name in enumerate(seq):
            w = KIT[name]["info"]["width"]
            # left side: local +x -> world +y ; right side: local +x -> world -y
            yc = y + w / 2
            Mw = place_matrix(side, yc)
            inst(name, Mw, c, "_%s%d" % (side, i))
            for m in markers(name, "ATTACH_sign"):
                if rnd.random() < 0.8:
                    sn = sign_cycle[si % len(sign_cycle)]; si += 1
                    inst(sn, Mw @ Matrix.Translation(m.location), c, "_%d" % si)
            for m in markers(name, "LIGHT_lantern"):
                light(c, "L_lantern_%s%d" % (side, i), "POINT", Mw @ m.location, 25, (1.0, 0.12, 0.08), 0.18).data.use_shadow = False
            for m in markers(name, "ATTACH_wire"):
                attach_world.append((side, Mw @ m.location))
            y += w
    # ground: wet asphalt lane + concrete gutters + ground beyond
    g = Builder("S_ground")
    g.box(-HALF, HALF, -12, 60, -0.1, 0.0, "asphalt")
    for s in (-1, 1):
        g.box(s * HALF - (0.35 if s > 0 else 0), s * HALF + (0.35 if s < 0 else 0), -12, 60, 0.0, 0.015, "concrete")
        for k in range(0, 50, 2):
            g.box(s * (HALF - 0.32), s * (HALF - 0.05), k, k + 0.5, 0.015, 0.02, "metal_dark")  # grates
    g.box(-30, 30, 50, 60, -0.1, 0.0, "asphalt")
    # white lane edge lines, broken
    for k in range(-10, 42, 3):
        g.box(-1.9, -1.8, k, k + 1.8, 0.0, 0.004, "ink_white")
    g.finish(c, uv_scale=0.35)
    # shrine end: torii, stone lanterns, steps
    inst("torii", Matrix.Translation((0, 43.5, 0)), c)
    for x in (-2.0, 2.0):
        inst("stone_lantern", Matrix.Translation((x, 44.5, 0)), c, "_%d" % x)
    st = Builder("S_steps")
    for k in range(8):
        st.box(-2.2, 2.2, 46 + k * 0.35, 60, k * 0.17, (k + 1) * 0.17, "stone")
    st.finish(c)
    for k, x in enumerate((-1.0, 1.0)):
        inst("lantern_paper", Matrix.Translation((x * 1.4, 43.4, 2.9)), c, "_%d" % k)
        light(c, "L_paper_%d" % k, "POINT", (x * 1.4, 43.4, 2.4), 12, (1.0, 0.95, 0.85), 0.2).data.use_shadow = False
    # poles + wires
    poles = [("L", 12.6), ("R", 18.5), ("L", 29.0), ("R", 39.5)]
    pole_pts = []
    for i, (side, yy) in enumerate(poles):
        x = -HALF + 0.35 if side == "L" else HALF - 0.35
        Mw = Matrix.Translation((x, yy, 0)) @ Matrix.Rotation(math.radians(90 if side == "L" else -90), 4, "Z")
        inst("utility_pole", Mw, c, "_%d" % i)
        pole_pts.append([Mw @ Vector(p) for _, p in POLE_ATTACH])
        lamp = Mw @ Vector((0, -1.35, 5.7))
        light(c, "L_polelamp_%d" % i, "SPOT", lamp, 1500 if i in (0, 1) else 0, (0.92, 0.95, 1.0), 0.1, spot=80, blend=0.6)
    wb = Builder("S_wires")
    for a, b2 in zip(pole_pts, pole_pts[1:]):
        wires(wb, a, b2, sag=0.8, seg=12, t=0.022)
    # service drops from nearest pole to facades (the overhead tangle)
    for side, p in attach_world:
        q = min((t for pp in pole_pts for t in pp[7:9]), key=lambda v: (v - p).length)
        if (q - p).length < 22:
            wires(wb, [q], [p], sag=0.5, seg=8, t=0.015)
    wb.finish(c)
    # street props
    def P(name, x, y, rz, tag):
        return inst(name, Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(rz), 4, "Z"), c, tag)
    P("vending_machine_red", HALF - 0.8, 21.2, -90, "_a")
    light(c, "L_vend_a", "AREA", (HALF - 1.15, 21.2, 1.35), 40, (1, 1, 1), 0.7, rot=(0, -90, 0)).data.use_shadow = False
    P("vending_machine", -HALF + 0.8, 15.0, 90, "_b")
    light(c, "L_vend_b", "AREA", (-HALF + 1.15, 15.0, 1.35), 25, (0.95, 0.97, 1), 0.7, rot=(0, 90, 0)).data.use_shadow = False
    P("phone_booth", -HALF + 1.0, 24.5, 90, "_a")
    P("bicycle", HALF - 0.45, 9.6, 8, "_a")
    P("bicycle", -HALF + 0.4, 31.0, -12, "_b")
    P("trash_pile", -HALF + 0.65, 3.0, 90, "_a")
    P("trash_pile", HALF - 0.6, 15.0, -90, "_b")
    P("umbrella_dropped", 0.4, 13.5, 30, "_a")
    P("street_clutter", -HALF + 0.3, 6.3, 90, "_a")
    P("street_clutter", HALF - 0.3, 24.0, -90, "_b")
    P("street_clutter", -HALF + 0.3, 34.0, 90, "_c")
    P("street_clutter", HALF - 0.3, 3.0, -90, "_d")
    for k, (x, y, rz) in enumerate(((0.2, 6.0, 0), (-0.8, 16.5, 40), (0.6, 26.0, -20), (-0.3, 35.0, 70), (1.2, 2.0, 10))):
        for ch in KIT["puddle_decals"]["root"].children:
            o = bpy.data.objects.new("S_puddle_%d_%s" % (k, ch.name), ch.data)
            o.matrix_world = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(rz), 4, "Z") @ Matrix.Rotation(math.radians(90), 4, "Z") @ ch.matrix_basis
            c.objects.link(o)
    return c


def build_rain(cam_loc, n=2600, depth=24.0):
    c = coll("STREET_RAIN")
    wipe_coll("STREET_RAIN")
    mat = bpy.data.materials.get("rain") or bpy.data.materials.new("rain")
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    o_ = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    _sock(bs, "Base Color").default_value = (0.8, 0.8, 0.8, 1)
    _sock(bs, "Roughness").default_value = 0.2
    _sock(bs, "Emission Color").default_value = (0.7, 0.7, 0.72, 1)
    _sock(bs, "Emission Strength").default_value = 0.06
    _sock(bs, "Alpha").default_value = 0.2
    try:
        mat.surface_render_method = "BLENDED"
    except Exception:
        pass
    nt.links.new(_out(bs, "BSDF"), _sock(o_, "Surface"))
    rnd = random.Random(11)
    bm = bmesh.new()
    tilt = Vector((0.05, 0.03, -1)).normalized()
    for i in range(n):
        y = cam_loc[1] + 2.5 + rnd.random() ** 1.3 * depth
        x = (rnd.random() - 0.5) * STREET_W * 1.05
        z = rnd.random() * 8.0
        L = rnd.uniform(0.2, 0.45)
        w = 0.0025
        p = Vector((x, y, z))
        q = p + tilt * L
        side = Vector((w, 0, 0))
        vs = [bm.verts.new(v) for v in (p - side, p + side, q + side, q - side)]
        bm.faces.new(vs)
    me = bpy.data.meshes.new("S_rain")
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new("S_rain", me)
    ob.visible_shadow = False
    c.objects.link(ob)
    return ob


def setup_render(s):
    s.render.resolution_x = 1280
    s.render.resolution_y = 720
    try:
        s.render.engine = "BLENDER_EEVEE"
    except TypeError as e:
        print("engine", e)
    ee = s.eevee
    for k, v in (("taa_render_samples", 64), ("use_raytracing", True), ("volumetric_tile_size", "4"),
                 ("volumetric_samples", 64), ("volumetric_end", 70.0), ("volumetric_start", 0.1),
                 ("use_shadows", True), ("shadow_ray_count", 2), ("volumetric_light_clamp", 0.0),
                 ("use_volumetric_shadows", True), ("fast_gi_method", "GLOBAL_ILLUMINATION")):
        try:
            setattr(ee, k, v)
        except Exception as e:
            print("skip", k, e)
    try:
        ee.ray_tracing_method = "SCREEN"
    except Exception as e:
        print("rtm", e)
    vs = s.view_settings
    try:
        vs.view_transform = "AgX"
        vs.look = "AgX - Punchy"
    except Exception as e:
        print("cm", e)
    vs.exposure = 0.0
    # world: near-black night with grey volumetric fog
    w = bpy.data.worlds.get("W_night") or bpy.data.worlds.new("W_night")
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.05, 0.05, 0.052, 1)
    bg.inputs[1].default_value = 1.0
    nt.links.new(bg.outputs[0], _sock(out, "Surface"))
    build_fog()
    s.world = w
    return w


def setup_lights_cams(s):
    c = coll("STREET_CAM")
    wipe_coll("STREET_CAM")
    for o in list(c.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    # faint moonlight for silhouettes, through the fog
    light(c, "L_moon", "SUN", (0, 0, 20), 0.6, (0.9, 0.93, 1.0), rot=(55, 0, 160))
    cams = {}
    def cam(name, loc, look_at, lens=20):
        cd = bpy.data.cameras.new(name)
        cd.lens = lens
        cd.clip_start = 0.05
        cd.clip_end = 200
        o = bpy.data.objects.new(name, cd)
        o.location = loc
        d = Vector(look_at) - Vector(loc)
        o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        c.objects.link(o)
        # flashlight: spot parented to the camera, offset low-right like a held torch
        fl = light(c, name + "_torch", "SPOT", (0.18, -0.2, 0.05), 900, (1.0, 0.98, 0.95), 0.03, spot=32, blend=0.45)
        fl.parent = o
        fl.rotation_euler = (math.radians(-1), math.radians(4), 0)
        cams[name] = o
        return o
    cam("CAM_street", (0.6, -2.0, 1.65), (-0.3, 30.0, 2.4), 18)
    cam("CAM_izakaya", (1.3, 4.6, 1.6), (-2.5, 8.2, 1.8), 20)
    cam("CAM_hide", (-6.75, 7.9, 1.0), (-0.5, 8.2, 1.25), 16)   # crouched behind the izakaya counter (HIDE_counter)
    cam("CAM_wires", (-0.8, 17.0, 1.4), (0.8, 26.0, 5.0), 16)
    s.camera = cams["CAM_street"]
    return cams


def build_fog(density=0.05):
    """EEVEE world volume did not scatter lights here (Blender 5.3), so fog is a domain box."""
    c = coll("STREET_FOG")
    wipe_coll("STREET_FOG")
    fm = bpy.data.materials.get("fog") or bpy.data.materials.new("fog")
    try:
        fm.use_nodes = True
    except Exception:
        pass
    fn = fm.node_tree
    fn.nodes.clear()
    o_ = fn.nodes.new("ShaderNodeOutputMaterial")
    v = fn.nodes.new("ShaderNodeVolumePrincipled")
    _sock(v, "Color").default_value = (0.8, 0.8, 0.8, 1)
    _sock(v, "Density").default_value = density
    _sock(v, "Anisotropy").default_value = 0.4
    fn.links.new(_out(v, "Volume"), _sock(o_, "Volume"))
    me = bpy.data.meshes.new("S_fog")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=T((0, 25, 9), (0, 0, 0), (40, 80, 20)))
    bm.to_mesh(me); bm.free()
    me.materials.append(fm)
    fo = bpy.data.objects.new("S_fog", me)
    fo.display_type = "BOUNDS"
    c.objects.link(fo)
    return fo
