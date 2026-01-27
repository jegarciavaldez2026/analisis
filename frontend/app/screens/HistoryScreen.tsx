import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface HistoryItem {
  id: string;
  ticker: string;
  company_name: string;
  analysis_date: string;
  recommendation: string;
  favorable_percentage: number;
}

export default function HistoryScreen() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/history`);
      setHistory(response.data);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <View style={styles.historyCard}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.ticker}>{item.ticker}</Text>
          <Text style={styles.companyName} numberOfLines={1}>
            {item.company_name}
          </Text>
        </View>
        <View
          style={[
            styles.recommendationBadge,
            { backgroundColor: getRecommendationColor(item.recommendation) },
          ]}
        >
          <Text style={styles.recommendationText}>{item.recommendation}</Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.percentageContainer}>
          <Ionicons name="analytics" size={16} color="#007AFF" />
          <Text style={styles.percentageText}>
            {item.favorable_percentage.toFixed(1)}% favorable
          </Text>
        </View>
        <View style={styles.dateContainer}>
          <Ionicons name="time-outline" size={14} color="#8E8E93" />
          <Text style={styles.dateText}>{formatDate(item.analysis_date)}</Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="folder-open-outline" size={80} color="#C7C7CC" />
        <Text style={styles.emptyTitle}>No hay historial</Text>
        <Text style={styles.emptySubtitle}>
          Los análisis que realices aparecerán aquí
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={history}
        renderItem={renderItem}
        estimatedItemSize={120}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007AFF"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6E6E73',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  ticker: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 2,
  },
  companyName: {
    fontSize: 14,
    color: '#6E6E73',
    maxWidth: 200,
  },
  recommendationBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  recommendationText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F7',
  },
  percentageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  percentageText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#8E8E93',
  },
});
