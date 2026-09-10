/**
 * Activo seleccionado.
 *
 * El precio manda: es lo único a 26 px de la placa. Debajo, la rejilla de
 * datos de sesión. Los campos que Yahoo no sirve en este endpoint (apertura,
 * máximo y mínimo de la sesión) se dibujan como huecos con su motivo, no como
 * ceros: un `0,00` en una medida se lee como una afirmación sobre el mercado.
 *
 * BID, ASK y HORQUILLA sí salen ahora, de `info` de Yahoo — que corrige la
 * creencia de que yfinance no da horquilla: eso sólo vale para `history()`.
 * Lo que no da es una horquilla FIABLE, así que el backend la valida y aquí
 * se dibuja el hueco con su motivo cuando el dato no se sostiene. Medido en
 * mercado abierto, AAPL llegó a cotizar 314,02 / 330,00 —un 4,96 %— y MSFT un
 * 1,00 %: cifras perfectamente creíbles en pantalla y completamente falsas.
 *
 * La horquilla va DEBAJO de bid y ask, que es donde se lee: primero los dos
 * lados, luego lo que separan.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, DatosMercado } from '../../../lib/estrategia/tipos';
import { cifra, dinero, porcentaje, tonoDe, volumen } from '../../../lib/estrategia/formato';
import { Cifra, ConDatos, D, Placa, Rotulo, T } from '../Terminal';

function Celda({
  rotulo,
  valor,
  tono = 'neutral' as const,
  motivo,
}: {
  rotulo: string;
  valor: string | null;
  tono?: 'up' | 'down' | 'neutral' | 'caution' | 'accent';
  motivo?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexBasis: '48%', flexGrow: 1, minWidth: 0, gap: 1 }}>
      <Rotulo>{rotulo}</Rotulo>
      {motivo ? (
        <View style={{ gap: 1 }}>
          <Cifra valor={null} escala="datoFuerte" />
          <Text style={[T.micro, { color: colors.noSignal }]} numberOfLines={2}>
            {motivo}
          </Text>
        </View>
      ) : (
        <Cifra valor={valor} tono={tono} escala="datoFuerte" />
      )}
    </View>
  );
}

export default function PanelActivo({
  bloque,
  cargando,
}: {
  bloque: Bloque<DatosMercado>;
  cargando?: boolean;
}) {
  const { colors, hairline } = useTheme();

  return (
    <Placa titulo="Activo seleccionado" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={6}>
        {(m) => {
          const tono = tonoDe(m.cambioPct);
          const h = m.horquilla;
          // El motivo lo escribe el backend, que es quien tiene las cifras
          // del contraste. Aquí sólo se añade el caso de que no venga nada.
          // En la celda, el titular corto: repetir el motivo largo en tres
          // celdas de 110 px lo recorta tres veces y no se lee ninguno. La
          // explicación completa va una sola vez, al pie.
          const motivoHorquilla = !h
            ? 'Sin horquilla en tiempo real'
            : h.motivo?.startsWith('Horquilla implausible')
              ? 'Cotización rota'
              : h.motivo?.startsWith('Mercado cruzado')
                ? 'Mercado cruzado'
                : h.motivo?.startsWith('Horquilla bloqueada')
                  ? 'Horquilla bloqueada'
                  : 'Sin horquilla válida';
          return (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[T.titular, { color: colors.ink }]} numberOfLines={1}>
                    {m.simbolo}
                  </Text>
                  <Text style={[T.dato, { color: colors.inkMuted }]} numberOfLines={1}>
                    {m.nombre}
                  </Text>
                  {m.sector || m.industria ? (
                    <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
                      {[m.sector, m.industria].filter(Boolean).join(' / ')}
                    </Text>
                  ) : null}
                </View>
                {m.mercado ? <Rotulo>{m.mercado}</Rotulo> : null}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <Cifra valor={cifra(m.precio)} tono={tono} escala="cifraGrande" />
                <View style={{ flexDirection: 'row', gap: 5, alignItems: 'baseline' }}>
                  <Cifra valor={cifra(m.cambio)} tono={tono} escala="medida" />
                  <Cifra valor={porcentaje(m.cambioPct, 2, true)} tono={tono} escala="medida" />
                </View>
              </View>

              <View style={{ height: hairline, backgroundColor: colors.rule }} />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: D.pad, rowGap: 6 }}>
                {/* Bid, ask y —debajo— lo que separan. Con el dato marcado
                    como no fiable se enseña el hueco y su motivo: una
                    horquilla del 4,96 % en AAPL es más dañina que un guion,
                    porque se puede usar para decidir. */}
                <Celda
                  rotulo="Bid"
                  valor={h?.fiable ? cifra(h.bid) : null}
                  motivo={h?.fiable ? undefined : motivoHorquilla}
                />
                <Celda
                  rotulo="Ask"
                  valor={h?.fiable ? cifra(h.ask) : null}
                  motivo={h?.fiable ? undefined : motivoHorquilla}
                />
                <Celda
                  rotulo="Horquilla"
                  valor={
                    h?.fiable && h.spreadPct !== null
                      ? `${cifra(h.spread)} · ${h.spreadPct.toFixed(3)} %`
                      : null
                  }
                  tono="accent"
                  motivo={h?.fiable ? undefined : motivoHorquilla}
                />
                <Celda
                  rotulo="Tamaños"
                  valor={
                    h?.fiable && (h.bidSize || h.askSize)
                      ? `${h.bidSize ?? '—'} × ${h.askSize ?? '—'}`
                      : null
                  }
                  motivo={h?.fiable ? undefined : 'Sin horquilla válida'}
                />
                <Celda rotulo="Máximo 52 s." valor={cifra(m.max52)} />
                <Celda rotulo="Mínimo 52 s." valor={cifra(m.min52)} />
                <Celda rotulo="Volumen" valor={volumen(m.volumen)} />
                <Celda rotulo="Vol. medio" valor={volumen(m.volumenMedio)} />
                <Celda rotulo="Cierre ant." valor={cifra(m.cierreAnterior)} />
                <Celda rotulo="Capitaliz." valor={dinero(m.capitalizacion)} />
                <Celda rotulo="Apertura" valor={null} motivo="No la sirve /overton" />
                <Celda rotulo="Rango sesión" valor={null} motivo="No lo sirve /overton" />
              </View>

              {/* Sin esta línea, una horquilla del 0,004 % se leería como una
                  cotización en vivo. Llega con retraso, y a menudo el precio
                  ya se ha salido de ella: eso desfasa el NIVEL, no la
                  anchura, y por eso la cifra sigue valiendo. Para bloquear
                  una orden sólo sirve la cotización del bróker. */}
              {h && !h.fiable && h.motivo ? (
                <Text style={[T.micro, { color: colors.noSignal }]}>{h.motivo}</Text>
              ) : null}

              {h?.fiable ? (
                <Text style={[T.micro, { color: colors.inkFaint }]}>
                  Horquilla de Yahoo con ~15 min de retraso
                  {h.desfasada ? ', y el último precio ya está fuera de ella' : ''}
                  {h.rangoDiarioPct
                    ? ` · rango diario medio ${h.rangoDiarioPct.toFixed(2)} %`
                    : ''}
                  . Referencia, no filtro de ejecución.
                </Text>
              ) : null}
            </View>
          );
        }}
      </ConDatos>
    </Placa>
  );
}
