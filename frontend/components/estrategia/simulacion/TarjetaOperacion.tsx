/**
 * ============================================================================
 * Tarjeta de operación simulada
 * ============================================================================
 * El panel de operaciones de MetaTrader, con la métrica de este terminal.
 *
 * **Aquí no se calcula nada.** Ni P&L, ni porcentajes, ni distancias: todo
 * llega ya resuelto de `simulacion.tarjeta()` en el backend, que es puro y
 * tiene 86 pruebas detrás. La regla del encargo —«la lógica de trading no debe
 * estar mezclada con los componentes visuales»— se cumple mejor así: un P&L
 * calculado en dos sitios acaba dando dos cifras, y la de pantalla no es la
 * que cuadra el balance.
 *
 * La única cuenta que sí vive aquí es el RELOJ, y es presentación pura: los
 * segundos abiertos se derivan de `ahora` menos `abierta_ts`, sin ninguna
 * petición. Pedirle al servidor la hora cada segundo sería sondear para saber
 * qué hora es.
 *
 * --------------------------------------------------------------------------
 * Dos decisiones de dibujo que conviene no deshacer
 * --------------------------------------------------------------------------
 * 1. **El P&L % dice sobre qué base está.** Con apalancamiento 1× el
 *    movimiento del precio y el rendimiento del capital coinciden; por encima
 *    difieren por el factor entero. Un «+0,22 %» sin base es el mismo fallo
 *    que un score sin su escala, y este proyecto ya lo arregló una vez.
 * 2. **La barra sitúa stop, entrada, precio y objetivo en la MISMA escala de
 *    precio.** Si el objetivo de un corto cayera por encima de la entrada, se
 *    vería en el dibujo antes que en ninguna tabla. Es la misma idea que ya
 *    resuelve `PlanPosicion`, aquí sobre una posición que sí existe.
 */

import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../../contexts/ThemeContext';
import { toneColors } from '../../../theme/tokens';
import { cifra, dinero, duracion, entero, hora, porcentaje } from '../../../lib/estrategia/formato';
import { MotivoCierre, TarjetaSim } from '../../../lib/simulacion/tipos';
import { BotonTerminal, Chip, Cifra, D, Rotulo, T } from '../Terminal';

/* ==========================================================================
 * Vocabulario en pantalla
 * ======================================================================== */

const MOTIVO_ES: Record<MotivoCierre, { texto: string; tono: 'up' | 'down' | 'caution' | 'neutral' }> = {
  TAKE_PROFIT: { texto: 'Objetivo alcanzado', tono: 'up' },
  STOP_LOSS: { texto: 'Stop loss', tono: 'down' },
  MANUAL_CLOSE: { texto: 'Cierre manual', tono: 'neutral' },
  STRATEGY_EXIT: { texto: 'Salida por estrategia', tono: 'caution' },
  END_OF_SESSION: { texto: 'Fin de sesión', tono: 'neutral' },
  LIQUIDACION: { texto: 'Liquidación por margen', tono: 'down' },
};

/** `00:18:32`, como lo enseña un terminal de órdenes. */
function reloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* ==========================================================================
 * Escala de precio — stop · entrada · actual · objetivo
 * ======================================================================== */

const CARRIL = { arriba: 15, barra: 6, abajo: 16 };
const ANCHO_MARCA = 44;

function Marca({ etiqueta, t, color, arriba }: {
  etiqueta: string; t: number; color: string; arriba?: boolean;
}) {
  const p = Math.max(0, Math.min(1, t));
  /**
   * El anclaje se desliza con la posición en vez de centrarse siempre. Con
   * `translateX: -mitad` la etiqueta del extremo izquierdo se sale 22 px por
   * la izquierda y la placa recorta: se leían «top» y «Objeti». Es el mismo
   * arreglo que ya lleva `PlanPosicion`, y por la misma razón.
   */
  return (
    <View
      style={{
        position: 'absolute',
        left: `${p * 100}%`,
        transform: [{ translateX: -ANCHO_MARCA * p }],
        width: ANCHO_MARCA,
        top: arriba ? 0 : CARRIL.arriba + CARRIL.barra + 2,
      }}
      pointerEvents="none"
    >
      <Text
        style={[T.rotulo, { fontSize: 8, color, textAlign: p < 0.2 ? 'left' : p > 0.8 ? 'right' : 'center' }]}
        numberOfLines={1}
      >
        {etiqueta}
      </Text>
    </View>
  );
}

function EscalaPrecio({ op }: { op: TarjetaSim }) {
  const { colors, palette, radius, hairline } = useTheme();
  const referencia = op.estado === 'OPEN' ? op.precio_actual : op.salida ?? op.entrada;

  const puntos = [op.entrada, referencia, op.stop_loss, op.take_profit].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (puntos.length < 2) return null;

  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const rango = max - min || 1;
  const t = (v: number) => (v - min) / rango;

  // La zona de riesgo va de la entrada al stop y la de beneficio de la entrada
  // al objetivo, SEA CUAL SEA el lado: en un corto están intercambiadas en el
  // eje, y pintarlas por posición y no por papel las invertiría.
  const zona = (a: number | null, b: number, color: string) =>
    a === null ? null : (
      <View
        key={color}
        style={{
          position: 'absolute',
          left: `${Math.min(t(a), t(b)) * 100}%`,
          width: `${Math.abs(t(b) - t(a)) * 100}%`,
          top: 0,
          bottom: 0,
          backgroundColor: color,
        }}
      />
    );

  return (
    <View style={{ height: CARRIL.arriba + CARRIL.barra + CARRIL.abajo, paddingTop: CARRIL.arriba }}>
      <View
        style={{
          height: CARRIL.barra,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceSunken,
          borderWidth: hairline,
          borderColor: colors.rule,
          overflow: 'hidden',
        }}
      >
        {zona(op.stop_loss, op.entrada, palette.downWash)}
        {zona(op.take_profit, op.entrada, palette.upWash)}
        <View
          style={{
            position: 'absolute',
            left: `${t(referencia) * 100}%`,
            top: -2,
            bottom: -2,
            width: 2,
            backgroundColor: op.estado === 'OPEN' ? colors.accent : colors.inkMuted,
          }}
        />
      </View>
      {op.stop_loss !== null ? (
        <Marca etiqueta="Stop" t={t(op.stop_loss)} color={palette.down} arriba />
      ) : null}
      <Marca etiqueta="Entrada" t={t(op.entrada)} color={colors.inkMuted} />
      <Marca
        etiqueta={op.estado === 'OPEN' ? 'Actual' : 'Salida'}
        t={t(referencia)}
        color={op.estado === 'OPEN' ? colors.accent : colors.ink}
        arriba
      />
      {op.take_profit !== null ? (
        <Marca etiqueta="Objetivo" t={t(op.take_profit)} color={palette.up} />
      ) : null}
    </View>
  );
}

/* ==========================================================================
 * Tarjeta
 * ======================================================================== */

export default function TarjetaOperacion({
  op,
  ahora,
  onCerrar,
  compacta,
}: {
  op: TarjetaSim;
  /** Epoch en segundos, a 1 Hz desde el hook. No cuesta ninguna petición. */
  ahora: number;
  onCerrar?: (id: string) => void;
  compacta?: boolean;
}) {
  const { colors, palette, radius, hairline } = useTheme();
  const [confirmando, setConfirmando] = useState(false);

  const abierta = op.estado === 'OPEN';
  const largo = op.direccion === 'long';
  const tonoLado = largo ? ('up' as const) : ('down' as const);
  const { fg: colorLado, wash: washLado } = toneColors(palette, tonoLado);

  // El resultado manda el color de la cifra; la dirección manda el del lado.
  // Son dos lecturas distintas y pintarlas del mismo color las confundiría:
  // un corto con beneficio es rojo por dirección y verde por resultado.
  const resultado = abierta ? op.pnl : op.resultado;
  const tonoResultado =
    resultado === null || resultado === 0 ? ('neutral' as const) : resultado > 0 ? ('up' as const) : ('down' as const);

  // `ahora` vale 0 hasta que el reloj arranca en cliente (ver `useSimulacion`:
  // leer la hora en el render rompe la hidratación). Mientras tanto manda la
  // duración que ya calculó el servidor, que es correcta aunque no avance.
  const segundos = abierta && ahora > 0 ? Math.max(0, ahora - op.abierta_ts) : op.segundos_abierta;
  const motivo = op.motivo_cierre ? MOTIVO_ES[op.motivo_cierre] : null;
  const apalancada = op.apalancamiento > 1;

  return (
    <View
      style={{
        borderRadius: radius.sm,
        borderWidth: hairline,
        borderColor: abierta ? colorLado : colors.rule,
        backgroundColor: colors.surface,
        overflow: 'hidden',
        opacity: abierta ? 1 : 0.92,
      }}
      accessibilityLabel={`Operación ${op.id}, ${largo ? 'larga' : 'corta'} en ${op.simbolo}, ${op.estado}`}
    >
      {/* ---------- Cabecera: símbolo · lado · identificador ---------- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: D.pad,
          paddingVertical: 5,
          backgroundColor: abierta ? washLado : colors.surfaceSunken,
          borderBottomWidth: hairline,
          borderBottomColor: colors.rule,
        }}
      >
        <Text style={[T.datoFuerte, { color: colors.ink, fontSize: 12 }]} numberOfLines={1}>
          {op.simbolo}
        </Text>
        <Chip
          texto={largo ? 'LONG' : 'SHORT'}
          tono={tonoLado}
          icono={largo ? 'trending-up' : 'trending-down'}
        />
        {op.origen === 'robot' ? <Chip texto="Robot" tono="accent" icono="hardware-chip-outline" /> : null}
        {apalancada ? <Chip texto={`${op.apalancamiento}×`} tono="caution" /> : null}
        <View style={{ flex: 1 }} />
        <Cifra valor={op.id} escala="micro" />
      </View>

      <View style={{ padding: D.pad, gap: 7 }}>
        {/* ---------- Estado ---------- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Rotulo>Estado</Rotulo>
          <Chip
            texto={abierta ? 'OPEN' : 'CLOSED'}
            tono={abierta ? 'accent' : 'neutral'}
          />
          {motivo ? <Chip texto={motivo.texto} tono={motivo.tono} /> : null}
        </View>

        {/* ---------- Precios ---------- */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 6 }}>
          {(
            [
              ['Entrada', cifra(op.entrada, 4), 'neutral'],
              abierta
                ? ['Precio actual', cifra(op.precio_actual, 4), 'accent']
                : ['Salida', cifra(op.salida, 4), 'neutral'],
              ['Tamaño', entero(op.cantidad), 'neutral'],
              ['Valor posición', dinero(op.valor_posicion), 'neutral'],
              ['Stop loss', cifra(op.stop_loss, 4), 'down'],
              ['Take profit', cifra(op.take_profit, 4), 'up'],
            ] as const
          ).map(([rot, val, tono]) => (
            <View key={rot} style={{ flexBasis: compacta ? '45%' : '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
              <Rotulo>{rot}</Rotulo>
              <Cifra valor={val} tono={tono as any} escala="datoFuerte" />
            </View>
          ))}
        </View>

        <EscalaPrecio op={op} />

        {/* ---------- Resultado ---------- */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 8,
            paddingTop: 5,
            borderTopWidth: hairline,
            borderTopColor: colors.rule,
          }}
        >
          <View style={{ gap: 1, minWidth: 0, flexShrink: 1 }}>
            <Rotulo>{abierta ? 'P&L abierto' : 'Resultado'}</Rotulo>
            <Cifra valor={dinero(resultado, true)} tono={tonoResultado} escala="medida" />
            {/* La base del porcentaje, junto a la cifra. Nunca a pie de tarjeta. */}
            <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
              {porcentaje(op.pnl_pct_precio, 2, true) ?? '—'} sobre el precio
              {apalancada && op.pnl_pct_capital !== null
                ? ` · ${porcentaje(op.pnl_pct_capital, 2, true)} sobre tu capital`
                : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 1 }}>
            <Rotulo>Tiempo {abierta ? 'abierto' : 'en posición'}</Rotulo>
            <Cifra valor={reloj(segundos)} tono={abierta ? 'accent' : 'neutral'} escala="medida" />
          </View>
        </View>

        {/* ---------- Riesgo y distancias ---------- */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 5 }}>
          {(
            [
              [
                'Riesgo abierto',
                op.riesgo_abierto !== null ? dinero(op.riesgo_abierto) : null,
                'down',
              ],
              ['Riesgo / beneficio', cifra(op.riesgo_beneficio, 2), 'neutral'],
              abierta
                ? [
                    'Al stop',
                    op.distancia_stop ? porcentaje(op.distancia_stop.pct, 2) : null,
                    'down',
                  ]
                : ['Comisiones', dinero(op.comisiones), 'neutral'],
              abierta
                ? [
                    'Al objetivo',
                    op.distancia_objetivo ? porcentaje(op.distancia_objetivo.pct, 2) : null,
                    'up',
                  ]
                : [
                    'Abierta',
                    hora(op.abierta_ts * 1000),
                    'neutral',
                  ],
            ] as const
          ).map(([rot, val, tono]) => (
            <View key={rot} style={{ flexBasis: '22%', flexGrow: 1, minWidth: 0, gap: 1 }}>
              <Rotulo>{rot}</Rotulo>
              <Cifra valor={val} tono={tono as any} escala="dato" />
            </View>
          ))}
        </View>

        {/* Coste de préstamo del corto: se enseña SIEMPRE que exista, porque es
            un supuesto y no una medida — yfinance no publica la tasa real. */}
        {op.direccion === 'short' && op.coste_prestamo > 0 ? (
          <Text style={[T.micro, { color: colors.inkFaint }]}>
            Incluye {dinero(op.coste_prestamo)} de coste de préstamo estimado. La tasa real no la
            publica el proveedor: es un supuesto configurable, no una medida.
          </Text>
        ) : null}

        {/* Nivel de liquidación: sólo con apalancamiento, y con su cifra. */}
        {op.nivel_liquidacion !== null ? (
          <Text style={[T.micro, { color: palette.caution }]}>
            Liquidación estimada en {cifra(op.nivel_liquidacion, 4)}: ahí la pérdida latente se
            come el margen retenido ({dinero(op.margen)}).
          </Text>
        ) : null}

        {/* ---------- Cerrar ---------- */}
        {abierta && onCerrar ? (
          confirmando ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <BotonTerminal texto="Cancelar" relleno onPress={() => setConfirmando(false)} />
              <BotonTerminal
                texto="Sí, cerrar"
                tono="down"
                icono="close-circle"
                relleno
                onPress={() => {
                  setConfirmando(false);
                  onCerrar(op.id);
                }}
              />
            </View>
          ) : (
            <BotonTerminal
              texto="Cerrar operación"
              tono="down"
              icono="close-circle-outline"
              relleno
              onPress={() => setConfirmando(true)}
            />
          )
        ) : null}
      </View>
    </View>
  );
}

/* ==========================================================================
 * Fila compacta — para las tablas del panel de operaciones
 * ======================================================================== */

export function FilaOperacion({
  op,
  ahora,
  onCerrar,
}: {
  op: TarjetaSim;
  ahora: number;
  onCerrar?: (id: string) => void;
}) {
  const { colors, palette, hairline } = useTheme();
  const abierta = op.estado === 'OPEN';
  const largo = op.direccion === 'long';
  const resultado = abierta ? op.pnl : op.resultado;
  const tono = resultado === null || resultado === 0 ? 'neutral' : resultado > 0 ? 'up' : 'down';
  const segundos = abierta && ahora > 0 ? Math.max(0, ahora - op.abierta_ts) : op.segundos_abierta;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: D.fila,
        paddingVertical: 3,
        borderBottomWidth: hairline,
        borderBottomColor: colors.rule,
      }}
    >
      <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: largo ? palette.up : palette.down }} />
      <View style={{ width: 104, gap: 1 }}>
        <Cifra valor={op.id} escala="micro" />
        <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
          {op.simbolo} · {largo ? 'LONG' : 'SHORT'}
          {op.origen === 'robot' ? ' · robot' : ''}
        </Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(
          [
            ['Ent.', cifra(op.entrada, 2)],
            [abierta ? 'Act.' : 'Sal.', cifra(abierta ? op.precio_actual : op.salida, 2)],
            ['Cant.', entero(op.cantidad)],
            ['SL', cifra(op.stop_loss, 2)],
            ['TP', cifra(op.take_profit, 2)],
          ] as const
        ).map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', gap: 2, alignItems: 'baseline' }}>
            <Text style={[T.micro, { color: colors.inkFaint }]}>{k}</Text>
            <Cifra valor={v} escala="dato" />
          </View>
        ))}
      </View>
      <View style={{ alignItems: 'flex-end', width: 92, gap: 1 }}>
        <Cifra valor={dinero(resultado, true)} tono={tono as any} escala="datoFuerte" />
        <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
          {porcentaje(op.pnl_pct_precio, 2, true) ?? '—'} · {duracion(segundos) ?? '—'}
        </Text>
      </View>
      {abierta && onCerrar ? (
        <Pressable
          onPress={() => onCerrar(op.id)}
          accessibilityRole="button"
          accessibilityLabel={`Cerrar ${op.id}`}
          style={({ hovered }: any) => [
            { padding: 5, opacity: hovered ? 1 : 0.65 },
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
          ]}
        >
          <Ionicons name="close-circle-outline" size={14} color={palette.down} />
        </Pressable>
      ) : (
        <View style={{ width: 92, alignItems: 'flex-end' }}>
          <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
            {op.motivo_cierre ? MOTIVO_ES[op.motivo_cierre].texto : '—'}
          </Text>
        </View>
      )}
    </View>
  );
}
