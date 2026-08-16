/**
 * Simulador de inversión.
 *
 * "Si hubieras metido 1.000 en esto, ¿cuánto tendrías hoy?" — la pregunta que
 * un porcentaje de rentabilidad no responde de forma intuitiva.
 *
 * Reutiliza `/api/chart/{ticker}`, que ya devuelve la serie del activo y la del
 * S&P 500 indexadas a base 100. Convertir base 100 a dinero es una regla de
 * tres, así que no hace falta endpoint nuevo ni cálculo en servidor.
 *
 * Dos honestidades deliberadas:
 *  - Se compara siempre contra el S&P 500. Un +40 % no significa nada suelto:
 *    significa una cosa si el mercado hizo +60 % y otra si hizo −10 %.
 *  - Si el activo cotiza en otra divisa y se pide el resultado en euros, se
 *    convierte al tipo de cambio de HOY y se dice, porque el efecto divisa a
 *    lo largo del periodo no está en estos datos.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import axios from 'axios';

import { useTheme } from '../contexts/ThemeContext';
import { Field, InstrumentChart, Legend, Notice, Panel, Rule, SkeletonRows } from './ui';
import type { ChartPoint } from './ui';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

const PERIODOS = [
  { key: '1m', label: '1M', texto: 'un mes' },
  { key: '3m', label: '3M', texto: 'tres meses' },
  { key: '6m', label: '6M', texto: 'seis meses' },
  { key: '1y', label: '1A', texto: 'un año' },
  { key: '5y', label: '5A', texto: 'cinco años' },
] as const;

type PeriodoKey = (typeof PERIODOS)[number]['key'];

interface Props {
  ticker: string;
  /** Divisa en la que cotiza el activo, según los metadatos del análisis. */
  currency?: string;
}

interface PuntoSerie {
  date: string;
  stock_value: number;
  sp500_value: number;
}

const IMPORTE_POR_DEFECTO = 1000;

export default function InvestmentSimulator({ ticker, currency = 'USD' }: Props) {
  const { colors, space, type, radius, hairline, numeric } = useTheme();

  const [importeTexto, setImporteTexto] = useState(String(IMPORTE_POR_DEFECTO));
  const [divisa, setDivisa] = useState<'nativa' | 'EUR'>('nativa');
  const [periodo, setPeriodo] = useState<PeriodoKey>('1y');
  const [serie, setSerie] = useState<PuntoSerie[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eurUsd, setEurUsd] = useState<number | null>(null);

  const importe = useMemo(() => {
    const n = Number(importeTexto.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : IMPORTE_POR_DEFECTO;
  }, [importeTexto]);

  const cargar = useCallback(async (p: PeriodoKey) => {
    setCargando(true);
    setError(null);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/chart/${ticker}`, {
        params: { period: p },
        timeout: 15000,
      });
      const datos: PuntoSerie[] = res.data?.chart_data ?? [];
      if (!datos.length) throw new Error('sin datos');
      setSerie(datos);
    } catch {
      setSerie(null);
      setError('No se pudo cargar la serie de precios para este periodo.');
    } finally {
      setCargando(false);
    }
  }, [ticker]);

  useEffect(() => { cargar(periodo); }, [cargar, periodo]);

  // El tipo de cambio sólo se pide si de verdad hace falta.
  useEffect(() => {
    if (divisa !== 'EUR' || eurUsd != null || currency === 'EUR') return;
    axios
      .get(`${BACKEND_URL}/api/market-indicators`, { timeout: 10000 })
      .then((r) => {
        const rate = r.data?.eur_usd?.rate;
        if (Number.isFinite(rate) && rate > 0) setEurUsd(rate);
      })
      .catch(() => { /* sin tipo de cambio se muestra en la divisa nativa */ });
  }, [divisa, eurUsd, currency]);

  /** Factor para pasar de la divisa del activo a la elegida. */
  const factor = divisa === 'EUR' && currency !== 'EUR' && eurUsd ? 1 / eurUsd : 1;
  const simbolo = divisa === 'EUR' && (currency === 'EUR' || eurUsd) ? '€' : currency === 'EUR' ? '€' : '$';
  const convertido = divisa === 'EUR' && currency !== 'EUR' && !!eurUsd;

  const fmtDinero = useCallback(
    (v: number) =>
      `${simbolo}${v.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
    [simbolo],
  );

  const calculo = useMemo(() => {
    if (!serie?.length) return null;
    // base 100 → dinero: el importe se multiplica por el índice de cada día.
    const enDinero = (base: number) => (importe * base) / 100;

    const activo: ChartPoint[] = serie.map((p) => ({
      x: new Date(p.date).getTime(),
      y: Number.isFinite(p.stock_value) ? enDinero(p.stock_value) * factor : null,
    }));
    const indice: ChartPoint[] = serie.map((p) => ({
      x: new Date(p.date).getTime(),
      y: Number.isFinite(p.sp500_value) ? enDinero(p.sp500_value) * factor : null,
    }));

    const validos = activo.map((p) => p.y).filter((v): v is number => v != null);
    const indiceValidos = indice.map((p) => p.y).filter((v): v is number => v != null);
    if (validos.length < 2) return null;

    const inicial = importe * factor;
    const final = validos[validos.length - 1];
    const finalIndice = indiceValidos.length ? indiceValidos[indiceValidos.length - 1] : null;

    return {
      activo,
      indice,
      inicial,
      final,
      resultado: final - inicial,
      pct: ((final - inicial) / inicial) * 100,
      finalIndice,
      resultadoIndice: finalIndice != null ? finalIndice - inicial : null,
      // Cuánto se ha ganado o perdido frente a haber comprado el índice.
      diferencial: finalIndice != null ? final - finalIndice : null,
    };
  }, [serie, importe, factor]);

  const gana = (calculo?.resultado ?? 0) >= 0;
  const tono = gana ? colors.up : colors.down;
  const textoPeriodo = PERIODOS.find((p) => p.key === periodo)?.texto ?? '';

  return (
    <Panel
      title={`Si hubieras invertido ${fmtDinero(importe * factor)} hace ${textoPeriodo}`}
      legend="Simulación sobre precios históricos"
      padded={false}
    >
      {/* Controles */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: space.md,
          padding: space.lg,
        }}
      >
        <View style={{ gap: space.xs, minWidth: 150, flex: 1 }}>
          <Legend>Importe inicial</Legend>
          <Field
            value={importeTexto}
            onChangeText={setImporteTexto}
            keyboardType="numeric"
            placeholder={String(IMPORTE_POR_DEFECTO)}
            accessibilityLabel="Importe inicial de la simulación"
          />
        </View>

        <View style={{ gap: space.xs }}>
          <Legend>Divisa</Legend>
          <View
            style={{
              flexDirection: 'row',
              borderWidth: hairline,
              borderColor: colors.rule,
              borderRadius: radius.xs,
              overflow: 'hidden',
              backgroundColor: colors.surfaceSunken,
            }}
          >
            {([['nativa', currency], ['EUR', 'EUR']] as const).map(([key, etiqueta], i) => {
              const on = divisa === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setDivisa(key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [
                    {
                      minWidth: 56,
                      minHeight: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: space.md,
                      backgroundColor: on ? colors.accent : pressed ? colors.accentWash : 'transparent',
                      borderLeftWidth: i === 0 ? 0 : hairline,
                      borderLeftColor: colors.rule,
                    },
                    Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                  ]}
                >
                  <Text
                    style={[
                      type.caption,
                      { color: on ? colors.inkOnAccent : colors.inkMuted, fontWeight: on ? '700' : '500' },
                    ]}
                  >
                    {etiqueta}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <Rule />

      {/* Resultado */}
      {cargando ? (
        <View style={{ padding: space.lg }}>
          <SkeletonRows rows={4} />
        </View>
      ) : error ? (
        <View style={{ padding: space.lg }}>
          <Notice tone="down" title="Sin serie de precios" body={error} />
        </View>
      ) : calculo ? (
        <>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space.lg,
              padding: space.lg,
              alignItems: 'flex-end',
            }}
          >
            <View style={{ gap: 2 }}>
              <Legend>Tendrías hoy</Legend>
              <Text style={[type.display, numeric, { color: tono }]}>{fmtDinero(calculo.final)}</Text>
            </View>

            <View style={{ gap: 2 }}>
              <Legend>{gana ? 'Ganancia' : 'Pérdida'}</Legend>
              <Text style={[type.title2, numeric, { color: tono }]}>
                {gana ? '+' : '−'}
                {fmtDinero(Math.abs(calculo.resultado))}
              </Text>
            </View>

            <View style={{ gap: 2 }}>
              <Legend>Rentabilidad</Legend>
              <Text style={[type.title2, numeric, { color: tono }]}>
                {gana ? '+' : '−'}
                {Math.abs(calculo.pct).toFixed(2)} %
              </Text>
            </View>

            {calculo.diferencial != null && (
              <View style={{ gap: 2 }}>
                <Legend>Frente al S&amp;P 500</Legend>
                <Text
                  style={[
                    type.title2,
                    numeric,
                    { color: calculo.diferencial >= 0 ? colors.up : colors.down },
                  ]}
                >
                  {calculo.diferencial >= 0 ? '+' : '−'}
                  {fmtDinero(Math.abs(calculo.diferencial))}
                </Text>
              </View>
            )}
          </View>

          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
            <InstrumentChart
              height={260}
              baseline={calculo.inicial}
              formatValue={(v) => fmtDinero(v)}
              ranges={PERIODOS.map((p) => ({ key: p.key, label: p.label }))}
              activeRange={periodo}
              onRangeChange={(k) => setPeriodo(k as PeriodoKey)}
              series={[
                { key: 'activo', label: ticker, showArea: true, points: calculo.activo },
                {
                  key: 'sp500',
                  label: 'S&P 500',
                  color: colors.inkMuted,
                  dashed: true,
                  points: calculo.indice,
                },
              ]}
            />
          </View>

          <Rule />
          <View style={{ padding: space.lg, gap: space.xs }}>
            <Text style={[type.caption, { color: colors.inkMuted }]}>
              La línea discontinua es el mismo importe invertido en el S&amp;P 500. La referencia
              horizontal marca el capital inicial: por encima se gana, por debajo se pierde.
            </Text>
            {convertido && (
              <Text style={[type.caption, { color: colors.caution }]}>
                Convertido de {currency} a euros al tipo de cambio de hoy. No recoge el efecto de la
                divisa durante el periodo, que en una inversión real sí cuenta.
              </Text>
            )}
            <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}>
              Calculado sobre precios de cierre. No incluye comisiones ni impuestos. La rentabilidad
              pasada no anticipa la futura.
            </Text>
          </View>
        </>
      ) : (
        <View style={{ padding: space.lg }}>
          <Notice
            tone="caution"
            title="Serie demasiado corta"
            body="No hay suficientes precios en este periodo para simular la inversión."
          />
        </View>
      )}
    </Panel>
  );
}
