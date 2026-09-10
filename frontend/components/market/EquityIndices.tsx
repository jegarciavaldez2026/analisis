/**
 * Renta variable global.
 *
 * Un índice suelto no dice nada: 7.785 no es alto ni bajo hasta que se ve
 * contra su propio año. Por eso cada fila lleva tres lecturas y no una — el
 * último valor, el movimiento del día y la posición dentro del rango de 52
 * semanas — y encima va la curva de la sesión, normalizada a porcentaje para
 * que el Nikkei (68.000) y el FTSE (10.700) puedan compararse en el mismo eje.
 *
 * Los chips no son decoración: quitar un índice lo saca del gráfico. Con nueve
 * curvas superpuestas no se lee nada, así que la herramienta principal de esta
 * tarjeta es poder apagar lo que no interesa.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Polyline } from 'react-native-svg';

import { useTheme } from '../../contexts/ThemeContext';
import { Legend, Panel, Rule } from '../ui';
import { deltaTone, seriesColor, toneColors } from '../../theme/tokens';

export interface EquityIndex {
  name: string;
  ticker: string;
  region: string;
  last: number;
  change: number;
  change_percent: number;
  week52_low: number;
  week52_high: number;
  week52_position: number;
  session: string;
  series: number[];
  updated: string;
}

const REGIONS = ['Global', 'Americas', 'Europe & Africa', 'Asia-Pacific', 'Futuros'] as const;
type Region = (typeof REGIONS)[number];

/** En estrecho la etiqueta se abrevia; la pestaña no desaparece. */
const REGION_SHORT: Record<Region, string> = {
  Global: 'Global',
  Americas: 'AMER',
  'Europe & Africa': 'EMEA',
  'Asia-Pacific': 'APAC',
  Futuros: 'FUT',
};

const CHART_HEIGHT = 168;

function formatValue(v: number) {
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ==========================================================================
 * Barra de rango de 52 semanas
 * ======================================================================== */

function RangeBar({ index }: { index: EquityIndex }) {
  const { colors, hairline, space, type, numeric } = useTheme();
  const pos = Math.max(0, Math.min(100, index.week52_position));

  return (
    <View style={{ gap: 3, minWidth: 128 }}>
      <View
        style={{
          height: 12,
          backgroundColor: colors.surfaceSunken,
          borderWidth: hairline,
          borderColor: colors.rule,
          justifyContent: 'center',
        }}
      >
        {/* La marca es una plomada, no un relleno: comunica un punto dentro
            de un recorrido, no una cantidad acumulada. */}
        <View
          style={{
            position: 'absolute',
            left: `${pos}%`,
            width: 2,
            height: 12,
            marginLeft: -1,
            backgroundColor: colors.ink,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.xs }}>
        <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
          {formatValue(index.week52_low)}
        </Text>
        <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
          {formatValue(index.week52_high)}
        </Text>
      </View>
    </View>
  );
}

/* ==========================================================================
 * Gráfico multilínea de la sesión
 * ======================================================================== */

function SessionChart({
  indices,
  colorFor,
}: {
  indices: EquityIndex[];
  colorFor: (ticker: string) => string;
}) {
  const { colors, hairline, space, type, numeric } = useTheme();
  const [width, setWidth] = useState(0);

  /* Cada curva se convierte a variación porcentual sobre su propio primer
     punto. Es la única forma de que seis índices con órdenes de magnitud
     distintos compartan eje sin que uno aplaste a los demás. */
  const normalized = useMemo(() => {
    return indices
      .filter((ix) => ix.series && ix.series.length > 1)
      .map((ix) => {
        const base = ix.series[0];
        const pct = base ? ix.series.map((v) => ((v - base) / base) * 100) : ix.series.map(() => 0);
        return { ticker: ix.ticker, name: ix.name, pct };
      });
  }, [indices]);

  const { min, max, longest } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    let len = 0;
    normalized.forEach((s) => {
      s.pct.forEach((v) => {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      });
      if (s.pct.length > len) len = s.pct.length;
    });
    // Un poco de aire para que las curvas no toquen el marco.
    const pad = Math.max(0.25, (hi - lo) * 0.12);
    return { min: lo - pad, max: hi + pad, longest: len };
  }, [normalized]);

  if (normalized.length === 0) {
    return (
      <View style={{ paddingVertical: space.xl, alignItems: 'center' }}>
        <Text style={[type.caption, { color: colors.inkFaint }]}>
          Sin curvas de sesión disponibles.
        </Text>
      </View>
    );
  }

  const range = max - min || 1;
  const y = (v: number) => CHART_HEIGHT - ((v - min) / range) * CHART_HEIGHT;
  const x = (i: number) => (longest > 1 ? (i / (longest - 1)) * width : 0);

  // Rejilla en porcentajes redondos, no en divisiones arbitrarias del rango.
  const ticks: number[] = [];
  const step = range > 6 ? 2 : range > 3 ? 1 : 0.5;
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(Number(t.toFixed(2)));

  return (
    <View style={{ gap: space.xs }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          height: CHART_HEIGHT,
          backgroundColor: colors.surfaceSunken,
          borderWidth: hairline,
          borderColor: colors.rule,
        }}
      >
        {width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            {ticks.map((t) => (
              <Line
                key={t}
                x1={0}
                x2={width}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? colors.ruleStrong : colors.rule}
                strokeWidth={t === 0 ? 1 : hairline}
                strokeDasharray={t === 0 ? undefined : '2 4'}
              />
            ))}
            {normalized.map((s) => (
              <Polyline
                key={s.ticker}
                points={s.pct.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                fill="none"
                stroke={colorFor(s.ticker)}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
          {min.toFixed(1)} %
        </Text>
        <Text style={[type.legend, { color: colors.inkFaint }]}>
          VARIACIÓN SOBRE LA APERTURA DE SESIÓN
        </Text>
        <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
          {max.toFixed(1)} %
        </Text>
      </View>
    </View>
  );
}

/* ==========================================================================
 * Tarjeta
 * ======================================================================== */

export default function EquityIndices({ indices }: { indices: EquityIndex[] }) {
  const { colors, palette, space, type, radius, hairline, numeric, isDark } = useTheme();
  const { width } = useWindowDimensions();
  /* En estrecho no se encoge la tabla: se retiran las dos columnas de
     contexto. Un rango de 52 semanas de 40 px de ancho no se puede leer, y
     media barra miente más que ninguna barra. */
  const compact = width < 760;
  const [region, setRegion] = useState<Region>('Global');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // El color de cada índice se fija sobre la lista completa, no sobre la
  // filtrada: así el S&P no cambia de tinta al saltar de pestaña.
  const colorFor = useMemo(() => {
    const mapa = new Map(indices.map((ix, i) => [ix.ticker, seriesColor(isDark, i)]));
    return (ticker: string) => mapa.get(ticker) ?? colors.accent;
  }, [indices, isDark, colors.accent]);

  const visibleRegion = useMemo(
    () => (region === 'Global'
      ? indices.filter((ix) => ix.region !== 'Futuros')   // el futuro y su índice
      : indices.filter((ix) => ix.region === region)),    // son el mismo activo
    [indices, region],
  );

  const charted = useMemo(
    () => visibleRegion.filter((ix) => !hidden.has(ix.ticker)),
    [visibleRegion, hidden],
  );

  const toggle = (ticker: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });

  if (!indices || indices.length === 0) return null;

  return (
    <Panel
      legend="Renta variable"
      title="Índices"
      padded={false}
      action={
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {REGIONS.map((r) => {
            const active = r === region;
            return (
              <Pressable
                key={r}
                onPress={() => setRegion(r)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: space.sm,
                    paddingVertical: space.xs,
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
                    { color: active ? colors.accent : colors.inkMuted, fontWeight: active ? '700' : '500' },
                  ]}
                >
                  {compact ? REGION_SHORT[r] : r}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
    >
      {/* Chips: encender y apagar curvas */}
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {visibleRegion.map((ix) => {
            const off = hidden.has(ix.ticker);
            return (
              <Pressable
                key={ix.ticker}
                onPress={() => toggle(ix.ticker)}
                accessibilityRole="switch"
                accessibilityState={{ checked: !off }}
                accessibilityLabel={`${off ? 'Mostrar' : 'Ocultar'} ${ix.name} en el gráfico`}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.xs,
                    paddingHorizontal: space.sm,
                    paddingVertical: space.xs,
                    minHeight: 30,
                    borderRadius: radius.xs,
                    borderWidth: hairline,
                    borderColor: off ? colors.rule : colors.ruleStrong,
                    backgroundColor: off ? 'transparent' : colors.surfaceSunken,
                    opacity: pressed ? 0.7 : 1,
                  },
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                ]}
              >
                <View
                  style={{
                    width: 10,
                    height: 3,
                    backgroundColor: off ? colors.noSignal : colorFor(ix.ticker),
                  }}
                />
                <Text
                  style={[
                    type.caption,
                    {
                      color: off ? colors.inkFaint : colors.ink,
                      textDecorationLine: off ? 'line-through' : 'none',
                    },
                  ]}
                >
                  {ix.name}
                </Text>
                <Ionicons
                  name={off ? 'add' : 'close'}
                  size={12}
                  color={off ? colors.inkFaint : colors.inkMuted}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Gráfico */}
      <View style={{ padding: space.lg }}>
        <SessionChart indices={charted} colorFor={colorFor} />
      </View>

      <Rule />

      {/* Tabla */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Legend>Índice</Legend>
        </View>
        <View style={{ minWidth: 96, alignItems: 'flex-end' }}>
          <Legend>Último</Legend>
        </View>
        <View style={{ minWidth: 92, alignItems: 'flex-end' }}>
          <Legend>Hoy</Legend>
        </View>
        {compact ? null : (
          <>
            <View style={{ minWidth: 128 }}>
              <Legend>Rango 52 semanas</Legend>
            </View>
            <View style={{ minWidth: 68, alignItems: 'flex-end' }}>
              <Legend>Sesión</Legend>
            </View>
          </>
        )}
      </View>

      <Rule />

      {region === 'Futuros' ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
          <Text style={[type.caption, { color: colors.inkMuted, lineHeight: 18 }]}>
            Los futuros cotizan casi las veinticuatro horas, así que anticipan hacia dónde abrirá
            el contado cuando las bolsas todavía están cerradas. Su rango de 52 semanas no es
            comparable con el del índice al contado: los contratos vencen y se renuevan, y cada
            renovación deja un salto en la serie que no es un movimiento de mercado.
          </Text>
        </View>
      ) : null}

      {visibleRegion.map((ix, i) => {
        const tone = deltaTone(ix.change);
        const { fg } = toneColors(palette, tone);
        const open = ix.session === 'Abierto';
        return (
          <View key={ix.ticker}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
              }}
            >
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View
                  style={{
                    width: 3,
                    height: 22,
                    backgroundColor: colorFor(ix.ticker),
                    opacity: hidden.has(ix.ticker) ? 0.3 : 1,
                  }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.label, { color: colors.ink }]} numberOfLines={1}>
                    {ix.name}
                  </Text>
                  <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
                    {ix.ticker}
                  </Text>
                </View>
              </View>

              <View style={{ minWidth: 96, alignItems: 'flex-end' }}>
                <Text style={[type.bodyStrong, numeric, { color: colors.ink }]}>
                  {formatValue(ix.last)}
                </Text>
              </View>

              <View style={{ minWidth: 92, alignItems: 'flex-end' }}>
                <Text style={[type.caption, numeric, { color: fg, fontWeight: '700' }]}>
                  {ix.change > 0 ? '+' : ix.change < 0 ? '−' : ''}
                  {Math.abs(ix.change).toFixed(2)}
                </Text>
                <Text style={[type.legend, numeric, { color: fg, letterSpacing: 0 }]}>
                  {ix.change_percent > 0 ? '+' : ix.change_percent < 0 ? '−' : ''}
                  {Math.abs(ix.change_percent).toFixed(2)} %
                </Text>
              </View>

              {compact ? null : (
                <>
                  <RangeBar index={ix} />

                  <View style={{ minWidth: 68, alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: open ? palette.up : colors.noSignal,
                        }}
                      />
                      <Text style={[type.caption, { color: open ? palette.up : colors.inkMuted }]}>
                        {ix.session}
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
            {i < visibleRegion.length - 1 ? <Rule /> : null}
          </View>
        );
      })}
    </Panel>
  );
}
