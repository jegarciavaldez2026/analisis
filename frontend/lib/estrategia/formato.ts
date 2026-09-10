/**
 * Formateadores del terminal.
 *
 * Todos devuelven `null` cuando el dato falta, en lugar de «0,00» o «N/D».
 * Quien pinta decide cómo se dibuja el hueco; el formateador no tiene por qué
 * saberlo, y desde luego no debe rellenarlo con un cero que se lee como una
 * medida.
 */

import { Tono } from './tipos';

const LOCALE = 'es-ES';

function finito(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Moneda con dos decimales. `$125.430,68` */
export function dinero(v: number | null | undefined, signo = false): string | null {
  if (!finito(v)) return null;
  const abs = Math.abs(v).toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const prefijo = signo ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  return `${prefijo}$${abs}`;
}

/** Porcentaje. `+18,72 %` */
export function porcentaje(
  v: number | null | undefined,
  decimales = 2,
  signo = false,
): string | null {
  if (!finito(v)) return null;
  const abs = Math.abs(v).toLocaleString(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  const prefijo = signo ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  return `${prefijo}${abs} %`;
}

/** Cifra suelta con decimales fijos. */
export function cifra(v: number | null | undefined, decimales = 2): string | null {
  if (!finito(v)) return null;
  return v.toLocaleString(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Volumen abreviado: 4,01M · 18,9M · 1,2B. */
export function volumen(v: number | null | undefined): string | null {
  if (!finito(v)) return null;
  const abs = Math.abs(v);
  const escalas: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [corte, sufijo] of escalas) {
    if (abs >= corte) {
      return `${(v / corte).toLocaleString(LOCALE, { maximumFractionDigits: 2 })}${sufijo}`;
    }
  }
  return v.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

/** Entero con separador de millares: 1.200 acciones. */
export function entero(v: number | null | undefined): string | null {
  if (!finito(v)) return null;
  return Math.round(v).toLocaleString(LOCALE);
}

/** `10:24:15` en la zona local del navegador. */
export function hora(d: Date | number | string | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  const fecha = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleTimeString(LOCALE, { hour12: false });
}

/** `vie, 14 ago` — la forma corta del calendario económico. */
export function fechaCorta(d: Date | number | string | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  const fecha = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Cuenta atrás legible: `45m`, `2h 15m`, `18s`. */
export function duracion(segundos: number | null | undefined): string | null {
  if (!finito(segundos) || segundos < 0) return null;
  const s = Math.floor(segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const resto = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(resto).padStart(2, '0')}s`;
  return `${resto}s`;
}

/**
 * Tono por dirección. El cero es neutral a propósito: pintarlo de verde
 * sugiere una subida que no ha ocurrido.
 */
export function tonoDe(v: number | null | undefined): Tono {
  if (!finito(v) || v === 0) return 'neutral';
  return v > 0 ? 'up' : 'down';
}

/** Tono a partir de una palabra del backend. Acepta español e inglés. */
export function tonoDePalabra(p: string | null | undefined): Tono {
  if (!p) return 'neutral';
  const s = p.toLowerCase();
  if (/alcista|bullish|compra|buy|acumular|positivo|above|sobre|libre|verde/.test(s)) return 'up';
  if (/bajista|bearish|venta|sell|reducir|negativo|below|bajo|rojo/.test(s)) return 'down';
  if (/neutral|mantener|hold|mixto|lateral/.test(s)) return 'caution';
  return 'neutral';
}

/** Etiqueta de fuerza a partir del score 0–100. */
export function fuerzaSenal(score: number | null | undefined): string {
  if (!finito(score)) return 'SIN LECTURA';
  if (score >= 75) return 'FUERTE';
  if (score >= 60) return 'MODERADA';
  if (score >= 45) return 'DÉBIL';
  if (score >= 35) return 'MODERADA';
  return 'FUERTE';
}
