/**
 * Libro de órdenes (nivel II).
 *
 * El componente está completo: dibuja las dos puntas con sus barras de
 * profundidad detrás de las cifras, el desequilibrio y los totales. En cuanto
 * llegue un `Bloque` con datos —de Massive/Polygon, Databento, IEX o del
 * bróker— funciona sin tocar nada.
 *
 * Hoy no llega ninguno, y eso NO se disimula con números plausibles. yfinance
 * no sirve profundidad de mercado; inventarla aquí sería exactamente el fallo
 * que el proyecto ya ha decidido no repetir. Se dibuja el hueco, se explica
 * qué haría falta y se deja el andamiaje montado.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, LibroOrdenes as TipoLibro, NivelLibro } from '../../../lib/estrategia/tipos';
import { cifra, entero, porcentaje } from '../../../lib/estrategia/formato';
import { Chip, Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';

const COLUMNAS = ['Tamaño', 'Bid', 'Ask', 'Tamaño'] as const;

/**
 * Una fila del libro. La barra de profundidad va DETRÁS de los números, en
 * posición absoluta y con `pointerEvents="none"`: si tapa la cifra o come
 * clics, deja de ser una lectura y pasa a ser decoración.
 */
function FilaLibro({
  bid,
  ask,
  maxTamano,
}: {
  bid?: NivelLibro;
  ask?: NivelLibro;
  maxTamano: number;
}) {
  const { colors, palette, hairline, numeric } = useTheme();
  const anchoBid = bid && maxTamano > 0 ? (bid.tamano / maxTamano) * 100 : 0;
  const anchoAsk = ask && maxTamano > 0 ? (ask.tamano / maxTamano) * 100 : 0;

  const celda = (contenido: string | null, color: string, alinear: 'left' | 'right' | 'center') => (
    <View style={{ flex: 1, minWidth: 0, alignItems: alinear === 'right' ? 'flex-end' : alinear === 'center' ? 'center' : 'flex-start' }}>
      <Text style={[T.dato, numeric, { color: contenido ? color : colors.noSignal }]} numberOfLines={1}>
        {contenido ?? '—'}
      </Text>
    </View>
  );

  return (
    <View
      style={{
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'center',
        height: 18,
        paddingHorizontal: 4,
        gap: 4,
        borderBottomWidth: hairline,
        borderBottomColor: colors.rule,
      }}
    >
      {/* Profundidad compradora: crece desde la izquierda. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${anchoBid / 2}%`,
          backgroundColor: palette.upWash,
        }}
      />
      {/* Profundidad vendedora: crece desde la derecha. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: `${anchoAsk / 2}%`,
          backgroundColor: palette.downWash,
        }}
      />
      {celda(entero(bid?.tamano ?? null), colors.inkMuted, 'left')}
      {celda(cifra(bid?.precio ?? null), palette.up, 'right')}
      {celda(cifra(ask?.precio ?? null), palette.down, 'left')}
      {celda(entero(ask?.tamano ?? null), colors.inkMuted, 'right')}
    </View>
  );
}

export default function LibroOrdenes({
  bloque,
  cargando,
}: {
  bloque: Bloque<TipoLibro>;
  cargando?: boolean;
}) {
  const { colors, hairline } = useTheme();

  return (
    <Placa
      titulo="Libro de órdenes (nivel II)"
      procedencia={bloque.procedencia}
      derecha={
        bloque.datos?.spreadPct != null ? (
          <Chip texto={`Spread ${porcentaje(bloque.datos.spreadPct, 3)}`} tono="accent" />
        ) : null
      }
    >
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={5}>
        {(libro) => {
          const maxTamano = Math.max(
            ...libro.bids.map((b) => b.tamano),
            ...libro.asks.map((a) => a.tamano),
            1,
          );
          const filas = Math.max(libro.bids.length, libro.asks.length);

          return (
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', paddingHorizontal: 4, gap: 4 }}>
                {COLUMNAS.map((c, i) => (
                  <View
                    key={c + i}
                    style={{
                      flex: 1,
                      alignItems: i === 0 ? 'flex-start' : i === 3 ? 'flex-end' : i === 1 ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <Rotulo>{c}</Rotulo>
                  </View>
                ))}
              </View>
              <View style={{ borderTopWidth: hairline, borderTopColor: colors.rule }}>
                {Array.from({ length: filas }).map((_, i) => (
                  <FilaLibro key={i} bid={libro.bids[i]} ask={libro.asks[i]} maxTamano={maxTamano} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6, paddingTop: 2 }}>
                <View style={{ gap: 1 }}>
                  <Rotulo tono="up">Total bid</Rotulo>
                  <Cifra valor={entero(libro.totalBid)} tono="up" escala="datoFuerte" />
                </View>
                <View style={{ alignItems: 'center', gap: 1 }}>
                  <Rotulo>Desequilibrio</Rotulo>
                  <Cifra
                    valor={porcentaje(libro.desequilibrioPct, 1, true)}
                    tono={(libro.desequilibrioPct ?? 0) >= 0 ? 'up' : 'down'}
                    escala="datoFuerte"
                  />
                </View>
                <View style={{ alignItems: 'flex-end', gap: 1 }}>
                  <Rotulo tono="down">Total ask</Rotulo>
                  <Cifra valor={entero(libro.totalAsk)} tono="down" escala="datoFuerte" />
                </View>
              </View>
            </View>
          );
        }}
      </ConDatos>
    </Placa>
  );
}
