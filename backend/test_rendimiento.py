"""
Pruebas de rendimiento.py — sin red.

    cd backend && python -m pytest test_rendimiento.py -q
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

import rendimiento as rd


def _diaria(desde: str, hasta: str, inicio: float = 100.0, paso: float = 0.0) -> pd.Series:
    fechas = pd.bdate_range(desde, hasta)
    return pd.Series(inicio * (1 + paso) ** np.arange(len(fechas)), index=fechas)


def test_un_anio_se_mide_por_fecha_y_no_por_sesiones():
    s = _diaria("2020-01-01", "2026-09-14", paso=0.001)
    # Se quitan 30 sesiones del último año: por posición, «252 sesiones atrás»
    # caería mucho antes de la fecha y la rentabilidad saldría inflada.
    s = s.drop(s.index[-200:-170])
    base = s[s.index <= s.index[-1] - pd.DateOffset(years=1)].iloc[-1]
    esperado = (s.iloc[-1] / base - 1) * 100
    assert math.isclose(rd.rentabilidades(s)["1a"], esperado, rel_tol=1e-9)
    por_posicion = (s.iloc[-1] / s.iloc[-253] - 1) * 100
    assert not math.isclose(rd.rentabilidades(s)["1a"], por_posicion, rel_tol=1e-3)


def test_sin_historia_suficiente_no_hay_rentabilidad_a_5_anios():
    s = _diaria("2023-06-01", "2026-09-14", paso=0.0005)
    r = rd.rentabilidades(s)
    assert r["5a"] is None and r["3a"] is not None


def test_ytd_parte_del_ultimo_cierre_del_anio_anterior():
    fechas = pd.to_datetime(["2025-12-30", "2025-12-31", "2026-01-02", "2026-03-02"])
    s = pd.Series([90.0, 100.0, 105.0, 110.0], index=fechas)
    assert math.isclose(rd.rentabilidades(s)["ytd"], 10.0)


def test_beta_cruza_por_fecha():
    fechas = pd.bdate_range("2025-01-01", "2026-09-14")
    rng = np.random.default_rng(7)
    rm = rng.normal(0, 0.01, len(fechas))
    indice = pd.Series(100 * np.cumprod(1 + rm), index=fechas)
    valor = pd.Series(100 * np.cumprod(1 + 2 * rm), index=fechas)
    # El valor pierde 15 sesiones DENTRO del último año (suspensión): por
    # posición, media ventana queda emparejada con días que no son los suyos.
    valor = valor.drop(valor.index[-150:-135])
    b = rd.beta(valor, indice)
    assert b is not None and 1.7 < b < 2.3
    r_pos = valor.pct_change().dropna().values[-252:]
    rm_pos = indice.pct_change().dropna().values[-252:]
    beta_pos = np.cov(r_pos, rm_pos)[0, 1] / np.var(rm_pos, ddof=1)
    assert abs(beta_pos - b) > 0.1


def test_rsi_extremos_y_equilibrio():
    assert rd.rsi(_diaria("2026-01-01", "2026-03-01", paso=0.01)) == 100.0
    alterna = pd.Series([100, 101] * 30, index=pd.bdate_range("2026-01-01", periods=60), dtype=float)
    assert 45 < rd.rsi(alterna) < 55


def test_bollinger_en_la_media_es_50():
    # Ventana de 20 con media 11 y último cierre 11: justo en la media, %B = 50.
    valores = [10.0] + [10.0, 12.0] * 9 + [11.0, 11.0]
    s = pd.Series(valores, index=pd.bdate_range("2026-01-01", periods=len(valores)))
    assert math.isclose(rd.bollinger_pct(s, 20), 50.0, abs_tol=1e-9)


def test_mfi_todo_sube_es_100():
    idx = pd.bdate_range("2026-01-01", periods=30)
    c = pd.Series(np.arange(30) + 10.0, index=idx)
    assert rd.mfi(c + 1, c - 1, c, pd.Series(1000.0, index=idx)) == 100.0


def test_cagr_y_variacion_con_base_negativa():
    assert math.isclose(rd.cagr_pct(100, 133.1, 3), 10.0, rel_tol=1e-9)
    assert rd.cagr_pct(-5, 10, 3) is None
    assert math.isclose(rd.variacion_pct(-1, -2), 50.0)


def test_dividendos_por_anios_completos():
    fechas = pd.to_datetime(["2024-03-01", "2024-09-01", "2025-03-01", "2025-09-01", "2026-03-01"])
    s = pd.Series([0.5, 0.5, 0.55, 0.55, 0.6], index=fechas)
    c = rd.crecimiento_dividendos(s, anio_actual=2026)
    assert math.isclose(c["1a"], 10.0, rel_tol=1e-9)
    # Contraprueba: con 2026 contado, la «caída» sería −45 %
    assert rd.variacion_pct(0.6, 1.1) < -40


def test_competidores_por_tamano_parecido():
    cot = [
        {"symbol": "GRANDE", "marketCap": 5e11, "longName": "Grande"},
        {"symbol": "PAR1", "marketCap": 2.5e7, "longName": "Par uno"},
        {"symbol": "YO", "marketCap": 2e7, "longName": "Yo mismo"},
        {"symbol": "SINCAP", "marketCap": None, "longName": "Warrant"},
        {"symbol": "PAR2", "marketCap": 1.5e7, "longName": "Par dos"},
        # Del tamaño más parecido, pero OTC: fuera
        {"symbol": "OTCF", "marketCap": 2e7, "longName": "Linea OTC", "exchange": "PNK"},
    ]
    elegidos = [q["symbol"] for q in rd.elegir_competidores(cot, "YO", 2e7, n=2)]
    assert elegidos == ["PAR1", "PAR2"]


def test_industria_con_guion_se_traduce_a_la_raya_de_yahoo():
    mapa = {"Technology": ["Software—Infrastructure", "Software—Application"]}
    assert rd.valor_industria_yahoo("Software - Application", mapa) == "Software—Application"
    assert rd.valor_industria_yahoo("Banks - Regional", mapa) is None


def test_metricas_historicas_para_el_screener():
    idx = pd.bdate_range("2020-01-01", "2026-09-14")
    c = pd.Series(100 * 1.0005 ** np.arange(len(idx)), index=idx)
    marco = pd.DataFrame({"Close": c, "High": c * 1.01, "Low": c * 0.99, "Volume": 1e6})
    m = rd.metricas_historicas(marco, c)
    assert set(m) >= {"rent_1a", "rent_5a", "beta_1a", "rsi_14", "vs_sma_50", "vs_max_52s"}
    assert m["rent_1a"] > 0 and m["rsi_14"] == 100.0
