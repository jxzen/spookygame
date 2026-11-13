# Log: japan-noir-street / ENV-01 kit

Evidence labels: [fetched] retrieved from the web this session; [measured] computed from pixels or files; [observed] seen in a render or screenshot; [inferred] reasoning, not verified.

## 2026-11-12
- [fetched] The Wikimedia Commons search API returned HTTP 429 (rate limit) several times; queries were spaced 25 s apart. 10 images saved as 1280 px thumbnails; licences and authors in source/ORIGIN.txt (CC BY 2.0, CC BY 4.0, CC BY-SA 2.0/3.0/4.0, CC0). The ref10 download failed once and the retry succeeded.
- [observed] Blender 5.3.0 via the MCP. All work was done in a new scene "ENV_town_kit"; the director's scene ("Scene": Cube, Light, Camera) was not modified. The window was switched to ENV_town_kit so the director can watch.
- [observed] Built 22 kit pieces from scripts (src/kit_modules.py). All are under 8k tris; the largest is shop_izakaya at 4,092 [measured].
- [observed] Iteration 1 render: rain was a white curtain, fog was invisible and the frame was black. Cause: EEVEE world-volume fog did not scatter the spot or point lights [observed]. Fix: a fog volume box. Rain reduced and given no shadows: its shadows had printed a crosshatch on the road [observed].
- [observed] Iteration 2: lantern lights were occluded by the lantern spheres (fix: no shadows on those lights); a pole blocked the izakaya shot (moved); the tobacco-shop hide POV was unreadable at three framings (dropped in favour of the izakaya counter POV); pole lamps raised from 300 W to 1,500 W.
- [measured] Value-structure table in sheet.md: previews sit in the SH2 night band (mean 0.07–0.24), with 0–1% highlights against 4–17% in the photos.
- [observed] Export: the first pass pulled the director's "Cube" into every GLB because use_selection reads selections across scenes [inferred cause]. Fixed with use_active_scene=True; re-checked that every GLB holds only its own meshes [measured].
- [observed] viewer.html loads shop_izakaya.glb in three r128 under headless Chrome (SwiftShader): console "GLB_LOADED shop_izakaya 4572 …" (4,092 + 6 marker spheres × 80). Screenshot: prototypes/assets/env/previews/viewer_check_shop_izakaya.png.
- [observed] .blend saved as a copy to prototypes/assets/env/src/town_kit.blend. It also contains the director's original scene, because save_as copy writes the whole file.
