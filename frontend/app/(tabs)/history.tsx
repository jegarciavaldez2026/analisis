import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const SCREEN_W = Dimensions.get('window').width;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type FilterType = 'TODOS' | 'COMPRAR' | 'MANTENER' | 'VENDER';

interface HistoryItem {
  id: string;
  ticker: string;
  company_name: string;
  analysis_date: string;
  recommendation: string;
  favorable_percentage: number;
}

interface EnhancedHistoryItem extends HistoryItem {
  current_price: number;
  price_change: number;
  price_change_percent: number;
  sector: string;
}

interface PriceInfo {
  current_price: number;
  change: number;
  change_percent: number;
  currency: string;
  loading: boolean;
  error: boolean;
}

interface TechnicalInfo {
  recommendation: string;
  score: number;
  trend: string;
  camarilla_zone: string;
  camarilla_interpretation: string;
  loading: boolean;
  error: boolean;
}

interface FundamentalsInfo {
  sharpe_ratio: number | null;
  ev_ebit: number | null;
  beneish_m_score: number | null;
  piotroski_score: number | null;
  montier_score: number | null;
  net_debt: number | null;
  ps_ratio: number | null;
  loading: boolean;
  error: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// HEATMAP HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getPctColor(pct: number): string {
  if (pct >= 5)    return '#00c853';
  if (pct >= 4)    return '#00b848';
  if (pct >= 3)    return '#00a83d';
  if (pct >= 2.5)  return '#009632';
  if (pct >= 2)    return '#008428';
  if (pct >= 1.5)  return '#00721e';
  if (pct >= 1)    return '#006014';
  if (pct >= 0.5)  return '#004e0a';
  if (pct >= 0.1)  return '#003d05';
  if (pct > -0.1)  return '#2d2d2d';
  if (pct > -0.5)  return '#3d0505';
  if (pct > -1)    return '#4e0a0a';
  if (pct > -1.5)  return '#601414';
  if (pct > -2)    return '#721e1e';
  if (pct > -2.5)  return '#842828';
  if (pct > -3)    return '#963232';
  if (pct > -4)    return '#a83d3d';
  if (pct > -5)    return '#b84848';
  return '#c85353';
}

function getRecColor(r: string): string {
  if (r === 'COMPRAR')  return '#34C759';
  if (r === 'MANTENER') return '#FF9500';
  if (r === 'VENDER')   return '#FF3B30';
  return '#8E8E93';
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT FINVIZ-STYLE HEATMAP
// ─────────────────────────────────────────────────────────────────────────────

interface HeatmapProps {
  stocks: EnhancedHistoryItem[];
  colors: any;
  isDark: boolean;
}

function CompactHeatmap({ stocks, colors, isDark }: HeatmapProps) {
  const [activeTooltip, setActiveTooltip] = useState<EnhancedHistoryItem | null>(null);
  const tooltipTimer = useRef<any>(null);
  const [viewMode, setViewMode] = useState<'sector' | 'all'>('sector');
  const containerW = SCREEN_W - 32;

  // Group by sector
  const sectorMap = React.useMemo(() => {
    const map = new Map<string, EnhancedHistoryItem[]>();
    stocks.forEach((s) => {
      const key = s.sector && s.sector !== 'N/A' ? s.sector : 'Otros';
      const list = map.get(key) || [];
      list.push(s);
      map.set(key, list);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].length - a[1].length);
  }, [stocks]);

  const showTooltip = (stock: EnhancedHistoryItem) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setActiveTooltip(stock);
    tooltipTimer.current = setTimeout(() => setActiveTooltip(null), 3500);
  };

  if (stocks.length === 0) return null;

  // Fixed cell size like Finviz — each cell is a fixed rectangle
  const CELL_W = viewMode === 'sector' ? Math.floor((containerW - 2) / Math.ceil(Math.sqrt(stocks.length))) : 56;
  const CELL_H = 46;
  const COLS   = viewMode === 'sector' ? Math.floor(containerW / CELL_W) : Math.floor(containerW / 58);

  // Finviz layout: render sector groups as labeled blocks, cells inside
  const renderSectorView = () => {
    const cellW = Math.floor((containerW - 4) / Math.max(3, Math.ceil(stocks.length / 5)));
    const clampedCellW = Math.max(44, Math.min(80, cellW));
    const cols = Math.floor(containerW / (clampedCellW + 2));

    return (
      <View>
        {sectorMap.map(([sector, items]) => {
          const avgChange = items.reduce((s, i) => s + i.price_change_percent, 0) / items.length;
          const colsInSector = Math.min(cols, items.length);
          const rowCount = Math.ceil(items.length / colsInSector);
          const blockW = colsInSector * (clampedCellW + 2);

          return (
            <View key={sector} style={[heatStyles.sectorBlock, { borderColor: colors.border, marginBottom: 6 }]}>
              {/* Sector label bar */}
              <View style={[heatStyles.sectorBar, { backgroundColor: isDark ? '#1c1c1e' : '#f0f0f0' }]}>
                <Text style={[heatStyles.sectorBarLabel, { color: colors.text }]}>{sector}</Text>
                <Text style={[
                  heatStyles.sectorBarChange,
                  { color: avgChange >= 0 ? '#27ae60' : '#d04040' },
                ]}>
                  {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
                </Text>
              </View>

              {/* Cells grid */}
              <View style={heatStyles.cellsRow}>
                {items.map((stock) => {
                  const bg = getPctColor(stock.price_change_percent);
                  const isActive = activeTooltip?.ticker === stock.ticker;
                  return (
                    <TouchableOpacity
                      key={stock.ticker}
                      onPress={() => showTooltip(stock)}
                      activeOpacity={0.8}
                      style={[
                        heatStyles.cell,
                        {
                          width: clampedCellW,
                          height: CELL_H,
                          backgroundColor: bg,
                          borderWidth: isActive ? 2 : 0,
                          borderColor: isActive ? '#fff' : 'transparent',
                        },
                      ]}
                    >
                      <Text style={heatStyles.cellTicker} numberOfLines={1}>
                        {stock.ticker}
                      </Text>
                      <Text style={heatStyles.cellPct} numberOfLines={1}>
                        {stock.price_change_percent >= 0 ? '+' : ''}
                        {stock.price_change_percent.toFixed(2)}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderAllView = () => {
    const cellW = Math.floor((containerW - (COLS - 1) * 2) / COLS);
    return (
      <View style={heatStyles.allGrid}>
        {stocks.map((stock) => {
          const bg = getPctColor(stock.price_change_percent);
          const isActive = activeTooltip?.ticker === stock.ticker;
          return (
            <TouchableOpacity
              key={stock.ticker}
              onPress={() => showTooltip(stock)}
              activeOpacity={0.8}
              style={[
                heatStyles.cell,
                {
                  width: cellW,
                  height: CELL_H,
                  backgroundColor: bg,
                  margin: 1,
                  borderWidth: isActive ? 2 : 0,
                  borderColor: isActive ? '#fff' : 'transparent',
                },
              ]}
            >
              <Text style={heatStyles.cellTicker} numberOfLines={1}>{stock.ticker}</Text>
              <Text style={heatStyles.cellPct} numberOfLines={1}>
                {stock.price_change_percent >= 0 ? '+' : ''}
                {stock.price_change_percent.toFixed(2)}%
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[heatStyles.root, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <View style={heatStyles.header}>
        <View style={heatStyles.headerLeft}>
          <Ionicons name="grid-outline" size={14} color={colors.primary} />
          <Text style={[heatStyles.title, { color: colors.text }]}>Mapa de Calor</Text>
          <Text style={[heatStyles.count, { color: colors.textSecondary }]}>
            {stocks.length} acciones
          </Text>
        </View>
        <View style={heatStyles.toggle}>
          {(['sector', 'all'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                heatStyles.toggleBtn,
                viewMode === m && { backgroundColor: colors.primary },
                { borderColor: colors.border },
              ]}
              onPress={() => setViewMode(m)}
            >
              <Text style={[
                heatStyles.toggleText,
                { color: viewMode === m ? '#fff' : colors.textSecondary },
              ]}>
                {m === 'sector' ? 'Sector' : 'Todo'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View style={heatStyles.legend}>
        <Text style={[heatStyles.legendLabel, { color: colors.textSecondary }]}>-</Text>
        {[-5, -3, -1, 0, 1, 3, 5].map((v) => (
          <View key={v} style={heatStyles.legendItem}>
            <View style={[heatStyles.legendSwatch, { backgroundColor: getPctColor(v) }]} />
            <Text style={[heatStyles.legendLabel, { color: colors.textSecondary }]}>
              {v > 0 ? '+' : ''}{v}%
            </Text>
          </View>
        ))}
        <Text style={[heatStyles.legendLabel, { color: colors.textSecondary }]}>+</Text>
      </View>

      {/* Grid */}
      <View style={heatStyles.gridContainer}>
        {viewMode === 'sector' ? renderSectorView() : renderAllView()}
      </View>

      {/* Tooltip */}
      {activeTooltip && (
        <View style={[heatStyles.tooltip, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={heatStyles.tooltipRow}>
            <View style={{ flex: 1 }}>
              <Text style={[heatStyles.tooltipTicker, { color: colors.text }]}>
                {activeTooltip.ticker}
              </Text>
              <Text style={[heatStyles.tooltipName, { color: colors.textSecondary }]} numberOfLines={1}>
                {activeTooltip.company_name}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[heatStyles.tooltipPrice, { color: colors.text }]}>
                ${activeTooltip.current_price.toFixed(2)}
              </Text>
              <Text style={[
                heatStyles.tooltipChange,
                { color: activeTooltip.price_change_percent >= 0 ? '#27ae60' : '#d04040' },
              ]}>
                {activeTooltip.price_change_percent >= 0 ? '▲' : '▼'}{' '}
                {Math.abs(activeTooltip.price_change_percent).toFixed(2)}%
              </Text>
            </View>
          </View>
          <View style={heatStyles.tooltipMeta}>
            <Text style={[heatStyles.tooltipSector, { color: colors.textSecondary }]}>
              {activeTooltip.sector}
            </Text>
            <View style={[
              heatStyles.tooltipRec,
              { backgroundColor: getRecColor(activeTooltip.recommendation) + '22' },
            ]}>
              <Text style={[
                heatStyles.tooltipRecText,
                { color: getRecColor(activeTooltip.recommendation) },
              ]}>
                {activeTooltip.recommendation} · {activeTooltip.favorable_percentage.toFixed(0)}%
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={heatStyles.tooltipClose}
            onPress={() => setActiveTooltip(null)}
          >
            <Ionicons name="close" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const heatStyles = StyleSheet.create({
  root: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13, fontWeight: '600' },
  count: { fontSize: 11 },
  toggle: { flexDirection: 'row', borderRadius: 6, overflow: 'hidden', borderWidth: 1 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  toggleText: { fontSize: 11, fontWeight: '500' },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendSwatch: { width: 11, height: 11, borderRadius: 2 },
  legendLabel: { fontSize: 9 },
  gridContainer: { paddingHorizontal: 6, paddingBottom: 6 },
  sectorBlock: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sectorBarLabel: { fontSize: 11, fontWeight: '600' },
  sectorBarChange: { fontSize: 11, fontWeight: '600' },
  cellsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 2 },
  allGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellTicker: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cellPct:    { color: 'rgba(255,255,255,0.88)', fontSize: 9, fontWeight: '500' },
  tooltip: {
    margin: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  tooltipTicker: { fontSize: 15, fontWeight: '700' },
  tooltipName: { fontSize: 11, marginTop: 1 },
  tooltipPrice: { fontSize: 14, fontWeight: '600' },
  tooltipChange: { fontSize: 12, fontWeight: '600' },
  tooltipMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tooltipSector: { fontSize: 11 },
  tooltipRec: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  tooltipRecText: { fontSize: 11, fontWeight: '600' },
  tooltipClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY CARD HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function findMetricValue(ratios: any[], metricName: string): number | null {
  for (const category of ratios ?? []) {
    for (const metric of category.metrics ?? []) {
      if (metric.name === metricName) {
        const v = metric.value;
        if (v === null || v === undefined) return null;
        const n = parseFloat(String(v));
        return isNaN(n) ? null : n;
      }
    }
  }
  return null;
}

function fmtNum(
  value: number | null,
  opts: { decimals?: number; suffix?: string; prefix?: string; isLarge?: boolean } = {},
): string {
  if (value === null || value === undefined) return '—';
  const { decimals = 2, suffix = '', prefix = '', isLarge = false } = opts;
  if (isLarge) {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${prefix}${(value / 1e9).toFixed(1)}B${suffix}`;
    if (abs >= 1e6) return `${prefix}${(value / 1e6).toFixed(1)}M${suffix}`;
    if (abs >= 1e3) return `${prefix}${(value / 1e3).toFixed(1)}k${suffix}`;
  }
  return `${prefix}${value.toFixed(decimals)}${suffix}`;
}

function beneishColor(s: number | null) {
  if (s === null) return '#8E8E93';
  if (s > -1.78) return '#FF3B30';
  if (s > -2.22) return '#FF9500';
  return '#34C759';
}
function beneishLabel(s: number | null) {
  if (s === null) return '—';
  if (s > -1.78) return 'Riesgo alto';
  if (s > -2.22) return 'Zona gris';
  return 'Sin riesgo';
}
function piotroskiColor(s: number | null) {
  if (s === null) return '#8E8E93';
  if (s >= 7) return '#34C759';
  if (s >= 4) return '#FF9500';
  return '#FF3B30';
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY CARD
// ─────────────────────────────────────────────────────────────────────────────

function HistoryCard({
  item, colors, onDelete, isDeleting,
}: {
  item: HistoryItem;
  colors: any;
  onDelete: (id: string, ticker: string) => void;
  isDeleting: boolean;
}) {
  const [price, setPrice] = useState<PriceInfo>({
    current_price: 0, change: 0, change_percent: 0,
    currency: 'USD', loading: true, error: false,
  });
  const [technical, setTechnical] = useState<TechnicalInfo>({
    recommendation: '', score: 0, trend: '',
    camarilla_zone: '', camarilla_interpretation: '',
    loading: true, error: false,
  });
  const [fundamentals, setFundamentals] = useState<FundamentalsInfo>({
    sharpe_ratio: null, ev_ebit: null, beneish_m_score: null,
    piotroski_score: null, montier_score: null,
    net_debt: null, ps_ratio: null,
    loading: true, error: false,
  });
  const [fundExpanded, setFundExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${BACKEND_URL}/api/price/${item.ticker}`)
      .then(({ data }) => {
        if (cancelled) return;
        setPrice({
          current_price: data.current_price ?? 0,
          change: data.change ?? 0,
          change_percent: data.change_percent ?? 0,
          currency: data.currency ?? 'USD',
          loading: false, error: false,
        });
      })
      .catch(() => { if (!cancelled) setPrice(p => ({ ...p, loading: false, error: true })); });
    return () => { cancelled = true; };
  }, [item.ticker]);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${BACKEND_URL}/api/technical/${item.ticker}`)
      .then(({ data }) => {
        if (cancelled) return;
        setTechnical({
          recommendation: data.technical_recommendation ?? '',
          score: data.technical_score ?? 0,
          trend: data.trend_direction ?? '',
          camarilla_zone: data.current_camarilla_zone ?? '',
          camarilla_interpretation: data.camarilla_interpretation ?? '',
          loading: false, error: false,
        });
      })
      .catch(() => { if (!cancelled) setTechnical(p => ({ ...p, loading: false, error: true })); });
    return () => { cancelled = true; };
  }, [item.ticker]);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${BACKEND_URL}/api/analysis/${item.id}`)
      .then(({ data }) => {
        if (cancelled) return;
        const r = data.ratios ?? [];
        setFundamentals({
          sharpe_ratio:    findMetricValue(r, 'Sharpe Ratio'),
          ev_ebit:         findMetricValue(r, 'EV/EBIT'),
          beneish_m_score: findMetricValue(r, 'Beneish M-Score'),
          piotroski_score: findMetricValue(r, 'Piotroski F-Score'),
          montier_score:   findMetricValue(r, 'Montier C-Score'),
          net_debt:        findMetricValue(r, 'Deuda Neta (Net Debt)'),
          ps_ratio:        findMetricValue(r, 'P/S Ratio (Precio/Ventas)'),
          loading: false, error: false,
        });
      })
      .catch(() => { if (!cancelled) setFundamentals(p => ({ ...p, loading: false, error: true })); });
    return () => { cancelled = true; };
  }, [item.id]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const isPositive     = price.change >= 0;
  const priceColor     = isPositive ? '#34C759' : '#FF3B30';
  const priceBg        = isPositive ? '#34C75918' : '#FF3B3018';
  const changeSigned   = (isPositive ? '+' : '') + price.change_percent.toFixed(2) + '%';
  const currencySymbol = price.currency === 'USD' ? '$' : price.currency + '\u00A0';

  const trendColor = technical.trend === 'ALCISTA' ? '#34C759'
    : technical.trend === 'BAJISTA' ? '#FF3B30' : '#FF9500';
  const trendIcon  = technical.trend === 'ALCISTA' ? 'trending-up'
    : technical.trend === 'BAJISTA' ? 'trending-down' : 'remove-outline';

  const camarillaComment = technical.camarilla_interpretation
    ? technical.camarilla_interpretation.replace(/[📈📉📊🚀⚠️]/gu, '').replace(/\|/g, '\n').trim()
    : '';

  const renderFundamentals = () => {
    if (fundamentals.loading)
      return <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />;
    if (fundamentals.error)
      return <Text style={[styles.fundErrorText, { color: colors.textSecondary }]}>No se pudieron cargar las métricas</Text>;

    const metrics: { label: string; value: string; color?: string; hint?: string }[] = [
      {
        label: 'Sharpe', value: fmtNum(fundamentals.sharpe_ratio),
        color: fundamentals.sharpe_ratio !== null
          ? fundamentals.sharpe_ratio >= 1 ? '#34C759' : fundamentals.sharpe_ratio >= 0 ? '#FF9500' : '#FF3B30'
          : undefined,
        hint: 'Retorno ajustado al riesgo',
      },
      {
        label: 'EV/EBIT', value: fmtNum(fundamentals.ev_ebit, { suffix: 'x' }),
        color: fundamentals.ev_ebit !== null
          ? fundamentals.ev_ebit < 15 ? '#34C759' : fundamentals.ev_ebit < 25 ? '#FF9500' : '#FF3B30'
          : undefined,
        hint: 'Valoración vs EBIT',
      },
      {
        label: 'Beneish M', value: fmtNum(fundamentals.beneish_m_score),
        color: beneishColor(fundamentals.beneish_m_score),
        hint: beneishLabel(fundamentals.beneish_m_score),
      },
      {
        label: 'Piotroski',
        value: fundamentals.piotroski_score !== null ? `${Math.round(fundamentals.piotroski_score)}/9` : '—',
        color: piotroskiColor(fundamentals.piotroski_score),
        hint: fundamentals.piotroski_score !== null
          ? fundamentals.piotroski_score >= 7 ? 'Sólida' : fundamentals.piotroski_score >= 4 ? 'Moderada' : 'Débil'
          : undefined,
      },
      {
        label: 'Montier C',
        value: fundamentals.montier_score !== null ? `${Math.round(fundamentals.montier_score)}/3` : '—',
        color: fundamentals.montier_score !== null
          ? fundamentals.montier_score <= 1 ? '#34C759' : fundamentals.montier_score === 2 ? '#FF9500' : '#FF3B30'
          : undefined,
        hint: 'Riesgo contable',
      },
      {
        label: 'Deuda Neta', value: fmtNum(fundamentals.net_debt, { isLarge: true, prefix: '$' }),
        color: fundamentals.net_debt !== null ? fundamentals.net_debt < 0 ? '#34C759' : '#FF3B30' : undefined,
        hint: fundamentals.net_debt !== null && fundamentals.net_debt < 0 ? 'Caja neta +' : undefined,
      },
      {
        label: 'P/S', value: fmtNum(fundamentals.ps_ratio, { suffix: 'x' }),
        color: fundamentals.ps_ratio !== null
          ? fundamentals.ps_ratio < 2 ? '#34C759' : fundamentals.ps_ratio < 5 ? '#FF9500' : '#FF3B30'
          : undefined,
        hint: 'Precio / Ventas',
      },
    ];

    return (
      <View style={styles.metricsGrid}>
        {metrics.map((m, i) => (
          <View key={i} style={[styles.metricCell, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{m.label}</Text>
            <Text style={[styles.metricValue, { color: m.color ?? colors.text }]}>{m.value}</Text>
            {m.hint ? <Text style={[styles.metricHint, { color: colors.textSecondary }]}>{m.hint}</Text> : null}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.historyCard, { backgroundColor: colors.card }]}>
      {/* Fila 1: Ticker + Precio */}
      <View style={styles.topRow}>
        <View style={styles.tickerBlock}>
          <Text style={[styles.ticker, { color: colors.primary }]}>{item.ticker}</Text>
          <Text style={[styles.companyName, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.company_name}
          </Text>
        </View>
        <View style={styles.priceBlock}>
          {price.loading ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : price.error ? (
            <Text style={[styles.priceError, { color: colors.textSecondary }]}>—</Text>
          ) : (
            <>
              <Text style={[styles.priceValue, { color: colors.text }]}>
                {currencySymbol}{price.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <View style={[styles.changePill, { backgroundColor: priceBg }]}>
                <Text style={[styles.changeText, { color: priceColor }]}>
                  {isPositive ? '▲' : '▼'} {changeSigned}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Fila 2: Badges Fundamental + Técnico */}
      <View style={styles.badgesRow}>
        {/* Fundamental */}
        <View style={styles.badgeGroup}>
          <View style={styles.badgeLabelRow}>
            <Ionicons name="bar-chart-outline" size={11} color={colors.textSecondary} />
            <Text style={[styles.badgeLabel, { color: colors.textSecondary }]}>Fundamental</Text>
          </View>
          <View style={[styles.recBadge, { backgroundColor: getRecColor(item.recommendation) }]}>
            <Text style={styles.recBadgeText}>{item.recommendation}</Text>
          </View>
          <Text style={[styles.scoreText, { color: colors.textSecondary }]}>
            {item.favorable_percentage.toFixed(1)}% favorable
          </Text>
          <TouchableOpacity
            style={[styles.expandBtn, { borderColor: colors.border }]}
            onPress={() => setFundExpanded(v => !v)}
            activeOpacity={0.7}
          >
            <Ionicons name={fundExpanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={11} color={colors.primary} />
            <Text style={[styles.expandBtnText, { color: colors.primary }]}>
              {fundExpanded ? 'Ocultar' : 'Ver métricas'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.badgeSeparator, { backgroundColor: colors.border }]} />

        {/* Técnico */}
        <View style={styles.badgeGroup}>
          <View style={styles.badgeLabelRow}>
            <Ionicons name="trending-up-outline" size={11} color={colors.textSecondary} />
            <Text style={[styles.badgeLabel, { color: colors.textSecondary }]}>Técnico</Text>
          </View>
          {technical.loading ? (
            <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginVertical: 8 }} />
          ) : technical.error || !technical.recommendation ? (
            <>
              <View style={[styles.recBadge, { backgroundColor: colors.border }]}>
                <Text style={[styles.recBadgeText, { color: colors.textSecondary }]}>N/A</Text>
              </View>
              <Text style={[styles.scoreText, { color: colors.textSecondary }]}>Sin datos</Text>
            </>
          ) : (
            <>
              <View style={[styles.recBadge, { backgroundColor: getRecColor(technical.recommendation) }]}>
                <Text style={styles.recBadgeText}>{technical.recommendation}</Text>
              </View>
              {technical.trend ? (
                <View style={styles.trendRow}>
                  <Ionicons name={trendIcon as any} size={11} color={trendColor} />
                  <Text style={[styles.trendText, { color: trendColor }]}>{technical.trend}</Text>
                </View>
              ) : null}
              <Text style={[styles.scoreText, { color: colors.textSecondary }]}>
                {technical.score.toFixed(0)}/100
              </Text>
              {technical.camarilla_zone ? (
                <View style={[styles.camarillaBox, { backgroundColor: colors.background }]}>
                  <View style={styles.camarillaHeader}>
                    <Ionicons name="locate-outline" size={11} color={colors.primary} />
                    <Text style={[styles.camarillaZone, { color: colors.primary }]}>{technical.camarilla_zone}</Text>
                  </View>
                  {camarillaComment ? (
                    <Text style={[styles.camarillaComment, { color: colors.textSecondary }]} numberOfLines={4}>
                      {camarillaComment}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </>
          )}
        </View>
      </View>

      {/* Métricas expandibles */}
      {fundExpanded && (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.fundMetricsSection}>
            <View style={styles.fundMetricsHeader}>
              <Ionicons name="stats-chart-outline" size={12} color={colors.primary} />
              <Text style={[styles.fundMetricsTitle, { color: colors.primary }]}>Métricas avanzadas</Text>
            </View>
            {renderFundamentals()}
          </View>
        </>
      )}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Fila 3: Fecha + Borrar */}
      <View style={styles.bottomRow}>
        <View style={styles.dateContainer}>
          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate(item.analysis_date)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: colors.danger + '15' }]}
          onPress={() => onDelete(item.id, item.ticker)}
          disabled={isDeleting}
        >
          {isDeleting
            ? <ActivityIndicator size="small" color={colors.danger} />
            : <Ionicons name="trash-outline" size={17} color={colors.danger} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'Todos',    value: 'TODOS'    },
  { label: 'COMPRAR',  value: 'COMPRAR'  },
  { label: 'MANTENER', value: 'MANTENER' },
  { label: 'VENDER',   value: 'VENDER'   },
];

export default function HistoryScreen() {
  const { colors, isDark } = useTheme();
  const [history,       setHistory]      = useState<HistoryItem[]>([]);
  const [enhanced,      setEnhanced]     = useState<EnhancedHistoryItem[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [refreshing,    setRefreshing]   = useState(false);
  const [deleting,      setDeleting]     = useState<string | null>(null);
  const [activeFilter,  setActiveFilter] = useState<FilterType>('TODOS');
  const [heatmapVisible, setHeatmapVisible] = useState(true);

  const fetchHistory = async () => {
    try {
      // 1. Historial básico para las cards (ligero)
      const [basicRes, enhancedRes] = await Promise.allSettled([
        axios.get(`${BACKEND_URL}/api/history`, { timeout: 10000 }),
        axios.get(`${BACKEND_URL}/api/history/enhanced`, { timeout: 20000 }),
      ]);

      if (basicRes.status === 'fulfilled') setHistory(basicRes.value.data);

      if (enhancedRes.status === 'fulfilled') {
        // Deduplicar por ticker — solo el análisis más reciente
        const seen = new Set<string>();
        const unique = (enhancedRes.value.data as EnhancedHistoryItem[]).filter((item) => {
          if (seen.has(item.ticker)) return false;
          seen.add(item.ticker);
          return true;
        });
        setEnhanced(unique);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchHistory(); }, []);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchHistory(); }, []);

  const deleteAnalysis = async (id: string, ticker: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`¿Eliminar el análisis de ${ticker}?`)
      : await new Promise(resolve =>
          Alert.alert('Eliminar Análisis', `¿Eliminar el análisis de ${ticker}?`, [
            { text: 'Cancelar', style: 'cancel',      onPress: () => resolve(false) },
            { text: 'Eliminar', style: 'destructive', onPress: () => resolve(true)  },
          ])
        );
    if (!confirmed) return;
    setDeleting(id);
    try {
      await axios.delete(`${BACKEND_URL}/api/history/${id}`);
      setHistory(prev => prev.filter(i => i.id !== id));
      setEnhanced(prev => prev.filter(i => i.id !== id));
    } catch {
      Platform.OS === 'web'
        ? window.alert('Error: No se pudo eliminar el análisis')
        : Alert.alert('Error', 'No se pudo eliminar el análisis');
    } finally { setDeleting(null); }
  };

  const deleteAllHistory = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('¿Eliminar todo el historial? Esta acción no se puede deshacer.')
      : await new Promise(resolve =>
          Alert.alert('Eliminar Todo', '¿Eliminar todo el historial?', [
            { text: 'Cancelar',      style: 'cancel',      onPress: () => resolve(false) },
            { text: 'Eliminar Todo', style: 'destructive', onPress: () => resolve(true)  },
          ])
        );
    if (!confirmed) return;
    setLoading(true);
    try {
      await axios.delete(`${BACKEND_URL}/api/history`);
      setHistory([]);
      setEnhanced([]);
      Platform.OS === 'web'
        ? window.alert('Historial eliminado correctamente')
        : Alert.alert('Éxito', 'Historial eliminado');
    } catch {
      Platform.OS === 'web'
        ? window.alert('Error: No se pudo eliminar el historial')
        : Alert.alert('Error', 'No se pudo eliminar el historial');
    } finally { setLoading(false); }
  };

  const getFilterStyle = (filter: FilterType) => {
    const isActive = filter === activeFilter;
    if (filter === 'TODOS') {
      return {
        container: isActive
          ? [styles.filterPill, { backgroundColor: colors.primary, borderColor: colors.primary }]
          : [styles.filterPill, { backgroundColor: colors.card,    borderColor: colors.border   }],
        text: isActive
          ? [styles.filterText, { color: '#FFFFFF' }]
          : [styles.filterText, { color: colors.textSecondary }],
      };
    }
    const color = getRecColor(filter);
    return {
      container: isActive
        ? [styles.filterPill, { backgroundColor: color,        borderColor: color }]
        : [styles.filterPill, { backgroundColor: color + '18', borderColor: color }],
      text: isActive
        ? [styles.filterText, { color: '#FFFFFF' }]
        : [styles.filterText, { color }],
    };
  };

  const filteredHistory = activeFilter === 'TODOS'
    ? history
    : history.filter(i => i.recommendation === activeFilter);

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Header component rendered above the FlashList
  const ListHeader = () => (
    <View>
      {/* Heatmap (collapsible) */}
      {enhanced.length > 0 && (
        <View style={styles.heatmapWrapper}>
          <TouchableOpacity
            style={[styles.heatmapToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setHeatmapVisible(v => !v)}
            activeOpacity={0.7}
          >
            <View style={styles.heatmapToggleLeft}>
              <Ionicons name="grid" size={13} color={colors.primary} />
              <Text style={[styles.heatmapToggleText, { color: colors.text }]}>Mapa de calor</Text>
            </View>
            <Ionicons
              name={heatmapVisible ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
          {heatmapVisible && (
            <CompactHeatmap stocks={enhanced} colors={colors} isDark={isDark} />
          )}
        </View>
      )}

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterContainer}
        style={[styles.filterWrapper, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
      >
        {FILTERS.map(f => {
          const fs = getFilterStyle(f.value);
          return (
            <TouchableOpacity key={f.value} style={fs.container} onPress={() => setActiveFilter(f.value)} activeOpacity={0.7}>
              <Text style={fs.text}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Count + Delete all */}
      <View style={[styles.headerBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>
          {filteredHistory.length}{' '}
          {activeFilter === 'TODOS' ? 'análisis' : filteredHistory.length === 1 ? 'resultado' : 'resultados'}
        </Text>
        <TouchableOpacity
          style={[styles.deleteAllButton, { backgroundColor: colors.danger + '15' }]}
          onPress={deleteAllHistory}
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={[styles.deleteAllText, { color: colors.danger }]}>Borrar todo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (filteredHistory.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ListHeader />
        <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
          <Ionicons name="folder-open-outline" size={80} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {activeFilter === 'TODOS' ? 'No hay historial' : `Sin análisis "${activeFilter}"`}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {activeFilter === 'TODOS'
              ? 'Los análisis que realices aparecerán aquí'
              : 'No hay acciones con esta recomendación en tu historial'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlashList
        data={filteredHistory}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <HistoryCard
            item={item}
            colors={colors}
            onDelete={deleteAnalysis}
            isDeleting={deleting === item.id}
          />
        )}
        estimatedItemSize={240}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={<ListHeader />}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:        { flex: 1 },
  centerContainer:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle:       { fontSize: 24, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  emptySubtitle:    { fontSize: 16, textAlign: 'center' },

  heatmapWrapper:    { paddingHorizontal: 16, paddingTop: 12 },
  heatmapToggle:     {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8,
  },
  heatmapToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heatmapToggleText: { fontSize: 13, fontWeight: '500' },

  filterWrapper:    { borderBottomWidth: 1 },
  filterContainer:  { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterPill:       { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  filterText:       { fontSize: 13, fontWeight: '600' },
  headerBar:        {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerTitle:      { fontSize: 14, fontWeight: '500' },
  deleteAllButton:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6 },
  deleteAllText:    { fontSize: 14, fontWeight: '600' },
  listContent:      { padding: 16 },

  historyCard:      { borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  topRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  tickerBlock:      { flex: 1, marginRight: 12 },
  ticker:           { fontSize: 20, fontWeight: 'bold', marginBottom: 2 },
  companyName:      { fontSize: 13 },
  priceBlock:       { alignItems: 'flex-end', gap: 5, minWidth: 90 },
  priceValue:       { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  changePill:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  changeText:       { fontSize: 12, fontWeight: '700' },
  priceError:       { fontSize: 14 },
  divider:          { height: 1, marginBottom: 12 },
  badgesRow:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', marginBottom: 12 },
  badgeGroup:       { flex: 1, alignItems: 'center', gap: 5 },
  badgeLabelRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeLabel:       { fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 },
  recBadge:         { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  recBadgeText:     { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  badgeSeparator:   { width: 1, height: 50, marginHorizontal: 8, alignSelf: 'center' },
  trendRow:         { flexDirection: 'row', alignItems: 'center', gap: 3 },
  trendText:        { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  scoreText:        { fontSize: 10, fontWeight: '500' },
  expandBtn:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginTop: 2 },
  expandBtnText:    { fontSize: 10, fontWeight: '600' },
  fundMetricsSection: { marginBottom: 12 },
  fundMetricsHeader:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  fundMetricsTitle:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  fundErrorText:      { fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingVertical: 4 },
  metricsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metricCell:       { width: '48%', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  metricLabel:      { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue:      { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  metricHint:       { fontSize: 9, fontStyle: 'italic' },
  camarillaBox:     { marginTop: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, width: '100%', gap: 4 },
  camarillaHeader:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  camarillaZone:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.2, flexShrink: 1 },
  camarillaComment: { fontSize: 10, lineHeight: 15, fontStyle: 'italic' },
  bottomRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateContainer:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText:         { fontSize: 11 },
  deleteButton:     { padding: 7, borderRadius: 8 },
});
