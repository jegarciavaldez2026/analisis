/**
 * Banda de vigilancia de Favoritos.
 *
 * Lo que el Portafolio tiene en `CuentaIB` —los saldos arriba, antes de la
 * rejilla— aquí no existía: se entraba directamente a una lista sin saber si
 * había algo que mirar. Y la pregunta de esta pantalla no es «cuánto tengo»,
 * que es la del Portafolio, sino **«¿alguno ha llegado a su precio?»**.
 *
 * Por eso la banda cuenta tres cosas y no un total:
 *
 *   · listos para comprar  — el precio cayó hasta tu objetivo de compra
 *   · listos para vender   — el precio subió hasta tu objetivo de venta
 *   · sin objetivo         — los que no pueden disparar nada, y cuántos son
 *
 * La tercera columna es la importante y es la que suele faltar en este tipo de
 * panel. Sin ella, «0 listos para comprar» se lee como «ninguno ha llegado»,
 * cuando la verdad puede ser «ninguno tiene objetivo puesto». Son cosas
 * distintas: la primera es información, la segunda es un hueco. Cuando TODOS
 * están sin objetivo, la banda lo dice con esas palabras y no enseña ceros.
 *
 * «El más cerca» ordena por distancia relativa al objetivo de compra, no
 * absoluta: 2 € sobre una acción de 15 € y 2 € sobre una de 400 € no son el
 * mismo viaje.
 */

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../contexts/ThemeContext';
import { toneColors } from '../../theme/tokens';
import { Legend, Panel, Rule } from '../ui';
import type { FavoritoDetalle } from './WatchlistTable';

const num = (v: any): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);

/** Distancia relativa al objetivo, en %. Signo según el sentido del viaje. */
function faltaPara(precio: any, objetivo: any): number | null {
  const p = num(precio);
  const o = num(objetivo);
  if (p == null || o == null || o === 0) return null;
  return ((p - o) / o) * 100;
}

function Celda({
  etiqueta,
  valor,
  nota,
  tono,
}: {
  etiqueta: string;
  valor: string;
  nota?: string | null;
  tono?: 'up' | 'down' | 'accent' | 'neutral';
}) {
  const { colors, palette, type, numeric, space } = useTheme();
  const fg = tono && tono !== 'neutral' ? toneColors(palette, tono).fg : colors.ink;
  return (
    <View style={{ minWidth: 128, flex: 1, gap: 2, paddingVertical: space.xs }}>
      <Legend>{etiqueta}</Legend>
      <Text style={[type.title2, numeric, { color: fg }]}>{valor}</Text>
      {nota ? (
        <Text style={[type.caption, { color: colors.inkFaint }]} numberOfLines={2}>
          {nota}
        </Text>
      ) : null}
    </View>
  );
}

export default function BandaFavoritos({ items }: { items: FavoritoDetalle[] }) {
  const { colors, palette, space, type, numeric, hairline } = useTheme();

  const r = useMemo(() => {
    const lista = items ?? [];
    let listosCompra = 0;
    let listosVenta = 0;
    let sinObjetivo = 0;
    let conPrecio = 0;
    let masCerca: { ticker: string; falta: number } | null = null;

    for (const it of lista) {
      const p = num(it.current_price);
      if (p != null) conPrecio += 1;
      const oc = num(it.target_buy_price);
      const ov = num(it.target_sell_price);

      if (oc == null && ov == null) {
        sinObjetivo += 1;
        continue;
      }
      if (p == null) continue;

      if (oc != null && p <= oc) listosCompra += 1;
      if (ov != null && p >= ov) listosVenta += 1;

      // Candidato a «el más cerca»: sólo los que aún NO han llegado.
      if (oc != null && p > oc) {
        const f = faltaPara(p, oc);
        if (f != null && (masCerca == null || f < masCerca.falta)) {
          masCerca = { ticker: it.ticker, falta: f };
        }
      }
    }

    return {
      total: lista.length,
      listosCompra,
      listosVenta,
      sinObjetivo,
      conPrecio,
      conObjetivo: lista.length - sinObjetivo,
      masCerca,
    };
  }, [items]);

  if (!r.total) return null;

  // Nadie tiene objetivo: enseñar tres ceros sería decir «ninguno ha llegado»,
  // que no es lo que pasa. Se dice el hueco y qué lo rellena.
  const todosSinObjetivo = r.conObjetivo === 0;

  return (
    <Panel
      legend="Vigilancia"
      title={`${r.total} ${r.total === 1 ? 'valor en seguimiento' : 'valores en seguimiento'}`}
    >
      {todosSinObjetivo ? (
        <View style={{ gap: space.xs }}>
          <Text style={[type.body, { color: colors.ink }]}>
            Ninguno tiene objetivo de precio.
          </Text>
          <Text style={[type.caption, { color: colors.inkMuted }]}>
            Sin objetivo, esta pantalla sólo puede enseñar el precio: no hay nada que pueda
            alcanzarse ni distancia que medir. Fija un objetivo de compra o de venta desde la
            tabla, o al añadir un valor desde la pantalla de análisis.
          </Text>
        </View>
      ) : (
        <>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space.md,
              alignItems: 'flex-start',
            }}
          >
            <Celda
              etiqueta="Listos para comprar"
              valor={String(r.listosCompra)}
              tono={r.listosCompra > 0 ? 'up' : 'neutral'}
              nota={r.listosCompra > 0 ? 'el precio llegó a tu objetivo' : 'ninguno ha llegado aún'}
            />
            <Celda
              etiqueta="Listos para vender"
              valor={String(r.listosVenta)}
              tono={r.listosVenta > 0 ? 'down' : 'neutral'}
              nota={r.listosVenta > 0 ? 'el precio alcanzó tu salida' : 'ninguno ha llegado aún'}
            />
            <Celda
              etiqueta="El más cerca"
              valor={r.masCerca ? r.masCerca.ticker : '—'}
              tono="accent"
              nota={
                r.masCerca
                  ? `a ${r.masCerca.falta.toFixed(1)} % de su objetivo de compra`
                  : 'sin ninguno pendiente de llegar'
              }
            />
            <Celda
              etiqueta="Sin objetivo"
              valor={String(r.sinObjetivo)}
              nota={
                r.sinObjetivo > 0
                  ? 'no pueden disparar ningún aviso'
                  : 'todos tienen al menos un objetivo'
              }
            />
          </View>

          {r.conPrecio < r.total ? (
            <>
              <Rule />
              <Text style={[type.caption, { color: colors.noSignal, paddingTop: space.xs }]}>
                {r.total - r.conPrecio} sin precio actual: el recuento de arriba se calcula sólo
                sobre los {r.conPrecio} que sí lo tienen.
              </Text>
            </>
          ) : null}
        </>
      )}
    </Panel>
  );
}
