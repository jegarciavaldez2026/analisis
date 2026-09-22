#!/usr/bin/env bash
#
# iniciar.sh — levanta la app y te dice dónde verla.
#
#   ./iniciar.sh              levanta los contenedores y espera a que respondan
#   ./iniciar.sh dev          modo desarrollo con recarga en caliente (sin Docker)
#   ./iniciar.sh parar        para los contenedores
#   ./iniciar.sh logs         sigue los logs
#   ./iniciar.sh estado       qué hay levantado ahora mismo
#
#   --recompilar    compila antes de levantar (equivale a ./compilar.sh && ./iniciar.sh)
#
# Si has tocado código y quieres verlo:  ./compilar.sh frontend && ./iniciar.sh
# Si vas a iterar mucho sobre la UI:     ./iniciar.sh dev
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$SCRIPT_DIR/frontend"
MODE="up"
REBUILD=0

for arg in "$@"; do
  case "$arg" in
    dev)          MODE="dev" ;;
    parar|stop|down) MODE="down" ;;
    logs)         MODE="logs" ;;
    estado|ps)    MODE="ps" ;;
    --recompilar) REBUILD=1 ;;
    -h|--help|help)
      sed -n '3,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
  esac
done

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

cd "$SCRIPT_DIR"

# Igual que en compilar.sh: un `node_modules` incompleto engaña al `-d`.
deps_ok() { [ -f "$FRONTEND/node_modules/expo/package.json" ]; }

# ── Modo desarrollo: sin Docker, con recarga en caliente ────────────────────
# Para iterar sobre la interfaz. Cada cambio se ve al guardar, sin reconstruir
# ninguna imagen. Necesita el backend levantado aparte.
if [ "$MODE" = "dev" ]; then
  step "Modo desarrollo (recarga en caliente)"
  deps_ok || {
    echo "  Instalando dependencias (tarda unos minutos)…"
    (cd "$FRONTEND" && npm install --no-audit --no-fund --legacy-peer-deps)
  }
  if command -v docker >/dev/null 2>&1 && ! docker compose ps --status running 2>/dev/null | grep -q analisis_backend; then
    warn "El backend no parece estar levantado."
    warn "En otra terminal:  ./iniciar.sh    (o  docker compose up -d backend mongo)"
  fi
  echo "  Expo arrancará en http://localhost:8081 · Ctrl+C para parar."
  cd "$FRONTEND"
  exec npx expo start --web -c
fi

command -v docker >/dev/null 2>&1 || die "docker no está instalado o no está en PATH"
docker compose version >/dev/null 2>&1 || die "Falta el plugin 'docker compose' (v2)"

case "$MODE" in
  down)
    step "Parando"
    docker compose down
    ok "Parado."
    exit 0 ;;
  logs)
    exec docker compose logs -f ;;
  ps)
    docker compose ps
    exit 0 ;;
esac

[ -f .env ] || die "No hay .env. Ejecuta primero ./compilar.sh, que lo crea."

WEB_PORT="$(grep -E '^WEB_PORT=' .env | cut -d= -f2- | tr -d '[:space:]')"
WEB_PORT="${WEB_PORT:-8080}"

if [ "$REBUILD" -eq 1 ]; then
  "$SCRIPT_DIR/compilar.sh"
fi

step "Levantando servicios"
# `up -d` recrea el contenedor cuando la imagen ha cambiado, así que después de
# compilar no hace falta bajar nada a mano.
docker compose up -d

step "Esperando a que la app responda"
READY=0
for i in $(seq 1 60); do
  if curl -fs "http://localhost:${WEB_PORT}/healthz" >/dev/null 2>&1; then
    READY=1
    break
  fi
  printf '.'
  sleep 2
done
echo

if [ "$READY" -eq 1 ]; then
  ok "Frontend sirviendo."
else
  warn "El frontend no respondió en 2 minutos. Mira:  ./iniciar.sh logs"
fi

# El backend tarda más: monta Mongo y carga el modelo bajo demanda.
if curl -fs "http://localhost:${WEB_PORT}/api/market-indicators" >/dev/null 2>&1 \
   || curl -fs "http://localhost:${WEB_PORT}/docs" >/dev/null 2>&1; then
  ok "Backend respondiendo."
else
  warn "El backend aún no responde; puede tardar otro minuto. Compruébalo en /docs."
fi

echo
docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
echo
IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
ok "Listo. Ábrelo en:"
echo "    http://localhost:${WEB_PORT}"
[ -n "${IP:-}" ] && echo "    http://${IP}:${WEB_PORT}      (desde otro equipo de la red)"
echo "    http://localhost:${WEB_PORT}/docs   (API)"
echo
echo "  Si no ves los cambios: no se ha recompilado la imagen."
echo "  Ejecuta  ./compilar.sh frontend  y vuelve a  ./iniciar.sh"
