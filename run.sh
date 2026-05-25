#!/bin/bash
# Script principal para iniciar todo el proyecto Analisis
# Uso: ./run.sh [rebuild|start|all]
#   rebuild - Solo reconstruye contenedores
#   start   - Solo inicia el frontend
#   all     - Reconstruye contenedores e inicia frontend (default)

cd "$(dirname "$0")"

case "${1:-all}" in
  rebuild)
    echo ">>> Reconstruyendo contenedores..."
    docker compose down
    docker compose build
    docker compose up -d
    echo ""
    echo "Contenedores listos!"
    echo "  Backend:  http://localhost:8002"
    echo "  API Docs: http://localhost:8002/docs"
    docker compose ps
    ;;
  start)
    echo ">>> Iniciando frontend..."
    cd frontend && npx expo start -c
    ;;
  all)
    echo ">>> Paso 1: Reconstruyendo contenedores..."
    docker compose down
    docker compose build
    docker compose up -d
    echo ""
    echo "Contenedores listos!"
    echo "  Backend:  http://localhost:8002"
    echo "  API Docs: http://localhost:8002/docs"
    docker compose ps
    echo ""
    echo ">>> Paso 2: Iniciando frontend..."
    echo ""
    cd frontend && npx expo start -c
    ;;
  *)
    echo "Uso: $0 [rebuild|start|all]"
    echo ""
    echo "  rebuild  - Reconstruye y levanta contenedores Docker"
    echo "  start    - Inicia solo el frontend Expo"
    echo "  all      - Reconstruye contenedores + inicia frontend (por defecto)"
    exit 1
    ;;
esac
