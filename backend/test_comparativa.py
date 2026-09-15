"""
Pruebas de comparativa.py — cartera frente al índice, sin red.

    cd backend && python -m pytest test_comparativa.py -q
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import comparativa as cmp


def _serie(n=260, semilla=1, deriva=0.0004, vol=0.01, inicio="2025-09-01", tz="America/New_York"):
    rng = np.random.default_rng(semilla)
    fechas = pd.bdate_range(inicio, periods=n, tz=tz)
    return pd.Series(100 * np.cumprod(1 + deriva + vol * rng.standard_normal(n)), index=fechas)


def test_posiciones_netas_descuentan_ventas_y_quitan_las_cerradas():
    tx = [
        {"ticker": "aapl", "transaction_type": "buy", "shares": 10},
        {"ticker": "AAPL", "transaction_type": "sell", "shares": 4},
        {"ticker": "MSFT", "transaction_type": "buy", "shares": 5},
        {"ticker": "MSFT", "transaction_type": "sell", "shares": 5},
    ]
    assert cmp.posiciones_actuales(tx) == {"AAPL": 6.0}


def test_cartera_igual_al_indice_da_alfa_cero_correlacion_uno_y_tracking_cero():
    spy = _serie()
    r = cmp.comparar({"SPY": spy}, {"SPY": 3}, spy, 0.04)
    assert r["alpha"] == 0
    assert r["correlation"] == 1
    assert r["tracking_error"] == 0
    assert r["portfolio_return"] == r["benchmark_return"]


def test_la_correlacion_se_calcula_no_es_la_constante_de_antes():
    r = cmp.comparar({"X": _serie(semilla=7)}, {"X": 1}, _serie(semilla=99), 0.04)
    assert r["correlation"] is not None and abs(r["correlation"]) < 0.5
    assert r["correlation"] != 0.85


def test_la_curva_es_la_serie_real_y_no_una_recta():
    serie = _serie(vol=0.03, semilla=3)
    r = cmp.comparar({"X": serie}, {"X": 1}, serie, 0.04)
    valores = [p["value"] for p in r["portfolio_values"]]
    pasos = np.diff(valores)
    # Una interpolación lineal tendría todos los pasos iguales
    assert np.std(pasos) > 0.5


def test_volatilidad_de_la_cartera_incluye_la_diversificacion():
    """Dos valores independientes con la misma volatilidad: la cartera oscila
    menos que cada uno. La media ponderada de antes daba la de cada uno."""
    a, b = _serie(semilla=11, vol=0.02), _serie(semilla=12, vol=0.02)
    ref = _serie(semilla=13)
    solo_a = cmp.comparar({"A": a}, {"A": 1}, ref, 0.04)["portfolio_volatility"]
    mezcla = cmp.comparar({"A": a, "B": b}, {"A": 1, "B": a.iloc[0] / b.iloc[0]}, ref, 0.04)["portfolio_volatility"]
    assert mezcla < solo_a * 0.85


def test_cruza_por_fecha_aunque_las_zonas_horarias_difieran():
    fechas = pd.bdate_range("2025-09-01", periods=260)
    valor = pd.Series(np.linspace(100, 130, 260), index=fechas.tz_localize("America/New_York"))
    indice = pd.Series(np.linspace(100, 130, 260), index=fechas.tz_localize("UTC"))
    r = cmp.comparar({"X": valor}, {"X": 1}, indice, 0.04)
    assert r["sesiones"] == 260
    assert r["alpha"] == 0


def test_contraprueba_emparejar_por_posicion_con_calendarios_distintos_mentiria():
    """El índice tiene festivos que el valor no: cruzado por fecha la cartera
    idéntica al índice sigue dando correlación 1; por posición no."""
    base = _serie(n=260, semilla=5)
    indice = base.drop(base.index[[20, 60, 100, 140]])
    r = cmp.comparar({"X": base}, {"X": 1}, indice, 0.04)
    assert r["correlation"] == 1
    por_posicion = np.corrcoef(base.pct_change().dropna().values[: len(indice) - 1],
                               indice.pct_change().dropna().values)[0, 1]
    assert por_posicion < 0.99


def test_pocas_sesiones_dejan_hueco_con_motivo_en_vez_de_ceros():
    corta = _serie(n=30)
    r = cmp.comparar({"X": corta}, {"X": 1}, corta, 0.04)
    assert r["portfolio_return"] is None and r["correlation"] is None
    assert "sesiones" in r["nota"]


def test_valor_sin_precio_se_declara():
    spy = _serie()
    r = cmp.comparar({"SPY": spy}, {"SPY": 1, "RARO": 10}, spy, 0.04)
    assert r["sin_precio"] == ["RARO"]
    assert r["portfolio_return"] is not None


def test_sin_posiciones():
    r = cmp.comparar({}, {}, _serie(), 0.04)
    assert r["portfolio_return"] is None and r["nota"]
