/**
 * ============================================================================
 * Primitivas del terminal
 * ============================================================================
 * El kit del producto (`components/ui/Instrument`) está calibrado para lectura
 * pausada: placas de 16 px de aire, títulos de 17. Un terminal de trading es
 * otra escena de uso —doce paneles a la vez, mirados de reojo cada pocos
 * segundos— y necesita otra densidad.
 *
 * Lo que NO cambia: la paleta, los tonos direccionales, la regla de que verde
 * y rojo sólo significan dirección financiera, y la cifra monoespaciada
 * tabular. Esto es una densidad distinta del mismo instrumento, no una segunda
 * identidad visual.
 */

import React, { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { Tone, toneColors } from '../../theme/tokens';
import { Procedencia } from '../../lib/estrategia/tipos';

/** Métrica del terminal. Un sitio, no veinte números sueltos por el archivo. */
export const D = {
  /** Aire dentro de la placa. */
  pad: 8,
  /** Separación entre placas del grid. */
  hueco: 8,
  /** Alto de fila de tabla. */
  fila: 22,
  /** Alto de cabecera de placa. */
  cabecera: 26,
} as const;

/** Escala tipográfica densa. Sale de la del producto, comprimida. */
export const T = {
  rotulo: { fontSize: 10, lineHeight: 13, fontWeight: '700', letterSpacing: 0.9 } as TextStyle,
  micro: { fontSize: 10, lineHeight: 13, fontWeight: '500' } as TextStyle,
  dato: { fontSize: 11, lineHeight: 14, fontWeight: '500' } as TextStyle,
  datoFuerte: { fontSize: 11, lineHeight: 14, fontWeight: '700' } as TextStyle,
  medida: { fontSize: 13, lineHeight: 17, fontWeight: '700' } as TextStyle,
  /** Cifra de KPI: en la franja superior es la lectura principal de la fila,
   *  y a 13 px competía de tú a tú con su propio rótulo. */
  kpi: { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.2 } as TextStyle,
  titular: { fontSize: 18, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3 } as TextStyle,
  cifraGrande: { fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.6 } as TextStyle,
} as const;

/* ==========================================================================
 * Placa — el contenedor del terminal
 * ======================================================================== */

export function Placa({
  titulo,
  derecha,
  children,
  style,
  contenidoStyle,
  sinAire,
  procedencia,
}: {
  titulo?: string;
  derecha?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contenidoStyle?: StyleProp<ViewStyle>;
  sinAire?: boolean;
  /** Si el bloque no es 'real', la placa lo rotula en la cabecera. */
  procedencia?: Procedencia;
}) {
  const { colors, radius, hairline } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.sm,
          borderWidth: hairline,
          borderColor: colors.rule,
          overflow: 'hidden',
          minWidth: 0,
        },
        style,
      ]}
    >
      {titulo || derecha ? (
        <View
          style={{
            minHeight: D.cabecera,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            paddingHorizontal: D.pad,
            paddingVertical: 4,
            borderBottomWidth: hairline,
            borderBottomColor: colors.rule,
            backgroundColor: colors.chrome,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            {titulo ? (
              <Text
                style={[T.rotulo, { color: colors.inkMuted, textTransform: 'uppercase' }]}
                numberOfLines={1}
              >
                {titulo}
              </Text>
            ) : null}
            {procedencia && procedencia !== 'real' ? <MarcaProcedencia valor={procedencia} /> : null}
          </View>
          {derecha}
        </View>
      ) : null}
      <View style={[!sinAire && { padding: D.pad }, { minWidth: 0 }, contenidoStyle]}>{children}</View>
    </View>
  );
}

/* ==========================================================================
 * Marca de procedencia — la etiqueta que impide leer un proxy como una medida
 * ======================================================================== */

const ROTULO_PROCEDENCIA: Record<Procedencia, { texto: string; tono: Tone }> = {
  real: { texto: 'Real', tono: 'accent' },
  proxy: { texto: 'Proxy', tono: 'caution' },
  simulado: { texto: 'Simulado', tono: 'down' },
  'sin-fuente': { texto: 'Sin fuente', tono: 'neutral' },
};

export function MarcaProcedencia({ valor }: { valor: Procedencia }) {
  const { palette, colors, radius, hairline } = useTheme();
  const spec = ROTULO_PROCEDENCIA[valor];
  const { fg, wash } = toneColors(palette, spec.tono);
  return (
    <View
      style={{
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: radius.xs,
        borderWidth: hairline,
        borderColor: spec.tono === 'neutral' ? colors.rule : fg,
        backgroundColor: spec.tono === 'neutral' ? 'transparent' : wash,
      }}
    >
      <Text
        style={[
          T.rotulo,
          { fontSize: 9, color: spec.tono === 'neutral' ? colors.inkFaint : fg, textTransform: 'uppercase' },
        ]}
      >
        {spec.texto}
      </Text>
    </View>
  );
}

/* ==========================================================================
 * Cifra — monoespaciada y tabular. El hueco es un guion, nunca un cero.
 * ======================================================================== */

export function Cifra({
  valor,
  tono = 'neutral',
  escala = 'dato',
  style,
}: {
  valor: string | null | undefined;
  tono?: Tone;
  escala?: keyof typeof T;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, numeric, palette } = useTheme();
  const { fg } = toneColors(palette, tono);
  if (valor === null || valor === undefined || valor === '') {
    return (
      <Text
        style={[T[escala], numeric, { color: colors.noSignal }, style]}
        accessibilityLabel="Dato no disponible"
        numberOfLines={1}
      >
        —
      </Text>
    );
  }
  return (
    <Text
      // Una cifra NUNCA se parte en dos líneas. En una celda estrecha —diez
      // KPIs en 1000 px dejan 84 px útiles— un importe como «$1.234.567,89»
      // envolvía a tres renglones y descuadraba toda la franja: las celdas
      // vecinas crecían de alto y la rejilla se leía como rota. Se recorta,
      // que en una medida es honesto (se ve que falta) y estable.
      numberOfLines={1}
      // `adjustsFontSizeToFit` sólo existe en nativo; en web el recorte basta.
      adjustsFontSizeToFit={Platform.OS !== 'web'}
      minimumFontScale={0.85}
      style={[T[escala], numeric, { color: tono === 'neutral' ? colors.ink : fg }, style]}
    >
      {valor}
    </Text>
  );
}

/* ==========================================================================
 * Rótulo — la versalita impresa del panel
 * ======================================================================== */

export function Rotulo({
  children,
  tono = 'neutral',
  style,
}: {
  children: ReactNode;
  tono?: Tone;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, palette } = useTheme();
  const { fg } = toneColors(palette, tono);
  return (
    <Text
      style={[
        T.rotulo,
        { color: tono === 'neutral' ? colors.inkFaint : fg, textTransform: 'uppercase' },
        style,
      ]}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

/* ==========================================================================
 * Chip — el distintivo compacto de estado
 * ======================================================================== */

export function Chip({
  texto,
  tono = 'neutral',
  icono,
  style,
}: {
  texto: string;
  tono?: Tone;
  icono?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, colors, radius, hairline } = useTheme();
  const { fg, wash } = toneColors(palette, tono);
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          paddingHorizontal: 5,
          paddingVertical: 2,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: tono === 'neutral' ? colors.rule : fg,
          backgroundColor: tono === 'neutral' ? 'transparent' : wash,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {icono ? <Ionicons name={icono} size={9} color={tono === 'neutral' ? colors.inkMuted : fg} /> : null}
      <Text
        style={[
          T.rotulo,
          { fontSize: 9, color: tono === 'neutral' ? colors.inkMuted : fg, textTransform: 'uppercase' },
        ]}
        numberOfLines={1}
      >
        {texto}
      </Text>
    </View>
  );
}

/* ==========================================================================
 * Fila — etiqueta a la izquierda, medida a la derecha
 * ======================================================================== */

export function Fila({
  etiqueta,
  valor,
  tono = 'neutral',
  senal,
  sinFuente,
  ultima,
}: {
  etiqueta: string;
  valor?: string | null;
  tono?: Tone;
  senal?: string;
  /** Cuando está, gana sobre el valor: se dibuja el hueco y su motivo. */
  sinFuente?: string;
  ultima?: boolean;
}) {
  const { colors, hairline, palette } = useTheme();
  const { fg } = toneColors(palette, tono);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        minHeight: D.fila,
        paddingVertical: 2,
        borderBottomWidth: ultima ? 0 : hairline,
        borderBottomColor: colors.rule,
      }}
    >
      <Text style={[T.dato, { color: colors.inkMuted, flexShrink: 1 }]} numberOfLines={1}>
        {etiqueta}
      </Text>
      {sinFuente ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Cifra valor={null} />
          <Text style={[T.micro, { color: colors.noSignal, maxWidth: 130 }]} numberOfLines={1}>
            {sinFuente}
          </Text>
        </View>
      ) : (
        // `flexShrink` aquí importa: sin él, una etiqueta larga junto a un
        // valor largo y su señal desbordaban la placa por la derecha en vez de
        // repartirse el ancho. La medida se recorta antes que salirse.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
          <Cifra valor={valor} tono={senal ? 'neutral' : tono} escala="datoFuerte" />
          {senal ? (
            <Text
              style={[T.rotulo, { fontSize: 9, color: fg, textTransform: 'uppercase', flexShrink: 1 }]}
              numberOfLines={1}
            >
              {senal}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

/* ==========================================================================
 * Hueco honesto — el componente que sustituye a un número inventado
 * ======================================================================== */

export function SinFuente({
  titulo = 'Sin fuente de datos',
  motivo,
  compacto,
}: {
  titulo?: string;
  motivo: string;
  compacto?: boolean;
}) {
  const { colors, radius, hairline } = useTheme();
  return (
    <View
      style={{
        gap: 4,
        padding: compacto ? 6 : 10,
        borderRadius: radius.xs,
        borderWidth: hairline,
        borderStyle: 'dashed',
        borderColor: colors.rule,
        backgroundColor: colors.surfaceSunken,
      }}
      accessibilityRole="text"
      accessibilityLabel={`${titulo}. ${motivo}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="remove-circle-outline" size={11} color={colors.noSignal} />
        <Rotulo>{titulo}</Rotulo>
      </View>
      <Text style={[T.micro, { color: colors.inkMuted }]}>{motivo}</Text>
    </View>
  );
}

/* ==========================================================================
 * Esqueleto de carga
 * ======================================================================== */

export function Hueso({ ancho = '100%', alto = 10 }: { ancho?: number | string; alto?: number }) {
  const { colors, radius, hairline } = useTheme();
  return (
    <View
      style={{
        width: ancho as any,
        height: alto,
        borderRadius: radius.xs,
        backgroundColor: colors.surfaceSunken,
        borderWidth: hairline,
        borderColor: colors.rule,
      }}
    />
  );
}

export function Cargando({ filas = 4 }: { filas?: number }) {
  return (
    <View style={{ gap: 6 }} accessibilityLabel="Cargando">
      {Array.from({ length: filas }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Hueso ancho={`${40 + ((i * 17) % 30)}%`} />
          <Hueso ancho={48} />
        </View>
      ))}
    </View>
  );
}

/* ==========================================================================
 * Envoltorio de estado — los cuatro estados de cualquier panel, en un sitio
 * ======================================================================== */

export function ConDatos<T>({
  bloque,
  filasCarga = 4,
  cargando,
  children,
}: {
  bloque: { datos: T | null; procedencia: Procedencia; nota?: string };
  filasCarga?: number;
  cargando?: boolean;
  children: (datos: T) => ReactNode;
}) {
  if (cargando && !bloque.datos) return <Cargando filas={filasCarga} />;
  if (!bloque.datos) {
    return (
      <SinFuente
        titulo={bloque.procedencia === 'sin-fuente' ? 'Sin fuente de datos' : 'Sin lectura'}
        motivo={bloque.nota ?? 'No hay datos para este valor.'}
        compacto
      />
    );
  }
  return <>{children(bloque.datos)}</>;
}

/* ==========================================================================
 * Deslizador — control real, con estado y arrastre
 *
 * No hay componente de slider en las dependencias del proyecto y no se añade
 * uno: PanResponder cubre ratón y dedo en react-native-web, y así el control
 * hereda la paleta en vez de traer la suya.
 * ======================================================================== */

export function Deslizador({
  etiqueta,
  valor,
  min = 0,
  max = 100,
  paso = 1,
  sufijo = '',
  decimales = 0,
  onChange,
  deshabilitado,
}: {
  etiqueta: string;
  valor: number;
  min?: number;
  max?: number;
  paso?: number;
  sufijo?: string;
  decimales?: number;
  onChange: (v: number) => void;
  deshabilitado?: boolean;
}) {
  const { colors, radius, hairline, numeric } = useTheme();
  const [ancho, setAncho] = useState(0);
  const anchoRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const medir = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    anchoRef.current = w;
    setAncho(w);
  }, []);

  const aValor = useCallback(
    (x: number) => {
      const w = anchoRef.current || 1;
      const t = Math.max(0, Math.min(1, x / w));
      const bruto = min + t * (max - min);
      const ajustado = Math.round(bruto / paso) * paso;
      return Math.max(min, Math.min(max, Number(ajustado.toFixed(6))));
    },
    [min, max, paso],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !deshabilitado,
        onMoveShouldSetPanResponder: () => !deshabilitado,
        onPanResponderGrant: (e) => {
          onChangeRef.current(aValor(e.nativeEvent.locationX));
        },
        onPanResponderMove: (e, gesto) => {
          // `locationX` en móvil se mide contra el hijo tocado, así que el
          // arrastre se calcula desde el inicio del gesto, no desde el evento.
          const x = gesto.moveX - (gesto.x0 - (e.nativeEvent.locationX ?? 0));
          onChangeRef.current(aValor(x));
        },
      }),
    [aValor, deshabilitado],
  );

  const t = max > min ? (valor - min) / (max - min) : 0;
  const pos = Math.max(0, Math.min(1, t)) * ancho;

  return (
    <View style={{ gap: 3, opacity: deshabilitado ? 0.5 : 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[T.dato, { color: colors.inkMuted }]} numberOfLines={1}>
          {etiqueta}
        </Text>
        <Text style={[T.datoFuerte, numeric, { color: colors.ink }]}>
          {valor.toFixed(decimales)}
          {sufijo}
        </Text>
      </View>
      <View
        onLayout={medir}
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={etiqueta}
        accessibilityValue={{ min, max, now: valor }}
        style={[
          {
            height: 18,
            justifyContent: 'center',
          },
          Platform.OS === 'web' ? ({ cursor: deshabilitado ? 'default' : 'pointer' } as any) : null,
        ]}
      >
        <View
          style={{
            height: 4,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSunken,
            borderWidth: hairline,
            borderColor: colors.rule,
            overflow: 'hidden',
          }}
        >
          <View style={{ width: pos, height: '100%', backgroundColor: colors.accent }} />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: Math.max(0, pos - 6),
            width: 12,
            height: 12,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 2,
            borderColor: colors.accent,
          }}
        />
      </View>
    </View>
  );
}

/* ==========================================================================
 * Grupo de conmutación — pestañas de marco temporal y rangos
 * ======================================================================== */

export function Conmutador<K extends string>({
  opciones,
  activa,
  onChange,
  compacto,
}: {
  opciones: readonly { clave: K; texto: string; deshabilitada?: boolean }[];
  activa: K;
  onChange: (k: K) => void;
  compacto?: boolean;
}) {
  const { colors, radius, hairline } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        borderWidth: hairline,
        borderColor: colors.rule,
        borderRadius: radius.xs,
        overflow: 'hidden',
        alignSelf: 'flex-start',
        backgroundColor: colors.surfaceSunken,
      }}
      accessibilityRole="tablist"
    >
      {opciones.map((o, i) => {
        const on = o.clave === activa;
        return (
          <Pressable
            key={o.clave}
            onPress={o.deshabilitada ? undefined : () => onChange(o.clave)}
            disabled={o.deshabilitada}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled: !!o.deshabilitada }}
            style={({ pressed, hovered }: any) => [
              {
                paddingHorizontal: compacto ? 5 : 7,
                paddingVertical: compacto ? 2 : 4,
                backgroundColor: on
                  ? colors.accentWash
                  : pressed || hovered
                    ? colors.surface
                    : 'transparent',
                borderLeftWidth: i === 0 ? 0 : hairline,
                borderLeftColor: colors.rule,
                opacity: o.deshabilitada ? 0.35 : 1,
              },
              Platform.OS === 'web'
                ? ({ cursor: o.deshabilitada ? 'not-allowed' : 'pointer' } as any)
                : null,
            ]}
          >
            <Text
              style={[
                T.rotulo,
                { fontSize: 9.5, color: on ? colors.accent : colors.inkMuted, letterSpacing: 0.4 },
              ]}
            >
              {o.texto}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ==========================================================================
 * Botón compacto del terminal
 * ======================================================================== */

export function BotonTerminal({
  texto,
  onPress,
  tono = 'neutral',
  icono,
  relleno,
  deshabilitado,
  style,
}: {
  texto: string;
  onPress?: () => void;
  tono?: Tone;
  icono?: keyof typeof Ionicons.glyphMap;
  relleno?: boolean;
  deshabilitado?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, palette, radius, hairline } = useTheme();
  const { fg, wash } = toneColors(palette, tono);
  const tinta = tono === 'neutral' ? colors.ink : fg;
  return (
    <Pressable
      onPress={deshabilitado ? undefined : onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: !!deshabilitado }}
      style={({ pressed, hovered }: any) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          minHeight: 28,
          paddingHorizontal: 10,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: tono === 'neutral' ? colors.rule : fg,
          backgroundColor:
            pressed || hovered
              ? tono === 'neutral'
                ? colors.accentWash
                : wash
              : tono === 'neutral'
                ? colors.surfaceSunken
                : 'transparent',
          flex: relleno ? 1 : undefined,
          opacity: deshabilitado ? 0.45 : 1,
        },
        Platform.OS === 'web'
          ? ({ cursor: deshabilitado ? 'not-allowed' : 'pointer', transitionDuration: '120ms' } as any)
          : null,
        style,
      ]}
    >
      {icono ? <Ionicons name={icono} size={12} color={tinta} /> : null}
      <Text style={[T.rotulo, { color: tinta, letterSpacing: 0.6 }]} numberOfLines={1}>
        {texto}
      </Text>
    </Pressable>
  );
}

/* ==========================================================================
 * Punto de estado — conectado / reconectando / desconectado
 * ======================================================================== */

export function Punto({ tono }: { tono: Tone }) {
  const { palette, colors } = useTheme();
  const { fg } = toneColors(palette, tono);
  return (
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: tono === 'neutral' ? colors.noSignal : fg,
      }}
    />
  );
}
