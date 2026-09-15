/**
 * ============================================================================
 * Sesiones de mercado — port del «Trading Sessions» (Pine v6)
 * ============================================================================
 * Cálculo puro, sin React ni dependencias: lo dibuja `GraficoOperaciones` y lo
 * prueba `scripts/probar-sesiones.mjs` con Node, sin montar nada.
 *
 * --------------------------------------------------------------------------
 * Lo que se porta tal cual
 * --------------------------------------------------------------------------
 * · Una barra pertenece a la sesión si su HORA DE APERTURA, leída en la zona
 *   IANA de la sesión, cae en [inicio, fin). Es lo que hace
 *   `time("", sesion, zona)`. Con nombres IANA el horario de verano sale solo:
 *   hay semanas de marzo y de octubre en que Londres y Nueva York no cambian a
 *   la vez, y un desfase fijo en horas se equivocaría justo ahí.
 * · Caja de máximo a mínimo, línea de apertura (primera barra) y línea de
 *   cierre (última barra), con el relleno entre las dos.
 * · El recorrido de la sesión.
 *
 * --------------------------------------------------------------------------
 * Lo que se cambia, y por qué
 * --------------------------------------------------------------------------
 * · **El corte de día.** El Pine abre sesión nueva con
 *   `timeframe.change("1D")`, que es el cambio de día en la zona del GRÁFICO,
 *   no en la de la sesión. Una sesión que cruza la medianoche de la bolsa
 *   —Tokio sobre un gráfico de Nueva York— sale partida en dos cajas. Aquí el
 *   día es el LOCAL DE LA SESIÓN.
 * · **«Avg» no es un VWAP.** El Pine dibuja la media simple de los cierres, y
 *   además como horizontal al valor FINAL de la sesión: sobre una sesión
 *   pasada pinta en su primera barra una media que todavía no existía. Se
 *   sustituye por el VWAP anclado a la apertura de la sesión, acumulado barra
 *   a barra (precio típico, igual que `vwap_anclado` en `pivots.py`).
 * · **El recorrido en ticks.** Yahoo no da `syminfo.mintick`. Se da en precio y
 *   en porcentaje, que además se compara entre valores.
 * · **Añadido: POC de la sesión.** Mismo reparto que `nqe.py`: el volumen de
 *   cada vela se reparte a partes iguales entre las filas que toca su rango.
 *   Sin datos de tick es una APROXIMACIÓN y se rotula así.
 *
 * --------------------------------------------------------------------------
 * Límite del dato que hay que decir en pantalla
 * --------------------------------------------------------------------------
 * Las acciones de EE. UU. sólo traen velas de 09:30 a 16:00 de Nueva York. La
 * sesión de Londres (08:30–16:30 en Londres, 03:30–11:30 en Nueva York) queda
 * reducida a su solape: medido sobre AAPL en 15m, 8 de 32 barras. Por eso cada
 * tramo lleva `barras` y `esperadas`: una caja de Londres sobre AAPL mide dos
 * horas, no la sesión de Londres, y la tarjeta tiene que decirlo.
 */

export interface VelaSesion {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type ClaveSesion = 'londres' | 'nuevayork';

export interface DefSesion {
  clave: string;
  nombre: string;
  corto: string;
  /** Minutos desde medianoche, en la hora LOCAL de `zona`. */
  inicio: number;
  fin: number;
  /** Nombre IANA: incluye el horario de verano, un «GMT-5» no. */
  zona: string;
}

const hm = (texto: string): number => {
  const [h, m] = texto.split(':').map(Number);
  return h * 60 + m;
};

/** Los mismos horarios que trae el script por defecto. */
export const SESIONES: readonly DefSesion[] = [
  { clave: 'londres', nombre: 'Londres', corto: 'LON', inicio: hm('08:30'), fin: hm('16:30'), zona: 'Europe/London' },
  { clave: 'nuevayork', nombre: 'Nueva York', corto: 'NY', inicio: hm('09:30'), fin: hm('16:00'), zona: 'America/New_York' },
];

/** Filas del perfil de volumen de cada sesión. */
export const FILAS_POC = 24;

/**
 * Marcos donde se dibujan. El Pine se niega en diario; aquí además en 4H: una
 * sesión de Nueva York son una o dos velas de cuatro horas, y la vela de las
 * 08:00 —que contiene la apertura de las 09:30— queda FUERA porque se mira su
 * hora de apertura. La caja saldría con un recorrido que no es el de la sesión.
 */
const MARCOS_CON_SESIONES = new Set(['1m', '5m', '15m', '30m', '1H']);

export function marcoAdmiteSesiones(marco: string): boolean {
  return MARCOS_CON_SESIONES.has(marco);
}

export interface TramoSesion {
  clave: string;
  nombre: string;
  corto: string;
  /** Día LOCAL de la sesión, AAAA-MM-DD. */
  dia: string;
  /** Primera y última vela de la sesión, índices de la serie completa. */
  i0: number;
  i1: number;
  apertura: number;
  cierre: number;
  maximo: number;
  minimo: number;
  /**
   * VWAP acumulado desde la apertura, uno por vela de i0 a i1. `null` mientras
   * no haya habido volumen: un cero se dibujaría como un precio.
   */
  vwap: (number | null)[];
  /** Precio de la fila con más volumen. `null` si la sesión no tiene volumen. */
  poc: number | null;
  volumen: number;
  barras: number;
  /** Velas que cabrían en la sesión con este marco. */
  esperadas: number;
  /** La última vela de la serie está dentro y la sesión aún no ha terminado. */
  enCurso: boolean;
}

/* ==========================================================================
 * Hora local por zona
 * ======================================================================== */

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (!f) {
    // `hourCycle: 'h23'`: con `hour12: false` algunos motores escriben «24» a
    // medianoche, y la barra de las 00:00 caería al final del día.
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formateadores.set(zona, f);
  }
  return f;
}

export function horaLocal(ms: number, zona: string): { dia: string; minuto: number } {
  const partes: Record<string, string> = {};
  for (const p of formateador(zona).formatToParts(new Date(ms))) partes[p.type] = p.value;
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    minuto: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

/** Paso de la serie en minutos: la mediana, para que un hueco de fin de semana no lo falsee. */
function pasoMinutos(velas: readonly VelaSesion[]): number {
  const difs: number[] = [];
  for (let i = 1; i < Math.min(velas.length, 400); i++) {
    const d = velas[i].t - velas[i - 1].t;
    if (d > 0) difs.push(d);
  }
  if (!difs.length) return 0;
  difs.sort((a, b) => a - b);
  return difs[Math.floor(difs.length / 2)] / 60000;
}

/* ==========================================================================
 * Cálculo
 * ======================================================================== */

function poc(velas: readonly VelaSesion[], i0: number, i1: number, lo: number, hi: number): number | null {
  if (!(hi > lo)) return null;
  const paso = (hi - lo) / FILAS_POC;
  const cubos = new Array<number>(FILAS_POC).fill(0);
  let hayVolumen = false;
  for (let i = i0; i <= i1; i++) {
    const { h, l, v } = velas[i];
    if (!(Number.isFinite(h) && Number.isFinite(l) && v > 0)) continue;
    const a = Math.min(FILAS_POC - 1, Math.max(0, Math.floor((l - lo) / paso)));
    const b = Math.min(FILAS_POC - 1, Math.max(0, Math.floor((h - lo) / paso)));
    for (let k = a; k <= b; k++) cubos[k] += v / (b - a + 1);
    hayVolumen = true;
  }
  if (!hayVolumen) return null;
  let mejor = 0;
  for (let k = 1; k < FILAS_POC; k++) if (cubos[k] > cubos[mejor]) mejor = k;
  return lo + (mejor + 0.5) * paso;
}

function tramosDe(velas: readonly VelaSesion[], def: DefSesion, paso: number): TramoSesion[] {
  const salida: TramoSesion[] = [];
  let actual: TramoSesion | null = null;
  let pv = 0;
  let vol = 0;

  const cerrar = () => {
    if (!actual) return;
    actual.poc = poc(velas, actual.i0, actual.i1, actual.minimo, actual.maximo);
    salida.push(actual);
    actual = null;
  };

  for (let i = 0; i < velas.length; i++) {
    const vela = velas[i];
    const { dia, minuto } = horaLocal(vela.t, def.zona);
    if (minuto < def.inicio || minuto >= def.fin) {
      cerrar();
      continue;
    }
    if (!actual || actual.dia !== dia) {
      cerrar();
      pv = 0;
      vol = 0;
      actual = {
        clave: def.clave,
        nombre: def.nombre,
        corto: def.corto,
        dia,
        i0: i,
        i1: i,
        apertura: vela.o,
        cierre: vela.c,
        maximo: -Infinity,
        minimo: Infinity,
        vwap: [],
        poc: null,
        volumen: 0,
        barras: 0,
        esperadas: paso > 0 ? Math.ceil((def.fin - def.inicio) / paso) : 0,
        enCurso: false,
      };
    }
    const t: TramoSesion = actual;
    t.i1 = i;
    t.cierre = vela.c;
    if (Number.isFinite(vela.h)) t.maximo = Math.max(t.maximo, vela.h);
    if (Number.isFinite(vela.l)) t.minimo = Math.min(t.minimo, vela.l);
    t.barras += 1;
    if (vela.v > 0 && Number.isFinite(vela.h) && Number.isFinite(vela.l)) {
      pv += ((vela.h + vela.l + vela.c) / 3) * vela.v;
      vol += vela.v;
    }
    t.volumen = vol;
    t.vwap.push(vol > 0 ? pv / vol : null);

    if (i === velas.length - 1) t.enCurso = paso > 0 && minuto + paso < def.fin;
  }
  cerrar();
  return salida;
}

const cache = new WeakMap<readonly VelaSesion[], TramoSesion[]>();

/**
 * Tramos de todas las sesiones, en orden de aparición.
 *
 * Se calcula sobre la serie ENTERA aunque sólo se dibuje la cola: el VWAP y el
 * POC de una sesión que empezó antes de la ventana visible salen con todas sus
 * velas, no con las que caben en pantalla.
 */
export function calcularSesiones(
  velas: readonly VelaSesion[],
  defs: readonly DefSesion[] = SESIONES,
): TramoSesion[] {
  const cacheable = defs === SESIONES;
  if (cacheable) {
    const guardado = cache.get(velas);
    if (guardado) return guardado;
  }
  const paso = pasoMinutos(velas);
  const tramos = defs.flatMap((d) => tramosDe(velas, d, paso)).sort((a, b) => a.i0 - b.i0);
  if (cacheable) cache.set(velas, tramos);
  return tramos;
}
