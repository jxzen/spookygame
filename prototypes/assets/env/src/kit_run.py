# ENV-01 entry point. In Blender: exec(open(r"...\src\kit_run.py", encoding="utf-8").read())
# RUN = {"build": True, "render": None or list of camera names, "samples": 64, "tag": "it2"}
import bpy
SRC = r"C:\Users\jxzen\Documents\test_claude\epic_megajam_game\proto1\prototypes\assets\env\src\\"
for _f in ("kit_lib.py", "kit_modules.py", "kit_street.py"):
    exec(open(SRC + _f, encoding="utf-8").read(), globals())

RUN = globals().get("RUN", {"build": True, "render": None})
s = scene()
bpy.context.window.scene = s
if RUN.get("build", True):
    build_materials()
    build_all()
    layout_kit()
    coll("KIT").hide_render = True
    build_street()
    setup_render(s)
    cams = setup_lights_cams(s)
    bpy.data.objects["CAM_hide_torch"].data.energy = 0.0   # hiding: torch off
    build_rain(cams["CAM_street"].location)
    # street spill through the izakaya doorway (left module 1), so the hide interior is not pure black
    light(coll("STREET"), "L_spill_izakaya", "AREA", (-2.9, 8.2, 1.9), 25, (0.85, 0.88, 0.95), 1.4, rot=(0, 90, 0))
if RUN.get("render"):
    s.eevee.taa_render_samples = RUN.get("samples", 64)
    out = RUN.get("out", ROOT + r"\previews\\")
    for cn in RUN["render"]:
        s.camera = bpy.data.objects[cn]
        s.render.filepath = out + RUN.get("tag", "") + cn.replace("CAM_", "") + ".png"
        bpy.ops.render.render(write_still=True, scene=s.name)
    print("rendered", RUN["render"])
