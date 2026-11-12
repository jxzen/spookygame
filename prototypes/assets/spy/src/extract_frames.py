# Extract frames from a reference video with Blender's VSE (no ffmpeg on this machine).
# usage: blender -b --factory-startup --python extract_frames.py -- <video> <outdir> <step_seconds>
import bpy, sys, os
argv = sys.argv[sys.argv.index("--") + 1:]
video, outdir, step = argv[0], argv[1], float(argv[2])
os.makedirs(outdir, exist_ok=True)
sc = bpy.context.scene
sc.sequence_editor_create()
coll = sc.sequence_editor.strips
s = coll.new_movie("v", video, 1, 1)
fps = s.fps if hasattr(s, "fps") else 24
n = s.frame_final_duration
print("frames", n, "fps", fps, "size", s.elements[0].orig_width if s.elements else "?")
sc.render.resolution_x, sc.render.resolution_y = 640, 480
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'JPEG'
sc.frame_end = n
f = 1
while f < n:
    sc.frame_set(f)
    sc.render.filepath = os.path.join(outdir, "f%05d.jpg" % f)
    bpy.ops.render.render(write_still=True)
    f += int(step * fps)
