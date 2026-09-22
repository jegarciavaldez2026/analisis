/**
 * Cálculo del treemap. Toda la geometría vive aquí y no toca la interfaz.
 *
 * Reglas que este módulo respeta, y que son el motivo de existir:
 *
 *  1. El área la manda la capitalización, sin comprimir ni inventar suelos. El
 *     valor financiero no se toca para que el dibujo quede bonito.
 *  2. Lo que no llega a un tamaño rotulable no se deforma: se agrupa en un
 *     nodo «+N». La agrupación es una decisión de RENDERIZADO, no un cambio del
 *     dato: el nodo agrupado conserva la suma de capitalizaciones de lo que
 *     representa, así que el área sigue siendo cierta.
 *  3. Un sector sin capitalización conocida no ocupa espacio inventado.
 */

import { useMemo } from 'react';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';

export interface Valor {
  ticker: string;
  company_name?: string;
  sector?: string;
  market_cap?: number;
  price_change_percent?: number;
  current_price?: number;
  recommendation?: string;
  favorable_percentage?: number;
  analysis_date?: string;
  /** Llegan de `/api/history/metrics`, después del primer pintado. */
  change_1w?: number | null;
  change_1m?: number | null;
  change_3m?: number | null;
  change_ytd?: number | null;
  volume?: number | null;
  avg_volume_3m?: number | null;
  relative_volume?: number | null;
  fifty_two_week_low?: number | null;
  fifty_two_week_high?: number | null;
}

export type Periodo = '1d' | '1w' | '1m' | '3m' | 'ytd';

/** Variación del periodo elegido. El color sale siempre de aquí, de modo que
 *  cambiar de periodo cambia el mapa entero y no sólo una etiqueta. */
export function variacion(v: Valor, periodo: Periodo): number | null {
  const bruto =
    periodo === '1d' ? v.price_change_percent
    : periodo === '1w' ? v.change_1w
    : periodo === '1m' ? v.change_1m
    : periodo === '3m' ? v.change_3m
    : v.change_ytd;
  return Number.isFinite(bruto as number) ? (bruto as number) : null;
}

export type Orden = 'cap' | 'ticker' | 'variacion';

export interface Celda {
  x: number;
  y: number;
  w: number;
  h: number;
  valor: Valor;
}

export interface CeldaResto {
  x: number;
  y: number;
  w: number;
  h: number;
  valores: Valor[];
}

export interface Bloque {
  sector: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cabecera: number;
  /** Media de variación ponderada por capitalización REAL. */
  media: number | null;
  capitalizacion: number;
  celdas: Celda[];
  resto: CeldaResto | null;
  total: number;
  /** Si este bloque agrupa sectores pequeños, cuáles. Vacío si es un sector. */
  agrupa: string[];
}

/** Sin capitalización no se puede dimensionar. Se cuenta con un mínimo simbólico
 *  para que la empresa exista en el mapa, y se marca como tal. */
const CAP_MINIMA = 1e7;
const cap = (v: Valor) => Math.max(v.market_cap ?? 0, CAP_MINIMA);

/** Por debajo de esto una celda no admite ni el ticker: va al grupo «+N». */
export const MIN_ANCHO_CELDA = 32;
export const MIN_ALTO_CELDA = 22;
/** Alto del rótulo del sector según lo alto que sea su bloque. */
const cabeceraDe = (alto: number) => (alto >= 150 ? 34 : alto >= 84 ? 26 : 18);

const SIN_SECTOR = 'Sin sector';
export const OTROS_SECTORES = 'Otros sectores';
/** Área por debajo de la cual un sector no se puede dibujar: no cabe ni su
 *  nombre. Es un umbral de RENDERIZADO; no altera ninguna capitalización. */
const AREA_MIN_SECTOR = 9000;

function ordenar(valores: Valor[], orden: Orden, periodo: Periodo): Valor[] {
  const copia = [...valores];
  if (orden === 'ticker') return copia.sort((a, b) => a.ticker.localeCompare(b.ticker, 'es'));
  if (orden === 'variacion') {
    return copia.sort((a, b) => {
      const va = variacion(a, periodo);
      const vb = variacion(b, periodo);
      // Lo que no tiene dato va al final: no es que se haya movido cero.
      if ((va === null) !== (vb === null)) return va === null ? 1 : -1;
      if (va === null && vb === null) return a.ticker.localeCompare(b.ticker, 'es');
      return (vb as number) - (va as number);
    });
  }
  return copia.sort((a, b) => cap(b) - cap(a));
}

/**
 * Reparte las empresas de un sector dentro de su bloque y agrupa lo que no
 * cabe rotulado.
 *
 * Se baja de una en una porque al retirar una celda las que quedan crecen: hay
 * que volver a medir. Cortar antes dejaba celdas de veinte píxeles con un
 * ticker recortado dentro, que es justo lo que este mecanismo evita.
 */
function repartirSector(valores: Valor[], ancho: number, alto: number, orden: Orden, periodo: Periodo) {
  const ordenados = ordenar(valores, orden, periodo);

  const intento = (visibles: number) => {
    const dentro = ordenados.slice(0, visibles);
    const fuera = ordenados.slice(visibles);
    const hijos: { valor?: Valor; valores?: Valor[]; value: number }[] = dentro.map((v) => ({
      valor: v,
      value: cap(v),
    }));
    // El nodo «+N» entra al reparto con la suma de lo que agrupa: conserva
    // exactamente el área que le corresponde a ese conjunto.
    if (fuera.length) hijos.push({ valores: fuera, value: fuera.reduce((a, v) => a + cap(v), 0) });

    const raiz = hierarchy<{ children?: any[]; value?: number }>({ children: hijos } as any)
      .sum((d: any) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    treemap<any>()
      .tile(treemapSquarify.ratio(1.2))
      .size([Math.max(ancho, 0), Math.max(alto, 0)])
      .paddingInner(2)
      .round(true)(raiz);

    return { dentro, fuera, hojas: raiz.leaves() };
  };

  let visibles = ordenados.length;
  while (visibles >= 1) {
    const r = intento(visibles);
    const caben = r.hojas
      .filter((n: any) => n.data.valor)
      .every((n: any) => n.x1 - n.x0 >= MIN_ANCHO_CELDA && n.y1 - n.y0 >= MIN_ALTO_CELDA);
    if (caben) return r;
    visibles -= 1;
  }
  // Ni la mayor cabe rotulada: no se dibuja una celda de tres píxeles con un
  // ticker que no se lee. Va todo al grupo, que sí se puede pulsar.
  return intento(0);
}

/**
 * Layout completo. Se recalcula sólo cuando cambian los datos, el tamaño o el
 * orden — de eso se encarga el `useMemo`.
 */
export function useHeatmapLayout(
  items: Valor[],
  ancho: number,
  alto: number,
  orden: Orden = 'cap',
  periodo: Periodo = '1d',
): { bloques: Bloque[]; totalEmpresas: number; totalSectores: number } {
  return useMemo(() => {
    if (ancho <= 0 || alto <= 0 || !items.length) {
      return { bloques: [], totalEmpresas: 0, totalSectores: 0 };
    }

    const porSector = new Map<string, Valor[]>();
    for (const it of items) {
      const s = it.sector && it.sector !== 'N/A' ? it.sector : SIN_SECTOR;
      porSector.set(s, [...(porSector.get(s) ?? []), it]);
    }

    const crudos = [...porSector.entries()].map(([sector, valores]) => ({
      sector,
      valores,
      capitalizacion: valores.reduce((a, v) => a + cap(v), 0),
      agrupa: [] as string[],
    }));

    /**
     * Sectores que no pueden dibujarse.
     *
     * Repartiendo por capitalización de verdad, un sector que pesa el 0,02 %
     * del total recibe el 0,02 % del lienzo: doscientos píxeles cuadrados, un
     * cuadrado de 14×14. Ahí no cabe el nombre del sector, ni una celda, ni
     * nada. En un historial donde tres empresas son el 98 % de la
     * capitalización, eso le pasa a nueve sectores de doce.
     *
     * No se les infla el área —eso sería mentir sobre el peso— ni se les deja
     * como virutas ilegibles. Se juntan en un bloque «Otros sectores» cuya
     * área es la SUMA EXACTA de las suyas, así que la proporcionalidad del
     * mapa se mantiene intacta, y al pulsarlo se abre la lista completa.
     */
    const totalCap = crudos.reduce((a, s) => a + s.capitalizacion, 0);
    const areaLienzo = ancho * alto;
    const grandes = crudos.filter(
      (s) => (s.capitalizacion / totalCap) * areaLienzo >= AREA_MIN_SECTOR,
    );
    const pequenos = crudos.filter(
      (s) => (s.capitalizacion / totalCap) * areaLienzo < AREA_MIN_SECTOR,
    );

    const sectores = [...grandes];
    if (pequenos.length === 1) {
      sectores.push(pequenos[0]);
    } else if (pequenos.length > 1) {
      sectores.push({
        sector: OTROS_SECTORES,
        valores: pequenos.flatMap((s) => s.valores),
        capitalizacion: pequenos.reduce((a, s) => a + s.capitalizacion, 0),
        agrupa: pequenos.map((s) => s.sector).sort((a, b) => a.localeCompare(b, 'es')),
      });
    }

    // Nivel 1: los sectores, por capitalización total. Squarified porque aquí
    // lo que importa es que los bloques sean legibles, y el orden dentro del
    // mapa no aporta significado —el nombre va escrito en cada bloque.
    const raiz = hierarchy<any>({ children: sectores } as any)
      .sum((d: any) => d.capitalizacion ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    treemap<any>()
      .tile(treemapSquarify.ratio(1.2))
      .size([ancho, alto])
      .paddingInner(6)
      .paddingOuter(0)
      .round(true)(raiz);

    const bloques: Bloque[] = raiz.leaves().map((nodo: any) => {
      const { sector, valores, capitalizacion, agrupa } = nodo.data;
      const w = nodo.x1 - nodo.x0;
      const h = nodo.y1 - nodo.y0;
      const cabecera = cabeceraDe(h);
      const interiorAlto = Math.max(h - cabecera - 4, 0);
      const interiorAncho = Math.max(w - 4, 0);

      const { dentro, fuera, hojas } = repartirSector(valores, interiorAncho, interiorAlto, orden, periodo);

      const celdas: Celda[] = [];
      let resto: CeldaResto | null = null;
      for (const hoja of hojas as any[]) {
        // El reparto interior se calcula en coordenadas del sector, pero el
        // dibujo va en coordenadas del lienzo: hay que sumar el origen del
        // bloque. Sin esto todas las celdas se apilaban arriba a la izquierda,
        // encima de los sectores vecinos.
        const r = {
          x: nodo.x0 + 2 + hoja.x0,
          y: nodo.y0 + cabecera + 2 + hoja.y0,
          w: Math.max(hoja.x1 - hoja.x0, 0),
          h: Math.max(hoja.y1 - hoja.y0, 0),
        };
        if (hoja.data.valor) {
          // Una celda de tamaño cero no se dibuja: no se ve, no se puede
          // pulsar y sólo añade nodos al árbol.
          if (r.w >= 1 && r.h >= 1) celdas.push({ ...r, valor: hoja.data.valor });
        } else if (hoja.data.valores) {
          // El grupo NUNCA se descarta por tamaño, aunque su rectángulo salga
          // de dos píxeles. Es el único camino hasta las empresas que agrupa:
          // si desapareciera, esas empresas dejarían de existir en la pantalla.
          // Cuando no cabe dibujarlo, el rótulo del sector se encarga de
          // ofrecer la lista.
          resto = { ...r, valores: hoja.data.valores };
        }
      }

      // Media ponderada por la capitalización real, y sólo con las empresas que
      // tienen precio: promediar con las que no cotizan sería contarlas como
      // planas, que es una afirmación que el dato no permite.
      const conDato = valores.filter((v: Valor) => variacion(v, periodo) !== null);
      const pesoDato = conDato.reduce((a: number, v: Valor) => a + cap(v), 0);
      const media = pesoDato > 0
        ? conDato.reduce(
            (a: number, v: Valor) => a + (variacion(v, periodo) as number) * cap(v),
            0,
          ) / pesoDato
        : null;

      return {
        sector,
        x: nodo.x0,
        y: nodo.y0,
        w,
        h,
        cabecera,
        media,
        capitalizacion,
        celdas,
        resto,
        total: valores.length,
        agrupa: (agrupa as string[]) ?? [],
      };
    });

    return {
      bloques,
      totalEmpresas: items.length,
      // El contador dice cuántos sectores hay en los datos, no cuántos bloques
      // se dibujan: agrupar nueve en uno no hace que existan menos.
      totalSectores: crudos.length,
    };
  }, [items, ancho, alto, orden, periodo]);
}
