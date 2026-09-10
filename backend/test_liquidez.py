"""
Pruebas de las medidas de liquidez que sustituyen al libro de nivel II.

Por qué existen: estas cifras entran en el tamaño de la posición, así que un
error aquí no se ve en pantalla —sale un número plausible— y sí se nota en la
cuenta. La prueba clave no es que la función devuelva algo, es que RECUPERE una
horquilla que hemos puesto nosotros y cuya respuesta conocemos.

    python -m pytest backend/test_liquidez.py -v
"""

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent))

from server import _calc_liquidez_ejecucion, _corwin_schultz_spread  # noqa: E402


def serie_sintetica(
    precio: float = 100.0,
    spread_pct: float = 0.0,
    vol_diaria: float = 0.0,
    n: int = 40,
    semilla: int = 7,
    volumen: float = 1_000_000.0,
) -> pd.DataFrame:
    """
    Serie con una horquilla CONOCIDA metida a mano.

    El máximo y el mínimo del día se construyen como el punto medio más la
    volatilidad intradía y más media horquilla a cada lado, que es exactamente
    el modelo que Corwin y Schultz suponen. Si el estimador está bien escrito,
    con volatilidad cero tiene que devolver `spread_pct` casi clavado.
    """
    rng = np.random.default_rng(semilla)
    mid = precio * np.cumprod(1 + rng.normal(0, vol_diaria, n))
    s = spread_pct / 100.0
    amplitud = mid * vol_diaria
    return pd.DataFrame(
        {
            "Open": mid,
            "High": mid * (1 + s / 2) + amplitud,
            "Low": mid * (1 - s / 2) - amplitud,
            "Close": mid,
            "Volume": np.full(n, volumen),
        }
    )


# ── Corwin-Schultz ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("real", [0.10, 0.25, 0.50, 1.00, 2.00])
def test_recupera_la_horquilla_sin_volatilidad(real):
    """Sin volatilidad intradía el estimador debe clavar la horquilla."""
    estimada = _corwin_schultz_spread(serie_sintetica(spread_pct=real, vol_diaria=0.0))
    assert estimada is not None
    assert estimada == pytest.approx(real, abs=0.02), (
        f"con horquilla real {real}% se estimó {estimada}%"
    )


def test_serie_plana_da_cero_no_ruido():
    """
    Precio constante y sin horquilla: el resultado tiene que ser 0 exacto.

    Es la prueba que caza el fallo típico de esta fórmula: dejar pasar las
    estimaciones negativas, que aquí saldrían como una horquilla diminuta pero
    distinta de cero y se leerían como una medida real.
    """
    assert _corwin_schultz_spread(serie_sintetica(spread_pct=0.0, vol_diaria=0.0)) == 0.0


def test_nunca_devuelve_negativo():
    """Una horquilla negativa no existe. Con ruido puro tampoco debe salir."""
    for semilla in range(12):
        est = _corwin_schultz_spread(
            serie_sintetica(spread_pct=0.0, vol_diaria=0.02, semilla=semilla)
        )
        assert est is None or est >= 0.0


def test_es_monotono_en_la_horquilla():
    """Más horquilla real ⇒ más horquilla estimada, aun con volatilidad."""
    estimaciones = [
        _corwin_schultz_spread(serie_sintetica(spread_pct=s, vol_diaria=0.008))
        for s in (0.05, 0.2, 0.5, 1.0, 2.0)
    ]
    assert all(e is not None for e in estimaciones)
    assert estimaciones == sorted(estimaciones)


def test_sesgo_al_alza_con_volatilidad_alta():
    """
    Documenta el límite del método en vez de esconderlo.

    Con volatilidad alta el estimador NO separa del todo volatilidad de
    horquilla y sobreestima las horquillas pequeñas. Se fija aquí para que si
    alguien "arregla" la fórmula y el sesgo desaparece, la prueba avise de que
    el comportamiento ha cambiado — y para que nadie presente esta cifra como
    la horquilla exacta de un valor líquido.
    """
    estimada = _corwin_schultz_spread(serie_sintetica(spread_pct=0.05, vol_diaria=0.008))
    assert estimada is not None
    assert estimada > 0.05, "el sesgo documentado es al ALZA"
    # Es una cota superior utilizable, no un disparate: se mantiene por debajo
    # del 1 % para una horquilla real del 0,05 %.
    assert estimada < 1.0


def test_pocas_barras_devuelve_none():
    assert _corwin_schultz_spread(serie_sintetica(n=2)) is None


# ── Paquete completo de liquidez ──────────────────────────────────────────────


def test_liquidez_completa_con_datos_normales():
    df = serie_sintetica(precio=50.0, spread_pct=0.25, vol_diaria=0.01)
    r = _calc_liquidez_ejecucion(df, {}, 50.0)

    assert r["disponible"] is True
    assert r["adv_acciones"] == 1_000_000
    # 1 % del volumen medio: la regla de participación.
    assert r["max_acciones_1pct_adv"] == 10_000
    assert r["max_dolares_1pct_adv"] == pytest.approx(500_000, rel=1e-6)
    assert r["amihud_pct_por_millon"] >= 0
    assert r["clasificacion"] in {"alta", "media", "baja"}


def test_descarta_la_horquilla_imposible_en_un_valor_liquido():
    """
    El caso que se coló hasta producción: PBF, 184 M$ de volumen diario y una
    horquilla estimada del 1,45 %. Las dos cosas no pueden ser ciertas a la
    vez. Con mucho volumen y mucha volatilidad, el estimador lee el ATR, así
    que la cifra se descarta y se dice por qué — no se sustituye por otra.
    """
    # Volumen alto (clasifica 'alta') + volatilidad alta (infla el estimador).
    df = serie_sintetica(precio=76.0, spread_pct=0.02, vol_diaria=0.025,
                         volumen=2_500_000.0)
    r = _calc_liquidez_ejecucion(df, {}, 76.0)

    assert r["clasificacion"] == "alta"
    assert r["spread_estimado_pct"] is None, "una horquilla imposible no debe viajar"
    assert r["spread_descartado_pct"] is not None
    assert r["spread_motivo"] and "incompatible" in r["spread_motivo"]


def test_en_un_iliquido_si_admite_horquilla_ancha():
    """El techo de credibilidad depende del volumen: en un valor de poco
    volumen una horquilla ancha es perfectamente creíble y debe pasar."""
    df = serie_sintetica(precio=2.0, spread_pct=1.5, vol_diaria=0.002,
                         volumen=40_000.0)
    r = _calc_liquidez_ejecucion(df, {}, 2.0)
    assert r["clasificacion"] == "baja"
    assert r["spread_estimado_pct"] is not None


def test_clasificacion_sigue_al_volumen_en_dolares():
    """Un valor de mucho volumen es 'alta'; uno de poco, 'baja'."""
    grande = _calc_liquidez_ejecucion(
        serie_sintetica(precio=100.0, volumen=5_000_000.0), {}, 100.0
    )
    pequeno = _calc_liquidez_ejecucion(
        serie_sintetica(precio=2.0, volumen=50_000.0), {}, 2.0
    )
    assert grande["clasificacion"] == "alta"
    assert pequeno["clasificacion"] == "baja"


def test_amihud_sube_cuando_baja_el_volumen():
    """
    El ratio de Amihud mide impacto por dólar: con el MISMO movimiento de
    precio y menos volumen, el impacto tiene que ser mayor. Si no lo es, el
    ratio está invertido — que es el error fácil de cometer aquí.
    """
    liquido = _calc_liquidez_ejecucion(
        serie_sintetica(vol_diaria=0.01, volumen=10_000_000.0), {}, 100.0
    )
    iliquido = _calc_liquidez_ejecucion(
        serie_sintetica(vol_diaria=0.01, volumen=100_000.0), {}, 100.0
    )
    assert iliquido["amihud_pct_por_millon"] > liquido["amihud_pct_por_millon"]


def test_sin_datos_suficientes_no_inventa():
    """Menos de cinco sesiones: hueco declarado, no una cifra por defecto."""
    r = _calc_liquidez_ejecucion(serie_sintetica(n=3), {}, 100.0)
    assert r["disponible"] is False
    assert "motivo" in r


def test_volumen_cero_no_divide_por_cero():
    df = serie_sintetica()
    df["Volume"] = 0.0
    r = _calc_liquidez_ejecucion(df, {}, 100.0)
    assert r["disponible"] is False


def test_precio_cero_no_rompe():
    """Un precio de 0 llega a existir en datos malos de Yahoo. No debe tumbar."""
    r = _calc_liquidez_ejecucion(serie_sintetica(), {}, 0.0)
    assert isinstance(r, dict)
    assert "disponible" in r
