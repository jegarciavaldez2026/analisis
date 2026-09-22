/**
 * La escala calibrada.
 *
 * Es el elemento firma del producto: la regla de decisión del backend
 * (>=60 COMPRAR · 40–60 MANTENER · <40 VENDER) dejada de ser un umbral
 * invisible y dibujada como lo que es, tres bandas de tolerancia con el índice
 * cayendo en una de ellas. El usuario ve la posición antes de leer la palabra.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Rect } from 'react-native-svg';

import { useTheme } from '../../contexts/ThemeContext';
import { decisionBands, inkOn, mix, toneColors, Tone } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';

import { Legend, Num } from './Instrument';

const AnimatedView = Animated.View;

export function DecisionScale({
  /** Porcentaje de métricas favorables, 0–100. */
  value,
  verdict,
  risk,
  compact,
}: {
  value: number | null | undefined;
  verdict?: string | null;
  risk?: string | null;
  compact?: boolean;
}) {
  const { colors, palette, space, type, radius, hairline, motion, numeric } = useTheme();
  const [width, setWidth] = useState(0);
  const [explaining, setExplaining] = useState(false);

  const hasReading = value != null && Number.isFinite(value);
  const clamped = hasReading ? Math.max(0, Math.min(100, value as number)) : 0;

  const band = useMemo(
    () => decisionBands.find((b) => clamped >= b.from && clamped < b.to) ?? decisionBands[2],
    [clamped],
  );
  const tone: Tone = hasReading ? band.tone : 'neutral';
  const { fg } = toneColors(palette, tone);

  // El índice se asienta una vez, como una aguja que encuentra su posición.
  // Es cambio de estado, no coreografía: 320 ms y se acabó.
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(sweep, {
      toValue: clamped,
      duration: hasReading ? motion.slow : 0,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clamped, hasReading, motion.slow, sweep]);

  const trackHeight = compact ? 26 : 40;
  const indexLeft = sweep.interpolate({
    inputRange: [0, 100],
    outputRange: [0, Math.max(width - 2, 0)],
  });

  return (
    <View style={{ gap: space.sm }}>
      {!compact && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
          <View style={{ gap: 2 }}>
            <Legend>Métricas favorables</Legend>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <Num value={hasReading ? Number(clamped.toFixed(1)) : null} size="display" tone={tone} />
              {hasReading ? (
                <Text style={[type.title3, { color: colors.inkFaint }]}>%</Text>
              ) : null}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: space.xxs }}>
            <Text style={[type.title2, { color: fg, letterSpacing: 0.4 }]}>
              {verdict ?? (hasReading ? band.verdict : 'SIN LECTURA')}
            </Text>
            <Text style={[type.caption, { color: colors.inkMuted }]}>
              Riesgo {risk ?? (hasReading ? band.risk : 'indeterminado')}
            </Text>
          </View>
        </View>
      )}

      {/* Globo de lectura: el valor exacto, sobre el índice.
          La cifra grande dice cuánto; ésta dice dónde, que en una escala con
          bandas es otra pregunta. El globo se recorta a los bordes de la pista
          para no salirse en 0 % o 100 %, pero la punta sigue clavada en el
          índice: si se movieran las dos, el globo señalaría un valor falso. */}
      {hasReading && width > 0 && (
        <View style={{ height: 28 }} pointerEvents="none">
          {(() => {
            const ANCHO = 56;
            const px = (clamped / 100) * width;
            const izq = Math.min(Math.max(px - ANCHO / 2, 0), Math.max(width - ANCHO, 0));
            return (
              <>
                <View
                  style={{
                    position: 'absolute',
                    left: izq,
                    width: ANCHO,
                    paddingVertical: 3,
                    borderRadius: radius.xs,
                    backgroundColor: fg,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={[type.caption, numeric, { color: inkOn(fg, palette), fontWeight: '700' }]}
                  >
                    {clamped.toFixed(1)} %
                  </Text>
                </View>
                {/* Punta: un cuadrado girado. Un triángulo por bordes no se
                    comporta igual en web y en nativo. */}
                <View
                  style={{
                    position: 'absolute',
                    left: px - 4,
                    top: 18,
                    width: 8,
                    height: 8,
                    backgroundColor: fg,
                    transform: [{ rotate: '45deg' }],
                  }}
                />
              </>
            );
          })()}
        </View>
      )}

      {/* Pista graduada */}
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          height: trackHeight,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: colors.ruleStrong,
          backgroundColor: colors.surfaceSunken,
          overflow: 'hidden',
        }}
      >
        {width > 0 && (
          <Svg width={width} height={trackHeight}>
            {/* Bandas de tolerancia */}
            {decisionBands.map((b) => {
              const { wash } = toneColors(palette, b.tone);
              return (
                <Rect
                  key={b.verdict}
                  x={(b.from / 100) * width}
                  y={0}
                  width={((b.to - b.from) / 100) * width}
                  height={trackHeight}
                  fill={wash}
                />
              );
            })}
            {/* Marcas menores cada 5, mayores cada 10 */}
            <G>
              {Array.from({ length: 21 }).map((_, i) => {
                const pct = i * 5;
                const major = pct % 10 === 0;
                const x = (pct / 100) * width;
                return (
                  <Line
                    key={pct}
                    x1={x}
                    x2={x}
                    y1={trackHeight}
                    y2={trackHeight - (major ? trackHeight * 0.36 : trackHeight * 0.18)}
                    stroke={colors.ruleStrong}
                    strokeWidth={1}
                  />
                );
              })}
            </G>
            {/* Límites de decisión: trazo completo */}
            {[40, 60].map((pct) => (
              <Line
                key={pct}
                x1={(pct / 100) * width}
                x2={(pct / 100) * width}
                y1={0}
                y2={trackHeight}
                stroke={colors.ink}
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.55}
              />
            ))}
          </Svg>
        )}

        {/* Índice */}
        {hasReading && width > 0 && (
          <AnimatedView
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: 3,
              marginLeft: -1,
              backgroundColor: fg,
              transform: [{ translateX: indexLeft as any }],
            }}
          />
        )}
      </View>

      {/* Rotulación de la escala */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[0, 40, 60, 100].map((tick, i) => (
          <Text
            key={tick}
            style={[
              type.legend,
              {
                color: colors.inkFaint,
                textAlign: i === 0 ? 'left' : i === 3 ? 'right' : 'center',
                flex: 1,
              },
            ]}
          >
            {tick}
          </Text>
        ))}
      </View>

      {!compact && (
        <>
          <Pressable
            onPress={() => setExplaining((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: explaining }}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                paddingVertical: space.xs,
                opacity: pressed ? 0.7 : 1,
              },
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
            ]}
          >
            <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>
              {explaining ? 'Ocultar la regla de decisión' : 'Cómo se calcula esta lectura'}
            </Text>
          </Pressable>

          {explaining && (
            <View
              style={{
                gap: space.sm,
                padding: space.md,
                borderRadius: radius.sm,
                borderWidth: hairline,
                borderColor: colors.rule,
                backgroundColor: colors.surfaceSunken,
              }}
            >
              <Text style={[type.caption, { color: colors.inkMuted }]}>
                Cada ratio se compara con su umbral y cuenta como favorable o no. La proporción de
                favorables cae en una de estas tres bandas:
              </Text>
              {decisionBands
                .slice()
                .reverse()
                .map((b) => {
                  const c = toneColors(palette, b.tone);
                  const active = hasReading && b.verdict === band.verdict;
                  return (
                    <View
                      key={b.verdict}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                    >
                      <View
                        style={{
                          width: 3,
                          height: 16,
                          backgroundColor: c.fg,
                          opacity: active ? 1 : 0.4,
                        }}
                      />
                      <Text
                        style={[
                          type.caption,
                          { color: active ? c.fg : colors.inkMuted, fontWeight: active ? '700' : '500', width: 92 },
                        ]}
                      >
                        {b.verdict}
                      </Text>
                      <Text style={[type.caption, { color: colors.inkMuted }]}>
                        {b.from === 60 ? '≥ 60 %' : b.from === 40 ? '40 – 60 %' : '< 40 %'} · riesgo{' '}
                        {b.risk.toLowerCase()}
                      </Text>
                    </View>
                  );
                })}
              <Text style={[type.caption, { color: colors.inkFaint }]}>
                Es una lectura de los números publicados, no un consejo de inversión.
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

/**
 * Barra de proporción para una categoría de ratios (p. ej. «7 de 9 favorables»).
 * Misma gramática que la escala grande: pista hundida, marcas, índice sólido.
 */
export function RatioBar({
  passed,
  total,
  label,
}: {
  passed: number;
  total: number;
  label?: string;
}) {
  const { colors, palette, space, type, radius, hairline } = useTheme();
  const pct = total > 0 ? (passed / total) * 100 : 0;
  const tone: Tone = pct >= 60 ? 'up' : pct >= 40 ? 'caution' : 'down';
  const { fg } = toneColors(palette, tone);

  return (
    <View style={{ gap: space.xxs }}>
      {label ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[type.caption, { color: colors.inkMuted }]}>{label}</Text>
          <Text style={[type.caption, { color: fg, fontWeight: '700' }]}>
            {passed}/{total}
          </Text>
        </View>
      ) : null}
      <View
        style={{
          height: 8,
          borderRadius: radius.none,
          backgroundColor: colors.surfaceSunken,
          borderWidth: hairline,
          borderColor: colors.rule,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', backgroundColor: fg }} />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: '60%', top: 0, bottom: 0, width: hairline, backgroundColor: colors.ink, opacity: 0.4 }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: '40%', top: 0, bottom: 0, width: hairline, backgroundColor: colors.ink, opacity: 0.4 }}
        />
      </View>
    </View>
  );
}

/* ==========================================================================
 * Anillo de puntuación
 *
 * La misma lectura que la escala, en forma circular: un arco que se llena
 * hasta el porcentaje, con la cifra dentro. La escala responde a "¿en qué
 * banda cae?"; el anillo responde a "¿cuánto de lleno está?", que es la
 * pregunta que la gente se hace primero.
 * ========================================================================== */

export function ScoreRing({
  value,
  size = 132,
  grosor = 12,
}: {
  value: number | null | undefined;
  size?: number;
  grosor?: number;
}) {
  const { colors, palette, type, numeric, space } = useTheme();
  const hay = value != null && Number.isFinite(value);
  const pct = hay ? Math.max(0, Math.min(100, value as number)) : 0;

  const banda = decisionBands.find((b) => pct >= b.from && pct < b.to) ?? decisionBands[2];
  const tono: Tone = hay ? banda.tone : 'neutral';
  const { fg } = toneColors(palette, tono);

  const r = (size - grosor) / 2;
  const cx = size / 2;
  const circun = 2 * Math.PI * r;
  // Arranca arriba y avanza en sentido horario.
  const lleno = (pct / 100) * circun;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} origin={`${cx}, ${cx}`}>
          <Circle
            cx={cx}
            cy={cx}
            r={r}
            stroke={colors.surfaceSunken}
            strokeWidth={grosor}
            fill="none"
          />
          {hay && (
            <Circle
              cx={cx}
              cy={cx}
              r={r}
              stroke={fg}
              strokeWidth={grosor}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${lleno} ${circun - lleno}`}
            />
          )}
        </G>
      </Svg>

      <View style={{ alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={[type.title1, numeric, { color: hay ? fg : colors.noSignal, fontSize: 30 }]}>
            {hay ? pct.toFixed(1) : '—'}
          </Text>
          {hay ? <Text style={[type.caption, { color: colors.inkFaint }]}>%</Text> : null}
        </View>
        <Text
          style={[
            type.legend,
            { color: colors.inkFaint, textAlign: 'center', marginTop: 2, letterSpacing: 0.8 },
          ]}
        >
          MÉTRICAS{'\n'}FAVORABLES
        </Text>
      </View>
    </View>
  );
}

/* ==========================================================================
 * Fila de categoría, en piruleta
 *
 * Sustituye a la barra llena: el trazo va de cero al valor y termina en un
 * punto, que es lo que el ojo busca. Con diez categorías apiladas, diez
 * barras rellenas compiten entre sí; diez puntos se leen como una columna.
 *
 * El tono sale de tramos de fuerza declarados, no de un degradado continuo:
 * un 74 % y un 76 % son cosas distintas y deben verse distintas.
 * ========================================================================== */

export const TRAMOS_FUERZA = [
  { min: 75, label: 'Fuerte', tone: 'up' as const },
  { min: 50, label: 'Neutro', tone: 'caution' as const },
  { min: 25, label: 'Débil', tone: 'caution' as const },
  { min: 0, label: 'Muy débil', tone: 'down' as const },
];

export function fuerzaDe(pct: number) {
  return TRAMOS_FUERZA.find((t) => pct >= t.min) ?? TRAMOS_FUERZA[TRAMOS_FUERZA.length - 1];
}

export function CategoryLollipop({
  label,
  passed,
  total,
  icon,
}: {
  label: string;
  passed: number;
  total: number;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors, palette, space, type, numeric, radius, hairline } = useTheme();
  const pct = total > 0 ? (passed / total) * 100 : 0;
  const tramo = fuerzaDe(pct);
  const { fg, wash } = toneColors(palette, tramo.tone);
  // El tramo débil comparte tono con el neutro pero no su intensidad.
  const color = tramo.label === 'Débil' ? mix(fg, colors.down, 0.45) : fg;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.sm,
      }}
      accessibilityLabel={`${label}: ${passed} de ${total} favorables, ${pct.toFixed(0)} por ciento`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, width: 190 }}>
        {icon ? <Ionicons name={icon} size={14} color={colors.inkMuted} /> : null}
        <Text style={[type.caption, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
          {label}
        </Text>
      </View>

      {/* Pista con marcas al 25, 50 y 75 */}
      <View style={{ flex: 1, height: 14, justifyContent: 'center' }}>
        <View style={{ height: 3, backgroundColor: colors.surfaceSunken, borderRadius: 2 }} />
        {[25, 50, 75].map((m) => (
          <View
            key={m}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: `${m}%`,
              top: 0,
              bottom: 0,
              width: hairline,
              backgroundColor: colors.rule,
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            left: 0,
            width: `${Math.max(pct, 0.5)}%`,
            height: 3,
            backgroundColor: color,
            borderRadius: 2,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: `${Math.max(pct, 0.5)}%`,
            width: 9,
            height: 9,
            marginLeft: -4.5,
            borderRadius: 5,
            backgroundColor: color,
          }}
        />
      </View>

      <View
        style={{
          minWidth: 52,
          alignItems: 'center',
          paddingVertical: 2,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: color,
          backgroundColor: wash,
        }}
      >
        <Text style={[type.legend, numeric, { color, letterSpacing: 0 }]}>{pct.toFixed(0)} %</Text>
      </View>

      <Text
        style={[type.caption, numeric, { color: colors.inkMuted, minWidth: 52, textAlign: 'right' }]}
      >
        {passed} / {total}
      </Text>
    </View>
  );
}

/** Leyenda de los tramos de fuerza, para que el color no haya que adivinarlo. */
export function LeyendaFuerza() {
  const { colors, palette, space, type } = useTheme();
  const rangos = ['≥ 75 %', '50 – 75 %', '25 – 50 %', '< 25 %'];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {TRAMOS_FUERZA.map((t, i) => {
        const { fg } = toneColors(palette, t.tone);
        const color = t.label === 'Débil' ? mix(fg, colors.down, 0.45) : fg;
        return (
          <View key={t.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}>
              {t.label} {rangos[i]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
