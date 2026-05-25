#!/bin/bash
# Iniciar el frontend Expo
set -e

echo "========================================"
echo "  Analisis - Iniciar Frontend"
echo "========================================"
echo ""

cd "$(dirname "$0")/frontend"

echo "Backend URL: $EXPO_PUBLIC_BACKEND_URL"
echo "Iniciando Expo..."
echo ""

npx expo start -c
