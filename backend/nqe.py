"""
================================================================================
NQE — Newtonian Quant Engine · port del Pine Script v2.1
================================================================================
Traducción del indicador de TradingView a Python sobre barras reales de
yfinance. No es una reinterpretación: es el MISMO cálculo, barra a barra, con
el mismo orden de ejecución que Pine.

Por qué vive en el backend y no en el frontend
----------------------------------------------
Tres piezas lo obligan:

  1. La triple barrera es un proceso ONLINE: cada señal abre una operación
     pendiente que se resuelve barras después, y el contador que gobierna el
     gate de HOY sólo contiene operaciones ya cerradas. Es walk-forward purgado
     por construcción, y hay que recorrer la serie entera para tenerlo.
  2. El umbral de disparo es un percentil móvil de 500 barras sobre |score|.
  3. Hacen falta OHLCV completos —máximo, mínimo y volumen—, no sólo cierres,
     que es lo único que `lib/estrategia/indicadores.ts` recibe hoy.

Sobre el repintado
------------------
`ta.pivothigh/low` confirman N barras DESPUÉS del extremo. Aquí se replica ese
retraso tal cual: un swing aparece tarde pero, una vez fijado, no se mueve. Y
la última vela del proveedor puede estar SIN CERRAR — el endpoint lo dice en
vez de dibujar una señal que puede desaparecer sola.

Lo que NO se ha traído del Pine
-------------------------------
Nada del motor. Sí se han dejado fuera los mandos puramente visuales (posición
del panel, qué líneas dibujar): esos los decide el frontend.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

# Constante del intervalo de Wilson al 90 % por una cola. La misma del Pine.
Z_WILSON = 1.645

PRESET_CONSERVADOR = "conservador"
PRESET_EQUILIBRADO = "equilibrado"
PRESET_AGRESIVO = "agresivo"
PRESETS = (PRESET_CONSERVADOR, PRESET_EQUILIBRADO, PRESET_AGRESIVO)


# ==============================================================================
# Parámetros
# ==============================================================================

@dataclass
class Parametros:
    """Los mandos del indicador.

    Los del grupo «Avanzado» del Pine llevan su valor por defecto; el preset
    pisa sensibilidad, umbral del gate, muestra mínima y qué filtros se aplican.
    """

    preset: str = PRESET_EQUILIBRADO
    horizonte: int = 12
    r_mult: float = 1.5
    coste_pct: float = 0.05

    # Módulos de filtrado (el preset puede apagarlos)
    usar_ut: bool = True
    usar_st: bool = True
    usar_fib: bool = True

    # Avanzado
    thr_look: int = 500
    len_vwap: int = 50
    len_vol: int = 100
    len_atr: int = 14
    len_sig: int = 10
    er_len: int = 20
    er_th: float = 0.35
    ut_key: float = 1.0
    ut_len: int = 10
    st_factor: float = 3.0
    st_len: int = 10
    piv_len: int = 8
    fib_min: float = 0.236
    fib_max: float = 0.786
    poc_len: int = 200
    poc_bins: int = 60
    fc_min_n: int = 40
    gate_estricto: bool = True
    # Cuántas señales viajan en la respuesta. 40 es lo que cabe en la tarjeta;
    # las pruebas lo suben para poder comparar el historial completo.
    max_senales: int = 40
    # Barras que viajan para el gráfico. 180 es el mismo tope que usa
    # `GraficoMercado`: por encima, cada vela baja de 4 px y el cuerpo
    # desaparece.
    barras_serie: int = 180

    # Resueltos por el preset
    thr_pct: float = 85.0
    prob_t: float = 0.65
    min_n: int = 30

    def resolver(self) -> "Parametros":
        """Aplica el preset sobre los mandos que gobierna. Devuelve self."""
        p = (self.preset or PRESET_EQUILIBRADO).lower().strip()
        if p == PRESET_CONSERVADOR:
            self.preset = PRESET_CONSERVADOR
            self.thr_pct, self.prob_t, self.min_n = 92.0, 0.72, 40
        elif p == PRESET_AGRESIVO:
            self.preset = PRESET_AGRESIVO
            self.thr_pct, self.prob_t, self.min_n = 75.0, 0.58, 20
            # Agresivo apaga tendencia rápida, estructura lenta y Fibonacci.
            self.usar_ut = False
            self.usar_st = False
            self.usar_fib = False
        else:
            self.preset = PRESET_EQUILIBRADO
            self.thr_pct, self.prob_t, self.min_n = 85.0, 0.65, 30
        return self


# ==============================================================================
# Utilidades — equivalentes de las funciones `ta.*` de Pine
# ==============================================================================

def _rma(x: np.ndarray, periodo: int) -> np.ndarray:
    """Media móvil de Wilder, la que usa `ta.atr` por dentro.

    Se siembra con la media simple de las primeras `periodo` muestras, igual
    que Pine. Antes de eso devuelve NaN: un ATR «provisional» sobre tres barras
    no es un ATR pequeño, es un número sin sentido que después divide.
    """
    n = len(x)
    salida = np.full(n, np.nan)
    if n < periodo:
        return salida
    alfa = 1.0 / periodo
    acumulado = np.nan
    contador = 0
    suma = 0.0
    for i in range(n):
        v = x[i]
        if not np.isfinite(v):
            continue
        if np.isnan(acumulado):
            suma += v
            contador += 1
            if contador == periodo:
                acumulado = suma / periodo
                salida[i] = acumulado
        else:
            acumulado = alfa * v + (1.0 - alfa) * acumulado
            salida[i] = acumulado
    return salida


def _atr(alto: np.ndarray, bajo: np.ndarray, cierre: np.ndarray, periodo: int) -> np.ndarray:
    tr = np.empty(len(cierre))
    tr[0] = alto[0] - bajo[0]
    previo = cierre[:-1]
    tr[1:] = np.maximum.reduce([
        alto[1:] - bajo[1:],
        np.abs(alto[1:] - previo),
        np.abs(bajo[1:] - previo),
    ])
    return _rma(tr, periodo)


def _ema(x: np.ndarray, periodo: int) -> np.ndarray:
    """`ta.ema` de Pine: recursión simple sembrada con el primer valor válido."""
    alfa = 2.0 / (periodo + 1.0)
    salida = np.full(len(x), np.nan)
    acumulado = np.nan
    for i, v in enumerate(x):
        if not np.isfinite(v):
            continue
        acumulado = v if np.isnan(acumulado) else alfa * v + (1.0 - alfa) * acumulado
        salida[i] = acumulado
    return salida


def _sma(x: np.ndarray, periodo: int) -> np.ndarray:
    return pd.Series(x).rolling(periodo, min_periods=periodo).mean().to_numpy()


def _suma_movil(x: np.ndarray, periodo: int) -> np.ndarray:
    return pd.Series(x).rolling(periodo, min_periods=periodo).sum().to_numpy()


def _stdev(x: np.ndarray, periodo: int) -> np.ndarray:
    """`ta.stdev` es la desviación POBLACIONAL (ddof=0), no la muestral."""
    return pd.Series(x).rolling(periodo, min_periods=periodo).std(ddof=0).to_numpy()


def _percentil_movil(x: np.ndarray, periodo: int, pct: float) -> np.ndarray:
    """`ta.percentile_linear_interpolation`: percentil con interpolación lineal
    sobre la ventana móvil, la barra actual incluida."""
    return (
        pd.Series(x)
        .rolling(periodo, min_periods=periodo)
        .quantile(pct / 100.0, interpolation="linear")
        .to_numpy()
    )


def _pivotes(valores: np.ndarray, izq: int, der: int, alto: bool) -> np.ndarray:
    """Réplica de `ta.pivothigh` / `ta.pivotlow`.

    El pivote del índice `i-der` se confirma EN el índice `i`, y ahí es donde se
    escribe. Ese retraso es exactamente lo que garantiza que no repinta: cuando
    el swing aparece, ya no puede moverse.
    """
    n = len(valores)
    salida = np.full(n, np.nan)
    for i in range(izq + der, n):
        centro = i - der
        ventana = valores[centro - izq: centro + der + 1]
        if not np.all(np.isfinite(ventana)):
            continue
        pivote = valores[centro]
        extremo = ventana.max() if alto else ventana.min()
        # Pine exige un extremo único en la ventana; con empate no hay pivote.
        if pivote == extremo and np.count_nonzero(ventana == pivote) == 1:
            salida[i] = pivote
    return salida


def wilson(aciertos: int, muestra: int, z: float = Z_WILSON) -> float:
    """Cota inferior del intervalo de Wilson.

    Es lo que separa «6 de 8, 75 %» de una probabilidad demostrada: con n=8 la
    cota cae a ~48 %. El gate mira la cota, nunca la proporción observada.
    """
    if muestra <= 0:
        return 0.0
    p = aciertos / muestra
    den = 1.0 + z * z / muestra
    centro = p + z * z / (2.0 * muestra)
    margen = z * math.sqrt(p * (1.0 - p) / muestra + z * z / (4.0 * muestra * muestra))
    return max(0.0, (centro - margen) / den)


def _f(v) -> Optional[float]:
    """Float serializable, o None. Un NaN en el JSON tumba la respuesta entera."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


# ==============================================================================
# Motor
# ==============================================================================

def calcular(df: pd.DataFrame, ticker: str, p: Optional[Parametros] = None) -> Dict[str, Any]:
    """Ejecuta el NQE sobre `df` (OHLCV con índice temporal).

    Devuelve el estado de la última barra más el historial de señales, que es
    lo que la tarjeta enseña.
    """

    p = (p or Parametros()).resolver()

    columnas = {"Open", "High", "Low", "Close", "Volume"}
    if df is None or df.empty or not columnas.issubset(set(df.columns)):
        raise ValueError("Se necesitan barras OHLCV completas.")

    df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"]).copy()
    n = len(df)
    # Por debajo de esto ni el percentil de 500 ni la triple barrera tienen
    # nada que decir, y el panel enseñaría un umbral de respaldo disfrazado de
    # medida.
    minimo = max(p.thr_look, p.len_vol, 300) // 2
    if n < minimo:
        raise ValueError(
            f"Histórico insuficiente: {n} barras, hacen falta al menos {minimo}."
        )

    h = df["High"].to_numpy(dtype=float)
    l = df["Low"].to_numpy(dtype=float)
    c = df["Close"].to_numpy(dtype=float)
    v = np.nan_to_num(df["Volume"].to_numpy(dtype=float), nan=0.0)
    idx = df.index

    horas = np.asarray(idx.hour if hasattr(idx, "hour") else np.zeros(n), dtype=int)

    # ── Posición: distancia al VWAP, medida en desviaciones ──────────────────
    hlc3 = (h + l + c) / 3.0
    suma_pv = _suma_movil(hlc3 * v, p.len_vwap)
    suma_v = _suma_movil(v, p.len_vwap)
    with np.errstate(invalid="ignore", divide="ignore"):
        vwap = np.where(suma_v > 0, suma_pv / suma_v, c)
    dist_sd = _stdev(c - vwap, p.len_vwap)
    with np.errstate(invalid="ignore", divide="ignore"):
        z_raw = np.where(dist_sd > 0, (c - vwap) / dist_sd, 0.0)
    z_n = np.clip(np.nan_to_num(z_raw, nan=0.0) / 2.5, -1.0, 1.0)

    # ── Velocidad: variación de una barra, medida en ATR ─────────────────────
    atr = _atr(h, l, c, p.len_atr)
    delta = np.empty(n)
    delta[0] = 0.0
    delta[1:] = c[1:] - c[:-1]
    with np.errstate(invalid="ignore", divide="ignore"):
        vel = np.where(np.isfinite(atr) & (atr > 0), delta / atr, 0.0)
    vel_n = np.clip(np.nan_to_num(vel, nan=0.0) / 1.5, -1.0, 1.0)

    # ── Masa: volumen relativo normalizado POR HORA DEL DÍA ──────────────────
    # El volumen intradía tiene forma de U. Compararlo contra una media plana
    # marca como anómala toda la apertura, todos los días.
    base_vol = _sma(v, p.len_vol)
    vol_hora = np.full(24, np.nan)
    cnt_hora = np.zeros(24, dtype=int)
    rel_vol = np.ones(n)
    for i in range(n):
        hi = int(horas[i]) % 24
        previo = vol_hora[hi]
        muestras = int(cnt_hora[hi])
        # Se LEE el estado antes de actualizarlo, igual que hace Pine.
        tipico = base_vol[i] if (np.isnan(previo) or muestras < 5) else previo
        rel_vol[i] = v[i] / tipico if (np.isfinite(tipico) and tipico > 0) else 1.0
        vol_hora[hi] = v[i] if np.isnan(previo) else previo + (2.0 / 21.0) * (v[i] - previo)
        cnt_hora[hi] = muestras + 1

    # ── Fuerza: PROXY de desequilibrio de órdenes ────────────────────────────
    # Volumen firmado por la posición del cierre en el rango (CLV). Es un proxy
    # DECLARADO: sin libro de órdenes no hay delta de agresores real, y este
    # proyecto ya decidió nombrarlo en vez de disfrazarlo.
    rango = h - l
    with np.errstate(invalid="ignore", divide="ignore"):
        clv = np.where(rango > 0, ((c - l) - (h - c)) / rango, 0.0)
    suma_sv = _suma_movil(clv * v, p.len_sig)
    suma_vv = _suma_movil(v, p.len_sig)
    with np.errstate(invalid="ignore", divide="ignore"):
        ofi = np.where(suma_vv > 0, suma_sv / suma_vv, 0.0)
    ofi = np.nan_to_num(ofi, nan=0.0)

    # ── Aceleración con ley de impacto RAÍZ CUADRADA ─────────────────────────
    # El mercado responde a √F, no a F: Δp ≈ Y·σ·√(Q/V). Un modelo lineal
    # sobreestima los extremos, que es justo donde sale caro equivocarse.
    impulso = ofi * rel_vol
    acel_n = np.clip(np.sign(impulso) * np.sqrt(np.abs(impulso)) / 1.5, -1.0, 1.0)

    # ── Régimen: momento y reversión son excluyentes, no sumables ────────────
    cambio = np.full(n, np.nan)
    if n > p.er_len:
        cambio[p.er_len:] = np.abs(c[p.er_len:] - c[: -p.er_len])
    recorrido = _suma_movil(np.abs(np.concatenate(([0.0], np.diff(c)))), p.er_len)
    with np.errstate(invalid="ignore", divide="ignore"):
        er = np.where(recorrido > 0, cambio / recorrido, 0.0)
    er = np.nan_to_num(er, nan=0.0)
    tendencia = er >= p.er_th

    crudo = np.where(
        tendencia,
        0.50 * acel_n + 0.35 * vel_n + 0.15 * z_n,
        0.45 * acel_n + 0.10 * vel_n - 0.45 * z_n,
    )
    score = _ema(crudo, 3)

    # ── Umbral adaptativo ────────────────────────────────────────────────────
    # Un umbral fijo es un número sin significado que cambia de sentido en cada
    # activo. El percentil controla directamente la TASA de señales.
    abs_score = np.abs(score)
    thr_a = _percentil_movil(abs_score, p.thr_look, p.thr_pct)
    thr_eff = np.where(np.isnan(thr_a), 0.30, np.maximum(np.nan_to_num(thr_a, nan=0.30), 0.05))

    # ── UT Bot · trailing rápido ─────────────────────────────────────────────
    ut_atr = _atr(h, l, c, p.ut_len)
    ut_stop = np.full(n, np.nan)
    stop_previo = 0.0
    for i in range(n):
        a = ut_atr[i]
        if not np.isfinite(a):
            continue
        c_previo = c[i - 1] if i > 0 else np.nan
        if c[i] > stop_previo and np.isfinite(c_previo) and c_previo > stop_previo:
            nuevo = max(stop_previo, c[i] - p.ut_key * a)
        elif c[i] < stop_previo and np.isfinite(c_previo) and c_previo < stop_previo:
            nuevo = min(stop_previo, c[i] + p.ut_key * a)
        elif c[i] > stop_previo:
            nuevo = c[i] - p.ut_key * a
        else:
            nuevo = c[i] + p.ut_key * a
        ut_stop[i] = nuevo
        stop_previo = nuevo
    # `barbuy` / `barsell` del script: de qué lado del trailing está el precio.
    ut_alcista = c > ut_stop

    # Señales de «UT Bot Alerts» (Pine v4), tal cual:
    #
    #     ema   = ema(src, 1)                  -> es el propio src
    #     above = crossover(ema, stop)
    #     buy   = src > stop and above
    #
    # `crossover(a, b)` ya exige `a > b`, así que el `src > stop` de `buy` es
    # redundante y esto se reduce a un cruce limpio del precio con su trailing.
    # Se deja escrito porque la equivalencia NO es evidente leyendo el Pine, y
    # hay una prueba que la comprueba en vez de darla por buena
    # (`test_ut_bot_equivale_al_script_de_alertas`).
    ut_compra = np.zeros(n, dtype=bool)
    ut_venta = np.zeros(n, dtype=bool)
    ut_compra[1:] = (c[1:] > ut_stop[1:]) & (c[:-1] <= ut_stop[:-1])
    ut_venta[1:] = (c[1:] < ut_stop[1:]) & (c[:-1] >= ut_stop[:-1])

    # `pos` del script: posición que se MANTIENE entre cruces. No es lo mismo
    # que `ut_alcista`: hasta el primer cruce vale 0, y ese matiz importa —
    # pintar «largo» desde la primera barra sería inventarse una entrada que
    # nunca ocurrió.
    ut_pos = np.zeros(n, dtype=int)
    actual = 0
    for i in range(n):
        if ut_compra[i]:
            actual = 1
        elif ut_venta[i]:
            actual = -1
        ut_pos[i] = actual

    # ── SuperTrend · estructura lenta ────────────────────────────────────────
    # El factor 3 no es decorativo: por debajo de 2.5 se solapa con UT Bot y
    # deja de confirmar nada — el acuerdo direccional sube del 62 % al 94 %.
    st_atr = _atr(h, l, c, p.st_len)
    st_medio = (h + l) / 2.0
    st_sup = np.full(n, np.nan)
    st_inf = np.full(n, np.nan)
    st_dir = np.ones(n, dtype=int)
    direccion = 1
    for i in range(n):
        a = st_atr[i]
        sup_previo = st_sup[i - 1] if i > 0 else np.nan
        inf_previo = st_inf[i - 1] if i > 0 else np.nan
        if not np.isfinite(a):
            st_dir[i] = direccion
            continue
        arriba = st_medio[i] + p.st_factor * a
        abajo = st_medio[i] - p.st_factor * a
        c_previo = c[i - 1] if i > 0 else np.nan
        st_sup[i] = (
            arriba
            if (not np.isfinite(sup_previo) or arriba < sup_previo or (np.isfinite(c_previo) and c_previo > sup_previo))
            else sup_previo
        )
        st_inf[i] = (
            abajo
            if (not np.isfinite(inf_previo) or abajo > inf_previo or (np.isfinite(c_previo) and c_previo < inf_previo))
            else inf_previo
        )
        if direccion == -1 and np.isfinite(sup_previo) and c[i] > sup_previo:
            direccion = 1
        elif direccion == 1 and np.isfinite(inf_previo) and c[i] < inf_previo:
            direccion = -1
        st_dir[i] = direccion
    st_linea = np.where(st_dir == 1, st_inf, st_sup)
    st_alcista = st_dir == 1
    st_compra = np.zeros(n, dtype=bool)
    st_venta = np.zeros(n, dtype=bool)
    st_compra[1:] = (st_dir[1:] == 1) & (st_dir[:-1] == -1)
    st_venta[1:] = (st_dir[1:] == -1) & (st_dir[:-1] == 1)

    # ── Fibonacci como MEDIDOR DE ESTRUCTURA ─────────────────────────────────
    # No se usan los ratios como niveles mágicos. Se mide qué fracción del
    # último impulso confirmado se ha devuelto, y esa fracción sí separa tres
    # situaciones distintas: extendiendo, retroceso sano e impulso roto.
    ph = _pivotes(h, p.piv_len, p.piv_len, alto=True)
    pl = _pivotes(l, p.piv_len, p.piv_len, alto=False)
    sw_h = np.full(n, np.nan)
    sw_l = np.full(n, np.nan)
    sw_hb = np.full(n, np.nan)
    sw_lb = np.full(n, np.nan)
    act_h = act_l = act_hb = act_lb = np.nan
    for i in range(n):
        if np.isfinite(ph[i]):
            act_h, act_hb = ph[i], i - p.piv_len
        if np.isfinite(pl[i]):
            act_l, act_lb = pl[i], i - p.piv_len
        sw_h[i], sw_l[i], sw_hb[i], sw_lb[i] = act_h, act_l, act_hb, act_lb

    leg_ok = (
        np.isfinite(sw_h) & np.isfinite(sw_l)
        & np.isfinite(sw_hb) & np.isfinite(sw_lb)
        & (sw_h > sw_l)
    )
    leg_up = leg_ok & (sw_hb > sw_lb)
    leg_rng = np.where(leg_ok, sw_h - sw_l, np.nan)
    with np.errstate(invalid="ignore", divide="ignore"):
        retr = np.where(
            leg_ok & (leg_rng > 0),
            np.where(leg_up, (sw_h - c) / leg_rng, (c - sw_l) / leg_rng),
            np.nan,
        )

    en_banda = np.isfinite(retr) & (retr >= p.fib_min) & (retr <= p.fib_max)
    fib_ok_l = np.ones(n, dtype=bool) if not p.usar_fib else (leg_ok & leg_up & en_banda)
    fib_ok_s = np.ones(n, dtype=bool) if not p.usar_fib else (leg_ok & ~leg_up & en_banda)

    # ── Composición de la señal ──────────────────────────────────────────────
    cruce_up = np.zeros(n, dtype=bool)
    cruce_dn = np.zeros(n, dtype=bool)
    valido = np.isfinite(score)
    cruce_up[1:] = valido[1:] & valido[:-1] & (score[1:] > thr_eff[1:]) & (score[:-1] <= thr_eff[:-1])
    cruce_dn[1:] = valido[1:] & valido[:-1] & (score[1:] < -thr_eff[1:]) & (score[:-1] >= -thr_eff[:-1])
    liq_ok = rel_vol > 0.8

    filtro_ut_l = np.ones(n, dtype=bool) if not p.usar_ut else ut_alcista
    filtro_ut_s = np.ones(n, dtype=bool) if not p.usar_ut else ~ut_alcista
    filtro_st_l = np.ones(n, dtype=bool) if not p.usar_st else st_alcista
    filtro_st_s = np.ones(n, dtype=bool) if not p.usar_st else ~st_alcista

    sig_l = cruce_up & (ofi > 0) & liq_ok & filtro_ut_l & filtro_st_l & fib_ok_l
    sig_s = cruce_dn & (ofi < 0) & liq_ok & filtro_ut_s & filtro_st_s & fib_ok_s

    # ── Triple barrera + gate, en un solo recorrido ──────────────────────────
    # El orden dentro del bucle es el MISMO que el de Pine: primero se
    # resuelven las operaciones pendientes con la barra de hoy, después se
    # calcula el gate con esos contadores, y sólo al final se apunta la señal
    # nueva. Así el gate que valida una señal contiene únicamente operaciones
    # CERRADAS antes de ella: es purga walk-forward por construcción, no una
    # promesa.
    pendientes: List[Dict[str, Any]] = []
    gan_l = per_l = gan_s = per_s = 0
    embudo1 = embudo2 = embudo3 = 0
    senales: List[Dict[str, Any]] = []

    ok_l_hist = np.zeros(n, dtype=bool)
    ok_s_hist = np.zeros(n, dtype=bool)
    gate_l_hist = np.zeros(n, dtype=bool)
    gate_s_hist = np.zeros(n, dtype=bool)
    lb_l_hist = np.zeros(n)
    lb_s_hist = np.zeros(n)
    n_l_hist = np.zeros(n, dtype=int)
    n_s_hist = np.zeros(n, dtype=int)
    exp_l_hist = np.zeros(n)
    exp_s_hist = np.zeros(n)

    for i in range(n):
        # 1) Resolución de pendientes con la barra actual.
        restantes: List[Dict[str, Any]] = []
        for op in pendientes:
            d = op["dir"]
            tp, sl = op["tp"], op["sl"]
            if d == 1:
                toca_tp, toca_sl = h[i] >= tp, l[i] <= sl
            else:
                toca_tp, toca_sl = l[i] <= tp, h[i] >= sl

            cerrada = False
            ganada = False
            motivo = ""
            if toca_tp and toca_sl:
                # Empate intrabar: se asume SIEMPRE el stop. Infravalorar el
                # acierto es seguro; sobrevalorarlo es como quiebran cuentas.
                cerrada, ganada, motivo = True, False, "stop (empate intrabar)"
            elif toca_tp:
                cerrada, ganada, motivo = True, True, "objetivo"
            elif toca_sl:
                cerrada, ganada, motivo = True, False, "stop"
            elif (i - op["barra"]) >= p.horizonte:
                coste_abs = op["entrada"] * p.coste_pct / 100.0
                ganada = (
                    (c[i] - op["entrada"]) > coste_abs if d == 1
                    else (op["entrada"] - c[i]) > coste_abs
                )
                cerrada, motivo = True, "tiempo"

            if not cerrada:
                restantes.append(op)
                continue

            if d == 1:
                gan_l, per_l = (gan_l + 1, per_l) if ganada else (gan_l, per_l + 1)
            else:
                gan_s, per_s = (gan_s + 1, per_s) if ganada else (gan_s, per_s + 1)
            clave = op.get("senal")
            if clave is not None:
                senales[clave]["resultado"] = "ganada" if ganada else "perdida"
                senales[clave]["cierre_motivo"] = motivo
                senales[clave]["barras_abierta"] = int(i - op["barra"])
        pendientes = restantes

        # 2) Gate con los contadores ya actualizados.
        nl, ns = gan_l + per_l, gan_s + per_s
        lb_l, lb_s = wilson(gan_l, nl), wilson(gan_s, ns)
        prob_l = gan_l / nl if nl else 0.0
        prob_s = gan_s / ns if ns else 0.0
        riesgo_abs = p.r_mult * atr[i] if np.isfinite(atr[i]) else np.nan
        coste_r = (
            (p.coste_pct / 100.0) * c[i] / riesgo_abs
            if (np.isfinite(riesgo_abs) and riesgo_abs > 0) else 0.0
        )
        esp_l = prob_l - (1.0 - prob_l) - coste_r
        esp_s = prob_s - (1.0 - prob_s) - coste_r
        gate_l = nl >= p.min_n and lb_l >= p.prob_t and esp_l > 0
        gate_s = ns >= p.min_n and lb_s >= p.prob_t and esp_s > 0

        ok_l = bool(sig_l[i]) and (gate_l if p.gate_estricto else True)
        ok_s = bool(sig_s[i]) and (gate_s if p.gate_estricto else True)

        ok_l_hist[i], ok_s_hist[i] = ok_l, ok_s
        gate_l_hist[i], gate_s_hist[i] = gate_l, gate_s
        lb_l_hist[i], lb_s_hist[i] = lb_l, lb_s
        n_l_hist[i], n_s_hist[i] = nl, ns
        exp_l_hist[i], exp_s_hist[i] = esp_l, esp_s

        # 3) Embudo de diagnóstico: contesta a «¿por qué no sale nada?» con
        #    números en vez de con conjeturas.
        if cruce_up[i] or cruce_dn[i]:
            embudo1 += 1
        if (cruce_up[i] and ofi[i] > 0 and liq_ok[i]) or (cruce_dn[i] and ofi[i] < 0 and liq_ok[i]):
            embudo2 += 1
        if sig_l[i] or sig_s[i]:
            embudo3 += 1

        # 4) Alta de la operación pendiente.
        if (sig_l[i] or sig_s[i]) and len(pendientes) < 200 and np.isfinite(atr[i]) and atr[i] > 0:
            d = 1 if sig_l[i] else -1
            tp = c[i] + d * p.r_mult * atr[i]
            sl = c[i] - d * p.r_mult * atr[i]
            senales.append({
                "indice": int(i),
                "fecha": str(idx[i])[:19],
                "direccion": "compra" if d == 1 else "venta",
                # Una señal bloqueada por el gate NO es una señal dada. Viaja
                # marcada para poder contarla aparte y no leerla como orden.
                "validada": bool(ok_l if d == 1 else ok_s),
                "precio": _f(c[i]),
                "objetivo": _f(tp),
                "stop": _f(sl),
                "wilson": _f(lb_l if d == 1 else lb_s),
                "muestra": int(nl if d == 1 else ns),
                "resultado": "abierta",
                "cierre_motivo": None,
                "barras_abierta": None,
            })
            pendientes.append({
                "dir": d,
                "entrada": float(c[i]),
                "tp": float(tp),
                "sl": float(sl),
                "barra": i,
                "senal": len(senales) - 1,
            })

    # ── Pronóstico de 3 velas por analogía empírica ──────────────────────────
    # No es una predicción y no tiene nada de cuántico: es la distribución
    # histórica de lo que ocurrió en las 3 velas siguientes cuando el mercado
    # estuvo en un estado PARECIDO. Seis estados: régimen × sesgo del score.
    FH = 3
    sesgo_arr = np.where(score > thr_eff, 2, np.where(score < -thr_eff, 0, 1))
    estado_id = (tendencia.astype(int) * 3 + sesgo_arr).astype(int)
    fc_n = np.zeros(6, dtype=int)
    fc_up = np.zeros(6, dtype=int)
    fc_suma = np.zeros(6)
    fc_cuad = np.zeros(6)
    for i in range(n):
        if i <= 300:
            continue
        a = atr[i - FH]
        if not np.isfinite(a) or a <= 0:
            continue
        est = int(estado_id[i - FH])
        mov = (c[i] - c[i - FH]) / a
        fc_n[est] += 1
        if mov > 0:
            fc_up[est] += 1
        fc_suma[est] += mov
        fc_cuad[est] += mov * mov

    est_actual = int(estado_id[-1])
    f_n = int(fc_n[est_actual])
    f_media = fc_suma[est_actual] / f_n if f_n else 0.0
    f_var = (fc_cuad[est_actual] / f_n - f_media * f_media) if f_n > 1 else 0.0
    f_sd = math.sqrt(max(f_var, 0.0))
    f_pup = fc_up[est_actual] / f_n if f_n else 0.0

    # ── POC: punto de control de las últimas `poc_len` barras ────────────────
    poc = None
    ventana = min(p.poc_len, n)
    hi_v = float(np.nanmax(h[-ventana:]))
    lo_v = float(np.nanmin(l[-ventana:]))
    if math.isfinite(hi_v) and math.isfinite(lo_v) and hi_v > lo_v:
        paso = (hi_v - lo_v) / p.poc_bins
        cubos = np.zeros(p.poc_bins)
        for i in range(n - ventana, n):
            if not (np.isfinite(h[i]) and np.isfinite(l[i]) and v[i] > 0):
                continue
            i0 = min(p.poc_bins - 1, max(0, int((l[i] - lo_v) / paso)))
            i1 = min(p.poc_bins - 1, max(0, int((h[i] - lo_v) / paso)))
            cubos[i0:i1 + 1] += v[i] / (i1 - i0 + 1)
        poc = lo_v + (int(np.argmax(cubos)) + 0.5) * paso

    # ── Estado de la última barra ────────────────────────────────────────────
    u = n - 1
    ultimo_retr = _f(retr[u])
    zona_fib = (
        "sin impulso" if ultimo_retr is None else
        "extendiendo" if ultimo_retr < 0.0 else
        "superficial" if ultimo_retr <= 0.382 else
        "zona áurea" if ultimo_retr <= 0.618 else
        "profundo" if ultimo_retr <= 1.0 else "impulso roto"
    )

    ok_l_u, ok_s_u = bool(ok_l_hist[u]), bool(ok_s_hist[u])
    gate_l_u, gate_s_u = bool(gate_l_hist[u]), bool(gate_s_hist[u])
    sesgo_u = 1 if score[u] > thr_eff[u] else -1 if score[u] < -thr_eff[u] else 0
    abierto_l = (not p.gate_estricto) or gate_l_u
    abierto_s = (not p.gate_estricto) or gate_s_u

    if ok_l_u:
        accion, accion_texto, tono = "compra", "COMPRA", "up"
    elif ok_s_u:
        accion, accion_texto, tono = "venta", "VENTA", "down"
    elif sesgo_u == 1 and abierto_l:
        accion, accion_texto, tono = "mantener_compra", "compra · mantener", "up"
    elif sesgo_u == -1 and abierto_s:
        accion, accion_texto, tono = "mantener_venta", "venta · mantener", "down"
    elif sesgo_u == 1:
        accion, accion_texto, tono = "compra_bloqueada", "compra · bloqueada", "caution"
    elif sesgo_u == -1:
        accion, accion_texto, tono = "venta_bloqueada", "venta · bloqueada", "caution"
    else:
        accion, accion_texto, tono = "neutral", "NEUTRAL", "neutral"

    atr_u = _f(atr[u])
    tp_u = _f(c[u] + sesgo_u * p.r_mult * atr[u]) if (sesgo_u and atr_u) else None
    sl_u = _f(c[u] - sesgo_u * p.r_mult * atr[u]) if (sesgo_u and atr_u) else None

    def _edad(giros: np.ndarray) -> Optional[int]:
        posiciones = np.flatnonzero(giros)
        return int(u - posiciones[-1]) if len(posiciones) else None

    ut_giros = np.zeros(n, dtype=bool)
    ut_giros[1:] = ut_alcista[1:] != ut_alcista[:-1]
    st_giros = np.zeros(n, dtype=bool)
    st_giros[1:] = st_dir[1:] != st_dir[:-1]

    validadas = [s for s in senales if s["validada"]]
    bloqueadas = [s for s in senales if not s["validada"]]
    cerradas = [s for s in validadas if s["resultado"] in ("ganada", "perdida")]
    ganadas = sum(1 for s in cerradas if s["resultado"] == "ganada")

    # ── Avisos. No son decorativos: cambian cómo se lee todo lo demás ────────
    avisos: List[str] = []
    if not p.gate_estricto:
        avisos.append(
            "Gate DESACTIVADO: se muestran señales crudas, incluidas las no demostradas."
        )
    if int(n_l_hist[u]) < p.min_n or int(n_s_hist[u]) < p.min_n:
        avisos.append(
            f"Muestra corta para el gate (largo n={int(n_l_hist[u])}, corto n={int(n_s_hist[u])}; "
            f"mínimo {p.min_n}). Mientras no se alcance, el gate está cerrado por diseño."
        )
    if f_n < p.fc_min_n:
        avisos.append(
            f"Pronóstico sin muestra suficiente (n={f_n}, mínimo {p.fc_min_n}): no se enseña."
        )
    if embudo3 == 0:
        avisos.append(
            f"Ninguna señal ha pasado los filtros en {n} barras "
            f"(embudo {embudo1}→{embudo2}→{embudo3})."
        )
    if pendientes:
        avisos.append(
            f"{len(pendientes)} operación(es) de la estadística siguen abiertas: su "
            "resultado todavía no cuenta en el acierto."
        )

    def _nivel_fib(fraccion: float) -> Optional[float]:
        if not bool(leg_ok[u]):
            return None
        return _f(
            sw_h[u] - fraccion * leg_rng[u] if bool(leg_up[u])
            else sw_l[u] + fraccion * leg_rng[u]
        )

    # ── Serie para el gráfico ────────────────────────────────────────────────
    # La tarjeta dibuja velas, no una tabla, así que la cola de la serie viaja
    # entera: OHLCV más las tres líneas que el Pine pinta encima (trailing de
    # UT Bot, SuperTrend y VWAP) y el par score/umbral del panel inferior.
    #
    # Se manda SÓLO la cola. Con 5.082 barras en 700 px cada vela mide 0,14 px:
    # no es un gráfico, es una mancha. `barras_serie` es el mismo tope que usa
    # `GraficoMercado` (180) para que las dos tarjetas se lean igual.
    ventana_serie = min(max(p.barras_serie, 20), n)
    desde_serie = n - ventana_serie

    def _lista(arr) -> List[Optional[float]]:
        return [_f(arr[i]) for i in range(desde_serie, n)]

    def _ms(i: int) -> int:
        try:
            return int(idx[i].timestamp() * 1000)
        except Exception:
            return int(i)

    serie = {
        "barras": [
            {
                "t": _ms(i),
                "o": _f(df["Open"].to_numpy(dtype=float)[i]),
                "h": _f(h[i]),
                "l": _f(l[i]),
                "c": _f(c[i]),
                "v": _f(v[i]),
            }
            for i in range(desde_serie, n)
        ],
        "ut_stop": _lista(ut_stop),
        "supertrend": _lista(st_linea),
        "vwap": _lista(vwap),
        "score": _lista(score),
        "umbral": _lista(thr_eff),
        # Las marcas llevan el índice DENTRO de la ventana, ya trasladado: que
        # el frontend reste offsets es la clase de aritmética que se desalinea
        # en silencio en cuanto alguien cambia el tamaño de la ventana.
        "marcas": [
            {
                "i": s["indice"] - desde_serie,
                "direccion": s["direccion"],
                "validada": s["validada"],
                "precio": s["precio"],
                "objetivo": s["objetivo"],
                "stop": s["stop"],
                "resultado": s["resultado"],
                "fecha": s["fecha"],
            }
            for s in senales
            if s["indice"] >= desde_serie
        ],
        # Marcas propias de UT Bot. Son OTRA cosa que las de arriba: aquellas
        # son la señal compuesta del NQE (score + flujo + los tres filtros);
        # estas son el cruce del precio con su trailing, sin más. Mezclarlas
        # en una sola lista haría creer que un módulo manda una operación, y
        # la regla del producto es que ningún indicador aislado puede.
        "ut_marcas": [
            {
                "i": i - desde_serie,
                "tipo": "buy" if ut_compra[i] else "sell",
                "precio": _f(c[i]),
                "stop": _f(ut_stop[i]),
                "fecha": str(idx[i])[:19],
            }
            for i in range(desde_serie, n)
            if ut_compra[i] or ut_venta[i]
        ],
        # Posición sostenida entre cruces, para la cinta de estado.
        "ut_pos": [int(ut_pos[i]) for i in range(desde_serie, n)],

        # Niveles horizontales del impulso vigente. Son los de la última barra:
        # el Pine tampoco los redibuja hacia atrás.
        "fib_382": _nivel_fib(0.382),
        "fib_500": _nivel_fib(0.500),
        "fib_618": _nivel_fib(0.618),
        "poc": _f(poc),
        "desde_indice": int(desde_serie),
    }

    return {
        "ticker": ticker,
        "barras": int(n),
        "desde": str(idx[0])[:19],
        "hasta": str(idx[-1])[:19],
        "preset": p.preset,
        "parametros": asdict(p),

        "senal": {
            "accion": accion,
            "texto": accion_texto,
            "tono": tono,
            "disparo": ok_l_u or ok_s_u,
            "sesgo": sesgo_u,
            "precio": _f(c[u]),
            "objetivo": tp_u,
            "stop": sl_u,
            "riesgo_atr": p.r_mult,
        },

        "motor": {
            "score": _f(score[u]),
            "umbral": _f(thr_eff[u]),
            "abs_score": _f(abs_score[u]),
            "posicion_z": _f(z_n[u]),
            "velocidad": _f(vel_n[u]),
            "aceleracion": _f(acel_n[u]),
            "ofi": _f(ofi[u]),
            "volumen_relativo": _f(rel_vol[u]),
            "atr": atr_u,
            "vwap": _f(vwap[u]),
            "poc": _f(poc),
        },

        "regimen": {
            "estado": "tendencia" if bool(tendencia[u]) else "rango",
            "er": _f(er[u]),
            "umbral_er": p.er_th,
        },

        "ut_bot": {
            "activo": p.usar_ut,
            "senal": (
                "compra" if ut_compra[u] else "venta" if ut_venta[u]
                else ("alcista" if ut_alcista[u] else "bajista")
            ),
            "alcista": bool(ut_alcista[u]),
            "nivel": _f(ut_stop[u]),
            "velas_desde_giro": _edad(ut_giros),
            "posicion": int(ut_pos[u]),
            "compras": int(ut_compra.sum()),
            "ventas": int(ut_venta.sum()),
            # Los dos mandos del script original. Viajan visibles porque son
            # lo único que cambia su sensibilidad, y un «Buy» sin saber con
            # qué sensibilidad salió no se puede comparar con otro.
            "key_value": p.ut_key,
            "atr_periodo": p.ut_len,
        },

        "supertrend": {
            "activo": p.usar_st,
            "senal": (
                "compra" if st_compra[u] else "venta" if st_venta[u]
                else ("alcista" if st_alcista[u] else "bajista")
            ),
            "alcista": bool(st_alcista[u]),
            "nivel": _f(st_linea[u]),
            "velas_desde_giro": _edad(st_giros),
        },

        "estructura": {
            "activo": p.usar_fib,
            "zona": zona_fib,
            "retroceso": ultimo_retr,
            "impulso": ("alcista" if bool(leg_up[u]) else "bajista") if bool(leg_ok[u]) else None,
            "swing_alto": _f(sw_h[u]) if bool(leg_ok[u]) else None,
            "swing_bajo": _f(sw_l[u]) if bool(leg_ok[u]) else None,
            "fib_382": _nivel_fib(0.382),
            "fib_500": _nivel_fib(0.500),
            "fib_618": _nivel_fib(0.618),
        },

        "pronostico": {
            "disponible": f_n >= p.fc_min_n,
            "muestra": f_n,
            "muestra_minima": p.fc_min_n,
            "prob_sube": _f(f_pup),
            "wilson": _f(wilson(int(fc_up[est_actual]), f_n)),
            "media_atr": _f(f_media),
            "desviacion_atr": _f(f_sd),
            "velas": FH,
            "estado": ("tendencia" if est_actual >= 3 else "rango")
                      + " · " + ["bajista", "neutro", "alcista"][est_actual % 3],
        },

        "gate": {
            "estricto": p.gate_estricto,
            "umbral_wilson": p.prob_t,
            "muestra_minima": p.min_n,
            "largo": {
                "abierto": gate_l_u,
                "muestra": int(n_l_hist[u]),
                "acierto": _f(gan_l / (gan_l + per_l)) if (gan_l + per_l) else None,
                "wilson": _f(lb_l_hist[u]),
                "esperanza": _f(exp_l_hist[u]),
            },
            "corto": {
                "abierto": gate_s_u,
                "muestra": int(n_s_hist[u]),
                "acierto": _f(gan_s / (gan_s + per_s)) if (gan_s + per_s) else None,
                "wilson": _f(lb_s_hist[u]),
                "esperanza": _f(exp_s_hist[u]),
            },
        },

        "embudo": {
            "cruces": embudo1,
            "con_flujo_y_liquidez": embudo2,
            "tras_filtros": embudo3,
            "validadas": len(validadas),
            "bloqueadas_por_gate": len(bloqueadas),
        },

        "historial": {
            "total": len(senales),
            "validadas": len(validadas),
            "bloqueadas": len(bloqueadas),
            "cerradas": len(cerradas),
            "ganadas": ganadas,
            "acierto": _f(ganadas / len(cerradas)) if cerradas else None,
            # Las últimas, de la más reciente a la más antigua: es lo que cabe
            # en una tarjeta y lo único que de verdad se mira.
            "senales": list(reversed(senales[-p.max_senales:])),
        },

        "serie": serie,

        "avisos": avisos,
        "nota_ofi": (
            "El flujo (OFI) es un PROXY: volumen firmado por la posición del cierre "
            "en el rango (CLV). Sin libro de órdenes no hay delta de agresores real."
        ),
    }
