/**
 * ============================================================================
 * Gráfico de operaciones simuladas
 * ============================================================================
 * Un gráfico PROPIO, no una modificación del que ya existe.
 *
 * `GraficoMercado`, `PanelNQE`, `PanelFibonacci` y `PanelPivotes` no se tocan:
 * cada uno lleva su propia calibración —anchos de vela, escalas, cursor,
 * ventanas— y añadirles una capa de operaciones significaría que un fallo aquí
 * rompería cuatro pantallas que hoy funcionan. Lo que sí se reutiliza es el
 * LENGUAJE VISUAL: los mismos márgenes, la misma escala, velas huecas al alza
 * y macizas a la baja, y la escala de precio en `Text` absoluto fuera del SVG.
 *
 * --------------------------------------------------------------------------
 * Qué dibuja, y por qué así
 * --------------------------------------------------------------------------
 * · **ENTRADA** continua, **STOP** discontinua roja, **OBJETIVO** discontinuo
 *   verde. Tres papeles, tres trazos: a una sola tinta habría que leer la
 *   leyenda para saber cuál es cuál.
 *
 * · **Las PENDIENTES van punteadas y apagadas.** Es la misma decisión que los
 *   triángulos bloqueados del NQE: lo que todavía no ha pasado no puede
 *   dibujarse igual que lo que pasó. Una orden límite pintada como una
 *   posición diría que estás dentro cuando no lo estás.
 *
 * · **Las CERRADAS llevan una línea de entrada a salida**, con el tono del
 *   resultado. Es lo que pidió el encargo y es lo que convierte el gráfico en
 *   una explicación: se ve de dónde salió y adónde llegó.
 *
 * · Triángulo ▲ para el largo y ▼ para el corto, en el precio de entrada.
 *
 * Si no hay ninguna operación, la tarjeta no se dibuja en blanco: dice que no
 * hay ninguna y qué hacer. Un gráfico vacío se lee como un gráfico roto.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect } from 'react-native-svg';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, SerieMercado } from '../../../lib/estrategia/tipos';
import { cifra, dinero } from '../../../lib/estrategia/formato';
import { OrdenSim, TarjetaSim } from '../../../lib/simulacion/tipos';
import { Chip, ConDatos, Placa, Rotulo, T } from '../Terminal';

/** Misma métrica que el resto de gráficos del terminal. */
const MARGEN = { izq: 46, der: 54, sup: 8, inf: 16 };
/** Ancho mínimo legible de una vela. Por debajo, el cuerpo desaparece. */
const ANCHO_MIN_VELA = 3;
const ALTO = 250;
const ALTO_COMPACTO = 190;

function escala(min: number, max: number, desde: number, hasta: number) {
  const rango = max - min || 1;
  return (v: number) => desde + ((v - min) / rango) * (hasta - desde);
}

/* ==========================================================================
 * Nivel horizontal con su etiqueta fuera del trazado
 * ======================================================================== */

function Nivel({
  y,
  x0,
  x1,
  color,
  discontinuo,
  punteado,
  grosor = 1,
  opacidad = 1,
}: {
  y: number;
  x0: number;
  x1: number;
  color: string;
  discontinuo?: boolean;
  punteado?: boolean;
  grosor?: number;
  opacidad?: number;
}) {
  return (
    <Line
      x1={x0}
      x2={x1}
      y1={y}
      y2={y}
      stroke={color}
      strokeWidth={grosor}
      strokeOpacity={opacidad}
      strokeDasharray={punteado ? '1,3' : discontinuo ? '4,3' : undefined}
    />
  );
}

/* ==========================================================================
 * Gráfico
 * ======================================================================== */

export default function GraficoOperaciones({
  serie,
  abiertas,
  pendientes,
  cerradas,
  simbolo,
  cargando,
  compacto,
}: {
  serie: Bloque<SerieMercado>;
  abiertas: TarjetaSim[];
  pendientes: OrdenSim[];
  /** Sólo las del símbolo en pantalla. El gráfico filtra igualmente. */
  cerradas: TarjetaSim[];
  simbolo: string;
  cargando?: boolean;
  compacto?: boolean;
}) {
  const { colors, palette, hairline, numeric } = useTheme();
  const [ancho, setAncho] = useState(0);
  const alto = compacto ? ALTO_COMPACTO : ALTO;

  const medir = useCallback((e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width), []);

  /** Sólo lo de ESTE símbolo: dibujar niveles de otro valor sobre estas velas
   *  daría un precio plausible en una escala que no es la suya. */
  const mias = useMemo(
    () => ({
      abiertas: abiertas.filter((o) => o.simbolo === simbolo),
      pendientes: pendientes.filter((o) => o.simbolo === simbolo && o.estado === 'PENDING'),
      cerradas: cerradas.filter((o) => o.simbolo === simbolo).slice(0, 12),
    }),
    [abiertas, pendientes, cerradas, simbolo],
  );

  const total = mias.abiertas.length + mias.pendientes.length + mias.cerradas.length;

  return (
    <Placa
      titulo={`Operaciones sobre ${simbolo}`}
      procedencia={serie.procedencia}
      derecha={
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {mias.abiertas.length ? <Chip texto={`${mias.abiertas.length} abierta(s)`} tono="accent" /> : null}
          {mias.pendientes.length ? <Chip texto={`${mias.pendientes.length} pendiente(s)`} tono="caution" /> : null}
        </View>
      }
    >
      <ConDatos bloque={serie} cargando={cargando} filasCarga={6}>
        {(datos) => {
          const todas = datos.velas ?? [];

          /**
           * **El contenedor que MIDE se dibuja siempre.**
           *
           * La primera versión devolvía `null` cuando `anchoTrazado <= 0`, y
           * eso es un bloqueo mutuo: en el primer render `ancho` vale 0, así
           * que la función salía antes de dibujar el `View` con `onLayout` —
           * y sin ese `View` nunca llegaba una medida, con lo que `ancho`
           * seguía en 0 para siempre. La tarjeta salía reducida a su cabecera.
           *
           * Lo cazó una captura de pantalla, no el compilador: `tsc` da cero
           * errores, los verificadores de ámbitos e importaciones también, y
           * el panel no se rompe — sale con la cabecera puesta, que se lee
           * como «todavía cargando».
           */
          const anchoTrazado = Math.max(0, ancho - MARGEN.izq - MARGEN.der);
          /**
           * Las velas se ajustan al ANCHO, no al revés.
           *
           * En la columna del robot son ~400 px: con 180 velas cada una mide
           * 2 px y el cuerpo desaparece. Se fija cuántas caben y se recorta la
           * cola. El gráfico se acorta antes que volverse ilegible. Misma
           * decisión que en `PanelFibonacci`.
           */
          const caben = Math.max(20, Math.floor(anchoTrazado / ANCHO_MIN_VELA));
          const velas = todas.slice(-caben);
          const dibujable = velas.length > 0 && anchoTrazado > 0;

          /**
           * La escala la fijan las velas Y los niveles de las operaciones.
           *
           * Escalar sólo con las velas sacaría del panel un stop lejano o una
           * orden límite a un 15 % de distancia, y desaparecería sin avisar:
           * el gráfico se vería perfecto y faltaría justo el nivel que se
           * viene a mirar aquí.
           */
          const niveles: number[] = [];
          for (const o of mias.abiertas) {
            niveles.push(o.entrada, o.precio_actual);
            if (o.stop_loss !== null) niveles.push(o.stop_loss);
            if (o.take_profit !== null) niveles.push(o.take_profit);
          }
          for (const o of mias.pendientes) {
            if (o.precio_limite !== null) niveles.push(o.precio_limite);
            if (o.stop_loss !== null) niveles.push(o.stop_loss);
            if (o.take_profit !== null) niveles.push(o.take_profit);
          }
          for (const o of mias.cerradas) {
            niveles.push(o.entrada);
            if (o.salida !== null) niveles.push(o.salida);
          }

          // Con la lista vacía `Math.min(...[])` devuelve `Infinity` y todas las
          // coordenadas salen `NaN`: el SVG se dibuja en blanco sin dar error.
          const minV = dibujable ? Math.min(...velas.map((v) => v.l), ...niveles) : 0;
          const maxV = dibujable ? Math.max(...velas.map((v) => v.h), ...niveles) : 1;
          const colchon = (maxV - minV) * 0.04 || 1;
          const min = minV - colchon;
          const max = maxV + colchon;

          const y = escala(min, max, alto - MARGEN.inf, MARGEN.sup);
          const paso = anchoTrazado / Math.max(1, velas.length);
          const x = (i: number) => MARGEN.izq + i * paso + paso / 2;
          const cuerpo = Math.max(1, paso * 0.62);

          const x0 = MARGEN.izq;
          const x1 = ancho - MARGEN.der;

          /** Índice de la vela más cercana a una marca temporal. */
          const indiceDe = (ts: number) => {
            const ms = ts * 1000;
            let mejor = 0;
            let dist = Infinity;
            velas.forEach((v, i) => {
              const d = Math.abs(v.t - ms);
              if (d < dist) {
                dist = d;
                mejor = i;
              }
            });
            return mejor;
          };

          /** Etiquetas del margen derecho, sin solaparse unas con otras. */
          const etiquetas: { y: number; texto: string; color: string; tenue?: boolean }[] = [];
          const anotar = (valor: number, texto: string, color: string, tenue?: boolean) => {
            etiquetas.push({ y: y(valor), texto, color, tenue });
          };

          return (
            <View onLayout={medir} style={{ gap: 4 }}>
              {dibujable ? (
                <View>
                  <Svg width={ancho} height={alto}>
                    {/* Rejilla */}
                    {Array.from({ length: 5 }).map((_, i) => {
                      const yy = MARGEN.sup + ((alto - MARGEN.inf - MARGEN.sup) * i) / 4;
                      return (
                        <Line
                          key={i}
                          x1={x0}
                          x2={x1}
                          y1={yy}
                          y2={yy}
                          stroke={colors.rule}
                          strokeWidth={hairline}
                        />
                      );
                    })}

                    {/* ---------- Velas ---------- */}
                    {velas.map((v, i) => {
                      const sube = v.c >= v.o;
                      const tinta = sube ? palette.up : palette.down;
                      const yAlto = y(v.h);
                      const yBajo = y(v.l);
                      const yAbre = y(v.o);
                      const yCierra = y(v.c);
                      const arriba = Math.min(yAbre, yCierra);
                      const altura = Math.max(1, Math.abs(yCierra - yAbre));
                      return (
                        <G key={v.t}>
                          <Line
                            x1={x(i)}
                            x2={x(i)}
                            y1={yAlto}
                            y2={yBajo}
                            stroke={tinta}
                            strokeWidth={hairline}
                          />
                          {/* Hueca al alza, maciza a la baja: el mismo idioma
                              que el resto de gráficos del terminal. */}
                          <Rect
                            x={x(i) - cuerpo / 2}
                            y={arriba}
                            width={cuerpo}
                            height={altura}
                            fill={sube ? colors.surface : tinta}
                            stroke={tinta}
                            strokeWidth={hairline}
                          />
                        </G>
                      );
                    })}

                    {/* ---------- Operaciones CERRADAS ---------- */}
                    {mias.cerradas.map((op) => {
                      if (op.salida === null || op.cerrada_ts === null) return null;
                      const ia = indiceDe(op.abierta_ts);
                      const ic = indiceDe(op.cerrada_ts);
                      const gano = (op.resultado ?? 0) >= 0;
                      const tinta = gano ? palette.up : palette.down;
                      return (
                        <G key={op.id} opacity={0.55}>
                          {/* La línea de entrada a salida: el resultado, dibujado. */}
                          <Line
                            x1={x(ia)}
                            x2={x(ic)}
                            y1={y(op.entrada)}
                            y2={y(op.salida)}
                            stroke={tinta}
                            strokeWidth={1.5}
                          />
                          <Circle cx={x(ia)} cy={y(op.entrada)} r={2.5} fill={colors.surface} stroke={tinta} strokeWidth={1.2} />
                          <Circle cx={x(ic)} cy={y(op.salida)} r={2.5} fill={tinta} />
                        </G>
                      );
                    })}

                    {/* ---------- Órdenes PENDIENTES ---------- */}
                    {mias.pendientes.map((o) => {
                      if (o.precio_limite === null) return null;
                      anotar(o.precio_limite, cifra(o.precio_limite, 2) ?? '', palette.caution, true);
                      return (
                        <G key={o.id}>
                          <Nivel
                            y={y(o.precio_limite)}
                            x0={x0}
                            x1={x1}
                            color={palette.caution}
                            punteado
                            opacidad={0.85}
                          />
                        </G>
                      );
                    })}

                    {/* ---------- Posiciones ABIERTAS ---------- */}
                    {mias.abiertas.map((op) => {
                      const largo = op.direccion === 'long';
                      const tinta = largo ? palette.up : palette.down;
                      const ie = indiceDe(op.abierta_ts);
                      const ye = y(op.entrada);
                      anotar(op.entrada, cifra(op.entrada, 2) ?? '', tinta);
                      if (op.stop_loss !== null) {
                        anotar(op.stop_loss, cifra(op.stop_loss, 2) ?? '', palette.down);
                      }
                      if (op.take_profit !== null) {
                        anotar(op.take_profit, cifra(op.take_profit, 2) ?? '', palette.up);
                      }

                      const lado = 5;
                      const puntos = largo
                        ? `${x(ie)},${ye - lado} ${x(ie) - lado},${ye + lado} ${x(ie) + lado},${ye + lado}`
                        : `${x(ie)},${ye + lado} ${x(ie) - lado},${ye - lado} ${x(ie) + lado},${ye - lado}`;

                      return (
                        <G key={op.id}>
                          {/* Zona entre entrada y stop: lo que se arriesga */}
                          {op.stop_loss !== null ? (
                            <Rect
                              x={x(ie)}
                              y={Math.min(ye, y(op.stop_loss))}
                              width={Math.max(2, x1 - x(ie))}
                              height={Math.abs(y(op.stop_loss) - ye)}
                              fill={palette.downWash}
                              opacity={0.5}
                            />
                          ) : null}
                          {/* Zona entre entrada y objetivo: lo que se busca */}
                          {op.take_profit !== null ? (
                            <Rect
                              x={x(ie)}
                              y={Math.min(ye, y(op.take_profit))}
                              width={Math.max(2, x1 - x(ie))}
                              height={Math.abs(y(op.take_profit) - ye)}
                              fill={palette.upWash}
                              opacity={0.5}
                            />
                          ) : null}

                          <Nivel y={ye} x0={x(ie)} x1={x1} color={tinta} grosor={1.5} />
                          {op.stop_loss !== null ? (
                            <Nivel y={y(op.stop_loss)} x0={x(ie)} x1={x1} color={palette.down} discontinuo />
                          ) : null}
                          {op.take_profit !== null ? (
                            <Nivel y={y(op.take_profit)} x0={x(ie)} x1={x1} color={palette.up} discontinuo />
                          ) : null}
                          <Polygon points={puntos} fill={tinta} />
                        </G>
                      );
                    })}
                  </Svg>

                  {/* ---------- Escala de precio, fuera del SVG ----------
                      En `Text` absoluto, igual que los demás gráficos del
                      terminal: dentro del SVG la tipografía no hereda la
                      variante tabular y las cifras bailan al cambiar. */}
                  {/* Dos niveles próximos —una entrada y su objetivo, por
                      ejemplo— escribían sus etiquetas una encima de otra y
                      quedaba un amasijo ilegible justo donde hay que leer el
                      precio. Se ordenan y se descarta la que no cabe: mejor
                      una etiqueta menos que dos superpuestas. La línea sigue
                      dibujada; sólo se omite el rótulo. */}
                  {etiquetas
                    .slice()
                    .sort((a, b) => a.y - b.y)
                    .filter((e, i, lista) => i === 0 || e.y - lista[i - 1].y >= 11)
                    .map((e, i) => (
                    <Text
                      key={`${e.texto}-${i}`}
                      style={[
                        T.micro,
                        numeric,
                        {
                          position: 'absolute',
                          right: 2,
                          top: e.y - 6,
                          color: e.color,
                          opacity: e.tenue ? 0.7 : 1,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {e.texto}
                      </Text>
                    ))}
                  <Text
                    style={[T.micro, numeric, { position: 'absolute', left: 2, top: MARGEN.sup - 2, color: colors.inkFaint }]}
                  >
                    {cifra(max, 2)}
                  </Text>
                  <Text
                    style={[
                      T.micro,
                      numeric,
                      { position: 'absolute', left: 2, top: alto - MARGEN.inf - 8, color: colors.inkFaint },
                    ]}
                  >
                    {cifra(min, 2)}
                  </Text>
                </View>
              ) : null}

              {/* ---------- Leyenda ---------- */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 3 }}>
                {(
                  [
                    ['▲ ▼  entrada', colors.inkMuted],
                    ['──  posición abierta', palette.up],
                    ['- -  stop / objetivo', palette.down],
                    ['···  orden pendiente', palette.caution],
                    ['●──● cerrada', colors.inkMuted],
                  ] as const
                ).map(([texto, color]) => (
                  <Text key={texto} style={[T.micro, { color }]}>
                    {texto}
                  </Text>
                ))}
              </View>

              {/* ---------- Estado vacío, con su causa y su salida ---------- */}
              {total === 0 ? (
                <Text style={[T.dato, { color: colors.noSignal, lineHeight: 15 }]}>
                  No hay ninguna operación sobre {simbolo}. En cuanto abras una desde «Operar» —o
                  la abra el robot— aparecerán aquí su entrada, su stop y su objetivo sobre estas
                  mismas velas.
                </Text>
              ) : null}

              {/* Resultado acumulado de lo dibujado. Sin esto, doce líneas de
                  colores no contestan «¿y en total qué?». */}
              {mias.cerradas.length ? (
                <Text style={[T.micro, { color: colors.inkFaint }]}>
                  {mias.cerradas.length} operación(es) cerrada(s) dibujada(s) ·{' '}
                  {dinero(
                    mias.cerradas.reduce((suma, o) => suma + (o.resultado ?? 0), 0),
                    true,
                  )}{' '}
                  en conjunto.
                </Text>
              ) : null}
            </View>
          );
        }}
      </ConDatos>
    </Placa>
  );
}
