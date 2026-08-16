import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity } from "react-native";
import { Svg, G, Line, Rect, Circle, Text as SvgText, Path } from "react-native-svg";
import axios from "axios";
import { useTheme } from "../contexts/ThemeContext";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - 40;
const CHART_HEIGHT = 400;
const PADDING = { top: 20, right: 50, bottom: 40, left: 10 };

interface IchimokuPoint {
  date: string;
  close: number;
  tenkan: number | null;
  kijun: number | null;
  senkou_a: number | null;
  senkou_b: number | null;
  chikou: number | null;
}

interface CloudZone {
  x0: number;
  x1: number;
  y_top: number;
  y_bottom: number;
  color: "bull" | "bear";
}

interface IchimokuData {
  ticker: string;
  current_price: number;
  ichimoku: {
    signal: string;
    price_vs_cloud: string;
    score: number;
    tenkan: number;
    kijun: number;
    senkou_a: number;
    senkou_b: number;
    chikou_free: boolean;
    /** "Libre" u "Obstruido" — el backend lo envía junto a chikou_free. */
    chikou_status: string;
    cloud_color: string;
    tk_cross: string;
  };
  chart_data: IchimokuPoint[];
  cloud_zones: CloudZone[];
  veredicto: {
    verdict: string;
    description: string;
    alcistas: string[];
    bajistas: string[];
    score: number;
  };
}

export default function IchimokuChart({ ticker }: { ticker: string }) {
  const { colors } = useTheme();
  const [data, setData] = useState<IchimokuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState<IchimokuPoint | null>(null);
  const [showCloud, setShowCloud] = useState(true);
  const [showTK, setShowTK] = useState(true);
  const [showChikou, setShowChikou] = useState(true);

  useEffect(() => {
    loadIchimoku();
  }, [ticker]);

  const loadIchimoku = async () => {
    try {
      setLoading(true);
      const { data: response } = await axios.get(`${BACKEND_URL}/api/ichimoku-chart/${ticker}`);
      setData(response);
    } catch (error) {
      console.error("Error loading Ichimoku:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Cargando Ichimoku...</Text>
      </View>
    );
  }

  const chartData = data.chart_data.slice(-80); // Últimos 80 puntos
  const cloudZones = data.cloud_zones.slice(-80);

  // Escalas
  const allPrices = chartData
    .flatMap((p) => [
      p.close,
      p.tenkan ?? 0,
      p.kijun ?? 0,
      p.senkou_a ?? 0,
      p.senkou_b ?? 0,
    ])
    .filter((v) => v > 0);

  const minPrice = Math.min(...allPrices) * 0.98;
  const maxPrice = Math.max(...allPrices) * 1.02;
  const priceRange = maxPrice - minPrice;

  const xScale = (i: number) => PADDING.left + (i / (chartData.length - 1)) * (CHART_WIDTH - PADDING.left - PADDING.right);
  const yScale = (price: number) => PADDING.top + (1 - (price - minPrice) / priceRange) * (CHART_HEIGHT - PADDING.top - PADDING.bottom);

  // Colores
  const bullColor = "#22c55e";
  const bearColor = "#ef4444";
  const tenkanColor = "#3b82f6";
  const kijunColor = "#f97316";
  const chikouColor = "#8b5cf6";

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Ichimoku Cloud - {data.ticker}</Text>
        <Text style={[styles.price, { color: colors.text }]}>${data.current_price.toFixed(2)}</Text>
      </View>

      {/* Controles */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={() => setShowCloud(!showCloud)} style={[styles.btn, { backgroundColor: showCloud ? bullColor : colors.card }]}>
          <Text style={styles.btnText}>Nube {showCloud ? "✓" : "✗"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowTK(!showTK)} style={[styles.btn, { backgroundColor: showTK ? tenkanColor : colors.card }]}>
          <Text style={styles.btnText}>TK {showTK ? "✓" : "✗"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowChikou(!showChikou)} style={[styles.btn, { backgroundColor: showChikou ? chikouColor : colors.card }]}>
          <Text style={styles.btnText}>Chikou {showChikou ? "✓" : "✗"}</Text>
        </TouchableOpacity>
      </View>

      {/* Gráfico SVG */}
      <View style={styles.chartContainer}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          {/* Ejes */}
          <Line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={CHART_HEIGHT - PADDING.bottom} stroke={colors.text} strokeWidth="1" opacity="0.3" />
          <Line x1={PADDING.left} y1={CHART_HEIGHT - PADDING.bottom} x2={CHART_WIDTH - PADDING.right} y2={CHART_HEIGHT - PADDING.bottom} stroke={colors.text} strokeWidth="1" opacity="0.3" />

          {/* Nube (Cloud Zones) */}
          {showCloud &&
            cloudZones.map((zone, i) => (
              <Rect
                key={i}
                x={xScale(zone.x0)}
                y={yScale(zone.y_top)}
                width={xScale(zone.x1) - xScale(zone.x0) + 1}
                height={yScale(zone.y_bottom) - yScale(zone.y_top)}
                fill={zone.color === "bull" ? bullColor : bearColor}
                opacity="0.2"
              />
            ))}

          {/* Línea Kijun */}
          {showTK && (
            <Path
              d={chartData
                .map((p, i) => (p.kijun ? `${i === 0 || !chartData[i - 1]?.kijun ? "M" : "L"}${xScale(i)},${yScale(p.kijun)}` : ""))
                .join(" ")}
              fill="none"
              stroke={kijunColor}
              strokeWidth="2"
            />
          )}

          {/* Línea Tenkan */}
          {showTK && (
            <Path
              d={chartData
                .map((p, i) => (p.tenkan ? `${i === 0 || !chartData[i - 1]?.tenkan ? "M" : "L"}${xScale(i)},${yScale(p.tenkan)}` : ""))
                .join(" ")}
              fill="none"
              stroke={tenkanColor}
              strokeWidth="2"
            />
          )}

          {/* Precio (Candles simplificados como línea) */}
          <Path
            d={chartData.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(i)},${yScale(p.close)}`).join(" ")}
            fill="none"
            stroke={colors.text}
            strokeWidth="2"
          />

          {/* Chikou Span */}
          {showChikou && (
            <Path
              d={chartData
                .map((p, i) => (p.chikou ? `${i === 0 || !chartData[i - 1]?.chikou ? "M" : "L"}${xScale(i)},${yScale(p.chikou)}` : ""))
                .join(" ")}
              fill="none"
              stroke={chikouColor}
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )}

          {/* Puntos interactivos */}
          {chartData.map((p, i) => (
            <Circle
              key={i}
              cx={xScale(i)}
              cy={yScale(p.close)}
              r="4"
              fill={colors.primary}
              opacity="0"
              onPress={() => setSelectedPoint(p)}
            />
          ))}

          {/* Etiquetas de precio */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const price = minPrice + ratio * priceRange;
            const y = yScale(price);
            return (
              <SvgText key={ratio} x={CHART_WIDTH - PADDING.right + 5} y={y + 4} fontSize="10" fill={colors.textSecondary}>
                ${price.toFixed(0)}
              </SvgText>
            );
          })}
        </Svg>
      </View>

      {/* Leyenda */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: tenkanColor }]} />
          <Text style={[styles.legendText, { color: colors.text }]}>Tenkan (9)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: kijunColor }]} />
          <Text style={[styles.legendText, { color: colors.text }]}>Kijun (26)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: bullColor, opacity: 0.5 }]} />
          <Text style={[styles.legendText, { color: colors.text }]}>Nube Alcista</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: bearColor, opacity: 0.5 }]} />
          <Text style={[styles.legendText, { color: colors.text }]}>Nube Bajista</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: chikouColor }]} />
          <Text style={[styles.legendText, { color: colors.text }]}>Chikou</Text>
        </View>
      </View>

      {/* Panel de análisis */}
      <View style={[styles.analysisPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.analysisTitle, { color: colors.text }]}>Análisis Ichimoku</Text>

        <View style={styles.metricRow}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>TK Cross:</Text>
          <Text style={[styles.metricValue, { color: data.ichimoku.tk_cross === "Alcista" ? bullColor : bearColor }]}>
            {data.ichimoku.tk_cross}
          </Text>
        </View>

        <View style={styles.metricRow}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Nube:</Text>
          <Text style={[styles.metricValue, { color: data.ichimoku.cloud_color === "Verde" ? bullColor : bearColor }]}>
            {data.ichimoku.cloud_color}
          </Text>
        </View>

        <View style={styles.metricRow}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Precio vs Nube:</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>{data.ichimoku.price_vs_cloud}</Text>
        </View>

        <View style={styles.metricRow}>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Chikou:</Text>
          <Text style={[styles.metricValue, { color: data.ichimoku.chikou_free ? bullColor : bearColor }]}>
            {data.ichimoku.chikou_status}
          </Text>
        </View>

        <View style={[styles.verdictBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.verdictTitle, { color: data.veredicto.score >= 7.5 ? bullColor : data.veredicto.score <= 2.5 ? bearColor : colors.text }]}>
            {data.veredicto.verdict}
          </Text>
          <Text style={[styles.verdictDesc, { color: colors.textSecondary }]}>{data.veredicto.description}</Text>
        </View>

        {/* Puntos clave */}
        <View style={styles.keyLevels}>
          <Text style={[styles.levelTitle, { color: colors.text }]}>Niveles Clave:</Text>
          <View style={styles.levelRow}>
            <Text style={[styles.levelLabel, { color: colors.textSecondary }]}>Tenkan:</Text>
            <Text style={[styles.levelValue, { color: colors.text }]}>${data.ichimoku.tenkan.toFixed(2)}</Text>
          </View>
          <View style={styles.levelRow}>
            <Text style={[styles.levelLabel, { color: colors.textSecondary }]}>Kijun:</Text>
            <Text style={[styles.levelValue, { color: colors.text }]}>${data.ichimoku.kijun.toFixed(2)}</Text>
          </View>
          <View style={styles.levelRow}>
            <Text style={[styles.levelLabel, { color: colors.textSecondary }]}>Nube:</Text>
            <Text style={[styles.levelValue, { color: colors.text }]}>
              ${Math.min(data.ichimoku.senkou_a, data.ichimoku.senkou_b).toFixed(2)} - ${Math.max(data.ichimoku.senkou_a, data.ichimoku.senkou_b).toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Punto seleccionado */}
      {selectedPoint && (
        <View style={[styles.tooltip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>{selectedPoint.date}</Text>
          <Text style={[styles.tooltipPrice, { color: colors.text }]}>Close: ${selectedPoint.close.toFixed(2)}</Text>
          {selectedPoint.tenkan && <Text style={{ color: tenkanColor }}>TK: ${selectedPoint.tenkan.toFixed(2)}</Text>}
          {selectedPoint.kijun && <Text style={{ color: kijunColor }}>KJ: ${selectedPoint.kijun.toFixed(2)}</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  price: {
    fontSize: 20,
    fontWeight: "800",
  },
  controls: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  chartContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
  },
  analysisPanel: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  analysisTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
  },
  metricLabel: {
    fontSize: 13,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  verdictBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  verdictTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  verdictDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  keyLevels: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.1)",
  },
  levelTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  levelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  levelLabel: {
    fontSize: 12,
  },
  levelValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  tooltip: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  tooltipDate: {
    fontSize: 11,
    marginBottom: 4,
  },
  tooltipPrice: {
    fontSize: 14,
    fontWeight: "700",
  },
});
