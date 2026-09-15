import { Stack, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ChatProvider } from '../contexts/ChatContext';
import { SimboloProvider } from '../contexts/SimboloContext';
import AIChatWidget from '../components/AIChatWidget';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { ActivityIndicator, View } from 'react-native';


function AuthGuard() {
  const { isAuthenticated, loading, user } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'login';
    const enCambioPassword = segments[0] === 'cambiar-password';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && user?.debe_cambiar_password && !enCambioPassword) {
      // Con una contraseña temporal no se pasa de aquí hasta elegir una propia.
      // El backend lo impone igual (403 en el resto de rutas); esto sólo evita
      // enseñar pantallas que fallarían.
      router.replace('/cambiar-password');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/search');
    }
  }, [isAuthenticated, loading, segments, user?.debe_cambiar_password, router]);

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
      {/* Sin esto la pestaña del navegador salía sin nombre: el <title> iba vacío. */}
      <Head>
        <title>Fundamentor</title>
      </Head>
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
