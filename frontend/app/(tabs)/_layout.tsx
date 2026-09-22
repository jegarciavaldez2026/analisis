import React, { useCallback, useEffect, useState } from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Rect } from 'react-native-svg';

import { useTheme, ThemeMode } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { Rule, Legend } from '../../components/ui';

/**
 * Las secciones y su orden. Sin emoji: la iconografía es una familia dibujada
 * y de trazo consistente, no una mezcla de glifos del sistema.
 *
 * «Mi Cuenta» era un contenedor, no una sección: dentro había un selector con
 * Favoritos y Portafolio, que es lo que la gente venía a ver. Nadie entra a
 * una app de bolsa a mirar su cuenta. Ahora las dos lecturas están en el
 * primer nivel y el nombre del menú dice lo que hay detrás.
 */
const TABS = [
  { name: 'search', title: 'Análisis', short: 'Análisis', icon: 'search', iconOut: 'search-outline' },
  { name: 'market', title: 'Mercado', short: 'Mercado', icon: 'pulse', iconOut: 'pulse-outline' },
  { name: 'watchlist', title: 'Favoritos', short: 'Favoritos', icon: 'star', iconOut: 'star-outline' },
  { name: 'portfolio', title: 'Portafolio', short: 'Cartera', icon: 'briefcase', iconOut: 'briefcase-outline' },
  { name: 'history', title: 'Historial', short: 'Historial', icon: 'time', iconOut: 'time-outline' },
  { name: 'screener', title: 'Screener', short: 'Screener', icon: 'funnel', iconOut: 'funnel-outline' },
  { name: 'OvertonScreen', title: 'Ventana de Overton', short: 'Overton', icon: 'eye', iconOut: 'eye-outline' },
  { name: 'info', title: 'Info', short: 'Info', icon: 'information-circle', iconOut: 'information-circle-outline' },
] as const;

const SIDEBAR_WIDTH = 244;
/** Plegada no desaparece: queda el raíl de iconos. Si se fuera del todo, el
 *  propio interruptor —la marca— se iría con ella y no habría por dónde
 *  volver a abrirla sin buscar un botón escondido en otro sitio. */
const SIDEBAR_RAIL = 68;
const CLAVE_SIDEBAR = 'finanalysis.sidebar.plegada';

/* ==========================================================================
 * Marca — una escala graduada con su índice. El producto dibujado en 28px.
 * ======================================================================== */

function Wordmark({
  size = 30,
  soloMarca,
}: {
  size?: number;
  /** Plegada: se queda el símbolo y se va el nombre. */
  soloMarca?: boolean;
}) {
  const { colors, hairline, type, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        justifyContent: soloMarca ? 'center' : 'flex-start',
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius.xs,
          borderWidth: hairline,
          borderColor: colors.ruleStrong,
          backgroundColor: colors.surfaceSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={size - 8} height={size - 8} viewBox="0 0 22 22">
          {[3, 7, 11, 15, 19].map((x, i) => (
            <Line
              key={x}
              x1={x}
              x2={x}
              y1={18}
              y2={i % 2 === 0 ? 10 : 13}
              stroke={colors.ruleStrong}
              strokeWidth={1.5}
            />
          ))}
          <Rect x={13.2} y={3} width={2.6} height={16} fill={colors.accent} />
        </Svg>
      </View>
      {!soloMarca && (
        <View>
          <Text style={[type.title3, { color: colors.ink, letterSpacing: -0.2 }]}>FinAnalysis</Text>
          <Legend>Lectura de fundamentales</Legend>
        </View>
      )}
    </View>
  );
}

/* ==========================================================================
 * Control de apariencia — tres opciones explícitas, no un interruptor mudo.
 * ======================================================================== */

function AppearanceControl({ compact }: { compact?: boolean }) {
  const { colors, mode, setMode, space, radius, type, hairline } = useTheme();
  const options: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'system', label: 'Sistema', icon: 'phone-portrait-outline' },
    { key: 'light', label: 'Claro', icon: 'sunny-outline' },
    { key: 'dark', label: 'Oscuro', icon: 'moon-outline' },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        borderWidth: hairline,
        borderColor: colors.rule,
        borderRadius: radius.xs,
        backgroundColor: colors.surfaceSunken,
        overflow: 'hidden',
      }}
      accessibilityRole="radiogroup"
    >
      {options.map((o, i) => {
        const on = mode === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => setMode(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Apariencia: ${o.label}`}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: 34,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                paddingVertical: space.xs,
                paddingHorizontal: space.xs,
                backgroundColor: on ? colors.accent : pressed ? colors.accentWash : 'transparent',
                borderLeftWidth: i === 0 ? 0 : hairline,
                borderLeftColor: colors.rule,
              },
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
            ]}
          >
            <Ionicons name={o.icon} size={13} color={on ? colors.inkOnAccent : colors.inkMuted} />
            {!compact && (
              <Text
                style={[
                  type.caption,
                  { color: on ? colors.inkOnAccent : colors.inkMuted, fontWeight: on ? '700' : '500' },
                ]}
              >
                {o.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ==========================================================================
 * Barra lateral (escritorio)
 * ======================================================================== */

function WebSidebar({ plegada, onAlternar }: { plegada: boolean; onAlternar: () => void }) {
  const { colors, space, radius, type, hairline } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View
      style={[
        styles.sidebar,
        {
          width: plegada ? SIDEBAR_RAIL : SIDEBAR_WIDTH,
          backgroundColor: colors.chrome,
          borderRightColor: colors.rule,
          borderRightWidth: hairline,
        },
      ]}
    >
      {/* La marca es el interruptor. Es el sitio donde todo el mundo pulsa ya
          para volver al principio, y aquí no navega a ninguna parte: pliega. */}
      <Pressable
        onPress={onAlternar}
        accessibilityRole="button"
        accessibilityLabel={plegada ? 'Mostrar el menú lateral' : 'Ocultar el menú lateral'}
        accessibilityState={{ expanded: !plegada }}
        style={({ pressed, hovered }: any) => [
          {
            padding: plegada ? space.md : space.lg,
            backgroundColor: pressed || hovered ? colors.accentWash : 'transparent',
          },
          Platform.OS === 'web' ? ({ cursor: 'pointer', transitionDuration: '160ms' } as any) : null,
        ]}
        {...(Platform.OS === 'web'
          ? ({ title: plegada ? 'Mostrar el menú' : 'Ocultar el menú' } as any)
          : null)}
      >
        <Wordmark soloMarca={plegada} />
      </Pressable>
      <Rule />

      <ScrollView contentContainerStyle={{ paddingVertical: space.md }}>
        {!plegada && (
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            <Legend>Secciones</Legend>
          </View>
        )}

        {TABS.map((tab) => {
          const isActive = pathname.includes(tab.name);
          return (
            <Pressable
              key={tab.name}
              onPress={() => router.push(('/(tabs)/' + tab.name) as any)}
              accessibilityRole="link"
              accessibilityState={{ selected: isActive }}
              // Plegada el rótulo desaparece, así que el nombre tiene que
              // seguir estando en algún sitio: aquí para el lector de pantalla
              // y en el title del navegador para el ratón.
              accessibilityLabel={tab.title}
              {...(Platform.OS === 'web' && plegada ? ({ title: tab.title } as any) : null)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: plegada ? 'center' : 'flex-start',
                  gap: plegada ? 0 : space.md,
                  minHeight: 44,
                  paddingVertical: space.sm,
                  paddingHorizontal: plegada ? 0 : space.lg,
                  marginHorizontal: space.sm,
                  borderRadius: radius.xs,
                  backgroundColor: isActive
                    ? colors.surface
                    : pressed
                      ? colors.accentWash
                      : 'transparent',
                  borderWidth: hairline,
                  borderColor: isActive ? colors.rule : 'transparent',
                },
                Platform.OS === 'web' ? ({ cursor: 'pointer', transitionDuration: '160ms' } as any) : null,
              ]}
            >
              <Ionicons
                name={(isActive ? tab.icon : tab.iconOut) as any}
                size={17}
                color={isActive ? colors.accent : colors.inkMuted}
              />
              {!plegada && (
                <>
                  <Text
                    style={[
                      type.label,
                      { flex: 1, color: isActive ? colors.ink : colors.inkMuted, fontWeight: isActive ? '700' : '500' },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.title}
                  </Text>
                  {/* Índice: la misma marca que señala la lectura en la escala */}
                  {isActive ? (
                    <View style={{ width: 3, height: 16, backgroundColor: colors.accent }} />
                  ) : null}
                </>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <Rule />
      <View style={{ padding: plegada ? space.sm : space.lg, gap: space.md }}>
        <View style={{ gap: space.xs }}>
          {!plegada && <Legend>Apariencia</Legend>}
          <AppearanceControl compact={plegada} />
        </View>

        {user ? (
          <>
            <Rule />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                justifyContent: plegada ? 'center' : 'flex-start',
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.xs,
                  backgroundColor: colors.accentWash,
                  borderWidth: hairline,
                  borderColor: colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={[type.labelStrong, { color: colors.accent }]}>
                  {(user.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              {!plegada && (
                <View style={{ flex: 1 }}>
                  <Text style={[type.caption, { color: colors.ink, fontWeight: '700' }]} numberOfLines={1}>
                    {user.name}
                  </Text>
                  <Text style={[type.caption, { color: colors.inkMuted }]} numberOfLines={1}>
                    {user.email}
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={logout}
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión"
              {...(Platform.OS === 'web' && plegada ? ({ title: 'Cerrar sesión' } as any) : null)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: plegada ? 'center' : 'flex-start',
                  gap: plegada ? 0 : space.sm,
                  minHeight: 40,
                  paddingHorizontal: plegada ? 0 : space.md,
                  borderRadius: radius.xs,
                  borderWidth: hairline,
                  borderColor: pressed ? colors.down : colors.rule,
                  backgroundColor: pressed ? colors.downWash : 'transparent',
                },
                Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
              ]}
            >
              <Ionicons name="log-out-outline" size={15} color={colors.down} />
              {!plegada && (
                <Text style={[type.caption, { color: colors.down, fontWeight: '600' }]}>Cerrar sesión</Text>
              )}
            </Pressable>
          </>
        ) : null}

        {!plegada && (
          <Text style={[type.legend, { color: colors.inkFaint }]}>Datos: Yahoo Finance · v2.0.0</Text>
        )}
      </View>
    </View>
  );
}

/* ==========================================================================
 * Barra superior (escritorio)
 * ======================================================================== */

function WebTopBar() {
  const { colors, space, type, hairline } = useTheme();
  const pathname = usePathname();
  const current = TABS.find((t) => pathname.includes(t.name));

  return (
    <View
      style={[
        styles.topBar,
        { backgroundColor: colors.chrome, borderBottomColor: colors.rule, borderBottomWidth: hairline, paddingHorizontal: space.xxl },
      ]}
    >
      <Text style={[type.title3, { color: colors.ink }]}>{current?.title ?? 'FinAnalysis'}</Text>
      <View style={{ width: 180 }}>
        <AppearanceControl compact />
      </View>
    </View>
  );
}

/* ==========================================================================
 * Layout
 * ======================================================================== */

export default function TabLayout() {
  const { colors, hairline } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  /**
   * Barra lateral plegada. Arranca desplegada siempre —el servidor
   * pre-renderiza con ese valor y el primer render del navegador tiene que
   * coincidir— y la preferencia guardada se aplica después de montar.
   */
  const [plegada, setPlegada] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      if (window.localStorage?.getItem(CLAVE_SIDEBAR) === '1') setPlegada(true);
    } catch {
      /* sin almacenamiento se queda desplegada, que es el estado seguro */
    }
  }, []);

  const alternarBarra = useCallback(() => {
    setPlegada((p) => {
      const siguiente = !p;
      try {
        window?.localStorage?.setItem(CLAVE_SIDEBAR, siguiente ? '1' : '0');
      } catch {
        /* una preferencia que no se guarda no debe tumbar la navegación */
      }
      return siguiente;
    });
  }, []);

  // Con ocho secciones, una pantalla de 375 px deja 47 px por pestaña: la
  // etiqueta se corta y «Portafolio» pasa a ser «Porta…». Antes que enseñar
  // una palabra rota, se enseña sólo el icono y el nombre se lee en la propia
  // pantalla. Los iconos siguen siendo distinguibles a ese tamaño; las
  // etiquetas cortadas, no.
  const anchoPorPestana = width / TABS.length;
  const conEtiqueta = anchoPorPestana >= 62;

  // La responsividad aquí es estructural: por debajo de 900 px el escritorio
  // pliega a la navegación por pestañas en lugar de encoger la barra lateral.
  const isDesktop = Platform.OS === 'web' && width >= 900;

  if (isDesktop) {
    return (
      <View style={[styles.webContainer, { backgroundColor: colors.canvas }]}>
        <WebSidebar plegada={plegada} onAlternar={alternarBarra} />
        <View style={styles.mainArea}>
          <WebTopBar />
          <View style={styles.webContent}>
            <Tabs screenOptions={{ tabBarStyle: { display: 'none' }, headerShown: false }}>
              {TABS.map((tab) => (
                <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
              ))}
            </Tabs>
          </View>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.chrome,
          borderTopWidth: hairline,
          borderTopColor: colors.rule,
          height: 56 + insets.bottom,
          // Sin etiqueta el icono se queda solo: se centra en la barra en vez
          // de quedar colgando arriba con un hueco debajo.
          paddingBottom: insets.bottom + (conEtiqueta ? 4 : 12),
          paddingTop: conEtiqueta ? 6 : 12,
          elevation: 0,
        },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarShowLabel: conEtiqueta,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0,
          marginTop: 1,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.short,
            tabBarAccessibilityLabel: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={(focused ? tab.icon : tab.iconOut) as any}
                size={conEtiqueta ? 21 : 23}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    flexDirection: 'row',
    minHeight: '100vh' as any,
  },
  sidebar: {
    // El ancho lo pone el componente según esté plegada o no; aquí sólo el
    // valor de partida y la transición, para que el pliegue se vea moverse.
    width: SIDEBAR_WIDTH,
    minHeight: '100vh' as any,
    flexDirection: 'column',
    ...(Platform.OS === 'web'
      ? ({ transitionProperty: 'width', transitionDuration: '180ms' } as any)
      : null),
  },
  mainArea: {
    flex: 1,
    flexDirection: 'column',
    minHeight: '100vh' as any,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  webContent: {
    flex: 1,
    overflow: 'auto' as any,
  },
});
