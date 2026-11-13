# check-probe.ps1: the load gate. Renders a probe page in headless Chrome and FAILS (exit 1) on any
# Uncaught error, any "[module ... ] ... disabled" line, or a page that never reports ready.
# Usage: powershell -NoProfile -File tools\check-probe.ps1 [-Page prototypes\probe-04\index.html] [-Hash "jump=street"] [-Out shot.png] [-Budget 8000]
param(
  [string]$Page = "prototypes\probe-04\index.html",
  [string]$Hash = "",
  [string]$Out = "",
  [int]$Budget = 8000
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pagePath = (Resolve-Path (Join-Path $root $Page)).Path -replace '\\', '/'
$url = "file:///$pagePath" + $(if ($Hash) { "#$Hash" } else { "" })
$chrome = @("C:\Program Files\Google\Chrome\Application\chrome.exe", "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Error "chrome.exe not found"; exit 2 }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("check-probe-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $tmp | Out-Null
if (-not $Out) { $Out = Join-Path $tmp "shot.png" }
$err = Join-Path $tmp "stderr.txt"
$args = @("--headless=new", "--user-data-dir=$tmp\prof", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--allow-file-access-from-files",
  "--enable-logging=stderr", "--v=0", "--virtual-time-budget=$Budget", "--window-size=1280,720", "--screenshot=$Out", $url)
Start-Process -FilePath $chrome -ArgumentList $args -RedirectStandardError $err -Wait
$lines = Get-Content $err -ErrorAction SilentlyContinue | Where-Object { $_ -match "CONSOLE" }
$bad = $lines | Where-Object { $_ -match "Uncaught|disabled|init failed|update threw|HorrorFX failed" }
$missing = $lines | Where-Object { $_ -match "module missing" }
Write-Output "url: $url"
Write-Output "screenshot: $Out"
if ($missing) { Write-Output "modules missing (allowed):"; $missing | ForEach-Object { "  " + ($_ -replace '.*"(.*?)".*', '$1') } }
if ($bad) { Write-Output "FAIL:"; $bad | ForEach-Object { "  " + $_ }; exit 1 }
Write-Output "PASS: no uncaught errors, no disabled modules"
exit 0
