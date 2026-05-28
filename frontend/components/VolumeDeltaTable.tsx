import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
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

export default function VolumeDeltaTable({ data }: Props) {
  const { colors } = useTheme();

  const fmtVol = (vol: number): string => {
    if (!vol || vol === 0) return "—";
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}k`;
    return `${vol.toFixed(0)}`;
  };

  const getSignal = (buy: number | null, sell: number | null): { label: string; color: string; bg: string } => {
    if (buy === null || sell === null) return { label: "─", color: colors.textSecondary, bg: `${colors.muted}10` };
    if (buy >= 70) return { label: "Compra fuerte", color: colors.bull, bg: `${colors.bull}15` };
    if (buy >= 55) return { label: "Compra", color: colors.bull, bg: `${colors.bull}10` };
    if (buy >= 45) return { label: "Neutral", color: colors.muted, bg: `${colors.muted}10` };
    if (buy >= 30) return { label: "Venta", color: colors.bear, bg: `${colors.bear}10` };
    return { label: "Venta fuerte", color: colors.bear, bg: `${colors.bear}15` };
  };

  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 20 }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Cargando Volume Delta...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12 }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.tickerTitle, { color: colors.text, fontWeight: "800", fontSize: 15 }]}>Volume Delta Multi-Timeframe</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: 11, marginTop: 3 }]}>{"%"} Volumen Compra/Venta por Timeframe</Text>
        </View>
      </View>

      <View style={[styles.tableHeader, { borderBottomColor: colors.border, backgroundColor: `${colors.accent}05` }]}>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 65, textAlign: "center" }]}>⏳</Text>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 50, textAlign: "center" }]}>TF</Text>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 65, textAlign: "right", paddingRight: 8 }]}>VOL</Text>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 55, textAlign: "right", paddingRight: 8 }]}>BUY {"%"}</Text>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 55, textAlign: "right", paddingRight: 8 }]}>SELL {"%"}</Text>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 110, textAlign: "right", paddingRight: 12 }]}>SEÑAL</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.tableBody}>
          {data.map((row, index) => {
            const signal = getSignal(row.buy_pct, row.sell_pct);
            return (
              <View
                key={index}
                style={[
                  styles.row,
                  { borderBottomColor: colors.border },
                  row.no_range ? { opacity: 0.4 } : {},
                  index % 2 === 0 ? { backgroundColor: `${colors.accent}03` } : {}
                ]}
              >
                <View style={[styles.cell, { width: 65, alignItems: "center" }]}>
                  <Text style={[styles.cellText, { color: colors.warn, fontWeight: "600", fontSize: 11 }]}>{row.countdown}</Text>
                </View>

                <View style={[styles.cell, { width: 50, alignItems: "center" }]}>
                  <Text
                    style={[
                      styles.tfText,
                      {
                        color: row.no_range ? colors.textSecondary : colors.text,
                        fontWeight: "800",
                        fontSize: 12,
                      },
                    ]}
                  >
                    {row.tf}
                  </Text>
                </View>

                <View style={[styles.cell, { width: 65, alignItems: "flex-end", paddingRight: 8 }]}>
                  <Text style={[styles.cellText, { color: colors.text, fontWeight: "600" }]}>{fmtVol(row.vol)}</Text>
                </View>

                <View style={[styles.cell, { width: 55, alignItems: "flex-end", paddingRight: 8 }]}>
                  {row.no_range || row.buy_pct === null ? (
                    <Text style={[styles.cellText, { color: colors.textSecondary }]}>—</Text>
                  ) : (
                    <Text
                      style={[
                        styles.pctText,
                        { color: row.buy_pct > 50 ? colors.bull : row.buy_pct < 50 ? colors.bear : colors.text },
                      ]}
                    >
                      {row.buy_pct}
                    </Text>
                  )}
                </View>

                <View style={[styles.cell, { width: 55, alignItems: "flex-end", paddingRight: 8 }]}>
                  {row.no_range || row.sell_pct === null ? (
                    <Text style={[styles.cellText, { color: colors.textSecondary }]}>—</Text>
                  ) : (
                    <Text
                      style={[
                        styles.pctText,
                        { color: row.sell_pct > 50 ? colors.bear : row.sell_pct < 50 ? colors.bull : colors.text },
                      ]}
                    >
                      {row.sell_pct}
                    </Text>
                  )}
                </View>

                <View style={[styles.cell, { width: 110, alignItems: "flex-end", paddingRight: 12 }]}>
                  {row.no_range ? (
                    <Text style={[styles.cellText, { color: colors.textSecondary, fontSize: 11 }]}>Sin datos</Text>
                  ) : (
                    <View style={[styles.signalBadge, { backgroundColor: signal.bg, borderColor: signal.color + "30" }]}>
                      <Text style={[styles.signalText, { color: signal.color }]}>{signal.label}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: `${colors.accent}05` }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          ℹ Volume Delta: {"%"} de volumen de compra/venta basado en posición del close dentro del rango H-L
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8, overflow: "hidden" },
  loadingText: { fontSize: 12, textAlign: "center" },
  header: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  tickerTitle: { fontSize: 15 },
  subtitle: { fontSize: 11 },
  tableHeader: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1 },
  columnHeader: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  tableBody: { paddingHorizontal: 14 },
  row: { flexDirection: "row", paddingVertical: 9, borderBottomWidth: 1 },
  cell: { paddingHorizontal: 4 },
  cellText: { fontSize: 12 },
  tfText: { fontSize: 12 },
  pctText: { fontSize: 12, fontWeight: "600" },
  signalBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  signalText: { fontSize: 11, fontWeight: "700" },
  footer: { paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1 },
  footerText: { fontSize: 10, fontStyle: "italic" },
});
