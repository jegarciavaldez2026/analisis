"""
================================================================================
Cartera frente al S&P 500
================================================================================
Sustituye al cálculo de `/portfolio/benchmark`, que tenía cinco cifras
inventadas y un fallo de privacidad:

| Antes | Ahora |
|---|---|
| Leía las transacciones de TODOS los usuarios | Sólo las del usuario (lo filtra el endpoint) |
| Correlación fija en 0,85 | Correlación de los rendimientos diarios, cruzados por fecha |
| Curva de 12 meses = recta entre el principio y el final | Serie diaria real, cierre de cada mes, base 100 |
| Volatilidad = media ponderada de volatilidades | Desviación de la serie de la cartera: incluye las correlaciones |
| Tracking error = diferencia de volatilidades | Desviación de la diferencia de rendimientos (`riesgo.py`) |
| Tipo sin riesgo = 4 % a mano | El que pase el llamador (^TNX) |
| Rentabilidad desde la compra contra el S&P de 1 año | Las dos sobre la MISMA ventana de un año |

**Supuesto declarado:** la cartera de HOY mantenida durante toda la ventana.
Es la pregunta «¿lo que tengo se ha comportado mejor que el índice?», no la
rentabilidad histórica de las operaciones —ésa depende de cuándo se compró cada
cosa y ya la da `/portfolio`—. El endpoint devuelve el supuesto junto a las
cifras para que la tarjeta lo diga.

Módulo puro: recibe precios, no descarga nada. Así se prueba sin red.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, Optional

import numpy as np
import pandas as pd

import riesgo

MIN_SESIONES = 60
SUPUESTO = (
    "Cartera actual mantenida durante la ventana: mide cómo se han comportado "
    "las posiciones de hoy frente al índice, no el resultado de cuándo se compró cada una."
)


def posiciones_actuales(transacciones: Iterable[Dict[str, Any]]) -> Dict[str, float]:
    """Acciones netas por ticker (compras menos ventas). Las cerradas no cuentan."""
    netas: Dict[str, float] = {}
    for tx in transacciones:
        tk = str(tx.get("ticker", "")).upper().strip()
        if not tk:
            continue
        signo = 1.0 if tx.get("transaction_type") == "buy" else -1.0
        netas[tk] = netas.get(tk, 0.0) + signo * float(tx.get("shares") or 0)
    return {tk: n for tk, n in netas.items() if n > 1e-9}


def por_fecha(serie: pd.Series) -> pd.Series:
    """
    Índice de FECHAS sin hora ni zona.

    Las acciones llegan en hora de Nueva York y otros mercados en la suya:
    cruzarlas por marca temporal completa no emparejaría casi nada, y cruzarlas
    por posición emparejaría días distintos (ver la advertencia de `riesgo.py`).
    """
    s = serie.dropna().copy()
    idx = pd.DatetimeIndex(s.index)
    if idx.tz is not None:
        idx = idx.tz_localize(None)
    s.index = idx.normalize()
    return s[~s.index.duplicated(keep="last")]


def _vacio(motivo: str) -> Dict[str, Any]:
    return {
        "portfolio_return": None, "benchmark_return": None, "alpha": None,
        "tracking_error": None, "sharpe_portfolio": None, "sharpe_benchmark": None,
        "portfolio_volatility": None, "benchmark_volatility": None, "correlation": None,
        "period": "1Y", "portfolio_values": [], "benchmark_values": [],
        "supuesto": SUPUESTO, "sesiones": 0, "nota": motivo, "sin_precio": [],
    }


def _r(v: Optional[float], nd: int = 2) -> Optional[float]:
    if v is None or not isinstance(v, (int, float)) or not math.isfinite(v):
        return None
    return round(float(v), nd)


def comparar(
    cierres: Dict[str, pd.Series],
    acciones: Dict[str, float],
    referencia: pd.Series,
    tasa_sin_riesgo: float,
) -> Dict[str, Any]:
    """
    `cierres`: serie de cierres diarios por ticker. `referencia`: cierres del
    índice. `tasa_sin_riesgo`: anual, en tanto por uno.
    """
    if not acciones:
        return _vacio("No hay posiciones abiertas que comparar.")

    ref = por_fecha(referencia)
    columnas = {}
    sin_precio = []
    for tk, n in acciones.items():
        s = cierres.get(tk)
        if s is None or s.dropna().empty:
            sin_precio.append(tk)
            continue
        columnas[tk] = por_fecha(s) * n
    if not columnas or ref.empty:
        salida = _vacio("Sin precios suficientes para las posiciones o el índice.")
        salida["sin_precio"] = sin_precio
        return salida

    # Cada valor arrastra su último cierre en los festivos propios; luego se
    # recorta a las fechas en que cotizó el índice y todos tienen precio.
    valores = pd.DataFrame(columnas).sort_index().ffill()
    tabla = valores.join(ref.rename("__ref__"), how="inner").dropna()
    if len(tabla) < MIN_SESIONES + 1:
        salida = _vacio(
            f"Sólo {len(tabla)} sesiones comunes con el índice; hacen falta {MIN_SESIONES + 1}."
        )
        salida["sin_precio"] = sin_precio
        salida["sesiones"] = int(len(tabla))
        return salida

    cartera = tabla.drop(columns="__ref__").sum(axis=1)
    indice = tabla["__ref__"]

    m_cartera = riesgo.metricas(cartera, referencia=indice, tasa_sin_riesgo=tasa_sin_riesgo)
    m_indice = riesgo.metricas(indice, tasa_sin_riesgo=tasa_sin_riesgo)

    rc = cartera.pct_change().dropna()
    ri = indice.pct_change().dropna()
    correlacion = float(np.corrcoef(rc.values, ri.values)[0, 1]) if len(rc) > 2 else None

    ret_cartera = (float(cartera.iloc[-1]) / float(cartera.iloc[0]) - 1.0) * 100.0
    ret_indice = (float(indice.iloc[-1]) / float(indice.iloc[0]) - 1.0) * 100.0

    mensual = pd.DataFrame({"c": cartera, "i": indice}).resample("ME").last().dropna()
    base_c, base_i = float(cartera.iloc[0]), float(indice.iloc[0])
    serie_c = [{"date": f.strftime("%Y-%m"), "value": round(float(v) / base_c * 100.0, 2)}
               for f, v in mensual["c"].items()]
    serie_i = [{"date": f.strftime("%Y-%m"), "value": round(float(v) / base_i * 100.0, 2)}
               for f, v in mensual["i"].items()]

    return {
        "portfolio_return": _r(ret_cartera),
        "benchmark_return": _r(ret_indice),
        "alpha": _r(ret_cartera - ret_indice),
        "tracking_error": _r(m_cartera.get("tracking_error")),
        "sharpe_portfolio": _r(m_cartera.get("sharpe_5a")),
        "sharpe_benchmark": _r(m_indice.get("sharpe_5a")),
        "portfolio_volatility": _r(m_cartera.get("volatilidad_5a")),
        "benchmark_volatility": _r(m_indice.get("volatilidad_5a")),
        "correlation": _r(correlacion),
        "period": "1Y",
        "portfolio_values": serie_c,
        "benchmark_values": serie_i,
        "supuesto": SUPUESTO,
        "sesiones": int(len(tabla)),
        "nota": None,
        "sin_precio": sin_precio,
    }
