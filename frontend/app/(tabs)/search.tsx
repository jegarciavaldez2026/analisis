import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

import ResultsScreen from '../screens/ResultsScreen';
import { useTheme } from '../../contexts/ThemeContext';
import {
  Button,
  EmptyState,
  Field,
  Legend,
  Notice,
  Panel,
  Rule,
  Signal,
  SkeletonRows,
} from '../../components/ui';
import { decisionBands, verdictTone } from '../../theme/tokens';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

interface HistoryItem {
  id: string;
  ticker: string;
  company_name: string;
  recommendation: string;
  favorable_percentage: number;
}

interface SearchSuggestion {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
}

const EXAMPLES = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META'];

export default function SearchScreen() {
  const { colors, space, type, radius, hairline, elevation, numeric } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<any>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/history`, { timeout: 10000 });
      const seen = new Set();
      const unique = response.data.filter((item: HistoryItem) => {
        if (seen.has(item.ticker)) return false;
        seen.add(item.ticker);
        return true;
      });
      setHistory(unique);
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  const searchTickers = useCallback(async (query: string) => {
    if (!query || query.trim().length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSearchLoading(true);
    try {
      const response = await axios.get(`${BACKEND_URL}/api/search`, {
        params: { q: query.trim() },
        timeout: 8000,
      });
      if (response.data && response.data.length > 0) {
        setSuggestions(response.data);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (err) {
      console.error('Error searching tickers:', err);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleTickerChange = (text: string) => {
    setTicker(text);
    setError(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (text.trim().length > 0) {
      searchTimeout.current = setTimeout(() => {
        searchTickers(text);
      }, 250);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (item: SearchSuggestion) => {
    setTicker(item.ticker);
    setShowSuggestions(false);
    setSuggestions([]);
    inputRef.current?.blur();
  };

  const handleAnalyze = async () => {
    if (!ticker.trim()) {
      // El error se queda en la pantalla, junto al campo. Un diálogo del
      // sistema para esto interrumpe sin proteger nada.
      setError('Escribe un ticker (AAPL) o el nombre de una empresa para analizarla.');
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setShowSuggestions(false);
    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/analyze`, {
        ticker: ticker.trim().toUpperCase(),
      });
      setAnalysisData(response.data);
      fetchHistory();
    } catch (err: any) {
      console.error('Error analyzing stock:', err);
      setError(
        err.response?.data?.detail ||
          'No se pudo analizar esa acción. Comprueba el ticker o prueba con otro nombre.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setAnalysisData(null);
    setTicker('');
    setError(null);
    fetchHistory();
  };

  const getTypeIcon = (t: string): keyof typeof Ionicons.glyphMap => {
    switch (t) {
      case 'EQUITY':
        return 'business-outline';
      case 'ETF':
        return 'grid-outline';
      case 'INDEX':
        return 'trending-up-outline';
      case 'MUTUALFUND':
        return 'wallet-outline';
      default:
        return 'document-outline';
    }
  };

  if (analysisData) {
    return <ResultsScreen data={analysisData} onBack={handleBack} />;
  }

  const chipStyle = (pressed: boolean, borderColor?: string) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.xs,
    borderWidth: hairline,
    borderColor: borderColor ?? colors.rule,
    backgroundColor: pressed ? colors.accentWash : colors.surface,
  });

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: space.xl,
          paddingBottom: space.h3,
          maxWidth: 880,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Encabezado: lo que hace el instrumento, en una frase */}
        <View style={{ gap: space.sm, marginBottom: space.xl, maxWidth: 560 }}>
          <Text style={[wide ? type.display : type.title1, { color: colors.ink }]}>
            ¿Qué dicen los números de esta empresa?
          </Text>
          <Text style={[type.body, { color: colors.inkMuted }]}>
            Más de 50 ratios calculados sobre los estados financieros publicados, comparados con sus
            umbrales y colocados en una escala de decisión.
          </Text>
        </View>

        {/* Entrada — el control principal de la pantalla.
            El botón va al lado del campo, no debajo: el desplegable de
            sugerencias se posiciona en absoluto sobre lo que venga después, y
            como el botón era su hermano posterior se pintaba encima de la
            primera sugerencia y la tapaba. En fila, el problema no existe. */}
        <View style={{ zIndex: 100, gap: space.md, marginBottom: space.xl }}>
          <View
            style={{
              flexDirection: wide ? 'row' : 'column',
              alignItems: wide ? 'flex-start' : 'stretch',
              gap: space.md,
              zIndex: 100,
            }}
          >
            <View style={{ flex: wide ? 1 : undefined, position: 'relative', zIndex: 100 }}>
              <Field
                ref={inputRef}
                icon="search"
                placeholder="Ticker o nombre de empresa"
                value={ticker}
                onChangeText={handleTickerChange}
                onFocus={() => ticker.length > 0 && suggestions.length > 0 && setShowSuggestions(true)}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!loading}
                onSubmitEditing={handleAnalyze}
                returnKeyType="search"
                invalid={!!error && !ticker.trim()}
                containerStyle={{ minHeight: 56 }}
                right={
                  searchLoading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : ticker.length > 0 && !loading ? (
                    <Pressable
                      onPress={() => {
                        setTicker('');
                        setSuggestions([]);
                        setShowSuggestions(false);
                        setError(null);
                      }}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Borrar búsqueda"
                      style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.inkFaint} />
                    </Pressable>
                  ) : null
                }
              />

              {showSuggestions && suggestions.length > 0 && (
                <View
                  style={[
                    {
                      position: 'absolute',
                      top: 62,
                      left: 0,
                      right: 0,
                      zIndex: 200,
                      elevation: 24,
                      backgroundColor: colors.surfaceRaised,
                      borderWidth: hairline,
                      borderColor: colors.ruleStrong,
                      borderRadius: radius.sm,
                      overflow: 'hidden',
                    },
                    elevation(3),
                  ]}
                >
                  <FlatList
                    data={suggestions}
                    keyExtractor={(item) => item.ticker}
                    keyboardShouldPersistTaps="always"
                    style={{ maxHeight: 320 }}
                    renderItem={({ item, index }) => (
                      <Pressable
                        onPress={() => handleSelectSuggestion(item)}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: space.md,
                            minHeight: 52,
                            paddingHorizontal: space.md,
                            paddingVertical: space.sm,
                            backgroundColor: pressed ? colors.accentWash : 'transparent',
                            borderBottomWidth: index < suggestions.length - 1 ? hairline : 0,
                            borderBottomColor: colors.rule,
                          },
                          Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                        ]}
                      >
                        <Ionicons name={getTypeIcon(item.type)} size={18} color={colors.inkMuted} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs }}>
                            <Text style={[type.labelStrong, numeric, { color: colors.ink }]}>
                              {item.ticker}
                            </Text>
                            <Text style={[type.legend, { color: colors.inkFaint }]}>{item.exchange}</Text>
                          </View>
                          <Text style={[type.caption, { color: colors.inkMuted }]} numberOfLines={1}>
                            {item.name}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={15} color={colors.inkFaint} />
                      </Pressable>
                    )}
                  />
                </View>
              )}
            </View>

            <Button
              label={loading ? 'Analizando…' : 'Analizar'}
              icon="analytics-outline"
              onPress={handleAnalyze}
              loading={loading}
              size="lg"
              full={!wide}
              style={{ minHeight: 56, paddingHorizontal: space.xxl }}
            />
          </View>

          {error ? (
            <Notice tone="down" title="No se pudo analizar" body={error} />
          ) : null}
        </View>

        {/* Mientras corre el análisis se dibuja la placa, no un spinner suelto */}
        {loading ? (
          <Panel legend="Leyendo estados financieros" title={ticker.trim().toUpperCase()}>
            <SkeletonRows rows={6} />
            <Text style={[type.caption, { color: colors.inkFaint, marginTop: space.lg }]}>
              Descargando estados financieros y calculando ratios. Suele tardar unos segundos.
            </Text>
          </Panel>
        ) : (
          <View style={{ gap: space.xl }}>
            <Panel legend="Empieza por aquí" title="Ejemplos" padded={false}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: space.sm,
                  padding: space.lg,
                }}
              >
                {EXAMPLES.map((example) => (
                  <Pressable
                    key={example}
                    onPress={() => setTicker(example)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={`Usar el ejemplo ${example}`}
                    style={({ pressed }) => [
                      chipStyle(pressed),
                      Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                    ]}
                  >
                    <Text style={[type.label, numeric, { color: colors.ink, fontWeight: '600' }]}>
                      {example}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Panel>

            {history.length > 0 ? (
              <Panel legend="Tu historial" title="Analizadas recientemente" padded={false}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.lg }}>
                  {history.slice(0, 8).map((item) => {
                    const tone = verdictTone(item.recommendation);
                    const fg =
                      tone === 'up' ? colors.up : tone === 'down' ? colors.down : colors.caution;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setTicker(item.ticker)}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.ticker}: ${item.recommendation}`}
                        style={({ pressed }) => [
                          chipStyle(pressed, colors.rule),
                          Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                        ]}
                      >
                        {/* El veredicto no viaja sólo en el color: también en la marca */}
                        <View style={{ width: 3, height: 16, backgroundColor: fg }} />
                        <Text style={[type.label, numeric, { color: colors.ink, fontWeight: '600' }]}>
                          {item.ticker}
                        </Text>
                        <Text style={[type.legend, numeric, { color: fg }]}>
                          {Math.round(item.favorable_percentage)}%
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Panel>
            ) : (
              <Panel padded={false}>
                <EmptyState
                  icon="time-outline"
                  title="Todavía no has analizado nada"
                  body="Cuando analices una empresa, quedará aquí para que puedas volver a ella de un toque."
                />
              </Panel>
            )}

            {/* La regla de decisión, visible antes del primer análisis */}
            <Panel legend="Cómo se lee el resultado" title="Regla de decisión" padded={false}>
              {decisionBands
                .slice()
                .reverse()
                .map((b, i, arr) => (
                  <View key={b.verdict}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.lg,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Signal label={b.verdict} tone={b.tone} size="sm" />
                      <Text style={[type.label, { color: colors.ink, flex: 1, minWidth: 180 }]}>
                        {b.from === 60
                          ? 'Métricas favorables ≥ 60 %'
                          : b.from === 40
                            ? 'Métricas favorables entre 40 % y 60 %'
                            : 'Métricas favorables por debajo del 40 %'}
                      </Text>
                      <Text style={[type.caption, { color: colors.inkMuted }]}>
                        Riesgo {b.risk.toLowerCase()}
                      </Text>
                    </View>
                    {i < arr.length - 1 ? <Rule /> : null}
                  </View>
                ))}
              <Rule />
              <Text style={[type.caption, { color: colors.inkFaint, padding: space.lg }]}>
                Datos de Yahoo Finance. Es una lectura de los números publicados, no un consejo de
                inversión.
              </Text>
            </Panel>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
