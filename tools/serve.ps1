# serve.ps1: a minimal static file server for playing probes locally (models need http://, not file://).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8765]
# Then open http://localhost:8765/probe-04/index.html . Serves prototypes/ read-only, localhost only.
param([int]$Port = 8765)
$root = (Resolve-Path (Join-Path (Split-Path -Parent $PSScriptRoot) "prototypes")).Path
$types = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript"; ".json"="application/json"; ".glb"="model/gltf-binary";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".css"="text/css"; ".svg"="image/svg+xml"; ".mp3"="audio/mpeg"; ".wav"="audio/wav" }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Output "serving $root at http://localhost:$Port/  (Ctrl+C to stop)"
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/')) -replace '/', '\'
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root)) { $c.Response.StatusCode = 403 }
    elseif (Test-Path $path -PathType Leaf) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $c.Response.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" })
      $c.Response.Headers.Add("Cache-Control", "no-store")
      $c.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $c.Response.StatusCode = 404 }
  } catch { $c.Response.StatusCode = 500 }
  finally { $c.Response.Close() }
}
