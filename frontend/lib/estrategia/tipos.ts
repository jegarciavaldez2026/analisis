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

/* ==========================================================================
 * NQE — Newtonian Quant Engine
 *
 * Port del indicador de TradingView. El motor vive en `backend/nqe.py` y lo
 * sirve `/nqe/{ticker}`; aquí sólo se le pone tipo. Los nombres de campo son
 * LOS DEL BACKEND, comprobados contra el `return` de `calcular()`: escribir
 * nombres plausibles en vez de los reales ya costó cuatro paneles vacíos en
 * esta misma pantalla, y no da error — da guiones.
 * ======================================================================== */

/** Marco temporal del NQE. El indicador está pensado para 1H-4H. */
export type MarcoNQE = '1h' | '4h' | '1d';

/** Preset del Pine: fija sensibilidad, gate, muestra mínima y filtros. */
export type PresetNQE = 'conservador' | 'equilibrado' | 'agresivo';

/** Una señal del historial. `validada` es la que pasó el gate estadístico. */
export interface SenalNQE {
  indice: number;
  fecha: string;
  direccion: 'compra' | 'venta';
  /**
   * Pasó el gate. Una señal NO validada no es una orden: es lo que el Pine
   * dibuja como círculo gris. Se enseña, pero marcada.
   */
  validada: boolean;
  precio: number;
  objetivo: number;
  stop: number;
  /** Cota de Wilson en el momento de la señal, no la de hoy. */
  wilson: number | null;
  muestra: number;
  resultado: 'ganada' | 'perdida' | 'abierta';
  cierreMotivo: string | null;
  barrasAbierta: number | null;
}

/** Estado de un módulo de filtrado (UT Bot o SuperTrend). */
export interface ModuloNQE {
  activo: boolean;
  senal: 'compra' | 'venta' | 'alcista' | 'bajista';
  alcista: boolean;
  nivel: number | null;
  /**
   * Velas desde el último giro. Entrar en un giro fresco no es lo mismo que
   * entrar en una tendencia que lleva cuarenta velas corriendo.
   */
  velasDesdeGiro: number | null;
  /** Sólo UT Bot: posición sostenida y mandos del script de alertas. */
  posicion?: number;
  compras?: number;
  ventas?: number;
  keyValue?: number;
  atrPeriodo?: number;
}

/** Un lado del gate: cuántas operaciones lo respaldan y si está abierto. */
export interface LadoGateNQE {
  abierto: boolean;
  muestra: number;
  acierto: number | null;
  wilson: number;
  esperanza: number;
}

/** Una marca de señal sobre el gráfico. `i` es el índice DENTRO de la ventana
 *  dibujada, ya trasladado por el backend: restar offsets en el cliente es
 *  justo lo que desalinea un triángulo una vela a la derecha. */
export interface MarcaNQE {
  i: number;
  direccion: 'compra' | 'venta';
  validada: boolean;
  precio: number;
  objetivo: number;
  stop: number;
  resultado: 'ganada' | 'perdida' | 'abierta';
  fecha: string;
}

/**
 * Un cruce de «UT Bot Alerts»: el precio atraviesa su trailing stop.
 *
 * Es OTRA cosa que `MarcaNQE`. Aquella es la señal compuesta del motor —score
 * fuera de umbral, flujo a favor, liquidez y los tres filtros—; ésta es un
 * módulo suelto. Van en listas separadas a propósito: ningún indicador aislado
 * puede ordenar una operación, y fundirlas en una sola lista haría exactamente
 * eso sin decirlo.
 */
export interface MarcaUTBot {
  i: number;
  tipo: 'buy' | 'sell';
  precio: number;
  stop: number;
  fecha: string;
}

/** La cola de la serie con las líneas que el Pine pinta sobre el precio. */
export interface SerieNQE {
  barras: Vela[];
  /** Alineadas barra a barra con `barras`. `null` es calentamiento, no cero. */
  utStop: (number | null)[];
  superTrend: (number | null)[];
  vwap: (number | null)[];
  score: (number | null)[];
  umbral: (number | null)[];
  marcas: MarcaNQE[];
  /** Cruces del módulo UT Bot, aparte de la señal compuesta. */
  utMarcas: MarcaUTBot[];
  /** +1 largo, −1 corto, 0 hasta el primer cruce. NO es `close > stop`. */
  utPos: number[];
  fib382: number | null;
  fib500: number | null;
  fib618: number | null;
  poc: number | null;
}

export interface NQE {
  simbolo: string;
  marco: MarcoNQE;
  preset: PresetNQE;
  barras: number;
  desde: string;
  hasta: string;
  /** Si la última vela sigue abierta, su señal aún puede cambiar. */
  ultimaVelaCerrada: boolean;

  senal: {
    accion: string;
    texto: string;
    tono: Tono;
    /** Hay disparo AHORA, no sólo sesgo sostenido. */
    disparo: boolean;
    sesgo: number;
    precio: number | null;
    objetivo: number | null;
    stop: number | null;
    riesgoATR: number;
  };

  motor: {
    score: number | null;
    umbral: number | null;
    absScore: number | null;
    posicionZ: number | null;
    velocidad: number | null;
    aceleracion: number | null;
    /** PROXY: volumen firmado por CLV, no delta de agresores. */
    ofi: number | null;
    volumenRelativo: number | null;
    atr: number | null;
    vwap: number | null;
    poc: number | null;
  };

  regimen: { estado: 'tendencia' | 'rango'; er: number | null; umbralER: number };

  utBot: ModuloNQE;
  superTrend: ModuloNQE;

  estructura: {
    activo: boolean;
    zona: string;
    retroceso: number | null;
    impulso: 'alcista' | 'bajista' | null;
    fib382: number | null;
    fib500: number | null;
    fib618: number | null;
  };

  pronostico: {
    disponible: boolean;
    muestra: number;
    muestraMinima: number;
    probSube: number | null;
    wilson: number | null;
    mediaATR: number | null;
    desviacionATR: number | null;
    velas: number;
    estado: string;
  };

  gate: {
    estricto: boolean;
    umbralWilson: number;
    muestraMinima: number;
    largo: LadoGateNQE;
    corto: LadoGateNQE;
  };

  /** Dónde muere cada señal. Contesta a «¿por qué no sale nada?». */
  embudo: {
    cruces: number;
    conFlujoYLiquidez: number;
    trasFiltros: number;
    validadas: number;
    bloqueadasPorGate: number;
  };

  historial: {
    total: number;
    validadas: number;
    bloqueadas: number;
    cerradas: number;
    ganadas: number;
    acierto: number | null;
    senales: SenalNQE[];
  };

  /** Velas y líneas para el gráfico. */
  serie: SerieNQE;

  /** Se enseñan arriba. Cambian cómo se lee todo lo de debajo. */
  avisos: string[];
  notaOFI: string;
}

/** Mandos que la tarjeta puede cambiar y viajan al endpoint. */
export interface ControlesNQE {
  marco: MarcoNQE;
  preset: PresetNQE;
  usarUT: boolean;
  usarST: boolean;
  usarFib: boolean;
  gateEstricto: boolean;
  /** «Key Value» de UT Bot Alerts: su sensibilidad. Por defecto, 1. */
  utKey?: number;
  /** Periodo del ATR de UT Bot Alerts. Por defecto, 10. */
  utLen?: number;
}

/* ==========================================================================
 * Retrocesos de Fibonacci
 *
 * Port del «Fib Retracement» del usuario. El motor vive en
 * `backend/fibonacci.py`, con pruebas ejecutables; aquí sólo se le pone tipo.
 * Nombres copiados del `return` del endpoint, no inventados.
 * ======================================================================== */

/** Marcos de la tarjeta. Los intradía salen de `/intradia`, el semanal se
 *  reagrupa desde el diario. */
export type MarcoFib = '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

/**
 * Cómo se ancla el tramo.
 *
 * `lookback` es el del script: máximo y mínimo de las últimas N velas, cada
 * uno por su lado. `pivotes` usa swings confirmados y corrige el sesgo de que
 * los dos extremos puedan no pertenecer al mismo impulso.
 */
export type ModoFib = 'lookback' | 'pivotes';

export interface NivelFib {
  ratio: number;
  etiqueta: string;
  precio: number;
  tipo: 'retroceso' | 'extension';
  /** Debajo del precio es soporte; encima, resistencia. Es el color del script. */
  papel: 'soporte' | 'resistencia';
}

export interface Fibonacci {
  simbolo: string;
  marco: MarcoFib;
  barras: number;
  desde: string;
  hasta: string;
  /** El modo que se acabó usando, que puede no ser el pedido. */
  modo: ModoFib;
  modoPedido: ModoFib;
  ventana: number;
  pivote: number;
  ultimaVelaCerrada: boolean;

  impulso: {
    alto: number;
    bajo: number;
    rango: number;
    direccion: 'alcista' | 'bajista';
    invertido: boolean;
    /** Índices dentro de la ventana dibujada, o `null` si caen fuera. */
    iAltoSerie: number | null;
    iBajoSerie: number | null;
    fechaAlto: string;
    fechaBajo: string;
    separacionVelas: number;
  };

  niveles: NivelFib[];
  actual: { precio: number; ratio: number; zona: string };
  velas: Vela[];
  /** Sesgos detectados. Cambian cómo se lee el gráfico. */
  avisos: string[];
}

/** Mandos de la tarjeta de Fibonacci. */
export interface ControlesFib {
  marco: MarcoFib;
  modo: ModoFib;
  ventana: number;
  invertir: boolean;
  extras: boolean;
  extensiones: boolean;
}

/* ==========================================================================
 * Puntos pivote de Woodie
 *
 * Motor en `backend/pivots.py`, con pruebas ejecutables. Nombres copiados del
 * `return` del endpoint, no inventados.
 * ======================================================================== */

export type MarcoPivote = '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

/**
 * Variante del PP de Woodie.
 *
 * `apertura` es la de verdad —`(H+L+2·O_actual)/4`— y la única que incorpora
 * el hueco de apertura. `cierre` es la que circula por internet,
 * `(H+L+2·C_anterior)/4`, y se calcula sólo para poder comparar las dos.
 */
export type VarianteWoodie = 'apertura' | 'cierre';

export interface NivelPivote {
  clave: string;
  precio: number;
  papel: 'soporte' | 'resistencia';
  distanciaPct: number | null;
  /** De los últimos N periodos, en cuántos llegó el precio hasta aquí. */
  toquesPct: number | null;
  toquesMuestra: number;
  /** El mismo nivel según el pivote clásico, para poder comparar. */
  clasico: number | null;
}

/**
 * Una de las seis condiciones de la secuencia, con su medida.
 *
 * Las tres primeras se leen en la barra actual; las tres últimas son ESTADOS
 * de la secuencia —«se rompió un máximo» pasó y quedó registrado— y salen de
 * la fase alcanzada, no de comparar el cierre de hoy.
 */
export interface CondicionPivote {
  texto: string;
  cumplida: boolean;
  /** La cifra que respalda el ✓. Un check sin medida no se puede auditar. */
  detalle: string;
}

export interface UltimaSenalPivote {
  direccion: 'compra' | 'venta';
  veredicto: 'LONG' | 'SHORT';
  precio: number;
  stop: number | null;
  barrasAtras: number;
}

export interface Pivotes {
  simbolo: string;
  marco: MarcoPivote;
  /** De qué periodo salen los niveles: diario, semanal o mensual. */
  periodo: string;
  variante: VarianteWoodie;
  barras: number;
  ultimaVelaCerrada: boolean;

  base: {
    alto: number;
    bajo: number;
    cierre: number;
    aperturaActual: number;
    huecoPct: number | null;
    fecha: string;
  };

  niveles: NivelPivote[];
  nivelCercano: string;

  confluencia: {
    ppWoodie: number;
    ppClasico: number;
    /** El PP según la fórmula del texto, con el cierre doble. */
    ppWoodieCierre: number;
    distanciaPct: number | null;
    umbralPct: number;
    hayConfluencia: boolean;
    desvioVariantesPct: number | null;
  };

  vwap: {
    valor: number | null;
    /** Al inicio de qué periodo está anclado. No es rodante. */
    anclaje: string;
    precioSobre: boolean;
    distanciaPct: number | null;
    nota: string;
  };

  superTrend: { alcista: boolean; nivel: number | null; factor: number };

  /**
   * Acuerdo entre el lado del PP y el lado del VWAP. Por encima del 85 % las
   * dos condiciones son la misma lectura contada dos veces.
   */
  colinealidad: { acuerdoPct: number | null; muestra: number };

  precio: { actual: number; sobrePP: boolean; sobreVWAP: boolean; atr: number | null };

  senal: {
    /**
     * LONG o SHORT, y SÓLO con las seis condiciones cumplidas en orden.
     * `null` el resto del tiempo. No confundir con `direccion`, que es el
     * sesgo: tener el precio sobre el PP no es una orden de compra.
     */
    veredicto: 'LONG' | 'SHORT' | null;
    condiciones: CondicionPivote[];
    condicionesCumplidas: number;
    /** De qué lado se está auditando la lista: el de la secuencia viva. */
    ladoAuditado: 'long' | 'short';
    ultimaSenal: UltimaSenalPivote | null;
    direccion: 'compra' | 'venta' | 'ninguna';
    disparo: boolean;
    operable: boolean;
    motivoNoOperable: string | null;
    entrada: number | null;
    stop: number | null;
    objetivo1: number | null;
    objetivo2: number | null;
    riesgoBeneficio: number | null;
    marcasTotales: number;
  };

  /** Fase de la secuencia: 0 sin sesgo, 1 sesgo, 2 ruptura, 3 retroceso. */
  fase: {
    numero: number;
    nombre: string;
    direccion: string;
    barrasEnFase: number | null;
    caducidad: number;
  };

  avisos: string[];
}

export interface ControlesPivote {
  marco: MarcoPivote;
  variante: VarianteWoodie;
}
