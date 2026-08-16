import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../contexts/AuthContext';
import { useTheme, ThemeMode } from '../contexts/ThemeContext';
import { Button, Field, Legend, Notice, Panel, Rule } from '../components/ui';
import { decisionBands } from '../theme/tokens';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const { colors, mode, setMode, space, type, radius, hairline } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState<'name' | 'email' | 'password' | null>(null);

  const handleSubmit = async () => {
    setError('');
    setInvalidField(null);

    // Los errores nombran el problema y la salida, no sólo que algo falta.
    if (!email.trim()) {
      setInvalidField('email');
      setError('Falta el email. Escribe la dirección con la que te registraste.');
      return;
    }
    if (!password.trim()) {
      setInvalidField('password');
      setError('Falta la contraseña.');
      return;
    }
    if (!isLogin && !name.trim()) {
      setInvalidField('name');
      setError('Falta tu nombre. Es el que aparecerá en tu cuenta.');
      return;
    }
    if (password.length < 6) {
      setInvalidField('password');
      setError('La contraseña necesita al menos 6 caracteres. Añade unos cuantos más.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, name.trim());
      }
    } catch (e: any) {
      setError(
        e.response?.data?.detail ||
          'No se pudo conectar con el servidor. Comprueba tu conexión y vuelve a intentarlo.',
      );
    } finally {
      setLoading(false);
    }
  };

  const wide = width >= 900;

  const appearanceOptions: { key: ThemeMode; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { key: 'system', icon: 'phone-portrait-outline', label: 'Sistema' },
    { key: 'light', icon: 'sunny-outline', label: 'Claro' },
    { key: 'dark', icon: 'moon-outline', label: 'Oscuro' },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + space.xl,
            paddingBottom: insets.bottom + space.xl,
            paddingHorizontal: space.xl,
          },
        ]}
      >
        {/* Control de apariencia, arriba a la derecha */}
        <View style={[styles.appearance, { top: insets.top + space.md, right: space.xl }]}>
          <View
            style={{
              flexDirection: 'row',
              borderWidth: hairline,
              borderColor: colors.rule,
              borderRadius: radius.xs,
              backgroundColor: colors.surfaceSunken,
              overflow: 'hidden',
            }}
          >
            {appearanceOptions.map((o, i) => {
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
                      width: 44,
                      height: 34,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? colors.accent : pressed ? colors.accentWash : 'transparent',
                      borderLeftWidth: i === 0 ? 0 : hairline,
                      borderLeftColor: colors.rule,
                    },
                    Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                  ]}
                >
                  <Ionicons name={o.icon} size={15} color={on ? colors.inkOnAccent : colors.inkMuted} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.stage, wide && styles.stageWide]}>
          {/* Placa de especificación: qué mide este instrumento. Sólo hechos. */}
          {wide && (
            <View style={{ flex: 1, maxWidth: 420, gap: space.xl, paddingTop: space.h2 }}>
              <Text style={[type.display, { color: colors.ink }]}>
                Un veredicto que se puede desarmar.
              </Text>
              <Text style={[type.body, { color: colors.inkMuted, maxWidth: 380 }]}>
                FinAnalysis calcula más de 50 ratios fundamentales sobre datos de Yahoo Finance, los
                compara con sus umbrales y coloca el resultado en una escala. Cada punto de esa escala
                se puede seguir hasta la métrica que lo produjo.
              </Text>

              <View style={{ gap: space.md }}>
                <Legend>Regla de decisión</Legend>
                <View
                  style={{
                    borderWidth: hairline,
                    borderColor: colors.rule,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surface,
                    overflow: 'hidden',
                  }}
                >
                  {decisionBands
                    .slice()
                    .reverse()
                    .map((b, i, arr) => {
                      const fg =
                        b.tone === 'up' ? colors.up : b.tone === 'down' ? colors.down : colors.caution;
                      return (
                        <View key={b.verdict}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: space.md,
                              padding: space.md,
                            }}
                          >
                            <View style={{ width: 3, height: 20, backgroundColor: fg }} />
                            <Text style={[type.labelStrong, { color: fg, width: 96 }]}>{b.verdict}</Text>
                            <Text style={[type.caption, { color: colors.inkMuted, flex: 1 }]}>
                              {b.from === 60
                                ? 'métricas favorables ≥ 60 %'
                                : b.from === 40
                                  ? 'métricas favorables 40 – 60 %'
                                  : 'métricas favorables < 40 %'}
                            </Text>
                            <Text style={[type.caption, { color: colors.inkFaint }]}>
                              riesgo {b.risk.toLowerCase()}
                            </Text>
                          </View>
                          {i < arr.length - 1 ? <Rule /> : null}
                        </View>
                      );
                    })}
                </View>
                <Text style={[type.caption, { color: colors.inkFaint }]}>
                  Es una lectura de los números publicados, no un consejo de inversión.
                </Text>
              </View>
            </View>
          )}

          {/* Panel de acceso */}
          <View style={{ width: '100%', maxWidth: 400 }}>
            <View style={{ marginBottom: space.xl, gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.xs,
                    borderWidth: hairline,
                    borderColor: colors.ruleStrong,
                    backgroundColor: colors.surfaceSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Svg width={26} height={26} viewBox="0 0 22 22">
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
                <View>
                  <Text style={[type.title2, { color: colors.ink }]}>FinAnalysis</Text>
                  <Legend>Lectura de fundamentales</Legend>
                </View>
              </View>
            </View>

            <Panel level={2} padded={false}>
              <View style={{ padding: space.xl, gap: space.lg }}>
                <View style={{ gap: space.xxs }}>
                  <Text style={[type.title2, { color: colors.ink }]}>
                    {isLogin ? 'Entrar' : 'Crear cuenta'}
                  </Text>
                  <Text style={[type.caption, { color: colors.inkMuted }]}>
                    {isLogin
                      ? 'Tu historial de análisis queda asociado a esta cuenta.'
                      : 'Con una cuenta se guarda tu historial de análisis.'}
                  </Text>
                </View>

                {!isLogin && (
                  <View style={{ gap: space.xs }}>
                    <Legend>Nombre</Legend>
                    <Field
                      icon="person-outline"
                      placeholder="Tu nombre"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      invalid={invalidField === 'name'}
                      textContentType="name"
                    />
                  </View>
                )}

                <View style={{ gap: space.xs }}>
                  <Legend>Email</Legend>
                  <Field
                    icon="mail-outline"
                    placeholder="tu@email.com"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    invalid={invalidField === 'email'}
                    onSubmitEditing={handleSubmit}
                  />
                </View>

                <View style={{ gap: space.xs }}>
                  <Legend>Contraseña</Legend>
                  <Field
                    icon="lock-closed-outline"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    textContentType={isLogin ? 'password' : 'newPassword'}
                    invalid={invalidField === 'password'}
                    onSubmitEditing={handleSubmit}
                    right={
                      <Pressable
                        onPress={() => setShowPassword((v) => !v)}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        hitSlop={12}
                        style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={17}
                          color={colors.inkMuted}
                        />
                      </Pressable>
                    }
                  />
                </View>

                {error ? <Notice tone="down" title="No se pudo continuar" body={error} /> : null}

                <Button
                  label={isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
                  onPress={handleSubmit}
                  loading={loading}
                  size="lg"
                  full
                />
              </View>

              <Rule />

              <Pressable
                onPress={() => {
                  setIsLogin((v) => !v);
                  setError('');
                  setInvalidField(null);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  {
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 4,
                    backgroundColor: pressed ? colors.accentWash : 'transparent',
                  },
                  Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
                ]}
              >
                <Text style={[type.caption, { color: colors.inkMuted }]}>
                  {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
                </Text>
                <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>
                  {isLogin ? 'Regístrate' : 'Inicia sesión'}
                </Text>
              </Pressable>
            </Panel>

            <Text
              style={[
                type.legend,
                { color: colors.inkFaint, textAlign: 'center', marginTop: space.lg },
              ]}
            >
              Datos de Yahoo Finance
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appearance: {
    position: 'absolute',
    zIndex: 10,
  },
  stage: {
    width: '100%',
    alignItems: 'center',
  },
  stageWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 64,
    maxWidth: 1000,
  },
});
