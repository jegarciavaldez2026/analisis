/**
 * Escala de color del treemap. Una sola cosa: variación diaria → color.
 *
 * El tamaño NO entra aquí. Si el color codificara también capitalización,
 * volumen o cualquier otra cosa, dejaría de poder leerse: el ojo no separa dos
 * variables en un mismo canal.
 *
 * Rampa divergente controlada, con el neutro en cero:
 *   ≤ −3 %  rojo oscuro · −1 %  rojo suave · 0 %  neutro · +1 %  verde suave · ≥ +3 %  verde oscuro
 *
 * Se construye con `scaleLinear` de d3 sobre siete paradas fijas en vez de con
 * un interpolador de `d3-scale-chromatic` como RdYlGn. Motivo: RdYlGn pasa por
 * un amarillo muy claro en el centro y por rojos y verdes muy saturados en los
 * extremos; sobre esos fondos ninguna tinta llega a 4,5:1 de contraste y los
 * rótulos de las celdas dejan de leerse. Estas siete paradas están elegidas
 * para que cualquier celda admita tinta legible, que es un requisito del
 * producto, no una preferencia estética.
 */

import { scaleLinear } from 'd3-scale';

/** Punto en que la rampa satura. Más allá, el color ya no cambia. */
export const EXTREMO_PCT = 3;

/** Paradas para fondo claro. */
const PARADAS_CLARO = [
  '#8C2A24', // ≤ −3 %
  '#A6392F',
  '#C06A5F',
  '#E6E2D8', // 0 %  (neutro con cuerpo, no blanco)
  '#5E9370',
  '#2F7A4F',
  '#1E5C39', // ≥ +3 %
];

/** Paradas para fondo oscuro: mismos tonos, luminancia invertida. */
const PARADAS_OSCURO = [
  '#7A2620',
  '#98342B',
  '#B75448',
  '#2A2C29', // 0 %
  '#3E8A5C',
  '#2E9A5F',
  '#3FBE74',
];

const DOMINIO = [-3, -2, -1, 0, 1, 2, 3];

const rampa = (paradas: string[]) =>
  scaleLinear<string>().domain(DOMINIO).range(paradas).clamp(true);

const CLARO = rampa(PARADAS_CLARO);
const OSCURO = rampa(PARADAS_OSCURO);

/** Gris de «no hay dato». No es el neutro de 0 %: son cosas distintas y no
 *  pueden compartir color, o una empresa sin cotizar parecería plana. */
export const SIN_DATO_CLARO = '#CFCBC1';
export const SIN_DATO_OSCURO = '#3A3C39';

/**
 * Color de fondo de una celda.
 * @param pct variación diaria en %, o null/NaN si no hay dato
 */
export function colorVariacion(pct: number | null | undefined, oscuro: boolean): string {
  if (!Number.isFinite(pct as number)) return oscuro ? SIN_DATO_OSCURO : SIN_DATO_CLARO;
  return (oscuro ? OSCURO : CLARO)(pct as number);
}

/* ── Contraste ───────────────────────────────────────────────────────────── */

const aRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

/** Luminancia relativa WCAG. */
function luminancia(hex: string): number {
  const [r, g, b] = aRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contraste = (a: string, b: string) => {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const TINTA_OSCURA = '#131311';
const TINTA_CLARA = '#F5F3EE';

/**
 * Tinta legible sobre un fondo cualquiera. Se calculan las dos y gana la que
 * más contraste da; así no hay umbral que afinar y el resultado es correcto
 * para cualquier color que salga de la rampa.
 */
export function tintaSobre(fondo: string): string {
  return contraste(fondo, TINTA_OSCURA) >= contraste(fondo, TINTA_CLARA) ? TINTA_OSCURA : TINTA_CLARA;
}

/** Paradas de la leyenda. La leyenda usa exactamente esta misma escala. */
export const PARADAS_LEYENDA = DOMINIO;
