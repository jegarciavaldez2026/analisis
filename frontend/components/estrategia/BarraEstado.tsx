/**
 * Barra de estado.
 *
 * Dice la verdad sobre la conexión, que es lo único que hace útil a una barra
 * de estado. Aquí no hay socket abierto —el backend no expone `/ws`— así que
 * no se pinta un punto verde de «tiempo real» sobre peticiones HTTP: se dice
 * que la fuente es Yahoo con retraso y que no hay bróker conectado.
 *
 * La latencia sale en guion en vez de en un «32 ms» inventado. Un número de
 * latencia falso es especialmente dañino: es justo el dato que alguien miraría
 * antes de fiarse de una ejecución.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { Telemetria } from '../../lib/estrategia/tipos';
import { hora } from '../../lib/estrategia/formato';
import { Cifra, Punto, Rotulo, T } from './Terminal';

const TONO_CONEXION = {
  conectado: 'up',
  reconectando: 'caution',
  desconectado: 'down',
} as const;

const TEXTO_CONEXION = {
  conectado: 'Conectado',
  reconectando: 'Reconectando',
  desconectado: 'Desconectado',
} as const;

function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
      <Rotulo>{rotulo}</Rotulo>
      {children}
    </View>
  );
}

export default function BarraEstado({ telemetria }: { telemetria: Telemetria }) {
  const { colors, hairline } = useTheme();
  const tono = TONO_CONEXION[telemetria.conexion];

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 14,
        rowGap: 4,
        minHeight: 26,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderTopWidth: hairline,
        borderTopColor: colors.rule,
        backgroundColor: colors.chrome,
      }}
      accessibilityRole="summary"
    >
      <Campo rotulo="Conectividad">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Punto tono={tono} />
          <Text style={[T.dato, { color: colors.ink }]}>{TEXTO_CONEXION[telemetria.conexion]}</Text>
        </View>
      </Campo>

      <Campo rotulo="Fuente">
        <Text style={[T.dato, { color: colors.ink }]}>{telemetria.fuenteDatos}</Text>
      </Campo>

      <Campo rotulo="Latencia">
        {telemetria.latenciaMs === null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Cifra valor={null} />
            <Text style={[T.micro, { color: colors.noSignal }]}>Sin socket abierto</Text>
          </View>
        ) : (
          <Cifra valor={`${telemetria.latenciaMs} ms`} />
        )}
      </Campo>

      <Campo rotulo="Bróker">
        <Text style={[T.dato, { color: colors.inkMuted }]}>{telemetria.broker}</Text>
      </Campo>

      <Campo rotulo="Último tick">
        {telemetria.ultimoTick ? (
          <Cifra valor={hora(telemetria.ultimoTick)} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Cifra valor={null} />
            <Text style={[T.micro, { color: colors.noSignal }]}>Sin flujo en vivo</Text>
          </View>
        )}
      </Campo>

      <Campo rotulo="Último análisis">
        <Cifra valor={hora(telemetria.ultimoAnalisis)} />
      </Campo>

      <View style={{ flex: 1 }} />

      <Campo rotulo="Robot">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Punto
            tono={
              telemetria.robot === 'activo' ? 'up' : telemetria.robot === 'pausado' ? 'caution' : 'neutral'
            }
          />
          <Text style={[T.datoFuerte, { color: colors.ink, textTransform: 'uppercase' }]}>
            {telemetria.robot}
          </Text>
        </View>
      </Campo>
    </View>
  );
}
