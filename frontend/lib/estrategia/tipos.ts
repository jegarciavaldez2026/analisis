/**
 * ============================================================================
 * Estrategia — contrato de datos del terminal
 * ============================================================================
 * Un tipo por cada cosa que el terminal muestra, y una marca de procedencia
 * en cada bloque. La procedencia no es metadato de lujo: es la diferencia
 * entre una lectura y una invención, y el producto ya ha decidido que un
 * hueco honesto vale más que un número inventado.
 *
 * `Procedencia` viaja con el dato, no con el componente, porque el mismo panel
 * puede estar leyendo del backend en un ticker y quedarse sin fuente en otro.
 * ==========================================================================*/

/** De dónde sale un bloque de datos. Se dibuja, no se esconde. */
export type Procedencia =
  /** Calculado por el backend a partir del histórico real. */
  | 'real'
  /** Derivado de un proxy declarado (p. ej. CLV en lugar de delta de agresores). */
  | 'proxy'
  /** Simulado a propósito mientras no existe la capa. Se marca en pantalla. */
  | 'simulado'
  /** No existe fuente que lo sirva. Se dibuja el hueco y se explica. */
  | 'sin-fuente';

/** Estado de carga de cualquier panel. Cuatro, ni uno más. */
export type EstadoPanel = 'cargando' | 'error' | 'vacio' | 'listo';

/** Dirección semántica reutilizada del sistema de diseño. */
export type Tono = 'up' | 'down' | 'caution' | 'accent' | 'neutral';

/** Envoltorio uniforme: dato + procedencia + por qué falta, si falta. */
export interface Bloque<T> {
  datos: T | null;
  procedencia: Procedencia;
  /** Obligatorio cuando `procedencia` no es 'real'. Se enseña al usuario. */
  nota?: string;
  actualizado?: string | null;
}

/* ==========================================================================
 * Mercado
 * ======================================================================== */

export interface DatosMercado {
  simbolo: string;
  nombre: string;
  mercado: string;
  sector: string;
  industria: string;
  precio: number;
  cambio: number;
  cambioPct: number;
  apertura: number | null;
  maximo: number | null;
  minimo: number | null;
  cierreAnterior: number | null;
  volumen: number | null;
  volumenMedio: number | null;
  min52: number | null;
  max52: number | null;
  capitalizacion: number | null;
}

/** Una punta del libro. `tamano` en acciones. */
export interface NivelLibro {
  precio: number;
  tamano: number;
}

export interface LibroOrdenes {
  bids: NivelLibro[];
  asks: NivelLibro[];
  /** Horquilla absoluta. `null` fuera de horario: Yahoo devuelve ceros. */
  spread: number | null;
  spreadPct: number | null;
  /** Profundidad agregada. Sólo existe con libro real. */
  totalBid: number | null;
  totalAsk: number | null;
  desequilibrioPct: number | null;
}

/**
 * Liquidez y capacidad de ejecución.
 *
 * Es la respuesta a «no hay libro de nivel II, ¿entonces qué mira el robot?».
 * No finge ser profundidad de mercado: mide el coste de cruzar la horquilla
 * (estimador de Corwin-Schultz sobre máximos y mínimos), el impacto en precio
 * por dólar negociado (Amihud) y el volumen medio, que es lo que de verdad
 * acota el tamaño de una posición.
 */
export interface Liquidez {
  /**
   * Horquilla efectiva estimada, en %. `null` cuando no hay barras bastantes
   * O cuando la estimación no supera el contraste con el volumen negociado
   * (ver `spreadMotivo`): el estimador sobreestima con volatilidad alta y una
   * cifra imposible en un valor líquido no se enseña, se explica.
   */
  spreadEstimadoPct: number | null;
  /** Lo que dio el estimador cuando se descartó. Para poder decir cuánto. */
  spreadDescartadoPct: number | null;
  /** Por qué no hay horquilla, cuando no la hay. */
  spreadMotivo: string | null;
  spreadMetodo: string;
  /** Movimiento de precio en % por cada millón de dólares negociado. */
  amihudPctPorMillon: number | null;
  advAcciones: number | null;
  advDolares: number | null;
  /** Volumen de la última sesión dividido por el volumen medio. */
  volumenRelativo: number | null;
  /** Tamaño máximo al 1 % del volumen medio: la regla de participación. */
  maxAcciones1pct: number | null;
  maxDolares1pct: number | null;
  clasificacion: 'alta' | 'media' | 'baja';
  nota: string;
  ventanaSesiones: number | null;
  /** Rango diario medio en %. NO es la horquilla; se enseña por separado. */
  rangoDiarioPct: number | null;
}

/**
 * El valor contra su índice de referencia, en base 100.
 *
 * Un +40 % no significa nada suelto: si el índice hizo +45 %, ese valor lo hizo
 * PEOR que comprar el índice y quedarse quieto. El alfa es la cifra que
 * contesta a «¿ha merecido la pena elegir esto en vez del mercado?», y la beta
 * dice cuánto riesgo de mercado se está asumiendo para conseguirlo.
 */
export interface Comparativa {
  simbolo: string;
  periodo: string;
  serie: { t: number; valor: number; indice: number }[];
  /** Rendimiento del periodo en %, ya descontada la base 100. */
  retornoValor: number;
  retornoIndice: number;
  /** Diferencia de rendimiento contra el índice, en puntos porcentuales. */
  alfa: number;
  /** Sensibilidad al mercado. `null` si no se puede calcular. */
  beta: number | null;
  /** Correlación con el índice, −1 a 1. */
  correlacion: number | null;
  /**
   * Fracción del movimiento del valor que explica el índice (R² = corr²).
   *
   * Es lo que decide si la beta significa algo. Medido en PBF: beta −0,50 con
   * correlación −0,10, o sea R² = 0,01 — el mercado explica el 1 % de lo que
   * hace el valor. Esa beta es aritméticamente correcta y estadísticamente
   * vacía, y presentarla sin el R² al lado invita a leerla como «se mueve al
   * revés que el mercado» cuando lo cierto es «no se mueve con el mercado».
   */
  r2: number | null;
  /** `false` cuando el R² es tan bajo que la beta no sostiene una lectura. */
  betaFiable: boolean;
  precioActual: number | null;
}

/**
 * Fase del ciclo de Wyckoff, con el reparto de probabilidad entre las cuatro.
 *
 * Se enseñan las CUATRO probabilidades y no sólo la ganadora a propósito: una
 * fase al 35 % con la siguiente al 33 % es una lectura muy distinta de una al
 * 80 %, y con un solo titular las dos se ven igual. El backend además declara
 * `transicion` cuando las dos primeras están a menos de diez puntos, en vez de
 * elegir por un pelo.
 */
export interface Wyckoff {
  fase: string;
  /** Clave de la fase ganadora: `acumulacion` | `alcista` | … */
  etapa: string;
  descripcion: string;
  /** Qué suele funcionar en esta fase. Lo redacta el backend por etapa. */
  estrategia: string[];
  /** Sesiones sobre las que se ha clasificado. */
  sesiones: number | null;
  /** Extremos del rango de 60 sesiones, para situar el precio. */
  suelo60: number | null;
  techo60: number | null;
  tendenciaPrevia: number | null;
  /**
   * Campo `confidence` del backend, tal cual: `margen / 30` acotado a 1.
   *
   * NO es una probabilidad y NO está en 0-100: para PBF valía 0,59 con la fase
   * líder al 44 %. La interfaz no lo pinta —usa el margen en puntos, que se
   * explica solo— y se conserva aquí sólo para no perder el dato del backend.
   */
  confianza: number | null;
  /** `true` cuando las dos primeras fases están demasiado igualadas. */
  transicion: boolean;
  probabilidades: { clave: string; nombre: string; pct: number }[];
  /** Las medidas de las que sale la clasificación. */
  rasgos: { etiqueta: string; valor: number | null; unidad?: string }[];
}

export type Marco = '12s' | '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D' | '1W' | '1M';

/** Vela OHLCV. `null` en un campo interrumpe el trazo, no lo inventa. */
export interface Vela {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface SerieMercado {
  simbolo: string;
  marco: Marco;
  velas: Vela[];
}

/* ==========================================================================
 * Volume delta — proxy declarado (CLV), no delta de agresores
 * ======================================================================== */

export interface FilaVolumeDelta {
  tf: string;
  volumen: number | null;
  compraPct: number | null;
  ventaPct: number | null;
  deltaPct: number | null;
  senal: string;
  tono: Tono;
}

/* ==========================================================================
 * Robot — señal, control, posición
 * ======================================================================== */

export type AccionRobot = 'buy' | 'accumulate' | 'hold' | 'reduce' | 'sell';

export interface FactorSenal {
  etiqueta: string;
  valor: string;
  tono: Tono;
  /** Cuando el factor no tiene fuente se dibuja el hueco con su motivo. */
  sinFuente?: string;
}

export interface SenalRobot {
  accion: AccionRobot;
  accionEs: string;
  /** Score normalizado 0–100. El backend puntúa sobre 165; aquí ya viene en %. */
  score100: number;
  scoreBruto: number;
  scoreMax: number;
  fuerza: string;
  sesgo: string;
  factores: FactorSenal[];
  /** Segundos hasta la próxima evaluación. El robot decide cada 45 min. */
  proximaDecisionEn: number | null;
  proximaDecisionHora: string | null;
}

export interface ControlesRobot {
  modo: 'manual' | 'automatico';
  capitalPct: number;
  riesgoPct: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPosiciones: number;
  estado: 'activo' | 'pausado' | 'detenido';
}

export interface PosicionAbierta {
  simbolo: string;
  lado: 'long' | 'short';
  acciones: number;
  entrada: number;
  actual: number;
  pnl: number;
  pnlPct: number;
  stopLoss: number;
  takeProfit: number;
  riesgoBeneficio: number;
  abiertaDesde: string;
}

/* ==========================================================================
 * Análisis
 * ======================================================================== */

export interface FilaAnalisis {
  etiqueta: string;
  valor: string | number | null;
  unidad?: string;
  senal?: string;
  tono: Tono;
  /** Motivo por el que no hay lectura. Si está, gana sobre `valor`. */
  sinFuente?: string;
}

export interface AnalisisTecnico {
  filas: FilaAnalisis[];
  score: number | null;
  senal: string;
  tono: Tono;
}

/**
 * Un nivel de precio con su papel respecto al precio ACTUAL.
 *
 * `esSoporte` no se deduce del nombre del nivel sino de la posición: una «R3»
 * que queda por debajo del precio ya se rompió y hoy es soporte. Llamarla
 * resistencia porque se llama R3 es el error que traía la maqueta.
 */
export interface NivelClave {
  etiqueta: string;
  precio: number;
  esSoporte: boolean;
  distanciaPct: number | null;
  familia: 'fibonacci' | 'camarilla' | 'media' | 'otro';
}

export interface TecnicoAmpliado {
  score: number | null;
  recomendacion: string;
  tono: Tono;
  tendencia: string;
  swingAlto: number | null;
  swingBajo: number | null;
  zonaFibonacci: string;
  interpretacion: string;
  cruceDorado: boolean;
  cruceMuerte: boolean;
  resumenMedias: string;
  indicadores: FilaAnalisis[];
  niveles: NivelClave[];
  /** Incoherencias detectadas entre los datos. Se enseñan, no se ocultan. */
  avisos: string[];
}

export interface Ichimoku {
  score: number | null;
  filas: FilaAnalisis[];
  sesgo: string;
  tono: Tono;
}

export interface Volatilidad {
  filas: FilaAnalisis[];
  score: number | null;
  regimen: string;
  tono: Tono;
}

/* ==========================================================================
 * Cartera y rendimiento
 * ======================================================================== */

export interface ResumenPanel {
  balance: number | null;
  disponible: number | null;
  patrimonio: number | null;
  invertido: number | null;
  /** Valor de mercado de las posiciones abiertas, sin la caja. */
  valorPosiciones: number | null;
  gananciaNeta: number | null;
  retornoPct: number | null;
  /** Beneficio ya materializado en ventas. */
  realizadas: number | null;
  /** Plusvalía latente de las posiciones abiertas. */
  noRealizadas: number | null;
  pnlDia: number | null;
  pnlDiaPct: number | null;
  drawdownMax: number | null;
  sharpe: number | null;
  profitFactor: number | null;
  winRate: number | null;
  operaciones: number | null;
  expectativa: number | null;
}

export interface PuntoCurva {
  t: number;
  patrimonio: number;
  drawdownPct: number;
}

export interface Backtest {
  desde: string;
  hasta: string;
  simbolo: string;
  marco: string;
  retornoTotal: number;
  cagr: number;
  drawdownMax: number;
  sharpe: number;
  sortino: number;
  profitFactor: number;
  winRate: number;
  operaciones: number;
  expectativa: number;
  capitalInicial: number | null;
  capitalFinal: number | null;
  curva: PuntoCurva[];
  /**
   * Advertencias del motor. Muestra pequeña, posición abierta al final…
   * Se enseñan siempre: un backtest sin sus advertencias es media verdad.
   */
  avisos: string[];
  /** Comisión, deslizamiento, riesgo y múltiplos de ATR con los que se corrió. */
  supuestos: Record<string, unknown>;
  motor: string;
}

/**
 * Estadísticas de operaciones cerradas.
 *
 * Se calculan sobre las VENTAS registradas, emparejando cada una con el coste
 * medio de las compras anteriores del mismo valor. Esa es exactamente la
 * convención que el backend usa para `realized_gains`, así que las cifras
 * cuadran con el balance en vez de contar otra historia.
 *
 * Con FIFO saldrían números distintos. No es que uno esté bien y otro mal: son
 * dos criterios contables, y el producto ya había elegido uno.
 */
export interface EstadisticasOperaciones {
  operaciones: number;
  ganadoras: number;
  perdedoras: number;
  winRate: number | null;
  profitFactor: number | null;
  expectativa: number | null;
  mejor: number | null;
  peor: number | null;
  beneficioBruto: number;
  perdidaBruta: number;
}

export type EstadoOrden = 'ejecutada' | 'pendiente' | 'cancelada' | 'rechazada';

export interface OrdenEjecutada {
  /** Fecha o marca temporal ya formateada. */
  hora: string;
  simbolo: string;
  tipo: 'LIMIT' | 'MARKET' | 'STOP';
  lado: 'COMPRA' | 'VENTA';
  cantidad: number;
  precio: number;
  importe: number | null;
  comision: number | null;
  estado: EstadoOrden;
}

/* ==========================================================================
 * Información — calendario, noticias, alertas
 * ======================================================================== */

export type Impacto = 'alto' | 'medio' | 'bajo';

/**
 * Evento del propio valor: resultados, ex-dividendo, pago.
 *
 * NO es el calendario macro. Son cosas distintas y mezclarlas fue un error:
 * el calendario económico vive en `components/market/EconomicCalendar.tsx` y
 * tiene su propia fuente (Econdb). Aquí sólo van los campos que el backend
 * devuelve de verdad — sin país ni impacto inventados.
 */
export interface EventoValor {
  evento: string;
  fecha: string;
  dias: number | null;
  detalle: string;
}

export interface Noticia {
  titular: string;
  medio: string;
  /** Etiqueta ya formateada por el backend («Hace 2 días»). */
  cuando: string;
  /**
   * Puntuación de impacto en narrativa, aprox. −4 … +4. **No es un
   * porcentaje**: pintarlo con un « %» detrás lo convertiría en una
   * afirmación falsa sobre el precio.
   */
  impacto: number | null;
  resumen?: string;
  /**
   * El titular lo ha escrito un modelo de 1,7 B, no el medio. La interfaz lo
   * dice para que nadie lo lea como cita literal, y el enlace sigue llevando
   * al artículo original en su idioma.
   */
  traducido?: boolean;
  idiomaOriginal?: string | null;
}

export interface Alerta {
  tono: Tono;
  titulo: string;
  detalle: string;
  cuando: string;
}

/* ==========================================================================
 * Conexión
 * ======================================================================== */

export type EstadoConexion = 'conectado' | 'reconectando' | 'desconectado';

export interface Telemetria {
  conexion: EstadoConexion;
  latenciaMs: number | null;
  fuenteDatos: string;
  broker: string;
  ultimoTick: string | null;
  ultimoAnalisis: string | null;
  robot: 'activo' | 'pausado' | 'detenido';
}

/* ==========================================================================
 * Respuesta agregada del dashboard
 * ======================================================================== */

export interface EstadoDashboard {
  estado: EstadoPanel;
  error: string | null;
  simbolo: string;
  mercado: Bloque<DatosMercado>;
  libro: Bloque<LibroOrdenes>;
  /** Sustituye al libro: lo que sí se puede medir sobre barras diarias. */
  liquidez: Bloque<Liquidez>;
  /** El valor contra el S&P 500: alfa, beta y correlación. */
  comparativa: Bloque<Comparativa>;
  /** Fase del ciclo de Wyckoff con el reparto de probabilidad. */
  wyckoff: Bloque<Wyckoff>;
  serie: Bloque<SerieMercado>;
  volumeDelta: Bloque<FilaVolumeDelta[]>;
  senal: Bloque<SenalRobot>;
  posicion: Bloque<PosicionAbierta>;
  tecnico: Bloque<AnalisisTecnico>;
  tecnicoAmpliado: Bloque<TecnicoAmpliado>;
  ichimoku: Bloque<Ichimoku>;
  volatilidad: Bloque<Volatilidad>;
  resumen: Bloque<ResumenPanel>;
  curva: Bloque<PuntoCurva[]>;
  backtest: Bloque<Backtest>;
  ordenes: Bloque<OrdenEjecutada[]>;
  operaciones: Bloque<EstadisticasOperaciones>;
  eventos: Bloque<EventoValor[]>;
  noticias: Bloque<Noticia[]>;
  alertas: Bloque<Alerta[]>;
}
