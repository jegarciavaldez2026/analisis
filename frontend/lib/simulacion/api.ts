/**
 * ============================================================================
 * Trading simulado — capa de servicio
 * ============================================================================
 * Deliberadamente delgada. Aquí **no se calcula nada**: ni P&L, ni porcentajes,
 * ni win rate. Todo eso lo devuelve ya calculado `backend/simulacion.py`, que
 * es puro y tiene 86 pruebas ejecutables detrás.
 *
 * La regla de arquitectura del encargo —«la lógica de trading NO debe estar
 * mezclada con los componentes visuales»— se cumple mejor si tampoco está en
 * la capa de red. Un P&L calculado en dos sitios acaba dando dos cifras, y la
 * que se ve en pantalla no es la que cuadra el balance.
 * ==========================================================================*/

import axios, { AxiosError } from 'axios';

import { API } from '../estrategia/api';
import {
  BoletaManual,
  CuentaSim,
  DecisionGuardada,
  EstadoSimulacion,
  MarcoSim,
  ParametrosSim,
  RespuestaOrden,
  RespuestaRobot,
  RobotSim,
  TarjetaSim,
} from './tipos';

const cliente = axios.create({ baseURL: API, timeout: 120000 });

/** Cabecera de sesión. Sin token no hay cuenta: la simulación es por usuario. */
function auth(token: string | null) {
  return { headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}

/**
 * Mensaje legible. Un `[object Object]` en pantalla es un bug, y en una
 * boleta de orden es peor: quien la manda necesita saber por qué no entró.
 */
export function mensajeSim(e: unknown): string {
  const err = e as AxiosError<{ detail?: string }>;
  if (err?.response?.data?.detail) return String(err.response.data.detail);
  if (err?.response?.status === 401) return 'Sesión caducada: vuelve a entrar.';
  if (err?.code === 'ECONNABORTED') return 'El backend tardó demasiado en responder.';
  if (err?.message) return err.message;
  return 'Error desconocido en la simulación.';
}

/* ==========================================================================
 * Cuenta
 * ======================================================================== */

/**
 * La foto completa. **Es el único endpoint que hace avanzar el tiempo**: el
 * backend recorre las barras que han pasado desde el último tick y aplica los
 * stops y objetivos en SU barra, no «cuando alguien recargó la página».
 */
export async function leerEstado(
  token: string | null,
  ticker: string,
  marco: MarcoSim = '1d',
): Promise<EstadoSimulacion> {
  const { data } = await cliente.get<EstadoSimulacion>('/simulacion/estado', {
    ...auth(token),
    params: { ticker, marco },
  });
  return data;
}

/** Sólo el resumen, sin tocar al proveedor de precios. Para la franja de KPIs. */
export async function leerCuenta(
  token: string | null,
): Promise<{ cuenta: CuentaSim; robot: RobotSim; parametros: ParametrosSim }> {
  const { data } = await cliente.get('/simulacion/cuenta', auth(token));
  return data;
}

export async function reiniciarCuenta(
  token: string | null,
  capitalInicial: number,
): Promise<{ ok: boolean; capital_inicial: number; archivadas: number; nota: string }> {
  const { data } = await cliente.post(
    '/simulacion/cuenta/reiniciar',
    { capital_inicial: capitalInicial },
    auth(token),
  );
  return data;
}

export async function guardarParametros(
  token: string | null,
  cambios: Partial<ParametrosSim>,
): Promise<{ ok: boolean; parametros: ParametrosSim }> {
  const { data } = await cliente.post('/simulacion/parametros', cambios, auth(token));
  return data;
}

/* ==========================================================================
 * Órdenes
 * ======================================================================== */

/**
 * Manda la boleta.
 *
 * Un 422 aquí NO es un fallo de red: es el validador diciendo que la operación
 * no se sostiene —stop al otro lado, margen insuficiente, tamaño cero— y su
 * `detail` es exactamente lo que hay que enseñar. Por eso se deja subir.
 */
export async function crearOrden(
  token: string | null,
  boleta: BoletaManual,
): Promise<RespuestaOrden> {
  const cuerpo = {
    simbolo: boleta.simbolo.toUpperCase().trim(),
    direccion: boleta.direccion,
    tipo: boleta.tipo,
    cantidad: boleta.cantidad ?? undefined,
    precio_limite: boleta.tipo === 'LIMIT' ? boleta.precio_limite ?? undefined : undefined,
    stop_loss: boleta.stop_loss ?? undefined,
    take_profit: boleta.take_profit ?? undefined,
    apalancamiento: boleta.apalancamiento,
    riesgo_pct: boleta.riesgo_pct ?? undefined,
    capital_pct: boleta.capital_pct ?? undefined,
    caduca_en_horas: boleta.caduca_en_horas ?? undefined,
  };
  const { data } = await cliente.post<RespuestaOrden>('/simulacion/ordenes', cuerpo, auth(token));
  return data;
}

export async function cancelarOrden(token: string | null, ordenId: string) {
  const { data } = await cliente.delete(`/simulacion/ordenes/${ordenId}`, auth(token));
  return data;
}

/* ==========================================================================
 * Posiciones
 * ======================================================================== */

/**
 * Cierre manual al último precio conocido.
 *
 * Si la posición ya estaba cerrada el backend contesta `ok: false` con su
 * motivo en vez de un 400. Es un doble clic con la red lenta, no un error, y
 * tratarlo como error obligaría a la interfaz a distinguir cuál de los dos es.
 */
export async function cerrarPosicion(
  token: string | null,
  posicionId: string,
): Promise<{ ok: boolean; motivo?: string; posicion: TarjetaSim; cuenta?: CuentaSim }> {
  const { data } = await cliente.post(
    `/simulacion/posiciones/${posicionId}/cerrar`,
    {},
    auth(token),
  );
  return data;
}

/** Mueve el stop o el objetivo. El backend revalida la coherencia direccional. */
export async function moverNiveles(
  token: string | null,
  posicionId: string,
  niveles: { stop_loss?: number | null; take_profit?: number | null },
) {
  const { data } = await cliente.patch(
    `/simulacion/posiciones/${posicionId}`,
    niveles,
    auth(token),
  );
  return data;
}

export async function leerHistorial(token: string | null, limite = 200) {
  const { data } = await cliente.get('/simulacion/historial', {
    ...auth(token),
    params: { limite },
  });
  return data as { operaciones: TarjetaSim[]; total: number; metricas: CuentaSim };
}

/* ==========================================================================
 * Robot
 * ======================================================================== */

export async function fijarRobot(
  token: string | null,
  robot: { activo: boolean; simbolo?: string | null; marco: MarcoSim; capital_pct: number; riesgo_pct: number },
): Promise<{ ok: boolean; robot: RobotSim }> {
  const { data } = await cliente.post('/simulacion/robot', robot, auth(token));
  return data;
}

/**
 * Una vuelta del robot.
 *
 * Tarda: lee `/pivots`, `/overton`, `/nqe` y `/mtf`. Los tres últimos están
 * cacheados en el backend, pero el primero puede tener que descargar histórico.
 * De ahí el tiempo de espera largo del cliente.
 */
export async function evaluarRobot(
  token: string | null,
  ticker: string,
  marco: MarcoSim,
): Promise<RespuestaRobot> {
  const { data } = await cliente.post<RespuestaRobot>(
    '/simulacion/robot/evaluar',
    {},
    { ...auth(token), params: { ticker, marco } },
  );
  return data;
}

export async function leerDecisiones(
  token: string | null,
  limite = 50,
): Promise<DecisionGuardada[]> {
  const { data } = await cliente.get('/simulacion/decisiones', {
    ...auth(token),
    params: { limite },
  });
  return (data?.decisiones ?? []) as DecisionGuardada[];
}
