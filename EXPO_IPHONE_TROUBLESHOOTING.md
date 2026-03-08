# 📱 Guía de Troubleshooting: Expo Go en iPhone

## Problema Reportado
La aplicación no se ejecuta en Expo Go desde iPhone.

---

## ✅ Soluciones Paso a Paso

### Solución 1: Usar el Tunnel URL Correcto

**El tunnel URL de tu aplicación es:**
```
https://wealth-hub-69.preview.emergentagent.com
```

**Pasos en tu iPhone:**

1. **Abre la app Expo Go** en tu iPhone
2. **Ve a la pestaña "Projects"** o presiona el botón "+"
3. **Ingresa el URL del tunnel** manualmente:
   ```
   exp://invest-oracle-8.preview.emergentagent.com
   ```
   O también puedes probar con:
   ```
   https://wealth-hub-69.preview.emergentagent.com
   ```

4. **Presiona "Connect"** o "Abrir"

---

### Solución 2: Escanear QR Code (Si está disponible)

Si ves un código QR en la consola de Expo:

1. Abre **Expo Go** en tu iPhone
2. Presiona el botón de **escanear QR**
3. Apunta la cámara al código QR
4. La app debería cargarse automáticamente

---

### Solución 3: Verificar Conexión de Red

**Ambos dispositivos deben estar en la misma red:**

❌ **Problema común:** iPhone en WiFi y servidor en otra red

✅ **Solución:**
- Asegúrate de que tu iPhone tenga acceso a internet
- El tunnel de Expo funciona a través de internet, no necesitas estar en la misma red local
- Verifica que no estés usando VPN en tu iPhone

---

### Solución 4: Limpiar Caché de Expo Go

1. En tu iPhone, abre **Expo Go**
2. Ve a **Configuración** (Settings)
3. Busca la opción **"Clear Cache"** o **"Limpiar Caché"**
4. Confirma la limpieza
5. Cierra completamente la app (desliza hacia arriba desde la multitarea)
6. Vuelve a abrir Expo Go e intenta nuevamente

---

### Solución 5: Reinstalar Expo Go

Si nada funciona:

1. **Desinstala Expo Go** de tu iPhone
2. Ve al **App Store**
3. Busca **"Expo Go"**
4. **Reinstala** la aplicación
5. Intenta conectarte nuevamente con el URL del tunnel

---

### Solución 6: Verificar Versión de iOS

**Requisitos mínimos:**
- iOS 13.0 o superior
- Expo Go última versión desde App Store

**Verificar tu versión:**
1. Ve a **Ajustes** → **General** → **Información**
2. Busca **"Versión"**
3. Si es menor a iOS 13, necesitas actualizar tu iPhone

---

### Solución 7: Probar en Safari (Alternativa)

Como última opción, puedes probar la versión web:

1. Abre **Safari** en tu iPhone
2. Navega a: `https://wealth-hub-69.preview.emergentagent.com`
3. La app debería cargar como web app
4. Para mejor experiencia, presiona el botón de **compartir** y selecciona **"Añadir a pantalla de inicio"**

---

## 🔍 Errores Comunes y Sus Soluciones

### Error: "Unable to connect to tunnel"

**Causa:** Problemas con la conexión del tunnel de Expo

**Soluciones:**
1. Verifica tu conexión a internet en el iPhone
2. Desactiva VPN si está activa
3. Intenta con datos móviles en lugar de WiFi
4. Espera 1-2 minutos y vuelve a intentar

### Error: "Couldn't load exp://..."

**Causa:** URL incorrecto o app no está corriendo en el servidor

**Soluciones:**
1. Verifica que el URL sea exactamente: `exp://invest-oracle-8.preview.emergentagent.com`
2. Verifica que el servidor esté corriendo (contacta al desarrollador)
3. Intenta con `https://` en lugar de `exp://`

### Error: "Project opened in another development session"

**Causa:** El proyecto está abierto en otro dispositivo

**Soluciones:**
1. Cierra Expo Go en otros dispositivos
2. Espera 30 segundos
3. Vuelve a intentar

### Error: "Network request failed"

**Causa:** Problemas de conectividad

**Soluciones:**
1. Verifica que tengas internet activo
2. Desactiva el modo avión si está activado
3. Cambia de WiFi a datos móviles o viceversa
4. Reinicia el WiFi en tu iPhone

---

## 📞 Información de Soporte

### URLs del Proyecto
- **Tunnel URL**: `https://wealth-hub-69.preview.emergentagent.com`
- **Expo URL**: `exp://invest-oracle-8.preview.emergentagent.com`
- **Web URL**: `https://wealth-hub-69.preview.emergentagent.com`

### Estado del Servidor
✅ Backend: Corriendo en puerto 8001
✅ Frontend: Corriendo en puerto 3000
✅ Tunnel: Conectado y listo
✅ MongoDB: Operativo

---

## 🎯 Pasos Recomendados (Orden de Prioridad)

1. **Primero:** Intenta con el URL del tunnel manualmente en Expo Go
2. **Segundo:** Limpia caché de Expo Go
3. **Tercero:** Verifica tu conexión de red (desactiva VPN)
4. **Cuarto:** Reinstala Expo Go
5. **Quinto:** Prueba en Safari como alternativa

---

## 📸 Necesitas Más Ayuda?

Si el problema persiste, por favor proporciona:

1. **Captura de pantalla** del error específico que ves en Expo Go
2. **Versión de iOS** (Ajustes → General → Información)
3. **Versión de Expo Go** (visible en la app)
4. **Tipo de conexión** (WiFi o datos móviles)
5. **Mensaje de error exacto** si aparece alguno

Con esta información podremos diagnosticar el problema exacto y proporcionar una solución específica.

---

## ✅ Verificación Exitosa

Si ves la pantalla de **"Análisis Financiero"** con:
- Un ícono de gráfico de barras
- Campo de búsqueda para tickers
- Ejemplos (AAPL, MSFT, GOOGL, etc.)
- Tabs en la parte inferior

**¡Felicidades! La app está funcionando correctamente.**

---

**Última actualización:** Enero 27, 2026
**Versión de la app:** 1.0.0
**Nombre de la app:** Análisis Financiero
