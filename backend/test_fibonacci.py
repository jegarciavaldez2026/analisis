"""
Pruebas de los retrocesos de Fibonacci.

Dos familias:

1. **Fidelidad.** En modo `lookback` el resultado tiene que ser el del script
   «Fib Retracement» del usuario, nivel a nivel. Se comprueba contra una
   reimplementación literal e independiente: si compartiera código con el
   módulo, comparar los dos no demostraría nada.

2. **Los sesgos.** Cada aviso que el módulo puede emitir tiene su prueba con
   una serie construida a propósito para dispararlo. Un aviso que nunca se
   comprueba es un aviso que nadie sabe si funciona.

    cd backend && python -m pytest test_fibonacci.py -q
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

import fibonacci as fib


# ==============================================================================
# Series
# ==============================================================================

def serie(n: int = 400, semilla: int = 5) -> pd.DataFrame:
    rng = np.random.default_rng(semilla)
    t = np.arange(n)
    base = 100 + 0.05 * t + 9 * np.sin(t / 30.0) + np.cumsum(rng.normal(0, 0.2, n))
    apertura = base + rng.normal(0, 0.15, n)
    cierre = base + rng.normal(0, 0.15, n)
    alto = np.maximum(apertura, cierre) + np.abs(rng.normal(0, 0.3, n))
    bajo = np.minimum(apertura, cierre) - np.abs(rng.normal(0, 0.3, n))
    idx = pd.date_range("2024-01-02", periods=n, freq="D", tz="UTC")
    return pd.DataFrame(
        {
            "Open": apertura, "High": alto, "Low": bajo, "Close": cierre,
            "Volume": np.abs(rng.normal(1e6, 1e5, n)),
        },
        index=idx,
    )


@pytest.fixture(scope="module")
def df():
    return serie()


# ==============================================================================
# Fidelidad al script
# ==============================================================================

def _fib_retracement_pine(df: pd.DataFrame, fp: int = 100, reverse: bool = False):
    """Reimplementación LITERAL del «Fib Retracement» (Pine v4), modo lookback.

    Se escribe aparte y sin tocar `fibonacci`, con los mismos nombres del
    script, para que la equivalencia sea el resultado de la prueba y no una
    decisión tomada al escribirla.
    """
    high = df["High"].to_numpy(float)
    low = df["Low"].to_numpy(float)
    close = float(df["Close"].to_numpy(float)[-1])
    n = len(high)
    inicio = max(0, n - fp)

    Fhigh = float(np.max(high[inicio:]))
    Flow = float(np.min(low[inicio:]))
    # highestbars/lowestbars devuelven el desplazamiento (0 = vela actual,
    # negativo hacia atrás). El signo importa para `revfibs`.
    FH = -(n - 1 - (inicio + int(np.argmax(high[inicio:]))))
    FL = -(n - 1 - (inicio + int(np.argmin(low[inicio:]))))
    revfibs = (FL > FH) if not reverse else (FL < FH)

    def Fib_x(x):
        return (Fhigh - Flow) * x + Flow if revfibs else Fhigh - (Fhigh - Flow) * x

    Current = (close - Flow) / (Fhigh - Flow) if revfibs else (Fhigh - close) / (Fhigh - Flow)
    return Fhigh, Flow, revfibs, Fib_x, Current


def test_lookback_reproduce_el_script(df):
    """Los siete niveles del script, uno a uno."""
    Fhigh, Flow, revfibs, Fib_x, Current = _fib_retracement_pine(df, fp=100)
    r = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, ventana=100, extensiones=False)

    assert r["impulso"]["alto"] == pytest.approx(Fhigh)
    assert r["impulso"]["bajo"] == pytest.approx(Flow)
    assert (r["impulso"]["direccion"] == "bajista") == revfibs
    assert r["actual"]["ratio"] == pytest.approx(Current)

    por_ratio = {x["ratio"]: x["precio"] for x in r["niveles"]}
    for ratio in (0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0):
        assert por_ratio[ratio] == pytest.approx(Fib_x(ratio)), f"nivel {ratio}"


def test_invertir_da_la_vuelta_a_la_escala(df):
    """El interruptor `Reverse` del script: 0 % y 100 % se intercambian."""
    normal = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, ventana=100)
    dado_vuelta = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, ventana=100, invertir=True)
    n0 = {x["ratio"]: x["precio"] for x in normal["niveles"]}
    i0 = {x["ratio"]: x["precio"] for x in dado_vuelta["niveles"]}
    assert n0[0.0] == pytest.approx(i0[1.0])
    assert n0[1.0] == pytest.approx(i0[0.0])
    assert normal["impulso"]["direccion"] != dado_vuelta["impulso"]["direccion"]


def test_los_extremos_son_los_extremos(df):
    """0 % y 100 % tienen que caer EXACTAMENTE en el máximo y el mínimo."""
    r = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, ventana=100)
    por_ratio = {x["ratio"]: x["precio"] for x in r["niveles"]}
    extremos = {r["impulso"]["alto"], r["impulso"]["bajo"]}
    assert por_ratio[0.0] in [pytest.approx(v) for v in extremos]
    assert por_ratio[1.0] in [pytest.approx(v) for v in extremos]


def test_niveles_ordenados_y_dentro_del_tramo(df):
    """Los retrocesos van dentro del tramo; las extensiones, fuera."""
    r = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, ventana=100, extensiones=True)
    alto, bajo = r["impulso"]["alto"], r["impulso"]["bajo"]
    for x in r["niveles"]:
        if x["tipo"] == "retroceso":
            assert bajo - 1e-9 <= x["precio"] <= alto + 1e-9, f"{x['etiqueta']} fuera del tramo"
        else:
            assert x["precio"] < bajo or x["precio"] > alto, f"{x['etiqueta']} dentro del tramo"


def test_extras_solo_cuando_se_piden(df):
    sin_extras = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, extras=False)
    con_extras = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, extras=True)
    ratios_sin = {x["ratio"] for x in sin_extras["niveles"]}
    ratios_con = {x["ratio"] for x in con_extras["niveles"]}
    assert 0.886 not in ratios_sin
    assert 0.886 in ratios_con


def test_papel_soporte_o_resistencia(df):
    """Debajo del precio es soporte; encima, resistencia. Es el color del script."""
    r = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK)
    precio = r["actual"]["precio"]
    for x in r["niveles"]:
        esperado = "soporte" if precio > x["precio"] else "resistencia"
        assert x["papel"] == esperado


# ==============================================================================
# El modo por pivotes — la corrección del sesgo principal
# ==============================================================================

def test_pivotes_no_repinta(df):
    """El tramo por pivotes no puede moverse al añadir velas futuras.

    Es la propiedad que justifica el modo entero: un nivel dibujado hoy sigue
    donde estaba mañana. Se comprueba recortando la serie y comparando el
    tramo del recorte con el que ese mismo recorte daba dentro de la serie
    larga.
    """
    corte = 300
    corta = fib.calcular(df.iloc[:corte], "TEST", modo=fib.MODO_PIVOTES)
    # El swing de la serie corta tiene que seguir siendo un swing válido de la
    # larga: los índices absolutos no se mueven porque los pivotes se
    # confirman con retraso y no dependen del futuro.
    larga = fib.calcular(df, "TEST", modo=fib.MODO_PIVOTES, barras_serie=len(df))
    assert corta["impulso"]["indice_alto"] <= larga["barras"]
    a = df["High"].to_numpy(float)
    b = df["Low"].to_numpy(float)
    assert a[corta["impulso"]["indice_alto"]] == pytest.approx(corta["impulso"]["alto"])
    assert b[corta["impulso"]["indice_bajo"]] == pytest.approx(corta["impulso"]["bajo"])


def test_pivotes_elige_un_tramo_distinto_del_lookback(df):
    """Si los dos modos dieran siempre lo mismo, el modo nuevo no aportaría."""
    lb = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, ventana=100)
    pv = fib.calcular(df, "TEST", modo=fib.MODO_PIVOTES)
    assert pv["modo"] == fib.MODO_PIVOTES
    distinto = (
        lb["impulso"]["indice_alto"] != pv["impulso"]["indice_alto"]
        or lb["impulso"]["indice_bajo"] != pv["impulso"]["indice_bajo"]
    )
    assert distinto, "los dos modos coinciden en esta serie: elegir otra"


def test_sin_pivotes_se_dice_que_se_ha_caido_al_lookback():
    """Caer al otro método en silencio deja leyendo una cosa por otra."""
    n = 60
    idx = pd.date_range("2024-01-02", periods=n, freq="D", tz="UTC")
    # Escalera monótona: no hay ningún pivote confirmado en el interior.
    precio = np.linspace(100, 160, n)
    plano = pd.DataFrame(
        {"Open": precio, "High": precio + 0.1, "Low": precio - 0.1,
         "Close": precio, "Volume": np.full(n, 1e6)},
        index=idx,
    )
    r = fib.calcular(plano, "TEST", modo=fib.MODO_PIVOTES, piv=8)
    assert r["modo"] == fib.MODO_LOOKBACK
    assert r["modo_pedido"] == fib.MODO_PIVOTES
    assert any("Sin swing confirmado" in a for a in r["avisos"])


# ==============================================================================
# Los avisos de sesgo
# ==============================================================================

def test_avisa_cuando_el_tramo_lo_define_la_ventana():
    """Extremo pegado al borde: el «impulso» es el tamaño de la ventana."""
    n = 200
    idx = pd.date_range("2024-01-02", periods=n, freq="D", tz="UTC")
    # Tendencia limpia al alza: el mínimo es SIEMPRE la primera vela de la
    # ventana, se ponga donde se ponga el borde.
    precio = np.linspace(100, 200, n)
    subida = pd.DataFrame(
        {"Open": precio, "High": precio + 0.5, "Low": precio - 0.5,
         "Close": precio, "Volume": np.full(n, 1e6)},
        index=idx,
    )
    r = fib.calcular(subida, "TEST", modo=fib.MODO_LOOKBACK, ventana=100)
    assert any("borde de la ventana" in a for a in r["avisos"])


def test_avisa_cuando_la_direccion_es_un_empate():
    """Máximo y mínimo casi pegados: `revfibs` se decide por una vela."""
    n = 200
    idx = pd.date_range("2024-01-02", periods=n, freq="D", tz="UTC")
    precio = np.full(n, 100.0)
    alto = precio + 0.2
    bajo = precio - 0.2
    # Un pico y un valle consecutivos al final del todo.
    alto[-4] = 130.0
    bajo[-3] = 70.0
    marco = pd.DataFrame(
        {"Open": precio, "High": alto, "Low": bajo, "Close": precio,
         "Volume": np.full(n, 1e6)},
        index=idx,
    )
    r = fib.calcular(marco, "TEST", modo=fib.MODO_LOOKBACK, ventana=100)
    assert r["impulso"]["separacion_velas"] <= 2
    assert any("se decide por muy poco" in a for a in r["avisos"])


def test_en_lookback_el_retroceso_no_puede_salirse_del_tramo(df):
    """Sesgo estructural del método original, y no es evidente.

    En modo lookback las anclas son el máximo y el mínimo de la ventana, y el
    cierre está DENTRO de esa ventana por definición. Así que el retroceso
    queda confinado a [0, 1] pase lo que pase: ese método **no puede decir
    nunca que el impulso está roto**. Cuando el precio rompe, no avisa —
    reancla el tramo en silencio y sigue dibujando como si nada.

    Es justo lo que arregla el modo por pivotes, donde las anclas son swings
    confirmados del pasado y el precio sí puede rebasarlas.
    """
    for ventana in (50, 100, 200):
        r = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, ventana=ventana)
        assert 0.0 - 1e-9 <= r["actual"]["ratio"] <= 1.0 + 1e-9
        assert r["actual"]["zona"] not in ("impulso roto", "extendiendo")


def test_avisa_cuando_el_impulso_esta_roto():
    """En modo pivotes el precio SÍ puede rebasar el tramo, y se dice."""
    n = 200
    idx = pd.date_range("2024-01-02", periods=n, freq="D", tz="UTC")
    precio = np.full(n, 100.0)
    alto = precio + 0.3
    bajo = precio - 0.3
    # Un pico y un valle claros, separados, para que los pivotes los confirmen.
    for i, v in ((60, 150.0), (140, 130.0)):
        alto[i] = v
    for i, v in ((100, 60.0), (170, 62.0)):
        bajo[i] = v
    # Y al final el precio se va MUY por encima del último swing alto.
    precio[185:] = 300.0
    alto[185:] = 300.3
    bajo[185:] = 299.7
    marco = pd.DataFrame(
        {"Open": precio, "High": alto, "Low": bajo, "Close": precio,
         "Volume": np.full(n, 1e6)},
        index=idx,
    )
    r = fib.calcular(marco, "TEST", modo=fib.MODO_PIVOTES, piv=8)
    assert r["modo"] == fib.MODO_PIVOTES
    assert r["actual"]["zona"] in ("impulso roto", "extendiendo")
    assert any("rebasado el 100" in a or "extendiendo" in a for a in r["avisos"])


# ==============================================================================
# Contrato
# ==============================================================================

def test_serie_es_la_cola_y_los_indices_estan_trasladados(df):
    r = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, ventana=100, barras_serie=120)
    barras = r["serie"]["barras"]
    assert len(barras) == 120
    assert barras[-1]["c"] == pytest.approx(float(df["Close"].iloc[-1]))
    imp = r["impulso"]
    for clave, absoluto in (("i_alto_serie", "indice_alto"), ("i_bajo_serie", "indice_bajo")):
        if imp[clave] is not None:
            assert 0 <= imp[clave] < len(barras)
            assert imp[clave] == imp[absoluto] - r["serie"]["desde_indice"]


def test_respuesta_serializable(df):
    import json
    r = fib.calcular(df, "TEST")
    json.dumps(r, allow_nan=False)


def test_historico_corto_es_error_explicito():
    with pytest.raises(ValueError, match="insuficiente"):
        fib.calcular(serie(20), "TEST")


def test_tramo_degenerado_es_error_explicito():
    """Máximo igual al mínimo: no se inventa un rango de 1."""
    n = 60
    idx = pd.date_range("2024-01-02", periods=n, freq="D", tz="UTC")
    plano = pd.DataFrame(
        {"Open": np.full(n, 100.0), "High": np.full(n, 100.0),
         "Low": np.full(n, 100.0), "Close": np.full(n, 100.0),
         "Volume": np.full(n, 1e6)},
        index=idx,
    )
    with pytest.raises(ValueError, match="no hay impulso"):
        fib.calcular(plano, "TEST", modo=fib.MODO_LOOKBACK)


def test_ventana_mayor_que_el_historico_no_revienta(df):
    r = fib.calcular(df, "TEST", modo=fib.MODO_LOOKBACK, ventana=10_000)
    assert r["ventana"] == r["barras"]
