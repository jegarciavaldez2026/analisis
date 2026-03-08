import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ThemeColors {
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
}

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  colors: ThemeColors;
}

const lightColors: ThemeColors = {
  background: '#F5F5F7',
  card: '#FFFFFF',
  text: '#1D1D1F',
  textSecondary: '#6E6E73',
  border: '#E0E0E0',
  primary: '#007AFF',
  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9500',
  inputBackground: '#F5F5F7',
};

const darkColors: ThemeColors = {
  background: '#000000',
  card: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  border: '#38383A',
  primary: '#0A84FF',
  success: '#30D158',
  danger: '#FF453A',
  warning: '#FF9F0A',
  inputBackground: '#2C2C2E',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Simple storage that works on both web and native
const storage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // Silently fail
    }
  },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await storage.getItem('app_theme');
      if (savedTheme === 'dark') {
        setIsDark(true);
      }
    } catch (error) {
      console.log('Theme loaded with default');
    } finally {
      setIsLoaded(true);
    }
  };

  const toggleTheme = async () => {
    try {
      const newTheme = !isDark;
      setIsDark(newTheme);
      await storage.setItem('app_theme', newTheme ? 'dark' : 'light');
    } catch (error) {
      console.log('Could not save theme preference');
    }
  };

  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
