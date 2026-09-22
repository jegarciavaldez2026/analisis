/**
 * Controles del mapa.
 *
 * Aquí sólo hay controles que operan sobre datos que existen. El backend
 * (`/api/history/enhanced`) devuelve por empresa: precio, variación del día,
 * capitalización, sector, recomendación y fecha del análisis. No devuelve
 * volumen, ni rango de 52 semanas, ni series históricas, ni índices.
 *
 * Los periodos 1S/1M/3M/YTD vienen de `/api/history/metrics`, que baja un año
 * de series. Mientras esa petición no vuelve, sus botones salen desactivados:
 * un botón que no puede cambiar nada no debe parecer que sí.
 */

import React from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import type { Orden, Periodo } from './useHeatmapLayout';

const PERIODOS: { clave: Periodo; etiqueta: string }[] = [
  { clave: '1d', etiqueta: '1D' },
  { clave: '1w', etiqueta: '1S' },
  { clave: '1m', etiqueta: '1M' },
  { clave: '3m', etiqueta: '3M' },
  { clave: 'ytd', etiqueta: 'YTD' },
];

const ORDENES: { clave: Orden; etiqueta: string }[] = [
  { clave: 'cap', etiqueta: 'Capitalización' },
  { clave: 'variacion', etiqueta: 'Variación' },
  { clave: 'ticker', etiqueta: 'Ticker' },
];

export default function HeatmapToolbar({
  vista,
  onVista,
  periodo,
  onPeriodo,
  periodosListos,
  orden,
  onOrden,
  busqueda,
  onBusqueda,
  empresas,
  sectores,
  actualizado,
  onRecargar,
  recargando,
}: {
  vista: 'mapa' | 'tabla';
  onVista: (v: 'mapa' | 'tabla') => void;
  periodo: Periodo;
  onPeriodo: (p: Periodo) => void;
  /** Falso mientras no hayan llegado las series. */
  periodosListos: boolean;
  orden: Orden;
  onOrden: (o: Orden) => void;
  busqueda: string;
  onBusqueda: (t: string) => void;
  empresas: number;
  sectores: number;
  actualizado?: Date | null;
  onRecargar?: () => void;
  recargando?: boolean;
}) {
  const { colors, space, radius, type, hairline, numeric } = useTheme();

  const chip = (activo: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: radius.xs,
    borderWidth: hairline,
    borderColor: activo ? colors.accent : colors.rule,
    backgroundColor: activo ? colors.accentWash : 'transparent',
  });

  return (
    <View style={{ gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        {/* Mapa / Tabla */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {(['mapa', 'tabla'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => onVista(v)}
              accessibilityRole="button"
              accessibilityState={{ selected: vista === v }}
              style={[chip(vista === v), Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null]}
            >
              <Ionicons
                name={v === 'mapa' ? 'grid-outline' : 'list-outline'}
                size={13}
                color={vista === v ? colors.accent : colors.inkMuted}
              />
              <Text
                style={[
                  type.caption,
                  { color: vista === v ? colors.accent : colors.inkMuted, fontWeight: vista === v ? '700' : '500' },
                ]}
              >
                {v === 'mapa' ? 'Mapa' : 'Tabla'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Periodo: es lo que colorea el mapa */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {PERIODOS.map((p) => {
            const inerte = p.clave !== '1d' && !periodosListos;
            return (
              <Pressable
                key={p.clave}
                onPress={() => !inerte && onPeriodo(p.clave)}
                disabled={inerte}
                accessibilityRole="button"
                accessibilityState={{ selected: periodo === p.clave, disabled: inerte }}
                style={[
                  chip(periodo === p.clave),
                  { paddingHorizontal: 9, opacity: inerte ? 0.4 : 1 },
                  Platform.OS === 'web' ? ({ cursor: inerte ? 'default' : 'pointer' } as any) : null,
                ]}
              >
                <Text
                  style={[
                    type.caption,
                    numeric,
                    {
                      letterSpacing: 0,
                      color: periodo === p.clave ? colors.accent : colors.inkMuted,
                      fontWeight: periodo === p.clave ? '700' : '500',
                    },
                  ]}
                >
                  {p.etiqueta}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Orden */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[type.legend, { color: colors.inkFaint }]}>ORDEN</Text>
          {ORDENES.map((o) => (
            <Pressable
              key={o.clave}
              onPress={() => onOrden(o.clave)}
              accessibilityRole="button"
              accessibilityState={{ selected: orden === o.clave }}
              style={[chip(orden === o.clave), Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null]}
            >
              <Text
                style={[
                  type.caption,
                  {
                    color: orden === o.clave ? colors.accent : colors.inkMuted,
                    fontWeight: orden === o.clave ? '700' : '500',
                  },
                ]}
              >
                {o.etiqueta}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flex: 1, minWidth: 140 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 8,
              height: 30,
              borderRadius: radius.xs,
              borderWidth: hairline,
              borderColor: colors.rule,
              backgroundColor: colors.surfaceRaised,
            }}
          >
            <Ionicons name="search" size={13} color={colors.inkFaint} />
            <TextInput
              value={busqueda}
              onChangeText={onBusqueda}
              placeholder="Buscar ticker o empresa…"
              placeholderTextColor={colors.inkFaint}
              style={[type.caption, { flex: 1, color: colors.ink, paddingVertical: 0 } as any]}
            />
            {busqueda.length > 0 && (
              <Pressable onPress={() => onBusqueda('')} accessibilityLabel="Limpiar la búsqueda">
                <Ionicons name="close-circle" size={14} color={colors.inkFaint} />
              </Pressable>
            )}
          </View>
        </View>

        {onRecargar && (
          <Pressable
            onPress={onRecargar}
            disabled={recargando}
            accessibilityRole="button"
            accessibilityLabel="Actualizar precios"
            style={[
              chip(false),
              { opacity: recargando ? 0.5 : 1 },
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
            ]}
          >
            <Ionicons name="refresh" size={13} color={colors.inkMuted} />
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
          {empresas} {empresas === 1 ? 'empresa' : 'empresas'} · {sectores}{' '}
          {sectores === 1 ? 'sector' : 'sectores'}
        </Text>
        {!periodosListos && (
          <Text style={[type.legend, { color: colors.inkFaint }]}>CARGANDO SERIES…</Text>
        )}
        {actualizado && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: recargando ? colors.caution : colors.up,
              }}
            />
            <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
              {recargando
                ? 'Actualizando…'
                : `Precios de las ${actualizado.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
