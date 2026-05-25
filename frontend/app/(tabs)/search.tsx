import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import ResultsScreen from '../screens/ResultsScreen';
import { useTheme } from '../../contexts/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface HistoryItem {
  id: string;
  ticker: string;
  company_name: string;
  recommendation: string;
  favorable_percentage: number;
}

export default function SearchScreen() {
  const { colors, isDark } = useTheme();
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<HistoryItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/history`, { timeout: 10000 });
      // Deduplicar por ticker
      const seen = new Set();
      const unique = response.data.filter((item: HistoryItem) => {
        if (seen.has(item.ticker)) return false;
        seen.add(item.ticker);
        return true;
      });
      setHistory(unique);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  const handleTickerChange = (text: string) => {
    setTicker(text);
    if (text.trim().length > 0) {
      const filtered = history.filter(item =>
        item.ticker.toLowerCase().includes(text.toLowerCase()) ||
        item.company_name.toLowerCase().includes(text.toLowerCase())
      );
      setSuggestions(filtered.slice(0, 6));
      setShowSuggestions(filtered.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (item: HistoryItem) => {
    setTicker(item.ticker);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleAnalyze = async () => {
    if (!ticker.trim()) {
      Platform.OS === 'web'
        ? window.alert('Por favor ingresa un ticker o código ISIN')
        : Alert.alert('Error', 'Por favor ingresa un ticker o código ISIN');
      return;
    }
    setShowSuggestions(false);
    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/analyze`, {
        ticker: ticker.trim().toUpperCase(),
      });
      setAnalysisData(response.data);
      fetchHistory(); // Actualizar historial
    } catch (error: any) {
      console.error('Error analyzing stock:', error);
      const msg = error.response?.data?.detail || 'No se pudo analizar la acción. Verifica el ticker e intenta nuevamente.';
      Platform.OS === 'web' ? window.alert(`Error: ${msg}`) : Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setAnalysisData(null);
    setTicker('');
    fetchHistory();
  };

  const getRecommendationColor = (rec: string) => {
    if (rec === 'COMPRAR') return '#34C759';
    if (rec === 'VENDER') return '#FF3B30';
    return '#FF9500';
  };

  if (analysisData) {
    return <ResultsScreen data={analysisData} onBack={handleBack} />;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        style={{ zIndex: 1 }}
      >
        <View style={styles.headerSection}>
          <Ionicons name="bar-chart" size={80} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>Análisis Financiero</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Ingresa el ticker o nombre de una acción para analizar sus ratios financieros
          </Text>
        </View>

        <View style={[styles.inputSection, { zIndex: 100 }]}>
          <View style={{ position: 'relative' }}>
            <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: showSuggestions ? colors.primary : 'transparent', borderWidth: showSuggestions ? 2 : 0 }]}>
              <Ionicons name="search" size={24} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: colors.text }]}
                placeholder="Ej: AAPL, Apple, MSFT..."
                placeholderTextColor={colors.textSecondary}
                value={ticker}
                onChangeText={handleTickerChange}
                onFocus={() => ticker.length > 0 && setShowSuggestions(suggestions.length > 0)}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!loading}
                onSubmitEditing={handleAnalyze}
              />
              {ticker.length > 0 && !loading && (
                <TouchableOpacity onPress={() => { setTicker(''); setSuggestions([]); setShowSuggestions(false); }} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Sugerencias */}
            {showSuggestions && suggestions.length > 0 && (
              <View style={[styles.suggestionsContainer, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: isDark ? '#000' : '#00000033' }]} {...(Platform.OS === 'web' ? { style: [styles.suggestionsContainer, { backgroundColor: colors.card, borderColor: colors.border, position: 'absolute', top: 72, left: 0, right: 0, zIndex: 9999 }] } : {})}>
                {suggestions.map((item, index) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.suggestionItem, index < suggestions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                    onPress={() => handleSelectSuggestion(item)}
                  >
                    <View style={[styles.suggestionBadge, { backgroundColor: getRecommendationColor(item.recommendation) + '22' }]}>
                      <Text style={[styles.suggestionTicker, { color: getRecommendationColor(item.recommendation) }]}>
                        {item.ticker}
                      </Text>
                    </View>
                    <View style={styles.suggestionInfo}>
                      <Text style={[styles.suggestionName, { color: colors.text }]} numberOfLines={1}>
                        {item.company_name}
                      </Text>
                      <Text style={[styles.suggestionMeta, { color: colors.textSecondary }]}>
                        {item.recommendation} · {item.favorable_percentage.toFixed(1)}% favorable
                      </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.analyzeButton, { backgroundColor: colors.primary }, loading && styles.analyzeButtonDisabled]}
            onPress={handleAnalyze}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="analytics" size={24} color="#FFFFFF" style={styles.buttonIcon} />
                <Text style={styles.analyzeButtonText}>Analizar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.examplesSection}>
          <Text style={[styles.examplesTitle, { color: colors.text }]}>Ejemplos populares:</Text>
          <View style={styles.examplesGrid}>
            {['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META'].map((example) => (
              <TouchableOpacity
                key={example}
                style={[styles.exampleChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setTicker(example)}
                disabled={loading}
              >
                <Text style={[styles.exampleChipText, { color: colors.primary }]}>{example}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {history.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={[styles.examplesTitle, { color: colors.text }]}>Analizados recientemente:</Text>
            <View style={styles.examplesGrid}>
              {history.slice(0, 8).map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.exampleChip, { backgroundColor: colors.card, borderColor: getRecommendationColor(item.recommendation) + '44' }]}
                  onPress={() => setTicker(item.ticker)}
                  disabled={loading}
                >
                  <View style={[styles.recentDot, { backgroundColor: getRecommendationColor(item.recommendation) }]} />
                  <Text style={[styles.exampleChipText, { color: colors.text }]}>{item.ticker}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.infoSection}>
          <View style={[styles.infoCard, { backgroundColor: isDark ? colors.primary + '20' : '#E8F4FF' }]}>
            <Ionicons name="information-circle" size={24} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              Esta app analiza más de 100 ratios financieros y proporciona una recomendación basada en métricas clave
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  headerSection: { alignItems: 'center', marginTop: 20, marginBottom: 40 },
  title: { fontSize: 32, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', marginTop: 8, paddingHorizontal: 20, lineHeight: 22 },
  inputSection: { marginBottom: 32 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: 56, fontSize: 18 },
  clearButton: { padding: 4 },
  suggestionsContainer: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    zIndex: 9999,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    marginBottom: 0,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  suggestionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 52,
    alignItems: 'center',
  },
  suggestionTicker: { fontSize: 13, fontWeight: '700' },
  suggestionInfo: { flex: 1 },
  suggestionName: { fontSize: 14, fontWeight: '500' },
  suggestionMeta: { fontSize: 12, marginTop: 2 },
  analyzeButton: {
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  analyzeButtonDisabled: { opacity: 0.6 },
  buttonIcon: { marginRight: 8 },
  analyzeButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  examplesSection: { marginBottom: 24 },
  recentSection: { marginBottom: 24 },
  examplesTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  examplesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exampleChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exampleChipText: { fontSize: 14, fontWeight: '500' },
  recentDot: { width: 7, height: 7, borderRadius: 4 },
  infoSection: { marginTop: 8 },
  infoCard: { flexDirection: 'row', padding: 16, borderRadius: 12, alignItems: 'center' },
  infoText: { flex: 1, marginLeft: 12, fontSize: 14, lineHeight: 20 },
});
