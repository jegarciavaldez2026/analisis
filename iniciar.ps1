<#
    iniciar.ps1 — levanta la app y te dice donde verla (Windows / PowerShell).

        .\iniciar.ps1              levanta los contenedores y espera a que respondan
        .\iniciar.ps1 dev          modo desarrollo con recarga en caliente (sin Docker)
        .\iniciar.ps1 parar        para los contenedores
        .\iniciar.ps1 logs         sigue los logs
        .\iniciar.ps1 estado       que hay levantado ahora mismo

        -Recompilar    compila antes de levantar

    Si has tocado codigo y quieres verlo:  .\compilar.ps1 frontend ; .\iniciar.ps1
    Si vas a iterar mucho sobre la UI:     .\iniciar.ps1 dev

    Si Windows bloquea la ejecucion:
        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#>

[CmdletBinding()]
param(
    [ValidateSet('up', 'dev', 'parar', 'logs', 'estado')]
    [string]$Mode = 'up',
    [switch]$Recompilar
)

$ErrorActionPreference = 'Stop'

$Root     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Frontend = Join-Path $Root 'frontend'

# Igual que en compilar.ps1: un node_modules incompleto engana a Test-Path.
function Test-Deps { Test-Path (Join-Path $Frontend 'node_modules\expo\package.json') }

function Step($m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "!   $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "X   $m" -ForegroundColor Red; exit 1 }

Set-Location $Root

# ── Modo desarrollo: sin Docker, con recarga en caliente ────────────────────
if ($Mode -eq 'dev') {
    Step 'Modo desarrollo (recarga en caliente)'
    if (-not (Test-Deps)) {
        Write-Host '  Instalando dependencias (tarda unos minutos)...'
        Push-Location $Frontend
        try { npm install --no-audit --no-fund --legacy-peer-deps } finally { Pop-Location }
    }
    Warn 'El backend debe estar levantado aparte:  .\iniciar.ps1   (en otra ventana)'
    Write-Host '  Expo arrancara en http://localhost:8081 - Ctrl+C para parar.'
    Push-Location $Frontend
    try { npx expo start --web -c } finally { Pop-Location }
    exit 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Die 'docker no esta instalado o no esta en PATH'
}

switch ($Mode) {
    'parar'  { Step 'Parando'; docker compose down; Ok 'Parado.'; exit 0 }
    'logs'   { docker compose logs -f; exit 0 }
    'estado' { docker compose ps; exit 0 }
}

$envFile = Join-Path $Root '.env'
if (-not (Test-Path $envFile)) { Die 'No hay .env. Ejecuta primero .\compilar.ps1, que lo crea.' }

$WebPort = (Select-String -Path $envFile -Pattern '^WEB_PORT=(.*)$').Matches.Groups[1].Value.Trim()
if (-not $WebPort) { $WebPort = '8080' }

if ($Recompilar) { & (Join-Path $Root 'compilar.ps1') }

Step 'Levantando servicios'
# `up -d` recrea el contenedor cuando la imagen ha cambiado, asi que despues de
# compilar no hace falta bajar nada a mano.
docker compose up -d
if ($LASTEXITCODE -ne 0) { Die 'No se pudieron levantar los servicios.' }

Step 'Esperando a que la app responda'
$ready = $false
foreach ($i in 1..60) {
    try {
        Invoke-WebRequest -Uri "http://localhost:$WebPort/healthz" -UseBasicParsing -TimeoutSec 3 | Out-Null
        $ready = $true
        break
    }
    catch { Write-Host '.' -NoNewline; Start-Sleep -Seconds 2 }
}
Write-Host ''

if ($ready) { Ok 'Frontend sirviendo.' }
else { Warn 'El frontend no respondio en 2 minutos. Mira:  .\iniciar.ps1 logs' }

# El backend tarda mas: monta Mongo y carga el modelo bajo demanda.
$backendOk = $false
foreach ($path in '/api/market-indicators', '/docs') {
    try {
        Invoke-WebRequest -Uri "http://localhost:$WebPort$path" -UseBasicParsing -TimeoutSec 5 | Out-Null
        $backendOk = $true; break
    }
    catch { }
}
if ($backendOk) { Ok 'Backend respondiendo.' }
else { Warn 'El backend aun no responde; puede tardar otro minuto. Compruebalo en /docs.' }

Write-Host ''
docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
Write-Host ''
Ok 'Listo. Abrelo en:'
Write-Host "    http://localhost:$WebPort"
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
       Select-Object -First 1).IPAddress
if ($ip) { Write-Host "    http://${ip}:$WebPort      (desde otro equipo de la red)" }
Write-Host "    http://localhost:$WebPort/docs   (API)"
Write-Host ''
Write-Host '  Si no ves los cambios: no se ha recompilado la imagen.'
Write-Host '  Ejecuta  .\compilar.ps1 frontend  y vuelve a  .\iniciar.ps1'
