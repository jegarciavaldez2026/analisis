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
node scripts/verificar-claves-estados.mjs   # claves de los estados financieros
```

El tercero **necesita la aplicación levantada**: consulta
`/api/financial-statements-full` para seis valores y compara con los nombres de
campo escritos en `FinancialStatements.jsx`. Los otros dos son estáticos y no
pueden ver esto, porque la verdad está al otro lado de la red. Señala sólo la
clave que no aparece en **ningún** valor: la que falta en uno solo puede ser una
empresa que no publica esa partida.

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
| `c` sin declarar en `generatePDF` | `FinancialStatements.jsx` | **YA CORREGIDO** (10 sep 2026): la paleta es ahora el 6.º parámetro |
| **Rentab. dividendo de 569 %** | `server.py`, tres sitios | `dividendYield` de yfinance pasó de fracción a porcentaje entre versiones; el ×100 se quedó. Ahora `_rentabilidad_dividendo()` calcula `rate/precio` |
| Cinco filas de estados en guiones | `FinancialStatements.jsx` | Nombres de campo obsoletos (`Research Development` → `Research And Development`, etc.). Quinta vez del mismo patrón |
| CAGR con el signo cambiado | `calcularCAGR` | Supuse que `years` venía de más antiguo a más reciente; la cabecera lo pinta al revés |
| Columna de ejercicio fantasma | Estados financieros | Un solo `years` con la unión de los tres estados; el 2021 del flujo de caja vaciaba una columna en los otros dos |
| `fcf_yield` que `estilo.py` leía y no existía | `calculate_ratios` | El subindicador más importante del factor de flujo devolvía `None` en todas las empresas |
| Crecimiento sostenible del 131 % en AAPL | `calculate_ratios` | ROE × retención se rompe con el patrimonio encogido por recompras (ROE 151,9 %). Ahora se publica el hueco con su motivo |
| `risk_free_rate = 0.04` a mano | Sharpe | El resto del proyecto ya leía ^TNX. Desplaza Sharpe, Sortino y alfa a la vez |

### ~~`generatePDF` lanza ReferenceError~~ — YA CORREGIDO

Comprobado el 10 de septiembre de 2026: la firma es
`generatePDF(title, ticker, companyName, rows, years, c)` y las cuatro
llamadas pasan la paleta. `verificar-ambitos.js` da 0 identificadores sin
declarar en 102 archivos. Esta entrada se deja para que nadie vuelva a
buscarlo.

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
- **Un campo declarado por un tercero no es un dato verificado.** Su UNIDAD
  puede cambiar sin romper nada: el tipo sigue siendo `float`, la petición
  sigue devolviendo 200 y el número sigue pintándose. Así salió una
  rentabilidad por dividendo del 569 %. Cuando exista una fórmula que dé lo
  mismo —dividendo entre precio— **calcularlo y usar el campo sólo de
  respaldo**: la definición del ratio no cambia entre versiones de una
  librería.
- **Que una columna nueva «se vea bien» no dice nada de sus cifras.** La
  columna CAGR se pintó perfecta con todos los signos invertidos. Se cazó
  comprobando una tasa contra los números de su propia fila. Mirar la captura
  verifica la maqueta; sólo rehacer una cuenta a mano verifica el dato.
- **Una métrica de riesgo siempre devuelve un número plausible.** Un Sortino
  inflado, una beta sobre series descuadradas o un CVaR que en realidad es el
  VaR salen los tres con la magnitud y el signo correctos: nada en pantalla
  delata el fallo. Por eso `test_riesgo.py` está escrito casi entero como
  contrapruebas —se demuestra que el cálculo correcto y el incorrecto dan
  resultados distintos sobre el mismo dato—. Cazó dos: las capturas
  alcista/bajista **saturan en 100 %** si se componen con datos diarios, y la
  desviación bajista se divide entre el total de observaciones, no entre las
  negativas.
- **Cruzar dos series por posición y no por fecha.** Los índices y los valores
  no comparten calendario. Emparejar por posición da una beta perfectamente
  creíble y sin ningún significado.
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

### Horquilla bid/ask en pantalla — HECHO (10 sep 2026)

`_horquilla_declarada()` en `server.py`, colgada de `/overton` como
`horquilla`, y dibujada en `PanelActivo` (bid, ask, **horquilla debajo** y
tamaños).

**No sustituye a `bid_ask_spread`**, que sigue siendo el rango diario y sigue
alimentando el score con su calibración. Son campos distintos y el comentario
del código lo dice.

**El hallazgo:** `info` sí trae bid/ask, pero el dato viene roto a menudo
**incluso en mercado abierto**. Medido el 10 de septiembre de 2026:

| Valor | Bid / Ask | Horquilla | Rango diario | Veredicto |
|---|---|---|---|---|
| SPY | 758,07 / 758,10 | 0,004 % | 0,57 % | válida |
| F | 13,85 / 13,86 | 0,072 % | 2,90 % | válida |
| MSFT | 491,03 / 495,98 | **1,003 %** | 1,82 % | rota |
| AAPL | 314,02 / 330,00 | **4,963 %** | 2,19 % | rota |

Un 4,96 % en AAPL se dibujaría como una cifra perfectamente creíble. Por eso
hay validación y la tarjeta enseña el hueco con su motivo.

**El criterio, y por qué no es un número inventado:** una horquilla real es dos
órdenes de magnitud menor que el recorrido de una sesión. Se exige que no pase
de **la décima parte del rango diario medio**, y el mensaje lo dice con las
tres cifras delante. Rechaza MSFT y AAPL, deja pasar SPY y F.

**Error que cometí y corregí:** primero invalidaba la horquilla cuando el
último precio quedaba fuera de ella. Con ~15 min de retraso eso pasa
continuamente, y tumbaba justo los datos buenos (SPY con 0,004 %). El desfase
afecta al NIVEL, no a la ANCHURA, que es lo único que se mide. Ahora sólo se
anota (`desfasada`).

Sigue siendo referencia marcada, **nunca filtro de ejecución**: para eso sólo
vale la cotización del bróker en el instante de mandar la orden.

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

## NQE — port del indicador Pine (10 sep 2026)

`backend/nqe.py` + `/nqe/{ticker}` + `backend/test_nqe.py` (35 pruebas) +
`components/estrategia/robot/PanelNQE.tsx`, en la **columna central** del
dashboard de Estrategia, justo debajo de `GraficoMercado`.

**Es un GRÁFICO, no una tabla**, y ahí está el aprendizaje: se entregó primero
como panel de filas y hubo que rehacerlo. Lo que se pedía era el mismo
instrumento que `GraficoMercado` —velas, recorrido del precio y las señales
encima—, y el Pine estaba sólo para que se viera la lógica.

Dos paneles sobre el mismo eje: PRECIO (velas + trailing de UT Bot +
SuperTrend + VWAP + niveles del impulso + POC + triángulos de compra/venta) y
SCORE (la línea del motor con su banda de umbral). El segundo no es decorativo:
sin él, un triángulo sale de la nada; con él se ve que el disparo es el cruce
fuera de la banda.

**Va en la columna ANCHA a propósito.** En la del robot son ~400 px, y ahí cada
vela mide 2 px y el cuerpo desaparece. Antes estuvo al final de la columna del
robot y el usuario no la encontró: medido en el navegador, quedaba a 1.402 px
de scroll dentro de un contenedor de 3.641 con una ventana de 968.

Reutiliza tal cual el lenguaje visual de `GraficoMercado`: `MARGEN`, `escala`,
`trazo`, velas huecas al alza y macizas a la baja, escala de precio en `Text`
absoluto fuera del SVG y cursor por `PanResponder`. Añade dos cosas propias:

- `escalera()` para UT Bot y SuperTrend. Son NIVELES que saltan, no curvas:
  unirlos con una diagonal dibuja una transición que nunca existió.
- La escala de precio incluye las líneas del indicador y los niveles del
  impulso, no sólo las velas. Con un SuperTrend a tres ATR, escalar sólo con
  las velas lo saca del panel y desaparece sin avisar.

**Los niveles de Fibonacci se dibujan SIEMPRE**, aunque el filtro esté
apagado. El Pine separa `showFib` (dibujo) de `useFib` (filtro) y aquí se
habían atado por error: apagar el filtro borraba la medida de estructura de la
pantalla.

Es una traducción literal del Pine v2.1 del usuario, barra a barra y con el
mismo orden de ejecución: motor de posición/velocidad/masa/fuerza, umbral por
percentil móvil de 500, UT Bot, SuperTrend, Fibonacci como medidor de
estructura, triple barrera con gate de Wilson, pronóstico por analogía y POC.

**Vive en el backend y no en `indicadores.ts` por tres razones**, y conviene no
volver a discutirlo: la triple barrera es un proceso online que necesita
recorrer la serie entera; el umbral es un percentil móvil de 500 barras; y hace
falta OHLCV completo, no sólo los cierres que hoy llegan al frontend.

### UT Bot: el módulo ES «UT Bot Alerts» (Pine v4)

El usuario pasó después el script suelto de *UT Bot Alerts*. **La recursión del
trailing stop y las señales ya eran idénticas** a las del NQE — no hubo que
cambiar ni una línea de la lógica. Lo que no era evidente leyendo el Pine, y
por eso queda escrito:

```
ema   = ema(src, 1)          -> es el propio src
above = crossover(ema, stop)
buy   = src > stop and above -> el `src > stop` es redundante
```

`crossover(a, b)` ya exige `a > b`, así que `buy` se reduce a un cruce limpio
del precio con su trailing. Y los valores por defecto del script (Key Value 1,
ATR 10) son ya los del NQE.

**No se da por buena esa equivalencia: se comprueba.**
`test_ut_bot_equivale_al_script_de_alertas` reimplementa el script LITERALMENTE
y por separado —conservando incluso lo redundante— y compara marca a marca.
Si compartiera código con el motor, no demostraría nada.

Lo que sí faltaba era **enseñarlo**: antes UT Bot era sólo un filtro y una fila
de texto. Ahora dibuja sus carteles «Buy»/«Sell» sobre el precio, con dos
decisiones que conviene no deshacer:

- **Cartel, no triángulo.** Los triángulos son la señal COMPUESTA del NQE
  (score fuera de umbral + flujo + liquidez + los tres filtros); los carteles
  son un módulo suelto. Van en listas separadas en el backend
  (`serie.marcas` frente a `serie.ut_marcas`) y con forma distinta en pantalla,
  porque la regla del producto es que ningún indicador aislado ordena una
  operación. Fundirlos en una sola capa haría justo eso sin decirlo.
- **Cinta al pie, no `barcolor`.** El script recolorea las velas según de qué
  lado del trailing está el precio. Aquí NO: en este terminal el verde y el
  rojo de una vela significan cierre contra apertura, y pisarlos rompería esa
  lectura en todas las pantallas. La misma información va en una cinta bajo el
  eje, que además deja ver cuánto dura cada tramo.

`ut_pos` vale **0 hasta el primer cruce**, igual que el `pos` del script.
Pintar «largo» desde la primera barra sería dibujar una entrada que nunca
ocurrió, y con una cinta de estado eso se lee como una operación real. Hay
prueba (`test_ut_pos_no_inventa_posicion_inicial`).

Sensibilidad y periodo de ATR están a la vista, no en un menú: son lo único
que cambia el resultado, y un «Buy» sin saber con qué valores salió no se
puede comparar con otro. Medido sobre AAPL 1H: key 1 → 292 cruces, key 2 →
131, key 3 → 75.

Y cambia con el marco, que era lo que se pedía. Medido sobre PBF:
1H → 299 buy/sell en 5.082 barras · 4H → 93 en 1.707 · 1D → 77 en 1.254.

### El hallazgo que hay que saber antes de tocar nada

**Con el preset «Equilibrado» —los tres filtros puestos, que es el
recomendado— el indicador da CERO señales.** Medido, no supuesto:

| Serie | Cruces | + flujo y liquidez | Tras filtros | Sin Fibonacci |
|---|---|---|---|---|
| AAPL 1H, 5.082 barras | 255 | 199 | **0** | 137 |
| TSLA 1H, 5.082 barras | 229 | 186 | **0** | 140 |
| NVDA 1H, 5.082 barras | 247 | 218 | **0** | 168 |
| SPY 1H, 5.082 barras | 254 | 188 | **1** | 128 |

Aislando cada filtro sobre AAPL: sólo UT → 154, sólo SuperTrend → 150, sólo
Fibonacci → 8, los tres → 0.

**No es un bug del port.** Es estructural: `crossUp` exige un estallido de
momento al alza y `fibOKL` exige estar a mitad de un retroceso del 23,6-78,6 %.
Las dos cosas casi nunca ocurren en la misma barra. Hay una prueba que lo fija
(`test_fibonacci_estrangula_el_embudo`) para que, si alguien «arregla» el cero
cambiando el motor, salte y haya que decidirlo a propósito.

**Y el gate tampoco abre nunca.** Con objetivo y stop simétricos a 1,5× ATR el
acierto medido ronda el 50 % (AAPL: 79 operaciones largas, 50,6 %), la cota de
Wilson queda en 0,42 y el umbral pide 0,65. Para abrirlo haría falta un acierto
real por encima del 72 % con barrera simétrica. La esperanza sale ligeramente
negativa (−0,03), que es lo esperable después de costes.

Por eso la tarjeta enseña **las señales bloqueadas además de las validadas**,
apagadas y rotuladas. Es fiel al original —el Pine las dibuja como círculos
grises— y es la única forma de distinguir «el indicador no ve nada» de «ve algo
pero no está demostrado». Los interruptores de filtrado están en la propia
tarjeta, al lado del embudo que explica el cero: son los mismos mandos del
grupo «Módulos de filtrado» del Pine, no un invento de esta pantalla.

### El estado vacío del gráfico es el estado NORMAL

Consecuencia directa del cero de arriba, y hay que tenerla presente al tocar la
tarjeta: con la configuración por defecto el gráfico sale **sin un solo
triángulo**, y eso se lee como una tarjeta rota. Peor aún con la ventana de
dibujo: aunque haya 137 señales en 5.082 barras, en las 180 dibujadas caen
unas cinco.

Por eso la tarjeta lleva un aviso explícito dentro del gráfico que **nombra la
causa concreta y el mando que la deshace**, y distingue los dos casos:

- «sin señales en todo el histórico» → los filtros las descartaron todas, y
  dice que Fibonacci es el que más recorta.
- «N señales pero ninguna en las dibujadas» → sugiere ampliar a 4H o 1D.

No quitar ese aviso sin sustituirlo por algo mejor: es lo único que separa
«el indicador no ve nada» de «esto está roto».

Y los triángulos bloqueados por el gate van **rellenos al 16 %**, no
transparentes. Con la configuración por defecto TODAS las señales salen
bloqueadas, así que la variante hueca es la que se ve el 99 % del tiempo:
dibujarla con contorno tenue la hacía invisible.

### Cómo comprobar que una placa se ve de verdad

«No veo la tarjeta» no siempre es un build fallido. Antes de suponer nada:

1. Confirmar que el bundle servido la lleva. **Ojo con los acentos**: el
   minificador convierte la eñe, las vocales acentuadas y el punto medio en
   secuencias de escape hexadecimales, así que buscar «Señales» sobre el bundle
   devuelve cero aunque el texto esté ahí. Buscar cadenas SIN acentos.
2. Cargar la pantalla en un navegador de verdad. Playwright con
   `channel: 'msedge'` usa el Edge ya instalado y **no descarga 150 MB** de
   Chromium. La ruta pide sesión: existe `POST /api/auth/register` para crear
   una cuenta desechable, y se borra después con
   `docker exec analisis_mongo mongosh analisis_db --eval 'db.users.deleteMany({email:"..."})'`.
   La base se llama **`analisis_db`**, no `test_database`.
3. **El dashboard NO scrollea con `window`.** El scroll vive en el `ScrollView`
   interno, así que `document.body.scrollHeight` devuelve la altura de la
   ventana y `window.scrollTo` no hace nada. Hay que subir por los padres del
   elemento hasta dar con el que tiene `scrollHeight > clientHeight` y moverle
   el `scrollTop`. Esto costó una captura equivocada.

### Detalles del port que costaron encontrar

- `ta.percentile_linear_interpolation` ⇒ `rolling().quantile(interpolation='linear')`
  con `min_periods` completo. Devolver un umbral de respaldo antes de las 500
  barras cambiaría la tasa de señales sin avisar.
- `ta.stdev` es **poblacional** (`ddof=0`), no muestral.
- `ta.atr` es RMA de Wilder sembrada con SMA, no una EMA cualquiera.
- El volumen relativo se normaliza **por hora del día** y el estado se LEE
  antes de actualizarse, igual que en Pine. Con una media plana, la forma de U
  del volumen intradía marca como anómala toda la apertura, todos los días.
- Los pivotes confirman `pivLen` barras después y **ahí** se escriben. Ese
  retraso es lo que garantiza que no repinta.
- El orden dentro del bucle importa: resolver pendientes → calcular gate →
  registrar señal. Al revés, el gate que valida una señal contendría
  operaciones cerradas después de ella.

### Rendimiento

~200 ms de cálculo sobre 5.082 barras. Lo lento es yfinance. Caché de 300 s por
combinación de ticker y mandos.

### Lo que NO se hizo

No se toca la ejecución ni el tamaño de la posición: la tarjeta es de lectura,
como el resto de Estrategia. Y no se ajustó ningún umbral del Pine para que
«salieran señales»: eso sería maquetar el envoltorio de un número elegido a
posteriori.


---

## Fibonacci — port del «Fib Retracement» (10 sep 2026)

`backend/fibonacci.py` + `/fibonacci/{ticker}` + `backend/test_fibonacci.py`
(18 pruebas) + `components/estrategia/mercado/PanelFibonacci.tsx`, en la
columna del robot **debajo de `ClustersVolumen`**, que es donde lo pidió el
usuario. Marcos: 5m, 15m, 1H, 1D y 1S.

Es un GRÁFICO, con el mismo lenguaje visual que `GraficoMercado` y `PanelNQE`.

### Los sesgos del script original, y qué se hizo con cada uno

El más importante, y **no es evidente**:

> **En modo lookback el retroceso está confinado a [0, 1] por construcción.**
> Las anclas son el máximo y el mínimo de la ventana, y el cierre está DENTRO
> de esa ventana. Así que ese método **no puede avisar nunca de que el impulso
> se ha roto**: cuando el precio rompe, reancla el tramo en silencio y sigue
> dibujando como si nada.

Lo cazó una prueba que escribí esperando lo contrario, y está fijado en
`test_en_lookback_el_retroceso_no_puede_salirse_del_tramo`.

Los demás:

| Sesgo | Qué se hizo |
|---|---|
| Máximo y mínimo se toman POR SEPARADO: pueden no pertenecer al mismo impulso | Modo `pivotes` (swings confirmados, no repintan). Es el **por defecto**; `lookback` sigue disponible para comparar |
| El tramo puede ser un artefacto del tamaño de la ventana | Se detecta (extremo pegado al borde) y se avisa en pantalla |
| La dirección puede decidirse por una o dos velas | Se detecta (separación pequeña) y se avisa |
| Conversión días→velas mal calibrada: 28 días/mes y días naturales tratados como sesiones | Se trabaja SÓLO en velas, que es el modo por defecto del propio script |
| **Bug real**: `Flow = ... : FIBS == 2 and High != -1 ? Low : na` comprueba `High` donde debería comprobar `Low` | No aplica (no se porta el modo de precio manual), pero queda anotado |

**Aviso de nomenclatura**: los ratios > 1 de este script NO son objetivos al
alza. Continúan el tramo más allá de su extremo final — en un impulso alcista
caen por debajo del mínimo. Por eso el interruptor se llama «> 100 %» y no
«extensiones»: rotularlos así los haría leer como objetivos de beneficio,
cuando marcan justo lo contrario.

### Decisiones de dibujo que conviene no deshacer

- **Las velas se ajustan al ancho, no al revés.** La columna del robot son
  ~400 px; con 180 velas cada una mide 2 px. `ANCHO_MIN_VELA = 4` fija cuántas
  caben y se recorta la cola. El gráfico se acorta antes que volverse ilegible.
- **La escala la fijan las velas y los RETROCESOS, nunca los niveles > 100 %.**
  Con un impulso roto, la 2.618 queda a un 25 % de distancia y arrastraba la
  escala entera: las velas se aplastaban en el tercio inferior. Los niveles que
  no caben se cuentan y se dicen en el pie.
- **El tramo se dibuja** como diagonal con sus dos puntos. Sin ella, siete
  horizontales no dicen de dónde salen, que es lo único que hay que poder
  auditar en un Fibonacci.
- **El pie va en orden CRONOLÓGICO**, no por precio. En un tramo bajista el
  máximo es el más antiguo, y escribirlo «bajo → alto» hacía leer «26 ago a
  30 jul».
- **El pivote se calibra por marco**: ±4 en semanal, ±8 en el resto. Ocho
  semanas de confirmación por lado dejaban el último swing en hace medio año
  (ratio 2,1 sobre AAPL); con ±4 sale un tramo vigente.

### Comprobado por marco (PBF, 10 sep 2026)

| Marco | Tramo | Retroceso |
|---|---|---|
| 5m | 78,97 → 75,90 | 67,9 % |
| 15m | 75,64 → 78,97 | 25,4 % |
| 1H | 77,94 → 72,24 | 103,3 % |
| 1D | 74,46 → 63,95 | 129,5 % |
| 1S | 51,64 → 36,26 | 271,8 % |


---

## Pivotes de Woodie — con los sesgos del texto corregidos (10 sep 2026)

`backend/pivots.py` + `/pivots/{ticker}` + `backend/test_pivots.py` (35 pruebas)
+ `components/estrategia/mercado/PanelPivotes.tsx`, en la columna del robot
**debajo de `PanelFibonacci`**. Marcos: 5m, 15m, 1H, 4H, 1D y 1S.

Es una ESCALERA, no un gráfico de velas, y es deliberado: lo que se viene a
mirar aquí es a qué altura está el precio dentro del mapa y cuánto queda al
siguiente nivel. En 400 px, siete horizontales sobre velas de 2 px no contestan
eso. Es el mismo diagrama que el usuario dibujó en ASCII en su texto.

### Los tres errores del texto que entregó, y qué se hizo

**1. La fórmula de Woodie del texto no es la de Woodie.**

El texto: `PP = (H + L + 2C) / 4`, «da más peso al cierre anterior».
La real, y la de TradingView: `PP = (H_ant + L_ant + 2 × APERTURA_actual) / 4`.

El doble peso va a la **apertura del periodo en curso**, no al cierre anterior.
Ahí está su reactividad, y por eso es el único pivote clásico que incorpora el
hueco de apertura. Eso invierte otra afirmación del texto: su tabla puntúa a
Woodie igual que a Traditional en «mercados con gaps», cuando con la variante
del cierre el hueco se ignora por completo.

Se calculan **las dos**, `apertura` (por defecto) y `cierre`, con un conmutador
en la tarjeta. `test_las_dos_variantes_difieren_cuando_hay_hueco` demuestra que
coinciden EXACTAMENTE sin hueco y divergen con él: ésa es la diferencia real,
no el peso del cierre.

**2. «PP + VWAP + Supertrend» no son tres confirmaciones independientes.**

Los tres son medias de precio reciente. Exigir los tres no triplica la
evidencia, la cuenta tres veces. Es el mismo hallazgo que ya está anotado para
SuperTrend contra UT Bot a factor bajo (94 % de acuerdo, «ahí deja de confirmar
nada»).

Se MIDE: `colinealidad` da el porcentaje de barras en que el lado del PP y el
del VWAP coinciden, y por encima del 85 % la tarjeta lo dice. Medido sobre AAPL
sale 44-52 % según marco — o sea que en este caso **sí** aportan cosas
distintas. La medida vale en las dos direcciones.

**3. La secuencia del texto es temporal, no simultánea.**

«Precio > PP → > VWAP → SuperTrend verde → ruptura → retroceso → rechazo» no es
un `and`: ruptura y retroceso son estados opuestos. Evaluarlos a la vez no
dispara casi nunca — el mismo fallo que dejó el embudo del NQE en cero.

Implementado como **máquina de estados** de cuatro fases con caducidad, y la
tarjeta enseña en cuál está. `test_la_secuencia_no_dispara_con_las_condiciones_simultaneas`
mide que la coincidencia simultánea es residual (≤ 2 % de las rupturas).

### Mejoras añadidas

- **Tasa de toque medida por nivel**, en vez de repartir estrellas. De los
  últimos 60 periodos, en cuántos llegó el precio. Sobre AAPL 1H: PP 73 %,
  R1 47 %, R2 15 %, R3 7 %, S1 37 %, S2 12 %, S3 5 %. Los niveles del periodo
  en curso NO cuentan (su máximo aún puede crecer), y cada uno se calcula con
  el periodo ANTERIOR — si no, el PP caería siempre dentro del rango y saldría
  100 %: look-ahead disfrazado de estadística. Hay prueba.
- **El VWAP se ancla al inicio del periodo del pivote**, no es rodante. Con
  pivotes diarios es el VWAP de sesión de toda la vida. El rodante de 50 barras
  de `nqe.py` es otra cosa y no se puede comparar con niveles del día.
- **El objetivo es el siguiente nivel EN LA DIRECCIÓN del viaje**, no R1 a
  ciegas. El texto decía «R1 como primer objetivo», y eso sólo vale si el
  precio aún no lo ha rebasado; si ya está por encima, «objetivo R1» apunta
  hacia atrás. Lo cazó una prueba con una compra cuyo objetivo salía por debajo
  de la entrada.
- **Un objetivo más cerca que el stop se marca NO OPERABLE** y se dice el R/B.

### El veredicto LONG / SHORT y su auditoría

La tarjeta da un veredicto explícito, y **sólo con las SEIS condiciones
cumplidas en orden**. El resto del tiempo enseña «SIN SEÑAL · N de 6» con la
lista completa y lo que falta en cada punto.

Distinción que hay que mantener: **el sesgo NO es el veredicto**. Que el precio
esté por encima del PP es sesgo de compra y así se rotula; la orden sólo
aparece cuando la secuencia se completa. Fundirlos convertiría «precio sobre el
PP» en una orden de compra, que es exactamente contra lo que avisaba el texto
original del usuario. Hay prueba (`test_el_sesgo_no_es_el_veredicto`).

Cada condición viaja con **su medida** («78,05 vs 77,56»), no sólo con el
check: un ✓ sin cifra detrás no se puede auditar. Y las tres últimas salen de
la FASE alcanzada, no de comparar el cierre de hoy — «se rompió un máximo» es
algo que pasó y quedó registrado.

También viaja `ultima_senal`: la última secuencia que sí se completó, con su
precio, su stop y cuántas velas hace. Sin eso, una tarjeta que casi nunca
dispara parece rota.

El stop de cada señal va al **extremo del retroceso** ±0,5 ATR, no a una
distancia fija: es el precio que invalida el rechazo que dio la entrada.

### Cosas que no hay que «arreglar»

- **Los niveles NO cambian entre 5m, 15m, 1H y 4H.** Salen del periodo
  anterior, no de la vela que se mira: con pivotes diarios, el mapa es el mismo
  y así debe ser. Lo que cambia con el marco es la señal. Hay prueba que lo
  fija (`test_los_niveles_no_dependen_del_marco`).
- El periodo del pivote sube con el marco: intradía → diario, 1D → semanal,
  1S → mensual.

### Corregido de paso

`/fibonacci` agrupaba el semanal con `W-MON`, que en pandas va de **martes a
lunes** y mezcla dos semanas de calendario en cada vela. Ahora usa `W` (semana
ISO, lunes a domingo), que es además lo que hace `reagrupar()` en el frontend.
Fallo mío de esta misma sesión.


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
| Backtest | **Existe.** `backend/backtest.py`, `/backtest/{ticker}`, sin look-ahead y con pruebas. |
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
