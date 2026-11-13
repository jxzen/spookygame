# Elevated night platform module, 60 m. Blender coords: origin = platform centre on the track
# centreline at rail-top height; track along Y; platform on the -X side; platform top z = 1.25.
import math, random
import bpy, bmesh
import numpy as np
from lib import *

LEN = 60.0
Y0, Y1 = -LEN / 2, LEN / 2
TOP = 1.25
EDGE_X = -1.78
BACK_X = -10.0
PSD_X = -3.0
PSD_H = 1.2
GATE_W = 2.2


def glyph_image(name, w=512, h=128, seed=7, cells=8):
    """Abstract glyphs only: white stroke blocks on black, no real characters."""
    rng = random.Random(seed)
    a = np.zeros((h, w, 4), dtype=np.float32)
    a[..., 3] = 1
    cw = w // cells
    pad = cw // 6
    for c in range(cells):
        x0 = c * cw + pad
        size = cw - 2 * pad
        y0 = (h - size) // 2
        g = 4
        st = max(2, size // 12)
        for _ in range(rng.randint(3, 6)):
            if rng.random() < 0.5:   # horizontal stroke
                r = rng.randint(0, g)
                c0, c1 = sorted(rng.sample(range(g + 1), 2))
                yy = y0 + r * size // g
                a[max(0, yy - st):yy + st, x0 + c0 * size // g:x0 + c1 * size // g, :3] = 1
            else:
                cc = rng.randint(0, g)
                r0, r1 = sorted(rng.sample(range(g + 1), 2))
                xx = x0 + cc * size // g
                a[y0 + r0 * size // g:y0 + r1 * size // g, max(0, xx - st):xx + st, :3] = 1
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels.foreach_set(a.ravel())
    img.update()
    img.pack()
    return img


def build_platform(coll, gate_ys):
    concrete = mat('pf_concrete', (0.14, 0.14, 0.135), 0.85)
    deck = mat('pf_floor_tile', (0.16, 0.16, 0.155), 0.3)   # damp: low roughness
    coping = mat('pf_coping', (0.62, 0.62, 0.6), 0.4)
    tactile = mat('pf_tactile', (0.7, 0.7, 0.68), 0.6)       # pale grey, not yellow (palette)
    steel = mat('pf_steel', (0.3, 0.3, 0.32), 0.4, 0.6)
    dark = mat('pf_dark', (0.05, 0.05, 0.055), 0.6)
    red = mat('pf_red', (0.55, 0.01, 0.01), 0.45)
    lampw = mat('pf_lamp', (0.9, 0.9, 0.88), 0.3, emit=(0.95, 0.95, 0.9), emit_strength=6)
    lampr = mat('pf_lamp_red', (0.6, 0.0, 0.0), 0.3, emit=(1.0, 0.02, 0.01), emit_strength=8)
    gatep = mat('pf_gate', (0.55, 0.55, 0.55), 0.3, 0.3)
    glassd = mat('pf_glass_dark', (0.03, 0.03, 0.035), 0.08)
    rail = mat('pf_rail', (0.35, 0.35, 0.36), 0.25, 1.0)
    signimg = glyph_image('glyphs_sign', seed=11)
    floorimg = glyph_image('glyphs_floor', 256, 64, seed=3, cells=4)
    signm = tex_mat('pf_sign_glyphs', signimg, 2.0)
    floorm = tex_mat('pf_floor_glyphs', floorimg, 0.3)
    root = empty('platform', coll=coll, size=1.0)
    lights = []

    # --- track bed, rails, viaduct, far noise wall
    bm = bmesh.new()
    add_box_mm(bm, -1.3, 1.3, Y0, Y1, -0.45, -0.17, 0)          # slab track
    add_box_mm(bm, EDGE_X, 3.8, Y0, Y1, -1.2, -0.45, 0)          # trackbed
    add_box_mm(bm, -10.5, 4.0, Y0, Y1, -2.4, -1.2, 0)            # viaduct deck
    add_box_mm(bm, 3.6, 3.85, Y0, Y1, -1.2, 1.05, 0)            # noise wall
    for py in (-20, 0, 20):
        add_box_mm(bm, -4.5, 0.5, py - 1.2, py + 1.2, -14.0, -2.4, 0)   # piers
    for xr in (-0.7175, 0.7175):
        add_box_mm(bm, xr - 0.035, xr + 0.035, Y0, Y1, -0.17, 0.0, 1)
    obj_from_bm('track_viaduct', bm, [concrete, rail], parent=root, coll=coll)

    # --- platform deck with stair well hole
    hx0, hx1, hy0, hy1 = -9.2, -6.8, -6.0, 2.0
    bm = bmesh.new()
    def slab(x0, x1, y0, y1):
        add_box_mm(bm, x0, x1, y0, y1, -1.2, TOP, 0)
    slab(BACK_X, EDGE_X - 0.4, Y0, hy0)
    slab(BACK_X, EDGE_X - 0.4, hy1, Y1)
    slab(BACK_X, hx0, hy0, hy1)
    slab(hx1, EDGE_X - 0.4, hy0, hy1)
    add_box_mm(bm, EDGE_X - 0.4, EDGE_X, Y0, Y1, -1.2, TOP + 0.005, 1)   # edge coping
    add_box_mm(bm, -3.85, -3.55, Y0, Y1, TOP, TOP + 0.01, 2)             # tactile line
    # stairs down (toward -Y)
    for i in range(26):
        z = TOP - (i + 1) * 0.17
        y = hy1 - i * 0.3
        add_box_mm(bm, hx0, hx1, y - 0.3, y, z - 0.17, z, 0)
    obj_from_bm('platform_deck', bm, [deck, coping, tactile], parent=root, coll=coll)
    empty('SPAWN_stairs_top', (-8.0, hy1 + 0.8, TOP), parent=root, coll=coll)

    # --- platform screen doors: fixed housings with red end stripes, sliding leaves (named)
    bm = bmesh.new()
    openings = sorted(y for y in gate_ys if Y0 + 1.5 < y < Y1 - 1.5)
    edges = [Y0 + 0.3]
    for y in openings:
        edges += [y - GATE_W / 2, y + GATE_W / 2]
    edges.append(Y1 - 0.3)
    leaves = []
    for a, b in zip(edges[::2], edges[1::2]):
        if b - a < 0.3:
            continue
        add_box_mm(bm, PSD_X - 0.14, PSD_X + 0.14, a, b, TOP, TOP + PSD_H, 0)
        for ye, s in ((a, -1), (b, 1)):
            add_box_mm(bm, PSD_X - 0.06, PSD_X + 0.06, ye + s * 0.001 - (0.0 if s > 0 else 0), ye + s * 0.012, TOP + 0.15, TOP + PSD_H - 0.1, 1)
    ob = obj_from_bm('psd_housings', bm, [gatep, red], parent=root, coll=coll)
    for i, y in enumerate(openings):
        for part, s in (('a', -1), ('b', 1)):
            lb = bmesh.new()
            add_box(lb, (0, 0, 0), (0.04, GATE_W / 2 - 0.02, 1.05), 0)
            add_box(lb, (0, 0, 0.3), (0.045, GATE_W / 2 - 0.25, 0.25), 1)
            name = 'PSD_%02d_%s' % (i + 1, part)
            loc = (PSD_X, y + s * GATE_W / 4, TOP + 0.6)
            obj_from_bm(name, lb, [gatep, glassd], parent=root, coll=coll, location=loc)
            leaves.append(dict(node=name, local=loc, slide=(0, s * (GATE_W / 2), 0)))
        # floor glyph plate at each car-door stop
        fb = bmesh.new()
        add_quad(fb, [(-4.5, y - 0.6, TOP + 0.012), (-4.1, y - 0.6, TOP + 0.012), (-4.1, y + 0.6, TOP + 0.012), (-4.5, y + 0.6, TOP + 0.012)], 0)
        obj_from_bm('floor_glyph_%02d' % (i + 1), fb, [floorm], parent=root, coll=coll)

    # --- canopy: columns, beams, roof, light fixtures
    bm = bmesh.new()
    roof_z = 6.0
    for y in range(-25, 26, 10):
        add_box_mm(bm, -6.2, -5.8, y - 0.2, y + 0.2, TOP, roof_z, 0)
    add_box_mm(bm, -6.25, -5.75, Y0, Y1, roof_z - 0.5, roof_z, 0)
    for y in np.arange(Y0, Y1 + 0.01, 5.0):
        add_box_mm(bm, -10.5, -0.3, y - 0.1, y + 0.1, roof_z - 0.4, roof_z, 0)
    add_box_mm(bm, -10.6, -0.2, Y0, Y1, roof_z, roof_z + 0.18, 1)
    obj_from_bm('canopy', bm, [steel, dark], parent=root, coll=coll)
    bm = bmesh.new()
    n = 0
    for y in np.arange(Y0 + 2.5, Y1, 5.0):
        for x in (-3.4, -8.2):
            add_box_mm(bm, x - 0.08, x + 0.08, y - 0.7, y + 0.7, roof_z - 0.52, roof_z - 0.42, 0)
            n += 1
            e = empty('LIGHT_platform_%02d' % n, (x, y, roof_z - 0.6), parent=root, coll=coll)
            lights.append(e.name)
    obj_from_bm('canopy_lamps', bm, [lampw], parent=root, coll=coll)
    # the single red lamp at the rear (tail) end of the platform
    bm = bmesh.new()
    ry = Y0 + 6.0
    add_box_mm(bm, -5.03, -4.97, ry - 0.03, ry + 0.03, 4.75, roof_z - 0.4, 1)
    add_cyl(bm, (-5.0, ry, 4.6), 0.18, 0.3, 'Z', 10, 0)
    obj_from_bm('red_lamp', bm, [lampr, dark], parent=root, coll=coll)
    e = empty('LIGHT_red_lamp', (-5.0, ry, 4.4), parent=root, coll=coll)
    lights.append(e.name)

    # --- back wall with dark glazing, end railings, stair railings, kiosk, benches
    bm = bmesh.new()
    add_box_mm(bm, BACK_X - 0.3, BACK_X, Y0, Y1, TOP, 3.0, 0)
    add_box_mm(bm, BACK_X - 0.25, BACK_X - 0.05, Y0, Y1, 3.0, roof_z - 0.4, 2)
    for y in np.arange(Y0, Y1 + 0.01, 2.5):
        add_box_mm(bm, BACK_X - 0.06, BACK_X + 0.04, y - 0.05, y + 0.05, 3.0, roof_z - 0.4, 1)
    for ye in (Y0 + 0.05, Y1 - 0.05):
        add_box_mm(bm, BACK_X, EDGE_X - 0.3, ye - 0.03, ye + 0.03, TOP + 1.05, TOP + 1.1, 1)
        add_box_mm(bm, BACK_X, EDGE_X - 0.3, ye - 0.02, ye + 0.02, TOP + 0.5, TOP + 0.53, 1)
        for x in np.arange(BACK_X, EDGE_X - 0.2, 1.0):
            add_box_mm(bm, x - 0.03, x + 0.03, ye - 0.03, ye + 0.03, TOP, TOP + 1.1, 1)
    for x0, x1, y0, y1 in ((hx0, hx1, hy0 - 0.03, hy0 + 0.03), (hx0 - 0.03, hx0 + 0.03, hy0, hy1), (hx1 - 0.03, hx1 + 0.03, hy0, hy1)):
        add_box_mm(bm, x0, x1, y0, y1, TOP + 1.0, TOP + 1.06, 1)
        add_box_mm(bm, x0, x1, y0, y1, TOP, TOP + 0.08, 1)
    # kiosk (shuttered, dark)
    add_box_mm(bm, BACK_X, -7.6, 10.0, 16.0, TOP, 3.9, 0)
    for z in np.arange(TOP + 0.2, 3.3, 0.12):
        add_box_mm(bm, -7.62, -7.58, 10.3, 15.7, z, z + 0.05, 1)
    for by in (-16.0, 21.0, 25.0):
        add_box_mm(bm, -9.3, -8.7, by - 0.9, by + 0.9, TOP + 0.42, TOP + 0.47, 1)
        add_box_mm(bm, -9.3, -9.24, by - 0.9, by + 0.9, TOP + 0.47, TOP + 0.9, 1)
        for dy in (-0.75, 0.75):
            add_box_mm(bm, -9.2, -8.8, by + dy - 0.03, by + dy + 0.03, TOP, TOP + 0.42, 1)
    obj_from_bm('walls_furniture', bm, [concrete, steel, glassd], parent=root, coll=coll)

    # --- hanging signs with abstract glyphs (both faces)
    for i, sy in enumerate((-20.0, 0.0, 20.0)):
        bm = bmesh.new()
        add_box_mm(bm, -4.55, -4.45, sy - 1.25, sy + 1.25, 4.6, 5.2, 0)
        add_box_mm(bm, -4.51, -4.49, sy - 0.9, sy - 0.85, 5.2, roof_z - 0.4, 1)
        add_box_mm(bm, -4.51, -4.49, sy + 0.85, sy + 0.9, 5.2, roof_z - 0.4, 1)
        for x, flip in ((-4.56, False), (-4.44, True)):
            pts = [(x, sy - 1.2, 4.65), (x, sy + 1.2, 4.65), (x, sy + 1.2, 5.15), (x, sy - 1.2, 5.15)]
            if not flip:
                pts = [pts[1], pts[0], pts[3], pts[2]]
            f = add_quad(bm, pts, 2)
        ob = obj_from_bm('sign_%02d' % (i + 1), bm, [dark, steel, signm], parent=root, coll=coll)
        me = ob.data
        uv = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            if poly.material_index == 2:
                for li, vi in zip(poly.loop_indices, poly.vertices):
                    co = me.vertices[vi].co
                    u = (co.y - (sy - 1.2)) / 2.4
                    if co.x > -4.5:
                        u = 1 - u
                    uv.data[li].uv = (u, (co.z - 4.65) / 0.5)
    for ob in coll.objects:
        if ob.name.startswith('floor_glyph'):
            me = ob.data
            uv = me.uv_layers.new(name='UVMap')
            for li, (u, v) in zip(range(4), ((0, 0), (0, 1), (1, 1), (1, 0))):
                uv.data[li].uv = (v, u)

    # --- catenary masts and wire (far side)
    bm = bmesh.new()
    for my in (-24.0, 24.0):
        add_box_mm(bm, 3.15, 3.45, my - 0.15, my + 0.15, -0.45, 7.2, 0)
        add_box_mm(bm, -0.2, 3.3, my - 0.06, my + 0.06, 6.7, 6.85, 0)
        add_box_mm(bm, -0.02, 0.02, my - 0.02, my + 0.02, 5.0, 6.7, 0)
    add_box_mm(bm, -0.012, 0.012, Y0, Y1, 5.0, 5.025, 0)
    add_box_mm(bm, -0.012, 0.012, Y0, Y1, 6.3, 6.325, 0)
    obj_from_bm('catenary', bm, [steel], parent=root, coll=coll)

    return root, lights, leaves, openings
