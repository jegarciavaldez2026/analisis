import React, { useState } from 'react';
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

export default function SearchScreen() {
  const { colors, isDark } = useTheme();
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);

  const handleAnalyze = async () => {
    if (!ticker.trim()) {
      Alert.alert('Error', 'Por favor ingresa un ticker o código ISIN');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/analyze`, {
        ticker: ticker.trim().toUpperCase(),
      });
      setAnalysisData(response.data);
    } catch (error: any) {
      console.error('Error analyzing stock:', error);
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'No se pudo analizar la acción. Verifica el ticker e intenta nuevamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setAnalysisData(null);
    setTicker('');
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
      >
        <View style={styles.headerSection}>
          <Ionicons name="bar-chart" size={80} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>Análisis Financiero</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Ingresa el ticker o código ISIN de una acción para analizar sus ratios financieros
          </Text>
        </View>

        <View style={styles.inputSection}>
          <View style={[styles.inputContainer, { backgroundColor: colors.card }]}>
            <Ionicons name="search" size={24} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Ej: AAPL, GOOGL, MSFT"
              placeholderTextColor={colors.textSecondary}
              value={ticker}
              onChangeText={setTicker}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />
            {ticker.length > 0 && !loading && (
              <TouchableOpacity onPress={() => setTicker('')} style={styles.clearButton}>
                <Ionicons name="close-circle" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
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

        <View style={styles.infoSection}>
          <View style={[styles.infoCard, { backgroundColor: isDark ? colors.primary + '20' : '#E8F4FF' }]}>
            <Ionicons name="information-circle" size={24} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              Esta app analiza más de 25 ratios financieros y proporciona una recomendación basada en métricas clave
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  inputSection: {
    marginBottom: 32,
  },
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
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 18,
  },
  clearButton: {
    padding: 4,
  },
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
  analyzeButtonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  analyzeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  examplesSection: {
    marginBottom: 32,
  },
  examplesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  examplesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exampleChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  exampleChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoSection: {
    marginTop: 16,
  },
  infoCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    lineHeight: 20,
  },
});
