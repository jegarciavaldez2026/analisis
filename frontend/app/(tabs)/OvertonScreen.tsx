/**
 * OvertonScreen.tsx
 * Pantalla "Ventana de Overton" del menú de navegación.
 * Selector de acciones del historial + OvertonSignalMatrix.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import OvertonSignalMatrix_v4 from '../../components/OvertonSignalMatrix_v4';
import { useTheme } from '../../contexts/ThemeContext';
import { useSimbolo } from '../../contexts/SimboloContext';
import type { ThemeColors } from '../../contexts/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

interface HistoryItem {
  id: string;
  ticker: string;
  company_name: string;
  recommendation: string;
  favorable_percentage: number;
}

/** El código verde/rojo del producto, resuelto desde los tokens. */
const recColor = (c: ThemeColors): Record<string, string> => ({
  COMPRAR: c.up,
  MANTENER: c.caution,
  VENDER: c.down,
});

export default function OvertonScreen() {
  const { colors, isDark } = useTheme();
  const REC_COLOR = React.useMemo(() => recColor(colors), [colors]);
  // El símbolo activo de la aplicación: el mismo que lleva el robot en
  // Estrategia. Cambiarlo aquí lo cambia allí, y al revés.
  const { simbolo, setSimbolo } = useSimbolo();
  const [history,        setHistory]        = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState(simbolo);
  const [selectedName,   setSelectedName]   = useState('');
  const [showMatrix,     setShowMatrix]     = useState(false);
  const [showDropdown,   setShowDropdown]   = useState(false);
  const [entradaLibre,   setEntradaLibre]   = useState('');

  useEffect(() => { fetchHistory(); }, []);

  /**
   * Seguir al símbolo de la aplicación.
   *
   * Si vuelves de Estrategia con otro valor, esta pantalla se pone en él en
   * vez de quedarse en el anterior. Se cierra la matriz para no dejar en
   * pantalla el análisis del valor viejo bajo el nombre del nuevo, que es
   * justo la confusión que este cambio viene a quitar.
   */
  useEffect(() => {
    if (!simbolo || simbolo === selectedTicker) return;
    setSelectedTicker(simbolo);
    const enHistorial = history.find((h) => h.ticker === simbolo);
    setSelectedName(enHistorial?.company_name ?? '');
    setShowMatrix(false);
  }, [simbolo]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/history`, { timeout: 10000 });
      const seen = new Set<string>();
      const unique = res.data.filter((item: HistoryItem) => {
        if (seen.has(item.ticker)) return false;
        seen.add(item.ticker);
        return true;
      });
      setHistory(unique);
      // El símbolo activo manda sobre el primero del historial: si el robot
      // está en PBF, esta pantalla abre en PBF aunque no se haya analizado
      // nunca desde Búsqueda. `/overton/{ticker}` funciona con cualquiera.
      const activo = unique.find((h: HistoryItem) => h.ticker === selectedTicker);
      if (activo) {
        setSelectedName(activo.company_name);
      } else if (!selectedTicker && unique.length > 0) {
        setSelectedTicker(unique[0].ticker);
        setSelectedName(unique[0].company_name);
      }
    } catch (e) {
      console.error('Error fetching history:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAnalyze = () => {
    if (!selectedTicker) return;
    setShowMatrix(false);
    setTimeout(() => setShowMatrix(true), 80);
  };

  const handleSelect = (item: HistoryItem) => {
    setSelectedTicker(item.ticker);
    setSelectedName(item.company_name);
    setSimbolo(item.ticker); // el resto de la aplicación sigue a este valor
    setShowDropdown(false);
    setShowMatrix(false);
  };

  /**
   * Analizar un ticker que no está en el historial.
   *
   * El selector sólo ofrecía valores ya analizados desde Búsqueda, así que un
   * símbolo que llevara el robot y no estuviera en esa lista no había forma de
   * mirarlo aquí. `/overton/{ticker}` no necesita historial: acepta cualquier
   * símbolo, y esta entrada es la que lo aprovecha.
   */
  const analizarLibre = () => {
    const limpio = entradaLibre.trim().toUpperCase();
    if (!limpio) return;
    setSelectedTicker(limpio);
    setSelectedName(history.find((h) => h.ticker === limpio)?.company_name ?? '');
    setSimbolo(limpio);
    setEntradaLibre('');
    setShowMatrix(false);
    setTimeout(() => setShowMatrix(true), 80);
  };

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={s.inner}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Cabecera ── */}
      <View style={s.header}>
        <View style={[s.headerIcon, { backgroundColor: colors.accentWash }]}>
          <Ionicons name="eye" size={28} color={colors.accent} />
        </View>
        <View>
          <Text style={[s.headerTitle, { color: colors.text }]}>Ventana de Overton</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>
            Modelo Overton · análisis cuantitativo de acciones
          </Text>
        </View>
      </View>

      {/* ── Selector ── */}
      <View style={[s.selectorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.selectorLabel, { color: colors.textSecondary }]}>
          Acción analizada · sigue al símbolo del robot
        </Text>

        {/* Entrada libre. Va ANTES del selector porque es la que no depende de
            haber analizado nada antes: `/overton/{ticker}` acepta cualquier
            símbolo, y el desplegable sólo conoce el historial. */}
        <View style={s.libreRow}>
          <TextInput
            value={entradaLibre}
            onChangeText={setEntradaLibre}
            onSubmitEditing={analizarLibre}
            placeholder={`Cualquier símbolo (activo: ${selectedTicker || '—'})`}
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel="Analizar cualquier símbolo en Overton"
            style={[
              s.libreInput,
              {
                borderColor: colors.ruleStrong,
                backgroundColor: colors.inputBackground,
                color: colors.text,
              },
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
            ]}
          />
          <TouchableOpacity
            onPress={analizarLibre}
            disabled={!entradaLibre.trim()}
            accessibilityRole="button"
            accessibilityLabel="Analizar el símbolo escrito"
            style={[
              s.libreBtn,
              {
                backgroundColor: entradaLibre.trim() ? colors.accent : colors.border,
                opacity: entradaLibre.trim() ? 1 : 0.6,
              },
            ]}
          >
            <Ionicons name="arrow-forward" size={16} color={colors.inkOnAccent} />
          </TouchableOpacity>
        </View>

        {loadingHistory ? (
          <View style={s.loadRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[s.loadTxt, { color: colors.textSecondary }]}>Cargando historial…</Text>
          </View>
        ) : history.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="analytics-outline" size={28} color={colors.textSecondary} />
            <Text style={[s.emptyTxt, { color: colors.textSecondary }]}>
              No hay historial todavía. Escribe un símbolo arriba, o analiza acciones en Búsqueda
              para tenerlas aquí a mano.
            </Text>
          </View>
        ) : Platform.OS === 'web' ? (
          /* ── Selector nativo web ── */
          <View style={s.webRow}>
            <select
              value={selectedTicker}
              onChange={(e: any) => {
                const item = history.find(h => h.ticker === e.target.value);
                if (item) handleSelect(item);
              }}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 8,
                border: `1px solid ${colors.ruleStrong}`,
                backgroundColor: colors.inputBackground,
                fontSize: 14,
                color: colors.text,
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {/* Si el símbolo activo no está en el historial, se añade igual:
                  un desplegable cuyo valor seleccionado no figura entre sus
                  opciones se queda en blanco y parece que no hay nada elegido. */}
              {selectedTicker && !history.some(h => h.ticker === selectedTicker) && (
                <option value={selectedTicker}>{selectedTicker} — símbolo activo</option>
              )}
              {history.map(item => (
                <option key={item.id} value={item.ticker}>
                  {item.ticker} — {item.company_name}
                </option>
              ))}
            </select>
            <TouchableOpacity
              style={[s.analyzeBtn, { backgroundColor: colors.accent }, !selectedTicker && s.analyzeBtnOff]}
              onPress={handleAnalyze}
              disabled={!selectedTicker}
            >
              <Ionicons name="eye" size={16} color={colors.inkOnAccent} />
              <Text style={s.analyzeBtnTxt}>Analizar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Dropdown custom móvil ── */
          <View>
            <TouchableOpacity
              style={[
                s.dropdownTrigger,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: showDropdown ? colors.accent : (colors.ruleStrong),
                },
              ]}
              onPress={() => setShowDropdown(v => !v)}
              activeOpacity={0.7}
            >
              <View style={s.dropTriggerLeft}>
                {selectedTicker ? (
                  <>
                    <View style={[s.tickerPill, { backgroundColor: colors.accentWash }]}>
                      <Text style={[s.tickerPillTxt, { color: colors.accent }]}>{selectedTicker}</Text>
                    </View>
                    <Text style={[s.dropSelName, { color: colors.text }]} numberOfLines={1}>
                      {selectedName}
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>Elige una acción…</Text>
                )}
              </View>
              <Ionicons
                name={showDropdown ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {showDropdown && (
              <View style={[s.dropList, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {history.map((item, idx) => {
                  const rc = REC_COLOR[item.recommendation] ?? colors.inkFaint;
                  const active = item.ticker === selectedTicker;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        s.dropItem,
                        idx < history.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                        active && { backgroundColor: colors.accentWash },
                      ]}
                      onPress={() => handleSelect(item)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.dropItemBadge, { backgroundColor: rc + '20' }]}>
                        <Text style={[s.dropItemTicker, { color: rc }]}>{item.ticker}</Text>
                      </View>
                      <View style={s.dropItemInfo}>
                        <Text style={[s.dropItemName, { color: colors.text }]} numberOfLines={1}>
                          {item.company_name}
                        </Text>
                        <Text style={[s.dropItemMeta, { color: colors.textSecondary }]}>
                          {item.recommendation} · {item.favorable_percentage.toFixed(1)}% favorable
                        </Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={17} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TouchableOpacity
              style={[
                s.analyzeBtn,
                { backgroundColor: colors.accent, marginTop: 10 },
                !selectedTicker && s.analyzeBtnOff,
              ]}
              onPress={handleAnalyze}
              disabled={!selectedTicker}
            >
              <Ionicons name="eye" size={16} color={colors.inkOnAccent} />
              <Text style={s.analyzeBtnTxt}>Analizar ventana de Overton</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Info antes de analizar ── */}
      {selectedTicker && !showMatrix && (
        <View style={[s.infoPill, { backgroundColor: colors.accentWash }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
          <Text style={[s.infoPillTxt, { color: colors.text }]}>
            Pulsa{' '}
            <Text style={{ color: colors.accent, fontWeight: '700' }}>Analizar</Text>
            {' '}para calcular el análisis Overton de{' '}
            <Text style={{ color: colors.accent, fontWeight: '700' }}>{selectedTicker}</Text>
          </Text>
        </View>
      )}

      {/* ── Componente principal ── */}
      {showMatrix && selectedTicker && (
        <OvertonSignalMatrix_v4 ticker={selectedTicker} />
      )}
    </ScrollView>
  );
}

/* ── Estilos ── */
const s = StyleSheet.create({
  root:  { flex: 1 },
  inner: { padding: 14, paddingBottom: 50 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, marginTop: 4 },
  headerIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSub:   { fontSize: 12, marginTop: 2 },

  selectorCard: { borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1 },
  selectorLabel:{ fontSize: 12, fontWeight: '600', marginBottom: 10 },

  libreRow:   { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },
  // 44 de alto: el mínimo táctil, también en el botón cuadrado de al lado.
  libreInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  libreBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  loadTxt: { fontSize: 13 },

  emptyState: { alignItems: 'center', paddingVertical: 18, gap: 8 },
  emptyTxt:   { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  webRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },

  analyzeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                   gap: 7, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 10 },
  analyzeBtnOff: { opacity: 0.35 },
  analyzeBtnTxt: { fontSize: 14, fontWeight: '600' },

  dropdownTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                     paddingHorizontal: 13, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5 },
  dropTriggerLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  tickerPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  tickerPillTxt:   { fontSize: 12, fontWeight: '700' },
  dropSelName:     { fontSize: 14, flex: 1 },

  dropList:  { borderRadius: 10, borderWidth: 1, marginTop: 5 },
  dropItem:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13,
               paddingVertical: 10, gap: 10 },
  dropItemBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, minWidth: 52, alignItems: 'center' },
  dropItemTicker: { fontSize: 11, fontWeight: '700' },
  dropItemInfo:   { flex: 1 },
  dropItemName:   { fontSize: 13, fontWeight: '500' },
  dropItemMeta:   { fontSize: 11, marginTop: 1 },

  infoPill:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                 padding: 11, borderRadius: 10, marginBottom: 12 },
  infoPillTxt: { fontSize: 13, flex: 1, lineHeight: 18 },
});
