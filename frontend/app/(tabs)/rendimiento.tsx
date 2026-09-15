/**
 * Rendimiento: la ficha de un valor frente a su industria y al S&P 500.
 *
 * Datos de `GET /api/rendimiento/{ticker}` (backend/rendimiento_api.py). Tres
 * cosas que la pantalla dice en vez de callar:
 * · La columna «Industria» es la MEDIANA de hasta ocho competidores de tamaño
 *   parecido, y la cabecera dice cuántos son.
 * · La del S&P 500 sale del SPY: rentabilidades y beta; de los múltiplos, sólo
 *   el PER cuando Yahoo lo publica.
 * · Las puntuaciones propietarias de Stock Rover no se replican: se rotula al
 *   pie en vez de pintar un número inventado.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSimbolo } from '../../contexts/SimboloContext';
import BuscadorSimbolo from '../../components/estrategia/BuscadorSimbolo';
import { Notice, Panel, Rule, Skeleton } from '../../components/ui';
import { BarraRango, FilaDato, FilaTabla, Tabla, useTonoSigno } from '../../components/rendimiento/Piezas';
import { FichaRendimiento, Num, Trio, mensajeDeError, obtenerRendimiento } from '../../lib/rendimiento/api';
import { GUION, fFecha, fGrande, fNum, fPct } from '../../lib/rendimiento/formato';
import { space as espacio } from '../../theme/tokens';

const RECOMENDACION: Record<string, string> = {
  strong_buy: 'Compra fuerte',
  buy: 'Comprar',
  hold: 'Mantener',
  underperform: 'Infraponderar',
  sell: 'Vender',
  strong_sell: 'Venta fuerte',
};

export default function RendimientoScreen() {
  const { colors, type, space, numeric } = useTheme();
  const { token } = useAuth();
  const { simbolo: simboloGlobal, listo } = useSimbolo();
  /**
   * Lo que elige el usuario. Mientras no elija, el símbolo guardado EN CUANTO se
   * conoce (`listo`): arrancar con el de por defecto pedía una ficha que nadie
   * buscó. Se deriva, no se copia al estado con un efecto.
   */
  const [elegido, setTicker] = useState<string | null>(null);
  const ticker = elegido ?? (listo ? simboloGlobal : null);
  const [ficha, setFicha] = useState<FichaRendimiento | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ancho, setAncho] = useState(0);
  /** Descarta la respuesta de un ticker anterior que llegue después de la del actual. */
  const peticion = useRef(0);
  const tono = useTonoSigno();

  const cargar = useCallback(
    async (t: string) => {
      const id = (peticion.current += 1);
      setCargando(true);
      setError(null);
      try {
        const datos = await obtenerRendimiento(t, token);
        if (id === peticion.current) setFicha(datos);
      } catch (e) {
        if (id === peticion.current) {
          setError(mensajeDeError(e));
          setFicha(null);
        }
      } finally {
        if (id === peticion.current) setCargando(false);
      }
    },
    [token],
  );

  // Sin token no se pide: la primera petición salía antes de que AuthContext
  // lo cargara y volvía con 401 (visto en la verificación con Playwright).
  useEffect(() => {
    if (ticker && token) void cargar(ticker);
  }, [ticker, token, cargar]);

  const medir = useCallback((e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width), []);
  const columnas = ancho >= 1180 ? 3 : ancho >= 760 ? 2 : 1;

  const paneles = ficha ? construirPaneles(ficha, { colors, type, space, numeric, tono, elegir: setTicker }) : [];
  const porColumna: React.ReactNode[][] = Array.from({ length: columnas }, () => []);
  // Cada panel ya lleva su `key` («rent», «perfil»…): se reparte tal cual.
  paneles.forEach((p, i) => porColumna[i % columnas].push(p));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={estilos.contenido}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: space.xs, marginBottom: space.lg, maxWidth: 640 }}>
        <Text style={[type.title1, { color: colors.ink }]}>Rendimiento</Text>
        <Text style={[type.body, { color: colors.inkMuted }]}>
          Precio, perfil, rentabilidad total y múltiplos de un valor, comparados con la mediana de sus competidores y con
          el S&amp;P 500.
        </Text>
      </View>

      <View style={{ zIndex: 50, maxWidth: 520, marginBottom: space.lg }}>
        <BuscadorSimbolo simbolo={ticker ?? ''} onElegir={(t) => setTicker(t.toUpperCase())} />
      </View>

      <View onLayout={medir} style={{ gap: space.lg }}>
        {error ? <Notice tone="down" title={`No se pudo cargar ${ticker}`} body={error} /> : null}

        {cargando && !ficha ? (
          <Panel>
            <View style={{ gap: space.md }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={i === 0 ? 44 : 22} />
              ))}
              <Text style={[type.caption, { color: colors.inkMuted }]}>
                Descargando cotizaciones, estados financieros y competidores de {ticker}. La primera vez tarda unos
                segundos; después sale de la caché.
              </Text>
            </View>
          </Panel>
        ) : null}

        {ficha ? (
          <View style={{ gap: space.lg, opacity: cargando ? 0.55 : 1 }}>
            <Cabecera ficha={ficha} />
            <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' }}>
              {porColumna.map((col, i) => (
                <View key={i} style={{ flex: 1, minWidth: 0, gap: space.lg }}>
                  {col}
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: {
    padding: espacio.xl,
    paddingBottom: espacio.h3,
    maxWidth: 1440,
    width: '100%',
    alignSelf: 'center',
  },
});

/* ==========================================================================
 * Cabecera: precio, variación y rangos
 * ======================================================================== */

function Cabecera({ ficha }: { ficha: FichaRendimiento }) {
  const { colors, type, space, numeric } = useTheme();
  const tono = useTonoSigno();
  const { precio } = ficha;
  const hora = precio.hora ? new Date(precio.hora) : null;
  const cambio = precio.cambio;
  return (
    <Panel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xl }}>
        <View style={{ flexGrow: 1, flexBasis: 260, gap: 2 }}>
          <Text style={[type.legend, { color: colors.inkFaint }]}>
            {ficha.ticker}
            {ficha.bolsa ? ` · ${ficha.bolsa}` : ''}
          </Text>
          <Text style={[type.title2, { color: colors.ink }]} numberOfLines={2}>
            {ficha.nombre}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space.md, marginTop: space.xs }}>
            <Text style={[type.display, numeric, { color: colors.ink }]}>
              {fNum(precio.actual, precio.actual != null && precio.actual < 10 ? 3 : 2)}
            </Text>
            <Text style={[type.label, { color: colors.inkMuted }]}>{ficha.moneda}</Text>
            <Text style={[type.bodyStrong, numeric, { color: tono(cambio) }]}>
              {cambio == null ? GUION : `${cambio > 0 ? '+' : ''}${fNum(cambio, Math.abs(cambio) < 1 ? 3 : 2)}`} (
              {fPct(precio.cambio_pct, 2, true)})
            </Text>
          </View>
          <Text style={[type.caption, { color: colors.inkFaint }]}>
            {hora
              ? `Última cotización ${hora.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · Yahoo, con unos 15 min de retraso`
              : 'Hora de la cotización no disponible'}
          </Text>
        </View>
        <View style={{ flexGrow: 1, flexBasis: 300, flexDirection: 'row', flexWrap: 'wrap', gap: space.xl }}>
          <View style={{ flex: 1, minWidth: 150 }}>
            <BarraRango titulo="Rango 52 semanas" min={precio.rango_52s.min} max={precio.rango_52s.max} actual={precio.actual} />
          </View>
          <View style={{ flex: 1, minWidth: 150 }}>
            <BarraRango titulo="Rango del día" min={precio.rango_dia.min} max={precio.rango_dia.max} actual={precio.actual} />
          </View>
        </View>
      </View>
    </Panel>
  );
}

/* ==========================================================================
 * Paneles
 * ======================================================================== */

interface Contexto {
  colors: ReturnType<typeof useTheme>['colors'];
  type: ReturnType<typeof useTheme>['type'];
  space: ReturnType<typeof useTheme>['space'];
  numeric: ReturnType<typeof useTheme>['numeric'];
  tono: (v: Num | undefined) => string;
  elegir: (ticker: string) => void;
}

function construirPaneles(f: FichaRendimiento, ctx: Contexto): React.ReactNode[] {
  const { colors, type, space, numeric, tono, elegir } = ctx;
  const n = f.industria.muestra;
  const colIndustria = n ? `Industria (${n})` : 'Industria';
  const trio = (etiqueta: string, t: Trio | undefined, fmt: (v: Num) => string, conSigno = false, conSp = true): FilaTabla => ({
    etiqueta,
    valores: conSp ? [fmt(t?.valor ?? null), fmt(t?.industria ?? null), fmt(t?.sp500 ?? null)] : [fmt(t?.valor ?? null), fmt(t?.industria ?? null)],
    tonos: conSigno ? [tono(t?.valor), undefined, undefined] : undefined,
  });
  const pct = (v: Num) => fPct(v, 1);
  const pctSigno = (v: Num) => fPct(v, 1, true);
  const veces = (v: Num) => fNum(v, 1);
  const p = f.perfil;
  const moneda = f.moneda;
  const nota = (texto: string) => (
    <Text style={[type.caption, { color: colors.inkFaint, marginTop: space.sm, fontSize: 11, lineHeight: 15 }]}>{texto}</Text>
  );

  const rentab = f.rentabilidades;
  const e = f.estimaciones;
  const c = f.crecimiento;

  return [
    <Panel key="rent" legend="Frente a sus referencias" title="Rentabilidad total">
      <Tabla
        columnas={[f.ticker, colIndustria, 'S&P 500']}
        filas={[
          trio('5 días', rentab['5d'], pctSigno, true),
          trio('1 mes', rentab['1m'], pctSigno, true),
          trio('En el año', rentab.ytd, pctSigno, true),
          trio('1 año', rentab['1a'], pctSigno, true),
          trio('3 años', rentab['3a'], pctSigno, true),
          trio('5 años', rentab['5a'], pctSigno, true),
          trio('Beta 1 año', f.beta_1a, (v) => fNum(v, 2)),
        ]}
      />
      {nota(
        `Acumulada, con dividendos reinvertidos (precios ajustados). «Industria» es la mediana de ${n || 'ningún'} competidor${n === 1 ? '' : 'es'} de tamaño parecido; «S&P 500», el SPY. Beta: rendimientos diarios del último año cruzados por fecha.`,
      )}
    </Panel>,

    <Panel key="perfil" legend="Empresa" title="Perfil">
      <FilaDato etiqueta="Sector" valor={p.sector ?? GUION} />
      <FilaDato etiqueta="Industria" valor={p.industria ?? GUION} />
      <FilaDato etiqueta="Capitalización" valor={fGrande(p.capitalizacion, moneda)} />
      <FilaDato etiqueta="Posiciones cortas (% del capital flotante)" valor={fPct(p.pct_corto, 1)} />
      <FilaDato etiqueta="Empleados" valor={fNum(p.empleados, 0)} />
      <FilaDato etiqueta="Ventas (12 meses)" valor={fGrande(p.ventas, p.moneda_cuentas ?? moneda)} />
      <FilaDato etiqueta="Acciones en circulación" valor={fNum(p.acciones, 0)} />
      <FilaDato etiqueta="Primera cotización" valor={fFecha(p.primera_cotizacion)} />
      <FilaDato etiqueta="Último ex-dividendo" valor={fFecha(p.ex_dividendo)} />
      <FilaDato etiqueta="Último trimestre publicado" valor={fFecha(p.ultimo_trimestre)} />
      <FilaDato etiqueta="Próximos resultados" valor={fFecha(p.proximos_resultados)} />
      <FilaDato etiqueta="Sede" valor={p.sede ?? GUION} />
      {p.web ? (
        <Pressable onPress={() => Linking.openURL(p.web!)} accessibilityRole="link" style={{ paddingVertical: space.xs }}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Text style={[type.caption, { color: colors.inkMuted, flex: 1 }]}>Web</Text>
            <Text style={[type.labelStrong, { color: colors.accent }]} numberOfLines={1}>
              {p.web.replace(/^https?:\/\//, '')}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </Panel>,

    <Panel key="valoracion" legend="Múltiplos" title="Valoración">
      <Tabla
        columnas={[f.ticker, colIndustria, 'S&P 500']}
        filas={[
          trio('PER', f.valoracion.per, veces),
          trio('Precio / Ventas', f.valoracion.ps, veces),
          trio('Precio / FCF', f.valoracion.p_fcf, veces),
          trio('Precio / Valor contable', f.valoracion.pb, veces),
          trio('Precio / Valor tangible', f.valoracion.p_tangible, veces),
          trio('EV / EBITDA', f.valoracion.ev_ebitda, veces),
          trio('EV / FCF', f.valoracion.ev_fcf, veces),
        ]}
      />
      {Object.keys(f.rangos_historicos).length ? (
        <View style={{ gap: space.md, marginTop: space.lg }}>
          <Rule />
          {([['per', 'PER'], ['pb', 'Precio / Valor contable'], ['ps', 'Precio / Ventas']] as const).map(([clave, nombre]) => {
            const r = f.rangos_historicos[clave];
            return r ? (
              <BarraRango
                key={clave}
                titulo={`${nombre} · rango en ${r.n} ejercicio${r.n === 1 ? '' : 's'}`}
                min={r.min}
                max={r.max}
                actual={r.actual}
                formato={(v) => fNum(v, 1)}
              />
            ) : null;
          })}
        </View>
      ) : null}
      {nota('Múltiplos negativos (pérdidas o FCF negativo) quedan en hueco. Los rangos usan cada cierre de ejercicio que publica Yahoo, con precios ajustados por dividendos.')}
    </Panel>,

    <Panel key="descripcion" legend="Yahoo Finance · en inglés" title="Descripción">
      <Text style={[type.caption, { color: colors.inkMuted, lineHeight: 19 }]} selectable>
        {f.descripcion || 'Yahoo no publica descripción para este valor.'}
      </Text>
    </Panel>,

    <Panel key="estimaciones" legend="Consenso de analistas" title="Estimaciones">
      <FilaDato etiqueta="Precio objetivo medio" valor={e.precio_objetivo == null ? GUION : `${fNum(e.precio_objetivo, 2)} ${moneda}`} />
      <FilaDato etiqueta="Potencial frente al precio" valor={fPct(e.potencial_pct, 1, true)} tono={tono(e.potencial_pct)} />
      <FilaDato etiqueta="PER" valor={fNum(e.per, 1)} />
      <FilaDato etiqueta="PER adelantado" valor={fNum(e.per_adelantado, 1)} />
      <FilaDato etiqueta="Sorpresa del BPA (último trimestre)" valor={fPct(e.sorpresa_bpa_pct, 1, true)} tono={tono(e.sorpresa_bpa_pct)} />
      <FilaDato
        etiqueta="Consenso"
        valor={e.recomendacion ? `${RECOMENDACION[e.recomendacion] ?? e.recomendacion}${e.recomendacion_media != null ? ` (${fNum(e.recomendacion_media, 1)})` : ''}` : GUION}
      />
      <FilaDato etiqueta="Analistas" valor={fNum(e.analistas, 0)} />
      {e.analistas == null ? nota('Sin cobertura de analistas en Yahoo: objetivo y consenso quedan en hueco.') : null}
    </Panel>,

    <Panel key="crecimiento" legend="Estados anuales" title="Crecimiento">
      <Tabla
        columnas={[f.ticker]}
        anchoColumna={96}
        filas={[
          { etiqueta: 'Ventas', valores: [], seccion: true },
          { clave: 'ventas-prox', etiqueta: 'Próximo año (estimado)', valores: [pctSigno(c.ventas_prox_anio)], tonos: [tono(c.ventas_prox_anio)] },
          { clave: 'ventas-1a', etiqueta: 'Último ejercicio', valores: [pctSigno(c.ventas_1a)], tonos: [tono(c.ventas_1a)] },
          { clave: 'ventas-3a', etiqueta: 'Media anual 3 años', valores: [pctSigno(c.ventas_3a)], tonos: [tono(c.ventas_3a)] },
          { etiqueta: 'BPA', valores: [], seccion: true },
          { clave: 'bpa-prox', etiqueta: 'Próximo año (estimado)', valores: [pctSigno(c.bpa_prox_anio)], tonos: [tono(c.bpa_prox_anio)] },
          { clave: 'bpa-1a', etiqueta: 'Último ejercicio', valores: [pctSigno(c.bpa_1a)], tonos: [tono(c.bpa_1a)] },
          { clave: 'bpa-3a', etiqueta: 'Media anual 3 años', valores: [pctSigno(c.bpa_3a)], tonos: [tono(c.bpa_3a)] },
          { etiqueta: 'EBITDA', valores: [], seccion: true },
          { clave: 'ebitda-1a', etiqueta: 'Último ejercicio', valores: [pctSigno(c.ebitda_1a)], tonos: [tono(c.ebitda_1a)] },
          { clave: 'ebitda-3a', etiqueta: 'Media anual 3 años', valores: [pctSigno(c.ebitda_3a)], tonos: [tono(c.ebitda_3a)] },
        ]}
      />
      {nota('Sin columna de industria: de los competidores Yahoo sólo da la variación trimestral interanual, que es otra medida. La media a 3 años no existe si algún extremo es negativo.')}
    </Panel>,

    <Panel key="rentabilidad" legend="Márgenes y retorno" title="Rentabilidad">
      <Tabla
        columnas={[f.ticker, colIndustria]}
        filas={[
          trio('Margen bruto', f.rentabilidad.margen_bruto, pct, false, false),
          trio('Margen operativo', f.rentabilidad.margen_operativo, pct, false, false),
          trio('Margen neto', f.rentabilidad.margen_neto, pct, false, false),
          trio('ROA', f.rentabilidad.roa, pct, false, false),
          trio('ROE', f.rentabilidad.roe, pct, false, false),
          trio('ROIC (cálculo de Análisis)', f.rentabilidad.roic, pct, false, false),
        ]}
      />
    </Panel>,

    <Panel key="tecnicos" legend="Cotizaciones diarias" title="Técnicos">
      <FilaDato etiqueta="RSI (14 sesiones)" valor={fNum(f.tecnicos.rsi_14, 1)} />
      <FilaDato etiqueta="Money Flow Index (14)" valor={fNum(f.tecnicos.mfi_14, 1)} />
      <FilaDato etiqueta="Precio vs máximo 52 semanas" valor={fPct(f.tecnicos.vs_max_52s, 1)} />
      <FilaDato etiqueta="Precio vs mínimo 52 semanas" valor={fPct(f.tecnicos.vs_min_52s, 1)} />
      <FilaDato etiqueta="Bollinger %B (20)" valor={fPct(f.tecnicos.bollinger_20, 1)} />
      <FilaDato etiqueta="Bollinger %B (50)" valor={fPct(f.tecnicos.bollinger_50, 1)} />
      <FilaDato etiqueta="Precio vs media de 50 sesiones" valor={fPct(f.tecnicos.vs_sma_50, 1)} />
      <FilaDato etiqueta="Precio vs media de 120 sesiones" valor={fPct(f.tecnicos.vs_sma_120, 1)} />
      {nota('100 % = en el nivel de referencia. Bollinger %B: 0 en la banda inferior y 100 en la superior; sale de ese rango cuando el precio rompe la banda.')}
    </Panel>,

    <Panel key="salud" legend="Balance" title="Salud financiera">
      <FilaDato etiqueta="Ratio corriente" valor={fNum(f.salud.ratio_corriente, 2)} />
      <FilaDato etiqueta="Ratio rápido" valor={fNum(f.salud.ratio_rapido, 2)} />
      <FilaDato etiqueta="Precio" valor={f.salud.precio == null ? GUION : `${fNum(f.salud.precio, 2)} ${moneda}`} />
      <FilaDato
        etiqueta="Caja neta por acción"
        valor={f.salud.caja_neta_accion == null ? GUION : `${fNum(f.salud.caja_neta_accion, 2)} ${p.moneda_cuentas ?? moneda}`}
        tono={tono(f.salud.caja_neta_accion)}
      />
      <FilaDato
        etiqueta="Patrimonio por acción"
        valor={f.salud.patrimonio_accion == null ? GUION : `${fNum(f.salud.patrimonio_accion, 2)} ${p.moneda_cuentas ?? moneda}`}
      />
      <FilaDato etiqueta="Deuda / Capital" valor={fPct(f.salud.deuda_capital, 1)} />
    </Panel>,

    <Panel key="dividendos" legend="Remuneración" title="Dividendos">
      <Tabla
        columnas={[f.ticker, colIndustria]}
        filas={[
          trio('Rentabilidad prevista', f.dividendos.rent_prevista, pct, false, false),
          trio('Payout', f.dividendos.payout, pct, false, false),
          trio('Rentabilidad últimos 12 meses', f.dividendos.rent_ttm, pct, false, false),
          trio('Dividendo anual por acción', f.dividendos.dividendo_accion, (v) => fNum(v, 2), false, false),
          trio('Crecimiento último año', f.dividendos.crec_1a, pctSigno, true, false),
          trio('Media anual 3 años', f.dividendos.crec_3a, pctSigno, true, false),
          trio('Media anual 5 años', f.dividendos.crec_5a, pctSigno, true, false),
        ]}
      />
      {nota('Crecimiento por años naturales completos: el año en curso no cuenta. Últimos 12 meses: dividendos cobrados, no el anunciado.')}
    </Panel>,

    <Panel key="competidores" legend={f.industria.nombre ?? 'Misma industria'} title="Competidores">
      {f.competidores.length > 1 ? (
        <View>
          <View style={{ flexDirection: 'row', paddingBottom: space.xs }}>
            <Text style={[type.legend, { color: colors.inkFaint, width: 64 }]}>TICKER</Text>
            <Text style={[type.legend, { color: colors.inkFaint, flex: 1 }]}>EMPRESA</Text>
            <Text style={[type.legend, { color: colors.inkFaint, width: 86, textAlign: 'right' }]}>CAP.</Text>
            <Text style={[type.legend, { color: colors.inkFaint, width: 48, textAlign: 'right' }]}>PER</Text>
            <Text style={[type.legend, { color: colors.inkFaint, width: 64, textAlign: 'right' }]}>HOY</Text>
          </View>
          <Rule />
          {f.competidores.map((q) => (
            <Pressable
              key={q.ticker}
              onPress={() => !q.propio && elegir(q.ticker)}
              disabled={q.propio}
              accessibilityRole={q.propio ? undefined : 'button'}
              accessibilityLabel={q.propio ? undefined : `Ver la ficha de ${q.nombre}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 34,
                backgroundColor: q.propio ? colors.accentWash : pressed ? colors.surfaceSunken : 'transparent',
              })}
            >
              <Text style={[type.labelStrong, { color: q.propio ? colors.ink : colors.accent, width: 64 }]}>{q.ticker}</Text>
              <Text style={[type.caption, { color: colors.inkMuted, flex: 1 }]} numberOfLines={1}>
                {q.nombre}
              </Text>
              <Text style={[type.caption, numeric, { color: colors.ink, width: 86, textAlign: 'right' }]}>
                {fGrande(q.capitalizacion)}
              </Text>
              <Text style={[type.caption, numeric, { color: colors.ink, width: 48, textAlign: 'right' }]}>{fNum(q.per, 1)}</Text>
              <Text style={[type.caption, numeric, { color: tono(q.cambio_pct), width: 64, textAlign: 'right' }]}>
                {fPct(q.cambio_pct, 1, true)}
              </Text>
            </Pressable>
          ))}
          {nota('Misma industria y región, ordenados por capitalización más parecida. Capitalización en la divisa de cada uno. Toca uno para ver su ficha.')}
        </View>
      ) : (
        <Text style={[type.caption, { color: colors.inkMuted }]}>
          Yahoo no devolvió competidores de la misma industria y región para este valor.
        </Text>
      )}
    </Panel>,

    <Panel key="notas" legend="Qué falta y por qué" title="Notas">
      <View style={{ gap: space.sm }}>
        {[...f.avisos, ...f.no_disponible].map((t) => (
          <Text key={t} style={[type.caption, { color: colors.inkMuted, lineHeight: 18 }]}>
            · {t}
          </Text>
        ))}
        <Text style={[type.caption, { color: colors.inkFaint }]}>
          Datos de Yahoo Finance · calculado {fFecha(f.actualizado)} ·{' '}
          {new Date(f.actualizado).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </Panel>,
  ];
}
