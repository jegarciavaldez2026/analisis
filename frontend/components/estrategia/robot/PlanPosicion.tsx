/**
 * Plan de posición.
 *
 * La maqueta lo llamaba «POSICIÓN ACTUAL» con 1.200 acciones y un P&L abierto.
 * Eso sería mentira: no hay bróker conectado ni motor de ejecución, así que no
 * existe ninguna posición abierta que enseñar.
 *
 * Lo que sí existe y es real son los NIVELES que calcula `/overton`: entrada
 * óptima, stop por ATR·2,2 y objetivos. El panel enseña eso y se llama por su
 * nombre. El tamaño sugerido se deriva de los controles del robot, así que
 * mover el deslizador de riesgo cambia el número que se lee aquí.
 *
 * La barra sitúa stop, entrada, precio y objetivo en la MISMA escala de
 * precio: si el objetivo de un plan bajista cayera por encima de la entrada,
 * se vería en el dibujo antes que en ninguna tabla.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import {
  Bloque,
  ControlesRobot,
  Liquidez,
  PosicionAbierta,
  ResumenPanel,
} from '../../../lib/estrategia/tipos';
import { cifra, dinero, entero, porcentaje } from '../../../lib/estrategia/formato';
import { Chip, Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';

/**
 * Altura de la banda: 16 px de rótulos arriba, la barra de 6, y 18 abajo para
 * la otra tanda. Fijarlo aquí evita que un `bottom` calculado sobre un
 * contenedor sin altura acabe pisando la barra.
 */
const CARRIL = { arriba: 16, barra: 6, abajo: 18 };
/** Ancho reservado por etiqueta. «Objetivo» a 8,5 px cabe en 46. */
const ANCHO_MARCA = 46;

function Marca({
  etiqueta,
  t,
  color,
  arriba,
}: {
  etiqueta: string;
  t: number;
  color: string;
  arriba?: boolean;
}) {
  const p = Math.max(0, Math.min(1, t));

  /**
   * El anclaje se desliza con la posición en vez de centrarse siempre.
   *
   * Centrando (`translateX: -mitad`) la etiqueta del extremo izquierdo se sale
   * 23 px por la izquierda y la del derecho por la derecha; como la placa
   * recorta, se leían «top» y «Objeti». Con este desplazamiento la etiqueta
   * queda alineada a la izquierda en 0, centrada en 0,5 y alineada a la
   * derecha en 1 — y nunca cruza el borde.
   */
  const desplazamiento = -ANCHO_MARCA * p;
  const alineacion = p < 0.2 ? 'left' : p > 0.8 ? 'right' : 'center';

  return (
    <View
      style={{
        position: 'absolute',
        left: `${p * 100}%`,
        transform: [{ translateX: desplazamiento }],
        width: ANCHO_MARCA,
        top: arriba ? 0 : CARRIL.arriba + CARRIL.barra + 2,
      }}
      pointerEvents="none"
    >
      <Text style={[T.rotulo, { fontSize: 8.5, color, textAlign: alineacion }]} numberOfLines={1}>
        {etiqueta}
      </Text>
    </View>
  );
}

export default function PlanPosicion({
  bloque,
  cargando,
  controles,
  cartera,
  liquidez,
}: {
  bloque: Bloque<PosicionAbierta>;
  cargando?: boolean;
  controles: ControlesRobot;
  cartera: Bloque<ResumenPanel>;
  /** Acota el tamaño: sin esto el riesgo mandaría solo y podría pedir más
   *  acciones de las que el valor negocia en un día. */
  liquidez: Bloque<Liquidez>;
}) {
  const { colors, palette, hairline, radius } = useTheme();

  return (
    <Placa titulo="Plan de posición" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={6}>
        {(p) => {
          const min = Math.min(p.stopLoss, p.entrada, p.actual, p.takeProfit);
          const max = Math.max(p.stopLoss, p.entrada, p.actual, p.takeProfit);
          const rango = max - min || 1;
          const t = (v: number) => (v - min) / rango;

          // Tamaño sugerido: riesgo por operación sobre el capital asignado,
          // dividido por la distancia al stop. Es la fórmula estándar y usa
          // los deslizadores de verdad, no un número fijo.
          const balance = cartera.datos?.balance ?? null;
          const capital = balance !== null ? balance * (controles.capitalPct / 100) : null;
          const riesgoDinero = capital !== null ? capital * (controles.riesgoPct / 100) : null;
          const distancia = Math.abs(p.entrada - p.stopLoss);
          const porRiesgo =
            riesgoDinero !== null && distancia > 0 ? Math.floor(riesgoDinero / distancia) : null;

          /**
           * Segundo límite: la liquidez.
           *
           * Sin libro de nivel II no se puede preguntar «¿hay papel ahora?»,
           * pero sí «¿cuánto negocia este valor un día normal?». La regla de
           * participación —no pasar del 1 % del volumen medio— es la que usa
           * la ejecución institucional, y es la que impide que el propio robot
           * sea el mercado y se coma su ventaja en deslizamiento.
           *
           * Manda el MENOR de los dos límites, y se dice cuál ha mandado: un
           * tamaño recortado sin explicar por qué se lee como un error de
           * cálculo.
           */
          const l = liquidez.datos;
          const porLiquidez = l?.maxAcciones1pct ?? null;
          const acciones =
            porRiesgo === null
              ? null
              : porLiquidez === null
                ? porRiesgo
                : Math.min(porRiesgo, porLiquidez);
          const mandaLiquidez =
            porRiesgo !== null && porLiquidez !== null && porLiquidez < porRiesgo;

          // Coste estimado de entrar y salir, con la horquilla de Corwin-Schultz.
          // Es el peaje que se paga antes de que la idea tenga razón o no.
          const costeCruce =
            acciones !== null && l?.spreadEstimadoPct != null
              ? acciones * p.entrada * (l.spreadEstimadoPct / 100)
              : null;

          return (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <Text style={[T.titular, { color: palette.up }]}>LARGO</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Cifra valor={entero(acciones)} escala="medida" />
                  <Rotulo>Acciones sugeridas</Rotulo>
                </View>
              </View>

              {/* Qué límite manda. Es la lectura que convierte una cifra en una
                  decisión: si recorta la liquidez, trocear o bajar el tamaño;
                  si recorta el riesgo, el plan cabe entero en el mercado. */}
              {acciones !== null ? (
                <Chip
                  texto={
                    mandaLiquidez
                      ? `Limita la liquidez · 1 % del volumen medio`
                      : `Limita el riesgo · ${porcentaje(controles.riesgoPct, 2)} por operación`
                  }
                  tono={mandaLiquidez ? 'caution' : 'accent'}
                  icono={mandaLiquidez ? 'water-outline' : 'shield-outline'}
                />
              ) : null}

              {/* Escala de precio con las cuatro marcas */}
              <View
                style={{
                  height: CARRIL.arriba + CARRIL.barra + CARRIL.abajo,
                  paddingTop: CARRIL.arriba,
                }}
              >
                <View
                  style={{
                    height: CARRIL.barra,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceSunken,
                    borderWidth: hairline,
                    borderColor: colors.rule,
                    overflow: 'hidden',
                  }}
                >
                  {/* Zona de riesgo: de stop a entrada */}
                  <View
                    style={{
                      position: 'absolute',
                      left: `${t(Math.min(p.stopLoss, p.entrada)) * 100}%`,
                      width: `${Math.abs(t(p.entrada) - t(p.stopLoss)) * 100}%`,
                      top: 0,
                      bottom: 0,
                      backgroundColor: palette.downWash,
                    }}
                  />
                  {/* Zona de beneficio: de entrada a objetivo */}
                  <View
                    style={{
                      position: 'absolute',
                      left: `${t(Math.min(p.entrada, p.takeProfit)) * 100}%`,
                      width: `${Math.abs(t(p.takeProfit) - t(p.entrada)) * 100}%`,
                      top: 0,
                      bottom: 0,
                      backgroundColor: palette.upWash,
                    }}
                  />
                  {/* Índice: el precio actual */}
                  <View
                    style={{
                      position: 'absolute',
                      left: `${t(p.actual) * 100}%`,
                      top: -2,
                      bottom: -2,
                      width: 2,
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
                <Marca etiqueta="Stop" t={t(p.stopLoss)} color={palette.down} arriba />
                <Marca etiqueta="Entrada" t={t(p.entrada)} color={colors.inkMuted} />
                <Marca etiqueta="Actual" t={t(p.actual)} color={colors.accent} arriba />
                <Marca etiqueta="Objetivo" t={t(p.takeProfit)} color={palette.up} />
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 6 }}>
                {(
                  [
                    ['Entrada óptima', cifra(p.entrada), 'neutral'],
                    ['Precio actual', cifra(p.actual), 'accent'],
                    ['Stop loss', cifra(p.stopLoss), 'down'],
                    ['Objetivo 1', cifra(p.takeProfit), 'up'],
                    ['Riesgo / beneficio', cifra(p.riesgoBeneficio), 'neutral'],
                    [
                      'Riesgo asumido',
                      riesgoDinero !== null ? dinero(riesgoDinero) : null,
                      'neutral',
                    ],
                    // El peaje de la horquilla. Va junto al riesgo porque se
                    // paga igual que él: antes de saber si la idea acierta. Es
                    // un techo, no una factura: la horquilla que lo alimenta
                    // sobreestima cuando la volatilidad manda.
                    [
                      'Coste de cruce (techo)',
                      costeCruce !== null ? `≤ ${dinero(costeCruce)}` : null,
                      'caution',
                    ],
                    [
                      'Tope por liquidez',
                      porLiquidez !== null ? `${entero(porLiquidez)} acc.` : null,
                      'neutral',
                    ],
                  ] as const
                ).map(([rot, val, tono]) => (
                  <View key={rot} style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
                    <Rotulo>{rot}</Rotulo>
                    <Cifra valor={val} tono={tono as any} escala="datoFuerte" />
                  </View>
                ))}
              </View>

              <View style={{ height: hairline, backgroundColor: colors.rule }} />

              <View style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                  <Text style={[T.dato, { color: colors.inkMuted }]}>P&amp;L abierto</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Cifra valor={null} escala="datoFuerte" />
                    <Text style={[T.micro, { color: colors.noSignal }]}>Sin posición abierta</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                  <Text style={[T.dato, { color: colors.inkMuted }]}>Tiempo en posición</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Cifra valor={null} escala="datoFuerte" />
                    <Text style={[T.micro, { color: colors.noSignal }]}>Sin bróker</Text>
                  </View>
                </View>
              </View>

              <Text style={[T.micro, { color: colors.inkFaint }]}>
                Tamaño calculado con {porcentaje(controles.capitalPct, 0)} del balance y{' '}
                {porcentaje(controles.riesgoPct, 2)} de riesgo por operación
                {balance === null ? ' — falta el balance, así que no hay cifra.' : '.'}
              </Text>
            </View>
          );
        }}
      </ConDatos>
    </Placa>
  );
}
