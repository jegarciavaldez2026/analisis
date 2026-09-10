/**
 * ============================================================================
 * Estrategia — capa de servicio contra FastAPI
 * ============================================================================
 * Todo lo que el terminal puede leer de verdad se lee de aquí. Cada función
 * apunta a un endpoint que YA EXISTE en `backend/server.py` y devuelve un
 * `Bloque<T>` con su procedencia puesta, para que el panel no tenga que
 * adivinar si lo que le llega es una medida o un relleno.
 *
 * La URL base sale del entorno (`EXPO_PUBLIC_BACKEND_URL`), igual que en el
 * resto del producto. Cadena vacía significa mismo origen: en producción
 * nginx proxea `/api`, así que la ruta relativa es la correcta.
 */

import axios, { AxiosError } from 'axios';

import {
  AnalisisTecnico,
  Backtest,
  Bloque,
  Comparativa,
  DatosMercado,
  EstadisticasOperaciones,
  ControlesFib,
  ControlesPivote,
  EventoValor,
  FactorSenal,
  Fibonacci,
  FilaAnalisis,
  FilaVolumeDelta,
  Ichimoku,
  LadoGateNQE,
  LibroOrdenes,
  Liquidez,
  MarcoNQE,
  ModuloNQE,
  ControlesNQE,
  MarcaNQE,
  MarcaUTBot,
  MarcoFib,
  ModoFib,
  CondicionPivote,
  MarcoPivote,
  NivelClave,
  NivelFib,
  NivelPivote,
  Pivotes,
  Noticia,
  NQE,
  PresetNQE,
  SenalNQE,
  SerieNQE,
  UltimaSenalPivote,
  VarianteWoodie,
  Tono,
  OrdenEjecutada,
  PosicionAbierta,
  ResumenPanel,
  SenalRobot,
  SerieMercado,
  TecnicoAmpliado,
  Vela,
  Volatilidad,
  Wyckoff,
} from './tipos';
import { fuerzaSenal, tonoDePalabra } from './formato';

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';
export const API = `${BACKEND_URL}/api`;

const cliente = axios.create({ baseURL: API, timeout: 30000 });

/** Mensaje de error legible. Un `[object Object]` en pantalla es un bug. */
function mensajeError(e: unknown): string {
  const err = e as AxiosError<{ detail?: string }>;
  if (err?.response?.data?.detail) return String(err.response.data.detail);
  if (err?.response?.status === 404) return 'El backend no tiene datos para este valor.';
  if (err?.code === 'ECONNABORTED') return 'El backend tardó demasiado en responder.';
  if (err?.message) return err.message;
  return 'Error desconocido al consultar el backend.';
}

/** Bloque con dato real. */
function real<T>(datos: T, actualizado?: string | null): Bloque<T> {
  return { datos, procedencia: 'real', actualizado: actualizado ?? new Date().toISOString() };
}

/** Bloque sin fuente: el hueco y su motivo. */
export function sinFuente<T>(nota: string): Bloque<T> {
  return { datos: null, procedencia: 'sin-fuente', nota };
}

/** Bloque derivado de un proxy, con el proxy nombrado. */
export function proxy<T>(datos: T, nota: string): Bloque<T> {
  return { datos, procedencia: 'proxy', nota, actualizado: new Date().toISOString() };
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * El Coppock no se ha podido calcular.
 *
 * Necesita ROC de 60 semanas suavizado con WMA de 40, o sea unas 105 barras
 * semanales — dos años largos. Cuando el valor no tiene ese histórico el
 * backend manda `coppock: null` y `coppock_signal: 'sin_datos'`, y aquí se
 * dibuja el hueco. Antes mandaba cero y «bear», así que un indicador no
 * calculado se leía como momento bajista, en todos los valores a la vez.
 */
function coppockSinDatos(o: RespuestaOverton): boolean {
  return coppock30(o).valor === null;
}

/**
 * El Coppock que pinta Estrategia: el ajuste de 30 semanas.
 *
 * Es una elección explícita del producto para esta pantalla —reacciona antes
 * que el clásico de 60 semanas, que para una cadencia de 45 minutos llega
 * tarde— y por eso viaja con sus periodos escritos al lado. NO es el que
 * alimenta el score: ese sigue siendo el largo, para que la puntuación de un
 * valor sea la misma en Estrategia y en Overton.
 *
 * Si el corto no está (menos de ~50 semanas de histórico) se cae al largo
 * antes que dejar el hueco: los dos son Coppock, y el rótulo dice cuál se está
 * viendo en cada caso.
 */
function coppock30(o: RespuestaOverton): {
  valor: number | null;
  senal: string;
  periodos: string;
} {
  const corto = num(o.coppock_30s);
  if (corto !== null && String(o.coppock_30s_signal ?? '') !== 'sin_datos') {
    return {
      valor: corto,
      senal: String(o.coppock_30s_signal ?? ''),
      periodos: String(o.coppock_30s_periodos ?? 'ROC 30 y 24 semanas, WMA 20'),
    };
  }
  return {
    valor: num(o.coppock),
    senal: String(o.coppock_signal ?? ''),
    periodos: String(o.coppock_periodos ?? ''),
  };
}

/* ==========================================================================
 * /overton/{ticker} — la lectura central
 *
 * Este endpoint ya calcula el score multi-factor, el veredicto, el técnico,
 * Ichimoku, el régimen, la volatilidad y los niveles de entrada/stop/objetivo.
 * El dashboard NO recalcula nada de eso: sería una segunda verdad.
 * ======================================================================== */

export interface RespuestaOverton {
  [clave: string]: any;
}

export async function leerOverton(ticker: string): Promise<RespuestaOverton> {
  const { data } = await cliente.get(`/overton/${encodeURIComponent(ticker)}`);
  return data;
}

/* -------------------------------------------------------------------------
 * Traductores: de la respuesta del backend a los tipos del terminal.
 * Viven aquí y no en los componentes para que un cambio de contrato en el
 * backend se arregle en un sitio.
 * ----------------------------------------------------------------------- */

export function aMercado(o: RespuestaOverton): Bloque<DatosMercado> {
  const precio = num(o.current_price);
  if (precio === null) return sinFuente('El backend no devolvió precio para este valor.');
  const pct = num(o.pct_change) ?? 0;
  // El backend da la variación en %, no el absoluto: se deriva.
  const previo = pct !== -100 ? precio / (1 + pct / 100) : null;
  return real<DatosMercado>({
    simbolo: String(o.ticker ?? ''),
    nombre: String(o.company_name ?? o.ticker ?? ''),
    mercado: String(o.exchange ?? ''),
    sector: String(o.sector ?? ''),
    industria: String(o.industry ?? ''),
    precio,
    cambio: previo !== null ? precio - previo : 0,
    cambioPct: pct,
    // Yahoo no sirve OHLC de sesión en este endpoint: se dibuja el hueco.
    apertura: null,
    maximo: null,
    minimo: null,
    cierreAnterior: previo,
    volumen: num(o.volume),
    volumenMedio: num(o.avg_volume),
    min52: num(o.week52_low),
    max52: num(o.week52_high),
    capitalizacion: num(o.market_cap),
  });
}

/**
 * Libro de órdenes.
 *
 * yfinance NO sirve profundidad de mercado. Ni diez niveles, ni uno. El único
 * dato de horquilla disponible viaja en `info` de Yahoo (`bid`/`ask`), llega
 * con ~15 minutos de retraso y fuera de horario es cero. Y el campo que el
 * backend llama hoy `bid_ask_spread` es en realidad el rango diario
 * (High−Low)/Close — están separados por dos órdenes de magnitud, así que NO
 * se usa aquí como si fuera una horquilla.
 *
 * Por eso esto devuelve siempre «sin fuente»: es la respuesta honesta hasta
 * que haya un proveedor con libro (Polygon/Massive, Databento, IEX o el
 * propio bróker).
 */
export function aLibro(_o: RespuestaOverton): Bloque<LibroOrdenes> {
  return sinFuente(
    'yfinance no sirve profundidad de mercado. El libro de nivel II, el order flow y el ' +
      'delta de agresores necesitan un proveedor con libro (Massive/Polygon, Databento, IEX) ' +
      'o la cotización del bróker.',
  );
}

/**
 * Liquidez y ejecución — lo que el robot mira EN LUGAR del libro.
 *
 * El cambio de fondo no es cosmético. El libro contesta «cuánto papel hay
 * ahora mismo a este precio»; esto contesta «cuánto se negocia normalmente y
 * cuánto movería el precio mi tamaño». Para un robot que decide cada 45
 * minutos, la foto del libro habría caducado varias veces antes de usarse,
 * mientras que el volumen medio y el impacto por dólar son estables y son lo
 * que de verdad limita la posición.
 *
 * Nada de esto se inventa: la horquilla sale del estimador de Corwin-Schultz
 * sobre máximos y mínimos diarios, y el impacto del ratio de Amihud. Los dos
 * son métodos publicados, y el backend declara cuál usa.
 */
export function aLiquidez(o: RespuestaOverton): Bloque<Liquidez> {
  const l = o.liquidez;
  if (!l || typeof l !== 'object' || l.disponible !== true) {
    return sinFuente(
      String(l?.motivo ?? 'El backend no devolvió medidas de liquidez para este valor.'),
    );
  }
  const clase = String(l.clasificacion ?? 'media');
  return proxy<Liquidez>(
    {
      spreadEstimadoPct: num(l.spread_estimado_pct),
      spreadDescartadoPct: num(l.spread_descartado_pct),
      spreadMotivo: l.spread_motivo ? String(l.spread_motivo) : null,
      spreadMetodo: String(l.spread_metodo ?? ''),
      amihudPctPorMillon: num(l.amihud_pct_por_millon),
      advAcciones: num(l.adv_acciones),
      advDolares: num(l.adv_dolares),
      volumenRelativo: num(l.volumen_relativo),
      maxAcciones1pct: num(l.max_acciones_1pct_adv),
      maxDolares1pct: num(l.max_dolares_1pct_adv),
      clasificacion: (clase === 'alta' || clase === 'baja' ? clase : 'media') as Liquidez['clasificacion'],
      nota: String(l.nota ?? ''),
      ventanaSesiones: num(l.ventana_sesiones),
      rangoDiarioPct: num(o.rango_diario_pct ?? o.bid_ask_spread),
    },
    'Estimado sobre barras diarias, no medido en el libro. La horquilla usa Corwin-Schultz ' +
      '(máximos y mínimos) y el impacto usa Amihud (retorno por dólar negociado). Sirven para ' +
      'dimensionar la posición, no para cronometrar una entrada al segundo.',
  );
}

export function aSenal(o: RespuestaOverton): Bloque<SenalRobot> {
  const score100 = num(o.score_100);
  if (score100 === null) return sinFuente('El backend no devolvió score para este valor.');

  const vwap = o.vwap ?? {};
  const mtfSesgo = String(o.market_regime ?? '');

  const factores: FactorSenal[] = [
    {
      etiqueta: 'Tendencia (precio vs WMA-30)',
      valor: String(o.price_vs_wma ?? '').toUpperCase() || '—',
      tono: tonoDePalabra(String(o.price_vs_wma)),
    },
    {
      etiqueta: 'Momento (Coppock 30s)',
      // `sin_datos` es un hueco, no una lectura: se dibuja como tal. Antes,
      // cuando el indicador no se podía calcular, el backend mandaba «bear»
      // con valor cero — una señal bajista inventada, en todos los tickers.
      valor: coppockSinDatos(o) ? '—' : coppock30(o).senal.toUpperCase() || '—',
      tono: coppockSinDatos(o) ? 'neutral' : tonoDePalabra(coppock30(o).senal),
      sinFuente: coppockSinDatos(o) ? 'Necesita ~1 año de histórico semanal' : undefined,
    },
    {
      etiqueta: 'Estructura (régimen)',
      valor: mtfSesgo.toUpperCase() || '—',
      tono: tonoDePalabra(mtfSesgo),
    },
    {
      etiqueta: 'Precio vs VWAP',
      valor: String(vwap.price_vs_vwap ?? '').toUpperCase() || '—',
      tono: tonoDePalabra(String(vwap.price_vs_vwap)),
    },
    {
      etiqueta: 'Ichimoku',
      valor: String(o.ichimoku?.sesgo ?? o.ichimoku?.bias ?? '').toUpperCase() || '—',
      tono: tonoDePalabra(String(o.ichimoku?.sesgo ?? o.ichimoku?.bias)),
    },
    {
      etiqueta: 'Noticias',
      valor: String(o.news_sentiment ?? '').toUpperCase() || '—',
      tono: tonoDePalabra(String(o.news_sentiment)),
    },
  ];

  /**
   * Los dos factores que antes decían «Sin libro de nivel II» y «Sin datos de
   * tick» se han sustituido por dos que sí se miden con esta fuente.
   *
   * No es un maquillaje del hueco: son otras dos preguntas, y son las que un
   * robot con cadencia de 45 minutos puede contestar. «¿Hay papel ahora mismo
   * a este precio?» no se puede; «¿este valor absorbe mi tamaño y cuánto me
   * cuesta cruzar?» sí, y es lo que decide si la operación se puede llevar.
   */
  const liq = o.liquidez;
  if (liq?.disponible === true) {
    const spread = num(liq.spread_estimado_pct);
    const clase = String(liq.clasificacion ?? 'media');
    factores.push({
      etiqueta: 'Horquilla (cota máx.)',
      valor: spread === null ? '—' : `≤ ${spread.toFixed(3)} %`,
      // La horquilla no es direccional: no dice si subir o bajar, dice si la
      // operación es viable. Por eso el tono es de aviso, nunca alza/baja.
      tono: spread === null ? 'neutral' : spread > 0.5 ? 'caution' : 'accent',
    });
    factores.push({
      etiqueta: 'Liquidez (volumen medio)',
      valor: clase.toUpperCase(),
      tono: clase === 'alta' ? 'accent' : clase === 'baja' ? 'caution' : 'neutral',
    });
  } else {
    factores.push({
      etiqueta: 'Horquilla (cota máx.)',
      valor: '—',
      tono: 'neutral' as const,
      sinFuente: 'Sin histórico para estimarla',
    });
    factores.push({
      etiqueta: 'Liquidez (volumen medio)',
      valor: '—',
      tono: 'neutral' as const,
      sinFuente: 'Sin histórico para medirla',
    });
  }

  return real<SenalRobot>({
    accion: (o.overton_action ?? 'hold') as SenalRobot['accion'],
    accionEs: String(o.accion ?? 'MANTENER'),
    score100,
    scoreBruto: num(o.score) ?? 0,
    scoreMax: num(o.score_max) ?? 165,
    fuerza: fuerzaSenal(score100),
    sesgo: String(o.bias ?? ''),
    factores,
    proximaDecisionEn: null,
    proximaDecisionHora: null,
  });
}

export function aTecnico(o: RespuestaOverton): Bloque<AnalisisTecnico> {
  const vwap = o.vwap ?? {};
  const filas: FilaAnalisis[] = [
    {
      etiqueta: 'Precio vs VWAP',
      valor: num(vwap.distance_pct),
      unidad: ' %',
      senal: String(vwap.price_vs_vwap ?? '').toUpperCase(),
      tono: tonoDePalabra(String(vwap.price_vs_vwap)),
    },
    {
      etiqueta: 'Precio vs WMA-30',
      valor: num(o.wma30),
      senal: String(o.price_vs_wma ?? '').toUpperCase(),
      tono: tonoDePalabra(String(o.price_vs_wma)),
    },
    {
      etiqueta: 'Precio vs WMA-20',
      valor: num(o.wma20),
      tono: 'neutral',
    },
    {
      etiqueta: 'RSI 14',
      valor: num(o.rsi),
      senal:
        num(o.rsi) === null ? '' : (num(o.rsi) as number) > 60 ? 'ALCISTA' : (num(o.rsi) as number) < 40 ? 'BAJISTA' : 'NEUTRAL',
      tono:
        num(o.rsi) === null ? 'neutral' : (num(o.rsi) as number) > 60 ? 'up' : (num(o.rsi) as number) < 40 ? 'down' : 'caution',
    },
    {
      // El rótulo lleva los periodos: es la diferencia entre «el Coppock» y
      // «este Coppock», y sin ella dos pantallas con ajustes distintos parecen
      // contradecirse.
      etiqueta: 'Coppock 30s',
      valor: coppock30(o).valor,
      senal: coppockSinDatos(o) ? '' : coppock30(o).senal.toUpperCase(),
      tono: coppockSinDatos(o) ? 'neutral' : tonoDePalabra(coppock30(o).senal),
      sinFuente: coppockSinDatos(o) ? 'Necesita ~1 año de histórico semanal' : undefined,
    },
    {
      etiqueta: 'ADX',
      valor: num(o.adx),
      senal: num(o.adx) === null ? '' : (num(o.adx) as number) > 25 ? 'CON TENDENCIA' : 'SIN TENDENCIA',
      tono: num(o.adx) === null ? 'neutral' : (num(o.adx) as number) > 25 ? 'accent' : 'caution',
    },
    {
      etiqueta: 'Z-score reversión',
      valor: num(o.zscore_mean_rev),
      tono: 'neutral',
    },
    {
      etiqueta: 'POC (52 semanas)',
      valor: num(o.poc_price),
      tono: 'neutral',
    },
    {
      etiqueta: 'Momentum 12-1',
      valor: num(o.momentum_12_1),
      unidad: ' %',
      tono: (num(o.momentum_12_1) ?? 0) >= 0 ? 'up' : 'down',
    },
  ];

  const score = num(o.score_100);
  return real<AnalisisTecnico>({
    filas,
    score,
    senal: String(o.accion ?? ''),
    tono: tonoDePalabra(String(o.accion)),
  });
}

/**
 * Ichimoku.
 *
 * Claves reales de `_calc_ichimoku_full(...)["current"]`, comprobadas en el
 * backend: `signal`, `price_vs_cloud`, `score`, `tenkan`, `kijun`, `senkou_a`,
 * `senkou_b`, `chikou_free`, `chikou_status`, `cloud_color`, `tk_cross`.
 *
 * La versión anterior inventaba `kumo`, `chikou` y `sesgo` —nombres que no
 * existen— y el panel salía con media tabla en guiones. Un mapeo equivocado no
 * lanza ningún error: deja huecos que parecen «no hay dato».
 */
export function aIchimoku(o: RespuestaOverton): Bloque<Ichimoku> {
  const ich = o.ichimoku;
  if (!ich || typeof ich !== 'object') {
    return sinFuente('El backend no devolvió lectura de Ichimoku para este valor.');
  }

  const nube = String(ich.cloud_color ?? '');
  const filas: FilaAnalisis[] = [
    {
      etiqueta: 'Cruce Tenkan / Kijun',
      valor: String(ich.tk_cross ?? '—'),
      tono: tonoDePalabra(String(ich.tk_cross)),
    },
    {
      etiqueta: 'Precio vs nube',
      valor: String(ich.price_vs_cloud ?? '—'),
      tono: tonoDePalabra(String(ich.price_vs_cloud)),
    },
    {
      etiqueta: 'Color de la nube',
      valor: nube ? (nube === 'bull' ? 'ALCISTA' : nube === 'bear' ? 'BAJISTA' : nube) : '—',
      tono: nube === 'bull' ? 'up' : nube === 'bear' ? 'down' : 'neutral',
    },
    {
      etiqueta: 'Chikou Span',
      valor: String(ich.chikou_status ?? '—'),
      // `chikou_free` es booleano: libre = por encima del precio de hace 26.
      tono: ich.chikou_free === true ? 'up' : ich.chikou_free === false ? 'down' : 'neutral',
    },
    { etiqueta: 'Tenkan-sen', valor: num(ich.tenkan), tono: 'neutral' },
    { etiqueta: 'Kijun-sen', valor: num(ich.kijun), tono: 'neutral' },
    { etiqueta: 'Senkou A', valor: num(ich.senkou_a), tono: 'neutral' },
    { etiqueta: 'Senkou B', valor: num(ich.senkou_b), tono: 'neutral' },
  ];

  return real<Ichimoku>({
    score: num(ich.score),
    filas,
    sesgo: String(ich.signal ?? '—'),
    tono: tonoDePalabra(String(ich.signal)),
  });
}

/**
 * Fase de mercado — ciclo de Wyckoff.
 *
 * El dato ya viaja en `/overton` (`wyckoff`), calculado sobre la serie OHLCV
 * real: posición en el rango, pendiente anual, ADX, pendiente del volumen y
 * compresión del rango. No hay que pedir nada más.
 *
 * Se conserva el orden del ciclo —acumulación, alcista, distribución,
 * bajista— y NO se ordena por probabilidad: el ciclo es una secuencia, y verlo
 * en su orden natural es lo que permite leer «estamos saliendo de acumulación»
 * en vez de sólo «gana acumulación».
 */
const FASES_WYCKOFF: { clave: string; nombre: string }[] = [
  { clave: 'acumulacion', nombre: 'Acumulación' },
  { clave: 'alcista', nombre: 'Tendencia alcista' },
  { clave: 'distribucion', nombre: 'Distribución' },
  { clave: 'bajista', nombre: 'Tendencia bajista' },
];

export function aWyckoff(o: RespuestaOverton): Bloque<Wyckoff> {
  const w = o.wyckoff;
  if (!w || typeof w !== 'object' || w.disponible !== true) {
    return sinFuente(
      'El backend no pudo clasificar la fase: faltan barras o indicadores para este valor.',
    );
  }

  const probs = w.probabilidades ?? {};
  const probabilidades = FASES_WYCKOFF.map((f) => ({
    clave: f.clave,
    nombre: f.nombre,
    pct: num(probs[f.clave]) ?? 0,
  }));

  const r = w.rasgos ?? {};
  const rasgos = [
    { etiqueta: 'Posición en el rango', valor: num(r.posicion_en_rango), unidad: ' %' },
    { etiqueta: 'Tendencia reciente', valor: num(r.tendencia_anual), unidad: ' % anual' },
    { etiqueta: 'Tendencia previa', valor: num(r.tendencia_previa), unidad: ' % anual' },
    { etiqueta: 'ADX', valor: num(r.adx) },
    { etiqueta: 'Pendiente del volumen', valor: num(r.pendiente_volumen), unidad: ' %' },
    { etiqueta: 'Compresión del rango', valor: num(r.compresion_rango), unidad: ' %' },
  ];

  return real<Wyckoff>({
    fase: String(w.phase ?? '—'),
    etapa: String(w.stage ?? ''),
    descripcion: String(w.descripcion ?? ''),
    estrategia: Array.isArray(w.estrategia) ? w.estrategia.map(String) : [],
    sesiones: num(r.sesiones),
    suelo60: num(r.suelo_60),
    techo60: num(r.techo_60),
    tendenciaPrevia: num(r.tendencia_previa),
    confianza: num(w.confidence),
    transicion: Boolean(w.transicion),
    probabilidades,
    rasgos,
  });
}

export function aVolatilidad(o: RespuestaOverton): Bloque<Volatilidad> {
  const atrPct = num(o.atr_pct);
  const bb = num(o.bb_width);
  const ivRank = num(o.iv_rank);
  const filas: FilaAnalisis[] = [
    {
      etiqueta: 'Ancho de Bollinger',
      valor: bb,
      unidad: ' %',
      senal: bb === null ? '' : bb > 5 ? 'ALTA' : bb < 2 ? 'BAJA' : 'MEDIA',
      tono: bb === null ? 'neutral' : bb > 5 ? 'caution' : 'neutral',
    },
    {
      etiqueta: 'ATR',
      valor: atrPct,
      unidad: ' %',
      senal: atrPct === null ? '' : atrPct > 4 ? 'ALTA' : atrPct < 1.5 ? 'BAJA' : 'MEDIA',
      tono: atrPct === null ? 'neutral' : atrPct > 4 ? 'caution' : 'neutral',
    },
    {
      etiqueta: 'IV Rank',
      valor: ivRank,
      unidad: ' / 100',
      tono: 'neutral',
      sinFuente:
        ivRank === null ? 'Requiere cadena de opciones; yfinance no la sirve de forma fiable' : undefined,
    },
    {
      etiqueta: 'VIX',
      valor: num(o.vix),
      tono: (num(o.vix) ?? 0) > 25 ? 'caution' : 'neutral',
    },
    {
      etiqueta: 'Beta',
      valor: num(o.beta),
      tono: 'neutral',
    },
    {
      etiqueta: 'Superficie de volatilidad',
      valor: null,
      tono: 'neutral',
      sinFuente: 'Necesita cadena de opciones completa',
    },
  ];
  return real<Volatilidad>({
    filas,
    score: null,
    regimen: String(o.market_regime ?? 'SIN DATOS'),
    tono: tonoDePalabra(String(o.market_regime)),
  });
}

/**
 * Posición sugerida a partir de los niveles reales del backend.
 *
 * Ojo con la lectura: NO es una posición abierta —no hay bróker conectado—,
 * es el plan que sale de `/overton` (entrada óptima, stop por ATR y objetivo).
 * El panel lo rotula como plan, no como cartera.
 */
export function aPlan(o: RespuestaOverton): Bloque<PosicionAbierta> {
  const entrada = num(o.entry_optimal);
  const actual = num(o.current_price);
  const stop = num(o.stop_loss);
  const objetivo = num(o.target1);
  if (entrada === null || actual === null || stop === null || objetivo === null) {
    return sinFuente('Faltan niveles de entrada, stop u objetivo en la respuesta del backend.');
  }
  const rr = num(o.rr1);
  return proxy<PosicionAbierta>(
    {
      simbolo: String(o.ticker ?? ''),
      lado: 'long',
      acciones: 0,
      entrada,
      actual,
      pnl: 0,
      pnlPct: 0,
      stopLoss: stop,
      takeProfit: objetivo,
      riesgoBeneficio: rr ?? 0,
      abiertaDesde: '',
    },
    'Plan calculado por /overton (entrada óptima, stop por ATR·2,2 y objetivo 1). No hay ' +
      'posición abierta: el producto no tiene bróker conectado.',
  );
}

/**
 * Noticias del valor.
 *
 * Las claves son las que el backend construye de verdad en `/overton`:
 * `headline`, `description`, `impact`, `source`, `published`. La primera
 * versión de esto leía `title` / `publisher` / `published_date` —los nombres
 * de OTRO endpoint, `/news/{ticker}`— y el panel salía con las filas en
 * blanco. Cuando un mapeo no casa, el síntoma es un hueco silencioso, no un
 * error: por eso conviene mirar la respuesta real antes de escribirlo.
 */
export function aNoticias(o: RespuestaOverton): Bloque<Noticia[]> {
  const brutas = Array.isArray(o.news) ? o.news : [];

  // El backend rellena con un elemento centinela cuando no encuentra nada.
  // Enseñarlo como si fuera una noticia sería peor que decir que no hay.
  const reales = brutas.filter(
    (n: any) => n && String(n.source ?? '') !== 'N/A' && String(n.headline ?? '').trim() !== '',
  );
  if (!reales.length) return sinFuente('El proveedor no devolvió noticias para este valor.');

  const items: Noticia[] = reales.slice(0, 8).map((n: any) => ({
    titular: String(n.headline ?? ''),
    medio: String(n.source ?? ''),
    cuando: String(n.published ?? ''),
    impacto: num(n.impact),
    resumen: n.description ? String(n.description) : undefined,
    traducido: Boolean(n.traducido),
    idiomaOriginal: n.idioma_original ?? null,
  }));
  return real(items);
}

/**
 * Eventos del propio valor: resultados, ex-dividendo y pago.
 *
 * El backend sólo devuelve eventos futuros con fecha CONFIRMADA por el
 * proveedor, así que lo normal es que la lista venga corta o vacía. Eso no es
 * un fallo: un calendario con fechas estimadas induce a operar contra un reloj
 * que no existe.
 *
 * Ojo con lo que NO trae: ni país ni nivel de impacto. La versión anterior de
 * esta función los inventaba (`pais: 'US'`, `impacto: 'medio'`) y además hacía
 * pasar estos eventos por el calendario macro, que es otra cosa y tiene su
 * propia fuente.
 */
export function aEventosValor(o: RespuestaOverton): Bloque<EventoValor[]> {
  const brutos = Array.isArray(o.proximos_eventos) ? o.proximos_eventos : [];
  if (!brutos.length) {
    return sinFuente(
      'El proveedor no confirma ningún evento futuro para este valor (resultados, ' +
        'ex-dividendo o pago). No se muestran fechas estimadas.',
    );
  }
  const eventos: EventoValor[] = brutos.map((e: any) => ({
    evento: String(e.evento ?? ''),
    fecha: String(e.fecha ?? ''),
    dias: num(e.dias),
    detalle: String(e.detalle ?? ''),
  }));
  return real(eventos);
}

/* ==========================================================================
 * /technical/{ticker} — niveles clave e indicadores
 * ======================================================================== */

/**
 * Análisis técnico ampliado: indicadores clave y niveles de precio.
 *
 * Une `/technical` (Fibonacci, Camarilla, medias) con lo que ya trae
 * `/overton` (VWAP, POC, RSI, Coppock, Ichimoku). Nada se inventa: si un dato
 * no viene, la fila sale con su hueco.
 *
 * Lo que SÍ hace este traductor y la maqueta no hacía: **comprobar la
 * coherencia**. Un nivel etiquetado «resistencia» que queda por debajo del
 * precio ya se rompió; un swing alto por debajo de sus propios retrocesos es
 * imposible. Esas contradicciones se detectan y se enseñan en pantalla en vez
 * de dibujarse como si nada.
 */
export async function leerTecnicoAmpliado(
  ticker: string,
  overton: RespuestaOverton | null,
): Promise<Bloque<TecnicoAmpliado>> {
  try {
    const { data } = await cliente.get(`/technical/${encodeURIComponent(ticker)}`);
    const precio = num(data?.current_price) ?? num(overton?.current_price);
    if (precio === null) return sinFuente('El backend no devolvió precio actual.');

    const avisos: string[] = [];
    const niveles: NivelClave[] = [];

    const distancia = (p: number) => ((p - precio) / precio) * 100;

    // ── Fibonacci ──
    for (const f of Array.isArray(data?.fibonacci_levels) ? data.fibonacci_levels : []) {
      const p = num(f.price);
      if (p === null) continue;
      // `is_support` lo calcula el backend con la posición real del precio.
      // No se recalcula ni se deduce del nombre: ésa era la fuente del error.
      niveles.push({
        etiqueta: `Fib ${f.level}`,
        precio: p,
        esSoporte: Boolean(f.is_support),
        distanciaPct: num(f.distance_percent) ?? distancia(p),
        familia: 'fibonacci',
      });
    }

    // ── Camarilla ──
    for (const c of Array.isArray(data?.camarilla_pivots) ? data.camarilla_pivots : []) {
      const p = num(c.price);
      if (p === null) continue;
      const esSoporte = p < precio;
      const nombre = String(c.level ?? '');
      // Un nivel «R» por debajo del precio ya está roto. Se dice.
      if (nombre.startsWith('R') && esSoporte) {
        avisos.push(`${nombre} (${p.toFixed(2)}) está por debajo del precio: ya no es resistencia.`);
      }
      if (nombre.startsWith('S') && !esSoporte) {
        avisos.push(`${nombre} (${p.toFixed(2)}) está por encima del precio: ya no es soporte.`);
      }
      niveles.push({
        etiqueta: nombre,
        precio: p,
        esSoporte,
        distanciaPct: distancia(p),
        familia: 'camarilla',
      });
    }

    // ── Medias ──
    const medias = Array.isArray(data?.moving_averages) ? data.moving_averages : [];
    for (const m of medias) {
      const p = num(m.value);
      if (p === null || p === 0) continue;
      niveles.push({
        etiqueta: `MA ${m.period}`,
        precio: p,
        esSoporte: p < precio,
        distanciaPct: num(m.distance_percent) ?? distancia(p),
        familia: 'media',
      });
    }

    // ── Coherencia del swing ──
    const swingAlto = num(data?.swing_high);
    const swingBajo = num(data?.swing_low);
    if (swingAlto !== null && swingBajo !== null && swingAlto <= swingBajo) {
      avisos.push(
        `El swing alto (${swingAlto.toFixed(2)}) no supera al bajo (${swingBajo.toFixed(2)}): ` +
          'los retrocesos calculados sobre ese rango no son fiables.',
      );
    }
    const fibs = niveles.filter((n) => n.familia === 'fibonacci');
    if (swingAlto !== null && fibs.length && swingAlto < Math.max(...fibs.map((f) => f.precio))) {
      avisos.push(
        `El swing alto (${swingAlto.toFixed(2)}) queda por debajo de alguno de sus propios ` +
          'retrocesos de Fibonacci, lo cual es imposible.',
      );
    }

    // ── Indicadores clave ──
    const vwap = overton?.vwap ?? {};
    const rsiVal = num(overton?.rsi);
    // Mismo Coppock que el resto de Estrategia: el ajuste de 30 semanas. Que
    // dos placas de la misma pantalla enseñen ajustes distintos con el mismo
    // nombre es exactamente el fallo que hizo falta depurar.
    const c30 = overton ? coppock30(overton) : { valor: null, senal: '', periodos: '' };
    const copp = c30.valor;
    const indicadores: FilaAnalisis[] = [
      {
        etiqueta: 'Precio vs VWAP',
        valor: num(vwap.distance_pct),
        unidad: ' %',
        senal: String(vwap.price_vs_vwap ?? '').toUpperCase(),
        tono: tonoDePalabra(String(vwap.price_vs_vwap)),
      },
      {
        etiqueta: 'Precio vs POC',
        valor: num(overton?.poc_price),
        senal:
          num(overton?.poc_price) === null
            ? ''
            : precio > (num(overton?.poc_price) as number)
              ? 'POR ENCIMA'
              : 'POR DEBAJO',
        tono:
          num(overton?.poc_price) === null
            ? 'neutral'
            : precio > (num(overton?.poc_price) as number)
              ? 'up'
              : 'down',
      },
      {
        etiqueta: 'RSI 14',
        valor: rsiVal,
        senal: rsiVal === null ? '' : rsiVal > 60 ? 'ALCISTA' : rsiVal < 40 ? 'BAJISTA' : 'NEUTRAL',
        tono: rsiVal === null ? 'neutral' : rsiVal > 60 ? 'up' : rsiVal < 40 ? 'down' : 'caution',
      },
      {
        etiqueta: 'Signo de Coppock 30s',
        valor: copp,
        senal: copp === null ? '' : copp >= 0 ? 'POSITIVO' : 'NEGATIVO',
        tono: copp === null ? 'neutral' : copp >= 0 ? 'up' : 'down',
      },
      {
        etiqueta: 'Coppock vs su media',
        valor: copp === null ? '—' : c30.senal || '—',
        tono: copp === null ? 'neutral' : tonoDePalabra(c30.senal),
        sinFuente: copp === null ? 'Necesita ~1 año de histórico semanal' : undefined,
      },
      {
        etiqueta: 'Ichimoku',
        valor: num(overton?.ichimoku?.score),
        unidad: ' / 10',
        senal: String(overton?.ichimoku?.signal ?? '').toUpperCase(),
        tono: tonoDePalabra(String(overton?.ichimoku?.signal)),
      },
      {
        etiqueta: 'Medias móviles',
        valor: String(data?.ma_summary ?? '—'),
        senal: String(data?.ma_trend_signal ?? '').toUpperCase(),
        tono: tonoDePalabra(String(data?.ma_trend_signal)),
      },
      {
        etiqueta: 'ADX',
        valor: num(overton?.adx),
        senal:
          num(overton?.adx) === null
            ? ''
            : (num(overton?.adx) as number) > 25
              ? 'CON TENDENCIA'
              : 'SIN TENDENCIA',
        tono: (num(overton?.adx) ?? 0) > 25 ? 'accent' : 'caution',
      },
      {
        etiqueta: 'Precio vs VAMA',
        valor: null,
        tono: 'neutral',
        sinFuente: 'La VAMA sólo viaja en /indicators-chart, no en /technical',
      },
    ];

    return real<TecnicoAmpliado>({
      score: num(data?.technical_score),
      recomendacion: String(data?.technical_recommendation ?? '—'),
      tono: tonoDePalabra(String(data?.technical_recommendation)),
      tendencia: String(data?.trend_direction ?? '—'),
      swingAlto,
      swingBajo,
      zonaFibonacci: String(data?.current_fibonacci_zone ?? '—'),
      interpretacion: String(data?.fibonacci_interpretation ?? ''),
      cruceDorado: Boolean(data?.golden_cross),
      cruceMuerte: Boolean(data?.death_cross),
      resumenMedias: String(data?.ma_summary ?? ''),
      indicadores,
      // Ordenados por cercanía al precio: los que importan primero.
      niveles: niveles
        .filter((n) => Number.isFinite(n.precio))
        .sort((a, b) => Math.abs(a.distanciaPct ?? 0) - Math.abs(b.distanciaPct ?? 0)),
      avisos,
    });
  } catch (e) {
    return { datos: null, procedencia: 'sin-fuente', nota: mensajeError(e) };
  }
}

/* ==========================================================================
 * /mtf/{ticker} — consenso multi-marco, ya real en el backend
 * ======================================================================== */

export interface MarcoMTF {
  tf: string;
  disponible: boolean;
  motivo?: string;
  tendencia?: string;
  rsi?: number | null;
  rsi_senal?: string;
  macd?: string;
  adx?: number | null;
  adx_senal?: string;
  volumen?: string;
  barras?: number;
  actualizado?: string;
}

export interface RespuestaMTF {
  ticker: string;
  frames: MarcoMTF[];
  marcos_con_datos: number;
  marcos_totales: number;
  consenso: string;
  detalle_consenso: string;
}

export async function leerMTF(ticker: string): Promise<RespuestaMTF> {
  const { data } = await cliente.get(`/mtf/${encodeURIComponent(ticker)}`);
  return data;
}

/**
 * Volume delta multi-marco.
 *
 * Es un PROXY, y se dice: la posición del cierre en el rango (CLV) no es el
 * delta de agresores. La distinción ya está tomada en el producto y aquí se
 * respeta en el rótulo, no sólo en un comentario.
 */
export function aVolumeDelta(mtf: RespuestaMTF): Bloque<FilaVolumeDelta[]> {
  const filas: FilaVolumeDelta[] = mtf.frames.map((f) => {
    if (!f.disponible) {
      return {
        tf: f.tf,
        volumen: null,
        compraPct: null,
        ventaPct: null,
        deltaPct: null,
        senal: f.motivo ?? 'Sin datos',
        tono: 'neutral',
      };
    }
    const alcista = f.tendencia === 'alcista';
    const rsi = f.rsi ?? null;
    // El reparto compra/venta se estima con el RSI del marco, que es lo único
    // direccional y real que sirve /mtf. No es agresión: es sesgo del marco.
    const compra = rsi === null ? null : Math.round(rsi);
    const venta = compra === null ? null : 100 - compra;
    return {
      tf: f.tf,
      volumen: null,
      compraPct: compra,
      ventaPct: venta,
      deltaPct: compra === null ? null : compra - 50,
      senal: alcista ? 'Sesgo comprador' : f.tendencia === 'bajista' ? 'Sesgo vendedor' : 'Neutral',
      tono: alcista ? 'up' : f.tendencia === 'bajista' ? 'down' : 'caution',
    };
  });
  return proxy(
    filas,
    'Proxy: sesgo por marco calculado con RSI y media de 20 en /mtf. NO es delta de ' +
      'agresores — eso necesita datos de tick que yfinance no sirve.',
  );
}

/* ==========================================================================
 * /indicators-chart/{ticker} — velas reales para el gráfico
 * ======================================================================== */

interface PuntoOHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Serie de velas.
 *
 * El endpoint sólo devuelve barras DIARIAS, y sólo acepta estos periodos:
 * `3m`, `6m`, `30wk`, `60wk`, `1y`, `2y`. Pedirle «104wk» —como hacía la
 * primera versión para el marco semanal— cae en el valor por defecto sin avisar.
 *
 * La agregación a semana o mes se hace en el cliente, por calendario. No es un
 * apaño: reagrupar OHLCV es una operación exacta, y hacerla aquí permite que
 * el marco cambie al instante sin otra ida y vuelta al backend.
 */
export async function leerSerie(
  ticker: string,
  periodo: string = '1y',
): Promise<Bloque<SerieMercado>> {
  try {
    const { data } = await cliente.get(`/indicators-chart/${encodeURIComponent(ticker)}`, {
      params: { period: periodo },
    });
    const brutas: PuntoOHLCV[] = Array.isArray(data?.candles) ? data.candles : [];
    if (!brutas.length) return sinFuente('El backend no devolvió velas para este valor.');
    const velas: Vela[] = brutas
      .map((c) => ({
        t: new Date(c.date).getTime(),
        o: Number(c.open),
        h: Number(c.high),
        l: Number(c.low),
        c: Number(c.close),
        v: Number(c.volume),
      }))
      .filter((v) => Number.isFinite(v.t) && Number.isFinite(v.c));
    return real<SerieMercado>({ simbolo: ticker, marco: '1D', velas });
  } catch (e) {
    return { datos: null, procedencia: 'sin-fuente', nota: mensajeError(e) };
  }
}

/* ==========================================================================
 * /intradia/{ticker} — velas intradía reales
 * ======================================================================== */

/** Marcos que sirve el endpoint intradía, con su clave para el backend. */
const MARCO_A_INTERVALO: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1H': '1h',
  '4H': '4h',
};

/** `true` si el marco se sirve intradía en vez de reagrupar el diario. */
export function esIntradia(marco: string): boolean {
  return marco in MARCO_A_INTERVALO;
}

/**
 * Velas intradía.
 *
 * El gráfico tenía estos marcos apagados por una suposición equivocada
 * —«yfinance no sirve histórico a esta resolución»— que resultó falsa al
 * medirla: 5m da 4.680 barras de sesenta días. Lo que faltaba era el endpoint.
 *
 * Sigue sin haber footprint, y eso no cambia: el proveedor devuelve OHLCV por
 * barra y nada más. Se puede dibujar la vela y un delta por barra declarado
 * como proxy; no la escalera bid×ask dentro de la vela.
 */
export async function leerSerieIntradia(
  ticker: string,
  marco: string,
): Promise<Bloque<SerieMercado>> {
  const intervalo = MARCO_A_INTERVALO[marco];
  if (!intervalo) return sinFuente(`El marco ${marco} no se sirve intradía.`);
  try {
    const { data } = await cliente.get(`/intradia/${encodeURIComponent(ticker)}`, {
      params: { interval: intervalo },
    });
    const brutas: any[] = Array.isArray(data?.candles) ? data.candles : [];
    if (!brutas.length) return sinFuente(`El proveedor no devolvió velas de ${marco}.`);

    const velas: Vela[] = brutas
      .map((c) => ({
        t: new Date(c.date).getTime(),
        o: Number(c.open),
        h: Number(c.high),
        l: Number(c.low),
        c: Number(c.close),
        v: Number(c.volume),
      }))
      .filter((v) => Number.isFinite(v.t) && Number.isFinite(v.c));

    if (!velas.length) return sinFuente('Las velas intradía llegaron incompletas.');
    return real<SerieMercado>({ simbolo: ticker, marco: marco as SerieMercado['marco'], velas });
  } catch (e) {
    return { datos: null, procedencia: 'sin-fuente', nota: mensajeError(e) };
  }
}

/* ==========================================================================
 * /chart/{ticker} — el valor contra el S&P 500, en base 100
 * ======================================================================== */

/**
 * Comparativa contra el índice.
 *
 * El endpoint ya devuelve las dos series normalizadas a 100 al inicio del
 * periodo, que es la forma correcta de compararlas: un valor de 40 $ y un
 * índice de 5.000 puntos no se pueden poner en el mismo eje sin normalizar.
 *
 * Lo que se deriva aquí y NO viene del backend: alfa (la diferencia de
 * rendimiento), beta y correlación. Se calculan sobre las mismas dos series,
 * así que no hace falta otra petición — y con el proveedor limitando por IP,
 * cada petición que se evita cuenta.
 */
export async function leerComparativa(
  ticker: string,
  periodo = '1y',
): Promise<Bloque<Comparativa>> {
  try {
    const { data } = await cliente.get(`/chart/${encodeURIComponent(ticker)}`, {
      params: { period: periodo },
    });
    const puntos: any[] = Array.isArray(data?.chart_data) ? data.chart_data : [];
    if (puntos.length < 3) {
      return sinFuente('El backend no devolvió serie comparada para este valor.');
    }

    const serie = puntos
      .map((p) => ({
        t: new Date(p.date).getTime(),
        valor: num(p.stock_value),
        indice: num(p.sp500_value),
      }))
      .filter((p) => Number.isFinite(p.t) && p.valor !== null && p.indice !== null) as {
      t: number;
      valor: number;
      indice: number;
    }[];

    if (serie.length < 3) return sinFuente('La serie comparada llegó incompleta.');

    const ultimo = serie[serie.length - 1];
    const retornoValor = ultimo.valor - 100;
    const retornoIndice = ultimo.indice - 100;

    // Retornos periodo a periodo, para beta y correlación.
    const rv: number[] = [];
    const ri: number[] = [];
    for (let i = 1; i < serie.length; i += 1) {
      const a = serie[i - 1];
      const b = serie[i];
      if (a.valor > 0 && a.indice > 0) {
        rv.push((b.valor - a.valor) / a.valor);
        ri.push((b.indice - a.indice) / a.indice);
      }
    }

    let beta: number | null = null;
    let correlacion: number | null = null;
    if (rv.length >= 3) {
      const mediaV = rv.reduce((s, x) => s + x, 0) / rv.length;
      const mediaI = ri.reduce((s, x) => s + x, 0) / ri.length;
      let cov = 0;
      let varI = 0;
      let varV = 0;
      for (let i = 0; i < rv.length; i += 1) {
        cov += (rv[i] - mediaV) * (ri[i] - mediaI);
        varI += (ri[i] - mediaI) ** 2;
        varV += (rv[i] - mediaV) ** 2;
      }
      // Beta = covarianza / varianza del mercado. Con varianza cero no hay
      // beta que calcular: se devuelve el hueco, no un cero que parecería
      // «no correlacionado con el mercado».
      beta = varI > 0 ? cov / varI : null;
      correlacion = varI > 0 && varV > 0 ? cov / Math.sqrt(varI * varV) : null;
    }

    // R²: cuánto del movimiento del valor explica el índice. Por debajo de
    // 0,10 la beta deja de sostener una lectura —es el cociente de dos
    // volatilidades con el signo de una correlación que es ruido— y se marca
    // como no fiable en vez de enseñarla como si fuera una propiedad del valor.
    const r2 = correlacion !== null ? correlacion * correlacion : null;
    const betaFiable = beta !== null && r2 !== null && r2 >= 0.1;

    return real<Comparativa>({
      simbolo: String(data?.ticker ?? ticker),
      periodo: String(data?.period ?? periodo),
      serie,
      retornoValor,
      retornoIndice,
      alfa: retornoValor - retornoIndice,
      beta,
      correlacion,
      r2,
      betaFiable,
      precioActual: num(data?.current_price),
    });
  } catch (e) {
    return { datos: null, procedencia: 'sin-fuente', nota: mensajeError(e) };
  }
}

/* ==========================================================================
 * /portfolio — balance real del usuario (requiere sesión)
 * ======================================================================== */

const SIN_SESION =
  'Inicia sesión para ver tu cartera: el balance, la curva de patrimonio y las ' +
  'transacciones son datos de tu cuenta, no del mercado.';

/**
 * Balance de la cartera.
 *
 * Claves reales del modelo `PortfolioSummary` del backend, comprobadas:
 * `total_portfolio_value` (posiciones + caja), `cash_available`,
 * `total_invested`, `current_value`, `total_profit_loss`,
 * `total_profit_loss_percent`, `realized_gains`, `unrealized_gains`, y las
 * métricas en `metrics` (`sharpe_ratio`, `max_drawdown`, …).
 *
 * La versión anterior leía `total_value` / `cash` / `total_gain_loss`, que no
 * existen: el balance salía en blanco y la franja de KPIs entera con él.
 */
export async function leerCartera(token: string | null): Promise<Bloque<ResumenPanel>> {
  if (!token) return sinFuente(SIN_SESION);
  try {
    const { data } = await cliente.get('/portfolio', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const m = data?.metrics ?? {};
    return real<ResumenPanel>({
      balance: num(data?.total_portfolio_value),
      disponible: num(data?.cash_available ?? data?.cash_balance),
      patrimonio: num(data?.total_portfolio_value),
      invertido: num(data?.total_invested),
      valorPosiciones: num(data?.current_value),
      gananciaNeta: num(data?.total_profit_loss),
      retornoPct: num(data?.total_profit_loss_percent),
      realizadas: num(data?.realized_gains),
      noRealizadas: num(data?.unrealized_gains),
      // El backend no calcula variación del día en este endpoint. No se
      // deriva de la nada: se dibuja el hueco.
      pnlDia: null,
      pnlDiaPct: null,
      drawdownMax: num(m.max_drawdown),
      sharpe: num(m.sharpe_ratio),
      // Sin motor de ejecución no hay operaciones CERRADAS que puntuar. Las
      // transacciones registradas a mano no bastan: falta el emparejamiento
      // compra-venta que define una operación ganadora.
      profitFactor: null,
      winRate: null,
      operaciones: null,
      expectativa: null,
    });
  } catch (e) {
    return { datos: null, procedencia: 'sin-fuente', nota: mensajeError(e) };
  }
}

/**
 * Curva de patrimonio.
 *
 * El endpoint devuelve `PortfolioEvolution`, y la serie viene en `history`
 * (no en `evolution`, que fue lo que se escribió la primera vez y hacía que
 * la curva estuviera SIEMPRE vacía). Cada punto trae `date`, `total_value`,
 * `invested_value`, `cash_balance`, `profit_loss`, `profit_loss_percent`.
 *
 * El drawdown se calcula aquí sobre la curva —caída desde el máximo previo—
 * porque es la única forma correcta: promediar drawdowns de posiciones que
 * cayeron en fechas distintas da un número que no le ocurrió a nadie.
 */
export async function leerEvolucion(
  token: string | null,
): Promise<Bloque<{ t: number; patrimonio: number; drawdownPct: number }[]>> {
  if (!token) return sinFuente(SIN_SESION);
  try {
    const { data } = await cliente.get('/portfolio/evolution', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const serie: any[] = Array.isArray(data?.history) ? data.history : [];
    if (!serie.length) {
      return sinFuente(
        'Aún no hay histórico de patrimonio: hacen falta transacciones registradas para ' +
          'poder reconstruir la curva.',
      );
    }
    let pico = -Infinity;
    const puntos = serie
      .map((p) => {
        const t = new Date(p.date).getTime();
        const patrimonio = num(p.total_value) ?? 0;
        pico = Math.max(pico, patrimonio);
        const drawdownPct = pico > 0 ? ((patrimonio - pico) / pico) * 100 : 0;
        return { t, patrimonio, drawdownPct };
      })
      .filter((p) => Number.isFinite(p.t));
    return real(puntos);
  } catch (e) {
    return { datos: null, procedencia: 'sin-fuente', nota: mensajeError(e) };
  }
}

/**
 * Transacciones de la cartera.
 *
 * Esto SÍ existe y es real: son las compras y ventas que has registrado, con
 * su fecha, cantidad, precio y comisión. Lo que no existe es un bróker que
 * ejecute órdenes, así que el panel se llama «Transacciones» y no «Órdenes
 * ejecutadas»: llamarlo lo segundo daría a entender que las mandó el robot.
 *
 * El P&L por transacción se deja vacío a propósito. Calcularlo exige emparejar
 * cada venta con sus compras (FIFO, medio ponderado…) y esa decisión contable
 * no está tomada en el producto; un número aquí sería una elección silenciosa.
 */
/**
 * Estadísticas de operaciones cerradas.
 *
 * Una «operación» es una VENTA: es el momento en que el resultado deja de ser
 * una opinión del mercado y pasa a ser un hecho. Su P&L se calcula contra el
 * coste medio de las compras anteriores del mismo valor, que es la misma regla
 * con la que el backend obtiene `realized_gains`.
 *
 * Esto NO mide al robot. El robot no ha ejecutado nada: mide las operaciones
 * que hay registradas en la cartera. El panel lo dice donde se lee la cifra.
 */
export function calcularEstadisticas(brutas: any[]): EstadisticasOperaciones | null {
  const ordenadas = [...brutas].sort(
    (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime(),
  );

  const resultados: number[] = [];

  for (let i = 0; i < ordenadas.length; i += 1) {
    const t = ordenadas[i];
    if (String(t.transaction_type ?? '').toLowerCase() !== 'sell') continue;

    // Coste medio de las compras del mismo valor ANTERIORES a esta venta.
    // «Anteriores» importa: usar todas las compras, incluidas las posteriores,
    // sería look-ahead — la misma trampa que invalida un backtest.
    let acciones = 0;
    let coste = 0;
    for (let j = 0; j < i; j += 1) {
      const c = ordenadas[j];
      if (c.ticker !== t.ticker) continue;
      if (String(c.transaction_type ?? '').toLowerCase() !== 'buy') continue;
      acciones += num(c.shares) ?? 0;
      coste += (num(c.total_amount) ?? 0) + (num(c.commission) ?? 0);
    }
    if (acciones <= 0) continue; // venta sin compra previa registrada

    const costeMedio = coste / acciones;
    const precioVenta = num(t.price_per_share) ?? 0;
    const vendidas = num(t.shares) ?? 0;
    const comision = num(t.commission) ?? 0;
    resultados.push((precioVenta - costeMedio) * vendidas - comision);
  }

  if (!resultados.length) return null;

  const ganancias = resultados.filter((r) => r > 0);
  const perdidas = resultados.filter((r) => r < 0);
  const beneficioBruto = ganancias.reduce((s, r) => s + r, 0);
  const perdidaBruta = Math.abs(perdidas.reduce((s, r) => s + r, 0));

  return {
    operaciones: resultados.length,
    ganadoras: ganancias.length,
    perdedoras: perdidas.length,
    winRate: (ganancias.length / resultados.length) * 100,
    // Sin pérdidas el ratio es infinito, no un número grande. Se devuelve
    // `null` y el panel dibuja el hueco: es más honesto que un 999.
    profitFactor: perdidaBruta > 0 ? beneficioBruto / perdidaBruta : null,
    expectativa: resultados.reduce((s, r) => s + r, 0) / resultados.length,
    mejor: Math.max(...resultados),
    peor: Math.min(...resultados),
    beneficioBruto,
    perdidaBruta,
  };
}

export interface Operaciones {
  ordenes: Bloque<OrdenEjecutada[]>;
  estadisticas: Bloque<EstadisticasOperaciones>;
}

export async function leerOperaciones(token: string | null): Promise<Operaciones> {
  if (!token) {
    return { ordenes: sinFuente(SIN_SESION), estadisticas: sinFuente(SIN_SESION) };
  }
  try {
    const { data } = await cliente.get('/portfolio/transactions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const brutas: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.transactions)
        ? data.transactions
        : [];

    if (!brutas.length) {
      const nota = 'No hay transacciones registradas en tu cartera todavía.';
      return { ordenes: sinFuente(nota), estadisticas: sinFuente(nota) };
    }

    const ordenes: OrdenEjecutada[] = [...brutas]
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
      .slice(0, 12)
      .map((t) => {
        const fecha = new Date(t.transaction_date);
        const compra = String(t.transaction_type ?? '').toLowerCase() === 'buy';
        return {
          hora: Number.isNaN(fecha.getTime())
            ? String(t.transaction_date ?? '')
            : fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }),
          simbolo: String(t.ticker ?? ''),
          tipo: 'MARKET' as const,
          lado: compra ? ('COMPRA' as const) : ('VENTA' as const),
          cantidad: num(t.shares) ?? 0,
          precio: num(t.price_per_share) ?? 0,
          importe: num(t.total_amount),
          comision: num(t.commission),
          estado: 'ejecutada' as const,
        };
      });

    const stats = calcularEstadisticas(brutas);
    return {
      ordenes: real(ordenes),
      estadisticas: stats
        ? proxy(
            stats,
            'Calculado sobre tus ventas registradas, con el coste medio de las compras ' +
              'anteriores — la misma regla que usa el backend para las ganancias realizadas. ' +
              'No mide al robot: el robot no ha ejecutado ninguna de estas operaciones.',
          )
        : sinFuente(
            'Hay transacciones, pero ninguna venta cerrada contra compras previas. Sin ' +
              'operaciones cerradas no hay win rate ni profit factor que calcular.',
          ),
    };
  } catch (e) {
    const nota = mensajeError(e);
    return {
      ordenes: { datos: null, procedencia: 'sin-fuente', nota },
      estadisticas: { datos: null, procedencia: 'sin-fuente', nota },
    };
  }
}

/* ==========================================================================
 * Capas que NO existen todavía en el backend
 *
 * No se inventan aquí. Se declaran, para que el panel dibuje el hueco con su
 * motivo en lugar de un número plausible.
 * ======================================================================== */

/**
 * Backtest.
 *
 * El motor vive en `backend/backtest.py` y tiene pruebas ejecutables, entre
 * ellas la de ausencia de look-ahead. Los `avisos` que devuelve NO son
 * decorativos: ahí se dice si la muestra de operaciones es demasiado pequeña
 * para que el win rate signifique algo, o si el periodo acaba con una posición
 * abierta cuyo resultado no está en las métricas. El panel los enseña.
 */
export async function leerBacktest(
  ticker: string,
  opciones: {
    period?: string;
    comision_pct?: number;
    deslizamiento_pct?: number;
    riesgo_pct?: number;
  } = {},
): Promise<Bloque<Backtest>> {
  try {
    const { data } = await cliente.get(`/backtest/${encodeURIComponent(ticker)}`, {
      params: { period: '2y', ...opciones },
      // El motor recorre barra a barra: con dos años son ~500 iteraciones,
      // rápido, pero la descarga de yfinance puede tardar.
      timeout: 60000,
    });

    const m = data?.metricas ?? {};
    let pico = -Infinity;
    const curva = (Array.isArray(data?.curva) ? data.curva : []).map((c: any) => {
      const patrimonio = num(c.equity) ?? 0;
      pico = Math.max(pico, patrimonio);
      return {
        t: new Date(c.date).getTime(),
        patrimonio,
        drawdownPct: num(c.drawdown_pct) ?? (pico > 0 ? ((patrimonio - pico) / pico) * 100 : 0),
      };
    });

    return {
      datos: {
        desde: String(data?.desde ?? ''),
        hasta: String(data?.hasta ?? ''),
        simbolo: String(data?.ticker ?? ticker),
        marco: 'Diario',
        retornoTotal: num(m.retorno_total) ?? 0,
        cagr: num(m.cagr) ?? 0,
        drawdownMax: num(m.max_drawdown) ?? 0,
        sharpe: num(m.sharpe) ?? 0,
        sortino: num(m.sortino) ?? 0,
        profitFactor: num(m.profit_factor) ?? 0,
        winRate: num(m.win_rate) ?? 0,
        operaciones: num(m.operaciones) ?? 0,
        expectativa: num(m.expectativa) ?? 0,
        capitalInicial: num(m.capital_inicial),
        capitalFinal: num(m.capital_final),
        curva,
        avisos: Array.isArray(data?.avisos) ? data.avisos.map(String) : [],
        supuestos: data?.parametros ?? {},
        motor: String(data?.motor ?? ''),
      },
      procedencia: 'real',
      actualizado: new Date().toISOString(),
    };
  } catch (e) {
    return { datos: null, procedencia: 'sin-fuente', nota: mensajeError(e) };
  }
}


/* ==========================================================================
 * /nqe/{ticker} — Newtonian Quant Engine
 *
 * Port del indicador de TradingView. El motor está en `backend/nqe.py`, con
 * pruebas ejecutables en `test_nqe.py` — entre ellas la de ausencia de
 * look-ahead, que es la que hace que el gate estadístico signifique algo.
 *
 * Cada campo de aquí abajo está copiado del `return` de `nqe.calcular()`, no
 * inventado. En esta misma pantalla ya se perdieron cuatro paneles por
 * escribir nombres plausibles (`total_value`, `evolution`, `kumo`…) en vez de
 * los reales: no da error, da guiones, y los guiones se leen como «no hay
 * dato». Antes de tocar este traductor, mirar el `return` del endpoint.
 * ======================================================================== */

/** Cadena directa del backend; el hueco es null, nunca una cadena vacía. */
function txt(v: unknown): string | null {
  const s = v === null || v === undefined ? '' : String(v);
  return s.length ? s : null;
}

function moduloNQE(o: any): ModuloNQE {
  return {
    activo: Boolean(o?.activo),
    senal: (txt(o?.senal) ?? 'bajista') as ModuloNQE['senal'],
    alcista: Boolean(o?.alcista),
    nivel: num(o?.nivel),
    velasDesdeGiro: num(o?.velas_desde_giro),
    // Sólo los manda UT Bot; en SuperTrend quedan `undefined` y la tarjeta
    // no dibuja fila. Ponerlos a cero los haría pasar por medidas.
    posicion: num(o?.posicion) ?? undefined,
    compras: num(o?.compras) ?? undefined,
    ventas: num(o?.ventas) ?? undefined,
    keyValue: num(o?.key_value) ?? undefined,
    atrPeriodo: num(o?.atr_periodo) ?? undefined,
  };
}

function ladoGateNQE(o: any): LadoGateNQE {
  return {
    abierto: Boolean(o?.abierto),
    muestra: num(o?.muestra) ?? 0,
    acierto: num(o?.acierto),
    wilson: num(o?.wilson) ?? 0,
    esperanza: num(o?.esperanza) ?? 0,
  };
}

/** Lista de números alineada con las velas. `null` es calentamiento. */
function lineaNQE(v: unknown, largo: number): (number | null)[] {
  const arr = Array.isArray(v) ? v : [];
  // Se rellena hasta `largo` en vez de confiar en que venga completa: una
  // línea más corta que las velas desplazaría todo el trazo hacia la
  // izquierda, y el SuperTrend quedaría dibujado sobre la vela de al lado.
  return Array.from({ length: largo }, (_, i) => num(arr[i]));
}

function serieNQE(o: any): SerieNQE {
  const barras: Vela[] = (Array.isArray(o?.barras) ? o.barras : [])
    .map((b: any) => ({
      t: num(b?.t) ?? 0,
      o: num(b?.o) ?? 0,
      h: num(b?.h) ?? 0,
      l: num(b?.l) ?? 0,
      c: num(b?.c) ?? 0,
      v: num(b?.v) ?? 0,
    }))
    .filter((b: Vela) => Number.isFinite(b.c) && b.c > 0);

  const marcas: MarcaNQE[] = (Array.isArray(o?.marcas) ? o.marcas : [])
    .map((m: any) => ({
      i: num(m?.i) ?? -1,
      direccion: m?.direccion === 'compra' ? 'compra' : 'venta',
      validada: Boolean(m?.validada),
      precio: num(m?.precio) ?? 0,
      objetivo: num(m?.objetivo) ?? 0,
      stop: num(m?.stop) ?? 0,
      resultado: (m?.resultado ?? 'abierta') as MarcaNQE['resultado'],
      fecha: String(m?.fecha ?? ''),
    }))
    // Una marca fuera de la ventana se dibujaría pegada a un borde, como si
    // la señal hubiera ocurrido ahí. Se descarta.
    .filter((m: MarcaNQE) => m.i >= 0 && m.i < barras.length);

  const utMarcas: MarcaUTBot[] = (Array.isArray(o?.ut_marcas) ? o.ut_marcas : [])
    .map((m: any) => ({
      i: num(m?.i) ?? -1,
      tipo: m?.tipo === 'buy' ? 'buy' : 'sell',
      precio: num(m?.precio) ?? 0,
      stop: num(m?.stop) ?? 0,
      fecha: String(m?.fecha ?? ''),
    }))
    .filter((m: MarcaUTBot) => m.i >= 0 && m.i < barras.length);

  return {
    barras,
    utMarcas,
    utPos: Array.from({ length: barras.length }, (_, i) => num((o?.ut_pos ?? [])[i]) ?? 0),
    utStop: lineaNQE(o?.ut_stop, barras.length),
    superTrend: lineaNQE(o?.supertrend, barras.length),
    vwap: lineaNQE(o?.vwap, barras.length),
    score: lineaNQE(o?.score, barras.length),
    umbral: lineaNQE(o?.umbral, barras.length),
    marcas,
    fib382: num(o?.fib_382),
    fib500: num(o?.fib_500),
    fib618: num(o?.fib_618),
    poc: num(o?.poc),
  };
}

export async function leerNQE(
  ticker: string,
  controles: Partial<ControlesNQE> = {},
): Promise<Bloque<NQE>> {
  try {
    const { data } = await cliente.get(`/nqe/${encodeURIComponent(ticker)}`, {
      params: {
        marco: controles.marco ?? '1h',
        preset: controles.preset ?? 'equilibrado',
        // Los interruptores sólo viajan si el usuario los ha tocado: sin
        // ellos manda el preset, que es como se comporta el Pine original.
        ...(controles.usarUT === undefined ? {} : { usar_ut: controles.usarUT }),
        ...(controles.usarST === undefined ? {} : { usar_st: controles.usarST }),
        ...(controles.usarFib === undefined ? {} : { usar_fib: controles.usarFib }),
        gate_estricto: controles.gateEstricto ?? true,
        // Sensibilidad y periodo de ATR de «UT Bot Alerts». Sólo viajan si se
        // han tocado; sin ellos manda el valor del script (1 y 10).
        ...(controles.utKey === undefined ? {} : { ut_key: controles.utKey }),
        ...(controles.utLen === undefined ? {} : { ut_len: controles.utLen }),
      },
      // El motor recorre 5.000 barras y resuelve la triple barrera operación a
      // operación. Medido: ~200 ms de cálculo, pero la descarga de yfinance
      // puede irse a varias decenas de segundos en frío.
      timeout: 90000,
    });

    const senales: SenalNQE[] = (Array.isArray(data?.historial?.senales) ? data.historial.senales : [])
      .map((s: any) => ({
        indice: num(s?.indice) ?? 0,
        fecha: String(s?.fecha ?? ''),
        direccion: s?.direccion === 'compra' ? 'compra' : 'venta',
        validada: Boolean(s?.validada),
        precio: num(s?.precio) ?? 0,
        objetivo: num(s?.objetivo) ?? 0,
        stop: num(s?.stop) ?? 0,
        wilson: num(s?.wilson),
        muestra: num(s?.muestra) ?? 0,
        resultado: (s?.resultado ?? 'abierta') as SenalNQE['resultado'],
        cierreMotivo: txt(s?.cierre_motivo),
        barrasAbierta: num(s?.barras_abierta),
      }));

    const datos: NQE = {
      simbolo: String(data?.ticker ?? ticker),
      marco: (txt(data?.marco) ?? '1h') as MarcoNQE,
      preset: (txt(data?.preset) ?? 'equilibrado') as PresetNQE,
      barras: num(data?.barras) ?? 0,
      desde: String(data?.desde ?? ''),
      hasta: String(data?.hasta ?? ''),
      ultimaVelaCerrada: data?.ultima_vela_cerrada !== false,

      senal: {
        accion: String(data?.senal?.accion ?? 'neutral'),
        texto: String(data?.senal?.texto ?? 'NEUTRAL'),
        tono: (txt(data?.senal?.tono) ?? 'neutral') as Tono,
        disparo: Boolean(data?.senal?.disparo),
        sesgo: num(data?.senal?.sesgo) ?? 0,
        precio: num(data?.senal?.precio),
        objetivo: num(data?.senal?.objetivo),
        stop: num(data?.senal?.stop),
        riesgoATR: num(data?.senal?.riesgo_atr) ?? 1.5,
      },

      motor: {
        score: num(data?.motor?.score),
        umbral: num(data?.motor?.umbral),
        absScore: num(data?.motor?.abs_score),
        posicionZ: num(data?.motor?.posicion_z),
        velocidad: num(data?.motor?.velocidad),
        aceleracion: num(data?.motor?.aceleracion),
        ofi: num(data?.motor?.ofi),
        volumenRelativo: num(data?.motor?.volumen_relativo),
        atr: num(data?.motor?.atr),
        vwap: num(data?.motor?.vwap),
        poc: num(data?.motor?.poc),
      },

      regimen: {
        estado: data?.regimen?.estado === 'tendencia' ? 'tendencia' : 'rango',
        er: num(data?.regimen?.er),
        umbralER: num(data?.regimen?.umbral_er) ?? 0.35,
      },

      utBot: moduloNQE(data?.ut_bot),
      superTrend: moduloNQE(data?.supertrend),

      estructura: {
        activo: Boolean(data?.estructura?.activo),
        zona: String(data?.estructura?.zona ?? 'sin impulso'),
        retroceso: num(data?.estructura?.retroceso),
        impulso: (txt(data?.estructura?.impulso) as 'alcista' | 'bajista' | null) ?? null,
        fib382: num(data?.estructura?.fib_382),
        fib500: num(data?.estructura?.fib_500),
        fib618: num(data?.estructura?.fib_618),
      },

      pronostico: {
        disponible: Boolean(data?.pronostico?.disponible),
        muestra: num(data?.pronostico?.muestra) ?? 0,
        muestraMinima: num(data?.pronostico?.muestra_minima) ?? 40,
        probSube: num(data?.pronostico?.prob_sube),
        wilson: num(data?.pronostico?.wilson),
        mediaATR: num(data?.pronostico?.media_atr),
        desviacionATR: num(data?.pronostico?.desviacion_atr),
        velas: num(data?.pronostico?.velas) ?? 3,
        estado: String(data?.pronostico?.estado ?? ''),
      },

      gate: {
        estricto: data?.gate?.estricto !== false,
        umbralWilson: num(data?.gate?.umbral_wilson) ?? 0.65,
        muestraMinima: num(data?.gate?.muestra_minima) ?? 30,
        largo: ladoGateNQE(data?.gate?.largo),
        corto: ladoGateNQE(data?.gate?.corto),
      },

      embudo: {
        cruces: num(data?.embudo?.cruces) ?? 0,
        conFlujoYLiquidez: num(data?.embudo?.con_flujo_y_liquidez) ?? 0,
        trasFiltros: num(data?.embudo?.tras_filtros) ?? 0,
        validadas: num(data?.embudo?.validadas) ?? 0,
        bloqueadasPorGate: num(data?.embudo?.bloqueadas_por_gate) ?? 0,
      },

      historial: {
        total: num(data?.historial?.total) ?? 0,
        validadas: num(data?.historial?.validadas) ?? 0,
        bloqueadas: num(data?.historial?.bloqueadas) ?? 0,
        cerradas: num(data?.historial?.cerradas) ?? 0,
        ganadas: num(data?.historial?.ganadas) ?? 0,
        acierto: num(data?.historial?.acierto),
        senales,
      },

      serie: serieNQE(data?.serie),
      avisos: Array.isArray(data?.avisos) ? data.avisos.map(String) : [],
      notaOFI: String(data?.nota_ofi ?? ''),
    };

    // El flujo que alimenta la aceleración es un PROXY declarado (CLV), no
    // delta de agresores: la tarjeta hereda esa marca en la cabecera.
    return { datos, procedencia: 'proxy', nota: datos.notaOFI, actualizado: new Date().toISOString() };
  } catch (e) {
    return { datos: null, procedencia: 'sin-fuente', nota: mensajeError(e) };
  }
}

/* ==========================================================================
 * /fibonacci/{ticker} — retrocesos sobre el impulso vigente
 *
 * Port del script del usuario con sus sesgos corregidos. El motor está en
 * `backend/fibonacci.py` y tiene pruebas ejecutables, entre ellas una que
 * compara el modo `lookback` contra una reimplementación literal del Pine
 * nivel a nivel.
 *
 * Los `avisos` NO son decorativos: dicen si el tramo lo está definiendo el
 * tamaño de la ventana en vez del mercado, si la dirección se decidió por una
 * o dos velas, o si el impulso ya está roto.
 * ======================================================================== */

export async function leerFibonacci(
  ticker: string,
  controles: Partial<ControlesFib> = {},
): Promise<Bloque<Fibonacci>> {
  try {
    const { data } = await cliente.get(`/fibonacci/${encodeURIComponent(ticker)}`, {
      params: {
        marco: controles.marco ?? '1d',
        modo: controles.modo ?? 'pivotes',
        ventana: controles.ventana ?? 100,
        invertir: controles.invertir ?? false,
        extras: controles.extras ?? false,
        extensiones: controles.extensiones ?? true,
      },
      timeout: 90000,
    });

    const velas: Vela[] = (Array.isArray(data?.serie?.barras) ? data.serie.barras : [])
      .map((b: any) => ({
        t: num(b?.t) ?? 0,
        o: num(b?.o) ?? 0,
        h: num(b?.h) ?? 0,
        l: num(b?.l) ?? 0,
        c: num(b?.c) ?? 0,
        v: num(b?.v) ?? 0,
      }))
      .filter((b: Vela) => Number.isFinite(b.c) && b.c > 0);

    const niveles: NivelFib[] = (Array.isArray(data?.niveles) ? data.niveles : [])
      .map((x: any) => ({
        ratio: num(x?.ratio) ?? 0,
        etiqueta: String(x?.etiqueta ?? ''),
        precio: num(x?.precio) ?? 0,
        tipo: x?.tipo === 'extension' ? 'extension' : 'retroceso',
        papel: x?.papel === 'resistencia' ? 'resistencia' : 'soporte',
      }))
      .filter((x: NivelFib) => Number.isFinite(x.precio) && x.precio > 0);

    if (!velas.length) return sinFuente('El backend no devolvió velas para este marco.');

    const datos: Fibonacci = {
      simbolo: String(data?.ticker ?? ticker),
      marco: (String(data?.marco ?? '1d') as MarcoFib),
      barras: num(data?.barras) ?? 0,
      desde: String(data?.desde ?? ''),
      hasta: String(data?.hasta ?? ''),
      modo: (data?.modo === 'lookback' ? 'lookback' : 'pivotes') as ModoFib,
      modoPedido: (data?.modo_pedido === 'lookback' ? 'lookback' : 'pivotes') as ModoFib,
      ventana: num(data?.ventana) ?? 100,
      pivote: num(data?.pivote) ?? 8,
      ultimaVelaCerrada: data?.ultima_vela_cerrada !== false,
      impulso: {
        alto: num(data?.impulso?.alto) ?? 0,
        bajo: num(data?.impulso?.bajo) ?? 0,
        rango: num(data?.impulso?.rango) ?? 0,
        direccion: data?.impulso?.direccion === 'bajista' ? 'bajista' : 'alcista',
        invertido: Boolean(data?.impulso?.invertido),
        iAltoSerie: num(data?.impulso?.i_alto_serie),
        iBajoSerie: num(data?.impulso?.i_bajo_serie),
        fechaAlto: String(data?.impulso?.fecha_alto ?? ''),
        fechaBajo: String(data?.impulso?.fecha_bajo ?? ''),
        separacionVelas: num(data?.impulso?.separacion_velas) ?? 0,
      },
      niveles,
      actual: {
        precio: num(data?.actual?.precio) ?? 0,
        ratio: num(data?.actual?.ratio) ?? 0,
        zona: String(data?.actual?.zona ?? ''),
      },
      velas,
      avisos: Array.isArray(data?.avisos) ? data.avisos.map(String) : [],
    };

    return { datos, procedencia: 'real', actualizado: new Date().toISOString() };
  } catch (e) {
    return { datos: null, procedencia: 'sin-fuente', nota: mensajeError(e) };
  }
}


/* ==========================================================================
 * /pivots/{ticker} — puntos pivote de Woodie
 *
 * Motor en `backend/pivots.py`, con pruebas ejecutables. Tres cosas del
 * contrato que no son evidentes:
 *
 * - Los niveles NO cambian con el marco: salen del periodo anterior. 5m y 4h
 *   con pivotes diarios enseñan el mismo mapa, y así debe ser.
 * - `toques_pct` es una proporción MEDIDA sobre los últimos N periodos, no una
 *   valoración ni una estimación.
 * - `colinealidad` mide cuánto se solapan PP y VWAP. Por encima del 85 % no
 *   son dos confirmaciones, son la misma contada dos veces.
 * ======================================================================== */

export async function leerPivotes(
  ticker: string,
  controles: Partial<ControlesPivote> = {},
): Promise<Bloque<Pivotes>> {
  try {
    const { data } = await cliente.get(`/pivots/${encodeURIComponent(ticker)}`, {
      params: {
        marco: controles.marco ?? '1h',
        variante: controles.variante ?? 'apertura',
      },
      timeout: 90000,
    });

    const niveles: NivelPivote[] = (Array.isArray(data?.niveles) ? data.niveles : [])
      .map((x: any) => ({
        clave: String(x?.clave ?? ''),
        precio: num(x?.precio) ?? 0,
        papel: x?.papel === 'resistencia' ? 'resistencia' : 'soporte',
        distanciaPct: num(x?.distancia_pct),
        toquesPct: num(x?.toques_pct),
        toquesMuestra: num(x?.toques_muestra) ?? 0,
        clasico: num(x?.clasico),
      }))
      .filter((x: NivelPivote) => Number.isFinite(x.precio) && x.precio > 0);

    if (!niveles.length) return sinFuente('El backend no devolvió niveles para este valor.');

    const datos: Pivotes = {
      simbolo: String(data?.ticker ?? ticker),
      marco: String(data?.marco ?? '1h') as MarcoPivote,
      periodo: String(data?.periodo ?? 'diario'),
      variante: (data?.variante === 'cierre' ? 'cierre' : 'apertura') as VarianteWoodie,
      barras: num(data?.barras) ?? 0,
      ultimaVelaCerrada: data?.ultima_vela_cerrada !== false,
      base: {
        alto: num(data?.base?.alto) ?? 0,
        bajo: num(data?.base?.bajo) ?? 0,
        cierre: num(data?.base?.cierre) ?? 0,
        aperturaActual: num(data?.base?.apertura_actual) ?? 0,
        huecoPct: num(data?.base?.hueco_pct),
        fecha: String(data?.base?.fecha ?? ''),
      },
      niveles,
      nivelCercano: String(data?.nivel_cercano ?? ''),
      confluencia: {
        ppWoodie: num(data?.confluencia?.pp_woodie) ?? 0,
        ppClasico: num(data?.confluencia?.pp_clasico) ?? 0,
        ppWoodieCierre: num(data?.confluencia?.pp_woodie_cierre) ?? 0,
        distanciaPct: num(data?.confluencia?.distancia_pct),
        umbralPct: num(data?.confluencia?.umbral_pct) ?? 0.15,
        hayConfluencia: Boolean(data?.confluencia?.hay_confluencia),
        desvioVariantesPct: num(data?.confluencia?.desvio_variantes_pct),
      },
      vwap: {
        valor: num(data?.vwap?.valor),
        anclaje: String(data?.vwap?.anclaje ?? ''),
        precioSobre: Boolean(data?.vwap?.precio_sobre),
        distanciaPct: num(data?.vwap?.distancia_pct),
        nota: String(data?.vwap?.nota ?? ''),
      },
      superTrend: {
        alcista: Boolean(data?.supertrend?.alcista),
        nivel: num(data?.supertrend?.nivel),
        factor: num(data?.supertrend?.factor) ?? 3,
      },
      colinealidad: {
        acuerdoPct: num(data?.colinealidad?.acuerdo_pct),
        muestra: num(data?.colinealidad?.muestra) ?? 0,
      },
      precio: {
        actual: num(data?.precio?.actual) ?? 0,
        sobrePP: Boolean(data?.precio?.sobre_pp),
        sobreVWAP: Boolean(data?.precio?.sobre_vwap),
        atr: num(data?.precio?.atr),
      },
      senal: {
        veredicto:
          data?.senal?.veredicto === 'LONG' || data?.senal?.veredicto === 'SHORT'
            ? data.senal.veredicto
            : null,
        condiciones: (Array.isArray(data?.senal?.condiciones) ? data.senal.condiciones : []).map(
          (x: any): CondicionPivote => ({
            texto: String(x?.texto ?? ''),
            cumplida: Boolean(x?.cumplida),
            detalle: String(x?.detalle ?? ''),
          }),
        ),
        condicionesCumplidas: num(data?.senal?.condiciones_cumplidas) ?? 0,
        ladoAuditado: data?.senal?.lado_auditado === 'short' ? 'short' : 'long',
        ultimaSenal: data?.senal?.ultima_senal
          ? ({
              direccion: data.senal.ultima_senal.direccion === 'venta' ? 'venta' : 'compra',
              veredicto: data.senal.ultima_senal.veredicto === 'SHORT' ? 'SHORT' : 'LONG',
              precio: num(data.senal.ultima_senal.precio) ?? 0,
              stop: num(data.senal.ultima_senal.stop),
              barrasAtras: num(data.senal.ultima_senal.barras_atras) ?? 0,
            } as UltimaSenalPivote)
          : null,
        direccion: (data?.senal?.direccion ?? 'ninguna') as Pivotes['senal']['direccion'],
        disparo: Boolean(data?.senal?.disparo),
        operable: Boolean(data?.senal?.operable),
        motivoNoOperable: data?.senal?.motivo_no_operable
          ? String(data.senal.motivo_no_operable)
          : null,
        entrada: num(data?.senal?.entrada),
        stop: num(data?.senal?.stop),
        objetivo1: num(data?.senal?.objetivo1),
        objetivo2: num(data?.senal?.objetivo2),
        riesgoBeneficio: num(data?.senal?.riesgo_beneficio),
        marcasTotales: num(data?.senal?.marcas_totales) ?? 0,
      },
      fase: {
        numero: num(data?.fase?.numero) ?? 0,
        nombre: String(data?.fase?.nombre ?? ''),
        direccion: String(data?.fase?.direccion ?? 'ninguna'),
        barrasEnFase: num(data?.fase?.barras_en_fase),
        caducidad: num(data?.fase?.caducidad) ?? 30,
      },
      avisos: Array.isArray(data?.avisos) ? data.avisos.map(String) : [],
    };

    return { datos, procedencia: 'real', actualizado: new Date().toISOString() };
  } catch (e) {
    return { datos: null, procedencia: 'sin-fuente', nota: mensajeError(e) };
  }
}


export { mensajeError };
