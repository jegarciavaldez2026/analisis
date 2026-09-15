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
 * · **Sesiones de Londres y Nueva York**, port del «Trading Sessions» del
 *   usuario (cálculo y sesgos corregidos en `lib/estrategia/sesiones.ts`).
 *   La caja y la franja apertura→cierre van DEBAJO de las velas; el VWAP y el
 *   POC de cada sesión, encima de las velas pero debajo de las operaciones: el
 *   contexto no puede tapar la entrada ni el stop. Sólo en 1m–1H.
 *
 * Si no hay ninguna operación, la tarjeta no se dibuja en blanco: dice que no
 * hay ninguna y qué hacer. Un gráfico vacío se lee como un gráfico roto.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect } from 'react-native-svg';

import { useTheme } from '../../../contexts/ThemeContext';
import { seriesColor } from '../../../theme/tokens';
import { Bloque, SerieMercado } from '../../../lib/estrategia/tipos';
import { cifra, dinero } from '../../../lib/estrategia/formato';
import { calcularSesiones, FILAS_POC, marcoAdmiteSesiones, TramoSesion } from '../../../lib/estrategia/sesiones';
import { OrdenSim, TarjetaSim } from '../../../lib/simulacion/tipos';
import { Chip, ConDatos, Conmutador, Placa, Rotulo, T } from '../Terminal';

/** Misma métrica que el resto de gráficos del terminal. */
const MARGEN = { izq: 46, der: 54, sup: 8, inf: 16 };
/** Ancho mínimo legible de una vela. Por debajo, el cuerpo desaparece. */
const ANCHO_MIN_VELA = 3;
const ALTO = 250;
const ALTO_COMPACTO = 190;

type VistaSesiones = 'ambas' | 'londres' | 'nuevayork' | 'ninguna';
const OPCIONES_SESIONES = [
  { clave: 'ambas', texto: 'LON + NY' },
  { clave: 'londres', texto: 'LON' },
  { clave: 'nuevayork', texto: 'NY' },
  { clave: 'ninguna', texto: 'NINGUNA' },
] as const;
/** Ámbar para Londres —el naranja del script— e índigo para Nueva York. El
 *  verde que el script da a Nueva York se descarta: aquí verde es vela alcista. */
const INDICE_COLOR_SESION: Record<string, number> = { londres: 1, nuevayork: 2 };

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
  const { colors, palette, hairline, numeric, isDark } = useTheme();
  const [ancho, setAncho] = useState(0);
  const [vistaSesiones, setVistaSesiones] = useState<VistaSesiones>('ambas');
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
          const etiquetas: { y: number; texto: string; color: string; tenue?: boolean; prioridad: number }[] = [];
          const anotar = (valor: number, texto: string, color: string, tenue?: boolean, prioridad = 0) => {
            etiquetas.push({ y: y(valor), texto, color, tenue, prioridad });
          };

          /* ---------- Sesiones ---------- */
          const conSesiones = marcoAdmiteSesiones(datos.marco);
          /** Las velas dibujadas son la cola de `todas`: índice dibujado = índice real − desfase. */
          const desfase = todas.length - velas.length;
          const tramos: (TramoSesion & { a: number; b: number })[] =
            conSesiones && dibujable && vistaSesiones !== 'ninguna'
              ? calcularSesiones(todas)
                  .filter((t) => vistaSesiones === 'ambas' || t.clave === vistaSesiones)
                  .filter((t) => t.i1 >= desfase)
                  .map((t) => ({ ...t, a: Math.max(0, t.i0 - desfase), b: t.i1 - desfase }))
              : [];
          const colorSesion = (clave: string) => seriesColor(isDark, INDICE_COLOR_SESION[clave] ?? 0);
          /**
           * La escala NO se amplía por las sesiones: la fijan velas y operaciones.
           * Una sesión recortada por la izquierda puede tener su máximo en una
           * vela que no se ve, y ampliar por ella aplastaría las velas que sí.
           * Se sujeta al área del trazado.
           */
          const yDentro = (v: number) => Math.min(alto - MARGEN.inf, Math.max(MARGEN.sup, y(v)));
          const ultimas = (['londres', 'nuevayork'] as const)
            .map((k) => tramos.filter((t) => t.clave === k).at(-1))
            .filter((t): t is TramoSesion & { a: number; b: number } => !!t);
          for (const t of ultimas) {
            const vw = t.vwap[t.vwap.length - 1];
            // Prioridad baja: si choca con la etiqueta de una entrada o un stop, cede ella.
            if (vw !== null) anotar(vw, `V ${cifra(vw, 2) ?? ''}`, colorSesion(t.clave), false, 1);
            if (t.poc !== null) anotar(t.poc, `P ${cifra(t.poc, 2) ?? ''}`, colorSesion(t.clave), true, 1);
          }
          const sinVolumen = tramos.length > 0 && tramos.every((t) => t.volumen <= 0);
          const londresRecortada = ultimas.some(
            (t) => t.clave === 'londres' && !t.enCurso && t.barras < t.esperadas,
          );

          return (
            <View onLayout={medir} style={{ gap: 4 }}>
              {conSesiones ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Rotulo>Sesiones</Rotulo>
                  <Conmutador
                    opciones={OPCIONES_SESIONES}
                    activa={vistaSesiones}
                    onChange={setVistaSesiones}
                    compacto
                  />
                </View>
              ) : (
                <Text style={[T.micro, { color: colors.noSignal, lineHeight: 13 }]}>
                  Las sesiones de Londres y Nueva York, con su VWAP y su POC, sólo se dibujan en 1m, 5m,
                  15m, 30m y 1H. Estas velas son de {datos.marco}: cambia el marco en el gráfico de
                  mercado.
                </Text>
              )}
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

                    {/* ---------- Sesiones: caja y franja apertura→cierre, DEBAJO de las velas ---------- */}
                    {tramos.map((t) => {
                      const tinta = colorSesion(t.clave);
                      const xa = x(t.a) - paso / 2;
                      const anchoCaja = Math.max(1, x(t.b) - x(t.a) + paso);
                      const yMax = yDentro(t.maximo);
                      const yMin = yDentro(t.minimo);
                      const yAbre = yDentro(t.apertura);
                      const yCierra = yDentro(t.cierre);
                      return (
                        <G key={`s-${t.clave}-${t.dia}`}>
                          <Rect x={xa} y={yMax} width={anchoCaja} height={Math.max(1, yMin - yMax)} fill={tinta} fillOpacity={0.07} />
                          {/* El `linefill` del script entre apertura y cierre */}
                          <Rect
                            x={xa}
                            y={Math.min(yAbre, yCierra)}
                            width={anchoCaja}
                            height={Math.max(1, Math.abs(yCierra - yAbre))}
                            fill={tinta}
                            fillOpacity={0.1}
                          />
                          <Nivel y={yAbre} x0={xa} x1={xa + anchoCaja} color={tinta} discontinuo opacidad={0.6} />
                          <Nivel y={yCierra} x0={xa} x1={xa + anchoCaja} color={tinta} discontinuo opacidad={0.6} />
                        </G>
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

                    {/* ---------- VWAP y POC de sesión: sobre las velas, bajo las operaciones ---------- */}
                    {tramos.map((t) => {
                      const tinta = colorSesion(t.clave);
                      // Acumulado barra a barra: en cada vela, el VWAP que había entonces.
                      let d = '';
                      t.vwap.forEach((v, k) => {
                        const i = t.i0 + k - desfase;
                        if (v === null || i < 0) return;
                        d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${yDentro(v).toFixed(1)}`;
                      });
                      return (
                        <G key={`vp-${t.clave}-${t.dia}`}>
                          {d ? <Path d={d} stroke={tinta} strokeWidth={1.3} fill="none" /> : null}
                          {t.poc !== null ? (
                            <Nivel
                              y={yDentro(t.poc)}
                              x0={x(t.a) - paso / 2}
                              x1={x(t.b) + paso / 2}
                              color={tinta}
                              punteado
                              grosor={2}
                            />
                          ) : null}
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
                    // Primero las de las operaciones; las de sesión sólo si caben.
                    .sort((a, b) => a.prioridad - b.prioridad || a.y - b.y)
                    .filter(function (this: typeof etiquetas, e) {
                      if (this.some((p) => Math.abs(p.y - e.y) < 11)) return false;
                      this.push(e);
                      return true;
                    }, [] as typeof etiquetas)
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
                  {/* Nombre de la sesión: Londres encima de su caja, Nueva York
                      debajo. En acciones las dos empiezan en la misma vela y
                      en el mismo sitio se pisarían. */}
                  {tramos.map((t) => {
                    if (x(t.b) - x(t.a) + paso < 22) return null;
                    const arriba = t.clave === 'londres';
                    return (
                      <Text
                        key={`n-${t.clave}-${t.dia}`}
                        style={[
                          T.micro,
                          {
                            position: 'absolute',
                            left: x(t.a) - paso / 2 + 2,
                            top: arriba
                              ? Math.max(0, yDentro(t.maximo) - 11)
                              : Math.min(alto - 11, yDentro(t.minimo) + 1),
                            color: colorSesion(t.clave),
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {t.corto}
                      </Text>
                    );
                  })}
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
                    ...(tramos.length
                      ? ([
                          ['▭  sesión LON / NY', colors.inkMuted],
                          ['──  VWAP de sesión (V)', colors.inkMuted],
                          ['▪▪▪  POC de sesión (P)', colors.inkMuted],
                        ] as const)
                      : []),
                  ] as const
                ).map(([texto, color]) => (
                  <Text key={texto} style={[T.micro, { color }]}>
                    {texto}
                  </Text>
                ))}
              </View>

              {/* ---------- Última sesión de cada plaza ----------
                  El recorrido va en precio y en %: Yahoo no da el tamaño de
                  tick, que es lo que usaba el script. */}
              {ultimas.map((t) => {
                const vw = t.vwap[t.vwap.length - 1];
                const precio = todas[todas.length - 1]?.c;
                const rango = t.maximo - t.minimo;
                return (
                  <Text key={`r-${t.clave}`} style={[T.micro, numeric, { color: colors.inkMuted, lineHeight: 13 }]}>
                    <Text style={{ color: colorSesion(t.clave), fontWeight: '700' }}>{t.nombre}</Text>
                    {` · ${t.dia}${t.enCurso ? ' · en curso' : ''}`}
                    {` · recorrido ${cifra(rango, 2) ?? '—'}`}
                    {t.minimo > 0 ? ` (${cifra((rango / t.minimo) * 100, 2) ?? '—'} %)` : ''}
                    {` · VWAP ${vw !== null ? cifra(vw, 2) : '—'}`}
                    {` · POC ≈ ${t.poc !== null ? cifra(t.poc, 2) : '—'}`}
                    {t.enCurso && vw !== null && precio !== undefined
                      ? precio >= vw
                        ? ' · precio sobre el VWAP'
                        : ' · precio bajo el VWAP'
                      : ''}
                    {t.barras < t.esperadas && !t.enCurso ? ` · ${t.barras} de ${t.esperadas} velas` : ''}
                  </Text>
                );
              })}
              {londresRecortada ? (
                <Text style={[T.micro, { color: palette.caution, lineHeight: 13 }]}>
                  Este valor sólo tiene velas en el horario de su bolsa: la caja de Londres es su solape
                  con Nueva York, no la sesión de Londres entera.
                </Text>
              ) : null}
              {sinVolumen ? (
                <Text style={[T.micro, { color: colors.noSignal, lineHeight: 13 }]}>
                  El proveedor no publica volumen para este instrumento: sin volumen no hay VWAP ni POC, y
                  se deja el hueco en vez de inventarlos.
                </Text>
              ) : tramos.length ? (
                <Text style={[T.micro, { color: colors.inkFaint, lineHeight: 13 }]}>
                  POC aproximado: el volumen de cada vela se reparte por igual en su rango ({FILAS_POC} filas).
                  Sin datos de tick no se sabe a qué precio se negoció dentro de la vela.
                </Text>
              ) : null}

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
