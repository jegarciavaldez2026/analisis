/**
 * ============================================================================
 * Arquitectura de WebSocket del terminal
 * ============================================================================
 * El backend NO expone todavía ningún `/ws`. Este módulo existe para que el
 * día que exista sólo haya que encender la bandera, no rehacer los paneles.
 *
 * Dos decisiones que evitan los dos fallos típicos:
 *
 * 1. **No reconstruir el dashboard por cada tick.** El socket escribe en una
 *    `ref` y el componente se entera a la cadencia que pide, no a la del
 *    mercado. Un panel que renderiza a 20 Hz porque el precio se mueve a 20 Hz
 *    es un panel que come batería para nada: el ojo no lo distingue.
 *
 * 2. **Reconexión con espera creciente y tope.** Reintentar cada 100 ms contra
 *    un backend caído es una denegación de servicio contra uno mismo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { BACKEND_URL } from './api';
import { EstadoConexion } from './tipos';

/**
 * Interruptor único. Mientras esté en `false` no se abre ningún socket y los
 * paneles se quedan con la carga HTTP, que es lo que hay hoy.
 *
 * Nada de `try { new WebSocket(...) } catch`: intentar abrir un socket que no
 * existe llena la consola de errores de red y hace creer que algo va mal.
 */
export const WS_HABILITADO = false;

/** ws:// o wss:// derivado del origen del backend. */
export function urlSocket(ruta: string): string {
  const base = BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!base) return '';
  return `${base.replace(/^http/, 'ws')}/ws${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
}

interface Opciones<T> {
  /** Ruta relativa dentro de /ws, p. ej. `/market/PBF`. */
  ruta: string;
  /** Cadencia máxima de repintado, en ms. 0 = cada mensaje. */
  cadenciaMs?: number;
  /** Traductor del mensaje crudo. Si devuelve `null` el mensaje se descarta. */
  traducir?: (bruto: unknown) => T | null;
  /** Permite apagar un socket concreto sin tocar el interruptor global. */
  activo?: boolean;
}

export interface Suscripcion<T> {
  ultimo: T | null;
  conexion: EstadoConexion;
  latenciaMs: number | null;
  reconectar: () => void;
}

const ESPERA_BASE = 1000;
const ESPERA_MAX = 30000;

export function useSocket<T>({
  ruta,
  cadenciaMs = 250,
  traducir,
  activo = true,
}: Opciones<T>): Suscripcion<T> {
  const [ultimo, setUltimo] = useState<T | null>(null);
  const [conexion, setConexion] = useState<EstadoConexion>(
    WS_HABILITADO && activo ? 'reconectando' : 'desconectado',
  );
  const [latenciaMs, setLatencia] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const pendienteRef = useRef<T | null>(null);
  const intentosRef = useRef(0);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vivoRef = useRef(true);
  const traducirRef = useRef(traducir);
  useEffect(() => {
    traducirRef.current = traducir;
  }, [traducir]);

  /** Vuelca lo pendiente al estado. Aquí es donde se corta el exceso de renders. */
  const volcar = useCallback(() => {
    if (pendienteRef.current !== null) {
      setUltimo(pendienteRef.current);
      pendienteRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!WS_HABILITADO || !activo || cadenciaMs <= 0) return;
    const id = setInterval(volcar, cadenciaMs);
    return () => clearInterval(id);
  }, [activo, cadenciaMs, volcar]);

  const conectar = useCallback(() => {
    if (!WS_HABILITADO || !activo) {
      setConexion('desconectado');
      return;
    }
    const url = urlSocket(ruta);
    if (!url || typeof WebSocket === 'undefined') {
      setConexion('desconectado');
      return;
    }

    setConexion('reconectando');
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      if (!vivoRef.current) return;
      intentosRef.current = 0;
      setConexion('conectado');
    };

    ws.onmessage = (evento) => {
      if (!vivoRef.current) return;
      const recibido = Date.now();
      let bruto: unknown;
      try {
        bruto = JSON.parse(evento.data);
      } catch {
        // Un mensaje ilegible no debe tumbar la suscripción entera.
        return;
      }
      const emitido = (bruto as { ts?: number })?.ts;
      if (typeof emitido === 'number') setLatencia(Math.max(0, recibido - emitido));

      const valor = traducirRef.current ? traducirRef.current(bruto) : (bruto as T);
      if (valor === null || valor === undefined) return;

      if (cadenciaMs <= 0) setUltimo(valor);
      else pendienteRef.current = valor;
    };

    ws.onerror = () => {
      // El cierre viene detrás; la reconexión se gestiona ahí y en un solo sitio.
    };

    ws.onclose = () => {
      // El cierre llega asíncrono: si ya hay otro socket (reconectar, o el
      // efecto se rehízo), éste no puede programar una segunda conexión.
      if (!vivoRef.current || socketRef.current !== ws) return;
      setConexion('desconectado');
      const intento = (intentosRef.current += 1);
      const espera = Math.min(ESPERA_BASE * 2 ** (intento - 1), ESPERA_MAX);
      temporizadorRef.current = setTimeout(conectar, espera);
    };
  }, [activo, cadenciaMs, ruta]);

  useEffect(() => {
    vivoRef.current = true;
    conectar();
    return () => {
      vivoRef.current = false;
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [conectar]);

  const reconectar = useCallback(() => {
    intentosRef.current = 0;
    socketRef.current?.close();
    conectar();
  }, [conectar]);

  return { ultimo, conexion, latenciaMs, reconectar };
}

/* ==========================================================================
 * Suscripciones concretas del dashboard
 * ======================================================================== */

export interface TickMercado {
  simbolo: string;
  precio: number;
  cambio: number;
  cambioPct: number;
  volumen: number | null;
  ts: number;
}

export function useMercadoWS(simbolo: string, activo = true): Suscripcion<TickMercado> {
  return useSocket<TickMercado>({
    ruta: `/market/${simbolo}`,
    cadenciaMs: 250,
    activo,
    traducir: (b: any) =>
      b && typeof b.precio === 'number'
        ? {
            simbolo: String(b.simbolo ?? simbolo),
            precio: b.precio,
            cambio: Number(b.cambio ?? 0),
            cambioPct: Number(b.cambio_pct ?? b.cambioPct ?? 0),
            volumen: b.volumen ?? null,
            ts: Number(b.ts ?? Date.now()),
          }
        : null,
  });
}

/**
 * El libro es el caso que MÁS se beneficia de la cadencia: puede cambiar
 * decenas de veces por segundo y ningún ojo lo sigue. 100 ms es el suelo
 * razonable para que se vea vivo sin quemar el hilo principal.
 */
export function useLibroWS(simbolo: string, activo = true) {
  return useSocket<{ bids: { precio: number; tamano: number }[]; asks: { precio: number; tamano: number }[] }>({
    ruta: `/orderbook/${simbolo}`,
    cadenciaMs: 100,
    activo,
  });
}

export function useRobotWS(activo = true) {
  return useSocket<{ estado: string; score: number; accion: string; ts: number }>({
    ruta: '/robot',
    // El robot decide cada 45 minutos: no hay nada que amortiguar.
    cadenciaMs: 0,
    activo,
  });
}
