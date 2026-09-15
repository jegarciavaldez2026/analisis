/**
 * Leyenda de la escala. Usa exactamente la misma función de color que las
 * celdas: si la leyenda y el mapa se calcularan por separado podrían acabar
 * diciendo cosas distintas, y entonces la leyenda estorba en vez de ayudar.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { colorVariacion, extremoDe, PARADAS_LEYENDA, tintaSobre } from './colorScale';
import type { Periodo } from './useHeatmapLayout';

const ROTULO: Record<Periodo, string> = {
  '1d': 'VARIACIÓN 1 DÍA',
  '1w': 'VARIACIÓN 1 SEMANA',
  '1m': 'VARIACIÓN 1 MES',
  '3m': 'VARIACIÓN 3 MESES',
  ytd: 'VARIACIÓN EN EL AÑO',
};

export default function HeatmapLegend({
  oscuro,
  periodo = '1d',
}: {
  oscuro: boolean;
  periodo?: Periodo;
}) {
  const { colors, type, numeric, radius, space } = useTheme();
  // La leyenda dice el periodo Y su tope. Sin el tope, el mismo verde significa
  // +3 % en la vista del día y +40 % en la del año, y nada en pantalla lo dice.
  const extremo = extremoDe(periodo);
  const escala = extremo / 3;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
      <Text style={[type.legend, { color: colors.inkFaint }]}>{ROTULO[periodo]}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {PARADAS_LEYENDA.map((base) => {
          const v = base * escala;
          const fondo = colorVariacion(v, oscuro, extremo);
          return (
            <View
              key={base}
              style={{
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: radius.xs,
                backgroundColor: fondo,
              }}
            >
              <Text
                style={[
                  type.legend,
                  numeric,
                  { color: tintaSobre(fondo), letterSpacing: 0, fontWeight: '700' },
                ]}
              >
                {v > 0 ? '+' : ''}{Number.isInteger(v) ? v : v.toFixed(0)}%
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
