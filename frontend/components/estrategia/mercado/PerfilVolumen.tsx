/**
 * Perfil de volumen, delta acumulado y estructura de mercado.
 *
 * Tres lecturas que comparten origen —las velas que ya están cargadas— y que
 * contestan a la misma pregunta desde ángulos distintos: dónde está el precio
 * "justo" (perfil), quién ha estado empujando (delta) y qué secuencia lleva
 * (estructura).
 *
 * El perfil se dibuja TUMBADO, con el precio en vertical, porque así es como
 * se lee contra un gráfico de precio: el POC es una altura, no una fecha. Un
 * histograma de pie obligaría a girar la cabeza para comparar con las velas.
 *
 * Ninguno de los tres necesita datos de tick. El delta sí es un PROXY y lo
 * dice en la cabecera, no en una nota al pie: usa la posición del cierre en el
 * rango, no la clasificación de agresores contra bid/ask.
 */

import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '../../../contexts/ThemeContext';
import { Bloque, SerieMercado } from '../../../lib/estrategia/tipos';
import {
  deltaAcumulado,
  estructuraMercado,
  perfilVolumen,
  vwapConBandas,
} from '../../../lib/estrategia/perfilVolumen';
import { cifra, volumen as fmtVolumen } from '../../../lib/estrategia/formato';
import { Chip, Cifra, ConDatos, Placa, Rotulo, T } from '../Terminal';

const ALTO_PERFIL = 190;
const ALTO_DELTA = 62;

export default function PerfilVolumen({
  bloque,
  cargando,
}: {
  bloque: Bloque<SerieMercado>;
  cargando?: boolean;
}) {
  const { colors, palette, hairline } = useTheme();
  const [ancho, setAncho] = useState(0);
  const [nivelActivo, setNivelActivo] = useState<number | null>(null);

  const medir = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setAncho((previo) => (Math.abs(previo - w) > 1 ? w : previo));
  };

  return (
    <Placa titulo="Perfil de volumen · delta · estructura" procedencia={bloque.procedencia}>
      <ConDatos bloque={bloque} cargando={cargando} filasCarga={6}>
        {(serie) => (
          <Contenido
            velas={serie.velas}
            ancho={ancho}
            medir={medir}
            nivelActivo={nivelActivo}
            setNivelActivo={setNivelActivo}
          />
        )}
      </ConDatos>
    </Placa>
  );
}

function Contenido({
  velas,
  ancho,
  medir,
  nivelActivo,
  setNivelActivo,
}: {
  velas: SerieMercado['velas'];
  ancho: number;
  medir: (e: LayoutChangeEvent) => void;
  nivelActivo: number | null;
  setNivelActivo: (i: number | null) => void;
}) {
  const { colors, palette, hairline, numeric } = useTheme();

  // Ventana: las últimas 120 sesiones. Un perfil sobre dos años mezcla
  // regímenes distintos y su POC deja de significar nada operativo.
  const ventana = useMemo(() => velas.slice(-120), [velas]);

  const perfil = useMemo(() => perfilVolumen(ventana), [ventana]);
  const vwap = useMemo(() => vwapConBandas(ventana), [ventana]);
  const delta = useMemo(() => deltaAcumulado(ventana), [ventana]);
  const estructura = useMemo(() => estructuraMercado(ventana), [ventana]);

  if (!perfil) {
    return (
      <Text style={[T.micro, { color: colors.noSignal }]}>
        No hay volumen suficiente en la serie para construir el perfil.
      </Text>
    );
  }

  const cierre = ventana[ventana.length - 1]?.c ?? 0;
  const maxFraccion = Math.max(...perfil.niveles.map((n) => n.fraccion), 1e-9);

  // El precio crece hacia arriba: el índice 0 (más barato) va abajo.
  const alturaBarra = ALTO_PERFIL / perfil.niveles.length;
  const anchoUtil = Math.max(0, ancho - 64); // 64 px para la escala de precio

  const yDe = (indice: number) => ALTO_PERFIL - (indice + 1) * alturaBarra;
  const precioAY = (p: number) => {
    const min = perfil.niveles[0].precio;
    const max = perfil.niveles[perfil.niveles.length - 1].precio;
    if (max <= min) return ALTO_PERFIL / 2;
    return ALTO_PERFIL - ((p - min) / (max - min)) * ALTO_PERFIL;
  };

  const tonoEstructura =
    estructura?.sesgo === 'alcista'
      ? 'up'
      : estructura?.sesgo === 'bajista'
        ? 'down'
        : estructura?.sesgo === 'lateral'
          ? 'caution'
          : // `sin_estructura` va en neutro: no es un juicio de mercado, es la
            // ausencia de uno. En ámbar se leería como «rango», que es otra cosa.
            'neutral';

  return (
    <View style={{ gap: 8 }} onLayout={medir}>
      {/* ── Cabecera: las tres lecturas en cifras ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 6 }}>
        {(
          [
            ['POC', cifra(perfil.poc), cierre > perfil.poc ? 'up' : 'down'],
            ['VAH', cifra(perfil.vah), 'neutral'],
            ['VAL', cifra(perfil.val), 'neutral'],
            ['VWAP', cifra(vwap.ultimo), (vwap.distanciaPct ?? 0) >= 0 ? 'up' : 'down'],
          ] as const
        ).map(([rot, val, tono]) => (
          <View key={rot} style={{ flexBasis: '22%', flexGrow: 1, minWidth: 0, gap: 1 }}>
            <Rotulo>{rot}</Rotulo>
            <Cifra valor={val} tono={tono as any} escala="datoFuerte" />
          </View>
        ))}
      </View>

      {/* ── Perfil tumbado ── */}
      {ancho > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 4 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Svg width={anchoUtil} height={ALTO_PERFIL}>
              {perfil.niveles.map((n, i) => {
                const w = Math.max(1, (n.fraccion / maxFraccion) * anchoUtil * 0.92);
                const esPoc = Math.abs(n.precio - perfil.poc) < 1e-9;
                const activo = nivelActivo === i;
                return (
                  <Rect
                    key={i}
                    x={0}
                    y={yDe(i)}
                    width={w}
                    height={Math.max(1, alturaBarra - 0.6)}
                    // El área de valor se distingue por relleno, y el POC por
                    // color pleno: dos códigos distintos porque son dos cosas
                    // distintas —una zona y un punto—, no dos intensidades.
                    fill={
                      esPoc
                        ? palette.accent
                        : n.enAreaValor
                          ? palette.accentWash
                          : colors.surfaceSunken
                    }
                    stroke={activo ? colors.ink : n.enAreaValor ? palette.accent : colors.rule}
                    strokeWidth={activo ? 1 : 0.5}
                  />
                );
              })}

              {/* Precio actual: la marca de índice de la casa. */}
              <Line
                x1={0}
                x2={anchoUtil}
                y1={precioAY(cierre)}
                y2={precioAY(cierre)}
                stroke={colors.ink}
                strokeWidth={1.5}
              />
              {/* Bordes del área de valor, en discontinua. */}
              {[perfil.vah, perfil.val].map((p, k) => (
                <Line
                  key={k}
                  x1={0}
                  x2={anchoUtil}
                  y1={precioAY(p)}
                  y2={precioAY(p)}
                  stroke={palette.accent}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.8}
                />
              ))}
            </Svg>
          </View>

          {/* Escala de precio con las tres referencias rotuladas. */}
          <View style={{ width: 58, height: ALTO_PERFIL }}>
            {(
              [
                [cierre, colors.ink, 'Actual'],
                [perfil.poc, palette.accent, 'POC'],
                [perfil.vah, colors.inkMuted, 'VAH'],
                [perfil.val, colors.inkMuted, 'VAL'],
              ] as const
            ).map(([p, color, etiqueta]) => (
              <View
                key={etiqueta}
                style={{
                  position: 'absolute',
                  top: Math.max(0, Math.min(ALTO_PERFIL - 11, precioAY(p) - 5.5)),
                  left: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                }}
                pointerEvents="none"
              >
                <Text style={[T.micro, { color, fontSize: 8, fontWeight: '700' }]}>{etiqueta}</Text>
                <Text style={[T.micro, numeric, { color, fontSize: 9 }]} numberOfLines={1}>
                  {cifra(p)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Filas interactivas del perfil: pulsar una da su volumen ── */}
      {ancho > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
          {[perfil.poc, perfil.vah, perfil.val].map((p, i) => {
            const nivel = perfil.niveles.reduce((mejor, n) =>
              Math.abs(n.precio - p) < Math.abs(mejor.precio - p) ? n : mejor,
            );
            const etiquetas = ['POC', 'VAH', 'VAL'];
            const idx = perfil.niveles.indexOf(nivel);
            return (
              <Pressable
                key={etiquetas[i]}
                onPress={() => setNivelActivo(nivelActivo === idx ? null : idx)}
                accessibilityRole="button"
                accessibilityLabel={`${etiquetas[i]} en ${cifra(p)}, ${(nivel.fraccion * 100).toFixed(1)} por ciento del volumen`}
                style={({ hovered }: any) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                    borderRadius: 3,
                    borderWidth: hairline,
                    borderColor: nivelActivo === idx ? palette.accent : colors.rule,
                    backgroundColor: hovered || nivelActivo === idx ? colors.accentWash : 'transparent',
                  },
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                ]}
              >
                <Rotulo tono={i === 0 ? 'accent' : 'neutral'}>{etiquetas[i]}</Rotulo>
                <Text style={[T.micro, numeric, { color: colors.inkMuted }]}>
                  {(nivel.fraccion * 100).toFixed(1)} % · {fmtVolumen(nivel.volumen)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={{ height: hairline, backgroundColor: colors.rule }} />

      {/* ── Delta acumulado ── */}
      {delta && ancho > 0 ? (
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Rotulo>Delta acumulado</Rotulo>
              <Chip texto="PROXY · CLV" tono="caution" />
            </View>
            {delta.divergencia ? (
              <Chip
                texto={`Divergencia ${delta.divergencia}`}
                tono={delta.divergencia === 'alcista' ? 'up' : 'down'}
                icono="git-compare-outline"
              />
            ) : null}
          </View>
          <CurvaDelta serie={delta.serie} ancho={Math.max(0, ancho)} />
        </View>
      ) : null}

      {/* ── Estructura ── */}
      {estructura ? (
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Rotulo>Estructura</Rotulo>
            <Chip
              texto={estructura.sesgo === 'sin_estructura' ? 'sin pivotes' : estructura.sesgo}
              tono={tonoEstructura}
              icono={
                estructura.sesgo === 'alcista'
                  ? 'trending-up-outline'
                  : estructura.sesgo === 'bajista'
                    ? 'trending-down-outline'
                    : estructura.sesgo === 'lateral'
                      ? 'swap-horizontal-outline'
                      : 'help-circle-outline'
              }
            />
            {estructura.rotura ? (
              <Chip
                texto={`Rotura ${estructura.rotura.direccion} en ${cifra(estructura.rotura.precio)}`}
                tono={estructura.rotura.direccion === 'alcista' ? 'up' : 'down'}
              />
            ) : null}
          </View>
          <Text style={[T.micro, { color: colors.inkFaint, lineHeight: 14 }]}>
            {estructura.detalle} {estructura.pivotes.length} pivotes sobre{' '}
            {perfil.sesiones} sesiones, umbral de 2·ATR. El delta usa la posición del cierre en el
            rango, no clasificación de agresores: sirve para leer divergencias, no niveles.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Curva del delta acumulado, con el cero marcado. */
function CurvaDelta({ serie, ancho }: { serie: number[]; ancho: number }) {
  const { colors, palette } = useTheme();
  if (!serie.length || ancho <= 0) return null;

  const min = Math.min(...serie, 0);
  const max = Math.max(...serie, 0);
  const rango = max - min || 1;
  const x = (i: number) => (i / Math.max(1, serie.length - 1)) * ancho;
  const y = (v: number) => ALTO_DELTA - ((v - min) / rango) * ALTO_DELTA;

  const d = serie.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${ancho},${y(0)} L0,${y(0)} Z`;
  const positivo = serie[serie.length - 1] >= 0;
  const tinta = positivo ? palette.up : palette.down;

  return (
    <Svg width={ancho} height={ALTO_DELTA}>
      <Path d={area} fill={positivo ? palette.upWash : palette.downWash} />
      <Line x1={0} x2={ancho} y1={y(0)} y2={y(0)} stroke={colors.ruleStrong} strokeWidth={1} />
      <Path d={d} fill="none" stroke={tinta} strokeWidth={1.5} />
    </Svg>
  );
}
