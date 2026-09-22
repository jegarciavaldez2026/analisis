/**
 * IndicatorsChartCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Gráfico de indicadores de 3 paneles que replica el script Python de finplot:
 *   Panel 1 – Velas japonesas + Volumen coloreado + VAMA + VWAP + línea POC
 *   Panel 2 – RSI 14 + EMA 10 del RSI + bandas 30 / 70
 *   Panel 3 – Coppock Curve + EMA 13
 *
 * Renderizado: SVG puro (compatible React Native Web + Expo Web).
 * Sin dependencias externas más allá de React y axios.
 *
 * USO en ResultsScreen.tsx:
 *   import IndicatorsChartCard from '../../components/IndicatorsChartCard';
 *   <IndicatorsChartCard ticker={data.ticker} />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import axios from 'axios';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volume_color: 'green' | 'red';
}
interface Pt { date: string; value: number | null }
interface ChartData {
  ticker: string;
  company_name: string;
  period: string;
  candles: Candle[];
  vama: Pt[];
  vwap: Pt[];
  poc_price: number;
  volume_ema: Pt[];
  rsi: Pt[];
  rsi_ema: Pt[];
  coppock: Pt[];
  coppock_ema: Pt[];
  current_price: number;
  swing_high: number;
  swing_low: number;
}

/* ── Paleta del gráfico ─────────────────────────────────────────────────────
 * Antes eran veintitrés hex fijos de un terminal oscuro: en el tema claro el
 * panel seguía negro sobre el esmalte. Ahora se deriva de la paleta activa,
 * así que en claro adopta el mismo tratamiento que «Cotización frente al
 * S&P 500» —pozo hundido, reglas de un pelo, acento petróleo— y en oscuro
 * sigue siendo el panel retroiluminado que era.
 *
 * Verde y rojo salen del código semántico del producto: son los mismos que
 * usan las velas, el histograma de volumen y las bandas del RSI.
 * ------------------------------------------------------------------------ */
function makeChartPalette(c: ThemeColors) {
  return {
    bg:          c.canvas,
    bgPanel:     c.surfaceSunken,
    border:      c.rule,
    gridLine:    c.rule,
    candle_bull: c.up,
    candle_bear: c.down,
    vol_bull:    c.upWash,
    vol_bear:    c.downWash,
    poc:         c.accent,
    vwap:        c.caution,
    vama:        c.ink,
    vol_ema:     c.caution,
    rsi:         c.accent,
    rsi_ema:     c.caution,
    rsi_30:      c.up,
    rsi_70:      c.down,
    copp:        c.up,
    copp_ema:    c.down,
    text:        c.inkMuted,
    textDim:     c.inkFaint,
    accent:      c.accent,
    zero:        c.ruleStrong,
  };
}
type ChartPalette = ReturnType<typeof makeChartPalette>;

/** Atajo: cada subcomponente lee la paleta derivada del tema activo. */
function useChartPalette(): ChartPalette {
  const { colors } = useTheme();
  return useMemo(() => makeChartPalette(colors), [colors]);
}

const PERIODS = ['30wk', '60wk', '1y', '2y'] as const;
type Period = typeof PERIODS[number];

// ─── Helpers SVG ─────────────────────────────────────────────────────────────
function scaleY(val: number, min: number, max: number, h: number, pad = 8): number {
  if (max === min) return h / 2;
  return pad + (1 - (val - min) / (max - min)) * (h - pad * 2);
}

function buildLine(pts: Pt[], xs: number[], min: number, max: number, h: number): string {
  const segments: string[] = [];
  let inSeg = false;
  for (let i = 0; i < pts.length; i++) {
    const v = pts[i].value;
    if (v == null || !isFinite(v)) { inSeg = false; continue; }
    const x = xs[i];
    const y = scaleY(v, min, max, h);
    if (!inSeg) { segments.push(`M${x},${y}`); inSeg = true; }
    else          segments.push(`L${x},${y}`);
  }
  return segments.join(' ');
}

function validPts(arr: Pt[]): number[] {
  return arr.map(p => p.value).filter(v => v != null && isFinite(v as number)) as number[];
}

// ─── Sub-componentes SVG ──────────────────────────────────────────────────────

function YAxis({ min, max, h, w = 52 }: { min: number; max: number; h: number; w?: number }) {
  const PALETTE = useChartPalette();
  const steps = 4;
  const labels = Array.from({ length: steps + 1 }, (_, i) => {
    const v = min + (max - min) * (i / steps);
    return { v, y: scaleY(v, min, max, h) };
  });
  return (
    <g>
      {labels.map(({ v, y }, i) => (
        <text key={i} x={w - 4} y={y + 4} textAnchor="end" fontSize={9}
          fill={PALETTE.textDim} fontFamily="monospace">
          {v > 1000 ? v.toFixed(0) : v.toFixed(2)}
        </text>
      ))}
    </g>
  );
}

function Grid({ min, max, h, w, steps = 4 }: { min: number; max: number; h: number; w: number; steps?: number }) {
  const PALETTE = useChartPalette();
  return (
    <g>
      {Array.from({ length: steps + 1 }, (_, i) => {
        const v = min + (max - min) * (i / steps);
        const y = scaleY(v, min, max, h);
        return <line key={i} x1={0} y1={y} x2={w} y2={y} stroke={PALETTE.gridLine} strokeWidth={1} />;
      })}
    </g>
  );
}

// ─── Panel 1: Velas + Volumen + VAMA + VWAP + POC ────────────────────────────
function CandlePanel({ data, xs, w, h, yAxisW }: {
  data: ChartData; xs: number[]; w: number; h: number; yAxisW: number;
}) {
  const PALETTE = useChartPalette();
  const innerW = w - yAxisW;
  const cH = Math.round(h * 0.68);
  const vH = h - cH - 4;

  const candles = data.candles;
  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const pMin = Math.min(...allPrices) * 0.998;
  const pMax = Math.max(...allPrices) * 1.002;

  const vols = candles.map(c => c.volume);
  const vMax = Math.max(...vols) * 1.05;

  const cw = Math.max(1, (innerW / candles.length) * 0.7);

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <rect width={w} height={h} fill={PALETTE.bgPanel} />
      <g transform={`translate(${yAxisW},0)`}>
        <Grid min={pMin} max={pMax} h={cH} w={innerW} />

        {candles.map((c, i) => {
          const x = xs[i] - cw / 2;
          const vh = Math.max(1, (c.volume / vMax) * vH);
          const y = h - vh;
          return (
            <rect key={i} x={x} y={y} width={cw} height={vh}
              fill={c.volume_color === 'green' ? PALETTE.vol_bull : PALETTE.vol_bear} />
          );
        })}

        <path d={buildLine(data.volume_ema, xs, 0, vMax, vH)} fill="none"
          stroke={PALETTE.vol_ema} strokeWidth={1}
          transform={`translate(0,${h - vH})`} />

        {candles.map((c, i) => {
          const x = xs[i];
          const yH = scaleY(c.high,  pMin, pMax, cH);
          const yL = scaleY(c.low,   pMin, pMax, cH);
          const yO = scaleY(c.open,  pMin, pMax, cH);
          const yC = scaleY(c.close, pMin, pMax, cH);
          const bull = c.close >= c.open;
          const color = bull ? PALETTE.candle_bull : PALETTE.candle_bear;
          const bodyTop = Math.min(yO, yC);
          const bodyH   = Math.max(1, Math.abs(yO - yC));
          return (
            <g key={i}>
              <line x1={x} y1={yH} x2={x} y2={yL} stroke={color} strokeWidth={1} />
              <rect x={x - cw / 2} y={bodyTop} width={cw} height={bodyH}
                fill={color} stroke={color} strokeWidth={0.5} opacity={0.9} />
            </g>
          );
        })}

        <line x1={0} y1={scaleY(data.poc_price, pMin, pMax, cH)}
          x2={innerW} y2={scaleY(data.poc_price, pMin, pMax, cH)}
          stroke={PALETTE.poc} strokeWidth={1} strokeDasharray="4 3" opacity={0.85} />
        <text x={innerW - 4} y={scaleY(data.poc_price, pMin, pMax, cH) - 3}
          fontSize={8} fill={PALETTE.poc} textAnchor="end" fontFamily="monospace">
          POC {data.poc_price.toFixed(2)}
        </text>

        <path d={buildLine(data.vwap, xs, pMin, pMax, cH)} fill="none"
          stroke={PALETTE.vwap} strokeWidth={1.5} opacity={0.9} />
        <path d={buildLine(data.vama, xs, pMin, pMax, cH)} fill="none"
          stroke={PALETTE.vama} strokeWidth={1.5} opacity={0.85} />
      </g>

      <YAxis min={pMin} max={pMax} h={cH} w={yAxisW} />

      <line x1={yAxisW} y1={h - vH - 4} x2={w} y2={h - vH - 4}
        stroke={PALETTE.border} strokeWidth={0.5} />

      <g transform={`translate(${yAxisW + 8}, 14)`}>
        <LegendItem x={0}   color={PALETTE.vwap}  label="VWAP" />
        <LegendItem x={60}  color={PALETTE.vama}  label="VAMA" />
        <LegendItem x={120} color={PALETTE.poc}   label={`POC ${data.poc_price.toFixed(2)}`} dashed />
      </g>
    </svg>
  );
}

// ─── Panel 2: RSI ─────────────────────────────────────────────────────────────
function RSIPanel({ data, xs, w, h, yAxisW }: {
  data: ChartData; xs: number[]; w: number; h: number; yAxisW: number;
}) {
  const PALETTE = useChartPalette();
  const innerW = w - yAxisW;
  const rMin = 0, rMax = 100;

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <rect width={w} height={h} fill={PALETTE.bgPanel} />
      <g transform={`translate(${yAxisW},0)`}>
        <Grid min={rMin} max={rMax} h={h} w={innerW} steps={5} />

        {(() => {
          const y30 = scaleY(30, rMin, rMax, h);
          const y70 = scaleY(70, rMin, rMax, h);
          return <rect x={0} y={y70} width={innerW} height={y30 - y70} fill={PALETTE.gridLine} fillOpacity={0.35} />;
        })()}

        {[30, 50, 70].map(v => (
          <line key={v} x1={0} y1={scaleY(v, rMin, rMax, h)}
            x2={innerW} y2={scaleY(v, rMin, rMax, h)}
            stroke={v === 70 ? PALETTE.rsi_70 : v === 30 ? PALETTE.rsi_30 : PALETTE.zero}
            strokeWidth={v === 50 ? 0.5 : 1} strokeDasharray={v === 50 ? '2 2' : '3 2'} opacity={0.6} />
        ))}

        <path d={buildLine(data.rsi, xs, rMin, rMax, h)} fill="none"
          stroke={PALETTE.rsi} strokeWidth={1.5} />
        <path d={buildLine(data.rsi_ema, xs, rMin, rMax, h)} fill="none"
          stroke={PALETTE.rsi_ema} strokeWidth={1.2} opacity={0.9} />
      </g>

      <YAxis min={rMin} max={rMax} h={h} w={yAxisW} />

      <g transform={`translate(${yAxisW + 8}, 12)`}>
        <LegendItem x={0}   color={PALETTE.rsi}     label="RSI 14" />
        <LegendItem x={60}  color={PALETTE.rsi_ema} label="EMA 10" />
        <LegendItem x={120} color={PALETTE.rsi_70}  label="70" dashed />
        <LegendItem x={160} color={PALETTE.rsi_30}  label="30" dashed />
      </g>
    </svg>
  );
}

// ─── Panel 3: Coppock ────────────────────────────────────────────────────────
function CoppockPanel({ data, xs, w, h, yAxisW }: {
  data: ChartData; xs: number[]; w: number; h: number; yAxisW: number;
}) {
  const PALETTE = useChartPalette();
  const innerW = w - yAxisW;
  const validC = validPts(data.coppock);
  const validE = validPts(data.coppock_ema);
  const all    = [...validC, ...validE];
  if (all.length === 0) return null as any;

  const raw  = Math.max(Math.abs(Math.min(...all)), Math.abs(Math.max(...all)));
  const cMin = -raw * 1.1;
  const cMax =  raw * 1.1;
  const y0   = scaleY(0, cMin, cMax, h);

  function buildFill(pts: Pt[], positive: boolean): string {
    const segs: string[] = [];
    let open = false;
    let prevX = 0;
    for (let i = 0; i < pts.length; i++) {
      const v = pts[i].value;
      if (v == null || !isFinite(v)) { open = false; continue; }
      const x = xs[i];
      const y = scaleY(v, cMin, cMax, h);
      const passes = positive ? v >= 0 : v <= 0;
      if (!open && passes) { segs.push(`M${x},${y0} L${x},${y}`); prevX = x; open = true; }
      else if (open && passes) { segs.push(`L${x},${y}`); prevX = x; }
      else if (open && !passes) { segs.push(`L${prevX},${y0} Z`); open = false; }
    }
    if (open) segs.push(`L${prevX},${y0} Z`);
    return segs.join(' ');
  }

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <rect width={w} height={h} fill={PALETTE.bgPanel} />
      <g transform={`translate(${yAxisW},0)`}>
        <Grid min={cMin} max={cMax} h={h} w={innerW} steps={4} />
        <line x1={0} y1={y0} x2={innerW} y2={y0} stroke={PALETTE.zero} strokeWidth={1} />
        <path d={buildFill(data.coppock, true)}  fill={PALETTE.copp}     opacity={0.35} />
        <path d={buildFill(data.coppock, false)} fill={PALETTE.copp_ema} opacity={0.35} />
        <path d={buildLine(data.coppock,     xs, cMin, cMax, h)} fill="none"
          stroke={PALETTE.copp}     strokeWidth={1.5} />
        <path d={buildLine(data.coppock_ema, xs, cMin, cMax, h)} fill="none"
          stroke={PALETTE.copp_ema} strokeWidth={1.5} opacity={0.9} />
      </g>

      <YAxis min={cMin} max={cMax} h={h} w={yAxisW} />

      <g transform={`translate(${yAxisW + 8}, 12)`}>
        <LegendItem x={0}  color={PALETTE.copp}     label="Coppock" />
        <LegendItem x={75} color={PALETTE.copp_ema} label="EMA 13" />
      </g>
    </svg>
  );
}

// ─── Leyenda inline ───────────────────────────────────────────────────────────
function LegendItem({ x, color, label, dashed }: { x: number; color: string; label: string; dashed?: boolean }) {
  const PALETTE = useChartPalette();
  return (
    <g transform={`translate(${x},0)`}>
      <line x1={0} y1={0} x2={14} y2={0} stroke={color} strokeWidth={1.5}
        strokeDasharray={dashed ? '3 2' : undefined} />
      <text x={18} y={4} fontSize={9} fill={PALETTE.text} fontFamily="monospace">{label}</text>
    </g>
  );
}

// ─── Eje X ────────────────────────────────────────────────────────────────────
function XAxis({ candles, xs, w, yAxisW, h = 20 }: {
  candles: Candle[]; xs: number[]; w: number; yAxisW: number; h?: number;
}) {
  const PALETTE = useChartPalette();
  const n = candles.length;
  const every = Math.max(1, Math.floor(n / 7));
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <rect width={w} height={h} fill={PALETTE.bg} />
      {candles.map((c, i) => {
        if (i % every !== 0) return null;
        const x = xs[i] + yAxisW;
        return (
          <text key={i} x={x} y={14} fontSize={8} textAnchor="middle"
            fill={PALETTE.textDim} fontFamily="monospace">
            {c.date.slice(2, 10)}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface Props { ticker: string }

export default function IndicatorsChartCard({ ticker }: Props) {
  const { colors } = useTheme();
  const PALETTE = useChartPalette();
  const styles = useMemo(() => makeStyles(PALETTE, colors), [PALETTE, colors]);
  const [data,       setData]       = useState<ChartData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [period,     setPeriod]     = useState<Period>('30wk');
  // ── Ancho dinámico del contenedor ────────────────────────────────────────
  const [containerW, setContainerW] = useState<number>(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerW(w);
  }, []);

  const loadData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<ChartData>(
        `${BACKEND_URL}/api/indicators-chart/${ticker}?period=${p}`
      );
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al cargar indicadores');
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { loadData(period); }, [period]);

  // ── Dimensiones ───────────────────────────────────────────────────────────
  // totalW = ancho real del contenedor, con padding de 2px a cada lado
  const totalW  = containerW > 0 ? containerW - 4 : 0;
  const yAxisW  = 52;
  const innerW  = Math.max(0, totalW - yAxisW);

  // Alturas proporcionales al ancho (más espacio que antes)
  const H1 = Math.round(totalW * 0.38);   // ~38% del ancho → panel velas
  const H2 = Math.round(totalW * 0.15);   // ~15% → RSI
  const H3 = Math.round(totalW * 0.14);   // ~14% → Coppock
  const HX = 20;

  // Posiciones X de cada vela
  const xs: number[] = data && innerW > 0
    ? data.candles.map((_, i) =>
        Math.round((i + 0.5) * (innerW / data.candles.length))
      )
    : [];

  return (
    <View style={styles.card} onLayout={handleLayout}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.title}>📈 Indicadores Técnicos Avanzados</Text>
          <Text style={styles.subtitle}>
            Velas · Volumen · VWAP · VAMA · POC · RSI · Coppock
          </Text>
        </View>
        <View style={styles.periods}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Contenido */}
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={PALETTE.accent} />
          <Text style={styles.loadingText}>Calculando indicadores…</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.center}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadData(period)}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {data && !loading && !error && containerW > 0 && (
        // Sin ScrollView horizontal — el gráfico ocupa todo el ancho de la card
        <View style={{ backgroundColor: PALETTE.bg, width: '100%' }}>
          {/* Etiqueta panel 1 */}
          <PanelLabel
            label={`${data.ticker} — ${data.company_name}  |  Precio: $${data.current_price.toFixed(2)}`}
          />

          {/* Panel 1: Velas */}
          <CandlePanel data={data} xs={xs} w={totalW} h={H1} yAxisW={yAxisW} />

          <View style={[styles.divider, { width: totalW }]} />

          {/* Etiqueta panel 2 */}
          <PanelLabel label="RSI 14" />

          {/* Panel 2: RSI */}
          <RSIPanel data={data} xs={xs} w={totalW} h={H2} yAxisW={yAxisW} />

          <View style={[styles.divider, { width: totalW }]} />

          {/* Etiqueta panel 3 */}
          <PanelLabel label="Coppock Curve" />

          {/* Panel 3: Coppock */}
          <CoppockPanel data={data} xs={xs} w={totalW} h={H3} yAxisW={yAxisW} />

          {/* Eje X */}
          <XAxis candles={data.candles} xs={xs} w={totalW} yAxisW={yAxisW} h={HX} />

          {/* Métricas rápidas */}
          <View style={styles.quickMetrics}>
            <QuickMetric label="Máximo" value={`$${data.swing_high.toFixed(2)}`} color={PALETTE.candle_bull} />
            <QuickMetric label="Mínimo"  value={`$${data.swing_low.toFixed(2)}`}  color={PALETTE.candle_bear} />
            <QuickMetric label="POC"     value={`$${data.poc_price.toFixed(2)}`}  color={PALETTE.poc} />
            <QuickMetric
              label="RSI actual"
              value={(() => {
                const last = [...data.rsi].reverse().find(p => p.value != null);
                return last ? last.value!.toFixed(1) : 'N/A';
              })()}
              color={PALETTE.rsi}
            />
            <QuickMetric
              label="Coppock"
              value={(() => {
                const last = [...data.coppock].reverse().find(p => p.value != null);
                if (!last) return 'N/A';
                const v = last.value!;
                return `${v >= 0 ? '▲' : '▼'} ${v.toFixed(2)}`;
              })()}
              color={data.coppock.slice(-5).some(p => p.value != null && p.value! >= 0)
                ? PALETTE.copp : PALETTE.copp_ema}
            />
          </View>
        </View>
      )}

      {/* Disclaimer */}
      {data && <DireccionPanel data={data} period={period} />}

      <Text style={styles.disclaimer}>
        Los indicadores se calculan sobre datos históricos y no constituyen asesoramiento financiero.
      </Text>
    </View>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
 * Lectura direccional
 *
 * NO es una prediccion de precio. Es la suma ponderada de lo que dicen los
 * indicadores que ya estan dibujados arriba, expresada como sesgo y como
 * banda de recorrido esperable. Dos decisiones deliberadas:
 *
 *  - Sesgo, no objetivo. Un precio objetivo concreto seria inventarse una
 *    precision que estos indicadores no tienen. Se da direccion e intensidad.
 *  - Banda por volatilidad realizada, no por extrapolar la tendencia. El
 *    ancho sale de la desviacion tipica de los retornos diarios recientes
 *    escalada a raiz del horizonte, que es como se propaga la incertidumbre.
 *
 * Cada senal se muestra por separado con su voto: el usuario puede ver de
 * donde sale el numero y estar en desacuerdo con una parte.
 * ══════════════════════════════════════════════════════════════════════════ */

interface Senal {
  label: string;
  detalle: string;
  voto: -1 | 0 | 1;
  peso: number;
}

interface Lectura {
  score: number;              // -100 … +100
  etiqueta: string;
  tono: 'up' | 'down' | 'caution' | 'neutral';
  senales: Senal[];
  banda: { bajo: number; alto: number; sigma: number; sesiones: number } | null;
  aviso: string | null;
}

const ultimoValido = (pts: Pt[]): number | null => {
  for (let i = pts.length - 1; i >= 0; i--) {
    const v = pts[i]?.value;
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
};

/** Sesiones que cubre el horizonte segun el periodo elegido en el grafico. */
const horizonteDe = (period: Period): number =>
  period === '30wk' ? 10 : period === '60wk' ? 20 : period === '1y' ? 20 : 40;

function leerDireccion(data: ChartData, period: Period): Lectura {
  const precio = data.current_price;
  const vwap = ultimoValido(data.vwap);
  const vama = ultimoValido(data.vama);
  const rsi = ultimoValido(data.rsi);
  const rsiEma = ultimoValido(data.rsi_ema);
  const copp = ultimoValido(data.coppock);
  const coppEma = ultimoValido(data.coppock_ema);

  const senales: Senal[] = [];
  const push = (label: string, detalle: string, voto: -1 | 0 | 1, peso: number) =>
    senales.push({ label, detalle, voto, peso });

  if (vwap != null) {
    const dif = ((precio - vwap) / vwap) * 100;
    push('Precio vs VWAP',
      `${dif >= 0 ? '+' : '−'}${Math.abs(dif).toFixed(1)} % respecto al precio medio ponderado`,
      dif > 0.5 ? 1 : dif < -0.5 ? -1 : 0, 2);
  }
  if (vama != null) {
    const dif = ((precio - vama) / vama) * 100;
    push('Precio vs VAMA',
      `${dif >= 0 ? '+' : '−'}${Math.abs(dif).toFixed(1)} % respecto a la media adaptativa`,
      dif > 0.5 ? 1 : dif < -0.5 ? -1 : 0, 2);
  }
  if (data.poc_price) {
    const dif = ((precio - data.poc_price) / data.poc_price) * 100;
    push('Precio vs POC',
      `${dif >= 0 ? 'Por encima' : 'Por debajo'} del punto de control de volumen`,
      dif > 0 ? 1 : dif < 0 ? -1 : 0, 1);
  }
  if (rsi != null && rsiEma != null) {
    push('RSI vs su media',
      `RSI ${rsi.toFixed(1)} ${rsi > rsiEma ? 'por encima' : 'por debajo'} de la EMA 10`,
      rsi > rsiEma ? 1 : rsi < rsiEma ? -1 : 0, 1.5);
  }
  if (copp != null && coppEma != null) {
    push('Coppock vs su media',
      `${copp > coppEma ? 'Cruce al alza' : 'Cruce a la baja'} sobre la EMA 13`,
      copp > coppEma ? 1 : copp < coppEma ? -1 : 0, 2);
    push('Signo de Coppock',
      `Curva en terreno ${copp >= 0 ? 'positivo' : 'negativo'} (${copp.toFixed(2)})`,
      copp > 0 ? 1 : copp < 0 ? -1 : 0, 1.5);
  }

  const pesoTotal = senales.reduce((a, s) => a + s.peso, 0) || 1;
  const score = Math.round((senales.reduce((a, s) => a + s.voto * s.peso, 0) / pesoTotal) * 100);

  // El RSI extremo no vota direccion: avisa de que la senal puede agotarse.
  let aviso: string | null = null;
  if (rsi != null && rsi >= 70) {
    aviso = `RSI en ${rsi.toFixed(1)}: zona de sobrecompra. Las lecturas alcistas pierden fiabilidad aqui.`;
  } else if (rsi != null && rsi <= 30) {
    aviso = `RSI en ${rsi.toFixed(1)}: zona de sobreventa. Las lecturas bajistas pierden fiabilidad aqui.`;
  }

  const etiqueta =
    score >= 50 ? 'Sesgo alcista' :
    score >= 20 ? 'Sesgo alcista debil' :
    score > -20 ? 'Sin sesgo claro' :
    score > -50 ? 'Sesgo bajista debil' : 'Sesgo bajista';
  const tono: Lectura['tono'] =
    score >= 20 ? 'up' : score <= -20 ? 'down' : 'caution';

  // ── Banda de recorrido: volatilidad realizada, no extrapolacion ──────────
  const cierres = data.candles.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
  let banda: Lectura['banda'] = null;
  if (cierres.length > 20) {
    const ventana = cierres.slice(-Math.min(60, cierres.length));
    const rets: number[] = [];
    for (let i = 1; i < ventana.length; i++) rets.push(Math.log(ventana[i] / ventana[i - 1]));
    const media = rets.reduce((a, b) => a + b, 0) / rets.length;
    const varianza = rets.reduce((a, r) => a + (r - media) ** 2, 0) / rets.length;
    const sigmaDia = Math.sqrt(varianza);
    const sesiones = horizonteDe(period);
    const sigma = sigmaDia * Math.sqrt(sesiones);
    if (Number.isFinite(sigma) && sigma > 0) {
      banda = {
        bajo: precio * Math.exp(-sigma),
        alto: precio * Math.exp(sigma),
        sigma: sigma * 100,
        sesiones,
      };
    }
  }

  return { score, etiqueta, tono, senales, banda, aviso };
}

function DireccionPanel({ data, period }: { data: ChartData; period: Period }) {
  const { colors } = useTheme();
  const PALETTE = useChartPalette();
  const styles = useMemo(() => makeStyles(PALETTE, colors), [PALETTE, colors]);
  const lectura = useMemo(() => leerDireccion(data, period), [data, period]);

  if (!lectura.senales.length) return null;

  const tonoColor =
    lectura.tono === 'up' ? colors.up :
    lectura.tono === 'down' ? colors.down : colors.caution;

  // La aguja recorre −100…+100 sobre la misma escala calibrada del resto de la app.
  const posicion = ((lectura.score + 100) / 200) * 100;

  return (
    <View style={styles.direccionCard}>
      <View style={styles.direccionHeader}>
        <View>
          <Text style={styles.direccionLabel}>LECTURA DE LOS INDICADORES</Text>
          <Text style={[styles.direccionTitulo, { color: tonoColor }]}>{lectura.etiqueta}</Text>
        </View>
        <View style={[styles.direccionScore, { borderColor: tonoColor }]}>
          <Text style={[styles.direccionScoreTexto, { color: tonoColor }]}>
            {lectura.score > 0 ? '+' : ''}{lectura.score}
          </Text>
        </View>
      </View>

      {/* Escala del sesgo */}
      <View style={styles.sesgoPista}>
        <View style={[styles.sesgoMitad, { backgroundColor: colors.downWash }]} />
        <View style={[styles.sesgoMitad, { backgroundColor: colors.upWash }]} />
        <View style={[styles.sesgoCentro, { backgroundColor: colors.ruleStrong }]} />
        <View style={[styles.sesgoIndice, { left: `${posicion}%`, backgroundColor: tonoColor }]} />
      </View>
      <View style={styles.sesgoRotulos}>
        <Text style={styles.sesgoRotulo}>BAJISTA</Text>
        <Text style={styles.sesgoRotulo}>NEUTRAL</Text>
        <Text style={styles.sesgoRotulo}>ALCISTA</Text>
      </View>

      {/* Banda de recorrido */}
      {lectura.banda && (
        <View style={styles.bandaCaja}>
          <Text style={styles.bandaTitulo}>
            Recorrido esperable a {lectura.banda.sesiones} sesiones
          </Text>
          <View style={styles.bandaFila}>
            <Text style={[styles.bandaValor, { color: colors.down }]}>
              ${lectura.banda.bajo.toFixed(2)}
            </Text>
            <Text style={styles.bandaActual}>${data.current_price.toFixed(2)}</Text>
            <Text style={[styles.bandaValor, { color: colors.up }]}>
              ${lectura.banda.alto.toFixed(2)}
            </Text>
          </View>
          <Text style={styles.bandaNota}>
            Una desviacion tipica (±{lectura.banda.sigma.toFixed(1)} %) segun la volatilidad de las
            ultimas sesiones. Dos de cada tres veces el precio se queda dentro; no es un objetivo.
          </Text>
        </View>
      )}

      {lectura.aviso && (
        <View style={[styles.avisoCaja, { borderColor: colors.caution, backgroundColor: colors.cautionWash }]}>
          <View style={[styles.avisoMarca, { backgroundColor: colors.caution }]} />
          <Text style={[styles.avisoTexto, { color: colors.caution }]}>{lectura.aviso}</Text>
        </View>
      )}

      {/* De donde sale el numero */}
      <View style={styles.senalesLista}>
        {lectura.senales.map((s) => {
          const c = s.voto > 0 ? colors.up : s.voto < 0 ? colors.down : colors.inkFaint;
          return (
            <View key={s.label} style={styles.senalFila}>
              <View style={[styles.senalMarca, { backgroundColor: c }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.senalLabel}>{s.label}</Text>
                <Text style={styles.senalDetalle}>{s.detalle}</Text>
              </View>
              <Text style={[styles.senalVoto, { color: c }]}>
                {s.voto > 0 ? 'ALCISTA' : s.voto < 0 ? 'BAJISTA' : 'NEUTRO'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Micro-componentes ────────────────────────────────────────────────────────
function PanelLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  const PALETTE = useChartPalette();
  const styles = useMemo(() => makeStyles(PALETTE, colors), [PALETTE, colors]);
  return (
    <View style={styles.panelLabel}>
      <Text style={styles.panelLabelText}>{label}</Text>
    </View>
  );
}

function QuickMetric({ label, value, color }: { label: string; value: string; color: string }) {
  const PALETTE = useChartPalette();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(PALETTE, colors), [PALETTE, colors]);
  return (
    <View style={styles.qm}>
      <Text style={styles.qmLabel}>{label}</Text>
      <Text style={[styles.qmValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
function makeStyles(PALETTE: ChartPalette, c: ThemeColors) {
  return StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginBottom: 20,
      borderRadius: 16,
      backgroundColor: PALETTE.bg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: PALETTE.border,
      // Sin width fija: se adapta al contenedor padre
    },
    header: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: PALETTE.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      gap: 10,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: c.ink,
      marginBottom: 2,
    },
    subtitle: {
      fontSize: 11,
      color: PALETTE.textDim,
      letterSpacing: 0.3,
    },
    periods: {
      flexDirection: 'row',
      gap: 4,
      flexShrink: 0,
    },
    periodBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: c.surfaceSunken,
      borderWidth: 1,
      borderColor: PALETTE.border,
    },
    periodBtnActive: {
      backgroundColor: PALETTE.accent + '25',
      borderColor: PALETTE.accent,
    },
    periodText: {
      fontSize: 11,
      color: PALETTE.textDim,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    periodTextActive: {
      color: PALETTE.accent,
      fontWeight: '700',
    },
    center: {
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 180,
    },
    loadingText: {
      marginTop: 12,
      color: PALETTE.textDim,
      fontSize: 13,
    },
    errorEmoji: { fontSize: 36, marginBottom: 8 },
    errorText: { color: c.down, fontSize: 13, textAlign: 'center', marginBottom: 12 },
    retryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: PALETTE.accent + '20',
      borderWidth: 1,
      borderColor: PALETTE.accent,
    },
    retryText: { color: PALETTE.accent, fontSize: 13, fontWeight: '600' },
    divider: {
      height: 1,
      backgroundColor: PALETTE.border,
    },
    panelLabel: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: c.surfaceSunken,
    },
    panelLabelText: {
      fontSize: 9,
      color: PALETTE.textDim,
      letterSpacing: 0.5,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    quickMetrics: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: PALETTE.border,
      backgroundColor: c.canvas,
    },
    qm: {
      alignItems: 'center',
      minWidth: 70,
      backgroundColor: c.surfaceSunken,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: PALETTE.border,
    },
    qmLabel: {
      fontSize: 9,
      color: PALETTE.textDim,
      marginBottom: 2,
      letterSpacing: 0.3,
    },
    qmValue: {
      fontSize: 13,
      fontWeight: '700',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    direccionCard: {
      marginTop: 12,
      padding: 14,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.rule,
      backgroundColor: c.surface,
      gap: 10,
    },
    direccionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    direccionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.1, color: c.inkFaint },
    direccionTitulo: { fontSize: 18, fontWeight: '700', marginTop: 2 },
    direccionScore: {
      minWidth: 56, paddingVertical: 4, paddingHorizontal: 8,
      borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center',
    },
    direccionScoreTexto: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },

    sesgoPista: {
      height: 22, flexDirection: 'row', borderRadius: 3,
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.ruleStrong, overflow: 'hidden',
    },
    sesgoMitad: { flex: 1 },
    sesgoCentro: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1 },
    sesgoIndice: { position: 'absolute', top: 0, bottom: 0, width: 3, marginLeft: -1.5 },
    sesgoRotulos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
    sesgoRotulo: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: c.inkFaint },

    bandaCaja: {
      borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: c.rule,
      backgroundColor: c.surfaceSunken, padding: 10, gap: 6,
    },
    bandaTitulo: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: c.inkFaint },
    bandaFila: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    bandaValor: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
    bandaActual: { fontSize: 16, fontWeight: '700', color: c.ink, fontVariant: ['tabular-nums'] },
    bandaNota: { fontSize: 10, color: c.inkMuted, lineHeight: 14 },

    avisoCaja: {
      flexDirection: 'row', gap: 8, padding: 9,
      borderRadius: 5, borderWidth: StyleSheet.hairlineWidth,
    },
    avisoMarca: { width: 3, alignSelf: 'stretch' },
    avisoTexto: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: '500' },

    senalesLista: { gap: 2 },
    senalFila: {
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.rule,
    },
    senalMarca: { width: 3, height: 20 },
    senalLabel: { fontSize: 12, fontWeight: '600', color: c.ink },
    senalDetalle: { fontSize: 10, color: c.inkMuted },
    senalVoto: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, minWidth: 54, textAlign: 'right' },

    disclaimer: {
      fontSize: 10,
      color: PALETTE.textDim,
      textAlign: 'center',
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: PALETTE.border,
      backgroundColor: c.canvas,
    },
  });
}
