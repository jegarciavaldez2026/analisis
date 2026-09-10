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
 *
 * ── Por qué esta versión tiene tres columnas y no cinco ────────────────────
 * Vive en la columna izquierda, que son ~230 px. Cinco columnas ahí dejan
 * 38 px por celda y «Sesgo comprador» no cabe ni de lejos.
 *
 * Pero la reducción no es sólo de espacio, y por eso se hizo así: de las cinco
 * columnas originales, TRES eran el mismo número. Compra y venta suman 100 y
 * el delta es su diferencia, así que cualquiera de los tres determina los
 * otros dos; y la señal («sesgo comprador» / «sesgo vendedor») no era más que
 * el SIGNO del delta escrito con letras. Se queda el delta, con su signo y su
 * color, y una barra que enseña el reparto de un vistazo — que es lo que
 * aportaban de verdad los porcentajes sueltos.
 *
 * Compra y venta siguen accesibles: van en la etiqueta de accesibilidad de
 * cada fila, para no perderlas para quien no ve la barra.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, FilaVolumeDelta } from '../../../lib/estrategia/tipos';
import { porcentaje } from '../../../lib/estrategia/formato';
import { Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';

/**
 * Barra de reparto compra / venta.
 *
 * El tramo verde arranca a la izquierda y ocupa el porcentaje comprador; el
 * resto es vendedor. La marca del centro es el 50 %: sin ella, un reparto
 * 53/47 y uno 47/53 se ven igual, y son lecturas opuestas.
 */
function Reparto({ compraPct }: { compraPct: number | null }) {
  const { colors, palette, radius, hairline } = useTheme();
  const v = compraPct === null || !Number.isFinite(compraPct) ? null : Math.max(0, Math.min(100, compraPct));
  return (
    <View
      style={{
        flex: 1,
        height: 7,
        minWidth: 30,
        borderRadius: radius.xs,
        borderWidth: hairline,
        borderColor: colors.rule,
        backgroundColor: colors.surfaceSunken,
        overflow: 'hidden',
        justifyContent: 'center',
      }}
    >
      {v === null ? null : (
        <>
          <View style={{ flexDirection: 'row', height: '100%' }}>
            <View style={{ width: `${v}%`, backgroundColor: palette.up, opacity: 0.75 }} />
            <View style={{ flex: 1, backgroundColor: palette.down, opacity: 0.75 }} />
          </View>
          {/* El 50 %, para que el ojo tenga contra qué comparar. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: '50%',
              width: hairline * 2,
              height: '100%',
              backgroundColor: colors.canvas,
            }}
          />
        </>
      )}
    </View>
  );
}

export default function VolumeDelta({
  bloque,
  cargando,
}: {
  bloque: Bloque<FilaVolumeDelta[]>;
  cargando?: boolean;
}) {
  const { colors, hairline } = useTheme();

  return (
    <Placa titulo="Volume delta multi-marco" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={7}>
        {(filas) => (
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 26 }}>
                <Rotulo>TF</Rotulo>
              </View>
              <View style={{ flex: 1 }}>
                <Rotulo>Compra / venta</Rotulo>
              </View>
              <View style={{ width: 42, alignItems: 'flex-end' }}>
                <Rotulo>Delta</Rotulo>
              </View>
            </View>

            {filas.map((f, i) => (
              <View
                key={f.tf + i}
                accessibilityRole="text"
                // Los porcentajes no se pierden por quitarlos de la vista.
                accessibilityLabel={
                  `${f.tf}: compra ${porcentaje(f.compraPct, 0) ?? '—'}, ` +
                  `venta ${porcentaje(f.ventaPct, 0) ?? '—'}, ` +
                  `delta ${porcentaje(f.deltaPct, 0, true) ?? '—'}. ${f.senal}`
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  minHeight: 16,
                  borderTopWidth: hairline,
                  borderTopColor: colors.rule,
                  paddingTop: 2,
                }}
              >
                <View style={{ width: 26 }}>
                  <Text style={[T.datoFuerte, { color: colors.ink }]} numberOfLines={1}>
                    {f.tf}
                  </Text>
                </View>
                <Reparto compraPct={f.compraPct} />
                <View style={{ width: 42, alignItems: 'flex-end' }}>
                  <Cifra
                    valor={porcentaje(f.deltaPct, 0, true)}
                    tono={(f.deltaPct ?? 0) >= 0 ? 'up' : 'down'}
                  />
                </View>
              </View>
            ))}

            {bloque.nota ? (
              <Text style={[T.micro, { color: colors.inkFaint, paddingTop: 3 }]}>
                {bloque.nota}
              </Text>
            ) : null}
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}
