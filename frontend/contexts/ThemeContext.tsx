import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { Appearance, ColorSchemeName, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  Palette,
  darkPalette,
  lightPalette,
  elevation as elevationFor,
  type as typeScale,
  space,
  radius,
  hairline,
  motion,
  numeric,
  fontFamily,
} from '../theme/tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Los nombres heredados (background, card, text…) se conservan a propósito:
 * hay siete pantallas y una veintena de componentes leyendo estas claves. Se
 * mantiene el contrato y se reapunta al mundo nuevo, así que todo el producto
 * cambia de piel a la vez en lugar de quedarse a medias.
 */
export interface ThemeColors extends Palette {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  success: string;
  danger: string;
  warning: string;
  inputBackground: string;
  // Alias que ya usaban algunos componentes de gráficos.
  bull: string;
  bear: string;
  muted: string;
  warn: string;
  accentColor: string;
  purple: string;
}

function toColors(p: Palette): ThemeColors {
  return {
    ...p,
    background: p.canvas,
    card: p.surface,
    text: p.ink,
    textSecondary: p.inkMuted,
    border: p.rule,
    primary: p.accent,
    success: p.up,
    danger: p.down,
    warning: p.caution,
    inputBackground: p.surfaceSunken,
    bull: p.up,
    bear: p.down,
    muted: p.inkFaint,
    warn: p.caution,
    accentColor: p.accent,
    purple: p.accent,
  };
}

const lightColors = toColors(lightPalette);
const darkColors = toColors(darkPalette);

interface ThemeContextType {
  /** Resultado efectivo: lo que se está pintando ahora mismo. */
  isDark: boolean;
  /** Preferencia guardada: 'system' sigue al sistema operativo. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Alterna claro ⇄ oscuro y fija la preferencia (deja de seguir al sistema). */
  toggleTheme: () => void;
  colors: ThemeColors;
  palette: Palette;
  /** Sombra de placa por nivel: desplazamiento + desenfoque, nunca un halo. */
  elevation: (level: 0 | 1 | 2 | 3) => object;
  type: typeof typeScale;
  space: typeof space;
  radius: typeof radius;
  hairline: number;
  motion: typeof motion;
  numeric: typeof numeric;
  fontFamily: typeof fontFamily;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'finanalysis.theme.mode';

/**
 * Persistencia real en las dos plataformas. La versión anterior sólo escribía
 * en localStorage, así que en iOS y Android la preferencia se perdía en cada
 * arranque; AsyncStorage ya estaba en las dependencias.
 */
const storage = {
  async get(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        return window.localStorage.getItem(STORAGE_KEY);
      }
      return await AsyncStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  async set(value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        window?.localStorage?.setItem(STORAGE_KEY, value);
        return;
      }
      await AsyncStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* una preferencia que no se guarda no debe tumbar la app */
    }
  },
};

function isMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storage.get();
      // Migración desde el formato anterior, que guardaba 'dark' | 'light' en otra clave.
      const legacy =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.localStorage?.getItem('app_theme')
          : null;
      const next = isMode(saved) ? saved : isMode(legacy) ? legacy : 'system';
      if (!cancelled) setModeState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) =>
      setSystemScheme(colorScheme),
    );
    return () => sub.remove();
  }, []);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void storage.set(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  const value = useMemo<ThemeContextType>(() => {
    const palette = isDark ? darkPalette : lightPalette;
    return {
      isDark,
      mode,
      setMode,
      toggleTheme,
      colors: isDark ? darkColors : lightColors,
      palette,
      elevation: (level: 0 | 1 | 2 | 3) => elevationFor(palette, level),
      type: typeScale,
      space,
      radius,
      hairline,
      motion,
      numeric,
      fontFamily,
    };
  }, [isDark, mode, setMode, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
