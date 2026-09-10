/**
 * Indicadores calculados en el cliente sobre velas reales.
 *
 * Sólo entran aquí los que se derivan por completo de los cierres que ya
 * llegaron con la serie: MACD y RSI. No hay ningún dato nuevo, así que no hay
 * segunda verdad — es la misma serie leída de otra manera.
 *
 * El período de calentamiento se devuelve como `null`, no como cero: un MACD
 * de 0 durante las primeras 26 barras es una línea plana que el ojo lee como
 * «sin momento», y eso es falso.
 */

import { Vela } from './tipos';

/** Media exponencial. Devuelve `null` mientras no hay ventana completa. */
export function ema(valores: number[], periodo: number): (number | null)[] {
  const salida: (number | null)[] = new Array(valores.length).fill(null);
  if (periodo <= 0 || valores.length < periodo) return salida;

  const k = 2 / (periodo + 1);
  let suma = 0;
  for (let i = 0; i < periodo; i += 1) suma += valores[i];
  let previa = suma / periodo;
  salida[periodo - 1] = previa;

  for (let i = periodo; i < valores.length; i += 1) {
    previa = valores[i] * k + previa * (1 - k);
    salida[i] = previa;
  }
  return salida;
}

export interface MACD {
  macd: (number | null)[];
  senal: (number | null)[];
  histograma: (number | null)[];
}

/** MACD 12/26/9 estándar sobre cierres. */
export function macd(cierres: number[], rapida = 12, lenta = 26, senalP = 9): MACD {
  const eRapida = ema(cierres, rapida);
  const eLenta = ema(cierres, lenta);

  const linea: (number | null)[] = cierres.map((_, i) =>
    eRapida[i] !== null && eLenta[i] !== null ? (eRapida[i] as number) - (eLenta[i] as number) : null,
  );

  // La señal es una EMA de la línea MACD, que empieza tarde. Se calcula sobre
  // el tramo con valor y se vuelve a alinear, en vez de meter ceros delante.
  const primero = linea.findIndex((v) => v !== null);
  const senal: (number | null)[] = new Array(cierres.length).fill(null);
  if (primero >= 0) {
    const compacta = linea.slice(primero).map((v) => v as number);
    const eSenal = ema(compacta, senalP);
    for (let i = 0; i < eSenal.length; i += 1) senal[primero + i] = eSenal[i];
  }

  const histograma = linea.map((v, i) =>
    v !== null && senal[i] !== null ? v - (senal[i] as number) : null,
  );

  return { macd: linea, senal, histograma };
}

/**
 * RSI de Wilder. La versión con media simple da lecturas distintas y es la
 * fuente clásica de «mi RSI no coincide con el del bróker».
 */
export function rsi(cierres: number[], periodo = 14): (number | null)[] {
  const salida: (number | null)[] = new Array(cierres.length).fill(null);
  if (cierres.length <= periodo) return salida;

  let ganancia = 0;
  let perdida = 0;
  for (let i = 1; i <= periodo; i += 1) {
    const d = cierres[i] - cierres[i - 1];
    if (d >= 0) ganancia += d;
    else perdida -= d;
  }
  ganancia /= periodo;
  perdida /= periodo;
  salida[periodo] = perdida === 0 ? 100 : 100 - 100 / (1 + ganancia / perdida);

  for (let i = periodo + 1; i < cierres.length; i += 1) {
    const d = cierres[i] - cierres[i - 1];
    const g = d > 0 ? d : 0;
    const p = d < 0 ? -d : 0;
    ganancia = (ganancia * (periodo - 1) + g) / periodo;
    perdida = (perdida * (periodo - 1) + p) / periodo;
    salida[i] = perdida === 0 ? 100 : 100 - 100 / (1 + ganancia / perdida);
  }
  return salida;
}

/** Media móvil simple, para las bandas del gráfico principal. */
export function sma(valores: number[], periodo: number): (number | null)[] {
  const salida: (number | null)[] = new Array(valores.length).fill(null);
  if (valores.length < periodo) return salida;
  let suma = 0;
  for (let i = 0; i < valores.length; i += 1) {
    suma += valores[i];
    if (i >= periodo) suma -= valores[i - periodo];
    if (i >= periodo - 1) salida[i] = suma / periodo;
  }
  return salida;
}

/** Media ponderada lineal: la barra más reciente pesa `periodo`, la más vieja 1. */
export function wma(valores: (number | null)[], periodo: number): (number | null)[] {
  const salida: (number | null)[] = new Array(valores.length).fill(null);
  const divisor = (periodo * (periodo + 1)) / 2;
  for (let i = periodo - 1; i < valores.length; i += 1) {
    let suma = 0;
    let completa = true;
    for (let j = 0; j < periodo; j += 1) {
      const v = valores[i - periodo + 1 + j];
      if (v === null || !Number.isFinite(v)) {
        completa = false;
        break;
      }
      suma += v * (j + 1);
    }
    salida[i] = completa ? suma / divisor : null;
  }
  return salida;
}

/** Tasa de cambio porcentual respecto a `periodo` barras atrás. */
export function roc(valores: number[], periodo: number): (number | null)[] {
  return valores.map((v, i) => {
    if (i < periodo) return null;
    const previo = valores[i - periodo];
    return previo === 0 ? null : ((v - previo) / previo) * 100;
  });
}

/**
 * Curva de Coppock: WMA-10 de (ROC-14 + ROC-11).
 *
 * Es la misma definición que usa el backend para su lectura puntual, así que
 * el trazo y la cifra del panel técnico cuentan lo mismo. Se calcula aquí —y
 * no se pide al backend— para que siga al marco que el usuario tenga elegido:
 * una curva diaria dibujada bajo velas semanales sería un gráfico mentiroso.
 */
export function coppock(cierres: number[], largo = 14, corto = 11, suave = 10) {
  const rocLargo = roc(cierres, largo);
  const rocCorto = roc(cierres, corto);
  const suma: (number | null)[] = cierres.map((_, i) =>
    rocLargo[i] !== null && rocCorto[i] !== null
      ? (rocLargo[i] as number) + (rocCorto[i] as number)
      : null,
  );
  const linea = wma(suma, suave);

  // La EMA-13 de la curva empieza más tarde que la curva. Se calcula sobre el
  // tramo con valor y se realinea, en vez de meter ceros delante: un cero es
  // una lectura, y ahí no hay ninguna.
  const senal: (number | null)[] = new Array(cierres.length).fill(null);
  const primero = linea.findIndex((v) => v !== null);
  if (primero >= 0) {
    const compacta = linea.slice(primero) as number[];
    const suavizada = ema(compacta, 13);
    for (let i = 0; i < suavizada.length; i += 1) senal[primero + i] = suavizada[i];
  }

  return { linea, senal };
}

/* ==========================================================================
 * Reagrupación de marco temporal
 * ======================================================================== */

export type Agrupacion = 'dia' | 'semana' | 'mes';

/**
 * Reagrupa velas diarias en semanales o mensuales.
 *
 * **Por calendario, no por bloques de N barras.** Ese fue un bug real de este
 * proyecto: agrupar de cinco en cinco mezcla días de dos semanas distintas en
 * cuanto hay un festivo o el histórico empieza a media semana. Aquí la clave
 * de grupo es el lunes de la semana ISO (o el primero del mes), así que una
 * semana de cuatro sesiones sigue siendo una vela.
 *
 * La agregación es la estándar: apertura de la primera, máximo de los máximos,
 * mínimo de los mínimos, cierre de la última y volumen sumado.
 */
export function reagrupar(velas: Vela[], como: Agrupacion): Vela[] {
  if (como === 'dia' || velas.length === 0) return velas;

  const clave = (t: number): string => {
    const d = new Date(t);
    if (como === 'mes') return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    // Lunes de la semana a la que pertenece el día.
    const dia = d.getUTCDay();
    const desplazamiento = dia === 0 ? 6 : dia - 1;
    const lunes = new Date(d);
    lunes.setUTCDate(d.getUTCDate() - desplazamiento);
    return `${lunes.getUTCFullYear()}-${lunes.getUTCMonth()}-${lunes.getUTCDate()}`;
  };

  const grupos = new Map<string, Vela[]>();
  const orden: string[] = [];
  for (const v of velas) {
    const k = clave(v.t);
    if (!grupos.has(k)) {
      grupos.set(k, []);
      orden.push(k);
    }
    (grupos.get(k) as Vela[]).push(v);
  }

  return orden.map((k) => {
    const g = grupos.get(k) as Vela[];
    return {
      t: g[0].t,
      o: g[0].o,
      h: Math.max(...g.map((v) => v.h)),
      l: Math.min(...g.map((v) => v.l)),
      c: g[g.length - 1].c,
      v: g.reduce((s, v) => s + (Number.isFinite(v.v) ? v.v : 0), 0),
    };
  });
}

export interface IndicadoresSerie {
  cierres: number[];
  macd: MACD;
  rsi: (number | null)[];
  sma20: (number | null)[];
  sma50: (number | null)[];
  /**
   * Media de 20 sesiones del VOLUMEN.
   *
   * Es la referencia que convierte una barra de volumen en información: 3,2 M
   * de acciones no dice nada suelto, y «el doble de su media de 20» sí. Sin
   * esta línea, el panel de volumen sólo deja comparar cada barra con las que
   * tiene al lado, que es justo lo que engaña en una serie con tendencia de
   * volumen.
   */
  smaVolumen20: (number | null)[];
  coppock: { linea: (number | null)[]; senal: (number | null)[] };
}

export function calcularIndicadores(velas: Vela[]): IndicadoresSerie {
  const cierres = velas.map((v) => v.c);
  const volumenes = velas.map((v) => (Number.isFinite(v.v) ? v.v : 0));
  return {
    cierres,
    macd: macd(cierres),
    rsi: rsi(cierres),
    sma20: sma(cierres, 20),
    sma50: sma(cierres, 50),
    smaVolumen20: sma(volumenes, 20),
    coppock: coppock(cierres),
  };
}
