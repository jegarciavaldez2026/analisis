<#
    reiniciar.ps1 — reinicia la app y compila los cambios (Windows / PowerShell).

    Equivalente a reiniciar.sh, para poder ejecutarlo con doble clic o desde
    PowerShell sin necesidad de Git Bash ni WSL.

        .\reiniciar.ps1             comprueba tipos y arranca el frontend web
        .\reiniciar.ps1 build       compila el build web estático en frontend\dist
        .\reiniciar.ps1 docker      reconstruye y levanta los contenedores
        .\reiniciar.ps1 all         docker + build web + arranca el frontend
        .\reiniciar.ps1 check       sólo comprobación de tipos

        -NoCheck      salta la comprobación de tipos
        -KeepCache    no limpia la caché de Metro

    Si Windows bloquea la ejecución:
        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#>

[CmdletBinding()]
param(
    [ValidateSet('dev', 'build', 'docker', 'all', 'check')]
    [string]$Mode = 'dev',
    [switch]$NoCheck,
    [switch]$KeepCache
)

$ErrorActionPreference = 'Stop'

$Root     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Frontend = Join-Path $Root 'frontend'

function Step($msg) { Write-Host "`n> $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "!  $msg" -ForegroundColor Yellow }
function Die($msg)  { Write-Host "X  $msg" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $Frontend)) { Die "No se encuentra $Frontend" }

function Ensure-Deps {
    Step 'Dependencias'
    Push-Location $Frontend
    try {
        $modules = Join-Path $Frontend 'node_modules'
        $pkg     = Join-Path $Frontend 'package.json'
        if (-not (Test-Path $modules)) {
            Write-Host '  node_modules no existe: instalando (esto tarda unos minutos)...'
            npm install --no-audit --no-fund --legacy-peer-deps
        }
        elseif ((Get-Item $pkg).LastWriteTime -gt (Get-Item $modules).LastWriteTime) {
            Write-Host '  package.json es mas reciente que node_modules: reinstalando...'
            npm install --no-audit --no-fund --legacy-peer-deps
        }
        else {
            Write-Host '  Al dia.'
        }
    }
    finally { Pop-Location }
}

function Invoke-Typecheck {
    if ($NoCheck) { return }
    Step 'Comprobacion de tipos'
    Push-Location $Frontend
    try {
        # No aborta: Metro compila aunque tsc se queje. A dia de hoy el
        # proyecto esta en cero errores, asi que cualquier fallo aqui es nuevo.
        npx --no-install tsc --noEmit
        if ($LASTEXITCODE -eq 0) { Write-Host '  Sin errores de tipos.' }
        else { Warn 'Hay errores de tipos (arriba). Se continua: Metro compila igualmente.' }
    }
    finally { Pop-Location }
}

function Stop-Stale {
    Step 'Procesos anteriores'
    $found = $false
    foreach ($port in 8081, 19000, 19001, 19006) {
        try {
            $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            foreach ($c in $conns) {
                Write-Host "  Liberando puerto $port (PID $($c.OwningProcess))"
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
                $found = $true
            }
        }
        catch { }
    }
    if (-not $found) { Write-Host '  Nada que cerrar.' } else { Start-Sleep -Seconds 1 }
}

function Clear-MetroCache {
    if ($KeepCache) { return }
    Step 'Cache de Metro'
    $paths = @(
        (Join-Path $Frontend '.expo\web\cache'),
        (Join-Path $env:TEMP 'metro-*'),
        (Join-Path $env:TEMP 'haste-map-*')
    )
    foreach ($p in $paths) {
        Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
    }
    Write-Host '  Limpiada.'
}

function Invoke-DockerUp {
    Step 'Contenedores (backend + base de datos)'
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Die 'docker no esta instalado o no esta en PATH'
    }
    Push-Location $Root
    try {
        docker compose down
        docker compose build
        docker compose up -d
        Write-Host '  Backend en http://localhost:8002'
    }
    finally { Pop-Location }
}

function Invoke-WebBuild {
    Step 'Compilando el build web'
    Push-Location $Frontend
    try {
        Remove-Item -Recurse -Force (Join-Path $Frontend 'dist') -ErrorAction SilentlyContinue
        npx expo export --platform web --output-dir dist
        Write-Host "  Listo: $Frontend\dist" -ForegroundColor Green
    }
    finally { Pop-Location }
}

function Start-DevServer {
    Step 'Arrancando Expo (web)'
    Push-Location $Frontend
    try {
        Write-Host '  Ctrl+C para parar.'
        if ($KeepCache) { npx expo start --web } else { npx expo start --web -c }
    }
    finally { Pop-Location }
}

switch ($Mode) {
    'check'  { Ensure-Deps; Invoke-Typecheck }
    'build'  { Ensure-Deps; Invoke-Typecheck; Clear-MetroCache; Invoke-WebBuild }
    'docker' { Invoke-DockerUp }
    'all'    { Invoke-DockerUp; Ensure-Deps; Invoke-Typecheck; Stop-Stale; Clear-MetroCache; Invoke-WebBuild; Start-DevServer }
    default  { Ensure-Deps; Invoke-Typecheck; Stop-Stale; Clear-MetroCache; Start-DevServer }
}
