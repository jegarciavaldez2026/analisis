#!/bin/bash
# Reconstruir y levantar todos los contenedores (backend, mongo)
set -e

echo "========================================"
echo "  Analisis - Reconstruir contenedores"
echo "========================================"
echo ""

cd ""/bin"

echo "[1/3] Deteniendo contenedores..."
docker compose down

echo ""
echo "[2/3] Reconstruyendo imagenes..."
docker compose build

echo ""
echo "[3/3] Levantando contenedores..."
docker compose up -d

echo ""
echo "========================================"
echo "  Contenedores levantados!"
echo "========================================"
echo ""
echo "  Backend:  http://localhost:8002"
echo "  API Docs: http://localhost:8002/docs"
echo "  Mongo:    localhost:27017"
echo ""
echo "  Estado de contenedores:"
docker compose ps
echo ""
echo "Para iniciar el frontend ejecuta: ./start.sh"
