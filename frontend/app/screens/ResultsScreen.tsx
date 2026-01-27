import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([data.ratios[0]?.category]));

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
});
