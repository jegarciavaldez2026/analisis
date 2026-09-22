#!/bin/bash
# Iniciar el frontend Expo en modo web
set -e

echo "================================"
echo "  Analisis - Iniciar Frontend"
echo "================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "frontend" ]; then
    echo "Error: No se encuentra la carpeta frontend en $SCRIPT_DIR"
    exit 1
fi

cd frontend

echo "Brkend URL: $EXPO_PUBLIC_BACKEND_URL"
echo "Iniciando Expo en modo web..."

npx expo start --web -c
