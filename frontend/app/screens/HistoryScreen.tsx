import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';

//const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://TU_IP_LOCAL:8001';

type FilterType = 'TODOS' | 'COMPRAR' | 'MANTENER' | 'VENDER';

interface HistoryItem {
  id: string;
  ticker: string;
  company_name: string;
  analysis_date: string;
  recommendation: string;
  favorable_percentage: number;
  current_price: number;
  price_change: number;
  price_change_percent: number;
}

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'Todos', value: 'TODOS' },
  { label: 'COMPRAR', value: 'COMPRAR' },
  { label: 'MANTENER', value: 'MANTENER' },
  { label: 'VENDER', value: 'VENDER' },
];

// FUNCIÓN UTILITARIA - MOVIDA ARRIBA
const getRecommendationColor = (r: string) => {
  switch (r) {
    case 'COMPRAR': return '#34C759';
    case 'MANTENER': return '#FF9500';
    case 'VENDER': return '#FF3B30';
    default: return '#8E8E93';
  }
};

// COMPONENTE HistoryCard - MOVIDO ANTES DE HistoryScreen
function HistoryCard({ item }: { item: HistoryItem }) {
  const isPositive = item.price_change >= 0;
  const color = isPositive ? '#34C759' : '#FF3B30';
  const arrow = isPositive ? '▲' : '▼';

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.left}>
          <Text style={styles.ticker}>{item.ticker}</Text>
          <Text style={styles.companyName}>{item.company_name}</Text>
          <Text style={styles.date}>
            {new Date(item.analysis_date).toLocaleDateString('es-ES')}
          </Text>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.price}>
            ${item.current_price.toFixed(2)}
          </Text>
          <Text style={[styles.change, { color }]}>
            {arrow} {item.price_change_percent.toFixed(2)}%
          </Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.favorable}>
          {item.favorable_percentage.toFixed(1)}% favorable
        </Text>
        <View style={[styles.badge, { backgroundColor: getRecommendationColor(item.recommendation) }]}>
          <Text style={styles.badgeText}>{item.recommendation}</Text>
        </View>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const { colors, isDark } = useTheme();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('TODOS');

  const fetchHistory = async () => {
    try {
      setLoading(true);
      let url = `${BACKEND_URL}/api/history/enhanced?limit=50`;
      
      if (activeFilter !== 'TODOS') {
        url += `&recommendation=${activeFilter}`;
      }

      const { data } = await axios.get(url);
      setHistory(data);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [activeFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  if (loading && history.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filtros */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.filterContainer}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.filterPill,
              activeFilter === f.value && styles.filterPillActive,
            ]}
            onPress={() => setActiveFilter(f.value)}
          >
            <Text style={activeFilter === f.value ? styles.filterTextActive : styles.filterText}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlashList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <HistoryCard item={item} />}
        estimatedItemSize={160}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterContainer: { maxHeight: 70, paddingVertical: 12, backgroundColor: colors.card },
  filterPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginHorizontal: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterPillActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  filterText: { fontWeight: '600', color: colors.textSecondary },
  filterTextActive: { color: colors.text, fontWeight: '600' },

  card: {
    backgroundColor: colors.card,
    margin: 12,
    padding: 16,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  left: { flex: 1 },
  ticker: { fontSize: 18, fontWeight: 'bold', color: colors.primary },
  companyName: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  date: { fontSize: 12, color: colors.textSecondary, marginTop: 2 }, // NUEVO
  priceBlock: { alignItems: 'flex-end' },
  price: { fontSize: 17, fontWeight: '700' },
  change: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' },
  favorable: { color: colors.primary, fontWeight: '500' },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  badgeText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
});