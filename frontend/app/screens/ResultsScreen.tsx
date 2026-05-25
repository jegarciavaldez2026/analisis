import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Platform,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Modal,
  Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import axios from 'axios';
import AIAssistant from '../../components/AIAssistant';
import { useTheme } from '../../contexts/ThemeContext';
import FinancialRadarChart from '../../components/FinancialRadarChart';
// Importa el componente
import FCFFValuationCard from '../../components/FCFFValuationCard';
import FinancialStatements from '../../components/FinancialStatements';
import IndicatorsChartCard from '../../components/IndicatorsChartCard';


const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const screenWidth = Dimensions.get('window').width;

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
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
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
      emoji: '🔴',
      color: '#FF3B30',
      bgColor: '#FF3B3012',
      borderColor: '#FF3B3040',
      description: buildDescription(triggers, ' → alto riesgo para minoritarios.'),
    };
  } else if (insiders > 60 || institutional < 20 || publicFloat < 30) {
    const triggers: string[] = [];
    if (insiders > 60) triggers.push('Alta concentración de insiders');
    if (institutional < 20) triggers.push('Baja supervisión institucional');
    if (publicFloat < 30) triggers.push('Free float reducido → menor liquidez y mayor volatilidad');
    return {
      level: 'MEDIO-ALTO',
      emoji: '🟠',
      color: '#FF6B00',
      bgColor: '#FF6B0012',
      borderColor: '#FF6B0040',
      description: buildDescription(triggers, '.'),
    };
  } else if (insiders > 40 || institutional < 30 || publicFloat < 40) {
    const triggers: string[] = [];
    if (insiders > 40) triggers.push('Influencia relevante de insiders');
    if (institutional < 30) triggers.push('Supervisión institucional moderada');
    if (publicFloat < 40) triggers.push('Free float moderado');
    return {
      level: 'MEDIO',
      emoji: '🟡',
      color: '#CC9900',
      bgColor: '#FFCC0012',
      borderColor: '#FFCC0040',
      description: buildDescription(triggers, ', pero aún existen contrapesos.'),
    };
  } else if (insiders > 20 || institutional < 40 || publicFloat < 50) {
    const triggers: string[] = [];
    if (insiders > 20) triggers.push('Presencia moderada de insiders');
    if (institutional < 40) triggers.push('Supervisión institucional aceptable');
    if (publicFloat < 50) triggers.push('Free float algo limitado');
    return {
      level: 'MEDIO-BAJO',
      emoji: '🟡',
      color: '#B8860B',
      bgColor: '#FFD60A12',
      borderColor: '#FFD60A40',
      description: buildDescription(triggers, '.'),
    };
  } else {
    return {
      level: 'BAJO',
      emoji: '🟢',
      color: '#248A3D',
      bgColor: '#34C75912',
      borderColor: '#34C75940',
      description: 'Empresa equilibrada: buena supervisión institucional y alta liquidez de mercado.',
    };
  }
};

export default function ResultsScreen({ data, onBack }: ResultsScreenProps) {
  const { colors } = useTheme();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([data.ratios[0]?.category]));
  const [chartData, setChartData] = useState<any>(null);
  const [tvTheme, setTvTheme] = useState<'dark' | 'light'>('light');
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

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'COMPRAR': return '#34C759';
      case 'MANTENER': return '#FF9500';
      case 'VENDER': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Bajo': return '#34C759';
      case 'Moderado': return '#FF9500';
      case 'Alto': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>

     
        {/* Company Info */}
        <View style={styles.companySection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            {data.metadata?.website ? (
              <img
                src={`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${data.metadata.website}&size=128`}
                style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'contain', backgroundColor: '#f5f5f7', padding: 4 }}
                onError={(e: any) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#007AFF22', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#007AFF' }}>{data.ticker.charAt(0)}</Text>
              </View>
            )}
            <View>
              <Text style={styles.companyTicker}>{data.ticker}</Text>
              <Text style={styles.companyName}>{data.company_name}</Text>
            </View>
          </View>
          {data.metadata && (
            <View style={styles.metadataRow}>
              {data.metadata.sector !== 'N/A' && (
                <Text style={styles.metadataText}>{data.metadata.sector}</Text>
              )}
              {data.metadata.industry !== 'N/A' && (
                <Text style={styles.metadataText}> • {data.metadata.industry}</Text>
              )}
            </View>
          )}
        </View>

        {/* Key Financial Metrics */}
        {data.metadata && (
          <View style={styles.keyMetricsSection}>
            <Text style={styles.sectionTitle}>📊 Métricas Clave</Text>
            <View style={styles.keyMetricsGrid}>
              <View style={styles.keyMetricItem}>
                <Text style={styles.keyMetricLabel}>Market Cap</Text>
                <Text style={styles.keyMetricValue}>
                  ${data.metadata.market_cap ? (data.metadata.market_cap / 1e9).toFixed(1) + 'B' : 'N/A'}
                </Text>
              </View>
              <View style={styles.keyMetricItem}>
                <Text style={styles.keyMetricLabel}>P/E Ratio</Text>
                <Text style={styles.keyMetricValue}>
                  {data.metadata.pe_ratio ? data.metadata.pe_ratio.toFixed(2) : 'N/A'}
                </Text>
              </View>
              <View style={styles.keyMetricItem}>
                <Text style={styles.keyMetricLabel}>EPS</Text>
                <Text style={styles.keyMetricValue}>
                  ${data.metadata.eps ? data.metadata.eps.toFixed(2) : 'N/A'}
                </Text>
              </View>
              <View style={styles.keyMetricItem}>
                <Text style={styles.keyMetricLabel}>Dividend</Text>
                <Text style={styles.keyMetricValue}>
                  ${data.metadata.dividend_rate ? data.metadata.dividend_rate.toFixed(2) : '0.00'}
                </Text>
              </View>
              <View style={styles.keyMetricItem}>
                <Text style={styles.keyMetricLabel}>Yield</Text>
                <Text style={styles.keyMetricValue}>
                  {data.metadata.dividend_yield ? data.metadata.dividend_yield.toFixed(2) + '%' : '0%'}
                </Text>
              </View>
              <View style={styles.keyMetricItem}>
                <Text style={styles.keyMetricLabel}>Beta</Text>
                <Text style={styles.keyMetricValue}>
                  {data.metadata.beta ? data.metadata.beta.toFixed(2) : 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Company Profile */}
        {data.company_profile && (
          <View style={styles.profileSection}>
            <Text style={styles.sectionTitle}>🏢 Perfil de la Empresa</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileInfoRow}>
                <Ionicons name="business" size={16} color="#007AFF" />
                <Text style={styles.profileInfoLabel}>Sede:</Text>
                <Text style={styles.profileInfoValue}>{data.company_profile.headquarters || 'N/A'}</Text>
              </View>
              <View style={styles.profileInfoRow}>
                <Ionicons name="people" size={16} color="#007AFF" />
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
                  <Ionicons name="globe" size={16} color="#007AFF" />
                  <Text style={styles.profileInfoLabel}>Web:</Text>
                  <Text style={[styles.profileInfoValue, { color: '#007AFF' }]}>
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
            <Text style={styles.sectionTitle}>👨‍💼 Opinión de Analistas</Text>
            <View style={styles.analystsCard}>
              <View style={styles.analystsRow}>
                <View style={[styles.analystBox, { backgroundColor: '#34C75920' }]}>
                  <Text style={[styles.analystCount, { color: '#34C759' }]}>
                    {data.analyst_recommendations.strong_buy}
                  </Text>
                  <Text style={styles.analystLabel}>Compra Fuerte</Text>
                </View>
                <View style={[styles.analystBox, { backgroundColor: '#32D74B20' }]}>
                  <Text style={[styles.analystCount, { color: '#32D74B' }]}>
                    {data.analyst_recommendations.buy}
                  </Text>
                  <Text style={styles.analystLabel}>Comprar</Text>
                </View>
                <View style={[styles.analystBox, { backgroundColor: '#FF950020' }]}>
                  <Text style={[styles.analystCount, { color: '#FF9500' }]}>
                    {data.analyst_recommendations.hold}
                  </Text>
                  <Text style={styles.analystLabel}>Mantener</Text>
                </View>
                <View style={[styles.analystBox, { backgroundColor: '#FF6B3520' }]}>
                  <Text style={[styles.analystCount, { color: '#FF6B35' }]}>
                    {data.analyst_recommendations.sell}
                  </Text>
                  <Text style={styles.analystLabel}>Vender</Text>
                </View>
                <View style={[styles.analystBox, { backgroundColor: '#FF3B3020' }]}>
                  <Text style={[styles.analystCount, { color: '#FF3B30' }]}>
                    {data.analyst_recommendations.strong_sell}
                  </Text>
                  <Text style={styles.analystLabel}>Venta Fuerte</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Holders Breakdown ── */}
        {data.holders_breakdown && (() => {
          const { insider_percent, institution_percent, public_percent } = data.holders_breakdown;
          const risk = getShareholderRisk(insider_percent, institution_percent, public_percent);

          return (
            <View style={styles.holdersSection}>
              <Text style={styles.sectionTitle}>📈 Distribución de Accionistas</Text>
              <View style={styles.holdersCard}>

                {/* Barra proporcional */}
                <View style={styles.holdersBarContainer}>
                  <View style={[styles.holdersBar, { flex: insider_percent, backgroundColor: '#007AFF' }]} />
                  <View style={[styles.holdersBar, { flex: institution_percent, backgroundColor: '#AF52DE' }]} />
                  <View style={[styles.holdersBar, { flex: public_percent, backgroundColor: '#34C759' }]} />
                </View>

                {/* Leyenda */}
                <View style={styles.holdersLegend}>
                  <View style={styles.holderLegendItem}>
                    <View style={[styles.holderDot, { backgroundColor: '#007AFF' }]} />
                    <Text style={styles.holderLabel}>Insiders</Text>
                    <Text style={styles.holderPercent}>{insider_percent.toFixed(1)}%</Text>
                  </View>
                  <View style={styles.holderLegendItem}>
                    <View style={[styles.holderDot, { backgroundColor: '#AF52DE' }]} />
                    <Text style={styles.holderLabel}>Instituciones</Text>
                    <Text style={styles.holderPercent}>{institution_percent.toFixed(1)}%</Text>
                  </View>
                  <View style={styles.holderLegendItem}>
                    <View style={[styles.holderDot, { backgroundColor: '#34C759' }]} />
                    <Text style={styles.holderLabel}>Público</Text>
                    <Text style={styles.holderPercent}>{public_percent.toFixed(1)}%</Text>
                  </View>
                </View>

                {/* ── Análisis de Riesgo Accionarial ── */}
                <View style={[
                  styles.riskContainer,
                  { backgroundColor: risk.bgColor, borderColor: risk.borderColor },
                ]}>
                  {/* Cabecera del riesgo */}
                  <View style={styles.riskHeader}>
                    <Text style={styles.riskEmoji}>{risk.emoji}</Text>
                    <Text style={[styles.riskTitle, { color: risk.color }]}>
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
                          { backgroundColor: insider_percent > 60 ? '#FF3B30' : insider_percent > 40 ? '#FF9500' : '#34C759' },
                        ]} />
                        <Text style={styles.riskIndicatorLabel}>Insiders</Text>
                      </View>
                      <View style={styles.riskIndicatorRight}>
                        <Text style={[
                          styles.riskIndicatorValue,
                          { color: insider_percent > 60 ? '#FF3B30' : insider_percent > 40 ? '#FF9500' : '#34C759' },
                        ]}>
                          {insider_percent.toFixed(1)}%
                        </Text>
                        <Text style={styles.riskIndicatorTag}>
                          {insider_percent > 60 ? '⚠️ Alto' : insider_percent > 40 ? '· Medio' : '✓ OK'}
                        </Text>
                      </View>
                    </View>

                    {/* Institucionales */}
                    <View style={styles.riskIndicatorRow}>
                      <View style={styles.riskIndicatorLeft}>
                        <View style={[
                          styles.riskDot,
                          { backgroundColor: institution_percent < 10 ? '#FF3B30' : institution_percent < 25 ? '#FF9500' : '#34C759' },
                        ]} />
                        <Text style={styles.riskIndicatorLabel}>Institucionales</Text>
                      </View>
                      <View style={styles.riskIndicatorRight}>
                        <Text style={[
                          styles.riskIndicatorValue,
                          { color: institution_percent < 10 ? '#FF3B30' : institution_percent < 25 ? '#FF9500' : '#34C759' },
                        ]}>
                          {institution_percent.toFixed(1)}%
                        </Text>
                        <Text style={styles.riskIndicatorTag}>
                          {institution_percent < 10 ? '⚠️ Bajo' : institution_percent < 25 ? '· Medio' : '✓ OK'}
                        </Text>
                      </View>
                    </View>

                    {/* Free Float */}
                    <View style={[styles.riskIndicatorRow, { borderBottomWidth: 0 }]}>
                      <View style={styles.riskIndicatorLeft}>
                        <View style={[
                          styles.riskDot,
                          { backgroundColor: public_percent < 20 ? '#FF3B30' : public_percent < 30 ? '#FF9500' : '#34C759' },
                        ]} />
                        <Text style={styles.riskIndicatorLabel}>Free Float</Text>
                      </View>
                      <View style={styles.riskIndicatorRight}>
                        <Text style={[
                          styles.riskIndicatorValue,
                          { color: public_percent < 20 ? '#FF3B30' : public_percent < 30 ? '#FF9500' : '#34C759' },
                        ]}>
                          {public_percent.toFixed(1)}%
                        </Text>
                        <Text style={styles.riskIndicatorTag}>
                          {public_percent < 20 ? '⚠️ Bajo' : public_percent < 30 ? '· Medio' : '✓ OK'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Disclaimer */}
                  <Text style={styles.riskDisclaimer}>
                    ⚠️ Mide riesgo de gobernanza y liquidez, no la calidad del negocio.
                  </Text>
                </View>

              </View>
            </View>
          );
        })()}

        {/* Top Institutional Holders */}
        {data.top_institutional_holders && data.top_institutional_holders.length > 0 && (
          <View style={styles.institutionalSection}>
            <Text style={styles.sectionTitle}>🏦 Top Holders Institucionales</Text>
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

        {/* TradingView Widget - Web only */}
        {Platform.OS === 'web' && (
          <View style={styles.tradingViewSection}>
            <View style={styles.tradingViewHeader}>
              <Text style={styles.sectionTitle}>📊 Gráfico TradingView — Velas Japonesas</Text>
              <TouchableOpacity
                style={[styles.tvThemeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setTvTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              >
                <Text style={styles.tvThemeBtnEmoji}>{tvTheme === 'dark' ? '☀️' : '🌙'}</Text>
                <Text style={[styles.tvThemeBtnText, { color: colors.textSecondary }]}>
                  {tvTheme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
                </Text>
              </TouchableOpacity>
            </View>

             

            <View style={[styles.tradingViewContainer, { borderColor: colors.border }]}>
              <iframe
                key={`tv-${data.ticker}-${tvTheme}`}
                src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${data.ticker}&interval=D&hidesidetoolbar=0&hidetoptoolbar=0&symboledit=1&saveimage=1&toolbarbg=${tvTheme === 'dark' ? '1c1c1e' : 'f1f3f6'}&studies=[]&theme=${tvTheme}&style=1&timezone=exchange&withdateranges=1&showpopupbutton=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=es&utm_source=localhost`}
                style={{ width: '100%', height: '500px', border: 'none', borderRadius: '12px' }}
                allowFullScreen
              />
            </View>
          </View>

         

        )}
     
        {/* Price Chart Section */}
        <View style={styles.chartSection}>
           

          <Text style={styles.sectionTitle}>Gráfico de Cotizaciones</Text>
          
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
            const sharpeColor = sharpe >= 1 ? '#34C759' : sharpe >= 0 ? '#FF9500' : '#FF3B30';
            const sharpeLabel = sharpe >= 2 ? 'Excelente' : sharpe >= 1 ? 'Bueno' : sharpe >= 0 ? 'Aceptable' : 'Negativo';

            return (
              <View style={styles.priceContainer}>
                <Text style={styles.currentPrice}>
                  ${chartData.current_price.toFixed(2)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
                  <View style={[styles.priceChangeContainer, { backgroundColor: stockReturn >= 0 ? '#34C75915' : '#FF3B3015' }]}>
                    <Ionicons name={stockReturn >= 0 ? 'trending-up' : 'trending-down'} size={16} color={stockReturn >= 0 ? '#34C759' : '#FF3B30'} />
                    <Text style={[styles.priceChangeText, { color: stockReturn >= 0 ? '#34C759' : '#FF3B30' }]}>
                      {data.ticker}: {stockReturn >= 0 ? '+' : ''}{stockReturn.toFixed(2)}%
                    </Text>
                  </View>
                  <View style={[styles.priceChangeContainer, { backgroundColor: sp500Return >= 0 ? '#FF950015' : '#FF3B3015' }]}>
                    <Ionicons name={sp500Return >= 0 ? 'trending-up' : 'trending-down'} size={16} color={sp500Return >= 0 ? '#FF9500' : '#FF3B30'} />
                    <Text style={[styles.priceChangeText, { color: sp500Return >= 0 ? '#FF9500' : '#FF3B30' }]}>
                      S&P 500: {sp500Return >= 0 ? '+' : ''}{sp500Return.toFixed(2)}%
                    </Text>
                  </View>
                  <View style={[styles.priceChangeContainer, { backgroundColor: alpha >= 0 ? '#34C75915' : '#FF3B3015' }]}>
                    <Ionicons name={alpha >= 0 ? 'star' : 'star-outline'} size={16} color={alpha >= 0 ? '#34C759' : '#FF3B30'} />
                    <Text style={[styles.priceChangeText, { color: alpha >= 0 ? '#34C759' : '#FF3B30', fontWeight: '700' }]}>
                      Alpha: {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}% {alpha >= 0 ? '✅' : '❌'}
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '48px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#007AFF' }} />
                <span style={{ fontSize: '12px', color: '#1D1D1F', fontWeight: '600' }}>{data.ticker}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#FF9500' }} />
                <span style={{ fontSize: '12px', color: '#1D1D1F', fontWeight: '600' }}>S&P 500</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#8E8E93', fontWeight: '500' }}>Período:</span>
              <select
                value={selectedPeriod}
                onChange={(e: any) => { setSelectedPeriod(e.target.value); fetchChartData(e.target.value); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #E0E0E0',
                  backgroundColor: '#F5F5F7',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#1D1D1F',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="1w">1 Semana</option>
                <option value="1m">1 Mes</option>
                <option value="3m">3 Meses</option>
                <option value="6m">6 Meses</option>
                <option value="1y">1 Año</option>
                <option value="5y">5 Años</option>
              </select>
            </div>
          </div>

          {loadingChart ? (
            <View style={styles.chartLoadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.chartLoadingText}>Cargando gráfico...</Text>
            </View>
          ) : chartData && chartData.chart_data && chartData.chart_data.length > 0 ? (
            <View style={[styles.chartContainer, { zIndex: 0 }]}>
              <LineChart
                key={selectedPeriod}
                pointerConfig={{}}
                data={chartData.chart_data.map((point: any, index: number) => ({
                  value: point.stock_value,
                  label: index % Math.ceil(chartData.chart_data.length / 6) === 0 ? new Date(point.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }) : '',
                }))}
                data2={chartData.chart_data.map((point: any) => ({
                  value: point.sp500_value,
                }))}
                height={440}
                width={screenWidth > 768 ? screenWidth - 308 : screenWidth - 32}
                spacing={Math.max(1, Math.floor((screenWidth > 768 ? screenWidth - 348 : screenWidth - 72) / chartData.chart_data.length))}
                initialSpacing={10}
                color1="#007AFF"
                color2="#FF9500"
                thickness1={2}
                thickness2={2}
                startFillColor1="#007AFF"
                startFillColor2="#FF9500"
                endFillColor1="#007AFF"
                endFillColor2="#FF9500"
                startOpacity={0.3}
                endOpacity={0.1}
                yAxisColor="#E0E0E0"
                xAxisColor="#E0E0E0"
                yAxisTextStyle={{ color: '#6E6E73', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#6E6E73', fontSize: 10 }}
                hideDataPoints
                curved
                areaChart
                hideRules
                yAxisOffset={100}
                noOfSections={4}
                maxValue={Math.max(
                  ...chartData.chart_data.map((p: any) => Math.max(p.stock_value, p.sp500_value))
                ) * 1.1}
             
              />
              <View style={styles.chartLegend} />
            </View>
          ) : (
            <View style={styles.chartErrorContainer}>
              <Ionicons name="alert-circle-outline" size={40} color="#8E8E93" />
              <Text style={styles.chartErrorText}>No se pudo cargar el gráfico</Text>
            </View>
          )}
        </View>

            {/* Indicadores avanzados */}                
          <IndicatorsChartCard ticker={data.ticker} />
         
        {/* Recommendation Card */}
        <View style={[styles.recommendationCard, { backgroundColor: getRecommendationColor(data.recommendation) + '15' }]}>
          <View style={styles.recommendationHeader}>
            <Text style={styles.recommendationLabel}>Recomendación</Text>
            <View style={[styles.recommendationBadge, { backgroundColor: getRecommendationColor(data.recommendation) }]}>
              <Text style={styles.recommendationText}>{data.recommendation}</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{data.favorable_percentage.toFixed(1)}%</Text>
              <Text style={styles.statLabel}>Métricas Favorables</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: getRiskColor(data.risk_level) }]}>
                {data.risk_level}
              </Text>
              <Text style={styles.statLabel}>Nivel de Riesgo</Text>
            </View>
          </View>
          <View style={styles.metricsBar}>
            <View style={[styles.metricsBarFill, { width: `${data.favorable_percentage}%`, backgroundColor: getRecommendationColor(data.recommendation) }]} />
          </View>
          <View style={styles.metricsLegend}>
            <Text style={styles.metricsLegendText}>
              {data.favorable_metrics} de {data.total_metrics} métricas son favorables
            </Text>
          </View>
        </View>

        {/* Summary Flags */}
        {data.summary_flags && (
          <View style={styles.flagsSection}>
            <Text style={styles.sectionTitle}>Indicadores Clave</Text>
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

        {/* Stock News Section */}
        <View style={styles.newsSection}>
          <View style={styles.newsSectionHeader}>
            <Ionicons name="newspaper" size={22} color="#007AFF" />
            <Text style={styles.sectionTitle}>Noticias de {data.ticker}</Text>
          </View>
          {loadingNews ? (
            <View style={styles.newsLoadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.newsLoadingText}>Cargando noticias...</Text>
            </View>
          ) : stockNews.length === 0 ? (
            <View style={styles.noNewsContainer}>
              <Ionicons name="newspaper-outline" size={36} color="#8E8E93" />
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
                <Ionicons name="open-outline" size={18} color="#C7C7CC" style={styles.newsChevron} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Technical Analysis Section */}
        <View style={styles.technicalSection}>
          <Text style={styles.sectionTitle}>📈 Análisis Técnico</Text>
          {loadingTechnical ? (
            <View style={styles.technicalLoadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.technicalLoadingText}>Cargando análisis técnico...</Text>
            </View>
          ) : technicalData ? (
            <>
              <View style={[
                styles.technicalSummaryCard,
                { backgroundColor: technicalData.technical_recommendation === 'COMPRAR' ? '#34C75915' : 
                                  technicalData.technical_recommendation === 'VENDER' ? '#FF3B3015' : '#FF950015' }
              ]}>
                <View style={styles.technicalSummaryRow}>
                  <View style={styles.technicalSummaryItem}>
                    <Text style={styles.technicalSummaryLabel}>Score Técnico</Text>
                    <Text style={[styles.technicalSummaryValue, { color: technicalData.technical_score >= 65 ? '#34C759' : technicalData.technical_score <= 35 ? '#FF3B30' : '#FF9500' }]}>
                      {technicalData.technical_score.toFixed(0)}/100
                    </Text>
                  </View>
                  <View style={styles.technicalSummaryDivider} />
                  <View style={styles.technicalSummaryItem}>
                    <Text style={styles.technicalSummaryLabel}>Señal</Text>
                    <View style={[styles.technicalSignalBadge, { backgroundColor: technicalData.technical_recommendation === 'COMPRAR' ? '#34C759' : technicalData.technical_recommendation === 'VENDER' ? '#FF3B30' : '#FF9500' }]}>
                      <Text style={styles.technicalSignalText}>{technicalData.technical_recommendation}</Text>
                    </View>
                  </View>
                  <View style={styles.technicalSummaryDivider} />
                  <View style={styles.technicalSummaryItem}>
                    <Text style={styles.technicalSummaryLabel}>Tendencia</Text>
                    <View style={styles.trendIndicator}>
                      <Ionicons name={technicalData.trend_direction === 'ALCISTA' ? 'trending-up' : technicalData.trend_direction === 'BAJISTA' ? 'trending-down' : 'remove'} size={20} color={technicalData.trend_direction === 'ALCISTA' ? '#34C759' : technicalData.trend_direction === 'BAJISTA' ? '#FF3B30' : '#FF9500'} />
                      <Text style={[styles.trendText, { color: technicalData.trend_direction === 'ALCISTA' ? '#34C759' : technicalData.trend_direction === 'BAJISTA' ? '#FF3B30' : '#FF9500' }]}>
                        {technicalData.trend_direction}
                      </Text>
                    </View>
                  </View>
                </View>
                {(technicalData.golden_cross || technicalData.death_cross) && (
                  <View style={[styles.crossAlert, { backgroundColor: technicalData.golden_cross ? '#34C75930' : '#FF3B3030' }]}>
                    <Ionicons name={technicalData.golden_cross ? 'star' : 'warning'} size={16} color={technicalData.golden_cross ? '#34C759' : '#FF3B30'} />
                    <Text style={[styles.crossAlertText, { color: technicalData.golden_cross ? '#34C759' : '#FF3B30' }]}>
                      {technicalData.golden_cross ? '✨ Golden Cross Detectado - Señal Alcista Fuerte' : '⚠️ Death Cross Detectado - Señal Bajista Fuerte'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Fibonacci */}
              <View style={styles.technicalCard}>
                <TouchableOpacity style={styles.technicalCardHeader} onPress={() => toggleTechnicalSection('fibonacci')}>
                  <View style={styles.technicalCardTitleRow}>
                    <Text style={styles.technicalCardIcon}>📊</Text>
                    <Text style={styles.technicalCardTitle}>Retrocesos de Fibonacci</Text>
                  </View>
                  <Ionicons name={expandedTechnical.has('fibonacci') ? 'chevron-up' : 'chevron-down'} size={24} color="#8E8E93" />
                </TouchableOpacity>
                {expandedTechnical.has('fibonacci') && (
                  <View style={styles.technicalCardContent}>
                    <View style={styles.fibonacciInfo}>
                      <View style={styles.fibonacciInfoRow}><Text style={styles.fibonacciInfoLabel}>Máximo (Swing High):</Text><Text style={styles.fibonacciInfoValue}>${technicalData.swing_high.toFixed(2)}</Text></View>
                      <View style={styles.fibonacciInfoRow}><Text style={styles.fibonacciInfoLabel}>Mínimo (Swing Low):</Text><Text style={styles.fibonacciInfoValue}>${technicalData.swing_low.toFixed(2)}</Text></View>
                      <View style={styles.fibonacciInfoRow}><Text style={styles.fibonacciInfoLabel}>Zona Actual:</Text><Text style={[styles.fibonacciInfoValue, { color: '#007AFF' }]}>{technicalData.current_fibonacci_zone}</Text></View>
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
                          <Text style={[styles.levelsTableCell, { flex: 1, color: level.distance_percent >= 0 ? '#34C759' : '#FF3B30' }]}>{level.distance_percent >= 0 ? '+' : ''}{level.distance_percent.toFixed(1)}%</Text>
                          <Text style={[styles.levelsTableCell, { flex: 1, color: level.is_support ? '#34C759' : '#FF3B30' }]}>{level.is_support ? 'Soporte' : 'Resistencia'}</Text>
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
                    <Text style={styles.technicalCardIcon}>📉</Text>
                    <Text style={styles.technicalCardTitle}>Medias Móviles</Text>
                  </View>
                  <View style={styles.maSignalBadge}>
                    <Text style={[styles.maSignalText, { color: technicalData.ma_trend_signal === 'COMPRAR' ? '#34C759' : technicalData.ma_trend_signal === 'VENDER' ? '#FF3B30' : '#FF9500' }]}>{technicalData.ma_trend_signal}</Text>
                    <Ionicons name={expandedTechnical.has('ma') ? 'chevron-up' : 'chevron-down'} size={24} color="#8E8E93" />
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
                            <View style={[styles.maCardSignal, { backgroundColor: ma.signal === 'ALCISTA' ? '#34C75920' : ma.signal === 'BAJISTA' ? '#FF3B3020' : '#FF950020' }]}>
                              <Ionicons name={ma.signal === 'ALCISTA' ? 'arrow-up' : ma.signal === 'BAJISTA' ? 'arrow-down' : 'remove'} size={14} color={ma.signal === 'ALCISTA' ? '#34C759' : ma.signal === 'BAJISTA' ? '#FF3B30' : '#FF9500'} />
                              <Text style={[styles.maCardSignalText, { color: ma.signal === 'ALCISTA' ? '#34C759' : ma.signal === 'BAJISTA' ? '#FF3B30' : '#FF9500' }]}>{ma.signal}</Text>
                            </View>
                          </View>
                          <Text style={styles.maCardValue}>${ma.value.toFixed(2)}</Text>
                          <View style={styles.maCardFooter}>
                            <Text style={styles.maCardPosition}>{ma.price_position}</Text>
                            <Text style={[styles.maCardDistance, { color: ma.distance_percent >= 0 ? '#34C759' : '#FF3B30' }]}>{ma.distance_percent >= 0 ? '+' : ''}{ma.distance_percent.toFixed(1)}%</Text>
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
                    <Text style={styles.technicalCardIcon}>🎯</Text>
                    <Text style={styles.technicalCardTitle}>Puntos Pivote Camarilla</Text>
                  </View>
                  <Ionicons name={expandedTechnical.has('camarilla') ? 'chevron-up' : 'chevron-down'} size={24} color="#8E8E93" />
                </TouchableOpacity>
                {expandedTechnical.has('camarilla') && (
                  <View style={styles.technicalCardContent}>
                    <View style={styles.fibonacciInfo}>
                      <View style={styles.fibonacciInfoRow}><Text style={styles.fibonacciInfoLabel}>Zona Actual:</Text><Text style={[styles.fibonacciInfoValue, { color: '#007AFF' }]}>{technicalData.current_camarilla_zone}</Text></View>
                    </View>
                    <View style={styles.interpretationBox}><Text style={styles.interpretationText}>{technicalData.camarilla_interpretation}</Text></View>
                    <View style={styles.camarillaContainer}>
                      <Text style={styles.camarillaGroupTitle}>Resistencias</Text>
                      {technicalData.camarilla_pivots.filter(p => p.level.startsWith('R')).sort((a, b) => b.price - a.price).map((pivot, idx) => (
                        <View key={idx} style={[styles.camarillaRow, (pivot.level === 'R3' || pivot.level === 'R4') && styles.camarillaRowImportant]}>
                          <View style={styles.camarillaLevelBadge}><Text style={[styles.camarillaLevelText, { color: pivot.level === 'R4' ? '#FF3B30' : pivot.level === 'R3' ? '#FF6B35' : '#FF9500' }]}>{pivot.level}</Text></View>
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
                          <View style={styles.camarillaLevelBadge}><Text style={[styles.camarillaLevelText, { color: pivot.level === 'S4' ? '#34C759' : pivot.level === 'S3' ? '#32D74B' : '#30D158' }]}>{pivot.level}</Text></View>
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
                <Text style={styles.keyLevelsTitle}>📍 Niveles Clave</Text>
                <View style={styles.keyLevelsGrid}>
                  <View style={styles.keyLevelItem}><Text style={styles.keyLevelLabel}>Soporte Fib 38.2%</Text><Text style={styles.keyLevelValue}>${technicalData.key_levels.soporte_fibonacci_382.toFixed(2)}</Text></View>
                  <View style={styles.keyLevelItem}><Text style={styles.keyLevelLabel}>Soporte Fib 61.8%</Text><Text style={styles.keyLevelValue}>${technicalData.key_levels.soporte_fibonacci_618.toFixed(2)}</Text></View>
                  <View style={styles.keyLevelItem}><Text style={styles.keyLevelLabel}>Resistencia R3</Text><Text style={[styles.keyLevelValue, { color: '#FF3B30' }]}>${technicalData.key_levels.camarilla_r3.toFixed(2)}</Text></View>
                  <View style={styles.keyLevelItem}><Text style={styles.keyLevelLabel}>Soporte S3</Text><Text style={[styles.keyLevelValue, { color: '#34C759' }]}>${technicalData.key_levels.camarilla_s3.toFixed(2)}</Text></View>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.technicalErrorContainer}>
              <Ionicons name="alert-circle-outline" size={40} color="#8E8E93" />
              <Text style={styles.technicalErrorText}>No se pudo cargar el análisis técnico</Text>
            </View>
          )}
        </View>




        {/* Ratio Categories */}
        <View style={styles.ratiosSection}>
          <Text style={styles.sectionTitle}>Ratios Financieros</Text>

          {/* ── Radar Chart ── */}
          <FinancialRadarChart ratios={data.ratios}  ticker={data.ticker}  currentPrice={data.metadata?.current_price} />


          {data.ratios.map((category) => (
            <View key={category.category} style={styles.categoryCard}>
              <TouchableOpacity style={styles.categoryHeader} onPress={() => toggleCategory(category.category)}>
                <Text style={styles.categoryTitle}>{category.category}</Text>
                <View style={styles.categoryHeaderRight}>
                  <Text style={styles.categoryCount}>
                    {category.metrics.filter((m) => m.passed).length}/{category.metrics.length}
                  </Text>
                  <Ionicons name={expandedCategories.has(category.category) ? 'chevron-up' : 'chevron-down'} size={24} color="#8E8E93" />
                </View>
              </TouchableOpacity>
              {expandedCategories.has(category.category) && (
                <View style={styles.metricsContainer}>
                  {category.metrics.map((metric, index) => (
                    <View key={index} style={styles.metricItem}>
                      <View style={styles.metricHeader}>
                        <View style={styles.metricNameContainer}>
                          <Ionicons name={metric.passed ? 'checkmark-circle' : 'close-circle'} size={20} color={metric.passed ? '#34C759' : '#FF3B30'} />
                          <Text style={styles.metricName}>{metric.name}</Text>
                        </View>
                        <Text style={[styles.metricValue, { color: metric.passed ? '#34C759' : '#FF3B30' }]}>{metric.display_value}</Text>
                      </View>
                      <Text style={styles.metricThreshold}>Umbral: {metric.threshold}</Text>
                      <Text style={styles.metricInterpretation}>{metric.interpretation}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
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
        <Ionicons name="sparkles" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={showAIChat} animationType="slide">
        <AIAssistant analysisData={aiAnalysisData} onClose={() => setShowAIChat(false)} colors={colors} />
      </Modal>
    </View>
  );
}

function FlagItem({ icon, label, passed }: { icon: any; label: string; passed: boolean }) {
  return (
    <View style={styles.flagItem}>
      <View style={[styles.flagIcon, { backgroundColor: passed ? '#34C75915' : '#FF3B3015' }]}>
        <Ionicons name={icon} size={20} color={passed ? '#34C759' : '#FF3B30'} />
      </View>
      <Text style={styles.flagLabel}>{label}</Text>
      <Ionicons name={passed ? 'checkmark-circle' : 'close-circle'} size={16} color={passed ? '#34C759' : '#FF3B30'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  scrollContent: { paddingBottom: 40 },
  header: { padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  backButtonText: { marginLeft: 8, fontSize: 16, color: '#007AFF', fontWeight: '500' },
  companySection: { padding: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  companyTicker: { fontSize: 24, fontWeight: 'bold', color: '#007AFF', marginBottom: 4 },
  companyName: { fontSize: 18, color: '#1D1D1F', marginBottom: 8 },
  metadataRow: { flexDirection: 'row', flexWrap: 'wrap' },
  metadataText: { fontSize: 14, color: '#6E6E73' },
  recommendationCard: { margin: 16, padding: 20, borderRadius: 16 },
  recommendationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  recommendationLabel: { fontSize: 16, color: '#6E6E73', fontWeight: '500' },
  recommendationBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  recommendationText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#1D1D1F', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#6E6E73', textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: '#E0E0E0', marginHorizontal: 16 },
  metricsBar: { height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  metricsBarFill: { height: '100%', borderRadius: 4 },
  metricsLegend: { alignItems: 'center' },
  metricsLegendText: { fontSize: 12, color: '#6E6E73' },
  flagsSection: { margin: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#1D1D1F', marginBottom: 12 },
  flagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flagItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6, borderWidth: 1, borderColor: '#E0E0E0' },
  flagIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flagLabel: { fontSize: 12, color: '#1D1D1F', fontWeight: '500' },
  ratiosSection: { margin: 16 },
  categoryCard: { backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  categoryTitle: { fontSize: 18, fontWeight: '600', color: '#1D1D1F' },
  categoryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryCount: { fontSize: 14, color: '#6E6E73', fontWeight: '500' },
  metricsContainer: { borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  metricItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F5F5F7' },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  metricNameContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  metricName: { fontSize: 15, fontWeight: '500', color: '#1D1D1F', flex: 1 },
  metricValue: { fontSize: 16, fontWeight: 'bold' },
  metricThreshold: { fontSize: 12, color: '#8E8E93', marginBottom: 4 },
  metricInterpretation: { fontSize: 12, color: '#6E6E73', fontStyle: 'italic' },
  tradingViewSection: { marginHorizontal: 16, marginBottom: 16 },
  tradingViewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tvThemeBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, gap: 6 },
  tvThemeBtnEmoji: { fontSize: 14 },
  tvThemeBtnText: { fontSize: 12, fontWeight: '600' },
  tradingViewContainer: { borderRadius: 12, overflow: 'hidden', height: 500 },
  chartSection: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, minHeight: 580 },
  priceContainer: { alignItems: 'center', marginBottom: 16 },
  currentPrice: { fontSize: 36, fontWeight: 'bold', color: '#1D1D1F', marginBottom: 8 },
  priceChangeContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 4 },
  priceChangeText: { fontSize: 14, fontWeight: '600' },
  chartLoadingContainer: { height: 220, justifyContent: 'center', alignItems: 'center' },
  chartLoadingText: { marginTop: 12, fontSize: 14, color: '#6E6E73' },
  chartContainer: { marginTop: 8, height: 500, justifyContent: 'center' },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, gap: 24 },
  chartErrorContainer: { height: 220, justifyContent: 'center', alignItems: 'center' },
  chartErrorText: { marginTop: 12, fontSize: 14, color: '#8E8E93' },
  aiFab: { position: 'absolute', right: 20, bottom: 30, width: 56, height: 56, borderRadius: 28, backgroundColor: '#AF52DE', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },

  // ── Shareholder Risk ──
  riskContainer: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskEmoji: {
    fontSize: 18,
  },
  riskTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  riskDescription: {
    fontSize: 13,
    color: '#3C3C43',
    lineHeight: 18,
  },
  riskIndicators: {
    backgroundColor: '#00000008',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  riskIndicatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#00000010',
  },
  riskIndicatorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  riskIndicatorLabel: {
    fontSize: 13,
    color: '#3C3C43',
    fontWeight: '500',
  },
  riskIndicatorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskIndicatorValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  riskIndicatorTag: {
    fontSize: 11,
    color: '#6E6E73',
    minWidth: 60,
    textAlign: 'right',
  },
  riskDisclaimer: {
    fontSize: 11,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Technical Analysis
  technicalSection: { margin: 16 },
  technicalLoadingContainer: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 40, alignItems: 'center' },
  technicalLoadingText: { marginTop: 12, fontSize: 14, color: '#6E6E73' },
  technicalErrorContainer: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 40, alignItems: 'center' },
  technicalErrorText: { marginTop: 12, fontSize: 14, color: '#8E8E93' },
  technicalSummaryCard: { borderRadius: 16, padding: 16, marginBottom: 12 },
  technicalSummaryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  technicalSummaryItem: { alignItems: 'center', flex: 1 },
  technicalSummaryLabel: { fontSize: 12, color: '#6E6E73', marginBottom: 4 },
  technicalSummaryValue: { fontSize: 24, fontWeight: 'bold' },
  technicalSummaryDivider: { width: 1, height: 40, backgroundColor: '#E0E0E0' },
  technicalSignalBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  technicalSignalText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  trendIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendText: { fontSize: 12, fontWeight: '600' },
  crossAlert: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 8 },
  crossAlertText: { fontSize: 12, fontWeight: '500', flex: 1 },
  technicalCard: { backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 12, overflow: 'hidden' },
  technicalCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  technicalCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  technicalCardIcon: { fontSize: 20 },
  technicalCardTitle: { fontSize: 16, fontWeight: '600', color: '#1D1D1F' },
  technicalCardContent: { borderTopWidth: 1, borderTopColor: '#E0E0E0', padding: 16 },
  fibonacciInfo: { backgroundColor: '#F5F5F7', borderRadius: 8, padding: 12, marginBottom: 12 },
  fibonacciInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  fibonacciInfoLabel: { fontSize: 13, color: '#6E6E73' },
  fibonacciInfoValue: { fontSize: 14, fontWeight: '600', color: '#1D1D1F' },
  interpretationBox: { backgroundColor: '#007AFF10', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#007AFF' },
  interpretationText: { fontSize: 13, color: '#1D1D1F', lineHeight: 18 },
  levelsTable: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E0E0' },
  levelsTableHeader: { flexDirection: 'row', backgroundColor: '#F5F5F7', paddingVertical: 10, paddingHorizontal: 12 },
  levelsTableHeaderText: { fontSize: 12, fontWeight: '600', color: '#6E6E73' },
  levelsTableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F7' },
  levelsTableRowHighlight: { backgroundColor: '#007AFF10' },
  levelsTableCell: { fontSize: 13, color: '#1D1D1F' },
  maSignalBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  maSignalText: { fontSize: 14, fontWeight: '600' },
  maCardsContainer: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  maCard: { flex: 1, backgroundColor: '#F5F5F7', borderRadius: 12, padding: 12 },
  maCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  maCardTitle: { fontSize: 14, fontWeight: 'bold', color: '#1D1D1F' },
  maCardSignal: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  maCardSignalText: { fontSize: 10, fontWeight: '600' },
  maCardValue: { fontSize: 16, fontWeight: 'bold', color: '#007AFF', marginBottom: 4 },
  maCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  maCardPosition: { fontSize: 10, color: '#6E6E73' },
  maCardDistance: { fontSize: 11, fontWeight: '600' },
  camarillaContainer: { marginTop: 4 },
  camarillaGroupTitle: { fontSize: 14, fontWeight: '600', color: '#6E6E73', marginTop: 8, marginBottom: 8, paddingLeft: 4 },
  camarillaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F7', gap: 12 },
  camarillaRowImportant: { backgroundColor: '#FF3B3010', borderRadius: 8, borderBottomWidth: 0, marginBottom: 4 },
  camarillaRowImportantSupport: { backgroundColor: '#34C75910', borderRadius: 8, borderBottomWidth: 0, marginBottom: 4 },
  camarillaLevelBadge: { width: 36, alignItems: 'center' },
  camarillaLevelText: { fontSize: 14, fontWeight: 'bold' },
  camarillaPrice: { fontSize: 15, fontWeight: '600', color: '#1D1D1F', width: 80 },
  camarillaSignificance: { flex: 1, fontSize: 11, color: '#6E6E73' },
  pivotPointContainer: { marginVertical: 12 },
  pivotPointRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#007AFF15', borderRadius: 12, padding: 12, gap: 12 },
  pivotPointBadge: { backgroundColor: '#007AFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  pivotPointText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  pivotPointPrice: { fontSize: 18, fontWeight: 'bold', color: '#007AFF' },
  pivotPointLabel: { flex: 1, fontSize: 12, color: '#6E6E73' },
  keyLevelsCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16 },
  keyLevelsTitle: { fontSize: 16, fontWeight: '600', color: '#1D1D1F', marginBottom: 12 },
  keyLevelsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keyLevelItem: { flex: 1, minWidth: '45%', backgroundColor: '#F5F5F7', borderRadius: 8, padding: 12 },
  keyLevelLabel: { fontSize: 11, color: '#6E6E73', marginBottom: 4 },
  keyLevelValue: { fontSize: 16, fontWeight: 'bold', color: '#007AFF' },
  newsSection: { margin: 16 },
  newsSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  newsLoadingContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 30, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  newsLoadingText: { marginLeft: 10, fontSize: 14, color: '#6E6E73' },
  noNewsContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 30, alignItems: 'center' },
  noNewsText: { marginTop: 8, fontSize: 14, color: '#8E8E93' },
  newsCard: { backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 10, padding: 12, flexDirection: 'row', alignItems: 'center' },
  newsCardContent: { flex: 1, flexDirection: 'row' },
  newsThumbnail: { width: 60, height: 60, borderRadius: 8, marginRight: 10, backgroundColor: '#F5F5F7' },
  newsTextContainer: { flex: 1, justifyContent: 'center' },
  newsTextContainerFull: { paddingRight: 8 },
  newsTitle: { fontSize: 13, fontWeight: '600', color: '#1D1D1F', lineHeight: 17, marginBottom: 4 },
  newsSummary: { fontSize: 11, color: '#6E6E73', lineHeight: 14, marginBottom: 4 },
  newsMetaContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  newsPublisher: { fontSize: 10, color: '#007AFF', fontWeight: '500' },
  newsDate: { fontSize: 10, color: '#8E8E93' },
  newsChevron: { marginLeft: 8 },
  keyMetricsSection: { margin: 16 },
  keyMetricsGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, gap: 8 },
  keyMetricItem: { width: '30%', alignItems: 'center', padding: 10, backgroundColor: '#F5F5F7', borderRadius: 12 },
  keyMetricLabel: { fontSize: 11, color: '#6E6E73', marginBottom: 4 },
  keyMetricValue: { fontSize: 16, fontWeight: 'bold', color: '#007AFF' },
  profileSection: { margin: 16 },
  profileCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16 },
  profileInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  profileInfoLabel: { fontSize: 13, color: '#6E6E73', width: 70 },
  profileInfoValue: { fontSize: 14, color: '#1D1D1F', flex: 1 },
  profileSummary: { fontSize: 13, color: '#6E6E73', lineHeight: 20, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  analystsSection: { margin: 16 },
  analystsCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16 },
  analystsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  analystBox: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 12 },
  analystCount: { fontSize: 22, fontWeight: 'bold' },
  analystLabel: { fontSize: 9, color: '#6E6E73', marginTop: 2, textAlign: 'center' },
  holdersSection: { margin: 16 },
  holdersCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16 },
  holdersBarContainer: { flexDirection: 'row', height: 20, borderRadius: 10, overflow: 'hidden', marginBottom: 16 },
  holdersBar: { height: '100%' },
  holdersLegend: { flexDirection: 'row', justifyContent: 'space-around' },
  holderLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  holderDot: { width: 10, height: 10, borderRadius: 5 },
  holderLabel: { fontSize: 12, color: '#6E6E73' },
  holderPercent: { fontSize: 13, fontWeight: '600', color: '#1D1D1F' },
  institutionalSection: { margin: 16 },
  institutionalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16 },
  institutionalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F7' },
  institutionalRank: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#007AFF15', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  institutionalRankText: { fontSize: 12, fontWeight: 'bold', color: '#007AFF' },
  institutionalInfo: { flex: 1 },
  institutionalName: { fontSize: 14, fontWeight: '600', color: '#1D1D1F' },
  institutionalShares: { fontSize: 11, color: '#6E6E73' },
  institutionalPercent: { fontSize: 16, fontWeight: 'bold', color: '#007AFF' },
});
