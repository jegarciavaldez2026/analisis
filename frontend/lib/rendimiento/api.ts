/**
 * Contrato de `GET /api/rendimiento/{ticker}` (backend/rendimiento_api.py).
 *
 * Los nombres de campo están copiados del `resultado` que compone el backend,
 * no escritos de memoria: un nombre plausible y equivocado no da error, da un
 * guion en pantalla que se lee como «no hay dato».
 */
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

export type Num = number | null;

/** Valor de la empresa, mediana de sus competidores y referencia del S&P 500 (SPY). */
export interface Trio {
  valor: Num;
  industria: Num;
  sp500: Num;
}

export interface Rango {
  min: Num;
  max: Num;
}

export interface RangoHistorico {
  min: number;
  max: number;
  n: number;
  actual: Num;
}

export interface Competidor {
  ticker: string;
  nombre: string;
  capitalizacion: Num;
  per: Num;
  cambio_pct: Num;
  propio: boolean;
}

export interface FichaRendimiento {
  ticker: string;
  nombre: string;
  moneda: string;
  bolsa: string | null;
  precio: {
    actual: Num;
    cambio: Num;
    cambio_pct: Num;
    hora: string | null;
    rango_52s: Rango;
    rango_dia: Rango;
  };
  perfil: {
    sector: string | null;
    industria: string | null;
    capitalizacion: Num;
    pct_corto: Num;
    empleados: Num;
    ventas: Num;
    acciones: Num;
    primera_cotizacion: string | null;
    ex_dividendo: string | null;
    ultimo_trimestre: string | null;
    proximos_resultados: string | null;
    sede: string | null;
    web: string | null;
    moneda_cuentas: string | null;
  };
  descripcion: string | null;
  estimaciones: {
    precio_objetivo: Num;
    potencial_pct: Num;
    per: Num;
    per_adelantado: Num;
    sorpresa_bpa_pct: Num;
    recomendacion: string | null;
    recomendacion_media: Num;
    analistas: Num;
  };
  industria: { nombre: string | null; muestra: number };
  rentabilidades: Record<'5d' | '1m' | 'ytd' | '1a' | '3a' | '5a', Trio>;
  beta_1a: Trio;
  valoracion: Record<'per' | 'ps' | 'p_fcf' | 'pb' | 'p_tangible' | 'ev_ebitda' | 'ev_fcf', Trio>;
  rangos_historicos: Partial<Record<'per' | 'pb' | 'ps', RangoHistorico>>;
  crecimiento: Record<
    'ventas_prox_anio' | 'ventas_1a' | 'ventas_3a' | 'bpa_prox_anio' | 'bpa_1a' | 'bpa_3a' | 'ebitda_1a' | 'ebitda_3a',
    Num
  >;
  rentabilidad: Record<'margen_bruto' | 'margen_operativo' | 'margen_neto' | 'roa' | 'roe' | 'roic', Trio>;
  tecnicos: Record<
    'rsi_14' | 'mfi_14' | 'bollinger_20' | 'bollinger_50' | 'vs_sma_50' | 'vs_sma_120' | 'vs_max_52s' | 'vs_min_52s',
    Num
  >;
  salud: Record<'ratio_corriente' | 'ratio_rapido' | 'precio' | 'caja_neta_accion' | 'patrimonio_accion' | 'deuda_capital', Num>;
  dividendos: Record<'rent_prevista' | 'payout' | 'rent_ttm' | 'dividendo_accion' | 'crec_1a' | 'crec_3a' | 'crec_5a', Trio>;
  competidores: Competidor[];
  avisos: string[];
  no_disponible: string[];
  actualizado: string;
}

export async function obtenerRendimiento(ticker: string, token: string | null): Promise<FichaRendimiento> {
  const r = await axios.get<FichaRendimiento>(`${BACKEND_URL}/api/rendimiento/${encodeURIComponent(ticker)}`, {
    // Cabecera explícita: `axios.defaults` depende del orden de los efectos y al recargar llegaba vacía.
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    timeout: 90000,
  });
  return r.data;
}

/** Mensaje de error legible: el `detail` del backend si lo hay. */
export function mensajeDeError(e: unknown): string {
  const detalle = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detalle === 'string') return detalle;
  return 'No se pudo cargar la ficha. Comprueba la conexión y vuelve a intentarlo.';
}
