/**
 * ============================================================================
 * Cuenta y posiciones — lectura de terminal de bróker
 * ============================================================================
 * Rediseño de la cabecera del portafolio y de la rejilla de posiciones con la
 * densidad de un terminal profesional: la franja de saldos arriba, una sola
 * rejilla de posiciones debajo, cifras tabulares alineadas por el punto
 * decimal y nada de tarjetas grandes para un dato de siete caracteres.
 *
 * --------------------------------------------------------------------------
 * Lo que cambia, y por qué
 * --------------------------------------------------------------------------
 * Antes: «Resumen Financiero» repartía diez cifras en tarjetas de 90 px de
 * alto y tres bloques con títulos en versalita. Ocupaba ~450 px de la primera
 * pantalla para decir seis números, y para comparar dos posiciones había que
 * recorrer tarjetas apiladas.
 *
 * Ahora: una franja de saldos con la jerarquía de un estado de cuenta —el
 * valor liquidativo manda, lo demás lo compone— y una rejilla donde cada
 * posición es una fila. Comparar es mirar una columna.
 *
 * --------------------------------------------------------------------------
 * Tres decisiones que conviene no deshacer
 * --------------------------------------------------------------------------
 * 1. **El valor liquidativo se descompone a la vista**: efectivo + valor de
 *    mercado. Una cifra grande sin sus sumandos obliga a confiar; con ellos se
 *    puede comprobar. Y el desglose CUADRA — si algún día no cuadrara, se
 *    vería aquí antes que en ninguna hoja de cálculo.
 *
 * 2. **Realizado y no realizado, separados y rotulados.** Es la misma
 *    distinción que balance/equity en la cuenta simulada, y se confunde
 *    igual de fácil: un +22.845 no realizado no es dinero que tengas, es
 *    dinero que tendrías si vendieras hoy.
 *
 * 3. **El peso de cada posición se dibuja, no sólo se escribe.** Un 34 % y un
 *    9 % en dos filas de texto se leen igual de rápido; con una barra detrás,
 *    la concentración de la cartera se ve sin sumar nada.
 *
 * Reutiliza la paleta y la escala del producto (`ThemeContext`, `tokens`):
 * esto es una lectura más densa de la MISMA identidad, no otra identidad.
 */

import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';

/* ==========================================================================
 * Tipos — los del backend, sin traducir
 * ======================================================================== */

export interface PosicionCartera {
  ticker: string;
  company_name: string;
  sector: string;
  total_shares: number;
  average_cost: number;
  total_invested: number;
  current_price: number;
  current_value: number;
  profit_loss: number;
  profit_loss_percent: number;
  weight_percent: number;
}

export interface SaldosCuenta {
  total_portfolio_value: number;
  current_value: number;
  cash_available: number;
  total_invested: number;
  total_profit_loss: number;
  total_profit_loss_percent: number;
  realized_gains: number;
  unrealized_gains: number;
  total_deposits: number;
  total_withdrawals: number;
}

/* ==========================================================================
 * Formato
 * ======================================================================== */

const LOCALE = 'es-ES';

function dinero(v: number | null | undefined, signo = false): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const p = signo ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  return `${p}${abs}`;
}

function pct(v: number | null | undefined, signo = true): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const p = signo ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  return `${p}${abs} %`;
}

function acciones(v: number): string {
  return v.toLocaleString(LOCALE, { maximumFractionDigits: 4 });
}

/* ==========================================================================
 * Tipografía y métrica de la pantalla
 * ======================================================================== */

const TIPO = {
  /** Versalita de encabezado de columna y de rótulo. */
  rotulo: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.8 },
  micro: { fontSize: 10.5, fontWeight: '500' as const },
  dato: { fontSize: 12.5, fontWeight: '600' as const },
  cifra: { fontSize: 15, fontWeight: '700' as const, letterSpacing: -0.2 },
  /** El valor liquidativo. Es la única cifra que manda sobre las demás. */
  principal: { fontSize: 27, fontWeight: '700' as const, letterSpacing: -0.7 },
};

/** Alto de fila de la rejilla. Suficiente para el dedo, denso para el ojo. */
const FILA = 38;

/* ==========================================================================
 * Celda de saldo
 * ======================================================================== */

function Saldo({
  rotulo,
  valor,
  detalle,
  tono,
  oculto,
  ancho,
}: {
  rotulo: string;
  valor: string;
  detalle?: string;
  tono?: 'up' | 'down' | 'neutral';
  oculto?: boolean;
  ancho?: number;
}) {
  const { colors } = useTheme();
  const tinta =
    tono === 'up' ? colors.up : tono === 'down' ? colors.down : colors.text;

  return (
    <View style={{ minWidth: ancho ?? 120, flexGrow: 1, flexBasis: ancho ?? 120, gap: 2 }}>
      <Text
        style={[TIPO.rotulo, { color: colors.textSecondary, textTransform: 'uppercase' }]}
        numberOfLines={1}
      >
        {rotulo}
      </Text>
      <Text style={[TIPO.cifra, { color: tinta, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
        {oculto ? '••••••' : valor}
      </Text>
      {detalle ? (
        <Text style={[TIPO.micro, { color: colors.textSecondary }]} numberOfLines={1}>
          {oculto ? '••••' : detalle}
        </Text>
      ) : null}
    </View>
  );
}

/* ==========================================================================
 * Franja de la cuenta
 * ======================================================================== */

export function CabeceraCuenta({
  saldos,
  divisa = 'USD',
  oculto,
  onOcultar,
  onEfectivo,
  onOperacion,
}: {
  saldos: SaldosCuenta;
  divisa?: string;
  oculto: boolean;
  onOcultar: () => void;
  onEfectivo: () => void;
  onOperacion: () => void;
}) {
  const { colors, isDark } = useTheme();

  const nav = saldos.total_portfolio_value;
  const gana = saldos.total_profit_loss >= 0;
  const tonoPL = saldos.total_profit_loss === 0 ? 'neutral' : gana ? 'up' : 'down';

  /**
   * La comprobación del desglose.
   *
   * Efectivo + valor de mercado tiene que dar el valor liquidativo. Si no da,
   * la cabecera lo dice en vez de enseñar una cifra grande que no cuadra con
   * sus propios sumandos. Una tolerancia de un céntimo absorbe el redondeo.
   */
  const suma = saldos.cash_available + saldos.current_value;
  const descuadre = Math.abs(suma - nav) > 0.01 ? suma - nav : null;

  return (
    <View
      style={{
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        overflow: 'hidden',
      }}
    >
      {/* ---------- Valor liquidativo ---------- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 14,
          rowGap: 10,
          padding: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: isDark ? colors.surface : colors.surfaceSunken,
        }}
      >
        <View style={{ gap: 2, minWidth: 190, flexGrow: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              style={[TIPO.rotulo, { color: colors.textSecondary, textTransform: 'uppercase' }]}
            >
              Valor liquidativo
            </Text>
            <Text style={[TIPO.micro, { color: colors.textSecondary }]}>{divisa}</Text>
          </View>
          <Text
            style={[TIPO.principal, { color: colors.text, fontVariant: ['tabular-nums'] }]}
            numberOfLines={1}
          >
            {oculto ? '••••••••' : dinero(nav)}
          </Text>
          {/* El desglose, junto a la cifra que compone. Nunca a pie de página. */}
          <Text style={[TIPO.micro, { color: colors.textSecondary }]} numberOfLines={2}>
            {oculto
              ? '•••'
              : `${dinero(saldos.cash_available)} en efectivo + ${dinero(
                  saldos.current_value,
                )} en posiciones`}
          </Text>
          {descuadre !== null ? (
            <Text style={[TIPO.micro, { color: colors.down }]}>
              El desglose no cuadra con el total por {dinero(descuadre, true)}.
            </Text>
          ) : null}
        </View>

        {/* Resultado total, con su porcentaje sobre lo invertido */}
        <View style={{ gap: 2, minWidth: 170, flexGrow: 1 }}>
          <Text style={[TIPO.rotulo, { color: colors.textSecondary, textTransform: 'uppercase' }]}>
            Resultado total
          </Text>
          <Text
            style={[
              TIPO.principal,
              { color: gana ? colors.up : colors.down, fontVariant: ['tabular-nums'] },
            ]}
            numberOfLines={1}
          >
            {oculto ? '••••••' : dinero(saldos.total_profit_loss, true)}
          </Text>
          <Text style={[TIPO.micro, { color: colors.textSecondary }]} numberOfLines={1}>
            {oculto
              ? '•••'
              : `${pct(saldos.total_profit_loss_percent)} sobre ${dinero(
                  saldos.total_invested,
                )} invertidos`}
          </Text>
        </View>

        {/* Acciones. Van arriba a la derecha, donde se buscan. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <BotonCuenta icono="add" texto="Operación" onPress={onOperacion} destacado />
          <BotonCuenta icono="swap-vertical" texto="Efectivo" onPress={onEfectivo} />
          <BotonCuenta
            icono={oculto ? 'eye-off' : 'eye'}
            texto={oculto ? 'Mostrar' : 'Ocultar'}
            onPress={onOcultar}
          />
        </View>
      </View>

      {/* ---------- Saldos que componen el total ---------- */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 14,
          rowGap: 12,
          padding: 14,
        }}
      >
        <Saldo rotulo="Efectivo disponible" valor={dinero(saldos.cash_available)} oculto={oculto} />
        <Saldo
          rotulo="Valor de posiciones"
          valor={dinero(saldos.current_value)}
          detalle={`coste ${dinero(saldos.total_invested)}`}
          oculto={oculto}
        />
        {/* La distinción que más se confunde de toda la pantalla, separada y
            rotulada: lo no realizado no es dinero que tengas. */}
        <Saldo
          rotulo="No realizado"
          valor={dinero(saldos.unrealized_gains, true)}
          detalle="si vendieras hoy"
          tono={saldos.unrealized_gains >= 0 ? 'up' : 'down'}
          oculto={oculto}
        />
        <Saldo
          rotulo="Realizado"
          valor={dinero(saldos.realized_gains, true)}
          detalle="ventas ya cerradas"
          tono={saldos.realized_gains >= 0 ? 'up' : 'down'}
          oculto={oculto}
        />
        <Saldo
          rotulo="Aportado"
          valor={dinero(saldos.total_deposits - saldos.total_withdrawals)}
          detalle={`${dinero(saldos.total_deposits)} dentro · ${dinero(
            saldos.total_withdrawals,
          )} fuera`}
          oculto={oculto}
        />
        <Saldo
          rotulo="Rentabilidad"
          valor={pct(saldos.total_profit_loss_percent)}
          tono={tonoPL as any}
          oculto={oculto}
          ancho={100}
        />
      </View>
    </View>
  );
}

function BotonCuenta({
  icono,
  texto,
  onPress,
  destacado,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  texto: string;
  onPress: () => void;
  destacado?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={texto}
      style={({ pressed, hovered }: any) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          // 36 px: el mínimo cómodo con ratón sin romper la densidad. En
          // táctil lo sube el contenedor de la pantalla.
          minHeight: 36,
          paddingHorizontal: 11,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: destacado ? colors.primary : colors.border,
          backgroundColor: destacado
            ? colors.primary
            : pressed || hovered
              ? colors.surfaceSunken
              : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
      ]}
    >
      <Ionicons
        name={icono}
        size={14}
        color={destacado ? colors.inkOnAccent : colors.textSecondary}
      />
      <Text
        style={[
          TIPO.rotulo,
          { color: destacado ? colors.inkOnAccent : colors.text, textTransform: 'uppercase' },
        ]}
      >
        {texto}
      </Text>
    </Pressable>
  );
}

/* ==========================================================================
 * Rejilla de posiciones
 * ======================================================================== */

type Columna =
  | 'ticker'
  | 'total_shares'
  | 'average_cost'
  | 'current_price'
  | 'profit_loss_percent'
  | 'current_value'
  | 'profit_loss'
  | 'weight_percent';

const COLUMNAS: { clave: Columna; texto: string; ancho: number; derecha?: boolean }[] = [
  { clave: 'ticker', texto: 'Símbolo', ancho: 168 },
  { clave: 'total_shares', texto: 'Posición', ancho: 84, derecha: true },
  { clave: 'average_cost', texto: 'Coste medio', ancho: 96, derecha: true },
  { clave: 'current_price', texto: 'Último', ancho: 88, derecha: true },
  { clave: 'profit_loss_percent', texto: 'Var. %', ancho: 84, derecha: true },
  { clave: 'current_value', texto: 'Valor mercado', ancho: 116, derecha: true },
  { clave: 'profit_loss', texto: 'P&L no realizado', ancho: 132, derecha: true },
  { clave: 'weight_percent', texto: '% cartera', ancho: 108, derecha: true },
];

const ANCHO_REJILLA = COLUMNAS.reduce((s, c) => s + c.ancho, 0);

export function PosicionesCuenta({
  posiciones,
  oculto,
  onPulsar,
}: {
  posiciones: PosicionCartera[];
  oculto: boolean;
  onPulsar?: (p: PosicionCartera) => void;
}) {
  const { colors, isDark } = useTheme();
  const [orden, setOrden] = useState<Columna>('current_value');
  const [desc, setDesc] = useState(true);

  const ordenadas = useMemo(() => {
    const copia = [...posiciones];
    copia.sort((a, b) => {
      const va = a[orden];
      const vb = b[orden];
      if (typeof va === 'string' || typeof vb === 'string') {
        return desc
          ? String(vb).localeCompare(String(va))
          : String(va).localeCompare(String(vb));
      }
      return desc ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });
    return copia;
  }, [posiciones, orden, desc]);

  /** El mayor peso, para escalar la barra de concentración. */
  const pesoMax = Math.max(1, ...posiciones.map((p) => p.weight_percent || 0));

  const totales = useMemo(
    () =>
      posiciones.reduce(
        (acc, p) => ({
          valor: acc.valor + (p.current_value || 0),
          coste: acc.coste + (p.total_invested || 0),
          pl: acc.pl + (p.profit_loss || 0),
        }),
        { valor: 0, coste: 0, pl: 0 },
      ),
    [posiciones],
  );

  function ordenar(c: Columna) {
    if (c === orden) setDesc((d) => !d);
    else {
      setOrden(c);
      setDesc(true);
    }
  }

  return (
    <View
      style={{
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        overflow: 'hidden',
      }}
    >
      {/*
        La rejilla desplaza EN HORIZONTAL en pantallas estrechas en vez de
        encoger las columnas. Ocho columnas de cifras a 360 px no dan una
        tabla pequeña: dan ocho columnas ilegibles, que es exactamente el
        problema que el resto del producto ya tiene documentado.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        style={{ flexGrow: 0 }}
        /**
         * `flexGrow: 1` en el CONTENIDO, no sólo en el contenedor.
         *
         * Sin esto la rejilla se queda en su ancho mínimo —los 936 px que
         * suman las ocho columnas— y deja en blanco el resto del espacio
         * disponible: la tabla se lee como si estuviera cortada. Con él se
         * estira hasta llenar el ancho cuando sobra, y sigue desplazándose
         * cuando falta.
         */
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View style={{ minWidth: ANCHO_REJILLA, flexGrow: 1 }}>
          {/* ---------- Cabecera ---------- */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 30,
              paddingHorizontal: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: isDark ? colors.surface : colors.surfaceSunken,
            }}
          >
            {COLUMNAS.map((c) => {
              const activa = c.clave === orden;
              return (
                <Pressable
                  key={c.clave}
                  onPress={() => ordenar(c.clave)}
                  // `columnheader` no existe en el contrato de accesibilidad
                  // de React Native. La cabecera ES un botón —ordena— y así se
                  // anuncia; el `accessibilityLabel` dice qué hace.
                  accessibilityRole="button"
                  accessibilityLabel={`Ordenar por ${c.texto}`}
                  style={({ hovered }: any) => [
                    {
                      width: c.ancho,
                      // La última columna se estira con el sobrante. Repartirlo
                      // entre todas descuadraría la alineación de las cifras.
                      flexGrow: c.clave === 'weight_percent' ? 1 : 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: c.derecha ? 'flex-end' : 'flex-start',
                      gap: 3,
                      paddingVertical: 6,
                      opacity: hovered ? 0.75 : 1,
                    },
                    Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                  ]}
                >
                  <Text
                    style={[
                      TIPO.rotulo,
                      {
                        color: activa ? colors.primary : colors.textSecondary,
                        textTransform: 'uppercase',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {c.texto}
                  </Text>
                  {activa ? (
                    <Ionicons
                      name={desc ? 'caret-down' : 'caret-up'}
                      size={9}
                      color={colors.primary}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* ---------- Filas ---------- */}
          {ordenadas.map((p, i) => {
            const gana = p.profit_loss >= 0;
            const tinta = p.profit_loss === 0 ? colors.text : gana ? colors.up : colors.down;
            return (
              <Pressable
                key={p.ticker}
                onPress={onPulsar ? () => onPulsar(p) : undefined}
                accessibilityRole={onPulsar ? 'button' : undefined}
                accessibilityLabel={`${p.ticker}, ${acciones(p.total_shares)} acciones`}
                style={({ hovered }: any) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    minHeight: FILA,
                    paddingHorizontal: 10,
                    borderBottomWidth: i === ordenadas.length - 1 ? 0 : 1,
                    borderBottomColor: colors.border,
                    backgroundColor: hovered
                      ? isDark
                        ? colors.surface
                        : colors.surfaceSunken
                      : 'transparent',
                  },
                  Platform.OS === 'web' && onPulsar ? ({ cursor: 'pointer' } as any) : null,
                ]}
              >
                {/* Símbolo y nombre */}
                <View style={{ width: COLUMNAS[0].ancho, paddingRight: 8, gap: 1 }}>
                  <Text style={[TIPO.dato, { color: colors.text }]} numberOfLines={1}>
                    {p.ticker}
                  </Text>
                  <Text style={[TIPO.micro, { color: colors.textSecondary }]} numberOfLines={1}>
                    {p.company_name || p.sector || '—'}
                  </Text>
                </View>

                <Celda ancho={COLUMNAS[1].ancho} texto={acciones(p.total_shares)} />
                <Celda ancho={COLUMNAS[2].ancho} texto={dinero(p.average_cost)} oculto={oculto} />
                <Celda ancho={COLUMNAS[3].ancho} texto={dinero(p.current_price)} fuerte />
                <Celda
                  ancho={COLUMNAS[4].ancho}
                  texto={pct(p.profit_loss_percent)}
                  color={tinta}
                />
                <Celda
                  ancho={COLUMNAS[5].ancho}
                  texto={dinero(p.current_value)}
                  oculto={oculto}
                  fuerte
                />
                <Celda
                  ancho={COLUMNAS[6].ancho}
                  texto={dinero(p.profit_loss, true)}
                  color={tinta}
                  oculto={oculto}
                  fuerte
                />

                {/* El peso, dibujado. La concentración de la cartera se ve
                    sin tener que sumar porcentajes de ocho filas. */}
                <View style={{ width: COLUMNAS[7].ancho, flexGrow: 1, alignItems: 'flex-end', gap: 3 }}>
                  <Text
                    style={[
                      TIPO.dato,
                      { color: colors.text, fontVariant: ['tabular-nums'] },
                    ]}
                    numberOfLines={1}
                  >
                    {pct(p.weight_percent, false)}
                  </Text>
                  {/* Ancho FIJO, aunque la columna se estire con el
                      sobrante de la rejilla. Con `width: '100%'` la barra
                      cruzaba la pantalla entera y dejaba de leerse como una
                      medida: parecía un subrayado. */}
                  <View
                    style={{
                      height: 3,
                      width: 88,
                      borderRadius: 2,
                      backgroundColor: colors.border,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        height: 3,
                        width: `${Math.min(100, ((p.weight_percent || 0) / pesoMax) * 100)}%`,
                        borderRadius: 2,
                        backgroundColor: colors.primary,
                      }}
                    />
                  </View>
                </View>
              </Pressable>
            );
          })}

          {/* ---------- Totales ----------
              Cierran la rejilla porque son la suma de lo que hay encima y
              tienen que poder comprobarse contra ella. Si el total no cuadra
              con las filas, se ve aquí. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 34,
              paddingHorizontal: 10,
              borderTopWidth: 2,
              borderTopColor: colors.border,
              backgroundColor: isDark ? colors.surface : colors.surfaceSunken,
            }}
          >
            <View style={{ width: COLUMNAS[0].ancho }}>
              <Text
                style={[TIPO.rotulo, { color: colors.textSecondary, textTransform: 'uppercase' }]}
              >
                {posiciones.length} posicion{posiciones.length === 1 ? '' : 'es'}
              </Text>
            </View>
            <View style={{ width: COLUMNAS[1].ancho + COLUMNAS[2].ancho + COLUMNAS[3].ancho }} />
            <Celda ancho={COLUMNAS[4].ancho} texto="" />
            <Celda ancho={COLUMNAS[5].ancho} texto={dinero(totales.valor)} oculto={oculto} fuerte />
            <Celda
              ancho={COLUMNAS[6].ancho}
              texto={dinero(totales.pl, true)}
              color={totales.pl >= 0 ? colors.up : colors.down}
              oculto={oculto}
              fuerte
            />
            <View style={{ width: COLUMNAS[7].ancho, flexGrow: 1, alignItems: 'flex-end' }}>
              <Celda ancho={COLUMNAS[7].ancho} texto={pct(100, false)} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Celda({
  ancho,
  texto,
  color,
  oculto,
  fuerte,
}: {
  ancho: number;
  texto: string;
  color?: string;
  oculto?: boolean;
  fuerte?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ width: ancho, alignItems: 'flex-end', paddingLeft: 6 }}>
      <Text
        style={[
          TIPO.dato,
          {
            color: color ?? colors.text,
            fontWeight: fuerte ? '700' : '500',
            // Alineación por el punto decimal: sin variante tabular las
            // columnas de cifras bailan y dejan de poder compararse de un
            // vistazo, que es lo único que una rejilla aporta sobre una lista.
            fontVariant: ['tabular-nums'],
          },
        ]}
        numberOfLines={1}
      >
        {oculto && texto !== '' ? '••••' : texto}
      </Text>
    </View>
  );
}

/* ==========================================================================
 * Estado vacío
 * ======================================================================== */

export function CuentaVacia({ onOperacion }: { onOperacion: () => void }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: 8,
        paddingVertical: 40,
        paddingHorizontal: 20,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <Ionicons name="layers-outline" size={34} color={colors.textSecondary} />
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
        Ninguna posición abierta
      </Text>
      <Text
        style={[TIPO.micro, { color: colors.textSecondary, textAlign: 'center', maxWidth: 420 }]}
      >
        Registra una compra y aparecerá aquí con su coste medio, su valor de mercado y su peso en
        la cartera. El efectivo se gestiona aparte, desde «Efectivo».
      </Text>
      <View style={{ paddingTop: 6 }}>
        <BotonCuenta icono="add" texto="Registrar operación" onPress={onOperacion} destacado />
      </View>
    </View>
  );
}
