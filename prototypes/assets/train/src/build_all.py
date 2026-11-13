# Build the bullet train + platform, export GLBs and train.json, save the .blend for previews.
# Run: "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b --factory-startup --python build_all.py
import os, sys, json
SRC = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SRC)
import bpy
from mathutils import Vector
from lib import *
import train as T
import platform_mod as P

OUT = os.path.dirname(SRC)
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob)

# ---------------- materials (palette: white / greys / black, one red)
body = mat('tr_body_white', (0.86, 0.86, 0.85), 0.22, coat=0.6)
skirt = mat('tr_skirt_grey', (0.42, 0.43, 0.45), 0.35)
stripe = mat('tr_stripe_red', (0.55, 0.01, 0.015), 0.3, coat=0.6)
glass = mat('tr_window_dark', (0.012, 0.013, 0.016), 0.05, coat=1.0)
lamp_w = mat('tr_headlamp', (0.9, 0.9, 0.9), 0.1, emit=(1, 0.97, 0.9), emit_strength=8)
lamp_r = mat('tr_taillamp_red', (0.5, 0.0, 0.0), 0.1, emit=(1, 0.02, 0.01), emit_strength=8)
under = mat('tr_under_dark', (0.06, 0.06, 0.065), 0.7)
mech = mat('tr_mech_dark', (0.09, 0.09, 0.1), 0.6, 0.5)
steel = mat('tr_steel', (0.4, 0.4, 0.42), 0.3, 1.0)
i_floor = mat('in_floor', (0.11, 0.105, 0.1), 0.8)
i_wall = mat('in_wall_warmgrey', (0.5, 0.48, 0.45), 0.6)
i_seat = mat('in_seat_fabric', (0.2, 0.205, 0.22), 0.9)
i_cover = mat('in_headrest_cover', (0.66, 0.64, 0.6), 0.85)
i_light = mat('in_light_strip', (0.95, 0.9, 0.82), 0.3, emit=(1.0, 0.9, 0.76), emit_strength=6)
i_dark = mat('in_dark', (0.05, 0.05, 0.05), 0.6)
i_ceil = mat('in_ceiling', (0.62, 0.61, 0.59), 0.5)
i_glass = mat('in_window_glass', (0.02, 0.022, 0.026), 0.03, alpha=0.3)

tc = collection('TRAIN')
root = empty('shinkansen', coll=tc, size=2.0)
cars_spec = [('car_1_lead', 'lead', 27.0), ('car_2', 'mid', 25.0), ('car_3', 'mid', 25.0), ('car_4_tail', 'tail', 27.0)]
y = 0.0
cars, doors_all = [], []
counter = {'L': 0, 'R': 0}
interior_info = None
for name, kind, L in cars_spec:
    car = empty(name, (0, y, 0), parent=root, coll=tc, size=1.0)
    interior = name == 'car_2'
    lamp = lamp_r if kind == 'tail' else lamp_w
    bod, doors, wins = T.build_body(name, kind, L, interior, [body, skirt, stripe, glass, lamp, under], car, tc, inner_mat=i_wall)
    doors_all += T.build_doors(name, doors, L, car, [body, glass], tc, counter)
    T.build_under(name, kind, L, [mech, steel], car, tc, pantograph=(name == 'car_3'))
    if interior:
        iob, gob, rows, parts = T.build_interior(name, L, doors, wins, [i_floor, i_wall, i_seat, i_cover, i_light, i_dark, i_ceil, i_glass], car, tc)
        lnames = []
        for i, ly in enumerate([parts[0] - 1.0 - k * 3.6 for k in range(6)]):
            e = empty('LIGHT_interior_%02d' % (i + 1), (0, ly, 3.1), parent=car, coll=tc)
            lnames.append(e.name)
        mid = rows[len(rows) // 2]
        e1 = empty('CAM_interior_window', (-1.0, mid - 0.1, T.FLOOR + 1.2), parent=car, coll=tc)
        e1t = empty('CAM_interior_window_look', (-6.0, mid + 0.9, T.FLOOR + 1.1), parent=car, coll=tc)
        e2 = empty('CAM_interior_aisle', (-0.38, parts[1] + 0.6, T.FLOOR + 1.62), parent=car, coll=tc)
        e2t = empty('CAM_interior_aisle_look', (-0.38, parts[0], T.FLOOR + 1.3), parent=car, coll=tc)
        interior_info = dict(car=name, rows=rows, partitions=parts, lights=lnames, cams=[e1, e1t, e2, e2t])
    cars.append(dict(node=name, kind=kind, length=L, front_y=y, doors=doors, wins=wins))
    y -= L + T.CAR_GAP

bpy.context.view_layer.update()
train_objs = list(tc.objects)
tris_train = tri_count(train_objs)
print('TRAIN_TRIS', tris_train)

# ---------------- platform: train stops with its nose tip at the platform's +Y end (y = +30)
STOP = P.Y1
gate_ys = []
for c in cars:
    for d in c['doors']:
        gate_ys.append(STOP + c['front_y'] + d)
pc = collection('PLATFORM')
proot, plights, leaves, openings = P.build_platform(pc, gate_ys)
bpy.context.view_layer.update()
plat_objs = list(pc.objects)
tris_plat = tri_count(plat_objs)
print('PLATFORM_TRIS', tris_plat)

# ---------------- export
export_glb(os.path.join(OUT, 'shinkansen.glb'), train_objs)
export_glb(os.path.join(OUT, 'platform.glb'), plat_objs)

# ---------------- train.json (three.js coordinates: x, y up, z = -blender y)
def tw(ob):
    return to_three(ob.matrix_world.translation)

doors_json = []
for d in doors_all:
    ob = bpy.data.objects[d['node']]
    s = d['slide']
    doors_json.append(dict(node=d['node'], car=d['car'], side=d['side'], centre=tw(ob),
                           size=[0.024, T.DOOR_Z[1] - T.DOOR_Z[0], T.DOOR_W],
                           open_offset=[round(s[0], 3), 0.0, round(-s[1], 3)],
                           real_opening=(d['car'] == interior_info['car'])))
cams = interior_info['cams']
data = {
    'about': 'Generic bullet train (W2-TRAIN). three.js coordinates, metres, +Y up, train front toward -Z.',
    'origin': 'shinkansen root = nose tip of car_1_lead, track centreline, rail-top height (y=0)',
    'nodes_note': 'Every node carries translation only (no rotation/scale). Doors pivot at their centre.',
    'tris': {'shinkansen.glb': tris_train, 'platform.glb': tris_plat},
    'cars': [dict(node=c['node'], kind=c['kind'], length_m=c['length'], z_front=round(-c['front_y'], 3),
                  z_back=round(-c['front_y'] + c['length'], 3),
                  nose_length_m=(T.NOSE_L if c['kind'] in ('lead', 'tail') else 0)) for c in cars],
    'car_gap_m': T.CAR_GAP, 'body_width_m': T.HALF_W * 2, 'roof_height_m': T.Z1, 'floor_height_m': T.FLOOR,
    'doors': doors_json,
    'door_open': 'Add open_offset to the door node position (ease 0.6-0.9 s). Only car_2 has real openings and an interior; other cars show body behind an open door.',
    'interior': {
        'car': interior_info['car'],
        'floor_y': T.FLOOR,
        'saloon_z_range': [round(-(cars[1]['front_y'] + interior_info['partitions'][0]), 3), round(-(cars[1]['front_y'] + interior_info['partitions'][1]), 3)],
        'aisle_x': [-0.8, 0.05],
        'camera_window_seat': {'node': 'CAM_interior_window', 'pos': tw(cams[0]), 'look_at': tw(cams[1]),
                               'note': 'left (platform side) window seat, looking out and forward: the escape shot'},
        'camera_aisle': {'node': 'CAM_interior_aisle', 'pos': tw(cams[2]), 'look_at': tw(cams[3])},
        'light_nodes': interior_info['lights'], 'light_colour': '#ffe6c2 (warm grey)',
    },
    'platform': {
        'file': 'platform.glb',
        'origin': 'platform centre on the track centreline at rail-top height',
        'length_m': P.LEN, 'surface_y': P.TOP,
        'edge_line': [[P.EDGE_X, P.TOP, -P.Y1], [P.EDGE_X, P.TOP, -P.Y0]],
        'screen_door_line_x': P.PSD_X, 'screen_door_height_m': P.PSD_H,
        'train_root_in_platform': [0.0, 0.0, -P.Y1],
        'train_note': 'Place the shinkansen root at train_root_in_platform (platform-local) and the car doors line up with the PSD gates. Train departs toward -Z.',
        'psd_gates': [dict(node=l['node'], centre=to_three(l['local']), open_offset=[0.0, 0.0, round(-l['slide'][1], 3)]) for l in leaves],
        'light_nodes': plights,
        'red_lamp_node': 'LIGHT_red_lamp',
        'spawn_node': 'SPAWN_stairs_top',
        'signage': 'abstract glyphs only (procedural texture), no real text',
    },
}
with open(os.path.join(OUT, 'train.json'), 'w') as f:
    json.dump(data, f, indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'train_platform.blend'))
print('BUILD_OK')
