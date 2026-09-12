# Graph Report - analisis  (2026-09-12)

## Corpus Check
- Large corpus: 794 files · ~1,871,180 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2905 nodes · 6582 edges · 144 communities (118 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 84 edges (avg confidence: 0.85)
- Token cost: 210,787 input · 0 output

## Community Hubs (Navigation)
- API REST y Portafolio
- Pantallas de Mercado y Búsqueda
- Terminal de Estrategia
- Señal a Intención Simulada
- Motor de Simulación
- Métricas de Riesgo
- Motor NQE
- Cliente de Estrategia (tipos/API)
- Paneles de Simulación y Cartera
- Overton, Ichimoku y Beta
- Racionales del Servidor
- Estilo Valor/Crecimiento
- Pivotes de Woodie
- Historial y Radar Financiero
- Mapa de Calor Sectorial
- Ratios, Wyckoff y ADX
- Layout, Screener y Mercado
- Cuenta IB y Favoritos
- Cliente de Simulación
- MTF, Backtest y Caché
- Dependencias Externas
- Dependencias del Frontend
- Matriz Overton v4
- Auditoría de Método y Pruebas
- Endpoints del Robot Simulado
- Rutas Raíz y Chat IA
- Gráfico Ichimoku (Info)
- Liquidez y Amihud
- Overton Enhanced
- Estados Financieros y CAGR
- Motor de Backtest
- Hook useEstrategia
- Asistente IA (Backend)
- IA Local (Frontend)
- Pantalla de Resultados
- Tarjeta de Indicadores
- Estados, Gráficos y Benchmark
- Pruebas del Backend
- Patrones Elliott y Wolfe
- Mercado y Materias Primas
- Traducción con LLM Local
- Configuración de la App Expo
- Cálculo de Niveles NQE
- Scripts de Verificación
- Indicadores Base del NQE
- Detectores de Patrones
- Matriz Overton Enhanced
- Rentabilidad por Dividendo
- Límites de yfinance y CLV
- Horquilla Bid/Ask y Forward
- Autenticación y Pruebas en Navegador
- Gráficos del Robot
- Pivotes Clásicos y Camarilla
- Estado de Estrategia
- Compilación y Despliegue
- Borrado y Caché
- Cuenta Simulada (Backend)
- Dibujo de Velas y Escala
- Motor Fibonacci
- Pruebas de Fibonacci
- Script compilar.sh
- Matriz Overton (base)
- Alfa, Beta y Drawdown
- Anclaje de Fibonacci
- Cierre y Cotización Simulada
- Valoración DCF y Graham
- Script reiniciar
- Indicadores del Frontend
- Niveles de Pivote
- Barras y Estados de Orden
- Tarjeta de Valoración FCFF
- Pestaña Resumen
- WebSocket (preparado)
- Doctrina del Hueco Honesto
- Mapeo de Campos del API
- Gráfico de Nube Ichimoku
- MACD y RSI del Cliente
- Script reiniciar.ps1
- Cortafuegos de Caché y 429
- Proxy de Spread (Corwin-Schultz)
- Fixtures de Pruebas NQE
- Pestaña Weis
- Subindicadores de Estilo
- Orden frente a Posición
- Perfil de Volumen
- Rejilla de 12 Columnas
- Tarjeta de Estimaciones Forward
- Pestaña Velas
- Pestaña SMC
- Dependencias de Desarrollo
- Script reset-project
- Verificador de Claves de Estados
- Sortino y Desviación Bajista
- Sistema de Diseño (Instrumento)
- Hidratación y Puente de Tema
- Volume Delta (proxy)
- Pestaña Ichimoku
- Pestaña Wyckoff
- Gate de Wilson
- Scripts de npm
- Configuración de TypeScript
- Resumen de Resultados de Pruebas
- Paleta y Tinta del Tema
- Pestaña CLV
- API de Estrategia (extra)
- Stack del Backend
- Fixtures de Fibonacci
- Pruebas de Niveles Fib
- Enrutado por Ficheros
- Componente Asistente IA
- Panel del Robot
- Tabla de Volume Delta
- Configuración de Metro
- P&L Bruto
- Pruebas de Simulación (extra)
- Script deploy.sh
- Túnel y Safari iOS
- Índice de la App
- Configuración de ESLint
- Modo Desarrollo
- Jerarquía Datos→Señal
- Parámetros del NQE
- Pruebas de Fibonacci II
- Pruebas de Fibonacci III
- Pruebas de Fibonacci IV
- Pruebas de Fibonacci V
- Túnel Cloudflare
- Perfiles de Usuario
- Aviso de No Asesoramiento
- Endpoints Documentados
- Script rebuild.sh
- Script run.sh
- Script start.sh
- Buyback Yield
- Deuda Neta / FCF
- Intervalo Defensivo
- Regla del 40
- litellm
- Endpoint /patterns
- Scripts Rotos

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 229 edges
2. `react` - 98 edges
3. `react-native` - 79 edges
4. `toneColors()` - 76 edges
5. `cifra()` - 57 edges
6. `abrir()` - 55 edges
7. `cuenta()` - 54 edges
8. `get_overton_signal()` - 50 edges
9. `calcular()` - 49 edges
10. `calcular()` - 39 edges

## Surprising Connections (you probably didn't know these)
- `Corwin-Schultz (2012) — horquilla efectiva` --semantically_similar_to--> `_calc_bid_ask_spread_proxy — mide el rango diario`  [INFERRED] [semantically similar]
  agents.md → CLAUDE.md
- `El DCF es muy sensible a supuestos (GIGO)` --semantically_similar_to--> `Un campo declarado por un tercero no es un dato verificado`  [INFERRED] [semantically similar]
  VALUATION_GUIDE.md → CLAUDE.md
- `Números correctos que mentían` --semantically_similar_to--> `Una métrica de riesgo siempre devuelve un número plausible`  [INFERRED] [semantically similar]
  agents.md → CLAUDE.md
- `InstrumentChart — serie interactiva en SVG` --semantically_similar_to--> `GraficoMercado — lenguaje visual de referencia`  [INFERRED] [semantically similar]
  DESIGN.md → CLAUDE.md
- `Tasa de toque medida por nivel (sin look-ahead)` --semantically_similar_to--> `Una probabilidad sin denominador no es una probabilidad`  [INFERRED] [semantically similar]
  CLAUDE.md → AUDITORIA_OVERTON.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Las defensas contra el look-ahead del proyecto** — claude_es_causal, claude_ejecucion_apertura_siguiente, claude_stop_gana_al_objetivo, claude_tasa_de_toque, claude_pivotes_confirman_despues [INFERRED 0.85]
- **Doctrina del hueco honesto: un dato ausente se dibuja como ausente** — claude_hueco_honesto, product_na_es_informacion, design_no_signal, claude_calentamiento_null, agents_passed_none, claude_criterio_horquilla [INFERRED 0.85]
- **Lo que sustituye al libro de nivel II que yfinance no sirve** — claude_bloqueo_order_book, agents_no_footprint, agents_corwin_schultz, agents_amihud, agents_participacion_1pct, agents_clusters_ts, auditoria_overton_clv [EXTRACTED 1.00]

## Communities (144 total, 22 thin omitted)

### Community 0 - "API REST y Portafolio"
Cohesion: 0.04
Nodes (98): add_cash_movement(), add_portfolio_transaction(), add_to_watchlist(), AnalysisResponse, AnalystRecommendation, analyze_stock(), AnalyzeRequest, CashMovement (+90 more)

### Community 1 - "Pantallas de Mercado y Búsqueda"
Cohesion: 0.05
Nodes (87): styles, BandScale(), CommodityIndicator, CryptoIndicator, CurrencyPair, MarketData, MarketHours, MarketIndicator (+79 more)

### Community 2 - "Terminal de Estrategia"
Cohesion: 0.08
Nodes (62): CORTO, TONO_FASE, PanelIchimoku(), PanelVolatilidad(), PanelTecnicoAmpliado(), NOMBRE, ORDEN, SesgoMultiMarco() (+54 more)

### Community 3 - "Señal a Intención Simulada"
Cohesion: 0.05
Nodes (79): La fórmula estándar, la misma que ya usa `PlanPosicion.tsx` en pantalla.…, Decision, decision_desde_pivots(), dimensionar(), evaluar(), filtro_mtf(), filtro_nqe(), filtro_overton() (+71 more)

### Community 4 - "Motor de Simulación"
Cohesion: 0.07
Nodes (79): aplicar_barra(), cerrar_a_mano(), nivel_liquidacion(), Avanza el motor una barra. Es el corazón del simulador. **El orden importa y no…, Cierre pedido por el usuario, o por la estrategia al invertirse., El precio al que la pérdida latente se come el margen entero. Con…, abrir(), barra() (+71 more)

### Community 5 - "Métricas de Riesgo"
Cohesion: 0.05
Nodes (69): _desviacion_bajista(), _drawdowns(), _frente_al_indice(), captura(), _tasa_mensual(), _limpio(), metricas(), Any (+61 more)

### Community 6 - "Motor NQE"
Cohesion: 0.06
Nodes (62): calcular(), Parametros, Any, DataFrame, Ejecuta el NQE sobre `df` (OHLCV con índice temporal). Devuelve el estado de la…, Los mandos del indicador. Los del grupo «Avanzado» del Pine llevan su valor por…, Pruebas del motor NQE. La que importa de verdad es `test_sin_lookahead`:…, Truncar la serie no cambia las señales del tramo común. Es la misma prueba que… (+54 more)

### Community 7 - "Cliente de Estrategia (tipos/API)"
Cohesion: 0.05
Nodes (62): cliente, FASES_WYCKOFF, MARCO_A_INTERVALO, MarcoMTF, Operaciones, PuntoOHLCV, RespuestaOverton, CeldaCluster (+54 more)

### Community 8 - "Paneles de Simulación y Cartera"
Cohesion: 0.08
Nodes (55): FaseMercado(), FilaNivel(), BarraKPI(), KPI, kpisDe(), ClaveRango, CurvaRendimiento(), EstadisticasRendimiento() (+47 more)

### Community 9 - "Overton, Ichimoku y Beta"
Cohesion: 0.04
Nodes (58): _calc_beta(), _calc_bid_ask_spread_proxy(), _calc_coppock(), _calc_fgi_proxy(), _calc_forward_guidance_proxy(), _calc_gamma_exposure_proxy(), _calc_ichimoku_full(), _calc_market_impact_proxy() (+50 more)

### Community 10 - "Racionales del Servidor"
Cohesion: 0.06
Nodes (54): Estado del motor y configuración de la cuenta. Se crea si no existe., Escribe el estado. `version` se incrementa en cada escritura. La versión no…, Avanza el motor hasta ahora. Recorre BARRAS, no el precio del momento. Un…, Pone el identificador definitivo a las posiciones que abrió el motor solo. Un…, La foto completa de la cuenta. Las tarjetas se calculan AQUÍ, no en el `.tsx`:…, Avanza el motor y devuelve la cuenta entera. Es el único endpoint que hace…, Borra la cuenta simulada y empieza de cero. Cierra antes lo que esté abierto al…, Comisión, deslizamiento, apalancamiento y topes de riesgo. (+46 more)

### Community 11 - "Estilo Valor/Crecimiento"
Cohesion: 0.06
Nodes (55): clasificar(), _escala(), _f_balance(), _f_crecimiento(), _f_flujo(), _f_momento(), _f_rentabilidad(), _f_valoracion() (+47 more)

### Community 12 - "Pivotes de Woodie"
Cohesion: 0.06
Nodes (53): calcular(), niveles_tradicional(), Parametros, Mandos de la tarjeta., Pivote clásico. Se calcula para poder medir la confluencia con Woodie, que es…, `df` — velas del marco que se mira (5m, 15m, 1h, 4h, 1d o 1w). `base` — velas…, base(), df() (+45 more)

### Community 13 - "Historial y Radar Financiero"
Cohesion: 0.06
Nodes (50): beneishColor(), beneishLabel(), EnhancedHistoryItem, FILTERS, FilterType, findMetricValue(), fmtNum(), FundamentalsInfo (+42 more)

### Community 14 - "Mapa de Calor Sectorial"
Cohesion: 0.09
Nodes (43): aRgb(), CLARO, colorVariacion(), contraste(), DOMINIO, EXTREMO_PCT, luminancia(), OSCURO (+35 more)

### Community 15 - "Ratios, Wyckoff y ADX"
Cohesion: 0.05
Nodes (48): _adx(), _antiguedad_instantanea(), cagr_signed(), _calc_coppock2(), _calc_countdown(), _calc_poc(), _calc_rsi(), _calc_vama() (+40 more)

### Community 16 - "Layout, Screener y Mercado"
Cohesion: 0.06
Nodes (46): AuthGuard(), LoginScreen(), AppearanceControl(), styles, TabLayout(), TABS, WebSidebar(), WebTopBar() (+38 more)

### Community 17 - "Cuenta IB y Favoritos"
Cohesion: 0.06
Nodes (40): AccountWorkspace(), AlertInfo, BenchmarkComparison, CashMovement, chartRamp(), PortfolioEvolution, PortfolioHistoryPoint, PortfolioHolding (+32 more)

### Community 18 - "Cliente de Simulación"
Cohesion: 0.10
Nodes (43): API, auth(), cancelarOrden(), cerrarPosicion(), cliente, crearOrden(), evaluarRobot(), fijarRobot() (+35 more)

### Community 19 - "MTF, Backtest y Caché"
Cohesion: 0.07
Nodes (43): Parametros, Todo lo que cambia el resultado, en un sitio y con su valor a la vista. Los…, cache_get(), cache_put(), cotizacion_con_cap(), get_candle_analysis(), get_enhanced_history(), get_fibonacci() (+35 more)

### Community 20 - "Dependencias Externas"
Cohesion: 0.05
Nodes (41): main, name, packageManager, private, version, @babel/core, d3-scale-chromatic, eslint (+33 more)

### Community 21 - "Dependencias del Frontend"
Cohesion: 0.05
Nodes (41): dependencies, axios, d3-hierarchy, d3-scale, d3-scale-chromatic, expo, expo-blur, expo-constants (+33 more)

### Community 22 - "Matriz Overton v4"
Cohesion: 0.10
Nodes (26): FILAS, MTFPanel(), clamp(), CoppockChart(), detectCandlePatternLight(), detectCandlePatterns(), LiquidityHeatmap(), MicrostructureAdvancedPanel() (+18 more)

### Community 23 - "Auditoría de Método y Pruebas"
Cohesion: 0.06
Nodes (37): Condiciones descritas con «y» que son una secuencia en el tiempo, Una equivalencia se demuestra, no se afirma, Las estrellas se cambian por tasas de toque, Participación al 1 % del volumen medio, Una probabilidad sin denominador no es una probabilidad, El consenso multi-timeframe inyecta ruido a propósito, Cada condición viaja con su medida, Cartel de módulo suelto frente a triángulo de señal compuesta (+29 more)

### Community 24 - "Endpoints del Robot Simulado"
Cohesion: 0.10
Nodes (35): Identificador correlativo por año: `SIM-2026-0001`. `find_one_and_update` con…, Una vuelta del robot: lee las señales que YA EXISTEN, decide y, si procede,…, _sim_crear_orden_interno(), sim_robot_evaluar(), _sim_siguiente_id(), anotar_curva(), balance(), bloquean() (+27 more)

### Community 25 - "Rutas Raíz y Chat IA"
Cohesion: 0.08
Nodes (28): HistoryItem, OvertonScreen(), recColor(), s, PantallaEstrategia(), AIChatWidget(), Message, styles (+20 more)

### Community 26 - "Gráfico Ichimoku (Info)"
Cohesion: 0.08
Nodes (30): InfoScreen(), InterpretationItem(), styles, CloudZone, IchimokuChart(), IchimokuData, IchimokuPoint, PADDING (+22 more)

### Community 27 - "Liquidez y Amihud"
Cohesion: 0.10
Nodes (35): Amihud — iliquidez por millón negociado, _calc_liquidez_ejecucion(), _corwin_schultz_spread(), Horquilla efectiva estimada a partir de máximos y mínimos diarios. Estimador de…, Liquidez y capacidad de ejecución medidas sobre barras diarias. ESTO SUSTITUYE…, DataFrame, parametrize, Pruebas de las medidas de liquidez que sustituyen al libro de nivel II. Por qué… (+27 more)

### Community 28 - "Overton Enhanced"
Cohesion: 0.09
Nodes (35): _calc_beta(), _calc_bid_ask_spread_proxy(), _calc_coppock(), _calc_fgi_proxy(), _calc_forward_guidance_proxy(), _calc_gamma_exposure_proxy(), _calc_market_impact_proxy(), _calc_mean_reversion_zscore() (+27 more)

### Community 29 - "Estados Financieros y CAGR"
Cohesion: 0.11
Nodes (33): aniosConDato(rows, years) — columnas de ejercicio fantasma, _tramo_valido(serie) — extremos con dato, calcularCAGR — signo invertido, El único literal de color que queda es el degradado del PDF, aniosConDato(), AreaEspejada(), BarrasAgrupadas(), buildBalanceRows() (+25 more)

### Community 30 - "Motor de Backtest"
Cohesion: 0.08
Nodes (31): Umbrales absolutos declarados, no sectoriales inventados, Se mide la penúltima vela y la cuenta atrás habla de la actual, atr(), ejecutar(), cerrar(), ema(), _es_causal(), _metricas() (+23 more)

### Community 31 - "Hook useEstrategia"
Cohesion: 0.19
Nodes (34): aEventosValor(), aHorquilla(), aIchimoku(), aLibro(), aLiquidez(), aMercado(), aNoticias(), aPlan() (+26 more)

### Community 32 - "Asistente IA (Backend)"
Cohesion: 0.07
Nodes (27): AIAssistantRequest, AIAssistantResponse, AIInitRequest, AIInitResponse, chat_with_ai_assistant(), get_financial_system_prompt(), get_llm_model(), get_market_news() (+19 more)

### Community 33 - "IA Local (Frontend)"
Cohesion: 0.14
Nodes (5): AIResponse, AnalysisData, EnhancedLocalAI, FRAMEWORKS, localAI

### Community 34 - "Pantalla de Resultados"
Cohesion: 0.10
Nodes (30): AnalysisData, AnalystRecommendation, CamarillaPivot, CHART_RANGES, EstiloInversion, FibonacciLevel, FlagItem(), fmtCompact() (+22 more)

### Community 35 - "Tarjeta de Indicadores"
Cohesion: 0.13
Nodes (30): buildLine(), Candle, CandlePanel(), ChartData, ChartPalette, CoppockPanel(), buildFill(), DireccionPanel() (+22 more)

### Community 36 - "Estados, Gráficos y Benchmark"
Cohesion: 0.07
Nodes (27): BenchmarkComparison, check_watchlist_alerts(), compare_portfolio_to_benchmark(), debug_portfolio_raw(), get_cash_summary(), get_chart_technical_data(), get_financial_statements(), get_financial_statements_full() (+19 more)

### Community 37 - "Pruebas del Backend"
Cohesion: 0.13
Nodes (15): BackendTester, main(), Any, Validate market news response structure, Validate AI init response structure, Validate AI chat response structure, Validate Fibonacci support/resistance logic, Test GET /api/news/{ticker} (+7 more)

### Community 38 - "Patrones Elliott y Wolfe"
Cohesion: 0.10
Nodes (15): detectar_elliott, detectar_wolfe, Una tasa de detección del 100 % es un bug, ElliottTab(), num(), usd(), ElliottWavePanel(), GraficoOndas() (+7 more)

### Community 39 - "Mercado y Materias Primas"
Cohesion: 0.09
Nodes (29): cache_reserva(), ChartDataPoint, ChartDataResponse, CommodityIndicator, con_reserva(), construir_indices_bursatiles(), CryptoIndicator, CurrencyPair (+21 more)

### Community 40 - "Traducción con LLM Local"
Cohesion: 0.10
Nodes (22): LOCK_LLM — el modelo local no admite concurrencia, Presupuesto de 8 s para traducir en /overton, llama-cpp-python==0.3.16, _clave(), _limpiar_respuesta(), parece_ingles(), Any, ===============================================================================… (+14 more)

### Community 41 - "Configuración de la App Expo"
Cohesion: 0.08
Nodes (23): backgroundColor, foregroundImage, adaptiveIcon, edgeToEdgeEnabled, typedRoutes, expo, android, experiments (+15 more)

### Community 42 - "Cálculo de Niveles NQE"
Cohesion: 0.11
Nodes (20): _lista(), _nivel_fib(), _f(), Float serializable, o None. Un NaN en el JSON tumba la respuesta entera., Any, DataFrame, ndarray, VWAP que se reinicia al empezar cada periodo. Con `regla='D'` es el VWAP de… (+12 more)

### Community 43 - "Scripts de Verificación"
Cohesion: 0.10
Nodes (17): Buscar por texto no basta (el caso r_), Filtro de anotaciones de tipo en el analizador de ámbitos, enAnotacionDeTipo(), ficheros(), fs, GLOBALES, parser, path (+9 more)

### Community 44 - "Indicadores Base del NQE"
Cohesion: 0.15
Nodes (18): _atr(), _ema(), _percentil_movil(), _pivotes(), ndarray, ===============================================================================…, Media móvil de Wilder, la que usa `ta.atr` por dentro. Se siembra con la media…, `ta.ema` de Pine: recursión simple sembrada con el primer valor válido. (+10 more)

### Community 45 - "Detectores de Patrones"
Cohesion: 0.17
Nodes (17): _atr(), detectar_elliott(), detectar_wolfe(), _evaluar_elliott(), _evaluar_wolfe(), _fib(), Any, DataFrame (+9 more)

### Community 46 - "Matriz Overton Enhanced"
Cohesion: 0.15
Nodes (9): OvertonSignalMatrixEnhanced(), pct(), pill(), PriceLevel(), ScoreBreakdown(), sf(), T, usd() (+1 more)

### Community 47 - "Rentabilidad por Dividendo"
Cohesion: 0.16
Nodes (17): Rentabilidad por dividendo en PORCENTAJE, sin depender de la convención de…, _rentabilidad_dividendo(), parametrize, Pruebas de los campos que llegan declarados por el proveedor. El error que…, Un 0 se lee como «no reparte dividendo». Es una afirmación sobre la empresa, y…, Los números de VZ del 10 de septiembre de 2026, tal como los devuelve yfinance…, La prueba de que la división y el campo miden lo mismo. Se comprueban las dos…, Sin precio no hay división posible y hay que fiarse del campo. Entonces la… (+9 more)

### Community 48 - "Límites de yfinance y CLV"
Cohesion: 0.12
Nodes (17): lib/estrategia/clusters.ts — clusters de volumen por precio, Lo que yfinance sí y no da (medido), No fabricar el desdoble bid/ask, No se puede hacer un footprint con OHLCV, Volume Delta es el close location value, no flujo de órdenes, Detección real de Elliott y Wolfe con ZigZag sobre pivotes, Doce paneles con datos pseudoaleatorios, Las ondas de Elliott se construyen para cumplir Fibonacci (+9 more)

### Community 49 - "Horquilla Bid/Ask y Forward"
Cohesion: 0.12
Nodes (13): CommodityChartPoint, CommodityChartResponse, get_commodity_chart(), get_current_price(), get_forward_estimates(), tabla(), s(), _horquilla_declarada() (+5 more)

### Community 50 - "Autenticación y Pruebas en Navegador"
Cohesion: 0.12
Nodes (16): La cabecera de la app intercepta los clics, PyJWT / python-jose / passlib / bcrypt, La base se llama analisis_db, El minificador escapa los acentos: grepear sin acentos, Playwright con channel msedge, El dashboard no scrollea con window, Health check de los tres servicios, supervisord gestionando expo, backend y mongodb (+8 more)

### Community 51 - "Gráficos del Robot"
Cohesion: 0.16
Nodes (15): Mover una tarjeta que ya funciona es un cambio y hay que pedirlo, escalera() — UT Bot y SuperTrend son niveles, no curvas, GraficoMercado — lenguaje visual de referencia, showFib no es useFib: dibujar y filtrar son mandos distintos, InstrumentChart — serie interactiva en SVG, escala(), escalera(), FILTROS_DEL_PRESET (+7 more)

### Community 52 - "Pivotes Clásicos y Camarilla"
Cohesion: 0.14
Nodes (16): calculate_camarilla_pivots(), calculate_fibonacci_levels(), calculate_moving_averages(), CamarillaPivot, FibonacciLevel, get_camarilla_interpretation(), get_fibonacci_interpretation(), get_technical_analysis() (+8 more)

### Community 53 - "Estado de Estrategia"
Cohesion: 0.17
Nodes (15): esIntradia(), leerMTF(), leerOverton(), RespuestaMTF, Alerta, ControlesRobot, EstadoDashboard, Marco (+7 more)

### Community 54 - "Compilación y Despliegue"
Cohesion: 0.14
Nodes (15): Docker Desktop publica el puerto sólo por loopback, El bundle se compila dentro de la imagen Docker, compilar.bat / iniciar.bat, «No salen los cambios» — diagnóstico, CORS allow_origins=["*"] hay que restringirlo antes de exponerlo, El frontend llama a /api relativo: un solo origen, nginx.conf — sirve el estático y proxea /api, Labels de Traefik para reverse proxy con dominio (+7 more)

### Community 55 - "Borrado y Caché"
Cohesion: 0.14
Nodes (15): cache_invalidar(), delete_all_history(), delete_analysis(), delete_cash_movement(), delete_portfolio_transaction(), end_ai_session(), Tira las entradas que empiezan por `prefijo`. Los precios pueden caducar solos,…, Remove a stock from watchlist (+7 more)

### Community 56 - "Cuenta Simulada (Backend)"
Cohesion: 0.14
Nodes (13): limpiar_no_finitos(), Sólo el resumen, sin tocar Yahoo. Para la franja de KPIs., Posiciones cerradas, de la más reciente a la más antigua., Sustituye NaN e infinitos por `None`, recorriendo dicts y listas. JSON no…, sim_cuenta(), sim_historial(), Parametros, Todo lo que cambia el resultado, en un sitio y con su valor a la vista. Los… (+5 more)

### Community 57 - "Dibujo de Velas y Escala"
Cohesion: 0.16
Nodes (13): Las etiquetas se separan; la línea no se mueve nunca, ANCHO_MIN_VELA — las velas se ajustan al ancho, La escala la fijan las velas y los retrocesos, El pie va en orden cronológico, no por precio, Los ratios > 100 % no son objetivos al alza, escala(), MARCOS, MARGEN (+5 more)

### Community 58 - "Motor Fibonacci"
Cohesion: 0.14
Nodes (12): calcular(), Any, DataFrame, Calcula el impulso vigente y sus niveles de Fibonacci., El interruptor `Reverse` del script: 0 % y 100 % se intercambian., El tramo por pivotes no puede moverse al añadir velas futuras. Es la propiedad…, Caer al otro método en silencio deja leyendo una cosa por otra., Sesgo estructural del método original, y no es evidente. En modo lookback las… (+4 more)

### Community 59 - "Pruebas de Fibonacci"
Cohesion: 0.14
Nodes (13): Pruebas de los retrocesos de Fibonacci. Dos familias: 1. **Fidelidad.** En modo…, Los retrocesos van dentro del tramo; las extensiones, fuera., Si los dos modos dieran siempre lo mismo, el modo nuevo no aportaría., Extremo pegado al borde: el «impulso» es el tamaño de la ventana., En modo pivotes el precio SÍ puede rebasar el tramo, y se dice., test_avisa_cuando_el_impulso_esta_roto(), test_avisa_cuando_el_tramo_lo_define_la_ventana(), test_extras_solo_cuando_se_piden() (+5 more)

### Community 60 - "Script compilar.sh"
Cohesion: 0.25
Nodes (12): deps_ok(), compilar.sh script, die(), ok(), step(), warn(), deps_ok(), iniciar.sh script (+4 more)

### Community 61 - "Matriz Overton (base)"
Cohesion: 0.15
Nodes (6): ACTION, C, loadChartJs(), OVERTON_ZONES, OvertonSignalMatrix(), s

### Community 62 - "Alfa, Beta y Drawdown"
Cohesion: 0.17
Nodes (13): R², alfa de Jensen y ratio de información, Beta aritméticamente correcta y estadísticamente vacía, Capturas alcista y bajista (tasas mensuales geométricas), Coppock siempre bear por falta de barras, Máximo drawdown, caída actual y Ulcer Index, float(Series).iloc[-1] tumbaba market_regime en silencio, Números correctos que mentían, backend/riesgo.py — 17 métricas de riesgo de mercado (+5 more)

### Community 63 - "Anclaje de Fibonacci"
Cohesion: 0.17
Nodes (12): Bug del Pine: High != -1 donde debía ser Low, _ancla_lookback(), _ancla_pivotes(), _etiqueta(), ndarray, ===============================================================================…, `0.618`, `1.0`… sin ceros de más ni notación científica., Máximo y mínimo de las últimas `ventana` velas, cada uno por su lado. Es… (+4 more)

### Community 64 - "Cierre y Cotización Simulada"
Cohesion: 0.18
Nodes (13): cotizacion_rapida(), Crea una orden simulada. MARKET → se ejecuta contra el último precio y nace la…, Cierre manual, al último precio conocido., Mueve el stop o el objetivo de una posición abierta. Se revalida la coherencia…, Ultimo precio, cierre anterior y divisa de una accion. Llamada bloqueante: sale…, _sim_cerrar_interno(), sim_cerrar_posicion(), _sim_cerrojo() (+5 more)

### Community 65 - "Valoración DCF y Graham"
Cohesion: 0.15
Nodes (13): Un campo declarado por un tercero no es un dato verificado, _rentabilidad_dividendo() — el 569 % de VZ, Valoración Graham / DCF / EPV / Magic Formula, Investment Valuation — Aswath Damodaran, Valoración por DCF (Discounted Cash Flow), Fórmula revisada de Graham (1974) ajustada por bonos AAA, El DCF es muy sensible a supuestos (GIGO), Valoración por Benjamin Graham (+5 more)

### Community 66 - "Script reiniciar"
Cohesion: 0.38
Nodes (12): bold(), clear_cache(), dev_server(), docker_up(), kill_stale(), reiniciar.sh script, die(), ensure_deps() (+4 more)

### Community 67 - "Indicadores del Frontend"
Cohesion: 0.18
Nodes (12): La fila se implementa tres veces (deuda), contexts/SimboloContext.tsx — símbolo compartido, El calentamiento devuelve null, no cero, Estrategia — Fase 1 (pantalla de solo lectura), indicadores.ts — MACD y RSI de Wilder, Rejilla.tsx — rejilla de 12 columnas sin CSS Grid, Terminal.tsx — densidad de terminal, El prompt pedía Next.js + Tailwind; se tradujo al stack real (+4 more)

### Community 68 - "Niveles de Pivote"
Cohesion: 0.17
Nodes (12): niveles_pivote(), Woodie: PP y sus tres resistencias y soportes. `alto`, `bajo` y `cierre` son…, R1/S1, R2/S2 y R3/S3, contra la aritmética hecha a mano., S3 < S2 < S1 < PP < R1 < R2 < R3. Si se cruzan, la escala está rota., La fórmula de Woodie de verdad: (H + L + 2·APERTURA) / 4., La del texto: (H + L + 2·CIERRE) / 4. También se calcula, para comparar., Y coinciden EXACTAMENTE cuando no lo hay. Es la demostración de cuál es la…, test_las_dos_variantes_difieren_cuando_hay_hueco() (+4 more)

### Community 69 - "Barras y Estados de Orden"
Cohesion: 0.17
Nodes (8): Barra, evaluar_salida(), Orden, precio_de_ejecucion_limit(), Una vela OHLC con su marca temporal en epoch de segundos., La INTENCIÓN. Nace PENDING y muere en un estado terminal., ¿Esta barra ejecuta el LIMIT? Y si lo hace, ¿a qué precio? El detalle que casi…, ¿Esta barra cierra la posición? Devuelve `(motivo, precio)` o `None`. **La…

### Community 70 - "Tarjeta de Valoración FCFF"
Cohesion: 0.20
Nodes (9): AutoFilledMeta, FCFFInputs, FCFFResult, FCFFValuationCard(), FCFFValuationCardProps, makeStyles(), runFCFF(), SensCell (+1 more)

### Community 71 - "Pestaña Resumen"
Cohesion: 0.30
Nodes (7): BarraFactor(), corto(), num(), pct(), ResumenTab(), usd(), Ventana()

### Community 72 - "WebSocket (preparado)"
Cohesion: 0.24
Nodes (11): BACKEND_URL, EstadoConexion, Opciones, Suscripcion, TickMercado, urlSocket(), useLibroWS(), useMercadoWS() (+3 more)

### Community 73 - "Doctrina del Hueco Honesto"
Cohesion: 0.20
Nodes (11): Crecimiento sostenible y su guarda por ROE alto, _instantanea(df) — yfinance deja huecos por fila, Las métricas sin dato entran con passed=None y no cuentan, MarketRegimePanel inventa en silencio los datos que le faltan, Un hueco honesto vale más que un número inventado, Pestaña Market Regime Detector (pendiente), ut_pos vale 0 hasta el primer cruce, Escala tipográfica fija y cara mono tabular para medidas (+3 more)

### Community 74 - "Mapeo de Campos del API"
Cohesion: 0.18
Nodes (11): FCF Yield — la clave que estilo.py pedía y no existía, CuentaIB.tsx — portafolio estilo terminal de bróker, EconomicCalendar.tsx (Econdb), Endpoint /portfolio, lib/estrategia/api.ts — traductores de campos, /portfolio daba 401 al recargar (token en axios.defaults), Volatilidad, drawdown y tracking error por media ponderada, Un mapeo mal hecho da un hueco silencioso (+3 more)

### Community 75 - "Gráfico de Nube Ichimoku"
Cohesion: 0.20
Nodes (10): CloudZone, IchimokuCloudChart(), IchimokuData, IchimokuPoint, PADDING, Props, styles, { width: SCREEN_WIDTH } (+2 more)

### Community 76 - "MACD y RSI del Cliente"
Cohesion: 0.31
Nodes (10): Agrupacion, calcularIndicadores(), coppock(), ema(), IndicadoresSerie, macd, roc(), rsi() (+2 more)

### Community 77 - "Script reiniciar.ps1"
Cohesion: 0.35
Nodes (10): Clear-MetroCache(), Invoke-DockerUp(), Invoke-Typecheck(), Invoke-WebBuild(), Die(), Ensure-Deps(), Step(), Warn() (+2 more)

### Community 78 - "Cortafuegos de Caché y 429"
Cohesion: 0.20
Nodes (10): La barra de hoy llega vacía fuera de horario (NaN rompe el JSON), Caché por endpoint (/overton 5 min, /chart 10 min…), CADENCIA_REFRESCO_S = el TTL de la caché de /overton, Cortafuegos al primer 429, limpiar_no_finitos(), Reserva en frío etiquetada con su edad (_procedencia, _edad_s), response_model descarta los campos no declarados, Sanear antes de cachear (+2 more)

### Community 79 - "Proxy de Spread (Corwin-Schultz)"
Cohesion: 0.20
Nodes (10): Corwin-Schultz (2012) — horquilla efectiva, Añadir métricas mueve el denominador del veredicto, _calc_bid_ask_spread_proxy — mide el rango diario, Criterio de validez de la horquilla (1/10 del rango diario), Endpoint /overton, _horquilla_declarada(), _overton_zone: rama inalcanzable, Traducir DESPUÉS de calcular el impacto de la noticia (+2 more)

### Community 80 - "Fixtures de Pruebas NQE"
Cohesion: 0.20
Nodes (10): df(), DataFrame, fixture, Barras horarias con tendencia, ciclo y ruido. Se generan a mano y no con datos…, Subir el «Key Value» tiene que dar MENOS cruces. Si no, no hace nada., Menos barras de las necesarias: se dice, no se rellena con respaldos., serie(), test_historico_corto_es_error_explicito() (+2 more)

### Community 81 - "Pestaña Weis"
Cohesion: 0.33
Nodes (6): corto(), MARCOS, num(), pct(), usd(), WeisTab()

### Community 82 - "Subindicadores de Estilo"
Cohesion: 0.22
Nodes (9): backend/estilo.py — clasificador valor / crecimiento, El PEG cuenta dos veces dentro de valoración, Los pesos se renormalizan sobre el peso vivo, El ROIC alto puntúa bajo en el eje valor/crecimiento, Shareholder yield (con amortización NETA de deuda), test_estilo.py — monotonía y prueba por factor, La trampa de valor se publica aparte de la puntuación, Enfoque integrado: Graham filtra, ROIC/WACC valida calidad, DCF confirma (+1 more)

### Community 83 - "Orden frente a Posición"
Cohesion: 0.22
Nodes (9): Apalancamiento como multiplicador de nocional (1×), aplicar_precio() no dispara stops a propósito, Una barra anterior a la apertura cerraba la posición, Coste de préstamo del corto: supuesto declarado del 0,30 %, ORDEN y POSICIÓN son objetos distintos, P&L: pct_precio y pct_capital, ambos publicados, Colecciones sim_* separadas de db.portfolio, backend/simulacion.py — motor puro (+1 more)

### Community 84 - "Perfil de Volumen"
Cohesion: 0.31
Nodes (8): Contenido(), deltaAcumulado, estructuraMercado, NivelPerfil, perfilVolumen, Pivote, vwapConBandas(), VWAPSerie

### Community 85 - "Rejilla de 12 Columnas"
Cohesion: 0.25
Nodes (8): Col(), COLUMNAS, PropsCol, Rejilla(), Ruptura, rupturaDe(), Vano, vanoEn()

### Community 86 - "Tarjeta de Estimaciones Forward"
Cohesion: 0.42
Nodes (8): corto(), Estimaciones, ETIQUETA_PERIODO, FilaEstimacion, ForwardEstimatesCard(), n(), pct(), usd()

### Community 87 - "Pestaña Velas"
Cohesion: 0.25
Nodes (4): CandlesTab(), MARCOS, num(), usd()

### Community 88 - "Pestaña SMC"
Cohesion: 0.39
Nodes (5): EscalaNiveles(), num(), pct(), SMCTab(), usd()

### Community 89 - "Dependencias de Desarrollo"
Cohesion: 0.22
Nodes (9): devDependencies, @babel/core, eslint, eslint-config-expo, @types/d3-hierarchy, @types/d3-scale, @types/d3-scale-chromatic, @types/react (+1 more)

### Community 90 - "Script reset-project"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 91 - "Verificador de Claves de Estados"
Cohesion: 0.25
Nodes (8): aqui, clavesPedidas(), ESTADOS, FUENTE, src, total, VALORES, vistas

### Community 92 - "Sortino y Desviación Bajista"
Cohesion: 0.25
Nodes (8): La desviación bajista se divide entre el total de observaciones, Sortino y Calmar, test_riesgo.py (26 pruebas), Bloqueo mutuo en el gráfico de operaciones (ancho 0 / onLayout), Verificar con pruebas ejecutables, no con afirmaciones, test_riesgo.py escrito como contrapruebas, Protocolo de comunicación main_agent / testing_agent, stuck_count y seguimiento de tareas atascadas

### Community 93 - "Sistema de Diseño (Instrumento)"
Cohesion: 0.25
Nodes (8): nombreDeCategoria() — iconos en presentación, no en el backend, DecisionScale — el elemento firma, Dibujar el umbral: si hay una regla numérica, se ve, Estrella polar: el instrumento calibrado, La marca de índice — la firma de la casa, El veredicto se desarma hasta la métrica que lo produjo, Diez categorías de ratios (50+ métricas), Piotroski F-Score y Altman Z-Score

### Community 94 - "Hidratación y Puente de Tema"
Cohesion: 0.25
Nodes (8): El paso 1 va antes que el 5: no maquetar números inventados, Retipado de Overton a los tokens del tema, Cinta al pie en vez de barcolor, Error de hidratación #418, mapaDeTema() — puente de tema de Overton, El acento no es el semáforo, Paleta esmalte / grafito con acento petróleo, Paleta iOS original (#007AFF, #34C759, #FF9500, #FF3B30)

### Community 95 - "Volume Delta (proxy)"
Cohesion: 0.25
Nodes (7): La ponderación por volumen no significa nada (volúmenes anidados), Ponderación sobre volúmenes anidados, Código muerto: comprobar el import antes de borrar por lista, Props, styles, VolumeDeltaAnalysis(), VolumeDeltaRow

### Community 96 - "Pestaña Ichimoku"
Cohesion: 0.32
Nodes (4): IchimokuTab(), MARCOS, num(), usd()

### Community 97 - "Pestaña Wyckoff"
Cohesion: 0.36
Nodes (3): num(), usd(), WyckoffTab()

### Community 98 - "Gate de Wilson"
Cohesion: 0.29
Nodes (7): Cota inferior del intervalo de Wilson. Es lo que separa «6 de 8, 75 %» de una…, wilson(), La cota nunca puede quedar por encima de lo observado., Mismo 75 % con más muestra: la cota sube. Es todo el sentido del gate., test_wilson_muestra_vacia(), test_wilson_por_debajo_de_la_proporcion(), test_wilson_premia_la_muestra()

### Community 99 - "Scripts de npm"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 100 - "Configuración de TypeScript"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, strict, extends, include, expo/tsconfig.base

### Community 101 - "Resumen de Resultados de Pruebas"
Cohesion: 0.52
Nodes (6): log(), main(), print_test_summary(), Test the Fibonacci logic with actual data, Backend API Testing Results for Financial Analysis App All endpoints are…, test_fibonacci_logic()

### Community 103 - "Paleta y Tinta del Tema"
Cohesion: 0.33
Nodes (6): El color nunca es el único portador de significado, heatCell — rampa del mosaico con recorridos por tema, heatColor — rampa fina, inkOn — contraste WCAG y el umbral de luminancia de 0,18, Signal — veredicto con tres piezas de significado, Accesibilidad rojo-verde: el color necesita texto, forma o posición

### Community 104 - "Pestaña CLV"
Cohesion: 0.53
Nodes (5): CAPAS, CLVTab(), corto(), num(), ORDEN_MARCOS

### Community 105 - "API de Estrategia (extra)"
Cohesion: 0.40
Nodes (6): ladoGateNQE(), leerNQE(), lineaNQE(), moduloNQE(), serieNQE(), txt()

### Community 107 - "Stack del Backend"
Cohesion: 0.40
Nodes (5): fastapi==0.110.1 / starlette==0.37.2 / uvicorn, motor==3.3.1 / pymongo==4.5.0, yfinance==1.1.0, --sin-cache al cambiar dependencias, Stack: FastAPI + yfinance + MongoDB + Expo/React Native

### Community 108 - "Fixtures de Fibonacci"
Cohesion: 0.40
Nodes (5): df(), DataFrame, fixture, serie(), test_historico_corto_es_error_explicito()

### Community 109 - "Pruebas de Niveles Fib"
Cohesion: 0.50
Nodes (5): _fib_retracement_pine(), Fib_x(), Reimplementación LITERAL del «Fib Retracement» (Pine v4), modo lookback. Se…, Los siete niveles del script, uno a uno., test_lookback_reproduce_el_script()

### Community 110 - "Enrutado por Ficheros"
Cohesion: 0.40
Nodes (5): Expo Router: todo .tsx bajo app/ es una ruta, File-based routing de expo-router, GET /api/technical/{ticker} — Fibonacci, medias y pivotes Camarilla, Validación de la lógica soporte/resistencia de Fibonacci, ResultsScreen.tsx — sección de análisis técnico

### Community 111 - "Componente Asistente IA"
Cohesion: 0.40
Nodes (4): AIAssistant(), AIAssistantProps, Message, styles

### Community 112 - "Panel del Robot"
Cohesion: 0.70
Nodes (4): AgujaSenal(), arco(), BANDAS, polar()

### Community 113 - "Tabla de Volume Delta"
Cohesion: 0.40
Nodes (4): Props, styles, VolumeDeltaRow, VolumeDeltaTable()

### Community 114 - "Configuración de Metro"
Cohesion: 0.40
Nodes (4): config, { FileStore }, { getDefaultConfig }, path

### Community 115 - "P&L Bruto"
Cohesion: 0.50
Nodes (4): pnl_bruto(), Resultado antes de costes. Dos ramas explícitas y no un `signo = 1 if long else…, CONTRAPRUEBA del error más fácil de cometer: usar una sola fórmula con un…, test_el_signo_del_pnl_no_es_simetrico_por_accidente()

### Community 116 - "Pruebas de Simulación (extra)"
Cohesion: 0.50
Nodes (4): La consecuencia directa de separar orden y posición. Una orden cancelada nunca…, test_orden_cancelada_no_entra_en_el_win_rate(), test_win_rate(), _tres_ganadoras_dos_perdedoras()

### Community 117 - "Script deploy.sh"
Cohesion: 0.83
Nodes (3): err(), info(), deploy.sh script

### Community 118 - "Túnel y Safari iOS"
Cohesion: 0.50
Nodes (4): Tunnel de preview en emergentagent.com, Errores comunes de Expo Go y sus soluciones, Alternativa: abrir la versión web en Safari, URL del tunnel de Expo para Expo Go

### Community 121 - "Modo Desarrollo"
Cohesion: 0.67
Nodes (3): Proyecto Expo creado con create-expo-app, Modo dev con Metro en :8081 para iterar sobre la UI, frontend/node_modules a medias: borrarlo

## Ambiguous Edges - Review These
- `Qwen3-1.7B GGUF con carga perezosa` → `Endpoints /api/ai-assistant/init y /chat`  [AMBIGUOUS]
  test_result.md · relation: conceptually_related_to

## Knowledge Gaps
- **457 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+452 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1182 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Qwen3-1.7B GGUF con carga perezosa` and `Endpoints /api/ai-assistant/init y /chat`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `react` connect `Terminal de Estrategia` to `Pantallas de Mercado y Búsqueda`, `Paneles de Simulación y Cartera`, `Historial y Radar Financiero`, `Mapa de Calor Sectorial`, `Layout, Screener y Mercado`, `Cuenta IB y Favoritos`, `Cliente de Simulación`, `Dependencias Externas`, `Matriz Overton v4`, `Rutas Raíz y Chat IA`, `Gráfico Ichimoku (Info)`, `Estados Financieros y CAGR`, `Pantalla de Resultados`, `Tarjeta de Indicadores`, `Patrones Elliott y Wolfe`, `Matriz Overton Enhanced`, `Gráficos del Robot`, `Estado de Estrategia`, `Dibujo de Velas y Escala`, `Matriz Overton (base)`, `Tarjeta de Valoración FCFF`, `Pestaña Resumen`, `WebSocket (preparado)`, `Gráfico de Nube Ichimoku`, `Pestaña Weis`, `Rejilla de 12 Columnas`, `Tarjeta de Estimaciones Forward`, `Pestaña Velas`, `Pestaña SMC`, `Volume Delta (proxy)`, `Pestaña Ichimoku`, `Componente Asistente IA`, `Panel del Robot`, `Tabla de Volume Delta`?**
  _High betweenness centrality (0.340) - this node is a cross-community bridge._
- **Why does `detectar_wolfe` connect `Patrones Elliott y Wolfe` to `Detectores de Patrones`?**
  _High betweenness centrality (0.163) - this node is a cross-community bridge._
- **Why does `detectar_elliott` connect `Patrones Elliott y Wolfe` to `Detectores de Patrones`?**
  _High betweenness centrality (0.163) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _457 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API REST y Portafolio` be split into smaller, more focused modules?**
  _Cohesion score 0.03701707097933513 - nodes in this community are weakly interconnected._
- **Should `Pantallas de Mercado y Búsqueda` be split into smaller, more focused modules?**
  _Cohesion score 0.054164239953407106 - nodes in this community are weakly interconnected._