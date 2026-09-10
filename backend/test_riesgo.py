"""
Pruebas del panel de riesgo de mercado.

Un módulo de riesgo es especialmente peligroso porque **siempre devuelve un
número plausible**. Un Sortino inflado, una beta calculada sobre series
descuadradas o un CVaR que en realidad es el VaR salen todos con la magnitud
correcta y el signo correcto: no hay nada en la pantalla que delate el fallo.
Por eso casi todas las pruebas de aquí son de dos tipos:

1. **Recuperar un valor conocido.** Se construye una serie cuya respuesta se
   sabe a mano y se comprueba que sale esa.
2. **Contraprueba del error clásico.** Se demuestra que el cálculo correcto y
   el incorrecto dan resultados distintos sobre el mismo dato, para que la
   prueba falle si alguien «simplifica» el código de vuelta al error.

    cd backend && python -m pytest test_riesgo.py -q
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

import riesgo


# ==============================================================================
# Series
# ==============================================================================

def serie(valores, inicio="2021-01-04"):
    idx = pd.bdate_range(inicio, periods=len(valores))
    return pd.Series(valores, index=idx, dtype=float)


def paseo(n=1300, semilla=7, deriva=0.0004, vol=0.015):
    rng = np.random.default_rng(semilla)
    r = rng.normal(deriva, vol, n)
    return serie(100.0 * np.cumprod(1.0 + r))


@pytest.fixture
def precios():
    return paseo()


@pytest.fixture
def indice():
    return paseo(semilla=99, deriva=0.0003, vol=0.010)


# ==============================================================================
# Caídas
# ==============================================================================

def test_el_maximo_drawdown_es_de_pico_a_valle_conocido():
    """100 → 120 → 60 → 90. La caída es de 120 a 60: −50 %, no −40 % desde 100."""
    r = riesgo._drawdowns(serie([100, 110, 120, 90, 60, 75, 90]))
    assert r["max_drawdown"] == pytest.approx(-50.0, abs=0.01)


def test_el_drawdown_no_es_la_peor_racha_de_dias():
    """
    Contraprueba. Una serie que cae en tres tramos separados por rebotes tiene
    una caída acumulada mucho mayor que su peor día o su peor racha seguida.
    Si alguien reimplementa esto sumando días negativos, este número cambia.
    """
    s = serie([100, 90, 95, 85, 90, 80, 85, 70])
    r = riesgo._drawdowns(s)
    peor_dia = float(pd.Series(s).pct_change().min() * 100)   # −17,6 %
    assert r["max_drawdown"] == pytest.approx(-30.0, abs=0.01)
    # La caída acumulada es peor que la de CUALQUIER sesión suelta, porque los
    # rebotes intermedios no devuelven el precio al pico.
    assert r["max_drawdown"] < peor_dia


def test_una_serie_que_solo_sube_no_tiene_caida():
    r = riesgo._drawdowns(serie([100, 101, 102, 103, 104]))
    assert r["max_drawdown"] == pytest.approx(0.0)
    assert r["ulcer_index"] == pytest.approx(0.0)


def test_marca_si_la_caida_no_se_ha_recuperado():
    """Que el precio siga por debajo del pico anterior cambia cómo se lee todo."""
    sin_recuperar = riesgo._drawdowns(serie([100, 120, 60, 70, 80]))
    assert sin_recuperar["drawdown_recuperado"] is False
    assert sin_recuperar["drawdown_actual"] < 0

    recuperada = riesgo._drawdowns(serie([100, 120, 60, 90, 130]))
    assert recuperada["drawdown_recuperado"] is True
    assert recuperada["drawdown_actual"] == pytest.approx(0.0)


def test_el_ulcer_distingue_dos_caidas_del_mismo_tamano():
    """
    La razón de ser del Ulcer Index: mismo máximo drawdown, distinta duración.
    Si diera lo mismo en los dos casos, no aportaría nada sobre el drawdown.
    """
    rapida = riesgo._drawdowns(serie([100, 50] + [100] * 20))
    lenta = riesgo._drawdowns(serie([100, 50] + [50] * 19 + [100]))
    assert rapida["max_drawdown"] == pytest.approx(lenta["max_drawdown"], abs=0.01)
    assert lenta["ulcer_index"] > rapida["ulcer_index"] * 2


# ==============================================================================
# Sortino: el error clásico
# ==============================================================================

def test_la_desviacion_bajista_divide_entre_el_total_no_entre_las_caidas():
    """
    **La contraprueba que justifica el módulo.**

    Con una serie que sube casi siempre y cae fuerte muy de vez en cuando, las
    dos fórmulas se separan mucho: dividir entre el número de días malos
    (en vez de entre todos) da una desviación bajista mucho MAYOR... y por
    tanto un Sortino menor. Al revés de lo que suele decirse, el error habitual
    —dividir entre los días bajistas— penaliza de más a los valores que caen
    poco. En cualquier caso da otro número, y el correcto es el del total.
    """
    r = pd.Series([0.01] * 90 + [-0.10] * 10)
    correcta = riesgo._desviacion_bajista(r, 0.0)

    faltas = np.minimum(r.values, 0.0)
    negativos = faltas[faltas < 0]
    incorrecta = float(np.sqrt(np.sum(np.square(negativos)) / len(negativos))) * math.sqrt(riesgo.SESIONES)

    assert correcta == pytest.approx(
        float(np.sqrt(np.sum(np.square(faltas)) / len(r))) * math.sqrt(riesgo.SESIONES)
    )
    assert abs(correcta - incorrecta) / incorrecta > 0.5, "las dos fórmulas deben separarse"


def test_la_volatilidad_al_alza_no_baja_el_sortino():
    """
    La razón de ser de Sortino. Se toma una serie y se le AMPLIFICAN sólo los
    días buenos: el Sharpe empeora (más volatilidad) y el Sortino no puede
    empeorar, porque nada de lo que ha pasado es una pérdida mayor.
    """
    base = paseo(600, semilla=11)
    r = riesgo._rendimientos(base)
    amplificados = r.where(r <= 0, r * 2.5)
    otra = serie((100.0 * (1 + amplificados).cumprod()).values)

    a = riesgo.metricas(base)
    b = riesgo.metricas(otra)
    assert b["volatilidad_5a"] > a["volatilidad_5a"]
    assert b["desviacion_bajista"] == pytest.approx(a["desviacion_bajista"], rel=0.02)
    assert b["sortino"] > a["sortino"]


def test_sortino_y_sharpe_usan_la_misma_ventana(precios):
    """
    Comparar un Sortino de cinco años con un Sharpe de uno no dice nada, y ése
    era el motivo de añadir `sharpe_5a` en vez de reutilizar el que ya existía.
    """
    m = riesgo.metricas(precios)
    assert m["sharpe_5a"] is not None and m["sortino"] is not None
    # Con rendimientos casi simétricos los dos quedan en el mismo orden de
    # magnitud; si uno saliera diez veces el otro, hay ventanas distintas.
    assert 0.2 < abs(m["sortino"] / m["sharpe_5a"]) < 5


# ==============================================================================
# Colas
# ==============================================================================

def test_el_cvar_es_la_media_de_la_cola_no_el_punto_de_corte():
    """
    Otro error silencioso: devolver el cuantil y llamarlo CVaR. El CVaR es
    siempre PEOR (más negativo) que el VaR salvo que la cola sea plana.
    """
    rng = np.random.default_rng(3)
    r = pd.Series(rng.standard_t(3, 2000) / 100.0)
    t = riesgo._tail(r)
    assert t["cvar_95"] < t["var_95"], "el CVaR tiene que ser peor que el VaR"


def test_la_curtosis_es_en_exceso():
    """0 en una normal. Si saliera ~3, se estaría publicando la curtosis cruda."""
    rng = np.random.default_rng(5)
    t = riesgo._tail(pd.Series(rng.normal(0, 0.01, 20000)))
    assert abs(t["curtosis"]) < 0.3


def test_las_colas_gruesas_se_ven(precios):
    """Contraprueba de la anterior: con una t de Student la curtosis se dispara."""
    rng = np.random.default_rng(5)
    t = riesgo._tail(pd.Series(rng.standard_t(3, 5000) / 100.0))
    assert t["curtosis"] > 2


def test_la_asimetria_negativa_marca_las_sorpresas_a_la_baja():
    r = pd.Series([0.005] * 200 + [-0.15, -0.12, -0.18])
    assert riesgo._tail(r)["asimetria"] < -1


# ==============================================================================
# Frente al índice
# ==============================================================================

def test_las_series_se_cruzan_por_fecha_no_por_posicion(precios, indice):
    """
    **El fallo más caro de este cálculo.** Si se emparejan por posición, quitar
    unos cuantos días del índice —festivos distintos, que es lo normal— produce
    una beta perfectamente creíble y sin ningún significado.

    Aquí se quitan 40 días sueltos al índice: la beta tiene que moverse poco,
    porque los días que quedan siguen emparejados con SU fecha. Con
    emparejamiento posicional, todo lo posterior al primer hueco se desplaza y
    la correlación se derrumba.
    """
    base = riesgo.metricas(precios, indice)
    rng = np.random.default_rng(1)
    quitar = rng.choice(indice.index[50:-50], size=40, replace=False)
    mellado = indice.drop(quitar)
    tras = riesgo.metricas(precios, mellado)

    assert tras["beta_5a"] == pytest.approx(base["beta_5a"], abs=0.15)
    assert tras["r_cuadrado"] == pytest.approx(base["r_cuadrado"], abs=8)


def test_beta_uno_y_r_cuadrado_cien_cuando_es_el_propio_indice(precios):
    m = riesgo.metricas(precios, precios)
    assert m["beta_5a"] == pytest.approx(1.0, abs=1e-6)
    assert m["r_cuadrado"] == pytest.approx(100.0, abs=1e-6)
    assert m["tracking_error"] == pytest.approx(0.0, abs=1e-9)
    assert m["captura_alcista"] == pytest.approx(100.0, abs=1e-6)
    assert m["captura_bajista"] == pytest.approx(100.0, abs=1e-6)


def test_el_doble_del_indice_da_beta_dos(precios):
    """
    Un valor que replica el índice apalancado x2 en cada sesión.

    La beta diaria sale exactamente 2. Las capturas, medidas en meses, salen
    por ENCIMA de 100 pero por debajo de 200, y eso no es un fallo: un producto
    apalancado que se rebalancea a diario no entrega el doble del rendimiento
    mensual — se lo come el decaimiento por volatilidad. Que la captura recoja
    ese efecto y la beta no es justamente lo que aporta la métrica.
    """
    rm = riesgo._rendimientos(precios)
    doble = serie((100.0 * (1 + 2 * rm).cumprod()).values, inicio=str(rm.index[0].date()))
    m = riesgo.metricas(doble, precios.loc[rm.index])
    assert m["beta_5a"] == pytest.approx(2.0, abs=0.02)
    assert m["captura_alcista"] == pytest.approx(200.0, abs=15)
    assert m["captura_bajista"] == pytest.approx(200.0, abs=15)


def test_la_captura_no_se_calcula_ni_promediando_ni_acumulando(precios, indice):
    """
    Contraprueba de los dos métodos ingenuos, cada uno donde se le ve el fallo.

    1. **Promediar el cociente día a día.** El índice cierra casi plano la mitad
       de las sesiones y esas divisiones por casi cero dominan la media. Se
       comprueba sobre datos sueltos: da otra cosa.

    2. **Componer todas las sesiones y dividir los acumulados.** Se comprueba
       sobre el índice apalancado x2, que es donde la respuesta correcta se
       conoce sin discusión: su captura bajista es ~200 %. Componer los ~690
       días bajistas lleva las dos series a −100 % —−0,9996 y −0,99999984— y el
       cociente sale **100,04 %**. Saturado, y perfectamente creíble.
    """
    m = riesgo.metricas(precios, indice)
    par = pd.concat([riesgo._rendimientos(precios), riesgo._rendimientos(indice)], axis=1).dropna()
    a, b = par.iloc[:, 0].values, par.iloc[:, 1].values
    sube = b > 0
    ingenuo = float(np.mean(a[sube] / b[sube])) * 100.0
    assert abs(m["captura_alcista"] - ingenuo) > 5, "el promedio de cocientes debe dar otra cosa"

    rm = riesgo._rendimientos(indice)
    doble = serie((100.0 * (1 + 2 * rm).cumprod()).values, inicio=str(rm.index[0].date()))
    md = riesgo.metricas(doble, indice.loc[rm.index])
    rd = riesgo._rendimientos(doble).values
    rb = rm.values[1:]
    baja = rb < 0
    acumulado = (np.prod(1 + rd[baja]) - 1) / (np.prod(1 + rb[baja]) - 1) * 100.0

    assert md["captura_bajista"] == pytest.approx(200.0, abs=15), "la respuesta correcta"
    assert abs(acumulado - 100.0) < 3.0, "el acumulado diario satura en 100 %"

def test_las_capturas_separan_lo_que_la_beta_promedia():
    """
    La razón de ser de las capturas. Se fabrica un valor que sigue al índice al
    subir pero amplifica al caer: la beta sale cerca de 1 y las dos capturas,
    muy distintas. Con la beta sola, esa asimetría no se ve.
    """
    idx = paseo(900, semilla=21, deriva=0.0005, vol=0.010)
    rm = riesgo._rendimientos(idx)
    # Amplificar sólo los días bajistas, y poco: un 10 %. Más que eso destruye
    # tanto capital que el valor pierde dinero incluso en los meses en que el
    # índice sube —la captura alcista sale negativa— y deja de ser el régimen
    # realista que esta prueba quiere describir.
    asimetrico = rm.where(rm >= 0, rm * 1.10)
    val = serie((100.0 * (1 + asimetrico).cumprod()).values, inicio=str(rm.index[0].date()))
    m = riesgo.metricas(val, idx.loc[rm.index])

    # La beta dice «casi como el mercado» y se queda tan ancha...
    assert m["beta_5a"] == pytest.approx(1.05, abs=0.10)
    # ...mientras las capturas enseñan un perfil malo: menos subida y más bajada.
    assert m["captura_alcista"] < 90
    assert m["captura_bajista"] > 115
    assert m["captura_bajista"] - m["captura_alcista"] > 30


def test_sin_indice_no_se_inventan_las_metricas_relativas(precios):
    m = riesgo.metricas(precios)
    for k in ("beta_5a", "r_cuadrado", "alfa_jensen", "tracking_error", "ratio_informacion"):
        assert k not in m


def test_con_pocas_sesiones_comunes_no_se_publica_beta(precios):
    """40 días comunes no bastan para una beta; devolver una sería inventarla."""
    corto = precios.iloc[:40]
    m = riesgo.metricas(precios, corto)
    assert "beta_5a" not in m


# ==============================================================================
# Entrada pública
# ==============================================================================

def test_la_tasa_sin_riesgo_entra_en_los_tres_ratios(precios):
    """Sharpe, Sortino y alfa miden EXCESO. Con tipos al 4 % no da igual."""
    a = riesgo.metricas(precios, tasa_sin_riesgo=0.0)
    b = riesgo.metricas(precios, tasa_sin_riesgo=0.05)
    assert a["sharpe_5a"] > b["sharpe_5a"]
    assert a["sortino"] > b["sortino"]


def test_el_retorno_anualizado_es_geometrico(precios):
    """
    El que se lleva el partícipe. Se comprueba contra la definición: el capital
    final entre el inicial, elevado a 1/años.
    """
    m = riesgo.metricas(precios)
    total = float(precios.iloc[-1] / precios.iloc[0])
    esperado = (total ** (riesgo.SESIONES / m["sesiones"]) - 1.0) * 100.0
    assert m["retorno_5a"] == pytest.approx(esperado, rel=0.01)


@pytest.mark.parametrize("serie_corta", [
    pd.Series(dtype=float),
    pd.Series([100.0]),
    pd.Series([100.0] * 30),
])
def test_sin_serie_suficiente_devuelve_vacio(serie_corta):
    """Un hueco es honesto; un cero se leería como «sin riesgo»."""
    assert riesgo.metricas(serie_corta) == {}


def test_ningun_valor_es_nan_ni_infinito(precios, indice):
    m = riesgo.metricas(precios, indice)
    for k, v in m.items():
        if isinstance(v, float):
            assert math.isfinite(v), f"{k} = {v}"


def test_una_serie_plana_no_revienta():
    """Volatilidad cero: los ratios que dividen por ella deben callar, no romper."""
    m = riesgo.metricas(serie([100.0] * 400))
    assert m["volatilidad_5a"] == pytest.approx(0.0)
    assert m["sharpe_5a"] is None or math.isfinite(m["sharpe_5a"])
    assert m["max_drawdown"] == pytest.approx(0.0)
