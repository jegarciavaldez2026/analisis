/**
 * ============================================================================
 * Estado del trading simulado
 * ============================================================================
 * El único dueño del estado de la simulación. Los componentes leen de aquí y
 * llaman a las acciones; no guardan copias ni derivan cifras propias.
 *
 * --------------------------------------------------------------------------
 * «TIEMPO REAL» AQUÍ SIGNIFICA SONDEO, Y SE DICE
 * --------------------------------------------------------------------------
 * No hay websocket: `WS_HABILITADO` sigue en `false` y el backend no expone
 * `/ws`. Las tarjetas se refrescan con dos cadencias distintas, y la
 * separación no es un capricho:
 *
 *   · **Datos del mercado: 20 s.** `/price` está cacheado 60 s en el servidor
 *     y Yahoo llega con ~15 min de retraso. Pedirlo cada segundo devolvería el
 *     mismo número: movimiento en pantalla sin dato nuevo detrás, que es peor
 *     que no moverse.
 *   · **El reloj de «tiempo abierto»: 1 s, en cliente.** No cuesta ninguna
 *     petición y es lo único que de verdad cambia cada segundo.
 *
 * Y se para cuando la pestaña no está a la vista. Sondear una pantalla que
 * nadie mira gasta cuota del proveedor para nada, y este proyecto ya se quedó
 * sin ella una vez.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  cancelarOrden,
  cerrarPosicion,
  crearOrden,
  evaluarRobot,
  fijarRobot,
  guardarParametros,
  leerDecisiones,
  leerEstado,
  mensajeSim,
  moverNiveles,
  reiniciarCuenta,
} from './api';
import {
  BoletaManual,
  DecisionGuardada,
  DecisionSim,
  EstadoSimulacion,
  MarcoSim,
  ModoOperacion,
  ParametrosSim,
  RespuestaOrden,
} from './tipos';

/** Cada cuánto se vuelve a pedir el estado. Ver la cabecera: no bajarlo. */
export const CADENCIA_SIM_S = 20;

/**
 * Cadencia del robot: 45 minutos. Es la constante de producto que ya usa
 * `useEstrategia`, y no se duplica el número por casualidad — el robot decide
 * a esa frecuencia, y por eso la profundidad de libro de diez niveles no se
 * compró: habría cambiado por completo varias veces antes de usarse.
 *
 * La deduplicación NO depende de este reloj. Depende del `signal_id`, que
 * lleva dentro el timestamp de la BARRA: aunque este temporizador se
 * desajustara, no se abriría una segunda operación sobre la misma vela.
 */
export const CADENCIA_ROBOT_SIM_S = 45 * 60;

export interface UsoSimulacion {
  estado: EstadoSimulacion | null;
  cargando: boolean;
  refrescando: boolean;
  error: string | null;

  modo: ModoOperacion;
  setModo: (m: ModoOperacion) => void;
  marco: MarcoSim;
  setMarco: (m: MarcoSim) => void;

  /** Segundos hasta el próximo sondeo. Se para con la pestaña oculta. */
  segundosParaRefresco: number;
  /** Segundos hasta la próxima vuelta del robot. `null` si está apagado. */
  segundosParaRobot: number | null;
  /** Ahora en epoch, a 1 Hz. Alimenta el reloj «tiempo abierto» sin peticiones. */
  ahora: number;

  recargar: () => void;
  enviarOrden: (b: BoletaManual) => Promise<RespuestaOrden | null>;
  anularOrden: (id: string) => Promise<void>;
  cerrar: (id: string) => Promise<string | null>;
  ajustarNiveles: (id: string, n: { stop_loss?: number | null; take_profit?: number | null }) => Promise<string | null>;
  ajustarParametros: (p: Partial<ParametrosSim>) => Promise<void>;
  reiniciar: (capital: number) => Promise<string | null>;

  conmutarRobot: (activo: boolean) => Promise<void>;
  /** Fuerza una vuelta del robot sin esperar a la cadencia. */
  evaluarAhora: () => Promise<void>;
  robotPensando: boolean;
  /** La última decisión, opere o no. Es lo que dibuja el registro. */
  ultimaDecision: DecisionSim | null;
  decisiones: DecisionGuardada[];
  recargarDecisiones: () => void;
}

export function useSimulacion(
  token: string | null,
  simbolo: string,
  robotCapitalPct: number,
  robotRiesgoPct: number,
): UsoSimulacion {
  const [estado, setEstado] = useState<EstadoSimulacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoOperacion>('manual');
  const [marco, setMarco] = useState<MarcoSim>('1d');
  const [segundosParaRefresco, setSegundos] = useState(CADENCIA_SIM_S);
  const [segundosParaRobot, setSegundosRobot] = useState<number | null>(null);
  /**
   * Reloj de pared, a 1 Hz.
   *
   * Arranca en **0**, no en `Date.now()`, y es deliberado: leer la hora
   * DURANTE el render rompe la hidratación (React #418). La exportación
   * estática prerrenderiza con una hora y el cliente monta con otra, así que
   * el HTML servido y el primer render del cliente no coinciden y React tira
   * la página entera. Este proyecto ya lo sufrió con el tema en
   * `OvertonSignalMatrix_v4` y la salida fue la misma: hacerlo en un
   * `useEffect`, nunca en el render.
   *
   * Mientras vale 0, quien lo consume usa la duración que ya trae el servidor.
   */
  const [ahora, setAhora] = useState(0);
  const [robotPensando, setPensando] = useState(false);
  const [ultimaDecision, setUltimaDecision] = useState<DecisionSim | null>(null);
  const [decisiones, setDecisiones] = useState<DecisionGuardada[]>([]);

  const peticionRef = useRef(0);
  const enVueloRef = useRef(false);

  const robotActivo = estado?.robot?.activo ?? false;

  /* ------------------------------------------------------------------
   * Carga
   * ---------------------------------------------------------------- */

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!token) {
        setCargando(false);
        setError('Hace falta iniciar sesión: la cuenta simulada es de cada usuario.');
        return;
      }
      const id = (peticionRef.current += 1);
      enVueloRef.current = true;
      if (silencioso) setRefrescando(true);
      else setCargando(true);

      try {
        const datos = await leerEstado(token, simbolo, marco);
        if (id !== peticionRef.current) return;
        setEstado(datos);
        setError(null);
      } catch (e) {
        if (id !== peticionRef.current) return;
        /**
         * Un sondeo fallido NO borra la pantalla.
         *
         * El proveedor da tropiezos —límite de peticiones, un 500 suelto— y
         * vaciar las tarjetas de posiciones abiertas por eso se lee como «se
         * han cerrado mis operaciones», que es exactamente la lectura que no
         * puede permitirse una pantalla de trading. Se conserva la lectura
         * anterior y se avisa.
         */
        setError(mensajeSim(e));
      } finally {
        if (id === peticionRef.current) {
          setCargando(false);
          setRefrescando(false);
          setSegundos(CADENCIA_SIM_S);
        }
        enVueloRef.current = false;
      }
    },
    [token, simbolo, marco],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /* ------------------------------------------------------------------
   * Relojes
   * ---------------------------------------------------------------- */

  /** 1 Hz, sin peticiones: es lo que mueve «Tiempo abierto 00:18:32». */
  useEffect(() => {
    setAhora(Math.floor(Date.now() / 1000)); // la primera lectura, ya en cliente
    const id = setInterval(() => setAhora(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  /** Cuenta atrás del sondeo. Se congela con la pestaña oculta. */
  useEffect(() => {
    const visible = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const id = setInterval(() => {
      if (!visible()) return;
      setSegundos((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (segundosParaRefresco > 0) return;
    if (cargando || refrescando || enVueloRef.current) {
      setSegundos(5); // reintento corto, sin encadenar peticiones
      return;
    }
    void cargar(true);
  }, [segundosParaRefresco, cargando, refrescando, cargar]);

  /* ------------------------------------------------------------------
   * Robot
   * ---------------------------------------------------------------- */

  const evaluarAhora = useCallback(async () => {
    if (!token) return;
    setPensando(true);
    try {
      const r = await evaluarRobot(token, simbolo, marco);
      setUltimaDecision(r.decision ?? null);
      // Si abrió algo, la cuenta ha cambiado: se recarga sin vaciar la pantalla.
      if (r.ok) await cargar(true);
    } catch (e) {
      setError(mensajeSim(e));
    } finally {
      setPensando(false);
      setSegundosRobot(CADENCIA_ROBOT_SIM_S);
    }
  }, [token, simbolo, marco, cargar]);

  /**
   * Cuenta atrás del robot.
   *
   * Con el robot apagado no corre y vale `null`, que la interfaz dibuja como
   * hueco. Un contador corriendo junto a un interruptor en OFF haría creer que
   * algo se va a disparar.
   */
  useEffect(() => {
    if (!robotActivo) {
      setSegundosRobot(null);
      return;
    }
    setSegundosRobot((s) => s ?? CADENCIA_ROBOT_SIM_S);
    const visible = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const id = setInterval(() => {
      if (!visible()) return;
      setSegundosRobot((s) => (s === null ? CADENCIA_ROBOT_SIM_S : s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [robotActivo]);

  useEffect(() => {
    if (!robotActivo || segundosParaRobot === null || segundosParaRobot > 0) return;
    if (robotPensando) return;
    void evaluarAhora();
  }, [robotActivo, segundosParaRobot, robotPensando, evaluarAhora]);

  const recargarDecisiones = useCallback(() => {
    if (!token) return;
    void leerDecisiones(token, 50)
      .then(setDecisiones)
      .catch(() => setDecisiones([]));
  }, [token]);

  useEffect(() => {
    recargarDecisiones();
  }, [recargarDecisiones, ultimaDecision]);

  /* ------------------------------------------------------------------
   * Acciones
   * ---------------------------------------------------------------- */

  const enviarOrden = useCallback(
    async (boleta: BoletaManual): Promise<RespuestaOrden | null> => {
      if (!token) return null;
      try {
        const r = await crearOrden(token, boleta);
        await cargar(true);
        return r;
      } catch (e) {
        setError(mensajeSim(e));
        return null;
      }
    },
    [token, cargar],
  );

  const anularOrden = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        await cancelarOrden(token, id);
        await cargar(true);
      } catch (e) {
        setError(mensajeSim(e));
      }
    },
    [token, cargar],
  );

  const cerrar = useCallback(
    async (id: string): Promise<string | null> => {
      if (!token) return null;
      try {
        const r = await cerrarPosicion(token, id);
        await cargar(true);
        return r.ok ? null : r.motivo ?? null;
      } catch (e) {
        const m = mensajeSim(e);
        setError(m);
        return m;
      }
    },
    [token, cargar],
  );

  const ajustarNiveles = useCallback(
    async (id: string, niveles: { stop_loss?: number | null; take_profit?: number | null }) => {
      if (!token) return null;
      try {
        await moverNiveles(token, id, niveles);
        await cargar(true);
        return null;
      } catch (e) {
        return mensajeSim(e);
      }
    },
    [token, cargar],
  );

  const ajustarParametros = useCallback(
    async (p: Partial<ParametrosSim>) => {
      if (!token) return;
      try {
        await guardarParametros(token, p);
        await cargar(true);
      } catch (e) {
        setError(mensajeSim(e));
      }
    },
    [token, cargar],
  );

  const reiniciar = useCallback(
    async (capital: number) => {
      if (!token) return null;
      try {
        const r = await reiniciarCuenta(token, capital);
        setUltimaDecision(null);
        await cargar();
        return r.nota;
      } catch (e) {
        const m = mensajeSim(e);
        setError(m);
        return m;
      }
    },
    [token, cargar],
  );

  const conmutarRobot = useCallback(
    async (activo: boolean) => {
      if (!token) return;
      try {
        await fijarRobot(token, {
          activo,
          simbolo,
          marco,
          capital_pct: robotCapitalPct,
          riesgo_pct: robotRiesgoPct,
        });
        await cargar(true);
        // Al encender se evalúa una vez enseguida: esperar 45 minutos para ver
        // si el robot hace algo convierte el interruptor en un acto de fe.
        if (activo) await evaluarAhora();
      } catch (e) {
        setError(mensajeSim(e));
      }
    },
    [token, simbolo, marco, robotCapitalPct, robotRiesgoPct, cargar, evaluarAhora],
  );

  return useMemo(
    () => ({
      estado,
      cargando,
      refrescando,
      error,
      modo,
      setModo,
      marco,
      setMarco,
      segundosParaRefresco,
      segundosParaRobot,
      ahora,
      recargar: () => void cargar(),
      enviarOrden,
      anularOrden,
      cerrar,
      ajustarNiveles,
      ajustarParametros,
      reiniciar,
      conmutarRobot,
      evaluarAhora,
      robotPensando,
      ultimaDecision,
      decisiones,
      recargarDecisiones,
    }),
    [
      estado, cargando, refrescando, error, modo, marco, segundosParaRefresco,
      segundosParaRobot, ahora, cargar, enviarOrden, anularOrden, cerrar,
      ajustarNiveles, ajustarParametros, reiniciar, conmutarRobot, evaluarAhora,
      robotPensando, ultimaDecision, decisiones, recargarDecisiones,
    ],
  );
}
