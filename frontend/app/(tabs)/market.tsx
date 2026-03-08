import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface MarketIndicator {
  name: string;
  ticker: string;
  current_value: number;
  change: number;
  change_percent: number;
  updated: string;
  description: string;
}

interface MarketData {
  vix: MarketIndicator;
  treasury_10y: MarketIndicator;
  sp500: MarketIndicator;
  fear_greed_level: string;
  market_sentiment: string;
}

interface NewsArticle {
  title: string;
  publisher: string;
  link: string;
  published_date: string;
  thumbnail: string | null;
  summary: string | null;
}

export default function MarketScreen() {
  const [data, setData] = useState<MarketData | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const response = await axios.get(`${BACKEND_URL}/api/market-indicators`);
      setData(response.data);
    } catch (err: any) {
      console.error('Error fetching market indicators:', err);
      setError('No se pudieron cargar los indicadores de mercado');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchNews = async () => {
    try {
      setNewsLoading(true);
      const response = await axios.get(`${BACKEND_URL}/api/market-news?limit=10`);
      setNews(response.data.news || []);
    } catch (err: any) {
      console.error('Error fetching market news:', err);
    } finally {
      setNewsLoading(false);
    }
  };

  const openNewsLink = (url: string) => {
    if (url) {
      Linking.openURL(url).catch(err => console.error('Error opening link:', err));
    }
  };

  useEffect(() => {
    fetchData();
    fetchNews();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
    fetchNews();
  }, []);

  const getVixColor = (value: number) => {
    if (value < 12) return '#34C759'; // Verde - Complacencia
    if (value < 17) return '#8BC34A'; // Verde claro - Bajo
    if (value < 25) return '#FF9500'; // Naranja - Moderado
    if (value < 35) return '#FF6B00'; // Naranja oscuro - Alto
    return '#FF3B30'; // Rojo - Extremo
  };

  const getVixLabel = (value: number) => {
    if (value < 12) return 'Complacencia';
    if (value < 17) return 'Volatilidad Baja';
    if (value < 25) return 'Volatilidad Moderada';
    if (value < 35) return 'Volatilidad Alta';
    return 'Volatilidad Extrema';
  };

  const getChangeColor = (change: number) => {
    return change >= 0 ? '#34C759' : '#FF3B30';
  };

  const getSentimentColor = (sentiment: string) => {
    if (sentiment.includes('optimista')) return '#34C759';
    if (sentiment.includes('pesimista')) return '#FF3B30';
    return '#FF9500';
  };

  const getFearGreedColor = (level: string) => {
    switch (level) {
      case 'Codicia':
      case 'Codicia Extrema':
        return '#34C759';
      case 'Neutral':
        return '#FF9500';
      case 'Miedo':
      case 'Miedo Extremo':
        return '#FF3B30';
      default:
        return '#8E8E93';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Cargando indicadores...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="cloud-offline" size={60} color="#FF3B30" />
        <Text style={styles.errorText}>{error || 'Error desconocido'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
      }
    >
      {/* Market Sentiment Summary */}
      <View style={styles.sentimentCard}>
        <View style={styles.sentimentHeader}>
          <Ionicons name="pulse" size={28} color="#007AFF" />
          <Text style={styles.sentimentTitle}>Estado del Mercado</Text>
        </View>
        <View style={styles.sentimentContent}>
          <View style={styles.sentimentItem}>
            <Text style={styles.sentimentLabel}>Sentimiento</Text>
            <Text style={[styles.sentimentValue, { color: getSentimentColor(data.market_sentiment) }]}>
              {data.market_sentiment}
            </Text>
          </View>
          <View style={styles.sentimentDivider} />
          <View style={styles.sentimentItem}>
            <Text style={styles.sentimentLabel}>Nivel Fear & Greed</Text>
            <Text style={[styles.sentimentValue, { color: getFearGreedColor(data.fear_greed_level) }]}>
              {data.fear_greed_level}
            </Text>
          </View>
        </View>
      </View>

      {/* VIX Card */}
      <View style={styles.indicatorCard}>
        <View style={styles.indicatorHeader}>
          <View style={styles.indicatorTitleContainer}>
            <View style={[styles.indicatorIcon, { backgroundColor: getVixColor(data.vix.current_value) + '20' }]}>
              <Ionicons name="pulse" size={24} color={getVixColor(data.vix.current_value)} />
            </View>
            <View>
              <Text style={styles.indicatorName}>{data.vix.name}</Text>
              <Text style={styles.indicatorTicker}>{data.vix.ticker}</Text>
            </View>
          </View>
          <View style={styles.indicatorValueContainer}>
            <Text style={styles.indicatorValue}>{data.vix.current_value.toFixed(2)}</Text>
            <View style={[styles.changeContainer, { backgroundColor: getChangeColor(data.vix.change) + '15' }]}>
              <Ionicons
                name={data.vix.change >= 0 ? 'arrow-up' : 'arrow-down'}
                size={14}
                color={getChangeColor(data.vix.change)}
              />
              <Text style={[styles.changeText, { color: getChangeColor(data.vix.change) }]}>
                {data.vix.change >= 0 ? '+' : ''}{data.vix.change.toFixed(2)} ({data.vix.change_percent >= 0 ? '+' : ''}{data.vix.change_percent.toFixed(2)}%)
              </Text>
            </View>
          </View>
        </View>
        
        {/* VIX Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: getVixColor(data.vix.current_value) + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: getVixColor(data.vix.current_value) }]} />
          <Text style={[styles.statusText, { color: getVixColor(data.vix.current_value) }]}>
            {getVixLabel(data.vix.current_value)}
          </Text>
        </View>
        
        {/* VIX Scale */}
        <View style={styles.vixScale}>
          <View style={styles.vixScaleBar}>
            <View style={[styles.vixScaleSection, { backgroundColor: '#34C759', flex: 12 }]} />
            <View style={[styles.vixScaleSection, { backgroundColor: '#8BC34A', flex: 5 }]} />
            <View style={[styles.vixScaleSection, { backgroundColor: '#FF9500', flex: 8 }]} />
            <View style={[styles.vixScaleSection, { backgroundColor: '#FF6B00', flex: 10 }]} />
            <View style={[styles.vixScaleSection, { backgroundColor: '#FF3B30', flex: 15 }]} />
          </View>
          <View style={styles.vixScaleLabels}>
            <Text style={styles.vixScaleLabel}>0</Text>
            <Text style={styles.vixScaleLabel}>12</Text>
            <Text style={styles.vixScaleLabel}>17</Text>
            <Text style={styles.vixScaleLabel}>25</Text>
            <Text style={styles.vixScaleLabel}>35</Text>
            <Text style={styles.vixScaleLabel}>50+</Text>
          </View>
          {/* Current Position Indicator */}
          <View 
            style={[
              styles.vixIndicator, 
              { left: `${Math.min((data.vix.current_value / 50) * 100, 100)}%` }
            ]}
          >
            <View style={styles.vixIndicatorDot} />
          </View>
        </View>
        
        <Text style={styles.indicatorDescription}>{data.vix.description}</Text>
        <Text style={styles.updateTime}>Actualizado: {data.vix.updated}</Text>
      </View>

      {/* Treasury 10Y Card */}
      <View style={styles.indicatorCard}>
        <View style={styles.indicatorHeader}>
          <View style={styles.indicatorTitleContainer}>
            <View style={[styles.indicatorIcon, { backgroundColor: '#007AFF20' }]}>
              <Ionicons name="trending-up" size={24} color="#007AFF" />
            </View>
            <View>
              <Text style={styles.indicatorName}>{data.treasury_10y.name}</Text>
              <Text style={styles.indicatorTicker}>{data.treasury_10y.ticker}</Text>
            </View>
          </View>
          <View style={styles.indicatorValueContainer}>
            <Text style={styles.indicatorValue}>{data.treasury_10y.current_value.toFixed(3)}%</Text>
            <View style={[styles.changeContainer, { backgroundColor: getChangeColor(data.treasury_10y.change) + '15' }]}>
              <Ionicons
                name={data.treasury_10y.change >= 0 ? 'arrow-up' : 'arrow-down'}
                size={14}
                color={getChangeColor(data.treasury_10y.change)}
              />
              <Text style={[styles.changeText, { color: getChangeColor(data.treasury_10y.change) }]}>
                {data.treasury_10y.change >= 0 ? '+' : ''}{data.treasury_10y.change.toFixed(3)} ({data.treasury_10y.change_percent >= 0 ? '+' : ''}{data.treasury_10y.change_percent.toFixed(2)}%)
              </Text>
            </View>
          </View>
        </View>
        
        {/* Treasury Rate Interpretation */}
        <View style={styles.treasuryInfo}>
          <View style={styles.treasuryItem}>
            <Ionicons name="information-circle" size={18} color="#6E6E73" />
            <Text style={styles.treasuryItemText}>
              {data.treasury_10y.current_value < 3 
                ? 'Tasas bajas favorecen renta variable' 
                : data.treasury_10y.current_value < 4.5 
                  ? 'Tasas moderadas, equilibrio riesgo-retorno'
                  : 'Tasas altas pueden presionar mercados'}
            </Text>
          </View>
        </View>
        
        <Text style={styles.indicatorDescription}>{data.treasury_10y.description}</Text>
        <Text style={styles.updateTime}>Actualizado: {data.treasury_10y.updated}</Text>
      </View>

      {/* S&P 500 Card */}
      <View style={styles.indicatorCard}>
        <View style={styles.indicatorHeader}>
          <View style={styles.indicatorTitleContainer}>
            <View style={[styles.indicatorIcon, { backgroundColor: '#34C75920' }]}>
              <Ionicons name="stats-chart" size={24} color="#34C759" />
            </View>
            <View>
              <Text style={styles.indicatorName}>{data.sp500.name}</Text>
              <Text style={styles.indicatorTicker}>{data.sp500.ticker}</Text>
            </View>
          </View>
          <View style={styles.indicatorValueContainer}>
            <Text style={styles.indicatorValue}>{data.sp500.current_value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
            <View style={[styles.changeContainer, { backgroundColor: getChangeColor(data.sp500.change) + '15' }]}>
              <Ionicons
                name={data.sp500.change >= 0 ? 'arrow-up' : 'arrow-down'}
                size={14}
                color={getChangeColor(data.sp500.change)}
              />
              <Text style={[styles.changeText, { color: getChangeColor(data.sp500.change) }]}>
                {data.sp500.change >= 0 ? '+' : ''}{data.sp500.change.toFixed(2)} ({data.sp500.change_percent >= 0 ? '+' : ''}{data.sp500.change_percent.toFixed(2)}%)
              </Text>
            </View>
          </View>
        </View>
        
        <Text style={styles.indicatorDescription}>{data.sp500.description}</Text>
        <Text style={styles.updateTime}>Actualizado: {data.sp500.updated}</Text>
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <Ionicons name="bulb" size={24} color="#FF9500" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>¿Cómo usar estos indicadores?</Text>
            <Text style={styles.infoText}>
              • VIX alto (&gt;25): Considera reducir riesgo{'\n'}
              • VIX bajo (&lt;15): Puede ser momento de invertir{'\n'}
              • Treasury alto: Bonos más atractivos vs acciones{'\n'}
              • Treasury bajo: Acciones pueden ser más atractivas
            </Text>
          </View>
        </View>
      </View>

      {/* Market News Section */}
      <View style={styles.newsSection}>
        <View style={styles.newsSectionHeader}>
          <Ionicons name="newspaper" size={24} color="#007AFF" />
          <Text style={styles.newsSectionTitle}>Noticias del Mercado</Text>
        </View>
        
        {newsLoading ? (
          <View style={styles.newsLoadingContainer}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.newsLoadingText}>Cargando noticias...</Text>
          </View>
        ) : news.length === 0 ? (
          <View style={styles.noNewsContainer}>
            <Ionicons name="newspaper-outline" size={40} color="#8E8E93" />
            <Text style={styles.noNewsText}>No hay noticias disponibles</Text>
          </View>
        ) : (
          news.map((article, index) => (
            <TouchableOpacity
              key={index}
              style={styles.newsCard}
              onPress={() => openNewsLink(article.link)}
              activeOpacity={0.7}
            >
              <View style={styles.newsCardContent}>
                {article.thumbnail && (
                  <Image
                    source={{ uri: article.thumbnail }}
                    style={styles.newsThumbnail}
                    resizeMode="cover"
                  />
                )}
                <View style={[styles.newsTextContainer, !article.thumbnail && styles.newsTextContainerFull]}>
                  <Text style={styles.newsTitle} numberOfLines={2}>
                    {article.title}
                  </Text>
                  {article.summary && (
                    <Text style={styles.newsSummary} numberOfLines={2}>
                      {article.summary}
                    </Text>
                  )}
                  <View style={styles.newsMetaContainer}>
                    <Text style={styles.newsPublisher}>{article.publisher}</Text>
                    <Text style={styles.newsDate}>{article.published_date}</Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" style={styles.newsChevron} />
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6E6E73',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6E6E73',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sentimentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sentimentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sentimentTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginLeft: 12,
  },
  sentimentContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  sentimentItem: {
    flex: 1,
    alignItems: 'center',
  },
  sentimentDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E0E0E0',
  },
  sentimentLabel: {
    fontSize: 12,
    color: '#6E6E73',
    marginBottom: 4,
  },
  sentimentValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  indicatorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  indicatorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  indicatorTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  indicatorIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  indicatorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  indicatorTicker: {
    fontSize: 12,
    color: '#6E6E73',
    marginTop: 2,
  },
  indicatorValueContainer: {
    alignItems: 'flex-end',
  },
  indicatorValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D1D1F',
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  vixScale: {
    marginBottom: 16,
    position: 'relative',
  },
  vixScaleBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  vixScaleSection: {
    height: '100%',
  },
  vixScaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  vixScaleLabel: {
    fontSize: 10,
    color: '#8E8E93',
  },
  vixIndicator: {
    position: 'absolute',
    top: -4,
    transform: [{ translateX: -6 }],
  },
  vixIndicatorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1D1D1F',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  treasuryInfo: {
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  treasuryItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  treasuryItemText: {
    fontSize: 13,
    color: '#6E6E73',
    marginLeft: 8,
    flex: 1,
  },
  indicatorDescription: {
    fontSize: 13,
    color: '#6E6E73',
    lineHeight: 18,
    marginBottom: 8,
  },
  updateTime: {
    fontSize: 11,
    color: '#8E8E93',
  },
  infoSection: {
    marginTop: 8,
  },
  infoCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#6E6E73',
    lineHeight: 20,
  },
  // News Section Styles
  newsSection: {
    marginTop: 16,
  },
  newsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  newsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D1D1F',
    marginLeft: 10,
  },
  newsLoadingContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  newsLoadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#6E6E73',
  },
  noNewsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  noNewsText: {
    marginTop: 10,
    fontSize: 14,
    color: '#8E8E93',
  },
  newsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  newsCardContent: {
    flex: 1,
    flexDirection: 'row',
  },
  newsThumbnail: {
    width: 70,
    height: 70,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#F5F5F7',
  },
  newsTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  newsTextContainerFull: {
    paddingRight: 8,
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D1D1F',
    lineHeight: 18,
    marginBottom: 4,
  },
  newsSummary: {
    fontSize: 12,
    color: '#6E6E73',
    lineHeight: 16,
    marginBottom: 6,
  },
  newsMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  newsPublisher: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '500',
  },
  newsDate: {
    fontSize: 10,
    color: '#8E8E93',
  },
  newsChevron: {
    marginLeft: 8,
  },
});
