/**
 * Sesiones y horarios de mercado, en una sola placa.
 *
 * Antes eran dos cosas separadas que respondían a la misma pregunta desde
 * ángulos distintos: «qué plazas están abiertas» (los horarios, dato duro del
 * backend) y «en qué franja del día estamos» (el mapa de 24 h). Juntas se leen
 * de un vistazo: primero la barra del día, luego las cuatro franjas, y debajo
 * el detalle plaza por plaza.
 *
 * Nota sobre lo que NO se ha traído del panel de Overton: allí cada sesión
 * mostraba un «win rate histórico» y un rango ATR. Esos números salían de un
 * generador pseudoaleatorio sembrado con el ticker analizado — son ilustrativos
 * para un valor concreto, pero en una pantalla de mercado, sin ticker, no
 * significarían nada. Se quedan donde tienen contexto.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { Legend, Panel, Rule } from '../ui';
import { seriesColor, toneColors, Tone } from '../../theme/tokens';

export interface MarketHours {
  market_name: string;
  location: string;
  timezone: string;
  open_time: string;
  close_time: string;
  status: string;
  next_open: string;
}

/* Ventanas en hora UTC. Golden Hour es el solape NY+Europa: la franja con más
   volumen del día, y por eso se dibuja encima de las otras dos. */
const SESSIONS = [
  {
    key: 'asia',
    label: 'Asia',
    start: 0,
    end: 9,
    note: 'Movimientos lentos y rangos estrechos. Marca el rango que Europa suele romper.',
  },
  {
    key: 'europe',
    label: 'Europa',
    start: 7,
    end: 16,
    note: 'Apertura europea: ruptura frecuente del rango asiático. Vigilar el hueco de apertura.',
  },
  {
    key: 'ny',
    label: 'Nueva York',
    start: 13.5,
    end: 20,
    note: 'Mayor volumen del día. A las 13:30 UTC salen los datos macro de EEUU.',
  },
  {
    key: 'golden',
    label: 'Golden Hour',
    start: 14.5,
    end: 16,
    note: 'Solape Nueva York + Europa. Máxima profundidad de libro y horquillas más ajustadas.',
  },
] as const;

function hhmm(h: number) {
  const entera = Math.floor(h) % 24;
  const min = Math.round((h - Math.floor(h)) * 60);
  return `${String(entera).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function humanizar(minutos: number) {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h < 24) return m === 0 ? `${h} h` : `${h} h ${m} min`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr === 0 ? `${d} d` : `${d} d ${hr} h`;
}

/** Lunes a viernes en UTC. El sábado no hay sesión y el domingo tampoco: el
 *  mercado de divisas reabre el domingo por la noche con Sídney, que queda
 *  fuera de las cuatro franjas que dibuja este panel. */
function esDiaHabil(d: Date) {
  const dia = d.getUTCDay();
  return dia >= 1 && dia <= 5;
}

/**
 * Minutos hasta la próxima apertura real, saltando el fin de semana.
 *
 * Sin esto, un domingo la cuenta atrás decía «abre en 3 h» porque solo miraba
 * la hora del reloj: el mismo fallo que hacía aparecer Europa como abierta.
 */
function minutosHastaApertura(ahora: Date, inicioH: number) {
  const cand = new Date(ahora);
  cand.setUTCHours(Math.floor(inicioH), Math.round((inicioH % 1) * 60), 0, 0);
  if (cand.getTime() <= ahora.getTime()) cand.setUTCDate(cand.getUTCDate() + 1);
  while (!esDiaHabil(cand)) cand.setUTCDate(cand.getUTCDate() + 1);
  return Math.round((cand.getTime() - ahora.getTime()) / 60_000);
}

export default function SessionsPanel({ marketHours }: { marketHours?: MarketHours[] }) {
  const { colors, palette, space, type, radius, hairline, numeric, isDark } = useTheme();

  // El reloj avanza solo: una barra de sesiones congelada engaña.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const hUTC = now.getUTCHours() + now.getUTCMinutes() / 60;
  const reloj = `${String(now.getUTCHours()).padStart(2, '0')}:${String(
    now.getUTCMinutes(),
  ).padStart(2, '0')} UTC`;

  const habil = esDiaHabil(now);

  const estado = useMemo(
    () =>
      SESSIONS.map((s, i) => {
        // El día manda sobre la hora: en fin de semana ninguna franja abre,
        // por mucho que el reloj caiga dentro de su ventana horaria.
        const abierta = habil && hUTC >= s.start && hUTC < s.end;
        return {
          ...s,
          color: seriesColor(isDark, i),
          abierta,
          minutosCierre: abierta ? Math.round((s.end - hUTC) * 60) : null,
          minutosApertura: abierta ? null : minutosHastaApertura(now, s.start),
          progreso: abierta ? (hUTC - s.start) / (s.end - s.start) : 0,
        };
      }),
    // `now` cambia cada 30 s y arrastra a hUTC y habil.
    [now, hUTC, habil, isDark],
  );

  const activas = estado.filter((s) => s.abierta);

  return (
    <Panel
      legend="Sesiones y horarios"
      title="El día de mercado"
      padded={false}
      action={
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type.caption, numeric, { color: colors.inkMuted }]}>{reloj}</Text>
          <Text
            style={[
              type.legend,
              { color: activas.length ? palette.up : colors.inkFaint, letterSpacing: 0.4 },
            ]}
          >
            {activas.length
              ? `${activas.map((s) => s.label).join(' + ')} ABIERTA`
              : habil
                ? 'SIN SESIÓN PRINCIPAL'
                : 'FIN DE SEMANA'}
          </Text>
        </View>
      }
    >
      {/* Fin de semana: se dice explícitamente en vez de dejar cuatro tarjetas
          en gris que el lector tenga que interpretar. */}
      {habil ? null : (
        <View
          style={{
            marginHorizontal: space.lg,
            marginTop: space.md,
            padding: space.md,
            borderRadius: radius.sm,
            borderWidth: hairline,
            borderColor: colors.rule,
            backgroundColor: colors.surfaceSunken,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
          }}
        >
          <View style={{ width: 3, height: 26, backgroundColor: colors.noSignal }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.label, { color: colors.ink }]}>Fin de semana</Text>
            <Text style={[type.caption, { color: colors.inkMuted }]}>
              Las bolsas y el mercado de divisas están cerrados. La primera franja en abrir es
              Asia, el lunes a las 00:00 UTC.
            </Text>
          </View>
        </View>
      )}

      {/* ── Barra de 24 horas ── */}
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
        <Legend>Mapa de 24 horas (UTC)</Legend>
        <View
          style={{
            height: 34,
            marginTop: space.xs,
            backgroundColor: colors.surfaceSunken,
            borderWidth: hairline,
            borderColor: colors.rule,
            overflow: 'hidden',
          }}
        >
          {estado.map((s, i) => (
            <View
              key={s.key}
              style={{
                position: 'absolute',
                left: `${(s.start / 24) * 100}%`,
                width: `${((s.end - s.start) / 24) * 100}%`,
                // Golden Hour va en una banda más baja y fina: es un solape,
                // no una quinta sesión con el mismo rango.
                top: s.key === 'golden' ? 22 : 0,
                height: s.key === 'golden' ? 12 : 22,
                backgroundColor: s.color,
                opacity: s.abierta ? 0.9 : 0.32,
              }}
            />
          ))}
          {/* Plomada del ahora */}
          <View
            style={{
              position: 'absolute',
              left: `${(hUTC / 24) * 100}%`,
              width: 2,
              marginLeft: -1,
              top: 0,
              bottom: 0,
              backgroundColor: colors.ink,
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
          {['00:00', '06:00', '12:00', '18:00', '24:00'].map((t) => (
            <Text key={t} style={[type.legend, numeric, { color: colors.inkFaint, letterSpacing: 0 }]}>
              {t}
            </Text>
          ))}
        </View>
      </View>

      {/* ── Las cuatro franjas ── */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: space.sm,
          padding: space.lg,
        }}
      >
        {estado.map((s) => (
          <View
            key={s.key}
            style={{
              flexGrow: 1,
              flexBasis: 260,
              minWidth: 0,
              padding: space.md,
              borderRadius: radius.sm,
              borderWidth: hairline,
              borderColor: s.abierta ? colors.ruleStrong : colors.rule,
              backgroundColor: s.abierta ? colors.surfaceSunken : 'transparent',
              gap: space.xs,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ width: 3, height: 18, backgroundColor: s.color }} />
              <Text style={[type.label, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
                {s.label}
              </Text>
              <Text
                style={[
                  type.legend,
                  { color: s.abierta ? palette.up : colors.inkFaint, letterSpacing: 0.4 },
                ]}
              >
                {s.abierta ? 'ABIERTA' : 'CERRADA'}
              </Text>
            </View>

            <Text style={[type.caption, numeric, { color: colors.inkMuted }]}>
              {hhmm(s.start)} – {hhmm(s.end)} UTC
            </Text>

            {/* Barra de avance de la franja: cuánto queda, no cuánto vale */}
            <View
              style={{
                height: 4,
                backgroundColor: colors.surfaceSunken,
                borderWidth: hairline,
                borderColor: colors.rule,
              }}
            >
              <View
                style={{
                  width: `${Math.max(0, Math.min(1, s.progreso)) * 100}%`,
                  height: '100%',
                  backgroundColor: s.color,
                  opacity: s.abierta ? 1 : 0,
                }}
              />
            </View>

            <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}>
              {s.abierta
                ? `Cierra en ${humanizar(s.minutosCierre ?? 0)}`
                : `Abre en ${humanizar(s.minutosApertura ?? 0)}`}
            </Text>

            <Text style={[type.caption, { color: colors.inkMuted }]}>{s.note}</Text>
          </View>
        ))}
      </View>

      {/* ── Plazas, con el horario real de cada una ── */}
      {marketHours && marketHours.length > 0 ? (
        <>
          <Rule />
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
            <Legend>Plazas · horario local de cada bolsa</Legend>
          </View>
          <Rule />
          {marketHours.map((m, i) => {
            const abierto = m.status.includes('Abierto');
            const pre = m.status.includes('Pre');
            const tone: Tone = abierto ? 'up' : pre ? 'caution' : 'neutral';
            const fg = tone === 'neutral' ? colors.inkMuted : toneColors(palette, tone).fg;
            return (
              <View key={`${m.market_name}-${i}`}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingVertical: space.md,
                    paddingHorizontal: space.lg,
                  }}
                >
                  <View
                    style={{ width: 3, height: 22, backgroundColor: fg, opacity: abierto ? 1 : 0.45 }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[type.label, { color: colors.ink }]} numberOfLines={1}>
                      {m.market_name}
                    </Text>
                    <Text
                      style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}
                      numberOfLines={1}
                    >
                      {m.location} · {m.timezone}
                    </Text>
                  </View>
                  <Text style={[type.caption, numeric, { color: colors.inkMuted }]}>
                    {m.open_time} – {m.close_time}
                  </Text>
                  <Text
                    style={[
                      type.caption,
                      { color: fg, fontWeight: '700', minWidth: 74, textAlign: 'right' },
                    ]}
                    numberOfLines={1}
                  >
                    {m.status}
                  </Text>
                </View>
                {i < marketHours.length - 1 ? <Rule /> : null}
              </View>
            );
          })}
        </>
      ) : null}
    </Panel>
  );
}
