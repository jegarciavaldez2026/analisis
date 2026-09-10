"""
Pruebas de los pivotes de Woodie.

Tres familias:

1. **Las fórmulas**, contra valores calculados a mano. Un pivote mal calculado
   no se nota mirando el gráfico: sale una línea plausible en un precio
   equivocado.
2. **Los errores del texto del usuario**, cada uno con la prueba que demuestra
   que el error existía y que la corrección hace lo que dice.
3. **La máquina de estados**, que es donde de verdad se puede colar un fallo
   silencioso: una secuencia que nunca avanza pasa por «mercado tranquilo».

    cd backend && python -m pytest test_pivots.py -q
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

import pivots


# ==============================================================================
# Series
# ==============================================================================

def intradia(n: int = 900, semilla: int = 4, freq: str = "1h") -> pd.DataFrame:
    rng = np.random.default_rng(semilla)
    t = np.arange(n)
    base = 100 + 0.02 * t + 5 * np.sin(t / 35.0) + np.cumsum(rng.normal(0, 0.18, n))
    ap = base + rng.normal(0, 0.1, n)
    ci = base + rng.normal(0, 0.1, n)
    al = np.maximum(ap, ci) + np.abs(rng.normal(0, 0.28, n))
    ba = np.minimum(ap, ci) - np.abs(rng.normal(0, 0.28, n))
    idx = pd.date_range("2024-01-02 09:30", periods=n, freq=freq, tz="America/New_York")
    return pd.DataFrame(
        {"Open": ap, "High": al, "Low": ba, "Close": ci,
         "Volume": np.abs(rng.normal(1e6, 1.2e5, n))},
        index=idx,
    )


def diaria(n: int = 200, semilla: int = 9) -> pd.DataFrame:
    rng = np.random.default_rng(semilla)
    base = 100 + np.cumsum(rng.normal(0.05, 1.0, n))
    ap = base + rng.normal(0, 0.3, n)
    ci = base + rng.normal(0, 0.3, n)
    al = np.maximum(ap, ci) + np.abs(rng.normal(0, 0.8, n))
    ba = np.minimum(ap, ci) - np.abs(rng.normal(0, 0.8, n))
    idx = pd.date_range("2024-01-02", periods=n, freq="D", tz="UTC")
    return pd.DataFrame(
        {"Open": ap, "High": al, "Low": ba, "Close": ci,
         "Volume": np.abs(rng.normal(5e6, 5e5, n))},
        index=idx,
    )


@pytest.fixture(scope="module")
def df():
    return intradia()


@pytest.fixture(scope="module")
def base():
    return diaria()


# ==============================================================================
# Fórmulas
# ==============================================================================

def test_woodie_usa_la_apertura_actual():
    """La fórmula de Woodie de verdad: (H + L + 2·APERTURA) / 4."""
    n = pivots.niveles_pivote(110.0, 90.0, 100.0, 104.0, pivots.VARIANTE_APERTURA)
    assert n["pp"] == pytest.approx((110 + 90 + 2 * 104) / 4)  # 102.0


def test_variante_del_texto_usa_el_cierre():
    """La del texto: (H + L + 2·CIERRE) / 4. También se calcula, para comparar."""
    n = pivots.niveles_pivote(110.0, 90.0, 100.0, 104.0, pivots.VARIANTE_CIERRE)
    assert n["pp"] == pytest.approx((110 + 90 + 2 * 100) / 4)  # 100.0


def test_las_dos_variantes_difieren_cuando_hay_hueco():
    """Y coinciden EXACTAMENTE cuando no lo hay.

    Es la demostración de cuál es la diferencia real entre las dos: no el peso
    del cierre, sino si el hueco de apertura entra o no en el cálculo.
    """
    sin_hueco = (
        pivots.niveles_pivote(110, 90, 100, 100, pivots.VARIANTE_APERTURA)["pp"],
        pivots.niveles_pivote(110, 90, 100, 100, pivots.VARIANTE_CIERRE)["pp"],
    )
    assert sin_hueco[0] == pytest.approx(sin_hueco[1])

    con_hueco = (
        pivots.niveles_pivote(110, 90, 100, 106, pivots.VARIANTE_APERTURA)["pp"],
        pivots.niveles_pivote(110, 90, 100, 106, pivots.VARIANTE_CIERRE)["pp"],
    )
    assert con_hueco[0] > con_hueco[1], "con hueco al alza el Woodie real sube y el del texto no"


def test_resistencias_y_soportes():
    """R1/S1, R2/S2 y R3/S3, contra la aritmética hecha a mano."""
    H, L, C, O = 110.0, 90.0, 100.0, 104.0
    n = pivots.niveles_pivote(H, L, C, O)
    pp = (H + L + 2 * O) / 4
    assert n["r1"] == pytest.approx(2 * pp - L)
    assert n["s1"] == pytest.approx(2 * pp - H)
    assert n["r2"] == pytest.approx(pp + (H - L))
    assert n["s2"] == pytest.approx(pp - (H - L))
    assert n["r3"] == pytest.approx(H + 2 * (pp - L))
    assert n["s3"] == pytest.approx(L - 2 * (H - pp))


def test_niveles_ordenados():
    """S3 < S2 < S1 < PP < R1 < R2 < R3. Si se cruzan, la escala está rota."""
    n = pivots.niveles_pivote(110.0, 90.0, 100.0, 101.0)
    orden = [n[k] for k in ("s3", "s2", "s1", "pp", "r1", "r2", "r3")]
    assert orden == sorted(orden)


def test_pivote_clasico():
    H, L, C = 110.0, 90.0, 100.0
    n = pivots.niveles_tradicional(H, L, C)
    assert n["pp"] == pytest.approx((H + L + C) / 3)


# ==============================================================================
# VWAP anclado
# ==============================================================================

def test_vwap_se_reinicia_cada_periodo():
    """En la primera barra de cada sesión, el VWAP es el hlc3 de esa barra.

    Si no se reiniciara, arrastraría el precio medio de días anteriores y no
    sería comparable con unos niveles que sí son del día.
    """
    n = 72
    idx = pd.date_range("2024-01-02 00:00", periods=n, freq="1h", tz="UTC")
    precio = np.linspace(100, 130, n)
    marco = pd.DataFrame(
        {"Open": precio, "High": precio + 1, "Low": precio - 1, "Close": precio,
         "Volume": np.full(n, 1000.0)},
        index=idx,
    )
    v = pivots.vwap_anclado(marco, "D")
    for i in (0, 24, 48):
        hlc3 = (marco["High"].iloc[i] + marco["Low"].iloc[i] + marco["Close"].iloc[i]) / 3
        assert v[i] == pytest.approx(hlc3), f"el VWAP no se reinició en la barra {i}"


def test_vwap_es_ponderado_por_volumen():
    """Con volumen concentrado en una barra, el VWAP tira hacia su precio."""
    n = 4
    idx = pd.date_range("2024-01-02 00:00", periods=n, freq="1h", tz="UTC")
    marco = pd.DataFrame(
        {"Open": [100, 100, 200, 100], "High": [100, 100, 200, 100],
         "Low": [100, 100, 200, 100], "Close": [100, 100, 200, 100],
         "Volume": [1.0, 1.0, 1000.0, 1.0]},
        index=idx,
    )
    v = pivots.vwap_anclado(marco, "D")
    assert v[-1] > 199, "el VWAP debería estar dominado por la barra de volumen enorme"


# ==============================================================================
# Contrato del cálculo completo
# ==============================================================================

def test_calculo_completo(df, base):
    r = pivots.calcular(df, base, "TEST", marco="1h")
    assert r["periodo"] == "diario"
    assert len(r["niveles"]) == 7
    assert r["nivel_cercano"] in [x["clave"] for x in r["niveles"]]
    assert r["vwap"]["valor"] is not None


def test_respuesta_serializable(df, base):
    import json
    json.dumps(pivots.calcular(df, base, "TEST", marco="1h"), allow_nan=False)


def test_periodo_por_marco(df, base):
    assert pivots.PERIODO_POR_MARCO["5m"] == "diario"
    assert pivots.PERIODO_POR_MARCO["4h"] == "diario"
    assert pivots.PERIODO_POR_MARCO["1d"] == "semanal"
    assert pivots.PERIODO_POR_MARCO["1w"] == "mensual"


def test_los_niveles_no_dependen_del_marco(df, base):
    """5m y 1H con pivotes diarios enseñan los MISMOS niveles.

    No es un fallo: los pivotes salen del periodo anterior, no de la vela que
    se mira. Lo que cambia con el marco es la señal, no el mapa. Queda fijado
    para que nadie lo «arregle».
    """
    a = pivots.calcular(df, base, "TEST", marco="1h")
    b = pivots.calcular(df, base, "TEST", marco="4h")
    assert [x["precio"] for x in a["niveles"]] == [x["precio"] for x in b["niveles"]]


def test_historico_corto_es_error_explicito(base):
    with pytest.raises(ValueError, match="insuficiente"):
        pivots.calcular(intradia(20), base, "TEST")


def test_periodo_sin_rango_es_error_explicito(df):
    plano = diaria(50).copy()
    plano.iloc[-2, plano.columns.get_loc("High")] = 100.0
    plano.iloc[-2, plano.columns.get_loc("Low")] = 100.0
    with pytest.raises(ValueError, match="no hay pivotes"):
        pivots.calcular(df, plano, "TEST")


# ==============================================================================
# Tasa de toques — la medida que sustituye a las estrellas del texto
# ==============================================================================

def test_tasa_de_toques_decrece_con_la_distancia(df, base):
    """R1 se toca más que R2, y R2 más que R3. Si no, está mal contado."""
    r = pivots.calcular(df, base, "TEST", marco="1h")
    t = {x["clave"]: x["toques_pct"] for x in r["niveles"]}
    assert t["PP"] >= t["R1"] >= t["R2"] >= t["R3"] - 1e-9
    assert t["PP"] >= t["S1"] >= t["S2"] >= t["S3"] - 1e-9


def test_tasa_de_toques_es_una_proporcion(df, base):
    r = pivots.calcular(df, base, "TEST", marco="1h")
    for x in r["niveles"]:
        assert 0.0 <= x["toques_pct"] <= 1.0
        assert x["toques_muestra"] > 0


def test_los_toques_no_miran_el_propio_periodo(base):
    """Los niveles de cada periodo salen del ANTERIOR.

    Si se calcularan con el máximo y el mínimo del periodo que se está
    midiendo, el PP caería siempre dentro del rango y la tasa sería del 100 %:
    look-ahead disfrazado de estadística.
    """
    p = pivots.Parametros(muestra_toques=40)
    t = pivots._tasa_de_toques(base, p)
    assert t["_muestra"] > 0
    assert t["pp"] < 1.0, "un 100 % de toques del PP delata que se está mirando el propio periodo"


# ==============================================================================
# Colinealidad — el error de las «tres confirmaciones»
# ==============================================================================

def test_se_mide_el_acuerdo_entre_pp_y_vwap(df, base):
    r = pivots.calcular(df, base, "TEST", marco="1h")
    col = r["colinealidad"]
    assert col["muestra"] > 0
    assert 0.0 <= col["acuerdo_pct"] <= 100.0


def test_avisa_cuando_pp_y_vwap_son_redundantes():
    """Con una tendencia limpia, PP y VWAP dicen lo mismo casi siempre.

    Ese es justo el caso en que el texto vendería «doble confirmación», y es
    cuando menos vale. La tarjeta tiene que decirlo.
    """
    n = 400
    idx = pd.date_range("2024-01-02 09:30", periods=n, freq="1h", tz="UTC")
    precio = np.linspace(100, 200, n)
    marco = pd.DataFrame(
        {"Open": precio, "High": precio + 0.5, "Low": precio - 0.5, "Close": precio,
         "Volume": np.full(n, 1e6)},
        index=idx,
    )
    b = diaria(120)
    r = pivots.calcular(marco, b, "TEST", marco="1h")
    assert r["colinealidad"]["acuerdo_pct"] >= 85
    assert any("misma lectura contada dos veces" in a for a in r["avisos"])


# ==============================================================================
# Máquina de estados
# ==============================================================================

def test_la_fase_es_valida(df, base):
    r = pivots.calcular(df, base, "TEST", marco="1h")
    assert 0 <= r["fase"]["numero"] <= 3


def test_la_secuencia_avanza_alguna_vez(df, base):
    """Si nunca avanzara, la tarjeta pasaría por «mercado tranquilo» para
    siempre y nadie notaría que la máquina está rota."""
    r = pivots.calcular(df, base, "TEST", marco="1h")
    assert r["senal"]["marcas_totales"] > 0 or r["fase"]["numero"] > 0


def test_la_secuencia_no_dispara_con_las_condiciones_simultaneas():
    """Contraprueba del error 3 del texto.

    Ruptura de estructura y retroceso a la zona son estados OPUESTOS: no hay
    ninguna barra en la que los dos sean ciertos. Se comprueba directamente
    sobre la serie, para que quede claro por qué hace falta la máquina.
    """
    marco = intradia(600, semilla=12)
    a = marco["High"].to_numpy(float)
    b = marco["Low"].to_numpy(float)
    c = marco["Close"].to_numpy(float)
    bas = diaria(150)
    r = pivots.calcular(marco, bas, "TEST", marco="1h")
    pp = r["confluencia"]["pp_woodie"]
    atr_ = r["precio"]["atr"] or 1.0

    simultaneas = 0
    rupturas = 0
    for i in range(20, len(c)):
        techo = float(np.max(a[i - 20:i]))
        rompe = c[i] > techo
        retrocede = abs(c[i] - pp) <= 0.6 * atr_
        rupturas += int(rompe)
        simultaneas += int(rompe and retrocede)

    # No es imposible que coincidan —una ruptura floja puede quedarse dentro de
    # la zona—, pero es residual: menos del 2 % de las rupturas. Evaluar la
    # secuencia como un `and` simultáneo tiraría prácticamente todo.
    assert rupturas > 20, "sin rupturas la prueba no mide nada"
    assert simultaneas <= max(1, rupturas * 0.02), (
        f"{simultaneas} de {rupturas} rupturas coinciden con retroceso: "
        "revisar el supuesto de que son estados opuestos"
    )


def test_el_plan_es_direccionalmente_coherente(df, base):
    """Una compra con el stop por encima de la entrada es geometría rota."""
    r = pivots.calcular(df, base, "TEST", marco="1h")
    s = r["senal"]
    if s["direccion"] == "compra":
        assert s["stop"] < s["entrada"]
        # El objetivo puede faltar: si el precio ya rebasó R3, no queda nivel
        # por delante. Lo que NO puede es apuntar hacia atrás.
        if s["objetivo1"] is not None:
            assert s["objetivo1"] > s["entrada"]
        if s["objetivo2"] is not None:
            assert s["objetivo2"] > s["objetivo1"]
    elif s["direccion"] == "venta":
        assert s["stop"] > s["entrada"]
        if s["objetivo1"] is not None:
            assert s["objetivo1"] < s["entrada"]
        if s["objetivo2"] is not None:
            assert s["objetivo2"] < s["objetivo1"]


def test_marca_como_no_operable_un_objetivo_mas_cerca_que_el_stop(df, base):
    """Mejora 3: la señal se calcula igual, pero se dice que no compensa."""
    r = pivots.calcular(df, base, "TEST", marco="1h")
    s = r["senal"]
    if s["riesgo_beneficio"] is not None:
        assert s["operable"] == (s["riesgo_beneficio"] >= 1.0)
        if not s["operable"]:
            assert s["motivo_no_operable"]


# ==============================================================================
# Serie del gráfico
# ==============================================================================

def test_serie_alineada(df, base):
    r = pivots.calcular(df, base, "TEST", marco="1h", p=pivots.Parametros(barras_serie=120))
    s = r["serie"]
    assert len(s["barras"]) == 120
    assert len(s["vwap"]) == 120
    assert len(s["supertrend"]) == 120


def test_marcas_caen_en_su_vela(df, base):
    r = pivots.calcular(df, base, "TEST", marco="1h", p=pivots.Parametros(barras_serie=900))
    barras = r["serie"]["barras"]
    for m in r["serie"]["marcas"]:
        assert 0 <= m["i"] < len(barras)
        assert barras[m["i"]]["c"] == pytest.approx(m["precio"])


# ==============================================================================
# El veredicto LONG / SHORT
# ==============================================================================

def test_las_seis_condiciones_en_el_orden_pedido(df, base):
    """La lista es la del usuario, literal y en su orden.

    Se comprueba el texto porque la tarjeta es una auditoría: si el orden o la
    redacción se desvían, deja de poder contrastarse con lo que él escribió.
    """
    r = pivots.calcular(df, base, "TEST", marco="1h")
    cond = r["senal"]["condiciones"]
    assert len(cond) == 6
    textos = [c["texto"] for c in cond]
    lado = r["senal"]["lado_auditado"]
    if lado == "long":
        assert textos == [
            "Precio > PP",
            "Precio > VWAP",
            "SuperTrend verde",
            "Rompe un máximo anterior",
            "Retroceso hacia PP/VWAP",
            "Vela de rechazo alcista",
        ]
    else:
        assert textos == [
            "Precio < PP",
            "Precio < VWAP",
            "SuperTrend rojo",
            "Rompe un mínimo anterior",
            "Retroceso hacia PP/VWAP",
            "Rechazo bajista",
        ]


def test_cada_condicion_lleva_su_medida(df, base):
    """Un ✓ sin la cifra detrás no se puede auditar."""
    r = pivots.calcular(df, base, "TEST", marco="1h")
    for c in r["senal"]["condiciones"]:
        assert isinstance(c["cumplida"], bool)
        assert c["detalle"], f"la condición «{c['texto']}» viaja sin medida"


def test_no_hay_veredicto_sin_las_seis(df, base):
    """LONG/SHORT SÓLO con la secuencia completa.

    Es la regla que separa esta tarjeta de «el precio está sobre el PP, compra»
    — justo lo que el texto original advertía de no hacer.
    """
    r = pivots.calcular(df, base, "TEST", marco="1h")
    s = r["senal"]
    if s["veredicto"] is not None:
        assert s["condiciones_cumplidas"] == 6
        assert s["disparo"] is True
    else:
        assert s["condiciones_cumplidas"] < 6 or not s["disparo"]


def test_el_sesgo_no_es_el_veredicto(df, base):
    """Tener sesgo de compra NO es una señal LONG."""
    r = pivots.calcular(df, base, "TEST", marco="1h")
    s = r["senal"]
    assert "direccion" in s and "veredicto" in s
    if s["direccion"] != "ninguna" and not s["disparo"]:
        assert s["veredicto"] is None


def test_el_contador_cuadra_con_la_lista(df, base):
    r = pivots.calcular(df, base, "TEST", marco="1h")
    s = r["senal"]
    assert s["condiciones_cumplidas"] == sum(1 for c in s["condiciones"] if c["cumplida"])


def test_las_tres_primeras_coinciden_con_las_lecturas(df, base):
    """Precio vs PP, precio vs VWAP y SuperTrend salen del mismo sitio que el
    resto de la respuesta. Si divergieran, la tarjeta se contradiría sola."""
    r = pivots.calcular(df, base, "TEST", marco="1h")
    cond = r["senal"]["condiciones"]
    largo = r["senal"]["lado_auditado"] == "long"
    assert cond[0]["cumplida"] == (r["precio"]["sobre_pp"] if largo else not r["precio"]["sobre_pp"])
    assert cond[1]["cumplida"] == (r["precio"]["sobre_vwap"] if largo else not r["precio"]["sobre_vwap"])
    assert cond[2]["cumplida"] == (r["supertrend"]["alcista"] if largo else not r["supertrend"]["alcista"])


def test_las_tres_ultimas_cuadran_con_la_fase(df, base):
    """Ruptura y retroceso son estados de la secuencia, no de la vela de hoy."""
    r = pivots.calcular(df, base, "TEST", marco="1h")
    cond = r["senal"]["condiciones"]
    fase = r["fase"]["numero"]
    lado = r["senal"]["lado_auditado"]
    mismo_lado = r["fase"]["direccion"] == ("compra" if lado == "long" else "venta")
    assert cond[3]["cumplida"] == (fase >= 2 and mismo_lado)
    assert cond[4]["cumplida"] == (fase >= 3 and mismo_lado)
    assert cond[5]["cumplida"] == r["senal"]["disparo"]


def test_la_ultima_senal_apunta_a_una_marca_real(df, base):
    r = pivots.calcular(
        df, base, "TEST", marco="1h", p=pivots.Parametros(barras_serie=900)
    )
    u = r["senal"]["ultima_senal"]
    if u is None:
        assert r["senal"]["marcas_totales"] == 0
        return
    assert u["barras_atras"] >= 0
    assert u["veredicto"] in ("LONG", "SHORT")
    assert (u["veredicto"] == "LONG") == (u["direccion"] == "compra")
    # Y su stop está del lado correcto de la entrada.
    if u["stop"] is not None:
        if u["direccion"] == "compra":
            assert u["stop"] < u["precio"]
        else:
            assert u["stop"] > u["precio"]


def test_las_marcas_llevan_stop(df, base):
    """Sin stop, una señal no es una operación: es una opinión con hora."""
    r = pivots.calcular(
        df, base, "TEST", marco="1h", p=pivots.Parametros(barras_serie=900)
    )
    if r["senal"]["marcas_totales"]:
        u = r["senal"]["ultima_senal"]
        assert u["stop"] is not None
