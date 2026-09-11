/**
 * ============================================================================
 * Robot de simulación — interruptor y registro de decisiones
 * ============================================================================
 * **Por qué el registro enseña también las decisiones de NO operar.**
 *
 * `/pivots` sólo da veredicto con las SEIS condiciones cumplidas y en orden, y
 * eso ocurre pocas veces. Un panel que sólo hablara cuando abre una operación
 * estaría en blanco casi siempre, y un panel en blanco se lee como un panel
 * roto. Enseñando «2 de 6» con las seis condiciones y su medida se distingue
 * «el robot no ve nada» de «esto no funciona», que es la misma decisión que ya
 * se tomó en la tarjeta del NQE y por el mismo motivo.
 *
 * Cada condición viaja con SU CIFRA —«77,97 vs 77,49»—, no sólo con el ✓. Un
 * check sin medida detrás no se puede auditar.
 *
 * --------------------------------------------------------------------------
 * Lo que este panel NO hace
 * --------------------------------------------------------------------------
 * No inventa indicadores para rellenar la lista. Las razones son literalmente
 * las condiciones que `backend/pivots.py` ya calcula, más los filtros de
 * confluencia de `/overton`, `/nqe` y `/mtf`. Si una fuente no responde, se
 * dice; no se sustituye por un valor plausible.
 */

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../../contexts/ThemeContext';
import { cifra, dinero, duracion, entero, hora } from '../../../lib/estrategia/formato';
import {
  DecisionGuardada,
  DecisionSim,
  MarcoSim,
  MARCOS_SIM,
  RobotSim,
} from '../../../lib/simulacion/tipos';
import { BotonTerminal, Chip, Cifra, Conmutador, Placa, Rotulo, T } from '../Terminal';

/* ==========================================================================
 * Una razón con su medida
 * ======================================================================== */

function Razon({ etiqueta, valor, cumplida }: { etiqueta: string; valor: string; cumplida: boolean }) {
  const { colors, palette, hairline } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        paddingVertical: 2,
        borderBottomWidth: hairline,
        borderBottomColor: colors.rule,
      }}
    >
      <Ionicons
        name={cumplida ? 'checkmark-circle' : 'ellipse-outline'}
        size={12}
        color={cumplida ? palette.up : colors.noSignal}
        style={{ marginTop: 1 }}
      />
      <Text
        style={[T.dato, { color: cumplida ? colors.ink : colors.inkMuted, flex: 1 }]}
        numberOfLines={2}
      >
        {etiqueta}
      </Text>
      {/* La medida, monoespaciada y a la derecha. Es lo que hace auditable el ✓. */}
      <Cifra valor={valor || null} escala="dato" tono={cumplida ? 'up' : 'neutral'} />
    </View>
  );
}

/* ==========================================================================
 * El detalle de una decisión
 * ======================================================================== */

export function DetalleDecision({
  decision,
  cabecera,
}: {
  decision: DecisionSim;
  cabecera?: string;
}) {
  const { colors, palette, radius, hairline } = useTheme();
  const cumplidas = decision.razones.filter((r) => r.cumplida).length;
  const largo = decision.direccion === 'long';
  const tono = decision.opera ? (largo ? 'up' : 'down') : ('neutral' as const);

  return (
    <View
      style={{
        gap: 5,
        padding: 8,
        borderRadius: radius.xs,
        borderWidth: hairline,
        borderColor: decision.opera ? (largo ? palette.up : palette.down) : colors.rule,
        backgroundColor: colors.surfaceSunken,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {cabecera ? <Rotulo>{cabecera}</Rotulo> : null}
        <Text style={[T.datoFuerte, { color: decision.opera ? (largo ? palette.up : palette.down) : colors.inkMuted, fontSize: 13 }]}>
          {decision.opera ? (largo ? 'LONG' : 'SHORT') : 'NO TRADE'}
        </Text>
        <Chip texto={`${cumplidas} de ${decision.razones.length || 6}`} tono={tono as any} />
        <View style={{ flex: 1 }} />
        <Text style={[T.micro, { color: colors.inkFaint }]}>
          {decision.simbolo} · {decision.marco} · {decision.fuente}
        </Text>
      </View>

      {/* Los niveles, cuando los hay */}
      {decision.entrada !== null ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 4 }}>
          {(
            [
              ['Entrada', cifra(decision.entrada, 4), 'neutral'],
              ['Stop', cifra(decision.stop_loss, 4), 'down'],
              ['Objetivo', cifra(decision.take_profit, 4), 'up'],
              ['Tamaño', decision.cantidad ? `${entero(decision.cantidad)} acc.` : null, 'neutral'],
            ] as const
          ).map(([rot, val, t]) => (
            <View key={rot} style={{ flexBasis: '22%', flexGrow: 1, minWidth: 0, gap: 1 }}>
              <Rotulo>{rot}</Rotulo>
              <Cifra valor={val} tono={t as any} escala="datoFuerte" />
            </View>
          ))}
        </View>
      ) : null}

      {/* Las razones, cada una con su cifra */}
      <View style={{ gap: 1 }}>
        {decision.razones.map((r, i) => (
          <Razon key={`${r.etiqueta}-${i}`} etiqueta={r.etiqueta} valor={r.valor} cumplida={r.cumplida} />
        ))}
      </View>

      {/* Vetos: lo que impidió operar pese a haber señal */}
      {decision.vetos.map((v) => (
        <View key={v} style={{ flexDirection: 'row', gap: 5, alignItems: 'flex-start' }}>
          <Ionicons name="hand-left-outline" size={12} color={palette.down} style={{ marginTop: 1 }} />
          <Text style={[T.dato, { color: palette.down, flex: 1, lineHeight: 15 }]}>{v}</Text>
        </View>
      ))}

      {/* Notas: no impiden operar, pero cambian cómo se lee la señal */}
      {decision.notas.map((n) => (
        <Text key={n} style={[T.micro, { color: colors.inkMuted, lineHeight: 14 }]}>
          {n}
        </Text>
      ))}

      {decision.factor_tamano < 1 ? (
        <Chip
          texto={`Tamaño al ${Math.round(decision.factor_tamano * 100)} %`}
          tono="caution"
          icono="resize-outline"
        />
      ) : null}

      {!decision.opera && decision.motivo_no_operar ? (
        <Text style={[T.dato, { color: colors.inkMuted, lineHeight: 15 }]}>
          {decision.motivo_no_operar}
        </Text>
      ) : null}
    </View>
  );
}

/* ==========================================================================
 * Panel
 * ======================================================================== */

export default function PanelRobot({
  robot,
  marco,
  onMarco,
  onConmutar,
  onEvaluar,
  pensando,
  segundosParaRobot,
  ultimaDecision,
  decisiones,
  simbolo,
}: {
  robot: RobotSim | null;
  marco: MarcoSim;
  onMarco: (m: MarcoSim) => void;
  onConmutar: (activo: boolean) => void;
  onEvaluar: () => void;
  pensando: boolean;
  segundosParaRobot: number | null;
  ultimaDecision: DecisionSim | null;
  decisiones: DecisionGuardada[];
  simbolo: string;
}) {
  const { colors, palette, hairline } = useTheme();
  const [verHistorial, setVerHistorial] = useState(false);
  const activo = robot?.activo ?? false;

  return (
    <Placa
      titulo="Robot"
      derecha={
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <Chip
            texto={activo ? 'ON' : 'OFF'}
            tono={activo ? 'up' : 'neutral'}
            icono={activo ? 'flash' : 'flash-off-outline'}
          />
        </View>
      }
    >
      <View style={{ gap: 8 }}>
        {/* ---------- Interruptor ---------- */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <BotonTerminal
            texto="OFF"
            tono={activo ? 'neutral' : 'down'}
            icono="stop"
            relleno
            deshabilitado={!activo}
            onPress={() => onConmutar(false)}
          />
          <BotonTerminal
            texto="ON"
            tono={activo ? 'up' : 'neutral'}
            icono="play"
            relleno
            deshabilitado={activo}
            onPress={() => onConmutar(true)}
          />
        </View>

        {/* La regla del punto 9, dicha donde se decide. */}
        <Text style={[T.micro, { color: colors.inkFaint, lineHeight: 14 }]}>
          {activo
            ? `El robot puede abrir operaciones simuladas en ${simbolo} según la señal de la estrategia. Cada ${'45'} minutos evalúa una vez.`
            : 'Con el robot apagado NO se abren operaciones nuevas. Las que ya están abiertas siguen monitorizándose: sus stops y objetivos se evalúan igual.'}
        </Text>

        {/* ---------- Marco y cuenta atrás ---------- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
          <View style={{ gap: 2 }}>
            <Rotulo>Marco de decisión</Rotulo>
            <Conmutador
              opciones={MARCOS_SIM.map((m) => ({ clave: m, texto: m }))}
              activa={marco}
              onChange={onMarco}
              compacto
            />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 1 }}>
            <Rotulo>Próxima decisión</Rotulo>
            {activo ? (
              <Cifra
                valor={pensando ? 'evaluando…' : duracion(segundosParaRobot)}
                tono="accent"
                escala="medida"
              />
            ) : (
              <>
                <Cifra valor={null} escala="medida" />
                <Text style={[T.micro, { color: colors.noSignal }]}>Robot apagado</Text>
              </>
            )}
          </View>
        </View>

        <BotonTerminal
          texto={pensando ? 'Evaluando…' : 'Evaluar ahora'}
          icono="search"
          relleno
          deshabilitado={pensando}
          onPress={onEvaluar}
        />

        <View style={{ height: hairline, backgroundColor: colors.rule }} />

        {/* ---------- Registro de la última decisión ---------- */}
        <View style={{ gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Rotulo>Por qué</Rotulo>
            <View style={{ flex: 1 }} />
            {decisiones.length > 1 ? (
              <BotonTerminal
                texto={verHistorial ? 'Ver sólo la última' : `Ver las ${decisiones.length} últimas`}
                icono={verHistorial ? 'chevron-up' : 'time-outline'}
                onPress={() => setVerHistorial((v) => !v)}
              />
            ) : null}
          </View>

          {ultimaDecision ? (
            <DetalleDecision decision={ultimaDecision} cabecera="Ahora" />
          ) : (
            <Text style={[T.dato, { color: colors.noSignal, lineHeight: 15 }]}>
              El robot no ha evaluado todavía en esta sesión. Pulsa «Evaluar ahora» para ver la
              lectura completa: sale con o sin operación.
            </Text>
          )}

          {verHistorial
            ? decisiones.slice(0, 12).map((d) => (
                <DetalleDecision
                  key={d.id}
                  decision={d}
                  cabecera={hora(d.ts) ?? undefined}
                />
              ))
            : null}
        </View>

        {/* ---------- Lo que el robot no hace ---------- */}
        <Text style={[T.micro, { color: colors.inkFaint, lineHeight: 14 }]}>
          La señal la dispara `/pivots` (secuencia de Woodie con sus seis condiciones). `/overton`,
          `/nqe` y `/mtf` sólo pueden vetar la operación o reducir su tamaño: ningún indicador
          aislado abre una posición. Y una misma vela nunca produce dos entradas — la
          deduplicación va por el sello temporal de la barra, no por este reloj.
        </Text>
      </View>
    </Placa>
  );
}
