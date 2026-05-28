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
        <Text style={[styles.tickerTitle, { color: colors.text }]}>Volume Delta Multi-Timeframe</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>% Volumen Compra/Venta por Timeframe</Text>
      </View>

      <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 70, textAlign: "right" }]}>⏳</Text>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 50, textAlign: "center" }]}>TF</Text>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 70, textAlign: "right" }]}>Vol</Text>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 50, textAlign: "right" }]}>Buy %</Text>
        <Text style={[styles.columnHeader, { color: colors.textSecondary, width: 50, textAlign: "right" }]}>Sell %</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.tableBody}>
          {data.map((row, index) => (
            <View
              key={index}
              style={[
                styles.row,
                { borderBottomColor: colors.border },
                row.no_range ? { opacity: 0.5 } : {}
              ]}
            >
              <View style={[styles.cell, { width: 70, alignItems: "flex-end" }]}>
                <Text style={[styles.cellText, { color: colors.warn }]}>{row.countdown}</Text>
              </View>

              <View style={[styles.cell, { width: 50, alignItems: "center" }]}>
                <Text
                  style={[
                    styles.cellText,
                    {
                      color: row.no_range
                        ? colors.textSecondary
                        : row.buy_pct && row.sell_pct && row.buy_pct > row.sell_pct
                        ? colors.bull
                        : colors.bear,
                      fontWeight: row.buy_pct && row.buy_pct > row.sell_pct ? "700" : "400",
                    },
                  ]}
                >
                  {row.tf}
                </Text>
              </View>

              <View style={[styles.cell, { width: 70, alignItems: "flex-end" }]}>
                <Text style={[styles.cellText, { color: colors.text }]}>{fmtVol(row.vol)}</Text>
              </View>

              <View style={[styles.cell, { width: 50, alignItems: "flex-end" }]}>
                {row.no_range ? (
                  <Text style={[styles.cellText, { color: colors.textSecondary }]}>H=L</Text>
                ) : (
                  <Text
                    style={[
                      styles.cellText,
                      {
                        color: row.buy_pct && row.buy_pct > 50 ? colors.bull : row.buy_pct && row.buy_pct < 50 ? colors.bear : colors.text,
                        fontWeight: row.buy_pct && row.buy_pct > 50 ? "700" : "400",
                      },
                    ]}
                  >
                    {row.buy_pct ?? "—"}
                  </Text>
                )}
              </View>

              <View style={[styles.cell, { width: 50, alignItems: "flex-end" }]}>
                {row.no_range ? (
                  <Text style={[styles.cellText, { color: colors.textSecondary }]}>H=L</Text>
                ) : (
                  <Text
                    style={[
                      styles.cellText,
                      {
                        color: row.sell_pct && row.sell_pct > 50 ? colors.bear : row.sell_pct && row.sell_pct < 50 ? colors.bull : colors.text,
                        fontWeight: row.sell_pct && row.sell_pct > 50 ? "700" : "400",
                      },
                    ]}
                  >
                    {row.sell_pct ?? "—"}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          ℹ Volume Delta: % de volumen de compra/venta basado en posición del close dentro del rango H-L
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8, overflow: "hidden" },
  loadingText: { fontSize: 12, textAlign: "center" },
  header: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  tickerTitle: { fontSize: 14, fontWeight: "700" },
  subtitle: { fontSize: 10, marginTop: 2 },
  tableHeader: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  columnHeader: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  tableBody: { paddingHorizontal: 12 },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1 },
  cell: { paddingHorizontal: 4 },
  cellText: { fontSize: 12, fontWeight: "500" },
  footer: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  footerText: { fontSize: 10, fontStyle: "italic" },
});
