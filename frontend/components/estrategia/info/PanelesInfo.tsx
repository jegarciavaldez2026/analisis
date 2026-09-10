/**
 * Calendario económico, noticias, alertas y órdenes ejecutadas.
 *
 * Regla de diseño que el usuario fijó y aquí se respeta: **el calendario y las
 * noticias no generan compras ni ventas**. Son filtros de riesgo y
 * modificadores de confianza. Por eso ninguno de estos paneles muestra un
 * veredicto ni un botón de operar: informan del contexto, no lo convierten en
 * una orden.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { toneColors } from '../../../theme/tokens';
import {
  Alerta,
  Bloque,
  EventoValor,
  Noticia,
  OrdenEjecutada,
} from '../../../lib/estrategia/tipos';
import { cifra, dinero, entero } from '../../../lib/estrategia/formato';
import { Chip, Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';

/**
 * Eventos del propio valor.
 *
 * Esto NO es el calendario macro: el calendario económico es un componente
 * aparte con su propia fuente (Econdb). Aquí van resultados, ex-dividendo y
 * pago, que es lo único que el proveedor confirma para un ticker concreto.
 *
 * No hay columna de país ni de impacto porque el backend no los devuelve, y
 * rellenarlos con «US» y «medio» —como hacía la primera versión— es inventar
 * dos datos para que la tabla parezca más completa de lo que es.
 */
export function EventosDelValor({
  bloque,
  cargando,
}: {
  bloque: Bloque<EventoValor[]>;
  cargando?: boolean;
}) {
  const { colors, hairline } = useTheme();
  return (
    <Placa
      titulo="Eventos del valor"
      procedencia={bloque.procedencia}
      derecha={<Rotulo>No genera órdenes</Rotulo>}
    >
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={3}>
        {(eventos) => (
          <View style={{ gap: 2 }}>
            {eventos.map((e, i) => (
              <View
                key={`${e.evento}-${i}`}
                style={{
                  gap: 1,
                  paddingVertical: 3,
                  borderBottomWidth: i === eventos.length - 1 ? 0 : hairline,
                  borderBottomColor: colors.rule,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[T.dato, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
                    {e.evento}
                  </Text>
                  <Cifra valor={e.fecha || null} escala="micro" />
                  <Chip
                    texto={e.dias === null ? 'sin fecha' : e.dias === 0 ? 'hoy' : `en ${e.dias} d`}
                    tono={e.dias !== null && e.dias <= 3 ? 'caution' : 'neutral'}
                  />
                </View>
                {e.detalle ? (
                  <Text style={[T.micro, { color: colors.inkMuted }]} numberOfLines={2}>
                    {e.detalle}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}

export function PanelNoticias({
  bloque,
  cargando,
}: {
  bloque: Bloque<Noticia[]>;
  cargando?: boolean;
}) {
  const { colors, hairline } = useTheme();
  return (
    <Placa
      titulo="Noticias · impacto en narrativa"
      procedencia={bloque.procedencia}
      derecha={<Rotulo>Modificador de confianza</Rotulo>}
    >
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={5}>
        {(noticias) => (
          <View style={{ gap: 2 }}>
            {noticias.map((n, i) => (
              <View
                key={`${n.titular}-${i}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 6,
                  paddingVertical: 3,
                  borderBottomWidth: i === noticias.length - 1 ? 0 : hairline,
                  borderBottomColor: colors.rule,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text style={[T.dato, { color: colors.ink }]} numberOfLines={2}>
                    {n.titular}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[T.micro, { color: colors.inkFaint, flexShrink: 1 }]} numberOfLines={1}>
                      {[n.medio, n.cuando].filter(Boolean).join(' · ')}
                    </Text>
                    {/* Quien lee tiene derecho a saber que el titular lo
                        escribió un modelo, no el medio. */}
                    {n.traducido ? <Chip texto="traducido" icono="language-outline" /> : null}
                  </View>
                </View>
                {/* Puntuación de narrativa, no un porcentaje de precio: se
                    dibuja con signo y sin unidad, y la unidad se explica en
                    el pie del panel una sola vez. */}
                <Cifra
                  valor={n.impacto === null ? null : (n.impacto > 0 ? '+' : '') + n.impacto.toFixed(1)}
                  tono={n.impacto === null || n.impacto === 0 ? 'neutral' : n.impacto > 0 ? 'up' : 'down'}
                  escala="datoFuerte"
                />
              </View>
            ))}
            <Text style={[T.micro, { color: colors.inkFaint, paddingTop: 3 }]}>
              La cifra es la puntuación de impacto en narrativa (−4 a +4) que calcula /overton
              por palabras clave del titular. No es una variación de precio.
              {noticias.some((n) => n.traducido)
                ? ' Los titulares marcados están traducidos automáticamente con un modelo local; el enlace lleva al original.'
                : ''}
            </Text>
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}

export function PanelAlertas({
  bloque,
  cargando,
}: {
  bloque: Bloque<Alerta[]>;
  cargando?: boolean;
}) {
  const { colors, palette, hairline } = useTheme();
  return (
    <Placa titulo="Alertas activas" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={3}>
        {(alertas) => (
          <View style={{ gap: 2 }}>
            {alertas.map((a, i) => {
              const { fg } = toneColors(palette, a.tono);
              return (
                <View
                  key={`${a.titulo}-${i}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 3,
                    borderBottomWidth: i === alertas.length - 1 ? 0 : hairline,
                    borderBottomColor: colors.rule,
                  }}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[T.dato, { color: colors.ink }]} numberOfLines={1}>
                      {a.titulo}
                    </Text>
                    <Text style={[T.micro, { color: colors.inkMuted }]} numberOfLines={1}>
                      {a.detalle}
                    </Text>
                  </View>
                  <Text style={[T.micro, { color: colors.inkFaint }]}>{a.cuando}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}

/**
 * Transacciones de la cartera.
 *
 * No se llama «Órdenes ejecutadas» porque no lo son: son las compras y ventas
 * que hay registradas en tu cartera. No existe bróker ni motor de ejecución,
 * así que ninguna de estas la mandó el robot, y el rótulo tiene que decirlo.
 */
export function Transacciones({
  bloque,
  cargando,
}: {
  bloque: Bloque<OrdenEjecutada[]>;
  cargando?: boolean;
}) {
  const { colors, palette, hairline } = useTheme();
  return (
    <Placa
      titulo="Transacciones de la cartera"
      procedencia={bloque.procedencia}
      derecha={<Rotulo>No ejecutadas por el robot</Rotulo>}
    >
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={6}>
        {(ordenes) => (
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', gap: 4, paddingBottom: 2 }}>
              <View style={{ width: 56 }}>
                <Rotulo>Fecha</Rotulo>
              </View>
              <View style={{ width: 46 }}>
                <Rotulo>Valor</Rotulo>
              </View>
              <View style={{ width: 44 }}>
                <Rotulo>Lado</Rotulo>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Rotulo>Cant.</Rotulo>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Rotulo>Precio</Rotulo>
              </View>
              <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                <Rotulo>Importe</Rotulo>
              </View>
            </View>
            {ordenes.map((o, i) => (
              <View
                key={`${o.hora}-${i}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  minHeight: 18,
                  borderTopWidth: hairline,
                  borderTopColor: colors.rule,
                }}
              >
                <View style={{ width: 56 }}>
                  <Cifra valor={o.hora} escala="micro" />
                </View>
                <View style={{ width: 46 }}>
                  <Text style={[T.datoFuerte, { color: colors.ink }]} numberOfLines={1}>
                    {o.simbolo}
                  </Text>
                </View>
                <View style={{ width: 44 }}>
                  <Text
                    style={[
                      T.rotulo,
                      { fontSize: 9, color: o.lado === 'COMPRA' ? palette.up : palette.down },
                    ]}
                  >
                    {o.lado}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Cifra valor={entero(o.cantidad)} />
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Cifra valor={cifra(o.precio)} />
                </View>
                <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                  <Cifra valor={dinero(o.importe)} />
                </View>
              </View>
            ))}
          </View>
        )}
      </ConDatos>
    </Placa>
  );
}
