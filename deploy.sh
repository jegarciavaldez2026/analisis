#!/bin/bash
# Despliegue de Analisis Financiero en homelab (Docker Compose)
set -euo pipefail

cd "$(cd "$(dirname "$0")" && pwd)"

info() { echo -e "\033[1;34m>>> $*\033[0m"; }
err()  { echo -e "\033[1;31m!!! $*\033[0m" >&2; }

# --- Comprobaciones previas ---
command -v docker >/dev/null || { err "Docker no esta instalado."; exit 1; }
docker compose version >/dev/null 2>&1 || { err "Falta el plugin 'docker compose' (v2)."; exit 1; }

if [ ! -f .env ]; then
    info "No hay .env, lo creo desde .env.example"
    cp .env.example .env
    if command -v openssl >/dev/null; then
        KEY=$(openssl rand -hex 32)
        sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${KEY}|" .env
        info "SECRET_KEY generada automaticamente."
    else
        err "Edita .env y define SECRET_KEY antes de continuar."
        exit 1
    fi
fi

if grep -q "^SECRET_KEY=cambia-esto" .env; then
    err "SECRET_KEY sigue con el valor de ejemplo. Editalo en .env."
    exit 1
fi

WEB_PORT=$(grep -E "^WEB_PORT=" .env | cut -d= -f2 || echo 8080)
WEB_PORT=${WEB_PORT:-8080}

case "${1:-up}" in
    up)
        info "Construyendo imagenes (la primera vez tarda 15-25 min: compila llama-cpp y baja el modelo de 1.1GB)"
        docker compose build
        info "Levantando servicios..."
        docker compose up -d
        ;;
    cloudflare)
        info "Levantando con Cloudflare Tunnel..."
        grep -qE "^CF_TUNNEL_TOKEN=.+" .env || { err "Define CF_TUNNEL_TOKEN en .env"; exit 1; }
        docker compose --profile cloudflare up -d --build
        ;;
    down)
        docker compose down
        exit 0
        ;;
    logs)
        docker compose logs -f
        exit 0
        ;;
    *)
        echo "Uso: $0 [up|cloudflare|down|logs]"
        exit 1
        ;;
esac

# --- Esperar a que responda ---
info "Esperando al backend (puede tardar ~1 min)..."
for i in $(seq 1 60); do
    if curl -fs "http://localhost:${WEB_PORT}/api/market-indicators" >/dev/null 2>&1 \
       || curl -fs "http://localhost:${WEB_PORT}/docs" >/dev/null 2>&1; then
        info "Backend respondiendo."
        break
    fi
    [ "$i" -eq 60 ] && err "El backend no respondio a tiempo. Revisa: docker compose logs backend"
    sleep 3
done

echo
docker compose ps
echo
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
info "Listo. Accede en:"
echo "    http://localhost:${WEB_PORT}"
[ -n "${IP:-}" ] && echo "    http://${IP}:${WEB_PORT}   (desde la LAN)"
echo "    http://localhost:${WEB_PORT}/docs   (API)"
