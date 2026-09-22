import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const { login, register } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) { setError('Completa todos los campos'); return; }
    if (!isLogin && !name.trim()) { setError('Ingresa tu nombre'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setLoading(true);
    try {
      if (isLogin) {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, name.trim());
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const isWeb = Platform.OS === 'web';

  return (
    <View style={[styles.root, { backgroundColor: isDark ? '#0f1117' : '#f5f5f7' }]}>

      {/* Theme toggle top right */}
      <TouchableOpacity
        style={styles.themeBtn}
        onPress={toggleTheme}
      >
        <Text style={{ fontSize: 18 }}>{isDark ? '☀️' : '🌙'}</Text>
      </TouchableOpacity>

      {/* Center card */}
      <View style={[
        styles.card,
        { backgroundColor: isDark ? '#1a1d2e' : '#ffffff' },
        isWeb && styles.cardWeb
      ]}>

        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={[styles.logoIcon, { backgroundColor: colors.primary }]}>
            <Text style={styles.logoText}>FA</Text>
          </View>
          <Text style={[styles.appName, { color: isDark ? '#ffffff' : '#0f1117' }]}>FinAnalysis</Text>
        </View>

        <Text style={[styles.welcomeText, { color: isDark ? '#ffffff' : '#0f1117' }]}>
          {isLogin ? 'Bienvenido de nuevo' : 'Crear cuenta'}
        </Text>
        <Text style={[styles.subText, { color: colors.textSecondary }]}>
          {isLogin ? 'Ingresa tus credenciales para continuar' : 'Regístrate para empezar a analizar'}
        </Text>

        {/* Formulario */}
        <View style={styles.form}>
          {!isLogin && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Nombre completo</Text>
              <View style={[styles.inputRow, {
                backgroundColor: isDark ? '#0f1117' : '#f9fafb',
                borderColor: isDark ? '#2d3148' : '#e5e7eb',
              }]}>
                <Ionicons name="person-outline" size={17} color={colors.textSecondary} />
                <TextInput
                  style={[styles.input, { color: isDark ? '#ffffff' : '#0f1117' }]}
                  placeholder="Tu nombre"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
            <View style={[styles.inputRow, {
              backgroundColor: isDark ? '#0f1117' : '#f9fafb',
              borderColor: isDark ? '#2d3148' : '#e5e7eb',
            }]}>
              <Ionicons name="mail-outline" size={17} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: isDark ? '#ffffff' : '#0f1117' }]}
                placeholder="tu@email.com"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                onSubmitEditing={handleSubmit}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Contraseña</Text>
            <View style={[styles.inputRow, {
              backgroundColor: isDark ? '#0f1117' : '#f9fafb',
              borderColor: isDark ? '#2d3148' : '#e5e7eb',
            }]}>
              <Ionicons name="lock-closed-outline" size={17} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: isDark ? '#ffffff' : '#0f1117' }]}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={17}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={15} color="#FF3B30" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.submitText}>{isLogin ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Toggle login/register */}
        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: colors.textSecondary }]}>
            {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
          </Text>
          <TouchableOpacity onPress={() => { setIsLogin(!isLogin); setError(''); }}>
            <Text style={[styles.toggleLink, { color: colors.primary }]}>
              {isLogin ? ' Regístrate' : ' Inicia sesión'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={[styles.footer, { color: isDark ? '#374151' : '#d1d5db' }]}>
          FinAnalysis · Powered by Yahoo Finance
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh' as any,
  },
  themeBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 8,
    borderRadius: 8,
    zIndex: 10,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  cardWeb: {
    width: 400,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subText: {
    fontSize: 14,
    marginBottom: 28,
    lineHeight: 20,
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 10,
    height: 46,
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: 46,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FF3B3012',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF3B3030',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    flex: 1,
  },
  submitBtn: {
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 13,
  },
  toggleLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 24,
  },
});
