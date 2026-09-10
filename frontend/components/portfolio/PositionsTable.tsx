/**
 * Posiciones en detalle.
 *
 * Una tabla ancha con catorce columnas es una herramienta de trabajo, no un
 * resumen: aquí se viene a comparar posiciones entre sí, no a ver cómo va la
 * cartera. Por eso las cifras van en cara monoespaciada y alineadas a la
 * derecha —los dígitos tienen que caer en columna para poder compararlos de
 * un vistazo— y el desplazamiento horizontal se acepta en vez de encoger la
 * letra hasta hacerla ilegible.
 *
 * La beta simplificada es beta × peso: la aportación de cada posición a la
 * beta de la cartera. La suma de la columna da la beta total, así que el dato
 * agregado se puede auditar desde aquí.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { Legend, Panel, Rule } from '../ui';
import { deltaTone, toneColors } from '../../theme/tokens';

export interface HoldingDetalle {
  ticker: string;
  company_name: string;
  total_shares: number;
  average_cost: number;
  current_price: number;
  current_value: number;
  profit_loss: number;
  profit_loss_percent: number;
  weight_percent: number;
  beta?: number | null;
  beta_simplificada?: number | null;
  pe_ratio?: number | null;
  daily_change_percent?: number | null;
  roi_estimado?: number | null;
  primera_compra?: string | null;
  dias_mantenida?: number | null;
  rentabilidad_anualizada?: number | null;
}

type Clave = keyof HoldingDetalle;

const COLUMNAS: {
  clave: Clave;
  etiqueta: string;
  ancho: number;
  tipo: 'texto' | 'moneda' | 'porcentaje' | 'numero' | 'antiguedad';
  decimales?: number;
  coloreada?: boolean;
}[] = [
  { clave: 'ticker', etiqueta: 'Código', ancho: 104, tipo: 'texto' },
  { clave: 'company_name', etiqueta: 'Nombre', ancho: 240, tipo: 'texto' },
  { clave: 'beta_simplificada', etiqueta: 'Beta simpl.', ancho: 88, tipo: 'numero', decimales: 4 },
  { clave: 'average_cost', etiqueta: 'Precio medio', ancho: 100, tipo: 'moneda' },
  { clave: 'profit_loss_percent', etiqueta: 'P/L %', ancho: 84, tipo: 'porcentaje', coloreada: true },
  { clave: 'profit_loss', etiqueta: 'P/L', ancho: 96, tipo: 'moneda', coloreada: true },
  { clave: 'total_shares', etiqueta: 'Unidades', ancho: 100, tipo: 'numero', decimales: 6 },
  { clave: 'current_price', etiqueta: 'Precio actual', ancho: 100, tipo: 'moneda' },
  { clave: 'daily_change_percent', etiqueta: 'Cambio %', ancho: 88, tipo: 'porcentaje', coloreada: true },
  { clave: 'current_value', etiqueta: 'Valor', ancho: 104, tipo: 'moneda' },
  { clave: 'weight_percent', etiqueta: 'Peso', ancho: 76, tipo: 'porcentaje' },
  { clave: 'pe_ratio', etiqueta: 'PER', ancho: 88, tipo: 'numero', decimales: 2 },
  { clave: 'roi_estimado', etiqueta: 'ROI est.', ancho: 88, tipo: 'porcentaje', coloreada: true },
  { clave: 'dias_mantenida', etiqueta: 'Antigüedad', ancho: 104, tipo: 'antiguedad' },
  { clave: 'rentabilidad_anualizada', etiqueta: 'P/L anualiz.', ancho: 96, tipo: 'porcentaje', coloreada: true },
  { clave: 'beta', etiqueta: 'Beta', ancho: 80, tipo: 'numero', decimales: 4 },
];

/** Días a una lectura humana: los años importan más que la cifra exacta. */
function antiguedad(dias: any): string {
  const d = Number(dias);
  if (d == null || !Number.isFinite(d)) return '—';
  if (d < 31) return `${d} d`;
  if (d < 365) return `${Math.round(d / 30.44)} meses`;
  const a = d / 365.25;
  return a < 2 ? `${a.toFixed(1)} años` : `${Math.round(a)} años`;
}

function formatear(valor: any, tipo: string, decimales = 2): string {
  if (valor == null || valor === '' || (typeof valor === 'number' && !Number.isFinite(valor))) return '—';
  if (tipo === 'texto') return String(valor);
  if (tipo === 'antiguedad') return antiguedad(valor);
  const n = Number(valor);
  if (tipo === 'moneda') {
    return `$${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (tipo === 'porcentaje') {
    return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)} %`;
  }
  // Las unidades llevan hasta seis decimales pero se recortan los ceros: un
  // fondo se compra en fracciones, una acción no.
  return n.toLocaleString('es-ES', { maximumFractionDigits: decimales });
}

export default function PositionsTable({ holdings }: { holdings: HoldingDetalle[] }) {
  const { colors, palette, space, type, radius, hairline, numeric } = useTheme();
  const [orden, setOrden] = useState<{ clave: Clave; desc: boolean }>({
    clave: 'weight_percent',
    desc: true,
  });

  const ordenadas = useMemo(() => {
    const copia = [...(holdings || [])];
    copia.sort((a, b) => {
      const va = a[orden.clave];
      const vb = b[orden.clave];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;   // los huecos al final, suba o baje el orden
      if (vb == null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') {
        const cmp = String(va).localeCompare(String(vb), 'es');
        return orden.desc ? -cmp : cmp;
      }
      return orden.desc ? Number(vb) - Number(va) : Number(va) - Number(vb);
    });
    return copia;
  }, [holdings, orden]);

  const totales = useMemo(() => {
    const v = (holdings || []).reduce((s, h) => s + (h.current_value || 0), 0);
    const pl = (holdings || []).reduce((s, h) => s + (h.profit_loss || 0), 0);
    const betaSum = (holdings || []).reduce((s, h) => s + (h.beta_simplificada || 0), 0);
    const peso = (holdings || []).reduce((s, h) => s + (h.weight_percent || 0), 0);
    return { valor: v, pl, betaSum, peso };
  }, [holdings]);

  if (!holdings || holdings.length === 0) {
    return (
      <Panel legend="Detalle" title="Posiciones">
        <Text style={[type.caption, { color: colors.inkFaint }]}>
          No hay posiciones abiertas en la cartera.
        </Text>
      </Panel>
    );
  }

  const anchoTotal = COLUMNAS.reduce((s, c) => s + c.ancho, 0);

  return (
    <Panel legend="Detalle por posición" title="Posiciones" padded={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator style={{ maxWidth: '100%' }}>
        <View style={{ minWidth: anchoTotal }}>
          {/* Cabecera */}
          <View style={{ flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: space.sm }}>
            {COLUMNAS.map((c) => {
              const activa = orden.clave === c.clave;
              return (
                <Pressable
                  key={c.clave}
                  onPress={() =>
                    setOrden((p) => ({ clave: c.clave, desc: p.clave === c.clave ? !p.desc : true }))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Ordenar por ${c.etiqueta}`}
                  style={({ pressed }) => [
                    {
                      width: c.ancho,
                      paddingRight: space.sm,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: c.tipo === 'texto' ? 'flex-start' : 'flex-end',
                      gap: 2,
                      opacity: pressed ? 0.6 : 1,
                    },
                    Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                  ]}
                >
                  <Text
                    style={[
                      type.legend,
                      { color: activa ? colors.accent : colors.inkFaint, letterSpacing: 0.4 },
                    ]}
                    numberOfLines={1}
                  >
                    {c.etiqueta.toUpperCase()}
                  </Text>
                  {activa ? (
                    <Ionicons
                      name={orden.desc ? 'caret-down' : 'caret-up'}
                      size={9}
                      color={colors.accent}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Rule />

          {/* Filas */}
          {ordenadas.map((h, i) => (
            <View key={h.ticker}>
              <View style={{ flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: space.md }}>
                {COLUMNAS.map((c) => {
                  const bruto = h[c.clave];
                  const texto = formatear(bruto, c.tipo, c.decimales);
                  let color = colors.ink;
                  if (c.coloreada && typeof bruto === 'number' && Number.isFinite(bruto)) {
                    const tono = deltaTone(bruto);
                    color = tono === 'neutral' ? colors.inkMuted : toneColors(palette, tono).fg;
                  } else if (bruto == null) {
                    color = colors.noSignal;
                  }

                  if (c.clave === 'ticker') {
                    return (
                      <View key={c.clave} style={{ width: c.ancho, paddingRight: space.sm }}>
                        <Text style={[type.label, numeric, { color: colors.ink }]} numberOfLines={1}>
                          {h.ticker}
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <View
                      key={c.clave}
                      style={{
                        width: c.ancho,
                        paddingRight: space.sm,
                        alignItems: c.tipo === 'texto' ? 'flex-start' : 'flex-end',
                      }}
                    >
                      <Text
                        style={[
                          c.tipo === 'texto' ? type.caption : type.caption,
                          c.tipo === 'texto' ? null : numeric,
                          { color },
                        ]}
                        numberOfLines={c.tipo === 'texto' ? 2 : 1}
                      >
                        {texto}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {i < ordenadas.length - 1 ? <Rule /> : null}
            </View>
          ))}

          <Rule />

          {/* Totales: la fila que permite auditar los agregados */}
          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              backgroundColor: colors.surfaceSunken,
            }}
          >
            {COLUMNAS.map((c) => {
              let contenido: string | null = null;
              if (c.clave === 'ticker') contenido = 'TOTAL';
              else if (c.clave === 'beta_simplificada') contenido = totales.betaSum.toFixed(4);
              else if (c.clave === 'profit_loss') contenido = formatear(totales.pl, 'moneda');
              else if (c.clave === 'current_value') contenido = formatear(totales.valor, 'moneda');
              else if (c.clave === 'weight_percent') contenido = `${totales.peso.toFixed(2)} %`;

              const tono = c.clave === 'profit_loss' ? deltaTone(totales.pl) : 'neutral';
              const color =
                c.clave === 'profit_loss' && tono !== 'neutral'
                  ? toneColors(palette, tono).fg
                  : colors.ink;

              return (
                <View
                  key={c.clave}
                  style={{
                    width: c.ancho,
                    paddingRight: space.sm,
                    alignItems: c.clave === 'ticker' ? 'flex-start' : 'flex-end',
                  }}
                >
                  {contenido ? (
                    <Text style={[type.caption, numeric, { color, fontWeight: '700' }]} numberOfLines={1}>
                      {contenido}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <Rule />
      <View style={{ padding: space.lg, gap: 4 }}>
        <Legend>Cómo leer las columnas</Legend>
        <Text style={[type.caption, { color: colors.inkMuted }]}>
          <Text style={{ fontWeight: '700' }}>Beta simplificada</Text> es beta × peso: lo que aporta
          cada posición a la beta total. La columna suma {totales.betaSum.toFixed(4)}, que debe
          coincidir con la beta de la cartera.
        </Text>
        <Text style={[type.caption, { color: colors.inkMuted }]}>
          <Text style={{ fontWeight: '700' }}>ROI estimado</Text> es la rentabilidad anualizada del
          valor en el último año, no la de tu posición: sirve para comparar activos entre sí, no
          para medir tu resultado — ese es P/L.
        </Text>
        <Text style={[type.caption, { color: colors.inkMuted }]}>
          <Text style={{ fontWeight: '700' }}>Antigüedad</Text> se cuenta desde la primera compra
          que sigue abierta, no desde la última: ampliar una posición no reinicia el reloj.
          El <Text style={{ fontWeight: '700' }}>P/L anualizado</Text> permite comparar posiciones
          de distinta edad — un +12 % en tres meses no es lo mismo que un +12 % en tres años. Por
          debajo de 30 días no se anualiza: extrapolar una semana a un año da cifras sin sentido.
        </Text>
        <Text style={[type.caption, { color: colors.inkFaint }]}>
          Un guion significa que el proveedor no da ese dato. Los fondos no cotizados suelen no
          tener PER ni beta publicados.
        </Text>
      </View>
    </Panel>
  );
}
