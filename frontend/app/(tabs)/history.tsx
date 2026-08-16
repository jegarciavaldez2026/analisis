import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Pressable,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { inkOn, Palette } from '../../theme/tokens';
import HeatmapContainer from '../../components/Heatmap/HeatmapContainer';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

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

/** Lo que devuelve `/api/history/metrics`. Todo opcional: cuando Yahoo no da un
 *  dato viaja como `null` y la interfaz escribe «sin dato» en vez de un cero,
 *  que significaría «no se movió». */
interface MarketMetrics {
  ticker: string;
  change_1d?: number | null;
  change_1w?: number | null;
  change_1m?: number | null;
  change_3m?: number | null;
  change_ytd?: number | null;
  volume?: number | null;
  avg_volume_3m?: number | null;
  relative_volume?: number | null;
  fifty_two_week_low?: number | null;
  fifty_two_week_high?: number | null;
  current_price?: number | null;
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
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getRecColor(r: string, c: ThemeColors): string {
  if (r === 'COMPRAR')  return c.up;
  if (r === 'MANTENER') return c.caution;
  if (r === 'VENDER')   return c.down;
  return c.inkFaint;
}


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

function beneishColor(s: number | null, c: ThemeColors) {
  if (s === null) return c.noSignal;
  if (s > -1.78) return c.down;
  if (s > -2.22) return c.caution;
  return c.up;
}
function beneishLabel(s: number | null) {
  if (s === null) return '—';
  if (s > -1.78) return 'Riesgo alto';
  if (s > -2.22) return 'Zona gris';
  return 'Sin riesgo';
}
function piotroskiColor(s: number | null, c: ThemeColors) {
  if (s === null) return c.noSignal;
  if (s >= 7) return c.up;
  if (s >= 4) return c.caution;
  return c.down;
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY CARD
// ─────────────────────────────────────────────────────────────────────────────

/*
 * Nota sobre la comparación con el sector:
 *
 * `/api/sector-averages` ya existe y promedia de verdad sobre tus análisis
 * (P/E, P/E adelantado, P/B, BPA, beta, rentabilidad por dividendo, PEG),
 * contando cada empresa una sola vez. Pero las métricas que enseña ESTA ficha
 * —Sharpe, EV/EBIT, Beneish, Piotroski, Montier, deuda neta, P/S— salen de
 * otra llamada y no se guardan en `metadata`, así que no hay ninguna clave
 * en común. Enganchar aquí la comparación habría dejado una rama que nunca se
 * cumple: parecería conectada y no lo estaría.
 *
 * Para cerrarlo hay que persistir esas métricas en el análisis; entonces se
 * añaden a CAMPOS en el backend y la comparación entra sin tocar la interfaz.
 */
function HistoryCard({
  item, mercado, colors, palette, onDelete, isDeleting,
}: {
  item: HistoryItem;
  /** Precio ya traído por `/api/history/enhanced`, si lo hay. */
  mercado?: EnhancedHistoryItem;
  colors: ThemeColors;
  palette: Palette;
  onDelete: (id: string, ticker: string) => void;
  isDeleting: boolean;
}) {
  const [price, setPrice] = useState<PriceInfo>(() =>
    mercado
      ? {
          current_price: mercado.current_price,
          change: mercado.price_change,
          change_percent: mercado.price_change_percent,
          currency: 'USD',
          loading: false,
          error: false,
        }
      : {
          current_price: 0, change: 0, change_percent: 0,
          currency: 'USD', loading: true, error: false,
        },
  );
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

  // El precio ya viene en la respuesta del historial enriquecido, que se pide
  // una vez para toda la pantalla. Volver a pedirlo por tarjeta era una
  // petición por empresa para repetir un número que ya estaba en memoria.
  // Sólo se pide cuando esa respuesta no trajo la empresa.
  useEffect(() => {
    if (mercado) return;
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
  }, [item.ticker, mercado]);

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

  // Las métricas avanzadas están detrás de «Ver métricas», así que se piden
  // cuando se abren y no antes: el análisis completo es el documento más
  // pesado de la base y se descargaba entero para dejarlo sin mirar.
  useEffect(() => {
    if (!fundExpanded) return;
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
  }, [item.id, fundExpanded]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const isPositive     = price.change >= 0;
  const priceColor     = isPositive ? colors.up : colors.down;
  const priceBg        = isPositive ? colors.upWash : colors.downWash;
  const changeSigned   = (isPositive ? '+' : '') + price.change_percent.toFixed(2) + '%';
  const currencySymbol = price.currency === 'USD' ? '$' : price.currency + '\u00A0';

  const trendColor = technical.trend === 'ALCISTA' ? colors.up
    : technical.trend === 'BAJISTA' ? colors.down : colors.caution;
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
          ? fundamentals.sharpe_ratio >= 1 ? colors.up : fundamentals.sharpe_ratio >= 0 ? colors.caution : colors.down
          : undefined,
        hint: 'Retorno ajustado al riesgo',
      },
      {
        label: 'EV/EBIT', value: fmtNum(fundamentals.ev_ebit, { suffix: 'x' }),
        color: fundamentals.ev_ebit !== null
          ? fundamentals.ev_ebit < 15 ? colors.up : fundamentals.ev_ebit < 25 ? colors.caution : colors.down
          : undefined,
        hint: 'Valoración vs EBIT',
      },
      {
        label: 'Beneish M', value: fmtNum(fundamentals.beneish_m_score),
        color: beneishColor(fundamentals.beneish_m_score, colors),
        hint: beneishLabel(fundamentals.beneish_m_score),
      },
      {
        label: 'Piotroski',
        value: fundamentals.piotroski_score !== null ? `${Math.round(fundamentals.piotroski_score)}/9` : '—',
        color: piotroskiColor(fundamentals.piotroski_score, colors),
        hint: fundamentals.piotroski_score !== null
          ? fundamentals.piotroski_score >= 7 ? 'Sólida' : fundamentals.piotroski_score >= 4 ? 'Moderada' : 'Débil'
          : undefined,
      },
      {
        label: 'Montier C',
        value: fundamentals.montier_score !== null ? `${Math.round(fundamentals.montier_score)}/3` : '—',
        color: fundamentals.montier_score !== null
          ? fundamentals.montier_score <= 1 ? colors.up : fundamentals.montier_score === 2 ? colors.caution : colors.down
          : undefined,
        hint: 'Riesgo contable',
      },
      {
        label: 'Deuda Neta', value: fmtNum(fundamentals.net_debt, { isLarge: true, prefix: '$' }),
        color: fundamentals.net_debt !== null ? fundamentals.net_debt < 0 ? colors.up : colors.down : undefined,
        hint: fundamentals.net_debt !== null && fundamentals.net_debt < 0 ? 'Caja neta +' : undefined,
      },
      {
        label: 'P/S', value: fmtNum(fundamentals.ps_ratio, { suffix: 'x' }),
        color: fundamentals.ps_ratio !== null
          ? fundamentals.ps_ratio < 2 ? colors.up : fundamentals.ps_ratio < 5 ? colors.caution : colors.down
          : undefined,
        hint: 'Precio / Ventas',
      },
    ];

    return (
      <View style={styles.metricsGrid}>
        {metrics.map((m, i) => (
          <View
            key={i}
            style={[styles.metricCellRef, { backgroundColor: colors.card, borderColor: colors.rule }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Marca de índice en el tono de la métrica: el estado no depende
                  sólo del color de la cifra. */}
              <View style={{ width: 3, height: 26, backgroundColor: m.color ?? colors.ruleStrong }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                  {m.label}
                </Text>
                <Text style={[styles.metricValue, { color: m.color ?? colors.text }]}>{m.value}</Text>
              </View>
            </View>
            {m.hint ? (
              <Text style={[styles.metricHint, { color: colors.inkFaint }]} numberOfLines={2}>
                {m.hint}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.historyCard, { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.rule, shadowColor: colors.shadow }]}>
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

      {/* Fundamental y técnico comparten placa: son dos lecturas del mismo
          valor y separarlas en dos bloques sueltos hacía parecer que venían de
          sitios distintos. Una tarjeta, dos columnas, una regla en medio. */}
      <View style={[styles.veredictoCard, { borderColor: colors.rule, backgroundColor: colors.inputBackground }]}>
      <View style={styles.badgesRow}>
        {/* Fundamental */}
        <View style={styles.badgeGroup}>
          <View style={styles.badgeLabelRow}>
            <Ionicons name="bar-chart-outline" size={11} color={colors.textSecondary} />
            <Text style={[styles.badgeLabel, { color: colors.textSecondary }]}>Fundamental</Text>
          </View>
          <View style={[styles.recBadge, { backgroundColor: getRecColor(item.recommendation, colors) }]}>
            <Text style={[styles.recBadgeText, { color: inkOn(getRecColor(item.recommendation, colors), palette) }]}>{item.recommendation}</Text>
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
              <View style={[styles.recBadge, { backgroundColor: getRecColor(technical.recommendation, colors) }]}>
                <Text style={[styles.recBadgeText, { color: inkOn(getRecColor(technical.recommendation, colors), palette) }]}>{technical.recommendation}</Text>
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

interface SectorAverage {
  sector: string;
  /** Cuántas empresas distintas de ese sector has analizado. Con una sola, la
   *  "media" es esa empresa y no se enseña la comparación. */
  muestras: number;
  metricas: Record<string, number>;
}

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'Todos',    value: 'TODOS'    },
  { label: 'COMPRAR',  value: 'COMPRAR'  },
  { label: 'MANTENER', value: 'MANTENER' },
  { label: 'VENDER',   value: 'VENDER'   },
];

export default function HistoryScreen() {
  const { colors, palette } = useTheme();
  const { width: ancho } = useWindowDimensions();
  const [history,       setHistory]      = useState<HistoryItem[]>([]);
  const [enhanced,      setEnhanced]     = useState<EnhancedHistoryItem[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [refreshing,    setRefreshing]   = useState(false);
  const [deleting,      setDeleting]     = useState<string | null>(null);
  const [activeFilter,  setActiveFilter] = useState<FilterType>('TODOS');
  const [busqueda,      setBusqueda]     = useState('');
  /** Ticker abierto en la ficha. `null` = lista. */
  const [seleccion,     setSeleccion]    = useState<string | null>(null);
  /** Medias por sector, calculadas por el backend sobre tus propios análisis. */
  const [medias, setMedias] = useState<SectorAverage[]>([]);
  /** Momento en que llegaron los precios que pinta el mapa. */
  const [actualizado, setActualizado] = useState<Date | null>(null);
  /** Series de un año por ticker: variaciones por periodo, volumen y 52 semanas. */
  const [metricas, setMetricas] = useState<Map<string, MarketMetrics>>(new Map());

  useEffect(() => {
    axios
      .get(`${BACKEND_URL}/api/sector-averages`, { timeout: 12000 })
      .then(r => setMedias(Array.isArray(r.data) ? r.data : []))
      // Sin medias la ficha se muestra igual, sólo que sin comparación.
      .catch(() => setMedias([]));
  }, []);

  const fetchHistory = async () => {
    try {
      // Las dos listas se piden a la vez y con el mismo tope. Antes el básico
      // traía 50 y el mapa hasta 200: tocar en el mapa una empresa que no
      // estuviera entre los 50 últimos análisis abría una ficha vacía.
      const [basicRes, enhancedRes] = await Promise.allSettled([
        axios.get(`${BACKEND_URL}/api/history`, { params: { limit: 200 }, timeout: 15000 }),
        axios.get(`${BACKEND_URL}/api/history/enhanced`, { params: { limit: 200 }, timeout: 45000 }),
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
        // La hora que se enseña al pie del mapa es la de ESTOS precios, no la
        // del reloj: si la petición falla, el mapa sigue diciendo cuándo se
        // trajo lo que estás viendo.
        setActualizado(new Date());
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    // Las series de un año van APARTE y después. `/history/enhanced` responde
    // en un segundo con `fast_info` y es lo que pinta el mapa nada más abrir;
    // `/history/metrics` descarga un año de cotizaciones y tarda bastante más.
    // Encadenarlas habría hecho lento el camino rápido, así que el mapa se
    // dibuja primero con la variación del día y se enriquece cuando llegan.
    try {
      const res = await axios.get(`${BACKEND_URL}/api/history/metrics`, {
        params: { limit: 200 },
        timeout: 90000,
      });
      const porTicker = new Map<string, MarketMetrics>(
        (res.data as MarketMetrics[]).map((m) => [m.ticker, m]),
      );
      setMetricas(porTicker);
    } catch (err) {
      // Sin series el mapa sigue funcionando con la variación del día: los
      // botones de periodo se quedan desactivados y nada miente.
      console.warn('Métricas de mercado no disponibles:', err);
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
          ? [styles.filterText, { color: colors.inkOnAccent }]
          : [styles.filterText, { color: colors.textSecondary }],
      };
    }
    const color = getRecColor(filter, colors);
    return {
      container: isActive
        ? [styles.filterPill, { backgroundColor: color,        borderColor: color }]
        : [styles.filterPill, { backgroundColor: color + '18', borderColor: color }],
      text: isActive
        ? [styles.filterText, { color: colors.inkOnAccent }]
        : [styles.filterText, { color }],
    };
  };

  /** Universo del mapa: todo el historial, con una entrada por empresa.
   *  Un mismo ticker analizado varias veces es una sola compañía; repetirlo
   *  multiplicaría su área y falsearía el peso del sector. Se conserva el
   *  análisis más reciente de cada uno. */
  const universoMapa = useMemo(() => {
    const porTicker = new Map<string, EnhancedHistoryItem>();
    for (const it of enhanced) {
      if (!porTicker.has(it.ticker)) porTicker.set(it.ticker, it);
    }
    // Se pegan las series encima, si ya llegaron. La variación del día se
    // mantiene la de `enhanced`, que viene de la cotización en vivo y es más
    // fresca que el último cierre de la serie diaria.
    return [...porTicker.values()].map((it) => {
      const m = metricas.get(it.ticker);
      return m
        ? {
            ...it,
            change_1w: m.change_1w,
            change_1m: m.change_1m,
            change_3m: m.change_3m,
            change_ytd: m.change_ytd,
            volume: m.volume,
            avg_volume_3m: m.avg_volume_3m,
            relative_volume: m.relative_volume,
            fifty_two_week_low: m.fifty_two_week_low,
            fifty_two_week_high: m.fifty_two_week_high,
          }
        : it;
    });
  }, [enhanced, metricas]);

  /** Índice por ticker para que cada tarjeta lea el precio que ya está en
   *  memoria en vez de pedirlo otra vez. */
  const porTicker = useMemo(
    () => new Map(universoMapa.map(it => [it.ticker, it])),
    [universoMapa],
  );

  /** Contadores reales por recomendación: el chip dice cuántos hay, no adorna. */
  const conteos = useMemo(() => ({
    TODOS: history.length,
    COMPRAR: history.filter(i => i.recommendation === 'COMPRAR').length,
    MANTENER: history.filter(i => i.recommendation === 'MANTENER').length,
    VENDER: history.filter(i => i.recommendation === 'VENDER').length,
  }), [history]);

  const filteredHistoryBase = activeFilter === 'TODOS'
    ? history
    : history.filter(i => i.recommendation === activeFilter);

  const filteredHistory = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filteredHistoryBase;
    return filteredHistoryBase.filter(
      i => i.ticker.toLowerCase().includes(q) || (i.company_name ?? '').toLowerCase().includes(q),
    );
  }, [filteredHistoryBase, busqueda]);

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
      {enhanced.length === 0 && history.length > 0 && !loading && (
        <View style={[styles.heatmapWrapper, { paddingBottom: 12 }]}>
          <View
            style={{
              flexDirection: 'row', gap: 10, padding: 12,
              borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.caution, backgroundColor: colors.cautionWash,
            }}
          >
            <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: colors.caution }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.caution }}>
                El mapa de calor no se pudo cargar
              </Text>
              <Text style={{ fontSize: 12, color: colors.inkMuted, lineHeight: 17 }}>
                Necesita precios y capitalización en vivo de cada empresa. Si el backend tarda o no
                responde, el historial de abajo se muestra igual. Desliza hacia abajo para reintentar.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Lo primero de la pantalla: el mapa por sector. Responde a "¿cómo va
          hoy lo que sigo?" antes que a "¿qué analicé?".
          Había dos mapas de calor, uno debajo del otro, midiendo lo mismo: el
          nuevo por área y el viejo con celdas de tamaño fijo. Dos lecturas
          distintas del mismo dato en la misma pantalla se contradicen; queda
          la que dimensiona por capitalización. */}
      {universoMapa.length > 0 && (
        <View style={styles.heatmapWrapper}>
          <HeatmapContainer
            items={universoMapa}
            onSelect={(it) => setSeleccion(it.ticker)}
            actualizado={actualizado}
            onRecargar={onRefresh}
            recargando={refreshing}
            periodosListos={metricas.size > 0}
          />
        </View>
      )}

      {/* Medias por sector: sólo los sectores con más de una empresa, porque
          con una sola la media es esa empresa y no compara nada. */}
      {medias.filter(m => m.muestras > 1).length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 12 }}
        >
          {medias.filter(m => m.muestras > 1).map(m => (
            <View
              key={m.sector}
              style={[styles.recentCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: 190 }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.recentName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {m.sector}
                </Text>
                <Text style={[styles.recentTicker, { color: colors.text }]}>
                  P/E {m.metricas.pe_ratio != null ? m.metricas.pe_ratio.toFixed(1) : '—'}
                </Text>
              </View>
              <Text style={[styles.recentDelta, { color: colors.inkFaint }]}>
                {m.muestras} emp.
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Analizados recientemente: acceso directo a lo último, sin scroll */}
      {enhanced.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 12 }}
        >
          {enhanced.slice(0, 6).map(item => {
            const sube = (item.price_change_percent ?? 0) >= 0;
            return (
              <TouchableOpacity
                key={item.ticker}
                onPress={() => setSeleccion(item.ticker)}
                activeOpacity={0.75}
                style={[styles.recentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.recentTicker, { color: colors.text }]} numberOfLines={1}>
                    {item.ticker}
                  </Text>
                  <Text style={[styles.recentName, { color: colors.textSecondary }]} numberOfLines={1}>
                    {item.company_name}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.recentPrice, { color: colors.text }]}>
                    ${(item.current_price ?? 0).toFixed(2)}
                  </Text>
                  <Text style={[styles.recentDelta, { color: sube ? colors.up : colors.down }]}>
                    {sube ? '+' : '−'}{Math.abs(item.price_change_percent ?? 0).toFixed(2)}%
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Filtros con su contador y buscador */}
      <View style={[styles.filterWrapper, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {FILTERS.map(f => {
            const fs = getFilterStyle(f.value);
            const n = conteos[f.value as keyof typeof conteos] ?? 0;
            const activo = f.value === activeFilter;
            return (
              <TouchableOpacity key={f.value} style={fs.container} onPress={() => setActiveFilter(f.value)} activeOpacity={0.7}>
                <Text style={fs.text}>{f.label}</Text>
                <View
                  style={[
                    styles.filterCount,
                    { backgroundColor: activo ? colors.inkOnAccent + '30' : colors.inputBackground },
                  ]}
                >
                  <Text style={[styles.filterCountText, fs.text]}>{n}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={[styles.searchBox, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
          <Ionicons name="search" size={15} color={colors.inkFaint} />
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar en el historial…"
            placeholderTextColor={colors.inkFaint}
            style={[styles.searchInput, { color: colors.text }]}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {busqueda.length > 0 && (
            <TouchableOpacity onPress={() => setBusqueda('')} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={colors.inkFaint} />
            </TouchableOpacity>
          )}
        </View>
      </View>

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

  // ── Ficha de una empresa ────────────────────────────────────────────────
  const abierta = seleccion
    ? (history.find(h => h.ticker === seleccion) ?? null)
    : null;
  const datosMercado = seleccion
    ? (enhanced.find(e => e.ticker === seleccion) ?? null)
    : null;

  if (abierta) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <TouchableOpacity
            onPress={() => setSeleccion(null)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>
              Volver al historial
            </Text>
          </TouchableOpacity>

          {/* Cabecera de la ficha: quién es, qué dice el fundamental y a cuánto cotiza */}
          <View
            style={{
              flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20,
              marginTop: 12, marginBottom: 16, padding: 20,
              borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.rule, backgroundColor: colors.card,
            }}
          >
            <View style={{ minWidth: 180, gap: 6 }}>
              <Text style={{ fontSize: 30, fontWeight: '700', color: colors.text }}>
                {abierta.ticker}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary }} numberOfLines={2}>
                {abierta.company_name}
              </Text>
              {datosMercado?.sector && datosMercado.sector !== 'N/A' ? (
                <View
                  style={{
                    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3,
                    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.rule,
                    backgroundColor: colors.inputBackground,
                  }}
                >
                  <Ionicons name="pricetag-outline" size={11} color={colors.inkFaint} />
                  <Text style={{ fontSize: 11, color: colors.inkMuted }}>{datosMercado.sector}</Text>
                </View>
              ) : null}
            </View>

            <View style={{ alignItems: 'center', gap: 6, minWidth: 150 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.inkFaint }}>
                ANÁLISIS FUNDAMENTAL
              </Text>
              <View
                style={{
                  paddingHorizontal: 14, paddingVertical: 5, borderRadius: 3,
                  backgroundColor: getRecColor(abierta.recommendation, colors),
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: inkOn(getRecColor(abierta.recommendation, colors), palette) }}>
                  {abierta.recommendation}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                {abierta.favorable_percentage.toFixed(1)} % favorables
              </Text>
            </View>

            {datosMercado ? (
              <View style={{ marginLeft: 'auto', alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }}>
                  ${(datosMercado.current_price ?? 0).toFixed(2)}
                </Text>
                <Text
                  style={{
                    fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'],
                    color: (datosMercado.price_change_percent ?? 0) >= 0 ? colors.up : colors.down,
                  }}
                >
                  {(datosMercado.price_change_percent ?? 0) >= 0 ? '+' : '−'}
                  {Math.abs(datosMercado.price_change_percent ?? 0).toFixed(2)} %
                </Text>
              </View>
            ) : null}
          </View>

          {/* El resto ya lo resuelve la tarjeta: técnico, métricas y fecha */}
          <HistoryCard
            item={abierta}
            mercado={datosMercado ?? undefined}
            colors={colors}
            palette={palette}
            onDelete={deleteAnalysis}
            isDeleting={deleting === abierta.id}
          />
        </ScrollView>
      </View>
    );
  }

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
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setSeleccion(item.ticker)}
            accessibilityRole="button"
            accessibilityLabel={`Abrir la ficha de ${item.ticker}`}
          >
          <HistoryCard
            item={item}
            mercado={porTicker.get(item.ticker)}
            colors={colors}
            palette={palette}
            onDelete={deleteAnalysis}
            isDeleting={deleting === item.id}
          />
          </TouchableOpacity>
        )}
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

  /* ── Recientes, filtros con contador y buscador ── */
  recentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minWidth: 210, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
  },
  recentTicker: { fontSize: 14, fontWeight: '700' },
  recentName:   { fontSize: 11 },
  recentPrice:  { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  recentDelta:  { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  filterCount: {
    minWidth: 22, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 3, alignItems: 'center',
  },
  filterCountText: { fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12,
    minHeight: 40, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 8 },

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

  historyCard:      { borderRadius: 12, padding: 16, marginBottom: 12, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 4, elevation: 2 },
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
  /** Placa que contiene fundamental y técnico juntos. */
  veredictoCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginTop: 12,
    overflow: 'hidden',
  },

  badgesRow:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', marginBottom: 12 },
  badgeGroup:       { flex: 1, alignItems: 'center', gap: 5 },
  badgeLabelRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeLabel:       { fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 },
  recBadge:         { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  recBadgeText:     { fontSize: 12, fontWeight: 'bold' },
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
  metricCellRef: {
    flexBasis: '48%', flexGrow: 1, minWidth: 150,
    padding: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, gap: 3,
  },

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
