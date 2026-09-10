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

**No, y no hay atajo:** profundidad de mercado, tape, reparto por nivel de
precio, clasificación de agresores, cadena de opciones.
`history()` devuelve `[Open, High, Low, Close, Volume]` y nada más.

**Matizado el 10 sep 2026:** aquí ponía también «bid/ask», y era demasiado
tajante. `history()` no los da, cierto — pero **`Ticker.info` sí trae `bid`,
`ask`, `bidSize` y `askSize`**. Lo que no trae es una horquilla FIABLE: viene
con ~15 min de retraso y a menudo rota incluso en mercado abierto (AAPL
cotizando 314,02 / 330,00). Se muestra validada y marcada; ver la sección de
esta sesión.

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

---

# Sesión del 10 de septiembre de 2026 — tres indicadores portados desde Pine

Se portaron tres indicadores de TradingView que entregó el usuario, cada uno
con su motor en el backend, sus pruebas ejecutables y su tarjeta en Estrategia.
Lo que sigue es **la lógica y los porqués**, no el inventario de archivos: eso
está en `CLAUDE.md`.

| Indicador | Motor | Pruebas | Tarjeta |
|---|---|---|---|
| NQE — Newtonian Quant Engine | `backend/nqe.py` | `test_nqe.py` (35) | `robot/PanelNQE.tsx` |
| Fib Retracement | `backend/fibonacci.py` | `test_fibonacci.py` (18) | `mercado/PanelFibonacci.tsx` |
| Pivotes de Woodie | `backend/pivots.py` | `test_pivots.py` (35) | `mercado/PanelPivotes.tsx` |

---

## La lección de ESTA sesión

La anterior fue «números correctos que mentían». Ésta tiene otra, y aparece
tres veces:

> **Portar un indicador fielmente y que no dispare nunca es un resultado, no un
> fallo. Pero hay que MEDIRLO y decirlo, no descubrirlo en pantalla.**

Los tres indicadores traían la misma trampa de fondo: **condiciones descritas
como una lista con «y» que en realidad son una SECUENCIA en el tiempo.** Un
`and` de booleanos sobre estados que no coexisten da cero para siempre, y cero
se lee como «mercado tranquilo», no como «lo he implementado mal».

- **NQE**: el filtro de Fibonacci exige estar a mitad de un retroceso mientras
  el disparo exige un estallido de momento. Medido sobre 5.082 barras horarias
  de AAPL, TSLA y NVDA con el preset recomendado: **0 señales**. Sin Fibonacci,
  137. No es un bug del port — es el indicador.
- **Pivotes**: «ruptura de estructura **y** retroceso a la zona» son estados
  opuestos. Se midió: coinciden en menos del 2 % de las rupturas. Hubo que
  implementarlo como máquina de estados de cuatro fases.
- **Fibonacci**: aquí la trampa era la contraria y más sutil, ver abajo.

**Qué se hace con eso:** el embudo y la lista de condiciones se enseñan en la
tarjeta, siempre, con las cifras. «221 → 154 → 1 → 0» y «3 de 6, falta el
retroceso» explican el cero. Un panel vacío sin explicación se lee como avería.

---

## Los errores técnicos que traían los indicadores

Cada uno tiene su prueba, para que la corrección sea demostrable y no una
opinión.

### 1. La fórmula de Woodie que circula por internet no es la de Woodie

El texto del usuario —y media web— dice `PP = (H + L + 2C)/4`, «da más peso al
cierre anterior». La real, y la de TradingView, es:

```
PP = (H_ant + L_ant + 2 × APERTURA_actual) / 4
```

El doble peso va a la **apertura del periodo en curso**. Ahí está su
reactividad, y por eso es el único pivote clásico que incorpora el hueco de
apertura. Eso invierte otra afirmación habitual: con la variante del cierre, un
gap se ignora por completo y el mapa queda anclado a un precio que el mercado
ya abandonó.

`test_las_dos_variantes_difieren_cuando_hay_hueco` demuestra que coinciden
EXACTAMENTE sin hueco y divergen con él. Ésa es la diferencia real.

### 2. «PP + VWAP + SuperTrend» no son tres confirmaciones

Los tres son medias de precio reciente. Exigir los tres no triplica la
evidencia; la cuenta tres veces. Es el mismo hallazgo que ya estaba anotado
para SuperTrend contra UT Bot a factor bajo.

**No se discute: se mide.** `colinealidad` da el % de barras en que el lado del
PP y el del VWAP coinciden, y por encima del 85 % la tarjeta avisa. Sobre AAPL
sale 44-52 % según marco — o sea que en este caso **sí** aportan cosas
distintas. La medida vale en las dos direcciones, que es lo que la hace útil.

### 3. En modo lookback, el Fibonacci no puede detectar que el impulso se rompió

El más bonito de los tres, y lo cazó una prueba escrita esperando lo contrario.

Con el método del script —máximo y mínimo de las últimas N velas— las anclas
son los extremos de la ventana y el cierre está DENTRO de esa ventana por
definición. Así que el retroceso queda confinado a [0, 1] pase lo que pase:
**ese método nunca puede avisar de que el impulso está roto.** Cuando el precio
rompe, reancla en silencio y sigue dibujando como si nada.

Por eso se añadió el modo por **pivotes confirmados**, donde las anclas son
swings del pasado y el precio sí puede rebasarlas.

### 4. «R1 como primer objetivo» sólo vale si aún no has llegado a R1

Si el precio ya está por encima de R1, «objetivo R1» apunta hacia atrás. Lo
cazó una prueba con una compra cuyo objetivo salía por debajo de la entrada —
la misma familia de error que ya estaba documentada («un patrón bajista con
objetivo por encima de la entrada»). El objetivo es ahora **el siguiente nivel
en la dirección del viaje**, y si no queda ninguno se dice.

### 5. El bug del `High != -1`

En el «Fib Retracement», la rama del mínimo manual comprueba `High != -1`
donde debería comprobar `Low != -1`. Como `High` tiene `minval = 0`, la
condición es siempre cierta y el fallo queda tapado. No se portó ese modo, pero
queda anotado.

---

## Decisiones de diseño que conviene no deshacer

**Un módulo suelto no ordena una operación.** Los carteles «Buy»/«Sell» de UT
Bot y los triángulos de la señal compuesta del NQE van en **listas separadas en
el backend** (`serie.ut_marcas` frente a `serie.marcas`) y con **forma distinta
en pantalla**. Fundirlos en una capa haría creer que un módulo manda, y la
regla del producto dice lo contrario.

**El verde y el rojo de una vela significan cierre contra apertura.** El script
de UT Bot recolorea las velas según la posición (`barcolor`). Aquí no: eso
pisaría la lectura en todas las pantallas del terminal. La misma información va
en una cinta bajo el eje, que además deja ver cuánto dura cada tramo.

**`show*` no es `use*`.** El Pine separa dibujar de filtrar, y aquí se habían
atado por error dos veces: apagar el filtro de Fibonacci borraba los niveles de
la pantalla. Son mandos independientes.

**Una señal bloqueada por el gate se enseña, marcada.** Es fiel al original
(círculos grises) y es lo único que distingue «no ve nada» de «ve algo sin
demostrar». Con la configuración por defecto del NQE **todas** salen
bloqueadas, así que la variante «hueca» es la que se ve el 99 % del tiempo:
tuvo que dibujarse con relleno al 16 %, porque con contorno tenue era invisible.

**El estado por defecto es el que hay que diseñar.** El caso «gráfico sin un
solo triángulo» no es una excepción: es lo normal. Lleva un aviso dentro del
gráfico que nombra **la causa concreta y el mando que la deshace**, y distingue
«ninguna en todo el histórico» de «hay N pero ninguna en las 180 dibujadas».

**El sesgo no es el veredicto.** Que el precio esté sobre el PP es sesgo de
compra y así se rotula; LONG/SHORT sólo aparece con las seis condiciones
cumplidas en orden. Confundirlos convertiría «precio sobre el PP» en una orden.

**Cada ✓ lleva su cifra detrás.** «Precio > VWAP ✓ · 78,05 vs 77,58». Un check
sin medida no se puede auditar: no sabes si es por tres céntimos o por tres
dólares.

---

## Gráficos: lo que se aprendió dibujando

**Las velas se ajustan al ancho, no al revés.** La columna del robot son
~400 px; con 180 velas cada una mide 2 px y el cuerpo desaparece.
`ANCHO_MIN_VELA = 4` fija cuántas caben y se recorta la cola. El gráfico se
acorta antes que volverse ilegible.

**La escala la fijan las velas y lo que está cerca de ellas.** Con un impulso
roto, una extensión 2.618 queda a un 25 % de distancia y arrastra la escala
entera: las velas se aplastan en el tercio inferior. Los niveles que no caben
se cuentan y se dicen en el pie. Al revés también pasa: escalar sólo con las
velas saca del panel un SuperTrend a tres ATR y desaparece sin avisar.

**UT Bot y SuperTrend se dibujan en ESCALERA.** Son niveles que se mantienen y
saltan, no curvas: unirlos con una diagonal dibuja una transición que nunca
existió.

**Las etiquetas se separan entre sí; la línea no se mueve nunca.** La línea
marca un precio real. Cuando un rótulo se aparta, un guion corto los vuelve a
unir — si no, un «0.5» a diez píxeles de su línea se lee como si marcara otro
precio.

**Los pivotes no piden un gráfico de velas, piden una escalera.** Lo que se
viene a mirar es a qué altura estás dentro del mapa y cuánto queda al siguiente
nivel. Siete horizontales sobre velas de 2 px no contestan eso.

**Las fechas van en orden cronológico, no por precio.** En un tramo bajista el
máximo es el más antiguo, y escribir «bajo → alto» hacía leer «26 ago a 30 jul».

---

## Estadística: cómo se sustituye una opinión por una medida

**Las estrellas se cambian por tasas de toque.** El texto del usuario repartía
⭐⭐⭐⭐⭐ a R1/S1 y ⭐⭐⭐ a R3/S3. Ahora cada nivel viaja con el porcentaje de
los últimos 60 periodos en que el precio llegó de verdad. Sobre AAPL 1H:

```
PP 73 %  ·  R1 47 %  ·  R2 15 %  ·  R3  7 %
            S1 38 %  ·  S2 13 %  ·  S3  5 %
```

Confirma la jerarquía y además la cuantifica: R3 es una apuesta al 7 %.

**Sin look-ahead, y con prueba.** Los niveles de cada periodo se calculan con
el ANTERIOR y se comprueban contra el máximo y mínimo del periodo en curso. Si
se calcularan con el propio periodo, el PP caería siempre dentro del rango y la
tasa sería del 100 %. El periodo en curso no cuenta: su máximo aún puede
crecer.

**El gate de Wilson no se abre casi nunca, y eso también se mide.** Con
objetivo y stop simétricos a 1,5× ATR el acierto ronda el 50 % (AAPL: 79
operaciones largas, 50,6 %), la cota de Wilson queda en 0,42 y el umbral pide
0,65. Para abrirlo haría falta un acierto real por encima del 72 %.

**Una equivalencia se demuestra, no se afirma.** Para sostener que el UT Bot
del NQE es el script «UT Bot Alerts», se reimplementó el Pine **literalmente y
por separado** —conservando incluso lo redundante, `ema(src,1)` incluido— y se
comparó marca a marca. Si compartiera código con el motor, no demostraría nada.
Lo mismo con el modo lookback del Fibonacci.

---

## Correcciones al propio proyecto

**`W-MON` no es la semana ISO.** En pandas agrupa de **martes a lunes** y
mezcla dos semanas de calendario en cada vela. La semana ISO es `W`
(lunes-domingo), que es además lo que hace `reagrupar()` en el frontend. Era un
fallo introducido en esta misma sesión en `/fibonacci`; corregido.

**El bug de `generatePDF` ya estaba corregido.** `CLAUDE.md` lo listaba como
pendiente; la firma lleva la paleta como sexto parámetro desde antes.

**Matiz sobre bid/ask.** Este archivo decía «No, y no hay atajo: bid/ask…». Es
cierto para `history()`, que devuelve OHLCV y nada más. Pero **`Ticker.info` sí
trae `bid`, `ask`, `bidSize` y `askSize`** — con ~15 minutos de retraso, a
menudo a cero y casi siempre a cero fuera de horario. Sirve como referencia
marcada, nunca como filtro duro de ejecución. La distinción importa y estaba
demasiado tajante.

---

## Método de verificación que funcionó

**Navegador de verdad, no suposiciones.** Playwright con `channel: 'msedge'`
usa el Edge ya instalado y no descarga 150 MB de Chromium. La ruta pide sesión:
hay `POST /api/auth/register` para una cuenta desechable, y se borra después
con `docker exec analisis_mongo mongosh analisis_db --eval
'db.users.deleteMany({email:"..."})'`. La base es **`analisis_db`**.

**Tres trampas que costaron tiempo:**

1. **El dashboard NO scrollea con `window`.** El scroll vive en el `ScrollView`
   interno: `document.body.scrollHeight` da la altura de la ventana y
   `window.scrollTo` no hace nada. Hay que subir por los padres hasta el que
   tiene `scrollHeight > clientHeight`.
2. **Grepear el bundle por texto con acentos no sirve.** El minificador escapa
   la eñe y las vocales acentuadas a secuencias `\x`. Buscar cadenas sin
   acentos.
3. **La cabecera de la app intercepta los clics** en la parte alta del
   viewport. Al posicionar un elemento a 45 px del borde para pulsarlo, el clic
   se lo come la barra superior. Dejar 200 px.

**Y una advertencia que no es del código:** `iniciar.bat` imprime las
direcciones de LAN («desde otro equipo de la red») pero **no responden**:
Docker Desktop publica el puerto sólo por loopback. Sólo funciona
`localhost:8080`.

---

## Lo que se hizo mal en el proceso

**Se movió una tarjeta tres veces sin que nadie lo pidiera.** El NQE pasó del
final de la columna del robot, a entre la confluencia y los mandos, a pegado al
gráfico principal. Cada mudanza tenía su razón técnica y ninguna estaba pedida;
el resultado fue que el usuario dejó de encontrarla dos veces seguidas y creyó
que se había borrado. **Cambiar de sitio algo que ya funciona es un cambio, y
hay que pedirlo o avisarlo.** Está ahora debajo de Ichimoku, que es donde él la
tenía, y el código lleva el historial anotado para que no vuelva a pasar.

---

## Pantalla de Análisis: estilo de la empresa, iconos, ratios y CAGR

### El clasificador valor / crecimiento — `backend/estilo.py`

Sitúa la empresa en un eje **0 = crecimiento puro · 100 = value puro** con seis
factores ponderados: valoración 25 %, crecimiento 25 %, rentabilidad 15 %,
flujo de caja 15 %, balance 10 %, momento 10 %. Bandas: ≥70 Value, ≥55 Value /
Mixto, ≥40 Mixto, ≥25 Crecimiento / Mixto, resto Crecimiento.

Cuatro decisiones que cambian el resultado y conviene no deshacer:

1. **El PEG cuenta dos veces dentro de valoración.** Es lo que relaciona precio
   con crecimiento, que es justo lo que un PER solo no distingue. Un umbral de
   PER a secas etiqueta como «value» a cualquier empresa en declive.
2. **El ROIC alto puntúa BAJO en el eje.** No es un juicio de calidad: un
   compounder de ROIC 30 % es el retrato del *growth*, y confundir «buena» con
   «de valor» es exactamente el error que el eje quiere evitar.
3. **Los pesos se renormalizan sobre el peso VIVO**, no sobre el total. Dividir
   entre 100 cuando sólo hay 60 puntos de peso disponibles empuja a toda
   empresa con datos incompletos hacia «crecimiento» sin que nadie lo note.
   Viaja `cobertura` y, por debajo de 0,6, `fiable: false` rotulado en pantalla.
4. **La trampa de valor se publica aparte de la puntuación.** PER < 15 con el
   BPA cayendo más de un 5 % anual no es una ganga: es el mercado descontando
   menos beneficio. Cambia por completo cómo se lee la etiqueta «Value», así
   que no puede quedar diluida dentro de la cifra. VZ la dispara.

**Los umbrales son absolutos, no sectoriales, y eso viaja escrito** en
`nota_umbrales`. Un PER de 25 es caro para un banco y barato para software; lo
correcto sería la mediana del sector, pero exige un dataset de comparables que
el proyecto no tiene, y **un umbral sectorial inventado sería peor que uno
absoluto declarado**.

Reparto medido: NVDA 25,0 · AAPL 34,5 · MSFT 39,8 · JNJ 43,3 · KO 46,1 ·
XOM 67,4 · VZ 68,0 (con trampa) · T 75,5.

`test_estilo.py` — 30 pruebas. Las que de verdad protegen algo: la
**monotonía** (encarecer sólo el PER no puede subir la puntuación de valor, y
crecer más rápido no puede acercarla), y **una prueba por factor** que
comprueba que puntúa con datos completos, con su contraprueba de que se apaga
sin ellos. La primera se validó mutando un umbral: falla, así que mide.

**Las pruebas que importan al backend no corren en el Python local.** Faltan
dependencias y las versiones de FastAPI no coinciden con las de la imagen. Se
ejecutan dentro del contenedor, que es donde vive el juego real:

```
docker cp server.py analisis_backend:/app/server.py
MSYS_NO_PATHCONV=1 docker exec -w //app analisis_backend python -m pytest test_estilo.py -q
```

### Por qué había ratios en blanco — dos causas, ninguna era «falta el dato»

El usuario avisó de que algunos de los ~110 ratios salían vacíos. No faltaba el
dato: se estaba leyendo mal.

1. **`_tramo_valido(serie)`.** Los CAGR tomaban `serie[0]` y `serie[-1]` a
   ciegas. Si el ejercicio más antiguo no informa esa partida, el extremo era
   un hueco y el CAGR no salía. Ahora los extremos se toman de los índices
   **con dato** y los años se cuentan entre ellos.
2. **`_instantanea(df)`.** La foto del último ejercicio era
   `df.iloc[:, 0].to_dict()`, es decir, la columna más nueva entera. **yfinance
   deja huecos por FILA, no por columna:** el `Interest Expense` de AAPL es
   `[NaN, NaN, 3.933, 2.931, 2.645]`. Con la columna cruda entraba como 0 y el
   DSCR salía vacío — y peor, cualquier ratio con esa fila en el denominador se
   calculaba contra un cero, que **no es «sin dato»: es una afirmación falsa**.
   Ahora cada partida se toma del último año que la informa, y
   `_antiguedad_instantanea()` dice cuántos ejercicios se ha retrocedido.

Resultado: **110/110 métricas con valor** en AAPL, KO, JNJ, MSFT y PEP.

### La rentabilidad por dividendo decía 569 %

`_rentabilidad_dividendo(info)` en `server.py` + `test_datos_declarados.py`.

VZ aparecía con **«Rentab. dividendo 569,00 %»**. No era cálculo ni
maquetación: era **unidad**. `dividendYield` de yfinance pasó de ser fracción
(0,0569) a ser porcentaje (5,69) entre versiones, y el código multiplicaba por
100 en tres sitios. Un número cien veces mayor no se lee como error de unidad,
se lee como un dato.

La corrección no fue quitar el ×100 —eso deja el problema esperando al próximo
cambio de la librería— sino **anclarse en una división que no admite
interpretación**: `dividendRate / precio × 100`. El campo declarado queda como
respaldo, deduciendo la unidad por magnitud, sólo cuando falta el precio.

Comprobado contra el campo declarado en seis valores (VZ 5,66/5,69 ·
KO 2,41/2,40 · AAPL 0,33/0,34 · T 4,34/4,41 · MSFT 0,74/0,74 · O 5,47/5,42).
**Sólo cambió `dividendYield`:** ROE, márgenes y `debtToEquity` siguen siendo
fracciones, así que su escalado se dejó como estaba. Se verificó, no se supuso.

### La columna CAGR de los estados financieros

`calcularCAGR` + `<CeldaCAGR>` en `FinancialStatements.jsx`, junto a la línea
de tendencia: la línea dice si sube, la tasa dice cuánto al año. Una curva
ascendente puede ser un 2 % o un 30 %.

Tres decisiones: extremos **con dato** (no el primer y último año de la tabla),
años contados **por calendario** (con un hueco en medio, contar puntos
anualiza sobre menos años de los que pasaron e infla la tasa), y **sin cifra
cuando un extremo es negativo** — la raíz n-ésima de un cociente negativo no es
una tasa de crecimiento. Se rotula `3a` junto a la cifra: un +40 % de dos años
y otro de cinco no son lo mismo.

**El fallo que casi se escapa:** la primera versión daba el signo cambiado. Di
por hecho que `years` llegaba de más antiguo a más reciente y la cabecera lo
pinta al revés. Los ingresos de VZ, que van de 136,8 B a 138,2 B, salían con
**−0,3 %**. No se detectó mirando si la columna «se veía bien» —se veía
perfecta— sino comprobando la cifra contra los números de su propia fila.
`cronologico()` ya existía en el archivo para esto; ahora se usa dentro de
`calcularCAGR`, así que el resultado no depende del orden en que llegue.

### Columnas de ejercicio fantasma

El endpoint devuelve un único `years` con la **unión** de los tres estados. En
VZ, el flujo de caja trae un 2021 con 6 valores de 54 y los otros dos estados
no llegan tan atrás: la cuenta de resultados pintaba una columna entera de
guiones. Una columna vacía no se lee como «este estado no llega tan atrás», se
lee como «la empresa no publicó nada ese año». `aniosConDato(rows, years)`
recorta por pestaña; el 2021 sigue viéndose en flujo de caja, que sí lo tiene.
El subtítulo («Últimos N ejercicios fiscales») ya no lleva el 4 a mano.

### Cinco filas en guiones por un nombre mal escrito — y el verificador

Quinta reincidencia del patrón que ya estaba anotado: **un mapeo mal hecho no
da error, da un hueco silencioso.** `Research Development` (es `Research And
Development`), `Selling General Administrative` (es `Selling General And
Administration`), `Short Term Investments`, `Intangible Assets`, y el
`Net Income` del flujo de caja (es `Net Income From Continuing Operations`).

En los dos casos del balance existía una clave parecida que **habría
duplicado** otra fila: `Cash Cash Equivalents And Short Term Investments`
incluye el efectivo que ya está arriba, y `Goodwill And Other Intangible
Assets` solapa con la fila de fondo de comercio. Se eligieron las que no
solapan. `v()` acepta ahora varios nombres y usa el primero con dato.

**`frontend/scripts/verificar-claves-estados.mjs`** consulta el endpoint real
para seis valores y señala toda clave que no aparezca **en ninguno** —una que
falta en un solo valor puede ser una empresa que no publica esa partida; una
que no aparece en ninguno es un nombre mal escrito. Los otros dos verificadores
son estáticos y no pueden ver esto: la verdad está al otro lado de la red.
Validado mutando una clave: la caza y sugiere el nombre correcto.

### Iconos

Las categorías de ratios llegan del backend con un emoji delante. Se limpian en
presentación con `nombreDeCategoria()` y se sustituyen por Ionicons de trazo
con la marca de índice de la casa. **En presentación y no en el backend a
propósito:** esas cadenas son la clave de las categorías desplegadas y viajan a
otras pantallas.

La insignia de estilo usa acento para Value y `caution` para Crecimiento,
**nunca verde ni rojo**: en este producto esos dos colores significan dirección
financiera, y un «Crecimiento» en verde se leería como una recomendación.

### Sigue pendiente

- **Error de hidratación #418** en todos los anchos salvo móvil. Es anterior a
  este trabajo y no lo introducen estas pantallas; queda anotado, no arreglado.
- **La fila se implementa tres veces**: `Terminal.Fila`,
  `PanelTecnicoAmpliado.FilaIndicador` y `PanelesAnalisis`. Unificarlas es un
  cambio transversal y no estaba pedido.

---

## Auditoría de cobertura de ratios — 26 métricas nuevas (11 sep 2026)

Se inventariaron las 110 métricas existentes antes de proponer nada. La
conclusión es que el panel estaba **muy bien cubierto en tres áreas y ciego en
otras tres**:

| Bien cubierto | Ciego |
|---|---|
| Rentabilidad (16), valoración por múltiplos (19) | Riesgo de mercado: 6 métricas, y 2 de ellas no son riesgo |
| Flujo de caja (14), eficiencia (17) | Retorno al accionista: nada sobre recompras ni dilución |
| Quiebra y calidad contable (11 modelos) | Liquidez (3), y las tres son fotos estáticas del balance |

Total: **110 → 136 métricas**. Ninguna se rellena con un valor por defecto.

### 1. Riesgo de mercado — `backend/riesgo.py` (17 métricas)

Era el hueco grande. La categoría «Riesgo y Capital» tenía seis entradas y dos
—WACC y el diferencial ROIC-WACC— son coste del capital, no riesgo. El riesgo
real se resumía en Sharpe, volatilidad y beta.

Lo que faltaba y por qué importa:

- **Máximo drawdown, caída actual y Ulcer Index.** Es el número que decide si
  alguien aguanta la posición o vende en el peor momento. Un Sharpe excelente
  con un −60 % por el camino es, en la práctica, una posición que nadie
  mantiene hasta el final. El Ulcer añade la DURACIÓN: dos valores con el mismo
  drawdown no cuestan lo mismo si uno tarda tres años en recuperarlo.
- **Sortino y Calmar.** El Sharpe castiga la volatilidad al alza, que no es
  riesgo. Sortino separa las dos y Calmar mide contra la peor caída sufrida en
  vez de contra la volatilidad media.
- **VaR, CVaR, asimetría y curtosis.** La volatilidad supone normalidad y los
  rendimientos tienen colas gruesas. Si el CVaR es mucho peor que el VaR, la
  desviación típica está mintiendo sobre el riesgo, y la tarjeta lo dice en la
  interpretación.
- **Capturas alcista y bajista.** Una beta sola esconde la asimetría. AAPL, con
  beta 1,08, captura el **110 % de las subidas y el 84 % de las caídas**: un
  perfil excelente que la beta promedia y tapa por completo.
- **R², alfa de Jensen y ratio de información.** Sin ellos no se puede contestar
  la pregunta de cartera: ¿esto aporta algo que el índice no dé ya más barato?

**La ventana es de cinco años y va escrita en cada rótulo.** Las de un año se
conservan, pero un Sharpe de 252 observaciones lo domina lo que el valor haya
hecho en los últimos doce meses. El contraste entre los dos es en sí mismo
información: AAPL sale con **Sharpe 1,77 a un año y 0,45 a cinco** — suerte
reciente, no calidad. Por eso se añadió un Sharpe a 5 años junto al Sortino:
comparar un Sortino de cinco con un Sharpe de uno no dice nada.

**Además se corrigió un `risk_free_rate = 0.04` escrito a mano** mientras el
resto del proyecto ya leía ^TNX. No es cosmético: Sharpe, Sortino y alfa miden
exceso sobre el activo sin riesgo, así que un 4 % fijo los desplaza a los tres
en la misma dirección y de forma invisible. Ahora sale de ^TNX, cacheado una
hora junto con la serie del S&P — las dos son iguales para cualquier ticker y
antes se habrían descargado una vez por análisis.

#### Los dos errores que las pruebas cazaron

**Las capturas no se pueden calcular con datos diarios.** La primera versión
componía los rendimientos de los días en que el índice sube (y baja) y dividía
los acumulados. Medido sobre el índice apalancado x2, cuya captura bajista debe
ser ~200 %: componer los 694 días bajistas lleva el índice a **−0,99957** y el
apalancado a **−0,99999984**, y el cociente sale **100,04 %**. Saturado en
100 % pasara lo que pasara, y perfectamente creíble en pantalla.

La segunda versión compuso por meses, y seguía mal: componer los 38 meses
alcistas de cinco años no mide la diferencia, la multiplica — daba **432 %**.
La definición correcta (Morningstar) divide las **tasas mensuales medias
geométricas**, y entonces sale 195 %. Tampoco vale promediar el cociente día a
día: el índice cierra casi plano la mitad de las sesiones y esas divisiones por
casi cero dominan la media. Las tres alternativas están fijadas con prueba.

**La desviación bajista se divide entre el TOTAL de observaciones**, no entre
las que quedan por debajo del objetivo. Es el error clásico del Sortino y da
otro número sin que nada lo delate.

Y una decisión de método que evita el fallo más caro: **las dos series se
cruzan por fecha antes de calcular nada**. Los índices y los valores no
comparten calendario —festivos distintos, suspensiones— y emparejar por
posición produce una beta plausible y completamente falsa. Hay prueba que quita
40 días sueltos al índice y comprueba que la beta apenas se mueve.

`test_riesgo.py`, 26 pruebas.

### 2. Retorno al accionista y dilución (4 métricas)

El mayor punto ciego fundamental. Había rentabilidad por dividendo y payout, y
**nada** sobre recompras ni sobre el número de acciones. En el S&P 500 las
recompras superan a los dividendos desde hace más de una década, así que juzgar
la retribución sólo por el dividendo se deja fuera más de la mitad. Y al revés:
una empresa que emite acciones diluye al accionista todos los años sin que
aparezca en ningún ratio.

- **FCF Yield** (FCF / capitalización). Estaban EV/FCF y P/FCF —sus inversos—
  pero no la rentabilidad directa, que es el ratio central del inversor de
  valor. **Y `estilo.py` lo pedía por ese nombre desde el primer día:** su
  subindicador de FCF yield devolvía `None` en todas las empresas y el factor
  se sostenía sobre los otros dos. Un traductor con una clave inventada no da
  error, deja el factor a medio gas.
- **Buyback yield y dilución anual**, del número de acciones diluidas. Signo
  explícito: acciones que bajan es recompra y va en positivo. Medido: AAPL
  +2,77 %, MSFT +0,08 % (las recompras sólo compensan la retribución en
  acciones), VZ −0,21 %, XOM −0,79 % (emitió para comprar Pioneer).
- **Shareholder yield**: dividendos + recompras netas de emisiones +
  amortización **neta** de deuda. Lo de «neta» importa: refinanciar —pagar
  10 000 y emitir 10 000— no devuelve nada a nadie, y contar sólo el pago
  inflaría el ratio en cualquier empresa que renueve vencimientos, que son casi
  todas.

También entra en `estilo.py`: sin él, cualquier compañía que retribuya por
recompra —la norma en EE. UU.— se escoraba hacia «crecimiento» sin motivo.

### 3. Solvencia con caja real y colchón (2 métricas)

- **Deuda neta / FCF (años).** Estaba Deuda neta / EBITDA, que es el múltiplo
  más maquillado del crédito porque el EBITDA no es caja y deja fuera
  intereses, impuestos e inversión. Éste dice los años de trabajo que hacen
  falta para pagar la deuda con dinero de verdad. Medido: AAPL 0,6 · MSFT 0,5 ·
  XOM 1,4 · KO 6,7 · T 7,0 · VZ 8,3.
- **Intervalo defensivo (días).** Los tres ratios de liquidez son fotos
  estáticas: dicen qué HAY, no cuánto DURA. Éste da los días de gastos
  operativos que cubre con caja, inversiones a corto y clientes, sin vender
  nada. Excluye existencias —que en una crisis no se venden, que es justo lo
  que hace inservible al ratio corriente— y resta la amortización del gasto,
  porque no sale caja por ella. Medido: XOM 58 días, MSFT 416.

### 4. Calidad del crecimiento (3 métricas)

- **Regla del 40** (crecimiento de ingresos % + margen FCF %). Crecer un 25 %
  quemando caja y crecer un 8 % generándola son cosas opuestas y hasta ahora se
  leían igual. Medido: NVDA 144,8 · MSFT 36,3 · AAPL 25,5 · XOM 0,6.
- **Crecimiento sostenible** (ROE × retención) y **brecha** contra el real.
  Crecer por encima de lo sostenible no es una virtud: significa que la
  diferencia se financia con deuda o con acciones nuevas.

**La guarda que hubo que ponerle.** La fórmula se rompe cuando el patrimonio no
es una medida real del capital empleado, y eso pasa en cuanto la empresa lleva
años recomprando: las acciones retiradas salen del patrimonio y el denominador
se encoge. AAPL tiene un ROE del **151,9 %** —65 000 millones de patrimonio
contra 100 000 de beneficio— y la primera versión publicó un «crecimiento
sostenible del 131 %», con una brecha de −129 pp. Varias compañías del S&P
(MCD, HD, SBUX, BA) llegan directamente a patrimonio negativo por lo mismo.

Por encima del 40 % de ROE se publica el hueco **con su motivo delante**, no la
cifra: «No aplica con un ROE del 152 %…». Un 131 % en pantalla no se lee como
«esta fórmula no aplica aquí», se lee como un dato.

### Consecuencia que conviene tener presente

El veredicto COMPRAR / MANTENER / VENDER se calcula sobre el **porcentaje** de
métricas favorables, así que añadir métricas mueve el denominador y puede mover
el veredicto. En AAPL pasó de 63,7 % a 65,1 % y siguió en COMPRAR. Si algún día
se añaden más, hay que mirar si algún valor cambia de banda por eso y no por
sus números.

Las diez métricas que pueden quedar sin dato entran con `passed=None`, así que
salen con guion y **no cuentan en el denominador**: un hueco del proveedor no
puede empeorar la nota de la empresa.
