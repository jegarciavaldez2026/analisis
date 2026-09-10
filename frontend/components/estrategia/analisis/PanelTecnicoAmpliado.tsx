/**
 * Análisis técnico e indicadores — la versión completa.
 *
 * Tres columnas: el veredicto con su contexto, los indicadores clave, y los
 * niveles de precio ordenados por cercanía.
 *
 * La decisión que separa esto de la maqueta: **un nivel se clasifica por dónde
 * está, no por cómo se llama.** Una «R3» por debajo del precio ya se rompió y
 * hoy es soporte; dibujarla en la columna de resistencias porque empieza por R
 * es lo que hacía que la maqueta se contradijera consigo misma. Cuando el
 * backend manda un nivel incoherente, se dibuja Y se avisa — no se esconde,
 * porque el aviso es información sobre la calidad del dato.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../../contexts/ThemeContext';
import { toneColors } from '../../../theme/tokens';
import { Bloque, FilaAnalisis, NivelClave, TecnicoAmpliado } from '../../../lib/estrategia/tipos';
import { cifra, porcentaje } from '../../../lib/estrategia/formato';
import { Chip, Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';

function FilaIndicador({ f, ultima }: { f: FilaAnalisis; ultima?: boolean }) {
  const { colors, palette, hairline } = useTheme();
  const { fg } = toneColors(palette, f.tono);
  const valor =
    typeof f.valor === 'number' ? `${cifra(f.valor)}${f.unidad ?? ''}` : f.valor ? String(f.valor) : null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        minHeight: 19,
        borderBottomWidth: ultima ? 0 : hairline,
        borderBottomColor: colors.rule,
      }}
    >
      <Text style={[T.dato, { color: colors.inkMuted, flexShrink: 1 }]} numberOfLines={1}>
        {f.etiqueta}
      </Text>
      {f.sinFuente ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '60%' }}>
          <Cifra valor={null} />
          <Text style={[T.micro, { color: colors.noSignal }]} numberOfLines={1}>
            {f.sinFuente}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Cifra valor={valor} escala="datoFuerte" />
          {f.senal ? (
            <Text style={[T.rotulo, { fontSize: 9, color: fg }]} numberOfLines={1}>
              {f.senal}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function FilaNivel({ n, ultima }: { n: NivelClave; ultima?: boolean }) {
  const { colors, palette, hairline } = useTheme();
  const color = n.esSoporte ? palette.up : palette.down;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 19,
        borderBottomWidth: ultima ? 0 : hairline,
        borderBottomColor: colors.rule,
      }}
    >
      <View style={{ width: 4, height: 10, backgroundColor: color, borderRadius: 1 }} />
      <Text style={[T.dato, { color: colors.inkMuted, flex: 1 }]} numberOfLines={1}>
        {n.etiqueta}
      </Text>
      <Rotulo tono={n.esSoporte ? 'up' : 'down'}>{n.esSoporte ? 'Sop.' : 'Res.'}</Rotulo>
      <View style={{ width: 58, alignItems: 'flex-end' }}>
        <Cifra valor={cifra(n.precio)} escala="datoFuerte" />
      </View>
      <View style={{ width: 52, alignItems: 'flex-end' }}>
        <Cifra
          valor={porcentaje(n.distanciaPct, 1, true)}
          escala="micro"
          tono={(n.distanciaPct ?? 0) >= 0 ? 'up' : 'down'}
        />
      </View>
    </View>
  );
}

export default function PanelTecnicoAmpliado({
  bloque,
  cargando,
}: {
  bloque: Bloque<TecnicoAmpliado>;
  cargando?: boolean;
}) {
  const { colors, palette, hairline } = useTheme();

  return (
    <Placa titulo="Análisis técnico e indicadores" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={10}>
        {(t) => {
          const { fg } = toneColors(palette, t.tono);
          const soportes = t.niveles.filter((n) => n.esSoporte).slice(0, 6);
          const resistencias = t.niveles.filter((n) => !n.esSoporte).slice(0, 6);

          return (
            <View style={{ gap: 8 }}>
              {/* ── Veredicto y contexto ── */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, rowGap: 6 }}>
                <View style={{ gap: 1 }}>
                  <Rotulo>Score técnico</Rotulo>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Cifra
                      valor={t.score === null ? null : t.score.toFixed(0)}
                      tono={t.tono}
                      escala="cifraGrande"
                    />
                    <Text style={[T.micro, { color: colors.inkFaint }]}>/ 100</Text>
                  </View>
                </View>
                <View style={{ gap: 1, justifyContent: 'flex-end' }}>
                  <Rotulo>Señal</Rotulo>
                  <Text style={[T.medida, { color: fg }]} numberOfLines={1}>
                    {t.recomendacion}
                  </Text>
                </View>
                <View style={{ gap: 1, justifyContent: 'flex-end' }}>
                  <Rotulo>Tendencia</Rotulo>
                  <Text
                    style={[
                      T.medida,
                      { color: t.tendencia === 'ALCISTA' ? palette.up : t.tendencia === 'BAJISTA' ? palette.down : colors.ink },
                    ]}
                    numberOfLines={1}
                  >
                    {t.tendencia}
                  </Text>
                </View>
                <View style={{ gap: 1, justifyContent: 'flex-end' }}>
                  <Rotulo>Swing alto / bajo</Rotulo>
                  <View style={{ flexDirection: 'row', gap: 4, alignItems: 'baseline' }}>
                    <Cifra valor={cifra(t.swingAlto)} escala="datoFuerte" />
                    <Text style={[T.micro, { color: colors.inkFaint }]}>·</Text>
                    <Cifra valor={cifra(t.swingBajo)} escala="datoFuerte" />
                  </View>
                </View>
                <View style={{ gap: 1, justifyContent: 'flex-end' }}>
                  <Rotulo>Zona Fibonacci</Rotulo>
                  <Text style={[T.datoFuerte, { color: colors.ink }]} numberOfLines={1}>
                    {t.zonaFibonacci}
                  </Text>
                </View>
                {t.cruceDorado ? <Chip texto="Cruce dorado" tono="up" icono="trending-up" /> : null}
                {t.cruceMuerte ? <Chip texto="Cruce de la muerte" tono="down" icono="trending-down" /> : null}
              </View>

              {t.interpretacion ? (
                <Text style={[T.micro, { color: colors.inkMuted }]} numberOfLines={2}>
                  {t.interpretacion}
                </Text>
              ) : null}

              {/* ── Incoherencias detectadas ── */}
              {t.avisos.length ? (
                <View
                  style={{
                    gap: 3,
                    padding: 6,
                    borderWidth: hairline,
                    borderColor: palette.caution,
                    backgroundColor: palette.cautionWash,
                    borderRadius: 3,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="warning-outline" size={11} color={palette.caution} />
                    <Rotulo tono="caution">Niveles incoherentes</Rotulo>
                  </View>
                  {t.avisos.map((a, i) => (
                    <Text key={i} style={[T.micro, { color: colors.inkMuted }]}>
                      {a}
                    </Text>
                  ))}
                </View>
              ) : null}

              <View style={{ height: hairline, backgroundColor: colors.rule }} />

              {/* ── Indicadores clave ── */}
              <View style={{ gap: 2 }}>
                <Rotulo>Indicadores clave</Rotulo>
                {t.indicadores.map((f, i) => (
                  <FilaIndicador key={f.etiqueta} f={f} ultima={i === t.indicadores.length - 1} />
                ))}
              </View>

              <View style={{ height: hairline, backgroundColor: colors.rule }} />

              {/* ── Niveles clave ── */}
              <View style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Rotulo>Niveles clave</Rotulo>
                  <Text style={[T.micro, { color: colors.inkFaint }]}>
                    Ordenados por cercanía al precio
                  </Text>
                </View>

                {resistencias.length ? (
                  <>
                    <Rotulo tono="down">Por encima del precio</Rotulo>
                    {resistencias.map((n, i) => (
                      <FilaNivel key={n.etiqueta + n.precio} n={n} ultima={i === resistencias.length - 1} />
                    ))}
                  </>
                ) : (
                  <Text style={[T.micro, { color: colors.noSignal }]}>
                    Ningún nivel calculado queda por encima del precio.
                  </Text>
                )}

                {soportes.length ? (
                  <>
                    <Rotulo tono="up">Por debajo del precio</Rotulo>
                    {soportes.map((n, i) => (
                      <FilaNivel key={n.etiqueta + n.precio} n={n} ultima={i === soportes.length - 1} />
                    ))}
                  </>
                ) : (
                  <Text style={[T.micro, { color: colors.noSignal }]}>
                    Ningún nivel calculado queda por debajo del precio.
                  </Text>
                )}
              </View>
            </View>
          );
        }}
      </ConDatos>
    </Placa>
  );
}
