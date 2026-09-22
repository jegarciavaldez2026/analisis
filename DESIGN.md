---
name: FinAnalysis
description: Instrumento calibrado para leer fundamentales — el veredicto es una posición en una escala, no una opinión con color.
colors:
  enamel-canvas: "#E4E0D6"
  enamel-face: "#F6F3EC"
  enamel-raised: "#FCFAF5"
  enamel-well: "#EAE6DC"
  enamel-chrome: "#EEEAE0"
  graphite-ink: "#1C1B17"
  graphite-muted: "#57544B"
  graphite-faint: "#8A867C"
  scale-rule: "#D2CCBE"
  scale-rule-strong: "#B6AF9E"
  petrol-index: "#10545B"
  petrol-index-pressed: "#0B3E44"
  signal-up: "#1F6B3E"
  signal-down: "#A62A21"
  signal-caution: "#8A5A0B"
  no-signal: "#A8A296"
  backlit-canvas: "#0E0F0E"
  backlit-face: "#1A1B19"
  backlit-raised: "#232421"
  backlit-well: "#111211"
  backlit-chrome: "#151614"
  backlit-ink: "#F1EEE6"
  backlit-muted: "#A8A497"
  backlit-faint: "#757166"
  backlit-rule: "#2D2F2B"
  backlit-rule-strong: "#454840"
  backlit-index: "#3FA9AF"
  backlit-index-pressed: "#67C4C9"
  backlit-up: "#43A96D"
  backlit-down: "#DD6257"
  backlit-caution: "#CE9A3C"
  backlit-no-signal: "#6A675E"
typography:
  display:
    fontFamily: "system-ui (SF Pro · Roboto)"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "36px"
    letterSpacing: "-0.8px"
  title1:
    fontFamily: "system-ui (SF Pro · Roboto)"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "30px"
    letterSpacing: "-0.5px"
  title2:
    fontFamily: "system-ui (SF Pro · Roboto)"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "26px"
    letterSpacing: "-0.3px"
  title3:
    fontFamily: "system-ui (SF Pro · Roboto)"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "23px"
    letterSpacing: "-0.2px"
  body:
    fontFamily: "system-ui (SF Pro · Roboto)"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "21px"
    letterSpacing: "0"
  label:
    fontFamily: "system-ui (SF Pro · Roboto)"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
    letterSpacing: "0"
  caption:
    fontFamily: "system-ui (SF Pro · Roboto)"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0"
  legend:
    fontFamily: "system-ui (SF Pro · Roboto)"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "14px"
    letterSpacing: "1.1px"
  measure:
    fontFamily: "Menlo · monospace · ui-monospace"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "21px"
    fontFeature: "tabular-nums"
rounded:
  none: "0px"
  xs: "3px"
  sm: "5px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  hair: "2px"
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  h1: "32px"
  h2: "40px"
  h3: "48px"
  h4: "64px"
components:
  panel:
    backgroundColor: "{colors.enamel-face}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  button-primary:
    backgroundColor: "{colors.petrol-index}"
    textColor: "{colors.enamel-face}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.petrol-index-pressed}"
    textColor: "{colors.enamel-face}"
    rounded: "{rounded.sm}"
  button-secondary:
    backgroundColor: "{colors.enamel-well}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.signal-down}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  field:
    backgroundColor: "{colors.enamel-well}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "48px"
  field-focus:
    backgroundColor: "{colors.enamel-well}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.sm}"
  signal-up:
    backgroundColor: "rgba(31, 107, 62, 0.12)"
    textColor: "{colors.signal-up}"
    rounded: "{rounded.xs}"
    padding: "5px 12px"
  signal-down:
    backgroundColor: "rgba(166, 42, 33, 0.12)"
    textColor: "{colors.signal-down}"
    rounded: "{rounded.xs}"
    padding: "5px 12px"
  signal-caution:
    backgroundColor: "rgba(138, 90, 11, 0.12)"
    textColor: "{colors.signal-caution}"
    rounded: "{rounded.xs}"
    padding: "5px 12px"
---

# FinAnalysis — sistema de diseño

Registrado desde el código construido, no desde el plan. Fuente normativa: `frontend/theme/tokens.ts`; distribución en `frontend/contexts/ThemeContext.tsx`; primitivas en `frontend/components/ui/`.

## Overview

**Estrella polar: el instrumento calibrado.**

FinAnalysis dice COMPRAR, MANTENER o VENDER a partir de la proporción de ratios favorables. El sistema visual trata ese resultado como lo que es —una lectura sobre una escala graduada— en lugar de como una etiqueta de color. Las tres bandas del backend (≥60, 40–60, <40) están dibujadas en la interfaz, con sus límites marcados, y el índice cae visiblemente en una de ellas.

De ahí sale todo lo demás: esmalte cálido en vez de blanco de dashboard, tinta grafito, reglas de un pelo, marcas de escala impresas y cifras monoespaciadas tabulares porque son medidas. El acento petróleo es el índice del instrumento: estructura y selección. Verde y rojo no decoran nunca; están reservados al código financiero de alza/baja y favorable/desfavorable.

Modo Operate: la herramienta desaparece en la tarea. La familiaridad es una función, no una limitación.

## Colors

Estrategia: **Restrained** (neutros + un acento) con vocabulario semántico separado. Dos apariencias de primera clase; ninguna es la "de verdad".

| Rol | Claro (cara de esmalte) | Oscuro (panel retroiluminado) |
|---|---|---|
| Chasis / fondo de app | `#E4E0D6` | `#0E0F0E` |
| Cara del panel | `#F6F3EC` | `#1A1B19` |
| Panel elevado (menús, popovers) | `#FCFAF5` | `#232421` |
| Pozo hundido (campos, celdas) | `#EAE6DC` | `#111211` |
| Neutral secundario (sidebar, top bar, tab bar) | `#EEEAE0` | `#151614` |
| Tinta principal | `#1C1B17` | `#F1EEE6` |
| Tinta secundaria | `#57544B` | `#A8A497` |
| Tinta terciaria / leyendas | `#8A867C` | `#757166` |
| Regla fina | `#D2CCBE` | `#2D2F2B` |
| Regla mayor | `#B6AF9E` | `#454840` |
| Acento (índice) | `#10545B` | `#3FA9AF` |
| Alza / favorable | `#1F6B3E` | `#43A96D` |
| Baja / desfavorable | `#A62A21` | `#DD6257` |
| Precaución / intermedio | `#8A5A0B` | `#CE9A3C` |
| Sin señal (`N/A`) | `#A8A296` | `#6A675E` |

Reglas:

- **El acento no es el semáforo.** Petróleo = estructura, selección, índice, foco. Verde/rojo = dirección financiera. Nunca se cruzan.
- **Los lavados** (`accentWash`, `upWash`, `downWash`, `cautionWash`) son el mismo color al 10–16 % de alfa, y sólo sirven como fondo de estado (fila pulsada, banda de tolerancia, aviso).
- **El color nunca es el único portador de significado.** Todo estado con color lleva además texto, icono, marca de índice o posición. Este producto es literalmente rojo contra verde y una parte medible de sus usuarios no distingue los dos.
- **`N/A` tiene su propio color.** Un dato ausente se dibuja con `no-signal` y una raya (`—`), nunca como 0 ni oculto.

## Typography

Una sola familia de interfaz —la del sistema— más una cara monoespaciada para medidas.

- **Interfaz:** SF Pro en iOS, Roboto en Android, stack del sistema en web. Es lo que piden HIG y Material y lo que un usuario fluido espera de un control. No hay cara de display propia: no hay red en el entorno de build para autoalojar una, y una cara del sistema haciendo de voz de display sería peor que ninguna.
- **Medidas:** `Menlo` (iOS) · `monospace` (Android) · `ui-monospace, SFMono-Regular, …` (web), siempre con `fontVariant: ['tabular-nums']`. Se usa para cifras, tickers, escalas y horas. Nunca como disfraz de "técnico" en prosa.

Escala fija, no fluida (ratio ≈1.15): display 32 · title1 24 · title2 20 · title3 17 · body 15 · label 13 · caption 12 · legend 11.

`legend` es la rotulación del instrumento: 11 px, peso 700, tracking 1.1 px, en versalita. Es el único estilo con tracking positivo.

## Layout

- **Responsividad estructural, no fluida.** No hay tipografía con `clamp`; lo que cambia es la composición.
- **Punto de corte único: 900 px.** Por encima, en web, el shell es barra lateral de 244 px + top bar de 56 px. Por debajo (y siempre en nativo) es navegación por pestañas inferiores. Un móvil web ancho no recibe una barra lateral encogida: recibe pestañas.
- **Anchos máximos de contenido:** 880 px en pantallas de tarea (Análisis), 1100 px en pantallas de tabla (Mercado), centrados. La densidad es una función; el ancho infinito no lo es.
- **Ritmo:** una sola escala de espaciado (2 → 64). Grupos apretados, separación generosa, más espacio encima de un encabezado que debajo.
- **Insets del sistema:** la tab bar suma `insets.bottom`; login y pantallas a pantalla completa suman `insets.top`. Nada bajo la isla dinámica ni el indicador de inicio.
- **Objetivos táctiles ≥44 pt** en todo control. El botón compacto crece con relleno vertical antes que encoger su área activa.

## Elevation & Depth

Profundidad por capas tonales, con sombra sólo donde una superficie flota de verdad.

| Nivel | Uso | Sombra |
|---|---|---|
| 0 | Superficies fijas, filas de tabla | ninguna |
| 1 | Placa sobre el chasis; botón primario | `0 1px 3px` sombra |
| 2 | Panel de acceso, hoja | `0 3px 10px` |
| 3 | Popover, lista de sugerencias | `0 10px 28px` |

Toda sombra lleva desplazamiento **y** desenfoque. Un halo sin desplazamiento es decoración, no profundidad. En Android se traduce a `elevation` (1 / 4 / 12); en web a `boxShadow`.

La jerarquía se apoya sobre todo en el escalón tonal chasis → pozo → cara → elevado, no en la sombra.

## Shapes

Esquinas contenidas: es una placa, no una pastilla.

- `0` reglas y marcas de escala · `3px` chips, señales, campos de índice · `5px` botones y campos · `8px` paneles · `12px` contenedores mayores · `999px` sólo puntos.
- **Regla de un pelo** (`StyleSheet.hairlineWidth`, 1 px en web) para toda separación. Los bordes de panel también son de un pelo.
- **La marca de índice** es el motivo recurrente: un rectángulo sólido de 3 px de ancho y 16–22 px de alto, en el color del tono. Señala la sección activa en la barra lateral, el veredicto en un chip, la banda activa en una leyenda y la sesión abierta en horarios. Es la firma de la casa.
- **Bandas de tolerancia:** todo indicador con umbrales conocidos (escala de decisión, VIX) se dibuja con sus bandas rellenas al alfa del tono, límites en línea discontinua de 1 px y marcas menores/mayores.

## Components

- **Panel** — el único contenedor. Cabecera opcional con `legend` + título, regla debajo, cuerpo. **Nunca se anida un panel dentro de otro.**
- **Button** — cuatro variantes (primary, secondary, ghost, danger), tres tallas, y siete estados reales: reposo, hover, pulsado, deshabilitado, cargando, con icono, a ancho completo. Altura efectiva mínima 44 pt.
- **Field** — pozo hundido. El foco engorda el trazo a 2 px **y** cambia el color: el foco no depende sólo del color. Estado `invalid` con borde `signal-down`.
- **Num** — cifra medida. Mono tabular, tono opcional, signo `+ / −` explícito cuando se pide, y `—` en `no-signal` cuando el dato falta.
- **Signal** — veredicto. Lavado + borde + icono direccional + palabra en versalita. Tres piezas de significado, no una.
- **DecisionScale** — el elemento firma. Escala 0–100 con las tres bandas, marcas cada 5, límites 40 y 60 en discontinua, índice que se asienta en 320 ms con `ease-out` cúbico, y un desplegable que explica la regla con la banda activa resaltada.
- **BandScale** — la misma gramática para cualquier indicador con umbrales (hoy, el VIX).
- **InstrumentChart** — serie interactiva en SVG. Cursor arrastrable (mismo `PanResponder` para dedo y ratón), lectura en cabecera, interrupción real del trazo donde `y === null`, selector de rango opcional.
- **QuoteRow / StatRow** — la fila medida: etiqueta a la izquierda, medida a la derecha, regla debajo. La unidad de lectura del analista.
- **Skeleton / SkeletonRows** — la placa se dibuja vacía y calibrada durante la carga. Nunca un spinner en mitad del contenido.
- **EmptyState** — enseña el instrumento; no dice "no hay nada".
- **Notice** — nombra el problema y la salida, en línea. Sustituye a `Alert.alert` y `window.alert` en errores que no interrumpen nada.

## Do's and Don'ts

**Do**

- Dibujar el umbral. Si el producto tiene una regla numérica, se ve.
- Reservar verde y rojo para la dirección financiera.
- Escribir toda cifra con la cara mono tabular.
- Dar a cada control sus siete estados antes de darlo por hecho.
- Resolver la responsividad cambiando la composición, no el tamaño de la letra.
- Tratar `N/A` como información.

**Don't**

- Anidar paneles, ni usar tarjetas iguales de icono + título + texto como estructura de página.
- Poner un borde de color de más de 1 px en el lateral de una tarjeta. La marca de índice es un elemento, no un borde.
- Usar emoji o glifos Unicode como iconos. La iconografía es Ionicons, de trazo consistente.
- Usar mono como disfraz de "técnico" en prosa.
- Sombras sin desplazamiento, degradados en el texto, o cristal como decoración.
- Elegir claro u oscuro por categoría: aquí se eligen los dos porque la escena de uso son los dos.
- Interrumpir con un diálogo del sistema algo que cabe en línea.

---

**Estado de la migración.** Las diez superficies con ruta —shell, login, Análisis, Resultados, Mercado, Screener, Favoritos, Portafolio, Historial, Overton e Info— están en cero literales de color y cero hallazgos del detector. Entre los componentes, `FCFFValuationCard` y el kit `components/ui/` también.

**No canonizado (deuda que el build aún arrastra, no reglas a heredar):** cinco componentes de gráfico y tarjeta conservan sus paletas fijas y no leen el tema: `FinancialStatements.jsx` (72 literales), `OvertonSignalMatrix.jsx` (48), `OvertonSignalMatrix_v4.jsx` (41), `FinancialRadarChart.tsx` (39), `IndicatorsChartCard.tsx` (30), `AIAssistant.tsx` (20) y `AIChatWidget.tsx` (5). Sus valores no forman parte de este sistema. `IndicatorsChartCard` merece además una decisión previa: su paleta es deliberadamente oscura (fondo de gráfico técnico), así que migrarla es decidir si ese widget sigue siendo oscuro en el tema claro o se adapta.

También hay código muerto que nadie importa y que conviene borrar antes de migrar nada: `app/screens/{InfoScreen,SearchScreen,HistoryScreen,OvertonScreen}.tsx`, los `.jsx.bak`, `ResultsScreen.tsx.backup` y los componentes `ChatFab`, `IchimokuChart`, `IchimokuCloudChart`, `VolumeDelta*` y `OvertonSignalMatrix_enhanced`.

**Rampas de datos.** `heatColor`, `heatCell`, `mix`, `luminance` e `inkOn` (en `theme/tokens.ts`) existen para el único caso en que el color ES la medida. Fuera de ese caso, los colores salen de los tokens y no se interpolan.

- **`heatColor`** — rampa fina, para el color aplicado a una cifra o a una barra: se interpola desde el pozo neutro, así que los valores pequeños quedan casi transparentes. Correcto cuando el color acompaña a un número que ya está escrito.
- **`heatCell`** — rampa del mosaico, para el color que rellena un área grande. Diluir hacia el fondo no vale aquí: una celda casi blanca se lee como «no hay dato», no como «se ha movido poco». El signo se lleva la saturación y la magnitud, la profundidad. Los dos temas llevan recorridos distintos y explícitos, porque en tema oscuro `up` y `down` son colores de acento pensados para escribirse sobre negro y de relleno caen en luminancia media, donde ninguna tinta llega a 4,5:1.
- **`inkOn`** — calcula el contraste WCAG contra la tinta clara y contra la oscura y devuelve la que más da. Antes usaba un umbral de luminancia de 0,42; el punto real de cruce está en 0,18, así que todo el rango intermedio recibía tinta clara cuando la oscura daba tres o cuatro veces más contraste. Corregirlo arregló de paso siete fondos del resto de la app, entre ellos las píldoras COMPRAR/MANTENER/VENDER en tema oscuro, que estaban en 2,7:1.

Los cuatro coeficientes de `heatCell` no son de gusto: salen de un barrido que maximiza el recorrido de color sujeto a dos restricciones — todas las celdas por encima de 4,5:1, y una sola tinta por tema (dos tintas dentro de un mismo sector se leen como dos escalas distintas). Verificado sobre 61 valores por tema y por signo.
