import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import axios from 'axios';
import AIAssistant from '../../components/AIAssistant';
import { useTheme } from '../../contexts/ThemeContext';

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
}

interface ResultsScreenProps {
  data: AnalysisData;
  onBack: () => void;
}

export default function ResultsScreen({ data, onBack }: ResultsScreenProps) {
  const { colors } = useTheme();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([data.ratios[0]?.category]));
  const [chartData, setChartData] = useState<any>(null);
  const [loadingChart, setLoadingChart] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('1y');
  const [showAIChat, setShowAIChat] = useState(false);

  // Prepare analysis data for AI
  const aiAnalysisData = {
    ticker: data.ticker,
    company_name: data.company_name,
    recommendation: data.recommendation,
    favorable_percentage: data.favorable_percentage,
    current_price: data.metadata?.current_price,
    ratios: data.ratios.reduce((acc: any, cat) => {
      cat.metrics.forEach(m => {
        acc[m.name.toLowerCase().replace(/\s+/g, '_')] = {
          value: m.value,
          is_favorable: m.passed,
          threshold: m.threshold,
        };
      });
      return acc;
    }, {}),
  };

  useEffect(() => {
    fetchChartData(selectedPeriod);
  }, [selectedPeriod]);

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
      case 'COMPRAR':
        return '#34C759';
      case 'MANTENER':
        return '#FF9500';
      case 'VENDER':
        return '#FF3B30';
      default:
        return '#8E8E93';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Bajo':
        return '#34C759';
      case 'Moderado':
        return '#FF9500';
      case 'Alto':
        return '#FF3B30';
      default:
        return '#8E8E93';
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>

        {/* Company Info */}
        <View style={styles.companySection}>
          <Text style={styles.companyTicker}>{data.ticker}</Text>
          <Text style={styles.companyName}>{data.company_name}</Text>
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

        {/* Price Chart Section */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>Gráfico de Cotizaciones</Text>
          
          {/* Price Display */}
          {chartData && (
            <View style={styles.priceContainer}>
              <Text style={styles.currentPrice}>
                ${chartData.current_price.toFixed(2)}
              </Text>
              <View style={[
                styles.priceChangeContainer,
                { backgroundColor: chartData.price_change >= 0 ? '#34C75915' : '#FF3B3015' }
              ]}>
                <Ionicons 
                  name={chartData.price_change >= 0 ? 'trending-up' : 'trending-down'} 
                  size={16} 
                  color={chartData.price_change >= 0 ? '#34C759' : '#FF3B30'} 
                />
                <Text style={[
                  styles.priceChangeText,
                  { color: chartData.price_change >= 0 ? '#34C759' : '#FF3B30' }
                ]}>
                  ${Math.abs(chartData.price_change).toFixed(2)} ({chartData.price_change_percent >= 0 ? '+' : ''}{chartData.price_change_percent.toFixed(2)}%)
                </Text>
              </View>
            </View>
          )}

          {/* Period Selector */}
          <View style={styles.periodSelector}>
            {['1w', '1m', '3m', '6m', '1y', '5y'].map((period) => (
              <TouchableOpacity
                key={period}
                style={[
                  styles.periodButton,
                  selectedPeriod === period && styles.periodButtonActive
                ]}
                onPress={() => setSelectedPeriod(period)}
              >
                <Text style={[
                  styles.periodButtonText,
                  selectedPeriod === period && styles.periodButtonTextActive
                ]}>
                  {period.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chart */}
          {loadingChart ? (
            <View style={styles.chartLoadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.chartLoadingText}>Cargando gráfico...</Text>
            </View>
          ) : chartData && chartData.chart_data && chartData.chart_data.length > 0 ? (
            <View style={styles.chartContainer}>
              <LineChart
                data={chartData.chart_data.map((point: any, index: number) => ({
                  value: point.stock_value,
                  label: index % 10 === 0 ? new Date(point.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }) : '',
                }))}
                data2={chartData.chart_data.map((point: any) => ({
                  value: point.sp500_value,
                }))}
                height={220}
                width={screenWidth - 60}
                spacing={chartData.chart_data.length > 50 ? 2 : 5}
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
                minValue={Math.min(
                  ...chartData.chart_data.map((p: any) => Math.min(p.stock_value, p.sp500_value))
                ) * 0.9}
              />
              
              {/* Legend */}
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#007AFF' }]} />
                  <Text style={styles.legendText}>{data.ticker}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#FF9500' }]} />
                  <Text style={styles.legendText}>S&P 500</Text>
                </View>
              </View>
              
              <Text style={styles.chartNote}>
                * Rendimiento normalizado (inicio = 100)
              </Text>
            </View>
          ) : (
            <View style={styles.chartErrorContainer}>
              <Ionicons name="alert-circle-outline" size={40} color="#8E8E93" />
              <Text style={styles.chartErrorText}>No se pudo cargar el gráfico</Text>
            </View>
          )}
        </View>

        {/* Recommendation Card */}
        <View
          style={[
            styles.recommendationCard,
            { backgroundColor: getRecommendationColor(data.recommendation) + '15' },
          ]}
        >
          <View style={styles.recommendationHeader}>
            <Text style={styles.recommendationLabel}>Recomendación</Text>
            <View
              style={[
                styles.recommendationBadge,
                { backgroundColor: getRecommendationColor(data.recommendation) },
              ]}
            >
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
            <View
              style={[
                styles.metricsBarFill,
                {
                  width: `${data.favorable_percentage}%`,
                  backgroundColor: getRecommendationColor(data.recommendation),
                },
              ]}
            />
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
              <FlagItem
                icon="trending-up"
                label="Rentable"
                passed={data.summary_flags.profitable}
              />
              <FlagItem
                icon="cash"
                label="FCF Positivo"
                passed={data.summary_flags.positive_fcf}
              />
              <FlagItem
                icon="shield-checkmark"
                label="Deuda Baja"
                passed={data.summary_flags.low_debt}
              />
              <FlagItem
                icon="bar-chart"
                label="Buenos Márgenes"
                passed={data.summary_flags.good_margins}
              />
              <FlagItem
                icon="water"
                label="Liquidez Sana"
                passed={data.summary_flags.healthy_liquidity}
              />
              <FlagItem
                icon="star"
                label="ROE Fuerte"
                passed={data.summary_flags.strong_roe}
              />
            </View>
          </View>
        )}

        {/* Ratio Categories */}
        <View style={styles.ratiosSection}>
          <Text style={styles.sectionTitle}>Ratios Financieros</Text>
          {data.ratios.map((category) => (
            <View key={category.category} style={styles.categoryCard}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategory(category.category)}
              >
                <Text style={styles.categoryTitle}>{category.category}</Text>
                <View style={styles.categoryHeaderRight}>
                  <Text style={styles.categoryCount}>
                    {category.metrics.filter((m) => m.passed).length}/{category.metrics.length}
                  </Text>
                  <Ionicons
                    name={expandedCategories.has(category.category) ? 'chevron-up' : 'chevron-down'}
                    size={24}
                    color="#8E8E93"
                  />
                </View>
              </TouchableOpacity>

              {expandedCategories.has(category.category) && (
                <View style={styles.metricsContainer}>
                  {category.metrics.map((metric, index) => (
                    <View key={index} style={styles.metricItem}>
                      <View style={styles.metricHeader}>
                        <View style={styles.metricNameContainer}>
                          <Ionicons
                            name={metric.passed ? 'checkmark-circle' : 'close-circle'}
                            size={20}
                            color={metric.passed ? '#34C759' : '#FF3B30'}
                          />
                          <Text style={styles.metricName}>{metric.name}</Text>
                        </View>
                        <Text style={[styles.metricValue, { color: metric.passed ? '#34C759' : '#FF3B30' }]}>
                          {metric.display_value}
                        </Text>
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
      </ScrollView>

      {/* AI Assistant FAB */}
      <TouchableOpacity
        style={styles.aiFab}
        onPress={() => setShowAIChat(true)}
      >
        <Ionicons name="sparkles" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* AI Chat Modal */}
      <Modal visible={showAIChat} animationType="slide">
        <AIAssistant
          analysisData={aiAnalysisData}
          onClose={() => setShowAIChat(false)}
          colors={colors}
        />
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
      <Ionicons
        name={passed ? 'checkmark-circle' : 'close-circle'}
        size={16}
        color={passed ? '#34C759' : '#FF3B30'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  companySection: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  companyTicker: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  companyName: {
    fontSize: 18,
    color: '#1D1D1F',
    marginBottom: 8,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metadataText: {
    fontSize: 14,
    color: '#6E6E73',
  },
  recommendationCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  recommendationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  recommendationLabel: {
    fontSize: 16,
    color: '#6E6E73',
    fontWeight: '500',
  },
  recommendationBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recommendationText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6E6E73',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 16,
  },
  metricsBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  metricsBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  metricsLegend: {
    alignItems: 'center',
  },
  metricsLegendText: {
    fontSize: 12,
    color: '#6E6E73',
  },
  flagsSection: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 12,
  },
  flagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  flagIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagLabel: {
    fontSize: 12,
    color: '#1D1D1F',
    fontWeight: '500',
  },
  ratiosSection: {
    margin: 16,
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  categoryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryCount: {
    fontSize: 14,
    color: '#6E6E73',
    fontWeight: '500',
  },
  metricsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  metricItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F7',
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  metricName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1D1D1F',
    flex: 1,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  metricThreshold: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  metricInterpretation: {
    fontSize: 12,
    color: '#6E6E73',
    fontStyle: 'italic',
  },
  chartSection: {
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  priceContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  currentPrice: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginBottom: 8,
  },
  priceChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  priceChangeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  periodSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    padding: 4,
  },
  periodButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: '#007AFF',
  },
  periodButtonText: {
    fontSize: 12,
    color: '#6E6E73',
    fontWeight: '500',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  chartLoadingContainer: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6E6E73',
  },
  chartContainer: {
    marginTop: 8,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    gap: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
    color: '#1D1D1F',
    fontWeight: '500',
  },
  chartNote: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  chartErrorContainer: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartErrorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#8E8E93',
  },
  aiFab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#AF52DE',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
