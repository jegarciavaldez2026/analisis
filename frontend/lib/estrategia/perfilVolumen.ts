/**
 * ============================================================================
 * Analítica de mercado sobre las velas que ya están en memoria
 * ============================================================================
 * Todo lo de aquí se calcula a partir del `Vela[]` que ya trajo
 * `/indicators-chart`. **Ni una petición nueva.** No es una optimización
 * cosmética: el proveedor limita por IP y ya nos ha bloqueado una vez, así que
 * cada gráfico que se pueda derivar de datos que ya tenemos es un gráfico que
 * no vuelve a gastar cuota.
 *
 * Lo que hay y lo que NO hay, dicho de frente:
 *
 * - **Perfil de volumen (POC/VAH/VAL)** — real. Se reparte el volumen de cada
 *   vela por su rango de precio. Es una aproximación conocida: sin datos de
 *   tick no se sabe a qué precio EXACTO se cruzó cada acción dentro de la
 *   vela, así que se reparte uniformemente. Con barras diarias y suficientes
 *   sesiones, el POC que sale es estable y utilizable.
 * - **VWAP y bandas** — real y exacto para la ventana dada.
 * - **Delta acumulado** — PROXY, y se rotula como tal. Usa la posición del
 *   cierre en el rango (CLV), no la clasificación de agresores contra bid/ask,
 *   que necesitaría datos de tick. Un cierre alto puede venir de compra
 *   institucional o de un cierre técnico con volumen ridículo; esto no los
 *   distingue.
 * - **Estructura de mercado** — real. Pivotes por umbral de ATR y lectura de
 *   máximos/mínimos crecientes o decrecientes.
 */

import { Vela } from './tipos';

/* ==========================================================================
 * Perfil de volumen
 * ======================================================================== */

export interface NivelPerfil {
  /** Centro del intervalo de precio. */
  precio: number;
  volumen: number;
  /** Fracción del volumen total de la ventana, 0-1. */
  fraccion: number;
  /** Dentro del área de valor (el 70 % central del volumen). */
  enAreaValor: boolean;
}

export interface PerfilVolumen {
  niveles: NivelPerfil[];
  /** Point of Control: el precio donde más se ha negociado. */
  poc: number;
  /** Value Area High / Low: los bordes del 70 % del volumen. */
  vah: number;
  val: number;
  volumenTotal: number;
  /** Cuántas sesiones entran en el perfil. */
  sesiones: number;
}

/**
 * Perfil de volumen por precio.
 *
 * El volumen de cada vela se reparte por igual entre los intervalos que cruza
 * su rango [mínimo, máximo]. Es el método estándar cuando no hay datos de
 * tick. La alternativa —cargar todo el volumen en el precio de cierre— produce
 * un perfil con picos falsos en los cierres y es claramente peor.
 *
 * El área de valor se expande desde el POC hacia el intervalo vecino con más
 * volumen, hasta cubrir `fraccionArea` del total. Es el algoritmo clásico de
 * Market Profile, no una banda de desviaciones típicas.
 */
export function perfilVolumen(
  velas: Vela[],
  intervalos = 48,
  fraccionArea = 0.7,
): PerfilVolumen | null {
  if (!velas.length) return null;

  const min = Math.min(...velas.map((v) => v.l));
  const max = Math.max(...velas.map((v) => v.h));
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;

  const alto = (max - min) / intervalos;
  const cubos = new Array<number>(intervalos).fill(0);

  for (const v of velas) {
    const vol = Number.isFinite(v.v) ? v.v : 0;
    if (vol <= 0) continue;

    const desde = Math.max(0, Math.floor((v.l - min) / alto));
    const hasta = Math.min(intervalos - 1, Math.floor((v.h - min) / alto));
    const n = hasta - desde + 1;
    if (n <= 0) continue;
    // Reparto uniforme por los intervalos que toca la vela.
    const porCubo = vol / n;
    for (let i = desde; i <= hasta; i += 1) cubos[i] += porCubo;
  }

  const volumenTotal = cubos.reduce((s, x) => s + x, 0);
  if (volumenTotal <= 0) return null;

  const precioDe = (i: number) => min + alto * (i + 0.5);

  // POC: el intervalo con más volumen.
  let iPoc = 0;
  for (let i = 1; i < intervalos; i += 1) if (cubos[i] > cubos[iPoc]) iPoc = i;

  // Área de valor: se crece desde el POC hacia el vecino más gordo.
  const objetivo = volumenTotal * fraccionArea;
  let acumulado = cubos[iPoc];
  let bajo = iPoc;
  let alto_ = iPoc;
  while (acumulado < objetivo && (bajo > 0 || alto_ < intervalos - 1)) {
    const candidatoAbajo = bajo > 0 ? cubos[bajo - 1] : -1;
    const candidatoArriba = alto_ < intervalos - 1 ? cubos[alto_ + 1] : -1;
    if (candidatoArriba >= candidatoAbajo) {
      alto_ += 1;
      acumulado += cubos[alto_];
    } else {
      bajo -= 1;
      acumulado += cubos[bajo];
    }
  }

  const niveles: NivelPerfil[] = cubos.map((volumen, i) => ({
    precio: precioDe(i),
    volumen,
    fraccion: volumen / volumenTotal,
    enAreaValor: i >= bajo && i <= alto_,
  }));

  return {
    niveles,
    poc: precioDe(iPoc),
    vah: precioDe(alto_),
    val: precioDe(bajo),
    volumenTotal,
    sesiones: velas.length,
  };
}

/* ==========================================================================
 * VWAP con bandas de desviación
 * ======================================================================== */

export interface VWAPSerie {
  vwap: (number | null)[];
  /** Bandas a ±1 y ±2 desviaciones típicas ponderadas por volumen. */
  sup1: (number | null)[];
  inf1: (number | null)[];
  sup2: (number | null)[];
  inf2: (number | null)[];
  /** Último valor, para la lectura de cabecera. */
  ultimo: number | null;
  /** Distancia del último cierre al VWAP, en %. */
  distanciaPct: number | null;
}

/**
 * VWAP acumulado desde el inicio de la ventana, con bandas.
 *
 * La desviación se pondera por volumen, igual que el propio VWAP: usar una
 * desviación simple sobre los cierres daría unas bandas que no corresponden a
 * la línea que envuelven.
 */
export function vwapConBandas(velas: Vela[]): VWAPSerie {
  const n = velas.length;
  const vwap: (number | null)[] = new Array(n).fill(null);
  const sup1: (number | null)[] = new Array(n).fill(null);
  const inf1: (number | null)[] = new Array(n).fill(null);
  const sup2: (number | null)[] = new Array(n).fill(null);
  const inf2: (number | null)[] = new Array(n).fill(null);

  let sumaPV = 0;
  let sumaV = 0;
  let sumaPPV = 0; // Σ v·p² — para la varianza ponderada.

  for (let i = 0; i < n; i += 1) {
    const v = velas[i];
    const vol = Number.isFinite(v.v) && v.v > 0 ? v.v : 0;
    const tipico = (v.h + v.l + v.c) / 3;
    sumaPV += tipico * vol;
    sumaV += vol;
    sumaPPV += tipico * tipico * vol;

    if (sumaV <= 0) continue;
    const media = sumaPV / sumaV;
    vwap[i] = media;

    // Varianza ponderada = E[p²] − E[p]². El máximo con 0 evita que un error
    // de redondeo la deje ligeramente negativa y la raíz devuelva NaN.
    const varianza = Math.max(0, sumaPPV / sumaV - media * media);
    const sigma = Math.sqrt(varianza);
    sup1[i] = media + sigma;
    inf1[i] = media - sigma;
    sup2[i] = media + 2 * sigma;
    inf2[i] = media - 2 * sigma;
  }

  const ultimo = n > 0 ? vwap[n - 1] : null;
  const cierre = n > 0 ? velas[n - 1].c : null;
  const distanciaPct =
    ultimo !== null && cierre !== null && ultimo > 0 ? ((cierre - ultimo) / ultimo) * 100 : null;

  return { vwap, sup1, inf1, sup2, inf2, ultimo, distanciaPct };
}

/* ==========================================================================
 * Delta acumulado — PROXY, no delta de agresores
 * ======================================================================== */

export interface DeltaAcumulado {
  /** Serie acumulada del delta estimado. */
  serie: number[];
  /** Delta de la última vela. */
  ultimo: number;
  /** Positivo = presión compradora acumulada en la ventana. */
  total: number;
  /**
   * Divergencia: el precio hace un máximo nuevo y el delta acumulado no, o al
   * revés. Es la lectura por la que existe este gráfico.
   */
  divergencia: 'alcista' | 'bajista' | null;
}

/**
 * Delta acumulado estimado con la posición del cierre en el rango (CLV).
 *
 * NO es delta de agresores. El delta de verdad clasifica cada operación contra
 * el bid y el ask, y para eso hacen falta datos de tick que esta fuente no
 * sirve. Lo que mide esto es dónde cerró el precio dentro del rango del día,
 * ponderado por volumen — que correlaciona con la presión compradora pero no
 * es lo mismo, y en un cierre técnico con poco volumen puede engañar.
 *
 * Se conserva porque la DIVERGENCIA sí es informativa aunque el nivel absoluto
 * no lo sea: si el precio marca máximos y esta serie no acompaña, algo no está
 * confirmando el movimiento.
 */
export function deltaAcumulado(velas: Vela[]): DeltaAcumulado | null {
  if (!velas.length) return null;

  const serie: number[] = [];
  let acumulado = 0;
  let ultimo = 0;

  for (const v of velas) {
    const rango = v.h - v.l;
    const vol = Number.isFinite(v.v) && v.v > 0 ? v.v : 0;
    // Rango cero (vela plana): no hay información direccional, delta 0. Sin
    // esta guarda sería una división por cero.
    const clv = rango > 0 ? ((v.c - v.l) - (v.h - v.c)) / rango : 0;
    ultimo = clv * vol;
    acumulado += ultimo;
    serie.push(acumulado);
  }

  // Divergencia sobre el último tramo: se comparan los extremos de la segunda
  // mitad de la ventana con los de la primera.
  let divergencia: 'alcista' | 'bajista' | null = null;
  if (velas.length >= 10) {
    const mitad = Math.floor(velas.length / 2);
    const precioMax1 = Math.max(...velas.slice(0, mitad).map((v) => v.c));
    const precioMax2 = Math.max(...velas.slice(mitad).map((v) => v.c));
    const deltaMax1 = Math.max(...serie.slice(0, mitad));
    const deltaMax2 = Math.max(...serie.slice(mitad));
    const precioMin1 = Math.min(...velas.slice(0, mitad).map((v) => v.c));
    const precioMin2 = Math.min(...velas.slice(mitad).map((v) => v.c));
    const deltaMin1 = Math.min(...serie.slice(0, mitad));
    const deltaMin2 = Math.min(...serie.slice(mitad));

    if (precioMax2 > precioMax1 && deltaMax2 < deltaMax1) divergencia = 'bajista';
    else if (precioMin2 < precioMin1 && deltaMin2 > deltaMin1) divergencia = 'alcista';
  }

  return { serie, ultimo, total: acumulado, divergencia };
}

/* ==========================================================================
 * Estructura de mercado
 * ======================================================================== */

export interface Pivote {
  indice: number;
  precio: number;
  tipo: 'alto' | 'bajo';
}

export interface EstructuraMercado {
  pivotes: Pivote[];
  /**
   * Lectura de la secuencia.
   *
   * `sin_estructura` NO es lo mismo que `lateral`, y la diferencia importa:
   * «lateral» afirma que el precio está en rango, y «sin estructura» dice que
   * no hay pivotes bastantes para afirmar nada. La primera versión devolvía
   * «lateral» por defecto y una tendencia limpia sin retrocesos —que no genera
   * pivotes— salía rotulada como rango. Eso es afirmar lo contrario de lo que
   * pasa, que es peor que callarse.
   */
  sesgo: 'alcista' | 'bajista' | 'lateral' | 'sin_estructura';
  /** Texto corto que explica en qué se basa el sesgo. */
  detalle: string;
  /** Última rotura de estructura, si la hay. */
  rotura: { indice: number; precio: number; direccion: 'alcista' | 'bajista' } | null;
}

/**
 * Pivotes por umbral de ATR y lectura de la secuencia.
 *
 * El umbral en múltiplos de ATR —y no un porcentaje fijo— hace que el mismo
 * código sirva para un valor que se mueve un 1 % al día y para otro que se
 * mueve un 8 %: un giro sólo cuenta como pivote si es grande PARA ESE valor.
 */
export function estructuraMercado(velas: Vela[], factorATR = 2): EstructuraMercado | null {
  if (velas.length < 20) return null;

  // ATR simple sobre la ventana, para fijar el umbral del zigzag.
  let sumaRango = 0;
  for (let i = 1; i < velas.length; i += 1) {
    const v = velas[i];
    const previo = velas[i - 1].c;
    sumaRango += Math.max(v.h - v.l, Math.abs(v.h - previo), Math.abs(v.l - previo));
  }
  const atr = sumaRango / (velas.length - 1);
  const umbral = atr * factorATR;
  if (!(umbral > 0)) return null;

  const pivotes: Pivote[] = [];
  let dir: 'arriba' | 'abajo' | null = null;
  let iExtremo = 0;
  let extremo = velas[0].c;

  for (let i = 1; i < velas.length; i += 1) {
    const alto = velas[i].h;
    const bajo = velas[i].l;

    if (dir !== 'abajo' && alto > extremo) {
      extremo = alto;
      iExtremo = i;
      dir = 'arriba';
    } else if (dir !== 'arriba' && bajo < extremo) {
      extremo = bajo;
      iExtremo = i;
      dir = 'abajo';
    }

    if (dir === 'arriba' && extremo - bajo >= umbral) {
      pivotes.push({ indice: iExtremo, precio: extremo, tipo: 'alto' });
      dir = 'abajo';
      extremo = bajo;
      iExtremo = i;
    } else if (dir === 'abajo' && alto - extremo >= umbral) {
      pivotes.push({ indice: iExtremo, precio: extremo, tipo: 'bajo' });
      dir = 'arriba';
      extremo = alto;
      iExtremo = i;
    }
  }

  const altos = pivotes.filter((p) => p.tipo === 'alto');
  const bajos = pivotes.filter((p) => p.tipo === 'bajo');

  let sesgo: EstructuraMercado['sesgo'] = 'sin_estructura';
  let detalle =
    `Sólo ${pivotes.length} pivote${pivotes.length === 1 ? '' : 's'} con umbral de ` +
    `${factorATR}·ATR: no hay secuencia que leer. Una tendencia sin retrocesos ` +
    'apenas genera pivotes, así que esto NO significa que el precio esté en rango.';

  if (altos.length >= 2 && bajos.length >= 2) {
    const altosCrecen = altos[altos.length - 1].precio > altos[altos.length - 2].precio;
    const bajosCrecen = bajos[bajos.length - 1].precio > bajos[bajos.length - 2].precio;
    if (altosCrecen && bajosCrecen) {
      sesgo = 'alcista';
      detalle = 'Máximos y mínimos crecientes.';
    } else if (!altosCrecen && !bajosCrecen) {
      sesgo = 'bajista';
      detalle = 'Máximos y mínimos decrecientes.';
    } else {
      sesgo = 'lateral';
      detalle = altosCrecen
        ? 'Máximos crecientes pero mínimos decrecientes: rango en expansión.'
        : 'Máximos decrecientes con mínimos crecientes: compresión.';
    }
  }

  // Rotura: el último cierre supera el último pivote contrario.
  let rotura: EstructuraMercado['rotura'] = null;
  const cierre = velas[velas.length - 1].c;
  const ultimoAlto = altos[altos.length - 1];
  const ultimoBajo = bajos[bajos.length - 1];
  if (ultimoAlto && cierre > ultimoAlto.precio) {
    rotura = { indice: ultimoAlto.indice, precio: ultimoAlto.precio, direccion: 'alcista' };
  } else if (ultimoBajo && cierre < ultimoBajo.precio) {
    rotura = { indice: ultimoBajo.indice, precio: ultimoBajo.precio, direccion: 'bajista' };
  }

  return { pivotes, sesgo, detalle, rotura };
}
