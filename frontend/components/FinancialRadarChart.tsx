import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';
import { mix, Palette } from '../theme/tokens';

const screenWidth = Dimensions.get('window').width;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface RatioMetric {
  name: string;
  value: number | null;
  threshold: string;
  passed: boolean;
  interpretation: string;
  display_value: string;
}

interface RatioCategory {
  category: string;
  metrics: RatioMetric[];
}

interface FinancialRadarChartProps {
  ratios: RatioCategory[];
  ticker?: string;
  /** Current market price for Graham comparison */
  currentPrice?: number | null;
}

// ─────────────────────────────────────────────
// Color palette
// ─────────────────────────────────────────────
/**
 * Rampa de las diez categorias de ratios. Antes eran diez hex fijos pensados
 * para fondo claro; en el tema oscuro se iban a saturaciones ilegibles.
 * Ahora se deriva del acento y de los tonos semanticos de la paleta activa,
 * alternando intensidad para que diez puntos sigan siendo distinguibles.
 */
function categoryRamp(c: ThemeColors, p: Palette): string[] {
  return [
    c.accent,
    c.up,
    c.caution,
    c.down,
    mix(c.accent, c.ink, 0.35),
    mix(c.up, c.ink, 0.35),
    mix(c.caution, c.ink, 0.3),
    mix(c.down, c.ink, 0.3),
    c.inkMuted,
    c.ruleStrong,
  ];
}

// ─────────────────────────────────────────────
// Score label helper
// ─────────────────────────────────────────────
function getScoreLabel(score: number, c: ThemeColors): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: 'Excelente', color: c.up,      bg: c.upWash };
  if (score >= 60) return { label: 'Bueno',     color: c.accent,  bg: c.accentWash };
  if (score >= 40) return { label: 'Moderado',  color: c.caution, bg: c.cautionWash };
  return                  { label: 'Débil',     color: c.down,    bg: c.downWash };
}

// ─────────────────────────────────────────────
// Extract Graham intrinsic value from ratios
// ─────────────────────────────────────────────
function extractGrahamValue(ratios: RatioCategory[]): number | null {
  const grahamCat = ratios.find(c =>
    c.category.toLowerCase().includes('graham')
  );
  if (!grahamCat) return null;

  for (const m of grahamCat.metrics) {
    if (
      m.display_value &&
      (m.display_value.includes('$') ||
        m.name.toLowerCase().includes('valor') ||
        m.name.toLowerCase().includes('intrinsic'))
    ) {
      const num = parseFloat(m.display_value.replace(/[^0-9.-]/g, ''));
      if (!isNaN(num) && num > 0) return num;
    }
    if (m.value && m.value > 0) return m.value;
  }
  return null;
}

// ─────────────────────────────────────────────
// Native SVG radar
// ─────────────────────────────────────────────
function RadarSVG({
  values,
  labels,
  colors: categoryColors,
  size = 340,
}: {
  values: number[];
  labels: string[];
  colors: string[];
  size?: number;
}) {
  const { colors: theme } = useTheme();
  const n   = values.length;
  const cx  = size / 2;
  const cy  = size / 2;
  const R   = size * 0.30;
  const levels = 5;

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt    = (r: number, i: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });

  const rings = Array.from({ length: levels }, (_, l) => {
    const r   = (R * (l + 1)) / levels;
    const pts = Array.from({ length: n }, (__, i) => pt(r, i));
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
  });

  const axes = Array.from({ length: n }, (_, i) => {
    const p = pt(R, i);
    return `M${cx},${cy} L${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  });

  const dataPts = values.map((v, i) => pt(R * Math.max(0, Math.min(1, v)), i));
  const polyPath = dataPts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ') + ' Z';

  const labelR = R + 32;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
      {rings.map((d, i) => (
        <path key={`ring-${i}`} d={d} fill="none" stroke={theme.rule} strokeWidth="0.8" />
      ))}
      {axes.map((d, i) => (
        <path key={`axis-${i}`} d={d} fill="none" stroke={theme.rule} strokeWidth="0.8" />
      ))}
      <path d={polyPath} fill={theme.accentWash} stroke={theme.accent} strokeWidth="2" strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={5} fill={categoryColors[i % categoryColors.length]} stroke={theme.surface} strokeWidth="2" />
      ))}
      {labels.map((label, i) => {
        const p      = { x: cx + labelR * Math.cos(angle(i)), y: cy + labelR * Math.sin(angle(i)) };
        const anchor = p.x < cx - 4 ? 'end' : p.x > cx + 4 ? 'start' : 'middle';
        const words  = label.split(' ');
        const line1  = words.slice(0, 2).join(' ');
        const line2  = words.slice(2).join(' ');
        return (
          <text key={`lbl-${i}`} x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle" fontSize="9" fill={theme.inkMuted} fontFamily="system-ui, sans-serif">
            <tspan x={p.x} dy={line2 ? '-7' : '0'}>{line1}</tspan>
            {line2 && <tspan x={p.x} dy="13">{line2}</tspan>}
          </text>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────
// Graham valuation card
// ─────────────────────────────────────────────
function GrahamCard({
  grahamValue,
  currentPrice,
}: {
  grahamValue: number | null;
  currentPrice?: number | null;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeGrahamStyles(colors), [colors]);
  if (!grahamValue) return null;

  const hasPrice      = currentPrice != null && currentPrice > 0;
  const discount      = hasPrice ? ((grahamValue - currentPrice!) / grahamValue) * 100 : null;
  const isUndervalued = discount != null && discount > 0;

  const statusColor = isUndervalued ? colors.up : colors.down;
  const statusBg    = isUndervalued ? colors.upWash : colors.downWash;
  const statusIcon = isUndervalued ? 'arrow-down' : 'arrow-up';
  const statusLabel = discount == null
    ? '—'
    : isUndervalued
      ? `Infravalorada ${discount.toFixed(1)}%`
      : `Sobrevalorada ${Math.abs(discount).toFixed(1)}%`;

  return (
    <View style={[s.card, { backgroundColor: statusBg, borderColor: statusColor + '40' }]}>
      {/* Title */}
      <Text style={s.title}>Valoración Graham</Text>

      {/* Prices row */}
      <View style={s.pricesRow}>
        <View style={s.priceCol}>
          <Text style={s.priceLabel}>Valor intrínseco</Text>
          <Text style={[s.priceMain, { color: statusColor }]}>
            ${grahamValue.toFixed(2)}
          </Text>
        </View>
        {hasPrice && (
          <View style={s.divider} />
        )}
        {hasPrice && (
          <View style={s.priceCol}>
            <Text style={s.priceLabel}>Precio actual</Text>
            <Text style={s.priceCurrent}>${currentPrice!.toFixed(2)}</Text>
          </View>
        )}
        {hasPrice && (
          <View style={s.divider} />
        )}
        {hasPrice && (
          <View style={s.priceCol}>
            <Text style={s.priceLabel}>Margen</Text>
            <Text style={[s.priceMargin, { color: statusColor }]}>
              {isUndervalued ? '+' : ''}{discount!.toFixed(1)}%
            </Text>
          </View>
        )}
      </View>

      {/* Status badge */}
      <View style={[s.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '50' }]}>
        <Text style={[s.statusText, { color: statusColor }]}>
          {statusLabel}
        </Text>
      </View>

      {/* Disclaimer */}
      <Text style={s.disclaimer}>
        Estimación teórica basada en BPA y valor en libros. No constituye asesoramiento de inversión.
      </Text>
    </View>
  );
}

function makeGrahamStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: 12,
      borderWidth: 1,
      padding: 16,
      marginTop: 14,
      gap: 12,
    },
    title: {
      fontSize: 15,
      fontWeight: '500',
      color: c.ink,
    },
    pricesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 0,
    },
    priceCol: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    divider: {
      width: 1,
      height: 40,
      backgroundColor: c.surfaceSunken,
    },
    priceLabel: {
      fontSize: 11,
      color: c.inkMuted,
    },
    priceMain: {
      fontSize: 20,
      fontWeight: '500',
    },
    priceCurrent: {
      fontSize: 18,
      fontWeight: '500',
      color: c.ink,
    },
    priceMargin: {
      fontSize: 18,
      fontWeight: '500',
    },
    statusBadge: {
      borderRadius: 10,
      borderWidth: 1,
      paddingVertical: 8,
      alignItems: 'center',
    },
    statusText: {
      fontSize: 14,
      fontWeight: '500',
    },
    disclaimer: {
      fontSize: 10,
      color: c.inkFaint,
      fontStyle: 'italic',
      lineHeight: 14,
      textAlign: 'center',
    },
  });
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
export default function FinancialRadarChart({ ratios, ticker, currentPrice }: FinancialRadarChartProps) {
  const { colors, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const CATEGORY_COLORS = useMemo(() => categoryRamp(colors, palette), [colors, palette]);
  const radarSize = Platform.OS === 'web'
    ? Math.min(screenWidth - 80, 560)
    : Math.min(screenWidth - 40, 340);

  const {
    labels,
    passedArr,
    totalArr,
    normalizedScores,
    categoryColors,
    globalScore,
    grahamValue,
  } = useMemo(() => {
    // Strip leading emoji/icon characters from category names for clean radar labels
    const stripEmoji = (str: string) =>
      str.replace(/^[\p{Emoji}\p{So}\s]+/u, '').trim();
    const labels           = ratios.map(c => stripEmoji(c.category));
    const passedArr        = ratios.map(c => c.metrics.filter(m => m.passed).length);
    const totalArr         = ratios.map(c => c.metrics.length);
    const normalizedScores = ratios.map((_, i) =>
      totalArr[i] > 0 ? parseFloat(((passedArr[i] / totalArr[i]) * 10).toFixed(2)) : 0
    );
    const categoryColors = ratios.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]);
    const globalScore = Math.round(
      (normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length) * 10
    );
    const grahamValue = extractGrahamValue(ratios);
    return { labels, passedArr, totalArr, normalizedScores, categoryColors, globalScore, grahamValue };
  }, [ratios]);

  const { label: scoreLabel, color: scoreColor, bg: scoreBg } = getScoreLabel(globalScore, colors);
  const totalPassed = passedArr.reduce((a, b) => a + b, 0);
  const totalAll    = totalArr.reduce((a, b) => a + b, 0);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.scoreTitle, { color: scoreColor }]}>
          GF Score: {globalScore} / 100
        </Text>
        <View style={[styles.badge, { backgroundColor: scoreBg, borderColor: scoreColor + '55' }]}>
          <Text style={[styles.badgeText, { color: scoreColor }]}>{scoreLabel}</Text>
        </View>
      </View>
      <Text style={styles.subtitle}>
        Puntuación financiera global{ticker ? ` · ${ticker}` : ''}
      </Text>

      {/* Radar */}
      <View style={styles.radarContainer}>
        {/* Un solo radar, en SVG. Antes la version web cargaba Chart.js de un
            CDN dentro de un iframe: si la red o una CSP lo bloqueaban, el
            grafico quedaba en blanco sin decir nada, y el iframe no heredaba
            el tema. Esta version no depende de nada externo. */}
        <RadarSVG
            values={normalizedScores.map(v => v / 10)}
            labels={labels}
            colors={categoryColors}
            size={radarSize}
        />
      </View>

      {/* Legend — two columns */}
      <View style={styles.legendGrid}>
        {ratios.map((cat, i) => (
          <View key={cat.category} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: categoryColors[i] }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {cat.category}:{' '}
              <Text style={styles.legendValue}>{passedArr[i]}/{totalArr[i]}</Text>
            </Text>
          </View>
        ))}
      </View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${(totalPassed / totalAll) * 100}%` as any,
              backgroundColor: scoreColor,
            },
          ]}
        />
      </View>
      <Text style={styles.progressLabel}>
        {totalPassed} de {totalAll} métricas favorables
      </Text>

      {/* Graham valuation */}
      <GrahamCard grahamValue={grahamValue} currentPrice={currentPrice} />
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      borderWidth: 0.5,
      borderColor: c.rule,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    scoreTitle: {
      fontSize: 22,
      fontWeight: '500',
    },
    badge: {
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: 20,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: '500',
    },
    subtitle: {
      fontSize: 13,
      color: c.inkMuted,
      marginBottom: 8,
    },
    radarContainer: {
      alignItems: 'center',
      marginBottom: 16,
    },
    legendGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      width: '47%',
    },
    legendDot: {
      width: 9,
      height: 9,
      borderRadius: 2,
      flexShrink: 0,
    },
    legendText: {
      fontSize: 11,
      color: c.inkMuted,
      flex: 1,
    },
    legendValue: {
      fontWeight: '500',
      color: c.ink,
    },
    progressBg: {
      height: 6,
      backgroundColor: c.rule,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 6,
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
    },
    progressLabel: {
      fontSize: 12,
      color: c.inkMuted,
      textAlign: 'center',
    },
  });
}
