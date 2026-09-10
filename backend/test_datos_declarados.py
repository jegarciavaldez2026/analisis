"""
Pruebas de los campos que llegan declarados por el proveedor.

El error que motiva este archivo: la pantalla de Análisis mostró
**«Rentab. dividendo 569,00 %»** para VZ. No era un fallo de cálculo ni de
maquetación, era una **unidad**. `dividendYield` de yfinance pasó de ser una
fracción (0,0569) a ser un porcentaje (5,69) entre versiones de la librería, y
el código seguía multiplicando por 100 en tres sitios.

La lección que se fija aquí: **un campo declarado por un tercero no es un dato
verificado**. Su unidad puede cambiar sin previo aviso y sin romper nada — el
tipo sigue siendo `float`, la petición sigue devolviendo 200 y el número sigue
pintándose. Por eso `_rentabilidad_dividendo` se ancla en una división que no
admite interpretación, dividendo entre precio, y sólo recurre al campo
declarado cuando no puede calcularla.

    cd backend && python -m pytest test_datos_declarados.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from server import _rentabilidad_dividendo  # noqa: E402


# ==============================================================================
# El caso que se rompió
# ==============================================================================

def test_vz_no_reparte_el_569_por_ciento():
    """
    Los números de VZ del 10 de septiembre de 2026, tal como los devuelve
    yfinance 1.2.0. La respuesta correcta es 5,66 %, no 569.
    """
    info = {"dividendRate": 2.83, "currentPrice": 49.97, "dividendYield": 5.69}
    assert _rentabilidad_dividendo(info) == pytest.approx(5.66, abs=0.01)


@pytest.mark.parametrize(
    "ticker,rate,precio,declarado,esperado",
    [
        ("VZ", 2.83, 49.97, 5.69, 5.66),
        ("KO", 2.12, 87.83, 2.40, 2.41),
        ("AAPL", 1.08, 326.57, 0.34, 0.33),
        ("T", 1.11, 25.55, 4.41, 4.34),
        ("MSFT", 3.64, 492.44, 0.74, 0.74),
        ("O", 3.26, 59.57, 5.42, 5.47),
    ],
)
def test_el_calculo_coincide_con_el_campo_declarado(ticker, rate, precio, declarado, esperado):
    """
    La prueba de que la división y el campo miden lo mismo.

    Se comprueban las dos cosas a la vez: que el resultado es el esperado, y
    que **no se aleja del valor declarado** más de tres décimas. Si algún día
    yfinance vuelve a cambiar la convención, esta segunda mitad es la que lo
    dirá, porque la primera seguiría pasando tan campante.
    """
    obtenido = _rentabilidad_dividendo(
        {"dividendRate": rate, "currentPrice": precio, "dividendYield": declarado}
    )
    assert obtenido == pytest.approx(esperado, abs=0.01), ticker
    assert abs(obtenido - declarado) < 0.3, f"{ticker}: {obtenido} frente a {declarado}"


# ==============================================================================
# Las dos convenciones del campo declarado
# ==============================================================================

def test_sin_precio_se_deduce_la_unidad_del_campo():
    """
    Sin precio no hay división posible y hay que fiarse del campo. Entonces la
    magnitud decide: 0,0569 sólo puede ser una fracción y 5,69 sólo puede ser
    un porcentaje. Ninguna empresa reparte el 569 % ni cotiza con un 0,0569 %.
    """
    assert _rentabilidad_dividendo({"dividendYield": 0.0569}) == pytest.approx(5.69, abs=0.01)
    assert _rentabilidad_dividendo({"dividendYield": 5.69}) == pytest.approx(5.69, abs=0.01)


def test_la_division_manda_sobre_el_campo():
    """
    Cuando ambos caminos están disponibles gana el cálculo, no el campo. Es la
    decisión de fondo: la definición del ratio no cambia entre versiones de una
    librería.
    """
    info = {"dividendRate": 2.83, "currentPrice": 49.97, "dividendYield": 0.0569}
    assert _rentabilidad_dividendo(info) == pytest.approx(5.66, abs=0.01)


def test_precio_de_respaldo_cuando_no_hay_precio_actual():
    """Fuera de horario `currentPrice` viene vacío; el cierre anterior sirve."""
    assert _rentabilidad_dividendo(
        {"dividendRate": 2.83, "previousClose": 49.97}
    ) == pytest.approx(5.66, abs=0.01)


# ==============================================================================
# Ausencia frente a cero
# ==============================================================================

@pytest.mark.parametrize("info", [
    {},
    {"dividendYield": None},
    {"dividendYield": 0},
    {"dividendRate": 0, "currentPrice": 50.0},
    {"dividendRate": 2.0, "currentPrice": 0},
    {"dividendYield": "n/d"},
    None,
])
def test_sin_dato_devuelve_none_y_no_cero(info):
    """
    Un 0 se lee como «no reparte dividendo». Es una afirmación sobre la
    empresa, y distinta de «no lo sé». Los sitios que llaman a esta función
    deciden qué hacer con el hueco; la función no lo rellena por su cuenta.
    """
    assert _rentabilidad_dividendo(info) is None


def test_un_negativo_no_es_una_rentabilidad():
    assert _rentabilidad_dividendo({"dividendYield": -1.2}) is None
