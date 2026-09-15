/**
 * Añadir a Favoritos desde la pantalla de análisis.
 *
 * El botón hace una sola cosa al tocarlo: la empresa analizada pasa a
 * Favoritos, y desde ese momento se ve en esa pantalla. Un segundo toque la
 * saca. Nada más entrar consulta `/watchlist/check/{ticker}`, así que nace ya
 * en su estado real en vez de asumir que no está.
 *
 * Debajo, plegado, un panel para fijar objetivo de compra, objetivo de venta y
 * umbral de aviso. No es decoración: la tabla de Favoritos se organiza
 * alrededor de la DISTANCIA al objetivo —«cuánto falta para comprar»— y sin
 * objetivos esa fila nace con dos columnas en guiones. Por eso el panel se
 * abre solo la primera vez que añades algo, y se queda cerrado después.
 *
 * Los objetivos se guardan con PUT sobre el id que devuelve el alta, no en el
 * POST: así el valor entra en Favoritos al instante y rellenar los objetivos
 * nunca puede hacer fracasar el alta.
 *
 * La cabecera `Authorization` va explícita en las cuatro peticiones. Dejarla
 * en `axios.defaults` es lo que hacía que `/portfolio` diera 401 al recargar
 * la página en duro pero no al navegar por el menú: el valor global depende
 * del orden de los efectos.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { toneColors } from '../../theme/tokens';
import { Rule } from '../ui';
import { mensajeDeError } from '../../lib/errores';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

type Estado = 'cargando' | 'fuera' | 'dentro' | 'sin-sesion';

interface Props {
  ticker: string;
  /** Precio actual, para sugerir objetivos con una base y no en vacío. */
  precio?: number | null;
  /** Se avisa al contenedor cuando cambia, por si quiere refrescar algo. */
  onCambio?: (enFavoritos: boolean) => void;
}

/** Número escrito por una persona: coma o punto, vacío = sin valor. */
function leerNumero(txt: string): number | null {
  const t = (txt ?? '').trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export default function BotonFavorito({ ticker, precio, onCambio }: Props) {
  const { colors, palette, space, radius, type, numeric, hairline } = useTheme();
  const { token } = useAuth();

  const [estado, setEstado] = useState<Estado>('cargando');
  const [idFavorito, setIdFavorito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const [compra, setCompra] = useState('');
  const [venta, setVenta] = useState('');
  const [umbral, setUmbral] = useState('');

  const cabecera = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token],
  );

  // ── Estado inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    if (!token) {
      setEstado('sin-sesion');
      return;
    }
    if (!ticker) return;
    setEstado('cargando');
    axios
      .get(`${BACKEND_URL}/api/watchlist/check/${encodeURIComponent(ticker)}`, {
        headers: cabecera,
        timeout: 12000,
      })
      .then((r) => {
        if (!vivo) return;
        const d = r.data ?? {};
        if (d.en_favoritos) {
          setEstado('dentro');
          setIdFavorito(d.id ?? null);
          setCompra(d.target_buy_price != null ? String(d.target_buy_price) : '');
          setVenta(d.target_sell_price != null ? String(d.target_sell_price) : '');
          setUmbral(d.price_change_threshold != null ? String(d.price_change_threshold) : '');
        } else {
          setEstado('fuera');
          setIdFavorito(null);
        }
      })
      .catch(() => {
        // No se pudo comprobar. Se dice, en vez de pintar «no está» —que sería
        // afirmar algo que no sabemos— y dejar que el alta falle por duplicado.
        if (vivo) {
          setEstado('fuera');
          setError('No se pudo comprobar si ya estaba en Favoritos');
        }
      });
    return () => {
      vivo = false;
    };
  }, [ticker, token, cabecera]);

  // ── Alta ──────────────────────────────────────────────────────────────────
  const anadir = useCallback(async () => {
    if (!token || ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      // `price_change_threshold` es `float = 5.0` en el modelo, NO `Optional`.
      // Mandarle null explicito da 422. La clave se omite cuando no hay valor,
      // que es justo lo que un valor por defecto espera recibir: nada.
      const umbralNum = leerNumero(umbral);
      const cuerpo: Record<string, unknown> = {
        ticker,
        target_buy_price: leerNumero(compra),
        target_sell_price: leerNumero(venta),
        notify_on_price_change: false,
        notes: null,
      };
      if (umbralNum != null) cuerpo.price_change_threshold = umbralNum;

      const r = await axios.post(`${BACKEND_URL}/api/watchlist`, cuerpo, {
        headers: cabecera,
        timeout: 20000,
      });
      setEstado('dentro');
      setIdFavorito(r.data?.id ?? null);
      onCambio?.(true);
      // Los objetivos son lo que da sentido a la fila en Favoritos. Si aún no
      // hay ninguno, se abre el panel una vez para ofrecerlos.
      if (!leerNumero(compra) && !leerNumero(venta)) setAbierto(true);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo añadir a Favoritos'));
    } finally {
      setOcupado(false);
    }
  }, [token, ocupado, ticker, compra, venta, umbral, cabecera, onCambio]);

  // ── Baja ──────────────────────────────────────────────────────────────────
  const quitar = useCallback(async () => {
    if (!token || ocupado || !idFavorito) return;
    setOcupado(true);
    setError(null);
    try {
      await axios.delete(`${BACKEND_URL}/api/watchlist/${idFavorito}`, {
        headers: cabecera,
        timeout: 15000,
      });
      setEstado('fuera');
      setIdFavorito(null);
      setAbierto(false);
      onCambio?.(false);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo quitar de Favoritos'));
    } finally {
      setOcupado(false);
    }
  }, [token, ocupado, idFavorito, cabecera, onCambio]);

  // ── Objetivos ─────────────────────────────────────────────────────────────
  const guardarObjetivos = useCallback(async () => {
    if (!token || ocupado || !idFavorito) return;
    setOcupado(true);
    setError(null);
    setGuardado(false);
    try {
      const umbralNum = leerNumero(umbral);
      const cambios: Record<string, unknown> = {
        target_buy_price: leerNumero(compra),
        target_sell_price: leerNumero(venta),
      };
      if (umbralNum != null) cambios.price_change_threshold = umbralNum;

      await axios.put(`${BACKEND_URL}/api/watchlist/${idFavorito}`, cambios, {
        headers: cabecera,
        timeout: 15000,
      });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2600);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudieron guardar los objetivos'));
    } finally {
      setOcupado(false);
    }
  }, [token, ocupado, idFavorito, compra, venta, umbral, cabecera]);

  // Sin sesión no se promete algo que no se puede cumplir.
  if (estado === 'sin-sesion') return null;

  const dentro = estado === 'dentro';
  const tono = toneColors(palette, dentro ? 'accent' : 'neutral');

  const campo = {
    flex: 1,
    minWidth: 96,
    backgroundColor: colors.surfaceSunken,
    borderWidth: hairline,
    borderColor: colors.rule,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    color: colors.ink,
    ...(numeric as object),
    fontSize: 13,
  } as any;

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
        <Pressable
          onPress={dentro ? quitar : anadir}
          disabled={ocupado || estado === 'cargando'}
          accessibilityRole="button"
          accessibilityLabel={dentro ? `Quitar ${ticker} de Favoritos` : `Añadir ${ticker} a Favoritos`}
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              minHeight: 44,
              paddingHorizontal: space.md,
              borderRadius: radius.sm,
              borderWidth: hairline,
              borderColor: dentro ? tono.fg : colors.ruleStrong,
              backgroundColor: dentro ? tono.wash : 'transparent',
              opacity: pressed || ocupado ? 0.7 : 1,
            },
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
          ]}
        >
          {ocupado || estado === 'cargando' ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons
              name={dentro ? 'star' : 'star-outline'}
              size={17}
              color={dentro ? tono.fg : colors.inkMuted}
            />
          )}
          <Text
            style={[
              type.label,
              { color: dentro ? tono.fg : colors.ink, fontWeight: '700' },
            ]}
          >
            {estado === 'cargando' ? 'Comprobando…' : dentro ? 'En Favoritos' : 'Añadir a Favoritos'}
          </Text>
        </Pressable>

        {dentro ? (
          <Pressable
            onPress={() => setAbierto((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={abierto ? 'Ocultar objetivos' : 'Fijar objetivos de precio'}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                minHeight: 44,
                paddingHorizontal: space.sm,
                opacity: pressed ? 0.7 : 1,
              },
              Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
            ]}
          >
            <Ionicons
              name={abierto ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={colors.inkMuted}
            />
            <Text style={[type.label, { color: colors.inkMuted }]}>Objetivos</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={[type.caption, { color: toneColors(palette, 'down').fg }]}>{String(error)}</Text>
      ) : null}

      {dentro && abierto ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: hairline,
            borderColor: colors.rule,
            borderRadius: radius.sm,
            padding: space.sm,
            gap: space.xs,
          }}
        >
          <Text style={[type.caption, { color: colors.inkFaint }]}>
            Favoritos ordena por lo que falta para llegar al objetivo. Sin objetivo, esas dos
            columnas salen en guiones.
            {precio != null && Number.isFinite(Number(precio))
              ? ` Precio actual ${Number(precio).toFixed(2)}.`
              : ''}
          </Text>
          <Rule />
          <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 100, gap: 2 }}>
              <Text style={[type.caption, { color: colors.inkMuted }]}>Compra</Text>
              <TextInput
                value={compra}
                onChangeText={setCompra}
                placeholder="—"
                placeholderTextColor={colors.noSignal}
                keyboardType="decimal-pad"
                inputMode="decimal"
                style={campo}
                accessibilityLabel="Objetivo de compra"
              />
            </View>
            <View style={{ flex: 1, minWidth: 100, gap: 2 }}>
              <Text style={[type.caption, { color: colors.inkMuted }]}>Venta</Text>
              <TextInput
                value={venta}
                onChangeText={setVenta}
                placeholder="—"
                placeholderTextColor={colors.noSignal}
                keyboardType="decimal-pad"
                inputMode="decimal"
                style={campo}
                accessibilityLabel="Objetivo de venta"
              />
            </View>
            <View style={{ flex: 1, minWidth: 100, gap: 2 }}>
              <Text style={[type.caption, { color: colors.inkMuted }]}>Aviso %</Text>
              <TextInput
                value={umbral}
                onChangeText={setUmbral}
                placeholder="—"
                placeholderTextColor={colors.noSignal}
                keyboardType="decimal-pad"
                inputMode="decimal"
                style={campo}
                accessibilityLabel="Umbral de aviso en porcentaje"
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Pressable
              onPress={guardarObjetivos}
              disabled={ocupado}
              accessibilityRole="button"
              style={({ pressed }) => [
                {
                  minHeight: 40,
                  justifyContent: 'center',
                  paddingHorizontal: space.md,
                  borderRadius: radius.sm,
                  backgroundColor: colors.accent,
                  opacity: pressed || ocupado ? 0.7 : 1,
                },
                Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
              ]}
            >
              <Text style={[type.label, { color: colors.inkOnAccent, fontWeight: '700' }]}>
                Guardar objetivos
              </Text>
            </Pressable>
            {guardado ? (
              <Text style={[type.caption, { color: toneColors(palette, 'up').fg }]}>Guardado</Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
