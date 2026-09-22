@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  compilar.bat - compila los cambios.  (Windows, cmd nativo)
REM
REM  El bundle web de Expo se construye DENTRO de la imagen del frontend
REM  (Dockerfile.frontend, etapa 1: expo export). Por eso "compilar" aqui
REM  significa reconstruir la imagen: es lo unico que hace que el codigo nuevo
REM  llegue al nginx que sirve la app.
REM
REM    compilar.bat                comprueba tipos y reconstruye frontend + backend
REM    compilar.bat frontend       solo la imagen del frontend (lo habitual al tocar UI)
REM    compilar.bat backend        solo la imagen del backend
REM    compilar.bat local          bundle en frontend\dist, sin Docker
REM
REM    Anade /sincache   para ignorar la cache de capas de Docker
REM    Anade /sintipos   para saltar la comprobacion de TypeScript
REM
REM  Despues de compilar:  iniciar.bat
REM ===========================================================================

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "FRONTEND=%ROOT%\frontend"
set "TARGET=frontend backend"
set "NOCACHE="
set "CHECK=1"

REM --- Argumentos (en cualquier orden) ---------------------------------------
:parse
if "%~1"=="" goto parsed
if /i "%~1"=="frontend"  ( set "TARGET=frontend"         & shift & goto parse )
if /i "%~1"=="backend"   ( set "TARGET=backend"          & shift & goto parse )
if /i "%~1"=="todo"      ( set "TARGET=frontend backend" & shift & goto parse )
if /i "%~1"=="local"     ( set "TARGET=local"            & shift & goto parse )
if /i "%~1"=="/sincache" ( set "NOCACHE=--no-cache"      & shift & goto parse )
if /i "%~1"=="/sintipos" ( set "CHECK=0"                 & shift & goto parse )
if /i "%~1"=="/?"        goto ayuda
if /i "%~1"=="-h"        goto ayuda
if /i "%~1"=="ayuda"     goto ayuda
echo [AVISO] Argumento desconocido: %~1  (usa: frontend ^| backend ^| todo ^| local)
goto fin_error
:parsed

cd /d "%ROOT%"
if not exist "%FRONTEND%" (
    echo [ERROR] No se encuentra %FRONTEND%
    goto fin_error
)

REM ---------------------------------------------------------------------------
REM  1. Comprobacion de tipos
REM  Avisa pero no aborta: expo export transpila sin comprobar tipos, asi que un
REM  error de tsc no impide compilar. Pero conviene enterarse antes, no despues.
REM ---------------------------------------------------------------------------
if "%CHECK%"=="1" (
    echo.
    echo ^> Comprobando tipos
    REM Un node_modules a medias es peor que no tenerlo: npx se va al registro y
    REM baja una version de Expo distinta. Se comprueba un marcador real.
    if exist "%FRONTEND%\node_modules\expo\package.json" (
        pushd "%FRONTEND%"
        call npx --no-install tsc --noEmit
        if errorlevel 1 (
            echo [AVISO] Hay errores de tipos ^(arriba^). Se compila igualmente.
        ) else (
            echo [OK] Sin errores de tipos.
        )
        popd
    ) else (
        echo [AVISO] No hay dependencias locales completas; la comprobacion se salta.
        echo [AVISO] Docker instala las suyas dentro de la imagen: el build no depende de esto.
    )
)

REM ---------------------------------------------------------------------------
REM  2. Ruta local (sin Docker)
REM ---------------------------------------------------------------------------
if /i "%TARGET%"=="local" (
    echo.
    echo ^> Compilando el bundle web en frontend\dist
    pushd "%FRONTEND%"
    if not exist "node_modules\expo\package.json" (
        echo   Instalando dependencias ^(tarda unos minutos^)...
        call npm install --no-audit --no-fund --legacy-peer-deps
        if errorlevel 1 ( popd & goto fin_error )
    )
    if exist dist rmdir /s /q dist
    call npx expo export --platform web --output-dir dist
    if errorlevel 1 ( popd & goto fin_error )
    popd
    echo [OK] Listo: %FRONTEND%\dist
    echo   Para verlo:  npx serve frontend\dist
    echo   Ojo: asi el frontend no tiene el nginx que proxea /api al backend.
    goto fin_ok
)

REM ---------------------------------------------------------------------------
REM  3. Ruta Docker (la que sirve la app de verdad)
REM ---------------------------------------------------------------------------
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] docker no esta instalado o no esta en PATH.
    echo     Abre Docker Desktop y vuelve a intentarlo.
    goto fin_error
)

docker compose version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Falta el plugin "docker compose" ^(v2^), o Docker Desktop no esta arrancado.
    goto fin_error
)

if not exist "%ROOT%\.env" (
    echo [AVISO] No hay .env. Lo creo desde .env.example.
    copy /y "%ROOT%\.env.example" "%ROOT%\.env" >nul
    REM Clave aleatoria de 32 bytes. cmd no sabe hacerlo; una linea de PowerShell si.
    for /f %%K in ('powershell -NoProfile -Command "-join ((1..32) ^| ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })"') do set "KEY=%%K"
    powershell -NoProfile -Command "(Get-Content '%ROOT%\.env') -replace '^SECRET_KEY=.*', 'SECRET_KEY=!KEY!' | Set-Content '%ROOT%\.env'"
    echo [OK] SECRET_KEY generada.
)

findstr /b /c:"SECRET_KEY=cambia-esto" "%ROOT%\.env" >nul 2>&1
if not errorlevel 1 (
    echo [ERROR] SECRET_KEY sigue con el valor de ejemplo. Editalo en .env
    goto fin_error
)

echo.
echo ^> Reconstruyendo imagenes: %TARGET%
echo   La primera vez tarda bastante: compila el bundle de Expo dentro de la imagen.
echo   Las siguientes reutilizan la capa de dependencias y solo rehacen el bundle.
echo.
docker compose build %NOCACHE% %TARGET%
if errorlevel 1 (
    echo.
    echo [ERROR] El build ha fallado. Lee la salida de arriba: el error suele estar
    echo     en la etapa "expo export" y viene con el archivo y la linea.
    goto fin_error
)

echo.
echo [OK] Compilado.
docker images --format "  {{.Repository}}:{{.Tag}}  {{.Size}}  (creada {{.CreatedSince}})" | findstr /r "analisis-frontend analisis-backend"
echo.
echo   Siguiente paso:  iniciar.bat
goto fin_ok

REM ---------------------------------------------------------------------------
:ayuda
echo.
echo   compilar.bat                comprueba tipos y reconstruye frontend + backend
echo   compilar.bat frontend       solo la imagen del frontend ^(lo habitual al tocar UI^)
echo   compilar.bat backend        solo la imagen del backend
echo   compilar.bat local          bundle en frontend\dist, sin Docker
echo.
echo   /sincache   ignora la cache de capas de Docker ^(build limpio, mas lento^)
echo   /sintipos   salta la comprobacion de TypeScript
echo.
echo   Despues de compilar:  iniciar.bat
echo.
goto fin_ok

:fin_error
set "EXITCODE=1"
goto pausa

:fin_ok
set "EXITCODE=0"

:pausa
REM Si se ha lanzado con doble clic, la ventana se cerraria de golpe sin dejar
REM leer nada. Solo entonces se pausa.
set "_LANZADO=%cmdcmdline%"
if not "!_LANZADO!"=="!_LANZADO:/c=!" pause
endlocal & exit /b %EXITCODE%
