#!/bin/bash
# Script principal para iniciar todo el proyecto Analisis
cd ""/bin"

case "all" in
  rebuild)
    echo ">>> Reconstruyendo contenedores..."
    docker compose down
    docker compose build
    docker compose up -d
    echo "Contenedores listos! Backend: http://localhost:8002"
    ;;
  start)
    echo ">>> Iniciando frontend..."
    cd frontend && npx expo start --web -c
    ;;
  all)
    echo ">>> Paso 1: Reconstruyendo contenedores..."
    docker compose down
    docker compose build
    docker compose up -d
    echo ">>> Paso 2: Iniciando frontend..."
    cd frontend && npx expo start --web -c
    ;;
  *)
    echo "Uso: /bin/bash [rebuild|start|all]"
    exit 1
    ;;
esac
