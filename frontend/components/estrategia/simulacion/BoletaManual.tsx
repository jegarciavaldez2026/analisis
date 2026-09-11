/**
 * ============================================================================
 * Boleta de orden manual
 * ============================================================================
 * El selector de modo, el de dirección y el formulario.
 *
 * **La previsualización se calcula ANTES de enviar**, con la misma aritmética
 * que usará el backend, y es lo que convierte el formulario en una decisión en
 * vez de en un salto de fe: riesgo en dinero, riesgo en porcentaje del
 * balance, R/B, nocional y margen se leen mientras se teclea.
 *
 * Que el cálculo esté duplicado aquí es deliberado y acotado: es una
 * PREVISUALIZACIÓN, y la cifra que manda es siempre la que devuelve el
 * servidor. Si algún día las dos discreparan, la de la tarjeta gana — es la
 * que cuadra el balance. Por eso aquí no se guarda nada de lo calculado.
 *
 * --------------------------------------------------------------------------
 * La validación que sí importa
 * --------------------------------------------------------------------------
 * La coherencia direccional se comprueba en el cliente para poder avisar sin
 * ida y vuelta, y se vuelve a comprobar en el servidor, que es quien manda.
 * Un LONG con el stop por encima de la entrada, o un SHORT con el objetivo por
 * encima, no dan ningún error por sí solos: dan una operación plausible que
 * pierde siempre. Es exactamente el bug que `/overton` provocaría si sus
 * niveles —largos por construcción— se usaran en un corto.
 */

import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../contexts/ThemeContext';
import { cifra, dinero, entero, porcentaje } from '../../../lib/estrategia/formato';
import {
  BoletaManual as TipoBoleta,
  CuentaSim,
  Direccion,
  ModoOperacion,
  ParametrosSim,
  RespuestaOrden,
  TipoOrden,
} from '../../../lib/simulacion/tipos';
import {
  BotonTerminal,
  CampoNumerico,
  Chip,
  Cifra,
  Conmutador,
  Placa,
  Rotulo,
  T,
} from '../Terminal';

const MODOS = [
  { clave: 'manual' as const, texto: 'Manual' },
  { clave: 'automatico' as const, texto: 'Automático' },
];

const DIRECCIONES = [
  { clave: 'long' as const, texto: 'Long' },
  { clave: 'short' as const, texto: 'Short' },
];

const TIPOS = [
  { clave: 'MARKET' as const, texto: 'Market' },
  { clave: 'LIMIT' as const, texto: 'Limit' },
];

/** Cómo se dimensiona: a mano o por riesgo. Son excluyentes a propósito. */
const MODOS_TAMANO = [
  { clave: 'riesgo' as const, texto: 'Por riesgo' },
  { clave: 'manual' as const, texto: 'A mano' },
];

interface Aviso {
  texto: string;
  bloquea: boolean;
}

/**
 * Coherencia direccional, en cliente.
 *
 * Se duplica a propósito la del backend (`_coherencia_direccional`): aquí sirve
 * para que el botón se apague ANTES de mandar nada, allí para que no entre por
 * otra puerta. La del servidor es la que manda.
 */
function revisar(
  direccion: Direccion,
  entrada: number | null,
  sl: number | null,
  tp: number | null,
  cantidad: number | null,
  balance: number,
  riesgoMax: number,
): Aviso[] {
  const avisos: Aviso[] = [];
  if (entrada === null || entrada <= 0) {
    avisos.push({ texto: 'Falta el precio de referencia.', bloquea: true });
    return avisos;
  }
  const largo = direccion === 'long';

  if (sl !== null) {
    if (largo ? sl >= entrada : sl <= entrada) {
      avisos.push({
        texto: `Un ${direccion.toUpperCase()} con entrada ${cifra(entrada, 4)} necesita el stop ${
          largo ? 'por debajo' : 'por encima'
        }; hay ${cifra(sl, 4)}.`,
        bloquea: true,
      });
    }
  } else {
    avisos.push({
      texto: 'Sin stop loss no hay riesgo acotado: la pérdida máxima es todo el nocional.',
      bloquea: false,
    });
  }

  if (tp !== null && (largo ? tp <= entrada : tp >= entrada)) {
    avisos.push({
      texto: `Un ${direccion.toUpperCase()} con entrada ${cifra(entrada, 4)} necesita el objetivo ${
        largo ? 'por encima' : 'por debajo'
      }; hay ${cifra(tp, 4)}.`,
      bloquea: true,
    });
  }

  if (cantidad !== null && sl !== null && balance > 0) {
    const riesgoPct = (Math.abs(entrada - sl) * cantidad) / balance * 100;
    if (riesgoPct > riesgoMax) {
      avisos.push({
        texto: `Arriesga el ${porcentaje(riesgoPct, 2)} del balance y el máximo configurado es ${porcentaje(riesgoMax, 2)}.`,
        bloquea: true,
      });
    }
  }

  if (sl !== null && tp !== null) {
    const riesgo = Math.abs(entrada - sl);
    const rb = riesgo > 0 ? Math.abs(tp - entrada) / riesgo : null;
    if (rb !== null && rb < 1) {
      avisos.push({
        texto: `El objetivo está más cerca que el stop (R/B ${cifra(rb, 2)}). Hay que acertar más veces de las que se falla sólo para no perder.`,
        bloquea: false,
      });
    }
  }
  return avisos;
}

export default function BoletaManualPanel({
  simbolo,
  precioMercado,
  cuenta,
  parametros,
  modo,
  onModo,
  onEnviar,
  deshabilitado,
}: {
  simbolo: string;
  /** Último precio conocido. `null` si no hay cotización: sin él no se opera. */
  precioMercado: number | null;
  cuenta: CuentaSim | null;
  parametros: ParametrosSim | null;
  modo: ModoOperacion;
  onModo: (m: ModoOperacion) => void;
  onEnviar: (b: TipoBoleta) => Promise<RespuestaOrden | null>;
  deshabilitado?: boolean;
}) {
  const { colors, palette, hairline, radius } = useTheme();

  const [direccion, setDireccion] = useState<Direccion>('long');
  const [tipo, setTipo] = useState<TipoOrden>('MARKET');
  const [modoTamano, setModoTamano] = useState<'riesgo' | 'manual'>('riesgo');

  const [limite, setLimite] = useState<number | null>(null);
  const [cantidadManual, setCantidadManual] = useState<number | null>(null);
  const [sl, setSL] = useState<number | null>(null);
  const [tp, setTP] = useState<number | null>(null);
  const [capitalPct, setCapitalPct] = useState<number | null>(25);
  const [riesgoPct, setRiesgoPct] = useState<number | null>(0.5);
  const [apalancamiento, setApalancamiento] = useState<number | null>(1);
  const [caducidad, setCaducidad] = useState<number | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaOrden | null>(null);

  const balance = cuenta?.balance ?? 0;
  const libre = cuenta?.libre ?? 0;
  const riesgoMax = parametros?.riesgo_max_pct ?? 5;

  /** El precio sobre el que se calcula todo: el límite si lo hay, si no el de mercado. */
  const entrada = tipo === 'LIMIT' ? limite : precioMercado;

  /* ----------------------------------------------------------------
   * Previsualización
   * -------------------------------------------------------------- */

  const previo = useMemo(() => {
    if (entrada === null || entrada <= 0) return null;
    const capital = balance * ((capitalPct ?? 100) / 100);
    const distancia = sl !== null ? Math.abs(entrada - sl) : null;

    const porRiesgo =
      distancia && distancia > 0 && riesgoPct
        ? Math.floor((capital * (riesgoPct / 100)) / distancia)
        : null;

    const cantidad = modoTamano === 'manual' ? cantidadManual : porRiesgo;
    if (!cantidad || cantidad <= 0) {
      return { cantidad: null, nocional: null, margen: null, riesgo: null, riesgoPctReal: null, rb: null, capital };
    }

    const nocional = entrada * cantidad;
    const apal = Math.max(1, apalancamiento ?? 1);
    const riesgo = distancia !== null ? distancia * cantidad : null;
    const rb =
      distancia && distancia > 0 && tp !== null ? Math.abs(tp - entrada) / distancia : null;

    return {
      cantidad,
      nocional,
      margen: nocional / apal,
      riesgo,
      riesgoPctReal: riesgo !== null && balance > 0 ? (riesgo / balance) * 100 : null,
      rb,
      capital,
    };
  }, [entrada, balance, capitalPct, riesgoPct, sl, tp, modoTamano, cantidadManual, apalancamiento]);

  const avisos = useMemo(
    () => revisar(direccion, entrada, sl, tp, previo?.cantidad ?? null, balance, riesgoMax),
    [direccion, entrada, sl, tp, previo?.cantidad, balance, riesgoMax],
  );
  const bloqueado =
    avisos.some((a) => a.bloquea) ||
    !previo?.cantidad ||
    (previo.margen ?? 0) > libre + 1e-9 ||
    precioMercado === null;

  const sinMargen = (previo?.margen ?? 0) > libre + 1e-9;

  /* ----------------------------------------------------------------
   * Envío
   * -------------------------------------------------------------- */

  async function enviar() {
    setEnviando(true);
    setRespuesta(null);
    const r = await onEnviar({
      simbolo,
      direccion,
      tipo,
      // Cuando dimensiona el riesgo, la cantidad la calcula el SERVIDOR: así
      // el número que entra en la orden y el que cuadra el balance salen de la
      // misma cuenta. La previsualización de aquí no se manda.
      cantidad: modoTamano === 'manual' ? cantidadManual : null,
      precio_limite: tipo === 'LIMIT' ? limite : null,
      stop_loss: sl,
      take_profit: tp,
      apalancamiento: Math.max(1, apalancamiento ?? 1),
      riesgo_pct: modoTamano === 'riesgo' ? riesgoPct : null,
      capital_pct: modoTamano === 'riesgo' ? capitalPct : null,
      caduca_en_horas: tipo === 'LIMIT' ? caducidad : null,
    });
    setRespuesta(r);
    setEnviando(false);
  }

  const tonoLado = direccion === 'long' ? ('up' as const) : ('down' as const);

  return (
    <Placa
      titulo="Operar"
      derecha={<Chip texto="Simulado" tono="caution" icono="flask-outline" />}
    >
      <View style={{ gap: 8 }}>
        {/* ---------- Modo de operación ---------- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
          <Rotulo>Modo de operación</Rotulo>
          <Conmutador opciones={MODOS} activa={modo} onChange={onModo} />
        </View>

        {modo === 'automatico' ? (
          <View
            style={{
              gap: 4,
              padding: 8,
              borderRadius: radius.xs,
              borderWidth: hairline,
              borderColor: colors.rule,
              backgroundColor: colors.surfaceSunken,
            }}
          >
            <Text style={[T.datoFuerte, { color: colors.ink }]}>El robot decide la dirección</Text>
            <Text style={[T.dato, { color: colors.inkMuted, lineHeight: 16 }]}>
              En automático la dirección, la entrada, el stop, el objetivo y el tamaño los fija la
              estrategia que ya existe. Los mandos están en «Robot», justo debajo, con el registro
              de por qué abrió —o por qué no— cada operación.
            </Text>
            <Text style={[T.micro, { color: colors.inkFaint }]}>
              Puedes volver a MANUAL en cualquier momento: el robot no cierra lo que abriste tú.
            </Text>
          </View>
        ) : (
          <>
            {/* ---------- Dirección y tipo ---------- */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <View style={{ gap: 2 }}>
                <Rotulo tono={tonoLado}>Dirección</Rotulo>
                <Conmutador opciones={DIRECCIONES} activa={direccion} onChange={setDireccion} />
              </View>
              <View style={{ gap: 2 }}>
                <Rotulo>Tipo de entrada</Rotulo>
                <Conmutador opciones={TIPOS} activa={tipo} onChange={setTipo} />
              </View>
              <View style={{ gap: 2, flexGrow: 1, alignItems: 'flex-end' }}>
                <Rotulo>{simbolo} · precio</Rotulo>
                <Cifra valor={cifra(precioMercado, 4)} tono="accent" escala="medida" />
              </View>
            </View>

            {/* Qué significa cada tipo. Dos líneas que evitan la pregunta. */}
            <Text style={[T.micro, { color: colors.inkFaint }]}>
              {tipo === 'MARKET'
                ? 'MARKET: se abre ya, al último precio conocido más el deslizamiento.'
                : direccion === 'long'
                  ? 'LIMIT: queda pendiente y sólo se ejecuta si el precio BAJA hasta el límite. Hasta entonces no hay posición.'
                  : 'LIMIT: queda pendiente y sólo se ejecuta si el precio SUBE hasta el límite. Hasta entonces no hay posición.'}
            </Text>

            {/* ---------- Precio y niveles ---------- */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 6 }}>
              {tipo === 'LIMIT' ? (
                <CampoNumerico
                  etiqueta="Precio límite"
                  valor={limite}
                  onChange={setLimite}
                  marcador={cifra(precioMercado, 2) ?? '—'}
                  tono="accent"
                />
              ) : null}
              <CampoNumerico
                etiqueta="Stop loss"
                valor={sl}
                onChange={setSL}
                tono="down"
                ayuda={
                  entrada !== null && sl !== null
                    ? `${porcentaje(Math.abs((sl - entrada) / entrada) * 100, 2)} de la entrada`
                    : null
                }
              />
              <CampoNumerico
                etiqueta="Take profit"
                valor={tp}
                onChange={setTP}
                tono="up"
                ayuda={
                  entrada !== null && tp !== null
                    ? `${porcentaje(Math.abs((tp - entrada) / entrada) * 100, 2)} de la entrada`
                    : null
                }
              />
            </View>

            {/* ---------- Tamaño ---------- */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <Rotulo>Tamaño de la posición</Rotulo>
              <Conmutador opciones={MODOS_TAMANO} activa={modoTamano} onChange={setModoTamano} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 6 }}>
              {modoTamano === 'manual' ? (
                <CampoNumerico
                  etiqueta="Cantidad"
                  valor={cantidadManual}
                  onChange={setCantidadManual}
                  sufijo="acc."
                />
              ) : (
                <>
                  <CampoNumerico
                    etiqueta="Capital destinado"
                    valor={capitalPct}
                    onChange={setCapitalPct}
                    sufijo="%"
                    ayuda={previo ? dinero(previo.capital) : null}
                  />
                  <CampoNumerico
                    etiqueta="Riesgo por operación"
                    valor={riesgoPct}
                    onChange={setRiesgoPct}
                    sufijo="%"
                    ayuda={previo?.riesgo !== null && previo?.riesgo !== undefined ? dinero(previo.riesgo) : null}
                  />
                </>
              )}
              <CampoNumerico
                etiqueta="Apalancamiento"
                valor={apalancamiento}
                onChange={setApalancamiento}
                sufijo="×"
                ayuda={(apalancamiento ?? 1) > 1 ? 'Sin reglas de bróker detrás' : 'Al contado'}
              />
              {tipo === 'LIMIT' ? (
                <CampoNumerico
                  etiqueta="Caduca en"
                  valor={caducidad}
                  onChange={setCaducidad}
                  sufijo="h"
                  ayuda="Vacío = hasta cancelar"
                />
              ) : null}
            </View>

            {/* ---------- Previsualización ---------- */}
            <View
              style={{
                gap: 5,
                padding: 8,
                borderRadius: radius.xs,
                borderWidth: hairline,
                borderColor: colors.rule,
                backgroundColor: colors.surfaceSunken,
              }}
            >
              <Rotulo>Antes de enviar</Rotulo>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 5 }}>
                {(
                  [
                    ['Cantidad', previo?.cantidad ? `${entero(previo.cantidad)} acc.` : null, 'neutral'],
                    ['Valor nocional', dinero(previo?.nocional ?? null), 'neutral'],
                    ['Margen retenido', dinero(previo?.margen ?? null), sinMargen ? 'down' : 'neutral'],
                    ['Riesgo', dinero(previo?.riesgo ?? null), 'down'],
                    ['Riesgo del balance', porcentaje(previo?.riesgoPctReal ?? null, 2), 'down'],
                    ['Riesgo / beneficio', cifra(previo?.rb ?? null, 2), (previo?.rb ?? 0) >= 1 ? 'up' : 'caution'],
                  ] as const
                ).map(([rot, val, tono]) => (
                  <View key={rot} style={{ flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 1 }}>
                    <Rotulo>{rot}</Rotulo>
                    <Cifra valor={val} tono={tono as any} escala="datoFuerte" />
                  </View>
                ))}
              </View>
              <Text style={[T.micro, { color: colors.inkFaint }]}>
                Libre para abrir: {dinero(libre) ?? '—'} · estas cifras son una previsualización;
                la que cuenta es la que devuelve el servidor al ejecutar.
              </Text>
            </View>

            {/* ---------- Avisos ---------- */}
            {sinMargen ? (
              <Text style={[T.dato, { color: palette.down }]}>
                Hacen falta {dinero(previo?.margen ?? null)} de margen y sólo quedan{' '}
                {dinero(libre)} libres.
              </Text>
            ) : null}
            {avisos.map((a) => (
              <View key={a.texto} style={{ flexDirection: 'row', gap: 5, alignItems: 'flex-start' }}>
                <Text style={[T.datoFuerte, { color: a.bloquea ? palette.down : palette.caution }]}>
                  {a.bloquea ? '✗' : '!'}
                </Text>
                <Text
                  style={[T.dato, { color: a.bloquea ? palette.down : colors.inkMuted, flex: 1, lineHeight: 15 }]}
                >
                  {a.texto}
                </Text>
              </View>
            ))}

            {/* ---------- Enviar ---------- */}
            <BotonTerminal
              texto={
                enviando
                  ? 'Enviando…'
                  : tipo === 'MARKET'
                    ? `Abrir ${direccion === 'long' ? 'LONG' : 'SHORT'} simulado`
                    : `Colocar LIMIT ${direccion === 'long' ? 'LONG' : 'SHORT'}`
              }
              tono={tonoLado}
              icono={direccion === 'long' ? 'trending-up' : 'trending-down'}
              relleno
              deshabilitado={bloqueado || enviando || deshabilitado}
              onPress={enviar}
            />

            {precioMercado === null ? (
              <Text style={[T.micro, { color: colors.noSignal }]}>
                Sin cotización de {simbolo}: no hay precio con el que simular.
              </Text>
            ) : null}

            {/* ---------- Respuesta del servidor ---------- */}
            {respuesta ? (
              <View
                style={{
                  gap: 3,
                  padding: 8,
                  borderRadius: radius.xs,
                  borderWidth: hairline,
                  borderColor: respuesta.ok ? palette.up : palette.down,
                  backgroundColor: respuesta.ok ? palette.upWash : palette.downWash,
                }}
              >
                <Text style={[T.datoFuerte, { color: respuesta.ok ? palette.up : palette.down }]}>
                  {respuesta.ok
                    ? respuesta.posicion
                      ? `${respuesta.orden.id} ejecutada → posición ${respuesta.posicion.id}`
                      : `${respuesta.orden.id} pendiente a ${cifra(respuesta.orden.precio_limite, 4)}`
                    : `${respuesta.orden.id} rechazada`}
                </Text>
                {respuesta.nota_tamano ? (
                  <Text style={[T.micro, { color: colors.inkMuted }]}>{respuesta.nota_tamano}</Text>
                ) : null}
                {respuesta.rechazos
                  .filter((r) => r.bloquea)
                  .map((r) => (
                    <Text key={r.codigo} style={[T.dato, { color: palette.down, lineHeight: 15 }]}>
                      {r.mensaje}
                    </Text>
                  ))}
                {respuesta.avisos.map((a) => (
                  <Text key={a} style={[T.micro, { color: colors.inkMuted, lineHeight: 14 }]}>
                    {a}
                  </Text>
                ))}
                {respuesta.ok && !respuesta.posicion ? (
                  <Text style={[T.micro, { color: colors.inkMuted }]}>
                    Todavía NO hay posición: la orden espera a que el precio llegue al límite.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    </Placa>
  );
}
