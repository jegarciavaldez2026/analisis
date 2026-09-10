/**
 * ============================================================================
 * Puntos pivote de Woodie
 * ============================================================================
 * Motor en `backend/pivots.py`, con pruebas ejecutables. Aquí sólo se dibuja.
 *
 * La forma es una ESCALERA, no un gráfico de velas, y es deliberado: lo que se
 * viene a mirar aquí es «a qué altura estoy dentro del mapa y cuánto queda
 * hasta el siguiente nivel». En 400 px de columna, siete líneas horizontales
 * sobre unas velas de 2 px no contestan eso; una escalera con el precio
 * insertado en su peldaño, sí. Es el mismo diagrama que el usuario dibujó en
 * ASCII en su propio texto.
 *
 * Tres cosas que la tarjeta enseña y que no salen en la mayoría de estos
 * indicadores:
 *
 * - **La tasa de toque de cada nivel**, medida sobre los últimos N periodos.
 *   Sustituye a repartir estrellas: un R3 con un 7 % se lee solo.
 * - **La colinealidad PP/VWAP.** Exigir «precio > PP y precio > VWAP» sólo
 *   suma evidencia si las dos discrepan a veces. Se mide y se dice.
 * - **La fase de la secuencia.** Sesgo → ruptura → retroceso → rechazo no es
 *   una conjunción de condiciones, es un orden. Ver en qué fase está es lo
 *   que distingue «no hay nada» de «va por la mitad».
 *
 * El VWAP va DOS VECES a propósito: como peldaño en su precio real, para no
 * mentir sobre la geometría, y repetido en la fila del PP, que es donde se
 * pidió y donde se compara de un vistazo.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../../contexts/ThemeContext';
import { Tone, toneColors } from '../../../theme/tokens';
import {
  Bloque,
  ControlesPivote,
  MarcoPivote,
  NivelPivote,
  Pivotes,
  VarianteWoodie,
} from '../../../lib/estrategia/tipos';
import { leerPivotes } from '../../../lib/estrategia/api';
import { cifra } from '../../../lib/estrategia/formato';
import { Cargando, Chip, Cifra, Conmutador, Placa, Rotulo, SinFuente, T } from '../Terminal';

const MARCOS: readonly { clave: MarcoPivote; texto: string }[] = [
  { clave: '5m', texto: '5m' },
  { clave: '15m', texto: '15m' },
  { clave: '1h', texto: '1H' },
  { clave: '4h', texto: '4H' },
  { clave: '1d', texto: '1D' },
  { clave: '1w', texto: '1S' },
];

const VARIANTES: readonly { clave: VarianteWoodie; texto: string }[] = [
  { clave: 'apertura', texto: 'APERTURA' },
  { clave: 'cierre', texto: 'CIERRE' },
];

/** Nombre de cada fase, para la barra de progreso de la secuencia. */
const FASES = ['Sesgo', 'Ruptura', 'Retroceso', 'Rechazo'] as const;

function pct(v: number | null | undefined, decimales = 1, signo = false): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const s = signo && v > 0 ? '+' : '';
  return `${s}${v.toFixed(decimales)} %`;
}

/* ==========================================================================
 * Barra de toques — la medida que sustituye a las estrellas
 * ======================================================================== */

function BarraToques({ valor }: { valor: number | null }) {
  const { colors, radius, hairline, palette } = useTheme();
  if (valor === null || !Number.isFinite(valor)) {
    return <View style={{ width: 34 }} />;
  }
  // El tono sigue la frecuencia, no la dirección: un nivel que se toca mucho
  // no es alcista ni bajista, es sólo probable.
  const tono: Tone = valor >= 0.5 ? 'accent' : valor >= 0.2 ? 'caution' : 'neutral';
  const { fg } = toneColors(palette, tono);
  return (
    <View style={{ width: 34, gap: 1 }}>
      <View
        style={{
          height: 3,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceSunken,
          borderWidth: hairline,
          borderColor: colors.rule,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.max(2, Math.min(100, valor * 100))}%`,
            height: '100%',
            backgroundColor: tono === 'neutral' ? colors.noSignal : fg,
          }}
        />
      </View>
    </View>
  );
}

/* ==========================================================================
 * Interruptor compacto
 * ======================================================================== */

function Interruptor({
  texto,
  activo,
  onPress,
  ayuda,
}: {
  texto: string;
  activo: boolean;
  onPress: () => void;
  ayuda: string;
}) {
  const { colors, palette, radius, hairline } = useTheme();
  const { fg, wash } = toneColors(palette, 'accent');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: activo }}
      accessibilityLabel={`${texto}. ${ayuda}`}
      style={({ pressed, hovered }: any) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          paddingHorizontal: 5,
          paddingVertical: 2,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: activo ? fg : colors.rule,
          backgroundColor: activo
            ? wash
            : pressed || hovered
              ? colors.surfaceSunken
              : 'transparent',
        },
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
      ]}
    >
      <Ionicons
        name={activo ? 'checkmark-circle' : 'ellipse-outline'}
        size={9}
        color={activo ? fg : colors.noSignal}
      />
      <Text
        style={[
          T.rotulo,
          { fontSize: 9, color: activo ? fg : colors.inkFaint, textTransform: 'uppercase' },
        ]}
        numberOfLines={1}
      >
        {texto}
      </Text>
    </Pressable>
  );
}

/* ==========================================================================
 * Un peldaño de la escalera
 * ======================================================================== */

function Peldano({
  nivel,
  vwap,
  esPP,
}: {
  nivel: NivelPivote;
  /** Sólo en la fila del PP: el VWAP, que es donde se pidió verlo. */
  vwap?: { valor: number | null; sobre: boolean } | null;
  esPP: boolean;
}) {
  const { colors, palette, hairline, numeric, radius } = useTheme();
  const tono: Tone = nivel.papel === 'soporte' ? 'up' : 'down';
  const { fg } = toneColors(palette, tono);
  const { fg: fgAcento } = toneColors(palette, 'accent');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 2,
        paddingHorizontal: esPP ? 3 : 0,
        borderTopWidth: hairline,
        borderTopColor: colors.rule,
        // El PP es el nivel de equilibrio: se destaca porque es del que cuelga
        // todo lo demás, no por ser más probable.
        backgroundColor: esPP ? colors.surfaceSunken : 'transparent',
        borderRadius: esPP ? radius.xs : 0,
      }}
    >
      <Text
        style={[
          T.rotulo,
          { width: 22, fontSize: 9.5, color: esPP ? colors.ink : fg },
        ]}
        numberOfLines={1}
      >
        {nivel.clave}
      </Text>
      <View style={{ width: 58, alignItems: 'flex-end' }}>
        <Cifra valor={cifra(nivel.precio)} escala={esPP ? 'datoFuerte' : 'dato'} />
      </View>
      <View style={{ width: 48, alignItems: 'flex-end' }}>
        <Text style={[T.micro, numeric, { color: colors.inkFaint }]} numberOfLines={1}>
          {pct(nivel.distanciaPct, 2, true)}
        </Text>
      </View>
      <BarraToques valor={nivel.toquesPct} />
      <View style={{ width: 26, alignItems: 'flex-end' }}>
        <Text style={[T.micro, numeric, { color: colors.inkMuted }]} numberOfLines={1}>
          {nivel.toquesPct === null ? '—' : `${Math.round(nivel.toquesPct * 100)}%`}
        </Text>
      </View>
      {/* El VWAP, en la fila del PP: es la comparación que se pidió. */}
      {esPP && vwap ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 }}>
          <Text style={[T.rotulo, { fontSize: 8.5, color: fgAcento }]} numberOfLines={1}>
            VWAP
          </Text>
          <Text style={[T.dato, numeric, { color: colors.ink }]} numberOfLines={1}>
            {cifra(vwap.valor) ?? '—'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}


/* ==========================================================================
 * Veredicto y auditoría de las seis condiciones
 *
 * El banner LONG/SHORT sólo aparece con las SEIS cumplidas en orden. El resto
 * del tiempo se enseña la lista con lo que falta, que es la información útil:
 * «4 de 6, falta el retroceso» dice mucho más que un hueco en blanco, y evita
 * la lectura que el propio texto advertía de no hacer — el precio sobre el PP
 * NO es una orden de compra.
 * ======================================================================== */

function ChecklistSenal({ datos }: { datos: Pivotes }) {
  const { colors, palette, hairline, numeric, radius } = useTheme();
  const s = datos.senal;
  const largo = s.ladoAuditado === 'long';
  const tono: Tone = largo ? 'up' : 'down';
  const { fg, wash } = toneColors(palette, tono);

  return (
    <View style={{ gap: 4 }}>
      {/* ---------- Banner ---------- */}
      {s.veredicto ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 5,
            paddingHorizontal: 8,
            borderRadius: radius.xs,
            borderWidth: 1,
            borderColor: fg,
            backgroundColor: wash,
          }}
        >
          <Ionicons name={largo ? 'trending-up' : 'trending-down'} size={16} color={fg} />
          <Text style={[T.medida, { color: fg, letterSpacing: 0.5 }]}>{s.veredicto}</Text>
          <Text style={[T.micro, { color: colors.inkMuted, flex: 1 }]} numberOfLines={1}>
            las seis condiciones, en orden
          </Text>
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: radius.xs,
            borderWidth: hairline,
            borderStyle: 'dashed',
            borderColor: colors.rule,
          }}
        >
          <Ionicons name="remove-circle-outline" size={12} color={colors.noSignal} />
          <Text style={[T.datoFuerte, { color: colors.noSignal }]}>
            SIN SEÑAL
          </Text>
          <Text style={[T.micro, { color: colors.inkMuted, flex: 1 }]} numberOfLines={1}>
            {s.condicionesCumplidas} de 6 · auditando el lado {largo ? 'LONG' : 'SHORT'}
          </Text>
        </View>
      )}

      {/* ---------- Las seis condiciones ---------- */}
      <View>
        {s.condiciones.map((c, i) => (
          <View
            key={c.texto}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingVertical: 1.5,
              borderTopWidth: i === 0 ? 0 : hairline,
              borderTopColor: colors.rule,
            }}
          >
            <Text style={[T.micro, numeric, { color: colors.inkFaint, width: 10 }]}>{i + 1}</Text>
            <Ionicons
              name={c.cumplida ? 'checkmark-circle' : 'ellipse-outline'}
              size={11}
              color={c.cumplida ? fg : colors.noSignal}
            />
            <Text
              style={[
                T.dato,
                { color: c.cumplida ? colors.ink : colors.inkFaint, flex: 1 },
              ]}
              numberOfLines={1}
            >
              {c.texto}
            </Text>
            {/* La medida detrás del check: un ✓ sin cifra no se puede auditar. */}
            <Text
              style={[T.micro, numeric, { color: colors.inkFaint, maxWidth: 130 }]}
              numberOfLines={1}
            >
              {c.detalle}
            </Text>
          </View>
        ))}
      </View>

      {/* ---------- La última que sí se completó ---------- */}
      {s.ultimaSenal ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Rotulo>Última señal</Rotulo>
          <Chip
            texto={s.ultimaSenal.veredicto}
            tono={s.ultimaSenal.veredicto === 'LONG' ? 'up' : 'down'}
          />
          <Text style={[T.micro, numeric, { color: colors.inkMuted }]} numberOfLines={1}>
            {cifra(s.ultimaSenal.precio)}
            {s.ultimaSenal.stop !== null ? ` · stop ${cifra(s.ultimaSenal.stop)}` : ''} ·{' '}
            {s.ultimaSenal.barrasAtras === 0
              ? 'esta vela'
              : `hace ${s.ultimaSenal.barrasAtras} velas`}
          </Text>
        </View>
      ) : (
        <Text style={[T.micro, { color: colors.inkFaint }]}>
          Ninguna secuencia se ha completado en {datos.barras} velas de{' '}
          {datos.marco.toUpperCase()}.
        </Text>
      )}
    </View>
  );
}

/* ==========================================================================
 * Tarjeta
 * ======================================================================== */

export default function PanelPivotes({ simbolo }: { simbolo: string }) {
  const { colors, palette, hairline, numeric, radius } = useTheme();

  const [controles, setControles] = useState<ControlesPivote>({
    marco: '1h',
    variante: 'apertura',
  });
  const [bloque, setBloque] = useState<Bloque<Pivotes>>({
    datos: null,
    procedencia: 'real',
    nota: 'Cargando…',
  });
  const [cargando, setCargando] = useState(true);
  const [verClasico, setVerClasico] = useState(false);
  const peticion = useRef(0);

  useEffect(() => {
    const id = (peticion.current += 1);
    let vivo = true;
    setCargando(true);
    leerPivotes(simbolo, controles).then((b) => {
      if (!vivo || id !== peticion.current) return;
      setBloque(b);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [simbolo, controles]);

  const datos = bloque.datos;

  /**
   * La escalera con el precio y el VWAP insertados en su peldaño.
   *
   * Los dos van por su PRECIO real, no por conveniencia visual: colocarlos
   * donde quedan bonitos sería exactamente la clase de mentira geométrica que
   * hace que un mapa de niveles no sirva para nada.
   */
  const filas = useMemo(() => {
    if (!datos) return [];
    const marcas: { tipo: 'nivel' | 'precio' | 'vwap'; precio: number; nivel?: NivelPivote }[] =
      datos.niveles.map((n) => ({ tipo: 'nivel' as const, precio: n.precio, nivel: n }));
    marcas.push({ tipo: 'precio', precio: datos.precio.actual });
    if (datos.vwap.valor !== null) marcas.push({ tipo: 'vwap', precio: datos.vwap.valor });
    return marcas.sort((a, b) => b.precio - a.precio);
  }, [datos]);

  const tonoSenal: Tone =
    datos?.senal.direccion === 'compra' ? 'up' : datos?.senal.direccion === 'venta' ? 'down' : 'neutral';
  const { fg: fgSenal } = toneColors(palette, tonoSenal);

  return (
    <Placa
      titulo={`Pivotes Woodie · ${simbolo}`}
      procedencia={bloque.procedencia}
      derecha={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {cargando ? <Rotulo>···</Rotulo> : null}
          <Conmutador
            compacto
            opciones={MARCOS}
            activa={controles.marco}
            onChange={(marco) => setControles((p) => ({ ...p, marco }))}
          />
        </View>
      }
    >
      <View style={{ gap: 6 }}>
        {/* ---------- Mandos ---------- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Rotulo>PP con</Rotulo>
          <Conmutador
            compacto
            opciones={VARIANTES}
            activa={controles.variante}
            onChange={(variante) => setControles((p) => ({ ...p, variante }))}
          />
          <Interruptor
            texto="CLÁSICO"
            activo={verClasico}
            ayuda="Compara cada nivel con el del pivote clásico"
            onPress={() => setVerClasico((v) => !v)}
          />
        </View>

        {cargando && !datos ? (
          <Cargando filas={8} />
        ) : !datos ? (
          <SinFuente
            titulo="No se pudieron calcular los pivotes"
            motivo={bloque.nota ?? 'Sin respuesta del backend.'}
            compacto
          />
        ) : (
          <>
            {/* ---------- Avisos ---------- */}
            {datos.avisos.length ? (
              <View
                style={{
                  gap: 2,
                  padding: 5,
                  borderRadius: radius.xs,
                  borderWidth: hairline,
                  borderColor: colors.rule,
                  backgroundColor: colors.surfaceSunken,
                }}
              >
                {datos.avisos.map((aviso, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 4 }}>
                    <Ionicons name="alert-circle-outline" size={11} color={colors.noSignal} />
                    <Text style={[T.micro, { color: colors.inkMuted, flex: 1 }]}>{aviso}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* ---------- Cabecera de la escalera ---------- */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 22 }} />
              <View style={{ width: 58, alignItems: 'flex-end' }}>
                <Rotulo>Precio</Rotulo>
              </View>
              <View style={{ width: 48, alignItems: 'flex-end' }}>
                <Rotulo>Dist.</Rotulo>
              </View>
              <View style={{ width: 60, alignItems: 'flex-end' }}>
                <Rotulo>Toques</Rotulo>
              </View>
            </View>

            {/* ---------- La escalera ---------- */}
            <View>
              {filas.map((f, i) => {
                if (f.tipo === 'nivel' && f.nivel) {
                  const esPP = f.nivel.clave === 'PP';
                  return (
                    <View key={`n-${f.nivel.clave}`}>
                      <Peldano
                        nivel={f.nivel}
                        esPP={esPP}
                        vwap={esPP ? { valor: datos.vwap.valor, sobre: datos.vwap.precioSobre } : null}
                      />
                      {verClasico && f.nivel.clasico !== null ? (
                        <Text
                          style={[
                            T.micro,
                            numeric,
                            { color: colors.inkFaint, paddingLeft: 24, paddingBottom: 1 },
                          ]}
                        >
                          clásico {cifra(f.nivel.clasico)}
                        </Text>
                      ) : null}
                    </View>
                  );
                }
                // El precio y el VWAP van insertados por su altura real.
                const esPrecio = f.tipo === 'precio';
                const color = esPrecio ? colors.ink : palette.accent;
                return (
                  <View
                    key={`${f.tipo}-${i}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingVertical: 1,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        height: 0,
                        borderTopWidth: esPrecio ? 1.5 : 1,
                        borderTopColor: color,
                        borderStyle: esPrecio ? 'solid' : 'dashed',
                      }}
                    />
                    <Text
                      style={[
                        T.rotulo,
                        { fontSize: 9, color, textTransform: 'uppercase' },
                      ]}
                      numberOfLines={1}
                    >
                      {esPrecio ? 'Precio' : 'VWAP'} {cifra(f.precio)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* ---------- Veredicto LONG / SHORT ---------- */}
            <ChecklistSenal datos={datos} />

            {/* ---------- Secuencia ---------- */}
            <View style={{ gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <Rotulo>Secuencia</Rotulo>
                <Text style={[T.micro, { color: colors.inkFaint }]} numberOfLines={1}>
                  {datos.fase.numero === 0
                    ? 'sin sesgo'
                    : `${datos.fase.nombre} · ${datos.fase.direccion}`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {FASES.map((nombre, i) => {
                  const hecha = datos.fase.numero > i;
                  return (
                    <View
                      key={nombre}
                      style={{
                        flex: 1,
                        gap: 1,
                        paddingVertical: 2,
                        paddingHorizontal: 3,
                        borderRadius: radius.xs,
                        borderWidth: hairline,
                        borderColor: hecha ? fgSenal : colors.rule,
                        backgroundColor: hecha ? colors.surfaceSunken : 'transparent',
                      }}
                    >
                      <Text
                        style={[
                          T.rotulo,
                          { fontSize: 8.5, color: hecha ? fgSenal : colors.inkFaint },
                        ]}
                        numberOfLines={1}
                      >
                        {i + 1}. {nombre}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* ---------- Plan ---------- */}
            <View style={{ gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                {/* Aquí va el SESGO, no el veredicto: son cosas distintas y
                    el rótulo lo dice, para que «sesgo compra» no se lea como
                    una orden. El veredicto lo da el banner de arriba. */}
                <Rotulo>Sesgo</Rotulo>
                <Text style={[T.datoFuerte, { color: fgSenal }]} numberOfLines={1}>
                  {datos.senal.direccion === 'ninguna'
                    ? 'NINGUNO'
                    : datos.senal.direccion.toUpperCase()}
                </Text>
                <Chip
                  texto={datos.superTrend.alcista ? 'SuperTrend ↑' : 'SuperTrend ↓'}
                  tono={datos.superTrend.alcista ? 'up' : 'down'}
                />
                <Chip
                  texto={datos.senal.operable ? 'Operable' : 'No operable'}
                  tono={datos.senal.operable ? 'accent' : 'caution'}
                />
                {!datos.ultimaVelaCerrada ? <Chip texto="Vela abierta" tono="caution" /> : null}
              </View>

              {datos.senal.direccion !== 'ninguna' ? (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {(
                    [
                      ['Entrada', datos.senal.entrada],
                      ['Stop', datos.senal.stop],
                      ['Obj. 1', datos.senal.objetivo1],
                      ['Obj. 2', datos.senal.objetivo2],
                    ] as const
                  ).map(([k, v]) => (
                    <View key={k} style={{ gap: 1 }}>
                      <Rotulo>{k}</Rotulo>
                      <Cifra valor={cifra(v)} escala="dato" />
                    </View>
                  ))}
                  <View style={{ gap: 1 }}>
                    <Rotulo>R/B</Rotulo>
                    <Cifra
                      valor={
                        datos.senal.riesgoBeneficio === null
                          ? null
                          : datos.senal.riesgoBeneficio.toFixed(2)
                      }
                      tono={datos.senal.operable ? 'up' : 'down'}
                      escala="dato"
                    />
                  </View>
                </View>
              ) : null}

              {datos.senal.motivoNoOperable ? (
                <Text style={[T.micro, { color: colors.inkMuted }]}>
                  {datos.senal.motivoNoOperable}
                </Text>
              ) : null}
            </View>

            {/* ---------- Lecturas de método ---------- */}
            <View style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <Rotulo>PP vs VWAP</Rotulo>
                <Text style={[T.micro, numeric, { color: colors.inkMuted }]} numberOfLines={1}>
                  coinciden el {pct(datos.colinealidad.acuerdoPct, 0) ?? '—'} de las{' '}
                  {datos.colinealidad.muestra} barras
                </Text>
                {(datos.colinealidad.acuerdoPct ?? 0) >= 85 ? (
                  <Chip texto="Redundantes" tono="caution" />
                ) : (
                  <Chip texto="Independientes" tono="accent" />
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <Rotulo>PP clásico</Rotulo>
                <Text style={[T.micro, numeric, { color: colors.inkMuted }]} numberOfLines={1}>
                  {cifra(datos.confluencia.ppClasico)} ·{' '}
                  {pct(datos.confluencia.distanciaPct, 2)} de distancia
                </Text>
                {datos.confluencia.hayConfluencia ? (
                  <Chip texto="Confluencia" tono="accent" icono="git-merge" />
                ) : null}
              </View>
            </View>

            <Text style={[T.micro, { color: colors.inkFaint }]}>
              Pivotes {datos.periodo}s del periodo cerrado el {datos.base.fecha.slice(0, 10)} (máx{' '}
              {cifra(datos.base.alto)} / mín {cifra(datos.base.bajo)} / cierre{' '}
              {cifra(datos.base.cierre)}
              {datos.variante === 'apertura'
                ? `, apertura ${cifra(datos.base.aperturaActual)}`
                : ''}
              ). Los niveles NO cambian con el marco: salen del periodo anterior. Toques medidos
              sobre {datos.niveles[0]?.toquesMuestra ?? 0} periodos. {datos.vwap.nota}
            </Text>
          </>
        )}
      </View>
    </Placa>
  );
}
