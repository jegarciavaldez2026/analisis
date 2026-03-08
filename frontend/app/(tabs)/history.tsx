import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';

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
  const { colors } = useTheme();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHistory();
  }, []);

  const deleteAnalysis = async (id: string, ticker: string) => {
    Alert.alert(
      'Eliminar Análisis',
      `¿Eliminar el análisis de ${ticker}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeleting(id);
            try {
              await axios.delete(`${BACKEND_URL}/api/history/${id}`);
              setHistory(prev => prev.filter(item => item.id !== id));
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar el análisis');
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    );
  };

  const deleteAllHistory = () => {
    Alert.alert(
      'Eliminar Todo el Historial',
      '¿Estás seguro de que quieres eliminar todo el historial? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar Todo',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await axios.delete(`${BACKEND_URL}/api/history`);
              setHistory([]);
              Alert.alert('Éxito', 'Historial eliminado');
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar el historial');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
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
    <View style={[styles.historyCard, { backgroundColor: colors.card }]}>
      <View style={styles.cardHeader}>
        <View style={styles.tickerInfo}>
          <Text style={[styles.ticker, { color: colors.primary }]}>{item.ticker}</Text>
          <Text style={[styles.companyName, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.company_name}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <View
            style={[
              styles.recommendationBadge,
              { backgroundColor: getRecommendationColor(item.recommendation) },
            ]}
          >
            <Text style={styles.recommendationText}>{item.recommendation}</Text>
          </View>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: colors.danger + '15' }]}
            onPress={() => deleteAnalysis(item.id, item.ticker)}
            disabled={deleting === item.id}
          >
            {deleting === item.id ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <View style={styles.percentageContainer}>
          <Ionicons name="analytics" size={16} color={colors.primary} />
          <Text style={[styles.percentageText, { color: colors.primary }]}>
            {item.favorable_percentage.toFixed(1)}% favorable
          </Text>
        </View>
        <View style={styles.dateContainer}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate(item.analysis_date)}</Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="folder-open-outline" size={80} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No hay historial</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Los análisis que realices aparecerán aquí
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with Delete All Button */}
      <View style={[styles.headerBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>{history.length} análisis</Text>
        <TouchableOpacity
          style={[styles.deleteAllButton, { backgroundColor: colors.danger + '15' }]}
          onPress={deleteAllHistory}
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={[styles.deleteAllText, { color: colors.danger }]}>Borrar todo</Text>
        </TouchableOpacity>
      </View>

      <FlashList
        data={history}
        renderItem={renderItem}
        estimatedItemSize={120}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  deleteAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  deleteAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  historyCard: {
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
  tickerInfo: {
    flex: 1,
  },
  ticker: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  companyName: {
    fontSize: 14,
    maxWidth: 180,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  deleteButton: {
    padding: 8,
    borderRadius: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  percentageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  percentageText: {
    fontSize: 13,
    fontWeight: '500',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
  },
});
