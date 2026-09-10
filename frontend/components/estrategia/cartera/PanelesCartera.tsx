/**
 * Rendimiento, estadísticas y backtest.
 *
 * La curva de patrimonio y el drawdown se dibujan sobre el histórico REAL de
 * `/portfolio/evolution`. El drawdown se calcula sobre la curva —máximo
 * decreciente desde el pico— y no como media ponderada de los drawdowns
 * individuales: dos caídas en fechas distintas no se promedian, ése fue uno de
 * los bugs corregidos y no se reintroduce por comodidad de dibujo.
 *
 * El panel de backtest existe y está maquetado, pero no hay motor: dice qué
 * falta en lugar de enseñar un Sharpe inventado. Un backtest con look-ahead es
 * peor que no tener backtest, porque da confianza.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { useTheme } from '../../../contexts/ThemeContext';
import {
  Backtest,
  Bloque,
  EstadisticasOperaciones,
  PuntoCurva,
  ResumenPanel,
} from '../../../lib/estrategia/tipos';
import { cifra, dinero, entero, porcentaje } from '../../../lib/estrategia/formato';
import { BotonTerminal, Cifra, ConDatos, Conmutador, Placa, Rotulo, T } from '../Terminal';

const RANGOS = [
  { clave: '1M' as const, texto: '1M', dias: 30 },
  { clave: '3M' as const, texto: '3M', dias: 90 },
  { clave: '6M' as const, texto: '6M', dias: 180 },
  { clave: 'YTD' as const, texto: 'YTD', dias: 0 },
  { clave: '1A' as const, texto: '1A', dias: 365 },
  { clave: 'TODO' as const, texto: 'Todo', dias: -1 },
];

type ClaveRango = (typeof RANGOS)[number]['clave'];

function recortar(puntos: PuntoCurva[], rango: ClaveRango): PuntoCurva[] {
  if (!puntos.length) return puntos;
  const spec = RANGOS.find((r) => r.clave === rango);
  if (!spec || spec.dias === -1) return puntos;
  if (spec.dias === 0) {
    const inicioAno = new Date(new Date().getFullYear(), 0, 1).getTime();
    return puntos.filter((p) => p.t >= inicioAno);
  }
  const corte = Date.now() - spec.dias * 86400000;
  return puntos.filter((p) => p.t >= corte);
}

/** Curva de patrimonio + drawdown, dos escalas sobre el mismo eje temporal. */
function CurvaRendimiento({ puntos, alto = 150 }: { puntos: PuntoCurva[]; alto?: number }) {
  const { colors, palette, hairline } = useTheme();
  const [ancho, setAncho] = useState(0);
  const medir = useCallback((e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width), []);

  const geometria = useMemo(() => {
    if (!puntos.length || ancho <= 0) return null;
    const izq = 44;
    const der = 40;
    const util = Math.max(1, ancho - izq - der);
    const x = (i: number) => izq + (i / Math.max(1, puntos.length - 1)) * util;

    const valores = puntos.map((p) => p.patrimonio);
    const minP = Math.min(...valores);
    const maxP = Math.max(...valores);
    const colchon = (maxP - minP) * 0.08 || 1;
    const yP = (v: number) =>
      alto - 14 - ((v - (minP - colchon)) / (maxP + colchon - (minP - colchon))) * (alto - 22);

    const minDD = Math.min(...puntos.map((p) => p.drawdownPct), -0.001);
    const yD = (v: number) => 8 + (v / minDD) * (alto - 22);

    const trazo = (fn: (p: PuntoCurva) => number) =>
      puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${fn(p).toFixed(1)}`).join('');

    return {
      izq,
      der,
      d: trazo((p) => yP(p.patrimonio)),
      dd: trazo((p) => yD(p.drawdownPct)),
      area: `${trazo((p) => yD(p.drawdownPct))}L${x(puntos.length - 1).toFixed(1)},8L${x(0).toFixed(1)},8Z`,
      minP,
      maxP,
      minDD,
      yP,
    };
  }, [puntos, ancho, alto]);

  return (
    <View onLayout={medir}>
      {geometria ? (
        <View>
          <Svg width={ancho} height={alto}>
            {[0, 0.5, 1].map((f) => {
              const yy = geometria.yP(geometria.minP + (geometria.maxP - geometria.minP) * f);
              return (
                <Line
                  key={f}
                  x1={geometria.izq}
                  x2={ancho - geometria.der}
                  y1={yy}
                  y2={yy}
                  stroke={colors.rule}
                  strokeWidth={hairline}
                />
              );
            })}
            <Path d={geometria.area} fill={palette.downWash} />
            <Path d={geometria.dd} stroke={palette.down} strokeWidth={1} fill="none" />
            <Path d={geometria.d} stroke={palette.accent} strokeWidth={1.6} fill="none" />
          </Svg>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
            {[1, 0.5, 0].map((f) => {
              const v = geometria.minP + (geometria.maxP - geometria.minP) * f;
              return (
                <Text
                  key={f}
                  style={[
                    T.micro,
                    { color: colors.inkFaint, position: 'absolute', top: geometria.yP(v) - 6, left: 2 },
                  ]}
                >
                  {dinero(v)}
                </Text>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 8, height: 2, backgroundColor: palette.accent }} />
              <Rotulo>Patrimonio</Rotulo>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 8, height: 2, backgroundColor: palette.down }} />
              <Rotulo>Drawdown</Rotulo>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ height: alto }} />
      )}
    </View>
  );
}

/* ========================================================================== */

export function RendimientoRobot({
  curva,
  resumen,
  cargando,
}: {
  curva: Bloque<PuntoCurva[]>;
  resumen: Bloque<ResumenPanel>;
  cargando?: boolean;
}) {
  const [rango, setRango] = useState<ClaveRango>('YTD');

  return (
    <Placa
      titulo="Rendimiento"
      procedencia={curva.procedencia}
      derecha={<Conmutador opciones={RANGOS} activa={rango} onChange={setRango} compacto />}
    >
      <ConDatos bloque={curva} cargando={cargando} filasCarga={6}>
        {(puntos) => {
          const visibles = recortar(puntos, rango);
          if (!visibles.length) {
            return (
              <View style={{ gap: 4 }}>
                <Text style={{ color: 'transparent', height: 0 }} />
                <CurvaRendimiento puntos={puntos} />
              </View>
            );
          }
          const inicio = visibles[0].patrimonio;
          const fin = visibles[visibles.length - 1].patrimonio;
          const ddActual = visibles[visibles.length - 1].drawdownPct;
          const ddMax = Math.min(...visibles.map((p) => p.drawdownPct));

          return (
            <View style={{ gap: 6 }}>
              <CurvaRendimiento puntos={visibles} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 4 }}>
                {(
                  [
                    ['Inicial', dinero(inicio), 'neutral'],
                    ['Actual', dinero(fin), 'neutral'],
                    [
                      'Variación',
                      porcentaje(inicio ? ((fin - inicio) / inicio) * 100 : null, 2, true),
                      fin >= inicio ? 'up' : 'down',
                    ],
                    ['Drawdown máx.', porcentaje(ddMax, 2), 'down'],
                    ['Drawdown actual', porcentaje(ddActual, 2), 'down'],
                    ['Sharpe', cifra(resumen.datos?.sharpe ?? null), 'neutral'],
                  ] as const
                ).map(([rot, val, tono]) => (
                  <View key={rot} style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
                    <Rotulo>{rot}</Rotulo>
                    <Cifra valor={val} tono={tono as any} escala="datoFuerte" />
                  </View>
                ))}
              </View>
            </View>
          );
        }}
      </ConDatos>
    </Placa>
  );
}

export function EstadisticasRendimiento({
  bloque,
  operaciones,
  cargando,
}: {
  bloque: Bloque<ResumenPanel>;
  operaciones: Bloque<EstadisticasOperaciones>;
  cargando?: boolean;
}) {
  const { colors, hairline } = useTheme();
  const op = operaciones.datos;
  return (
    <Placa titulo="Estadísticas de la cartera" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={6}>
        {(r) => (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 6 }}>
              {(
                [
                  ['Balance total', dinero(r.balance), 'neutral', null],
                  ['Caja disponible', dinero(r.disponible), 'neutral', null],
                  ['Coste invertido', dinero(r.invertido), 'neutral', null],
                  ['Valor posiciones', dinero(r.valorPosiciones), 'neutral', null],
                  [
                    'Realizadas',
                    dinero(r.realizadas, true),
                    (r.realizadas ?? 0) >= 0 ? 'up' : 'down',
                    null,
                  ],
                  [
                    'No realizadas',
                    dinero(r.noRealizadas, true),
                    (r.noRealizadas ?? 0) >= 0 ? 'up' : 'down',
                    null,
                  ],
                  [
                    'Ganancia neta',
                    dinero(r.gananciaNeta, true),
                    (r.gananciaNeta ?? 0) >= 0 ? 'up' : 'down',
                    null,
                  ],
                  [
                    'Retorno',
                    porcentaje(r.retornoPct, 2, true),
                    (r.retornoPct ?? 0) >= 0 ? 'up' : 'down',
                    null,
                  ],
                  ['Sharpe', cifra(r.sharpe), 'neutral', null],
                  ['Drawdown máx.', porcentaje(r.drawdownMax, 2), 'down', null],
                  ['P&L del día', null, 'neutral', 'No lo calcula /portfolio'],
                ] as const
              ).map(([rot, val, tono, motivo]) => (
                <View key={rot} style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
                  <Rotulo>{rot}</Rotulo>
                  {motivo ? (
                    <View style={{ gap: 1 }}>
                      <Cifra valor={null} escala="datoFuerte" />
                      <Text style={[T.micro, { color: colors.noSignal }]} numberOfLines={2}>
                        {motivo}
                      </Text>
                    </View>
                  ) : (
                    <Cifra valor={val} tono={tono as any} escala="datoFuerte" />
                  )}
                </View>
              ))}
            </View>

            {/* Operaciones cerradas: bloque aparte porque miden otra cosa.
                El balance describe dónde estás; esto, cómo has operado. */}
            <View style={{ height: hairline, backgroundColor: colors.rule }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Rotulo>Operaciones cerradas</Rotulo>
              {op ? (
                <Text style={[T.micro, { color: colors.inkFaint }]}>
                  {op.ganadoras} ganadoras · {op.perdedoras} perdedoras
                </Text>
              ) : null}
            </View>

            {op ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 6 }}>
                {(
                  [
                    ['Win rate', porcentaje(op.winRate, 1), (op.winRate ?? 0) >= 50 ? 'up' : 'down'],
                    ['Profit factor', cifra(op.profitFactor), (op.profitFactor ?? 0) >= 1 ? 'up' : 'down'],
                    [
                      'Expectativa',
                      dinero(op.expectativa, true),
                      (op.expectativa ?? 0) >= 0 ? 'up' : 'down',
                    ],
                    ['Operaciones', entero(op.operaciones), 'neutral'],
                    ['Mejor', dinero(op.mejor, true), 'up'],
                    ['Peor', dinero(op.peor, true), 'down'],
                  ] as const
                ).map(([rot, val, tono]) => (
                  <View key={rot} style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
                    <Rotulo>{rot}</Rotulo>
                    <Cifra valor={val} tono={tono as any} escala="datoFuerte" />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[T.micro, { color: colors.noSignal }]}>
                {operaciones.nota ?? 'Sin ventas cerradas que medir.'}
              </Text>
            )}

            {operaciones.nota && op ? (
              <Text style={[T.micro, { color: colors.inkFaint }]}>{operaciones.nota}</Text>
            ) : null}
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}

const PERIODOS = [
  { clave: '1y' as const, texto: '1A' },
  { clave: '2y' as const, texto: '2A' },
  { clave: '5y' as const, texto: '5A' },
  { clave: '10y' as const, texto: '10A' },
];

/**
 * Backtest.
 *
 * Se ejecuta a petición, no al abrir la pantalla: recorre años de barras y se
 * descarga su propio histórico.
 *
 * Los supuestos —comisión, deslizamiento, riesgo por operación— viajan visibles
 * bajo las métricas. Un Sharpe sin saber con qué costes se calculó no es una
 * medida, es una cifra. Y los avisos del motor se enseñan arriba, no al pie:
 * «solo 12 operaciones» cambia por completo cómo hay que leer un win rate.
 */
export function PanelBacktest({
  bloque,
  onEjecutar,
  ejecutando,
  simbolo,
}: {
  bloque: Bloque<Backtest>;
  onEjecutar: (opciones?: { period?: string }) => void;
  ejecutando?: boolean;
  simbolo: string;
}) {
  const { colors, palette, hairline, radius } = useTheme();
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]['clave']>('2y');

  return (
    <Placa
      titulo="Backtest"
      procedencia={bloque.procedencia}
      derecha={<Conmutador opciones={PERIODOS} activa={periodo} onChange={setPeriodo} compacto />}
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <BotonTerminal
            texto={ejecutando ? 'Ejecutando…' : `Ejecutar sobre ${simbolo}`}
            icono="play"
            tono="accent"
            relleno
            deshabilitado={ejecutando}
            onPress={() => onEjecutar({ period: periodo })}
          />
        </View>

        <ConDatos bloque={bloque} cargando={ejecutando} filasCarga={5}>
          {(b) => (
            <View style={{ gap: 6 }}>
              {b.avisos.length ? (
                <View
                  style={{
                    gap: 3,
                    padding: 6,
                    borderRadius: radius.xs,
                    borderWidth: hairline,
                    borderColor: palette.caution,
                    backgroundColor: palette.cautionWash,
                  }}
                >
                  <Rotulo tono="caution">Cómo hay que leer esto</Rotulo>
                  {b.avisos.map((a, i) => (
                    <Text key={i} style={[T.micro, { color: colors.inkMuted }]}>
                      {a}
                    </Text>
                  ))}
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Rotulo>
                  {b.desde} — {b.hasta}
                </Rotulo>
                <Rotulo>
                  {b.simbolo} · {b.marco}
                </Rotulo>
              </View>

              <CurvaRendimiento puntos={b.curva} alto={120} />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 4 }}>
                {(
                  [
                    ['Retorno total', porcentaje(b.retornoTotal, 2, true), b.retornoTotal >= 0 ? 'up' : 'down'],
                    ['CAGR', porcentaje(b.cagr, 2, true), b.cagr >= 0 ? 'up' : 'down'],
                    ['Drawdown máx.', porcentaje(b.drawdownMax, 2), 'down'],
                    ['Sharpe', cifra(b.sharpe), 'neutral'],
                    ['Sortino', cifra(b.sortino), 'neutral'],
                    ['Profit factor', cifra(b.profitFactor), b.profitFactor >= 1 ? 'up' : 'down'],
                    ['Win rate', porcentaje(b.winRate, 1), b.winRate >= 50 ? 'up' : 'down'],
                    ['Operaciones', entero(b.operaciones), 'neutral'],
                    ['Expectativa', dinero(b.expectativa, true), b.expectativa >= 0 ? 'up' : 'down'],
                    ['Capital inicial', dinero(b.capitalInicial), 'neutral'],
                    ['Capital final', dinero(b.capitalFinal), 'neutral'],
                  ] as const
                ).map(([rot, val, tono]) => (
                  <View key={rot} style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
                    <Rotulo>{rot}</Rotulo>
                    <Cifra valor={val} tono={tono as any} escala="datoFuerte" />
                  </View>
                ))}
              </View>

              <View style={{ height: hairline, backgroundColor: colors.rule }} />

              {/* Los supuestos, junto a las cifras que producen. */}
              <View style={{ gap: 2 }}>
                <Rotulo>Supuestos</Rotulo>
                <Text style={[T.micro, { color: colors.inkMuted }]}>
                  Comisión {String(b.supuestos.comision_pct ?? '—')} % · deslizamiento{' '}
                  {String(b.supuestos.deslizamiento_pct ?? '—')} % · riesgo{' '}
                  {String(b.supuestos.riesgo_pct ?? '—')} % por operación · stop{' '}
                  {String(b.supuestos.stop_atr ?? '—')}×ATR · objetivo{' '}
                  {String(b.supuestos.objetivo_atr ?? '—')}×ATR
                </Text>
                {b.motor ? (
                  <Text style={[T.micro, { color: colors.inkFaint }]}>{b.motor}</Text>
                ) : null}
              </View>
            </View>
          )}
        </ConDatos>
      </View>
    </Placa>
  );
}
