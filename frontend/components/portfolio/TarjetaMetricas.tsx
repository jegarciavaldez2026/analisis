/**
 * Métricas del portafolio.
 *
 * Sustituye a una rejilla de ocho cifras sueltas con adjetivos pegados
 * («Excelente», «Bueno») que no decían sobre qué escala. Aquí cada número va
 * con lo que hace falta para auditarlo, y hay tres cosas que conviene no
 * deshacer:
 *
 * 1. **El R² gobierna el bloque del índice.** Beta, alfa y Treynor salen de una
 *    regresión contra el S&P. Si esa regresión no explica nada, los tres son
 *    aritméticamente correctos y estadísticamente vacíos —una beta de 0,60 con
 *    un R² del 3 % no significa «se mueve un 60 % de lo que el mercado», sino
 *    «no se mueve con el mercado»—. Por debajo del 20 % el bloque se marca y lo
 *    dice con la cifra delante. Es el hallazgo que ya está anotado en agents.md
 *    para la beta de un valor suelto; aquí vale igual para la cartera.
 *
 * 2. **Las dos rentabilidades se enseñan juntas.** La aritmética anualizada
 *    alimenta Sharpe, Treynor y Calmar; la geométrica (CAGR) alimenta Sortino.
 *    Se separan bastante, así que enseñar una sola haría que dos ratios de la
 *    misma tarjeta tuvieran numeradores distintos sin que se notara.
 *
 * 3. **El CAPM se enseña como una resta, no como un veredicto.** rf + β·(rm−rf)
 *    da lo exigido; el alfa es la diferencia contra lo obtenido. Con los cuatro
 *    números a la vista, el alfa se puede comprobar a mano — que es la única
 *    forma de verificar un dato, como ya pasó con la columna CAGR.
 *
 * Los gráficos son SVG a mano, con el mismo lenguaje que `GraficoMercado`: sin
 * dependencias nuevas, escala calculada sobre los datos y no sobre supuestos.
 */

import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '../../contexts/ThemeContext';
import { toneColors } from '../../theme/tokens';
import { Legend, Panel, Rule } from '../ui';

export interface MetricasPortafolio {
  portfolio_beta: number;
  portfolio_alpha: number;
  sharpe_ratio: number;
  average_return: number;
  volatility: number;
  gain_loss_ratio: number;
  calmar_ratio: number;
  treynor_ratio: number;
  information_ratio: number;
  max_drawdown: number;
  tracking_error: number;
  risk_free_rate: number;
  benchmark_return: number;
  metrics_method: string;
  capm_esperado?: number | null;
  prima_riesgo_mercado?: number | null;
  retorno_geometrico?: number | null;
  sortino?: number | null;
  desviacion_bajista?: number | null;
  var_95?: number | null;
  cvar_95?: number | null;
  ulcer_index?: number | null;
  drawdown_actual?: number | null;
  sesiones_recuperacion?: number | null;
  r_cuadrado?: number | null;
  captura_alcista?: number | null;
  captura_bajista?: number | null;
  ratio_diversificacion?: number | null;
  concentracion_hhi?: number | null;
  peso_mayor?: number | null;
  posiciones_con_beta?: number | null;
  posiciones_totales?: number | null;
  curva_cartera?: number[];
  curva_indice?: number[];
  curva_fechas?: string[];
  curva_drawdown?: number[];
}

/** Umbral por debajo del cual la regresión contra el índice no sostiene nada. */
const R2_MINIMO = 20;

const hay = (v: any): v is number => v != null && Number.isFinite(Number(v));
const f2 = (v: any, suf = '') => (hay(v) ? `${Number(v).toFixed(2)}${suf}` : '—');
const f1 = (v: any, suf = '') => (hay(v) ? `${Number(v).toFixed(1)}${suf}` : '—');
const fpc = (v: any) => {
  if (!hay(v)) return '—';
  const x = Number(v);
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(2)} %`;
};

/* ── Una cifra con su contexto ──────────────────────────────────────────── */
function Cifra({
  etiqueta,
  valor,
  nota,
  tono,
  atenuado,
}: {
  etiqueta: string;
  valor: string;
  nota?: string | null;
  tono?: 'up' | 'down' | 'caution' | 'accent' | 'neutral';
  atenuado?: boolean;
}) {
  const { colors, palette, type, numeric, space } = useTheme();
  const sinDato = valor === '—';
  const fg = sinDato
    ? colors.noSignal
    : tono && tono !== 'neutral'
      ? toneColors(palette, tono).fg
      : colors.ink;
  return (
    <View style={{ minWidth: 116, flex: 1, gap: 1, paddingVertical: space.xs, opacity: atenuado ? 0.55 : 1 }}>
      <Legend>{etiqueta}</Legend>
      <Text style={[type.title3, numeric, { color: fg }]}>{valor}</Text>
      {nota ? (
        <Text style={[type.caption, { color: colors.inkFaint }]} numberOfLines={2}>
          {nota}
        </Text>
      ) : null}
    </View>
  );
}

/** Márgenes del trazado. Constantes, así que viven fuera del componente: dentro
 *  se recreaban en cada render y eran una dependencia oculta de los `useMemo`. */
const M_CURVA = { i: 46, d: 8, s: 10, b: 18 } as const;
const ALTO_CURVA = 150;
const M_AGUA = { i: 46, d: 8, s: 6, b: 14 } as const;
const ALTO_AGUA = 76;

/* ── Curva de patrimonio contra el índice ───────────────────────────────── */
function CurvaPatrimonio({
  cartera,
  indice,
  fechas,
  ancho,
}: {
  cartera: number[];
  indice: number[];
  fechas: string[];
  ancho: number;
}) {
  const { colors, palette, type, numeric, space, hairline } = useTheme();
  const ALTO = ALTO_CURVA;
  const M = M_CURVA;
  const w = Math.max(ancho - M.i - M.d, 10);
  const h = ALTO - M.s - M.b;

  const { dCart, dInd, min, max } = useMemo(() => {
    const todos = [...cartera, ...(indice.length === cartera.length ? indice : [])].filter(Number.isFinite);
    if (!todos.length) return { dCart: '', dInd: '', min: 0, max: 0 };
    let lo = Math.min(...todos);
    let hi = Math.max(...todos);
    if (hi - lo < 1e-6) { hi = lo + 1; }
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;
    const x = (i: number, n: number) => M.i + (n <= 1 ? 0 : (i / (n - 1)) * w);
    const y = (v: number) => M.s + h - ((v - lo) / (hi - lo)) * h;
    const linea = (arr: number[]) =>
      arr.length ? arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i, arr.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ') : '';
    return { dCart: linea(cartera), dInd: linea(indice), min: lo, max: hi };
  }, [cartera, indice, w, h]);

  if (!cartera.length) return null;
  const cCart = colors.accent;
  const cInd = colors.inkFaint;
  const fin = cartera[cartera.length - 1];
  const finInd = indice.length ? indice[indice.length - 1] : null;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 14, height: 2, backgroundColor: cCart }} />
          <Text style={[type.caption, { color: colors.inkMuted }]}>Cartera</Text>
          <Text style={[type.caption, numeric, { color: toneColors(palette, fin >= 100 ? 'up' : 'down').fg, fontWeight: '700' }]}>
            {fpc(fin - 100)}
          </Text>
        </View>
        {finInd != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 14, height: 2, backgroundColor: cInd }} />
            <Text style={[type.caption, { color: colors.inkMuted }]}>S&P 500</Text>
            <Text style={[type.caption, numeric, { color: colors.inkMuted, fontWeight: '700' }]}>
              {fpc(finInd - 100)}
            </Text>
          </View>
        ) : null}
      </View>

      <Svg width={ancho} height={ALTO}>
        {/* base 100: la referencia de la que parten las dos */}
        <Line
          x1={M.i}
          x2={ancho - M.d}
          y1={M.s + h - ((100 - min) / (max - min)) * h}
          y2={M.s + h - ((100 - min) / (max - min)) * h}
          stroke={colors.rule}
          strokeWidth={hairline}
          strokeDasharray="3,3"
        />
        {dInd ? <Path d={dInd} stroke={cInd} strokeWidth={1.2} fill="none" /> : null}
        {dCart ? <Path d={dCart} stroke={cCart} strokeWidth={1.8} fill="none" /> : null}
      </Svg>
      <Text style={[type.caption, { color: colors.inkFaint, marginTop: -14, marginLeft: 2 }]}>
        Base 100 · {fechas[0] ?? ''} → {fechas[fechas.length - 1] ?? ''}
      </Text>
    </View>
  );
}

/* ── Bajo el agua ───────────────────────────────────────────────────────── */
function BajoElAgua({ serie, ancho }: { serie: number[]; ancho: number }) {
  const { colors, palette, type, space } = useTheme();
  const ALTO = ALTO_AGUA;
  const M = M_AGUA;
  const w = Math.max(ancho - M.i - M.d, 10);
  const h = ALTO - M.s - M.b;
  const peor = useMemo(() => (serie.length ? Math.min(...serie) : 0), [serie]);

  const d = useMemo(() => {
    if (!serie.length) return '';
    const lo = Math.min(peor, -0.5);
    const x = (i: number) => M.i + (serie.length <= 1 ? 0 : (i / (serie.length - 1)) * w);
    const y = (v: number) => M.s + (Math.min(v, 0) / lo) * h;
    const arriba = serie.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `${arriba} L${x(serie.length - 1).toFixed(1)},${M.s} L${x(0).toFixed(1)},${M.s} Z`;
  }, [serie, w, h, peor]);

  if (!serie.length) return null;
  const t = toneColors(palette, 'down');
  return (
    <View>
      <Text style={[type.caption, { color: colors.inkMuted }]}>
        Bajo el agua · peor caída {f2(peor, ' %')}
      </Text>
      <Svg width={ancho} height={ALTO}>
        <Line x1={M.i} x2={ancho - M.d} y1={M.s} y2={M.s} stroke={colors.rule} strokeWidth={1} />
        <Path d={d} fill={t.wash} stroke={t.fg} strokeWidth={1.1} />
      </Svg>
    </View>
  );
}

/* ── Pesos, para ver la concentración ───────────────────────────────────── */
function Concentracion({ hhi, mayor }: { hhi?: number | null; mayor?: number | null }) {
  const { colors, palette, type, numeric, space, radius } = useTheme();
  if (!hay(hhi)) return null;
  // Equivalente en posiciones iguales: 1/HHI. Dice «esta cartera se comporta
  // como si tuviera N posiciones del mismo tamaño», que es más legible que el
  // índice a secas.
  const equivalente = Number(hhi) > 0 ? 100 / Number(hhi) : null;
  return (
    <View style={{ gap: 2, minWidth: 150, flex: 1, paddingVertical: space.xs }}>
      <Legend>Concentración</Legend>
      <Text style={[type.title3, numeric, { color: colors.ink }]}>
        {hay(equivalente) ? `${Number(equivalente).toFixed(1)} pos.` : '—'}
      </Text>
      <Text style={[type.caption, { color: colors.inkFaint }]}>
        equivalentes iguales (HHI {f1(hhi)}); la mayor pesa {f1(mayor, ' %')}
      </Text>
    </View>
  );
}

export default function TarjetaMetricas({ m }: { m: MetricasPortafolio | null }) {
  const { colors, palette, space, type, numeric, hairline, radius } = useTheme();
  const [ancho, setAncho] = useState(0);
  const [verIndice, setVerIndice] = useState(true);

  if (!m) return null;

  const r2 = m.r_cuadrado;
  // Sin R² no se puede afirmar que la regresión valga; con R² bajo, se puede
  // afirmar que NO vale. Los dos casos atenúan el bloque, pero el mensaje es
  // distinto y se dice distinto.
  const regresionFloja = hay(r2) && Number(r2) < R2_MINIMO;
  const exacto = m.metrics_method === 'covarianza';

  const curva = m.curva_cartera ?? [];
  const indice = m.curva_indice ?? [];
  const dd = m.curva_drawdown ?? [];
  const fechas = m.curva_fechas ?? [];

  return (
    <Panel
      legend="Riesgo y rendimiento"
      title="Métricas del portafolio"
    >
      <View onLayout={(e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width)}>
        {/* ── Cómo se ha calculado. Va ARRIBA: cambia cómo se leen todas las
            cifras de abajo, así que llega antes que ellas. */}
        <Text style={[type.caption, { color: exacto ? colors.inkFaint : toneColors(palette, 'caution').fg }]}>
          {exacto
            ? 'Volatilidad y caída medidas sobre la serie diaria de la cartera, con la covarianza entre posiciones.'
            : 'Aproximado: sin series suficientes se usa la media ponderada de las posiciones, que ignora la correlación y exagera el riesgo.'}
          {'  ·  '}Tipo sin riesgo {f2(m.risk_free_rate, ' %')} (^TNX) · Índice S&P 500 {f2(m.benchmark_return, ' %')}
        </Text>

        {ancho > 60 && curva.length > 2 ? (
          <>
            <Rule />
            <CurvaPatrimonio cartera={curva} indice={verIndice ? indice : []} fechas={fechas} ancho={ancho} />
            {indice.length ? (
              <Pressable
                onPress={() => setVerIndice((v) => !v)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  { alignSelf: 'flex-start', paddingVertical: 4, opacity: pressed ? 0.7 : 1 },
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                ]}
              >
                <Text style={[type.caption, { color: colors.accent }]}>
                  {verIndice ? 'Ocultar el índice' : 'Comparar con el S&P 500'}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {ancho > 60 && dd.length > 2 ? (
          <>
            <Rule />
            <BajoElAgua serie={dd} ancho={ancho} />
          </>
        ) : null}

        {/* ── Rentabilidad ──────────────────────────────────────────────── */}
        <Rule />
        <Legend>Rentabilidad · 1 año</Legend>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          <Cifra
            etiqueta="Anualizada"
            valor={fpc(m.average_return)}
            tono={m.average_return >= 0 ? 'up' : 'down'}
            nota="media aritmética · numerador de Sharpe, Treynor y Calmar"
          />
          <Cifra
            etiqueta="CAGR"
            valor={fpc(m.retorno_geometrico)}
            tono={hay(m.retorno_geometrico) && Number(m.retorno_geometrico) >= 0 ? 'up' : 'down'}
            nota="geométrica · lo que se lleva de verdad; numerador de Sortino"
          />
          <Cifra
            etiqueta="Sharpe"
            valor={f2(m.sharpe_ratio)}
            nota={`sobre el exceso frente al ${f2(m.risk_free_rate, ' %')}`}
          />
          <Cifra
            etiqueta="Sortino"
            valor={f2(m.sortino)}
            nota={
              hay(m.desviacion_bajista)
                ? `sólo castiga la caída (${f1(m.desviacion_bajista, ' %')})`
                : 'sólo castiga la caída'
            }
          />
        </View>

        {/* ── Riesgo ────────────────────────────────────────────────────── */}
        <Rule />
        <Legend>Riesgo</Legend>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          <Cifra etiqueta="Volatilidad" valor={f2(m.volatility, ' %')} nota="anualizada" />
          <Cifra
            etiqueta="Máxima caída"
            valor={f2(m.max_drawdown, ' %')}
            tono="down"
            nota={hay(m.drawdown_actual) ? `ahora ${f2(m.drawdown_actual, ' %')} bajo el máximo` : null}
          />
          <Cifra
            etiqueta="VaR 95 %"
            valor={f2(m.var_95, ' %')}
            tono="caution"
            nota="1 de cada 20 sesiones cae al menos esto"
          />
          <Cifra
            etiqueta="CVaR 95 %"
            valor={f2(m.cvar_95, ' %')}
            tono="caution"
            nota="media de ese peor 5 %, no su frontera"
          />
          <Cifra etiqueta="Ulcer" valor={f2(m.ulcer_index)} nota="profundidad × duración de las caídas" />
          <Cifra
            etiqueta="Calmar"
            valor={f2(m.calmar_ratio)}
            nota="rentabilidad por unidad de caída máxima"
          />
        </View>

        {/* ── Frente al índice, con el R² como portero ──────────────────── */}
        <Rule />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          <Legend>Frente al S&P 500</Legend>
          {hay(r2) ? (
            <Text
              style={[
                type.caption,
                numeric,
                { color: regresionFloja ? toneColors(palette, 'caution').fg : colors.inkMuted, fontWeight: '700' },
              ]}
            >
              R² {f1(r2, ' %')}
            </Text>
          ) : null}
        </View>

        {regresionFloja ? (
          <View
            style={{
              backgroundColor: toneColors(palette, 'caution').wash,
              borderLeftWidth: 2,
              borderLeftColor: toneColors(palette, 'caution').fg,
              paddingHorizontal: space.sm,
              paddingVertical: space.xs,
              borderRadius: radius.xs,
              marginBottom: space.xs,
            }}
          >
            <Text style={[type.caption, { color: colors.ink }]}>
              El índice explica sólo el {f1(r2)} % del movimiento de esta cartera. Beta, alfa y
              Treynor salen de esa regresión: son aritméticamente correctos y no significan lo que
              parecen. Una beta de {f2(m.portfolio_beta)} con este R² no dice «se mueve un{' '}
              {f1(Number(m.portfolio_beta) * 100)} % de lo que el mercado», dice «no se mueve con el
              mercado».
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          <Cifra
            etiqueta="Beta"
            valor={f2(m.portfolio_beta)}
            atenuado={regresionFloja}
            nota={
              hay(m.posiciones_con_beta) && hay(m.posiciones_totales) &&
              Number(m.posiciones_con_beta) < Number(m.posiciones_totales)
                ? `sobre ${m.posiciones_con_beta} de ${m.posiciones_totales} posiciones con beta publicada`
                : 'media ponderada de las posiciones'
            }
          />
          <Cifra
            etiqueta="Alfa de Jensen"
            valor={fpc(m.portfolio_alpha)}
            tono={m.portfolio_alpha >= 0 ? 'up' : 'down'}
            atenuado={regresionFloja}
            nota="lo obtenido menos lo que exige el CAPM"
          />
          <Cifra
            etiqueta="Treynor"
            valor={f2(m.treynor_ratio)}
            atenuado={regresionFloja}
            nota="exceso por unidad de beta"
          />
          <Cifra
            etiqueta="Tracking error"
            valor={f2(m.tracking_error, ' %')}
            nota="riesgo ACTIVO: desviación de la diferencia, no la volatilidad"
          />
          <Cifra
            etiqueta="Ratio información"
            valor={f2(m.information_ratio)}
            nota="exceso sobre el índice por unidad de tracking error"
          />
          <Cifra
            etiqueta="Captura alza / baja"
            valor={
              hay(m.captura_alcista) || hay(m.captura_bajista)
                ? `${f0(m.captura_alcista)} / ${f0(m.captura_bajista)}`
                : '—'
            }
            nota="% del movimiento del índice que recoge en cada dirección"
          />
        </View>

        {/* ── CAPM como una resta auditable ─────────────────────────────── */}
        {hay(m.capm_esperado) ? (
          <>
            <Rule />
            <Legend>CAPM · de dónde sale el alfa</Legend>
            <View
              style={{
                backgroundColor: colors.surfaceSunken,
                borderWidth: hairline,
                borderColor: colors.rule,
                borderRadius: radius.sm,
                padding: space.sm,
                gap: 4,
              }}
            >
              <Text style={[type.caption, numeric, { color: colors.inkMuted }]}>
                {f2(m.risk_free_rate)} %  +  {f2(m.portfolio_beta)} × {f2(m.prima_riesgo_mercado)} %  ={'  '}
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{f2(m.capm_esperado)} %</Text>
                {'   exigido por el riesgo de mercado'}
              </Text>
              <Text style={[type.caption, numeric, { color: colors.inkMuted }]}>
                {f2(m.average_return)} %  −  {f2(m.capm_esperado)} %  ={'  '}
                <Text
                  style={{
                    color: toneColors(palette, m.portfolio_alpha >= 0 ? 'up' : 'down').fg,
                    fontWeight: '700',
                  }}
                >
                  {fpc(m.portfolio_alpha)}
                </Text>
                {'   de alfa'}
              </Text>
              <Text style={[type.caption, { color: colors.inkFaint }]}>
                La prima de mercado es el S&P ({f2(m.benchmark_return)} %) menos el tipo sin riesgo.
                Los cuatro números están a la vista para que la resta se pueda rehacer a mano.
              </Text>
            </View>
          </>
        ) : null}

        {/* ── Estructura ────────────────────────────────────────────────── */}
        <Rule />
        <Legend>Estructura</Legend>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          <Cifra
            etiqueta="Diversificación"
            valor={hay(m.ratio_diversificacion) ? `${f2(m.ratio_diversificacion)}×` : '—'}
            tono="accent"
            nota={
              hay(m.ratio_diversificacion)
                ? `la cartera oscila un ${f0(100 - 100 / Number(m.ratio_diversificacion))} % menos que la media de sus partes`
                : 'media ponderada de volatilidades ÷ volatilidad real'
            }
          />
          <Concentracion hhi={m.concentracion_hhi} mayor={m.peso_mayor} />
          <Cifra
            etiqueta="Ganancia / pérdida"
            valor={f2(m.gain_loss_ratio)}
            tono={m.gain_loss_ratio >= 1 ? 'up' : 'down'}
            nota="euros ganados por euro perdido en las posiciones abiertas"
          />
        </View>
      </View>
    </Panel>
  );
}

/** Entero con signo, para porcentajes gruesos donde dos decimales estorban. */
function f0(v: any): string {
  return hay(v) ? `${Math.round(Number(v))} %` : '—';
}
