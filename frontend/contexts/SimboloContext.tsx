/**
 * Símbolo activo, compartido por todas las pantallas.
 *
 * Antes cada pantalla llevaba el suyo: Estrategia arrancaba en PBF, Overton
 * sólo dejaba elegir entre los valores del historial, y cambiar de una a otra
 * te dejaba mirando dos acciones distintas sin avisar. Eso no es una molestia
 * de navegación, es una forma de equivocarse: se lee la señal del robot para
 * un valor y el desglose de Overton para otro.
 *
 * Con un único símbolo activo, la pregunta «¿qué estoy mirando?» tiene una
 * sola respuesta en toda la aplicación, y cambiarlo en cualquier sitio lo
 * cambia en todos.
 *
 * Se persiste con el mismo patrón que el tema: AsyncStorage en nativo,
 * localStorage en web, y si el almacenamiento falla la app sigue —una
 * preferencia que no se guarda no debe tumbar nada.
 */

import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLAVE = 'finanalysis.simbolo.activo';

/** Valor de partida. Se mantiene el que ya usaba Estrategia. */
export const SIMBOLO_POR_DEFECTO = 'PBF';

interface ContextoSimbolo {
  simbolo: string;
  setSimbolo: (s: string) => void;
  /** `false` hasta que se ha leído la preferencia guardada. */
  listo: boolean;
}

const Contexto = createContext<ContextoSimbolo | undefined>(undefined);

const almacen = {
  async leer(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        return window.localStorage.getItem(CLAVE);
      }
      return await AsyncStorage.getItem(CLAVE);
    } catch {
      return null;
    }
  },
  async escribir(valor: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        window?.localStorage?.setItem(CLAVE, valor);
        return;
      }
      await AsyncStorage.setItem(CLAVE, valor);
    } catch {
      /* sin almacenamiento se pierde la preferencia, nada más */
    }
  },
};

/** Normaliza a lo que aceptan los endpoints: mayúsculas y sin espacios. */
function normalizar(s: string): string {
  return s.trim().toUpperCase();
}

export function SimboloProvider({ children }: { children: ReactNode }) {
  const [simbolo, setEstado] = useState(SIMBOLO_POR_DEFECTO);
  const [listo, setListo] = useState(false);

  // El primer render tiene que coincidir con el del prerenderizado estático,
  // así que se arranca en el valor por defecto y la preferencia se aplica
  // después de montar. Es la misma cautela que en el tema, y por el mismo
  // motivo: la exportación estática hidrata contra el HTML del servidor.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const guardado = await almacen.leer();
      if (!cancelado) {
        if (guardado) setEstado(normalizar(guardado));
        setListo(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const setSimbolo = useCallback((s: string) => {
    const limpio = normalizar(s);
    if (!limpio) return;
    setEstado(limpio);
    void almacen.escribir(limpio);
  }, []);

  const valor = useMemo<ContextoSimbolo>(
    () => ({ simbolo, setSimbolo, listo }),
    [simbolo, setSimbolo, listo],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSimbolo(): ContextoSimbolo {
  const ctx = useContext(Contexto);
  if (ctx === undefined) {
    throw new Error('useSimbolo debe usarse dentro de SimboloProvider');
  }
  return ctx;
}
