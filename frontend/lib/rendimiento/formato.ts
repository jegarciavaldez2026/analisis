/**
 * Formatos de la ficha «Rendimiento». Aparte de los componentes para que el
 * archivo de componentes sólo exporte componentes (Fast Refresh).
 */
import type { Num } from './api';

const formateadores = new Map<number, Intl.NumberFormat>();
function nf(decimales: number): Intl.NumberFormat {
  let f = formateadores.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    formateadores.set(decimales, f);
  }
  return f;
}

export const GUION = '—';

export function fNum(v: Num | undefined, decimales = 2): string {
  return v == null ? GUION : nf(decimales).format(v);
}

/** Porcentaje ya expresado en % (15 = 15 %). Con `signo`, las subidas llevan «+». */
export function fPct(v: Num | undefined, decimales = 1, signo = false): string {
  if (v == null) return GUION;
  return `${signo && v > 0 ? '+' : ''}${nf(decimales).format(v)} %`;
}

/** Cantidades grandes en la divisa de la empresa: «21,0 M», «2.345,6 mil M». */
export function fGrande(v: Num | undefined, moneda?: string | null): string {
  if (v == null) return GUION;
  const sufijo = moneda ? ` ${moneda}` : '';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${nf(1).format(v / 1e9)} mil M${sufijo}`;
  if (abs >= 1e6) return `${nf(1).format(v / 1e6)} M${sufijo}`;
  return `${nf(0).format(v)}${sufijo}`;
}

export function fFecha(iso: string | null | undefined): string {
  if (!iso) return GUION;
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : GUION;
}
