/**
 * Mapa de mercado por sector.
 *
 * Tamaño = capitalización bursátil. Color = variación del día. Nada más: son
 * dos variables y dos canales, y cada uno dice una sola cosa.
 *
 * El área NO se comprime ni se le pone suelo. La capitalización es el dato y
 * entra tal cual en el reparto. Lo que a ese tamaño no se puede rotular no se
 * deforma para que se vea: se agrupa en un nodo «+N más» que conserva la suma
 * de capitalizaciones de lo que representa —así el área sigue siendo cierta— y
 * que al pulsarlo abre la lista completa.
 *
 * Consecuencia que conviene tener presente: en un historial donde conviven una
 * empresa de billones con otras de miles de millones, la grande ocupa casi todo
 * su sector y las demás caen al «+N». Eso no es un fallo del dibujo; es lo que
 * significa repartir por capitalización cuando el recorrido es de 40.000:1.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { useTheme } from '../../contexts/ThemeContext';
import { Legend, Panel, Rule } from '../ui';
import HeatmapLegend from './HeatmapLegend';
import HeatmapToolbar from './HeatmapToolbar';
import HeatmapTooltip from './HeatmapTooltip';
import SectorNode from './SectorNode';
import { colorVariacion, tintaSobre } from './colorScale';
import { useHeatmapLayout, variacion, type Bloque, type Orden, type Periodo, type Valor } from './useHeatmapLayout';

export type { Valor as HeatmapItem };

export default function HeatmapContainer({
  items,
  onSelect,
  actualizado,
  onRecargar,
  recargando = false,
  periodosListos = false,
}: {
  items: Valor[];
  onSelect?: (v: Valor) => void;
  actualizado?: Date | null;
  onRecargar?: () => void;
  recargando?: boolean;
  /** Cierto cuando ya han llegado las series de `/api/history/metrics`. */
  periodosListos?: boolean;
}) {
  const { colors, palette, space, type, numeric, radius, hairline } = useTheme();
  const { height: altoVentana } = useWindowDimensions();

  const [ancho, setAncho] = useState(0);
  const [vista, setVista] = useState<'mapa' | 'tabla'>('mapa');
  const [orden, setOrden] = useState<Orden>('cap');
  const [periodo, setPeriodo] = useState<Periodo>('1d');
  const [busqueda, setBusqueda] = useState('');
  const [ficha, setFicha] = useState<Valor | null>(null);
  const [restoAbierto, setRestoAbierto] = useState<Bloque | null>(null);

  // El tema oscuro se detecta por la luminancia del papel, no por una bandera:
  // así la escala sigue al tema aunque mañana se añada un tercero.
  const oscuro = useMemo(() => {
    const h = palette.surface.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  }, [palette.surface]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (v) =>
        v.ticker.toLowerCase().includes(q) ||
        (v.company_name ?? '').toLowerCase().includes(q) ||
        (v.sector ?? '').toLowerCase().includes(q),
    );
  }, [items, busqueda]);

  /**
   * Alto del lienzo. Ni fijo ni enorme: se pide una proporción cercana a 2:1
   * sobre el ancho disponible y se limita al 62 % de la ventana, para que el
   * mapa no se coma la pantalla y deje el resto de la página bajo el pliegue.
   * Sólo se calcula cuando ya hay ancho medido, o sea después de montar, así
   * que no puede desajustar la hidratación del render del servidor.
   */
  const alto = ancho > 0
    ? Math.round(Math.max(320, Math.min(720, ancho * 0.52, altoVentana * 0.62)))
    : 360;

  const { bloques, totalEmpresas, totalSectores } = useHeatmapLayout(filtrados, ancho, alto, orden, periodo);

  const abrirFicha = useCallback((v: Valor) => setFicha(v), []);

  if (!items.length) return null;

  const tabla = [...filtrados].sort((a, b) => {
    if (orden === 'ticker') return a.ticker.localeCompare(b.ticker, 'es');
    if (orden === 'variacion') {
      const va = variacion(a, periodo) ?? -Infinity;
      const vb = variacion(b, periodo) ?? -Infinity;
      return vb - va;
    }
    return (b.market_cap ?? 0) - (a.market_cap ?? 0);
  });

  return (
    <View style={{ gap: space.sm }}>
      <Panel title="Mapa de mercado por sector" legend="Tamaño = capitalización · color = variación del día" padded={false}>
        <HeatmapToolbar
          vista={vista}
          onVista={setVista}
          periodo={periodo}
          onPeriodo={setPeriodo}
          periodosListos={periodosListos}
          orden={orden}
          onOrden={setOrden}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          empresas={totalEmpresas}
          sectores={totalSectores}
          actualizado={actualizado}
          onRecargar={onRecargar}
          recargando={recargando}
        />
        <Rule />

        {vista === 'mapa' ? (
          <View
            onLayout={(e: LayoutChangeEvent) => {
              const w = e.nativeEvent.layout.width;
              setAncho((a) => (Math.abs(a - w) < 1 ? a : w));
            }}
            style={{ height: alto, backgroundColor: colors.surface }}
          >
            {ancho > 0 && bloques.length > 0 && (
              <Svg width={ancho} height={alto}>
                <Rect x={0} y={0} width={ancho} height={alto} fill={colors.surface} />
                {bloques.map((b) => (
                  <SectorNode
                    key={b.sector}
                    bloque={b}
                    oscuro={oscuro}
                    periodo={periodo}
                    colorMarco={colors.rule}
                    colorBanda={colors.chrome}
                    colorTinta={colors.ink}
                    colorSube={colors.up}
                    colorBaja={colors.down}
                    onSelect={abrirFicha}
                    onResto={setRestoAbierto}
                  />
                ))}
              </Svg>
            )}
            {filtrados.length === 0 && (
              <View style={{ padding: space.lg }}>
                <Legend>Ningún valor coincide con «{busqueda}»</Legend>
              </View>
            )}
          </View>
        ) : (
          <ScrollView style={{ maxHeight: Math.min(560, altoVentana * 0.62) }}>
            {tabla.map((v) => {
              const pct = variacion(v, periodo);
              const sinDato = pct === null;
              return (
                <Pressable
                  key={v.ticker}
                  onPress={() => abrirFicha(v)}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.sm,
                      paddingHorizontal: space.md,
                      paddingVertical: space.sm,
                      borderBottomWidth: hairline,
                      borderBottomColor: colors.rule,
                      backgroundColor: pressed ? colors.accentWash : 'transparent',
                    },
                    Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                  ]}
                >
                  <View
                    style={{
                      width: 3,
                      alignSelf: 'stretch',
                      backgroundColor: colorVariacion(pct, oscuro),
                    }}
                  />
                  <Text style={[type.labelStrong, numeric, { color: colors.ink, width: 78, letterSpacing: 0 }]} numberOfLines={1}>
                    {v.ticker}
                  </Text>
                  <Text style={[type.caption, { color: colors.inkMuted, flex: 1 }]} numberOfLines={1}>
                    {v.company_name ?? ''}
                  </Text>
                  <Text style={[type.legend, { color: colors.inkFaint, width: 130 }]} numberOfLines={1}>
                    {v.sector && v.sector !== 'N/A' ? v.sector : 'Sin sector'}
                  </Text>
                  <Text
                    style={[
                      type.caption,
                      numeric,
                      {
                        width: 78,
                        textAlign: 'right',
                        letterSpacing: 0,
                        fontWeight: '700',
                        color: sinDato ? colors.inkFaint : (pct as number) >= 0 ? colors.up : colors.down,
                      },
                    ]}
                  >
                    {sinDato ? 'sin dato' : `${(pct as number) >= 0 ? '+' : '−'}${Math.abs(pct as number).toFixed(2)}%`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </Panel>

      <Panel padded={false}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space.md,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            flexWrap: 'wrap',
          }}
        >
          <HeatmapLegend oscuro={oscuro} />
          <Text style={[type.legend, { color: colors.inkFaint }]}>
            EL ÁREA ES CAPITALIZACIÓN REAL, SIN COMPRIMIR
          </Text>
        </View>
      </Panel>

      {/* Drill-down del «+N más» */}
      {restoAbierto?.resto && (
        <Panel title={restoAbierto.sector} legend={`${restoAbierto.resto.valores.length} valores agrupados por tamaño`} padded={false}
          action={
            <Pressable onPress={() => setRestoAbierto(null)} accessibilityLabel="Cerrar" hitSlop={8}>
              <Text style={[type.caption, { color: colors.inkMuted, padding: 6 }]}>Cerrar</Text>
            </Pressable>
          }
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: space.md }}>
            {restoAbierto.resto.valores.map((v) => {
              const pct = variacion(v, periodo);
              const fondo = colorVariacion(pct, oscuro);
              return (
                <Pressable
                  key={v.ticker}
                  onPress={() => abrirFicha(v)}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      borderRadius: radius.xs,
                      backgroundColor: fondo,
                      opacity: pressed ? 0.82 : 1,
                    },
                    Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                  ]}
                >
                  <Text style={[type.caption, numeric, { color: tintaSobre(fondo), fontWeight: '700', letterSpacing: 0 }]}>
                    {v.ticker}
                  </Text>
                  <Text style={[type.legend, numeric, { color: tintaSobre(fondo), letterSpacing: 0 }]}>
                    {pct !== null
                      ? `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`
                      : 's/d'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Panel>
      )}

      <HeatmapTooltip
        valor={ficha}
        oscuro={oscuro}
        periodo={periodo}
        onCerrar={() => setFicha(null)}
        onVerAnalisis={onSelect ? (v) => { setFicha(null); onSelect(v); } : undefined}
      />
    </View>
  );
}
