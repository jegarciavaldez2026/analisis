/**
 * Evolución de una materia prima.
 *
 * El selector de marco temporal no cambia el zoom de la misma serie: cambia la
 * pregunta. «1H» responde a qué está haciendo el oro esta mañana; «Anual»
 * responde a qué ha hecho en veinte años. Por eso cada marco trae su propia
 * granularidad desde el backend en vez de recortar un histórico único.
 *
 * Nace para el oro y sirve para cualquier futuro del catálogo — plata,
 * petróleo, cobre — sin tocar este archivo.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import Svg, { Line, Path, Polyline } from 'react-native-svg';
import axios from 'axios';

import { useTheme } from '../../contexts/ThemeContext';
import { Legend, Panel, Rule, Skeleton } from '../ui';
import { deltaTone, toneColors } from '../../theme/tokens';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

const TIMEFRAMES = [
  { key: '1h', label: '1H' },
  { key: 'diario', label: 'Diario' },
  { key: 'semanal', label: 'Semanal' },
  { key: 'mensual', label: 'Mensual' },
  { key: 'anual', label: 'Anual' },
] as const;

type TimeframeKey = (typeof TIMEFRAMES)[number]['key'];

interface Point {
  date: string;
  close: number;
}

interface CommodityChart {
  symbol: string;
  name: string;
  unit: string;
  timeframe: string;
  points: Point[];
  first: number;
  last: number;
  change: number;
  change_percent: number;
  low: number;
  high: number;
  updated: string;
}

const CHART_HEIGHT = 200;

export default function CommodityChart({
  symbol = 'oro',
  legend = 'Materia prima',
}: {
  symbol?: string;
  legend?: string;
}) {
  const { colors, palette, space, type, radius, hairline, numeric } = useTheme();
  const [timeframe, setTimeframe] = useState<TimeframeKey>('diario');
  const [data, setData] = useState<CommodityChart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [width, setWidth] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await axios.get(
        `${BACKEND_URL}/api/commodity-chart/${symbol}?timeframe=${timeframe}`,
      );
      setData(res.data);
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    load();
  }, [load]);

  const tone = deltaTone(data?.change);
  const { fg, wash } = toneColors(palette, tone);

  const geometry = useMemo(() => {
    if (!data || data.points.length < 2 || width <= 0) return null;
    const values = data.points.map((p) => p.close);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.08 || 1;
    const min = lo - pad;
    const max = hi + pad;
    const range = max - min || 1;

    const x = (i: number) => (i / (values.length - 1)) * width;
    const y = (v: number) => CHART_HEIGHT - ((v - min) / range) * CHART_HEIGHT;

    const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    // El área bajo la curva cierra contra la base del marco, no contra el
    // mínimo: si cierra contra el mínimo parece que el precio llegó a cero.
    const area = `M0,${CHART_HEIGHT} L${values
      .map((v, i) => `${x(i)},${y(v)}`)
      .join(' L')} L${width},${CHART_HEIGHT} Z`;

    return { line, area, min, max, y };
  }, [data, width]);

  const hasData = Boolean(data && data.points.length > 1);

  return (
    <Panel
      legend={legend}
      title={data ? `${data.name}${data.unit ? ` · ${data.unit}` : ''}` : 'Materia prima'}
      padded={false}
      action={
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {TIMEFRAMES.map((tf) => {
            const active = tf.key === timeframe;
            return (
              <Pressable
                key={tf.key}
                onPress={() => setTimeframe(tf.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Marco temporal ${tf.label}`}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: space.sm,
                    paddingVertical: space.xs,
                    minHeight: 30,
                    justifyContent: 'center',
                    borderRadius: radius.xs,
                    backgroundColor: active ? colors.accentWash : 'transparent',
                    borderWidth: hairline,
                    borderColor: active ? colors.accent : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                ]}
              >
                <Text
                  style={[
                    type.caption,
                    {
                      color: active ? colors.accent : colors.inkMuted,
                      fontWeight: active ? '700' : '500',
                    },
                  ]}
                >
                  {tf.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
    >
      {/* Lectura numérica: el titular va antes que el dibujo */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: space.lg,
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: space.sm,
        }}
      >
        <View>
          <Legend>Último</Legend>
          {loading && !data ? (
            <Skeleton width={110} height={26} />
          ) : (
            <Text style={[type.title2, numeric, { color: colors.ink }]}>
              {data
                ? data.last.toLocaleString('es-ES', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : '—'}
            </Text>
          )}
        </View>

        <View>
          <Legend>Variación del periodo</Legend>
          <Text style={[type.bodyStrong, numeric, { color: data ? fg : colors.noSignal }]}>
            {data
              ? `${data.change > 0 ? '+' : data.change < 0 ? '−' : ''}${Math.abs(
                  data.change,
                ).toFixed(2)}  (${data.change_percent > 0 ? '+' : data.change_percent < 0 ? '−' : ''}${Math.abs(
                  data.change_percent,
                ).toFixed(2)} %)`
              : '—'}
          </Text>
        </View>

        <View>
          <Legend>Rango del periodo</Legend>
          <Text style={[type.bodyStrong, numeric, { color: colors.inkMuted }]}>
            {data
              ? `${data.low.toLocaleString('es-ES', { maximumFractionDigits: 2 })} – ${data.high.toLocaleString(
                  'es-ES',
                  { maximumFractionDigits: 2 },
                )}`
              : '—'}
          </Text>
        </View>
      </View>

      <Rule />

      {/* Curva */}
      <View style={{ padding: space.lg }}>
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{
            height: CHART_HEIGHT,
            backgroundColor: colors.surfaceSunken,
            borderWidth: hairline,
            borderColor: colors.rule,
            overflow: 'hidden',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {loading ? (
            <Text style={[type.caption, { color: colors.inkFaint }]}>Cargando serie…</Text>
          ) : error ? (
            <Text style={[type.caption, { color: colors.inkMuted }]}>
              No se pudo cargar la serie.
            </Text>
          ) : !hasData ? (
            <Text style={[type.caption, { color: colors.inkFaint }]}>
              Sin datos para este marco temporal.
            </Text>
          ) : geometry && width > 0 ? (
            <Svg width={width} height={CHART_HEIGHT} style={{ position: 'absolute' }}>
              {[0.25, 0.5, 0.75].map((f) => (
                <Line
                  key={f}
                  x1={0}
                  x2={width}
                  y1={CHART_HEIGHT * f}
                  y2={CHART_HEIGHT * f}
                  stroke={colors.rule}
                  strokeWidth={hairline}
                  strokeDasharray="2 4"
                />
              ))}
              <Path d={geometry.area} fill={wash} />
              <Polyline
                points={geometry.line}
                fill="none"
                stroke={fg}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </Svg>
          ) : null}
        </View>

        {hasData && data ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs }}>
            <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
              {data.points[0].date}
            </Text>
            <Text style={[type.legend, { color: colors.inkFaint }]}>
              {data.points.length} OBSERVACIONES
            </Text>
            <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
              {data.points[data.points.length - 1].date}
            </Text>
          </View>
        ) : null}
      </View>
    </Panel>
  );
}
