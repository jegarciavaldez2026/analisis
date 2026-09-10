/**
 * ============================================================================
 * Gráfico principal del terminal
 * ============================================================================
 * Cuatro paneles apilados sobre el MISMO eje temporal: velas con medias,
 * volumen, MACD y RSI. Todo en SVG, dibujado a partir de las velas reales que
 * sirve `/indicators-chart`. Ni una imagen, ni un iframe, ni un placeholder.
 *
 * Decisiones que se notan al usarlo:
 *
 * - El cursor recorre las cuatro escalas a la vez. Comparar precio con RSI en
 *   la misma barra es el trabajo del analista; si hay que mirar dos gráficos
 *   por separado, la herramienta no está ayudando.
 * - El calentamiento de los indicadores se dibuja como ausencia. Un MACD en
 *   cero durante 26 barras es una línea plana que el ojo lee como «sin
 *   momento», y eso es falso.
 * - Las velas se recortan al ancho disponible: con 260 barras en 700 px cada
 *   vela mide 2 px y el cuerpo desaparece. Se muestra la cola más reciente.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Platform, Text, View } from 'react-native';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, Marco, SerieMercado } from '../../../lib/estrategia/tipos';
import { Agrupacion, calcularIndicadores, reagrupar } from '../../../lib/estrategia/indicadores';
import { cifra, volumen as fmtVolumen } from '../../../lib/estrategia/formato';
import { esIntradia } from '../../../lib/estrategia/api';
import { Cifra, ConDatos, Conmutador, Placa, Rotulo, T } from '../Terminal';

/**
 * Marcos temporales.
 *
 * **Corrección de una suposición equivocada.** Hasta ahora 1m, 5m, 15m y 30m
 * salían apagados con el motivo «yfinance no sirve histórico a esta
 * resolución». Se midió y era falso: 5m devuelve 4.680 barras de sesenta días
 * y 1m devuelve 1.949 de cinco. Lo que faltaba no era el dato, era el
 * endpoint — ahora existe (`/intradia/{ticker}`) y estos marcos funcionan.
 *
 * Los diarios siguen reagrupando en cliente POR CALENDARIO, que es exacto y no
 * cuesta una petición. 4H se reagrupa desde 1H en el backend, porque el
 * proveedor no tiene ese intervalo.
 *
 * El único que sigue apagado es 12s, y ese motivo sí es real: no existe en
 * ningún plan de este proveedor. Y en NINGUNO de estos marcos hay footprint:
 * `history()` devuelve OHLCV, nunca el reparto bid/ask por nivel de precio.
 */
const FALTA_PROVEEDOR = 'No existe a esta resolución en este proveedor';

export const MARCOS: readonly {
  clave: Marco;
  texto: string;
  deshabilitada?: boolean;
  motivo?: string;
}[] = [
  { clave: '12s', texto: '12s', deshabilitada: true, motivo: FALTA_PROVEEDOR },
  { clave: '1m', texto: '1m' },
  { clave: '5m', texto: '5m' },
  { clave: '15m', texto: '15m' },
  { clave: '30m', texto: '30m' },
  { clave: '1H', texto: '1H' },
  { clave: '4H', texto: '4H' },
  { clave: '1D', texto: '1D' },
  { clave: '1W', texto: '1S' },
  { clave: '1M', texto: '1M' },
];

/** Rango de histórico. Estos SÍ los acepta `/indicators-chart` tal cual. */
export const RANGOS = [
  { clave: '3m' as const, texto: '3M' },
  { clave: '6m' as const, texto: '6M' },
  { clave: '30wk' as const, texto: '30S' },
  { clave: '1y' as const, texto: '1A' },
  { clave: '2y' as const, texto: '2A' },
];

export type Rango = (typeof RANGOS)[number]['clave'];

const MARGEN = { izq: 46, der: 8, sup: 6, inf: 14 };
const MAX_VELAS = 180;

interface Alturas {
  precio: number;
  volumen: number;
  macd: number;
  rsi: number;
  coppock: number;
}

const ALTURAS_ESCRITORIO: Alturas = { precio: 300, volumen: 56, macd: 74, rsi: 62, coppock: 62 };
const ALTURAS_COMPACTAS: Alturas = { precio: 210, volumen: 44, macd: 58, rsi: 50, coppock: 50 };

/** Escala lineal cerrada. Devuelve el centro si el dominio es degenerado. */
function escala(min: number, max: number, desde: number, hasta: number) {
  const d = max - min;
  if (!Number.isFinite(d) || d === 0) {
    return () => (desde + hasta) / 2;
  }
  return (v: number) => hasta - ((v - min) / d) * (hasta - desde);
}

/** Traza una polilínea saltándose los `null`, para no unir tramos sin dato. */
function trazo(
  valores: (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = '';
  let abierto = false;
  for (let i = 0; i < valores.length; i += 1) {
    const v = valores[i];
    if (v === null || !Number.isFinite(v)) {
      abierto = false;
      continue;
    }
    d += `${abierto ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    abierto = true;
  }
  return d;
}

export default function GraficoMercado({
  bloque,
  cargando,
  marco,
  onMarco,
  rango,
  onRango,
  simbolo,
  compacto,
}: {
  bloque: Bloque<SerieMercado>;
  cargando?: boolean;
  marco: Marco;
  onMarco: (m: Marco) => void;
  rango: Rango;
  onRango: (r: Rango) => void;
  simbolo: string;
  compacto?: boolean;
}) {
  const { colors, palette, hairline, numeric } = useTheme();
  const [ancho, setAncho] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const anchoRef = useRef(0);

  const alturas = compacto ? ALTURAS_COMPACTAS : ALTURAS_ESCRITORIO;

  const medir = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    anchoRef.current = w;
    setAncho(w);
  }, []);

  const datos = bloque.datos;

  /**
   * Reagrupación al marco pedido + indicadores.
   *
   * El orden importa: primero se reagrupa y LUEGO se calculan MACD, RSI y
   * Coppock, para que los indicadores describan las velas que se están viendo.
   * Al revés —indicadores diarios bajo velas semanales— el gráfico contaría
   * dos historias distintas a la vez.
   */
  const preparado = useMemo(() => {
    if (!datos?.velas?.length) return null;
    /**
     * Los marcos intradía NO se reagrupan: ya vienen del backend con su
     * resolución. Pasarlos por `reagrupar(…, 'dia')` juntaría las setenta y
     * ocho velas de cinco minutos de una sesión en UNA sola vela diaria, y el
     * gráfico enseñaría exactamente lo mismo en 5m que en 1D sin avisar.
     */
    const agrupadas = esIntradia(marco)
      ? datos.velas
      : reagrupar(
          datos.velas,
          (marco === '1W' ? 'semana' : marco === '1M' ? 'mes' : 'dia') as Agrupacion,
        );
    const velas = agrupadas.slice(-MAX_VELAS);
    if (!velas.length) return null;
    const ind = calcularIndicadores(velas);
    return { velas, ind };
  }, [datos, marco]);

  const anchoTrazado = Math.max(0, ancho - MARGEN.izq - MARGEN.der);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          if (!preparado) return;
          const x = e.nativeEvent.locationX - MARGEN.izq;
          const i = Math.round((x / Math.max(1, anchoTrazado)) * (preparado.velas.length - 1));
          setCursor(Math.max(0, Math.min(preparado.velas.length - 1, i)));
        },
        onPanResponderMove: (e) => {
          if (!preparado) return;
          const x = e.nativeEvent.locationX - MARGEN.izq;
          const i = Math.round((x / Math.max(1, anchoTrazado)) * (preparado.velas.length - 1));
          setCursor(Math.max(0, Math.min(preparado.velas.length - 1, i)));
        },
        onPanResponderRelease: () => setCursor(null),
        onPanResponderTerminate: () => setCursor(null),
      }),
    [preparado, anchoTrazado],
  );

  return (
    <Placa
      titulo={`Gráfico · ${simbolo}`}
      procedencia={bloque.procedencia}
      sinAire
      derecha={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Conmutador
            opciones={MARCOS.map((m) => ({
              clave: m.clave,
              texto: m.texto,
              deshabilitada: m.deshabilitada,
            }))}
            activa={marco}
            onChange={onMarco}
            compacto
          />
          <Conmutador opciones={RANGOS} activa={rango} onChange={onRango} compacto />
        </View>
      }
    >
      <View style={{ padding: 6, gap: 4 }}>
        <ConDatos bloque={bloque} cargando={cargando} filasCarga={8}>
          {() => {
            if (!preparado || ancho <= 0) {
              // Primer render: aún no se ha medido el ancho. Se reserva el
              // hueco para que el panel no salte cuando llegue.
              return <View onLayout={medir} style={{ height: alturas.precio }} />;
            }

            const { velas, ind } = preparado;
            const n = velas.length;
            const paso = anchoTrazado / Math.max(1, n);
            const anchoVela = Math.max(1, Math.min(9, paso * 0.68));
            const x = (i: number) => MARGEN.izq + paso * (i + 0.5);

            /* ---------- Panel 1: precio ---------- */
            const altos = velas.map((v) => v.h);
            const bajos = velas.map((v) => v.l);
            const maxP = Math.max(...altos);
            const minP = Math.min(...bajos);
            const colchon = (maxP - minP) * 0.05 || 1;
            const yPrecio = escala(
              minP - colchon,
              maxP + colchon,
              MARGEN.sup,
              alturas.precio - MARGEN.inf,
            );

            /* ---------- Panel 2: volumen ---------- */
            const maxV = Math.max(...velas.map((v) => v.v), 1);
            const yVol = escala(0, maxV, 2, alturas.volumen - 2);

            /* ---------- Panel 3: MACD ---------- */
            const valoresMacd = [...ind.macd.macd, ...ind.macd.senal, ...ind.macd.histograma].filter(
              (v): v is number => v !== null && Number.isFinite(v),
            );
            const extremoMacd = Math.max(...valoresMacd.map(Math.abs), 0.0001);
            const yMacd = escala(-extremoMacd, extremoMacd, 4, alturas.macd - 4);

            /* ---------- Panel 4: Coppock ---------- */
            const valoresCoppock = [...ind.coppock.linea, ...ind.coppock.senal].filter(
              (v): v is number => v !== null && Number.isFinite(v),
            );
            const extremoCoppock = Math.max(...valoresCoppock.map(Math.abs), 0.0001);
            const yCoppock = escala(-extremoCoppock, extremoCoppock, 4, alturas.coppock - 4);

            /* ---------- Panel 5: RSI ---------- */
            const yRsi = escala(0, 100, 4, alturas.rsi - 4);

            const rejillaPrecio = 4;
            const velaCursor = cursor !== null ? velas[cursor] : velas[n - 1];
            const macdCursor = cursor !== null ? ind.macd.macd[cursor] : ind.macd.macd[n - 1];
            const senalCursor = cursor !== null ? ind.macd.senal[cursor] : ind.macd.senal[n - 1];
            const histCursor = cursor !== null ? ind.macd.histograma[cursor] : ind.macd.histograma[n - 1];
            const rsiCursor = cursor !== null ? ind.rsi[cursor] : ind.rsi[n - 1];
            const volMediaCursor =
              cursor !== null ? ind.smaVolumen20[cursor] : ind.smaVolumen20[n - 1];
            const coppockCursor =
              cursor !== null ? ind.coppock.linea[cursor] : ind.coppock.linea[n - 1];
            const xCursor = cursor !== null ? x(cursor) : null;

            const fecha = new Date(velaCursor.t).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });

            const subeVela = velaCursor.c >= velaCursor.o;

            return (
              <View onLayout={medir} style={{ gap: 2 }}>
                {/* Cabecera OHLC — la lectura del cursor, no un adorno */}
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={[T.datoFuerte, { color: colors.ink }]}>{simbolo}</Text>
                  <Text style={[T.micro, numeric, { color: colors.inkFaint }]}>{fecha}</Text>
                  {(
                    [
                      ['A', velaCursor.o],
                      ['M', velaCursor.h],
                      ['m', velaCursor.l],
                      ['C', velaCursor.c],
                    ] as const
                  ).map(([k, v]) => (
                    <View key={k} style={{ flexDirection: 'row', gap: 2, alignItems: 'baseline' }}>
                      <Text style={[T.micro, { color: colors.inkFaint }]}>{k}</Text>
                      <Cifra
                        valor={cifra(v)}
                        tono={subeVela ? 'up' : 'down'}
                        escala="dato"
                      />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 2, alignItems: 'baseline' }}>
                    <Text style={[T.micro, { color: colors.inkFaint }]}>Vol</Text>
                    <Cifra valor={fmtVolumen(velaCursor.v)} escala="dato" />
                  </View>
                </View>

                <View {...responder.panHandlers} style={Platform.OS === 'web' ? ({ cursor: 'crosshair' } as any) : null}>
                  {/* ============ PRECIO ============ */}
                  <Svg width={ancho} height={alturas.precio}>
                    {Array.from({ length: rejillaPrecio + 1 }).map((_, i) => {
                      const v = minP - colchon + ((maxP + colchon - (minP - colchon)) * i) / rejillaPrecio;
                      const yy = yPrecio(v);
                      return (
                        <G key={i}>
                          <Line
                            x1={MARGEN.izq}
                            x2={ancho - MARGEN.der}
                            y1={yy}
                            y2={yy}
                            stroke={colors.rule}
                            strokeWidth={hairline}
                          />
                        </G>
                      );
                    })}

                    {/* Medias móviles: identidad, no dirección — color de serie */}
                    <Path
                      d={trazo(ind.sma20, x, yPrecio)}
                      stroke={palette.accent}
                      strokeWidth={1.2}
                      fill="none"
                    />
                    <Path
                      d={trazo(ind.sma50, x, yPrecio)}
                      stroke={colors.inkFaint}
                      strokeWidth={1.2}
                      fill="none"
                      strokeDasharray="4 3"
                    />

                    {velas.map((v, i) => {
                      const sube = v.c >= v.o;
                      const color = sube ? palette.up : palette.down;
                      const cx = x(i);
                      const yA = yPrecio(Math.max(v.o, v.c));
                      const yB = yPrecio(Math.min(v.o, v.c));
                      return (
                        <G key={v.t}>
                          <Line
                            x1={cx}
                            x2={cx}
                            y1={yPrecio(v.h)}
                            y2={yPrecio(v.l)}
                            stroke={color}
                            strokeWidth={1}
                          />
                          <Rect
                            x={cx - anchoVela / 2}
                            y={yA}
                            width={anchoVela}
                            height={Math.max(1, yB - yA)}
                            fill={sube ? 'transparent' : color}
                            stroke={color}
                            strokeWidth={1}
                          />
                        </G>
                      );
                    })}

                    {xCursor !== null ? (
                      <Line
                        x1={xCursor}
                        x2={xCursor}
                        y1={MARGEN.sup}
                        y2={alturas.precio - MARGEN.inf}
                        stroke={colors.accent}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                    ) : null}
                  </Svg>

                  {/* Escala de precio, fuera del SVG para heredar la fuente */}
                  <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: MARGEN.izq }}>
                    {Array.from({ length: rejillaPrecio + 1 }).map((_, i) => {
                      const v = maxP + colchon - ((maxP + colchon - (minP - colchon)) * i) / rejillaPrecio;
                      return (
                        <Text
                          key={i}
                          style={[
                            T.micro,
                            numeric,
                            {
                              color: colors.inkFaint,
                              position: 'absolute',
                              top: yPrecio(v) - 6,
                              right: 4,
                            },
                          ]}
                        >
                          {cifra(v)}
                        </Text>
                      );
                    })}
                  </View>

                  {/* ============ VOLUMEN ============ */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
                    <Rotulo>Volumen</Rotulo>
                    <Cifra valor={fmtVolumen(velaCursor.v)} escala="micro" />
                    {/* La media y, sobre todo, el múltiplo: «×2,1» es la
                        lectura que se busca aquí, y hacerla de cabeza a partir
                        de dos cifras grandes es justo lo que nadie hace. */}
                    <Rotulo>Media 20</Rotulo>
                    <Cifra valor={fmtVolumen(volMediaCursor)} escala="micro" />
                    {volMediaCursor && volMediaCursor > 0 ? (
                      <Cifra
                        valor={`×${(velaCursor.v / volMediaCursor).toFixed(2)}`}
                        escala="micro"
                        tono={
                          velaCursor.v / volMediaCursor >= 1.5
                            ? 'accent'
                            : velaCursor.v / volMediaCursor <= 0.6
                              ? 'caution'
                              : 'neutral'
                        }
                      />
                    ) : null}
                  </View>
                  <Svg width={ancho} height={alturas.volumen}>
                    {velas.map((v, i) => {
                      const sube = v.c >= v.o;
                      const alto = alturas.volumen - 2 - yVol(v.v);
                      return (
                        <Rect
                          key={v.t}
                          x={x(i) - anchoVela / 2}
                          y={yVol(v.v)}
                          width={anchoVela}
                          height={Math.max(0.5, alto)}
                          fill={sube ? palette.up : palette.down}
                          opacity={0.55}
                        />
                      );
                    })}
                    {/* Media de 20 del volumen. Va en tinta de serie —identidad,
                        no dirección— y por ENCIMA de las barras: es la
                        referencia contra la que se miden, no una barra más. */}
                    <Path
                      d={trazo(ind.smaVolumen20, x, yVol)}
                      fill="none"
                      stroke={colors.ink}
                      strokeWidth={1.3}
                      opacity={0.85}
                    />
                    {xCursor !== null ? (
                      <Line x1={xCursor} x2={xCursor} y1={0} y2={alturas.volumen} stroke={colors.accent} strokeWidth={1} strokeDasharray="3 3" />
                    ) : null}
                  </Svg>

                  {/* ============ MACD ============ */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
                    <Rotulo>MACD 12 · 26 · 9</Rotulo>
                    <Cifra valor={cifra(macdCursor, 3)} escala="micro" tono="accent" />
                    <Cifra valor={cifra(senalCursor, 3)} escala="micro" />
                    <Cifra
                      valor={cifra(histCursor, 3)}
                      escala="micro"
                      tono={(histCursor ?? 0) >= 0 ? 'up' : 'down'}
                    />
                  </View>
                  <Svg width={ancho} height={alturas.macd}>
                    <Line
                      x1={MARGEN.izq}
                      x2={ancho - MARGEN.der}
                      y1={yMacd(0)}
                      y2={yMacd(0)}
                      stroke={colors.ruleStrong}
                      strokeWidth={hairline}
                    />
                    {ind.macd.histograma.map((h, i) => {
                      if (h === null) return null;
                      const y0 = yMacd(0);
                      const y1 = yMacd(h);
                      return (
                        <Rect
                          key={i}
                          x={x(i) - anchoVela / 2}
                          y={Math.min(y0, y1)}
                          width={anchoVela}
                          height={Math.max(0.5, Math.abs(y1 - y0))}
                          fill={h >= 0 ? palette.up : palette.down}
                          opacity={0.5}
                        />
                      );
                    })}
                    <Path d={trazo(ind.macd.macd, x, yMacd)} stroke={palette.accent} strokeWidth={1.2} fill="none" />
                    <Path d={trazo(ind.macd.senal, x, yMacd)} stroke={colors.inkMuted} strokeWidth={1.2} fill="none" />
                    {xCursor !== null ? (
                      <Line x1={xCursor} x2={xCursor} y1={0} y2={alturas.macd} stroke={colors.accent} strokeWidth={1} strokeDasharray="3 3" />
                    ) : null}
                  </Svg>

                  {/* ============ COPPOCK ============ */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
                    <Rotulo>Coppock · WMA-10 de (ROC-14 + ROC-11)</Rotulo>
                    <Cifra
                      valor={cifra(coppockCursor, 2)}
                      escala="micro"
                      tono={
                        coppockCursor === null ? 'neutral' : coppockCursor >= 0 ? 'up' : 'down'
                      }
                    />
                  </View>
                  <Svg width={ancho} height={alturas.coppock}>
                    <Line
                      x1={MARGEN.izq}
                      x2={ancho - MARGEN.der}
                      y1={yCoppock(0)}
                      y2={yCoppock(0)}
                      stroke={colors.ruleStrong}
                      strokeWidth={hairline}
                    />
                    {/* El relleno separa de un vistazo el territorio positivo
                        del negativo: el cruce del cero es la señal clásica. */}
                    <Path
                      d={`${trazo(ind.coppock.linea, x, yCoppock)}`}
                      stroke={palette.accent}
                      strokeWidth={1.4}
                      fill="none"
                    />
                    <Path
                      d={trazo(ind.coppock.senal, x, yCoppock)}
                      stroke={colors.inkMuted}
                      strokeWidth={1}
                      fill="none"
                      strokeDasharray="3 3"
                    />
                    {xCursor !== null ? (
                      <Line x1={xCursor} x2={xCursor} y1={0} y2={alturas.coppock} stroke={colors.accent} strokeWidth={1} strokeDasharray="3 3" />
                    ) : null}
                  </Svg>

                  {/* ============ RSI ============ */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
                    <Rotulo>RSI 14</Rotulo>
                    <Cifra
                      valor={cifra(rsiCursor, 1)}
                      escala="micro"
                      tono={
                        rsiCursor === null ? 'neutral' : rsiCursor > 70 ? 'down' : rsiCursor < 30 ? 'up' : 'neutral'
                      }
                    />
                  </View>
                  <Svg width={ancho} height={alturas.rsi}>
                    {[30, 50, 70].map((nivel) => (
                      <Line
                        key={nivel}
                        x1={MARGEN.izq}
                        x2={ancho - MARGEN.der}
                        y1={yRsi(nivel)}
                        y2={yRsi(nivel)}
                        stroke={nivel === 50 ? colors.rule : colors.ruleStrong}
                        strokeWidth={hairline}
                        strokeDasharray={nivel === 50 ? '2 4' : undefined}
                      />
                    ))}
                    <Path d={trazo(ind.rsi, x, yRsi)} stroke={palette.accent} strokeWidth={1.3} fill="none" />
                    {xCursor !== null ? (
                      <Line x1={xCursor} x2={xCursor} y1={0} y2={alturas.rsi} stroke={colors.accent} strokeWidth={1} strokeDasharray="3 3" />
                    ) : null}
                  </Svg>
                </View>

                {/* Rótulo de alcance: qué marcos hay y cuáles no, sin letra pequeña */}
                <Text style={[T.micro, { color: colors.inkFaint, paddingHorizontal: 4 }]}>
                  {n} barras de {marco} · medias 20 y 50 en precio, media 20 en volumen · MACD y
                  RSI calculados sobre estos cierres.{' '}
                  {esIntradia(marco)
                    ? 'Velas intradía reales del proveedor, con ~15 min de retraso. Son OHLCV: no hay footprint ni delta de agresores, que necesitan datos de tick.'
                    : 'Diario del proveedor; 1S y 1M se reagrupan por calendario, que es exacto.'}
                </Text>
              </View>
            );
          }}
        </ConDatos>
      </View>
    </Placa>
  );
}
