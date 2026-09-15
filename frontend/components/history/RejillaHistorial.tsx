/**
 * Historial en rejilla — la vista de terminal.
 *
 * Las tarjetas contestan «¿qué pasa con ESTA empresa?». Esta rejilla contesta
 * la otra pregunta, que las tarjetas no pueden: **«¿cuál de todas?»**. Para
 * comparar veinte análisis hace falta que las cifras estén una debajo de otra
 * en la misma columna, a la misma altura y con la misma anchura de dígito; en
 * tarjetas apiladas eso no ocurre y el ojo no puede recorrerlas.
 *
 * Reglas heredadas de `CuentaIB` y `WatchlistTable`, que conviene no deshacer:
 *
 * · Cifras monoespaciadas y alineadas a la DERECHA. Es lo que permite comparar
 *   magnitudes de un vistazo: las unidades caen siempre en la misma columna.
 * · En pantalla estrecha la tabla se DESPLAZA en horizontal, no encoge. Once
 *   columnas de cifras a 400 px no dan una tabla pequeña, dan once columnas
 *   ilegibles.
 * · El dato que no existe es un guion con la tinta `noSignal`, nunca un cero.
 *   Un 0,00 % significa «no se movió», que es una afirmación distinta.
 * · Las cabeceras ordenan, y la activa dice en qué sentido.
 *
 * El veredicto va como distintivo de color y NO se usa para colorear la fila
 * entera: el color de fila ya lo reclama la variación del precio, y dos
 * codificaciones de color sobre el mismo elemento no se leen.
 */

import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { deltaTone, toneColors, verdictTone } from '../../theme/tokens';
import { Legend, Rule } from '../ui';

export interface FilaHistorial {
  id: string;
  ticker: string;
  company_name: string;
  analysis_date: string;
  recommendation: string;
  favorable_percentage: number;
  sector?: string | null;
  /** Métricas de mercado ya traídas por la pantalla, si las hay. */
  current_price?: number | null;
  change_1d?: number | null;
  change_1w?: number | null;
  change_1m?: number | null;
  change_ytd?: number | null;
  relative_volume?: number | null;
}

const n = (v: any): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);

const precio = (v: any) => {
  const x = n(v);
  return x == null ? null : x.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const pct = (v: any) => {
  const x = n(v);
  if (x == null) return null;
  const s = x > 0 ? '+' : x < 0 ? '−' : '';
  return `${s}${Math.abs(x).toFixed(2)}`;
};

const rvol = (v: any) => {
  const x = n(v);
  return x == null ? null : `${x.toFixed(2)}×`;
};

function fecha(iso: any): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return null;
  return t.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
}

type Col = {
  clave: keyof FilaHistorial | '_fav';
  etiqueta: string;
  ancho: number;
  izq?: boolean;
  /** Columna de variación: se tiñe según el signo. */
  delta?: boolean;
};

const COLUMNAS: Col[] = [
  { clave: 'ticker', etiqueta: 'Código', ancho: 84, izq: true },
  { clave: 'company_name', etiqueta: 'Empresa', ancho: 210, izq: true },
  { clave: 'current_price', etiqueta: 'Precio', ancho: 94 },
  { clave: 'change_1d', etiqueta: '1 día %', ancho: 84, delta: true },
  { clave: 'change_1w', etiqueta: '1 sem %', ancho: 84, delta: true },
  { clave: 'change_1m', etiqueta: '1 mes %', ancho: 84, delta: true },
  { clave: 'change_ytd', etiqueta: 'Año %', ancho: 84, delta: true },
  { clave: 'relative_volume', etiqueta: 'Vol. rel.', ancho: 80 },
  { clave: 'recommendation', etiqueta: 'Veredicto', ancho: 108, izq: true },
  { clave: 'favorable_percentage', etiqueta: 'Favorables', ancho: 96 },
  { clave: 'sector', etiqueta: 'Sector', ancho: 150, izq: true },
  { clave: 'analysis_date', etiqueta: 'Analizado', ancho: 100, izq: true },
];

const ANCHO_TOTAL = COLUMNAS.reduce((a, c) => a + c.ancho, 0);

export default function RejillaHistorial({
  filas,
  onAbrir,
}: {
  filas: FilaHistorial[];
  onAbrir?: (ticker: string) => void;
}) {
  const { colors, palette, space, type, numeric, hairline, radius } = useTheme();
  const [orden, setOrden] = useState<{ clave: string; desc: boolean }>({
    clave: 'analysis_date',
    desc: true,
  });

  const ordenadas = useMemo(() => {
    const c = [...(filas ?? [])];
    c.sort((a: any, b: any) => {
      const va = a[orden.clave];
      const vb = b[orden.clave];
      // El hueco va SIEMPRE al final, se ordene como se ordene: un `null` que
      // sube a lo alto al invertir el sentido se lee como un valor extremo.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (orden.clave === 'analysis_date') {
        const r = new Date(va).getTime() - new Date(vb).getTime();
        return orden.desc ? -r : r;
      }
      if (typeof va === 'string' || typeof vb === 'string') {
        const r = String(va).localeCompare(String(vb), 'es');
        return orden.desc ? -r : r;
      }
      return orden.desc ? Number(vb) - Number(va) : Number(va) - Number(vb);
    });
    return c;
  }, [filas, orden]);

  const pulsarCabecera = (clave: string) =>
    setOrden((o) => (o.clave === clave ? { clave, desc: !o.desc } : { clave, desc: true }));

  const celdaBase = {
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
    justifyContent: 'center' as const,
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: hairline,
        borderColor: colors.rule,
        borderRadius: radius.sm,
        overflow: 'hidden',
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: ANCHO_TOTAL }}>
        <View style={{ minWidth: ANCHO_TOTAL }}>
          {/* Cabecera */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.surfaceSunken,
              borderBottomWidth: hairline,
              borderBottomColor: colors.ruleStrong,
            }}
          >
            {COLUMNAS.map((c) => {
              const activa = orden.clave === c.clave;
              return (
                <Pressable
                  key={String(c.clave)}
                  onPress={() => pulsarCabecera(String(c.clave))}
                  accessibilityRole="button"
                  accessibilityLabel={`Ordenar por ${c.etiqueta}`}
                  style={({ pressed }) => [
                    celdaBase,
                    {
                      width: c.ancho,
                      minHeight: 34,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 2,
                      justifyContent: c.izq ? 'flex-start' : 'flex-end',
                      opacity: pressed ? 0.7 : 1,
                    },
                    Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                  ]}
                >
                  <Text
                    style={[
                      type.legend,
                      { color: activa ? colors.accent : colors.inkMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {c.etiqueta.toUpperCase()}
                  </Text>
                  {activa ? (
                    <Ionicons
                      name={orden.desc ? 'caret-down' : 'caret-up'}
                      size={10}
                      color={colors.accent}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Filas */}
          {ordenadas.map((f, i) => (
            <View key={f.id}>
              <Pressable
                onPress={() => onAbrir?.(f.ticker)}
                accessibilityRole="button"
                accessibilityLabel={`Abrir la ficha de ${f.ticker}`}
                style={({ pressed, hovered }: any) => [
                  {
                    flexDirection: 'row',
                    backgroundColor: pressed || hovered ? colors.surfaceSunken : 'transparent',
                  },
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                ]}
              >
                {COLUMNAS.map((c) => {
                  const bruto = (f as any)[c.clave];
                  let texto: string | null = null;
                  let tinta = colors.ink;
                  let esNumero = true;

                  switch (c.clave) {
                    case 'ticker':
                      texto = f.ticker;
                      tinta = colors.ink;
                      break;
                    case 'company_name':
                      texto = f.company_name || null;
                      tinta = colors.inkMuted;
                      esNumero = false;
                      break;
                    case 'sector':
                      texto = (f.sector && f.sector !== 'N/A' ? f.sector : null);
                      tinta = colors.inkMuted;
                      esNumero = false;
                      break;
                    case 'analysis_date':
                      texto = fecha(f.analysis_date);
                      tinta = colors.inkMuted;
                      break;
                    case 'recommendation': {
                      texto = f.recommendation || null;
                      esNumero = false;
                      break;
                    }
                    case 'current_price':
                      texto = precio(bruto);
                      break;
                    case 'relative_volume':
                      texto = rvol(bruto);
                      // Volumen relativo alto = algo pasa hoy. Se destaca, pero
                      // sin signo: no tiene dirección, sólo intensidad.
                      if (n(bruto) != null && Number(bruto) >= 2)
                        tinta = toneColors(palette, 'caution').fg;
                      break;
                    case 'favorable_percentage': {
                      const v = n(bruto);
                      texto = v == null ? null : `${v.toFixed(0)} %`;
                      break;
                    }
                    default:
                      texto = pct(bruto);
                      if (c.delta) tinta = toneColors(palette, deltaTone(n(bruto))).fg;
                  }

                  if (c.clave === 'recommendation' && texto) {
                    const t = toneColors(palette, verdictTone(texto));
                    return (
                      <View key={String(c.clave)} style={[celdaBase, { width: c.ancho }]}>
                        <View
                          style={{
                            alignSelf: 'flex-start',
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: radius.xs,
                            backgroundColor: t.wash,
                          }}
                        >
                          <Text style={[type.caption, { color: t.fg, fontWeight: '700' }]} numberOfLines={1}>
                            {texto}
                          </Text>
                        </View>
                      </View>
                    );
                  }

                  return (
                    <View
                      key={String(c.clave)}
                      style={[celdaBase, { width: c.ancho, minHeight: 30 }]}
                    >
                      <Text
                        style={[
                          type.label,
                          esNumero ? numeric : null,
                          {
                            color: texto == null ? colors.noSignal : tinta,
                            textAlign: c.izq ? 'left' : 'right',
                            fontWeight: c.clave === 'ticker' ? '700' : '500',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {texto ?? '—'}
                      </Text>
                    </View>
                  );
                })}
              </Pressable>
              {i < ordenadas.length - 1 ? <Rule /> : null}
            </View>
          ))}
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: space.sm,
          paddingVertical: space.xs,
          borderTopWidth: hairline,
          borderTopColor: colors.rule,
          backgroundColor: colors.surfaceSunken,
        }}
      >
        <Legend>
          {ordenadas.length} {ordenadas.length === 1 ? 'análisis' : 'análisis'} · toca una fila para
          abrir su ficha · desplaza en horizontal para ver el resto de columnas
        </Legend>
      </View>
    </View>
  );
}
