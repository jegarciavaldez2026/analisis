/**
 * ============================================================================
 * Trading simulado — contrato de datos
 * ============================================================================
 * Los nombres de campo son **LOS DEL BACKEND**, copiados del `return` de
 * `simulacion.tarjeta()`, `simulacion.metricas()` y del bloque de endpoints de
 * `server.py`. No se traducen a camelCase y es deliberado: en esta pantalla ya
 * se escribieron cuatro traductores con nombres «plausibles» —noticias,
 * balance, curva de patrimonio e Ichimoku— y los cuatro salieron con guiones.
 * `tsc` no lo ve (la respuesta es `any`), el lint tampoco, y el panel no se
 * rompe: se lee como «no hay dato».
 *
 * Un traductor menos es un sitio menos donde eso puede volver a pasar.
 * ==========================================================================*/

/* ==========================================================================
 * Vocabulario — ORDEN y POSICIÓN son cosas distintas
 * ======================================================================== */

export type Direccion = 'long' | 'short';
export type TipoOrden = 'MARKET' | 'LIMIT';

/**
 * Estados de la ORDEN. Es la INTENCIÓN: nace PENDING y muere en un estado
 * terminal. `CANCELLED` es un verbo de la orden, nunca de la posición.
 */
export type EstadoOrdenSim = 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED';

/** Estados de la POSICIÓN. Es la CONSECUENCIA: sólo existe si la orden se ejecutó. */
export type EstadoPosicionSim = 'OPEN' | 'CLOSED';

/**
 * `LIQUIDACION` no estaba en el encargo y se añade marcada: no es una decisión
 * de nadie, es una consecuencia aritmética, y sólo puede aparecer con
 * apalancamiento mayor que 1.
 */
export type MotivoCierre =
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'MANUAL_CLOSE'
  | 'STRATEGY_EXIT'
  | 'END_OF_SESSION'
  | 'LIQUIDACION';

export type OrigenOperacion = 'manual' | 'robot';

export type MarcoSim = '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export const MARCOS_SIM: readonly MarcoSim[] = ['5m', '15m', '1h', '4h', '1d', '1w'];

/* ==========================================================================
 * Orden
 * ======================================================================== */

export interface OrdenSim {
  /** `ORD-2026-0001`. Correlativo por año, atómico en el servidor. */
  id: string;
  simbolo: string;
  direccion: Direccion;
  tipo: TipoOrden;
  cantidad: number;
  estado: EstadoOrdenSim;
  /** Sólo en LIMIT. En un MARKET no hay precio pedido, hay prisa. */
  precio_limite: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  apalancamiento: number;
  creada_ts: number;
  resuelta_ts: number | null;
  precio_ejecucion: number | null;
  comision: number;
  /** El puente hacia la consecuencia. `null` mientras no haya posición. */
  posicion_id: string | null;
  origen: OrigenOperacion;
  signal_id: string | null;
  decision_id: string | null;
  /** Por qué se rechazó o caducó. Un rechazo sin motivo no se audita. */
  motivo: string | null;
  caduca_ts: number | null;
}

/* ==========================================================================
 * Posición — lo que dibuja la tarjeta
 * ======================================================================== */

/** Distancia a un nivel, en absoluto y en porcentaje sobre el precio actual. */
export interface Distancia {
  precio: number;
  absoluta: number;
  pct: number;
}

export interface TarjetaSim {
  /** `SIM-2026-0001`. */
  id: string;
  simbolo: string;
  direccion: Direccion;
  estado: EstadoPosicionSim;
  cantidad: number;
  entrada: number;
  precio_actual: number;
  valor_posicion: number;
  nocional_entrada: number;
  margen: number;
  apalancamiento: number;

  stop_loss: number | null;
  take_profit: number | null;
  distancia_stop: Distancia | null;
  distancia_objetivo: Distancia | null;

  /** Neto: incluye comisión de entrada, la estimada de salida y el préstamo. */
  pnl: number | null;
  pnl_bruto: number | null;
  /**
   * Cuánto se ha movido el PRECIO. Es el que corresponde a la maqueta.
   * Con apalancamiento 1× coincide con `pnl_pct_capital`; por encima, no.
   */
  pnl_pct_precio: number | null;
  /** Cuánto ha ganado TU dinero: sobre el margen retenido, no sobre el nocional. */
  pnl_pct_capital: number | null;

  coste_prestamo: number;
  comisiones: number;
  riesgo_abierto: number | null;
  riesgo_beneficio: number | null;
  /** Sólo con apalancamiento > 1. `null` en el resto. */
  nivel_liquidacion: number | null;

  abierta_ts: number;
  cerrada_ts: number | null;
  /** Congelado al cerrar: no sigue corriendo en el historial. */
  segundos_abierta: number;

  salida: number | null;
  motivo_cierre: MotivoCierre | null;
  resultado: number | null;
  origen: OrigenOperacion;
  orden_apertura_id: string | null;
  decision_id: string | null;
}

/* ==========================================================================
 * Cuenta
 * ======================================================================== */

export interface CuentaSim {
  capital_inicial: number;
  /** Capital realizado. **Sólo** posiciones cerradas. Abrir no lo mueve. */
  balance: number;
  /** Balance más el resultado latente de lo abierto. */
  equity: number;
  /** Balance menos el margen retenido: lo que queda para abrir. */
  libre: number;
  margen_retenido: number;
  pnl_total: number;
  pnl_total_pct: number | null;
  pnl_abierto: number;
  pnl_dia: number;
  operaciones: number;
  ganadoras: number;
  perdedoras: number;
  /** `null` sin operaciones. Un 0 % sin haber operado se lee «pierde siempre». */
  win_rate: number | null;
  profit_factor: number | null;
  expectativa: number | null;
  beneficio_bruto: number;
  perdida_bruta: number;
  mejor: number | null;
  peor: number | null;
  /** Sobre la CURVA de patrimonio, no sobre operaciones. Negativo o cero. */
  drawdown_max_pct: number;
  abiertas: number;
  pendientes: number;
}

export interface ParametrosSim {
  comision_pct: number;
  deslizamiento_pct: number;
  apalancamiento: number;
  coste_prestamo_anual_pct: number;
  riesgo_max_pct: number;
  max_posiciones: number;
  rb_minimo: number;
  enfriamiento_barras: number;
}

export interface RobotSim {
  activo: boolean;
  simbolo: string | null;
  marco: MarcoSim;
  capital_pct: number;
  riesgo_pct: number;
  cambiado?: string;
}

export interface PuntoCurvaSim {
  ts: number;
  equity: number;
  balance: number;
  abiertas: number;
}

export interface EventoSim {
  tipo: string;
  ts: number;
  detalle: string;
  orden_id: string | null;
  posicion_id: string | null;
  datos: Record<string, unknown>;
}

/* ==========================================================================
 * Rechazos y decisiones
 * ======================================================================== */

export interface RechazoSim {
  codigo: string;
  mensaje: string;
  /** `false` = advertencia que NO impide operar (R/B bajo, falta de stop). */
  bloquea: boolean;
}

/** Una condición del robot CON SU MEDIDA. Un ✓ sin cifra no se puede auditar. */
export interface RazonSim {
  etiqueta: string;
  valor: string;
  cumplida: boolean;
}

export interface DecisionSim {
  direccion: Direccion | 'ninguna';
  fuente: string;
  simbolo: string;
  marco: string;
  signal_id: string | null;
  ts_barra: number | null;
  razones: RazonSim[];
  vetos: string[];
  notas: string[];
  /** 0,25–1,0. Baja con el conflicto entre marcos, nunca se multiplica. */
  factor_tamano: number;
  motivo_no_operar: string | null;
  opera: boolean;
  entrada: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  cantidad: number | null;
}

export interface DecisionGuardada extends DecisionSim {
  id: string;
  ts: string;
}

/* ==========================================================================
 * Respuestas
 * ======================================================================== */

export interface EstadoSimulacion {
  cuenta: CuentaSim;
  parametros: ParametrosSim;
  robot: RobotSim;
  abiertas: TarjetaSim[];
  historial: TarjetaSim[];
  /** TODAS las órdenes, incluidas las rechazadas y canceladas. */
  ordenes: OrdenSim[];
  /** Sólo las PENDING. Todavía no son posiciones. */
  pendientes: OrdenSim[];
  curva: PuntoCurvaSim[];
  eventos: EventoSim[];
  avisos: string[];
  ultimo_ts: number | null;
  aviso_alcance: string;
}

export interface RespuestaOrden {
  ok: boolean;
  orden: OrdenSim;
  posicion: TarjetaSim | null;
  rechazos: RechazoSim[];
  avisos: string[];
  nota_tamano: string | null;
  eventos: EventoSim[];
  cuenta: CuentaSim;
}

export interface RespuestaRobot {
  ok: boolean;
  motivo?: string;
  decision: DecisionSim | null;
  decision_id?: string;
  orden?: OrdenSim;
  posicion?: TarjetaSim | null;
  rechazos?: RechazoSim[];
  eventos?: EventoSim[];
  resumen?: string;
}

/* ==========================================================================
 * Lo que manda el formulario
 * ======================================================================== */

export interface BoletaManual {
  simbolo: string;
  direccion: Direccion;
  tipo: TipoOrden;
  /** Explícita, o `null` para que la calcule el riesgo. */
  cantidad: number | null;
  precio_limite: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  apalancamiento: number;
  riesgo_pct: number | null;
  capital_pct: number | null;
  caduca_en_horas: number | null;
}

/** Modo de operación de la pantalla. El robot es otra bandera, aparte. */
export type ModoOperacion = 'manual' | 'automatico';
