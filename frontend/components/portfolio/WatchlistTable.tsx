/**
 * Favoritos en detalle.
 *
 * Misma gramática que la tabla de posiciones: cifras monoespaciadas alineadas
 * a la derecha, cabeceras que ordenan, y desplazamiento horizontal en vez de
 * encoger la letra.
 *
 * La diferencia de fondo con el portafolio es qué pregunta responde. En
 * posiciones se compara lo que ya se tiene; aquí se vigila una distancia: a
 * cuánto está el precio del objetivo que fijaste. Por eso la columna que manda
 * no es el precio, es **cuánto falta** — y va coloreada según si la compra
 * está cerca o el objetivo de venta ya se ha alcanzado.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { Legend, Panel, Rule } from '../ui';
import { toneColors } from '../../theme/tokens';

export interface FavoritoDetalle {
  id: string;
  ticker: string;
  company_name: string;
  current_price?: number | null;
  target_buy_price?: number | null;
  target_sell_price?: number | null;
  price_change_threshold?: number | null;
  notify_on_price_change?: boolean;
  added_date?: string | null;
  notes?: string | null;
}

const n = (v: any) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

const usd = (v: any) => {
  const x = n(v);
  return x == null ? '—' : `$${x.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const pct = (v: any) => {
  const x = n(v);
  return x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(2)} %`;
};

function dias(desde: any): number | null {
  if (!desde) return null;
  const t = new Date(desde).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

function antiguedad(d: number | null): string {
  if (d == null) return '—';
  if (d < 31) return `${d} d`;
  if (d < 365) return `${Math.round(d / 30.44)} meses`;
  const a = d / 365.25;
  return a < 2 ? `${a.toFixed(1)} años` : `${Math.round(a)} años`;
}

/** Distancia al objetivo, en porcentaje y con su lectura. */
function distancia(precio: any, objetivo: any, sentido: 'compra' | 'venta') {
  const p = n(precio), o = n(objetivo);
  if (p == null || o == null || o === 0) return null;
  const d = ((p - o) / o) * 100;
  // En compra interesa que el precio esté POR DEBAJO del objetivo; en venta,
  // por encima. Un mismo signo significa cosas opuestas según la columna.
  const alcanzado = sentido === 'compra' ? p <= o : p >= o;
  return { d, alcanzado };
}

export default function WatchlistTable({ items }: { items: FavoritoDetalle[] }) {
  const { colors, palette, space, type, radius, hairline, numeric } = useTheme();
  const [orden, setOrden] = useState<{ clave: string; desc: boolean }>({ clave: 'ticker', desc: false });

  const filas = useMemo(() => {
    return (items || []).map((it) => {
      const dc = distancia(it.current_price, it.target_buy_price, 'compra');
      const dv = distancia(it.current_price, it.target_sell_price, 'venta');
      return {
        ...it,
        _dias: dias(it.added_date),
        _distCompra: dc?.d ?? null,
        _compraAlcanzada: dc?.alcanzado ?? false,
        _distVenta: dv?.d ?? null,
        _ventaAlcanzada: dv?.alcanzado ?? false,
      };
    });
  }, [items]);

  const ordenadas = useMemo(() => {
    const c = [...filas];
    c.sort((a: any, b: any) => {
      const va = a[orden.clave], vb = b[orden.clave];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') {
        const r = String(va).localeCompare(String(vb), 'es');
        return orden.desc ? -r : r;
      }
      return orden.desc ? Number(vb) - Number(va) : Number(va) - Number(vb);
    });
    return c;
  }, [filas, orden]);

  const COLUMNAS = [
    { clave: 'ticker', etiqueta: 'Código', ancho: 96, izq: true },
    { clave: 'company_name', etiqueta: 'Nombre', ancho: 220, izq: true },
    { clave: 'current_price', etiqueta: 'Precio actual', ancho: 108 },
    { clave: 'target_buy_price', etiqueta: 'Objetivo compra', ancho: 116 },
    { clave: '_distCompra', etiqueta: 'Falta para comprar', ancho: 128 },
    { clave: 'target_sell_price', etiqueta: 'Objetivo venta', ancho: 112 },
    { clave: '_distVenta', etiqueta: 'Falta para vender', ancho: 124 },
    { clave: 'price_change_threshold', etiqueta: 'Umbral aviso', ancho: 100 },
    { clave: '_dias', etiqueta: 'En seguimiento', ancho: 112 },
  ];

  if (!items || items.length === 0) {
    return (
      <Panel legend="Detalle" title="Favoritos">
        <Text style={[type.caption, { color: colors.inkFaint }]}>
          No hay valores en seguimiento.
        </Text>
      </Panel>
    );
  }

  const ancho = COLUMNAS.reduce((s, c) => s + c.ancho, 0);
  const alcanzadas = filas.filter((f: any) => f._compraAlcanzada || f._ventaAlcanzada).length;

  const celda = (f: any, c: any) => {
    const v = f[c.clave];

    if (c.clave === 'ticker') {
      return <Text style={[type.label, numeric, { color: colors.ink }]} numberOfLines={1}>{f.ticker}</Text>;
    }
    if (c.clave === 'company_name') {
      return <Text style={[type.caption, { color: colors.inkMuted }]} numberOfLines={2}>{f.company_name}</Text>;
    }
    if (c.clave === '_dias') {
      return <Text style={[type.caption, numeric, { color: v == null ? colors.noSignal : colors.inkMuted }]}>
        {antiguedad(v)}
      </Text>;
    }
    if (c.clave === 'price_change_threshold') {
      return <Text style={[type.caption, numeric, { color: v == null ? colors.noSignal : colors.inkMuted }]}>
        {v == null ? '—' : `± ${Number(v).toFixed(1)} %`}
      </Text>;
    }
    if (c.clave === '_distCompra' || c.clave === '_distVenta') {
      const esCompra = c.clave === '_distCompra';
      const alcanzada = esCompra ? f._compraAlcanzada : f._ventaAlcanzada;
      if (v == null) return <Text style={[type.caption, { color: colors.noSignal }]}>—</Text>;
      const { fg } = toneColors(palette, alcanzada ? 'up' : 'neutral');
      return (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type.caption, numeric, { color: alcanzada ? fg : colors.ink, fontWeight: '700' }]}>
            {pct(v)}
          </Text>
          {alcanzada ? (
            <Text style={[type.legend, { color: fg, letterSpacing: 0.4 }]}>ALCANZADO</Text>
          ) : null}
        </View>
      );
    }
    return <Text style={[type.caption, numeric, { color: v == null ? colors.noSignal : colors.ink }]}>
      {usd(v)}
    </Text>;
  };

  return (
    <Panel legend="Detalle por valor" title="Favoritos" padded={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator style={{ maxWidth: '100%' }}>
        <View style={{ minWidth: ancho }}>
          <View style={{ flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: space.sm }}>
            {COLUMNAS.map((c) => {
              const activa = orden.clave === c.clave;
              return (
                <Pressable
                  key={c.clave}
                  onPress={() => setOrden((p) => ({ clave: c.clave, desc: p.clave === c.clave ? !p.desc : true }))}
                  accessibilityRole="button"
                  accessibilityLabel={`Ordenar por ${c.etiqueta}`}
                  style={({ pressed }) => [
                    { width: c.ancho, paddingRight: space.sm, flexDirection: 'row', alignItems: 'center',
                      justifyContent: c.izq ? 'flex-start' : 'flex-end', gap: 2, opacity: pressed ? 0.6 : 1 },
                    Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                  ]}
                >
                  <Text style={[type.legend, { color: activa ? colors.accent : colors.inkFaint, letterSpacing: 0.4 }]}
                        numberOfLines={1}>
                    {c.etiqueta.toUpperCase()}
                  </Text>
                  {activa ? <Ionicons name={orden.desc ? 'caret-down' : 'caret-up'} size={9} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
          <Rule />

          {ordenadas.map((f: any, i) => (
            <View key={f.id || f.ticker}>
              <View style={{ flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: space.md }}>
                {COLUMNAS.map((c) => (
                  <View key={c.clave} style={{ width: c.ancho, paddingRight: space.sm,
                                               alignItems: c.izq ? 'flex-start' : 'flex-end' }}>
                    {celda(f, c)}
                  </View>
                ))}
              </View>
              {i < ordenadas.length - 1 ? <Rule /> : null}
            </View>
          ))}
        </View>
      </ScrollView>

      <Rule />
      <View style={{ padding: space.lg, gap: 4 }}>
        <Legend>Cómo leer las distancias</Legend>
        <Text style={[type.caption, { color: colors.inkMuted }]}>
          El porcentaje es la distancia del precio actual a tu objetivo. En compra interesa que sea
          negativo —el precio por debajo de lo que fijaste—; en venta, positivo. El mismo signo
          significa cosas opuestas en cada columna, por eso solo se marca «ALCANZADO» cuando la
          condición se cumple de verdad.
        </Text>
        {alcanzadas > 0 ? (
          <Text style={[type.caption, { color: palette.up, fontWeight: '700' }]}>
            {alcanzadas} {alcanzadas === 1 ? 'valor ha alcanzado' : 'valores han alcanzado'} su objetivo.
          </Text>
        ) : null}
      </View>
    </Panel>
  );
}
