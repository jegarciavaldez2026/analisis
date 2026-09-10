import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ChatProvider } from '../contexts/ChatContext';
import { SimboloProvider } from '../contexts/SimboloContext';
import AIChatWidget from '../components/AIChatWidget';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { ActivityIndicator, View } from 'react-native';


function AuthGuard() {
  const { isAuthenticated, loading } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'login';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/search');
    }
  }, [isAuthenticated, loading, segments]);

  if (loading) {
    // Es la primera pantalla que ve nadie al abrir la app. Sin fondo explícito
    // salía en blanco también en modo oscuro: un destello claro antes de que
    // la sesión resuelva. El chasis se pinta desde el primer fotograma.
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.canvas,
        }}
        accessibilityLabel="Comprobando la sesión"
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.innerHTML = `
        svg { pointer-events: none !important; }
        svg * { pointer-events: none !important; }
        select { pointer-events: all !important; z-index: 9999 !important; position: relative !important; }
        button { pointer-events: all !important; z-index: 9999 !important; position: relative !important; }
        div[style*="visibility: hidden"] { pointer-events: none !important; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <SimboloProvider>
          <ChatProvider>
            <AuthGuard />
            <Stack screenOptions={{ headerShown: false }} />
            <AIChatWidget />
          </ChatProvider>
        </SimboloProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
