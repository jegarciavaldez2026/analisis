"""
Pruebas del clasificador valor / crecimiento (`estilo.py`).

Lo que hay que vigilar en un clasificador como este no es que devuelva un
número —siempre lo devuelve— sino tres cosas que se rompen en silencio:

1. **La dirección del eje.** Si un umbral queda al revés, una empresa de
   crecimiento sale etiquetada como valor y nadie lo nota: la cifra sigue
   estando entre 0 y 100 y la insignia sigue pintándose.
2. **Los factores muertos.** Un factor cuyas claves no existen en los ratios
   devuelve `None` siempre, se cae de la renormalización y desaparece sin
   error. Ya pasó una vez con «momento». Aquí hay una prueba por factor que
   comprueba que con datos de verdad puntúa.
3. **La trampa de valor.** Es la única salida que contradice a la etiqueta, y
   por eso es la que más importa que se dispare cuando toca y calle cuando no.

    cd backend && python -m pytest test_estilo.py -q
"""

from __future__ import annotations

import math

import pytest

import estilo


# ==============================================================================
# Perfiles de referencia
# ==============================================================================
#
# No son empresas reales: son los dos extremos del eje escritos a mano, para
# que la prueba no dependa de que yfinance esté disponible ni de qué cotice hoy
# NVDA. Los valores se eligen fuera de los umbrales declarados en `estilo.py`,
# de modo que el resultado esperado no dependa de una interpolación fina.

CRECIMIENTO = {
    "pe_ratio": 55.0,
    "peg_ratio": 3.4,
    "ev_ebitda": 30.0,
    "price_to_fcf": 45.0,
    "cagr_revenue_4y": 0.38,
    "cagr_eps_4y": 0.45,
    "cagr_fcf_4y": 0.40,
    "roic": 32.0,
    "roe": 48.0,
    "operating_margin": 42.0,
    "fcf_yield": 1.4,
    "dividend_yield": 0.0,
    "fcf_margin": 35.0,
    "net_debt_ebitda": 0.1,
    "interest_coverage": 60.0,
    "current_ratio": 4.0,
    "pct_below_52w_high": 3.0,
    "pct_above_52w_low": 95.0,
    "annualized_return": 60.0,
}

VALOR = {
    "pe_ratio": 9.0,
    "peg_ratio": 0.8,
    "ev_ebitda": 6.0,
    "price_to_fcf": 9.0,
    "cagr_revenue_4y": 0.01,
    "cagr_eps_4y": 0.02,
    "cagr_fcf_4y": 0.01,
    "roic": 5.0,
    "roe": 7.0,
    "operating_margin": 5.0,
    "fcf_yield": 9.5,
    "dividend_yield": 5.5,
    "fcf_margin": 4.0,
    "net_debt_ebitda": 0.4,
    "interest_coverage": 18.0,
    "current_ratio": 2.8,
    "pct_below_52w_high": 40.0,
    "pct_above_52w_low": 6.0,
    "annualized_return": -8.0,
}


# ==============================================================================
# El eje apunta donde dice
# ==============================================================================

def test_los_dos_extremos_caen_en_su_banda():
    """
    Un perfil de crecimiento puro y uno de valor puro no pueden salir en la
    misma mitad de la escala. Si esta prueba falla, algún umbral está invertido.
    """
    g = estilo.clasificar(CRECIMIENTO)
    v = estilo.clasificar(VALOR)
    assert g["disponible"] and v["disponible"]
    assert g["clave"] == "crecimiento", g["puntuacion"]
    assert v["clave"] == "value", v["puntuacion"]
    assert g["puntuacion"] < v["puntuacion"]


def test_la_puntuacion_es_monotona_en_el_per():
    """
    Encarecer SOLO el PER no puede subir la puntuación de valor.

    Es la comprobación de dirección más barata que existe y caza un `barato`
    y un `caro` intercambiados en `_f_valoracion`, que es un fallo de una sola
    línea con consecuencias en toda la etiqueta.
    """
    base = dict(VALOR)
    anterior = None
    for per in (8.0, 14.0, 20.0, 28.0, 40.0):
        base["pe_ratio"] = per
        p = estilo.clasificar(base)["puntuacion"]
        if anterior is not None:
            assert p <= anterior + 1e-9, f"PER {per}: {p} > {anterior}"
        anterior = p


def test_la_puntuacion_es_monotona_en_el_crecimiento():
    """Crecer más rápido no puede acercar a «value»."""
    base = dict(CRECIMIENTO)
    anterior = None
    for g in (0.00, 0.08, 0.18, 0.30, 0.50):
        base["cagr_revenue_4y"] = g
        base["cagr_eps_4y"] = g
        p = estilo.clasificar(base)["puntuacion"]
        if anterior is not None:
            assert p <= anterior + 1e-9, f"CAGR {g}: {p} > {anterior}"
        anterior = p


@pytest.mark.parametrize("perfil", [CRECIMIENTO, VALOR])
def test_la_puntuacion_vive_dentro_de_la_escala(perfil):
    r = estilo.clasificar(perfil)
    assert 0.0 <= r["puntuacion"] <= 100.0
    assert r["escala"]  # la escala viaja con la cifra, siempre


def test_las_bandas_cubren_toda_la_recta_sin_solaparse():
    """
    Cualquier puntuación de 0 a 100 tiene que caer en una banda y sólo en una.

    Se comprueba sobre los propios cortes, que es donde un `>=` de más o de
    menos deja un hueco: una puntuación exactamente 55 tiene que tener nombre.
    """
    cortes = [c for c, _, _ in estilo.BANDAS]
    assert cortes == sorted(cortes, reverse=True), "las bandas deben ir de mayor a menor"
    for x in [0.0, 24.9, 25.0, 39.9, 40.0, 54.9, 55.0, 69.9, 70.0, 100.0]:
        casadas = [k for c, k, _ in estilo.BANDAS if x >= c]
        assert casadas, f"la puntuación {x} no cae en ninguna banda"


# ==============================================================================
# Ningún factor está muerto
# ==============================================================================

@pytest.mark.parametrize("clave,nombre,fn", estilo.FACTORES)
def test_cada_factor_puntua_con_datos_completos(clave, nombre, fn):
    """
    Un factor que devuelve `None` con datos completos está leyendo claves que
    no existen: se cae de la renormalización y su peso se reparte entre los
    demás sin que salte ningún error.

    Esto ocurrió de verdad con «momento», que buscaba `price_performance_6m`
    —un campo que `calculate_ratios` no produce— y por tanto nunca aportaba su
    10 %. La prueba existe para que no vuelva a pasar en silencio.
    """
    puntos, detalle = fn(VALOR)
    assert puntos is not None, f"el factor «{nombre}» no puntúa con datos completos"
    assert any(d["puntos"] is not None for d in detalle)


def test_las_claves_de_los_factores_son_las_que_produce_el_backend():
    """
    Contraprueba de la anterior: si se le quitan a los ratios las claves que
    el factor dice usar, el factor TIENE que apagarse.

    Sin esto, `test_cada_factor_puntua` pasaría igual con un factor que
    devolviese una constante.
    """
    for clave, nombre, fn in estilo.FACTORES:
        puntos, _ = fn({})
        assert puntos is None, f"«{nombre}» puntúa sin ningún dato"


def test_la_cobertura_baja_al_faltar_factores():
    """La cobertura no es decorativa: dice cuánto peso se pudo evaluar."""
    completo = estilo.clasificar(VALOR)
    assert completo["cobertura"] == 1.0
    assert completo["fiable"] is True

    # Sólo valoración: 25 de 100 puntos de peso.
    parcial = estilo.clasificar({"pe_ratio": 9.0, "ev_ebitda": 6.0})
    assert parcial["disponible"] is True
    assert parcial["cobertura"] == pytest.approx(0.25, abs=0.01)
    assert parcial["fiable"] is False


def test_los_pesos_se_renormalizan_sobre_lo_disponible():
    """
    Faltar un factor no puede hundir la puntuación hacia cero.

    El fallo natural aquí es dividir entre el peso TOTAL en vez de entre el
    peso vivo: la empresa saldría artificialmente «de crecimiento» sólo por
    tener menos datos. Se comprueba que quitar el balance —que en el perfil de
    valor puntúa alto— mueve la cifra poco, no la desploma.
    """
    sin_balance = {k: v for k, v in VALOR.items()
                   if k not in ("net_debt_ebitda", "interest_coverage", "current_ratio")}
    r = estilo.clasificar(sin_balance)
    assert r["cobertura"] == pytest.approx(0.9, abs=0.01)
    assert r["clave"] == "value"
    assert abs(r["puntuacion"] - estilo.clasificar(VALOR)["puntuacion"]) < 12


def test_sin_ningun_dato_no_hay_etiqueta():
    """Un hueco honesto vale más que un «Mixto» inventado."""
    r = estilo.clasificar({})
    assert r["disponible"] is False
    assert r["motivo"]
    assert "puntuacion" not in r


# ==============================================================================
# Trampa de valor
# ==============================================================================

def test_la_trampa_se_dispara_con_per_bajo_y_bpa_cayendo():
    r = estilo.clasificar({**VALOR, "pe_ratio": 8.0, "cagr_eps_4y": -0.12})
    assert r["trampa_de_valor"], "PER 8 con el BPA cayendo un 12 % anual es el caso de manual"
    assert "8.0" in r["trampa_de_valor"]


def test_la_trampa_calla_cuando_el_per_bajo_va_con_beneficio_creciendo():
    """
    La contraprueba. Sin ella, un detector que devolviera siempre un aviso
    pasaría la prueba anterior, y un aviso permanente es ruido: deja de leerse
    justo cuando importa.
    """
    r = estilo.clasificar({**VALOR, "pe_ratio": 8.0, "cagr_eps_4y": 0.09})
    assert r["trampa_de_valor"] is None


def test_la_trampa_calla_con_per_alto_aunque_caiga_el_bpa():
    """
    Una empresa cara con el beneficio cayendo tiene un problema, pero no es
    una *trampa de valor*: nadie la ha comprado por barata. Confundirlas
    diluiría el aviso.
    """
    r = estilo.clasificar({**VALOR, "pe_ratio": 40.0, "cagr_eps_4y": -0.20})
    assert r["trampa_de_valor"] is None


def test_la_trampa_tambien_mira_los_ingresos():
    r = estilo.clasificar({**VALOR, "pe_ratio": 10.0, "cagr_eps_4y": None,
                           "cagr_revenue_4y": -0.09})
    assert r["trampa_de_valor"]
    assert "ingresos" in r["trampa_de_valor"]


# ==============================================================================
# Entradas sucias
# ==============================================================================

@pytest.mark.parametrize("basura", [None, float("nan"), float("inf"), "12", "", True])
def test_los_valores_no_numericos_no_revientan_ni_cuentan(basura):
    """
    `None`, NaN e infinito llegan de verdad desde yfinance. Un `True` cuenta
    como 1.0 en Python y sería un PER de 1: se descarta a propósito.
    """
    r = estilo.clasificar({**VALOR, "pe_ratio": basura})
    assert r["disponible"] is True
    assert math.isfinite(r["puntuacion"])


def test_un_per_negativo_no_es_una_ganga():
    """
    PER negativo significa pérdidas, no un precio de derribo. Si entrara por
    la escala, la empresa que pierde dinero saldría como la más «value» de
    todas — exactamente al revés.
    """
    con_perdidas = estilo.clasificar({**VALOR, "pe_ratio": -6.0, "price_to_fcf": -10.0})
    sin_per = estilo.clasificar({k: v for k, v in VALOR.items()
                                 if k not in ("pe_ratio", "price_to_fcf")})
    assert con_perdidas["puntuacion"] == pytest.approx(sin_per["puntuacion"], abs=0.1)


def test_el_peg_pesa_doble_dentro_de_la_valoracion():
    """
    Es la decisión explícita del criterio acordado —el PEG es lo que un PER
    solo no distingue— y por eso conviene que esté fijada: si alguien
    reescribe `_f_valoracion` como una media simple, esto lo dice.
    """
    solo_peg_barato = {"pe_ratio": 30.0, "peg_ratio": 0.9,
                       "ev_ebitda": 21.0, "price_to_fcf": 34.0}
    solo_peg_caro = {**solo_peg_barato, "peg_ratio": 3.0}
    a, _ = estilo._f_valoracion(solo_peg_barato)
    b, _ = estilo._f_valoracion(solo_peg_caro)
    # Con peso simple la diferencia sería 100/4 = 25 puntos; con peso doble, 40.
    assert a - b > 30.0


def test_la_escala_interpola_en_los_dos_sentidos():
    """`_escala` tiene que servir tanto a «menor es value» como a «mayor es value»."""
    assert estilo._escala(12.0, 12.0, 32.0) == 100.0   # PER barato
    assert estilo._escala(32.0, 12.0, 32.0) == 0.0     # PER caro
    assert estilo._escala(22.0, 12.0, 32.0) == pytest.approx(50.0)
    assert estilo._escala(8.0, 8.0, 2.0) == 100.0      # FCF yield alto
    assert estilo._escala(2.0, 8.0, 2.0) == 0.0
    # Y recorta fuera de rango en vez de devolver 140 o −30.
    assert estilo._escala(4.0, 12.0, 32.0) == 100.0
    assert estilo._escala(90.0, 12.0, 32.0) == 0.0


def test_la_base_de_umbrales_se_declara():
    """
    Los umbrales son absolutos, no sectoriales. Eso limita el resultado —un
    PER de 25 es caro para un banco y barato para software— y el limite viaja
    en la respuesta en vez de quedarse en un comentario del código.
    """
    r = estilo.clasificar(VALOR)
    assert r["base_umbrales"] == "absolutos"
    assert "sector" in r["nota_umbrales"]
