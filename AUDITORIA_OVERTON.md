# Auditoría de cálculo — Ventana de Overton

**Fecha:** 16 de agosto de 2026
**Alcance:** `frontend/components/OvertonSignalMatrix_v4.jsx` (4.180 líneas, 25 paneles),
`backend/server.py` (endpoints `/overton`, `/technical`, Volume Delta MTF),
`frontend/components/VolumeDeltaAnalysis.tsx`, `VolumeDeltaTable.tsx`.

**Método:** revisión del código fuente, no de las capturas. Las imágenes que
compartiste son maquetas de diseño y sus cifras no proceden de la aplicación,
así que las contradicciones que se ven en ellas (precios objetivo negativos,
un ratio riesgo/beneficio de 1:2,7 que no cuadra con su propia entrada y stop,
un valor razonable por debajo del precio etiquetado como «infravalorado») **no
son defectos del código** — no existen esas cadenas en el repositorio. Lo que
sigue sí está en el código y sí afecta a lo que ve el usuario.

---

## Resumen ejecutivo

El motor de puntuación del backend está bien: `/overton/{ticker}` calcula
WMA-30, Coppock, Sharpe, momento 12-1, z-score, OFI, VWAP y el resto sobre
datos reales de mercado. **El problema no es el motor, es la capa visual.**

**Doce de los veinticinco paneles** de la pantalla de Overton generan sus
cifras con un generador pseudoaleatorio sembrado con el ticker
(`useSeededRand`). No son estimaciones aproximadas: son números inventados de
forma determinista, que no cambian al recargar —lo que los hace parecer
estables y por tanto fiables— y que responden al ticker, no al mercado.

| Gravedad | Hallazgo |
|---|---|
| **Crítica** | 12 paneles con datos pseudoaleatorios presentados como análisis |
| **Crítica** | Ponderación de Volume Delta sobre volúmenes anidados (matemáticamente vacía) |
| **Alta** | Volume Delta mide posición del cierre, no flujo de órdenes, pero se rotula como flujo institucional |
| **Alta** | El consenso multi-timeframe inyecta ruido aleatorio a propósito (hasta el 88 %) |
| **Media** | `MarketRegimePanel` sustituye datos ausentes por aleatorios sin avisar |
| **Media** | Volume Delta mide la vela anterior mientras la cuenta atrás habla de la actual |
| Resuelto | Sesiones abiertas en fin de semana (corregido hoy) |

---

## 1 · Doce paneles funcionan con un generador pseudoaleatorio

**Dónde:** `OvertonSignalMatrix_v4.jsx`, línea 471.

```js
function useSeededRand(seed) {
  return useCallback((idx) => {
    const x = Math.sin((seed ^ 0xDEADBEEF) + idx * 127773 + 2836) * 99991;
    return Math.abs(x - Math.floor(x));
  }, [seed]);
}
```

`seed` es un hash del ticker. La función devuelve siempre lo mismo para el
mismo par (ticker, índice), así que el panel de AAPL enseña hoy lo mismo que
enseñará mañana y que enseñaba el mes pasado, con independencia de lo que
haya hecho la acción.

**Paneles afectados** (línea de la llamada):

| Panel | Línea | Qué aparenta ser |
|---|---|---|
| `SMCPanelLive` | 148 | Estructura de mercado Smart Money |
| `ScoreBreakdownExpandedV4` | 621 | Desglose del score |
| `MicrostructureAdvancedPanel` | 1192 | Microestructura y flujo |
| `MarketPhaseChart` | 1458 | Fase del ciclo Wyckoff |
| `WeeklyCandleChart` | 1881 | Velas semanales |
| `ElliottWavePanel` | 2450 | Conteo de ondas de Elliott |
| `MarketRegimePanel` | 2918 | Régimen de mercado |
| `VolatilitySurface` | 2979 | Superficie de volatilidad |
| `IchimokuPanel` | 3047 | Nube de Ichimoku |
| `MTFPanel` | 3112 | Consenso multi-timeframe |
| `LiquidityHeatmap` | 3220 | Mapa de liquidez |
| `WolfeWavesPanel` | 3420 | Patrón de ondas de Wolfe |

El caso de Elliott es el más ilustrativo. Las ondas no se detectan sobre el
histórico: se **construyen** aplicando proporciones de Fibonacci a números
aleatorios (líneas 2586-2604):

```js
const w3Size = w1Size * (1.618 + r[4] * 0.4);   // onda 3
const w5Size = w1Size * (0.618 + r[6] * 0.5);   // onda 5
```

Luego el panel valida que «todas las relaciones Fibonacci cumplen» — y claro
que cumplen: se han fabricado para que cumplan. La comprobación no verifica
nada. Wolfe Waves sigue el mismo patrón desde la línea 3423.

**Por qué importa más de lo que parece.** Un número aleatorio que cambia en
cada recarga se detecta enseguida. Uno sembrado, no: es estable, coherente
consigo mismo y trae etiquetas de calidad («Calidad: 75 %», «Fiabilidad
75 %», «Precisión histórica 68 %») que son a su vez inventadas. Es la forma
más convincente posible de estar equivocado.

**Corrección propuesta:** implementar detección real (sección 7) o retirar
los paneles. La opción intermedia —dejarlos con un aviso más grande— no la
recomiendo para las secciones que sugieren entrada, stop y objetivo.

---

## 2 · La ponderación por volumen de Volume Delta no significa nada

**Dónde:** `VolumeDeltaAnalysis.tsx`, líneas 40-59.

```js
const totalVol = data.reduce((sum, d) => sum + (d.vol || 0), 0);
const getWeight = (vol) => ((vol / totalVol) * 100).toFixed(0);
```

Se suman los volúmenes de 1m, 5m, 15m, 1H, 4H, 1D y 1W y se reparte el 100 %
entre las tres capas. **Pero esos volúmenes están anidados:** la vela de 1W
contiene la de 1D, que contiene la de 4H, que contiene la de 1H, y así hasta
el minuto. Se está contando la misma acción negociada siete veces.

El resultado es que la capa macro siempre saldrá alrededor del 90 % y la
capa corta siempre alrededor del 0 %, no porque el dinero institucional
domine, sino porque **una barra semanal agrega cinco sesiones y una barra de
un minuto agrega sesenta segundos.** El porcentaje mide la duración de la
vela, no la participación del mercado.

La leyenda que lo acompaña —«Los timeframes de mayor volumen tienen mayor
relevancia en el análisis final»— convierte un artefacto aritmético en una
regla de decisión.

**Corrección.** Si se quiere ponderar por actividad, hay que comparar cada
marco contra su propia media, no contra los demás:

```js
// Peso = cuánto se aparta el volumen de ESTE marco de su media reciente.
// Así un 1m con volumen anómalo pesa, y un 1W rutinario no.
const zVol = (d) => (d.vol - d.volMedia) / d.volDesv;
const peso = (d) => Math.max(0, 1 + clamp(zVol(d), -1, 3));
```

Requiere que el backend devuelva media y desviación del volumen por marco —
son dos líneas en `_calc_volume_delta`. Alternativa más simple y honesta:
quitar los porcentajes y ponderar las tres capas con pesos fijos declarados
(por ejemplo 50/30/20), explicando que son una elección del modelo.

---

## 3 · «Volume Delta» no mide flujo de órdenes

**Dónde:** `backend/server.py`, línea 7209.

```python
buy_vol  = vol * (close - low)  / range_
sell_vol = vol * (high - close) / range_
```

Esto es el *close location value*: dónde cerró el precio dentro del rango de
la vela. Es un indicador legítimo y conocido, pero **no es volumen de compra
frente a volumen de venta.** Para eso hace falta clasificar cada operación
contra el bid y el ask, y Yahoo Finance no sirve datos a nivel de tick.

Nótese además que `total = buy_vol + sell_vol` es idénticamente igual a
`vol`, así que la división posterior es redundante: `buy_pct` se reduce
siempre a `(close - low) / (high - low) × 100`.

El problema es el rótulo. Con `buy_pct = 93` la interfaz dice «Acumulación
agresiva continua» y «Institucional vendiendo». Lo único que ha ocurrido es
que la vela cerró cerca de su máximo. Un cierre alto puede venir de compra
institucional o de un cierre técnico con volumen ridículo; el indicador no
los distingue.

**Corrección.** Renombrar a lo que es —«Posición del cierre en el rango» o
«CLV»— y suavizar las interpretaciones. Si de verdad quieres flujo de
órdenes, hace falta otro proveedor (Polygon, Databento o IEX sirven trades
con condición); es un cambio de proveedor, no de fórmula.

---

## 4 · El consenso multi-timeframe añade ruido aleatorio a propósito

**Dónde:** `OvertonSignalMatrix_v4.jsx`, líneas 3116-3143.

```js
const noiseMap = { "1m": 0.88, "5m": 0.68, "15m": 0.48,
                   "1h": 0.28, "4h": 0.14, "1d": 0.05, "1w": 0.02 };
const toSignal = (base, noiseLevel, seed) => {
  const noisy = base * (1 - noiseLevel) + (r(seed) * 2 - 1) * noiseLevel;
  return noisy > 0.15 ? "bull" : noisy < -0.15 ? "bear" : "neutral";
};
```

La tabla aparenta siete análisis independientes, uno por marco temporal. En
realidad es **un solo número** (`biasBase`, derivado de momento, RSI y OFI)
al que se le suma ruido creciente según se baja de marco. La fila de 1 minuto
es ruido en un 88 %.

Esto invalida la lectura principal de la tabla. Cuando un usuario ve «seis de
siete marcos alcistas» cree estar viendo confluencia —señales independientes
que coinciden— y eso es lo que da confianza a una entrada. Aquí la
coincidencia está garantizada por construcción, porque todas las filas salen
de la misma cifra.

**Corrección.** Calcular cada marco de verdad. El backend ya descarga las
siete series en `_get_volume_delta_mtf`; reaprovechar esas descargas para
computar tendencia, RSI, MACD y ADX por marco es trabajo acotado y elimina
tanto el ruido como el campo `syntheticMtf` entero.

---

## 5 · `MarketRegimePanel` inventa los datos que le faltan, en silencio

**Dónde:** líneas 2921-2926.

```js
const adx     = rawAdx > 0     ? rawAdx     : 15 + r(200) * 40;
const bbWidth = rawBbWidth > 0 ? rawBbWidth : 0.02 + r(201) * 0.10;
const atrPct  = rawAtrPct > 0  ? rawAtrPct  : 0.5 + r(202) * 3;
```

El diseño es mejor que el de los paneles anteriores —usa el dato real cuando
existe— pero cuando no existe pinta un ADX inventado entre 15 y 55 **con la
misma tipografía, el mismo color y la misma barra de percentil que el dato
bueno.** Y de ese ADX sale la clasificación del régimen, que a su vez sale en
el titular del panel.

Un ADX de 16,4 con un decimal transmite una precisión que un `15 + r()*40` no
tiene.

**Corrección.** Estado vacío explícito. La paleta ya tiene `noSignal` para
exactamente esto: «el dato que no existe, ni cero ni oculto».

---

## 6 · Volume Delta mide una vela y cuenta atrás sobre otra

**Dónde:** `backend/server.py`, línea 7201 — `row = df.iloc[-2]`.

Se mide la penúltima vela, es decir, la última cerrada. Es una decisión
defendible: la vela en formación cambia con cada tick. Pero al lado se muestra
`_calc_countdown`, que cuenta lo que falta para que cierre la vela **actual**.

El usuario lee «faltan 23 s» y asume que los porcentajes de al lado
corresponden a esa vela. Corresponden a la anterior, que ya cerró.

**Corrección.** Devolver también la marca temporal de la vela medida y
rotular la columna «última vela cerrada», o medir la vela en curso y decirlo.
Cualquiera de las dos vale; lo que no vale es la mezcla actual.

---

## 7 · Mejoras profesionales sugeridas

Ordenadas por relación entre valor y esfuerzo.

**7.1 · Trazabilidad de la procedencia del dato.** Antes que cualquier
indicador nuevo. Que cada cifra sepa decir de dónde viene: `real`,
`derivado`, `estimado` o `no disponible`, y que la interfaz lo refleje de
forma consistente. Resuelve de raíz los hallazgos 1, 5 y 6, y es un cambio
estructural, no cosmético.

**7.2 · Detección real de Elliott y Wolfe.** Es abordable. El algoritmo
estándar es ZigZag sobre pivotes (umbral en múltiplos de ATR) y después
validación de las reglas duras de Elliott: la onda 2 no retrocede más del
100 % de la 1, la 4 no solapa el territorio de la 1, la 3 no es la más corta.
Lo importante del cambio es que un conteo real **puede no encontrar nada**, y
eso es información. El panel actual siempre encuentra un patrón perfecto.

**7.3 · Calibración de las probabilidades.** Los paneles muestran cifras como
«Probabilidad 60 %» o «Precisión histórica 68 %». Si van a existir, deben
salir de un contraste contra histórico: cuenta de aciertos sobre N casos
pasados, con N a la vista. Una probabilidad sin denominador no es una
probabilidad.

**7.4 · Consolidar el conflicto entre paneles.** Hoy la pantalla puede decir
«tendencia general BAJISTA», «conclusión INDECISO» y «señal principal REBOTE»
a la vez, y las tres son salidas correctas del código. Falta una capa que
resuelva el conflicto y explique la jerarquía, en lugar de dejársela al
lector.

**7.5 · Retipado al lenguaje del análisis.** Lo que pediste: Overton usa hoy
una paleta propia codificada a mano (`T.card = "#1c2230"`, azules y morados
saturados) mientras el resto de la aplicación usa los tokens del tema. Migrar
`T` a `useTheme()` unifica ambas pantallas y, de paso, le da a Overton el modo
claro que ahora no tiene. Es mecánico pero extenso: 25 paneles.

**7.6 · Pruebas sobre las fórmulas.** No hay tests de los indicadores. Los
casos que fallan son siempre los mismos y son baratos de fijar: rango de vela
cero, volumen cero, series más cortas que el periodo del indicador, huecos de
fin de semana, valores `NaN` de Yahoo. El fallo de las sesiones en fin de
semana que corregimos hoy es exactamente de esta familia.

---

## Plan propuesto

| Orden | Trabajo | Alcance |
|---|---|---|
| 1 | Marcar como no disponible todo dato pseudoaleatorio | 1 día |
| 2 | Arreglar la ponderación de Volume Delta y renombrar CLV | Medio día |
| 3 | Consenso multi-timeframe con cálculo real por marco | 1-2 días |
| 4 | Detección real de Elliott y Wolfe con ZigZag | 3-4 días |
| 5 | Retipado de Overton al tema | 2-3 días |
| 6 | Pruebas de las fórmulas y de los casos límite | Continuo |

El orden no es negociable en un punto: **el paso 1 va antes que el 5.** Una
pantalla bonita con números inventados es peor que una fea con los mismos
números, porque la presentación añade credibilidad que el dato no respalda.
