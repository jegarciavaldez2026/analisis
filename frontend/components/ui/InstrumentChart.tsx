/**
 * Gráfico interactivo del instrumento.
 *
 * No es un sparkline decorativo: es la lectura de una o varias series con su
 * escala rotulada y un cursor que el usuario arrastra para interrogar cualquier
 * punto. El mismo gesto sirve para dedo y para ratón (PanResponder cubre las dos
 * en react-native-web), y la cabecera muestra el valor de todas las series a la
 * vez en la posición del cursor: comparar es el trabajo, no un extra.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../../contexts/ThemeContext';
import { Tone, toneColors } from '../../theme/tokens';
import { Legend } from './Instrument';

export interface ChartPoint {
  /** Marca temporal (ms) o índice ordinal. */
  x: number;
  /** Valor medido. `null` = sin señal: el trazo se interrumpe, no se inventa. */
  y: number | null;
  /** Etiqueta legible para el cursor (fecha ya formateada, por ejemplo). */
  label?: string;
}

export interface ChartSeries {
  key: string;
  label: string;
  points: ChartPoint[];
  /** Tono semántico. Si se omite se deduce del signo del tramo (sólo la 1ª serie). */
  tone?: Tone;
  /** Color explícito; gana sobre el tono. Para series que no son direccionales. */
  color?: string;
  /** Relleno bajo el trazo. Sólo tiene sentido en la serie principal. */
  showArea?: boolean;
  /** Trazo discontinuo, para referencias y comparativas. */
  dashed?: boolean;
}

interface Props {
  /** Serie única (atajo). Se ignora si se pasa `series`. */
  data?: ChartPoint[];
  /** Varias series sobre el mismo eje temporal. */
  series?: ChartSeries[];
  height?: number;
  tone?: Tone;
  /** Línea de referencia horizontal (cierre anterior, base 100, umbral…). */
  baseline?: number | null;
  showArea?: boolean;
  formatValue?: (v: number) => string;
  formatX?: (x: number) => string;
  ranges?: { key: string; label: string }[];
  activeRange?: string;
  onRangeChange?: (key: string) => void;
  legend?: string;
  emptyMessage?: string;
}

const PAD = { top: 12, right: 8, bottom: 22, left: 46 };

export function InstrumentChart({
  data,
  series,
  height = 220,
  tone,
  baseline,
  showArea = true,
  formatValue,
  formatX,
  ranges,
  activeRange,
  onRangeChange,
  legend,
  emptyMessage = 'Sin serie disponible para este periodo.',
}: Props) {
  const { colors, palette, space, type, radius, hairline, numeric } = useTheme();
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const widthRef = useRef(0);

  /** Una sola forma interna: todo son series. */
  const allSeries: ChartSeries[] = useMemo(() => {
    if (series && series.length) return series;
    return [{ key: 'main', label: legend ?? '', points: data ?? [], tone, showArea }];
  }, [series, data, legend, tone, showArea]);

  const primary = allSeries[0];
  const length = primary?.points.length ?? 0;

  const fmtV = useCallback(
    (v: number) =>
      formatValue
        ? formatValue(v)
        : v.toLocaleString('es-ES', { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 0 }),
    [formatValue],
  );

  const fmtX = useCallback(
    (x: number, label?: string) => {
      if (label) return label;
      if (formatX) return formatX(x);
      const d = new Date(x);
      return Number.isFinite(d.getTime())
        ? d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
        : String(x);
    },
    [formatX],
  );

  const colorOf = useCallback(
    (s: ChartSeries, index: number): string => {
      if (s.color) return s.color;
      if (s.tone) return toneColors(palette, s.tone).fg;
      if (index > 0) return colors.inkMuted;
      // La serie principal sin tono explícito toma el signo del tramo completo.
      const vals = s.points.map((p) => p.y).filter((v): v is number => v != null && Number.isFinite(v));
      if (vals.length < 2) return colors.accent;
      const delta = vals[vals.length - 1] - vals[0];
      return delta > 0 ? colors.up : delta < 0 ? colors.down : colors.accent;
    },
    [palette, colors],
  );

  const geom = useMemo(() => {
    const values = allSeries
      .flatMap((s) => s.points.map((p) => p.y))
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (width <= 0 || values.length === 0) return null;

    const min = Math.min(...values, baseline != null ? baseline : Infinity);
    const max = Math.max(...values, baseline != null ? baseline : -Infinity);
    const span = max - min || Math.abs(max) || 1;
    const lo = min - span * 0.08;
    const hi = max + span * 0.08;

    const plotW = Math.max(width - PAD.left - PAD.right, 1);
    const plotH = Math.max(height - PAD.top - PAD.bottom, 1);

    const xAt = (i: number) => PAD.left + (length <= 1 ? plotW / 2 : (i / (length - 1)) * plotW);
    const yAt = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;

    /** Trazo con interrupciones reales donde no hay señal. */
    const pathFor = (points: ChartPoint[]) => {
      let d = '';
      let area = '';
      let open = false;
      points.forEach((p, i) => {
        if (p.y == null || !Number.isFinite(p.y)) {
          open = false;
          return;
        }
        d += `${open ? 'L' : 'M'}${xAt(i).toFixed(2)},${yAt(p.y).toFixed(2)} `;
        if (!open) area += `M${xAt(i).toFixed(2)},${(PAD.top + plotH).toFixed(2)} L`;
        area += `${xAt(i).toFixed(2)},${yAt(p.y).toFixed(2)} `;
        open = true;
      });
      if (area) area += `L${xAt(points.length - 1).toFixed(2)},${(PAD.top + plotH).toFixed(2)} Z`;
      return { d, area };
    };

    return { lo, hi, plotW, plotH, xAt, yAt, pathFor, ticks: [lo, lo + (hi - lo) / 2, hi] };
  }, [width, height, allSeries, baseline, length]);

  const indexFromX = useCallback(
    (px: number) => {
      const w = widthRef.current;
      if (w <= 0 || length === 0) return null;
      const plotW = Math.max(w - PAD.left - PAD.right, 1);
      const i = Math.round(((px - PAD.left) / plotW) * (length - 1));
      return Math.max(0, Math.min(length - 1, i));
    },
    [length],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setCursor(indexFromX(e.nativeEvent.locationX)),
        onPanResponderMove: (e) => setCursor(indexFromX(e.nativeEvent.locationX)),
        onPanResponderRelease: () => setCursor(null),
        onPanResponderTerminate: () => setCursor(null),
      }),
    [indexFromX],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  /** Lectura por serie: en el cursor si lo hay, en el último punto si no. */
  const readouts = allSeries.map((s, i) => {
    const at = cursor != null ? s.points[cursor] : undefined;
    const lastValid = [...s.points].reverse().find((p) => p.y != null && Number.isFinite(p.y));
    const firstValid = s.points.find((p) => p.y != null && Number.isFinite(p.y));
    const value = at && at.y != null && Number.isFinite(at.y) ? at.y : (lastValid?.y ?? null);
    const base = firstValid?.y ?? null;
    const change = base != null && value != null && base !== 0 ? ((value - base) / Math.abs(base)) * 100 : null;
    return { series: s, color: colorOf(s, i), value, change };
  });

  const cursorPoint = cursor != null ? primary?.points[cursor] : undefined;
  const multi = allSeries.length > 1;

  return (
    <View style={{ gap: space.sm }}>
      {/* Cabecera de lectura: siempre muestra algo, con cursor o sin él */}
      <View style={{ gap: space.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: space.md,
            flexWrap: 'wrap',
          }}
        >
          <View style={{ gap: 2, flex: 1, minWidth: 180 }}>
            {legend ? <Legend>{legend}</Legend> : null}

            {multi ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: 2 }}>
                {readouts.map((r) => (
                  <View key={r.series.key} style={{ gap: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                      <View style={{ width: 3, height: 12, backgroundColor: r.color }} />
                      <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0.4 }]}>
                        {r.series.label}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs }}>
                      <Text style={[type.title3, numeric, { color: colors.ink }]}>
                        {r.value != null ? fmtV(r.value) : '—'}
                      </Text>
                      {r.change != null && Number.isFinite(r.change) ? (
                        <Text
                          style={[
                            type.legend,
                            numeric,
                            {
                              letterSpacing: 0,
                              color: r.change > 0 ? colors.up : r.change < 0 ? colors.down : colors.inkMuted,
                            },
                          ]}
                        >
                          {r.change > 0 ? '+' : r.change < 0 ? '−' : ''}
                          {Math.abs(r.change).toFixed(2)}%
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
                <Text style={[type.title1, numeric, { color: colors.ink }]}>
                  {readouts[0]?.value != null ? fmtV(readouts[0].value as number) : '—'}
                </Text>
                {readouts[0]?.change != null && Number.isFinite(readouts[0].change as number) ? (
                  <Text
                    style={[
                      type.caption,
                      numeric,
                      {
                        fontWeight: '700',
                        color:
                          (readouts[0].change as number) > 0
                            ? colors.up
                            : (readouts[0].change as number) < 0
                              ? colors.down
                              : colors.inkMuted,
                      },
                    ]}
                  >
                    {(readouts[0].change as number) > 0 ? '+' : (readouts[0].change as number) < 0 ? '−' : ''}
                    {Math.abs(readouts[0].change as number).toFixed(2)} %
                  </Text>
                ) : null}
              </View>
            )}

            <Text style={[type.caption, { color: colors.inkFaint }]}>
              {cursorPoint
                ? fmtX(cursorPoint.x, cursorPoint.label)
                : length
                  ? 'Arrastra sobre el gráfico para leer un punto'
                  : ' '}
            </Text>
          </View>

          {ranges && ranges.length > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                borderWidth: hairline,
                borderColor: colors.rule,
                borderRadius: radius.xs,
                overflow: 'hidden',
                backgroundColor: colors.surfaceSunken,
              }}
            >
              {ranges.map((r, i) => {
                const on = r.key === activeRange;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => onRangeChange?.(r.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [
                      {
                        minWidth: 44,
                        minHeight: 36,
                        paddingVertical: space.xs,
                        paddingHorizontal: space.sm,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? colors.accent : pressed ? colors.accentWash : 'transparent',
                        borderLeftWidth: i === 0 ? 0 : hairline,
                        borderLeftColor: colors.rule,
                      },
                      Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                    ]}
                  >
                    <Text
                      style={[
                        type.caption,
                        { color: on ? colors.inkOnAccent : colors.inkMuted, fontWeight: on ? '700' : '500' },
                      ]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>

      {/* Área trazada */}
      <View
        onLayout={onLayout}
        {...responder.panHandlers}
        style={{
          height,
          borderWidth: hairline,
          borderColor: colors.rule,
          borderRadius: radius.xs,
          backgroundColor: colors.surfaceSunken,
          overflow: 'hidden',
          justifyContent: 'center',
        }}
      >
        {geom && width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="instrumentFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={readouts[0]?.color ?? colors.accent} stopOpacity={0.2} />
                <Stop offset="1" stopColor={readouts[0]?.color ?? colors.accent} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>

            {/* Marcas de escala horizontales */}
            <G>
              {geom.ticks.map((t, i) => (
                <Line
                  key={i}
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={geom.yAt(t)}
                  y2={geom.yAt(t)}
                  stroke={colors.rule}
                  strokeWidth={1}
                />
              ))}
            </G>

            {baseline != null && Number.isFinite(baseline) ? (
              <Line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={geom.yAt(baseline)}
                y2={geom.yAt(baseline)}
                stroke={colors.ruleStrong}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ) : null}

            {/* Series: se pintan de la última a la primera para que la
                principal quede encima de las comparativas. */}
            {allSeries
              .map((s, i) => ({ s, i, color: colorOf(s, i), path: geom.pathFor(s.points) }))
              .reverse()
              .map(({ s, i, color, path }) => (
                <G key={s.key}>
                  {i === 0 && (s.showArea ?? showArea) && path.area ? (
                    <Path d={path.area} fill="url(#instrumentFill)" />
                  ) : null}
                  {path.d ? (
                    <Path
                      d={path.d}
                      stroke={color}
                      strokeWidth={i === 0 ? 2 : 1.5}
                      strokeDasharray={s.dashed ? '5 4' : undefined}
                      fill="none"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={i === 0 ? 1 : 0.85}
                    />
                  ) : null}
                </G>
              ))}

            {/* Cursor: una línea, un punto por serie */}
            {cursor != null ? (
              <G>
                <Line
                  x1={geom.xAt(cursor)}
                  x2={geom.xAt(cursor)}
                  y1={PAD.top}
                  y2={PAD.top + geom.plotH}
                  stroke={colors.ink}
                  strokeWidth={1}
                  opacity={0.5}
                />
                {allSeries.map((s, i) => {
                  const p = s.points[cursor];
                  if (!p || p.y == null || !Number.isFinite(p.y)) return null;
                  return (
                    <Circle
                      key={s.key}
                      cx={geom.xAt(cursor)}
                      cy={geom.yAt(p.y)}
                      r={4.5}
                      fill={colors.surface}
                      stroke={colorOf(s, i)}
                      strokeWidth={2}
                    />
                  );
                })}
              </G>
            ) : null}

            {/* Zócalo de la escala vertical */}
            <Rect x={0} y={0} width={PAD.left - 6} height={height} fill={colors.surfaceSunken} />
          </Svg>
        ) : null}

        {/* Rótulos de la escala vertical (texto RN: nítido y con la cara mono) */}
        {geom
          ? geom.ticks.map((t, i) => (
              <Text
                key={i}
                style={[
                  type.legend,
                  numeric,
                  {
                    position: 'absolute',
                    left: 4,
                    top: geom.yAt(t) - 7,
                    width: PAD.left - 10,
                    textAlign: 'right',
                    color: colors.inkFaint,
                    letterSpacing: 0,
                  },
                ]}
              >
                {fmtV(t)}
              </Text>
            ))
          : null}

        {/* Extremos del eje temporal */}
        {geom && length > 1 ? (
          <>
            <Text
              style={[
                type.legend,
                { position: 'absolute', left: PAD.left, bottom: 4, color: colors.inkFaint, letterSpacing: 0 },
              ]}
            >
              {fmtX(primary.points[0].x, primary.points[0].label)}
            </Text>
            <Text
              style={[
                type.legend,
                { position: 'absolute', right: PAD.right, bottom: 4, color: colors.inkFaint, letterSpacing: 0 },
              ]}
            >
              {fmtX(primary.points[length - 1].x, primary.points[length - 1].label)}
            </Text>
          </>
        ) : null}

        {!geom ? (
          <Text style={[type.caption, { color: colors.inkFaint, textAlign: 'center' }]}>
            {emptyMessage}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
