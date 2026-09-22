# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Dos perfiles reales, confirmados por el usuario:

- **Inversor particular con criterio.** Invierte su propio dinero. Entiende PER, ROIC, FCF y márgenes, pero no vive de esto. Consulta en móvil en sesiones cortas (¿compro o no?) y baja al detalle en escritorio.
- **Analista / profesional.** Usa la app como herramienta de trabajo, muchas horas seguidas, prioriza densidad de datos y velocidad de lectura sobre las explicaciones.

La interfaz debe servir densidad al experto sin dejar fuera al particular: el veredicto y la evidencia que lo sostiene tienen que convivir en la misma pantalla.

## Product Purpose

Analizar acciones cotizadas a partir de sus fundamentales y devolver una posición clara —COMPRAR / MANTENER / VENDER— acompañada del porcentaje de métricas favorables y un nivel de riesgo (Bajo / Moderado / Alto). El éxito es que el usuario entienda en segundos cuál es el veredicto y en minutos por qué, con la evidencia a la vista.

## Positioning

Más de 50 ratios en 10 categorías calculados sobre datos de Yahoo Finance sin API key ni coste, resumidos en una regla de decisión explícita y auditable:

```
Métricas favorables >= 60%  → COMPRAR   (Riesgo Bajo)
Métricas favorables 40–60%  → MANTENER  (Riesgo Moderado)
Métricas favorables < 40%   → VENDER    (Riesgo Alto)
```

El mecanismo diferencial no es el dato ni el veredicto por separado: es que el veredicto se puede desarmar hasta la métrica individual que lo produjo. Ningún producto vecino que devuelva una puntuación opaca puede copiar eso.

## Operating Context

- **Superficies (8):** Análisis, Mercado, Favoritos, Portafolio, Historial, Screener, Ventana de Overton, Info.
  «Mi Cuenta» dejó de existir en agosto de 2026 a petición del usuario: era un contenedor con un selector interno de Favoritos y Portafolio, que es lo que la gente venía a ver. Las dos lecturas subieron al primer nivel y comparten la misma pantalla (`components/AccountWorkspace`), parametrizada.
- **Dos escenas de uso reales:** escritorio con sidebar persistente y top bar (sesiones largas, lectura de tablas y gráficos) y móvil con tabs inferiores (consulta rápida, una mano).
- **Flujo principal:** buscar ticker o ISIN → autocompletado contra `/api/search` → `/api/analyze` → pantalla de resultados con recomendación, indicadores clave y categorías desplegables → queda registrado en Historial.
- **Estados que dominan la experiencia:** carga con latencia real (yfinance tarda), datos ausentes (`N/A` es un valor legítimo y frecuente en fundamentales), error de red, y estado vacío de primer uso.

## Capabilities and Constraints

- **Stack (existente, no es decisión abierta):** Expo 54 / React Native 0.81 / expo-router, TypeScript, un solo código para iOS, Android y web (react-native-web). Backend FastAPI + MongoDB.
- **Sin CSS.** Todo el estilo pasa por `StyleSheet` de React Native: no hay cascada, ni pseudo-clases, ni media queries. La responsividad es estructural (`useWindowDimensions`, `Platform.OS`), no fluida.
- **Gráficos:** `react-native-gifted-charts` y `react-native-svg`. Existen componentes propios de Ichimoku, radar financiero, volumen/delta y valoración FCFF.
- **Tema:** `ThemeContext` con modo claro/oscuro persistido; la persistencia hoy solo funciona en web (`localStorage`), en nativo se pierde. Deuda conocida.
- **Autenticación:** JWT propio (`/api/auth/*`), con rutas que aceptan usuario opcional.
- **Terminología del producto en español**, tickers y nombres de métricas en su forma estándar del sector (P/E, ROIC, FCF, Piotroski F-Score, Altman Z-Score).

## Brand Commitments

- **Nombre:** FinAnalysis (nombre visible de la app: «Análisis Financiero»). Se conserva.
- **Verde = alza / favorable, rojo = baja / desfavorable.** Código semántico financiero intocable.
- **Estructura de navegación:** el usuario la revisa; no se cambia sin que lo pida. Cambió una vez, en agosto de 2026, para partir «Mi Cuenta» en Favoritos y Portafolio.
- Fuera de esto, el usuario concedió libertad visual total: paleta, tipografía, iconografía y composición son decisión de diseño.

## Evidence on Hand

- Datos reales de Yahoo Finance vía `yfinance` en tiempo de ejecución: precios, estados financieros, más de 50 ratios calculados en `backend/server.py`.
- Endpoints reales disponibles: `/api/analyze`, `/api/search`, `/api/history`, `/api/history/enhanced`, `/api/history/stats`, `/api/chart/{ticker}`, `/api/volume/{ticker}`, `/api/financial-statements-full/{ticker}`, `/api/market-indicators`, `/api/auth/*`.
- **No existen** testimonios, clientes, precios, planes ni benchmarks. No deben inventarse en ninguna superficie.
- Assets de marca actuales: un cuadrado con las iniciales «FA» y el subtítulo «Financial Intelligence» en el sidebar. No es una identidad establecida; es un placeholder.

## Product Principles

1. **El veredicto primero, la evidencia debajo, siempre en la misma pantalla.** Nadie debería tener que navegar para saber por qué.
2. **`N/A` es información, no un fallo.** Un dato ausente se muestra como ausente, nunca como cero ni oculto.
3. **La densidad es una función, no un problema.** El experto necesita ver muchas métricas a la vez; comprimir no es simplificar.
4. **Una recomendación es una lectura, no un consejo.** El lenguaje del producto describe lo que dicen los números, no promete resultados.
5. **La misma verdad en móvil y en escritorio.** Cambia la composición, nunca el contenido ni el veredicto.

## Accessibility & Inclusion

- El verde/rojo del código financiero no puede ser el único portador de significado: cada estado necesita además texto, forma o posición (aprox. 8% de los hombres tiene deficiencia en la percepción rojo-verde, y este producto es literalmente rojo contra verde).
- Objetivos táctiles mínimos de 44pt en nativo; contraste de texto ≥4.5:1 sobre fondos de datos densos.
