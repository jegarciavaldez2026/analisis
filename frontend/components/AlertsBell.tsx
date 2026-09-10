/**
 * Campana de alertas de seguimiento.
 *
 * Vive en la barra superior, junto al conmutador de tema. El distintivo con el
 * número solo aparece cuando hay algo: una campana con un cero permanente deja
 * de leerse a los dos días, y entonces tampoco se lee cuando sí importa.
 *
 * Las alertas vienen de `/watchlist/alerts`, que compara el precio actual con
 * los objetivos que el usuario fijó. Aquí no se calcula nada: si el backend no
 * responde, la campana se queda muda en vez de inventar un estado.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Legend, Rule } from './ui';
import { toneColors } from '../theme/tokens';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

interface Alerta {
  ticker: string;
  company_name?: string;
  type?: string;
  message?: string;
  current_price?: number | null;
}

export default function AlertsBell() {
  const { colors, palette, space, type, radius, hairline, numeric } = useTheme();
  const { token } = useAuth() as any;
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) { setAlertas([]); return; }
    try {
      const res = await axios.get(`${BACKEND_URL}/api/watchlist/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlertas(res.data?.alerts || []);
    } catch {
      // Sin sesión o sin conexión: la campana no dice nada, que es lo correcto.
      setAlertas([]);
    }
  }, [token]);

  useEffect(() => {
    cargar();
    // Los objetivos de precio no cambian por segundos; cada cinco minutos basta
    // y evita machacar el proveedor.
    const t = setInterval(cargar, 300_000);
    return () => clearInterval(t);
  }, [cargar]);

  const total = alertas.length;

  const tono = (tipo?: string) => {
    const t = (tipo || '').toLowerCase();
    if (t.includes('buy') || t.includes('compra')) return palette.up;
    if (t.includes('sell') || t.includes('venta')) return palette.down;
    return palette.caution;
  };

  return (
    <>
      <Pressable
        onPress={() => { setAbierto(true); cargar(); }}
        accessibilityRole="button"
        accessibilityLabel={total ? `${total} alertas de seguimiento` : 'Alertas de seguimiento'}
        style={({ pressed }) => [
          { padding: 8, borderRadius: radius.sm, opacity: pressed ? 0.6 : 1 },
          Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
        ]}
      >
        <Ionicons name={total ? 'notifications' : 'notifications-outline'} size={20}
                  color={total ? colors.accent : colors.inkMuted} />
        {total > 0 ? (
          <View style={{
            position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16,
            paddingHorizontal: 3, borderRadius: 8, backgroundColor: palette.down,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: colors.inkOnAccent }}>
              {total > 9 ? '9+' : total}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable
          onPress={() => setAbierto(false)}
          style={{ flex: 1, backgroundColor: palette.shadow, justifyContent: 'flex-start', alignItems: 'flex-end' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              marginTop: 56, marginRight: 16, width: 340, maxWidth: '92%', maxHeight: '75%',
              backgroundColor: colors.surfaceRaised, borderRadius: radius.md,
              borderWidth: hairline, borderColor: colors.ruleStrong, overflow: 'hidden',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                           paddingHorizontal: space.lg, paddingVertical: space.md }}>
              <View>
                <Text style={[type.title3, { color: colors.ink }]}>Alertas</Text>
                <Legend>{total === 0 ? 'Sin avisos' : `${total} ${total === 1 ? 'aviso' : 'avisos'}`}</Legend>
              </View>
              <Pressable onPress={() => setAbierto(false)} accessibilityLabel="Cerrar"
                         style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.6 : 1 },
                           Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null]}>
                <Ionicons name="close" size={18} color={colors.inkMuted} />
              </Pressable>
            </View>
            <Rule />

            {total === 0 ? (
              <View style={{ padding: space.xl, alignItems: 'center', gap: 6 }}>
                <Ionicons name="checkmark-circle-outline" size={30} color={colors.inkFaint} />
                <Text style={[type.caption, { color: colors.inkMuted, textAlign: 'center' }]}>
                  Ningún valor de tu seguimiento ha alcanzado su objetivo.
                </Text>
                <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0, textAlign: 'center' }]}>
                  Fija precios objetivo en Favoritos para recibir avisos aquí.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {alertas.map((a, i) => {
                  const c = tono(a.type);
                  return (
                    <View key={`${a.ticker}-${i}`}>
                      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start',
                                     paddingHorizontal: space.lg, paddingVertical: space.md }}>
                        <View style={{ width: 3, height: 34, backgroundColor: c, marginTop: 2 }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[type.label, numeric, { color: colors.ink }]}>{a.ticker}</Text>
                          {a.company_name ? (
                            <Text style={[type.legend, { color: colors.inkFaint, letterSpacing: 0 }]}
                                  numberOfLines={1}>
                              {a.company_name}
                            </Text>
                          ) : null}
                          <Text style={[type.caption, { color: colors.inkMuted, marginTop: 3, lineHeight: 17 }]}>
                            {a.message || 'Objetivo alcanzado.'}
                          </Text>
                        </View>
                        {a.current_price != null ? (
                          <Text style={[type.bodyStrong, numeric, { color: c }]}>
                            ${Number(a.current_price).toFixed(2)}
                          </Text>
                        ) : null}
                      </View>
                      {i < alertas.length - 1 ? <Rule /> : null}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
