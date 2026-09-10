/**
 * Análisis técnico, Ichimoku y volatilidad.
 *
 * Los tres tienen la misma anatomía —lista de lecturas y un score arriba— así
 * que comparten una tabla y se diferencian en lo que meten dentro. Tres
 * componentes con la misma tabla copiada tres veces es cómo empiezan a
 * divergir sin que nadie lo decida.
 *
 * Las filas con `sinFuente` dibujan el hueco. Una lista donde todo tiene un
 * número invita a confiar en todos por igual; ésta enseña dónde no hay medida.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { toneColors } from '../../../theme/tokens';
import {
  AnalisisTecnico as TipoTecnico,
  Bloque,
  FilaAnalisis,
  Ichimoku as TipoIchimoku,
  Volatilidad as TipoVolatilidad,
} from '../../../lib/estrategia/tipos';
import { cifra } from '../../../lib/estrategia/formato';
import { Cifra, Chip, ConDatos, Placa, Rotulo, T } from '../Terminal';

function TablaLecturas({ filas }: { filas: FilaAnalisis[] }) {
  const { colors, palette, hairline } = useTheme();
  return (
    <View style={{ gap: 1 }}>
      {filas.map((f, i) => {
        const { fg } = toneColors(palette, f.tono);
        const valor =
          typeof f.valor === 'number'
            ? `${cifra(f.valor)}${f.unidad ?? ''}`
            : f.valor
              ? String(f.valor)
              : null;
        return (
          <View
            key={f.etiqueta + i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              minHeight: 19,
              borderBottomWidth: i === filas.length - 1 ? 0 : hairline,
              borderBottomColor: colors.rule,
            }}
          >
            <Text style={[T.dato, { color: colors.inkMuted, flexShrink: 1 }]} numberOfLines={2}>
              {f.etiqueta}
            </Text>
            {f.sinFuente ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '62%' }}>
                <Cifra valor={null} />
                <Text style={[T.micro, { color: colors.noSignal }]} numberOfLines={3}>
                  {f.sinFuente}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Cifra valor={valor} escala="datoFuerte" />
                {f.senal ? (
                  // Dos líneas: el backend manda aquí desde «BULL» hasta
                  // frases enteras, y en una sola se perdía la mitad.
                  <Text style={[T.rotulo, { fontSize: 9, color: fg, flexShrink: 1 }]} numberOfLines={2}>
                    {f.senal}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function CabeceraScore({
  score,
  maximo = 100,
  etiqueta,
  tono,
}: {
  score: number | null;
  maximo?: number;
  etiqueta: string;
  tono: 'up' | 'down' | 'caution' | 'accent' | 'neutral';
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Cifra valor={score === null ? null : score.toFixed(0)} tono={tono} escala="cifraGrande" />
        <Text style={[T.micro, { color: colors.inkFaint }]}>/ {maximo}</Text>
      </View>
      {etiqueta ? <Chip texto={etiqueta} tono={tono} /> : null}
    </View>
  );
}

/* ========================================================================== */

export function PanelTecnico({
  bloque,
  cargando,
}: {
  bloque: Bloque<TipoTecnico>;
  cargando?: boolean;
}) {
  return (
    <Placa titulo="Análisis técnico" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={8}>
        {(t) => (
          <View style={{ gap: 6 }}>
            <CabeceraScore score={t.score} etiqueta={t.senal} tono={t.tono} />
            <TablaLecturas filas={t.filas} />
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}

export function PanelIchimoku({
  bloque,
  cargando,
}: {
  bloque: Bloque<TipoIchimoku>;
  cargando?: boolean;
}) {
  return (
    <Placa titulo="Ichimoku" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={6}>
        {(i) => (
          <View style={{ gap: 6 }}>
            <CabeceraScore score={i.score} maximo={10} etiqueta={i.sesgo} tono={i.tono} />
            <TablaLecturas filas={i.filas} />
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}

export function PanelVolatilidad({
  bloque,
  cargando,
}: {
  bloque: Bloque<TipoVolatilidad>;
  cargando?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Placa titulo="Volatilidad" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={6}>
        {(v) => (
          <View style={{ gap: 6 }}>
            <View style={{ gap: 2 }}>
              <Rotulo>Régimen de mercado</Rotulo>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[T.medida, { color: colors.ink }]} numberOfLines={1}>
                  {v.regimen}
                </Text>
                {v.regimen && v.regimen !== 'SIN DATOS' ? <Chip texto="Calculado" tono={v.tono} /> : null}
              </View>
            </View>
            <TablaLecturas filas={v.filas} />
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}
