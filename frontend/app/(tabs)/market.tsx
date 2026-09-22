import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Image,
  Linking,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Rect } from 'react-native-svg';
import axios from 'axios';

import { useTheme } from '../../contexts/ThemeContext';
import {
  Button,
  EmptyState,
  Legend,
  Panel,
  Rule,
  Skeleton,
  SkeletonRows,
} from '../../components/ui';
import { deltaTone, Tone, toneColors } from '../../theme/tokens';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

interface MarketIndicator {
  name: string;
  ticker: string;
  current_value: number;
  change: number;
  change_percent: number;
  updated: string;
  description: string;
}

interface CommodityIndicator {
  name: string;
  ticker: string;
  current_value: number;
  change: number;
  change_percent: number;
  unit: string;
  updated: string;
}

interface CurrencyPair {
  name: string;
  ticker: string;
  rate: number;
  change: number;
  change_percent: number;
  updated: string;
}

interface CryptoIndicator {
  name: string;
  symbol: string;
  ticker: string;
  current_value: number;
  change: number;
  change_percent: number;
  market_cap: number | null;
  volume_24h: number | null;
  updated: string;
}

interface MarketHours {
  market_name: string;
  location: string;
  timezone: string;
  open_time: string;
  close_time: string;
  status: string;
  next_open: string;
}

interface MarketData {
  /** Cruces principales. Puede venir vacío si el proveedor falla. */
  currencies?: CurrencyPair[];
  vix: MarketIndicator;
  treasury_10y: MarketIndicator;
  sp500: MarketIndicator;
  ibex35: MarketIndicator | null;
  eurostoxx50: MarketIndicator | null;
  dax: MarketIndicator | null;
  nasdaq: MarketIndicator | null;
  msci_world: MarketIndicator | null;
  gold: CommodityIndicator;
  oil: CommodityIndicator;
  eur_usd: CurrencyPair;
  bitcoin: CryptoIndicator | null;
  ethereum: CryptoIndicator | null;
  hedera: CryptoIndicator | null;
  solana: CryptoIndicator | null;
  market_hours: MarketHours[];
  fear_greed_level: string;
  market_sentiment: string;
}

interface NewsArticle {
  title: string;
  publisher: string;
  link: string;
  published_date: string;
  thumbnail: string | null;
  summary: string | null;
}

/* --------------------------------------------------------------------------
 * Bandas del VIX — los umbrales que ya usaba el producto, ahora dibujados
 * sobre la misma escala calibrada que el resto de la app.
 * ------------------------------------------------------------------------ */

const VIX_BANDS: { to: number; label: string; tone: Tone }[] = [
  { to: 12, label: 'Complacencia', tone: 'up' },
  { to: 17, label: 'Volatilidad baja', tone: 'up' },
  { to: 25, label: 'Volatilidad moderada', tone: 'caution' },
  { to: 35, label: 'Volatilidad alta', tone: 'caution' },
  { to: 50, label: 'Volatilidad extrema', tone: 'down' },
];

function vixBand(value: number) {
  return VIX_BANDS.find((b) => value < b.to) ?? VIX_BANDS[VIX_BANDS.length - 1];
}

/* ==========================================================================
 * Fila medida de mercado — la unidad de lectura de esta pantalla.
 * ======================================================================== */

function QuoteRow({
  name,
  ticker,
  value,
  change,
  changePercent,
  unit,
  decimals = 2,
  last,
}: {
  name: string;
  ticker: string;
  value: number | null | undefined;
  change: number | null | undefined;
  changePercent: number | null | undefined;
  unit?: string;
  decimals?: number;
  last?: boolean;
}) {
  const { colors, palette, space, type, numeric } = useTheme();
  const tone = deltaTone(change);
  const { fg } = toneColors(palette, tone);
  const hasValue = value != null && Number.isFinite(value);

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingVertical: space.md,
          paddingHorizontal: space.lg,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.label, { color: colors.ink }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
            {ticker}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', minWidth: 92 }}>
          <Text style={[type.bodyStrong, numeric, { color: colors.ink }]}>
            {hasValue
              ? (value as number).toLocaleString('es-ES', {
                  minimumFractionDigits: decimals,
                  maximumFractionDigits: decimals,
                })
              : '—'}
            {unit ? <Text style={{ color: colors.inkFaint, fontWeight: '500' }}> {unit}</Text> : null}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', minWidth: 96, flexDirection: 'row', justifyContent: 'flex-end', gap: 4 }}>
          {change != null && Number.isFinite(change) ? (
            <>
              <Ionicons
                name={change > 0 ? 'arrow-up' : change < 0 ? 'arrow-down' : 'remove'}
                size={12}
                color={fg}
                style={{ marginTop: 3 }}
              />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[type.caption, numeric, { color: fg, fontWeight: '700' }]}>
                  {changePercent != null && Number.isFinite(changePercent)
                    ? `${Math.abs(changePercent).toFixed(2)} %`
                    : '—'}
                </Text>
                <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
                  {change > 0 ? '+' : change < 0 ? '−' : ''}
                  {Math.abs(change).toFixed(decimals)}
                </Text>
              </View>
            </>
          ) : (
            <Text style={[type.caption, { color: colors.noSignal }]}>—</Text>
          )}
        </View>
      </View>
      {last ? null : <Rule />}
    </View>
  );
}

/* ==========================================================================
 * Escala calibrada genérica (VIX): bandas + índice, misma gramática que la
 * escala de decisión de un análisis.
 * ======================================================================== */

function BandScale({
  value,
  max,
  bands,
}: {
  value: number;
  max: number;
  bands: { to: number; label: string; tone: Tone }[];
}) {
  const { colors, palette, radius, hairline, space, type } = useTheme();
  const [width, setWidth] = useState(0);
  const clamped = Math.max(0, Math.min(max, value));
  const active = bands.find((b) => value < b.to) ?? bands[bands.length - 1];
  const { fg } = toneColors(palette, active.tone);
  const height = 30;

  return (
    <View style={{ gap: space.xs }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          height,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: colors.ruleStrong,
          backgroundColor: colors.surfaceSunken,
          overflow: 'hidden',
        }}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {bands.map((b, i) => {
              const from = i === 0 ? 0 : bands[i - 1].to;
              const { wash } = toneColors(palette, b.tone);
              return (
                <Rect
                  key={b.label}
                  x={(from / max) * width}
                  y={0}
                  width={((b.to - from) / max) * width}
                  height={height}
                  fill={wash}
                />
              );
            })}
            {bands.slice(0, -1).map((b) => (
              <Line
                key={b.to}
                x1={(b.to / max) * width}
                x2={(b.to / max) * width}
                y1={0}
                y2={height}
                stroke={colors.ink}
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.45}
              />
            ))}
            <Rect x={(clamped / max) * width - 1.5} y={0} width={3} height={height} fill={fg} />
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[0, ...bands.map((b) => b.to)].map((t, i) => (
          <Text key={`${t}-${i}`} style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

/* ==========================================================================
 * Pantalla
 * ======================================================================== */

export default function MarketScreen() {
  const { colors, palette, space, type, radius, hairline, numeric } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [data, setData] = useState<MarketData | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const response = await axios.get(`${BACKEND_URL}/api/market-indicators`);
      setData(response.data);
    } catch (err: any) {
      console.error('Error fetching market indicators:', err);
      setError(
        'No se pudieron cargar los indicadores de mercado. Comprueba tu conexión y vuelve a intentarlo.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchNews = async () => {
    try {
      setNewsLoading(true);
      const response = await axios.get(`${BACKEND_URL}/api/market-news?limit=10`);
      setNews(response.data.news || []);
    } catch (err: any) {
      console.error('Error fetching market news:', err);
    } finally {
      setNewsLoading(false);
    }
  };

  const openNewsLink = (url: string) => {
    if (url) {
      Linking.openURL(url).catch((err) => console.error('Error opening link:', err));
    }
  };

  useEffect(() => {
    fetchData();
    fetchNews();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
    fetchNews();
  }, []);

  const indices = useMemo(() => {
    if (!data) return [];
    return [
      data.sp500,
      data.nasdaq,
      data.ibex35,
      data.eurostoxx50,
      data.dax,
      data.msci_world,
    ].filter(Boolean) as MarketIndicator[];
  }, [data]);

  /** Decimales por convención de mercado: el yen se cotiza con dos, el resto
   *  de cruces mayores con cuatro. Redondear todo igual falsea la precisión. */
  const decimalesFx = (name: string) =>
    /JPY|MXN|CNY/.test(name) ? 2 : 4;

  const divisas = useMemo(() => {
    if (!data) return [];
    // Si el backend aún no envía la lista (imagen antigua), se cae al par que
    // siempre ha existido para no dejar la sección vacía.
    if (data.currencies?.length) return data.currencies;
    return data.eur_usd ? [data.eur_usd] : [];
  }, [data]);

  const crypto = useMemo(() => {
    if (!data) return [];
    return [data.bitcoin, data.ethereum, data.solana, data.hedera].filter(
      Boolean,
    ) as CryptoIndicator[];
  }, [data]);

  const sentimentTone: Tone = data
    ? data.market_sentiment?.includes('optimista')
      ? 'up'
      : data.market_sentiment?.includes('pesimista')
        ? 'down'
        : 'caution'
    : 'neutral';

  const fearGreedTone: Tone = data
    ? ['Codicia', 'Codicia Extrema'].includes(data.fear_greed_level)
      ? 'up'
      : ['Miedo', 'Miedo Extremo'].includes(data.fear_greed_level)
        ? 'down'
        : 'caution'
    : 'neutral';

  const contentStyle = {
    padding: space.xl,
    paddingBottom: space.h3,
    gap: space.xl,
    maxWidth: 1100,
    width: '100%' as const,
    alignSelf: 'center' as const,
  };

  if (loading) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={contentStyle}>
        <Panel legend="Cargando" title="Estado del mercado">
          <SkeletonRows rows={3} />
        </Panel>
        <Panel legend="Cargando" title="Índices">
          <SkeletonRows rows={6} />
        </Panel>
      </ScrollView>
    );
  }

  if (error || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: space.xl, justifyContent: 'center' }}>
        <Panel padded={false}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Sin conexión con los datos de mercado"
            body={error || 'No se recibió respuesta del servidor.'}
            action={<Button label="Reintentar" icon="refresh-outline" onPress={fetchData} />}
          />
        </Panel>
      </View>
    );
  }

  const vix = data.vix;
  const band = vixBand(vix.current_value);
  const bandColor = toneColors(palette, band.tone).fg;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={contentStyle}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      {/* Lectura general */}
      <Panel legend="Lectura general" title="Estado del mercado" padded={false}>
        <View style={{ flexDirection: wide ? 'row' : 'column' }}>
          <View style={{ flex: 1, padding: space.lg, gap: 2 }}>
            <Legend>Sentimiento</Legend>
            <Text style={[type.title3, { color: toneColors(palette, sentimentTone).fg }]}>
              {data.market_sentiment}
            </Text>
          </View>
          {wide ? <Rule vertical /> : <Rule />}
          <View style={{ flex: 1, padding: space.lg, gap: 2 }}>
            <Legend>Fear &amp; Greed</Legend>
            <Text style={[type.title3, { color: toneColors(palette, fearGreedTone).fg }]}>
              {data.fear_greed_level}
            </Text>
          </View>
        </View>
      </Panel>

      {/* VIX — el indicador con escala propia */}
      <Panel
        legend={`${vix.ticker} · actualizado ${vix.updated}`}
        title={vix.name}
        action={
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[type.title2, numeric, { color: colors.ink }]}>
              {vix.current_value.toFixed(2)}
            </Text>
            <Text
              style={[
                type.caption,
                numeric,
                { color: toneColors(palette, deltaTone(vix.change)).fg, fontWeight: '700' },
              ]}
            >
              {vix.change >= 0 ? '+' : '−'}
              {Math.abs(vix.change).toFixed(2)} ({Math.abs(vix.change_percent).toFixed(2)} %)
            </Text>
          </View>
        }
      >
        <View style={{ gap: space.md }}>
          <BandScale value={vix.current_value} max={50} bands={VIX_BANDS} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ width: 3, height: 16, backgroundColor: bandColor }} />
            <Text style={[type.labelStrong, { color: bandColor }]}>{band.label}</Text>
          </View>
          <Text style={[type.caption, { color: colors.inkMuted }]}>{vix.description}</Text>
        </View>
      </Panel>

      {/* Bono 10 años */}
      <Panel
        legend={`${data.treasury_10y.ticker} · actualizado ${data.treasury_10y.updated}`}
        title={data.treasury_10y.name}
        action={
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[type.title2, numeric, { color: colors.ink }]}>
              {data.treasury_10y.current_value.toFixed(3)} %
            </Text>
            <Text
              style={[
                type.caption,
                numeric,
                { color: toneColors(palette, deltaTone(data.treasury_10y.change)).fg, fontWeight: '700' },
              ]}
            >
              {data.treasury_10y.change >= 0 ? '+' : '−'}
              {Math.abs(data.treasury_10y.change).toFixed(3)}
            </Text>
          </View>
        }
      >
        <View style={{ gap: space.sm }}>
          <Text style={[type.label, { color: colors.ink }]}>
            {data.treasury_10y.current_value < 3
              ? 'Tasas bajas: favorecen la renta variable.'
              : data.treasury_10y.current_value < 4.5
                ? 'Tasas moderadas: equilibrio entre riesgo y retorno.'
                : 'Tasas altas: pueden presionar a los mercados de acciones.'}
          </Text>
          <Text style={[type.caption, { color: colors.inkMuted }]}>
            {data.treasury_10y.description}
          </Text>
        </View>
      </Panel>

      {/* Índices */}
      {indices.length > 0 && (
        <Panel legend="Renta variable" title="Índices" padded={false}>
          {indices.map((ix, i) => (
            <QuoteRow
              key={ix.ticker}
              name={ix.name}
              ticker={ix.ticker}
              value={ix.current_value}
              change={ix.change}
              changePercent={ix.change_percent}
              last={i === indices.length - 1}
            />
          ))}
        </Panel>
      )}

      {/* Cripto */}
      {crypto.length > 0 && (
        <Panel legend="Cripto" title="Activos digitales" padded={false}>
          {crypto.map((c, i) => (
            <QuoteRow
              key={c.ticker}
              name={`${c.name} (${c.symbol})`}
              ticker={c.ticker}
              value={c.current_value}
              change={c.change}
              changePercent={c.change_percent}
              last={i === crypto.length - 1}
            />
          ))}
        </Panel>
      )}

      {/* Materias primas y divisa */}
      <Panel legend="Materias primas y divisa" title="Otros mercados" padded={false}>
        <QuoteRow
          name={data.gold.name}
          ticker={data.gold.ticker}
          value={data.gold.current_value}
          change={data.gold.change}
          changePercent={data.gold.change_percent}
          unit={data.gold.unit}
        />
        <QuoteRow
          name={data.oil.name}
          ticker={data.oil.ticker}
          value={data.oil.current_value}
          change={data.oil.change}
          changePercent={data.oil.change_percent}
          unit={data.oil.unit}
        />
        <QuoteRow
          name={data.eur_usd.name}
          ticker={data.eur_usd.ticker}
          value={data.eur_usd.rate}
          change={data.eur_usd.change}
          changePercent={data.eur_usd.change_percent}
          decimals={4}
          last
        />
      </Panel>

      {/* Horarios */}
      {data.market_hours && data.market_hours.length > 0 && (
        <Panel legend="Sesiones" title="Horarios de mercado" padded={false}>
          {data.market_hours.map((m, i) => {
            const open = m.status.includes('Abierto');
            const pre = m.status.includes('Pre');
            const tone: Tone = open ? 'up' : pre ? 'caution' : 'neutral';
            const fg = tone === 'neutral' ? colors.inkMuted : toneColors(palette, tone).fg;
            return (
              <View key={`${m.market_name}-${i}`}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingVertical: space.md,
                    paddingHorizontal: space.lg,
                  }}
                >
                  <View style={{ width: 3, height: 22, backgroundColor: fg, opacity: open ? 1 : 0.45 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.label, { color: colors.ink }]} numberOfLines={1}>
                      {m.market_name}
                    </Text>
                    <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]} numberOfLines={1}>
                      {m.location} · {m.timezone}
                    </Text>
                  </View>
                  <Text style={[type.caption, numeric, { color: colors.inkMuted }]}>
                    {m.open_time} – {m.close_time}
                  </Text>
                  <Text style={[type.caption, { color: fg, fontWeight: '700', minWidth: 74, textAlign: 'right' }]} numberOfLines={1}>
                    {m.status}
                  </Text>
                </View>
                {i < data.market_hours.length - 1 ? <Rule /> : null}
              </View>
            );
          })}
        </Panel>
      )}

      {/* Guía de lectura */}
      <Panel legend="Guía" title="Cómo leer estos indicadores">
        <View style={{ gap: space.sm }}>
          {[
            ['VIX por encima de 25', 'la volatilidad esperada es alta; suele coincidir con periodos de tensión.'],
            ['VIX por debajo de 15', 'la volatilidad esperada es baja; el mercado descuenta calma.'],
            ['Bono 10 años alto', 'la renta fija compite mejor con las acciones.'],
            ['Bono 10 años bajo', 'la renta variable gana atractivo relativo.'],
          ].map(([head, tail]) => (
            <View key={head} style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ width: 3, height: 16, backgroundColor: colors.ruleStrong, marginTop: 3 }} />
              <Text style={[type.caption, { color: colors.inkMuted, flex: 1 }]}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{head}: </Text>
                {tail}
              </Text>
            </View>
          ))}
          <Text style={[type.caption, { color: colors.inkFaint, marginTop: space.xs }]}>
            Descripciones de los indicadores, no recomendaciones de operación.
          </Text>
        </View>
      </Panel>

      {/* Noticias */}
      <Panel legend="Yahoo Finance" title="Noticias del mercado" padded={false}>
        {newsLoading ? (
          <View style={{ padding: space.lg, gap: space.lg }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.md }}>
                <Skeleton width={72} height={56} />
                <View style={{ flex: 1, gap: space.sm }}>
                  <Skeleton />
                  <Skeleton width="60%" />
                </View>
              </View>
            ))}
          </View>
        ) : news.length === 0 ? (
          <EmptyState
            icon="newspaper-outline"
            title="Sin noticias ahora mismo"
            body="El proveedor no ha devuelto titulares para este momento. Desliza hacia abajo para volver a pedirlos."
          />
        ) : (
          news.map((article, index) => (
            <View key={`${article.link}-${index}`}>
              <Pressable
                onPress={() => openNewsLink(article.link)}
                accessibilityRole="link"
                accessibilityLabel={article.title}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.lg,
                    backgroundColor: pressed ? colors.accentWash : 'transparent',
                  },
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                ]}
              >
                {article.thumbnail ? (
                  <Image
                    source={{ uri: article.thumbnail }}
                    style={{
                      width: 72,
                      height: 56,
                      borderRadius: radius.xs,
                      borderWidth: hairline,
                      borderColor: colors.rule,
                      backgroundColor: colors.surfaceSunken,
                    }}
                    resizeMode="cover"
                  />
                ) : null}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[type.label, { color: colors.ink }]} numberOfLines={2}>
                    {article.title}
                  </Text>
                  {article.summary ? (
                    <Text style={[type.caption, { color: colors.inkMuted }]} numberOfLines={2}>
                      {article.summary}
                    </Text>
                  ) : null}
                  <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}>
                    {article.publisher} · {article.published_date}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={15} color={colors.inkFaint} />
              </Pressable>
              {index < news.length - 1 ? <Rule /> : null}
            </View>
          ))
        )}
      </Panel>

      <Text style={[type.legend, { color: colors.inkFaint, textAlign: 'center' }]}>
        Datos de Yahoo Finance
      </Text>
    </ScrollView>
  );
}
