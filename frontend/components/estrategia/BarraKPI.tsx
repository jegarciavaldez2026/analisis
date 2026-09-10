/**
 * Franja de KPIs.
 *
 * Diez lecturas en una sola línea de escritorio, separadas por reglas de un
 * pelo. No son diez tarjetas: una tarjeta por cifra convierte la franja en un
 * dashboard de SaaS y desperdicia la mitad del ancho en bordes y sombras.
 *
 * Las que no tienen fuente (win rate, profit factor, expectativa) salen con el
 * hueco y su motivo. Aparecen a propósito: enseñan qué falta para que el
 * motor esté completo, en vez de dar a entender que ya lo está.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { Tone } from '../../theme/tokens';
import { Bloque, ResumenPanel } from '../../lib/estrategia/tipos';
import { cifra, dinero, entero, porcentaje } from '../../lib/estrategia/formato';
import { Cifra, Hueso, Rotulo, T } from './Terminal';

export interface KPI {
  rotulo: string;
  valor: string | null;
  pie?: string | null;
  tono?: Tone;
  /** Motivo del hueco. Si está, gana sobre `valor`. */
  sinFuente?: string;
}

function CeldaKPI({ kpi, ultima }: { kpi: KPI; ultima?: boolean }) {
  const { colors, hairline } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        gap: 1,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRightWidth: ultima ? 0 : hairline,
        borderRightColor: colors.rule,
      }}
    >
      <Rotulo>{kpi.rotulo}</Rotulo>
      {kpi.sinFuente ? (
        <>
          <Cifra valor={null} escala="kpi" />
          <Text style={[T.micro, { color: colors.noSignal }]} numberOfLines={1}>
            {kpi.sinFuente}
          </Text>
        </>
      ) : (
        <>
          <Cifra valor={kpi.valor} tono={kpi.tono ?? 'neutral'} escala="kpi" />
          {kpi.pie ? (
            <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
              {kpi.pie}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Construye los diez KPIs a partir del resumen real de la cartera. */
export function kpisDe(bloque: Bloque<ResumenPanel>): KPI[] {
  const r = bloque.datos;
  const faltaCuenta = bloque.nota ?? 'Sin datos de cuenta';

  // Estas tres SÍ se pueden calcular: salen de las ventas cerradas de la
  // cartera. Si faltan es porque no hay ninguna, no porque falte el motor.
  const sinCerradas = 'Sin ventas cerradas';

  return [
    {
      rotulo: 'Balance',
      valor: dinero(r?.balance ?? null),
      pie: r?.disponible != null ? `Disponible: ${dinero(r.disponible)}` : null,
      sinFuente: r ? undefined : faltaCuenta,
    },
    {
      rotulo: 'Patrimonio',
      valor: dinero(r?.patrimonio ?? null),
      pie: r?.invertido != null ? `Invertido: ${dinero(r.invertido)}` : null,
      sinFuente: r ? undefined : faltaCuenta,
    },
    {
      rotulo: 'Ganancia neta',
      valor: dinero(r?.gananciaNeta ?? null, true),
      pie: 'Desde el inicio',
      tono: (r?.gananciaNeta ?? 0) >= 0 ? 'up' : 'down',
      sinFuente: r ? undefined : faltaCuenta,
    },
    {
      rotulo: 'Retorno',
      valor: porcentaje(r?.retornoPct ?? null, 2, true),
      pie: 'Desde el inicio',
      tono: (r?.retornoPct ?? 0) >= 0 ? 'up' : 'down',
      sinFuente: r ? undefined : faltaCuenta,
    },
    {
      // La maqueta pedía «P&L del día», pero /portfolio no calcula variación
      // diaria: se enseña lo que sí mide, que además es más informativo.
      rotulo: 'Realizadas',
      valor: dinero(r?.realizadas ?? null, true),
      pie:
        r?.noRealizadas != null ? `Latentes: ${dinero(r.noRealizadas, true)}` : 'Beneficio de ventas',
      tono: (r?.realizadas ?? 0) >= 0 ? 'up' : 'down',
      sinFuente: r ? undefined : faltaCuenta,
    },
    {
      rotulo: 'Drawdown máx.',
      valor: porcentaje(r?.drawdownMax ?? null, 2),
      pie: 'Sobre la curva de patrimonio',
      tono: 'down',
      sinFuente: r?.drawdownMax == null ? 'Necesita histórico' : undefined,
    },
    {
      rotulo: 'Sharpe',
      valor: cifra(r?.sharpe ?? null),
      pie: 'Anualizado',
      sinFuente: r?.sharpe == null ? 'Necesita histórico' : undefined,
    },
    {
      rotulo: 'Profit factor',
      valor: cifra(r?.profitFactor ?? null),
      pie: 'Beneficio bruto / pérdida bruta',
      sinFuente: r?.profitFactor == null ? sinCerradas : undefined,
    },
    {
      rotulo: 'Win rate',
      valor: porcentaje(r?.winRate ?? null, 1),
      pie: r?.operaciones != null ? `${entero(r.operaciones)} ventas cerradas` : null,
      tono: (r?.winRate ?? 0) >= 50 ? 'up' : 'down',
      sinFuente: r?.winRate == null ? sinCerradas : undefined,
    },
    {
      rotulo: 'Expectativa',
      valor: dinero(r?.expectativa ?? null, true),
      pie: 'Por venta cerrada',
      tono: (r?.expectativa ?? 0) >= 0 ? 'up' : 'down',
      sinFuente: r?.expectativa == null ? sinCerradas : undefined,
    },
  ];
}

export default function BarraKPI({
  bloque,
  cargando,
  columnas,
}: {
  bloque: Bloque<ResumenPanel>;
  cargando?: boolean;
  /** 10 en escritorio, 5 en tableta, 2 en móvil. Lo decide el contenedor. */
  columnas: number;
}) {
  const { colors, radius, hairline } = useTheme();
  const kpis = kpisDe(bloque);

  if (cargando && !bloque.datos) {
    return (
      <View
        style={{
          flexDirection: 'row',
          borderRadius: radius.sm,
          borderWidth: hairline,
          borderColor: colors.rule,
          backgroundColor: colors.surface,
          padding: 8,
          gap: 12,
        }}
      >
        {Array.from({ length: Math.min(columnas, 10) }).map((_, i) => (
          <View key={i} style={{ flex: 1, gap: 4 }}>
            <Hueso ancho="60%" alto={8} />
            <Hueso ancho="85%" alto={14} />
          </View>
        ))}
      </View>
    );
  }

  // Rejilla real: se parte en filas de `columnas` celdas. Con `flexWrap` puro
  // la última fila estira sus celdas y deja la franja descuadrada.
  const filas: KPI[][] = [];
  for (let i = 0; i < kpis.length; i += columnas) filas.push(kpis.slice(i, i + columnas));

  return (
    <View
      style={{
        borderRadius: radius.sm,
        borderWidth: hairline,
        borderColor: colors.rule,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {filas.map((fila, f) => (
        <View
          key={f}
          style={{
            flexDirection: 'row',
            borderTopWidth: f === 0 ? 0 : hairline,
            borderTopColor: colors.rule,
          }}
        >
          {fila.map((kpi, i) => (
            <CeldaKPI key={kpi.rotulo} kpi={kpi} ultima={i === fila.length - 1} />
          ))}
          {/* Relleno para que la última fila incompleta no estire sus celdas */}
          {fila.length < columnas
            ? Array.from({ length: columnas - fila.length }).map((_, i) => (
                <View key={`hueco-${i}`} style={{ flex: 1 }} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}
