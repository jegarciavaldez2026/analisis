# Despliegue — Análisis Financiero

Guía para levantar la app en un homelab (Proxmox + Docker) y, más adelante, en internet.

## Qué es este proyecto

| Capa | Tecnología | Detalle |
|---|---|---|
| Frontend | Expo 54 / React Native 0.81 + expo-router | Se compila a web estática (26 rutas) con `react-native-web` |
| Backend | FastAPI + uvicorn | 49 endpoints bajo `/api`, auth JWT, datos vía `yfinance` |
| Base de datos | **MongoDB 7** (`motor`, async) | Colecciones: `analyses`, `watchlist`, `portfolio`, `users`, `cash_movements` |
| IA | Qwen3-1.7B GGUF vía `llama-cpp-python` | Local, en CPU. Carga perezosa: si falta el modelo la app arranca igual |

> **Nota:** el proyecto **no usa PostgreSQL**. Es MongoDB. No hay ninguna referencia a Postgres, SQLAlchemy ni psycopg en el código.

## Arquitectura de red

```
Internet / LAN
      │
      ▼
[ reverse proxy o Cloudflare Tunnel ]
      │
      ▼
┌─────────────────────────────────────┐
│ frontend (nginx :80)                │
│  · sirve el HTML/JS estático        │
│  · proxea /api/ ──────────────┐     │
└───────────────────────────────┼─────┘
                                ▼
                    ┌───────────────────────┐
                    │ backend (uvicorn:8000)│
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │ mongo :27017 (volumen)│
                    └───────────────────────┘
```

La clave del diseño: **el frontend llama a `/api/...` relativo**, no a un host fijo. nginx sirve la app y proxea la API en el **mismo origen**. Consecuencias prácticas:

- No hay CORS que configurar.
- El mismo build funciona en `http://192.168.1.50:8080`, en `https://analisis.tudominio.com` y en un VPS, **sin recompilar**.
- Mongo y el backend no publican puertos al host: solo se alcanzan por la red interna de Docker.

## Requisitos

- Docker Engine + plugin Compose (`docker compose version` ≥ 2)
- ~8 GB de disco libre (la imagen del backend lleva el modelo de 1.1 GB y compila `llama-cpp-python`)
- 16 GB de RAM en el host (confirmado en tu caso)

Si vas por **LXC en Proxmox**, el contenedor debe ser *privileged* o tener `nesting=1` activado para correr Docker dentro. Una **VM** evita ese problema y es la opción recomendada si no quieres pelear con permisos.

## Puesta en marcha

```bash
cd /ruta/al/proyecto

# 1. Configuración
cp .env.example .env
nano .env                       # define SECRET_KEY como mínimo

# Genera una clave decente:
openssl rand -hex 32

# 2. Construir y arrancar
docker compose up -d --build

# 3. Seguir el arranque
docker compose logs -f backend
```

Abre `http://IP_DEL_HOST:8080`.

> El primer build tarda **15–25 minutos**: compila `llama-cpp-python` desde fuente y descarga el modelo de 1.1 GB. Los builds siguientes son rápidos porque esas capas quedan cacheadas (el `Dockerfile.backend` descarga el modelo *antes* de copiar el código, precisamente para eso).

### Comandos habituales

```bash
docker compose ps                      # estado
docker compose logs -f backend         # logs
docker compose restart backend         # reiniciar tras tocar código
docker compose up -d --build frontend  # recompilar solo el frontend
docker compose down                    # parar (los datos sobreviven en el volumen)
docker compose down -v                 # parar Y BORRAR la base de datos
```

## Exposición

### Opción A — Reverse proxy con dominio

**Traefik:** el `docker-compose.yml` ya trae las labels. Define `APP_DOMAIN` en `.env` y conecta el servicio a tu red de Traefik:

```yaml
# añade a la sección networks del servicio frontend
networks:
  - analisis_net
  - traefik_proxy
```

**Nginx Proxy Manager / Caddy:** apunta un proxy host a `http://IP_DEL_HOST:8080`. No hace falta nada más — el contenedor ya resuelve `/api` internamente.

Activa WebSockets en el proxy si más adelante añades streaming.

### Opción B — Cloudflare Tunnel

1. Zero Trust → Networks → Tunnels → crea un túnel y copia el token.
2. Ponlo en `.env` como `CF_TUNNEL_TOKEN`.
3. En el panel de Cloudflare, define el public hostname apuntando al servicio **`http://frontend:80`**.
4. Arranca con el perfil:

```bash
docker compose --profile cloudflare up -d
```

No necesitas abrir ningún puerto en el router. Puedes quitar el mapeo `ports:` del servicio `frontend` si solo usas el túnel.

## Paso posterior a producción en internet

Lo que ya está resuelto: build estático portable, API en el mismo origen, secretos por entorno, sin puertos internos expuestos, healthchecks, límite de memoria.

Lo que **debes cambiar** antes de abrirlo al público:

1. **`SECRET_KEY`** — genera una nueva y distinta de la del homelab. Si se filtra, cualquiera puede forjar JWTs.
2. **CORS** — `server.py` tiene `allow_origins=["*"]`. Inofensivo mientras todo va por el mismo origen, pero restríngelo a tu dominio antes de exponerlo.
3. **Autenticación de Mongo** — ahora corre sin credenciales porque solo es accesible en la red interna de Docker. Si mueves Mongo fuera (Atlas, otro host), activa usuario/contraseña y TLS.
4. **Backups** — el volumen `mongo_data` guarda todo el historial y las carteras:
   ```bash
   docker compose exec -T mongo mongodump --archive --db=analisis_db > backup-$(date +%F).archive
   ```
5. **Rate limiting** — `yfinance` puede bloquearte por volumen de peticiones. Considera limitar `/api/analyze` y `/api/screener` en el reverse proxy.
6. **Coste del LLM** — el modelo necesita CPU y ~2 GB de RAM al cargarse. En un VPS pequeño va a ir lento; ahí sí conviene separarlo o desactivarlo.

## Cambios aplicados al preparar el despliegue

| Archivo | Problema | Corrección |
|---|---|---|
| `Dockerfile.backend` | `CMD` terminaba en un argumento vacío `""` → uvicorn no arrancaba | Eliminado; además el modelo se descarga antes de copiar el código para cachear la capa |
| `components/IchimokuChart.tsx` | URL fija `http://localhost:8002` | Usa `BACKEND_URL` del entorno |
| `components/IchimokuCloudChart.tsx` | Misma URL fija | Ídem |
| `app/screens/HistoryScreen.tsx` | Fallback `http://TU_IP_LOCAL:8001` | Fallback a cadena vacía |
| 14 archivos `.tsx`/`.jsx` | `process.env.EXPO_PUBLIC_BACKEND_URL` sin fallback → generaba `undefined/api/...` | Añadido `?? ''` |
| `docker-compose.yml` | Sin frontend; Mongo y backend expuestos al host | Tres servicios, red interna, healthchecks, labels de Traefik, perfil cloudflared |
| `nginx.conf` | No existía | Sirve estático + proxea `/api` con timeouts de 300 s |
| `.env.example` | No existía | Plantilla de configuración |

## Verificación realizada

- `npm ci` + `npx expo export --platform web` → **compila sin errores**, 26 rutas estáticas, bundle de 2.93 MB (8.4 MB con assets).
- Bundle comprobado: **0** ocurrencias de `undefined/api`, `http://localhost:` y `TU_IP_LOCAL`.
- Las variables que alimentan las plantillas de URL quedan inlineadas como `const S=""` → las 61 llamadas resuelven a `/api/...` relativo.
- `node --check` sobre el bundle: sin errores de sintaxis.
- Las dependencias sospechosas de no soportar web (`react-native-webview`, `worklets-core`, `flash-list`, `gifted-charts`) **no rompieron el build**.

Pendiente de validar en tu máquina (aquí no hay Docker): el build de las imágenes y el arranque de los tres contenedores.

## Si algo falla

**El backend reinicia en bucle** → `docker compose logs backend`. Casi siempre es `SECRET_KEY` sin definir en `.env`.

**La web carga pero los datos no** → abre las DevTools, pestaña Network. Si las peticiones a `/api/...` dan 502, el backend aún no está listo (el healthcheck da 90 s de margen). Si dan 404, nginx no está proxeando: revisa que `nginx.conf` se copió bien.

**El build del frontend falla por memoria** → dale más RAM a Docker o compila con `NODE_OPTIONS=--max-old-space-size=4096`.

**El asistente IA no responde** → comprueba que el modelo está en la imagen:
```bash
docker compose exec backend ls -lh /app/models
```
Si falta, la app funciona igual pero las rutas `/api/ai-assistant/*` devolverán error.
