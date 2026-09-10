/**
 * ============================================================================
 * Hook de datos del terminal
 * ============================================================================
 * Una sola carga coordinada para todo el dashboard. Las llamadas van en
 * paralelo (`allSettled`) porque un panel que falla no puede dejar en blanco
 * a los otros doce: cada bloque lleva su propio estado y su propio motivo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  aEventosValor,
  aIchimoku,
  aLibro,
  aLiquidez,
  aMercado,
  aNoticias,
  aPlan,
  aSenal,
  aTecnico,
  aVolatilidad,
  aVolumeDelta,
  aWyckoff,
  leerCartera,
  leerComparativa,
  leerEvolucion,
  leerMTF,
  leerBacktest,
  leerOperaciones,
  leerOverton,
  leerSerie,
  leerSerieIntradia,
  esIntradia,
  leerTecnicoAmpliado,
  mensajeError,
  RespuestaMTF,
  sinFuente,
} from './api';
import {
  Alerta,
  Bloque,
  ControlesRobot,
  EstadoDashboard,
  Marco,
  Telemetria,
} from './tipos';

/** Marco por defecto: el diario es el único con serie completa y fiable. */
export const MARCO_INICIAL: Marco = '1D';

/** El robot decide cada 45 minutos. Es una constante de producto, no de UI. */
export const CADENCIA_ROBOT_S = 45 * 60;

/**
 * Cada cuánto se refresca la pantalla sola: cinco minutos.
 *
 * No es un número redondo elegido a ojo, es EXACTAMENTE la vigencia de la
 * caché de `/overton` en el backend. Refrescar más a menudo devolvería la
 * misma respuesta cacheada —movimiento en la pantalla sin dato nuevo detrás,
 * que es peor que no moverse— y refrescar mucho más tarde desaprovecha un
 * cálculo que ya ha caducado. Si cambia el TTL del backend, cambia esto.
 */
export const CADENCIA_REFRESCO_S = 5 * 60;

const vacio = <T,>(nota: string): Bloque<T> => sinFuente<T>(nota);

function estadoInicial(simbolo: string): EstadoDashboard {
  const pendiente = 'Cargando…';
  return {
    estado: 'cargando',
    error: null,
    simbolo,
    mercado: vacio(pendiente),
    libro: vacio(pendiente),
    liquidez: vacio(pendiente),
    comparativa: vacio(pendiente),
    wyckoff: vacio(pendiente),
    serie: vacio(pendiente),
    volumeDelta: vacio(pendiente),
    senal: vacio(pendiente),
    posicion: vacio(pendiente),
    tecnico: vacio(pendiente),
    ichimoku: vacio(pendiente),
    volatilidad: vacio(pendiente),
    resumen: vacio(pendiente),
    curva: vacio(pendiente),
    backtest: vacio('Sin ejecutar. Pulsa «Ejecutar backtest».'),
    tecnicoAmpliado: vacio(pendiente),
    ordenes: vacio(pendiente),
    operaciones: vacio(pendiente),
    eventos: vacio(pendiente),
    noticias: vacio(pendiente),
    alertas: vacio(pendiente),
  };
}

/**
 * Alertas derivadas de lecturas reales. No hay motor de alertas en el backend,
 * así que aquí se construyen a partir de lo que ya se ha medido: si no hay
 * medida, no hay alerta. Nada de avisos decorativos.
 */
function derivarAlertas(estado: EstadoDashboard): Bloque<Alerta[]> {
  const alertas: Alerta[] = [];

  const vol = estado.volatilidad.datos;
  if (vol) {
    const atr = vol.filas.find((f) => f.etiqueta === 'ATR');
    if (typeof atr?.valor === 'number' && atr.valor > 4) {
      alertas.push({
        tono: 'caution',
        titulo: 'Volatilidad alta detectada',
        detalle: `${estado.simbolo} · ATR ${atr.valor.toFixed(2)} %`,
        cuando: 'Ahora',
      });
    }
  }

  const senal = estado.senal.datos;
  if (senal && (senal.score100 >= 65 || senal.score100 <= 35)) {
    alertas.push({
      tono: senal.score100 >= 65 ? 'up' : 'down',
      titulo: `Señal ${senal.accionEs}`,
      detalle: `Score ${senal.score100.toFixed(1)} / 100 · ${senal.sesgo}`,
      cuando: 'Ahora',
    });
  }

  // Evento del valor a menos de cuatro días. La cercanía es el criterio
  // porque es lo único que el backend mide: no viene nivel de impacto.
  const proximo = estado.eventos.datos?.find((e) => e.dias !== null && e.dias <= 4);
  if (proximo) {
    alertas.push({
      tono: 'caution',
      titulo: `Evento próximo: ${proximo.evento}`,
      detalle: proximo.detalle || proximo.fecha,
      cuando: proximo.dias === 0 ? 'Hoy' : `En ${proximo.dias} d`,
    });
  }

  if (!alertas.length) {
    return sinFuente('Sin alertas: ninguna lectura ha cruzado un umbral.');
  }
  return { datos: alertas, procedencia: 'real', actualizado: new Date().toISOString() };
}

export interface UsoEstrategia {
  estado: EstadoDashboard;
  mtf: RespuestaMTF | null;
  marco: Marco;
  setMarco: (m: Marco) => void;
  rango: string;
  setRango: (r: string) => void;
  simbolo: string;
  setSimbolo: (s: string) => void;
  recargar: () => void;
  cargando: boolean;
  /** Recarga automática en vuelo. La pantalla NO se vacía mientras dura. */
  refrescando: boolean;
  autoRefresco: boolean;
  setAutoRefresco: (v: boolean) => void;
  /** Segundos hasta el próximo refresco automático. */
  segundosParaRefresco: number;
  /** Último refresco automático fallido. La lectura anterior sigue en pantalla. */
  falloRefresco: string | null;
  telemetria: Telemetria;
  controles: ControlesRobot;
  setControles: (c: Partial<ControlesRobot>) => void;
  /** Segundos hasta la próxima evaluación del robot. */
  proximaDecisionS: number;
  ejecutarBacktest: (opciones?: {
    period?: string;
    comision_pct?: number;
    deslizamiento_pct?: number;
  }) => Promise<void>;
  ejecutandoBacktest: boolean;
}

export function useEstrategia(
  simboloInicial: string,
  token: string | null,
): UsoEstrategia {
  const [simbolo, setSimbolo] = useState(simboloInicial.toUpperCase());
  const [marco, setMarco] = useState<Marco>(MARCO_INICIAL);
  /**
   * Rango de histórico que se pide al backend. Es independiente del marco: el
   * marco reagrupa en cliente y no necesita otra petición, así que cambiar de
   * diario a semanal es instantáneo.
   */
  const [rango, setRango] = useState<string>('1y');
  const [estado, setEstado] = useState<EstadoDashboard>(() => estadoInicial(simboloInicial));
  const [mtf, setMTF] = useState<RespuestaMTF | null>(null);
  const [cargando, setCargando] = useState(true);
  /** Recarga automática en curso: los paneles siguen enseñando lo anterior. */
  const [refrescando, setRefrescando] = useState(false);
  const [autoRefresco, setAutoRefresco] = useState(true);
  const [segundosParaRefresco, setSegundosParaRefresco] = useState(CADENCIA_REFRESCO_S);
  /** Motivo del último refresco fallido, si lo hubo. No borra la pantalla. */
  const [falloRefresco, setFalloRefresco] = useState<string | null>(null);
  const [ultimoAnalisis, setUltimoAnalisis] = useState<string | null>(null);
  const [proximaDecisionS, setProxima] = useState(CADENCIA_ROBOT_S);

  const [controles, setControlesEstado] = useState<ControlesRobot>({
    modo: 'manual',
    capitalPct: 25,
    riesgoPct: 0.5,
    stopLossPct: 2,
    takeProfitPct: 2.5,
    maxPosiciones: 5,
    // Por defecto: MANUAL, PAPER, AUTO OFF, LIVE OFF. Regla del producto.
    estado: 'detenido',
  });

  const setControles = useCallback((parcial: Partial<ControlesRobot>) => {
    setControlesEstado((prev) => ({ ...prev, ...parcial }));
  }, []);

  const peticionRef = useRef(0);

  /**
   * Carga de datos.
   *
   * `silencioso` es lo que separa una recarga automática de una manual. La
   * manual vacía los paneles a esqueletos, que es correcto: has pedido datos
   * nuevos y ver el hueco confirma que se están trayendo. La automática NO
   * puede hacerlo — dejaría el dashboard en blanco cada cinco minutos sin que
   * nadie lo haya pedido, y eso no se lee como «actualizando», se lee como
   * «se ha roto». En silencio los paneles siguen enseñando la lectura anterior
   * hasta que llega la nueva, y sólo entonces cambian.
   */
  const cargar = useCallback(async (silencioso = false) => {
    const id = (peticionRef.current += 1);
    if (silencioso) {
      setRefrescando(true);
    } else {
      setCargando(true);
      setEstado(estadoInicial(simbolo));
    }

    const [overton, mtfRes, serie, cartera, evolucion, transacciones, comparativa] =
      await Promise.allSettled([
        leerOverton(simbolo),
        leerMTF(simbolo),
        leerSerie(simbolo, rango),
        leerCartera(token),
        leerEvolucion(token),
        leerOperaciones(token),
        // Va en el MISMO lote: el endpoint está cacheado diez minutos en el
        // backend, así que repetir pantalla no vuelve a tocar al proveedor.
        leerComparativa(simbolo),
      ]);

    // Una respuesta de una petición vieja no puede pisar a la nueva.
    if (id !== peticionRef.current) return;

    /**
     * En silencio, un fallo de /overton NO borra la pantalla.
     *
     * Si el proveedor da un tropiezo —y da: límite de peticiones, un 500
     * suelto— la recarga automática dejaría quince paneles en «sin fuente»
     * por un fallo pasajero que nadie ha provocado. Se conserva la lectura
     * anterior y se vuelve a intentar en el siguiente ciclo. Una recarga
     * MANUAL sí muestra el error: ahí el usuario ha pedido saber qué pasa.
     */
    if (silencioso && overton.status !== 'fulfilled') {
      setRefrescando(false);
      setFalloRefresco(mensajeError(overton.reason));
      return;
    }
    setFalloRefresco(null);

    let siguiente = estadoInicial(simbolo);

    if (overton.status === 'fulfilled') {
      const o = overton.value;
      siguiente = {
        ...siguiente,
        estado: 'listo',
        mercado: aMercado(o),
        libro: aLibro(o),
        liquidez: aLiquidez(o),
        senal: aSenal(o),
        posicion: aPlan(o),
        tecnico: aTecnico(o),
        ichimoku: aIchimoku(o),
        volatilidad: aVolatilidad(o),
        wyckoff: aWyckoff(o),
        noticias: aNoticias(o),
        eventos: aEventosValor(o),
      };
      setUltimoAnalisis(new Date().toISOString());
      setProxima(CADENCIA_ROBOT_S);

      // El técnico ampliado necesita la respuesta de /overton ya resuelta
      // (VWAP, POC, Coppock, Ichimoku), así que va después y no en el lote.
      leerTecnicoAmpliado(simbolo, o).then((bloque) => {
        if (id === peticionRef.current) {
          setEstado((prev) => ({ ...prev, tecnicoAmpliado: bloque }));
        }
      });
    } else {
      const motivo = mensajeError(overton.reason);
      siguiente = {
        ...siguiente,
        estado: 'error',
        error: motivo,
        mercado: sinFuente(motivo),
        senal: sinFuente(motivo),
        tecnico: sinFuente(motivo),
        ichimoku: sinFuente(motivo),
        volatilidad: sinFuente(motivo),
        wyckoff: sinFuente(motivo),
        noticias: sinFuente(motivo),
        eventos: sinFuente(motivo),
        posicion: sinFuente(motivo),
        tecnicoAmpliado: sinFuente(motivo),
        libro: aLibro({}),
        liquidez: sinFuente(motivo),
      };
    }

    if (mtfRes.status === 'fulfilled') {
      setMTF(mtfRes.value);
      siguiente.volumeDelta = aVolumeDelta(mtfRes.value);
    } else {
      setMTF(null);
      siguiente.volumeDelta = sinFuente(mensajeError(mtfRes.reason));
    }

    siguiente.serie =
      serie.status === 'fulfilled' ? serie.value : sinFuente(mensajeError(serie.reason));
    siguiente.comparativa =
      comparativa.status === 'fulfilled'
        ? comparativa.value
        : sinFuente(mensajeError(comparativa.reason));
    siguiente.resumen =
      cartera.status === 'fulfilled' ? cartera.value : sinFuente(mensajeError(cartera.reason));
    siguiente.curva =
      evolucion.status === 'fulfilled' ? evolucion.value : sinFuente(mensajeError(evolucion.reason));
    if (transacciones.status === 'fulfilled') {
      siguiente.ordenes = transacciones.value.ordenes;
      siguiente.operaciones = transacciones.value.estadisticas;
      // Las métricas de operaciones cerradas viven en el resumen para que la
      // franja de KPIs no tenga que conocer dos orígenes distintos.
      const s = transacciones.value.estadisticas.datos;
      if (s && siguiente.resumen.datos) {
        siguiente.resumen = {
          ...siguiente.resumen,
          datos: {
            ...siguiente.resumen.datos,
            winRate: s.winRate,
            profitFactor: s.profitFactor,
            expectativa: s.expectativa,
            operaciones: s.operaciones,
          },
        };
      }
    } else {
      const motivo = mensajeError(transacciones.reason);
      siguiente.ordenes = sinFuente(motivo);
      siguiente.operaciones = sinFuente(motivo);
    }

    siguiente.alertas = derivarAlertas(siguiente);

    setEstado(siguiente);
    setCargando(false);
    setRefrescando(false);
    setSegundosParaRefresco(CADENCIA_REFRESCO_S);
    // El marco NO entra aquí: reagrupar es cosa del cliente y volver a pedir
    // la misma serie para verla en semanas sería una ida y vuelta gratis.
  }, [simbolo, rango, token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Serie intradía.
   *
   * Va en su propio efecto y NO en el lote de `cargar()` porque depende del
   * marco, que se cambia con un botón: recargar los quince paneles enteros
   * cada vez que alguien pasa de 5m a 15m sería tirar seis peticiones para
   * repintar un gráfico. Los marcos diarios siguen reagrupando en cliente,
   * que es instantáneo y no pide nada.
   */
  const marcoPrevio = useRef(marco);
  useEffect(() => {
    const eraIntradia = esIntradia(marcoPrevio.current);
    const esAhora = esIntradia(marco);
    marcoPrevio.current = marco;

    // Al VOLVER de intradía a un marco diario hay que recuperar la serie
    // diaria: si no, 1D seguiría pintando las velas de cinco minutos que
    // quedaron en `serie`, y con otro rótulo encima.
    if (!esAhora) {
      if (!eraIntradia) return;
      let vivo = true;
      void leerSerie(simbolo, rango).then((bloque) => {
        if (vivo) setEstado((prev) => ({ ...prev, serie: bloque }));
      });
      return () => {
        vivo = false;
      };
    }

    let vivo = true;
    setEstado((prev) => ({ ...prev, serie: { datos: null, procedencia: 'real', nota: 'Cargando…' } }));
    void leerSerieIntradia(simbolo, marco).then((bloque) => {
      if (vivo) setEstado((prev) => ({ ...prev, serie: bloque }));
    });
    return () => {
      vivo = false;
    };
  }, [marco, simbolo, rango]);

  /* ------------------------------------------------------------------
   * Recarga automática
   * ---------------------------------------------------------------- */

  /**
   * Cuenta atrás. Se para cuando la pestaña no está a la vista.
   *
   * Refrescar una pestaña que nadie mira gasta cuota del proveedor para nada,
   * y este proyecto ya se quedó sin ella una vez. `visibilitychange` reanuda
   * la cuenta al volver.
   */
  useEffect(() => {
    if (!autoRefresco) return;

    const visible = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const id = setInterval(() => {
      if (!visible()) return;
      setSegundosParaRefresco((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);

    const alVolver = () => setSegundosParaRefresco((s) => s);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', alVolver);
    }
    return () => {
      clearInterval(id);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', alVolver);
      }
    };
  }, [autoRefresco]);

  /**
   * Al llegar a cero, recarga en silencio.
   *
   * Se comprueba que no haya ya una petición en vuelo: si la anterior tarda
   * más que el ciclo, encadenar otra sólo añade carga sobre un backend que ya
   * va justo.
   */
  useEffect(() => {
    if (!autoRefresco || segundosParaRefresco > 0) return;
    if (cargando || refrescando) {
      setSegundosParaRefresco(15); // reintento corto, sin encadenar peticiones
      return;
    }
    void cargar(true);
  }, [autoRefresco, segundosParaRefresco, cargando, refrescando, cargar]);

  /** Cuenta atrás del robot. Un segundo de intervalo, sin acumular deriva. */
  useEffect(() => {
    if (controles.estado !== 'activo') return;
    const id = setInterval(() => {
      setProxima((s) => (s <= 1 ? CADENCIA_ROBOT_S : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [controles.estado]);

  /**
   * Backtest a petición.
   *
   * NO se lanza en la carga inicial y es deliberado: recorre dos años de
   * barras y descarga su propio histórico, así que arrancarlo solo haría que
   * cada visita a la pantalla pagara varios segundos por un panel que puede
   * que nadie mire. Se ejecuta cuando alguien lo pide.
   */
  const [ejecutandoBacktest, setEjecutando] = useState(false);

  const ejecutarBacktest = useCallback(
    async (opciones: { period?: string; comision_pct?: number; deslizamiento_pct?: number } = {}) => {
      setEjecutando(true);
      setEstado((prev) => ({
        ...prev,
        backtest: { datos: null, procedencia: 'real', nota: 'Ejecutando…' },
      }));
      const bloque = await leerBacktest(simbolo, opciones);
      setEstado((prev) => ({ ...prev, backtest: bloque }));
      setEjecutando(false);
    },
    [simbolo],
  );

  const telemetria = useMemo<Telemetria>(
    () => ({
      // Sin socket abierto la conexión honesta es «desconectado», no un
      // punto verde que finge tiempo real sobre peticiones HTTP.
      conexion: estado.estado === 'error' ? 'desconectado' : 'conectado',
      latenciaMs: null,
      fuenteDatos: 'Yahoo Finance (diferido)',
      broker: 'Sin bróker conectado',
      ultimoTick: null,
      ultimoAnalisis,
      robot: controles.estado,
    }),
    [estado.estado, ultimoAnalisis, controles.estado],
  );

  return {
    estado,
    mtf,
    marco,
    setMarco,
    rango,
    setRango,
    simbolo,
    setSimbolo: (s: string) => setSimbolo(s.toUpperCase().trim()),
    recargar: () => void cargar(),
    cargando,
    refrescando,
    autoRefresco,
    setAutoRefresco,
    segundosParaRefresco,
    falloRefresco,
    telemetria,
    controles,
    setControles,
    proximaDecisionS,
    ejecutarBacktest,
    ejecutandoBacktest,
  };
}
