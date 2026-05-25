import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';

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
const CATEGORY_COLORS = [
  '#2ecc8f',
  '#3b9ef5',
  '#e8765c',
  '#f5c842',
  '#8e5cf5',
  '#e05ca0',
  '#54c4c4',
  '#fa9b3d',
  '#6abf69',
  '#c77dff',
];

// ─────────────────────────────────────────────
// Score label helper
// ─────────────────────────────────────────────
function getScoreLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: 'Excelente', color: '#1a9e6e', bg: '#2ecc8f22' };
  if (score >= 60) return { label: 'Bueno',     color: '#1a5fa0', bg: '#3b9ef522' };
  if (score >= 40) return { label: 'Moderado',  color: '#a07a00', bg: '#f5c84222' };
  return                  { label: 'Débil',     color: '#a03010', bg: '#e8765c22' };
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
  colors,
  size = 340,
}: {
  values: number[];
  labels: string[];
  colors: string[];
  size?: number;
}) {
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
        <path key={`ring-${i}`} d={d} fill="none" stroke="#e0e0e0" strokeWidth="0.8" />
      ))}
      {axes.map((d, i) => (
        <path key={`axis-${i}`} d={d} fill="none" stroke="#e0e0e0" strokeWidth="0.8" />
      ))}
      <path d={polyPath} fill="rgba(46,204,143,0.18)" stroke="#2ecc8f" strokeWidth="2" strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={5} fill={colors[i % colors.length]} stroke="#fff" strokeWidth="2" />
      ))}
      {labels.map((label, i) => {
        const p      = { x: cx + labelR * Math.cos(angle(i)), y: cy + labelR * Math.sin(angle(i)) };
        const anchor = p.x < cx - 4 ? 'end' : p.x > cx + 4 ? 'start' : 'middle';
        const words  = label.split(' ');
        const line1  = words.slice(0, 2).join(' ');
        const line2  = words.slice(2).join(' ');
        return (
          <text key={`lbl-${i}`} x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle" fontSize="9" fill="#333" fontFamily="system-ui, sans-serif">
            <tspan x={p.x} dy={line2 ? '-7' : '0'}>{line1}</tspan>
            {line2 && <tspan x={p.x} dy="13">{line2}</tspan>}
          </text>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────
// Web Chart.js radar — bigger with label padding
// ─────────────────────────────────────────────
function RadarWeb({
  labels,
  normalizedScores,
  colors,
  size,
}: {
  labels: string[];
  normalizedScores: number[];
  colors: string[];
  size: number;
}) {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: transparent; display: flex; align-items: center; justify-content: center; height: ${size}px; overflow: hidden; }
</style>
</head>
<body>
<canvas id="r" width="${size}" height="${size}"></canvas>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"><\/script>
<script>
new Chart(document.getElementById('r'), {
  type: 'radar',
  data: {
    labels: ${JSON.stringify(labels)},
    datasets: [{
      data: ${JSON.stringify(normalizedScores)},
      backgroundColor: 'rgba(46,204,143,0.18)',
      borderColor: '#2ecc8f',
      borderWidth: 2.5,
      pointBackgroundColor: ${JSON.stringify(colors)},
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8,
    }]
  },
  options: {
    responsive: false,
    layout: { padding: { top: 55, bottom: 55, left: 90, right: 90 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ' ' + ctx.parsed.r.toFixed(1) + ' / 10'
        }
      }
    },
    scales: {
      r: {
        min: 0,
        max: 10,
        ticks: {
          stepSize: 2,
          font: { size: 11 },
          color: '#aaa',
          backdropColor: 'transparent'
        },
        pointLabels: {
          font: { size: 12, weight: '500' },
          color: '#333',
          padding: 16,
        },
        grid: { color: '#e8e8e8' },
        angleLines: { color: '#e0e0e0' }
      }
    }
  }
});
<\/script>
</body>
</html>`;

  return (
    <iframe
      srcDoc={html}
      style={{ width: size, height: size, border: 'none', background: 'transparent' } as any}
      scrolling="no"
      title="Radar financiero"
    />
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
  if (!grahamValue) return null;

  const hasPrice      = currentPrice != null && currentPrice > 0;
  const discount      = hasPrice ? ((grahamValue - currentPrice!) / grahamValue) * 100 : null;
  const isUndervalued = discount != null && discount > 0;

  const statusColor = isUndervalued ? '#1a9e6e' : '#a03010';
  const statusBg    = isUndervalued ? '#2ecc8f18' : '#e8765c18';
  const statusEmoji = isUndervalued ? '✅' : '⚠️';
  const statusLabel = discount == null
    ? '—'
    : isUndervalued
      ? `Infravalorada ${discount.toFixed(1)}%`
      : `Sobrevalorada ${Math.abs(discount).toFixed(1)}%`;

  return (
    <View style={[grahamStyles.card, { backgroundColor: statusBg, borderColor: statusColor + '40' }]}>
      {/* Title */}
      <Text style={grahamStyles.title}>📐 Valoración Graham</Text>

      {/* Prices row */}
      <View style={grahamStyles.pricesRow}>
        <View style={grahamStyles.priceCol}>
          <Text style={grahamStyles.priceLabel}>Valor intrínseco</Text>
          <Text style={[grahamStyles.priceMain, { color: statusColor }]}>
            ${grahamValue.toFixed(2)}
          </Text>
        </View>
        {hasPrice && (
          <View style={grahamStyles.divider} />
        )}
        {hasPrice && (
          <View style={grahamStyles.priceCol}>
            <Text style={grahamStyles.priceLabel}>Precio actual</Text>
            <Text style={grahamStyles.priceCurrent}>${currentPrice!.toFixed(2)}</Text>
          </View>
        )}
        {hasPrice && (
          <View style={grahamStyles.divider} />
        )}
        {hasPrice && (
          <View style={grahamStyles.priceCol}>
            <Text style={grahamStyles.priceLabel}>Margen</Text>
            <Text style={[grahamStyles.priceMargin, { color: statusColor }]}>
              {isUndervalued ? '+' : ''}{discount!.toFixed(1)}%
            </Text>
          </View>
        )}
      </View>

      {/* Status badge */}
      <View style={[grahamStyles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '50' }]}>
        <Text style={[grahamStyles.statusText, { color: statusColor }]}>
          {statusEmoji}  {statusLabel}
        </Text>
      </View>

      {/* Disclaimer */}
      <Text style={grahamStyles.disclaimer}>
        Estimación teórica basada en BPA y valor en libros. No constituye asesoramiento de inversión.
      </Text>
    </View>
  );
}

const grahamStyles = StyleSheet.create({
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
    color: '#1D1D1F',
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
    backgroundColor: '#00000015',
  },
  priceLabel: {
    fontSize: 11,
    color: '#6E6E73',
  },
  priceMain: {
    fontSize: 20,
    fontWeight: '500',
  },
  priceCurrent: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1D1D1F',
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
    color: '#8E8E93',
    fontStyle: 'italic',
    lineHeight: 14,
    textAlign: 'center',
  },
});

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
export default function FinancialRadarChart({ ratios, ticker, currentPrice }: FinancialRadarChartProps) {
  const radarSize = Platform.OS === 'web'
    ? Math.min(screenWidth - 80, 560)
    : Math.min(screenWidth - 40, 340);

  const {
    labels,
    passedArr,
    totalArr,
    normalizedScores,
    colors,
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
    const colors     = ratios.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]);
    const globalScore = Math.round(
      (normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length) * 10
    );
    const grahamValue = extractGrahamValue(ratios);
    return { labels, passedArr, totalArr, normalizedScores, colors, globalScore, grahamValue };
  }, [ratios]);

  const { label: scoreLabel, color: scoreColor, bg: scoreBg } = getScoreLabel(globalScore);
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
        {Platform.OS === 'web' ? (
          <RadarWeb
            labels={labels}
            normalizedScores={normalizedScores}
            colors={colors}
            size={radarSize}
          />
        ) : (
          <RadarSVG
            values={normalizedScores.map(v => v / 10)}
            labels={labels}
            colors={colors}
            size={radarSize}
          />
        )}
      </View>

      {/* Legend — two columns */}
      <View style={styles.legendGrid}>
        {ratios.map((cat, i) => (
          <View key={cat.category} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors[i] }]} />
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
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
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
    color: '#6E6E73',
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
    color: '#6E6E73',
    flex: 1,
  },
  legendValue: {
    fontWeight: '500',
    color: '#1D1D1F',
  },
  progressBg: {
    height: 6,
    backgroundColor: '#E0E0E0',
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
    color: '#6E6E73',
    textAlign: 'center',
  },
});
