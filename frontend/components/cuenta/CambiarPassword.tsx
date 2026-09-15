/**
 * Formulario para cambiar la contraseña propia.
 *
 * La política se comprueba aquí para avisar antes de enviar, pero la que manda
 * es la del backend (`usuarios.validar_password`): el mensaje que devuelva se
 * enseña tal cual. Mínimo 12 caracteres y máximo 72 BYTES, porque bcrypt ignora
 * en silencio lo que sobra.
 */
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { mensajeDeError } from '../../lib/admin/api';
import { Button, Field, Legend, Notice } from '../ui';

const MINIMO = 12;
const MAX_BYTES = 72;

/** Bytes en UTF-8, contados a mano: igual en web y en nativo, sin depender de TextEncoder. */
function bytes(texto: string): number {
  let n = 0;
  for (const caracter of texto) {
    const c = caracter.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

export default function CambiarPassword({ onHecho }: { onHecho?: () => void }) {
  const { cambiarPassword, user } = useAuth();
  const { colors, space } = useTheme();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ver, setVer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const enviar = async () => {
    setError(null);
    if (!actual) return setError('Escribe tu contraseña actual (o la temporal que te dieron).');
    if (nueva.length < MINIMO) return setError(`La contraseña nueva necesita al menos ${MINIMO} caracteres.`);
    if (bytes(nueva) > MAX_BYTES) return setError('La contraseña nueva es demasiado larga (máximo 72 bytes).');
    if (nueva !== repetida) return setError('Las dos contraseñas nuevas no coinciden.');
    if (nueva === actual) return setError('La contraseña nueva tiene que ser distinta de la actual.');
    setEnviando(true);
    try {
      await cambiarPassword(actual, nueva);
      setHecho(true);
      setActual('');
      setNueva('');
      setRepetida('');
      onHecho?.();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  const ojo = (
    <Pressable
      onPress={() => setVer((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={ver ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
      hitSlop={12}
      style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : undefined}
    >
      <Ionicons name={ver ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.inkMuted} />
    </Pressable>
  );

  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <Legend>{user?.debe_cambiar_password ? 'Contraseña temporal' : 'Contraseña actual'}</Legend>
        <Field
          icon="lock-closed-outline"
          value={actual}
          onChangeText={setActual}
          secureTextEntry={!ver}
          autoCapitalize="none"
          textContentType="password"
          right={ojo}
        />
      </View>
      <View style={{ gap: space.xs }}>
        <Legend>Contraseña nueva</Legend>
        <Field
          icon="key-outline"
          placeholder={`Mínimo ${MINIMO} caracteres`}
          value={nueva}
          onChangeText={setNueva}
          secureTextEntry={!ver}
          autoCapitalize="none"
          textContentType="newPassword"
        />
      </View>
      <View style={{ gap: space.xs }}>
        <Legend>Repite la nueva</Legend>
        <Field
          icon="key-outline"
          value={repetida}
          onChangeText={setRepetida}
          secureTextEntry={!ver}
          autoCapitalize="none"
          textContentType="newPassword"
          onSubmitEditing={enviar}
        />
      </View>
      <Text style={{ color: colors.inkFaint, fontSize: 12, lineHeight: 17 }}>
        Sin reglas de mayúsculas ni símbolos: lo que protege es la longitud. Una frase de varias palabras sirve. Al
        cambiarla se cierran tus sesiones en los demás dispositivos.
      </Text>
      {error ? <Notice tone="down" title="No se pudo cambiar" body={error} /> : null}
      {hecho && !error ? <Notice tone="up" title="Contraseña cambiada" body="Las demás sesiones se han cerrado." /> : null}
      <Button label="Cambiar contraseña" onPress={enviar} loading={enviando} full />
    </View>
  );
}
