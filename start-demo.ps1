# RhineLab Mock Console - one click launcher (PowerShell)
# Usage: .\start-demo.ps1 [-NoBrowser]
param(
  [switch]$NoBrowser,
  [int]$TimeoutSec = 20
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$console = Join-Path $root 'console'
$exe = Join-Path $console 'target\debug\rhine-agent.exe'

if (-not (Test-Path $exe)) {
  Write-Host ('[x] not found: ' + $exe) -ForegroundColor Red
  Write-Host ('    build first:  cd ' + $console + ' ; cargo build --offline')
  exit 1
}

function Test-Port([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Instance([int]$port, [string]$auth, [string]$data, [string]$label) {
  if (Test-Port $port) {
    Write-Host ('    ' + $label + ' already running (:' + $port + ')') -ForegroundColor DarkGray
    return
  }
  Write-Host ('    starting ' + $label + ' (:' + $port + ')') -ForegroundColor Cyan
  $env:RHINE_PORT = [string]$port
  $env:RHINE_AUTH = $auth
  $env:RHINE_UI = 'ui'
  $env:RHINE_DATA = $data
  Start-Process -FilePath $exe -WorkingDirectory $console -WindowStyle Hidden
}

Write-Host '[1/3] instances' -ForegroundColor Green
Start-Instance -port 9600 -auth 'on'  -data 'data/agent.json' -label 'L-side'
Start-Instance -port 9601 -auth 'off' -data 'data/local.json' -label 'W-side'

Write-Host '[2/3] waiting for port' -ForegroundColor Green
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline -and -not (Test-Port 9600)) { Start-Sleep -Milliseconds 300 }
if (Test-Port 9600) { Write-Host '    9600 ready' -ForegroundColor Green }
else { Write-Host '    [!] 9600 not up yet, refresh the page in a few seconds' -ForegroundColor Yellow }

$url = 'http://127.0.0.1:9600/business/plane.html'
if ($NoBrowser) {
  Write-Host '[3/3] skip browser' -ForegroundColor DarkGray
} else {
  Write-Host ('[3/3] open ' + $url) -ForegroundColor Green
  Start-Process $url
}

Write-Host ''
Write-Host ('  L-side  ' + $url + '   admin / rhine-admin-2026') -ForegroundColor DarkGray
Write-Host '  W-side  http://127.0.0.1:9601/business/plane.html   (no login)' -ForegroundColor DarkGray
Write-Host '  index   http://127.0.0.1:9600/business/index.html' -ForegroundColor DarkGray
Write-Host '  stop    Get-Process rhine-agent | Stop-Process -Force' -ForegroundColor DarkGray
