import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Platform,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Pressable,
  ActivityIndicator,
  Modal,
  Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AIAssistant from '../../components/AIAssistant';
import { useTheme } from '../../contexts/ThemeContext';
import FinancialRadarChart from '../../components/FinancialRadarChart';
// Importa el componente
import FCFFValuationCard from '../../components/FCFFValuationCard';
import FinancialStatements from '../../components/FinancialStatements';
import IndicatorsChartCard from '../../components/IndicatorsChartCard';
import {
  Panel,
  DecisionScale,
  InstrumentChart,
  Rule,
  Legend,
  ScoreRing,
  CategoryLollipop,
  LeyendaFuerza,
  fuerzaDe,
} from '../../components/ui';
import { makeResultsStyles } from './resultsStyles';
import InvestmentSimulator from '../../components/InvestmentSimulator';
import { Tone, toneColors, decisionBands, verdictTone } from '../../theme/tokens';


const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';
/** Rangos del gráfico de cotización; las claves son las que espera /api/chart. */
const CHART_RANGES = [
  { key: '1w', label: '1S' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1A' },
  { key: '5y', label: '5A' },
];

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

interface InstitutionalHolder {
  holder_name: string;
  shares: number;
  percentage: number;
  value: number;
}

interface AnalystRecommendation {
  period: string;
  strong_buy: number;
  buy: number;
  hold: number;
  sell: number;
  strong_sell: number;
}

interface StockProfile {
  sector: string;
  industry: string;
  full_time_employees: number | null;
  business_summary: string;
  website: string | null;
  headquarters: string | null;
}

interface HoldersBreakdown {
  insider_percent: number;
  institution_percent: number;
  public_percent: number;
}

interface AnalysisData {
  ticker: string;
  company_name: string;
  recommendation: string;
  favorable_percentage: number;
  risk_level: string;
  total_metrics: number;
  favorable_metrics: number;
  unfavorable_metrics: number;
  ratios: RatioCategory[];
  metadata: any;
  summary_flags: any;
  company_profile?: StockProfile;
  analyst_recommendations?: AnalystRecommendation;
  holders_breakdown?: HoldersBreakdown;
  top_institutional_holders?: InstitutionalHolder[];
}

interface ResultsScreenProps {
  data: AnalysisData;
  onBack: () => void;
}

// Technical Analysis Interfaces
interface FibonacciLevel {
  level: string;
  price: number;
  is_support: boolean;
  distance_percent: number;
}

interface MovingAverage {
  period: number;
  value: number;
  signal: string;
  price_position: string;
  distance_percent: number;
}

interface CamarillaPivot {
  level: string;
  price: number;
  significance: string;
}

interface TechnicalAnalysisData {
  ticker: string;
  current_price: number;
  fibonacci_levels: FibonacciLevel[];
  current_fibonacci_zone: string;
  fibonacci_interpretation: string;
  swing_high: number;
  swing_low: number;
  trend_direction: string;
  moving_averages: MovingAverage[];
  ma_summary: string;
  ma_trend_signal: string;
  golden_cross: boolean;
  death_cross: boolean;
  camarilla_pivots: CamarillaPivot[];
  current_camarilla_zone: string;
  camarilla_interpretation: string;
  technical_score: number;
  technical_recommendation: string;
  key_levels: any;
}

interface NewsArticle {
  title: string;
  publisher: string;
  link: string;
  published_date: string;
  thumbnail: string | null;
  summary: string | null;
}

// ─────────────────────────────────────────────
// Helper: Shareholder Risk Analysis
// ─────────────────────────────────────────────
interface ShareholderRisk {
  level: string;
  /** El nivel se expresa como tono, no como hex: los colores se resuelven en
   *  el render con la paleta activa, así el bloque funciona en las dos apariencias. */
  tone: Tone;
  description: string;
}

const getShareholderRisk = (
  insiders: number,
  institutional: number,
  publicFloat: number
): ShareholderRisk => {
  const buildDescription = (triggers: string[], suffix = ''): string => {
    if (triggers.length === 0) return 'Estructura accionarial equilibrada.';
    return triggers.join(' · ') + suffix;
  };

  if (insiders > 80 || institutional < 10 || publicFloat < 20) {
    const triggers: string[] = [];
    if (insiders > 80) triggers.push('Control casi total de insiders');
    if (institutional < 10) triggers.push('Supervisión institucional muy escasa');
    if (publicFloat < 20) triggers.push('Free float crítico → liquidez muy baja');
    return {
      level: 'ALTO',
      tone: 'down',
      description: buildDescription(triggers, ' → alto riesgo para minoritarios.'),
    };
  } else if (insiders > 60 || institutional < 20 || publicFloat < 30) {
    const triggers: string[] = [];
    if (insiders > 60) triggers.push('Alta concentración de insiders');
    if (institutional < 20) triggers.push('Baja supervisión institucional');
    if (publicFloat < 30) triggers.push('Free float reducido → menor liquidez y mayor volatilidad');
    return {
      level: 'MEDIO-ALTO',
      tone: 'down',
      description: buildDescription(triggers, '.'),
    };
  } else if (insiders > 40 || institutional < 30 || publicFloat < 40) {
    const triggers: string[] = [];
    if (insiders > 40) triggers.push('Influencia relevante de insiders');
    if (institutional < 30) triggers.push('Supervisión institucional moderada');
    if (publicFloat < 40) triggers.push('Free float moderado');
    return {
      level: 'MEDIO',
      tone: 'caution',
      description: buildDescription(triggers, ', pero aún existen contrapesos.'),
    };
  } else if (insiders > 20 || institutional < 40 || publicFloat < 50) {
    const triggers: string[] = [];
    if (insiders > 20) triggers.push('Presencia moderada de insiders');
    if (institutional < 40) triggers.push('Supervisión institucional aceptable');
    if (publicFloat < 50) triggers.push('Free float algo limitado');
    return {
      level: 'MEDIO-BAJO',
      tone: 'caution',
      description: buildDescription(triggers, '.'),
    };
  } else {
    return {
      level: 'BAJO',
      tone: 'up',
      description: 'Empresa equilibrada: buena supervisión institucional y alta liquidez de mercado.',
    };
  }
};

/* ──────────────────────────────────────────────────────────────────────────
 * Formato de medidas. Un valor ausente devuelve null y la fila lo dibuja como
 * sin señal: `N/A` es información, no un fallo del que haya que disimular.
 * ────────────────────────────────────────────────────────────────────────── */

const isMissing = (v: unknown): boolean =>
  v == null || v === 0 || (typeof v === 'number' && !Number.isFinite(v));

const fmtNum = (v: number | null | undefined): string | null =>
  isMissing(v) ? null : (v as number).toFixed(2);

const fmtPrice = (v: number | null | undefined): string | null =>
  isMissing(v) ? null : `$${(v as number).toFixed(2)}`;

const fmtPct = (v: number | null | undefined): string | null =>
  isMissing(v) ? null : `${(v as number).toFixed(2)} %`;

const fmtMoney = (v: number | null | undefined): string | null => {
  if (isMissing(v)) return null;
  const n = v as number;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)} B`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)} MM`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} M`;
  return `$${n.toLocaleString('es-ES')}`;
};

const fmtCompact = (v: number | null | undefined): string | null => {
  if (isMissing(v)) return null;
  const n = v as number;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} MM`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k`;
  return n.toLocaleString('es-ES');
};

/**
 * Panel de lectura rápida: filas etiqueta → medida, alineadas a la derecha y
 * separadas por reglas. La forma que mejor soporta comparar de un vistazo.
 */
function QuickPanel({
  title,
  legend,
  rows,
}: {
  title: string;
  legend?: string;
  rows: { label: string; value: string | null }[];
}) {
  const { colors, type, numeric, space } = useTheme();
  return (
    <Panel title={title} legend={legend} padded={false} style={{ flex: 1, minWidth: 240 }}>
      {rows.map((row, i) => (
        <View key={row.label}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space.md,
              paddingHorizontal: space.lg,
              paddingVertical: space.sm + 1,
            }}
          >
            <Text style={[type.caption, { color: colors.inkMuted, flex: 1 }]} numberOfLines={1}>
              {row.label}
            </Text>
            <Text
              style={[
                type.label,
                numeric,
                { color: row.value == null ? colors.noSignal : colors.ink, fontWeight: '600' },
              ]}
            >
              {row.value ?? '—'}
            </Text>
          </View>
          {i < rows.length - 1 ? <Rule /> : null}
        </View>
      ))}
    </Panel>
  );
}

export default function ResultsScreen({ data, onBack }: ResultsScreenProps) {
  const { colors, palette, isDark } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  /** Punto de corte propio de esta pantalla: por debajo de 1100 px las dos
   *  columnas de datos densos no caben sin comprimir las tablas. */
  const twoColumns = viewportWidth >= 1100;
  // Los estilos se derivan de la paleta activa: al cambiar de apariencia, la
  // pantalla entera cambia con ella en lugar de quedarse en blanco iOS.
  const styles = useMemo(() => makeResultsStyles(colors), [colors]);

  /** Métricas favorables por categoría, ordenadas de peor a mejor: el usuario
   *  quiere ver primero dónde falla la empresa, no dónde ya va bien. */
  const categoryScores = useMemo(
    () =>
      (data.ratios ?? [])
        .map((cat) => ({
          category: cat.category,
          passed: cat.metrics.filter((m) => m.passed).length,
          total: cat.metrics.length,
        }))
        .filter((c) => c.total > 0)
        .sort((a, b) => a.passed / a.total - b.passed / b.total),
    [data.ratios],
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([data.ratios[0]?.category]));
  const [chartData, setChartData] = useState<any>(null);
  // El widget embebido hereda la apariencia de la app en lugar de tener la suya.
  const tvTheme: 'dark' | 'light' = isDark ? 'dark' : 'light';

  /**
   * TradingView trae su propia paleta aunque le pases `theme=light`: fondo
   * blanco, su verde y su rojo. El endpoint acepta `overrides`, así que se le
   * imponen los tokens del instrumento y el gráfico deja de ser una isla.
   * Sólo colores planos: los lavados son rgba y el widget no los admite.
   */
  const tvOverrides = useMemo(() => encodeURIComponent(JSON.stringify({
    'paneProperties.background': colors.surfaceSunken,
    'paneProperties.backgroundType': 'solid',
    'paneProperties.vertGridProperties.color': colors.rule,
    'paneProperties.horzGridProperties.color': colors.rule,
    'paneProperties.crossHairProperties.color': colors.inkMuted,
    'scalesProperties.textColor': colors.inkMuted,
    'scalesProperties.lineColor': colors.rule,
    'scalesProperties.backgroundColor': colors.surfaceSunken,
    // Velas y mechas con el verde/rojo del producto, no con los suyos.
    'mainSeriesProperties.candleStyle.upColor': colors.up,
    'mainSeriesProperties.candleStyle.downColor': colors.down,
    'mainSeriesProperties.candleStyle.borderUpColor': colors.up,
    'mainSeriesProperties.candleStyle.borderDownColor': colors.down,
    'mainSeriesProperties.candleStyle.wickUpColor': colors.up,
    'mainSeriesProperties.candleStyle.wickDownColor': colors.down,
    'mainSeriesProperties.barStyle.upColor': colors.up,
    'mainSeriesProperties.barStyle.downColor': colors.down,
    'mainSeriesProperties.lineStyle.color': colors.accent,
    'mainSeriesProperties.areaStyle.color1': colors.accent,
    'mainSeriesProperties.areaStyle.color2': colors.surfaceSunken,
    'mainSeriesProperties.areaStyle.linecolor': colors.accent,
  })), [colors]);

  /** La barra de herramientas quiere el hex sin almohadilla. */
  const tvToolbar = colors.chrome.replace('#', '');
  const [loadingChart, setLoadingChart] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('1y');
  const [showAIChat, setShowAIChat] = useState(false);
  
  // Technical Analysis State
  const [technicalData, setTechnicalData] = useState<TechnicalAnalysisData | null>(null);
  const [loadingTechnical, setLoadingTechnical] = useState(true);
  const [expandedTechnical, setExpandedTechnical] = useState<Set<string>>(new Set(['fibonacci']));
  
  // Stock News State
  const [stockNews, setStockNews] = useState<NewsArticle[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  // Treasury / Risk-free rate state
  const [treasuryRate, setTreasuryRate] = useState<number>(4.5);

  // Prepare analysis data for AI
  const aiAnalysisData = useMemo(() => ({
    ticker: data.ticker,
    company_name: data.company_name,
    recommendation: data.recommendation,
    favorable_percentage: data.favorable_percentage,
    favorable_metrics: data.favorable_metrics,
    unfavorable_metrics: data.unfavorable_metrics,
    total_metrics: data.total_metrics,
    risk_level: data.risk_level,
    current_price: data.metadata?.current_price,
    ratios: data.ratios,
    summary_flags: data.summary_flags,
    metadata: data.metadata,
    technical: technicalData ? {
      trend: technicalData.trend_direction,
      score: technicalData.technical_score,
      recommendation: technicalData.technical_recommendation,
      ma_signal: technicalData.ma_trend_signal,
      ma_summary: technicalData.ma_summary,
      golden_cross: technicalData.golden_cross,
      death_cross: technicalData.death_cross,
      fibonacci_zone: technicalData.current_fibonacci_zone,
      fibonacci_interpretation: technicalData.fibonacci_interpretation,
      camarilla_zone: technicalData.current_camarilla_zone,
      camarilla_interpretation: technicalData.camarilla_interpretation,
      key_levels: technicalData.key_levels,
      moving_averages: technicalData.moving_averages?.map((ma: any) => ({
        name: ma.name,
        value: ma.value,
        signal: ma.signal,
      })),
    } : null,
  }), [data, technicalData]);

  useEffect(() => {
    fetchChartData(selectedPeriod);
  }, [selectedPeriod]);

  useEffect(() => {
    fetchTechnicalAnalysis();
    fetchStockNews();
  }, []);

  useEffect(() => {
    const fetchTreasury = async () => {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/market-indicators`);
        const rate = response.data?.treasury_10y?.current_value;
        if (rate) setTreasuryRate(rate);
      } catch (error) {
        console.error('Error fetching treasury rate:', error);
      }
    };
    fetchTreasury();
  }, []);

  const fetchTechnicalAnalysis = async () => {
    setLoadingTechnical(true);
    try {
      const response = await axios.get(`${BACKEND_URL}/api/technical/${data.ticker}`);
      setTechnicalData(response.data);
    } catch (error) {
      console.error('Error fetching technical analysis:', error);
    } finally {
      setLoadingTechnical(false);
    }
  };

  const fetchStockNews = async () => {
    setLoadingNews(true);
    try {
      const response = await axios.get(`${BACKEND_URL}/api/news/${data.ticker}?limit=5`);
      setStockNews(response.data.news || []);
    } catch (error) {
      console.error('Error fetching stock news:', error);
    } finally {
      setLoadingNews(false);
    }
  };

  const openNewsLink = (url: string) => {
    if (url) {
      Linking.openURL(url).catch(err => console.error('Error opening link:', err));
    }
  };

  const toggleTechnicalSection = (section: string) => {
    const newExpanded = new Set(expandedTechnical);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedTechnical(newExpanded);
  };

  const fetchChartData = async (period: string) => {
    setLoadingChart(true);
    try {
      const response = await axios.get(`${BACKEND_URL}/api/chart/${data.ticker}?period=${period}`);
      setChartData(response.data);
    } catch (error) {
      console.error('Error fetching chart data:', error);
    } finally {
      setLoadingChart(false);
    }
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // El código verde/rojo del producto se resuelve desde los tokens, no a ojo:
  // así sigue siendo el mismo verde en las dos apariencias.
  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'COMPRAR': return colors.up;
      case 'MANTENER': return colors.caution;
      case 'VENDER': return colors.down;
      default: return colors.inkMuted;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Bajo': return colors.up;
      case 'Moderado': return colors.caution;
      case 'Alto': return colors.down;
      default: return colors.inkMuted;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always">
        {/* Cabecera: la salida siempre visible, con el sujeto del análisis al lado */}
        <View
          style={[
            styles.header,
            { backgroundColor: colors.chrome, borderBottomColor: colors.rule, borderBottomWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Volver a la búsqueda"
            style={({ pressed }) => [
              styles.backButton,
              { minHeight: 44, opacity: pressed ? 0.7 : 1 },
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
            ]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.accent} />
            <Text style={[styles.backButtonText, { color: colors.accent }]}>Volver</Text>
          </Pressable>
        </View>

        {/* Sujeto del análisis */}
        <View
          style={[
            styles.companySection,
            { backgroundColor: colors.surface, borderBottomColor: colors.rule, borderBottomWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            {data.metadata?.website && Platform.OS === 'web' ? (
              <img
                src={`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${data.metadata.website}&size=128`}
                style={{ width: 40, height: 40, borderRadius: 3, objectFit: 'contain', backgroundColor: colors.surfaceSunken, padding: 4 }}
                onError={(e: any) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <View style={{ width: 40, height: 40, borderRadius: 3, backgroundColor: colors.surfaceSunken, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ruleStrong, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.accent }}>{data.ticker.charAt(0)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.companyTicker, { color: colors.ink }]}>{data.ticker}</Text>
              <Text style={[styles.companyName, { color: colors.inkMuted }]} numberOfLines={2}>{data.company_name}</Text>
            </View>
          </View>
          {data.metadata && (
            <View style={styles.metadataRow}>
              {data.metadata.sector !== 'N/A' && (
                <Text style={[styles.metadataText, { color: colors.inkFaint }]}>{data.metadata.sector}</Text>
              )}
              {data.metadata.industry !== 'N/A' && (
                <Text style={[styles.metadataText, { color: colors.inkFaint }]}> · {data.metadata.industry}</Text>
              )}
            </View>
          )}
        </View>

        {/* La lectura: anillo, veredicto y escala calibrada, en una sola placa.
            El anillo responde a «cuanto de lleno esta» y la escala a «en que
            banda cae»: son dos preguntas distintas y se hacen en ese orden. */}
        <View style={{ margin: 16 }}>
          <Panel
            legend="Lectura del análisis"
            title={`${data.favorable_metrics} de ${data.total_metrics} métricas favorables`}
          >
            <View
              style={{
                flexDirection: twoColumns ? 'row' : 'column',
                alignItems: twoColumns ? 'center' : 'stretch',
                gap: 24,
              }}
            >
              <ScoreRing value={data.favorable_percentage} />

              <View style={{ gap: 12, minWidth: 180 }}>
                <View style={{ gap: 2 }}>
                  <Text
                    style={[
                      styles.verdictWord,
                      { color: toneColors(palette, verdictTone(data.recommendation)).fg },
                    ]}
                  >
                    {data.recommendation}
                  </Text>
                  <Text style={styles.verdictRisk}>Riesgo {data.risk_level}</Text>
                </View>

                {/* Recuento real: el backend distingue favorable y desfavorable,
                    no hay un tercer estado que mostrar. */}
                <View style={styles.tallyRow}>
                  {[
                    { n: data.favorable_metrics, label: 'Favorables', c: colors.up, icon: 'checkmark-circle' as const },
                    { n: data.total_metrics - data.favorable_metrics, label: 'Desfavorables', c: colors.down, icon: 'close-circle' as const },
                  ].map((t, i) => (
                    <View key={t.label} style={[styles.tallyCell, i === 0 ? { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.rule } : null]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name={t.icon} size={14} color={t.c} />
                        <Text style={[styles.tallyNum, { color: t.c }]}>{t.n}</Text>
                      </View>
                      <Text style={styles.tallyLabel}>{t.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ flex: 1, minWidth: 260 }}>
                <DecisionScale
                  value={data.favorable_percentage}
                  verdict={data.recommendation}
                  risk={data.risk_level}
                  compact
                />
                {/* Qué significa cada banda, dentro de la propia escala */}
                <View style={styles.bandLegendRow}>
                  {decisionBands.map((b) => {
                    const c = toneColors(palette, b.tone).fg;
                    return (
                      <View key={b.verdict} style={styles.bandLegendCell}>
                        <View style={{ width: 3, height: 12, backgroundColor: c }} />
                        <Text style={[styles.bandLegendText, { color: c }]}>
                          {b.from === 60 ? '60 – 100' : b.from === 40 ? '40 – 59' : '0 – 39'}
                        </Text>
                        <Text style={styles.bandLegendVerdict}>{b.verdict}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          </Panel>
        </View>

        {/* Tarjetas de lectura rápida: tres paneles con filas etiqueta→valor.
            Sustituyen a la rejilla de seis cuadrados iguales, que obligaba a
            leer cada celda por separado para comparar magnitudes distintas. */}
        {data.metadata && (
          <View style={styles.quickReadRow}>
            <QuickPanel
              title="Tamaño y riesgo"
              legend="Mercado"
              rows={[
                { label: 'Capitalización', value: fmtMoney(data.metadata.market_cap) },
                { label: 'Precio actual', value: fmtPrice(data.metadata.current_price) },
                { label: 'Beta', value: fmtNum(data.metadata.beta) },
                { label: 'Volumen medio', value: fmtCompact(data.metadata.volume_avg) },
              ]}
            />
            <QuickPanel
              title="Valoración"
              legend="Múltiplos"
              rows={[
                { label: 'P/E (trailing)', value: fmtNum(data.metadata.pe_ratio) },
                { label: 'P/E (forward)', value: fmtNum(data.metadata.forward_pe) },
                { label: 'P/B', value: fmtNum(data.metadata.price_to_book) },
                { label: 'BPA (EPS)', value: fmtPrice(data.metadata.eps) },
              ]}
            />
            <QuickPanel
              title="Retribución y rango"
              legend="52 semanas"
              rows={[
                { label: 'Dividendo', value: fmtPrice(data.metadata.dividend_rate) },
                { label: 'Rentab. dividendo', value: fmtPct(data.metadata.dividend_yield) },
                { label: 'Máximo 52s', value: fmtPrice(data.metadata.fifty_two_week_high) },
                { label: 'Mínimo 52s', value: fmtPrice(data.metadata.fifty_two_week_low) },
              ]}
            />
          </View>
        )}

        {/* Balance por categoría: dónde se gana y dónde se pierde el veredicto */}
        {categoryScores.length > 0 && (
          <View style={styles.quickReadRow}>
            <Panel
              title="Dónde se gana y dónde se pierde"
              legend="Métricas favorables por categoría"
              style={{ flex: 1, minWidth: 280 }}
              action={<LeyendaFuerza />}
            >
              <View>
                {categoryScores.map((cat, i) => (
                  <View key={cat.category}>
                    <CategoryLollipop
                      label={cat.category}
                      passed={cat.passed}
                      total={cat.total}
                    />
                    {i < categoryScores.length - 1 ? <Rule /> : null}
                  </View>
                ))}
              </View>
              <Rule />
              <Text style={styles.categoryFootnote}>
                El análisis se apoya en {data.total_metrics} métricas fundamentales agrupadas en{' '}
                {categoryScores.length} categorías.
              </Text>
            </Panel>
          </View>
        )}


        {/* Dos columnas en escritorio. La izquierda es la evidencia del
            veredicto (ratios, indicadores, valoración); la derecha, el
            contexto de mercado (cotización, técnico, accionariado, noticias).
            Por debajo de 1100 px se apila y la evidencia va primero. */}
        <View style={twoColumns ? styles.columnsRow : styles.columnsStack}>
          <View style={twoColumns ? styles.columnMain : styles.columnFull}>
          {/* Ratio Categories */}
          <View style={styles.ratiosSection}>
            <Text style={styles.sectionTitle}>Ratios financieros</Text>

            {/* ── Radar Chart ── */}
            <FinancialRadarChart ratios={data.ratios}  ticker={data.ticker}  currentPrice={data.metadata?.current_price} />


            {/* Tabla densa: columnas alineadas para poder comparar ratios de un
                vistazo. Antes cada métrica era un bloque apilado y no había forma
                de barrer la columna de valores con la mirada. El color vive sólo
                en la columna de estado, y la palabra va al lado del color. */}
            {data.ratios.map((category) => {
              const passed = category.metrics.filter((m) => m.passed).length;
              const open = expandedCategories.has(category.category);
              return (
                <View key={category.category} style={styles.categoryCard}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.categoryHeader,
                      pressed ? { backgroundColor: colors.accentWash } : null,
                      Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                    ]}
                    onPress={() => toggleCategory(category.category)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={`${category.category}: ${passed} de ${category.metrics.length} favorables`}
                  >
                    <Text style={styles.categoryTitle}>{category.category}</Text>
                    <View style={styles.categoryHeaderRight}>
                      {(() => {
                        const pct = category.metrics.length
                          ? (passed / category.metrics.length) * 100
                          : 0;
                        const t = fuerzaDe(pct);
                        const base = toneColors(palette, t.tone).fg;
                        const col = t.label === 'Débil' ? colors.caution : base;
                        return (
                          <View style={[styles.pctPill, { borderColor: col }]}>
                            <Text style={[styles.pctPillText, { color: col }]}>
                              {pct.toFixed(0)} %
                            </Text>
                          </View>
                        );
                      })()}
                      <Text style={styles.categoryCount}>
                        {passed}/{category.metrics.length}
                      </Text>
                      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkFaint} />
                    </View>
                  </Pressable>

                  {open && (
                    <View style={styles.metricsContainer}>
                      {/* Cabecera de la tabla */}
                      <View style={styles.ratioTableHead}>
                        <Text style={[styles.ratioColName, styles.ratioHeadText]}>Métrica</Text>
                        <Text style={[styles.ratioColValue, styles.ratioHeadText]}>Valor</Text>
                        <Text style={[styles.ratioColThreshold, styles.ratioHeadText]}>Umbral</Text>
                        <Text style={[styles.ratioColState, styles.ratioHeadText]}>Estado</Text>
                      </View>
                      <Rule strong />

                      {category.metrics.map((metric, index) => (
                        <View key={`${metric.name}-${index}`}>
                          <View style={styles.ratioRow}>
                            <View style={styles.ratioColName}>
                              <Text style={styles.metricName} numberOfLines={2}>{metric.name}</Text>
                              {metric.interpretation ? (
                                <Text style={styles.metricInterpretation} numberOfLines={2}>
                                  {metric.interpretation}
                                </Text>
                              ) : null}
                            </View>
                            <Text style={[styles.ratioColValue, styles.ratioCellNum, { color: colors.ink }]}>
                              {metric.display_value || '—'}
                            </Text>
                            <Text style={[styles.ratioColThreshold, styles.ratioCellNum, { color: colors.inkFaint }]}>
                              {metric.threshold || '—'}
                            </Text>
                            <View style={styles.ratioStateCell}>
                              <Ionicons
                                name={metric.passed ? 'checkmark' : 'close'}
                                size={13}
                                color={metric.passed ? colors.up : colors.down}
                              />
                              <Text
                                style={[
                                  styles.ratioStateText,
                                  { color: metric.passed ? colors.up : colors.down },
                                ]}
                              >
                                {metric.passed ? 'Favorable' : 'Desfavor.'}
                              </Text>
                            </View>
                          </View>
                          {index < category.metrics.length - 1 ? <Rule /> : null}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          {/* Summary Flags */}
          {data.summary_flags && (
            <View style={styles.flagsSection}>
              <Text style={styles.sectionTitle}>Indicadores clave</Text>
              <View style={styles.flagsGrid}>
                <FlagItem icon="trending-up" label="Rentable" passed={data.summary_flags.profitable} />
                <FlagItem icon="cash" label="FCF Positivo" passed={data.summary_flags.positive_fcf} />
                <FlagItem icon="shield-checkmark" label="Deuda Baja" passed={data.summary_flags.low_debt} />
                <FlagItem icon="bar-chart" label="Buenos Márgenes" passed={data.summary_flags.good_margins} />
                <FlagItem icon="water" label="Liquidez Sana" passed={data.summary_flags.healthy_liquidity} />
                <FlagItem icon="star" label="ROE Fuerte" passed={data.summary_flags.strong_roe} />
              </View>
            </View>
          )}

          {/* Company Profile */}
          {data.company_profile && (
            <View style={styles.profileSection}>
              <Text style={styles.sectionTitle}>Perfil de la empresa</Text>
              <View style={styles.profileCard}>
                <View style={styles.profileInfoRow}>
                  <Ionicons name="business" size={16} color={colors.accent} />
                  <Text style={styles.profileInfoLabel}>Sede:</Text>
                  <Text style={styles.profileInfoValue}>{data.company_profile.headquarters || 'N/A'}</Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <Ionicons name="people" size={16} color={colors.accent} />
                  <Text style={styles.profileInfoLabel}>Empleados:</Text>
                  <Text style={styles.profileInfoValue}>
                    {data.company_profile.full_time_employees?.toLocaleString() || 'N/A'}
                  </Text>
                </View>
                {data.company_profile.website && (
                  <TouchableOpacity 
                    style={styles.profileInfoRow}
                    onPress={() => Linking.openURL(data.company_profile!.website!)}
                  >
                    <Ionicons name="globe" size={16} color={colors.accent} />
                    <Text style={styles.profileInfoLabel}>Web:</Text>
                    <Text style={[styles.profileInfoValue, { color: colors.accent }]}>
                      {data.company_profile.website.replace('https://', '').replace('http://', '')}
                    </Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.profileSummary}>{data.company_profile.business_summary}</Text>
              </View>
            </View>
          )}

          {/* Analyst Recommendations */}
          {data.analyst_recommendations && (
            <View style={styles.analystsSection}>
              <Text style={styles.sectionTitle}>Opinión de analistas</Text>
              <View style={styles.analystsCard}>
                {/* Cinco grados sobre tres tonos: la intensidad no se codifica con
                    un verde distinto (indistinguible) sino con el compromiso del
                    borde, más la palabra. */}
                <View style={styles.analystsRow}>
                  {([
                    { key: 'strong_buy', label: 'Compra fuerte', tone: 'up' as Tone, strong: true },
                    { key: 'buy', label: 'Comprar', tone: 'up' as Tone, strong: false },
                    { key: 'hold', label: 'Mantener', tone: 'caution' as Tone, strong: false },
                    { key: 'sell', label: 'Vender', tone: 'down' as Tone, strong: false },
                    { key: 'strong_sell', label: 'Venta fuerte', tone: 'down' as Tone, strong: true },
                  ]).map((band) => {
                    const { fg, wash } = toneColors(palette, band.tone);
                    const count = (data.analyst_recommendations as any)?.[band.key] ?? 0;
                    return (
                      <View
                        key={band.key}
                        style={[
                          styles.analystBox,
                          {
                            backgroundColor: band.strong ? wash : 'transparent',
                            borderColor: band.strong ? fg : colors.rule,
                          },
                        ]}
                        accessibilityLabel={`${band.label}: ${count} analistas`}
                      >
                        <Text style={[styles.analystCount, { color: count > 0 ? fg : colors.noSignal }]}>
                          {count}
                        </Text>
                        <Text style={styles.analystLabel}>{band.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

         {/* ← AQUÍ, DENTRO del ScrollView, antes del cierre */}
        <FCFFValuationCard
        ticker={data.ticker}
        currentPrice={data.metadata?.current_price}
        beta={data.metadata?.beta}
         rfRate={treasuryRate}
         taxRate={data.metadata?.effective_tax_rate ?? 21}
         />

    


        <FinancialStatements
          ticker={data.ticker}
           companyName={data.company_name}
        /> 

          </View>

          <View style={twoColumns ? styles.columnSide : styles.columnFull}>
          {/* Price Chart Section */}
          <View style={styles.chartSection}>
           

            <Text style={styles.sectionTitle}>Cotización frente al S&amp;P 500</Text>
          
            {chartData && (() => {
              const lastPoint = chartData.chart_data?.[chartData.chart_data.length - 1];
              const sp500Return = lastPoint ? lastPoint.sp500_value - 100 : 0;
              const stockReturn = lastPoint ? lastPoint.stock_value - 100 : 0;
              const alpha = stockReturn - sp500Return;

              // ── Sharpe Ratio ──
              const prices: number[] = chartData.chart_data.map((p: any) => p.stock_value);
              const dailyReturns: number[] = [];
              for (let i = 1; i < prices.length; i++) {
                dailyReturns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
              }
              const n = dailyReturns.length;
              const meanReturn = n > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / n : 0;
              const variance = n > 0 ? dailyReturns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / n : 0;
              const stdDev = Math.sqrt(variance);
              const dailyRiskFree = (treasuryRate / 100) / 252;
              const sharpe = stdDev > 0 ? ((meanReturn - dailyRiskFree) / stdDev) * Math.sqrt(252) : 0;
              const sharpeColor = sharpe >= 1 ? colors.up : sharpe >= 0 ? colors.caution : colors.down;
              const sharpeLabel = sharpe >= 2 ? 'Excelente' : sharpe >= 1 ? 'Bueno' : sharpe >= 0 ? 'Aceptable' : 'Negativo';

              return (
                <View style={styles.priceContainer}>
                  <Text style={styles.currentPrice}>
                    ${chartData.current_price.toFixed(2)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
                    <View style={[styles.priceChangeContainer, { backgroundColor: stockReturn >= 0 ? colors.upWash : colors.downWash }]}>
                      <Ionicons name={stockReturn >= 0 ? 'trending-up' : 'trending-down'} size={16} color={stockReturn >= 0 ? colors.up : colors.down} />
                      <Text style={[styles.priceChangeText, { color: stockReturn >= 0 ? colors.up : colors.down }]}>
                        {data.ticker}: {stockReturn >= 0 ? '+' : ''}{stockReturn.toFixed(2)}%
                      </Text>
                    </View>
                    <View style={[styles.priceChangeContainer, { backgroundColor: sp500Return >= 0 ? colors.cautionWash : colors.downWash }]}>
                      <Ionicons name={sp500Return >= 0 ? 'trending-up' : 'trending-down'} size={16} color={sp500Return >= 0 ? colors.caution : colors.down} />
                      <Text style={[styles.priceChangeText, { color: sp500Return >= 0 ? colors.caution : colors.down }]}>
                        S&P 500: {sp500Return >= 0 ? '+' : ''}{sp500Return.toFixed(2)}%
                      </Text>
                    </View>
                    <View style={[styles.priceChangeContainer, { backgroundColor: alpha >= 0 ? colors.upWash : colors.downWash }]}>
                      <Ionicons name={alpha >= 0 ? 'star' : 'star-outline'} size={16} color={alpha >= 0 ? colors.up : colors.down} />
                      <Text style={[styles.priceChangeText, { color: alpha >= 0 ? colors.up : colors.down, fontWeight: '700' }]}>
                        Alpha: {alpha >= 0 ? '+' : '−'}{Math.abs(alpha).toFixed(2)}%
                      </Text>
                    </View>
                    {/* ── Sharpe Ratio ── */}
                    <View style={[styles.priceChangeContainer, { backgroundColor: sharpeColor + '15' }]}>
                      <Ionicons name="analytics" size={16} color={sharpeColor} />
                      <Text style={[styles.priceChangeText, { color: sharpeColor, fontWeight: '700' }]}>
                        Sharpe: {sharpe.toFixed(2)} · {sharpeLabel}
                      </Text>
                      <Text style={{ fontSize: 10, color: sharpeColor, marginLeft: 2, opacity: 0.8 }}>
                        (rf {treasuryRate.toFixed(2)}%)
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* Gráfico interactivo: dos series sobre el mismo eje, un solo cursor.
                Sustituye al gráfico estático anterior — arrastrando se lee
                cualquier fecha y las dos series a la vez. */}
            {loadingChart ? (
              <View style={styles.chartLoadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.chartLoadingText}>Cargando la serie de cotización…</Text>
              </View>
            ) : chartData?.chart_data?.length ? (
              <InstrumentChart
                legend="Base 100 al inicio del periodo"
                height={360}
                baseline={100}
                formatValue={(v) => v.toFixed(1)}
                ranges={CHART_RANGES}
                activeRange={selectedPeriod}
                onRangeChange={(k) => {
                  setSelectedPeriod(k);
                  fetchChartData(k);
                }}
                series={[
                  {
                    key: 'stock',
                    label: data.ticker,
                    showArea: true,
                    points: chartData.chart_data.map((pt: any) => ({
                      x: new Date(pt.date).getTime(),
                      y: typeof pt.stock_value === 'number' ? pt.stock_value : null,
                    })),
                  },
                  {
                    key: 'sp500',
                    label: 'S&P 500',
                    color: colors.inkMuted,
                    dashed: true,
                    points: chartData.chart_data.map((pt: any) => ({
                      x: new Date(pt.date).getTime(),
                      y: typeof pt.sp500_value === 'number' ? pt.sp500_value : null,
                    })),
                  },
                ]}
              />
            ) : (
              <View style={styles.chartErrorContainer}>
                <Ionicons name="alert-circle-outline" size={40} color={colors.inkFaint} />
                <Text style={styles.chartErrorText}>No se pudo cargar la serie de cotización.</Text>
              </View>
            )}
          </View>

              {/* Indicadores avanzados */}                
            <IndicatorsChartCard ticker={data.ticker} />
         
          {/* TradingView Widget - Web only */}
          {Platform.OS === 'web' && (
            <View style={styles.tradingViewSection}>
              {/* El widget sigue la apariencia de la app. Antes tenía su propio
                  interruptor claro/oscuro, que competía con el de la aplicación:
                  dos controles para lo mismo es uno de más. */}
              <View style={styles.tradingViewHeader}>
                <Text style={styles.sectionTitle}>Velas japonesas</Text>
              </View>

              <View style={[styles.tradingViewContainer, { borderColor: colors.rule }]}>
                <iframe
                  title={`Gráfico de velas de ${data.ticker} en TradingView`}
                  key={`tv-${data.ticker}-${tvTheme}-${tvToolbar}`}
                  src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${data.ticker}&interval=D&hidesidetoolbar=0&hidetoptoolbar=0&symboledit=1&saveimage=1&toolbarbg=${tvToolbar}&studies=[]&theme=${tvTheme}&style=1&timezone=exchange&withdateranges=1&showpopupbutton=1&studies_overrides=%7B%7D&overrides=${tvOverrides}&enabled_features=[]&disabled_features=[]&locale=es&utm_source=localhost`}
                  style={{ width: '100%', height: '500px', border: 'none', borderRadius: '8px' }}
                  allowFullScreen
                />
              </View>
            </View>

         

          )}
     
          {/* Technical Analysis Section */}
          <View style={styles.technicalSection}>
            <Text style={styles.sectionTitle}>Análisis técnico</Text>
            {loadingTechnical ? (
              <View style={styles.technicalLoadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.technicalLoadingText}>Cargando análisis técnico...</Text>
              </View>
            ) : technicalData ? (
              <>
                <View style={[
                  styles.technicalSummaryCard,
                  { backgroundColor: technicalData.technical_recommendation === 'COMPRAR' ? colors.upWash : 
                                    technicalData.technical_recommendation === 'VENDER' ? colors.downWash : colors.cautionWash }
                ]}>
                  <View style={styles.technicalSummaryRow}>
                    <View style={styles.technicalSummaryItem}>
                      <Text style={styles.technicalSummaryLabel}>Score Técnico</Text>
                      <Text style={[styles.technicalSummaryValue, { color: technicalData.technical_score >= 65 ? colors.up : technicalData.technical_score <= 35 ? colors.down : colors.caution }]}>
                        {technicalData.technical_score.toFixed(0)}/100
                      </Text>
                    </View>
                    <View style={styles.technicalSummaryDivider} />
                    <View style={styles.technicalSummaryItem}>
                      <Text style={styles.technicalSummaryLabel}>Señal</Text>
                      <View style={[styles.technicalSignalBadge, { backgroundColor: technicalData.technical_recommendation === 'COMPRAR' ? colors.up : technicalData.technical_recommendation === 'VENDER' ? colors.down : colors.caution }]}>
                        <Text style={styles.technicalSignalText}>{technicalData.technical_recommendation}</Text>
                      </View>
                    </View>
                    <View style={styles.technicalSummaryDivider} />
                    <View style={styles.technicalSummaryItem}>
                      <Text style={styles.technicalSummaryLabel}>Tendencia</Text>
                      <View style={styles.trendIndicator}>
                        <Ionicons name={technicalData.trend_direction === 'ALCISTA' ? 'trending-up' : technicalData.trend_direction === 'BAJISTA' ? 'trending-down' : 'remove'} size={20} color={technicalData.trend_direction === 'ALCISTA' ? colors.up : technicalData.trend_direction === 'BAJISTA' ? colors.down : colors.caution} />
                        <Text style={[styles.trendText, { color: technicalData.trend_direction === 'ALCISTA' ? colors.up : technicalData.trend_direction === 'BAJISTA' ? colors.down : colors.caution }]}>
                          {technicalData.trend_direction}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {(technicalData.golden_cross || technicalData.death_cross) && (
                    <View style={[styles.crossAlert, { backgroundColor: technicalData.golden_cross ? colors.upWash : colors.downWash }]}>
                      <Ionicons name={technicalData.golden_cross ? 'star' : 'warning'} size={16} color={technicalData.golden_cross ? colors.up : colors.down} />
                      <Text style={[styles.crossAlertText, { color: technicalData.golden_cross ? colors.up : colors.down }]}>
                        {technicalData.golden_cross ? 'Golden Cross detectado — señal alcista fuerte' : 'Death Cross detectado — señal bajista fuerte'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Fibonacci */}
                <View style={styles.technicalCard}>
                  <TouchableOpacity style={styles.technicalCardHeader} onPress={() => toggleTechnicalSection('fibonacci')}>
                    <View style={styles.technicalCardTitleRow}>
                      <Ionicons name="git-branch-outline" size={17} color={colors.inkMuted} />
                      <Text style={styles.technicalCardTitle}>Retrocesos de Fibonacci</Text>
                    </View>
                    <Ionicons name={expandedTechnical.has('fibonacci') ? 'chevron-up' : 'chevron-down'} size={24} color={colors.inkFaint} />
                  </TouchableOpacity>
                  {expandedTechnical.has('fibonacci') && (
                    <View style={styles.technicalCardContent}>
                      <View style={styles.fibonacciInfo}>
                        <View style={styles.fibonacciInfoRow}><Text style={styles.fibonacciInfoLabel}>Máximo (Swing High):</Text><Text style={styles.fibonacciInfoValue}>${technicalData.swing_high.toFixed(2)}</Text></View>
                        <View style={styles.fibonacciInfoRow}><Text style={styles.fibonacciInfoLabel}>Mínimo (Swing Low):</Text><Text style={styles.fibonacciInfoValue}>${technicalData.swing_low.toFixed(2)}</Text></View>
                        <View style={styles.fibonacciInfoRow}><Text style={styles.fibonacciInfoLabel}>Zona Actual:</Text><Text style={[styles.fibonacciInfoValue, { color: colors.accent }]}>{technicalData.current_fibonacci_zone}</Text></View>
                      </View>
                      <View style={styles.interpretationBox}><Text style={styles.interpretationText}>{technicalData.fibonacci_interpretation}</Text></View>
                      <View style={styles.levelsTable}>
                        <View style={styles.levelsTableHeader}>
                          <Text style={[styles.levelsTableHeaderText, { flex: 1 }]}>Nivel</Text>
                          <Text style={[styles.levelsTableHeaderText, { flex: 1.5 }]}>Precio</Text>
                          <Text style={[styles.levelsTableHeaderText, { flex: 1 }]}>Dist. %</Text>
                          <Text style={[styles.levelsTableHeaderText, { flex: 1 }]}>Tipo</Text>
                        </View>
                        {technicalData.fibonacci_levels.filter(l => !l.level.includes('127') && !l.level.includes('161')).map((level, idx) => (
                          <View key={idx} style={[styles.levelsTableRow, Math.abs(level.distance_percent) < 2 && styles.levelsTableRowHighlight]}>
                            <Text style={[styles.levelsTableCell, { flex: 1, fontWeight: '600' }]}>{level.level}</Text>
                            <Text style={[styles.levelsTableCell, { flex: 1.5 }]}>${level.price.toFixed(2)}</Text>
                            <Text style={[styles.levelsTableCell, { flex: 1, color: level.distance_percent >= 0 ? colors.up : colors.down }]}>{level.distance_percent >= 0 ? '+' : ''}{level.distance_percent.toFixed(1)}%</Text>
                            <Text style={[styles.levelsTableCell, { flex: 1, color: level.is_support ? colors.up : colors.down }]}>{level.is_support ? 'Soporte' : 'Resistencia'}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {/* Moving Averages */}
                <View style={styles.technicalCard}>
                  <TouchableOpacity style={styles.technicalCardHeader} onPress={() => toggleTechnicalSection('ma')}>
                    <View style={styles.technicalCardTitleRow}>
                      <Ionicons name="trending-down-outline" size={17} color={colors.inkMuted} />
                      <Text style={styles.technicalCardTitle}>Medias Móviles</Text>
                    </View>
                    <View style={styles.maSignalBadge}>
                      <Text style={[styles.maSignalText, { color: technicalData.ma_trend_signal === 'COMPRAR' ? colors.up : technicalData.ma_trend_signal === 'VENDER' ? colors.down : colors.caution }]}>{technicalData.ma_trend_signal}</Text>
                      <Ionicons name={expandedTechnical.has('ma') ? 'chevron-up' : 'chevron-down'} size={24} color={colors.inkFaint} />
                    </View>
                  </TouchableOpacity>
                  {expandedTechnical.has('ma') && (
                    <View style={styles.technicalCardContent}>
                      <View style={styles.interpretationBox}><Text style={styles.interpretationText}>{technicalData.ma_summary}</Text></View>
                      <View style={styles.maCardsContainer}>
                        {technicalData.moving_averages.map((ma, idx) => (
                          <View key={idx} style={styles.maCard}>
                            <View style={styles.maCardHeader}>
                              <Text style={styles.maCardTitle}>MA {ma.period}</Text>
                              <View style={[styles.maCardSignal, { backgroundColor: ma.signal === 'ALCISTA' ? colors.upWash : ma.signal === 'BAJISTA' ? colors.downWash : colors.cautionWash }]}>
                                <Ionicons name={ma.signal === 'ALCISTA' ? 'arrow-up' : ma.signal === 'BAJISTA' ? 'arrow-down' : 'remove'} size={14} color={ma.signal === 'ALCISTA' ? colors.up : ma.signal === 'BAJISTA' ? colors.down : colors.caution} />
                                <Text style={[styles.maCardSignalText, { color: ma.signal === 'ALCISTA' ? colors.up : ma.signal === 'BAJISTA' ? colors.down : colors.caution }]}>{ma.signal}</Text>
                              </View>
                            </View>
                            <Text style={styles.maCardValue}>${ma.value.toFixed(2)}</Text>
                            <View style={styles.maCardFooter}>
                              <Text style={styles.maCardPosition}>{ma.price_position}</Text>
                              <Text style={[styles.maCardDistance, { color: ma.distance_percent >= 0 ? colors.up : colors.down }]}>{ma.distance_percent >= 0 ? '+' : ''}{ma.distance_percent.toFixed(1)}%</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {/* Camarilla Pivots */}
                <View style={styles.technicalCard}>
                  <TouchableOpacity style={styles.technicalCardHeader} onPress={() => toggleTechnicalSection('camarilla')}>
                    <View style={styles.technicalCardTitleRow}>
                      <Ionicons name="locate-outline" size={17} color={colors.inkMuted} />
                      <Text style={styles.technicalCardTitle}>Puntos Pivote Camarilla</Text>
                    </View>
                    <Ionicons name={expandedTechnical.has('camarilla') ? 'chevron-up' : 'chevron-down'} size={24} color={colors.inkFaint} />
                  </TouchableOpacity>
                  {expandedTechnical.has('camarilla') && (
                    <View style={styles.technicalCardContent}>
                      <View style={styles.fibonacciInfo}>
                        <View style={styles.fibonacciInfoRow}><Text style={styles.fibonacciInfoLabel}>Zona Actual:</Text><Text style={[styles.fibonacciInfoValue, { color: colors.accent }]}>{technicalData.current_camarilla_zone}</Text></View>
                      </View>
                      <View style={styles.interpretationBox}><Text style={styles.interpretationText}>{technicalData.camarilla_interpretation}</Text></View>
                      <View style={styles.camarillaContainer}>
                        <Text style={styles.camarillaGroupTitle}>Resistencias</Text>
                        {technicalData.camarilla_pivots.filter(p => p.level.startsWith('R')).sort((a, b) => b.price - a.price).map((pivot, idx) => (
                          <View key={idx} style={[styles.camarillaRow, (pivot.level === 'R3' || pivot.level === 'R4') && styles.camarillaRowImportant]}>
                            <View style={styles.camarillaLevelBadge}><Text style={[styles.camarillaLevelText, { color: pivot.level === 'R4' ? colors.down : pivot.level === 'R3' ? colors.down : colors.caution }]}>{pivot.level}</Text></View>
                            <Text style={styles.camarillaPrice}>${pivot.price.toFixed(2)}</Text>
                            <Text style={styles.camarillaSignificance} numberOfLines={2}>{pivot.significance.split(' - ')[1] || pivot.significance}</Text>
                          </View>
                        ))}
                        <View style={styles.pivotPointContainer}>
                          {technicalData.camarilla_pivots.filter(p => p.level === 'PP').map((pivot, idx) => (
                            <View key={idx} style={styles.pivotPointRow}>
                              <View style={styles.pivotPointBadge}><Text style={styles.pivotPointText}>PP</Text></View>
                              <Text style={styles.pivotPointPrice}>${pivot.price.toFixed(2)}</Text>
                              <Text style={styles.pivotPointLabel}>Punto Pivote Central</Text>
                            </View>
                          ))}
                        </View>
                        <Text style={styles.camarillaGroupTitle}>Soportes</Text>
                        {technicalData.camarilla_pivots.filter(p => p.level.startsWith('S')).sort((a, b) => b.price - a.price).map((pivot, idx) => (
                          <View key={idx} style={[styles.camarillaRow, (pivot.level === 'S3' || pivot.level === 'S4') && styles.camarillaRowImportantSupport]}>
                            <View style={styles.camarillaLevelBadge}><Text style={[styles.camarillaLevelText, { color: pivot.level === 'S4' ? colors.up : pivot.level === 'S3' ? colors.up : colors.up }]}>{pivot.level}</Text></View>
                            <Text style={styles.camarillaPrice}>${pivot.price.toFixed(2)}</Text>
                            <Text style={styles.camarillaSignificance} numberOfLines={2}>{pivot.significance.split(' - ')[1] || pivot.significance}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {/* Key Levels Summary */}
                <View style={styles.keyLevelsCard}>
                  <Text style={styles.keyLevelsTitle}>Niveles clave</Text>
                  <View style={styles.keyLevelsGrid}>
                    <View style={styles.keyLevelItem}><Text style={styles.keyLevelLabel}>Soporte Fib 38.2%</Text><Text style={styles.keyLevelValue}>${technicalData.key_levels.soporte_fibonacci_382.toFixed(2)}</Text></View>
                    <View style={styles.keyLevelItem}><Text style={styles.keyLevelLabel}>Soporte Fib 61.8%</Text><Text style={styles.keyLevelValue}>${technicalData.key_levels.soporte_fibonacci_618.toFixed(2)}</Text></View>
                    <View style={styles.keyLevelItem}><Text style={styles.keyLevelLabel}>Resistencia R3</Text><Text style={[styles.keyLevelValue, { color: colors.down }]}>${technicalData.key_levels.camarilla_r3.toFixed(2)}</Text></View>
                    <View style={styles.keyLevelItem}><Text style={styles.keyLevelLabel}>Soporte S3</Text><Text style={[styles.keyLevelValue, { color: colors.up }]}>${technicalData.key_levels.camarilla_s3.toFixed(2)}</Text></View>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.technicalErrorContainer}>
                <Ionicons name="alert-circle-outline" size={40} color={colors.inkFaint} />
                <Text style={styles.technicalErrorText}>No se pudo cargar el análisis técnico</Text>
              </View>
            )}
          </View>




          {/* ── Holders Breakdown ── */}
          {data.holders_breakdown && (() => {
            const { insider_percent, institution_percent, public_percent } = data.holders_breakdown;
            const risk = getShareholderRisk(insider_percent, institution_percent, public_percent);

            return (
              <View style={styles.holdersSection}>
                <Text style={styles.sectionTitle}>Distribución de accionistas</Text>
                <View style={styles.holdersCard}>

                  {/* Barra proporcional. Es una composición, no un veredicto:
                      por eso usa la rampa neutra y no el verde/rojo semántico.
                      Un free float alto no es "bueno" por sí solo. */}
                  <View style={styles.holdersBarContainer}>
                    <View style={[styles.holdersBar, { flex: insider_percent, backgroundColor: colors.accent }]} />
                    <View style={[styles.holdersBar, { flex: institution_percent, backgroundColor: colors.inkMuted }]} />
                    <View style={[styles.holdersBar, { flex: public_percent, backgroundColor: colors.ruleStrong }]} />
                  </View>

                  {/* Leyenda */}
                  <View style={styles.holdersLegend}>
                    <View style={styles.holderLegendItem}>
                      <View style={[styles.holderDot, { backgroundColor: colors.accent }]} />
                      <Text style={styles.holderLabel}>Insiders</Text>
                      <Text style={styles.holderPercent}>{insider_percent.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.holderLegendItem}>
                      <View style={[styles.holderDot, { backgroundColor: colors.inkMuted }]} />
                      <Text style={styles.holderLabel}>Instituciones</Text>
                      <Text style={styles.holderPercent}>{institution_percent.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.holderLegendItem}>
                      <View style={[styles.holderDot, { backgroundColor: colors.ruleStrong }]} />
                      <Text style={styles.holderLabel}>Público</Text>
                      <Text style={styles.holderPercent}>{public_percent.toFixed(1)}%</Text>
                    </View>
                  </View>

                  {/* ── Análisis de Riesgo Accionarial ── */}
                  <View style={[
                    styles.riskContainer,
                    {
                      backgroundColor: toneColors(palette, risk.tone).wash,
                      borderColor: toneColors(palette, risk.tone).fg,
                    },
                  ]}>
                    {/* Cabecera del riesgo. La marca de índice sustituye al
                        emoji de semáforo: iconografía dibujada, no glifos. */}
                    <View style={styles.riskHeader}>
                      <View style={{ width: 3, height: 16, backgroundColor: toneColors(palette, risk.tone).fg }} />
                      <Text style={[styles.riskTitle, { color: toneColors(palette, risk.tone).fg }]}>
                        Riesgo estructural: {risk.level}
                      </Text>
                    </View>

                    {/* Descripción */}
                    <Text style={styles.riskDescription}>{risk.description}</Text>

                    {/* Indicadores con semáforo */}
                    <View style={styles.riskIndicators}>
                      {/* Insiders */}
                      <View style={styles.riskIndicatorRow}>
                        <View style={styles.riskIndicatorLeft}>
                          <View style={[
                            styles.riskDot,
                            { backgroundColor: insider_percent > 60 ? colors.down : insider_percent > 40 ? colors.caution : colors.up },
                          ]} />
                          <Text style={styles.riskIndicatorLabel}>Insiders</Text>
                        </View>
                        <View style={styles.riskIndicatorRight}>
                          <Text style={[
                            styles.riskIndicatorValue,
                            { color: insider_percent > 60 ? colors.down : insider_percent > 40 ? colors.caution : colors.up },
                          ]}>
                            {insider_percent.toFixed(1)}%
                          </Text>
                          <Text style={styles.riskIndicatorTag}>
                            {insider_percent > 60 ? 'Alto' : insider_percent > 40 ? 'Medio' : 'Normal'}
                          </Text>
                        </View>
                      </View>

                      {/* Institucionales */}
                      <View style={styles.riskIndicatorRow}>
                        <View style={styles.riskIndicatorLeft}>
                          <View style={[
                            styles.riskDot,
                            { backgroundColor: institution_percent < 10 ? colors.down : institution_percent < 25 ? colors.caution : colors.up },
                          ]} />
                          <Text style={styles.riskIndicatorLabel}>Institucionales</Text>
                        </View>
                        <View style={styles.riskIndicatorRight}>
                          <Text style={[
                            styles.riskIndicatorValue,
                            { color: institution_percent < 10 ? colors.down : institution_percent < 25 ? colors.caution : colors.up },
                          ]}>
                            {institution_percent.toFixed(1)}%
                          </Text>
                          <Text style={styles.riskIndicatorTag}>
                            {institution_percent < 10 ? 'Bajo' : institution_percent < 25 ? 'Medio' : 'Normal'}
                          </Text>
                        </View>
                      </View>

                      {/* Free Float */}
                      <View style={[styles.riskIndicatorRow, { borderBottomWidth: 0 }]}>
                        <View style={styles.riskIndicatorLeft}>
                          <View style={[
                            styles.riskDot,
                            { backgroundColor: public_percent < 20 ? colors.down : public_percent < 30 ? colors.caution : colors.up },
                          ]} />
                          <Text style={styles.riskIndicatorLabel}>Free Float</Text>
                        </View>
                        <View style={styles.riskIndicatorRight}>
                          <Text style={[
                            styles.riskIndicatorValue,
                            { color: public_percent < 20 ? colors.down : public_percent < 30 ? colors.caution : colors.up },
                          ]}>
                            {public_percent.toFixed(1)}%
                          </Text>
                          <Text style={styles.riskIndicatorTag}>
                            {public_percent < 20 ? 'Bajo' : public_percent < 30 ? 'Medio' : 'Normal'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Disclaimer */}
                    <Text style={styles.riskDisclaimer}>
                      Mide riesgo de gobernanza y liquidez, no la calidad del negocio.
                    </Text>
                  </View>

                </View>
              </View>
            );
          })()}

          {/* Top Institutional Holders */}
          {data.top_institutional_holders && data.top_institutional_holders.length > 0 && (
            <View style={styles.institutionalSection}>
              <Text style={styles.sectionTitle}>Principales accionistas institucionales</Text>
              <View style={styles.institutionalCard}>
                {data.top_institutional_holders.slice(0, 5).map((holder, index) => (
                  <View key={index} style={styles.institutionalRow}>
                    <View style={styles.institutionalRank}>
                      <Text style={styles.institutionalRankText}>{index + 1}</Text>
                    </View>
                    <View style={styles.institutionalInfo}>
                      <Text style={styles.institutionalName} numberOfLines={1}>
                        {holder.holder_name}
                      </Text>
                      <Text style={styles.institutionalShares}>
                        {holder.shares.toLocaleString()} acciones
                      </Text>
                    </View>
                    <Text style={styles.institutionalPercent}>
                      {holder.percentage.toFixed(2)}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Stock News Section */}
          <View style={styles.newsSection}>
            <View style={styles.newsSectionHeader}>
              <Ionicons name="newspaper" size={22} color={colors.accent} />
              <Text style={styles.sectionTitle}>Noticias de {data.ticker}</Text>
            </View>
            {loadingNews ? (
              <View style={styles.newsLoadingContainer}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.newsLoadingText}>Cargando noticias...</Text>
              </View>
            ) : stockNews.length === 0 ? (
              <View style={styles.noNewsContainer}>
                <Ionicons name="newspaper-outline" size={36} color={colors.inkFaint} />
                <Text style={styles.noNewsText}>No hay noticias disponibles</Text>
              </View>
            ) : (
              stockNews.map((article, index) => (
                <TouchableOpacity key={index} style={styles.newsCard} onPress={() => openNewsLink(article.link)} activeOpacity={0.7}>
                  <View style={styles.newsCardContent}>
                    {article.thumbnail && (
                      <Image source={{ uri: article.thumbnail }} style={styles.newsThumbnail} resizeMode="cover" />
                    )}
                    <View style={[styles.newsTextContainer, !article.thumbnail && styles.newsTextContainerFull]}>
                      <Text style={styles.newsTitle} numberOfLines={2}>{article.title}</Text>
                      {article.summary && (
                        <Text style={styles.newsSummary} numberOfLines={2}>{article.summary}</Text>
                      )}
                      <View style={styles.newsMetaContainer}>
                        <Text style={styles.newsPublisher}>{article.publisher}</Text>
                        <Text style={styles.newsDate}>{article.published_date}</Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="open-outline" size={18} color={colors.inkFaint} style={styles.newsChevron} />
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Simulación de inversión: traduce la rentabilidad a dinero, que es
              como la gente piensa en ella. */}
          <View style={styles.newsSection}>
            <InvestmentSimulator ticker={data.ticker} currency={data.metadata?.currency} />
          </View>

          </View>
        </View>

      </ScrollView>

  
      {/* AI Assistant FAB */}
      <TouchableOpacity
        style={styles.aiFab}
        onPress={() => {
          if (!technicalData) {
            fetchTechnicalAnalysis().then(() => setShowAIChat(true));
          } else {
            setShowAIChat(true);
          }
        }}
      >
        <Ionicons name="sparkles" size={24} color={colors.inkOnAccent} />
      </TouchableOpacity>

      <Modal visible={showAIChat} animationType="slide">
        <AIAssistant analysisData={aiAnalysisData} onClose={() => setShowAIChat(false)} colors={colors} />
      </Modal>
    </View>
  );
}

function FlagItem({ icon, label, passed }: { icon: any; label: string; passed: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeResultsStyles(colors), [colors]);
  const fg = passed ? colors.up : colors.down;

  return (
    <View
      style={styles.flagItem}
      accessibilityLabel={`${label}: ${passed ? 'favorable' : 'desfavorable'}`}
    >
      {/* Marca de índice + icono + palabra: el estado no depende sólo del color */}
      <View style={[styles.flagMark, { backgroundColor: fg }]} />
      <Ionicons name={icon} size={16} color={colors.inkMuted} />
      <Text style={styles.flagLabel}>{label}</Text>
      <Ionicons
        name={passed ? 'checkmark-circle' : 'close-circle'}
        size={15}
        color={fg}
      />
    </View>
  );
}
