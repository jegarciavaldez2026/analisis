# Procedimiento: compilar y ver los cambios

Dos scripts, en este orden:

```
compilar.bat frontend      REM mete el código nuevo en la imagen
iniciar.bat                REM levanta la app y te dice dónde verla
```

## Qué versión usar

Hay tres, todas equivalentes. Elige una y olvídate de las otras.

| Archivos | Cuándo |
|---|---|
| **`.bat`** | **Windows.** Doble clic desde el Explorador o `cmd`. Sin política de ejecución que configurar. Es la opción por defecto. |
| `.ps1` | Windows, si prefieres PowerShell. Requiere `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` la primera vez. |
| `.sh` | Linux, macOS, WSL o Git Bash. |

Los `.bat` se pueden ejecutar con doble clic: al terminar hacen `pause` para que puedas leer las URLs antes de que se cierre la ventana. Desde `cmd` no pausan, así se pueden encadenar.

En el resto de este documento los ejemplos van en `.sh`; sustituye `./compilar.sh` por `compilar.bat` y `./iniciar.sh` por `iniciar.bat`. Los modificadores cambian de forma: `--sin-cache` es `/sincache`, `--sin-tipos` es `/sintipos` y `--recompilar` es `/recompilar`.

---

## Por qué hacen falta dos pasos

El bundle web de Expo **se compila dentro de la imagen de Docker**, no en tu máquina. `Dockerfile.frontend` tiene dos etapas:

1. `node:22` instala dependencias y ejecuta `npx expo export --platform web`, que genera `dist/`.
2. `nginx:1.27` copia ese `dist/` y lo sirve, proxeando `/api/` al backend.

Consecuencia práctica: **editar un `.tsx` no cambia nada de lo que ves en el navegador hasta que reconstruyes la imagen.** El contenedor sigue sirviendo el bundle antiguo, que está congelado dentro de la imagen. Por eso `compilar` y `iniciar` están separados: uno produce el artefacto, el otro lo pone en marcha.

---

## Flujo normal: he tocado la interfaz

```bash
./compilar.sh frontend
./iniciar.sh
```

`compilar.sh frontend` hace tres cosas:

- Comprueba tipos con `tsc --noEmit`. **Avisa pero no aborta**, porque `expo export` transpila sin comprobar tipos: un error de TypeScript no impide compilar, pero es mejor enterarse antes de esperar el build.
- Verifica que `.env` existe y que `SECRET_KEY` no sigue con el valor de ejemplo. Si no hay `.env`, lo crea desde `.env.example` y genera la clave.
- Reconstruye la imagen. La capa de `npm ci` se reutiliza mientras no cambies `package.json`, así que sólo se rehace el bundle: el primer build tarda mucho, los siguientes bastante menos.

`iniciar.sh` levanta los servicios, espera a que `/healthz` responda, comprueba el backend e imprime las URLs. No hace falta `docker compose down` antes: `up -d` recrea el contenedor solo cuando la imagen ha cambiado.

## Flujo rápido: voy a iterar mucho sobre la UI

Reconstruir una imagen por cada ajuste de píxel es absurdo. Para eso:

```bash
./iniciar.sh          # en una ventana: deja backend y Mongo levantados
./iniciar.sh dev      # en otra: Expo con recarga en caliente
```

El modo `dev` arranca Metro en `http://localhost:8081` y cada cambio se ve al guardar. Cuando termines de iterar, compila una vez y comprueba el resultado en el contenedor: el build de producción no es idéntico al de desarrollo.

## He tocado el backend

```bash
./compilar.sh backend
./iniciar.sh
```

## He cambiado dependencias (`package.json` o `requirements.txt`)

```bash
./compilar.sh --sin-cache
./iniciar.sh
```

Sin `--sin-cache`, Docker puede reutilizar la capa de dependencias y quedarse con las viejas.

---

## Comandos de referencia

| Quiero… | Windows (`.bat`) | Linux / macOS (`.sh`) |
|---|---|---|
| Compilar todo | `compilar.bat` | `./compilar.sh` |
| Compilar sólo el frontend | `compilar.bat frontend` | `./compilar.sh frontend` |
| Compilar sólo el backend | `compilar.bat backend` | `./compilar.sh backend` |
| Build limpio, sin caché | `compilar.bat /sincache` | `./compilar.sh --sin-cache` |
| Generar `frontend/dist` sin Docker | `compilar.bat local` | `./compilar.sh local` |
| Levantar la app | `iniciar.bat` | `./iniciar.sh` |
| Compilar y levantar de una vez | `iniciar.bat /recompilar` | `./iniciar.sh --recompilar` |
| Desarrollo con recarga en caliente | `iniciar.bat dev` | `./iniciar.sh dev` |
| Ver los logs | `iniciar.bat logs` | `./iniciar.sh logs` |
| Ver qué está levantado | `iniciar.bat estado` | `./iniciar.sh estado` |
| Parar todo | `iniciar.bat parar` | `./iniciar.sh parar` |
| Ver la ayuda | `compilar.bat /?` | `./compilar.sh --help` |

En Windows los `.bat` usan `curl.exe` e `ipconfig`, que vienen con Windows 10 y 11. Sólo llaman a PowerShell para una cosa: generar la `SECRET_KEY` aleatoria la primera vez, porque `cmd` no sabe hacerlo.

---

## Dónde se ve

Con `WEB_PORT=8080` en `.env` (el valor por defecto):

- **App:** `http://localhost:8080`
- **Desde otro equipo de la red:** `http://<ip-de-la-máquina>:8080`
- **API:** `http://localhost:8080/docs`

Un único origen sirve la app y la API: el frontend llama a `/api/...` relativo y nginx lo proxea al backend. Por eso no hay CORS que configurar y funciona igual detrás de Traefik, de Cloudflare Tunnel o por IP en la LAN.

---

## Si no ves los cambios

En orden de probabilidad:

1. **No has recompilado.** Es la causa en nueve de cada diez casos. `./compilar.sh frontend && ./iniciar.sh`.
2. **Compilaste pero no levantaste.** La imagen nueva existe, el contenedor sigue con la vieja. `./iniciar.sh`.
3. **Caché del navegador.** Poco probable: `nginx.conf` sirve el HTML con `Cache-Control: no-cache` y sólo cachea los assets con hash en el nombre, que cambian en cada build. Aun así, Ctrl+Shift+R descarta la duda.
4. **El build falló y no lo viste.** `./iniciar.sh logs`, o repite `./compilar.sh frontend` y lee la salida entera.

## Aviso: `frontend/node_modules` está a medias

Hay una instalación de npm interrumpida en `frontend/node_modules`: tiene 31 paquetes de los cientos que necesita, y le falta `expo`. **Bórrala** antes de usar `./iniciar.sh dev` o `./compilar.sh local`:

```
rmdir /s /q frontend\node_modules        REM Windows
rm -rf frontend/node_modules             # Linux / macOS
```

Los scripts detectan el problema —comprueban que exista `node_modules/expo/package.json`, no sólo la carpeta— y reinstalan solos, pero partir de una carpeta a medias hace que npm tarde más y a veces deje conflictos. **La ruta de Docker no se ve afectada**: `Dockerfile.frontend` hace su propio `npm ci` dentro de la imagen y nunca mira las dependencias de tu máquina.

## Si el backend no responde

Tarda más que el frontend: levanta Mongo, espera a su healthcheck y carga el modelo bajo demanda. `iniciar.sh` avisa si a los dos minutos no contesta. Para investigar:

```bash
./iniciar.sh logs                    # todo
docker compose logs -f backend       # sólo el backend
```

---

## Relación con los scripts que ya había

- **`compilar` + `iniciar`** (en `.bat`, `.ps1` o `.sh`) son el camino recomendado: compilar y levantar, separados y explícitos.
- **`reiniciar.sh`** sigue sirviendo para el ciclo de desarrollo local (tipos, caché de Metro, arrancar Expo). Se solapa con `./iniciar.sh dev`.
- **`deploy.sh`** hace el despliegue completo con opciones extra (`cloudflare`, `down`, `logs`). Sigue siendo válido para el homelab.
- **`run.sh` y `rebuild.sh` están rotos** y no deberían usarse: ambos empiezan con `cd ""/bin"` —comillas sin cerrar y una ruta inexistente— así que fallan en la primera línea. `compilar.sh` e `iniciar.sh` cubren lo que pretendían hacer.
