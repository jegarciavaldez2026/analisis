/**
 * Volume delta multi-marco.
 *
 * El rótulo dice PROXY y lo dice arriba, no en una nota al pie. La distinción
 * entre *true order-flow delta* (agresores contra el bid o contra el ask) y
 * *estimated volume delta* ya está tomada en el producto; esta placa la
 * respeta y nombra el proxy que usa.
 *
 * Y no se agregan los marcos: 1W contiene a 1D que contiene a 4H. Sumarlos
 * cuenta el mismo volumen siete veces — ese bug ya se pagó una vez.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, FilaVolumeDelta } from '../../../lib/estrategia/tipos';
import { porcentaje } from '../../../lib/estrategia/formato';
import { Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';

export default function VolumeDelta({
  bloque,
  cargando,
}: {
  bloque: Bloque<FilaVolumeDelta[]>;
  cargando?: boolean;
}) {
  const { colors, palette, hairline } = useTheme();

  return (
    <Placa
      titulo="Volume delta multi-marco"
      procedencia={bloque.procedencia}
      derecha={<Rotulo>Posición del cierre en el rango</Rotulo>}
    >
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={7}>
        {(filas) => (
          <View style={{ gap: 3 }}>
            <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 2 }}>
              <View style={{ width: 38 }}>
                <Rotulo>Marco</Rotulo>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Rotulo>Compra</Rotulo>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Rotulo>Venta</Rotulo>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Rotulo>Delta</Rotulo>
              </View>
              <View style={{ flex: 1.4, alignItems: 'flex-end' }}>
                <Rotulo>Señal</Rotulo>
              </View>
            </View>

            {filas.map((f, i) => (
              <View
                key={f.tf + i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 18,
                  borderTopWidth: hairline,
                  borderTopColor: colors.rule,
                  paddingTop: 2,
                }}
              >
                <View style={{ width: 38 }}>
                  <Text style={[T.datoFuerte, { color: colors.ink }]}>{f.tf}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Cifra valor={porcentaje(f.compraPct, 0)} tono="up" />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Cifra valor={porcentaje(f.ventaPct, 0)} tono="down" />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Cifra
                    valor={porcentaje(f.deltaPct, 0, true)}
                    tono={(f.deltaPct ?? 0) >= 0 ? 'up' : 'down'}
                  />
                </View>
                <View style={{ flex: 1.4, alignItems: 'flex-end' }}>
                  <Text
                    style={[
                      T.micro,
                      {
                        color:
                          f.tono === 'up'
                            ? palette.up
                            : f.tono === 'down'
                              ? palette.down
                              : colors.inkMuted,
                        textAlign: 'right',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {f.senal}
                  </Text>
                </View>
              </View>
            ))}

            {bloque.nota ? (
              <Text style={[T.micro, { color: colors.inkFaint, paddingTop: 4 }]}>{bloque.nota}</Text>
            ) : null}
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}
