#!/bin/bash
# Reconstruir y levantar todos los contenedores
set -e
cd ""/bin"

echo "[1/3] Deteniendo contenedores..."
docker compose down

echo "[2/3] Reconstruyendo imagenes..."
docker compose build

echo "[3/3] Levantando contenedores..."
docker compose up -d

echo "Contenedores levantados! Backend: http://localhost:8002"
