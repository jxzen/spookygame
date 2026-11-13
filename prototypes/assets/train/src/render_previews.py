# Render previews from train_platform.blend (render-only lights/fog/cameras; nothing is exported).
# Run: blender -b src/train_platform.blend --python src/render_previews.py -- [shot ...]
import os, sys, math
import bpy
from mathutils import Vector

SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(SRC), 'previews')
os.makedirs(OUT, exist_ok=True)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
sc = bpy.context.scene
for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        pass
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.render.image_settings.file_format = 'PNG'
try:
    sc.eevee.taa_render_samples = 48
    sc.eevee.use_shadows = True
    sc.eevee.volumetric_end = 160
    sc.eevee.volumetric_tile_size = '4'
    sc.eevee.shadow_pool_size = '1024'
except Exception as e:
    print('eevee setting', e)
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items] else 'None'

world = bpy.data.worlds.new('night')
sc.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (0.012, 0.012, 0.014, 1)
bg.inputs['Strength'].default_value = 1.0

train_root = bpy.data.objects['shinkansen']
plat_coll = bpy.data.collections['PLATFORM']
render_coll = bpy.data.collections.new('RENDER_ONLY')
sc.collection.children.link(render_coll)


def light(name, kind, loc, energy, color, size=0.5, rot=None, shadow=True):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if hasattr(ld, 'use_shadow'):
        ld.use_shadow = shadow
    if kind == 'AREA':
        ld.size = size
    elif kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = size
    ob = bpy.data.objects.new(name, ld)
    render_coll.objects.link(ob)
    ob.location = loc
    if rot:
        ob.rotation_euler = rot
    return ob


def camera(name, loc, target, lens=35):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start = 0.05
    cd.clip_end = 400
    ob = bpy.data.objects.new(name, cd)
    render_coll.objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return ob


def fog(density, center=(0, 0, 3), size=(160, 260, 60)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    ob = bpy.context.active_object
    ob.name = 'fog_volume'
    ob.scale = size
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    render_coll.objects.link(ob)
    m = bpy.data.materials.new('fog')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type == 'BSDF_PRINCIPLED':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    pv = nt.nodes.new('ShaderNodeVolumePrincipled')
    pv.inputs['Density'].default_value = density
    pv.inputs['Color'].default_value = (0.35, 0.35, 0.37, 1)
    nt.links.new(pv.outputs[0], out.inputs['Volume'])
    ob.data.materials.append(m)
    return ob


def ground(z):
    bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, z))
    ob = bpy.context.active_object
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    render_coll.objects.link(ob)
    m = bpy.data.materials.new('ground')
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0.03, 0.03, 0.03, 1)
    b.inputs['Roughness'].default_value = 0.3
    ob.data.materials.append(m)
    return ob


def render(name, cam):
    sc.camera = cam
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)


# lights at the named empties (render-only)
for ob in list(bpy.data.objects):
    if ob.name.startswith('LIGHT_platform'):
        light('L_' + ob.name, 'AREA', ob.matrix_world.translation, 70, (0.92, 0.95, 1.0), 1.4, shadow=(int(ob.name[-2:]) % 3 == 0))
    elif ob.name == 'LIGHT_red_lamp':
        light('L_red', 'POINT', ob.matrix_world.translation, 70, (1.0, 0.05, 0.03), 0.2)
    elif ob.name.startswith('LIGHT_interior'):
        lo = light('L_' + ob.name, 'POINT', (0, 0, -0.15), 140, (1.0, 0.88, 0.72), 0.3); lo.parent = ob

shots = argv or ['side', 'threequarter', 'nose', 'interior', 'interior_window', 'platform_night', 'platform_edge', 'platform_wide']

# --- studio-ish night set for the train-only shots
def train_set():
    plat_coll.hide_render = True
    train_root.location = (0, 0, 0)
    g = ground(-0.05)
    moon = light('moon', 'SUN', (0, 0, 20), 0.6, (0.8, 0.85, 1.0), rot=(math.radians(55), 0, math.radians(-60)))
    key = light('key', 'AREA', (-14, 8, 9), 9000, (1, 1, 1), 12, rot=(math.radians(60), 0, math.radians(-120)))
    rim = light('rim', 'AREA', (10, -30, 8), 6000, (0.9, 0.92, 1.0), 14, rot=(math.radians(60), 0, math.radians(30)))
    return [g, moon, key, rim]


temp = []
if any(s in shots for s in ('side', 'threequarter', 'nose')):
    temp = train_set()
    if 'side' in shots:
        c = camera('cam_side', (-70, -52, 2.2), (0, -52, 2.0), 35)
        c.data.type = 'ORTHO'
        c.data.ortho_scale = 112
        render('preview_side', c)
    if 'threequarter' in shots:
        render('preview_threequarter', camera('cam_3q', (-16, 14, 5.0), (0, -18, 1.4), 30))
    if 'nose' in shots:
        render('preview_nose', camera('cam_nose', (-6.5, 3.5, 1.6), (0, -6, 1.6), 30))
    for o in temp:
        bpy.data.objects.remove(o)

# --- platform at night with fog; train stopped at the platform (tip at platform +Y end)
plat_coll.hide_render = False
train_root.location = (0, 30, 0)
bpy.context.view_layer.update()
ground(-14.0)
fog(0.012)
light('city_glow', 'AREA', (40, 0, 30), 4000, (0.75, 0.78, 0.85), 60, rot=(0, math.radians(-60), 0))
if 'platform_night' in shots:
    render('preview_platform_night', camera('cam_plat', (-8.6, -28.5, 2.9), (-1.0, 12, 1.9), 24))
if 'platform_edge' in shots:
    render('preview_platform_edge', camera('cam_edge', (-4.4, -27.0, 2.85), (-1.2, 20, 2.1), 28))
if 'platform_wide' in shots:
    render('preview_platform_wide', camera('cam_plat_w', (14, -40, 7), (-4, 5, 2), 28))
if 'interior' in shots:
    a, t = bpy.data.objects['CAM_interior_aisle'], bpy.data.objects['CAM_interior_aisle_look']
    render('preview_interior', camera('cam_int', a.matrix_world.translation, t.matrix_world.translation, 18))
if 'interior_window' in shots:
    a, t = bpy.data.objects['CAM_interior_window'], bpy.data.objects['CAM_interior_window_look']
    render('preview_interior_window', camera('cam_win', a.matrix_world.translation, t.matrix_world.translation, 20))
print('PREVIEWS_OK')
