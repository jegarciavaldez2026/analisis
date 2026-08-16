#!/usr/bin/env bash
#
# reiniciar.sh — reinicia la app y compila los cambios.
#
# Reemplaza a run.sh / rebuild.sh, que arrancaban con `cd ""/bin"`: comillas sin
# cerrar y una ruta que no existe, así que fallaban en la primera línea.
#
#   ./reiniciar.sh              → comprueba tipos y arranca el frontend web
#   ./reiniciar.sh dev          → igual que sin argumentos
#   ./reiniciar.sh build        → compila el build web estático en frontend/dist
#   ./reiniciar.sh docker       → reconstruye y levanta los contenedores
#   ./reiniciar.sh all          → docker + build web + arranca el frontend
#   ./reiniciar.sh check        → sólo comprobación de tipos
#
#   Opciones:  --no-check (salta tsc)   --keep-cache (conserva caché de Metro)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$SCRIPT_DIR/frontend"
MODE="${1:-dev}"
RUN_CHECK=1
CLEAR_CACHE=1

for arg in "$@"; do
  case "$arg" in
    --no-check) RUN_CHECK=0 ;;
    --no-cache) CLEAR_CACHE=1 ;;
    --keep-cache) CLEAR_CACHE=0 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m!  %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31m✗  %s\033[0m\n' "$1" >&2; exit 1; }

[ -d "$FRONTEND" ] || die "No se encuentra $FRONTEND"

# ── Dependencias ────────────────────────────────────────────────────────────
ensure_deps() {
  step "Dependencias"
  cd "$FRONTEND"
  # Un `node_modules` a medias engaña al `-d`: se comprueba un marcador real.
  if [ ! -f node_modules/expo/package.json ]; then
    echo "  node_modules no existe: instalando (esto tarda unos minutos)…"
    npm install --no-audit --no-fund --legacy-peer-deps
  elif [ package.json -nt node_modules ]; then
    echo "  package.json es más reciente que node_modules: reinstalando…"
    npm install --no-audit --no-fund --legacy-peer-deps
  else
    echo "  Al día."
  fi
}

# ── Comprobación de tipos ───────────────────────────────────────────────────
# No aborta el arranque: Metro compila aunque tsc se queje. A día de hoy el
# proyecto está en cero errores, así que cualquier fallo aquí es nuevo.
typecheck() {
  [ "$RUN_CHECK" -eq 1 ] || return 0
  step "Comprobación de tipos"
  cd "$FRONTEND"
  if npx --no-install tsc --noEmit; then
    echo "  Sin errores de tipos."
  else
    warn "Hay errores de tipos (arriba). Se continúa: Metro compila igualmente."
  fi
}

# ── Procesos colgados ───────────────────────────────────────────────────────
kill_stale() {
  step "Procesos anteriores"
  local killed=0
  for port in 8081 19000 19001 19006; do
    if command -v lsof >/dev/null 2>&1; then
      local pids
      pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
      if [ -n "$pids" ]; then
        echo "  Liberando puerto $port (PID $pids)"
        kill $pids 2>/dev/null || true
        killed=1
      fi
    fi
  done
  pkill -f "expo start" 2>/dev/null && killed=1 || true
  [ "$killed" -eq 1 ] && sleep 1 || echo "  Nada que cerrar."
}

clear_cache() {
  [ "$CLEAR_CACHE" -eq 1 ] || return 0
  step "Caché de Metro"
  rm -rf "$FRONTEND/.expo/web/cache" "${TMPDIR:-/tmp}"/metro-* "${TMPDIR:-/tmp}"/haste-map-* 2>/dev/null || true
  echo "  Limpiada."
}

# ── Acciones ────────────────────────────────────────────────────────────────
docker_up() {
  step "Contenedores (backend + base de datos)"
  command -v docker >/dev/null 2>&1 || die "docker no está instalado o no está en PATH"
  cd "$SCRIPT_DIR"
  docker compose down
  docker compose build
  docker compose up -d
  echo "  Backend en http://localhost:8002"
}

web_build() {
  step "Compilando el build web"
  cd "$FRONTEND"
  rm -rf dist
  npx expo export --platform web --output-dir dist
  bold "  Listo: $FRONTEND/dist"
}

dev_server() {
  step "Arrancando Expo (web)"
  cd "$FRONTEND"
  echo "  Backend configurado: ${EXPO_PUBLIC_BACKEND_URL:-$(grep -h EXPO_PUBLIC_BACKEND_URL .env 2>/dev/null | cut -d= -f2- || echo 'sin definir')}"
  echo "  Ctrl+C para parar."
  if [ "$CLEAR_CACHE" -eq 1 ]; then
    npx expo start --web -c
  else
    npx expo start --web
  fi
}

case "$MODE" in
  check)
    ensure_deps; typecheck
    ;;
  build)
    ensure_deps; typecheck; clear_cache; web_build
    ;;
  docker)
    docker_up
    ;;
  all)
    docker_up; ensure_deps; typecheck; kill_stale; clear_cache; web_build; dev_server
    ;;
  dev|"")
    ensure_deps; typecheck; kill_stale; clear_cache; dev_server
    ;;
  -h|--help|help)
    sed -n '3,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    ;;
  *)
    die "Modo desconocido: $MODE  (usa: dev | build | docker | all | check)"
    ;;
esac
