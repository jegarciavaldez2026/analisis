/**
 * Ficha rápida de una empresa.
 *
 * Enseña sólo campos que el backend devuelve de verdad. Los de mercado —
 * volumen, volumen relativo y rango de 52 semanas— llegan de
 * `/api/history/metrics`; si esa petición aún no ha vuelto o Yahoo no resolvió
 * ese ticker, la fila no se dibuja. Una fila con un guion permanente no informa
 * de nada y hace dudar de las que sí tienen dato.
 *
 * La industria no existe en ninguno de los dos endpoints, así que no está.
 *
 * En escritorio sale junto a la celda; en móvil, como hoja inferior.
 */

import React from 'react';
import { Modal, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { colorVariacion, tintaSobre } from './colorScale';
import { variacion, type Periodo, type Valor } from './useHeatmapLayout';

const PERIODO_ETIQUETA: Record<Periodo, string> = {
  '1d': 'Variación 1 día',
  '1w': 'Variación 1 semana',
  '1m': 'Variación 1 mes',
  '3m': 'Variación 3 meses',
  ytd: 'Variación en el año',
};

const compacto = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)} B`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)} MM`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  return n.toFixed(0);
};

function Fila({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: string }) {
  const { colors, type, numeric, space, hairline } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.sm,
        borderTopWidth: hairline,
        borderTopColor: colors.rule,
      }}
    >
      <Text style={[type.caption, { color: colors.inkMuted }]}>{etiqueta}</Text>
      <Text style={[type.caption, numeric, { color: destacado ?? colors.ink, fontWeight: '700', letterSpacing: 0 }]}>
        {valor}
      </Text>
    </View>
  );
}

export default function HeatmapTooltip({
  valor,
  oscuro,
  periodo,
  onCerrar,
  onVerAnalisis,
}: {
  valor: Valor | null;
  oscuro: boolean;
  periodo: Periodo;
  onCerrar: () => void;
  onVerAnalisis?: (v: Valor) => void;
}) {
  const { colors, space, radius, type, hairline, numeric } = useTheme();
  const { width } = useWindowDimensions();
  const movil = width < 700;

  if (!valor) return null;

  const pct = variacion(valor, periodo);
  const sinDato = pct === null;
  const fondo = colorVariacion(pct, oscuro);
  const tono = sinDato ? colors.inkMuted : (pct as number) >= 0 ? colors.up : colors.down;

  const cuerpo = (
    <View
      style={{
        width: movil ? '100%' : 320,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: hairline,
        borderColor: colors.rule,
        overflow: 'hidden',
      }}
    >
      <View style={{ padding: space.md, backgroundColor: fondo, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.title3, numeric, { color: tintaSobre(fondo), letterSpacing: 0 }]}>
            {valor.ticker}
          </Text>
          <Pressable onPress={onCerrar} accessibilityLabel="Cerrar" hitSlop={8}>
            <Ionicons name="close" size={18} color={tintaSobre(fondo)} />
          </Pressable>
        </View>
        {Boolean(valor.company_name) && (
          <Text style={[type.caption, { color: tintaSobre(fondo), opacity: 0.85 }]} numberOfLines={2}>
            {valor.company_name}
          </Text>
        )}
      </View>

      <View style={{ paddingHorizontal: space.md, paddingBottom: space.md }}>
        <Fila
          etiqueta={PERIODO_ETIQUETA[periodo]}
          valor={sinDato ? 'sin dato' : `${(pct as number) >= 0 ? '+' : '−'}${Math.abs(pct as number).toFixed(2)} %`}
          destacado={tono}
        />
        {Number.isFinite(valor.current_price as number) && (valor.current_price as number) > 0 && (
          <Fila etiqueta="Precio" valor={`$${(valor.current_price as number).toFixed(2)}`} />
        )}
        {Number.isFinite(valor.market_cap as number) && (valor.market_cap as number) > 0 && (
          <Fila etiqueta="Capitalización" valor={`$${compacto(valor.market_cap as number)}`} />
        )}
        {Number.isFinite(valor.volume as number) && (
          <Fila etiqueta="Volumen" valor={compacto(valor.volume as number)} />
        )}
        {Number.isFinite(valor.relative_volume as number) && (
          <Fila
            etiqueta="Volumen relativo"
            valor={`${(valor.relative_volume as number).toFixed(2)}× la media de 3 meses`}
          />
        )}
        {Number.isFinite(valor.fifty_two_week_low as number) &&
          Number.isFinite(valor.fifty_two_week_high as number) && (
            <Fila
              etiqueta="Rango 52 semanas"
              valor={`$${(valor.fifty_two_week_low as number).toFixed(2)} – $${(valor.fifty_two_week_high as number).toFixed(2)}`}
            />
          )}
        <Fila etiqueta="Sector" valor={valor.sector && valor.sector !== 'N/A' ? valor.sector : 'Sin sector'} />
        {Boolean(valor.recommendation) && (
          <Fila etiqueta="Tu análisis" valor={valor.recommendation as string} />
        )}
        {Number.isFinite(valor.favorable_percentage as number) && (
          <Fila etiqueta="Ratios favorables" valor={`${(valor.favorable_percentage as number).toFixed(0)} %`} />
        )}

        {onVerAnalisis && (
          <Pressable
            onPress={() => onVerAnalisis(valor)}
            accessibilityRole="button"
            style={({ pressed }) => [
              {
                marginTop: space.md,
                paddingVertical: space.sm,
                borderRadius: radius.xs,
                alignItems: 'center',
                backgroundColor: pressed ? colors.accentPressed : colors.accent,
              },
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
            ]}
          >
            <Text style={[type.label, { color: colors.inkOnAccent, fontWeight: '700' }]}>
              Ver el análisis completo
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <Modal visible transparent animationType={movil ? 'slide' : 'fade'} onRequestClose={onCerrar}>
      <Pressable
        onPress={onCerrar}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.35)',
          justifyContent: movil ? 'flex-end' : 'center',
          alignItems: 'center',
          padding: movil ? 0 : space.lg,
        }}
      >
        <Pressable onPress={() => {}} style={movil ? { width: '100%' } : undefined}>
          {cuerpo}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
