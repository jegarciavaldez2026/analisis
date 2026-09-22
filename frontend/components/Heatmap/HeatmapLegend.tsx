/**
 * Leyenda de la escala. Usa exactamente la misma función de color que las
 * celdas: si la leyenda y el mapa se calcularan por separado podrían acabar
 * diciendo cosas distintas, y entonces la leyenda estorba en vez de ayudar.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { colorVariacion, PARADAS_LEYENDA, tintaSobre } from './colorScale';

export default function HeatmapLegend({ oscuro }: { oscuro: boolean }) {
  const { colors, type, numeric, radius, space } = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
      <Text style={[type.legend, { color: colors.inkFaint }]}>VARIACIÓN DIARIA</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {PARADAS_LEYENDA.map((v) => {
          const fondo = colorVariacion(v, oscuro);
          return (
            <View
              key={v}
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
                {v > 0 ? '+' : ''}{v}%
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
