/**
 * Calendario económico — catalizadores de los próximos siete días.
 *
 * Intenta primero Econdb (a través de un proxy CORS, porque la API no manda
 * cabeceras de origen cruzado) y cae a un calendario estimado si falla. La
 * distinción importa y por eso viaja visible en la cabecera: un dato de Econdb
 * es un evento confirmado con hora; el estimado es la cadencia habitual de
 * publicaciones, útil para planificar pero no para operar contra el reloj.
 */

import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { Legend, Panel, Rule, Skeleton } from '../ui';
import { toneColors, Tone } from '../../theme/tokens';

interface CalendarEvent {
  event: string;
  date: string;
  time?: string;
  impact: 'alto' | 'medio' | 'bajo';
  country?: string;
  desc?: string;
  actual?: string | number | null;
  forecast?: string | number | null;
  previous?: string | number | null;
}

const IMPACT_TONE: Record<CalendarEvent['impact'], Tone> = {
  alto: 'down',
  medio: 'caution',
  bajo: 'neutral',
};

function calendarioEstimado(): CalendarEvent[] {
  const hoy = new Date();
  const fmt = (d: Date) =>
    d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const mas = (n: number) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + n);
    return d;
  };

  return [
    {
      event: 'FOMC — Actas de la Fed',
      date: fmt(mas(2)),
      time: '18:00 UTC',
      impact: 'alto',
      country: 'US',
      desc: 'Minutos de la última reunión. Alta sensibilidad en renta fija y dólar.',
    },
    {
      event: 'IPC — Inflación de EEUU',
      date: fmt(mas(4)),
      time: '12:30 UTC',
      impact: 'alto',
      country: 'US',
      desc: 'Índice de precios mensual. Principal determinante de la política monetaria.',
    },
    {
      event: 'Empleo no agrícola (NFP)',
      date: fmt(mas(6)),
      time: '12:30 UTC',
      impact: 'alto',
      country: 'US',
      desc: 'Datos de empleo. Suele multiplicar por dos o tres la volatilidad media en la primera media hora.',
    },
    {
      event: 'BCE — Decisión de tipos',
      date: fmt(mas(3)),
      time: '11:45 UTC',
      impact: 'alto',
      country: 'EU',
      desc: 'Decisión del Banco Central Europeo. Afecta al euro y a la renta variable europea.',
    },
    {
      event: 'PIB de EEUU — trimestral',
      date: fmt(mas(8)),
      time: '12:30 UTC',
      impact: 'alto',
      country: 'US',
      desc: 'Crecimiento del trimestre. Impacto en múltiplos y en las proyecciones anuales.',
    },
    {
      event: 'IPP — Precios de producción',
      date: fmt(mas(5)),
      time: '12:30 UTC',
      impact: 'medio',
      country: 'US',
      desc: 'Indicador adelantado de la inflación al consumo.',
    },
    {
      event: 'PMI manufacturero de EEUU',
      date: fmt(mas(1)),
      time: '14:00 UTC',
      impact: 'medio',
      country: 'US',
      desc: 'Indicador líder de actividad industrial.',
    },
    {
      event: 'Inventarios de petróleo (EIA)',
      date: fmt(mas(2)),
      time: '14:30 UTC',
      impact: 'medio',
      country: 'US',
      desc: 'Mueve las energéticas y los sectores dependientes del crudo.',
    },
  ];
}

export default function EconomicCalendar() {
  const { colors, palette, space, type, radius, hairline, numeric } = useTheme();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'econdb' | 'estimado'>('estimado');

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const hoy = new Date().toISOString().split('T')[0];
        const fin = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0];
        const destino = `https://econdb.com/api/events/?start=${hoy}&end=${fin}&type=economic&importance=high&format=json&limit=20`;
        const res = await fetch(
          `https://api.allorigins.win/raw?url=${encodeURIComponent(destino)}`,
        );
        if (!res.ok) throw new Error('respuesta no válida');
        const json = await res.json();

        if (vivo && json?.results?.length) {
          setEvents(
            json.results.map((e: any) => ({
              event: e.ticker || e.event || 'Evento económico',
              date: e.date?.slice(0, 10) || hoy,
              time: e.time || undefined,
              impact: e.importance === 'high' ? 'alto' : 'medio',
              country: e.country || undefined,
              actual: e.actual ?? null,
              forecast: e.forecast ?? null,
              previous: e.previous ?? null,
            })),
          );
          setSource('econdb');
          return;
        }
        throw new Error('sin resultados');
      } catch {
        if (vivo) {
          setEvents(calendarioEstimado());
          setSource('estimado');
        }
      } finally {
        if (vivo) setLoading(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  return (
    <Panel
      legend="Próximos 7 días"
      title="Calendario económico"
      padded={false}
      action={
        <View
          style={{
            paddingHorizontal: space.sm,
            paddingVertical: 3,
            borderRadius: radius.xs,
            borderWidth: hairline,
            borderColor: colors.rule,
            backgroundColor: colors.surfaceSunken,
          }}
        >
          <Text style={[type.legend, { color: colors.inkMuted, letterSpacing: 0.4 }]}>
            {source === 'econdb' ? 'ECONDB.COM' : 'CALENDARIO ESTIMADO'}
          </Text>
        </View>
      }
    >
      {loading ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={32} />
          ))}
        </View>
      ) : events.length === 0 ? (
        <View style={{ padding: space.lg }}>
          <Text style={[type.caption, { color: colors.inkFaint }]}>
            No hay eventos para los próximos días.
          </Text>
        </View>
      ) : (
        events.map((e, i) => {
          const tone = IMPACT_TONE[e.impact] ?? 'caution';
          const { fg, wash } = toneColors(palette, tone);
          return (
            <View key={`${e.event}-${i}`}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: space.md,
                  paddingHorizontal: space.lg,
                  paddingVertical: space.md,
                }}
              >
                <View style={{ width: 3, height: 34, backgroundColor: fg, marginTop: 2 }} />

                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs }}>
                    <Text style={[type.label, { color: colors.ink }]}>{e.event}</Text>
                    <View
                      style={{
                        paddingHorizontal: space.xs,
                        paddingVertical: 1,
                        borderRadius: radius.xs,
                        backgroundColor: wash === 'transparent' ? colors.surfaceSunken : wash,
                      }}
                    >
                      <Text style={[type.legend, { color: fg, letterSpacing: 0.4 }]}>
                        {e.impact.toUpperCase()}
                      </Text>
                    </View>
                    {e.country ? (
                      <View
                        style={{
                          paddingHorizontal: space.xs,
                          paddingVertical: 1,
                          borderRadius: radius.xs,
                          borderWidth: hairline,
                          borderColor: colors.rule,
                        }}
                      >
                        <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0.4 }]}>
                          {e.country}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={[type.caption, numeric, { color: colors.inkMuted }]}>
                    {e.date}
                    {e.time ? ` · ${e.time}` : ''}
                    {e.forecast != null ? ` · Previsto ${e.forecast}` : ''}
                    {e.previous != null ? ` · Anterior ${e.previous}` : ''}
                  </Text>

                  {e.desc ? (
                    <Text style={[type.caption, { color: colors.inkFaint }]}>{e.desc}</Text>
                  ) : null}
                </View>

                {e.actual != null ? (
                  <Text style={[type.bodyStrong, numeric, { color: colors.accent }]}>
                    {String(e.actual)}
                  </Text>
                ) : null}
              </View>
              {i < events.length - 1 ? <Rule /> : null}
            </View>
          );
        })
      )}
    </Panel>
  );
}
