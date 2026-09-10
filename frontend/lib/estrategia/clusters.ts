/**
 * ============================================================================
 * Clusters de volumen por precio y tiempo
 * ============================================================================
 * La rejilla del footprint: eje X el tiempo, eje Y el precio, y cada celda el
 * volumen negociado en ese precio durante ese intervalo.
 *
 * QUÉ ES REAL Y QUÉ NO — conviene tenerlo delante, porque la forma de este
 * gráfico invita a leerlo como un footprint de verdad y no lo es del todo:
 *
 * - **Real:** el volumen de cada celda. Sale del volumen medido de cada barra,
 *   repartido por los niveles de precio que esa barra recorrió. Es el mismo
 *   método del perfil de volumen que ya funciona en la pantalla, aplicado por
 *   intervalos en vez de sobre toda la ventana.
 * - **Aproximado y declarado:** el reparto DENTRO de la barra. Sin datos de
 *   tick no se sabe a qué precio exacto se cruzó cada acción, así que se
 *   reparte de forma uniforme por el rango. Es la convención estándar cuando
 *   no hay tape, y con barras de cinco minutos el error es pequeño porque el
 *   rango de cada barra es estrecho.
 * - **Ausente:** el desdoble bid/ask por celda. Un footprint de verdad enseña
 *   dos números por nivel —lo agredido contra la demanda y contra la oferta— y
 *   colorea los desequilibrios comparándolos. Eso exige clasificar cada
 *   operación contra la horquilla del momento, y esta fuente no sirve ni el
 *   tape ni las cotizaciones. Aquí hay volumen por precio, no quién agredió.
 */

import { Vela } from './tipos';

export interface CeldaCluster {
  /** Índice de la barra (columna). */
  x: number;
  /** Índice del nivel de precio (fila), 0 = el más barato. */
  y: number;
  volumen: number;
  /** Volumen de la celda sobre el máximo de la rejilla, 0-1. */
  intensidad: number;
  /** Es el nivel más negociado de SU barra. */
  pocDeBarra: boolean;
}

export interface RejillaClusters {
  celdas: CeldaCluster[];
  /** Precio del centro de cada fila, de menor a mayor. */
  precios: number[];
  /** Marca temporal de cada columna. */
  tiempos: number[];
  /** Cierre de cada barra, para dibujar el recorrido del precio. */
  cierres: number[];
  /** Apertura de cada barra: define si la vela fue al alza o a la baja. */
  aperturas: number[];
  /** Delta estimado por barra (CLV × volumen). PROXY, no agresores. */
  deltas: number[];
  /** Nivel más negociado de toda la ventana. */
  pocGlobal: number;
  volumenMaximoCelda: number;
  volumenTotal: number;
  altoNivel: number;
}

/**
 * Construye la rejilla.
 *
 * @param velas   Barras ya en la resolución que se quiere ver.
 * @param filas   Niveles de precio. Más filas = más detalle y celdas más finas.
 */
export function rejillaClusters(velas: Vela[], filas = 26): RejillaClusters | null {
  if (!velas.length || filas < 2) return null;

  const min = Math.min(...velas.map((v) => v.l));
  const max = Math.max(...velas.map((v) => v.h));
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;

  const altoNivel = (max - min) / filas;
  const precios = Array.from({ length: filas }, (_, i) => min + altoNivel * (i + 0.5));

  const celdas: CeldaCluster[] = [];
  const acumuladoPorNivel = new Array<number>(filas).fill(0);
  let volumenMaximoCelda = 0;
  let volumenTotal = 0;

  velas.forEach((v, x) => {
    const vol = Number.isFinite(v.v) && v.v > 0 ? v.v : 0;
    if (vol <= 0) return;

    const desde = Math.max(0, Math.floor((v.l - min) / altoNivel));
    const hasta = Math.min(filas - 1, Math.floor((v.h - min) / altoNivel));
    const n = hasta - desde + 1;
    if (n <= 0) return;

    // Reparto uniforme por los niveles que recorrió la barra. Cargar todo el
    // volumen en el cierre daría picos falsos justo en los cierres.
    const porNivel = vol / n;
    let mejorNivel = desde;

    for (let y = desde; y <= hasta; y += 1) {
      celdas.push({ x, y, volumen: porNivel, intensidad: 0, pocDeBarra: false });
      acumuladoPorNivel[y] += porNivel;
      volumenTotal += porNivel;
      if (porNivel > 0 && y === desde) mejorNivel = y;
    }
    volumenMaximoCelda = Math.max(volumenMaximoCelda, porNivel);

    // Con reparto uniforme todos los niveles de una barra valen lo mismo, así
    // que el «POC de la barra» se sitúa donde cerró: es el único punto del que
    // sí se sabe que hubo negocio a ese precio exacto.
    const yCierre = Math.max(0, Math.min(filas - 1, Math.floor((v.c - min) / altoNivel)));
    mejorNivel = yCierre;
    const celda = celdas.find((c) => c.x === x && c.y === mejorNivel);
    if (celda) celda.pocDeBarra = true;
  });

  if (!celdas.length || volumenMaximoCelda <= 0) return null;

  for (const c of celdas) c.intensidad = c.volumen / volumenMaximoCelda;

  let iPoc = 0;
  for (let i = 1; i < filas; i += 1) {
    if (acumuladoPorNivel[i] > acumuladoPorNivel[iPoc]) iPoc = i;
  }

  const deltas = velas.map((v) => {
    const rango = v.h - v.l;
    const vol = Number.isFinite(v.v) && v.v > 0 ? v.v : 0;
    // Rango cero: no hay información direccional. Delta 0, no división por cero.
    const clv = rango > 0 ? ((v.c - v.l) - (v.h - v.c)) / rango : 0;
    return clv * vol;
  });

  return {
    celdas,
    precios,
    tiempos: velas.map((v) => v.t),
    cierres: velas.map((v) => v.c),
    aperturas: velas.map((v) => v.o),
    deltas,
    pocGlobal: precios[iPoc],
    volumenMaximoCelda,
    volumenTotal,
    altoNivel,
  };
}
