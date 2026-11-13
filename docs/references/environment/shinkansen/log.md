# Log: shinkansen / W2-TRAIN

Evidence labels: [fetched] from the web this session; [search only] a search-result summary, page not read; [recall] memory; [measured] from our files; [observed] seen in a render or screenshot; [inferred] reasoning.

## 2026-11-12
- [fetched] 8 Commons photos found through the Commons search API and downloaded as 1280 px thumbnails (one request every 5 s, no 429 this time). Licences and authors in source/ORIGIN.txt: CC BY-SA 4.0 x4, CC BY-SA 3.0 x2, CC BY-SA 2.0, CC BY 4.0.
- [fetched] en.wikipedia N700 series (through a summarising fetch): 25 m intermediate cars, 3.36 m width, 3.5 m height, seat pitch 1,040 / 1,160 mm, 2+3 and 2+2 seating. The summary gave end cars as 25.35 m; I recall 27.35 m. Not resolved; we use 27 m.
- [search only] 1,250 mm platform height on full-gauge shinkansen lines; shinkansen PSDs are half-height gates, no mm figure found.
- [observed] Built headless in Blender 5.3 (factory startup, no MCP). The body is one cross-section with extra vertices at the stripe, window and door edges, lofted along Y; the nose is the same ring scaled by an analytic profile (sigmoid hump plus a linear fall, rounded tip). Car_2's window and door faces are deleted and the shell is solidified so the cabin is real.
- [measured] shinkansen.glb 20,772 tris (budget 25k); platform.glb 2,770 tris.
- [observed] Iteration 1 (vs ref01, ref07, ref03, ref06): the stripe was a hairline (thickened to 0.22 m); the nose tip was a thin duck-bill (raised the tip to 1.42 m and blunted it, ref07); the platform was white fog with no night (fog 0.035 to 0.012, darker deck and walls, lamps 220 W to 70 W); the cabin was black because the render lights stayed 30 m behind the moved train (parented them to the empties).
- [observed] Iteration 2: the window-seat shot looked at a PSD housing 0.6 m outside the glass (moved the gates back to x = -3.0 and lowered them to 1.2 m, as in ref05/ref08); the windows sat below seated eye level (window band raised to 2.10-2.75 m above rail); the cabin shell showed the glossy white body paint and smeared shading around the holes (inner shell uses the warm-grey wall material; edges over 40 degrees are now sharp).
- [observed] viewer.html under headless Chrome (SwiftShader, --allow-file-access-from-files): console "GLB_LOADED shinkansen 20772 tris · platform 2770 tris · 16 doors"; no errors. First run showed shadow acne on the white body; fixed with shadow bias and normalBias.
