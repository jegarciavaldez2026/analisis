import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator } from "react-native";
import { Svg, G, Line, Rect, Circle, Text as SvgText, Path, Defs, ClipPath } from "react-native-svg";
import axios from "axios";
import { useTheme } from "../contexts/ThemeContext";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - 32;
const CHART_HEIGHT = 350;
const PADDING = { top: 15, right: 55, bottom: 35, left: 8 };

interface IchimokuPoint {
  date: string;
  close: number;
  tenkan: number | null;
  kijun: number | null;
  senkou_a: number | null;
  senkou_b: number | null;
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

interface Props {
  ticker: string;
  onClose?: () => void;
}

export default function IchimokuCloudChart({ ticker, onClose }: Props) {
  const { colors } = useTheme();
  const [data, setData] = useState<IchimokuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState<IchimokuPoint | null>(null);
  const [showCloud, setShowCloud] = useState(true);
  const [showLines, setShowLines] = useState(true);

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
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Cargando Ichimoku...</Text>
      </View>
    );
  }

  const chartData = data.chart_data.slice(-70);
  const cloudZones = data.cloud_zones.slice(-70);

  // Calcular escalas
  const allPrices = chartData
    .flatMap((p) => [p.close, p.tenkan ?? 0, p.kijun ?? 0, p.senkou_a ?? 0, p.senkou_b ?? 0])
    .filter((v) => v > 0);

  const minPrice = Math.min(...allPrices) * 0.97;
  const maxPrice = Math.max(...allPrices) * 1.03;
  const priceRange = maxPrice - minPrice;

  const xScale = (i: number) => PADDING.left + (i / (chartData.length - 1)) * (CHART_WIDTH - PADDING.left - PADDING.right);
  const yScale = (price: number) => PADDING.top + (1 - (price - minPrice) / priceRange) * (CHART_HEIGHT - PADDING.top - PADDING.bottom);

  // Colores
  const bullColor = "#22c55e";
  const bearColor = "#ef4444";
  const tenkanColor = "#3b82f6";
  const kijunColor = "#f97316";

  // Generar paths
  const createPath = (getter: (p: IchimokuPoint) => number | null) => {
    return chartData
      .map((p, i) => {
        const val = getter(p);
        if (!val) return "";
        return `${i === 0 || !getter(chartData[i - 1]) ? "M" : "L"}${xScale(i)},${yScale(val)}`;
      })
      .filter((s) => s)
      .join(" ");
  };

  const pricePath = createPath((p) => p.close);
  const tenkanPath = createPath((p) => p.tenkan);
  const kijunPath = createPath((p) => p.kijun);

  // Score gauge angle
  const scoreAngle = (data.ichimoku.score / 10) * 180 - 90;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const needleX = 60 + 42 * Math.cos(toRad(scoreAngle - 90));
  const needleY = 60 + 42 * Math.sin(toRad(scoreAngle - 90));

  const scoreColor = data.ichimoku.score >= 7.5 ? bullColor : data.ichimoku.score <= 2.5 ? bearColor : "#eab308";
  const scoreLabel = data.ichimoku.score >= 7.5 ? "ALCISTA" : data.ichimoku.score <= 2.5 ? "BAJISTA" : "NEUTRAL";

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.ticker, { color: colors.text }]}>{data.ticker}</Text>
          <Text style={[styles.price, { color: colors.text }]}>${data.current_price.toFixed(2)}</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Score Gauge */}
      <View style={[styles.gaugeContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.gaugeTitle, { color: colors.textSecondary }]}>Ichimoku Score</Text>
        <Svg width="120" height="72" viewBox="0 0 120 70">
          {/* Background arc */}
          <Path d={`M18,62 A42,42 0 0,1 102,62`} fill="none" stroke={colors.border} strokeWidth="10" />
          {/* Colored zones */}
          <Path d={`M18,62 A42,42 0 0,1 46,24`} fill="none" stroke={bearColor} strokeWidth="10" opacity="0.3" />
          <Path d={`M46,24 A42,42 0 0,1 74,24`} fill="none" stroke="#eab308" strokeWidth="10" opacity="0.3" />
          <Path d={`M74,24 A42,42 0 0,1 102,62`} fill="none" stroke={bullColor} strokeWidth="10" opacity="0.3" />
          {/* Needle */}
          <Line x1="60" y1="62" x2={needleX.toFixed(1)} y2={needleY.toFixed(1)} stroke={scoreColor} strokeWidth="3" strokeLinecap="round" />
          <Circle cx="60" cy="62" r="5" fill={scoreColor} />
          {/* Score value */}
          <SvgText x="60" y="52" textAnchor="middle" fontSize="18" fontWeight="800" fill={scoreColor}>
            {data.ichimoku.score.toFixed(1)}
          </SvgText>
        </Svg>
        <Text style={[styles.gaugeLabel, { color: scoreColor }]}>{scoreLabel}</Text>
      </View>

      {/* Controles */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={() => setShowCloud(!showCloud)} style={[styles.controlBtn, { backgroundColor: showCloud ? bullColor : colors.border }]}>
          <Text style={styles.controlBtnText}>Nube {showCloud ? "✓" : "✗"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowLines(!showLines)} style={[styles.controlBtn, { backgroundColor: showLines ? tenkanColor : colors.border }]}>
          <Text style={styles.controlBtnText}>Líneas {showLines ? "✓" : "✗"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={loadIchimoku} style={[styles.controlBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.controlBtnText}>⟳</Text>
        </TouchableOpacity>
      </View>

      {/* Gráfico */}
      <View style={[styles.chartContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = PADDING.top + ratio * (CHART_HEIGHT - PADDING.top - PADDING.bottom);
            return <Line key={i} x1={PADDING.left} y1={y} x2={CHART_WIDTH - PADDING.right} y2={y} stroke={colors.border} strokeWidth="1" opacity="0.5" />;
          })}

          {/* Cloud zones */}
          {showCloud &&
            cloudZones.map((zone, i) => (
              <Rect
                key={i}
                x={xScale(zone.x0)}
                y={yScale(zone.y_top)}
                width={Math.max(xScale(zone.x1) - xScale(zone.x0) + 1, 1)}
                height={Math.max(yScale(zone.y_bottom) - yScale(zone.y_top), 1)}
                fill={zone.color === "bull" ? bullColor : bearColor}
                opacity="0.2"
              />
            ))}

          {/* Kijun line */}
          {showLines && <Path d={kijunPath} fill="none" stroke={kijunColor} strokeWidth="2" strokeDasharray="5,3" />}

          {/* Tenkan line */}
          {showLines && <Path d={tenkanPath} fill="none" stroke={tenkanColor} strokeWidth="2" />}

          {/* Price line */}
          <Path d={pricePath} fill="none" stroke={colors.text} strokeWidth="2.5" />

          {/* Interactive points */}
          {chartData.map((p, i) => (
            <Circle
              key={i}
              cx={xScale(i)}
              cy={yScale(p.close)}
              r="5"
              fill={colors.primary}
              opacity="0"
              onPress={() => setSelectedPoint(p)}
            />
          ))}

          {/* Price labels */}
          {[0, 0.5, 1].map((ratio) => {
            const price = minPrice + ratio * priceRange;
            const y = yScale(price);
            return (
              <SvgText key={ratio} x={CHART_WIDTH - PADDING.right + 4} y={y + 4} fontSize="9" fill={colors.textSecondary}>
                ${price.toFixed(0)}
              </SvgText>
            );
          })}
        </Svg>

        {/* Leyenda */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.text }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Precio</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: tenkanColor }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Tenkan</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: kijunColor }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Kijun</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: bullColor, opacity: 0.5 }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Nube ↑</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: bearColor, opacity: 0.5 }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Nube ↓</Text>
          </View>
        </View>
      </View>

      {/* Panel de análisis */}
      <View style={[styles.analysisPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.panelTitle, { color: colors.text }]}>Análisis Ichimoku</Text>

        {/* Componentes */}
        <View style={styles.componentsGrid}>
          <View style={[styles.componentBox, { backgroundColor: colors.background, borderColor: data.ichimoku.tk_cross === "Alcista" ? bullColor : bearColor }]}>
            <Text style={[styles.componentLabel, { color: colors.textSecondary }]}>TK Cross</Text>
            <Text style={[styles.componentValue, { color: data.ichimoku.tk_cross === "Alcista" ? bullColor : bearColor }]}>
              {data.ichimoku.tk_cross === "Alcista" ? "↑" : "↓"} {data.ichimoku.tk_cross}
            </Text>
            <Text style={[styles.componentSub, { color: colors.textSecondary }]}>
              ${data.ichimoku.tenkan.toFixed(2)} / ${data.ichimoku.kijun.toFixed(2)}
            </Text>
          </View>

          <View style={[styles.componentBox, { backgroundColor: colors.background, borderColor: data.ichimoku.cloud_color === "Verde" ? bullColor : bearColor }]}>
            <Text style={[styles.componentLabel, { color: colors.textSecondary }]}>Nube (Kumo)</Text>
            <Text style={[styles.componentValue, { color: data.ichimoku.cloud_color === "Verde" ? bullColor : bearColor }]}>
              {data.ichimoku.cloud_color === "Verde" ? "↑" : "↓"} {data.ichimoku.cloud_color}
            </Text>
            <Text style={[styles.componentSub, { color: colors.textSecondary }]}>
              ${Math.min(data.ichimoku.senkou_a, data.ichimoku.senkou_b).toFixed(2)} - ${Math.max(data.ichimoku.senkou_a, data.ichimoku.senkou_b).toFixed(2)}
            </Text>
          </View>

          <View style={[styles.componentBox, { backgroundColor: colors.background, borderColor: data.ichimoku.price_vs_cloud.includes("Sobre") ? bullColor : bearColor }]}>
            <Text style={[styles.componentLabel, { color: colors.textSecondary }]}>Precio vs Nube</Text>
            <Text style={[styles.componentValue, { color: data.ichimoku.price_vs_cloud.includes("Sobre") ? bullColor : bearColor }]}>
              {data.ichimoku.price_vs_cloud.includes("Sobre") ? "↑" : data.ichimoku.price_vs_cloud.includes("Bajo") ? "↓" : "→"} {data.ichimoku.price_vs_cloud}
            </Text>
            <Text style={[styles.componentSub, { color: colors.textSecondary }]}>${data.current_price.toFixed(2)}</Text>
          </View>

          <View style={[styles.componentBox, { backgroundColor: colors.background, borderColor: data.ichimoku.chikou_free ? bullColor : bearColor }]}>
            <Text style={[styles.componentLabel, { color: colors.textSecondary }]}>Chikou Span</Text>
            <Text style={[styles.componentValue, { color: data.ichimoku.chikou_free ? bullColor : bearColor }]}>
              {data.ichimoku.chikou_free ? "↑ Libre" : "↓ Obstruido"}
            </Text>
            <Text style={[styles.componentSub, { color: colors.textSecondary }]}>
              {data.ichimoku.chikou_free ? "Sin resistencias" : "Con obstáculos"}
            </Text>
          </View>
        </View>

        {/* Veredicto */}
        <View style={[styles.verdictBox, { backgroundColor: colors.background, borderColor: scoreColor }]}>
          <Text style={[styles.verdictTitle, { color: scoreColor }]}>{data.veredicto.verdict}</Text>
          <Text style={[styles.verdictDesc, { color: colors.textSecondary }]}>{data.veredicto.description}</Text>
        </View>

        {/* Puntos clave */}
        {data.veredicto.alcistas.length > 0 && (
          <View style={styles.pointsSection}>
            <Text style={[styles.pointsTitle, { color: bullColor }]}>✓ Alcistas ({data.veredicto.alcistas.length})</Text>
            {data.veredicto.alcistas.map((p, i) => (
              <Text key={i} style={[styles.pointText, { color: colors.textSecondary }]}>• {p}</Text>
            ))}
          </View>
        )}

        {data.veredicto.bajistas.length > 0 && (
          <View style={styles.pointsSection}>
            <Text style={[styles.pointsTitle, { color: bearColor }]}>✗ Bajistas ({data.veredicto.bajistas.length})</Text>
            {data.veredicto.bajistas.map((p, i) => (
              <Text key={i} style={[styles.pointText, { color: colors.textSecondary }]}>• {p}</Text>
            ))}
          </View>
        )}
      </View>

      {/* Tooltip punto seleccionado */}
      {selectedPoint && (
        <View style={[styles.tooltip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.tooltipDate, { color: colors.textSecondary }]}>{selectedPoint.date}</Text>
          <View style={styles.tooltipRow}>
            <Text style={{ color: colors.text }}>Close:</Text>
            <Text style={{ color: colors.text, fontWeight: "700" }}>${selectedPoint.close.toFixed(2)}</Text>
          </View>
          {selectedPoint.tenkan && (
            <View style={styles.tooltipRow}>
              <Text style={{ color: tenkanColor }}>Tenkan:</Text>
              <Text style={{ color: tenkanColor, fontWeight: "600" }}>${selectedPoint.tenkan.toFixed(2)}</Text>
            </View>
          )}
          {selectedPoint.kijun && (
            <View style={styles.tooltipRow}>
              <Text style={{ color: kijunColor }}>Kijun:</Text>
              <Text style={{ color: kijunColor, fontWeight: "600" }}>${selectedPoint.kijun.toFixed(2)}</Text>
            </View>
          )}
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
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  ticker: {
    fontSize: 20,
    fontWeight: "800",
  },
  price: {
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(128,128,128,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: {
    fontSize: 20,
    color: "#888",
  },
  gaugeContainer: {
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  gaugeTitle: {
    fontSize: 12,
    marginBottom: 4,
  },
  gaugeLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: -8,
    letterSpacing: 1,
  },
  controls: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  controlBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  controlBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  chartContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    marginBottom: 12,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 8,
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
    fontSize: 10,
  },
  analysisPanel: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  componentsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  componentBox: {
    flex: 1,
    minWidth: 140,
    padding: 10,
    borderRadius: 8,
    borderWidth: 2,
  },
  componentLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  componentValue: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  componentSub: {
    fontSize: 10,
    marginTop: 2,
  },
  verdictBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: 12,
  },
  verdictTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  verdictDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  pointsSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.1)",
  },
  pointsTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  pointText: {
    fontSize: 11,
    lineHeight: 18,
  },
  tooltip: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  tooltipDate: {
    fontSize: 11,
    marginBottom: 6,
    fontWeight: "600",
  },
  tooltipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
});
