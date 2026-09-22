import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../contexts/ThemeContext";

interface VolumeDeltaRow {
  tf: string;
  buy_pct: number | null;
  sell_pct: number | null;
  vol: number;
  no_range: boolean;
  countdown: string;
}

interface Props {
  data?: VolumeDeltaRow[];
}

export default function VolumeDeltaAnalysis({ data }: Props) {
  const { colors } = useTheme();

  const analysis = useMemo(() => {
    if (!data || data.length === 0) return null;

    const getTF = (tf: string) => data.find(d => d.tf === tf);
    const tf1w = getTF("1W");
    const tf1d = getTF("1D");
    const tf4h = getTF("4H");
    const tf1h = getTF("1H");
    const tf15m = getTF("15m");
    const tf5m = getTF("5m");
    const tf1m = getTF("1m");

    const getSignal = (d?: VolumeDeltaRow) => {
      if (!d || d.buy_pct === null) return "neutral";
      if (d.buy_pct > 60) return "bull";
      if (d.buy_pct < 40) return "bear";
      return "neutral";
    };

    const totalVol = data.reduce((sum, d) => sum + (d.vol || 0), 0);
    const getWeight = (vol: number) => totalVol > 0 ? ((vol / totalVol) * 100).toFixed(0) : "0";

    const macroBull = [tf1d, tf1w].filter(d => getSignal(d) === "bull").length;
    const macroBear = [tf1d, tf1w].filter(d => getSignal(d) === "bear").length;
    const macroSignal = macroBull > macroBear ? "bull" : macroBear > macroBull ? "bear" : "neutral";
    const macroVol = (tf1d?.vol || 0) + (tf1w?.vol || 0);
    const macroWeight = getWeight(macroVol);

    const midBull = [tf1h, tf4h].filter(d => getSignal(d) === "bull").length;
    const midBear = [tf1h, tf4h].filter(d => getSignal(d) === "bear").length;
    const midSignal = midBull > midBear ? "bull" : midBear > midBull ? "bear" : "neutral";
    const midVol = (tf1h?.vol || 0) + (tf4h?.vol || 0);
    const midWeight = getWeight(midVol);

    const shortBull = [tf1m, tf5m, tf15m].filter(d => getSignal(d) === "bull").length;
    const shortBear = [tf1m, tf5m, tf15m].filter(d => getSignal(d) === "bear").length;
    const shortSignal = shortBull > shortBear ? "bull" : shortBear > shortBull ? "bear" : "neutral";
    const shortVol = (tf1m?.vol || 0) + (tf5m?.vol || 0) + (tf15m?.vol || 0);
    const shortWeight = getWeight(shortVol);

    const mainTrend = macroSignal === "bull" ? "ALCISTA" : macroSignal === "bear" ? "BAJISTA" : "LATERAL";
    const momentum = midSignal === "bull" ? "IMPULSO COMPRADOR" : midSignal === "bear" ? "CORRECCIÓN" : "INDECISO";
    const immediate = shortSignal === "bull" ? "REBOTE" : shortSignal === "bear" ? "VENTAS" : "MIXTA";

    const scenario = macroSignal === "bull" && midSignal === "bear"
      ? "Corrección dentro de tendencia alcista"
      : macroSignal === "bear" && midSignal === "bull"
      ? "Rebote dentro de tendencia bajista"
      : macroSignal === "bull" && midSignal === "bull"
      ? "Tendencia alcista confirmada"
      : macroSignal === "bear" && midSignal === "bear"
      ? "Tendencia bajista confirmada"
      : "Mercado en consolidación";

    return {
      macro: { signal: macroSignal, vol: macroVol, weight: macroWeight },
      mid: { signal: midSignal, vol: midVol, weight: midWeight },
      short: { signal: shortSignal, vol: shortVol, weight: shortWeight },
      mainTrend, momentum, immediate, scenario,
    };
  }, [data]);

  if (!analysis) return null;

  const signalColor = (s: string) => s === "bull" ? colors.bull : s === "bear" ? colors.bear : colors.muted;
  const signalBg = (s: string) => s === "bull" ? `${colors.bull}15` : s === "bear" ? `${colors.bear}15` : `${colors.muted}10`;
  const signalIcon = (s: string) => s === "bull" ? "🟢" : s === "bear" ? "🔴" : "⚪";

  return (
    <View style={styles.container}>
      {/* Principio clave */}
      <View style={[styles.principleCard, { backgroundColor: `${colors.accent}08`, borderLeftColor: colors.accent, borderLeftWidth: 4 }]}>
        <Text style={[styles.principleTitle, { color: colors.accent }]}>🧠 Principio clave</Text>
        <Text style={[styles.principleText, { color: colors.text }]}>Mayor volumen = Mayor peso</Text>
        <Text style={[styles.principleDesc, { color: colors.textSecondary }]}>La 1W puede tener 100x más volumen que 1m — es mucho más relevante</Text>
      </View>

      {/* Análisis por capas */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>📐 Análisis por capas</Text>

      <View style={styles.cardsRow}>
        {/* Macro */}
        <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: signalColor(analysis.macro.signal), borderWidth: 2, borderRadius: 10, padding: 12, marginRight: 6 }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardIcon, { fontSize: 16 }]}>🏗️</Text>
            <View style={[styles.signalPill, { backgroundColor: signalBg(analysis.macro.signal), borderColor: signalColor(analysis.macro.signal) }]}>
              <Text style={[styles.signalPillText, { color: signalColor(analysis.macro.signal) }]}>{signalIcon(analysis.macro.signal)}</Text>
            </View>
          </View>
          <Text style={[styles.cardTitle, { color: colors.text, textAlign: "center" }]}>Estructura macro</Text>
          <Text style={[styles.cardSub, { color: colors.textSecondary, textAlign: "center" }]}>1D + 1W</Text>
          <View style={styles.cardStats}>
            <Text style={[styles.statValue, { color: colors.text, textAlign: "center" }]}>{analysis.macro.weight}{"%"} volumen</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, textAlign: "center" }]}>{(analysis.macro.vol / 1000).toFixed(0)}k total</Text>
          </View>
          <Text style={[styles.cardInsight, { color: analysis.macro.signal === "bull" ? colors.bull : analysis.macro.signal === "bear" ? colors.bear : colors.muted, textAlign: "center" }]}>
            {analysis.macro.signal === "bull" ? "✅ Institucional comprando" : analysis.macro.signal === "bear" ? "⚠️ Institucional vendiendo" : "⚪ Sin dirección clara"}
          </Text>
        </View>

        {/* Medio */}
        <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: signalColor(analysis.mid.signal), borderWidth: 2, borderRadius: 10, padding: 12, marginLeft: 6 }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardIcon, { fontSize: 16 }]}>🔄</Text>
            <View style={[styles.signalPill, { backgroundColor: signalBg(analysis.mid.signal), borderColor: signalColor(analysis.mid.signal) }]}>
              <Text style={[styles.signalPillText, { color: signalColor(analysis.mid.signal) }]}>{signalIcon(analysis.mid.signal)}</Text>
            </View>
          </View>
          <Text style={[styles.cardTitle, { color: colors.text, textAlign: "center" }]}>Timeframe medio</Text>
          <Text style={[styles.cardSub, { color: colors.textSecondary, textAlign: "center" }]}>1H + 4H</Text>
          <View style={styles.cardStats}>
            <Text style={[styles.statValue, { color: colors.text, textAlign: "center" }]}>{analysis.mid.weight}{"%"} volumen</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, textAlign: "center" }]}>{(analysis.mid.vol / 1000).toFixed(0)}k total</Text>
          </View>
          <Text style={[styles.cardInsight, { color: analysis.mid.signal === "bull" ? colors.bull : analysis.mid.signal === "bear" ? colors.bear : colors.muted, textAlign: "center" }]}>
            {analysis.mid.signal === "bull" ? "⬆️ Momentum comprador" : analysis.mid.signal === "bear" ? "⬇️ Corrección en curso" : "⚪ Batalla compradores/vendedores"}
          </Text>
        </View>
      </View>

      {/* Corto */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: signalColor(analysis.short.signal), borderWidth: 2, borderRadius: 10, padding: 12, marginTop: 8 }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardIcon, { fontSize: 16 }]}>⚡</Text>
          <View style={[styles.signalPill, { backgroundColor: signalBg(analysis.short.signal), borderColor: signalColor(analysis.short.signal) }]}>
            <Text style={[styles.signalPillText, { color: signalColor(analysis.short.signal) }]}>{signalIcon(analysis.short.signal)}</Text>
          </View>
        </View>
        <Text style={[styles.cardTitle, { color: colors.text, textAlign: "center" }]}>Timeframe corto</Text>
        <Text style={[styles.cardSub, { color: colors.textSecondary, textAlign: "center" }]}>1m + 5m + 15m</Text>
        <View style={styles.cardStatsRow}>
          <Text style={[styles.statValue, { color: colors.text, textAlign: "center" }]}>{analysis.short.weight}{"%"} volumen</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>•</Text>
          <Text style={[styles.statValue, { color: colors.text, textAlign: "center" }]}>{(analysis.short.vol / 1000).toFixed(0)}k total</Text>
        </View>
        <Text style={[styles.cardInsight, { color: analysis.short.signal === "bull" ? colors.bull : analysis.short.signal === "bear" ? colors.bear : colors.muted, textAlign: "center" }]}>
          {analysis.short.signal === "bull" ? "📈 Posible rebote inmediato" : analysis.short.signal === "bear" ? "📉 Presión vendedora" : "⚪ Ruido intradiario"}
        </Text>
      </View>

      {/* Conclusión */}
      <View style={[styles.conclusionCard, { backgroundColor: `${colors.accent}08`, borderColor: colors.accent, borderWidth: 2, borderRadius: 10, padding: 14, marginTop: 10 }]}>
        <Text style={[styles.conclusionTitle, { color: colors.accent, textAlign: "center" }]}>🎯 Conclusión</Text>
        <View style={styles.conclusionGrid}>
          <View style={styles.conclusionItem}>
            <Text style={[styles.conclusionLabel, { color: colors.textSecondary, textAlign: "center" }]}>Tendencia</Text>
            <Text style={[styles.conclusionValue, { color: signalColor(analysis.macro.signal), fontWeight: "800", textAlign: "center" }]}>{analysis.mainTrend}</Text>
          </View>
          <View style={styles.conclusionDivider} />
          <View style={styles.conclusionItem}>
            <Text style={[styles.conclusionLabel, { color: colors.textSecondary, textAlign: "center" }]}>Momento</Text>
            <Text style={[styles.conclusionValue, { color: signalColor(analysis.mid.signal), fontWeight: "700", textAlign: "center" }]}>{analysis.momentum}</Text>
          </View>
          <View style={styles.conclusionDivider} />
          <View style={styles.conclusionItem}>
            <Text style={[styles.conclusionLabel, { color: colors.textSecondary, textAlign: "center" }]}>Señal</Text>
            <Text style={[styles.conclusionValue, { color: signalColor(analysis.short.signal), fontWeight: "700", textAlign: "center" }]}>{analysis.immediate}</Text>
          </View>
        </View>
        <Text style={[styles.scenarioText, { color: colors.text, textAlign: "center" }]}>{analysis.scenario}</Text>
      </View>

      {/* Recomendaciones */}
      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 12, textAlign: "center" }]}>💡 ¿Qué hacer?</Text>
      <View style={styles.recGrid}>
        <View style={[styles.recCard, { backgroundColor: `${colors.bull}08`, borderColor: colors.bull, borderWidth: 1, borderRadius: 8, padding: 10, flex: 1, marginRight: 5 }]}>
          <Text style={[styles.recTitle, { color: colors.bull, fontWeight: "800", fontSize: 10, textAlign: "center" }]}>Swing/Largo</Text>
          <Text style={[styles.recAction, { color: colors.text, fontWeight: "700", fontSize: 11, textAlign: "center" }]}>🟢 Buscar entrada</Text>
          <Text style={[styles.recReason, { color: colors.textSecondary, fontSize: 9, textAlign: "center" }]}>tendencia alcista</Text>
        </View>
        <View style={[styles.recCard, { backgroundColor: `${colors.warn}08`, borderColor: colors.warn, borderWidth: 1, borderRadius: 8, padding: 10, flex: 1, marginLeft: 5 }]}>
          <Text style={[styles.recTitle, { color: colors.warn, fontWeight: "800", fontSize: 10, textAlign: "center" }]}>Intradía</Text>
          <Text style={[styles.recAction, { color: colors.text, fontWeight: "700", fontSize: 11, textAlign: "center" }]}>🟢 Operar en dirección</Text>
          <Text style={[styles.recReason, { color: colors.textSecondary, fontSize: 9, textAlign: "center" }]}>alineación TF</Text>
        </View>
      </View>
      <View style={[styles.recCard, { backgroundColor: `${colors.purple}08`, borderColor: colors.purple, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 6 }]}>
        <Text style={[styles.recTitle, { color: colors.purple, fontWeight: "800", fontSize: 10, textAlign: "center" }]}>Scalper</Text>
        <Text style={[styles.recAction, { color: colors.text, fontWeight: "700", fontSize: 11, textAlign: "center" }]}>🟢 Scalp largo</Text>
        <Text style={[styles.recReason, { color: colors.textSecondary, fontSize: 9, textAlign: "center" }]}>momentum corto favorable</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8, paddingHorizontal: 4 },
  principleCard: { padding: 12, borderRadius: 8, marginBottom: 10 },
  principleTitle: { fontSize: 11, fontWeight: "800", marginBottom: 2 },
  principleText: { fontSize: 13, fontWeight: "700", marginBottom: 3 },
  principleDesc: { fontSize: 10, fontStyle: "italic" },
  sectionTitle: { fontSize: 13, fontWeight: "800", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  cardsRow: { flexDirection: "row" },
  card: { padding: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardIcon: { fontSize: 16 },
  signalPill: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  signalPillText: { fontSize: 12, fontWeight: "800" },
  cardTitle: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  cardSub: { fontSize: 10, marginBottom: 8 },
  cardStats: { flexDirection: "row", alignItems: "baseline", marginBottom: 6 },
  cardStatsRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  statValue: { fontSize: 13, fontWeight: "700" },
  statLabel: { fontSize: 10, marginHorizontal: 6 },
  cardInsight: { fontSize: 10, fontWeight: "600", lineHeight: 1.4 },
  conclusionCard: { padding: 14 },
  conclusionTitle: { fontSize: 12, fontWeight: "800", marginBottom: 10, textTransform: "uppercase" },
  conclusionGrid: { flexDirection: "row", marginBottom: 10 },
  conclusionItem: { flex: 1, alignItems: "center" },
  conclusionDivider: { width: 1, backgroundColor: "rgba(128,128,128,0.3)", marginHorizontal: 4 },
  conclusionLabel: { fontSize: 9, marginBottom: 3, textTransform: "uppercase" },
  conclusionValue: { fontSize: 12 },
  scenarioText: { fontSize: 11, lineHeight: 1.5, fontStyle: "italic" },
  recGrid: { flexDirection: "row" },
  recCard: { padding: 10 },
  recTitle: { fontSize: 10, marginBottom: 4 },
  recAction: { fontSize: 11, marginBottom: 2 },
  recReason: { fontSize: 9 },
});
