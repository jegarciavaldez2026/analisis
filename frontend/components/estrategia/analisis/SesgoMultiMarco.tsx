/**
 * Sesgo multi-marco — la confluencia, dibujada.
 *
 * El dato ya venía de `/mtf` y ya era real (siete marcos calculados por
 * separado en el backend, no un número con ruido añadido). Lo que faltaba era
 * poder LEERLO de un vistazo: en filas de texto hay que recorrer siete líneas
 * y compararlas mentalmente, que es justo el trabajo que un gráfico ahorra.
 *
 * Se dibuja como una tira de marcos ordenados de corto a largo plazo. Dos
 * decisiones que importan:
 *
 * - **El orden es temporal, no por fuerza de señal.** Un alcista en 1 h junto
 *   a un bajista en 1 D significa algo muy concreto —rebote contra tendencia—
 *   y esa lectura sólo aparece si los marcos están en su orden natural.
 * - **Un marco sin datos se dibuja vacío, no neutral.** No es lo mismo «este
 *   marco no opina» que «este marco no se ha podido calcular», y pintarlos
 *   igual convertiría una ausencia en un voto.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../../contexts/ThemeContext';
import { toneColors } from '../../../theme/tokens';
import { MarcoMTF, RespuestaMTF } from '../../../lib/estrategia/api';
import { Chip, Rotulo, T } from '../Terminal';
import { Placa } from '../Terminal';

/** Orden temporal fijo. El backend puede devolverlos en cualquier orden. */
const ORDEN = ['1m', '5m', '15m', '1h', '4h', '1d', '1wk'];

const NOMBRE: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
  '1wk': '1S',
};

function tonoDeTendencia(t?: string) {
  if (t === 'alcista') return 'up' as const;
  if (t === 'bajista') return 'down' as const;
  return 'caution' as const;
}

export default function SesgoMultiMarco({ mtf }: { mtf: RespuestaMTF | null }) {
  const { colors, palette, hairline, radius, numeric } = useTheme();

  if (!mtf || !Array.isArray(mtf.frames) || mtf.frames.length === 0) {
    return (
      <Placa titulo="Sesgo multi-marco" procedencia="sin-fuente">
        <Text style={[T.micro, { color: colors.noSignal }]}>
          El backend no devolvió marcos temporales para este valor.
        </Text>
      </Placa>
    );
  }

  const porClave = new Map(mtf.frames.map((f) => [f.tf, f]));
  const marcos = ORDEN.map((k) => porClave.get(k)).filter(Boolean) as MarcoMTF[];
  const usados = marcos.length ? marcos : mtf.frames;

  const conDatos = usados.filter((f) => f.disponible);
  const alcistas = conDatos.filter((f) => f.tendencia === 'alcista').length;
  const bajistas = conDatos.filter((f) => f.tendencia === 'bajista').length;

  const consenso = mtf.consenso && mtf.consenso !== 'sin_datos' ? mtf.consenso : null;
  const tonoConsenso =
    consenso?.includes('alcista') ? 'up' : consenso?.includes('bajista') ? 'down' : 'caution';

  return (
    <Placa
      titulo="Sesgo multi-marco"
      procedencia="real"
      derecha={
        consenso ? <Chip texto={consenso.replace(/_/g, ' ')} tono={tonoConsenso as any} /> : null
      }
    >
      <View style={{ gap: 8 }}>
        {/* Balance de votos: la lectura de una línea. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <View
              style={{
                flexDirection: 'row',
                height: 8,
                borderRadius: radius.xs,
                overflow: 'hidden',
                borderWidth: hairline,
                borderColor: colors.rule,
                backgroundColor: colors.surfaceSunken,
              }}
            >
              <View style={{ flex: Math.max(alcistas, 0.001), backgroundColor: palette.up }} />
              <View
                style={{
                  flex: Math.max(conDatos.length - alcistas - bajistas, 0.001),
                  backgroundColor: colors.noSignal,
                }}
              />
              <View style={{ flex: Math.max(bajistas, 0.001), backgroundColor: palette.down }} />
            </View>
            <Text style={[T.micro, { color: colors.inkFaint }]}>
              {alcistas} alcista{alcistas === 1 ? '' : 's'} · {bajistas} bajista
              {bajistas === 1 ? '' : 's'} · {conDatos.length} de {usados.length} marcos con datos
            </Text>
          </View>
        </View>

        {/* La tira de marcos. */}
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {usados.map((f) => {
            const disponible = f.disponible;
            const tono = tonoDeTendencia(f.tendencia);
            const { fg, wash } = toneColors(palette, tono);
            return (
              <View
                key={f.tf}
                style={{
                  flex: 1,
                  minWidth: 0,
                  alignItems: 'center',
                  gap: 2,
                  paddingVertical: 5,
                  paddingHorizontal: 2,
                  borderRadius: radius.xs,
                  borderWidth: hairline,
                  // Sin datos: trazo discontinuo y fondo del pozo. Se ve que
                  // falta, no que sea neutro.
                  borderStyle: disponible ? 'solid' : 'dashed',
                  borderColor: disponible ? fg : colors.rule,
                  backgroundColor: disponible ? wash : colors.surfaceSunken,
                }}
                accessibilityLabel={
                  disponible
                    ? `${NOMBRE[f.tf] ?? f.tf}: ${f.tendencia}${f.rsi != null ? `, RSI ${Math.round(f.rsi)}` : ''}`
                    : `${NOMBRE[f.tf] ?? f.tf}: sin datos`
                }
              >
                <Text
                  style={[T.rotulo, { fontSize: 9, color: disponible ? fg : colors.noSignal }]}
                  numberOfLines={1}
                >
                  {NOMBRE[f.tf] ?? f.tf}
                </Text>
                {disponible ? (
                  <>
                    <Ionicons
                      name={
                        f.tendencia === 'alcista'
                          ? 'arrow-up'
                          : f.tendencia === 'bajista'
                            ? 'arrow-down'
                            : 'remove'
                      }
                      size={12}
                      color={fg}
                    />
                    <Text style={[T.micro, numeric, { fontSize: 9, color: colors.inkMuted }]}>
                      {f.rsi != null ? Math.round(f.rsi) : '—'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[T.micro, { fontSize: 11, color: colors.noSignal }]}>—</Text>
                    <Text style={[T.micro, { fontSize: 8, color: colors.noSignal }]}>s/d</Text>
                  </>
                )}
              </View>
            );
          })}
        </View>

        {/* Conflicto entre marcos: no es señal débil, es otra señal. */}
        {alcistas > 0 && bajistas > 0 ? (
          <Text style={[T.micro, { color: colors.inkMuted, lineHeight: 14 }]}>
            Marcos en conflicto. Un impulso corto dentro de una estructura larga contraria no es
            una señal débil: es contratendencia, y pide menos tamaño, no menos convicción.
          </Text>
        ) : (
          <Text style={[T.micro, { color: colors.inkFaint, lineHeight: 14 }]}>
            {mtf.detalle_consenso || 'Cada marco se calcula por separado en el backend; la fila RSI es la del propio marco.'}
          </Text>
        )}
      </View>
    </Placa>
  );
}
