/*
 * ============================================================================
 * FinAnalysis — contrato de dirección visual  ·  seed dea7484e  ·  índice 3/7
 * ============================================================================
 * THESIS: un veredicto de inversión es una LECTURA sobre una escala graduada,
 *   no una opinión con un color bonito. Se rechaza el arreglo por defecto de la
 *   categoría: tarjetas redondeadas iguales flotando sobre un fondo neutro con
 *   un número grande dentro.
 * OWN-WORLD: cara de instrumento calibrado. Esmalte cálido (no blanco, no
 *   negro-terminal), tinta grafito, reglas de 1px, marcas de escala impresas,
 *   numéricos monoespaciados tabulares porque son medidas. Un solo acento
 *   petróleo para estructura e índice. Verde y rojo quedan RESERVADOS para la
 *   dirección financiera; nunca decoran. Oscuro = el mismo panel, retroiluminado.
 * STORY: el usuario ve dónde cae la aguja, luego dónde están las bandas de
 *   tolerancia, luego las métricas que empujaron la aguja hasta ahí.
 * FIRST VIEWPORT: escala graduada 0–100 a ancho completo con las bandas
 *   40/60 dibujadas y el índice en su posición; debajo, la regla de decisión
 *   en texto; debajo, la evidencia en filas medidas.
 * FORM: instrumento de medición calibrado — candidato 3 de la lista
 *   fundamentada, asignado por concept-seed (seed dea7484e, roll degradado sin
 *   challengers: el sandbox no tiene salida de red).
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md
 * ============================================================================
 */

import { Platform, TextStyle } from 'react-native';

/* --------------------------------------------------------------------------
 * Familias tipográficas
 * El UI corre sobre la cara del sistema (SF en iOS, Roboto en Android): es lo
 * que piden HIG y Material, y lo que un usuario fluido espera de un control.
 * El carácter propio lo pone la cara monoespaciada, y la pone donde está
 * ganada: cifras, escalas y medidas. Nunca como disfraz de "técnico".
 * ------------------------------------------------------------------------ */

export const fontFamily = {
  ui: Platform.select({
    ios: undefined, // San Francisco
    android: undefined, // Roboto
    default:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  }),
} as const;

/** Cifras que se leen como medidas: ancho fijo, sin saltos al actualizar. */
export const numeric: TextStyle = {
  fontFamily: fontFamily.mono,
  fontVariant: ['tabular-nums'],
  letterSpacing: Platform.OS === 'web' ? -0.2 : 0,
};

/* --------------------------------------------------------------------------
 * Escala tipográfica — fija, no fluida (Operate). Ratio ≈1.15.
 * ------------------------------------------------------------------------ */

export const type = {
  display: { fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8 },
  title1: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5 },
  title2: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3 },
  title3: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400', letterSpacing: 0 },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600', letterSpacing: 0 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500', letterSpacing: 0 },
  labelStrong: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0 },
  /** Leyenda de escala: versalita del instrumento. Suelo de 11pt (HIG). */
  legend: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.1 },
} as const satisfies Record<string, TextStyle>;

/* --------------------------------------------------------------------------
 * Métrica del panel
 * ------------------------------------------------------------------------ */

export const space = {
  hair: 2,
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  h1: 32,
  h2: 40,
  h3: 48,
  h4: 64,
} as const;

/** Esquinas de instrumento: contenidas. El panel es una placa, no una pastilla. */
export const radius = {
  none: 0,
  xs: 3,
  sm: 5,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

export const hairline = Platform.OS === 'web' ? 1 : 0.5;

/** Duraciones de producto: el usuario está en una tarea, no viendo una función. */
export const motion = {
  instant: 90,
  fast: 160,
  base: 220,
  slow: 320,
} as const;

/* --------------------------------------------------------------------------
 * Paletas
 *
 * Claro = la cara del instrumento: esmalte cálido, tinta grafito.
 * Oscuro = el mismo instrumento retroiluminado en una mesa a las 6 de la
 * mañana. Ninguno de los dos es "el de verdad": la escena de uso son las dos.
 * ------------------------------------------------------------------------ */

export interface Palette {
  /** Chasis del instrumento: el fondo de la app. */
  canvas: string;
  /** Cara del panel: la superficie donde se lee. */
  surface: string;
  /** Panel elevado (menús, hojas, popovers). */
  surfaceRaised: string;
  /** Pozo hundido: campos de entrada, celdas de dato. */
  surfaceSunken: string;
  /** Neutral secundario para barras laterales y toolbars. */
  chrome: string;

  /** Tinta principal. */
  ink: string;
  /** Tinta secundaria: etiquetas, unidades. */
  inkMuted: string;
  /** Tinta terciaria: leyendas de escala, marcas de agua. */
  inkFaint: string;
  /** Tinta sobre superficies de acento saturado. */
  inkOnAccent: string;

  /** Regla fina: la marca de escala menor. */
  rule: string;
  /** Regla mayor: separación de secciones, borde de panel. */
  ruleStrong: string;

  /** Índice del instrumento. Estructura y selección. Nunca decoración. */
  accent: string;
  /** Lavado de acento para estados seleccionados. */
  accentWash: string;
  /** Acento presionado / hover. */
  accentPressed: string;

  /** Dirección financiera — compromiso de marca, intocable. */
  up: string;
  upWash: string;
  down: string;
  downWash: string;
  caution: string;
  cautionWash: string;

  /** Sensor sin señal: el dato que no existe. Ni cero ni oculto. */
  noSignal: string;

  /** Sombra de placa. Con desplazamiento y desenfoque; nunca un halo. */
  shadow: string;
}

export const lightPalette: Palette = {
  canvas: '#E4E0D6',
  surface: '#F6F3EC',
  surfaceRaised: '#FCFAF5',
  surfaceSunken: '#EAE6DC',
  chrome: '#EEEAE0',

  ink: '#1C1B17',
  inkMuted: '#57544B',
  inkFaint: '#8A867C',
  inkOnAccent: '#F6F3EC',

  rule: '#D2CCBE',
  ruleStrong: '#B6AF9E',

  accent: '#10545B',
  accentWash: 'rgba(16, 84, 91, 0.10)',
  accentPressed: '#0B3E44',

  up: '#1F6B3E',
  upWash: 'rgba(31, 107, 62, 0.12)',
  down: '#A62A21',
  downWash: 'rgba(166, 42, 33, 0.12)',
  caution: '#8A5A0B',
  cautionWash: 'rgba(138, 90, 11, 0.12)',

  noSignal: '#A8A296',

  shadow: 'rgba(37, 33, 24, 0.18)',
};

export const darkPalette: Palette = {
  canvas: '#0E0F0E',
  surface: '#1A1B19',
  surfaceRaised: '#232421',
  surfaceSunken: '#111211',
  chrome: '#151614',

  ink: '#F1EEE6',
  inkMuted: '#A8A497',
  inkFaint: '#757166',
  inkOnAccent: '#07211F',

  rule: '#2D2F2B',
  ruleStrong: '#454840',

  accent: '#3FA9AF',
  accentWash: 'rgba(63, 169, 175, 0.14)',
  accentPressed: '#67C4C9',

  up: '#43A96D',
  upWash: 'rgba(67, 169, 109, 0.16)',
  down: '#DD6257',
  downWash: 'rgba(221, 98, 87, 0.16)',
  caution: '#CE9A3C',
  cautionWash: 'rgba(206, 154, 60, 0.16)',

  noSignal: '#6A675E',

  shadow: 'rgba(0, 0, 0, 0.55)',
};

/* --------------------------------------------------------------------------
 * Elevación — desplazamiento + desenfoque. Un halo sin desplazamiento es
 * decoración, no profundidad.
 * ------------------------------------------------------------------------ */

export function elevation(palette: Palette, level: 0 | 1 | 2 | 3) {
  if (level === 0) return {};
  const spec = {
    1: { h: 1, blur: 3, opacity: 1, android: 1 },
    2: { h: 3, blur: 10, opacity: 1, android: 4 },
    3: { h: 10, blur: 28, opacity: 1, android: 12 },
  }[level];
  return Platform.select({
    web: {
      boxShadow: `0 ${spec.h}px ${spec.blur}px ${palette.shadow}`,
    },
    android: { elevation: spec.android },
    default: {
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: spec.h },
      shadowRadius: spec.blur / 2,
      shadowOpacity: 1,
    },
  }) as object;
}

/* --------------------------------------------------------------------------
 * Bandas de tolerancia — la regla de decisión del producto, dibujada.
 * Fuente de verdad: backend/server.py (>=60 COMPRAR, 40–60 MANTENER, <40 VENDER).
 * ------------------------------------------------------------------------ */

export const decisionBands = [
  { from: 0, to: 40, verdict: 'VENDER', risk: 'Alto', tone: 'down' as const },
  { from: 40, to: 60, verdict: 'MANTENER', risk: 'Moderado', tone: 'caution' as const },
  { from: 60, to: 100, verdict: 'COMPRAR', risk: 'Bajo', tone: 'up' as const },
];

export type Tone = 'up' | 'down' | 'caution' | 'accent' | 'neutral';

export function toneColors(palette: Palette, tone: Tone) {
  switch (tone) {
    case 'up':
      return { fg: palette.up, wash: palette.upWash };
    case 'down':
      return { fg: palette.down, wash: palette.downWash };
    case 'caution':
      return { fg: palette.caution, wash: palette.cautionWash };
    case 'accent':
      return { fg: palette.accent, wash: palette.accentWash };
    default:
      return { fg: palette.inkMuted, wash: 'transparent' };
  }
}

/* --------------------------------------------------------------------------
 * Utilidades de color — para rampas de datos (mapas de calor), donde el color
 * SÍ es la medida y hace falta interpolar. Fuera de ese caso, se usan tokens.
 * ------------------------------------------------------------------------ */

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/** Mezcla dos colores. `t` = 0 devuelve `a`; `t` = 1 devuelve `b`. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const k = Math.max(0, Math.min(1, t));
  return `#${toHex(r1 + (r2 - r1) * k)}${toHex(g1 + (g2 - g1) * k)}${toHex(b1 + (b2 - b1) * k)}`;
}

/** Luminancia relativa (WCAG), para decidir si encima va tinta clara u oscura. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Tinta legible sobre un fondo arbitrario. En un mapa de calor el fondo lo
 * decide el dato, así que el contraste del texto no se puede fijar a mano.
 */
/** Tintas disponibles para escribir encima de un color de dato. */
const TINTA_OSCURA = '#141310';
const TINTA_CLARA = '#F7F5EF';

/** Contraste WCAG entre dos colores. 1 = idénticos, 21 = negro sobre blanco. */
function contraste(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Tinta legible sobre un fondo cualquiera.
 *
 * Antes esto era `luminance > 0.42 ? oscura : clara`, y ese umbral estaba
 * mal: el punto en que la tinta clara y la oscura dan el mismo contraste está
 * en 0,18, no en 0,42. Todo lo que caía en medio —los verdes y rojos medios
 * del mapa de calor, justo el rango donde vive la mayoría de las celdas—
 * recibía tinta clara cuando la oscura daba tres o cuatro veces más contraste.
 * Ahora se calculan las dos y gana la que más contraste da; no hay umbral que
 * afinar y el resultado es correcto para cualquier fondo futuro.
 */
export function inkOn(background: string, palette: Palette): string {
  return contraste(background, TINTA_OSCURA) >= contraste(background, TINTA_CLARA)
    ? TINTA_OSCURA
    : TINTA_CLARA;
}

/**
 * Rampa divergente para mapas de calor: del rojo del producto al verde del
 * producto, pasando por el pozo neutro. Sustituye a una escala de 19 hex fijos
 * pensada sólo para fondo oscuro, que en el tema claro era ilegible.
 *
 * @param pct    variación en %, el dato que se está codificando
 * @param extent el % a partir del cual la rampa ya está saturada
 */
export function heatColor(pct: number, palette: Palette, extent = 5): string {
  if (!Number.isFinite(pct)) return palette.surfaceSunken;
  const t = Math.min(Math.abs(pct) / extent, 1);
  if (Math.abs(pct) < 0.1) return palette.surfaceSunken;
  // Curva suave: los cambios pequeños se distinguen, los grandes saturan.
  const k = 0.18 + 0.82 * Math.sqrt(t);
  return mix(palette.surfaceSunken, pct > 0 ? palette.up : palette.down, k);
}

/**
 * Rampa del mapa de calor. Distinta de `heatColor` por una razón concreta:
 * en un treemap el color rellena áreas grandes y contiguas, no adorna una
 * cifra. Diluir hacia el fondo —que es lo que hace `heatColor`— deja los
 * movimientos pequeños casi blancos, y en un mosaico eso se lee como «no hay
 * dato» en vez de como «se ha movido poco».
 *
 * Aquí el signo se lleva la saturación y la magnitud se lleva la profundidad:
 * cualquier valor distinto de cero sale claramente verde o rojo, y cuanto
 * mayor el movimiento, más se acerca al extremo de la escala.
 *
 * Los dos temas necesitan recorridos distintos, y forzar una sola fórmula
 * salía mal: en claro el verde y el rojo del producto ya son oscuros y sirven
 * de relleno tal cual, pero en oscuro son colores de acento —claros, pensados
 * para escribirse sobre fondo negro— y usarlos de relleno daba celdas de
 * luminancia media donde ninguna tinta llega a 4,5:1. Así que en tema claro
 * el recorrido va de saturado a profundo, y en oscuro de tinte hondo a vivo.
 * En ambos casos, más movimiento = más contraste contra el panel.
 *
 * Por debajo de |0,05 %| no hay color: una acción plana no es una lectura
 * débil, es una lectura neutra, y merece el gris del fondo hundido.
 */
export function heatCell(pct: number, palette: Palette, extent = 3): string {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) return palette.surfaceSunken;
  const base = pct > 0 ? palette.up : palette.down;
  const temaClaro = luminance(palette.surface) > luminance(palette.ink);
  // Estos cuatro números salen de un barrido: son los que dan el recorrido de
  // color más amplio manteniendo todas las celdas por encima de 4,5:1 y con
  // una sola tinta por tema. Dos tintas dentro del mismo sector se leen como
  // dos escalas distintas, así que eso también se descartó.
  const suave = temaClaro
    ? mix(base, palette.surface, 0.16)
    : mix(base, palette.surfaceSunken, 0.88);
  const fuerte = temaClaro
    ? mix(base, palette.ink, 0.24)
    : mix(base, palette.surfaceSunken, 0.3);
  const t = Math.min(Math.abs(pct) / extent, 1);
  return mix(suave, fuerte, Math.sqrt(t));
}

/**
 * Lee un veredicto y devuelve su tono. El verde/rojo del producto es un código
 * semántico, así que se resuelve en un solo sitio y nunca a ojo en una pantalla.
 */
export function verdictTone(verdict?: string | null): Tone {
  const v = (verdict ?? '').toUpperCase();
  if (v.includes('COMPRAR') || v.includes('BUY')) return 'up';
  if (v.includes('VENDER') || v.includes('SELL')) return 'down';
  if (v.includes('MANTENER') || v.includes('HOLD')) return 'caution';
  return 'neutral';
}

/** El signo de una variación. Nunca depende solo del color para significar. */
export function deltaTone(value?: number | null): Tone {
  if (value == null || Number.isNaN(value)) return 'neutral';
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'neutral';
}
