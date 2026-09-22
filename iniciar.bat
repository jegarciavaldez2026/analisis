@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM  iniciar.bat - levanta la app y te dice donde verla.  (Windows, cmd nativo)
REM
REM    iniciar.bat              levanta los contenedores y espera a que respondan
REM    iniciar.bat dev          modo desarrollo con recarga en caliente (sin Docker)
REM    iniciar.bat parar        para los contenedores
REM    iniciar.bat logs         sigue los logs
REM    iniciar.bat estado       que hay levantado ahora mismo
REM
REM    Anade /recompilar   para compilar antes de levantar
REM
REM  Si has tocado codigo y quieres verlo:  compilar.bat frontend  y luego  iniciar.bat
REM  Si vas a iterar mucho sobre la UI:     iniciar.bat dev
REM ===========================================================================

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "FRONTEND=%ROOT%\frontend"
set "MODE=up"
set "REBUILD=0"

:parse
if "%~1"=="" goto parsed
if /i "%~1"=="dev"         ( set "MODE=dev"    & shift & goto parse )
if /i "%~1"=="parar"       ( set "MODE=down"   & shift & goto parse )
if /i "%~1"=="stop"        ( set "MODE=down"   & shift & goto parse )
if /i "%~1"=="logs"        ( set "MODE=logs"   & shift & goto parse )
if /i "%~1"=="estado"      ( set "MODE=ps"     & shift & goto parse )
if /i "%~1"=="/recompilar" ( set "REBUILD=1"   & shift & goto parse )
if /i "%~1"=="/?"          goto ayuda
if /i "%~1"=="-h"          goto ayuda
if /i "%~1"=="ayuda"       goto ayuda
echo [AVISO] Argumento desconocido: %~1  (usa: dev ^| parar ^| logs ^| estado)
goto fin_error
:parsed

cd /d "%ROOT%"

REM ---------------------------------------------------------------------------
REM  Modo desarrollo: sin Docker, con recarga en caliente.
REM  Para iterar sobre la interfaz: cada cambio se ve al guardar, sin reconstruir
REM  ninguna imagen. Necesita el backend levantado aparte.
REM ---------------------------------------------------------------------------
if /i "%MODE%"=="dev" (
    echo.
    echo ^> Modo desarrollo ^(recarga en caliente^)
    if not exist "%FRONTEND%\node_modules\expo\package.json" (
        echo   Instalando dependencias ^(tarda unos minutos^)...
        pushd "%FRONTEND%"
        call npm install --no-audit --no-fund --legacy-peer-deps
        if errorlevel 1 ( popd & goto fin_error )
        popd
    )
    echo [AVISO] El backend debe estar levantado aparte. En otra ventana:  iniciar.bat
    echo   Expo arrancara en http://localhost:8081 - Ctrl+C para parar.
    echo.
    pushd "%FRONTEND%"
    call npx expo start --web -c
    popd
    goto fin_ok
)

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] docker no esta instalado o no esta en PATH.
    echo     Abre Docker Desktop y vuelve a intentarlo.
    goto fin_error
)

if /i "%MODE%"=="down" (
    echo.
    echo ^> Parando
    docker compose down
    echo [OK] Parado.
    goto fin_ok
)

if /i "%MODE%"=="logs" (
    docker compose logs -f
    goto fin_ok
)

if /i "%MODE%"=="ps" (
    docker compose ps
    goto fin_ok
)

if not exist "%ROOT%\.env" (
    echo [ERROR] No hay .env. Ejecuta primero compilar.bat, que lo crea.
    goto fin_error
)

REM Puerto publicado por el contenedor del frontend.
set "WEB_PORT=8080"
for /f "usebackq tokens=2 delims==" %%A in (`findstr /b /c:"WEB_PORT=" "%ROOT%\.env"`) do set "WEB_PORT=%%A"
set "WEB_PORT=%WEB_PORT: =%"

if "%REBUILD%"=="1" (
    call "%ROOT%\compilar.bat"
    if errorlevel 1 goto fin_error
)

echo.
echo ^> Levantando servicios
REM "up -d" recrea el contenedor cuando la imagen ha cambiado, asi que despues
REM de compilar no hace falta bajar nada a mano.
docker compose up -d
if errorlevel 1 (
    echo [ERROR] No se pudieron levantar los servicios.
    goto fin_error
)

echo.
echo ^> Esperando a que la app responda
set "READY=0"
for /l %%i in (1,1,60) do (
    if "!READY!"=="0" (
        curl -fs -m 3 "http://localhost:%WEB_PORT%/healthz" >nul 2>&1
        if not errorlevel 1 (
            set "READY=1"
        ) else (
            <nul set /p "=."
            timeout /t 2 /nobreak >nul
        )
    )
)
echo.

if "%READY%"=="1" (
    echo [OK] Frontend sirviendo.
) else (
    echo [AVISO] El frontend no respondio en 2 minutos. Mira:  iniciar.bat logs
)

REM El backend tarda mas: monta Mongo y carga el modelo bajo demanda.
set "BACKEND=0"
curl -fs -m 5 "http://localhost:%WEB_PORT%/api/market-indicators" >nul 2>&1
if not errorlevel 1 set "BACKEND=1"
if "%BACKEND%"=="0" (
    curl -fs -m 5 "http://localhost:%WEB_PORT%/docs" >nul 2>&1
    if not errorlevel 1 set "BACKEND=1"
)
if "%BACKEND%"=="1" (
    echo [OK] Backend respondiendo.
) else (
    echo [AVISO] El backend aun no responde; puede tardar otro minuto. Compruebalo en /docs.
)

echo.
docker compose ps
echo.
echo [OK] Listo. Abrelo en:
echo     http://localhost:%WEB_PORT%
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "IP=%%I"
    set "IP=!IP: =!"
    if not "!IP:~0,4!"=="127." echo     http://!IP!:%WEB_PORT%      ^(desde otro equipo de la red^)
)
echo     http://localhost:%WEB_PORT%/docs   ^(API^)
echo.
echo   Si no ves los cambios: no se ha recompilado la imagen.
echo   Ejecuta  compilar.bat frontend  y vuelve a  iniciar.bat
goto fin_ok

REM ---------------------------------------------------------------------------
:ayuda
echo.
echo   iniciar.bat              levanta los contenedores y espera a que respondan
echo   iniciar.bat dev          modo desarrollo con recarga en caliente ^(sin Docker^)
echo   iniciar.bat parar        para los contenedores
echo   iniciar.bat logs         sigue los logs
echo   iniciar.bat estado       que hay levantado ahora mismo
echo.
echo   /recompilar   compila antes de levantar
echo.
goto fin_ok

:fin_error
set "EXITCODE=1"
goto pausa

:fin_ok
set "EXITCODE=0"

:pausa
REM Solo pausa si se ha lanzado con doble clic; si no, la ventana se cerraria
REM de golpe sin dejar leer las URLs.
set "_LANZADO=%cmdcmdline%"
if not "!_LANZADO!"=="!_LANZADO:/c=!" pause
endlocal & exit /b %EXITCODE%
