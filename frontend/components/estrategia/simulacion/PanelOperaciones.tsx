/**
 * ============================================================================
 * Panel de operaciones · resumen de cuenta
 * ============================================================================
 * **Tres secciones, no dos.** El encargo pedía «operaciones abiertas» e
 * «historial»; hacen falta TRES porque una orden pendiente no es ninguna de las
 * dos cosas:
 *
 *     ÓRDENES PENDIENTES   la intención. Todavía no hay posición.
 *     POSICIONES ABIERTAS  la consecuencia, viva.
 *     HISTORIAL            la consecuencia, terminada.
 *
 * Meter las pendientes en «abiertas» diría que hay una posición donde no la
 * hay, y el P&L de esa fila tendría que ser cero — que se lee como una
 * operación plana, no como una orden que aún no ha entrado.
 */

import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { toneColors } from '../../../theme/tokens';
import { cifra, dinero, entero, hora, porcentaje } from '../../../lib/estrategia/formato';
import {
  CuentaSim,
  EstadoOrdenSim,
  OrdenSim,
  TarjetaSim,
} from '../../../lib/simulacion/tipos';
import { BotonTerminal, Chip, Cifra, Conmutador, D, Placa, Rotulo, T } from '../Terminal';
import { FilaOperacion } from './TarjetaOperacion';

/* ==========================================================================
 * Órdenes
 * ======================================================================== */

const TONO_ORDEN: Record<EstadoOrdenSim, 'up' | 'down' | 'caution' | 'accent' | 'neutral'> = {
  PENDING: 'caution',
  FILLED: 'up',
  CANCELLED: 'neutral',
  REJECTED: 'down',
  EXPIRED: 'neutral',
};

function FilaOrden({ orden, onCancelar }: { orden: OrdenSim; onCancelar?: (id: string) => void }) {
  const { colors, palette, hairline } = useTheme();
  const largo = orden.direccion === 'long';

  return (
    <View
      style={{
        gap: 2,
        paddingVertical: 4,
        borderBottomWidth: hairline,
        borderBottomColor: colors.rule,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Cifra valor={orden.id} escala="micro" />
        <Chip texto={largo ? 'LONG' : 'SHORT'} tono={largo ? 'up' : 'down'} />
        <Chip texto={orden.tipo} />
        <Chip texto={orden.estado} tono={TONO_ORDEN[orden.estado]} />
        <View style={{ flex: 1 }} />
        <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
          {orden.simbolo} · {entero(orden.cantidad)} acc.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {(
          [
            [orden.tipo === 'LIMIT' ? 'Límite' : 'Ejecutada', cifra(
              orden.tipo === 'LIMIT' ? orden.precio_limite : orden.precio_ejecucion, 4,
            )],
            ['SL', cifra(orden.stop_loss, 4)],
            ['TP', cifra(orden.take_profit, 4)],
            ['Creada', hora(orden.creada_ts * 1000)],
          ] as const
        ).map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', gap: 3, alignItems: 'baseline' }}>
            <Text style={[T.micro, { color: colors.inkFaint }]}>{k}</Text>
            <Cifra valor={v} escala="dato" />
          </View>
        ))}
        {/* El puente hacia la consecuencia. Si no hay posición, se dice. */}
        <View style={{ flexDirection: 'row', gap: 3, alignItems: 'baseline' }}>
          <Text style={[T.micro, { color: colors.inkFaint }]}>Posición</Text>
          {orden.posicion_id ? (
            <Cifra valor={orden.posicion_id} escala="dato" tono="accent" />
          ) : (
            <Text style={[T.micro, { color: colors.noSignal }]}>
              {orden.estado === 'PENDING' ? 'aún no existe' : 'nunca existió'}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }} />
        {orden.estado === 'PENDING' && onCancelar ? (
          <BotonTerminal
            texto="Cancelar"
            icono="close"
            onPress={() => onCancelar(orden.id)}
          />
        ) : null}
      </View>

      {orden.motivo ? (
        <Text
          style={[T.micro, { color: orden.estado === 'REJECTED' ? palette.down : colors.inkFaint, lineHeight: 14 }]}
        >
          {orden.motivo}
        </Text>
      ) : null}
    </View>
  );
}

/* ==========================================================================
 * Panel
 * ======================================================================== */

type Pestana = 'abiertas' | 'pendientes' | 'historial' | 'ordenes';

export default function PanelOperaciones({
  abiertas,
  pendientes,
  historial,
  ordenes,
  ahora,
  onCerrar,
  onCancelar,
  cargando,
}: {
  abiertas: TarjetaSim[];
  pendientes: OrdenSim[];
  historial: TarjetaSim[];
  ordenes: OrdenSim[];
  ahora: number;
  onCerrar: (id: string) => void;
  onCancelar: (id: string) => void;
  cargando?: boolean;
}) {
  const { colors } = useTheme();
  const [pestana, setPestana] = useState<Pestana>('abiertas');

  const opciones = [
    { clave: 'abiertas' as const, texto: `Abiertas ${abiertas.length}` },
    { clave: 'pendientes' as const, texto: `Pendientes ${pendientes.length}` },
    { clave: 'historial' as const, texto: `Historial ${historial.length}` },
    { clave: 'ordenes' as const, texto: `Órdenes ${ordenes.length}` },
  ];

  const vacio = (texto: string) => (
    <Text style={[T.dato, { color: colors.noSignal, paddingVertical: 10 }]}>{texto}</Text>
  );

  return (
    <Placa
      titulo="Operaciones"
      derecha={<Conmutador opciones={opciones} activa={pestana} onChange={setPestana} compacto />}
    >
      <View style={{ gap: 2 }}>
        {pestana === 'abiertas' ? (
          abiertas.length ? (
            abiertas.map((op) => (
              <FilaOperacion key={op.id} op={op} ahora={ahora} onCerrar={onCerrar} />
            ))
          ) : (
            vacio(
              cargando
                ? 'Cargando…'
                : 'Ninguna posición abierta. Abre una desde «Operar» o enciende el robot.',
            )
          )
        ) : null}

        {pestana === 'pendientes' ? (
          pendientes.length ? (
            <>
              <Text style={[T.micro, { color: colors.inkFaint, paddingBottom: 3 }]}>
                Órdenes colocadas que todavía NO son posiciones. Sólo se convertirán en una si el
                precio alcanza su límite.
              </Text>
              {pendientes.map((o) => (
                <FilaOrden key={o.id} orden={o} onCancelar={onCancelar} />
              ))}
            </>
          ) : (
            vacio('Sin órdenes pendientes.')
          )
        ) : null}

        {pestana === 'historial' ? (
          historial.length ? (
            historial.map((op) => <FilaOperacion key={op.id} op={op} ahora={ahora} />)
          ) : (
            vacio('Sin operaciones cerradas todavía.')
          )
        ) : null}

        {pestana === 'ordenes' ? (
          ordenes.length ? (
            <>
              <Text style={[T.micro, { color: colors.inkFaint, paddingBottom: 3 }]}>
                Todas las órdenes, incluidas las rechazadas y las canceladas. Ninguna de ellas
                entra en el win rate: una orden que nunca creó posición no es una operación que
                ganar o perder.
              </Text>
              {ordenes.map((o) => (
                <FilaOrden key={o.id} orden={o} onCancelar={onCancelar} />
              ))}
            </>
          ) : (
            vacio('Todavía no se ha mandado ninguna orden.')
          )
        ) : null}
      </View>
    </Placa>
  );
}

/* ==========================================================================
 * Resumen de la cuenta
 * ======================================================================== */

export function ResumenCuenta({
  cuenta,
  robotActivo,
  onReiniciar,
}: {
  cuenta: CuentaSim | null;
  robotActivo: boolean;
  onReiniciar: (capital: number) => void;
}) {
  const { colors, palette, hairline, radius } = useTheme();
  const [confirmando, setConfirmando] = useState(false);

  if (!cuenta) {
    return (
      <Placa titulo="Cuenta de simulación">
        <Text style={[T.dato, { color: colors.noSignal }]}>Cargando la cuenta…</Text>
      </Placa>
    );
  }

  const tono = (v: number | null) => (v === null || v === 0 ? 'neutral' : v > 0 ? 'up' : 'down');

  /**
   * Balance y equity van JUNTOS y en grande, uno al lado del otro.
   *
   * Es la distinción que más se confunde en una cuenta de trading y la única
   * forma de que se lea es verlas separadas: el balance sólo se mueve al
   * cerrar; el equity se mueve con cada tick. Enseñar una sola haría creer que
   * el dinero ya está en la cuenta.
   */
  const { fg: colorEquity } = toneColors(palette, tono(cuenta.pnl_abierto));

  return (
    <Placa
      titulo="Cuenta de simulación"
      derecha={
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Chip texto="Paper" tono="caution" icono="flask-outline" />
          {robotActivo ? <Chip texto="Robot ON" tono="up" icono="hardware-chip-outline" /> : null}
        </View>
      }
    >
      <View style={{ gap: 8 }}>
        {/* ---------- Balance y equity ---------- */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <View
            style={{
              flexGrow: 1,
              minWidth: 120,
              gap: 1,
              padding: 8,
              borderRadius: radius.xs,
              borderWidth: hairline,
              borderColor: colors.rule,
              backgroundColor: colors.surfaceSunken,
            }}
          >
            <Rotulo>Balance</Rotulo>
            <Cifra valor={dinero(cuenta.balance)} escala="kpi" />
            <Text style={[T.micro, { color: colors.inkFaint }]}>Realizado, sólo cerradas</Text>
          </View>
          <View
            style={{
              flexGrow: 1,
              minWidth: 120,
              gap: 1,
              padding: 8,
              borderRadius: radius.xs,
              borderWidth: hairline,
              borderColor: cuenta.pnl_abierto === 0 ? colors.rule : colorEquity,
              backgroundColor: colors.surfaceSunken,
            }}
          >
            <Rotulo>Equity</Rotulo>
            <Cifra valor={dinero(cuenta.equity)} escala="kpi" tono={tono(cuenta.pnl_abierto) as any} />
            <Text style={[T.micro, { color: colors.inkFaint }]}>
              Balance {dinero(cuenta.pnl_abierto, true) ?? ''} de lo abierto
            </Text>
          </View>
        </View>

        {/* ---------- Rejilla de métricas ---------- */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 6 }}>
          {(
            [
              ['Capital inicial', dinero(cuenta.capital_inicial), 'neutral'],
              ['Libre para abrir', dinero(cuenta.libre), 'neutral'],
              ['Margen retenido', dinero(cuenta.margen_retenido), 'neutral'],
              ['P&L total', dinero(cuenta.pnl_total, true), tono(cuenta.pnl_total)],
              ['P&L total %', porcentaje(cuenta.pnl_total_pct, 2, true), tono(cuenta.pnl_total)],
              ['P&L del día', dinero(cuenta.pnl_dia, true), tono(cuenta.pnl_dia)],
              ['Operaciones', entero(cuenta.operaciones), 'neutral'],
              ['Ganadoras', entero(cuenta.ganadoras), 'up'],
              ['Perdedoras', entero(cuenta.perdedoras), 'down'],
              ['Win rate', porcentaje(cuenta.win_rate, 1), 'neutral'],
              [
                'Profit factor',
                cuenta.profit_factor === null
                  ? null
                  : Number.isFinite(cuenta.profit_factor)
                    ? cifra(cuenta.profit_factor, 2)
                    : '∞',
                'neutral',
              ],
              ['Expectativa', dinero(cuenta.expectativa, true), tono(cuenta.expectativa)],
              ['Drawdown máx.', porcentaje(cuenta.drawdown_max_pct, 2), 'down'],
              ['Mejor operación', dinero(cuenta.mejor, true), 'up'],
              ['Peor operación', dinero(cuenta.peor, true), 'down'],
            ] as const
          ).map(([rot, val, t]) => (
            <View key={rot} style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
              <Rotulo>{rot}</Rotulo>
              <Cifra valor={val} tono={t as any} escala="datoFuerte" />
            </View>
          ))}
        </View>

        {/* La muestra, junto a las cifras que dependen de ella. Un win rate de
            tres operaciones no significa nada y decirlo aquí evita leerlo como
            si significara algo. */}
        {cuenta.operaciones > 0 && cuenta.operaciones < 30 ? (
          <Text style={[T.micro, { color: palette.caution }]}>
            Sólo {cuenta.operaciones} operaciones cerradas. Con esta muestra el win rate y el
            profit factor son ruido: harían falta unas 100 para que significaran algo.
          </Text>
        ) : null}

        <View style={{ height: hairline, backgroundColor: colors.rule }} />

        {confirmando ? (
          <View style={{ gap: 5 }}>
            <Text style={[T.dato, { color: colors.inkMuted, lineHeight: 16 }]}>
              Se cierra todo lo abierto, se archiva la cuenta actual y se empieza de cero con
              100.000. El robot queda apagado. La cuenta anterior no se borra: se archiva.
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <BotonTerminal texto="Cancelar" relleno onPress={() => setConfirmando(false)} />
              <BotonTerminal
                texto="Sí, reiniciar"
                tono="down"
                icono="refresh"
                relleno
                onPress={() => {
                  setConfirmando(false);
                  onReiniciar(100000);
                }}
              />
            </View>
          </View>
        ) : (
          <BotonTerminal
            texto="Reiniciar cuenta simulada"
            icono="refresh-outline"
            onPress={() => setConfirmando(true)}
          />
        )}
      </View>
    </Placa>
  );
}
