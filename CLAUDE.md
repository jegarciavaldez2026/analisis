# CLAUDE.md — contexto del proyecto

Notas para retomar el trabajo sin volver a investigar lo ya investigado.
Última sesión: 17 de agosto de 2026.

---

## Compilar y arrancar

```
compilar.bat /sincache     REM /sincache si cambió package.json o el backend
iniciar.bat
```

**El bundle se compila DENTRO de la imagen Docker.** Editar un `.tsx` no cambia
nada en el navegador hasta reconstruir la imagen. Detalle completo en
`PROCEDIMIENTO.md`.

**Si el usuario dice «no salen los cambios»:** casi siempre el build falló y
`iniciar.bat` levantó la imagen anterior. Comprobar que la salida termina con
`Exported: dist`. Un error de JavaScript en tiempo de ejecución también da
pantalla en blanco — mirar la consola del navegador, no asumir que es caché.

App en `http://localhost:8080`, API en `/api` (mismo origen, nginx proxea).

---

## Verificación sin poder compilar

El build completo (`npx expo export`) **excede el límite de tiempo del sandbox**
(~180 s). Sustitutos que sí caben y cazan casi todo:

```bash
cd frontend && npx tsc --noEmit          # tipos (los .jsx no entran aquí)
```

**Los dos scripts ya están escritos** (antes eran recetas en este archivo; se
perdían y había que rehacerlos cada sesión):

```bash
cd frontend
node scripts/verificar-ambitos.js      # identificadores sin declarar (AST + ámbitos)
node scripts/verificar-imports.js      # rutas relativas rotas
```

Al escribir `verificar-ambitos.js` hubo que filtrar las anotaciones de tipo:
Babel **no registra interfaces ni alias como bindings**, así que sin ese filtro
salían 210 falsos positivos y el informe no lo miraba nadie. El filtro deja
pasar `as const` y `!`, que sí son expresiones de valor.

**Estos dos scripts han encontrado bugs reales.** Merecen ejecutarse siempre
antes de dar algo por terminado. Hoy señalan uno pendiente: ver abajo.

---

## Arquitectura

- **Frontend:** Expo Router (web). Las rutas viven en `frontend/app/`.
  **Todo archivo `.tsx`/`.jsx` bajo `app/` se convierte en ruta**, así que las
  hojas de estilo y los componentes van fuera (`frontend/styles/`,
  `frontend/components/`). Ya se limpiaron tres rutas fantasma por esto.
- **Backend:** FastAPI en `backend/server.py` (~8.500 líneas) + `backend/patterns.py`.
- **Datos:** yfinance. **No hay datos de tick ni cadena de opciones** — esto
  limita lo que se puede calcular de verdad (ver «Deuda pendiente»).

### Tema visual

`frontend/theme/tokens.ts` define la paleta (esmalte/grafito), la escala
tipográfica y `seriesColor()` para series categóricas.

`OvertonSignalMatrix_v4.jsx` tiene un **puente deliberado**: `mapaDeTema()`
convierte los tokens al objeto `T` que leen sus ~700 referencias, y el
componente raíz lo sincroniza **en un `useEffect`, no durante el render**.
Hacerlo en render provocaba el error de hidratación #418, porque la exportación
estática prerrenderiza en claro y el cliente montaba en oscuro.

---

## Hecho en la última sesión

### Mercado (`frontend/app/(tabs)/market.tsx`)
- `components/market/EquityIndices.tsx` — tarjeta estilo FT: pestañas por
  región, chips que apagan curvas, gráfico multilínea normalizado a % sobre la
  apertura, tabla con rango de 52 semanas y estado de sesión.
- `components/market/CommodityChart.tsx` — oro con 1H/diario/semanal/mensual/anual.
- `components/market/SessionsPanel.tsx` — sesiones + horarios fusionados.
- `components/market/EconomicCalendar.tsx` — Econdb con respaldo estimado.
- Divisas en «Otros mercados» (se añadieron GBP/JPY y EUR/JPY al backend).

### Overton (`frontend/components/overton/`)
- `ResumenTab.jsx` — pestaña Resumen completa.
- `WolfeTab.jsx` — patrón de 5 puntos con rectas, extensiones y plan.
- `ElliottTab.jsx` — impulso 1-2-3-4-5 con detalle por onda.
- `MTFPanel.jsx` — consenso multi-timeframe real.
- `PatternPanels.jsx` — hook `usePatrones` + paneles compactos.

### Backend
- `patterns.py` — ZigZag por ATR, `detectar_elliott`, `detectar_wolfe`.
- Endpoints nuevos: `/patterns/{ticker}`, `/mtf/{ticker}`,
  `/commodity-chart/{simbolo}`.
- Portafolio: volatilidad por covarianza, drawdown sobre curva de patrimonio,
  tracking error real, tipo sin riesgo de `^TNX`, mercado del S&P.

---

## Bugs encontrados y corregidos — no volver a introducirlos

| Bug | Dónde | Naturaleza |
|---|---|---|
| `vd_score` calculado, mostrado y **nunca sumado** al total | `_compute_multifactor_score` | El techo real era 160, no 165 |
| Veredicto atascado en MANTENER | `/overton` | Backend enviaba `"buy"`, la UI comparaba con `"COMPRAR"` |
| Bandas de decisión descentradas | `/overton` | COMPRAR cubría 45–100 %, MANTENER 8 puntos de 165 |
| Rama inalcanzable | `_overton_zone` | Dos `elif score >= 33` seguidos |
| Sesiones abiertas en fin de semana | `SessionsPanel` | Solo miraba la hora UTC, nunca el día |
| `gains`/`losses` declaradas y nunca rellenadas | `/portfolio` | Gain/Loss daba 0.00 siempre |
| Volatilidad = media ponderada | `/portfolio` | Ignora correlación; inflaba ~40-60 % |
| Max Drawdown = media ponderada | `/portfolio` | Caídas en fechas distintas no se promedian |
| Tracking error = volatilidad | `/portfolio` | Confundía riesgo total con riesgo activo |
| Ponderación sobre volúmenes anidados | `VolumeDeltaAnalysis` | 1W contiene 1D contiene 4H: se contaba 7 veces |
| Detectores mirando solo la última ventana | `patterns.py` | Con 16 pivotes se ignoraban 11 ventanas |
| `r_` sin declarar | `SMCPanelLive` | Rompió la pantalla; mi búsqueda de `r(n)` no vio `r_(n)` |
| **`bid_ask_spread` es el rango diario** — SIN CORREGIR | `_calc_bid_ask_spread_proxy` | Ver abajo |
| Noticias en blanco | `lib/estrategia/api.ts` | Leía `title`/`publisher` (claves de `/news`), pero `/overton` devuelve `headline`/`source`/`published`/`impact` |
| Balance y KPIs vacíos | `lib/estrategia/api.ts` | Leía `total_value`/`cash`/`total_gain_loss`; `PortfolioSummary` da `total_portfolio_value`/`cash_available`/`total_profit_loss` |
| Curva de patrimonio siempre vacía | `lib/estrategia/api.ts` | Leía `data.evolution`; `PortfolioEvolution` la sirve en `data.history` |
| Ichimoku con media tabla en guiones | `lib/estrategia/api.ts` | Leía `kumo`/`chikou`/`sesgo`; el backend da `cloud_color`/`chikou_status`/`signal` |
| Etiquetas «Stop» y «Objetivo» recortadas | `PlanPosicion.Marca` | Centradas sobre su posición: en 0 % y 100 % la mitad caía fuera y `Placa` recorta |
| Calendario macro que no lo era | `lib/estrategia/api.ts` | Enchufaba `proximos_eventos` (resultados y dividendos del valor) e inventaba `pais: 'US'` e `impacto: 'medio'` |
| Rejilla cayendo a una columna | `Rejilla.rupturaDe` | Umbrales puestos sobre el tamaño de ventana, medidos contra el ancho útil: la barra lateral se come 244 px |
| Hidratación #418 | `OvertonSignalMatrix_v4` | Mutación de tema durante el render |
| 404 en `/api/smc` | `useSMCLive` | Endpoint inexistente, se pedía en cada carga |
| **`c` sin declarar en `generatePDF` — SIN CORREGIR** | `FinancialStatements.jsx:26` | Ver abajo |

### `generatePDF` lanza ReferenceError — SIN CORREGIR

`frontend/components/FinancialStatements.jsx:26`

La función se declara como `generatePDF(title, ticker, companyName, rows, years)`
pero dentro usa `c.ink`, `c.surface`, `c.down`… ocho veces. **`c` no es
parámetro ni existe en el ámbito.** El único `c` del archivo es el segundo
argumento del helper `color(v, c)`, que es otra función.

Se llama desde cuatro sitios (líneas 828 y 1153-1155), así que **pulsar
«exportar PDF» revienta con `ReferenceError: c is not defined`**. Lo cazan a la
vez `expo lint` (8 errores `no-undef`) y `scripts/verificar-ambitos.js` — es
exactamente la misma familia que el `r_` de SMC.

Arreglo probable: pasar la paleta como parámetro (`generatePDF(..., colors)`),
porque el archivo ya tiene `useTheme()` en el componente que la invoca.

### Trampas de método aprendidas

- **Buscar por texto no basta.** `r_` sobrevivió a un grep de `r(`. Usar el
  analizador de ámbitos.
- **Un mapeo mal hecho no da error: da un hueco silencioso.** En Estrategia
  pasó CUATRO veces —noticias, balance, curva de patrimonio e Ichimoku—
  siempre igual: se escribieron nombres de campo plausibles en vez de los
  reales. `tsc` no lo ve (la respuesta es `any`), el lint tampoco, y el panel
  no se rompe: sale con guiones, que se leen como «no hay dato».
  **Antes de escribir un traductor, leer el modelo Pydantic o el `return` del
  endpoint.** Los cuatro se arreglaron en diez minutos una vez mirados; lo caro
  fue no mirarlos.
- **Una tasa de detección del 100 % es un bug, no un éxito.** Al barrer todas
  las ventanas, Wolfe pasó a encontrar patrón siempre. Hicieron falta filtros
  de vigencia (el patrón debe ser reciente) y de calidad mínima.
- **Comprobar la coherencia direccional.** Un patrón bajista con objetivo por
  encima de la entrada, o un stop al otro lado, son señales de que la
  geometría está mal planteada.
- **Las maquetas del usuario tienen errores.** Varias traían precios negativos,
  ratios que no cuadraban con su propia entrada y stop, y un «infravalorado»
  con el valor razonable por debajo del precio. **Auditar el código, no la
  imagen**, y avisar de las discrepancias.

---

## Deuda pendiente

### Seis paneles siguen con datos pseudoaleatorios
Llevan banda roja «DATOS SIMULADOS» pero no calculan nada:
`ScoreBreakdownExpandedV4`, `MicrostructureAdvancedPanel`, `MarketPhaseChart`
(Wyckoff), `WeeklyCandleChart`, `VolatilitySurface`, `LiquidityHeatmap`.

**Tres no se pueden arreglar con yfinance:** microestructura, superficie de
volatilidad y mapa de liquidez necesitan libro de órdenes y cadena de opciones.
Requieren otro proveedor (Polygon, Databento, IEX).

### Siguiente tarea pedida: pestaña Market Regime Detector
Errores ya localizados en la maqueta, pendientes de verificar en código:
- **Adaptive Entry Score:** Z-Mean Rev con score 40 y peso 15 % da contribución
  **−0.12** cuando debería ser **+6.0**. Las contribuciones suman 60.6 y el
  medidor marca 76.
- **Wyckoff se contradice:** el banner dice «ACUMULACIÓN» (35 %) mientras las
  barras y el distintivo de cabecera dan «Tendencia Alcista» (47 %).
- `MarketRegimePanel` ya está corregido (dice «SIN DATOS» en vez de inventar
  el ADX). `MarketPhaseChart` **no** — sigue simulado.

**Orden recomendado:** calcular Wyckoff de verdad → cuadrar el Adaptive Score →
maquetar. Pulir el envoltorio de un número inventado es trabajo perdido.

### ~~Traducción de noticias al español~~ — HECHO (17 ago 2026)

`backend/traduccion.py`. Caché en `db.traducciones` con el hash del original
como clave; sin ella son 1-2 s por titular. Reutiliza el singleton
`get_llm_model()`, y `create_chat_completion` va a `asyncio.to_thread` porque
bloquea el bucle de eventos. Concurrencia limitada a 3 con semáforo.

Enganchado en `get_stock_news`, `get_market_news` y `/overton`. En `/overton`
va **después** de calcular el impacto: la puntuación se obtiene por palabras
clave en inglés («beat», «miss», «downgrade»), así que traducir antes la
dejaría a cero. `NewsArticle` tiene ahora `traducido` e `idioma_original`, y la
interfaz pone un distintivo «traducido» junto al medio.

`_limpiar_respuesta()` recorta preámbulos, comillas y bloques `<think>`: a
1,7 B el prompt no basta para evitarlos.

### ~~Motor de backtest~~ — PRIMERA VERSIÓN HECHA (17 ago 2026)

`backend/backtest.py` + `/backtest/{ticker}` + `test_backtest.py` (17 pruebas).

Las tres vías de look-ahead, cerradas y **comprobadas**:

1. `_es_causal()` verifica de verdad que un indicador no cambia al truncar la
   serie. Hay contraprueba con `shift(-1)`: si el detector no cazara eso, no
   estaría detectando nada.
2. La señal se decide al cierre de la barra i y se ejecuta en la **apertura de
   i+1**. Hay prueba de que ninguna entrada ocurre por debajo de la apertura.
3. Stop y objetivo tocados en la misma barra → se asume el **stop**. Suponer el
   objetivo es la forma más silenciosa de inflar un backtest.

Prueba clave: truncar la serie no cambia la curva ni las operaciones del tramo
común. Si algún día falla, hay look-ahead.

La estrategia es a propósito simple (cruce de medias + RSI): lo que se quería
correcto era el MOTOR. Una regla compleja sobre un motor tramposo no vale nada.

El endpoint devuelve `avisos` y el panel los enseña arriba: «solo 12
operaciones» cambia por completo cómo se lee un win rate.

### Notas de la traducción (referencia)

**Decisión del usuario:** traducir con el **modelo local Qwen3**, y traducir
**titular y resumen**. El nombre del medio y la fecha se quedan como están, y
el enlace sigue llevando al artículo original en su idioma.

**Lo que ya existe y hay que reutilizar:**

- `backend/server.py:163` — `from llama_cpp import Llama`
- `backend/server.py:167` — `MODEL_PATH = models/Qwen3-1.7B-Q4_K_M.gguf`
- `backend/server.py:180` — `_llm_model` se carga perezosamente (lazy). Hay
  que usar ese mismo singleton, **no cargar el modelo otra vez**: son 1,1 GB.
- No hay claves de API de IA en `.env` (solo `CF_TUNNEL_TOKEN`), así que el
  camino local es además el único disponible ahora mismo.

**Dónde enganchar** (tres sitios, todos leen `raw_news`):

| Punto | Línea aprox. | Qué es |
|---|---|---|
| `get_stock_news` | 5997 | Noticias del valor analizado |
| `get_market_news` | 6080 | Noticias de mercado |
| `/overton` | 8271 | Las que alimentan el impacto de noticias |

Campos a traducir: `title` y `summary`. Dejar intactos `publisher`, `link`,
`published_date`, `thumbnail`.

**Plan:**

1. `backend/traduccion.py` con `traducir(texto, destino="es")`.
   - Cache en Mongo (`db.traducciones`, clave = hash del texto original).
     **Sin caché esto es inviable:** son 1-2 s por titular y quince titulares
     por pantalla.
   - Prompt corto y con temperatura baja; pedir solo la traducción, sin
     preámbulo. Qwen tiende a añadir «Aquí está la traducción:» si no se le
     acota.
   - Devolver el original si falla: **nunca dejar el hueco vacío**.
2. Traducir en lote y en paralelo con el resto de la carga, no en serie.
3. Marcar en la respuesta `idioma_original` y `traducido: true`, para que la
   interfaz pueda enseñar «traducido automáticamente» junto al titular. Es
   honesto y evita que una mala traducción se lea como cita literal.
4. Comprobar que el `summary` largo no desborda el contexto del modelo:
   truncar a ~400 caracteres antes de traducir.

**Riesgo conocido:** el modelo es pequeño (1,7 B). La jerga financiera
—«beat estimates», «guidance», «downgrade»— puede salir regular. Si la calidad
no convence, el cambio a DeepL o Gemini es contenido: solo cambia el cuerpo de
`traducir()`, y `litellm` ya está instalado para ello.

### El «bid-ask spread» del score mide otra cosa — SIN CORREGIR

`backend/server.py:6676`

```python
def _calc_bid_ask_spread_proxy(daily_hist) -> float:
    """Bid-Ask spread proxy: (High-Low)/Close promedio 20 días (%)."""
```

Eso es el **rango diario**, no la horquilla de compra/venta. Están separados
por dos órdenes de magnitud: un valor líquido tiene un rango diario en torno
al 2 % y un spread del 0,02 %.

Consecuencias:

1. **El factor no discrimina.** En `_compute_multifactor_score` los umbrales
   son de spread (`< 0.5` bueno, `> 4.0` malo). Con valores de rango diario
   casi todo cae en la banda media, así que el factor aporta casi siempre lo
   mismo y no distingue entre valores líquidos e ilíquidos.
2. **El nombre engaña.** Viaja al frontend como `bid_ask_spread`.
3. **El respaldo es 2.0**, un número plausible que oculta el fallo cuando la
   descarga falla.

**Corrección propuesta.** Yahoo sí da la horquilla en `info`: `bid`, `ask`,
`bidSize`, `askSize`. Con eso sale la fórmula de verdad —la misma que pide la
sección 16 del prompt del motor de trading:

```
spread   = ask − bid
mid      = (ask + bid) / 2
spread % = (spread / mid) × 100
```

**Aviso imprescindible:** esos campos llegan con ~15 minutos de retraso, a
menudo vienen a cero, y **fuera de horario de mercado casi siempre son cero**.
Hay que devolver «no disponible» en ese caso, nunca un valor por defecto.
Sirven como referencia indicativa, no como filtro duro de ejecución.

**Separar los dos usos del spread:**

| Uso | Fuente aceptable |
|---|---|
| Puntuar la señal / mostrar en pantalla | `info` de Yahoo, con retraso y marcado |
| **Bloquear una orden antes de mandarla** | Solo la cotización del bróker en ese instante |

### Order book nivel II: por qué NO comprarlo (de momento)

Con `bid`, `ask` y sus tamaños queda cubierto el filtro de spread y el
Execution Quality Score, que es el grueso del valor práctico. La profundidad
de diez niveles es una herramienta de escala de segundos y **la frecuencia de
decisión del robot son 45 minutos**: el libro habrá cambiado por completo
varias veces antes de usarse.

Si algún día la frecuencia baja a minutos, reabrir la discusión. Camino
recomendado entonces: el bróker como fuente (Alpaca gratis solo cubre IEX;
IBKR cobra la profundidad aparte), no un proveedor dedicado. Polygon se
rebautizó **Massive** a principios de 2026 — mismas claves, precio ahora en
`massive.com/pricing`.

### Otras pendientes
- Overton tiene 7 pestañas (Resumen, Predictivo, SMC, Sesiones, Velas, Wolfe,
  Elliott). Las maquetas del usuario proponen 8 con otros nombres; nunca llegó
  la imagen definitiva de la estructura.
- El percentil histórico del score necesita acumular ≥ 10 lecturas por ticker
  en `db.overton_scores` antes de mostrar nada.

---

## Estrategia — Fase 1 ENTREGADA (17 ago 2026)

Ruta `frontend/app/(tabs)/strategy.tsx` + `components/estrategia/` (16 archivos)
+ `lib/estrategia/` (6). Entrada nueva en el menú lateral.

**El prompt del usuario pedía Next.js + Tailwind + `app/dashboard/page.tsx`.
Este proyecto no es eso**: es Expo Router sobre React Native Web, sin Tailwind,
sin `className`. Se tradujo al stack real —`StyleSheet`, `tokens.ts`,
`react-native-svg`, `@expo/vector-icons`— reutilizando el kit del producto.
**Cero dependencias nuevas.** Si vuelve a llegar un prompt con esa premisa,
empezar por aquí en vez de auditar otra vez.

Piezas que no existían y ahora sí:

- `Terminal.tsx` — densidad de terminal (rótulos de 10 px, filas de 22) sobre
  la MISMA paleta. `components/ui/Instrument` está calibrado para lectura
  pausada; doce paneles a la vez pedían otra métrica, no otra identidad.
- `Rejilla.tsx` — rejilla real de 12 columnas. **CSS Grid no existe en React
  Native** (Yoga sólo acepta `display: flex | none`). El ancho de una celda de
  n columnas es `n·(W−11·hueco)/12 + (n−1)·hueco`; el atajo
  `flexBasis: n/12·100 %` hace que doce celdas más once huecos pasen del 100 %
  y la última salte de fila. Hay prueba ejecutable de eso.
- `indicadores.ts` — MACD 12/26/9 y RSI de Wilder sobre los cierres que ya
  llegan. El calentamiento devuelve `null`, no cero: un MACD plano en 0 durante
  26 barras se lee como «sin momento» y es falso.
- `useWebSocket.ts` — arquitectura completa con reconexión exponencial y
  amortiguación por cadencia (el libro a 100 ms, el robot sin amortiguar).
  `WS_HABILITADO = false`: **el backend no expone `/ws`**. Cuando exista, se
  enciende la bandera y ya está.

De dónde salen los datos: `/overton` (señal, score, técnico, Ichimoku,
volatilidad, régimen, niveles, noticias, eventos), `/mtf` (consenso y sesgo por
marco), `/indicators-chart` (velas reales), `/portfolio` y
`/portfolio/evolution` (balance y curva).

Huecos marcados en pantalla, no rellenados:

| Panel | Motivo |
|---|---|
| Libro nivel II, order flow, delta de agresores | yfinance no sirve profundidad |
| Bid/ask del panel de activo | Sólo en `info`, con retraso y a cero fuera de horario |
| Backtest | No hay motor. Uno con look-ahead es peor que ninguno: da confianza |
| Órdenes ejecutadas | No hay bróker ni paper trading |
| Win rate, profit factor, expectativa | Necesitan operaciones cerradas |
| Superficie de volatilidad, IV Rank | Necesitan cadena de opciones |

El «volume delta» va rotulado **PROXY** en la cabecera, no en una nota al pie:
usa RSI y media de 20 por marco, y no es delta de agresores.

Lo que NO se hizo, a propósito: ejecución, backtest, paper broker, scanner y
adaptador de bróker. Sigue siendo el proyecto de meses de abajo.

---

## PENDIENTE MAYOR: motor de trading algorítmico («Estrategia»)

El usuario pidió una opción nueva en el menú lateral llamada **Estrategia** y
entregó un prompt maestro de 104 secciones y 27 fases: motor multi-capa,
backtest sin look-ahead, paper broker, scanner, ejecución y adaptador de broker.

**Su propio prompt exige auditoría antes de tocar código. Respetarlo.**

### Auditoría parcial ya hecha (no repetir)

| Capa pedida | Estado real en el proyecto |
|---|---|
| Portfolio, balance, posiciones, transacciones | **Existe.** `/portfolio`, `AccountWorkspace.tsx`, `PositionsTable.tsx`. Métricas ya corregidas. Reutilizar, no duplicar. |
| Análisis técnico e indicadores | **Existe.** `/technical`, `/indicators-chart`, `IndicatorsChartCard.tsx`. |
| Ichimoku | **Existe y es real.** `/ichimoku-chart`, `IchimokuCloudChart.tsx`. |
| Noticias | **Existe.** `/news/{ticker}`, `/market-news`. |
| Calendario económico | **Existe.** `components/market/EconomicCalendar.tsx` (Econdb + respaldo). |
| Multi-timeframe | **Existe y es real.** `/mtf/{ticker}`, 7 marcos calculados por separado. |
| Heatmap | **Existe.** `components/Heatmap/`, `SectorHeatmap.tsx`. |
| Market Regime | **Parcial.** `MarketRegimePanel` usa ADX/BB/ATR reales y dice «SIN DATOS» si faltan. |
| Volatilidad | **Parcial.** ATR y BB reales; `VolatilitySurface` sigue simulado. |
| Volume Delta | **Existe pero es un proxy.** Ver bloqueo abajo. |
| Order Book nivel II | **NO EXISTE.** |
| Order Flow / delta de agresores | **NO EXISTE.** |
| Spread bid/ask | **NO EXISTE.** |
| Backtest | **NO EXISTE.** |
| Broker / ejecución / paper trading | **NO EXISTE.** |

### BLOQUEO CRÍTICO — decirlo antes de que invierta tiempo

La maqueta del dashboard incluye **ORDER BOOK (NIVEL II)** con tamaños de bid y
ask, spread en tiempo real, order flow y delta de agresores. **yfinance no
sirve ninguno de esos datos.** No es cuestión de programarlo: falta la fuente.

Afecta a las capas 3, 4 y 15 del prompt, al Execution Quality Score, al filtro
de spread máximo y al Microstructure Score.

El propio prompt lo reconoce en su sección 20 al distinguir *true order-flow
delta* de *estimated volume delta*. **Esa distinción ya está implementada:** el
indicador se renombró a «Posición del cierre en el rango (CLV)» y la fórmula
viaja visible. Lo que no se puede es fabricar el dato verdadero.

Opciones: contratar Polygon / Databento / IEX, o recortar el alcance a lo que
yfinance permite y declarar las capas ausentes.

### Reglas de diseño que el usuario añadió y son buenas

- El calendario y las noticias **no generan compras/ventas**: son filtros de
  riesgo y modificadores de confianza.
- Jerarquía obligatoria: DATOS → CONTEXTO → SEÑAL → CONFLUENCIA → RIESGO →
  TAMAÑO → EJECUCIÓN.
- Conflicto entre marcos ≠ señal débil: un rebote alcista dentro de una
  estructura semanal bajista es «BULLISH REBOUND / COUNTER-TREND», no
  «STRONG BUY», y cambia el tamaño de la posición (25-75 %).
- Ningún indicador aislado puede ordenar una operación.
- Por defecto: MANUAL, PAPER, AUTO OFF, LIVE OFF.

### Aviso de escala

27 fases con backtest sin look-ahead, walk-forward y adaptador de broker es un
proyecto de meses, no de una sesión. Conviene acordar un recorte antes de
empezar: la Fase 1 realista es **Estrategia como pantalla de solo lectura**
—señal, score, confluencia multi-marco, riesgo y tamaño sugerido— **sin
ejecución ni backtest**, reutilizando `/overton`, `/mtf` y `/patterns` que ya
existen y ya son reales.

---

## Criterios que el usuario ha respaldado

- **Un hueco honesto vale más que un número inventado.** Se marca con guion y
  la tinta `noSignal`, y se explica por qué falta.
- Cuando una cifra dependa de una escala o un supuesto, **decirlo junto a la
  cifra** (ej.: el score es sobre 165, no sobre 100).
- Verificar con pruebas ejecutables, no con afirmaciones. Varios bugs los
  encontraron los propios tests que escribí para validar los arreglos.
