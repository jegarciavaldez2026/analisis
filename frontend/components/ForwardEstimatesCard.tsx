/**
 * Estimaciones adelantadas — consenso de analistas.
 *
 * Muestra PER adelantado, ingresos y beneficios estimados. **No es un modelo
 * propio:** aquí no se proyecta nada, se recoge lo que estiman las casas que
 * cubren el valor.
 *
 * Por eso el número de analistas viaja junto a cada cifra y no en letra
 * pequeña al pie. Una estimación de doce casas y otra de dos se leen igual si
 * no se dice cuántas hay detrás, y no valen lo mismo. Cuando no hay cobertura
 * se pinta un guion: un valor pequeño sin analistas no tiene consenso, y
 * rellenar ese hueco con una extrapolación propia sería peor que dejarlo.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import axios from 'axios';

import { useTheme } from '../contexts/ThemeContext';
import { Legend, Panel, Rule, Skeleton } from './ui';
import { deltaTone, toneColors } from '../theme/tokens';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

interface FilaEstimacion {
  periodo: string;
  media: number | null;
  baja: number | null;
  alta: number | null;
  analistas: number | null;
  crecimiento: number | null;
}

interface Estimaciones {
  precio: number | null;
  eps_ttm: number | null;
  eps_forward: number | null;
  pe_ttm: number | null;
  pe_forward: number | null;
  ingresos_ttm: number | null;
  margen_neto: number | null;
  precio_objetivo: number | null;
  objetivo_bajo: number | null;
  objetivo_alto: number | null;
  analistas: number | null;
  estimaciones_beneficio: FilaEstimacion[];
  estimaciones_ingresos: FilaEstimacion[];
  per_estimado?: any;
  fuente: string;
}

const n = (v: any) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

const usd = (v: any, dec = 2) => {
  const x = n(v);
  return x == null ? '—' : `$${x.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
};

const corto = (v: any) => {
  const x = n(v);
  if (x == null) return '—';
  const a = Math.abs(x);
  if (a >= 1e12) return `$${(x / 1e12).toFixed(2)} B`;
  if (a >= 1e9) return `$${(x / 1e9).toFixed(2)} MM`;
  if (a >= 1e6) return `$${(x / 1e6).toFixed(1)} M`;
  if (a >= 1e3) return `$${(x / 1e3).toFixed(0)} k`;
  return `$${x.toFixed(0)}`;
};

const pct = (v: any) => {
  const x = n(v);
  return x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(1)} %`;
};

/** Periodos de Yahoo: 0q = trimestre actual, +1y = próximo ejercicio. */
const ETIQUETA_PERIODO: Record<string, string> = {
  '0q': 'Trimestre actual',
  '+1q': 'Próximo trimestre',
  '0y': 'Ejercicio actual',
  '+1y': 'Próximo ejercicio',
  '+5y': 'A cinco años',
  '-5y': 'Últimos cinco años',
};

export default function ForwardEstimatesCard({ ticker }: { ticker: string }) {
  const { colors, palette, space, type, radius, hairline, numeric } = useTheme();
  const [datos, setDatos] = useState<Estimaciones | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    if (!ticker) return;
    setCargando(true);
    setError(false);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/forward-estimates/${ticker}`);
      setDatos(res.data);
    } catch {
      setError(true);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [ticker]);

  useEffect(() => { cargar(); }, [cargar]);

  const Cifra = ({ rotulo, valor, sub, tono }: any) => (
    <View style={{ flex: 1, minWidth: 132, paddingRight: space.md }}>
      <Legend>{rotulo}</Legend>
      <Text style={[type.title3, numeric, { color: valor === '—' ? colors.noSignal : (tono || colors.ink), marginTop: 2 }]}>
        {valor}
      </Text>
      {sub ? <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}>{sub}</Text> : null}
    </View>
  );

  /* El abaratamiento del múltiplo es la lectura útil: si el PER adelantado es
     menor que el actual, el consenso espera que el beneficio crezca. */
  const pe = datos?.per_estimado;
  const pc = pe?.per_consenso;

  const abaratamiento =
    datos && n(datos.pe_ttm) && n(datos.pe_forward)
      ? ((datos.pe_forward! - datos.pe_ttm!) / datos.pe_ttm!) * 100
      : null;

  const tabla = (filas: FilaEstimacion[], titulo: string, formato: (v: any) => string) => {
    if (!filas || filas.length === 0) {
      return (
        <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <Legend>{titulo}</Legend>
          <Text style={[type.caption, { color: colors.inkFaint, marginTop: 4 }]}>
            Sin estimaciones publicadas para este valor.
          </Text>
        </View>
      );
    }
    return (
      <View>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
          <Legend>{titulo}</Legend>
        </View>
        <Rule />
        {filas.map((f, i) => {
          const tono = deltaTone(f.crecimiento);
          const fg = tono === 'neutral' ? colors.inkMuted : toneColors(palette, tono).fg;
          return (
            <View key={f.periodo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md,
                             paddingHorizontal: space.lg, paddingVertical: space.md }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.label, { color: colors.ink }]}>
                    {ETIQUETA_PERIODO[f.periodo] || f.periodo}
                  </Text>
                  <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}>
                    {f.analistas ? `${f.analistas} analista${f.analistas === 1 ? '' : 's'}` : 'sin cobertura'}
                  </Text>
                </View>
                <View style={{ minWidth: 96, alignItems: 'flex-end' }}>
                  <Text style={[type.bodyStrong, numeric, { color: f.media == null ? colors.noSignal : colors.ink }]}>
                    {formato(f.media)}
                  </Text>
                  {f.baja != null && f.alta != null ? (
                    <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
                      {formato(f.baja)} – {formato(f.alta)}
                    </Text>
                  ) : null}
                </View>
                <View style={{ minWidth: 74, alignItems: 'flex-end' }}>
                  <Text style={[type.caption, numeric, { color: f.crecimiento == null ? colors.noSignal : fg, fontWeight: '700' }]}>
                    {pct(f.crecimiento)}
                  </Text>
                </View>
              </View>
              {i < filas.length - 1 ? <Rule /> : null}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Panel legend="Consenso de analistas" title="Estimaciones adelantadas" padded={false}>
      {cargando ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={30} />)}
        </View>
      ) : error || !datos ? (
        <View style={{ padding: space.lg }}>
          <Text style={[type.caption, { color: colors.inkMuted }]}>
            No se pudieron obtener las estimaciones.
          </Text>
        </View>
      ) : (
        <>
          {/* Cifras de cabecera */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md,
                         paddingHorizontal: space.lg, paddingVertical: space.md }}>
            <Cifra rotulo="PER adelantado"
                   valor={datos.pe_forward == null ? '—' : `${datos.pe_forward.toFixed(2)}×`}
                   sub={datos.pe_ttm ? `actual ${datos.pe_ttm.toFixed(2)}×` : null}
                   tono={colors.accent} />
            <Cifra rotulo="BPA estimado" valor={usd(datos.eps_forward)}
                   sub={datos.eps_ttm ? `últimos 12 m ${usd(datos.eps_ttm)}` : null} />
            <Cifra rotulo="Ingresos (12 m)" valor={corto(datos.ingresos_ttm)}
                   sub={datos.margen_neto ? `margen neto ${datos.margen_neto.toFixed(1)} %` : null} />
            <Cifra rotulo="Precio objetivo" valor={usd(datos.precio_objetivo)}
                   sub={datos.objetivo_bajo && datos.objetivo_alto
                        ? `${usd(datos.objetivo_bajo)} – ${usd(datos.objetivo_alto)}` : null} />
          </View>

          {/* Lectura del múltiplo */}
          {abaratamiento != null ? (
            <View style={{ marginHorizontal: space.lg, marginBottom: space.md, padding: space.md,
                           borderRadius: radius.sm, borderWidth: hairline, borderColor: colors.rule,
                           backgroundColor: colors.surfaceSunken }}>
              <Text style={[type.caption, { color: colors.inkMuted, lineHeight: 18 }]}>
                {abaratamiento < 0
                  ? `El múltiplo se abarata un ${Math.abs(abaratamiento).toFixed(0)} % respecto al actual: el consenso espera que el beneficio crezca.`
                  : `El múltiplo se encarece un ${abaratamiento.toFixed(0)} % respecto al actual: el consenso espera que el beneficio caiga.`}
                {' '}Un PER adelantado bajo no significa por sí solo que la acción esté barata — en compañías cíclicas suele ser lo contrario, porque el beneficio está en su pico.
              </Text>
            </View>
          ) : null}

          {/* Rango del consenso. Va antes que el cálculo propio porque es el
              dato, no la opinión: mismo precio dividido entre la estimación
              más optimista y la más pesimista de los analistas. */}
          {pc && (pc.per_min || pc.per_max) ? (
            <>
              <Rule />
              <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
                <Legend>PER adelantado del consenso · rango</Legend>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm,
                             paddingHorizontal: space.lg, paddingBottom: space.md }}>
                {[
                  ['Más optimista', pc.per_min, pc.eps_max, palette.up],
                  ['Media', pc.per_medio, pc.eps_medio, colors.accent],
                  ['Más pesimista', pc.per_max, pc.eps_min, palette.down],
                ].map(([etiqueta, per, eps, col]: any) => (
                  <View key={etiqueta} style={{ flex: 1, minWidth: 108, alignItems: 'center',
                                                paddingVertical: space.md, borderRadius: radius.sm,
                                                borderWidth: hairline, borderColor: colors.rule,
                                                backgroundColor: colors.surfaceSunken }}>
                    <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0.4 }]}>
                      {etiqueta.toUpperCase()}
                    </Text>
                    <Text style={[type.title3, numeric, { color: per == null ? colors.noSignal : col, marginTop: 2 }]}>
                      {per == null ? '—' : `${per.toFixed(1)}×`}
                    </Text>
                    <Text style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
                      BPA {usd(eps)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* La causa del múltiplo, que es lo que casi nadie explica. */}
              {pc.caida_bpa != null ? (
                <View style={{ marginHorizontal: space.lg, marginBottom: space.md, padding: space.md,
                               borderRadius: radius.sm, borderWidth: hairline,
                               borderColor: colors.rule, backgroundColor: colors.surface }}>
                  <Text style={[type.caption, { color: colors.inkMuted, lineHeight: 18 }]}>
                    El BPA pasa de {usd(pc.eps_ttm)} a {usd(pc.eps_medio)}, una caída del{' '}
                    <Text style={{ fontWeight: '700', color: palette.down }}>
                      {Math.abs(pc.caida_bpa).toFixed(0)} %
                    </Text>
                    . El múltiplo se dispara porque se hunde el denominador, no porque la acción
                    se haya encarecido: el precio no ha caído en la misma proporción.
                    {'\n\n'}
                    En una compañía cíclica esto suele señalar el valle del beneficio, no una acción
                    cara. Un PER adelantado alto y un PER histórico bajo, a la vez, es el perfil
                    típico de un beneficio en mínimos — que es cuando el múltiplo engaña más.
                  </Text>
                </View>
              ) : null}
              {pc.analistas ? (
                <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
                  <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}>
                    Rango entre {pc.analistas} estimaciones. El PER más alto sale del beneficio más
                    bajo, no de un precio distinto.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}

          {/* PER adelantado estimado — cadena de cálculo visible */}
          {pe ? (
            <>
              <Rule />
              <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
                <Legend>PER adelantado estimado · cálculo propio</Legend>
              </View>
              {pe.disponible ? (
                <>
                  <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
                    {[
                      ['Ingresos previstos', corto(pe.ingresos_previstos), pe.ingresos_origen],
                      ['× margen neto normalizado', `${pe.margen?.toFixed(2)} %`, pe.margen_origen],
                      ['= beneficio previsto', corto(pe.beneficio_previsto), null],
                      ['÷ acciones (base diluida)', corto(pe.acciones).replace('$', ''), pe.acciones_origen],
                      ['= BPA estimado', usd(pe.eps_estimado), null],
                    ].map(([k, v, origen]: any, i) => (
                      <View key={k} style={{ paddingVertical: 5, borderBottomWidth: hairline, borderBottomColor: colors.rule }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                          <Text style={[type.caption, { color: k.startsWith('=') ? colors.ink : colors.inkMuted, fontWeight: k.startsWith('=') ? '700' : '400' }]}>
                            {k}
                          </Text>
                          <Text style={[type.caption, numeric, { color: colors.ink, fontWeight: '700' }]}>{v}</Text>
                        </View>
                        {origen ? (
                          <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0, marginTop: 1 }]}>
                            {origen}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>

                  <View style={{ marginHorizontal: space.lg, marginBottom: space.md, padding: space.md,
                                 borderRadius: radius.sm, borderWidth: hairline, borderColor: colors.ruleStrong,
                                 backgroundColor: colors.surfaceSunken, flexDirection: 'row',
                                 alignItems: 'baseline', justifyContent: 'space-between', gap: space.md }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Legend>PER adelantado estimado</Legend>
                      <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}>
                        {usd(pe.precio)} ÷ {usd(pe.eps_estimado)}
                      </Text>
                    </View>
                    <Text style={[type.title2, numeric, { color: pe.per == null ? colors.noSignal : colors.accent }]}>
                      {pe.per == null ? '—' : `${pe.per.toFixed(2)}×`}
                    </Text>
                  </View>

                  {/* Dilución y recompras: el denominador también es una
                      decisión, y en una compañía que recompra es información. */}
                  {pe.dilucion_pct != null || pe.variacion_acciones != null ? (
                    <View style={{ marginHorizontal: space.lg, marginBottom: space.md, padding: space.md,
                                   borderRadius: radius.sm, borderWidth: hairline, borderColor: colors.rule }}>
                      {pe.dilucion_pct != null ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                          <Text style={[type.caption, { color: colors.inkMuted }]}>
                            Dilución sobre las básicas
                          </Text>
                          <Text style={[type.caption, numeric, { color: colors.ink, fontWeight: '700' }]}>
                            +{pe.dilucion_pct.toFixed(2)} %
                          </Text>
                        </View>
                      ) : null}
                      {pe.variacion_acciones != null ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, marginTop: 4 }}>
                          <Text style={[type.caption, { color: colors.inkMuted }]}>
                            {pe.variacion_acciones < 0 ? 'Recompra en el último ejercicio' : 'Ampliación en el último ejercicio'}
                          </Text>
                          <Text style={[type.caption, numeric, {
                            color: pe.variacion_acciones < 0 ? palette.up : palette.down, fontWeight: '700',
                          }]}>
                            {pe.variacion_acciones > 0 ? '+' : '−'}{Math.abs(pe.variacion_acciones).toFixed(2)} %
                          </Text>
                        </View>
                      ) : null}
                      <Text style={[type.caption, { color: colors.inkFaint, marginTop: 6, lineHeight: 17 }]}>
                        Se dividen las diluidas, no las básicas: es lo que usa la propia empresa para
                        su BPA. Con las básicas el beneficio por acción sale inflado y el PER más
                        barato de lo que es.
                        {pe.variacion_acciones != null && pe.variacion_acciones < 0
                          ? ' Menos acciones elevan el BPA aunque el beneficio no crezca.'
                          : ''}
                      </Text>
                    </View>
                  ) : null}

                  {/* Dónde discrepas con el mercado. Es la lectura más útil
                      de toda la tarjeta: el margen es el supuesto que decide. */}
                  {pe.margen_consenso != null ? (
                    <View style={{ marginHorizontal: space.lg, marginBottom: space.md, padding: space.md,
                                   borderRadius: radius.sm, borderWidth: hairline, borderColor: colors.rule }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                        <Text style={[type.caption, { color: colors.inkMuted }]}>Margen que supone el consenso</Text>
                        <Text style={[type.caption, numeric, { color: colors.ink, fontWeight: '700' }]}>
                          {pe.margen_consenso.toFixed(2)} %
                        </Text>
                      </View>
                      <Text style={[type.caption, { color: colors.inkFaint, marginTop: 4, lineHeight: 17 }]}>
                        {Math.abs(pe.margen_consenso - pe.margen) < 0.5
                          ? 'Coincide con el margen histórico: consenso y modelo parten de lo mismo.'
                          : pe.margen_consenso > pe.margen
                            ? `El consenso espera ${(pe.margen_consenso - pe.margen).toFixed(2)} puntos más de margen que la mediana histórica — descuenta una mejora que aún no se ha producido.`
                            : `El consenso espera ${(pe.margen - pe.margen_consenso).toFixed(2)} puntos menos que la mediana histórica — descuenta un deterioro.`}
                      </Text>
                    </View>
                  ) : null}

                  <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
                    {pe.aviso ? (
                      <Text style={[type.caption, { color: palette.caution, marginBottom: 6, lineHeight: 18 }]}>
                        {pe.aviso}
                      </Text>
                    ) : null}
                    <Text style={[type.caption, { color: colors.inkMuted, lineHeight: 18 }]}>
                      No es el consenso: el margen sale de tu histórico, no de los analistas. Por eso
                      el número tiene valor propio — y por eso la comparación con el
                      {datos.pe_forward ? ` ${datos.pe_forward.toFixed(2)}× del consenso` : ' consenso de arriba'} dice
                      dónde discrepas.
                    </Text>
                  </View>
                </>
              ) : (
                <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
                  <Text style={[type.caption, { color: colors.inkFaint }]}>{pe.motivo}</Text>
                </View>
              )}
            </>
          ) : null}

          <Rule />
          {tabla(datos.estimaciones_beneficio, 'Beneficio por acción estimado', (v) => usd(v))}
          <Rule />
          {tabla(datos.estimaciones_ingresos, 'Ingresos estimados', (v) => corto(v))}

          <Rule />
          <View style={{ padding: space.lg, gap: 4 }}>
            <Text style={[type.caption, { color: colors.inkMuted }]}>
              {datos.fuente}
              {datos.analistas ? ` · ${datos.analistas} casas cubren el valor.` : ''}
            </Text>
            <Text style={[type.caption, { color: colors.inkFaint }]}>
              Estas cifras no son una proyección de esta aplicación: son lo que estiman los
              analistas. El rango bajo–alto muestra cuánto discrepan entre sí, y ese desacuerdo
              suele decir más que la media.
            </Text>
          </View>
        </>
      )}
    </Panel>
  );
}
