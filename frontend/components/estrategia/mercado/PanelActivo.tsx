/**
 * Activo seleccionado.
 *
 * El precio manda: es lo único a 26 px de la placa. Debajo, la rejilla de
 * datos de sesión. Los campos que Yahoo no sirve en este endpoint (apertura,
 * máximo y mínimo de la sesión, bid y ask) se dibujan como huecos con su
 * motivo, no como ceros: un `0,00` en «BID» se lee como una horquilla
 * colapsada, que es una afirmación falsa sobre el mercado.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, DatosMercado } from '../../../lib/estrategia/tipos';
import { cifra, dinero, porcentaje, tonoDe, volumen } from '../../../lib/estrategia/formato';
import { Cifra, ConDatos, D, Placa, Rotulo, T } from '../Terminal';

function Celda({
  rotulo,
  valor,
  tono = 'neutral' as const,
  motivo,
}: {
  rotulo: string;
  valor: string | null;
  tono?: 'up' | 'down' | 'neutral' | 'caution' | 'accent';
  motivo?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexBasis: '48%', flexGrow: 1, minWidth: 0, gap: 1 }}>
      <Rotulo>{rotulo}</Rotulo>
      {motivo ? (
        <View style={{ gap: 1 }}>
          <Cifra valor={null} escala="datoFuerte" />
          <Text style={[T.micro, { color: colors.noSignal }]} numberOfLines={2}>
            {motivo}
          </Text>
        </View>
      ) : (
        <Cifra valor={valor} tono={tono} escala="datoFuerte" />
      )}
    </View>
  );
}

export default function PanelActivo({
  bloque,
  cargando,
}: {
  bloque: Bloque<DatosMercado>;
  cargando?: boolean;
}) {
  const { colors, hairline } = useTheme();

  return (
    <Placa titulo="Activo seleccionado" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={6}>
        {(m) => {
          const tono = tonoDe(m.cambioPct);
          return (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[T.titular, { color: colors.ink }]} numberOfLines={1}>
                    {m.simbolo}
                  </Text>
                  <Text style={[T.dato, { color: colors.inkMuted }]} numberOfLines={1}>
                    {m.nombre}
                  </Text>
                  {m.sector || m.industria ? (
                    <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
                      {[m.sector, m.industria].filter(Boolean).join(' / ')}
                    </Text>
                  ) : null}
                </View>
                {m.mercado ? <Rotulo>{m.mercado}</Rotulo> : null}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <Cifra valor={cifra(m.precio)} tono={tono} escala="cifraGrande" />
                <View style={{ flexDirection: 'row', gap: 5, alignItems: 'baseline' }}>
                  <Cifra valor={cifra(m.cambio)} tono={tono} escala="medida" />
                  <Cifra valor={porcentaje(m.cambioPct, 2, true)} tono={tono} escala="medida" />
                </View>
              </View>

              <View style={{ height: hairline, backgroundColor: colors.rule }} />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: D.pad, rowGap: 6 }}>
                <Celda
                  rotulo="Bid"
                  valor={null}
                  motivo="Sin horquilla en tiempo real"
                />
                <Celda
                  rotulo="Ask"
                  valor={null}
                  motivo="Sin horquilla en tiempo real"
                />
                <Celda rotulo="Máximo 52 s." valor={cifra(m.max52)} />
                <Celda rotulo="Mínimo 52 s." valor={cifra(m.min52)} />
                <Celda rotulo="Volumen" valor={volumen(m.volumen)} />
                <Celda rotulo="Vol. medio" valor={volumen(m.volumenMedio)} />
                <Celda rotulo="Cierre ant." valor={cifra(m.cierreAnterior)} />
                <Celda rotulo="Capitaliz." valor={dinero(m.capitalizacion)} />
                <Celda rotulo="Apertura" valor={null} motivo="No la sirve /overton" />
                <Celda rotulo="Rango sesión" valor={null} motivo="No lo sirve /overton" />
              </View>
            </View>
          );
        }}
      </ConDatos>
    </Placa>
  );
}
