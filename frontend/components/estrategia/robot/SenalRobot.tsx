/**
 * Señal actual del robot.
 *
 * El panel dominante de la columna derecha: veredicto grande, aguja con las
 * bandas, y debajo los factores que empujaron la aguja hasta ahí. Los factores
 * que no tienen fuente —libro y delta de agresores— aparecen con su hueco y su
 * motivo. Salen en la lista a propósito: esconderlos daría la impresión de que
 * la señal se calculó con más evidencia de la que tiene.
 *
 * La escala se dice junto a la cifra: el backend puntúa sobre 165 y aquí se
 * enseña normalizado sobre 100. Sin ese rótulo, un «78» es ambiguo.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { toneColors } from '../../../theme/tokens';
import { Bloque, SenalRobot as TipoSenal } from '../../../lib/estrategia/tipos';
import { cifra, duracion } from '../../../lib/estrategia/formato';
import { Chip, Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';
import AgujaSenal from './AgujaSenal';

export default function SenalRobot({
  bloque,
  cargando,
  proximaDecisionS,
  robotActivo,
}: {
  bloque: Bloque<TipoSenal>;
  cargando?: boolean;
  proximaDecisionS: number;
  robotActivo: boolean;
}) {
  const { colors, palette, hairline } = useTheme();

  return (
    <Placa titulo="Señal actual del robot" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={8}>
        {(s) => {
          const tono =
            s.score100 >= 56 ? ('up' as const) : s.score100 >= 45 ? ('caution' as const) : ('down' as const);
          const { fg } = toneColors(palette, tono);

          return (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text style={[T.cifraGrande, { color: fg }]} numberOfLines={1}>
                    {s.accionEs}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <Rotulo>Fuerza</Rotulo>
                    <Chip texto={s.fuerza} tono={tono} />
                  </View>
                  <Text style={[T.dato, { color: colors.inkMuted }]} numberOfLines={2}>
                    {s.sesgo}
                  </Text>
                </View>
                <AgujaSenal valor={s.score100} />
              </View>

              {/* La escala, junto a la cifra. No en una nota al pie. */}
              <Text style={[T.micro, { color: colors.inkFaint }]}>
                Score {cifra(s.scoreBruto, 1)} sobre {s.scoreMax} puntos, normalizado a{' '}
                {cifra(s.score100, 1)} / 100.
              </Text>

              <View style={{ height: hairline, backgroundColor: colors.rule }} />

              <View style={{ gap: 2 }}>
                {s.factores.map((f, i) => (
                  <View
                    key={f.etiqueta}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      minHeight: 18,
                      borderBottomWidth: i === s.factores.length - 1 ? 0 : hairline,
                      borderBottomColor: colors.rule,
                      paddingBottom: 2,
                    }}
                  >
                    <Text style={[T.dato, { color: colors.inkMuted, flexShrink: 1 }]} numberOfLines={1}>
                      {f.etiqueta}
                    </Text>
                    {f.sinFuente ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Cifra valor={null} />
                        <Text style={[T.micro, { color: colors.noSignal }]} numberOfLines={1}>
                          {f.sinFuente}
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={[
                          T.rotulo,
                          {
                            color:
                              f.tono === 'up'
                                ? palette.up
                                : f.tono === 'down'
                                  ? palette.down
                                  : f.tono === 'caution'
                                    ? palette.caution
                                    : colors.inkMuted,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {f.valor}
                      </Text>
                    )}
                  </View>
                ))}
              </View>

              <View style={{ height: hairline, backgroundColor: colors.rule }} />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <View style={{ gap: 1 }}>
                  <Rotulo>Próxima decisión</Rotulo>
                  <Text style={[T.micro, { color: colors.inkFaint }]}>Cadencia de 45 minutos</Text>
                </View>
                {robotActivo ? (
                  <Cifra valor={duracion(proximaDecisionS)} tono="accent" escala="medida" />
                ) : (
                  <View style={{ alignItems: 'flex-end', gap: 1 }}>
                    <Cifra valor={null} escala="medida" />
                    <Text style={[T.micro, { color: colors.noSignal }]}>Robot detenido</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      </ConDatos>
    </Placa>
  );
}
