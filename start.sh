#!/bin/bash
# Iniciar el frontend Expo en modo web
set -e

echo "========================================"
echo "  Analisis - Iniciar Frontend"
echo "========================================"
echo ""

cd ""/bin/frontend"

echo "Backend URL: "
echo "Iniciando Expo (modo web)..."
echo ""

npx expo start --web -c
