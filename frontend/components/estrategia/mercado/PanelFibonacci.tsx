/**
 * ============================================================================
 * Retrocesos de Fibonacci
 * ============================================================================
 * Port del script «Fib Retracement» del usuario. El motor vive en
 * `backend/fibonacci.py` —con pruebas ejecutables, entre ellas una que compara
 * el modo `lookback` contra una reimplementación literal del Pine nivel a
 * nivel— y aquí sólo se dibuja.
 *
 * Mismo lenguaje visual que `GraficoMercado` y `PanelNQE`: velas huecas al
 * alza y macizas a la baja, rejilla de pelo, escala de precio a la izquierda
 * fuera del SVG y cursor por `PanResponder`. `escala` y `trazo` tienen la
 * misma firma en las tres.
 *
 * Lo propio de esta tarjeta:
 *
 * - **La columna vive en ~400 px**, no en los 700 del gráfico principal. Con
 *   180 velas ahí cada una mide 2 px y el cuerpo desaparece, así que el número
 *   de velas se ajusta al ancho para que nunca bajen de 4 px. El gráfico se
 *   acorta antes que volverse ilegible.
 * - **El tramo se dibuja**, no sólo sus niveles: una diagonal del extremo
 *   antiguo al reciente, con las marcas del 0 % y el 100 %. Sin ella, siete
 *   líneas horizontales no dicen de dónde salen, que es justo lo que hay que
 *   poder auditar en un Fibonacci.
 * - **Los avisos de sesgo van arriba.** No son decoración: dicen si el tramo
 *   lo está definiendo el tamaño de la ventana en vez del mercado, o si la
 *   dirección de la escala se decidió por una o dos velas.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../../contexts/ThemeContext';
import { Tone, toneColors } from '../../../theme/tokens';
import {
  Bloque,
  ControlesFib,
  Fibonacci,
  MarcoFib,
  ModoFib,
} from '../../../lib/estrategia/tipos';
import { leerFibonacci } from '../../../lib/estrategia/api';
import { cifra } from '../../../lib/estrategia/formato';
import { Cargando, Chip, Cifra, Conmutador, Placa, rellenoTactil, Rotulo, SinFuente, T } from '../Terminal';

const MARCOS: readonly { clave: MarcoFib; texto: string }[] = [
  { clave: '5m', texto: '5m' },
  { clave: '15m', texto: '15m' },
  { clave: '1h', texto: '1H' },
  { clave: '4h', texto: '4H' },
  { clave: '1d', texto: '1D' },
  { clave: '1w', texto: '1S' },
];

const MODOS: readonly { clave: ModoFib; texto: string }[] = [
  { clave: 'pivotes', texto: 'SWING' },
  { clave: 'lookback', texto: 'VENTANA' },
];

const VENTANAS = ['50', '100', '200'] as const;

// Misma métrica que las otras dos tarjetas de gráfico.
const MARGEN = { izq: 44, der: 52, sup: 6, inf: 14 };
const ALTO = 250;
/** Ancho mínimo por vela. Por debajo, el cuerpo deja de verse. */
const ANCHO_MIN_VELA = 4;
/** Cuerpo de la etiqueta del ratio. A 8 px no se leían. */
const FUENTE_NIVEL = 11;
/** Separación mínima entre etiquetas. Por debajo se solapan y no se lee ninguna. */
const SEPARACION_NIVEL = FUENTE_NIVEL + 2;

function escala(min: number, max: number, desde: number, hasta: number) {
  const d = max - min;
  if (!Number.isFinite(d) || d === 0) return () => (desde + hasta) / 2;
  return (v: number) => hasta - ((v - min) / d) * (hasta - desde);
}

/** Tono de la zona de retroceso. Verde sólo donde significa continuación. */
function tonoZona(zona: string): Tone {
  if (zona === 'impulso roto') return 'down';
  if (zona === 'zona áurea') return 'up';
  if (zona === 'extendiendo') return 'accent';
  return 'caution';
}

/* ==========================================================================
 * Interruptor compacto
 * ======================================================================== */

function Interruptor({
  texto,
  activo,
  onPress,
  ayuda,
}: {
  texto: string;
  activo: boolean;
  onPress: () => void;
  ayuda: string;
}) {
  const { colors, palette, radius, hairline } = useTheme();
  const { width: anchoVentana } = useWindowDimensions();
  const { fg, wash } = toneColors(palette, 'accent');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: activo }}
      accessibilityLabel={`${texto}. ${ayuda}`}
      style={({ pressed, hovered }: any) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          paddingHorizontal: 5,
          // Mismo criterio que `Conmutador`: en la escena del dedo el control
          // crece hasta el mínimo táctil; con ratón se queda denso.
          paddingVertical: rellenoTactil(anchoVentana, 13, 2),
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: activo ? fg : colors.rule,
          backgroundColor: activo
            ? wash
            : pressed || hovered
              ? colors.surfaceSunken
              : 'transparent',
        },
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
      ]}
    >
      <Ionicons
        name={activo ? 'checkmark-circle' : 'ellipse-outline'}
        size={9}
        color={activo ? fg : colors.noSignal}
      />
      <Text
        style={[
          T.rotulo,
          { fontSize: 9, color: activo ? fg : colors.inkFaint, textTransform: 'uppercase' },
        ]}
        numberOfLines={1}
      >
        {texto}
      </Text>
    </Pressable>
  );
}

/* ==========================================================================
 * Tarjeta
 * ======================================================================== */

export default function PanelFibonacci({ simbolo }: { simbolo: string }) {
  const { colors, palette, hairline, numeric, radius } = useTheme();

  const [controles, setControles] = useState<ControlesFib>({
    marco: '1d',
    modo: 'pivotes',
    ventana: 100,
    invertir: false,
    extras: false,
    extensiones: true,
  });
  const [bloque, setBloque] = useState<Bloque<Fibonacci>>({
    datos: null,
    procedencia: 'real',
    nota: 'Cargando…',
  });
  const [cargando, setCargando] = useState(true);
  const [ancho, setAncho] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const peticion = useRef(0);

  const medir = useCallback((e: LayoutChangeEvent) => {
    setAncho((previo) => {
      const w = e.nativeEvent.layout.width;
      return Math.abs(previo - w) > 1 ? w : previo;
    });
  }, []);

  useEffect(() => {
    const id = (peticion.current += 1);
    let vivo = true;
    setCargando(true);
    leerFibonacci(simbolo, controles).then((b) => {
      if (!vivo || id !== peticion.current) return;
      setBloque(b);
      setCursor(null);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [simbolo, controles]);

  const datos = bloque.datos;
  const anchoTrazado = Math.max(0, ancho - MARGEN.izq - MARGEN.der);

  /**
   * Cuántas velas caben sin bajar del ancho mínimo.
   *
   * Se recorta la COLA, que es la parte que se mira. El tramo puede quedar
   * fuera del recorte; cuando pasa, el backend lo avisa y la tarjeta lo
   * repite: los niveles siguen siendo correctos, sólo que su origen no se ve.
   */
  const velas = useMemo(() => {
    if (!datos?.velas.length || anchoTrazado <= 0) return [];
    const caben = Math.max(20, Math.floor(anchoTrazado / ANCHO_MIN_VELA));
    return datos.velas.slice(-caben);
  }, [datos, anchoTrazado]);

  /** Desplazamiento aplicado al recortar, para recolocar las marcas del tramo. */
  const recorte = (datos?.velas.length ?? 0) - velas.length;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => velas.length > 0,
        onMoveShouldSetPanResponder: () => velas.length > 0,
        onPanResponderGrant: (e) => {
          if (!velas.length) return;
          const x = e.nativeEvent.locationX - MARGEN.izq;
          const i = Math.round((x / Math.max(1, anchoTrazado)) * (velas.length - 1));
          setCursor(Math.max(0, Math.min(velas.length - 1, i)));
        },
        onPanResponderMove: (e) => {
          if (!velas.length) return;
          const x = e.nativeEvent.locationX - MARGEN.izq;
          const i = Math.round((x / Math.max(1, anchoTrazado)) * (velas.length - 1));
          setCursor(Math.max(0, Math.min(velas.length - 1, i)));
        },
        onPanResponderRelease: () => setCursor(null),
        onPanResponderTerminate: () => setCursor(null),
      }),
    [velas.length, anchoTrazado],
  );

  return (
    <Placa
      titulo={`Fibonacci · ${simbolo}`}
      procedencia={bloque.procedencia}
      sinAire
      derecha={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {cargando ? <Rotulo>···</Rotulo> : null}
          <Conmutador
            compacto
            opciones={MARCOS}
            activa={controles.marco}
            onChange={(marco) => setControles((p) => ({ ...p, marco }))}
          />
        </View>
      }
    >
      <View style={{ padding: 6, gap: 5 }}>
        {/* ---------- Mandos ---------- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Conmutador
            compacto
            opciones={MODOS}
            activa={controles.modo}
            onChange={(modo) => setControles((p) => ({ ...p, modo }))}
          />
          {controles.modo === 'lookback' ? (
            <Conmutador
              compacto
              opciones={VENTANAS.map((v) => ({ clave: v, texto: v }))}
              activa={String(controles.ventana) as (typeof VENTANAS)[number]}
              onChange={(v) => setControles((p) => ({ ...p, ventana: Number(v) }))}
            />
          ) : null}
          <Interruptor
            texto="INVERTIR"
            activo={controles.invertir}
            ayuda="Da la vuelta a la escala: el 0 % pasa al otro extremo"
            onPress={() => setControles((p) => ({ ...p, invertir: !p.invertir }))}
          />
          <Interruptor
            texto="0.886"
            activo={controles.extras}
            ayuda="Añade los niveles 0.886 y 1.113"
            onPress={() => setControles((p) => ({ ...p, extras: !p.extras }))}
          />
          {/* Se llaman «> 100 %» y no «extensiones» a propósito. En la
              parametrización del script, un ratio mayor que 1 continúa el
              tramo MÁS ALLÁ de su extremo final: en un impulso alcista caen
              por debajo del mínimo, no por encima del máximo. Rotularlos
              «extensiones» los haría leer como objetivos de beneficio, que es
              lo contrario de lo que marcan — la zona donde el impulso ha
              fallado. */}
          <Interruptor
            texto="> 100 %"
            activo={controles.extensiones}
            ayuda="Añade 1.272, 1.618, 2.0 y 2.618: la continuación del tramo más allá de su extremo, donde el impulso queda invalidado"
            onPress={() => setControles((p) => ({ ...p, extensiones: !p.extensiones }))}
          />
        </View>

        {cargando && !datos ? (
          <Cargando filas={6} />
        ) : !datos ? (
          <SinFuente
            titulo="No se pudo trazar el Fibonacci"
            motivo={bloque.nota ?? 'Sin respuesta del backend.'}
            compacto
          />
        ) : velas.length === 0 || ancho <= 0 ? (
          <View onLayout={medir} style={{ height: ALTO }} />
        ) : (
          (() => {
            const n = velas.length;
            const paso = anchoTrazado / Math.max(1, n);
            const anchoVela = Math.max(1, Math.min(9, paso * 0.68));
            const x = (i: number) => MARGEN.izq + paso * (i + 0.5);

            /* ---------- Escala ----------
               Entran las velas Y los niveles: si se escala sólo con las velas,
               una extensión 2.618 se sale del panel y desaparece sin avisar. */
            const candidatos: number[] = [];
            velas.forEach((v) => candidatos.push(v.h, v.l));
            datos.niveles
              .filter((x2) => x2.tipo === 'retroceso')
              .forEach((x2) => candidatos.push(x2.precio));
            const maxP = Math.max(...candidatos);
            const minP = Math.min(...candidatos);
            const colchon = (maxP - minP) * 0.04 || 1;
            const techo = maxP + colchon;
            const suelo = minP - colchon;
            const y = escala(suelo, techo, MARGEN.sup, ALTO - MARGEN.inf);

            // Las extensiones se dibujan sólo si caben en ese encuadre. Las
            // que no, se cuentan y se dicen: esconderlas sin más dejaría al
            // interruptor «EXTENS.» encendido y sin efecto visible.
            const dentro = (v: number) => v >= suelo && v <= techo;
            const visibles = datos.niveles.filter((x2) => dentro(x2.precio));
            const fuera = datos.niveles.length - visibles.length;

            const i0 = cursor ?? n - 1;
            const vela = velas[i0];
            const sube = vela.c >= vela.o;
            const xCursor = cursor !== null ? x(cursor) : null;

            const iAlto =
              datos.impulso.iAltoSerie === null ? null : datos.impulso.iAltoSerie - recorte;
            const iBajo =
              datos.impulso.iBajoSerie === null ? null : datos.impulso.iBajoSerie - recorte;
            const altoVisible = iAlto !== null && iAlto >= 0 && iAlto < n;
            const bajoVisible = iBajo !== null && iBajo >= 0 && iBajo < n;

            const fecha = new Date(vela.t).toLocaleString('es-ES', {
              day: '2-digit',
              month: 'short',
              ...(controles.marco === '1d' || controles.marco === '1w'
                ? { year: 'numeric' }
                : { hour: '2-digit', minute: '2-digit' }),
            });

            /**
             * Posición de cada rótulo, separado del vecino.
             *
             * Se recorre de arriba abajo empujando hacia abajo el que quede
             * demasiado cerca, y después se hace la pasada inversa desde el
             * fondo: sin ella, un grupo apretado al final del panel se sale
             * por abajo. La LÍNEA nunca se mueve — sólo el rótulo, que es lo
             * único que se puede desplazar sin cambiar lo que dice.
             */
            const ordenados = [...visibles].sort((a1, a2) => y(a1.precio) - y(a2.precio));
            const yTextos = ordenados.map((nv) => y(nv.precio) + FUENTE_NIVEL / 3);
            for (let i = 1; i < yTextos.length; i += 1) {
              yTextos[i] = Math.max(yTextos[i], yTextos[i - 1] + SEPARACION_NIVEL);
            }
            const tope = ALTO - 2;
            for (let i = yTextos.length - 1; i > 0; i -= 1) {
              if (yTextos[i] > tope) yTextos[i] = tope;
              yTextos[i - 1] = Math.min(yTextos[i - 1], yTextos[i] - SEPARACION_NIVEL);
            }
            const colocados = ordenados.map((nv, i) => ({
              nivel: nv,
              yLinea: y(nv.precio),
              yTexto: Math.max(FUENTE_NIVEL, yTextos[i]),
            }));

            const alcista = datos.impulso.direccion === 'alcista';
            const tonoImpulso: Tone = alcista ? 'up' : 'down';
            const { fg: fgImpulso } = toneColors(palette, tonoImpulso);

            return (
              <View onLayout={medir} style={{ gap: 3 }}>
                {/* ---------- Avisos de sesgo, ARRIBA ---------- */}
                {datos.avisos.length ? (
                  <View
                    style={{
                      gap: 2,
                      padding: 5,
                      borderRadius: radius.xs,
                      borderWidth: hairline,
                      borderColor: colors.rule,
                      backgroundColor: colors.surfaceSunken,
                    }}
                  >
                    {datos.avisos.map((aviso, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 4 }}>
                        <Ionicons name="alert-circle-outline" size={11} color={colors.noSignal} />
                        <Text style={[T.micro, { color: colors.inkMuted, flex: 1 }]}>{aviso}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* ---------- Cabecera: la lectura del cursor ---------- */}
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 2,
                  }}
                >
                  <Text style={[T.datoFuerte, { color: colors.ink }]}>{simbolo}</Text>
                  <Text style={[T.micro, numeric, { color: colors.inkFaint }]}>{fecha}</Text>
                  {(
                    [
                      ['A', vela.o],
                      ['M', vela.h],
                      ['m', vela.l],
                      ['C', vela.c],
                    ] as const
                  ).map(([k, v]) => (
                    <View key={k} style={{ flexDirection: 'row', gap: 2, alignItems: 'baseline' }}>
                      <Text style={[T.micro, { color: colors.inkFaint }]}>{k}</Text>
                      <Cifra valor={cifra(v)} tono={sube ? 'up' : 'down'} escala="dato" />
                    </View>
                  ))}
                </View>

                <View
                  {...responder.panHandlers}
                  style={Platform.OS === 'web' ? ({ cursor: 'crosshair' } as any) : null}
                >
                  <Svg width={ancho} height={ALTO}>
                    {/* ---------- Niveles ----------
                        Soporte y resistencia con el mismo criterio del script:
                        por debajo del precio es soporte, por encima es
                        resistencia. Las extensiones van punteadas más finas
                        para no competir con los retrocesos. */}
                    {colocados.map(({ nivel, yLinea, yTexto }) => {
                      const color = nivel.papel === 'soporte' ? palette.up : palette.down;
                      const extension = nivel.tipo === 'extension';
                      // 0 y 1 son los extremos del tramo: se marcan más fuerte,
                      // porque son los únicos precios que de verdad ocurrieron.
                      const extremo = nivel.ratio === 0 || nivel.ratio === 1;
                      return (
                        <G key={nivel.etiqueta}>
                          <Line
                            x1={MARGEN.izq}
                            x2={ancho - MARGEN.der}
                            y1={yLinea}
                            y2={yLinea}
                            stroke={color}
                            strokeWidth={extremo ? 1.4 : 1}
                            strokeOpacity={extension ? 0.5 : extremo ? 0.95 : 0.75}
                            strokeDasharray={extension ? '2 4' : extremo ? undefined : '4 3'}
                          />
                          {/* Cuando el rótulo se ha tenido que apartar de su
                              línea, un guion corto los vuelve a unir. Sin él,
                              un «0.5» a diez píxeles de su línea se lee como
                              si marcara otro precio. */}
                          {Math.abs(yTexto - yLinea) > 1.5 ? (
                            <Line
                              x1={ancho - MARGEN.der}
                              y1={yLinea}
                              x2={ancho - MARGEN.der + 3}
                              y2={yTexto - 3}
                              stroke={color}
                              strokeWidth={0.8}
                              strokeOpacity={0.6}
                            />
                          ) : null}
                          <SvgText
                            x={ancho - MARGEN.der + 4}
                            y={yTexto}
                            fontSize={FUENTE_NIVEL}
                            fontWeight={extremo ? '700' : '600'}
                            fill={color}
                          >
                            {nivel.etiqueta}
                          </SvgText>
                        </G>
                      );
                    })}

                    {/* ---------- El tramo ----------
                        La diagonal del extremo antiguo al reciente. Sin ella,
                        siete horizontales no dicen de dónde salen. */}
                    {altoVisible && bajoVisible ? (
                      <G>
                        <Line
                          x1={x(iBajo as number)}
                          y1={y(datos.impulso.bajo)}
                          x2={x(iAlto as number)}
                          y2={y(datos.impulso.alto)}
                          stroke={fgImpulso}
                          strokeWidth={1.2}
                          strokeOpacity={0.65}
                          strokeDasharray="5 3"
                        />
                        <Circle
                          cx={x(iAlto as number)}
                          cy={y(datos.impulso.alto)}
                          r={2.6}
                          fill={fgImpulso}
                        />
                        <Circle
                          cx={x(iBajo as number)}
                          cy={y(datos.impulso.bajo)}
                          r={2.6}
                          fill={fgImpulso}
                        />
                      </G>
                    ) : null}

                    {/* ---------- Velas ---------- */}
                    {velas.map((v, i) => {
                      const alcista = v.c >= v.o;
                      const color = alcista ? palette.up : palette.down;
                      const cx = x(i);
                      const yA = y(Math.max(v.o, v.c));
                      const yB = y(Math.min(v.o, v.c));
                      return (
                        <G key={v.t}>
                          <Line
                            x1={cx}
                            x2={cx}
                            y1={y(v.h)}
                            y2={y(v.l)}
                            stroke={color}
                            strokeWidth={1}
                          />
                          <Rect
                            x={cx - anchoVela / 2}
                            y={yA}
                            width={anchoVela}
                            height={Math.max(1, yB - yA)}
                            fill={alcista ? 'transparent' : color}
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
                        y2={ALTO - MARGEN.inf}
                        stroke={colors.accent}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                    ) : null}
                  </Svg>

                  {/* Escala de precio fuera del SVG, para heredar la fuente */}
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', left: 0, top: 0, width: MARGEN.izq }}
                  >
                    {Array.from({ length: 5 }).map((_, i) => {
                      const v = techo - ((techo - suelo) * i) / 4;
                      return (
                        <Text
                          key={i}
                          style={[
                            T.micro,
                            numeric,
                            { color: colors.inkFaint, position: 'absolute', top: y(v) - 6, right: 3 },
                          ]}
                        >
                          {cifra(v)}
                        </Text>
                      );
                    })}
                  </View>
                </View>

                {/* ---------- Lectura del tramo ---------- */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 6,
                    paddingHorizontal: 2,
                  }}
                >
                  <Chip
                    texto={`impulso ${datos.impulso.direccion}`}
                    tono={tonoImpulso}
                    icono={datos.impulso.direccion === 'alcista' ? 'trending-up' : 'trending-down'}
                  />
                  <Chip texto={datos.actual.zona} tono={tonoZona(datos.actual.zona)} />
                  <Rotulo>Retroceso</Rotulo>
                  <Cifra
                    valor={`${(datos.actual.ratio * 100).toFixed(1)} %`}
                    tono={tonoZona(datos.actual.zona)}
                    escala="datoFuerte"
                  />
                  {!datos.ultimaVelaCerrada ? <Chip texto="Vela abierta" tono="caution" /> : null}
                </View>

                <Text style={[T.micro, { color: colors.inkFaint, paddingHorizontal: 2 }]}>
                  {/* En orden CRONOLÓGICO, no por precio: en un tramo bajista
                      el máximo es el más antiguo, y escribirlo al revés hacía
                      leer «26 ago a 30 jul». */}
                  Tramo{' '}
                  {cifra(alcista ? datos.impulso.bajo : datos.impulso.alto)} →{' '}
                  {cifra(alcista ? datos.impulso.alto : datos.impulso.bajo)} ·{' '}
                  {(alcista ? datos.impulso.fechaBajo : datos.impulso.fechaAlto).slice(0, 16)} a{' '}
                  {(alcista ? datos.impulso.fechaAlto : datos.impulso.fechaBajo).slice(0, 16)} ·{' '}
                  {datos.modo === 'pivotes'
                    ? `swing confirmado con pivotes de ±${datos.pivote} velas`
                    : `máximo y mínimo de las últimas ${datos.ventana} velas`}
                  . {velas.length} de {datos.barras} velas de {datos.marco.toUpperCase()}{' '}
                  dibujadas
                  {fuera > 0
                    ? `; ${fuera} ${fuera === 1 ? 'nivel queda' : 'niveles quedan'} fuera del encuadre`
                    : ''}
                  .
                </Text>
              </View>
            );
          })()
        )}
      </View>
    </Placa>
  );
}
