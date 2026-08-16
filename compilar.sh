#!/usr/bin/env bash
#
# compilar.sh — compila los cambios.
#
# El bundle web de Expo se construye DENTRO de la imagen del frontend
# (Dockerfile.frontend, etapa 1: `npx expo export --platform web`). Por eso
# "compilar" aquí significa reconstruir la imagen: es lo único que hace que el
# código nuevo llegue al nginx que sirve la app.
#
#   ./compilar.sh                 comprueba tipos y reconstruye frontend + backend
#   ./compilar.sh frontend        sólo la imagen del frontend (lo habitual al tocar UI)
#   ./compilar.sh backend         sólo la imagen del backend
#   ./compilar.sh local           bundle en frontend/dist, sin Docker (para inspeccionarlo)
#
#   --sin-cache    ignora la caché de capas de Docker (build limpio, tarda mucho más)
#   --sin-tipos    salta la comprobación de TypeScript
#
# Después de compilar:  ./iniciar.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$SCRIPT_DIR/frontend"
TARGET="frontend backend"
NO_CACHE=""
RUN_CHECK=1

for arg in "$@"; do
  case "$arg" in
    frontend)    TARGET="frontend" ;;
    backend)     TARGET="backend" ;;
    todo|all)    TARGET="frontend backend" ;;
    local)       TARGET="local" ;;
    --sin-cache) NO_CACHE="--no-cache" ;;
    --sin-tipos) RUN_CHECK=0 ;;
    -h|--help|help)
      sed -n '3,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
  esac
done

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

cd "$SCRIPT_DIR"
[ -d "$FRONTEND" ] || die "No se encuentra $FRONTEND"

# Un `node_modules` a medias es peor que no tenerlo: npx se va al registro y
# baja una versión de Expo distinta a la del proyecto. Se comprueba un marcador
# real, no la mera existencia de la carpeta.
deps_ok() { [ -f "$FRONTEND/node_modules/expo/package.json" ]; }

# ── 1. Comprobación de tipos ────────────────────────────────────────────────
# Avisa pero no aborta: `expo export` transpila sin comprobar tipos, así que un
# error de tsc no impide compilar. Pero conviene enterarse antes, no después.
if [ "$RUN_CHECK" -eq 1 ]; then
  step "Comprobando tipos"
  if deps_ok; then
    if (cd "$FRONTEND" && npx --no-install tsc --noEmit); then
      ok "Sin errores de tipos."
    else
      warn "Hay errores de tipos (arriba). Se compila igualmente."
    fi
  else
    warn "No hay dependencias locales completas; la comprobación se salta."
    warn "Docker instala las suyas dentro de la imagen, así que el build no depende de esto."
  fi
fi

# ── 2. Ruta local (sin Docker) ──────────────────────────────────────────────
if [ "$TARGET" = "local" ]; then
  step "Compilando el bundle web en frontend/dist"
  cd "$FRONTEND"
  deps_ok || {
    echo "  Instalando dependencias (tarda unos minutos)…"
    npm install --no-audit --no-fund --legacy-peer-deps
  }
  rm -rf dist
  npx expo export --platform web --output-dir dist
  ok "Listo: $FRONTEND/dist"
  echo "  Para verlo:  npx serve frontend/dist"
  echo "  Ojo: así el frontend no tiene el nginx que proxea /api al backend."
  exit 0
fi

# ── 3. Ruta Docker (la que sirve la app de verdad) ──────────────────────────
command -v docker >/dev/null 2>&1 || die "docker no está instalado o no está en PATH"
docker compose version >/dev/null 2>&1 || die "Falta el plugin 'docker compose' (v2)"

if [ ! -f .env ]; then
  warn "No hay .env. Lo creo desde .env.example."
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    KEY=$(openssl rand -hex 32)
    sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${KEY}|" .env
    ok "SECRET_KEY generada."
  else
    die "Sin openssl: edita .env y define SECRET_KEY a mano antes de seguir."
  fi
fi
grep -q "^SECRET_KEY=cambia-esto" .env && die "SECRET_KEY sigue con el valor de ejemplo. Edítalo en .env."

step "Reconstruyendo imágenes: $TARGET"
echo "  La primera vez tarda bastante: compila el bundle de Expo dentro de la imagen."
echo "  Las siguientes reutilizan la capa de dependencias y sólo rehacen el bundle."
# shellcheck disable=SC2086
docker compose build $NO_CACHE $TARGET

echo
ok "Compilado."
docker images --format '  {{.Repository}}:{{.Tag}}  {{.Size}}  (creada {{.CreatedSince}})' \
  | grep -E 'analisis-(frontend|backend)' || true
echo
echo "  Siguiente paso:  ./iniciar.sh"
