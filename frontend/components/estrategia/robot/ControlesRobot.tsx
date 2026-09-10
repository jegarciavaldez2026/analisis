/**
 * Controles del robot.
 *
 * Los deslizadores son reales: mueven estado y el estado se lee en el resto
 * del panel (el tamaño sugerido de la posición sale del capital asignado y del
 * riesgo por operación). Un control decorativo enseña a desconfiar de todos
 * los demás.
 *
 * Dos reglas del producto que este panel hace cumplir:
 *
 * - **Por defecto: MANUAL, PAPER, AUTO OFF, LIVE OFF.** Nada arranca solo.
 * - **DETENER pide confirmación.** Cerrar posiciones no es una acción que se
 *   deshaga con Ctrl+Z, así que no se dispara con un clic accidental.
 */

import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { ControlesRobot as TipoControles } from '../../../lib/estrategia/tipos';
import { BotonTerminal, Chip, Conmutador, Deslizador, Placa, Rotulo, T } from '../Terminal';

const MODOS = [
  { clave: 'manual' as const, texto: 'Manual' },
  { clave: 'automatico' as const, texto: 'Automático' },
];

export default function ControlesRobot({
  controles,
  onCambio,
}: {
  controles: TipoControles;
  onCambio: (parcial: Partial<TipoControles>) => void;
}) {
  const { colors, palette, radius, hairline } = useTheme();
  const [confirmando, setConfirmando] = useState(false);

  const detenido = controles.estado === 'detenido';

  return (
    <>
      <Placa
        titulo="Controles del robot"
        derecha={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Chip texto="Paper" tono="accent" />
            <Chip
              texto={controles.estado}
              tono={controles.estado === 'activo' ? 'up' : controles.estado === 'pausado' ? 'caution' : 'neutral'}
            />
          </View>
        }
      >
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <Rotulo>Modo</Rotulo>
            <Conmutador
              opciones={MODOS}
              activa={controles.modo}
              onChange={(m) => onCambio({ modo: m })}
            />
          </View>

          <Deslizador
            etiqueta="Capital asignado"
            valor={controles.capitalPct}
            min={0}
            max={100}
            paso={1}
            sufijo=" %"
            onChange={(v) => onCambio({ capitalPct: v })}
          />
          <Deslizador
            etiqueta="Riesgo por operación"
            valor={controles.riesgoPct}
            min={0.1}
            max={5}
            paso={0.1}
            decimales={2}
            sufijo=" %"
            onChange={(v) => onCambio({ riesgoPct: v })}
          />
          <Deslizador
            etiqueta="Stop loss máximo"
            valor={controles.stopLossPct}
            min={0.5}
            max={15}
            paso={0.25}
            decimales={2}
            sufijo=" %"
            onChange={(v) => onCambio({ stopLossPct: v })}
          />
          <Deslizador
            etiqueta="Take profit mínimo"
            valor={controles.takeProfitPct}
            min={0.5}
            max={30}
            paso={0.25}
            decimales={2}
            sufijo=" %"
            onChange={(v) => onCambio({ takeProfitPct: v })}
          />
          <Deslizador
            etiqueta="Máx. posiciones abiertas"
            valor={controles.maxPosiciones}
            min={1}
            max={20}
            paso={1}
            onChange={(v) => onCambio({ maxPosiciones: Math.round(v) })}
          />

          <View style={{ flexDirection: 'row', gap: 6 }}>
            {detenido ? (
              <BotonTerminal
                texto="Arrancar"
                tono="up"
                icono="play"
                relleno
                onPress={() => onCambio({ estado: 'activo' })}
              />
            ) : (
              <BotonTerminal
                texto={controles.estado === 'pausado' ? 'Reanudar' : 'Pausar'}
                tono="caution"
                icono={controles.estado === 'pausado' ? 'play' : 'pause'}
                relleno
                onPress={() => onCambio({ estado: controles.estado === 'pausado' ? 'activo' : 'pausado' })}
              />
            )}
            <BotonTerminal
              texto="Detener"
              tono="down"
              icono="stop"
              relleno
              deshabilitado={detenido}
              onPress={() => setConfirmando(true)}
            />
          </View>

          <Text style={[T.micro, { color: colors.inkFaint }]}>
            Sin bróker conectado y sin motor de ejecución: estos controles fijan los parámetros de
            la señal, no mandan órdenes a ningún mercado.
          </Text>
        </View>
      </Placa>

      {/* Confirmación de DETENER */}
      <Modal
        visible={confirmando}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmando(false)}
      >
        <Pressable
          onPress={() => setConfirmando(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 380,
              gap: 10,
              padding: 16,
              borderRadius: radius.md,
              borderWidth: hairline,
              borderColor: palette.down,
              backgroundColor: colors.surfaceRaised,
            }}
            accessibilityViewIsModal
            accessibilityRole="alert"
          >
            <Text style={[T.titular, { color: colors.ink }]}>¿Detener el robot?</Text>
            <Text style={[T.dato, { color: colors.inkMuted, lineHeight: 17 }]}>
              Detener cancela la evaluación periódica y deja el robot en estado inactivo. Los
              parámetros que has fijado se conservan.
            </Text>
            <Text style={[T.micro, { color: colors.inkFaint }]}>
              No hay posiciones reales abiertas: el producto no tiene bróker conectado, así que
              esta acción no liquida nada en ningún mercado.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
              <BotonTerminal texto="Cancelar" relleno onPress={() => setConfirmando(false)} />
              <BotonTerminal
                texto="Sí, detener"
                tono="down"
                icono="stop"
                relleno
                onPress={() => {
                  onCambio({ estado: 'detenido' });
                  setConfirmando(false);
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
