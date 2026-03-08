import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ScreenerResult {
  ticker: string;
  company_name: string;
  sector: string;
  industry: string;
  current_price: number;
  pe_ratio: number | null;
  roe: number | null;
  dividend_yield: number | null;
  debt_to_equity: number | null;
  market_cap: number | null;
  recommendation: string;
}

interface Preset {
  name: string;
  description: string;
  filters: any;
}

export default function ScreenerScreen() {
  const { colors, isDark } = useTheme();
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  
  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [maxPE, setMaxPE] = useState('');
  const [minROE, setMinROE] = useState('');
  const [minDividend, setMinDividend] = useState('');
  const [maxDebt, setMaxDebt] = useState('');

  useEffect(() => {
    fetchPresets();
  }, []);

  const fetchPresets = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/screener/presets`);
      setPresets(response.data.presets);
    } catch (error) {
      console.error('Error fetching presets:', error);
    }
  };

  const runScreener = async (filters: any = {}) => {
    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/screener`, filters, { timeout: 60000 });
      setResults(response.data);
    } catch (error) {
      console.error('Error running screener:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyPreset = (preset: Preset) => {
    setActivePreset(preset.name);
    setShowFilters(false);
    runScreener(preset.filters);
  };

  const applyCustomFilters = () => {
    const filters: any = {};
    if (maxPE) filters.max_pe = parseFloat(maxPE);
    if (minROE) filters.min_roe = parseFloat(minROE);
    if (minDividend) filters.min_dividend_yield = parseFloat(minDividend);
    if (maxDebt) filters.max_debt_equity = parseFloat(maxDebt);
    
    setActivePreset('Custom');
    setShowFilters(false);
    runScreener(filters);
  };

  const clearFilters = () => {
    setMaxPE('');
    setMinROE('');
    setMinDividend('');
    setMaxDebt('');
    setActivePreset(null);
    setResults([]);
  };

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'COMPRAR': return '#34C759';
      case 'VENDER': return '#FF3B30';
      default: return '#FF9500';
    }
  };

  const renderStockCard = (stock: ScreenerResult) => (
    <View key={stock.ticker} style={[styles.stockCard, { backgroundColor: colors.card }]}>
      <View style={styles.stockHeader}>
        <View>
          <Text style={[styles.ticker, { color: colors.primary }]}>{stock.ticker}</Text>
          <Text style={[styles.companyName, { color: colors.text }]} numberOfLines={1}>
            {stock.company_name}
          </Text>
          <Text style={[styles.sector, { color: colors.textSecondary }]}>{stock.sector}</Text>
        </View>
        <View style={styles.priceContainer}>
          <Text style={[styles.price, { color: colors.text }]}>
            ${stock.current_price.toFixed(2)}
          </Text>
          <View style={[styles.recBadge, { backgroundColor: getRecommendationColor(stock.recommendation) + '20' }]}>
            <Text style={[styles.recText, { color: getRecommendationColor(stock.recommendation) }]}>
              {stock.recommendation}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.metricsGrid}>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>P/E</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {stock.pe_ratio ? stock.pe_ratio.toFixed(1) : 'N/A'}
          </Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>ROE</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {stock.roe ? `${stock.roe.toFixed(1)}%` : 'N/A'}
          </Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Div. Yield</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {stock.dividend_yield ? `${stock.dividend_yield.toFixed(2)}%` : 'N/A'}
          </Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>D/E</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {stock.debt_to_equity ? stock.debt_to_equity.toFixed(2) : 'N/A'}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Presets */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.presetsContainer}
        contentContainerStyle={styles.presetsContent}
      >
        {presets.map((preset) => (
          <TouchableOpacity
            key={preset.name}
            style={[
              styles.presetButton,
              { backgroundColor: activePreset === preset.name ? colors.primary : colors.card }
            ]}
            onPress={() => applyPreset(preset)}
          >
            <Text style={[
              styles.presetName,
              { color: activePreset === preset.name ? '#FFF' : colors.text }
            ]}>
              {preset.name}
            </Text>
            <Text style={[
              styles.presetDesc,
              { color: activePreset === preset.name ? '#FFF' : colors.textSecondary }
            ]} numberOfLines={1}>
              {preset.description}
            </Text>
          </TouchableOpacity>
        ))}
        
        <TouchableOpacity
          style={[styles.presetButton, styles.customButton, { backgroundColor: colors.card, borderColor: colors.primary }]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="options" size={20} color={colors.primary} />
          <Text style={[styles.presetName, { color: colors.primary }]}>Filtros</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Custom Filters */}
      {showFilters && (
        <View style={[styles.filtersContainer, { backgroundColor: colors.card }]}>
          <View style={styles.filtersGrid}>
            <View style={styles.filterItem}>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Max P/E</Text>
              <TextInput
                style={[styles.filterInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={maxPE}
                onChangeText={setMaxPE}
                placeholder="ej: 15"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.filterItem}>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Min ROE %</Text>
              <TextInput
                style={[styles.filterInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={minROE}
                onChangeText={setMinROE}
                placeholder="ej: 15"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.filterItem}>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Min Div %</Text>
              <TextInput
                style={[styles.filterInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={minDividend}
                onChangeText={setMinDividend}
                placeholder="ej: 2"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.filterItem}>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Max D/E</Text>
              <TextInput
                style={[styles.filterInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={maxDebt}
                onChangeText={setMaxDebt}
                placeholder="ej: 1"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <View style={styles.filterActions}>
            <TouchableOpacity
              style={[styles.filterButton, { backgroundColor: colors.primary }]}
              onPress={applyCustomFilters}
            >
              <Text style={styles.filterButtonText}>Buscar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterButton, styles.clearButton, { borderColor: colors.border }]}
              onPress={clearFilters}
            >
              <Text style={[styles.clearButtonText, { color: colors.textSecondary }]}>Limpiar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Results */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Analizando acciones...
          </Text>
        </View>
      ) : results.length > 0 ? (
        <ScrollView
          style={styles.resultsContainer}
          contentContainerStyle={styles.resultsContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                if (activePreset) {
                  const preset = presets.find(p => p.name === activePreset);
                  if (preset) runScreener(preset.filters);
                }
              }}
              tintColor={colors.primary}
            />
          }
        >
          <Text style={[styles.resultsCount, { color: colors.textSecondary }]}>
            {results.length} acciones encontradas
          </Text>
          {results.map(renderStockCard)}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={60} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Screener de Acciones</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Selecciona un preset o configura filtros personalizados para encontrar acciones
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  presetsContainer: {
    maxHeight: 90,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  presetsContent: {
    padding: 12,
    gap: 10,
  },
  presetButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 120,
    marginRight: 10,
  },
  customButton: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetName: {
    fontSize: 14,
    fontWeight: '600',
  },
  presetDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  filtersContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  filtersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  filterItem: {
    width: '47%',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  filterInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  filterActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  filterButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  clearButtonText: {
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  resultsContainer: {
    flex: 1,
  },
  resultsContent: {
    padding: 16,
  },
  resultsCount: {
    fontSize: 12,
    marginBottom: 12,
  },
  stockCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  stockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ticker: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  companyName: {
    fontSize: 14,
    maxWidth: 180,
  },
  sector: {
    fontSize: 11,
    marginTop: 2,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 18,
    fontWeight: '600',
  },
  recBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  recText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E010',
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
