/**
 * Fase de mercado — ciclo de Wyckoff.
 *
 * Es la misma tarjeta que la pestaña de Overton, traída a la densidad del
 * terminal. Lo que la hace útil, y lo que se ha conservado entero, es la CURVA
 * DEL CICLO con la marca «AHORA»: las cuatro probabilidades sueltas dicen cuál
 * gana, pero no dónde estamos dentro de la secuencia. Situar el punto sobre la
 * onda contesta a la pregunta que de verdad se hace el que mira —¿esto acaba
 * de empezar o se está agotando?— y por eso el gráfico se encoge pero no se
 * quita.
 *
 * La posición del punto NO es la fase ganadora: es el centro de masa del
 * reparto de probabilidad. Con 35 % en distribución y 23 % en alcista, el
 * punto cae entre las dos y algo hacia la izquierda, que es exactamente la
 * lectura correcta. Elegir la etapa ganadora y clavar el punto en su centro
 * perdería esa información y haría saltar la marca de golpe entre casillas.
 */

import React, { useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '../../../contexts/ThemeContext';
import { toneColors, Tone } from '../../../theme/tokens';
import { Bloque, Wyckoff } from '../../../lib/estrategia/tipos';
import { cifra, dinero } from '../../../lib/estrategia/formato';
import { Chip, Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';

/** Tono por fase. Verde y rojo sólo donde significan dirección financiera. */
const TONO_FASE: Record<string, Tone> = {
  acumulacion: 'accent',
  alcista: 'up',
  distribucion: 'caution',
  bajista: 'down',
};

/** Rótulos cortos: «TENDENCIA ALCISTA» no cabe en un cuarto de placa. */
const CORTO: Record<string, string> = {
  acumulacion: 'ACUM.',
  alcista: 'ALCISTA',
  distribucion: 'DISTRIB.',
  bajista: 'BAJISTA',
};

const ALTO_CICLO = 104;

/**
 * La curva del ciclo con la marca de posición.
 *
 * Se dibuja en píxeles reales y no con `viewBox` escalado: con un viewBox de
 * 900 de ancho reducido a 300 px, un texto de 10 quedaría en 3 px y no se
 * leería. Aquí el tamaño de letra es el que se ve.
 */
function Ciclo({
  probabilidades,
  ancho,
}: {
  probabilidades: { clave: string; nombre: string; pct: number }[];
  ancho: number;
}) {
  const { colors, palette } = useTheme();
  if (ancho <= 0) return null;

  const H = ALTO_CICLO;
  const arriba = 14; // aire para los rótulos de fase
  const abajo = 14; // aire para la marca AHORA
  const alto = H - arriba - abajo;

  // Centro de masa del reparto: dónde cae el ciclo, no qué casilla gana.
  const total = probabilidades.reduce((s, f) => s + f.pct, 0) || 1;
  const centro =
    probabilidades.reduce((s, f, i) => s + f.pct * (i + 0.5), 0) / total;
  const x = (centro / probabilidades.length) * ancho;

  // Onda estilizada: base plana, subida, techo, caída. Es un esquema del
  // ciclo, no la serie de precios — y por eso no lleva escala de precio.
  const puntos = Array.from({ length: 90 }, (_, i) => {
    const t = i / 89;
    const y = 0.5 - 0.42 * Math.sin((t - 0.12) * Math.PI * 1.9) * Math.min(1, t * 3.2);
    return `${(t * ancho).toFixed(1)},${(arriba + y * alto).toFixed(1)}`;
  }).join(' ');

  return (
    <Svg width={ancho} height={H}>
      {probabilidades.map((f, i) => {
        const { fg } = toneColors(palette, TONO_FASE[f.clave] ?? 'neutral');
        return (
          <React.Fragment key={f.clave}>
            <Rect
              x={(i / 4) * ancho}
              y={arriba - 2}
              width={ancho / 4}
              height={alto + 4}
              fill={fg}
              opacity={0.06}
            />
            <SvgText
              x={(i / 4) * ancho + ancho / 8}
              y={9}
              textAnchor="middle"
              fontSize={8}
              fontWeight="800"
              fill={fg}
            >
              {CORTO[f.clave] ?? f.nombre}
            </SvgText>
          </React.Fragment>
        );
      })}

      <Polyline points={puntos} fill="none" stroke={colors.accent} strokeWidth={1.8} opacity={0.75} />

      {/* La marca de índice de la casa: un rectángulo de 3 px, no una flecha. */}
      <Line
        x1={x}
        x2={x}
        y1={arriba - 2}
        y2={H - abajo}
        stroke={colors.ink}
        strokeWidth={1.3}
        strokeDasharray="3 3"
      />
      <Circle cx={x} cy={arriba + alto / 2 - 4} r={5} fill={colors.accent} stroke={colors.surface} strokeWidth={2.5} />
      <SvgText
        x={Math.max(20, Math.min(ancho - 20, x))}
        y={H - 3}
        textAnchor="middle"
        fontSize={8}
        fontWeight="800"
        fill={colors.ink}
      >
        AHORA
      </SvgText>
    </Svg>
  );
}

export default function FaseMercado({
  bloque,
  cargando,
}: {
  bloque: Bloque<Wyckoff>;
  cargando?: boolean;
}) {
  const { colors, palette, hairline, radius, numeric } = useTheme();
  const [ancho, setAncho] = useState(0);
  const medir = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setAncho((previo) => (Math.abs(previo - w) > 1 ? w : previo));
  };

  return (
    <Placa
      titulo="Fase de mercado · ciclo de Wyckoff"
      procedencia={bloque.procedencia}
      derecha={
        bloque.datos?.transicion ? (
          <Chip texto="En transición" tono="caution" icono="swap-horizontal-outline" />
        ) : null
      }
    >
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={6}>
        {(w) => {
          const ordenadas = [...w.probabilidades].sort((a, b) => b.pct - a.pct);
          const ganadora = ordenadas[0] ?? { clave: '', nombre: '—', pct: 0 };
          const segunda = ordenadas[1];
          const margen = segunda ? ganadora.pct - segunda.pct : null;
          const tonoGanadora = TONO_FASE[w.etapa] ?? TONO_FASE[ganadora.clave] ?? 'neutral';
          const { fg } = toneColors(palette, tonoGanadora);

          return (
            <View style={{ gap: 8 }} onLayout={medir}>
              {/* Cabecera: confianza como en Overton, para que las dos
                  pantallas digan lo mismo, MÁS el margen en puntos, que es la
                  cifra que no se puede malinterpretar. La «confianza» del
                  backend es `margen / 30` acotado a 1, no una probabilidad. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Text style={[T.micro, numeric, { color: colors.inkFaint }]}>
                  confianza {w.confianza === null ? '—' : `${(w.confianza * 100).toFixed(0)} %`}
                  {margen !== null ? ` · margen ${margen.toFixed(1)} pp` : ''}
                  {w.sesiones !== null ? ` · ${w.sesiones} sesiones` : ''}
                </Text>
              </View>

              {/* Fase actual, con la barra lateral del tono. */}
              <View
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: w.transicion ? palette.caution : fg,
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: radius.xs,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  gap: 2,
                }}
              >
                <Text style={[T.datoFuerte, { color: colors.ink }]} numberOfLines={2}>
                  FASE ACTUAL: {w.fase.toUpperCase()}
                </Text>
                {w.descripcion ? (
                  <Text style={[T.micro, { color: colors.inkMuted, lineHeight: 14 }]}>
                    {w.descripcion}
                  </Text>
                ) : null}
              </View>

              {/* El ciclo, con AHORA. */}
              <Ciclo probabilidades={w.probabilidades} ancho={ancho} />

              {/* Las cuatro fases en el orden del ciclo. */}
              <View style={{ gap: 4 }}>
                {w.probabilidades.map((p) => {
                  const tono = TONO_FASE[p.clave] ?? 'neutral';
                  const { fg: tinta } = toneColors(palette, tono);
                  const activa = p.clave === w.etapa;
                  return (
                    <View
                      key={p.clave}
                      style={{ gap: 2 }}
                      accessibilityLabel={`${p.nombre}: ${p.pct.toFixed(1)} por ciento`}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                        <Text
                          style={[
                            T.dato,
                            {
                              color: activa ? tinta : colors.inkMuted,
                              fontWeight: activa ? '700' : '500',
                              flexShrink: 1,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {p.nombre}
                        </Text>
                        <Text
                          style={[T.datoFuerte, numeric, { color: activa ? tinta : colors.inkMuted }]}
                        >
                          {p.pct.toFixed(1)} %
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 7,
                          borderRadius: radius.xs,
                          overflow: 'hidden',
                          backgroundColor: colors.surfaceSunken,
                          borderWidth: hairline,
                          borderColor: colors.rule,
                        }}
                      >
                        {/* Escala absoluta 0-100, como en Overton: así las
                            cuatro barras se pueden sumar con la vista. */}
                        <View
                          style={{
                            width: `${Math.max(0, Math.min(100, p.pct))}%`,
                            height: '100%',
                            backgroundColor: tinta,
                            opacity: activa ? 1 : 0.45,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={{ height: hairline, backgroundColor: colors.rule }} />

              {/* Rasgos medidos: la fase sin esto sería una etiqueta sin
                  respaldo. El rango de 60 sesiones es el que sitúa el precio. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 5 }}>
                {(
                  [
                    [
                      'Posición en el rango',
                      w.rasgos.find((r) => r.etiqueta === 'Posición en el rango')?.valor,
                      ' %',
                    ],
                    ['Tendencia reciente', w.rasgos.find((r) => r.etiqueta === 'Tendencia reciente')?.valor, ' % anual'],
                    ['Tendencia previa', w.tendenciaPrevia, ' % anual'],
                  ] as const
                ).map(([rot, val, unidad]) => (
                  <View key={rot} style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
                    <Rotulo>{rot}</Rotulo>
                    <Cifra
                      valor={
                        val == null
                          ? null
                          : `${val > 0 && unidad.includes('anual') ? '+' : ''}${cifra(val, 1)}${unidad}`
                      }
                      escala="datoFuerte"
                    />
                  </View>
                ))}
                <View style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
                  <Rotulo>Rango 60 sesiones</Rotulo>
                  <Cifra
                    valor={
                      w.suelo60 === null || w.techo60 === null
                        ? null
                        : `${dinero(w.suelo60)} – ${dinero(w.techo60)}`
                    }
                    escala="datoFuerte"
                  />
                </View>
              </View>

              {/* Qué suele funcionar en esta fase. */}
              {w.estrategia.length ? (
                <>
                  <View style={{ height: hairline, backgroundColor: colors.rule }} />
                  <View style={{ gap: 3 }}>
                    <Rotulo>Qué suele funcionar en esta fase</Rotulo>
                    {w.estrategia.map((e, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                        <Text style={[T.dato, { color: fg }]}>·</Text>
                        <Text style={[T.micro, { color: colors.inkMuted, flex: 1, lineHeight: 14 }]}>
                          {e}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {w.transicion ? (
                <Text style={[T.micro, { color: palette.caution, lineHeight: 14 }]}>
                  Las dos fases más probables están a menos de diez puntos: la dominante no es una
                  lectura firme. Conviene esperar confirmación antes de operar contra la anterior.
                </Text>
              ) : null}
            </View>
          );
        }}
      </ConDatos>
    </Placa>
  );
}
