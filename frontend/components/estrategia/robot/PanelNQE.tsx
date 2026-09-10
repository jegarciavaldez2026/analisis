/**
 * ============================================================================
 * NQE — Newtonian Quant Engine
 * ============================================================================
 * Port del indicador de TradingView (Pine v2.1). El motor vive en
 * `backend/nqe.py` y lo sirve `/nqe/{ticker}`; aquí sólo se dibuja.
 *
 * Es un GRÁFICO, no una tabla, y usa el mismo lenguaje visual que
 * `GraficoMercado`: velas huecas al alza y macizas a la baja, rejilla de
 * pelo, escala de precio a la izquierda fuera del SVG, cursor compartido
 * entre paneles y `escala`/`trazo` con la misma firma. Es el mismo
 * instrumento en otra pestaña, no una segunda identidad.
 *
 * Dos paneles sobre el MISMO eje temporal:
 *
 *   PRECIO   velas + trailing de UT Bot + SuperTrend + VWAP + niveles del
 *            impulso y POC, y encima los triángulos de compra y venta.
 *   SCORE    el motor por dentro, con su banda de umbral. Es lo que hace que
 *            un triángulo se entienda: el disparo es el cruce de la línea
 *            fuera de la banda, no una decisión que sale de la nada.
 *
 * Sobre los triángulos apagados. El Pine dibuja como círculos grises las
 * señales que NO pasaron el gate estadístico, y aquí se conserva: verlas es
 * lo único que distingue «el indicador no ve nada» de «ve algo pero no está
 * demostrado». Nunca se leen como una orden, y por eso van huecas.
 *
 * Y el motivo de que los interruptores de filtrado estén en la propia
 * tarjeta: MEDIDO sobre 5.082 barras horarias de AAPL, TSLA y NVDA, el preset
 * «Equilibrado» —los tres filtros puestos— da CERO señales. No es un fallo
 * del port: el disparo exige un estallido de momento y el filtro de Fibonacci
 * exige estar a mitad de un retroceso, y las dos cosas casi nunca coinciden
 * en la misma barra. Son los mismos mandos del grupo «Módulos de filtrado»
 * del Pine, puestos al lado del embudo que explica el cero.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, { G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../../contexts/ThemeContext';
import { Tone, toneColors } from '../../../theme/tokens';
import {
  Bloque,
  ControlesNQE,
  MarcoNQE,
  NQE,
  PresetNQE,
} from '../../../lib/estrategia/tipos';
import { leerNQE } from '../../../lib/estrategia/api';
import { cifra, volumen as fmtVolumen } from '../../../lib/estrategia/formato';
import { Cargando, Chip, Cifra, Conmutador, Deslizador, Placa, rellenoTactil, Rotulo, SinFuente, T } from '../Terminal';

const MARCOS: readonly { clave: MarcoNQE; texto: string }[] = [
  { clave: '1h', texto: '1H' },
  { clave: '4h', texto: '4H' },
  { clave: '1d', texto: '1D' },
];

const PRESETS: readonly { clave: PresetNQE; texto: string }[] = [
  { clave: 'conservador', texto: 'CONS.' },
  { clave: 'equilibrado', texto: 'EQUIL.' },
  { clave: 'agresivo', texto: 'AGRES.' },
];

/** Filtros que deja puestos cada preset del Pine. */
const FILTROS_DEL_PRESET: Record<PresetNQE, { ut: boolean; st: boolean; fib: boolean }> = {
  conservador: { ut: true, st: true, fib: true },
  equilibrado: { ut: true, st: true, fib: true },
  agresivo: { ut: false, st: false, fib: false },
};

// Misma métrica que `GraficoMercado`: los dos gráficos tienen que alinearse a
// ojo cuando se miran uno debajo del otro.
const MARGEN = { izq: 46, der: 8, sup: 6, inf: 14 };
const ALTO_PRECIO_ESCRITORIO = 300;
const ALTO_PRECIO_COMPACTO = 210;
const ALTO_SCORE_ESCRITORIO = 74;
const ALTO_SCORE_COMPACTO = 58;

/** Escala lineal cerrada. Devuelve el centro si el dominio es degenerado. */
function escala(min: number, max: number, desde: number, hasta: number) {
  const d = max - min;
  if (!Number.isFinite(d) || d === 0) return () => (desde + hasta) / 2;
  return (v: number) => hasta - ((v - min) / d) * (hasta - desde);
}

/** Polilínea que se corta en los `null`, para no unir tramos sin dato. */
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

/**
 * Trazo en ESCALERA para el trailing de UT Bot y el SuperTrend.
 *
 * Los dos son niveles que se mantienen y saltan, no curvas: unirlos con una
 * diagonal dibuja una transición que nunca existió y, en el salto de un giro,
 * hace parecer que el nivel pasó por precios intermedios.
 */
function escalera(
  valores: (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = '';
  let previo: number | null = null;
  for (let i = 0; i < valores.length; i += 1) {
    const v = valores[i];
    if (v === null || !Number.isFinite(v)) {
      previo = null;
      continue;
    }
    if (previo === null) {
      d += `M${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    } else {
      d += `L${x(i).toFixed(2)},${y(previo).toFixed(2)}L${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    }
    previo = v;
  }
  return d;
}

function pct(v: number | null | undefined, decimales = 1): string | null {
  return v === null || v === undefined || !Number.isFinite(v)
    ? null
    : `${(v * 100).toFixed(decimales)} %`;
}

/* ==========================================================================
 * Interruptor de filtro
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
 * Leyenda — sin ella, cinco trazos de colores son un adorno
 * ======================================================================== */

function Muestra({ color, texto, discontinua }: { color: string; texto: string; discontinua?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <View
        style={{
          width: 12,
          height: 0,
          borderTopWidth: 2,
          borderTopColor: color,
          borderStyle: discontinua ? 'dashed' : 'solid',
        }}
      />
      <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
        {texto}
      </Text>
    </View>
  );
}

/* ==========================================================================
 * Tarjeta
 * ======================================================================== */

export default function PanelNQE({ simbolo, compacto }: { simbolo: string; compacto?: boolean }) {
  const { colors, palette, hairline, numeric, radius } = useTheme();

  const [controles, setControles] = useState<ControlesNQE>({
    marco: '1h',
    preset: 'equilibrado',
    usarUT: true,
    usarST: true,
    usarFib: true,
    gateEstricto: true,
  });
  const [bloque, setBloque] = useState<Bloque<NQE>>({
    datos: null,
    procedencia: 'proxy',
    nota: 'Cargando…',
  });
  const [cargando, setCargando] = useState(true);
  /** Dibujar los «Buy»/«Sell» de UT Bot. VISUAL, no el filtro: se pueden ver
   *  sus cruces aunque no se use como filtro de la señal compuesta, y al
   *  revés. */
  const [verUT, setVerUT] = useState(true);
  const [ancho, setAncho] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const peticion = useRef(0);

  const altoPrecio = compacto ? ALTO_PRECIO_COMPACTO : ALTO_PRECIO_ESCRITORIO;
  const altoScore = compacto ? ALTO_SCORE_COMPACTO : ALTO_SCORE_ESCRITORIO;

  const medir = useCallback((e: LayoutChangeEvent) => {
    setAncho((previo) => {
      const w = e.nativeEvent.layout.width;
      return Math.abs(previo - w) > 1 ? w : previo;
    });
  }, []);

  const cambiarPreset = useCallback((preset: PresetNQE) => {
    const f = FILTROS_DEL_PRESET[preset];
    setControles((prev) => ({ ...prev, preset, usarUT: f.ut, usarST: f.st, usarFib: f.fib }));
  }, []);

  useEffect(() => {
    const id = (peticion.current += 1);
    let vivo = true;
    setCargando(true);
    leerNQE(simbolo, controles).then((b) => {
      // Una respuesta vieja no puede pisar a la nueva: cambiar de marco tres
      // veces seguidas lanza tres peticiones y sólo vale la última.
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
  const velas = datos?.serie.barras ?? [];
  const anchoTrazado = Math.max(0, ancho - MARGEN.izq - MARGEN.der);

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

  const tono: Tone = (datos?.senal.tono ?? 'neutral') as Tone;
  const { fg } = toneColors(palette, tono);

  return (
    <Placa
      titulo={`NQE · ${simbolo}`}
      procedencia={bloque.procedencia}
      sinAire
      derecha={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {cargando ? <Rotulo>···</Rotulo> : null}
          <Conmutador
            compacto
            opciones={MARCOS}
            activa={controles.marco}
            onChange={(marco) => setControles((prev) => ({ ...prev, marco }))}
          />
        </View>
      }
    >
      <View style={{ padding: 6, gap: 5 }}>
        {/* ---------- Mandos ---------- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Conmutador compacto opciones={PRESETS} activa={controles.preset} onChange={cambiarPreset} />
          <Interruptor
            texto="UT BOT"
            activo={controles.usarUT}
            ayuda="Filtro de tendencia rápida"
            onPress={() => setControles((p) => ({ ...p, usarUT: !p.usarUT }))}
          />
          <Interruptor
            texto="SUPERTREND"
            activo={controles.usarST}
            ayuda="Filtro de estructura lenta"
            onPress={() => setControles((p) => ({ ...p, usarST: !p.usarST }))}
          />
          <Interruptor
            texto="FIBONACCI"
            activo={controles.usarFib}
            ayuda="Sólo retrocesos sanos dentro de un impulso vivo"
            onPress={() => setControles((p) => ({ ...p, usarFib: !p.usarFib }))}
          />
          <Interruptor
            texto="GATE"
            activo={controles.gateEstricto}
            ayuda="Exige que la señal esté demostrada estadísticamente"
            onPress={() => setControles((p) => ({ ...p, gateEstricto: !p.gateEstricto }))}
          />
          <Interruptor
            texto="BUY/SELL UT"
            activo={verUT}
            ayuda="Dibuja los cruces de UT Bot Alerts sobre el precio"
            onPress={() => setVerUT((v) => !v)}
          />
        </View>

        {/* Los dos mandos de «UT Bot Alerts». Son lo ÚNICO que cambia su
            sensibilidad, así que un «Buy» sin saber con qué valores salió no
            se puede comparar con otro: van a la vista, no en un menú. */}
        {verUT ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Deslizador
                etiqueta="UT · sensibilidad"
                valor={controles.utKey ?? 1}
                min={0.5}
                max={5}
                paso={0.5}
                decimales={1}
                onChange={(v) => setControles((p) => ({ ...p, utKey: v }))}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Deslizador
                etiqueta="UT · ATR"
                valor={controles.utLen ?? 10}
                min={2}
                max={30}
                paso={1}
                onChange={(v) => setControles((p) => ({ ...p, utLen: v }))}
              />
            </View>
          </View>
        ) : null}

        {cargando && !datos ? (
          <Cargando filas={8} />
        ) : !datos ? (
          <SinFuente
            titulo="El indicador no se pudo calcular"
            motivo={bloque.nota ?? 'Sin respuesta del backend.'}
            compacto
          />
        ) : velas.length === 0 || ancho <= 0 ? (
          // Primer render: aún no se ha medido el ancho. Se reserva el hueco
          // para que la placa no salte cuando llegue.
          <View onLayout={medir} style={{ height: altoPrecio }} />
        ) : (
          (() => {
            const s = datos.serie;
            const utVisible = verUT;
            const n = velas.length;
            const paso = anchoTrazado / Math.max(1, n);
            const anchoVela = Math.max(1, Math.min(9, paso * 0.68));
            const x = (i: number) => MARGEN.izq + paso * (i + 0.5);

            /* ---------- Escala de precio ----------
               Entran también las líneas del indicador y los niveles del
               impulso: si se escala sólo con las velas, un SuperTrend a tres
               ATR de distancia se sale del panel y desaparece sin avisar. */
            const candidatos: number[] = [];
            velas.forEach((v) => {
              candidatos.push(v.h, v.l);
            });
            [s.utStop, s.superTrend, s.vwap].forEach((linea) =>
              linea.forEach((v) => {
                if (v !== null && Number.isFinite(v)) candidatos.push(v);
              }),
            );
            [s.fib382, s.fib500, s.fib618, s.poc].forEach((v) => {
              if (v !== null && Number.isFinite(v)) candidatos.push(v);
            });
            const maxP = Math.max(...candidatos);
            const minP = Math.min(...candidatos);
            const colchon = (maxP - minP) * 0.05 || 1;
            const techo = maxP + colchon;
            const suelo = minP - colchon;
            const yPrecio = escala(suelo, techo, MARGEN.sup, altoPrecio - MARGEN.inf);

            /* ---------- Escala del score ----------
               Simétrica alrededor de cero a propósito: el umbral es ±el mismo
               número, y con una escala asimétrica la banda se vería torcida y
               parecería que comprar y vender piden esfuerzos distintos. */
            const valoresScore = [...s.score, ...s.umbral].filter(
              (v): v is number => v !== null && Number.isFinite(v),
            );
            const extremoScore = Math.max(...valoresScore.map(Math.abs), 0.05) * 1.15;
            const yScore = escala(-extremoScore, extremoScore, 4, altoScore - 4);

            const i0 = cursor ?? n - 1;
            const vela = velas[i0];
            const xCursor = cursor !== null ? x(cursor) : null;
            const subeVela = vela.c >= vela.o;
            const fecha = new Date(vela.t).toLocaleString('es-ES', {
              day: '2-digit',
              month: 'short',
              ...(datos.marco === '1d' ? { year: 'numeric' } : { hour: '2-digit', minute: '2-digit' }),
            });

            const rejilla = 4;
            const marcaCursor =
              cursor !== null ? s.marcas.find((m) => m.i === cursor) ?? null : null;

            /** Triángulo de señal, apoyado fuera de la mecha. */
            const triangulo = (cx: number, cy: number, arriba: boolean) => {
              const t = 6;
              return arriba
                ? `${cx},${cy - t} ${cx - t},${cy + t * 0.8} ${cx + t},${cy + t * 0.8}`
                : `${cx},${cy + t} ${cx - t},${cy - t * 0.8} ${cx + t},${cy - t * 0.8}`;
            };

            return (
              <View onLayout={medir} style={{ gap: 3 }}>
                {/* ---------- Cabecera OHLC: la lectura del cursor ---------- */}
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
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
                      <Cifra valor={cifra(v)} tono={subeVela ? 'up' : 'down'} escala="dato" />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 2, alignItems: 'baseline' }}>
                    <Text style={[T.micro, { color: colors.inkFaint }]}>Vol</Text>
                    <Cifra valor={fmtVolumen(vela.v)} escala="dato" />
                  </View>
                  {/* Al pasar por una señal, sus tres números salen aquí: es
                      la pregunta inmediata al ver un triángulo. */}
                  {marcaCursor ? (
                    <Chip
                      texto={`${marcaCursor.direccion} · obj ${cifra(marcaCursor.objetivo)} · stop ${cifra(marcaCursor.stop)} · ${marcaCursor.resultado}`}
                      tono={marcaCursor.direccion === 'compra' ? 'up' : 'down'}
                    />
                  ) : null}
                </View>

                <View
                  {...responder.panHandlers}
                  style={Platform.OS === 'web' ? ({ cursor: 'crosshair' } as any) : null}
                >
                  {/* ================= PRECIO ================= */}
                  <Svg width={ancho} height={altoPrecio}>
                    {Array.from({ length: rejilla + 1 }).map((_, i) => {
                      const yy = yPrecio(suelo + ((techo - suelo) * i) / rejilla);
                      return (
                        <Line
                          key={i}
                          x1={MARGEN.izq}
                          x2={ancho - MARGEN.der}
                          y1={yy}
                          y2={yy}
                          stroke={colors.rule}
                          strokeWidth={hairline}
                        />
                      );
                    })}

                    {/* Niveles del impulso vigente y POC: horizontales, por
                        debajo de las velas para no taparlas. */}
                    {([
                      [s.fib382, '0.382', 0.55],
                      [s.fib500, '0.5', 0.75],
                      [s.fib618, '0.618', 1],
                    ] as const).map(([nivel, clave, opacidad]) =>
                      nivel !== null ? (
                        <Line
                          key={clave}
                          x1={MARGEN.izq}
                          x2={ancho - MARGEN.der}
                          y1={yPrecio(nivel)}
                          y2={yPrecio(nivel)}
                          stroke={palette.accent}
                          strokeOpacity={opacidad * 0.5}
                          strokeWidth={1}
                          strokeDasharray="2 4"
                        />
                      ) : null,
                    )}
                    {s.poc !== null ? (
                      <Line
                        x1={MARGEN.izq}
                        x2={ancho - MARGEN.der}
                        y1={yPrecio(s.poc)}
                        y2={yPrecio(s.poc)}
                        stroke={colors.inkFaint}
                        strokeWidth={1}
                        strokeDasharray="6 3"
                      />
                    ) : null}

                    {/* VWAP: identidad de serie, no dirección. */}
                    <Path d={trazo(s.vwap, x, yPrecio)} stroke={colors.inkFaint} strokeWidth={1.1} fill="none" />
                    {/* UT Bot y SuperTrend en escalera: son niveles, no curvas. */}
                    <Path
                      d={escalera(s.utStop, x, yPrecio)}
                      stroke={palette.caution}
                      strokeWidth={1.1}
                      fill="none"
                      strokeOpacity={datos.utBot.activo ? 0.95 : 0.3}
                    />
                    <Path
                      d={escalera(s.superTrend, x, yPrecio)}
                      stroke={palette.accent}
                      strokeWidth={1.6}
                      fill="none"
                      strokeOpacity={datos.superTrend.activo ? 0.95 : 0.3}
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

                    {/* ---------- Señales de compra y venta ----------
                        Validada: triángulo macizo. Bloqueada por el gate:
                        hueco. El Pine las dibuja como círculos grises y aquí
                        se conserva la distinción, porque una señal no
                        demostrada NO es una orden. */}
                    {s.marcas.map((m) => {
                      const compra = m.direccion === 'compra';
                      const v = velas[m.i];
                      const color = compra ? palette.up : palette.down;
                      const cy = compra ? yPrecio(v.l) + 11 : yPrecio(v.h) - 11;
                      return (
                        <Polygon
                          key={`${m.i}-${m.direccion}`}
                          points={triangulo(x(m.i), cy, compra)}
                          fill={color}
                          fillOpacity={m.validada ? 1 : 0.16}
                          stroke={color}
                          strokeWidth={1.4}
                        />
                      );
                    })}

                    {/* ---------- UT Bot: etiquetas «Buy» / «Sell» ----------
                        Son las de «UT Bot Alerts» (Pine v4) y NO son la señal
                        del NQE: aquí sólo se cruza el precio con su trailing
                        stop. Van con forma y texto distintos —cartel, no
                        triángulo— para que no se confundan con la señal
                        compuesta ni un segundo. La regla del producto es que
                        ningún módulo aislado ordena una operación. */}
                    {utVisible
                      ? s.utMarcas.map((m) => {
                          const compra = m.tipo === 'buy';
                          const color = compra ? palette.up : palette.down;
                          const v = velas[m.i];
                          const cy = compra ? yPrecio(v.l) + 20 : yPrecio(v.h) - 20;
                          const ancho = 20;
                          const alto = 11;
                          const cx = x(m.i);
                          return (
                            <G key={`ut-${m.i}`}>
                              {/* Rabito que apunta a la vela: sin él, el
                                  cartel flota y no se sabe a cuál pertenece. */}
                              <Line
                                x1={cx}
                                x2={cx}
                                y1={compra ? cy - alto / 2 : cy + alto / 2}
                                y2={compra ? yPrecio(v.l) + 2 : yPrecio(v.h) - 2}
                                stroke={color}
                                strokeWidth={1}
                              />
                              <Rect
                                x={cx - ancho / 2}
                                y={cy - alto / 2}
                                width={ancho}
                                height={alto}
                                rx={2}
                                fill={color}
                              />
                              <SvgText
                                x={cx}
                                y={cy + 3.5}
                                fontSize={8}
                                fontWeight="700"
                                fill={colors.surface}
                                textAnchor="middle"
                              >
                                {compra ? 'Buy' : 'Sell'}
                              </SvgText>
                            </G>
                          );
                        })
                      : null}

                    {xCursor !== null ? (
                      <Line
                        x1={xCursor}
                        x2={xCursor}
                        y1={MARGEN.sup}
                        y2={altoPrecio - MARGEN.inf}
                        stroke={colors.accent}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                    ) : null}

                    {/* ---------- Cinta de posición de UT Bot ----------
                        El script pinta las velas de verde o rojo según de qué
                        lado del trailing esté el precio (`barcolor`). Aquí no
                        se recolorean: en este producto el verde y el rojo de
                        una vela significan cierre contra apertura, y pisarlos
                        rompería esa lectura en todo el terminal. La misma
                        información va en una cinta al pie, que además deja
                        ver de un vistazo cuánto dura cada tramo.
                        Vale 0 hasta el primer cruce y ahí no se pinta nada:
                        dibujar «largo» desde la primera barra sería inventar
                        una entrada que nunca ocurrió. */}
                    {utVisible
                      ? s.utPos.map((pos, i) =>
                          pos === 0 ? null : (
                            <Rect
                              key={`pos-${i}`}
                              x={x(i) - paso / 2}
                              y={altoPrecio - MARGEN.inf + 3}
                              width={Math.max(paso, 1)}
                              height={3}
                              fill={pos === 1 ? palette.up : palette.down}
                              fillOpacity={0.55}
                            />
                          ),
                        )
                      : null}
                  </Svg>

                  {/* Escala de precio fuera del SVG, para heredar la fuente */}
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', left: 0, top: 0, width: MARGEN.izq }}
                  >
                    {Array.from({ length: rejilla + 1 }).map((_, i) => {
                      const v = techo - ((techo - suelo) * i) / rejilla;
                      return (
                        <Text
                          key={i}
                          style={[
                            T.micro,
                            numeric,
                            { color: colors.inkFaint, position: 'absolute', top: yPrecio(v) - 6, right: 4 },
                          ]}
                        >
                          {cifra(v)}
                        </Text>
                      );
                    })}
                  </View>

                  {/* ================= SCORE ================= */}
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}
                  >
                    <Rotulo>Score</Rotulo>
                    <Cifra valor={cifra(s.score[i0])} escala="micro" />
                    <Rotulo>Umbral ±</Rotulo>
                    <Cifra valor={cifra(s.umbral[i0])} escala="micro" />
                    <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
                      percentil móvil de 500 barras
                    </Text>
                  </View>
                  <Svg width={ancho} height={altoScore}>
                    {/* La banda del umbral. El disparo es SALIR de ella. */}
                    <Path
                      d={`${trazo(s.umbral, x, yScore)}`}
                      stroke={colors.inkFaint}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      fill="none"
                    />
                    <Path
                      d={`${trazo(s.umbral.map((v) => (v === null ? null : -v)), x, yScore)}`}
                      stroke={colors.inkFaint}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      fill="none"
                    />
                    <Line
                      x1={MARGEN.izq}
                      x2={ancho - MARGEN.der}
                      y1={yScore(0)}
                      y2={yScore(0)}
                      stroke={colors.rule}
                      strokeWidth={hairline}
                    />
                    <Path d={trazo(s.score, x, yScore)} stroke={palette.accent} strokeWidth={1.3} fill="none" />
                    {s.marcas.map((m) => (
                      <Line
                        key={`sc-${m.i}-${m.direccion}`}
                        x1={x(m.i)}
                        x2={x(m.i)}
                        y1={4}
                        y2={altoScore - 4}
                        stroke={m.direccion === 'compra' ? palette.up : palette.down}
                        strokeWidth={1}
                        strokeOpacity={m.validada ? 0.6 : 0.3}
                      />
                    ))}
                    {xCursor !== null ? (
                      <Line
                        x1={xCursor}
                        x2={xCursor}
                        y1={4}
                        y2={altoScore - 4}
                        stroke={colors.accent}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                    ) : null}
                  </Svg>
                </View>

                {/* ---------- Sin señales en la ventana ----------
                    Un gráfico sin un solo triángulo se lee como una tarjeta
                    rota, y con la configuración por defecto es el caso
                    NORMAL. Se dice aquí, encima, y se nombra la causa
                    concreta y el mando que la deshace. */}
                {s.marcas.length === 0 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 4,
                      padding: 5,
                      borderRadius: radius.xs,
                      borderWidth: hairline,
                      borderStyle: 'dashed',
                      borderColor: colors.rule,
                      backgroundColor: colors.surfaceSunken,
                    }}
                  >
                    <Ionicons name="remove-circle-outline" size={11} color={colors.noSignal} />
                    <Text style={[T.micro, { color: colors.inkMuted, flex: 1 }]}>
                      {datos.embudo.trasFiltros === 0
                        ? `Sin señal COMPUESTA del NQE en todo el histórico: ${datos.embudo.conFlujoYLiquidez} cruces con flujo y liquidez, y los filtros los descartaron todos.${controles.usarFib ? ' Fibonacci es el que más recorta — apágalo arriba para verlo.' : ''}${verUT && s.utMarcas.length ? ` Los ${s.utMarcas.length} carteles Buy/Sell del gráfico son de UT Bot, que es un módulo suelto: no son la señal del motor.` : ''}`
                        : `${datos.embudo.trasFiltros} ${datos.embudo.trasFiltros === 1 ? 'señal' : 'señales'} en ${datos.barras} barras, pero ninguna cae en las ${velas.length} dibujadas. Amplía el marco a 4H o 1D para abarcar más historia.`}
                    </Text>
                  </View>
                ) : null}

                {/* ---------- Leyenda ---------- */}
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                    paddingHorizontal: 2,
                    paddingTop: 1,
                  }}
                >
                  <Muestra color={palette.accent} texto="SuperTrend" />
                  <Muestra color={palette.caution} texto="UT Bot" />
                  <Muestra color={colors.inkFaint} texto="VWAP" />
                  <Muestra color={colors.inkFaint} texto="POC" discontinua />
                  {s.fib618 !== null ? (
                    <Muestra color={palette.accent} texto="Fib 0.382 / 0.5 / 0.618" discontinua />
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="caret-up" size={11} color={palette.up} />
                    <Ionicons name="caret-down" size={11} color={palette.down} />
                    <Text style={[T.micro, { color: colors.inkFaint }]}>
                      señal NQE · macizo = validado, hueco = bloqueado por el gate
                    </Text>
                  </View>
                  {utVisible ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <View
                        style={{
                          paddingHorizontal: 3,
                          paddingVertical: 1,
                          borderRadius: 2,
                          backgroundColor: palette.up,
                        }}
                      >
                        <Text style={{ fontSize: 8, fontWeight: '700', color: colors.surface }}>
                          Buy
                        </Text>
                      </View>
                      <Text style={[T.micro, { color: colors.inkFaint }]}>
                        cruce de UT Bot · cinta al pie = posición sostenida
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* ---------- Veredicto y embudo ---------- */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 6,
                    paddingHorizontal: 2,
                  }}
                >
                  <Text style={[T.datoFuerte, { color: fg }]} numberOfLines={1}>
                    {datos.senal.texto}
                  </Text>
                  <Chip
                    texto={datos.regimen.estado === 'tendencia' ? 'Tendencia' : 'Rango'}
                    tono={datos.regimen.estado === 'tendencia' ? 'accent' : 'caution'}
                  />
                  <Chip texto={datos.estructura.zona} tono={datos.estructura.zona === 'impulso roto' ? 'down' : 'neutral'} />
                  {!datos.ultimaVelaCerrada ? <Chip texto="Vela abierta" tono="caution" /> : null}
                  {datos.senal.objetivo !== null ? (
                    <>
                      <Rotulo>Obj</Rotulo>
                      <Cifra valor={cifra(datos.senal.objetivo)} tono={tono} escala="dato" />
                      <Rotulo>Stop</Rotulo>
                      <Cifra valor={cifra(datos.senal.stop)} escala="dato" />
                    </>
                  ) : null}
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 6,
                    paddingHorizontal: 2,
                  }}
                >
                  <Rotulo>Embudo</Rotulo>
                  <Text style={[T.dato, numeric, { color: colors.inkMuted }]} numberOfLines={1}>
                    {datos.embudo.cruces} → {datos.embudo.conFlujoYLiquidez} →{' '}
                    {datos.embudo.trasFiltros} →{' '}
                    <Text style={{ color: datos.embudo.validadas ? palette.up : colors.noSignal }}>
                      {datos.embudo.validadas}
                    </Text>
                  </Text>
                  <Rotulo>UT Bot</Rotulo>
                  <Text style={[T.micro, numeric, { color: colors.inkMuted }]} numberOfLines={1}>
                    {datos.utBot.compras ?? 0} buy · {datos.utBot.ventas ?? 0} sell en{' '}
                    {datos.barras} barras · key {datos.utBot.keyValue ?? 1} · ATR{' '}
                    {datos.utBot.atrPeriodo ?? 10} ·{' '}
                    <Text
                      style={{
                        color:
                          datos.utBot.posicion === 1
                            ? palette.up
                            : datos.utBot.posicion === -1
                              ? palette.down
                              : colors.noSignal,
                      }}
                    >
                      {datos.utBot.posicion === 1
                        ? 'largo'
                        : datos.utBot.posicion === -1
                          ? 'corto'
                          : 'sin posición'}
                    </Text>
                  </Text>
                  <Rotulo>Gate</Rotulo>
                  <Text style={[T.micro, numeric, { color: colors.inkMuted }]} numberOfLines={1}>
                    L n={datos.gate.largo.muestra} LB {pct(datos.gate.largo.wilson)} · C n=
                    {datos.gate.corto.muestra} LB {pct(datos.gate.corto.wilson)} · pide{' '}
                    {pct(datos.gate.umbralWilson, 0)}
                  </Text>
                </View>

                {/* ---------- Avisos ---------- */}
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

                <Text style={[T.micro, { color: colors.inkFaint, paddingHorizontal: 2 }]}>
                  {velas.length} de {datos.barras} barras de {datos.marco.toUpperCase()} dibujadas ·
                  objetivo y stop simétricos a {datos.senal.riesgoATR}× ATR. {datos.notaOFI}
                </Text>
              </View>
            );
          })()
        )}
      </View>
    </Placa>
  );
}
