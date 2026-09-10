/**
 * Clusters de volumen — la rejilla del footprint, con lo que sí se puede medir.
 *
 * Eje X el tiempo, eje Y el precio, y cada celda el volumen negociado ahí. Es
 * el diseño del footprint y todas las cifras están medidas.
 *
 * Lo que NO tiene, dicho en la propia cabecera y no en una nota al pie: el
 * desdoble bid/ask dentro de cada celda. Un footprint de verdad enseña dos
 * números por nivel y colorea los desequilibrios comparándolos; para eso hay
 * que clasificar cada operación contra la horquilla del momento, y esta fuente
 * no sirve ni el tape ni las cotizaciones. Aquí hay volumen por precio, no
 * quién agredió — y la diferencia importa lo suficiente como para escribirla.
 *
 * Sigue al marco del gráfico: en 1D son clusters diarios y en 5m se convierte
 * en una rejilla intradía de verdad, que es donde este gráfico luce.
 */

import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Platform, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, Marco, SerieMercado } from '../../../lib/estrategia/tipos';
import { rejillaClusters } from '../../../lib/estrategia/clusters';
import { cifra, volumen as fmtVolumen } from '../../../lib/estrategia/formato';
import { Chip, Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';

const ALTO_REJILLA = 210;
const ALTO_DELTA = 34;
const ANCHO_ESCALA = 52;
/** Filas de precio. Más de 30 y las celdas dejan de distinguirse. */
const FILAS = 26;

export default function ClustersVolumen({
  bloque,
  cargando,
  marco,
}: {
  bloque: Bloque<SerieMercado>;
  cargando?: boolean;
  marco: Marco;
}) {
  const [ancho, setAncho] = useState(0);
  const medir = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setAncho((previo) => (Math.abs(previo - w) > 1 ? w : previo));
  };

  return (
    <Placa
      titulo="Clusters de volumen por precio"
      procedencia={bloque.procedencia}
      derecha={<Chip texto="Sin bid/ask" tono="caution" icono="information-circle-outline" />}
    >
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={6}>
        {(serie) => (
          <Cuerpo velas={serie.velas} marco={marco} ancho={ancho} medir={medir} />
        )}
      </ConDatos>
    </Placa>
  );
}

function Cuerpo({
  velas,
  marco,
  ancho,
  medir,
}: {
  velas: SerieMercado['velas'];
  marco: Marco;
  ancho: number;
  medir: (e: LayoutChangeEvent) => void;
}) {
  const { colors, palette, hairline, numeric } = useTheme();
  const [celdaActiva, setCeldaActiva] = useState<{ x: number; y: number } | null>(null);

  const anchoRejilla = Math.max(0, ancho - ANCHO_ESCALA);

  /**
   * Cuántas barras caben. Cada columna necesita unos 9 px para que la celda
   * siga siendo un rectángulo legible y no una raya: con doscientas barras en
   * cuatrocientos píxeles no hay rejilla, hay un degradado.
   */
  const columnas = Math.max(12, Math.min(70, Math.floor(anchoRejilla / 9)));
  const ventana = useMemo(() => velas.slice(-columnas), [velas, columnas]);
  const rejilla = useMemo(() => rejillaClusters(ventana, FILAS), [ventana]);

  if (!rejilla || anchoRejilla <= 0) {
    return (
      <View onLayout={medir}>
        <Text style={[T.micro, { color: colors.noSignal }]}>
          {rejilla ? 'Midiendo…' : 'No hay volumen suficiente para construir la rejilla.'}
        </Text>
      </View>
    );
  }

  const anchoCol = anchoRejilla / ventana.length;
  const altoFila = ALTO_REJILLA / FILAS;
  const yDe = (fila: number) => ALTO_REJILLA - (fila + 1) * altoFila;

  const precioAY = (p: number) => {
    const min = rejilla.precios[0] - rejilla.altoNivel / 2;
    const max = rejilla.precios[rejilla.precios.length - 1] + rejilla.altoNivel / 2;
    if (max <= min) return ALTO_REJILLA / 2;
    return ALTO_REJILLA - ((p - min) / (max - min)) * ALTO_REJILLA;
  };

  const activa = celdaActiva
    ? rejilla.celdas.find((c) => c.x === celdaActiva.x && c.y === celdaActiva.y)
    : null;

  const maxDelta = Math.max(...rejilla.deltas.map((d) => Math.abs(d)), 1);
  const cierre = ventana[ventana.length - 1]?.c ?? 0;

  return (
    <View style={{ gap: 6 }} onLayout={medir}>
      {/* Lectura de cabecera: la celda señalada, o el resumen de la ventana. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 4 }}>
        <View style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
          <Rotulo>{activa ? 'Celda · precio' : 'POC de la ventana'}</Rotulo>
          <Cifra
            valor={activa ? cifra(rejilla.precios[activa.y]) : cifra(rejilla.pocGlobal)}
            tono="accent"
            escala="datoFuerte"
          />
        </View>
        <View style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
          <Rotulo>{activa ? 'Celda · volumen' : 'Volumen de la ventana'}</Rotulo>
          <Cifra
            valor={fmtVolumen(activa ? activa.volumen : rejilla.volumenTotal)}
            escala="datoFuerte"
          />
        </View>
        <View style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
          <Rotulo>Resolución</Rotulo>
          <Cifra valor={`${marco} · ${ventana.length}`} escala="datoFuerte" />
        </View>
      </View>

      {/* La rejilla. */}
      <View style={{ flexDirection: 'row', gap: 2 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Svg width={anchoRejilla} height={ALTO_REJILLA}>
            {/* Fondo del pozo: las celdas sin volumen tienen que verse vacías,
                no del color del panel, o la rejilla pierde el marco. */}
            <Rect x={0} y={0} width={anchoRejilla} height={ALTO_REJILLA} fill={colors.surfaceSunken} />

            {rejilla.celdas.map((c, i) => {
              const esActiva = celdaActiva?.x === c.x && celdaActiva?.y === c.y;
              // La intensidad es el volumen relativo. El color es el acento, no
              // verde/rojo: el volumen no tiene dirección, y teñirlo de verde
              // haría leer «volumen comprador», que es justo lo que NO se sabe.
              return (
                <Rect
                  key={i}
                  x={c.x * anchoCol}
                  y={yDe(c.y)}
                  width={Math.max(0.5, anchoCol - 0.5)}
                  height={Math.max(0.5, altoFila - 0.5)}
                  fill={palette.accent}
                  opacity={0.12 + c.intensidad * 0.8}
                  stroke={esActiva ? colors.ink : c.pocDeBarra ? palette.accent : 'transparent'}
                  strokeWidth={esActiva ? 1.2 : c.pocDeBarra ? 0.8 : 0}
                  onPress={() => setCeldaActiva(esActiva ? null : { x: c.x, y: c.y })}
                />
              );
            })}

            {/* POC de la ventana y precio actual, sobre la rejilla. */}
            <Line
              x1={0}
              x2={anchoRejilla}
              y1={precioAY(rejilla.pocGlobal)}
              y2={precioAY(rejilla.pocGlobal)}
              stroke={palette.accent}
              strokeWidth={1.2}
              strokeDasharray="4 3"
            />
            <Line
              x1={0}
              x2={anchoRejilla}
              y1={precioAY(cierre)}
              y2={precioAY(cierre)}
              stroke={colors.ink}
              strokeWidth={1.4}
            />
          </Svg>

          {/* Delta por barra, alineado con las mismas columnas. */}
          <Svg width={anchoRejilla} height={ALTO_DELTA}>
            <Line
              x1={0}
              x2={anchoRejilla}
              y1={ALTO_DELTA / 2}
              y2={ALTO_DELTA / 2}
              stroke={colors.rule}
              strokeWidth={1}
            />
            {rejilla.deltas.map((d, i) => {
              const h = (Math.abs(d) / maxDelta) * (ALTO_DELTA / 2 - 2);
              return (
                <Rect
                  key={i}
                  x={i * anchoCol}
                  y={d >= 0 ? ALTO_DELTA / 2 - h : ALTO_DELTA / 2}
                  width={Math.max(0.5, anchoCol - 0.5)}
                  height={Math.max(0.5, h)}
                  fill={d >= 0 ? palette.up : palette.down}
                  opacity={0.75}
                />
              );
            })}
          </Svg>
        </View>

        {/* Escala de precio. */}
        <View style={{ width: ANCHO_ESCALA - 2, height: ALTO_REJILLA }}>
          {(
            [
              [cierre, colors.ink, 'Actual'],
              [rejilla.pocGlobal, palette.accent, 'POC'],
            ] as const
          ).map(([p, color, etiqueta]) => (
            <View
              key={etiqueta}
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: Math.max(0, Math.min(ALTO_REJILLA - 11, precioAY(p) - 5.5)),
                left: 0,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Text style={[T.micro, { color, fontSize: 8, fontWeight: '700' }]}>{etiqueta}</Text>
              <Text style={[T.micro, numeric, { color, fontSize: 9 }]} numberOfLines={1}>
                {cifra(p)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Qué es cada cosa, y qué falta. La advertencia va aquí y no escondida:
          la forma de este gráfico se parece tanto a un footprint que sin
          decirlo se leería como si tuviera bid/ask. */}
      <Text style={[T.micro, { color: colors.inkFaint, lineHeight: 14 }]}>
        Cada celda es el volumen negociado en ese precio durante esa barra, repartido por el rango
        recorrido. Discontinua = POC de la ventana; línea sólida = precio actual; barras de abajo =
        delta por barra (proxy CLV). <Text style={{ color: palette.caution }}>Sin desdoble
        bid/ask</Text>: esta fuente da OHLCV, no el tape, así que hay volumen por precio pero no
        quién agredió ni imbalances.
      </Text>
    </View>
  );
}
