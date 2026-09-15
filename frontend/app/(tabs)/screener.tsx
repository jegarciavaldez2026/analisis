/**
 * Screener de acciones
 *
 * Los filtros son los ratios principales de la pantalla de Análisis, con su
 * MISMO nombre y su umbral orientativo junto a cada campo (GET /screener/ratios).
 *
 * Tres cosas que la pantalla tiene que decir, porque sin ellas se lee mal:
 * · Hay dos fuentes. La mayoría sale del resumen de Yahoo y llega en segundos;
 *   ROIC, WACC, Altman, Piotroski, Montier… salen del mismo cálculo que
 *   Análisis, que tarda ~2 s por valor y se hace en segundo plano. Mientras no
 *   termina, la respuesta trae `pendientes` y la búsqueda se repite sola.
 * · Un valor SIN el dato no pasa el filtro de ese ratio. Se cuenta cuántos
 *   quedaron fuera por eso, para que «0 resultados» no se lea como «ninguno
 *   cumple» cuando lo que faltaba era el dato.
 * · WACC, Piotroski y Montier llevan una nota junto al filtro: en Análisis se
 *   calculan con simplificaciones que cambian su lectura.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

interface DefRatio {
  clave: string;
  nombre: string;
  grupo: string;
  unidad: '%' | 'x' | 'B' | 'z' | 'pts' | string;
  umbral_analisis: string;
  /** `historico`: sale de las cotizaciones diarias (rentabilidades, beta de 1 año, técnicos). */
  fuente: 'resumen' | 'analisis' | 'historico';
  nota?: string | null;
}

interface ScreenerResult {
  ticker: string;
  company_name: string;
  sector: string;
  industry: string;
  current_price: number;
  /** Divisa de cotización: en España y Europa no es el dólar (y Londres cotiza en peniques, GBp). */
  currency?: string | null;
  ratios: Record<string, number | null>;
  recommendation: string;
}

interface RespuestaScreener {
  resultados: ScreenerResult[];
  universo: number;
  analizados: number;
  sin_dato: Record<string, number>;
  pendientes: number;
  nombre_universo?: string;
  /** Sólo al buscar en el mercado: empresas que encontró Yahoo con los filtros que admite. */
  total_mercado?: number | null;
  filtros_en_yahoo?: string[];
  /** Descartadas por tener la sede fuera del universo (ADR, líneas extranjeras). */
  fuera_de_region?: number;
  filtros_aplicados: Record<string, { min?: number; max?: number }>;
  fuente: string;
}

interface Preset {
  name: string;
  description: string;
  filters: { filtros?: Record<string, { min?: number; max?: number }> };
}

type Limites = Record<string, { min: string; max: string }>;

/** Lo que se enseña en cada tarjeta además de lo filtrado. */
const RATIOS_BASE = ['per', 'roe', 'dividend_yield', 'deuda_capital'];
/** Cada cuánto se repite una búsqueda con cálculos pendientes, y hasta cuántas veces. */
const REINTENTO_MS = 4000;
const MAX_REINTENTOS = 15;

/**
 * Dónde buscar. «app» son los 30 valores fijos; el resto va al screener de
 * Yahoo, que filtra en su servidor sobre miles de empresas y devuelve la lista.
 */
const UNIVERSOS = [
  { clave: 'app', texto: 'Valores de la app' },
  { clave: 'us', texto: 'EE. UU.' },
  { clave: 'es', texto: 'España' },
  { clave: 'europa', texto: 'Europa' },
] as const;
type Universo = (typeof UNIVERSOS)[number]['clave'];

/** «P/E Ratio (Precio/Beneficio)» → «P/E Ratio»: el nombre largo no cabe en la rejilla. */
const corto = (nombre: string) => nombre.replace(/\s*\(.*\)\s*$/, '');

function formatear(v: number | null | undefined, unidad: string): string {
  if (v === null || v === undefined) return '—';
  if (unidad === '%') return `${v.toFixed(1)} %`;
  // Miles de millones en la divisa de la empresa: fuera de EE. UU. no son dólares.
  if (unidad === 'B') return `${v.toFixed(1)} B`;
  if (unidad === 'pts') return v.toFixed(0);
  return v.toFixed(2);
}

/** Texto de un campo → número, o `undefined` si está vacío o no es número. */
function numero(texto: string): number | undefined {
  const limpio = texto.replace(',', '.').trim();
  if (!limpio) return undefined;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : undefined;
}

export default function ScreenerScreen() {
  const { colors } = useTheme();
  const [definiciones, setDefiniciones] = useState<DefRatio[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [respuesta, setRespuesta] = useState<RespuestaScreener | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [limites, setLimites] = useState<Limites>({});
  const [universo, setUniverso] = useState<Universo>('app');
  /** Tarjetas para mirar pocas; detalle para comparar muchas en columna. */
  const [vista, setVista] = useState<'tarjetas' | 'detalle'>('tarjetas');
  /** Orden de la vista de detalle. `null` = el del backend (mayor capitalización primero). */
  const [orden, setOrden] = useState<{ clave: string; asc: boolean } | null>(null);
  /** Última búsqueda, para repetirla al deslizar o mientras haya pendientes. */
  const ultimoCuerpo = useRef<object | null>(null);
  const reintentos = useRef(0);

  useEffect(() => {
    // Pedir las definiciones arranca además en el backend el cálculo de los
    // ratios de Análisis: cuando se busca, normalmente ya están.
    axios
      .get(`${BACKEND_URL}/api/screener/ratios`)
      .then((r) => setDefiniciones(r.data.ratios ?? []))
      .catch((e) => console.error('Error fetching screener ratios:', e));
    axios
      .get(`${BACKEND_URL}/api/screener/presets`)
      .then((r) => setPresets(r.data.presets ?? []))
      .catch((e) => console.error('Error fetching presets:', e));
  }, []);

  const porClave = useMemo(
    () => Object.fromEntries(definiciones.map((d) => [d.clave, d])) as Record<string, DefRatio>,
    [definiciones],
  );

  const grupos = useMemo(() => {
    const salida: { grupo: string; ratios: DefRatio[] }[] = [];
    for (const d of definiciones) {
      const g = salida.find((x) => x.grupo === d.grupo);
      if (g) g.ratios.push(d);
      else salida.push({ grupo: d.grupo, ratios: [d] });
    }
    return salida;
  }, [definiciones]);

  /** Columnas del detalle: TODO lo filtrado más los ratios base, sin el tope de 8 de la tarjeta. */
  const columnas = useMemo(
    () => [...new Set([...Object.keys(respuesta?.filtros_aplicados ?? {}), ...RATIOS_BASE])],
    [respuesta],
  );

  const resultadosOrdenados = useMemo(() => {
    const lista = [...(respuesta?.resultados ?? [])];
    if (!orden) return lista;
    const valor = (s: ScreenerResult): string | number | null =>
      orden.clave === 'ticker' ? s.ticker
        : orden.clave === 'empresa' ? s.company_name
        : orden.clave === 'precio' ? s.current_price
        : s.ratios?.[orden.clave] ?? null;
    return lista.sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      // Sin dato, siempre al final: ordenar un hueco como si fuera 0 lo colaría arriba o abajo.
      if (va === null) return vb === null ? 0 : 1;
      if (vb === null) return -1;
      const cmp = typeof va === 'string' ? va.localeCompare(String(vb)) : va - (vb as number);
      return orden.asc ? cmp : -cmp;
    });
  }, [respuesta, orden]);

  const alternarOrden = (clave: string) =>
    setOrden((o) => (o?.clave === clave ? { clave, asc: !o.asc } : { clave, asc: clave === 'ticker' || clave === 'empresa' }));

  /** `silenciosa`: repetición automática. No tapa los resultados con el indicador. */
  const runScreener = useCallback(async (cuerpo: object, silenciosa = false) => {
    if (!silenciosa) {
      setLoading(true);
      reintentos.current = 0;
    }
    setError(null);
    ultimoCuerpo.current = cuerpo;
    try {
      const r = await axios.post(`${BACKEND_URL}/api/screener`, cuerpo, { timeout: 90000 });
      // Una respuesta de una búsqueda anterior no puede pisar la actual.
      if (ultimoCuerpo.current === cuerpo) setRespuesta(r.data);
    } catch (e) {
      console.error('Error running screener:', e);
      if (!silenciosa) setError('No se pudo ejecutar el screener. Vuelve a intentarlo en unos segundos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Mientras falten cálculos de Análisis, se repite la misma búsqueda. Con tope:
  // un valor que Yahoo no resuelve no puede dejar la pantalla preguntando siempre.
  useEffect(() => {
    if (!respuesta?.pendientes || !ultimoCuerpo.current || reintentos.current >= MAX_REINTENTOS) return;
    const cuerpo = ultimoCuerpo.current;
    const id = setTimeout(() => {
      reintentos.current += 1;
      void runScreener(cuerpo, true);
    }, REINTENTO_MS);
    return () => clearTimeout(id);
  }, [respuesta, runScreener]);

  const applyPreset = (preset: Preset) => {
    const filtros = preset.filters.filtros ?? {};
    // Los valores del preset quedan escritos en el panel: así se ve qué filtra
    // y se puede ajustar a partir de ahí.
    const nuevos: Limites = {};
    for (const [clave, l] of Object.entries(filtros)) {
      nuevos[clave] = { min: l.min !== undefined ? String(l.min) : '', max: l.max !== undefined ? String(l.max) : '' };
    }
    setLimites(nuevos);
    setActivePreset(preset.name);
    setShowFilters(false);
    runScreener({ filtros, universo });
  };

  const applyCustomFilters = () => {
    const filtros: Record<string, { min?: number; max?: number }> = {};
    for (const [clave, l] of Object.entries(limites)) {
      const min = numero(l.min);
      const max = numero(l.max);
      if (min !== undefined || max !== undefined) filtros[clave] = { min, max };
    }
    setActivePreset('Personalizado');
    setShowFilters(false);
    runScreener({ filtros, universo });
  };

  const clearFilters = () => {
    setLimites({});
    setActivePreset(null);
    setRespuesta(null);
    ultimoCuerpo.current = null;
  };

  /** Cambiar dónde se busca repite la última búsqueda en el universo nuevo. */
  const cambiarUniverso = (nuevo: Universo) => {
    setUniverso(nuevo);
    if (ultimoCuerpo.current) runScreener({ ...ultimoCuerpo.current, universo: nuevo });
  };

  const cambiarLimite = (clave: string, lado: 'min' | 'max', texto: string) =>
    setLimites((prev) => ({
      ...prev,
      [clave]: { min: prev[clave]?.min ?? '', max: prev[clave]?.max ?? '', [lado]: texto },
    }));

  const filtrosActivos = Object.values(limites).filter((l) => l.min.trim() || l.max.trim()).length;

  const getRecommendationColor = (rec: string) =>
    rec === 'COMPRAR' ? colors.up : rec === 'VENDER' ? colors.down : colors.caution;

  const renderStockCard = (stock: ScreenerResult) => {
    const aplicados = new Set(Object.keys(respuesta?.filtros_aplicados ?? {}));
    const claves = [...new Set([...aplicados, ...RATIOS_BASE])].slice(0, 8);
    return (
      <View key={stock.ticker} style={[styles.stockCard, { backgroundColor: colors.card }]}>
        <View style={styles.stockHeader}>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.ticker, { color: colors.primary }]}>{stock.ticker}</Text>
            <Text style={[styles.companyName, { color: colors.text }]} numberOfLines={1}>
              {stock.company_name}
            </Text>
            <Text style={[styles.sector, { color: colors.textSecondary }]}>{stock.sector}</Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={[styles.price, { color: colors.text }]}>
              {stock.current_price.toFixed(2)} {stock.currency || 'USD'}
            </Text>
            <View style={[styles.recBadge, { backgroundColor: getRecommendationColor(stock.recommendation) + '20' }]}>
              <Text style={[styles.recText, { color: getRecommendationColor(stock.recommendation) }]}>
                {stock.recommendation}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.metricsGrid, { borderTopColor: colors.border }]}>
          {claves.map((clave) => {
            const def = porClave[clave];
            const filtrado = aplicados.has(clave);
            return (
              <View key={clave} style={styles.metricItem}>
                <Text
                  style={[styles.metricLabel, { color: filtrado ? colors.primary : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {def ? corto(def.nombre) : clave}
                </Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>
                  {formatear(stock.ratios?.[clave], def?.unidad ?? 'x')}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  /** Vista de detalle: una fila por valor y una columna por ratio, con cabeceras que ordenan. */
  const renderDetalle = () => {
    const aplicados = new Set(Object.keys(respuesta?.filtros_aplicados ?? {}));
    const cabecera = (clave: string, texto: string, ancho: number, derecha = false, resaltada = false) => {
      const activa = orden?.clave === clave;
      return (
        <Pressable
          key={clave}
          onPress={() => alternarOrden(clave)}
          accessibilityRole="button"
          accessibilityLabel={`Ordenar por ${texto}${activa ? (orden?.asc ? ', ascendente' : ', descendente') : ''}`}
          style={[styles.celdaCabecera, { width: ancho, alignItems: derecha ? 'flex-end' : 'flex-start' }]}
        >
          <Text
            style={[styles.textoCabecera, { color: resaltada || activa ? colors.primary : colors.textSecondary }]}
            numberOfLines={2}
          >
            {texto}
            {activa ? (orden?.asc ? ' ▲' : ' ▼') : ''}
          </Text>
        </Pressable>
      );
    };
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator style={[styles.tabla, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View>
          <View style={[styles.filaTabla, { borderBottomColor: colors.border }]}>
            {cabecera('ticker', 'Ticker', 80)}
            {cabecera('empresa', 'Empresa', 210)}
            <View style={[styles.celdaCabecera, { width: 150 }]}>
              <Text style={[styles.textoCabecera, { color: colors.textSecondary }]}>Sector</Text>
            </View>
            {cabecera('precio', 'Precio', 112, true)}
            <View style={[styles.celdaCabecera, { width: 104 }]}>
              <Text style={[styles.textoCabecera, { color: colors.textSecondary }]}>Lectura</Text>
            </View>
            {columnas.map((clave) =>
              cabecera(clave, porClave[clave] ? corto(porClave[clave].nombre) : clave, 104, true, aplicados.has(clave)),
            )}
          </View>
          {resultadosOrdenados.map((stock, i) => (
            <View
              key={stock.ticker}
              style={[
                styles.filaTabla,
                { borderBottomColor: colors.border, backgroundColor: i % 2 ? colors.background : 'transparent' },
              ]}
            >
              <Text style={[styles.celda, styles.celdaTicker, { width: 80, color: colors.primary }]}>{stock.ticker}</Text>
              <Text style={[styles.celda, { width: 210, color: colors.text }]} numberOfLines={1}>
                {stock.company_name}
              </Text>
              <Text style={[styles.celda, { width: 150, color: colors.textSecondary }]} numberOfLines={1}>
                {stock.sector}
              </Text>
              <Text style={[styles.celda, styles.celdaNumero, { width: 112, color: colors.text }]}>
                {stock.current_price.toFixed(2)} {stock.currency || 'USD'}
              </Text>
              <View style={[styles.celda, { width: 104 }]}>
                <Text style={[styles.recText, { color: getRecommendationColor(stock.recommendation) }]}>
                  {stock.recommendation}
                </Text>
              </View>
              {columnas.map((clave) => {
                const v = stock.ratios?.[clave];
                return (
                  <Text
                    key={clave}
                    style={[
                      styles.celda,
                      styles.celdaNumero,
                      { width: 104, color: v == null ? colors.textSecondary : colors.text },
                    ]}
                  >
                    {formatear(v, porClave[clave]?.unidad ?? 'x')}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const resultados = respuesta?.resultados ?? [];
  const excluidosSinDato = Object.entries(respuesta?.sin_dato ?? {}).filter(([, n]) => n > 0);
  /** Revisadas que no llegaron: ni las descartadas por región ni las pendientes son «sin datos». */
  const sinDatosYahoo = respuesta
    ? Math.max(0, respuesta.universo - respuesta.analizados - (respuesta.fuera_de_region ?? 0) - respuesta.pendientes)
    : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Dónde buscar */}
      <View style={styles.universos}>
        <Text style={[styles.universoRotulo, { color: colors.textSecondary }]}>Buscar en</Text>
        {UNIVERSOS.map((u) => {
          const activo = universo === u.clave;
          return (
            <TouchableOpacity
              key={u.clave}
              onPress={() => cambiarUniverso(u.clave)}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              style={[
                styles.universoChip,
                { borderColor: activo ? colors.primary : colors.border, backgroundColor: activo ? colors.primary : 'transparent' },
              ]}
            >
              <Text style={[styles.universoTexto, { color: activo ? colors.inkOnAccent : colors.text }]}>{u.texto}</Text>
            </TouchableOpacity>
          );
        })}
        {universo !== 'app' ? (
          <Text style={[styles.universoRotulo, { color: colors.textSecondary, flexBasis: '100%' }]}>
            Empresas con sede en la región. Yahoo filtra en su servidor con los ratios que admite y se revisan aquí
            las 40 de mayor capitalización con todos tus filtros. Precios y capitalización en la divisa de cada una.
          </Text>
        ) : null}
      </View>

      {/* Presets */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.presetsContainer, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.presetsContent}
      >
        {presets.map((preset) => {
          const activo = activePreset === preset.name;
          return (
            <TouchableOpacity
              key={preset.name}
              style={[styles.presetButton, { backgroundColor: activo ? colors.primary : colors.card }]}
              onPress={() => applyPreset(preset)}
            >
              <Text style={[styles.presetName, { color: activo ? colors.inkOnAccent : colors.text }]}>
                {preset.name}
              </Text>
              <Text
                style={[styles.presetDesc, { color: activo ? colors.inkOnAccent : colors.textSecondary }]}
                numberOfLines={1}
              >
                {preset.description}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[styles.presetButton, styles.customButton, { backgroundColor: colors.card, borderColor: colors.primary }]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="options" size={20} color={colors.primary} />
          <Text style={[styles.presetName, { color: colors.primary }]}>
            Filtros{filtrosActivos ? ` (${filtrosActivos})` : ''}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Filtros por ratio, agrupados como en Análisis */}
      {showFilters && (
        <View style={[styles.filtersContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.filtersHint, { color: colors.textSecondary }]}>
            Deja en blanco lo que no quieras filtrar. Junto a cada ratio, el umbral que usa la pantalla de Análisis.
            Porcentajes en %: 15 = 15 %. Los marcados «cálculo de Análisis» salen de los estados financieros y
            pueden tardar unos segundos la primera vez.
          </Text>
          <ScrollView style={styles.filtersScroll} nestedScrollEnabled>
            {grupos.map(({ grupo, ratios }) => (
              <View key={grupo} style={styles.grupo}>
                <Text style={[styles.grupoTitulo, { color: colors.text }]}>{grupo}</Text>
                {ratios.map((d) => (
                  <View key={d.clave} style={[styles.filaRatio, { borderBottomColor: colors.border }]}>
                    <View style={styles.filaNombre}>
                      <Text style={[styles.filterLabel, { color: colors.text }]} numberOfLines={2}>
                        {d.nombre}
                      </Text>
                      <Text style={[styles.umbral, { color: colors.textSecondary }]}>
                        Análisis: {d.umbral_analisis}
                        {d.fuente === 'analisis'
                          ? ' · cálculo de Análisis'
                          : d.fuente === 'historico'
                            ? ' · cotizaciones diarias'
                            : ''}
                      </Text>
                      {d.nota ? <Text style={[styles.nota, { color: colors.caution, marginBottom: 0 }]}>{d.nota}</Text> : null}
                    </View>
                    {(['min', 'max'] as const).map((lado) => (
                      <TextInput
                        key={lado}
                        style={[
                          styles.filterInput,
                          { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
                        ]}
                        value={limites[d.clave]?.[lado] ?? ''}
                        onChangeText={(t) => cambiarLimite(d.clave, lado, t)}
                        placeholder={lado === 'min' ? 'mín' : 'máx'}
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`${d.nombre}, ${lado === 'min' ? 'mínimo' : 'máximo'}`}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
          <View style={styles.filterActions}>
            <TouchableOpacity style={[styles.filterButton, { backgroundColor: colors.primary }]} onPress={applyCustomFilters}>
              <Text style={[styles.filterButtonText, { color: colors.inkOnAccent }]}>Buscar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterButton, styles.clearButton, { borderColor: colors.border }]}
              onPress={clearFilters}
            >
              <Text style={[styles.clearButtonText, { color: colors.textSecondary }]}>Limpiar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Analizando acciones...</Text>
        </View>
      ) : respuesta ? (
        <ScrollView
          style={styles.resultsContainer}
          contentContainerStyle={styles.resultsContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                if (!ultimoCuerpo.current) return;
                setRefreshing(true);
                runScreener(ultimoCuerpo.current);
              }}
              tintColor={colors.primary}
            />
          }
        >
          {respuesta.total_mercado != null ? (
            <Text style={[styles.nota, { color: colors.textSecondary }]}>
              {`Yahoo encontró ${respuesta.total_mercado} empresas en ${respuesta.nombre_universo}`}
              {respuesta.filtros_en_yahoo?.length
                ? ` aplicando en su servidor ${respuesta.filtros_en_yahoo.length} de tus filtros`
                : ''}
              {`. Se revisan las ${respuesta.universo} de mayor capitalización, y aquí se comprueban todos.`}
              {respuesta.fuera_de_region
                ? ` ${respuesta.fuera_de_region} descartada(s) por tener la sede fuera de ${respuesta.nombre_universo}.`
                : ''}
            </Text>
          ) : null}
          <View style={styles.barraResultados}>
            <Text style={[styles.resultsCount, { color: colors.textSecondary, flexShrink: 1, marginBottom: 0 }]}>
              {resultados.length} de {respuesta.analizados} valores cumplen
              {sinDatosYahoo ? ` · ${sinDatosYahoo} sin datos de Yahoo ahora mismo` : ''}
            </Text>
            <View style={styles.conmutador} accessibilityRole="tablist">
              {([['tarjetas', 'Tarjetas', 'grid-outline'], ['detalle', 'Detalle', 'list-outline']] as const).map(
                ([clave, texto, icono]) => {
                  const activa = vista === clave;
                  return (
                    <Pressable
                      key={clave}
                      onPress={() => setVista(clave)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: activa }}
                      style={[
                        styles.opcionVista,
                        {
                          borderColor: activa ? colors.primary : colors.border,
                          backgroundColor: activa ? colors.accentWash : 'transparent',
                        },
                      ]}
                    >
                      <Ionicons name={icono} size={14} color={activa ? colors.primary : colors.textSecondary} />
                      <Text style={[styles.textoVista, { color: activa ? colors.primary : colors.textSecondary }]}>
                        {texto}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </View>
          </View>
          {respuesta.pendientes > 0 ? (
            <View style={styles.pendientes}>
              <ActivityIndicator size="small" color={colors.caution} />
              <Text style={[styles.nota, { color: colors.caution, marginBottom: 0, flexShrink: 1 }]}>
                Calculando los ratios de Análisis de {respuesta.pendientes} valor(es): la lista se completa sola en unos
                segundos.
              </Text>
            </View>
          ) : null}
          {excluidosSinDato.length ? (
            <Text style={[styles.nota, { color: colors.caution }]}>
              Fuera por falta de dato:{' '}
              {excluidosSinDato.map(([c, n]) => `${porClave[c] ? corto(porClave[c].nombre) : c} (${n})`).join(', ')}.
            </Text>
          ) : null}
          <Text style={[styles.nota, { color: colors.textSecondary }]}>{respuesta.fuente}</Text>
          {vista === 'detalle' && resultados.length ? renderDetalle() : resultados.map(renderStockCard)}
          {!resultados.length && !respuesta.pendientes ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Ningún valor cumple todos los filtros. Afloja alguno o quita los que dejan fuera valores por falta de
              dato.
            </Text>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={60} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Screener de Acciones</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {error ?? 'Elige un preset o abre «Filtros» para buscar por los ratios de Análisis.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  universos: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  universoRotulo: { fontSize: 12, lineHeight: 17 },
  universoChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  universoTexto: { fontSize: 12, fontWeight: '600' },
  presetsContainer: { maxHeight: 90, borderBottomWidth: StyleSheet.hairlineWidth },
  presetsContent: { padding: 12, gap: 10 },
  presetButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, minWidth: 120, marginRight: 10 },
  customButton: { borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  presetName: { fontSize: 14, fontWeight: '600' },
  presetDesc: { fontSize: 11, marginTop: 2 },
  filtersContainer: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  filtersHint: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  filtersScroll: { maxHeight: 380 },
  grupo: { marginBottom: 12 },
  grupoTitulo: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  filaRatio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filaNombre: { flex: 1, minWidth: 0 },
  filterLabel: { fontSize: 13, fontWeight: '500' },
  umbral: { fontSize: 11, marginTop: 1 },
  filterInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, width: 72 },
  filterActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  filterButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  filterButtonText: { fontWeight: '600' },
  clearButton: { backgroundColor: 'transparent', borderWidth: 1 },
  clearButtonText: { fontWeight: '600' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  resultsContainer: { flex: 1 },
  resultsContent: { padding: 16 },
  resultsCount: { fontSize: 12, marginBottom: 4 },
  barraResultados: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  conmutador: { flexDirection: 'row', gap: 4 },
  opcionVista: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  textoVista: { fontSize: 12, fontWeight: '600' },
  tabla: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, marginBottom: 12 },
  filaTabla: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  celdaCabecera: { paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center', minHeight: 44 },
  textoCabecera: { fontSize: 11, fontWeight: '700' },
  celda: { paddingHorizontal: 10, paddingVertical: 9, fontSize: 13 },
  celdaTicker: { fontWeight: '700' },
  celdaNumero: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  pendientes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  nota: { fontSize: 11, lineHeight: 16, marginBottom: 8 },
  stockCard: { borderRadius: 12, padding: 16, marginBottom: 12 },
  stockHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  ticker: { fontSize: 18, fontWeight: 'bold' },
  companyName: { fontSize: 14, maxWidth: 220 },
  sector: { fontSize: 11, marginTop: 2 },
  priceContainer: { alignItems: 'flex-end' },
  price: { fontSize: 18, fontWeight: '600' },
  recBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4 },
  recText: { fontSize: 10, fontWeight: 'bold' },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metricItem: { width: '25%', minWidth: 80, alignItems: 'center', paddingHorizontal: 2 },
  metricLabel: { fontSize: 10, marginBottom: 4 },
  metricValue: { fontSize: 14, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
