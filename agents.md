# agents.md — notas para quien retome esto

Compañero de `CLAUDE.md`. Ese archivo cuenta cómo está montado el proyecto;
éste cuenta **qué se cambió en la sesión del 9-10 de septiembre de 2026 y por
qué**, con el foco puesto en los errores encontrados, porque casi todos eran de
la misma familia y volverán a aparecer si no se recuerdan.

---

## La lección de la sesión

**Casi todos los bugs eran números correctos que mentían.**

Ninguno lanzaba una excepción. Ninguno lo cazaba `tsc`, ni el lint, ni los
scripts de verificación. Todos daban una cifra plausible, con su formato, su
color y sus decimales, y todos afirmaban algo que no era cierto. Se
encontraron **verificando contra datos reales**, no leyendo el código.

| Lo que se veía | Lo que pasaba de verdad |
|---|---|
| Coppock siempre `bear`, valor `0.0` | Necesita ~105 barras semanales y recibía 52. Todos los valores salían `None` y caía al `0.0` por defecto. `0.0 > 0` es falso ⇒ `bear` para todos los tickers, siempre. Además costaba 4,5 puntos del score a todo el mundo |
| Horquilla del 1,45 % en PBF | Corwin-Schultz leyendo el ATR del 5 %, no la horquilla. Una acción de 184 M$ diarios no tiene esa horquilla. El coste de cruce salía en ~28.000 $ y habría desaconsejado una operación viable |
| `beta −0,50` | Aritméticamente correcta, estadísticamente vacía: correlación −0,10, R² = 0,01. El texto además decía «se mueve menos que el mercado» cuando se mueve 5× más, solo que desacompasado |
| Estructura «lateral» en tendencia limpia | Una tendencia sin retrocesos no genera pivotes, y el código caía al valor por defecto — afirmando rango justo cuando pasaba lo contrario |
| `market_regime` siempre `ranging` | `float(Series).iloc[-1]` en vez de `float(Series.iloc[-1])`: reventaba, se tragaba la excepción y dejaba los valores por defecto |
| Confianza de Wyckoff «1 %» | El backend manda `margen / 30` acotado a 1 (0,59), no un porcentaje |

**La regla que sale de aquí:** cuando una cifra dependa de una ventana, una
escala o un supuesto, **verificarla contra un caso cuyo resultado se conozca**
antes de darla por buena. Y si no se puede sostener, dibujar el hueco: este
proyecto ya tenía decidido que un hueco honesto vale más que un número
inventado, y la sesión no ha hecho más que confirmarlo.

---

## Lo que la fuente de datos SÍ y NO da

Medido, no supuesto. Deja de discutirse cada vez que se mire.

**Sí:**

| Resolución | Histórico | Barras (TSLA) |
|---|---|---|
| 1m | 5 días | 1.949 |
| 5m | 60 días | 4.680 |
| 15m | 1 mes | 572 |
| 1h | 60 días | 420 |
| 1d / 1wk | años | — |

**No, y no hay atajo:** bid/ask, profundidad de mercado, tape, reparto por
nivel de precio, clasificación de agresores, cadena de opciones.
`history()` devuelve `[Open, High, Low, Close, Volume]` y nada más.

Corolario que ha costado dos conversaciones: **no se puede hacer un footprint.**
Ni con esta biblioteca ni con ninguna. El propio autor de
`lightweight-orderflow-charts` lo escribe en su README: *«price-level bid/ask
participation data cannot be derived from OHLCV alone»*, y su demo usa
*«locally crafted fixture data»*. Ese TSLA tan vivo son números escritos a mano.

---

## Qué sustituye al libro de nivel II

En vez de dejar el panel vacío, el robot mide lo que sí es medible y **con eso
decide el tamaño**:

- **Corwin-Schultz (2012)** — horquilla efectiva desde máximos y mínimos.
  Sobreestima cuando la volatilidad domina, así que viaja como **cota superior**
  y se **descarta** si contradice al volumen negociado (una acción de 184 M$/día
  no tiene 1,45 % de horquilla). 18 pruebas en `backend/test_liquidez.py`.
- **Amihud** — movimiento de precio por millón de dólares negociado.
- **Participación al 1 % del volumen medio** — el tope de tamaño. El plan de
  posición toma `min(riesgo, liquidez)` y **dice cuál de los dos manda**.

Y **clusters de volumen por precio** (`lib/estrategia/clusters.ts`): la rejilla
del footprint con volumen real por celda, sin el desdoble bid/ask. Rotulado en
la propia tarjeta, no en letra pequeña, porque la forma engaña.

---

## Rendimiento y límite del proveedor

Yahoo limitó la IP durante la sesión y tumbó la aplicación entera. Causa:
`/overton` **no tenía caché** y cada carga de pantalla redescargaba media docena
de series.

Ahora, en `backend/server.py`:

- **Caché** — `/overton` 5 min, `/chart` 10 min, `/technical` 5 min,
  `/intradia` 60 s, `/market-indicators` 60 s.
- **Cortafuegos** — al primer 429 se corta la salida 5 minutos. Antes cada
  recarga renovaba la ventana de bloqueo; por eso no se despejaba nunca.
- **Reserva en frío** — si el proveedor corta, se sirve la última lectura buena
  **etiquetada con su edad** (`_procedencia: 'reserva'`, `_edad_s`).

Medido: 1ª petición 11,0 s → 2ª **0,21 s**.

⚠️ **`CADENCIA_REFRESCO_S` (5 min) = el TTL de la caché de `/overton`.** No es
un número redondo: refrescar más a menudo devuelve la misma respuesta cacheada,
o sea movimiento en pantalla sin dato nuevo detrás. Si cambia el TTL, cambia
esa constante.

---

## Dos trampas de infraestructura que costaron horas

**1. El proveedor devuelve la barra de hoy vacía fuera de horario.**
Open/High/Low/Close a `NaN` y volumen 0. Todo lo que lee `iloc[-1]` heredaba
ese NaN, y como JSON no admite NaN, **un solo campo tumbaba la respuesta entera
con sus quince paneles**. Aparecía y desaparecía según la hora.

Arreglado envolviendo `yf.Ticker.history` una vez al arrancar (hay 35 llamadas
repartidas; parchearlas una a una garantizaba olvidar alguna). Más
`limpiar_no_finitos()` como red antes de cachear.

**2. El modelo local no admite llamadas concurrentes.**
Dos hilos en `create_chat_completion` corrompían el KV-cache y abortaban el
proceso con un `GGML_ASSERT` — el backend en bucle de reinicios. El semáforo de
3 no servía: `LOCK_LLM` en `traduccion.py` es lo único que serializa de verdad,
y lo usan también las llamadas de `server.py`.

Consecuencia: traducir es **secuencial**, 15-25 s por texto. Por eso `/overton`
tiene un presupuesto de 8 s (`asyncio.wait_for`) y devuelve el titular en inglés
antes que bloquear los quince paneles esperando una traducción.

---

## Reglas de FastAPI aprendidas por las malas

- **`response_model` descarta los campos que el modelo no declara.** Se quitó de
  `/market-indicators`, `/chart` y `/technical` para que sobrevivan las marcas
  `_procedencia` / `_edad_s`. La forma la sigue garantizando el modelo, que es
  con quien se construye la respuesta.
- **Cuidado al sanear con `response_model` puesto.** En `/technical` los campos
  numéricos son `float` NO opcionales: convertir `NaN → None` habría hecho
  fallar la validación y devuelto **el mismo 500 por otra puerta**.
- **Sanear ANTES de cachear.** Si no, el valor malo queda guardado y repite el
  error durante todo el TTL.

---

## Interfaz

`DESIGN.md` sigue siendo la norma y **no se tocó la dirección visual**. Se
consultó UI UX Pro Max y devolvió un patrón de landing B2B con paleta OLED
genérica: se descartó, porque habría sustituido un sistema documentado y
verificado en contraste por una plantilla cualquiera.

Lo que sí se corrigió:

- **Migración de tema terminada.** Cero literales de color en los componentes
  vivos. El único que queda es deliberado: el degradado del SVG exportado en
  `FinancialStatements.jsx` — un documento impreso no debe invertirse porque el
  usuario tenga el modo oscuro.
- **Distorsión de `/strategy`:** `Cifra` no limitaba líneas y un importe largo
  envolvía a tres renglones descuadrando la franja de KPIs; 10 KPIs en
  escritorio no caben (bajados a 5); y el shell usaba `minHeight: 100vh`, así
  que `overflow: auto` nunca creaba scroll propio y la barra lateral se
  despegaba al bajar.
- **Espacios en blanco:** eran dos bandas de rejilla separadas, y cada banda es
  un corte de fila duro. Fusionadas en tres columnas continuas.
- **`generatePDF` reventaba** con `ReferenceError: c is not defined`, y además
  usaba sintaxis JSX (`fill={c.x}`) dentro de una plantilla de texto, donde no
  interpola: se emitía literalmente.
- **Símbolo compartido** (`contexts/SimboloContext.tsx`): Estrategia y Overton
  ya no pueden estar mirando valores distintos.

---

## Cómo verificar sin poder abrir el navegador

En este orden, y **siempre antes de dar algo por terminado**:

```bash
cd frontend
npx --no-install tsc --noEmit          # tipos
node scripts/verificar-ambitos.js      # identificadores sin declarar (AST)
node scripts/verificar-imports.js      # rutas relativas rotas
```

```bash
# Backend: sintaxis sin arrancar nada
docker run --rm -v "/c/analisis/backend:/app" -w "/app" python:3.11-slim \
  python -m py_compile server.py

# Pruebas de las fórmulas
docker exec analisis_backend python -m pytest /app/test_liquidez.py -q
```

En Git Bash hay que anteponer `MSYS_NO_PATHCONV=1` a los `docker` con rutas
absolutas, o convierte `/app` en `C:/Program Files/Git/app`.

**Y lo más importante:** contrastar la salida real contra un caso cuyo resultado
se conozca. Los seis bugs de la tabla de arriba salieron así, no leyendo código.

Para probar la matemática de un módulo TypeScript sin montar un runner:

```bash
npx --no-install tsc prueba.ts --outDir out --module commonjs \
  --target es2020 --esModuleInterop --skipLibCheck && node out/prueba.js
```

---

## Cuidado con esto

- **Editar un `.tsx` no cambia nada en el navegador.** El bundle se compila
  DENTRO de la imagen: `compilar.bat frontend` y luego `iniciar.bat`. Ya pasó
  una vez esta sesión: el usuario veía datos de demo que hacía tiempo que no
  estaban en el código.
- **No commitear `*.gguf`.** Son 1,1 GB y no se quitan del historial sin
  reescribirlo entero. Ya está en `.gitignore`.
- **No fabricar el desdoble bid/ask.** Es la tentación recurrente y produciría
  la versión más convincente posible de una mentira: un footprint parece
  autoritario y cada celda sería inventada.
