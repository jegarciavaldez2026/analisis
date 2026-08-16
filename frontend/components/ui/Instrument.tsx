/**
 * Kit del instrumento — primitivas compartidas.
 *
 * Todo lo que se repite en el producto vive aquí: la placa, la regla, la
 * leyenda de escala, la cifra medida, la señal de veredicto, el control y el
 * pozo de entrada. Un botón que se ve distinto en dos pantallas significa que
 * uno de los dos está mal, así que sólo hay uno.
 */

import React, { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { Tone, toneColors } from '../../theme/tokens';

/* ==========================================================================
 * Regla — la marca de escala menor. Un pelo, nunca un borde grueso de color.
 * ======================================================================== */

export function Rule({
  strong,
  vertical,
  style,
}: {
  strong?: boolean;
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, hairline } = useTheme();
  const color = strong ? colors.ruleStrong : colors.rule;
  return (
    <View
      style={[
        vertical
          ? { width: hairline, alignSelf: 'stretch', backgroundColor: color }
          : { height: hairline, alignSelf: 'stretch', backgroundColor: color },
        style,
      ]}
    />
  );
}

/* ==========================================================================
 * Leyenda — la rotulación impresa de la escala.
 * ======================================================================== */

export function Legend({
  children,
  tone = 'neutral',
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, type, palette } = useTheme();
  const { fg } = toneColors(palette, tone);
  return (
    <Text
      style={[
        type.legend,
        { color: tone === 'neutral' ? colors.inkFaint : fg, textTransform: 'uppercase' },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ==========================================================================
 * Placa — la superficie donde se lee. Contenedor único del producto.
 * Sin anidar: una placa dentro de otra placa siempre es un error de jerarquía.
 * ======================================================================== */

export function Panel({
  children,
  title,
  legend,
  action,
  padded = true,
  level = 1,
  style,
  contentStyle,
}: {
  children?: ReactNode;
  title?: string;
  legend?: string;
  action?: ReactNode;
  padded?: boolean;
  level?: 0 | 1 | 2 | 3;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors, space, radius, hairline, elevation, type } = useTheme();
  const hasHeader = Boolean(title || legend || action);

  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: hairline,
          borderColor: colors.rule,
          overflow: 'hidden',
        },
        elevation(level),
        style,
      ]}
    >
      {hasHeader && (
        <>
          {/* La rotulación va donde va en una placa: al margen de la lectura,
              nunca encima del título haciendo de antetítulo. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: space.lg,
              paddingTop: space.md,
              paddingBottom: space.sm,
              gap: space.md,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              {title ? (
                <Text style={[type.title3, { color: colors.ink }]}>{title}</Text>
              ) : null}
              {legend ? <Legend>{legend}</Legend> : null}
            </View>
            {action}
          </View>
          <Rule />
        </>
      )}
      <View style={[padded && { padding: space.lg }, contentStyle]}>{children}</View>
    </View>
  );
}

/* ==========================================================================
 * Cifra medida — monoespaciada y tabular porque es una medida, no un adorno.
 * `N/A` no se maquilla: se dibuja como sensor sin señal.
 * ======================================================================== */

export function Num({
  value,
  unit,
  prefix,
  tone = 'neutral',
  size = 'body',
  showSign,
  style,
}: {
  value: number | string | null | undefined;
  unit?: string;
  prefix?: string;
  tone?: Tone;
  size?: 'display' | 'title1' | 'title2' | 'title3' | 'body' | 'label' | 'caption';
  /** Antepone + / − para que el signo no dependa sólo del color. */
  showSign?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { colors, type, numeric, palette } = useTheme();
  const missing =
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value === 'number' && !Number.isFinite(value)) ||
    (typeof value === 'string' && ['n/a', 'na', '--'].includes(value.trim().toLowerCase()));

  if (missing) {
    return (
      <Text
        style={[
          type[size],
          numeric,
          { color: colors.noSignal, fontWeight: '500' },
          style,
        ]}
        accessibilityLabel="Dato no disponible"
      >
        —
      </Text>
    );
  }

  const numberValue = typeof value === 'number' ? value : Number(value);
  const sign =
    showSign && Number.isFinite(numberValue)
      ? numberValue > 0
        ? '+'
        : numberValue < 0
          ? '−'
          : ''
      : '';
  const shown =
    showSign && Number.isFinite(numberValue)
      ? Math.abs(numberValue).toLocaleString('es-ES', { maximumFractionDigits: 2 })
      : typeof value === 'number'
        ? value.toLocaleString('es-ES', { maximumFractionDigits: 2 })
        : value;

  const { fg } = toneColors(palette, tone);

  return (
    <Text
      style={[
        type[size],
        numeric,
        { color: tone === 'neutral' ? colors.ink : fg, fontWeight: '600' },
        style,
      ]}
    >
      {prefix}
      {sign}
      {shown}
      {unit ? (
        <Text style={{ color: colors.inkFaint, fontWeight: '500' }}>{unit}</Text>
      ) : null}
    </Text>
  );
}

/* ==========================================================================
 * Señal — el veredicto. Color + forma + palabra: nunca sólo color, porque
 * este producto es literalmente rojo contra verde.
 * ======================================================================== */

const SIGNAL_GLYPH: Record<Tone, keyof typeof Ionicons.glyphMap> = {
  up: 'arrow-up',
  down: 'arrow-down',
  caution: 'remove',
  accent: 'ellipse',
  neutral: 'ellipse-outline',
};

export function Signal({
  label,
  tone,
  size = 'md',
  style,
}: {
  label: string;
  tone: Tone;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, colors, space, radius, type, hairline } = useTheme();
  const { fg, wash } = toneColors(palette, tone);
  const dims = {
    sm: { py: 3, px: space.sm, icon: 11, text: type.legend },
    md: { py: 5, px: space.md, icon: 13, text: type.caption },
    lg: { py: space.sm, px: space.lg, icon: 16, text: type.labelStrong },
  }[size];

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingVertical: dims.py,
          paddingHorizontal: dims.px,
          backgroundColor: tone === 'neutral' ? 'transparent' : wash,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: tone === 'neutral' ? colors.rule : fg,
          alignSelf: 'flex-start',
        },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Ionicons name={SIGNAL_GLYPH[tone]} size={dims.icon} color={fg} />
      <Text
        style={[
          dims.text,
          {
            color: tone === 'neutral' ? colors.inkMuted : fg,
            fontWeight: '700',
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/* ==========================================================================
 * Control — un solo botón para todo el producto, con sus siete estados.
 * ======================================================================== */

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  full,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, space, radius, type, hairline, elevation } = useTheme();
  const [hovered, setHovered] = useState(false);
  const inert = disabled || loading;

  const dims = {
    sm: { h: 32, px: space.md, text: type.caption, icon: 14 },
    md: { h: 42, px: space.lg, text: type.label, icon: 16 },
    lg: { h: 52, px: space.xl, text: type.bodyStrong, icon: 18 },
  }[size];

  const skin = (pressed: boolean) => {
    const active = pressed || hovered;
    switch (variant) {
      case 'primary':
        return {
          bg: inert
            ? colors.rule
            : pressed
              ? colors.accentPressed
              : hovered
                ? colors.accentPressed
                : colors.accent,
          fg: inert ? colors.inkFaint : colors.inkOnAccent,
          border: 'transparent',
        };
      case 'danger':
        return {
          bg: inert ? colors.rule : active ? colors.downWash : 'transparent',
          fg: inert ? colors.inkFaint : colors.down,
          border: colors.down,
        };
      case 'secondary':
        return {
          bg: inert ? 'transparent' : active ? colors.accentWash : colors.surfaceSunken,
          fg: inert ? colors.inkFaint : colors.ink,
          border: colors.rule,
        };
      default:
        return {
          bg: active && !inert ? colors.accentWash : 'transparent',
          fg: inert ? colors.inkFaint : colors.accent,
          border: 'transparent',
        };
    }
  };

  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      style={({ pressed }) => {
        const s = skin(pressed);
        return [
          {
            minHeight: Math.max(dims.h, 44),
            height: undefined,
            paddingVertical: (Math.max(dims.h, 44) - dims.h) / 2,
            paddingHorizontal: dims.px,
            borderRadius: radius.sm,
            borderWidth: hairline,
            borderColor: s.border,
            backgroundColor: s.bg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.sm,
            alignSelf: full ? 'stretch' : 'flex-start',
            opacity: pressed && !inert ? 0.92 : 1,
          },
          variant === 'primary' && !inert ? elevation(1) : null,
          Platform.OS === 'web' ? ({ cursor: inert ? 'default' : 'pointer', transitionDuration: '160ms' } as any) : null,
          style,
        ];
      }}
    >
      {({ pressed }: any) => {
        const s = skin(pressed);
        return (
          <>
            {loading ? (
              <ActivityIndicator size="small" color={s.fg} />
            ) : icon ? (
              <Ionicons name={icon} size={dims.icon} color={s.fg} />
            ) : null}
            <Text style={[dims.text, { color: s.fg, fontWeight: '700', letterSpacing: 0.2 }]}>
              {label}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

/* ==========================================================================
 * Pozo de entrada — el campo va hundido en la placa, no flotando sobre ella.
 * ======================================================================== */

export const Field = React.forwardRef<TextInput, TextInputProps & {
  icon?: keyof typeof Ionicons.glyphMap;
  right?: ReactNode;
  invalid?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}>(function Field({ icon, right, invalid, containerStyle, style, ...props }, ref) {
  const { colors, space, radius, type, hairline, numeric } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          minHeight: 48,
          paddingHorizontal: space.md,
          backgroundColor: colors.surfaceSunken,
          borderRadius: radius.sm,
          borderWidth: focused ? 2 : hairline,
          borderColor: invalid ? colors.down : focused ? colors.accent : colors.rule,
          // El foco no puede depender del color: engorda el trazo también.
          paddingVertical: focused ? space.xs - 1 : space.xs,
        },
        containerStyle,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={17}
          color={focused ? colors.accent : colors.inkFaint}
        />
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.inkFaint}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          type.body,
          { flex: 1, color: colors.ink, paddingVertical: space.sm },
          props.autoCapitalize === 'characters' ? numeric : null,
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
          style,
        ]}
        {...props}
      />
      {right}
    </View>
  );
});

/* ==========================================================================
 * Fila medida — etiqueta a la izquierda, medida a la derecha, regla debajo.
 * La unidad de lectura del analista.
 * ======================================================================== */

export function StatRow({
  label,
  hint,
  value,
  unit,
  tone = 'neutral',
  showSign,
  right,
  last,
}: {
  label: string;
  hint?: string;
  value: number | string | null | undefined;
  unit?: string;
  tone?: Tone;
  showSign?: boolean;
  right?: ReactNode;
  last?: boolean;
}) {
  const { colors, space, type } = useTheme();
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.lg,
          paddingVertical: space.md,
        }}
      >
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[type.label, { color: colors.ink }]} numberOfLines={2}>
            {label}
          </Text>
          {hint ? (
            <Text style={[type.caption, { color: colors.inkMuted }]} numberOfLines={2}>
              {hint}
            </Text>
          ) : null}
        </View>
        {right ?? <Num value={value} unit={unit} tone={tone} showSign={showSign} />}
      </View>
      {last ? null : <Rule />}
    </View>
  );
}

/* ==========================================================================
 * Carga — la placa se dibuja vacía y calibrada, no un spinner en el centro.
 * ======================================================================== */

export function Skeleton({
  width,
  height = 14,
  style,
}: {
  width?: number | string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        {
          width: (width ?? '100%') as any,
          height,
          borderRadius: radius.xs,
          backgroundColor: colors.surfaceSunken,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.rule,
        },
        style,
      ]}
    />
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.lg }} accessibilityLabel="Cargando datos">
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg }}
        >
          <Skeleton width={`${45 + ((i * 13) % 30)}%` as any} />
          <Skeleton width={64} />
        </View>
      ))}
    </View>
  );
}

/* ==========================================================================
 * Estado vacío — enseña el instrumento; no dice "no hay nada".
 * ======================================================================== */

export function EmptyState({
  icon = 'analytics-outline',
  title,
  body,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const { colors, space, type, radius, hairline } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.h2, paddingHorizontal: space.xl, gap: space.md }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.sm,
          borderWidth: hairline,
          borderColor: colors.ruleStrong,
          backgroundColor: colors.surfaceSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={24} color={colors.inkFaint} />
      </View>
      <Text style={[type.title3, { color: colors.ink, textAlign: 'center' }]}>{title}</Text>
      <Text
        style={[
          type.body,
          { color: colors.inkMuted, textAlign: 'center', maxWidth: 380 },
        ]}
      >
        {body}
      </Text>
      {action ? <View style={{ marginTop: space.xs }}>{action}</View> : null}
    </View>
  );
}

/* ==========================================================================
 * Aviso de error — nombra el problema y la salida, en el idioma del producto.
 * ======================================================================== */

export function Notice({
  tone = 'caution',
  title,
  body,
  action,
}: {
  tone?: Tone;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const { colors, palette, space, radius, type, hairline } = useTheme();
  const { fg, wash } = toneColors(palette, tone);
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.sm,
        borderWidth: hairline,
        borderColor: fg,
        backgroundColor: wash,
      }}
      accessibilityRole="alert"
    >
      <Ionicons
        name={tone === 'down' ? 'alert-circle' : 'information-circle'}
        size={18}
        color={fg}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.labelStrong, { color: fg }]}>{title}</Text>
        {body ? <Text style={[type.caption, { color: colors.inkMuted }]}>{body}</Text> : null}
        {action}
      </View>
    </View>
  );
}
