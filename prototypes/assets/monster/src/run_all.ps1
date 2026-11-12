# Build monster.glb, render previews, tile them. Usage: powershell -File run_all.ps1 [tmpdir]
param([string]$tmp = "$env:TEMP\monster_frames")
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$src = $PSScriptRoot; $m = Split-Path $src; $bl = "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe"
& $bl -b --factory-startup --python "$src\build_monster.py" 2>&1 | Select-String "TRIS|ACTION|EXPORTED|Error|Traceback|missed|failed"
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force $tmp | Out-Null
& $bl -b "$src\monster.blend" --python "$src\render_previews.py" -- $tmp 2>&1 | Select-String "DONE|Error|Traceback"
$p = "$m\previews"; New-Item -ItemType Directory -Force $p | Out-Null
ffmpeg -v error -y -i "$tmp\v_front.png" -i "$tmp\v_side.png" -filter_complex hstack "$p\front_side.png"
ffmpeg -v error -y -i "$tmp\v_rest.png" -i "$tmp\v_face.png" -i "$tmp\v_back.png" -filter_complex hstack=3 "$p\rest_face_back.png"
ffmpeg -v error -y -i "$tmp\sil_%d.png" -vf tile=6x1 -frames:v 1 "$p\silhouettes_12m.png"
foreach ($a in "Idle","StalkWalk","Crawl","Search","Lunge","Peek") {
  $list = 0..1 | ForEach-Object { $r = $_; 0..7 | ForEach-Object { "-i"; "$tmp\strip_${a}_$r$_.png" } }
  ffmpeg -v error -y @list -filter_complex "xstack=inputs=16:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|w0+w1+w2+w3_0|w0+w1+w2+w3+w4_0|w0+w1+w2+w3+w4+w5_0|w0+w1+w2+w3+w4+w5+w6_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0|w0+w1+w2+w3_h0|w0+w1+w2+w3+w4_h0|w0+w1+w2+w3+w4+w5_h0|w0+w1+w2+w3+w4+w5+w6_h0" "$p\strip_$a.png"
}
Get-ChildItem $p | Select-Object Name, Length
