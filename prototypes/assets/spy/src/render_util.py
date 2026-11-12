# Preview renders for the spy assets (EEVEE studio + Workbench silhouettes).
import bpy, os, math
from mathutils import Vector
from geo import box, material, set_engine, use_action, select_only


def look_cam(name, loc, target, lens=None, ortho=None):
    cd = bpy.data.cameras.new(name)
    cam = bpy.data.objects.new(name, cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    if ortho:
        cd.type = "ORTHO"
        cd.ortho_scale = ortho
    if lens:
        cd.lens = lens
    cd.clip_end = 100
    return cam


def light(name, kind, loc, target, energy, size=1.0, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == "AREA":
        ld.size = size
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = Vector(loc)
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


def studio(scene, H, ladder=True):
    w = scene.world or bpy.data.worlds.new("w")
    scene.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.035, 0.035, 0.035, 1)
    bg.inputs[1].default_value = 1.0
    extra = []
    fl = box("floor", (0, 0, -0.005), (8, 8, 0.01), material("floor", (0.12, 0.12, 0.12), 0.6))
    extra.append(fl)
    if ladder:
        lm = material("ladder", (0.5, 0.5, 0.5), 0.9)
        rm = material("ladder_red", (0.6, 0.05, 0.05), 0.9)
        for k in range(0, 16):
            z = k * H / 2
            m = rm if k % 2 == 0 else lm
            t = 0.006 if k % 2 == 0 else 0.003
            extra.append(box("lad_f%d" % k, (0, 0.7, z), (1.4, 0.004, t), m))
            extra.append(box("lad_s%d" % k, (-0.7, 0, z), (0.004, 1.4, t), m))
    extra.append(light("key", "AREA", (-1.6, -2.6, 3.2), (0, 0, 1.1), 320, 1.5))
    extra.append(light("rim", "AREA", (1.8, 2.4, 2.6), (0, 0, 1.3), 600, 1.0))
    extra.append(light("fill", "AREA", (2.5, -2.0, 1.0), (0, 0, 1.0), 50, 2.0))
    return extra


def render(scene, cam, path, res=(800, 1000)):
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


def eevee(scene):
    e = set_engine(scene)
    try:
        scene.eevee.taa_render_samples = 32
    except Exception:
        pass
    scene.view_settings.view_transform = "Standard"
    return e


def workbench_silhouette(scene):
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "FLAT"
    sh.color_type = "SINGLE"
    sh.single_color = (0, 0, 0)
    sh.background_type = "VIEWPORT"
    sh.background_color = (1, 1, 1)
    sh.show_shadows = False
    sh.show_cavity = False
    scene.view_settings.view_transform = "Standard"


def hide(objs, flag):
    for o in objs:
        o.hide_render = flag


def render_character(scene, arm, spy, acts, out, H, tag=""):
    extra = studio(scene, H)
    print("ENGINE", eevee(scene))
    ladder = [o for o in extra if o.name.startswith("lad_")]
    cams = {
        "front": look_cam("cam_front", (0, -8, 1.0), (0, 0, 1.0), ortho=2.25),
        "side": look_cam("cam_side", (8, 0, 1.0), (0, 0, 1.0), ortho=2.25),
        "threequarter": look_cam("cam_3q", (2.6, -3.9, 1.55), (0, 0, 1.0), lens=60),
        "title": look_cam("cam_title", (0.35, -1.6, 1.68), (0, 0, 1.62), lens=70),
    }
    use_action(arm, acts["idle"])
    scene.frame_set(1)
    render(scene, cams["front"], os.path.join(out, "spy_front%s.png" % tag))
    render(scene, cams["side"], os.path.join(out, "spy_side%s.png" % tag))
    hide(ladder, True)
    render(scene, cams["threequarter"], os.path.join(out, "spy_threequarter%s.png" % tag))
    use_action(arm, acts["walk"])
    scene.frame_set(9)
    render(scene, cams["threequarter"], os.path.join(out, "spy_walk%s.png" % tag))
    use_action(arm, acts["title"])
    for f in (1, 150):
        scene.frame_set(f)
        render(scene, cams["title"], os.path.join(out, "spy_title_f%03d%s.png" % (f, tag)), (800, 800))
    # silhouettes
    hide(extra, True)
    workbench_silhouette(scene)
    use_action(arm, acts["idle"])
    scene.frame_set(1)
    render(scene, cams["front"], os.path.join(out, "spy_silhouette_front%s.png" % tag))
    render(scene, cams["threequarter"], os.path.join(out, "spy_silhouette_threequarter%s.png" % tag))
    use_action(arm, acts["walk"])
    scene.frame_set(9)
    render(scene, cams["side"], os.path.join(out, "spy_silhouette_walk_side%s.png" % tag))
