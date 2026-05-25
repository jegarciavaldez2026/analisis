import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider } from '../contexts/ThemeContext';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { ActivityIndicator, View } from 'react-native';


function AuthGuard() {
  const { isAuthenticated, loading } = useAuth();
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
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
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
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </ThemeProvider>
  );
}
