<#
    compilar.ps1 — compila los cambios (Windows / PowerShell).

    El bundle web de Expo se construye DENTRO de la imagen del frontend
    (Dockerfile.frontend). Por eso "compilar" aqui significa reconstruir la
    imagen: es lo unico que hace que el codigo nuevo llegue al nginx que
    sirve la app.

        .\compilar.ps1                comprueba tipos y reconstruye frontend + backend
        .\compilar.ps1 frontend       solo la imagen del frontend (lo habitual al tocar UI)
        .\compilar.ps1 backend        solo la imagen del backend
        .\compilar.ps1 local          bundle en frontend\dist, sin Docker

        -SinCache     ignora la cache de capas de Docker (build limpio, mucho mas lento)
        -SinTipos     salta la comprobacion de TypeScript

    Despues de compilar:  .\iniciar.ps1

    Si Windows bloquea la ejecucion:
        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#>

[CmdletBinding()]
param(
    [ValidateSet('todo', 'frontend', 'backend', 'local')]
    [string]$Target = 'todo',
    [switch]$SinCache,
    [switch]$SinTipos
)

$ErrorActionPreference = 'Stop'

$Root     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Frontend = Join-Path $Root 'frontend'

# Un node_modules a medias es peor que no tenerlo: npx se va al registro y baja
# una version de Expo distinta a la del proyecto. Se comprueba un marcador real.
function Test-Deps { Test-Path (Join-Path $Frontend 'node_modules\expo\package.json') }

function Step($m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "!   $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "X   $m" -ForegroundColor Red; exit 1 }

Set-Location $Root
if (-not (Test-Path $Frontend)) { Die "No se encuentra $Frontend" }

# ── 1. Comprobacion de tipos ────────────────────────────────────────────────
# Avisa pero no aborta: `expo export` transpila sin comprobar tipos.
if (-not $SinTipos) {
    Step 'Comprobando tipos'
    if (Test-Deps) {
        Push-Location $Frontend
        try {
            npx --no-install tsc --noEmit
            if ($LASTEXITCODE -eq 0) { Ok 'Sin errores de tipos.' }
            else { Warn 'Hay errores de tipos (arriba). Se compila igualmente.' }
        }
        finally { Pop-Location }
    }
    else {
        Warn 'No hay dependencias locales completas; la comprobacion se salta.'
        Warn 'Docker instala las suyas dentro de la imagen, el build no depende de esto.'
    }
}

# ── 2. Ruta local (sin Docker) ──────────────────────────────────────────────
if ($Target -eq 'local') {
    Step 'Compilando el bundle web en frontend\dist'
    Push-Location $Frontend
    try {
        if (-not (Test-Deps)) {
            Write-Host '  Instalando dependencias (tarda unos minutos)...'
            npm install --no-audit --no-fund --legacy-peer-deps
        }
        Remove-Item -Recurse -Force 'dist' -ErrorAction SilentlyContinue
        npx expo export --platform web --output-dir dist
        Ok "Listo: $Frontend\dist"
        Write-Host '  Para verlo:  npx serve frontend\dist'
        Write-Host '  Ojo: asi el frontend no tiene el nginx que proxea /api al backend.'
    }
    finally { Pop-Location }
    exit 0
}

# ── 3. Ruta Docker (la que sirve la app de verdad) ──────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Die 'docker no esta instalado o no esta en PATH'
}

$envFile = Join-Path $Root '.env'
if (-not (Test-Path $envFile)) {
    Warn 'No hay .env. Lo creo desde .env.example.'
    Copy-Item (Join-Path $Root '.env.example') $envFile
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $key = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    (Get-Content $envFile) -replace '^SECRET_KEY=.*', "SECRET_KEY=$key" | Set-Content $envFile
    Ok 'SECRET_KEY generada.'
}
if (Select-String -Path $envFile -Pattern '^SECRET_KEY=cambia-esto' -Quiet) {
    Die 'SECRET_KEY sigue con el valor de ejemplo. Editalo en .env.'
}

$services = switch ($Target) {
    'frontend' { @('frontend') }
    'backend'  { @('backend') }
    default    { @('frontend', 'backend') }
}

Step "Reconstruyendo imagenes: $($services -join ' ')"
Write-Host '  La primera vez tarda bastante: compila el bundle de Expo dentro de la imagen.'
Write-Host '  Las siguientes reutilizan la capa de dependencias y solo rehacen el bundle.'

$buildArgs = @('compose', 'build')
if ($SinCache) { $buildArgs += '--no-cache' }
$buildArgs += $services
& docker @buildArgs
if ($LASTEXITCODE -ne 0) { Die 'El build ha fallado (ver salida arriba).' }

Write-Host ''
Ok 'Compilado.'
docker images --format '  {{.Repository}}:{{.Tag}}  {{.Size}}  (creada {{.CreatedSince}})' |
    Select-String -Pattern 'analisis-(frontend|backend)'
Write-Host ''
Write-Host '  Siguiente paso:  .\iniciar.ps1'
