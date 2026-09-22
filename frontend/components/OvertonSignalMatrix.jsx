/**
 * OvertonSignalMatrix.jsx
 *
 * Reemplaza completamente el OvertonSignalMatrix.tsx anterior.
 * Diseño fiel a las capturas: gráficos Chart.js, métricas en cabecera,
 * ventana de Overton, score compuesto, consenso analistas y setup de trading.
 *
 * Props:
 *   ticker        {string}  — ticker a analizar (viene del selector en OvertonScreen)
 *   currentPrice  {number}  — opcional, usado solo como fallback
 *
 * Dependencias ya en tu proyecto:
 *   axios, react-native-web (Platform.OS === 'web' renderiza divs normales)
 *
 * CDN cargado dinámicamente solo en web: Chart.js 4
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const IS_WEB = Platform.OS === 'web';

/* ─── Paleta ─────────────────────────────────────────────── */
const C = {
  green:    '#2E7D32',
  greenBg:  '#E8F5E9',
  red:      '#C62828',
  redBg:    '#FFEBEE',
  amber:    '#E65100',
  amberBg:  '#FFF3E0',
  blue:     '#1565C0',
  blueBg:   '#E3F2FD',
  gray:     '#546E7A',
  grayBg:   '#ECEFF1',
  border:   '#E0E0E0',
  text:     '#212121',
  sub:      '#757575',
  white:    '#FFFFFF',
  chartBlue:'#2196F3',
  chartRed: '#EF5350',
  chartGreen:'#4CAF50',
  chartOrange:'#FF7043',
  chartPurple:'#9C27B0',
};

const OVERTON_ZONES = [
  { label: 'Impensable\nVender',       bg: '#EF9A9A', textC: '#B71C1C' },
  { label: 'Radical\nBajista',         bg: '#FFCC80', textC: '#E65100' },
  { label: 'Aceptable\nEsperar',       bg: '#E0E0E0', textC: '#424242' },
  { label: 'Popular\nComprar',         bg: '#A5D6A7', textC: '#1B5E20' },
  { label: 'Política\nSobrecompra',    bg: '#80DEEA', textC: '#006064' },
];

const ACTION = {
  buy:   { label: 'COMPRAR',  color: C.green,  bg: C.greenBg },
  hold:  { label: 'MANTENER', color: C.amber,  bg: C.amberBg },
  watch: { label: 'VIGILAR',  color: C.gray,   bg: C.grayBg  },
  sell:  { label: 'VENDER',   color: C.red,    bg: C.redBg   },
};

/* ─── Carga dinámica de Chart.js (solo web) ──────────────── */
let chartJsLoaded = false;
function loadChartJs(cb) {
  if (!IS_WEB) { cb(); return; }
  if (chartJsLoaded || (typeof window !== 'undefined' && window.Chart)) {
    chartJsLoaded = true; cb(); return;
  }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  s.onload = () => { chartJsLoaded = true; cb(); };
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════ */
export default function OvertonSignalMatrix({ ticker }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [chartReady, setChartReady] = useState(false);

  /* refs para canvas Chart.js */
  const refPrice   = useRef(null);
  const refCoppock = useRef(null);
  const refVix     = useRef(null);
  const chartPrice   = useRef(null);
  const chartCoppock = useRef(null);
  const chartVix     = useRef(null);

  /* ── fetch datos ── */
  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/overton/${ticker}`);
      setData(res.data);
    } catch {
      setError('No se pudo cargar el análisis Overton');
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    loadChartJs(() => setChartReady(true));
    fetchData();
  }, [fetchData]);

  /* ── dibujar gráficos cuando datos + Chart.js listos ── */
  useEffect(() => {
    if (!data || !chartReady || !IS_WEB) return;

    const prices = data.price_history   ?? [];
    const wma    = data.wma_history     ?? [];
    const copp   = data.coppock_history ?? [];
    const vix    = data.vix_history     ?? [];
    const yld    = data.yield_history   ?? [];
    const labels = prices.map((_, i) => i % 5 === 0 ? `S${i + 1}` : '');

    const Chart = window.Chart;
    if (!Chart) return;

    /* ── Precio + WMA ── */
    if (refPrice.current) {
      chartPrice.current?.destroy();

      /* Puntos de señal */
      const buyPts  = prices.map((v, i) => data.buy_signals.includes(i)  ? v : null);
      const sellPts = prices.map((v, i) => data.sell_signals.includes(i) ? v : null);
      const newsPts = prices.map((v, i) => data.news_events.includes(i)  ? v : null);

      chartPrice.current = new Chart(refPrice.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Precio',
              data: prices,
              borderColor: C.chartBlue,
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.35,
              fill: false,
              order: 1,
            },
            {
              label: 'WMA-30',
              data: wma,
              borderColor: C.chartOrange,
              borderWidth: 1.5,
              borderDash: [5, 3],
              pointRadius: 0,
              tension: 0.35,
              fill: false,
              order: 2,
            },
            {
              label: 'Compra',
              data: buyPts,
              borderColor: 'transparent',
              backgroundColor: C.chartGreen,
              pointStyle: 'triangle',
              pointRadius: 8,
              pointRotation: 0,
              showLine: false,
              order: 0,
            },
            {
              label: 'Venta',
              data: sellPts,
              borderColor: 'transparent',
              backgroundColor: C.chartRed,
              pointStyle: 'triangle',
              pointRadius: 8,
              pointRotation: 180,
              showLine: false,
              order: 0,
            },
            {
              label: 'Noticia',
              data: newsPts,
              borderColor: 'transparent',
              backgroundColor: C.chartPurple,
              pointStyle: 'rect',
              pointRadius: 5,
              showLine: false,
              order: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              align: 'end',
              labels: { boxWidth: 12, font: { size: 11 }, color: C.text },
            },
            tooltip: { mode: 'index', intersect: false },
          },
          scales: {
            x: {
              grid: { color: '#F0F0F0' },
              ticks: { color: C.sub, font: { size: 10 }, maxRotation: 0 },
            },
            y: {
              grid: { color: '#F0F0F0' },
              ticks: {
                color: C.sub,
                font: { size: 10 },
                callback: v => `$${v.toFixed(0)}`,
              },
            },
          },
        },
      });
    }

    /* ── Coppock ── */
    if (refCoppock.current) {
      chartCoppock.current?.destroy();
      chartCoppock.current = new Chart(refCoppock.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Coppock',
            data: copp,
            backgroundColor: copp.map(v =>
              v === null ? 'transparent' : v >= 0 ? '#81C784' : '#E57373'
            ),
            borderWidth: 0,
            borderRadius: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { mode: 'index' } },
          scales: {
            x: { grid: { display: false }, ticks: { color: C.sub, font: { size: 9 } } },
            y: {
              grid: { color: '#F0F0F0' },
              ticks: { color: C.sub, font: { size: 9 } },
            },
          },
        },
      });
    }

    /* ── VIX + US10Y (doble eje) ── */
    if (refVix.current) {
      chartVix.current?.destroy();
      chartVix.current = new Chart(refVix.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'VIX',
              data: vix,
              borderColor: C.chartOrange,
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.3,
              fill: false,
              yAxisID: 'yVix',
            },
            {
              label: 'US 10Y',
              data: yld,
              borderColor: C.chartBlue,
              borderWidth: 1.5,
              borderDash: [4, 3],
              pointRadius: 0,
              tension: 0.3,
              fill: false,
              yAxisID: 'yYield',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              align: 'end',
              labels: { boxWidth: 10, font: { size: 10 }, color: C.text },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: C.sub, font: { size: 9 } } },
            yVix: {
              type: 'linear',
              position: 'left',
              grid: { color: '#F0F0F0' },
              ticks: { color: C.chartOrange, font: { size: 9 } },
              title: { display: true, text: 'VIX', color: C.chartOrange, font: { size: 9 } },
            },
            yYield: {
              type: 'linear',
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: {
                color: C.chartBlue, font: { size: 9 },
                callback: v => `${v.toFixed(1)}%`,
              },
              title: { display: true, text: 'US 10Y', color: C.chartBlue, font: { size: 9 } },
            },
          },
        },
      });
    }

    return () => {
      chartPrice.current?.destroy();
      chartCoppock.current?.destroy();
      chartVix.current?.destroy();
    };
  }, [data, chartReady]);

  /* ── estados de carga / error ── */
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.chartBlue} />
        <Text style={s.loadTxt}>Calculando Overton Signal Matrix…</Text>
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={36} color={C.sub} />
        <Text style={s.errTxt}>{error ?? 'Error desconocido'}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={fetchData}>
          <Text style={s.retryTxt}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ac     = ACTION[data.overton_action] ?? ACTION.hold;
  const pctPos = data.pct_change >= 0;

  /* zona activa (0-4) */
  const zoneIdx = Math.min(4, Math.floor((data.score / 100) * 5));

  /* consenso analistas */
  const totalA = (data.analyst_buy + data.analyst_hold + data.analyst_sell) || 1;
  const pBuy   = Math.round((data.analyst_buy  / totalA) * 100);
  const pHold  = Math.round((data.analyst_hold / totalA) * 100);
  const pSell  = Math.round((data.analyst_sell / totalA) * 100);

  /* helpers de color para Coppock / Sharpe / VIX / 10Y */
  const coppockColor = data.coppock_signal === 'bull' ? C.green : C.red;
  const sharpeColor  = data.sharpe > 1 ? C.green : data.sharpe > 0 ? C.amber : C.red;
  const vixColor     = data.vix < 18 ? C.green  : data.vix > 28 ? C.red : C.amber;
  const yieldColor   = data.us10y < 4.2 ? C.green : data.us10y > 4.8 ? C.red : C.amber;

  const coppockLabel = data.coppock_signal === 'bull' ? 'Alcista' : 'Bajista';
  const sharpeLabel  = data.sharpe > 1 ? 'Bueno' : data.sharpe > 0 ? 'Moderado' : 'Negativo';
  const vixLabel     = data.vix < 18 ? 'Calma' : data.vix > 28 ? 'Miedo' : 'Neutral';
  const yieldLabel   = data.us10y < 4.2 ? 'Bajo' : data.us10y > 4.8 ? 'Alto' : 'Neutro';

  /* impacto noticias */
  const totalImpact = data.news_impact_total;
  const sentColor   = data.news_sentiment === 'bull' ? C.green : data.news_sentiment === 'bear' ? C.red : C.gray;
  const sentLabel   = data.news_sentiment === 'bull' ? 'Sentimiento positivo' : data.news_sentiment === 'bear' ? 'Sentimiento negativo' : 'Sentimiento mixto';

  return (
    <ScrollView style={s.root} contentContainerStyle={s.rootInner}>

      {/* ══ CABECERA: ticker + controles ════════════════════ */}
      <View style={s.topBar}>
        <View>
          <Text style={s.topTitle}>Overton Signal Matrix</Text>
          <Text style={s.topSub}>
            News · WMA-30 · Coppock · Sharpe · VIX · US10Y · Analyst consensus
          </Text>
        </View>
        <View style={s.topRight}>
          <View style={[s.badge, { backgroundColor: ac.bg }]}>
            <Text style={[s.badgeTxt, { color: ac.color }]}>{data.ticker}</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={fetchData}>
            <Ionicons name="refresh" size={14} color={C.blue} />
            <Text style={s.refreshTxt}>Refresh</Text>
          </TouchableOpacity>
          <View style={[s.badge, { backgroundColor: ac.bg }]}>
            <Text style={[s.badgeTxt, { color: ac.color }]}>{ac.label}</Text>
          </View>
        </View>
      </View>

      {/* ══ MÉTRICAS CLAVE ══════════════════════════════════ */}
      <View style={s.metricsRow}>
        <MetricCard
          title="PRECIO"
          main={`$${data.current_price.toFixed(2)}`}
          sub={`${pctPos ? '+' : ''}${data.pct_change.toFixed(2)}%`}
          subColor={pctPos ? C.green : C.red}
        />
        <MetricCard
          title="WMA-30"
          main={`$${data.wma30.toFixed(2)}`}
          sub={data.price_vs_wma === 'above' ? '↑ sobre WMA' : '↓ bajo WMA'}
          subColor={data.price_vs_wma === 'above' ? C.green : C.red}
        />
        <MetricCard
          title="COPPOCK"
          main={data.coppock.toFixed(2)}
          sub={coppockLabel}
          subColor={coppockColor}
        />
        <MetricCard
          title="SHARPE 30S"
          main={data.sharpe.toFixed(2)}
          sub={sharpeLabel}
          subColor={sharpeColor}
        />
        <MetricCard
          title="VIX"
          main={data.vix.toFixed(1)}
          sub={vixLabel}
          subColor={vixColor}
        />
        <MetricCard
          title="US 10Y"
          main={`${data.us10y.toFixed(2)}%`}
          sub={yieldLabel}
          subColor={yieldColor}
        />
      </View>

      {/* ══ NOTICIAS ════════════════════════════════════════ */}
      <Section title="Noticias recientes — impacto en narrativa" rightLabel={sentLabel} rightColor={sentColor}>
        {data.news.map((n, i) => {
          const pos = n.impact >= 0;
          return (
            <View
              key={i}
              style={[
                s.newsItem,
                { borderLeftColor: pos ? C.green : C.red,
                  backgroundColor: pos ? '#F1F8E9' : '#FFF3F3' },
              ]}
            >
              <View style={s.newsRow}>
                <View style={s.newsLeft}>
                  <Text style={[s.newsHeadline, pos ? s.posText : s.negText]}>
                    {n.headline}
                  </Text>
                  <Text style={s.newsDesc}>{n.description}</Text>
                </View>
                <Text style={[s.newsImpact, { color: pos ? C.green : C.red }]}>
                  {pos ? '↑' : '↓'} {pos ? '+' : ''}{n.impact.toFixed(1)}%
                </Text>
              </View>
            </View>
          );
        })}
        <Text style={s.impactTotal}>
          Impacto acumulado en precio estimado:{' '}
          <Text style={{ color: totalImpact >= 0 ? C.green : C.red, fontWeight: '600' }}>
            {totalImpact >= 0 ? '+' : ''}{totalImpact.toFixed(1)}%
          </Text>
          {' '}estimado acumulado
        </Text>
      </Section>

      {/* ══ VENTANA DE OVERTON ══════════════════════════════ */}
      <Section
        title="Ventana de Overton — posición narrativa del mercado"
        rightLabel={data.overton_zone}
        rightColor={ac.color}
      >
        {/* Barra de zonas */}
        <View style={s.overtonBar}>
          {OVERTON_ZONES.map((z, i) => (
            <View
              key={i}
              style={[
                s.overtonZone,
                { backgroundColor: z.bg },
                i === zoneIdx && s.overtonZoneActive,
              ]}
            >
              <Text style={[s.overtonZoneTxt, { color: z.textC }]}>
                {z.label.split('\n')[0]}
              </Text>
              <Text style={[s.overtonZoneSubTxt, { color: z.textC }]}>
                {z.label.split('\n')[1]}
              </Text>
            </View>
          ))}
        </View>
        {/* Marcador de posición */}
        <View style={s.overtonMarkerRow}>
          {OVERTON_ZONES.map((_, i) => (
            <View key={i} style={s.overtonMarkerCell}>
              {i === zoneIdx && (
                <View style={[s.overtonMarker, { borderColor: ac.color }]}>
                  <Text style={[s.overtonMarkerTxt, { color: ac.color }]}>
                    {data.overton_zone}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
        <View style={s.overtonFooter}>
          <Text style={s.overtonFooterTxt}>← Pánico / Crash</Text>
          <Text style={s.overtonFooterTxt}>Euforia / Burbuja →</Text>
        </View>
        <Text style={s.overtonDesc}>{data.overton_description}</Text>

        {/* Score + Analistas en fila */}
        <View style={s.scoreAnalystRow}>
          {/* Score */}
          <View style={s.scoreBox}>
            <Text style={s.scoreBoxTitle}>Score compuesto</Text>
            <View style={s.scoreInner}>
              <ScoreRing score={data.score} color={ac.color} />
              <View style={s.scoreDetails}>
                <Text style={[s.scoreBigLabel, { color: ac.color }]}>{ac.label}</Text>
                <Text style={s.scoreTypeTxt}>Swing Trade · Score: {data.score}/100</Text>
                <Text style={s.scoreBiasTxt}>{data.bias}</Text>
                <Text style={s.scoreNewsTxt}>
                  Noticias aportan: {totalImpact >= 0 ? '+' : ''}{totalImpact.toFixed(1)}% al sesgo
                </Text>
              </View>
            </View>
          </View>
          {/* Analistas */}
          <View style={s.analystBox}>
            <Text style={s.scoreBoxTitle}>Consenso analistas</Text>
            <AnalystBar label="Strong Buy" pct={pBuy}  color="#4CAF50" />
            <AnalystBar label="Hold"       pct={pHold} color="#9E9E9E" />
            <AnalystBar label="Sell"       pct={pSell} color="#F44336" />
          </View>
        </View>
      </Section>

      {/* ══ RANGOS DE ENTRADA / SALIDA ══════════════════════ */}
      <Section title="Rangos de entrada / salida y precios objetivo">
        <View style={s.levelsRow}>
          <LevelCard label="STOP LOSS"        value={`$${data.stop_loss.toFixed(2)}`}        sub="2.2 ATR bajo precio"    color={C.red}   bg="#FFEBEE" />
          <LevelCard label="ENTRADA ÓPTIMA"   value={`$${data.entry_optimal.toFixed(2)}`}    sub="Rebote WMA-30"          color={C.green} bg="#E8F5E9" />
          <LevelCard label="ENTRADA AGRESIVA" value={`$${data.entry_aggressive.toFixed(2)}`} sub="Pullback 0.5 ATR"       color="#00695C" bg="#E0F2F1" />
          <LevelCard label="OBJETIVO 1"       value={`$${data.target1.toFixed(2)}`}          sub={`R/R ${data.rr1.toFixed(1)}:1 · +ATR news`} color={C.blue} bg={C.blueBg} />
          <LevelCard label="OBJETIVO 2"       value={`$${data.target2.toFixed(2)}`}          sub={`R/R ${data.rr2.toFixed(1)}:1 · extensión`} color="#4527A0" bg="#EDE7F6" />
          <LevelCard label="OBJETIVO 3"       value={`$${data.target3.toFixed(2)}`}          sub="Máximo escenario bull"  color={C.gray}  bg={C.grayBg} />
        </View>
        <Text style={s.atrNote}>
          ATR estimado: ${data.atr.toFixed(2)} · Impacto noticias en objetivo: {totalImpact >= 0 ? '+' : ''}${(data.current_price * totalImpact / 100).toFixed(2)} · R/R mínimo recomendado: 2.1:1
        </Text>
      </Section>

      {/* ══ GRÁFICOS ════════════════════════════════════════ */}
      {IS_WEB ? (
        <>
          {/* Precio + WMA */}
          <Section title="Precio + WMA-30 · señales y noticias">
            <View style={s.chartWrap}>
              <canvas ref={refPrice} style={{ width: '100%', height: '100%' }} />
            </View>
          </Section>

          {/* Coppock + VIX lado a lado */}
          <View style={s.chartDualRow}>
            <View style={[s.chartHalf, { marginRight: 8 }]}>
              <Text style={s.chartTitle}>Coppock — momentum</Text>
              <View style={s.chartWrapSm}>
                <canvas ref={refCoppock} style={{ width: '100%', height: '100%' }} />
              </View>
            </View>
            <View style={s.chartHalf}>
              <Text style={s.chartTitle}>VIX + US 10Y</Text>
              <View style={s.chartWrapSm}>
                <canvas ref={refVix} style={{ width: '100%', height: '100%' }} />
              </View>
            </View>
          </View>
        </>
      ) : (
        /* Fallback móvil: mini barras sin Canvas */
        <Section title="Historial técnico (resumen)">
          <MiniSparkline values={data.price_history} color={C.chartBlue} label="Precio" />
          <MiniSparkline values={data.coppock_history.map(v => v ?? 0)} color={C.chartGreen} label="Coppock" />
          <MiniSparkline values={data.vix_history} color={C.chartOrange} label="VIX" />
        </Section>
      )}

      {/* ══ SETUP DE TRADING ════════════════════════════════ */}
      <Section title="Setup de trading recomendado">
        <View style={s.setupGrid}>
          <SetupCell label="ENTRADA"       value={`Cierre diario sobre WMA-30`} />
          <SetupCell label="STOP LOSS"     value={`$${data.stop_loss.toFixed(2)} (2.2 ATR)`} color={C.red} />
          <SetupCell label="TARGET 1"      value={`$${data.target1.toFixed(2)}`} color={C.green} />
          <SetupCell label="TARGET 2"      value={`$${data.target2.toFixed(2)}`} color={C.blue} />
          <SetupCell label="TIEMPO"        value="3–10 días" />
          <SetupCell label="TAMAÑO POSICIÓN" value="1–2% capital por trade" />
        </View>
      </Section>

    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTES
═══════════════════════════════════════════════════════════ */

function Section({ title, children, rightLabel, rightColor }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        {rightLabel && (
          <Text style={[s.sectionRight, { color: rightColor ?? C.sub }]}>
            {rightLabel}
          </Text>
        )}
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function MetricCard({ title, main, sub, subColor }) {
  return (
    <View style={s.metricCard}>
      <Text style={s.metricTitle}>{title}</Text>
      <Text style={s.metricMain}>{main}</Text>
      <Text style={[s.metricSub, { color: subColor }]}>{sub}</Text>
    </View>
  );
}

function LevelCard({ label, value, sub, color, bg }) {
  return (
    <View style={[s.levelCard, { backgroundColor: bg }]}>
      <Text style={[s.levelLabel, { color }]}>{label}</Text>
      <Text style={[s.levelValue, { color }]}>{value}</Text>
      <Text style={[s.levelSub,   { color }]}>{sub}</Text>
    </View>
  );
}

function AnalystBar({ label, pct, color }) {
  return (
    <View style={s.analystRow}>
      <Text style={s.analystLabel}>{label}</Text>
      <View style={s.analystTrack}>
        <View style={[s.analystFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.analystPct, { color }]}>{pct}%</Text>
    </View>
  );
}

function ScoreRing({ score, color }) {
  const size = 64;
  const r    = 26;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - score / 100);

  if (!IS_WEB) {
    return (
      <View style={[s.scoreRingFallback, { borderColor: color }]}>
        <Text style={[s.scoreRingNum, { color }]}>{score}</Text>
      </View>
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E0E0E0" strokeWidth="5" />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={circ}
        strokeDashoffset={fill}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fontSize="14" fontWeight="600" fill={color}>
        {score}
      </text>
    </svg>
  );
}

function SetupCell({ label, value, color }) {
  return (
    <View style={s.setupCell}>
      <Text style={s.setupLabel}>{label}</Text>
      <Text style={[s.setupValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

/* Mini sparkline para móvil (sin Canvas) */
function MiniSparkline({ values, color, label }) {
  const w = Dimensions.get('window').width - 64;
  const h = 40;
  const valid = values.filter(v => v != null && !isNaN(v));
  if (!valid.length) return null;
  const mn = Math.min(...valid);
  const mx = Math.max(...valid) || 1;
  const pts = valid.map((v, i) => {
    const x = (i / (valid.length - 1)) * w;
    const y = h - ((v - mn) / (mx - mn)) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 11, color: C.sub, marginBottom: 3 }}>{label}</Text>
      {IS_WEB ? (
        <svg width={w} height={h}>
          <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
      ) : (
        <View style={{ height: h, backgroundColor: '#F5F5F5', borderRadius: 4 }} />
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════
   ESTILOS
═══════════════════════════════════════════════════════════ */
const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#FAFAFA' },
  rootInner: { padding: 16, paddingBottom: 40 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, minHeight: 200 },
  loadTxt:   { marginTop: 12, fontSize: 14, color: C.sub },
  errTxt:    { marginTop: 8, fontSize: 14, color: C.sub, textAlign: 'center' },
  retryBtn:  { marginTop: 14, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: C.chartBlue, borderRadius: 16 },
  retryTxt:  { color: C.white, fontWeight: '600', fontSize: 13 },

  /* topbar */
  topBar:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  topTitle:    { fontSize: 18, fontWeight: '700', color: C.text },
  topSub:      { fontSize: 11, color: C.sub, marginTop: 2 },
  topRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeTxt:    { fontSize: 12, fontWeight: '700' },
  refreshBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10,
                 paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  refreshTxt:  { fontSize: 12, color: C.blue },

  /* métricas */
  metricsRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  metricCard:  { flex: 1, minWidth: 100, backgroundColor: C.white, borderRadius: 10,
                 padding: 12, borderWidth: 1, borderColor: C.border },
  metricTitle: { fontSize: 10, fontWeight: '700', color: C.sub, letterSpacing: 0.5, marginBottom: 4 },
  metricMain:  { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 2 },
  metricSub:   { fontSize: 12 },

  /* secciones */
  section:       { backgroundColor: C.white, borderRadius: 10, borderWidth: 1,
                   borderColor: C.border, marginBottom: 12, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                   paddingHorizontal: 14, paddingVertical: 10,
                   borderBottomWidth: 1, borderBottomColor: C.border },
  sectionTitle:  { fontSize: 13, fontWeight: '600', color: C.text },
  sectionRight:  { fontSize: 12, fontWeight: '600' },
  sectionBody:   { padding: 14 },

  /* noticias */
  newsItem:     { borderLeftWidth: 3, borderRadius: 4, padding: 10, marginBottom: 7 },
  newsRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  newsLeft:     { flex: 1, paddingRight: 10 },
  newsHeadline: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  posText:      { color: '#1B5E20' },
  negText:      { color: '#B71C1C' },
  newsDesc:     { fontSize: 11, color: C.sub, lineHeight: 15 },
  newsImpact:   { fontSize: 13, fontWeight: '700', flexShrink: 0 },
  impactTotal:  { fontSize: 12, color: C.sub, marginTop: 8 },

  /* overton */
  overtonBar:        { flexDirection: 'row', borderRadius: 6, overflow: 'hidden', height: 50, marginBottom: 4 },
  overtonZone:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 4 },
  overtonZoneActive: { borderWidth: 2, borderColor: '#212121' },
  overtonZoneTxt:    { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  overtonZoneSubTxt: { fontSize: 9, textAlign: 'center', marginTop: 1 },
  overtonMarkerRow:  { flexDirection: 'row', height: 24, marginBottom: 4 },
  overtonMarkerCell: { flex: 1, alignItems: 'center' },
  overtonMarker:     { paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1.5,
                       borderRadius: 5, alignSelf: 'center' },
  overtonMarkerTxt:  { fontSize: 9, fontWeight: '700' },
  overtonFooter:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  overtonFooterTxt:  { fontSize: 10, color: C.sub },
  overtonDesc:       { fontSize: 12, color: '#424242', lineHeight: 18, marginBottom: 14,
                       paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: '#BDBDBD' },

  /* score + analistas */
  scoreAnalystRow: { flexDirection: 'row', gap: 12 },
  scoreBox:        { flex: 1, backgroundColor: '#FAFAFA', borderRadius: 8,
                     padding: 12, borderWidth: 1, borderColor: C.border },
  analystBox:      { flex: 1, backgroundColor: '#FAFAFA', borderRadius: 8,
                     padding: 12, borderWidth: 1, borderColor: C.border },
  scoreBoxTitle:   { fontSize: 12, fontWeight: '600', color: C.sub, marginBottom: 10 },
  scoreInner:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreDetails:    { flex: 1 },
  scoreBigLabel:   { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  scoreTypeTxt:    { fontSize: 11, color: C.sub },
  scoreBiasTxt:    { fontSize: 11, color: C.sub, marginTop: 2 },
  scoreNewsTxt:    { fontSize: 11, color: C.sub, marginTop: 2 },
  scoreRingFallback: { width: 56, height: 56, borderRadius: 28, borderWidth: 4,
                       alignItems: 'center', justifyContent: 'center' },
  scoreRingNum:    { fontSize: 16, fontWeight: '700' },
  analystRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  analystLabel:    { fontSize: 11, color: C.sub, width: 72 },
  analystTrack:    { flex: 1, height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' },
  analystFill:     { height: '100%', borderRadius: 4 },
  analystPct:      { fontSize: 11, fontWeight: '700', width: 32, textAlign: 'right' },

  /* niveles */
  levelsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelCard:    { flex: 1, minWidth: 130, borderRadius: 8, padding: 12 },
  levelLabel:   { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginBottom: 5 },
  levelValue:   { fontSize: 20, fontWeight: '700', marginBottom: 3 },
  levelSub:     { fontSize: 10, opacity: 0.8 },
  atrNote:      { fontSize: 11, color: C.sub, marginTop: 10 },

  /* gráficos */
  chartWrap:     { height: 240, width: '100%', position: 'relative' },
  chartDualRow:  { flexDirection: 'row', gap: 0, marginBottom: 12 },
  chartHalf:     { flex: 1, backgroundColor: C.white, borderRadius: 10,
                   borderWidth: 1, borderColor: C.border, padding: 12 },
  chartTitle:    { fontSize: 12, fontWeight: '600', color: C.sub, marginBottom: 8 },
  chartWrapSm:   { height: 160, width: '100%', position: 'relative' },

  /* setup */
  setupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  setupCell: { width: '33.33%', paddingVertical: 10, paddingHorizontal: 4,
               borderBottomWidth: 1, borderBottomColor: C.border },
  setupLabel:{ fontSize: 10, fontWeight: '700', color: C.sub, letterSpacing: 0.4, marginBottom: 3 },
  setupValue:{ fontSize: 13, color: C.text },
});
