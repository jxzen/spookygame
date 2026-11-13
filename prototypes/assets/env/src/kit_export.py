# ENV-01: export each kit module to GLB (three.js r128, +Y up) and write kit.json. Exec after kit_run.py (build).
import bpy, json, os


def to_three(v):
    """Blender (x, y, z) Z-up -> glTF/three.js (x, y, z) Y-up."""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


def export_kit():
    s = scene()
    bpy.context.window.scene = s
    vl = bpy.context.view_layer
    coll("KIT").hide_viewport = False
    modules = []
    for name, k in KIT.items():
        root = k["root"]
        saved = root.location.copy()
        root.location = (0, 0, 0)
        vl.update()
        for o in s.objects:
            o.select_set(False)
        objs = [root] + list(root.children)
        for o in objs:
            o.select_set(True)
        vl.objects.active = root
        has_alpha = name == "puddle_decals"
        path = os.path.join(ROOT, name + ".glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                                  export_apply=True, export_extras=True, export_cameras=False,
                                  export_lights=False, export_image_format="AUTO" if has_alpha else "JPEG",
                                  export_jpeg_quality=85, use_active_scene=True)
        root.location = saved
        meshes = [o for o in root.children if o.type == "MESH"]
        tri = sum(tris(o) for o in meshes)
        info = dict(root.items())
        marks = {"doors": [], "hide_spots": [], "attach": [], "lights": [], "other": []}
        for o in root.children:
            if o.type != "EMPTY":
                continue
            nm = o.name.split(".")[0]
            entry = {"name": nm, "pos": to_three(o.location), "pos_blender": [round(c, 3) for c in o.location]}
            entry.update({kk: vv for kk, vv in o.items() if isinstance(vv, (int, float, str))})
            key = ("doors" if nm.startswith("DOOR") else "hide_spots" if nm.startswith("HIDE")
                   else "attach" if nm.startswith("ATTACH") else "lights" if nm.startswith("LIGHT") else "other")
            marks[key].append(entry)
        modules.append({
            "name": name,
            "file": name + ".glb",
            "kind": info.get("kind"),
            "enterable": bool(info.get("enterable", 0)),
            "footprint_m": {"width": info.get("width"), "depth": info.get("depth")},
            "height_m": info.get("height"),
            "tris": tri,
            "bytes": os.path.getsize(path),
            **{kk: vv for kk, vv in marks.items() if vv},
        })
        print(name, tri, os.path.getsize(path))
    kit = {
        "kit": "ENV-01 japan noir town kit",
        "version": "0.1 (2026-11-12)",
        "units": "metres",
        "up": "+Y (three.js / glTF)",
        "origin": "street-front bottom centre of each module",
        "facing": "street front faces +Z; module body extends toward -Z; width along X",
        "coords_note": "pos = three.js coords of marker nodes (also present as named empty nodes in each GLB, with extras); pos_blender = source coords (Z-up, front faces -Y)",
        "placement": "left side of a street running along -Z: rotate +90 deg about Y; right side: -90 deg. Street lane width used in the preview: 5.0 m",
        "palette": "greys/black; red only for lanterns, torii, tobacco sign, one vending machine, pharmacy lettering",
        "materials": "PBR metallic-roughness; baseColor + ORM (G=roughness, B=metal) 256px textures per material; emissive for lanterns/signs/vending glow (KHR_materials_emissive_strength ignored by r128: emissive factor alone gives the glow)",
        "modules": modules,
    }
    with open(os.path.join(ROOT, "kit.json"), "w", encoding="utf-8") as f:
        json.dump(kit, f, ensure_ascii=False, indent=1)
    return kit
