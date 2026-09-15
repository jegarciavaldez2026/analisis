/**
 * Cambio de contraseña.
 *
 * Obligatorio al entrar con una contraseña temporal (el `AuthGuard` no deja
 * salir de aquí hasta cambiarla) y voluntario desde el menú de la cuenta. Vive
 * fuera de `(tabs)` porque, en el caso obligatorio, el resto de la aplicación
 * todavía no es accesible.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import CambiarPassword from '../components/cuenta/CambiarPassword';
import { Button, Panel } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export default function CambiarPasswordScreen() {
  const { user, logout } = useAuth();
  const { colors, space, type } = useTheme();
  const router = useRouter();
  const obligatorio = !!user?.debe_cambiar_password;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingHorizontal: space.lg, paddingVertical: space.xl, alignItems: 'center' }}
    >
      <View style={{ width: '100%', maxWidth: 460, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text style={[type.title2, { color: colors.ink }]}>Cambia tu contraseña</Text>
          <Text style={[type.caption, { color: colors.inkMuted }]}>
            {obligatorio
              ? 'Has entrado con una contraseña temporal. Elige una propia para empezar a usar la aplicación.'
              : `Cuenta: ${user?.email ?? ''}`}
          </Text>
        </View>
        <Panel level={2}>
          <CambiarPassword onHecho={() => router.replace('/(tabs)/search')} />
        </Panel>
        {obligatorio ? (
          <Button label="Salir" variant="ghost" onPress={logout} />
        ) : (
          <Button label="Volver" variant="ghost" onPress={() => router.back()} />
        )}
      </View>
    </ScrollView>
  );
}
