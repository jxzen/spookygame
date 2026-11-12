# ENV-01 town kit: module builders. Exec'd after kit_lib.py inside Blender.
# Every module: front plane y=0 facing -Y (the street), body in +Y, origin = street-front bottom centre.

KIT = {}  # name -> dict(root, mesh, info)


def bar(b, p0, p1, t, mat, t2=None):
    p0 = Vector(p0); p1 = Vector(p1)
    d = p1 - p0
    L = d.length
    up = "Y" if abs(d.normalized().y) < 0.95 else "X"
    q = d.to_track_quat("Z", up)
    m = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((t, t2 or t, L, 1))
    r = bmesh.ops.create_cube(b.bm, size=1.0, matrix=m)
    b._tag(r["verts"], mat)


def wall_hole(b, x0, x1, y0, y1, z0, z1, hole, mat):
    """Wall in the XZ plane with a rectangular hole (hx0, hx1, hz0, hz1)."""
    hx0, hx1, hz0, hz1 = hole
    if hx0 > x0: b.box(x0, hx0, y0, y1, z0, z1, mat)
    if x1 > hx1: b.box(hx1, x1, y0, y1, z0, z1, mat)
    if hz0 > z0: b.box(hx0, hx1, y0, y1, z0, hz0, mat)
    if z1 > hz1: b.box(hx0, hx1, y0, y1, hz1, z1, mat)


def txt_front(b, s, size, mat, x, y, z, bold=True):
    """Text facing -Y (the street)."""
    b.text(s, size, mat, T((x, y, z), (90, 0, 0)), bold=bold)


def txt_back(b, s, size, mat, x, y, z):
    b.text(s, size, mat, T((x, y, z), (90, 0, 180)))


def txt_px(b, s, size, mat, x, y, z):
    b.text(s, size, mat, T((x, y, z), (90, 0, 90)))


def txt_nx(b, s, size, mat, x, y, z):
    b.text(s, size, mat, T((x, y, z), (90, 0, -90)))


def eave(b, x0, x1, z, depth, mat="roof_tile", ang=18):
    """Sloped hisashi eave starting at the facade (y=0) at height z, projecting to y=-depth."""
    a = math.radians(ang)
    L = depth / math.cos(a)
    cy = -depth / 2
    cz = z - math.tan(a) * depth / 2
    b.boxc((( x0 + x1) / 2, cy, cz), (x1 - x0, L, 0.06), mat, rot=(ang, 0, 0))
    # tile ridges
    for i in range(int((x1 - x0) / 0.3)):
        x = x0 + 0.15 + i * 0.3
        b.boxc((x, cy, cz + 0.035), (0.05, L, 0.03), mat, rot=(ang, 0, 0))
    # fascia board at the drip edge
    b.box(x0, x1, -depth - 0.03, -depth + 0.02, z - math.tan(a) * depth - 0.12, z - math.tan(a) * depth + 0.01, "wood_black")


def shell(b, W, D, H1, H, opening, t=0.15, upper="plaster", lower="plaster", floor=True, roof_lip=True):
    """Two-storey shop box. opening=(x0,x1,h) cut in the ground-floor front; interior is enterable."""
    ox0, ox1, oh = opening
    b.box(-W / 2, -W / 2 + t, 0.2, D, 0, H, lower)          # side walls
    b.box(W / 2 - t, W / 2, 0.2, D, 0, H, lower)
    b.box(-W / 2, W / 2, D - t, D, 0, H, lower)            # back wall
    b.box(-W / 2, ox0, 0, 0.2, 0, H1, lower)               # pilasters
    b.box(ox1, W / 2, 0, 0.2, 0, H1, lower)
    b.box(ox0, ox1, 0, 0.2, oh, H1, "wood_black")          # fascia
    if floor:
        b.box(-W / 2 + t, W / 2 - t, 0.0, D - t, -0.05, 0.04, "floor_tile")
    b.box(-W / 2 + t, W / 2 - t, 0.2, D - t, H1 - 0.12, H1, "concrete")  # ceiling / storey slab
    b.box(-W / 2, W / 2, 0, D, H, H + 0.15, "concrete")    # roof slab
    if roof_lip:
        b.box(-W / 2, W / 2, -0.05, 0.12, H + 0.15, H + 0.55, "concrete")  # parapet


def upper_window(b, W, H1, H, win, lattice=True, mat="plaster"):
    wx0, wx1, wz0, wz1 = win
    wall_hole(b, -W / 2, W / 2, 0, 0.2, H1, H, (wx0, wx1, wz0, wz1), mat)
    b.box(wx0, wx1, 0.12, 0.15, wz0, wz1, "glass")
    b.box(wx0 - 0.05, wx1 + 0.05, -0.04, 0.02, wz0 - 0.06, wz0, "wood_black")  # sill
    if lattice:
        n = int((wx1 - wx0) / 0.12)
        for i in range(1, n):
            x = wx0 + i * (wx1 - wx0) / n
            b.box(x - 0.015, x + 0.015, 0.02, 0.1, wz0, wz1, "wood_black")
        b.box(wx0, wx1, 0.02, 0.1, (wz0 + wz1) / 2 - 0.015, (wz0 + wz1) / 2 + 0.015, "wood_black")


def ac_unit(b, x, z, y=0.0):
    b.box(x - 0.4, x + 0.4, y - 0.3, y, z, z + 0.55, "sign_white")
    b.cyl((x + 0.1, y - 0.305, z + 0.27), 0.2, 0.2, 0.01, "black", seg=12, rot=(90, 0, 0))
    b.box(x - 0.42, x + 0.42, y - 0.32, y, z - 0.05, z, "metal_dark")
    bar(b, (x + 0.35, y - 0.15, z), (x + 0.35, y - 0.15, 0.05), 0.025, "metal_dark")  # drain pipe


def start(name, info):
    c = coll("MOD_" + name, coll("KIT"))
    wipe_coll("MOD_" + name)
    root = module_root(name, c, info)
    return c, root, Builder(name)


def finish_mod(name, c, root, b, markers):
    ob = b.finish(c)
    ob.parent = root
    for (mname, loc, props) in markers:
        empty(mname, loc, root, c, 0.25, "SPHERE" if mname.startswith("HIDE") else "PLAIN_AXES", props)
    KIT[name] = dict(root=root, mesh=ob, info=dict(root.items()))
    return ob


# ------------------------------------------------------------------ shops
def mod_izakaya():
    W, D, H1, H = 4.0, 7.0, 3.0, 6.0
    c, root, b = start("shop_izakaya", dict(kind="shop", enterable=1, width=W, depth=D, height=H + 0.55))
    shell(b, W, D, H1, H, (-1.6, 1.6, 2.2), lower="plaster")
    eave(b, -W / 2, W / 2, 2.95, 0.7)
    upper_window(b, W, H1, H, (-1.2, 1.2, 3.8, 5.1))
    # left half: closed koshi sliding door
    b.box(-1.6, 0.0, 0.04, 0.1, 0.0, 0.6, "wood_dark")
    b.box(-1.6, 0.0, 0.06, 0.08, 0.6, 2.15, "sign_white")    # shoji paper
    for i in range(14):
        x = -1.6 + 0.06 + i * 0.113
        b.box(x - 0.012, x + 0.012, 0.02, 0.06, 0.6, 2.15, "wood_black")
    for zz in (0.6, 1.35, 2.15):
        b.box(-1.6, 0.0, 0.02, 0.06, zz - 0.03, zz + 0.03, "wood_black")
    b.box(-0.04, 0.0, 0.02, 0.1, 0, 2.2, "wood_black")
    b.box(-1.6, 1.6, 0.0, 0.12, 0.0, 0.05, "metal")          # door track
    # noren over the open right half
    b.cyl((0.0, -0.1, 2.12), 0.02, 0.02, 1.62, "wood_black", seg=6, rot=(0, 90, 0))
    for i, ch in enumerate("やきとり"):
        x0 = 0.03 + i * 0.395
        b.box(x0, x0 + 0.375, -0.11, -0.095, 1.35, 2.12, "cloth_black")
        txt_front(b, ch, 0.24, "ink_white", x0 + 0.19, -0.115, 1.62)
    # akachochin on a bracket by the left pilaster
    b.box(-1.86, -1.80, -0.42, 0.0, 2.62, 2.66, "metal_dark")
    lantern_red_geo(b, (-1.83, -0.38, 2.62))
    # interior: counter, stools, back shelf, tags
    b.box(-1.85, 1.2, 3.0, 3.55, 1.0, 1.06, "wood_dark")
    b.box(-1.85, 1.15, 3.05, 3.5, 0.04, 1.0, "wood_black")
    for i in range(4):
        x = -1.35 + i * 0.6
        b.cyl((x, 2.6, 0.04), 0.03, 0.03, 0.6, "metal_dark", seg=6)
        b.cyl((x, 2.6, 0.64), 0.17, 0.17, 0.06, "black", seg=10)
    b.box(-1.85, 1.85, 6.4, 6.85, 0.04, 2.2, "wood_dark")
    for zz in (0.9, 1.4, 1.9):
        b.box(-1.85, 1.85, 6.25, 6.85, zz, zz + 0.04, "wood_black")
        for j in range(8):
            b.cyl((-1.6 + j * 0.45, 6.5, zz + 0.04), 0.04, 0.03, 0.28, "glass", seg=6)
    for i, s in enumerate(["焼\n鳥", "酒", "刺\n身", "煮\n込", "茶"]):
        y = 1.2 + i * 0.5
        b.box(-1.85, -1.84, y - 0.15, y + 0.15, 1.6, 2.3, "sign_white")
        txt_px(b, s, 0.14, "black", -1.835, y, 1.95)
    # unlit paper lantern above the counter
    b.sphere((0.0, 3.3, 2.45), 0.2, "sign_white", seg=8, rings=6, scale=(1, 1, 1.3))
    b.cyl((0.0, 3.3, 2.6), 0.005, 0.005, 0.28, "black", seg=4)
    return finish_mod("shop_izakaya", c, root, b, [
        ("DOOR_main", (0.8, 0.0, 0.0), dict(width=1.6, height=2.1, note="open half behind the noren")),
        ("HIDE_counter", (0.4, 4.1, 0.0), dict(pose="crouch", radius=0.6, note="behind the counter, out of sight from the street")),
        ("ATTACH_sign_left", (-W / 2, 0.0, 5.6), dict(type="sign_vertical", note="hang a vertical sign, projecting -Y")),
        ("ATTACH_lantern", (-1.83, -0.38, 2.62), dict(type="lantern_red")),
        ("ATTACH_wire", (W / 2 - 0.2, 0.0, 5.6), dict(type="service_wire")),
        ("LIGHT_lantern", (-1.83, -0.38, 2.25), dict(type="point", color="red", note="put the red point light here")),
    ])


def mod_tobacco():
    W, D, H1, H = 2.8, 4.0, 2.8, 5.4
    c, root, b = start("shop_tobacco", dict(kind="shop", enterable=1, width=W, depth=D, height=H + 0.55))
    shell(b, W, D, H1, H, (-1.2, 1.2, 2.3), lower="concrete")
    upper_window(b, W, H1, H, (-1.1, 0.2, 3.6, 4.7), lattice=False, mat="concrete")
    ac_unit(b, 0.78, 3.5)
    # roll-up shutter, half open: bottom edge at 0.85 m (crouch to enter)
    b.box(-1.25, 1.25, -0.28, 0.0, 2.3, 2.62, "metal")       # housing
    for x in (-1.24, 1.16):
        b.box(x, x + 0.08, -0.14, -0.04, 0.0, 2.3, "metal_dark")  # guide rails
    n = 16
    for i in range(n):
        z0 = 0.88 + i * (2.3 - 0.88) / n
        b.box(-1.18, 1.18, -0.12 + (0.012 if i % 2 else 0), -0.09, z0, z0 + (2.3 - 0.88) / n, "metal")
    b.box(-1.18, 1.18, -0.14, -0.08, 0.82, 0.9, "metal_dark")  # bottom bar
    b.box(-0.15, 0.15, -0.17, -0.14, 0.84, 0.88, "black")       # handle
    # red signboard
    b.box(-1.35, 1.35, -0.34, -0.28, 2.66, 3.18, "red_paint")
    txt_front(b, "たばこ", 0.38, "ink_white", 0.0, -0.345, 2.92)
    # interior: glass display case, counter, carton shelf
    b.box(-1.2, 0.55, 0.6, 1.1, 0.04, 0.8, "wood_black")
    b.box(-1.2, 0.55, 0.6, 1.1, 0.8, 0.95, "glass")
    b.box(-0.6, -0.2, 0.75, 0.95, 0.95, 1.2, "black")          # register
    b.box(-1.25, 1.25, 3.3, 3.85, 0.04, 2.2, "wood_dark")
    for zz in (0.5, 0.95, 1.4, 1.85):
        b.box(-1.25, 1.25, 3.2, 3.85, zz, zz + 0.03, "wood_black")
        for j in range(10):
            b.box(-1.15 + j * 0.23, -0.97 + j * 0.23, 3.3, 3.45, zz + 0.03, zz + 0.3,
                  "sign_white" if (j + int(zz * 10)) % 3 else "red_paint")
    b.cyl((0.8, 2.2, 0.04), 0.03, 0.03, 0.45, "metal_dark", seg=6)
    b.cyl((0.8, 2.2, 0.49), 0.16, 0.16, 0.05, "black", seg=10)
    txt_front(b, "営業中", 0.09, "red_paint", 0.85, 0.59, 1.2)     # 'open' tag, a lie
    b.box(0.6, 1.1, 0.6, 0.62, 1.1, 1.3, "sign_white")
    return finish_mod("shop_tobacco", c, root, b, [
        ("DOOR_shutter", (0.0, 0.0, 0.0), dict(width=2.36, height=0.82, crouch=1, note="crawl under the half-open shutter")),
        ("HIDE_case", (-0.4, 1.7, 0.0), dict(pose="crouch", radius=0.5, note="behind the display case, below shutter line")),
        ("ATTACH_sign_right", (W / 2, 0.0, 5.2), dict(type="sign_vertical")),
        ("ATTACH_wire", (-W / 2 + 0.2, 0.0, 5.0), dict(type="service_wire")),
    ])


def mod_pharmacy():
    W, D, H1, H = 5.0, 8.0, 3.0, 6.2
    c, root, b = start("shop_pharmacy", dict(kind="shop", enterable=1, width=W, depth=D, height=H + 0.55))
    shell(b, W, D, H1, H, (-2.3, 2.3, 2.5), lower="plaster")
    # upper storey: two windows with closed amado shutters
    wall_hole(b, -W / 2, W / 2, 0, 0.2, H1, H, (-1.9, 1.9, 3.9, 5.2), "plaster")
    b.box(-0.2, 0.2, 0, 0.2, 3.9, 5.2, "plaster")
    for x0 in (-1.9, 0.2):
        b.box(x0, x0 + 1.7, 0.05, 0.12, 3.9, 5.2, "metal")
        for k in range(8):
            zz = 3.95 + k * 0.16
            b.box(x0, x0 + 1.7, 0.03, 0.05, zz, zz + 0.02, "metal_dark")
    # left half: shutter fully down
    for i in range(18):
        z0 = i * 2.5 / 18
        b.box(-2.3, 0.0, -0.1 + (0.012 if i % 2 else 0), -0.07, z0, z0 + 2.5 / 18, "metal")
    b.box(-2.32, 0.02, -0.3, 0.0, 2.5, 2.78, "metal")
    # right half: aluminium storefront, door slid open 0.7 m
    for x in (0.0, 1.15, 2.3):
        b.box(x - 0.04, x + 0.04, 0.05, 0.15, 0, 2.5, "metal")
    b.box(0.0, 2.3, 0.05, 0.15, 2.18, 2.26, "metal")
    b.box(1.15, 2.3, 0.09, 0.11, 0.05, 2.18, "glass")              # fixed pane
    b.box(0.75, 1.9, 0.14, 0.2, 0.0, 2.18, "metal")                 # door frame (slid)
    b.box(0.79, 1.86, 0.16, 0.18, 0.05, 2.12, "glass")
    b.box(1.35, 1.75, 0.08, 0.085, 1.2, 1.7, "sign_white")          # taped notice
    txt_front(b, "休業", 0.13, "black", 1.55, 0.075, 1.45)
    # sign band
    b.box(-2.45, 2.45, -0.3, -0.24, 2.8, 3.25, "sign_white")
    txt_front(b, "くすり", 0.32, "red_paint", -1.0, -0.305, 3.02)
    b.cyl((1.5, -0.25, 3.025), 0.2, 0.2, 0.03, "red_paint", seg=16, rot=(90, 0, 0))
    txt_front(b, "薬", 0.3, "ink_white", 1.5, -0.285, 3.025)
    # interior: gondolas, counter, partition with doorway, back room
    for gx in (-1.6, 0.3):
        b.box(gx, gx + 0.9, 1.4, 4.4, 0.04, 0.12, "metal_dark")
        b.box(gx + 0.4, gx + 0.5, 1.4, 4.4, 0.04, 1.5, "metal")
        for zz in (0.5, 0.95, 1.4):
            b.box(gx, gx + 0.9, 1.4, 4.4, zz, zz + 0.03, "metal")
        for k in range(6):
            yy = 1.55 + k * 0.48
            b.box(gx + 0.05, gx + 0.35, yy, yy + 0.3, 0.53, 0.75, "sign_white")
            b.box(gx + 0.55, gx + 0.85, yy, yy + 0.25, 0.98, 1.15, "cardboard")
    for (x, y, r) in ((-0.3, 2.3, 20), (-0.1, 3.0, -35), (1.6, 2.0, 60)):   # spilled stock
        b.boxc((x, y, 0.13), (0.3, 0.22, 0.18), "sign_white", rot=(0, 0, r))
    b.box(-2.0, 0.6, 4.9, 5.4, 0.04, 1.0, "wood_dark")
    b.box(-2.0, 0.6, 4.85, 5.45, 1.0, 1.04, "sign_white")
    wall_hole(b, -W / 2 + 0.15, W / 2 - 0.15, 5.8, 5.92, 0.04, H1 - 0.12, (1.0, 1.9, 0.04, 2.1), "plaster")
    b.boxc((1.0 + 0.45 * math.cos(math.radians(55)), 5.8 - 0.45 * math.sin(math.radians(55)), 1.07),
           (0.9, 0.04, 2.05), "wood_dark", rot=(0, 0, -55))           # door ajar
    for sx in (-2.3, -1.0):
        b.box(sx, sx + 1.1, 7.35, 7.8, 0.04, 2.0, "metal")
        for zz in (0.4, 0.9, 1.4, 1.95):
            b.box(sx, sx + 1.1, 7.3, 7.85, zz, zz + 0.03, "metal_dark")
            b.box(sx + 0.1, sx + 0.6, 7.4, 7.75, zz + 0.03, zz + 0.33, "cardboard")
    b.box(1.2, 2.3, 6.4, 7.6, 0.04, 0.45, "cloth_black")             # cot
    return finish_mod("shop_pharmacy", c, root, b, [
        ("DOOR_main", (0.4, 0.0, 0.0), dict(width=0.7, height=2.1, note="door slid open 0.7 m")),
        ("DOOR_backroom", (1.45, 5.86, 0.0), dict(width=0.9, height=2.1, note="partition doorway, door ajar")),
        ("HIDE_backroom", (0.4, 7.0, 0.0), dict(pose="stand", radius=0.6, note="back room, out of line of sight from the street door")),
        ("HIDE_counter", (-1.3, 5.6, 0.0), dict(pose="crouch", radius=0.5)),
        ("ATTACH_sign_left", (-W / 2, 0.0, 5.8), dict(type="sign_vertical")),
        ("ATTACH_wire", (W / 2 - 0.2, 0.0, 5.8), dict(type="service_wire")),
    ])


# ------------------------------------------------------------------ facades
def mod_machiya():
    W, D, H1 = 5.4, 6.0, 2.9
    c, root, b = start("facade_machiya", dict(kind="facade", enterable=0, width=W, depth=D, height=6.7))
    b.box(-W / 2, -W / 2 + 0.15, 0.3, D, 0, 5.4, "plaster")
    b.box(W / 2 - 0.15, W / 2, 0.3, D, 0, 5.4, "plaster")
    b.box(-W / 2, W / 2, D - 0.15, D, 0, 5.4, "plaster")
    b.box(-W / 2, W / 2, 0.3, D, 0.0, 0.1, "floor_tile")
    b.box(-W / 2, W / 2, 0.0, 0.25, 0.0, 0.15, "stone")              # sill
    b.box(-W / 2 + 0.05, W / 2 - 0.05, 0.25, 0.3, 0.15, H1, "wood_black")  # dark wall behind lattice
    for x in (-W / 2 + 0.06, -0.1, 1.0, W / 2 - 0.06):
        b.box(x - 0.07, x + 0.07, 0.05, 0.25, 0.0, H1, "wood_dark")     # posts
    for i in range(30):                                                 # koshi lattice
        x = -W / 2 + 0.18 + i * 0.075
        b.box(x - 0.015, x + 0.015, 0.1, 0.16, 0.15, 2.4, "wood_dark")
    b.box(-W / 2, -0.1, 0.08, 0.18, 2.4, 2.48, "wood_dark")
    b.box(-W / 2, -0.1, 0.08, 0.18, 1.2, 1.24, "wood_dark")
    for i in range(8):                                                  # entrance lattice door
        x = 0.05 + i * 0.12
        b.box(x - 0.015, x + 0.015, 0.12, 0.18, 0.15, 2.2, "wood_dark")
    b.box(-0.03, 0.97, 0.15, 0.2, 0.15, 2.2, "sign_white")
    b.box(1.1, W / 2 - 0.15, 0.12, 0.2, 0.15, 2.3, "wood_dark")         # side panel
    # inu-yarai (curved bamboo guard) along the base
    for i in range(16):
        x = -2.55 + i * 0.15
        bar(b, (x, -0.45, 0.02), (x, -0.05, 0.85), 0.03, "wood_black")
    b.box(-2.6, -0.2, -0.47, -0.4, 0.0, 0.06, "wood_black")
    b.box(-2.6, -0.2, -0.1, 0.0, 0.8, 0.88, "wood_black")
    eave(b, -W / 2, W / 2, 3.0, 0.9)
    # upper storey: low plaster wall with mushiko-mado
    wall_hole(b, -W / 2, W / 2, 0.3, 0.45, 3.0, 5.4, (-2.0, 2.0, 3.6, 4.6), "plaster")
    b.box(-0.6, 0.6, 0.3, 0.45, 3.6, 4.6, "plaster")
    b.box(-2.0, 2.0, 0.42, 0.45, 3.6, 4.6, "black")
    for x0, x1 in ((-2.0, -0.6), (0.6, 2.0)):
        n = 7
        for i in range(n):
            x = x0 + (i + 0.5) * (x1 - x0) / n
            b.box(x - 0.06, x + 0.06, 0.32, 0.42, 3.6, 4.6, "plaster")
    b.box(-W / 2, W / 2, 0.0, 0.3, 2.9, 3.05, "wood_black")              # beam behind eave
    # gabled main roof (ridge parallel to the street)
    ridge_y, ridge_z = 3.0, 6.7
    for sgn, (ya, za, yb, zb) in ((1, (-0.6, 5.3, ridge_y, ridge_z)), (-1, (ridge_y, ridge_z, D + 0.6, 5.3))):
        L = math.hypot(yb - ya, zb - za)
        ang = math.degrees(math.atan2(zb - za, yb - ya))
        b.boxc((0, (ya + yb) / 2, (za + zb) / 2), (W + 0.5, L, 0.1), "roof_tile", rot=(ang, 0, 0))
        for i in range(int((W + 0.5) / 0.3)):
            x = -(W + 0.5) / 2 + 0.15 + i * 0.3
            b.boxc((x, (ya + yb) / 2, (za + zb) / 2 + 0.07), (0.06, L, 0.04), "roof_tile", rot=(ang, 0, 0))
    b.box(-W / 2 - 0.3, W / 2 + 0.3, ridge_y - 0.15, ridge_y + 0.15, ridge_z - 0.05, ridge_z + 0.2, "roof_tile")
    for sx in (-W / 2, W / 2):
        b.quad([(sx, 0.3, 5.4), (sx, D, 5.4), (sx, ridge_y, ridge_z - 0.05)], "plaster")
        b.quad([(sx, D, 5.4), (sx, 0.3, 5.4), (sx, ridge_y, ridge_z - 0.05)], "plaster")
    b.quad([(-W / 2, 0.3, 5.4), (W / 2, 0.3, 5.4), (W / 2, D, 5.4), (-W / 2, D, 5.4)], "wood_black")
    return finish_mod("facade_machiya", c, root, b, [
        ("ATTACH_lantern", (1.5, -0.3, 2.6), dict(type="lantern_red")),
        ("ATTACH_sign_right", (W / 2, 0.0, 5.3), dict(type="sign_vertical")),
        ("ATTACH_wire", (-W / 2 + 0.2, 0.0, 5.2), dict(type="service_wire")),
        ("DOOR_locked", (0.47, 0.0, 0.0), dict(width=0.95, height=2.1, locked=1, note="rattles; not enterable")),
    ])


def mod_apartment():
    W, D = 10.0, 8.0
    FH = 2.9
    c, root, b = start("facade_apartment", dict(kind="facade", enterable=0, width=W, depth=D, height=3 * FH + 0.9))
    bx0, bx1 = -5.0, 2.5
    b.box(bx0, bx1, 1.4, D, 0, 3 * FH, "concrete")
    b.box(bx0, 4.6, 0, D, 3 * FH, 3 * FH + 0.2, "concrete")
    b.box(bx0, bx1, 1.3, D, 3 * FH + 0.2, 3 * FH + 0.9, "concrete")
    b.box(bx0, 4.6, 0, 0.15, 3 * FH + 0.2, 3 * FH + 0.6, "concrete")
    b.box(bx0, 4.6, -0.1, 1.4, -0.02, 0.06, "concrete")              # ground walkway
    for f in range(3):
        z = f * FH
        if f > 0:
            b.box(bx0, 4.6, 0, 1.4, z - 0.18, z, "concrete")               # corridor slab
            b.box(bx0, 2.6, 0, 0.12, z, z + 1.1, "concrete")               # parapet panel
            b.box(bx0, 2.6, -0.02, 0.14, z + 1.1, z + 1.16, "metal")
        for u, dx in enumerate((-3.6, -0.6)):
            b.box(dx, dx + 0.85, 1.34, 1.4, z + 0.06, z + 2.05, "metal")        # door
            b.box(dx - 0.05, dx + 0.9, 1.36, 1.41, z + 2.05, z + 2.12, "metal_dark")
            b.box(dx + 0.7, dx + 0.78, 1.3, 1.34, z + 0.95, z + 1.05, "black")   # knob
            b.box(dx + 1.1, dx + 1.9, 1.36, 1.4, z + 1.2, z + 1.9, "glass")       # kitchen window
            for k in range(5):
                xx = dx + 1.15 + k * 0.17
                b.box(xx, xx + 0.03, 1.32, 1.36, z + 1.2, z + 1.9, "metal_dark")  # window bars
            b.box(dx - 0.6, dx - 0.15, 1.3, 1.4, z + 1.3, z + 1.8, "metal")      # meter box
            if f > 0 and u == 1:
                ac_unit(b, dx + 1.5, z + 0.05, y=1.32)
        b.box(bx0 + 0.05, bx0 + 0.2, 0.0, 1.4, z, z + 0.3, "metal_dark")   # end post plinth
    # name plate
    b.box(-2.4, -0.6, -0.04, 0.0, FH + 0.35, FH + 0.75, "sign_white")
    txt_front(b, "第二コーポ", 0.26, "black", -1.5, -0.045, FH + 0.55)
    # switchback steel stairs in the open bay x 2.6..4.6
    nst, run = 8, 2.2 / 8
    for f in range(2):
        z0 = f * FH
        for i in range(nst):
            za = z0 + (i + 1) * FH / 2 / nst
            ya = 1.4 + i * run
            b.box(2.65, 3.55, ya, ya + run, za - 0.04, za, "metal")
            zb = z0 + FH / 2 + (i + 1) * FH / 2 / nst
            yb = 3.6 - (i + 1) * run
            b.box(3.65, 4.55, yb, yb + run, zb - 0.04, zb, "metal")
        for x in (2.62, 3.58):
            bar(b, (x, 1.4, z0), (x, 3.6, z0 + FH / 2), 0.04, "metal_dark", 0.18)
        for x in (3.62, 4.58):
            bar(b, (x, 3.6, z0 + FH / 2), (x, 1.4, z0 + FH), 0.04, "metal_dark", 0.18)
        b.box(2.6, 4.6, 3.6, 4.6, z0 + FH / 2 - 0.1, z0 + FH / 2, "metal")   # landing
        bar(b, (4.6, 3.6, z0 + FH / 2 + 0.95), (4.6, 1.4, z0 + FH + 0.95), 0.04, "metal_dark")
        bar(b, (2.6, 1.4, z0 + 0.95), (2.6, 3.6, z0 + FH / 2 + 0.95), 0.04, "metal_dark")
        b.box(2.6, 4.6, 4.56, 4.6, z0 + FH / 2, z0 + FH / 2 + 1.0, "metal")  # landing guard
        for x in (2.65, 4.55):
            b.box(x - 0.05, x + 0.05, 4.5, 4.6, z0, z0 + FH / 2, "metal_dark")
    b.box(4.5, 4.6, 0.0, 0.1, 0, 3 * FH, "metal_dark")
    b.box(2.6, 4.6, 0.0, 0.12, FH * 2, FH * 2 + 1.1, "metal")             # top corridor end guard
    b.box(2.6, 4.6, 0.0, 0.12, FH, FH + 1.1, "metal")
    b.box(2.5, 4.6, 4.6, 4.75, 0, 3 * FH, "concrete")                     # back of stair bay
    # mailboxes under the stairs
    b.box(2.7, 3.5, 1.42, 1.7, 1.0, 1.6, "metal")
    for k in range(4):
        b.box(2.72 + k * 0.2, 2.88 + k * 0.2, 1.4, 1.42, 1.3, 1.34, "black")
    return finish_mod("facade_apartment", c, root, b, [
        ("HIDE_under_stairs", (3.1, 3.4, 0.0), dict(pose="crouch", radius=0.6, note="under flight A, in shadow")),
        ("STAIRS_up", (3.1, 1.4, 0.0), dict(note="walkable switchback to floors 2 and 3")),
        ("DOOR_unit_101", (-3.18, 1.4, 0.0), dict(width=0.85, height=2.0, locked=1)),
        ("DOOR_unit_102", (-0.18, 1.4, 0.0), dict(width=0.85, height=2.0, locked=1)),
        ("DOOR_unit_202", (-0.18, 1.4, FH), dict(width=0.85, height=2.0, locked=0, note="ajar: a candidate for a scripted beat")),
        ("ATTACH_wire", (-4.8, 0.0, 8.4), dict(type="service_wire")),
    ])


# ------------------------------------------------------------------ props
def lantern_red_geo(b, top, mat="red_lantern", char="酒", r=0.2, sz=1.45):
    x, y, z = top
    b.cyl((x, y, z - 0.08), 0.004, 0.004, 0.08, "black", seg=4)
    b.cyl((x, y, z - 0.14), 0.13, 0.13, 0.06, "black", seg=10)
    cz = z - 0.14 - r * sz
    b.sphere((x, y, cz), r, mat, seg=10, rings=7, scale=(1, 1, sz))
    b.cyl((x, y, cz - r * sz - 0.02), 0.13, 0.13, 0.06, "black", seg=10)
    if char:
        txt_front(b, char, 0.2, "black", x, y - r - 0.005, cz)
        txt_back(b, char, 0.2, "black", x, y + r + 0.005, cz)


def prop(name, kind, fn, w, d, h, markers=()):
    c, root, b = start(name, dict(kind=kind, enterable=0, width=w, depth=d, height=h))
    fn(b)
    return finish_mod(name, c, root, b, list(markers))


def p_lantern_red(b):
    lantern_red_geo(b, (0, -0.2, 0))  # origin = hook top; hangs below


def p_lantern_paper(b):
    b.cyl((0, 0, -0.06), 0.004, 0.004, 0.06, "black", seg=4)
    b.cyl((0, 0, -0.12), 0.16, 0.16, 0.06, "black", seg=10)
    b.sphere((0, 0, -0.52), 0.24, "paper_glow", seg=10, rings=7, scale=(1, 1, 1.6))
    b.cyl((0, 0, -0.95), 0.16, 0.16, 0.06, "black", seg=10)
    txt_front(b, "御\n神\n燈", 0.12, "black", 0, -0.245, -0.52)


def sign_vertical(b, body, text, txtmat, h=1.9, w=0.6):
    b.box(-0.06, 0.06, -0.15 - w, -0.15, -h, 0, body)
    for zz in (-0.25, -h + 0.25):
        b.box(-0.02, 0.02, -0.16, 0.0, zz - 0.02, zz + 0.02, "metal_dark")
    b.box(-0.08, 0.08, -0.17 - w, -0.13, -0.04, 0.0, "metal_dark")
    b.box(-0.08, 0.08, -0.17 - w, -0.13, -h, -h + 0.04, "metal_dark")
    sz = min(0.36, (h - 0.3) / len(text))
    s = "\n".join(text)
    txt_px(b, s, sz, txtmat, 0.062, -0.15 - w / 2, -h / 2)
    txt_nx(b, s, sz, txtmat, -0.062, -0.15 - w / 2, -h / 2)


def p_pole(b):
    H = 12.0
    b.cyl((0, 0, 0), 0.19, 0.14, H, "concrete", seg=10)
    for i in range(6):                                      # B/W hazard sleeve
        b.cyl((0, 0, i * 0.3), 0.2, 0.2, 0.3, "black" if i % 2 else "ink_white", seg=10, caps=False)
    b.box(-0.21, -0.19, -0.25, 0.25, 2.6, 3.0, "sign_white")   # address plate
    txt_nx(b, "三\n丁\n目", 0.11, "black", -0.215, 0.0, 2.8)
    for k in range(14):                                      # step bolts
        z = 2.2 + k * 0.45
        s = 1 if k % 2 else -1
        b.box(s * 0.15, s * 0.36, -0.015, 0.015, z, z + 0.03, "metal_dark")
    for z, xs in ((11.3, (-0.85, -0.3, 0.3, 0.85)), (10.3, (-0.7, 0.0, 0.7))):
        b.box(-1.0, 1.0, -0.05, 0.05, z - 0.08, z, "metal_dark")
        bar(b, (-0.7, 0, z - 0.08), (0, 0, z - 0.7), 0.03, "metal_dark")
        bar(b, (0.7, 0, z - 0.08), (0, 0, z - 0.7), 0.03, "metal_dark")
        for x in xs:
            b.cyl((x, 0, z), 0.04, 0.04, 0.14, "sign_white", seg=6)
    # pole transformer on the back side
    b.box(-0.05, 0.05, 0.12, 0.45, 9.2, 9.28, "metal_dark")
    b.box(-0.05, 0.05, 0.12, 0.45, 8.1, 8.18, "metal_dark")
    b.cyl((0, 0.55, 8.2), 0.28, 0.28, 0.95, "metal", seg=10)
    b.cyl((0, 0.55, 9.15), 0.3, 0.3, 0.06, "metal_dark", seg=10)
    for x in (-0.12, 0.12):
        b.cyl((x, 0.55, 9.2), 0.035, 0.03, 0.18, "sign_white", seg=6)
    # telecom cable bracket and a street lamp arm
    b.box(-0.5, 0.5, -0.04, 0.04, 6.2, 6.28, "metal_dark")
    bar(b, (0, -0.15, 5.6), (0, -1.3, 5.9), 0.05, "metal_dark")
    b.box(-0.12, 0.12, -1.55, -1.15, 5.8, 5.95, "metal_dark")
    b.box(-0.1, 0.1, -1.52, -1.18, 5.78, 5.8, "paper_glow")


POLE_ATTACH = [("hv%d" % i, (x, 0.0, 11.37)) for i, x in enumerate((-0.85, -0.3, 0.3, 0.85))] + \
              [("mv%d" % i, (x, 0.0, 10.37)) for i, x in enumerate((-0.7, 0.0, 0.7))] + \
              [("tel0", (-0.45, 0.0, 6.28)), ("tel1", (0.45, 0.0, 6.28))]


def wires(b, a_pts, b_pts, sag=0.6, seg=10, t=0.025, mat="black"):
    for p0, p1 in zip(a_pts, b_pts):
        p0 = Vector(p0); p1 = Vector(p1)
        pts = []
        for i in range(seg + 1):
            u = i / seg
            p = p0.lerp(p1, u)
            p.z -= sag * 4 * u * (1 - u)
            pts.append(p)
        for i in range(seg):
            bar(b, pts[i], pts[i + 1], t, mat)


def p_wireset(b):
    A = [p for _, p in POLE_ATTACH]
    B = [(x, y + 20.0, z) for (x, y, z) in A]
    wires(b, A, B, sag=0.7)


def p_vending(b, red=False):
    body = "red_paint" if red else "sign_white"
    b.box(-0.5, 0.5, 0.02, 0.75, 0.0, 1.83, body)
    b.box(-0.5, 0.5, 0.0, 0.75, 0.0, 0.05, "metal_dark")
    b.box(-0.45, 0.45, -0.01, 0.02, 0.95, 1.72, "vend_glow")
    for r in range(3):
        for k in range(8):
            x = -0.4 + k * 0.11
            z = 1.0 + r * 0.24
            b.box(x - 0.03, x + 0.03, -0.02, 0.0, z + 0.02, z + 0.17, "black" if (r + k) % 3 else "metal_dark")
        for k in range(8):
            x = -0.4 + k * 0.11
            b.box(x - 0.025, x + 0.025, -0.02, 0.0, 1.0 + r * 0.24 - 0.02, 1.0 + r * 0.24, "red_paint")
    b.box(-0.45, 0.45, -0.005, 0.02, 1.74, 1.8, "black")
    b.box(0.15, 0.4, -0.03, 0.02, 0.55, 0.9, "metal")                # coin panel
    b.box(-0.4, 0.3, -0.04, 0.02, 0.12, 0.38, "black")                # pickup slot
    b.box(-0.38, 0.28, -0.05, -0.04, 0.3, 0.37, "metal")


def p_phone_booth(b):
    s = 0.95
    for x in (-s / 2, s / 2):
        for y in (0, s):
            b.box(x - 0.03, x + 0.03, y - 0.03, y + 0.03, 0, 2.15, "metal_dark")
    b.box(-s / 2 - 0.05, s / 2 + 0.05, -0.05, s + 0.05, 2.15, 2.3, "metal_dark")
    b.box(-s / 2 - 0.03, s / 2 + 0.03, -0.035, -0.03, 1.95, 2.13, "sign_white")
    txt_front(b, "公衆電話", 0.11, "black", 0, -0.04, 2.04)
    b.box(-s / 2, s / 2, -0.02, s + 0.02, 0, 0.08, "concrete")
    for x0, x1, y0, y1 in ((-s / 2, s / 2, -0.01, 0.01), (-s / 2, s / 2, s - 0.01, s + 0.01),
                           (-s / 2 - 0.01, -s / 2 + 0.01, 0, s), (s / 2 - 0.01, s / 2 + 0.01, 0, s)):
        b.box(x0, x1, y0, y1, 0.08, 1.95, "glass")
    b.box(-0.2, 0.2, s - 0.25, s - 0.02, 0.95, 0.99, "metal_dark")   # shelf
    b.box(-0.13, 0.13, s - 0.14, s - 0.02, 1.15, 1.5, "metal")       # phone
    b.box(-0.16, 0.02, s - 0.2, s - 0.13, 1.42, 1.48, "black")       # handset
    bar(b, (-0.07, s - 0.17, 1.42), (-0.07, s - 0.2, 0.9), 0.01, "black")  # cord hanging


def p_bicycle(b):
    def wheel(cy):
        n = 14
        pts = [(0, cy + 0.33 * math.cos(2 * math.pi * i / n), 0.33 + 0.33 * math.sin(2 * math.pi * i / n)) for i in range(n)]
        for i in range(n):
            bar(b, pts[i], pts[(i + 1) % n], 0.035, "black")
        b.cyl((-0.05, cy, 0.33), 0.05, 0.05, 0.1, "metal", seg=8, rot=(0, 90, 0))
        for i in range(0, n, 2):
            bar(b, (0, cy, 0.33), pts[i], 0.006, "metal")
    wheel(-0.52); wheel(0.52)
    BB = (0, 0.0, 0.32); SEAT = (0, -0.18, 0.95); HEAD = (0, 0.4, 0.95)
    for p0, p1 in ((BB, SEAT), (BB, HEAD), ((0, -0.52, 0.33), BB), ((0, -0.52, 0.33), (0, -0.2, 0.85)),
                   (HEAD, (0, 0.52, 0.33)), (HEAD, (0, 0.36, 1.1))):
        bar(b, p0, p1, 0.035, "metal")
    b.box(-0.08, 0.08, -0.3, -0.06, 0.96, 1.01, "black")             # saddle
    bar(b, (-0.3, 0.33, 1.1), (0.3, 0.33, 1.1), 0.03, "metal")       # bars
    b.box(-0.18, 0.18, 0.48, 0.78, 0.82, 0.84, "metal_dark")          # basket
    for x0, x1, y0, y1 in ((-0.18, 0.18, 0.48, 0.5), (-0.18, 0.18, 0.76, 0.78), (-0.18, -0.16, 0.48, 0.78), (0.16, 0.18, 0.48, 0.78)):
        b.box(x0, x1, y0, y1, 0.82, 1.06, "metal_dark")
    b.box(-0.1, 0.1, -0.9, -0.48, 0.66, 0.69, "metal_dark")          # rear rack
    bar(b, (0.0, -0.4, 0.4), (0.12, -0.3, 0.0), 0.02, "metal_dark")  # kickstand


def p_trash(b):
    b.cyl((-0.6, 0.3, 0), 0.28, 0.3, 0.75, "metal_dark", seg=10)
    b.cyl((-0.6, 0.3, 0.75), 0.33, 0.31, 0.06, "metal_dark", seg=10)
    rnd = random.Random(7)
    for (x, y, s) in ((0.1, 0.2, 1.0), (0.5, 0.45, 0.85), (0.25, -0.15, 0.9), (0.75, 0.0, 0.7)):
        b.sphere((x, y, 0.22 * s), 0.3 * s, "plastic_bag", seg=8, rings=5, scale=(1.0, 0.9, 0.75))
        b.sphere((x + 0.05, y, 0.42 * s), 0.07 * s, "plastic_bag", seg=6, rings=4)
    b.boxc((-0.15, -0.45, 0.17), (0.5, 0.4, 0.34), "cardboard", rot=(0, 0, 15))
    b.boxc((0.6, -0.5, 0.1), (0.45, 0.3, 0.2), "cardboard", rot=(0, 8, -30))
    b.box(-0.2, 1.0, -0.2, 0.75, 0.0, 0.01, "black")                  # wet stain under the pile


def p_umbrella(b):
    m = T((0, 0, 0.18), (0, 70, 20))
    b.cyl((0, 0, 0), 0.5, 0.02, 0.3, "black", seg=8, pre=m, caps=False)
    bar(b, m @ Vector((0, 0, 0.3)), m @ Vector((0, 0, -0.45)), 0.015, "metal")


def p_puddles(b):
    pass


def p_torii(b):
    for x in (-1.4, 1.4):
        b.cyl((x, 0, 0), 0.24, 0.24, 0.3, "black", seg=10)
        b.cyl((x, 0, 0.3), 0.17, 0.15, 3.65, "red_paint", seg=10)
    b.box(-1.95, 1.95, -0.08, 0.08, 3.0, 3.2, "red_paint")            # nuki
    b.box(-0.08, 0.08, -0.06, 0.06, 3.2, 3.6, "red_paint")            # gakuzuka
    b.box(-0.22, 0.22, -0.1, -0.06, 3.22, 3.58, "black")
    txt_front(b, "神\n社", 0.13, "ink_white", 0, -0.105, 3.4)
    b.box(-2.1, 2.1, -0.12, 0.12, 3.6, 3.8, "red_paint")             # shimaki
    b.box(-1.1, 1.1, -0.15, 0.15, 3.8, 4.02, "black")                 # kasagi centre
    for s in (-1, 1):
        b.boxc((s * 1.75, 0, 3.95), (1.35, 0.3, 0.22), "black", rot=(0, -s * 7, 0))


def p_stone_lantern(b):
    b.cyl((0, 0, 0), 0.36, 0.32, 0.18, "stone", seg=6)
    b.cyl((0, 0, 0.18), 0.12, 0.1, 0.62, "stone", seg=8)
    b.cyl((0, 0, 0.8), 0.18, 0.3, 0.16, "stone", seg=6)
    for (x, y) in ((-0.16, -0.16), (0.16, -0.16), (-0.16, 0.16), (0.16, 0.16)):
        b.box(x - 0.04, x + 0.04, y - 0.04, y + 0.04, 0.96, 1.3, "stone")
    b.box(-0.13, 0.13, -0.13, 0.13, 0.96, 1.3, "black")
    b.cyl((0, 0, 1.3), 0.5, 0.12, 0.26, "stone", seg=6)
    b.sphere((0, 0, 1.62), 0.08, "stone", seg=6, rings=4)


def build_all():
    mod_izakaya(); mod_tobacco(); mod_pharmacy(); mod_machiya(); mod_apartment()
    prop("lantern_red", "prop", p_lantern_red, 0.4, 0.4, 0.75, [("ATTACH_hook", (0, -0.2, 0), dict(type="hang_from"))])
    prop("lantern_paper", "prop", p_lantern_paper, 0.5, 0.5, 1.0, [("ATTACH_hook", (0, 0, 0), dict(type="hang_from"))])
    prop("sign_vertical_snack", "prop", lambda b: sign_vertical(b, "sign_white", "スナック", "black"), 0.12, 0.75, 1.9,
         [("ATTACH_wall", (0, 0, 0), dict(type="facade", note="origin = top of the wall bracket; sign projects -Y"))])
    prop("sign_vertical_red", "prop", lambda b: sign_vertical(b, "red_paint", "酒処", "ink_white", h=1.5, w=0.5), 0.12, 0.65, 1.5,
         [("ATTACH_wall", (0, 0, 0), dict(type="facade"))])
    prop("sign_vertical_lit", "prop", lambda b: sign_vertical(b, "paper_glow", "旅館", "black", h=1.4, w=0.5), 0.12, 0.65, 1.4,
         [("ATTACH_wall", (0, 0, 0), dict(type="facade"))])
    prop("utility_pole", "prop", p_pole, 2.0, 1.6, 12.0,
         [("ATTACH_wire_" + n, p, dict(type="wire")) for n, p in POLE_ATTACH] +
         [("LIGHT_lamp", (0, -1.35, 5.75), dict(type="spot_down", note="flickers"))])
    prop("wire_set_20m", "prop", p_wireset, 1.8, 20.0, 1.2)
    prop("vending_machine", "prop", lambda b: p_vending(b, False), 1.0, 0.75, 1.83,
         [("LIGHT_panel", (0, -0.3, 1.35), dict(type="area", note="cold white glow"))])
    prop("vending_machine_red", "prop", lambda b: p_vending(b, True), 1.0, 0.75, 1.83,
         [("LIGHT_panel", (0, -0.3, 1.35), dict(type="area"))])
    prop("phone_booth", "prop", p_phone_booth, 1.05, 1.05, 2.3,
         [("DOOR_main", (0, 0, 0), dict(width=0.8, height=1.9, note="hiding is possible but you are visible through glass"))])
    prop("bicycle", "prop", p_bicycle, 0.6, 1.75, 1.1)
    prop("trash_pile", "prop", p_trash, 1.8, 1.2, 0.8)
    prop("umbrella_dropped", "prop", p_umbrella, 1.0, 1.0, 0.5)
    prop("torii", "prop", p_torii, 5.0, 0.5, 4.1, [("DOOR_pass", (0, 0, 0), dict(width=2.6, height=3.0))])
    prop("stone_lantern", "prop", p_stone_lantern, 0.72, 0.72, 1.7)
    build_puddles()


def build_puddles():
    c, root, _ = start("puddle_decals", dict(kind="decal", enterable=0, width=3.0, depth=1.5, height=0.01))
    for i, (sx, sy, x, rz) in enumerate(((1.6, 1.0, -1.6, 10), (2.4, 1.3, 0.6, -25), (0.9, 0.7, 2.4, 40))):
        me = bpy.data.meshes.new("puddle_%d" % i)
        hx, hy = sx / 2, sy / 2
        me.from_pydata([(-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0)], [], [(0, 1, 2, 3)])
        uv = me.uv_layers.new(name="UVMap")
        for li, uvv in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
            uv.data[li].uv = uvv
        me.materials.append(M("puddle"))
        ob = bpy.data.objects.new("puddle_%d" % i, me)
        ob.location = (x, 0, 0.006)
        ob.rotation_euler = (0, 0, math.radians(rz))
        c.objects.link(ob)
        ob.parent = root
    KIT["puddle_decals"] = dict(root=root, mesh=None, info=dict(root.items()))


def layout_kit():
    """Spread module roots on a grid for inspection (export zeroes them)."""
    x = 0.0
    for name, k in KIT.items():
        w = k["info"].get("width", 2)
        k["root"].location = (x + w / 2, -30.0, 0)
        x += w + 1.5
