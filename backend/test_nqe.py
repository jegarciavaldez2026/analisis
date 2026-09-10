"""
Pruebas del motor NQE.

La que importa de verdad es `test_sin_lookahead`: truncar la serie no puede
cambiar lo que el motor dijo en el tramo común. Si algún día falla, hay
look-ahead y todo lo demás sobra — un gate calculado con el futuro no valida
nada, sólo da confianza.

Las demás cierran las trampas que el propio Pine documenta: empate intrabar
resuelto como stop, Wilson por debajo de la proporción observada, pivotes que
no repintan y filtros que de verdad filtran.

    cd backend && python -m pytest test_nqe.py -q
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

import nqe


# ==============================================================================
# Datos sintéticos
# ==============================================================================

def serie(n: int = 2600, semilla: int = 7) -> pd.DataFrame:
    """Barras horarias con tendencia, ciclo y ruido.

    Se generan a mano y no con datos reales a propósito: una prueba que
    depende de la red no es una prueba, es un sondeo.
    """
    rng = np.random.default_rng(semilla)
    t = np.arange(n)
    base = 100 + 0.02 * t + 6 * np.sin(t / 40.0) + np.cumsum(rng.normal(0, 0.15, n))
    apertura = base + rng.normal(0, 0.1, n)
    cierre = base + rng.normal(0, 0.1, n)
    cuerpo_alto = np.maximum(apertura, cierre)
    cuerpo_bajo = np.minimum(apertura, cierre)
    alto = cuerpo_alto + np.abs(rng.normal(0, 0.25, n))
    bajo = cuerpo_bajo - np.abs(rng.normal(0, 0.25, n))
    # Volumen con forma de U dentro de la sesión: es justo lo que la
    # normalización por hora del día tiene que neutralizar.
    hora = (t % 7)
    forma = 1.6 - 0.45 * np.sin(np.pi * hora / 6.0)
    volumen = np.abs(rng.normal(1_000_000, 120_000, n)) * forma

    indice = pd.date_range("2024-01-02 09:30", periods=n, freq="1h", tz="America/New_York")
    return pd.DataFrame(
        {"Open": apertura, "High": alto, "Low": bajo, "Close": cierre, "Volume": volumen},
        index=indice,
    )


@pytest.fixture(scope="module")
def df():
    return serie()


# ==============================================================================
# Wilson
# ==============================================================================

def test_wilson_por_debajo_de_la_proporcion():
    """La cota nunca puede quedar por encima de lo observado."""
    assert nqe.wilson(6, 8) < 6 / 8
    assert nqe.wilson(60, 80) < 60 / 80


def test_wilson_premia_la_muestra():
    """Mismo 75 % con más muestra: la cota sube. Es todo el sentido del gate."""
    assert nqe.wilson(60, 80) > nqe.wilson(6, 8)


def test_wilson_muestra_vacia():
    assert nqe.wilson(0, 0) == 0.0


# ==============================================================================
# Pivotes — el punto donde suele colarse el repintado
# ==============================================================================

def test_pivote_se_confirma_con_retraso_y_no_repinta(df):
    alto = df["High"].to_numpy(float)
    ph = nqe._pivotes(alto, 8, 8, alto=True)
    posiciones = np.flatnonzero(np.isfinite(ph))
    assert len(posiciones) > 0, "sin pivotes no se prueba nada"

    for i in posiciones[:20]:
        # El valor escrito en i es el máximo de la ventana centrada en i-8.
        centro = i - 8
        assert ph[i] == alto[centro]
        assert alto[centro] == alto[centro - 8: centro + 9].max()

    # Y no repinta: recalcular sobre la serie truncada da lo mismo en el tramo
    # común, porque un pivote confirmado ya no depende de barras futuras.
    corte = 600
    truncado = nqe._pivotes(alto[:corte], 8, 8, alto=True)
    a = np.nan_to_num(ph[:corte], nan=-1.0)
    b = np.nan_to_num(truncado, nan=-1.0)
    assert np.array_equal(a, b)


# ==============================================================================
# Ausencia de look-ahead — la prueba clave
# ==============================================================================

def test_sin_lookahead(df):
    """Truncar la serie no cambia las señales del tramo común.

    Es la misma prueba que protege al motor de backtest. Si el gate mirase
    operaciones que se cierran DESPUÉS de la señal, o si el percentil móvil se
    calculase sobre la serie entera, este test lo cazaría: al recortar el
    futuro, las señales del pasado se moverían.

    Se corre con Fibonacci apagado y sin gate a propósito. Con la
    configuración por defecto el embudo se queda en cero —ver
    `test_fibonacci_estrangula_el_embudo`— y comparar dos listas vacías no
    demuestra absolutamente nada.
    """
    corte = 1600
    p = lambda: nqe.Parametros(usar_fib=False, gate_estricto=False, max_senales=10_000)
    completo = nqe.calcular(df, "TEST", p())
    truncado = nqe.calcular(df.iloc[:corte], "TEST", p())

    def clave(s):
        return (s["direccion"], s["validada"], round(s["precio"], 9),
                round(s["objetivo"], 9), round(s["stop"], 9))

    mapa_c = {s["indice"]: clave(s) for s in completo["historial"]["senales"] if s["indice"] < corte}
    mapa_t = {s["indice"]: clave(s) for s in truncado["historial"]["senales"] if s["indice"] < corte}

    assert mapa_t, "sin señales en el tramo truncado la prueba no demuestra nada"
    # Las últimas barras del truncado aún no han visto confirmarse sus
    # pivotes; se comparan sólo las que ambos han podido evaluar igual.
    comunes = set(mapa_c) & set(mapa_t)
    assert len(comunes) >= 10, f"muestra común demasiado corta ({len(comunes)})"
    for i in sorted(comunes):
        assert mapa_c[i] == mapa_t[i], f"la señal de la barra {i} cambió al truncar la serie"

    # Y ninguna señal del truncado puede faltar en el completo: si aparece al
    # recortar el futuro, es que el futuro la estaba borrando.
    assert set(mapa_t) <= set(mapa_c), "el truncado inventó señales que el completo no tiene"


def test_sin_lookahead_en_el_embudo(df):
    """El embudo del tramo truncado no puede superar al del completo."""
    corte = 1600
    p = lambda: nqe.Parametros(usar_fib=False, gate_estricto=False)
    completo = nqe.calcular(df, "TEST", p())
    truncado = nqe.calcular(df.iloc[:corte], "TEST", p())
    assert truncado["embudo"]["cruces"] <= completo["embudo"]["cruces"]
    assert truncado["embudo"]["tras_filtros"] <= completo["embudo"]["tras_filtros"]


def test_contraprueba_el_detector_detecta(df):
    """Contraprueba: si se adelanta el cierre una barra, las señales cambian.

    Sin esto, un test de look-ahead que siempre pasa podría estar comparando
    dos listas vacías. Aquí se fabrica look-ahead a propósito y se comprueba
    que el resultado SÍ se mueve. Si esta prueba fallara, la de arriba no
    estaría demostrando nada.
    """
    tramposo = df.copy()
    tramposo["Close"] = tramposo["Close"].shift(-1)
    tramposo = tramposo.dropna()

    p = lambda: nqe.Parametros(usar_fib=False, gate_estricto=False, max_senales=10_000)
    limpio = nqe.calcular(df, "TEST", p())
    sucio = nqe.calcular(tramposo, "TEST", p())
    a = [(s["indice"], s["direccion"]) for s in limpio["historial"]["senales"]]
    b = [(s["indice"], s["direccion"]) for s in sucio["historial"]["senales"]]
    assert a, "sin señales no hay contraprueba"
    assert a != b, "mover el cierre al futuro no cambió nada: el motor no lo está mirando"


# ==============================================================================
# Triple barrera
# ==============================================================================

def test_empate_intrabar_se_resuelve_como_stop():
    """Objetivo y stop tocados en la misma barra → pierde.

    Suponer el objetivo es la forma más silenciosa de inflar un acierto, y es
    indistinguible de un motor correcto salvo por esta prueba.
    """
    n = 1400
    idx = pd.date_range("2024-01-02 09:30", periods=n, freq="1h", tz="America/New_York")
    rng = np.random.default_rng(3)
    cierre = 100 + np.cumsum(rng.normal(0, 0.4, n))
    # Mechas grandes y ASIMÉTRICAS. La asimetría es imprescindible: con
    # High = c+k y Low = c-k el CLV sale exactamente 0 en todas las barras, el
    # flujo se queda plano y no se dispara una sola señal — la prueba pasaría
    # sin probar nada. Con rangos enormes casi toda operación toca las dos
    # barreras, que es justo el caso que se quiere comprobar.
    arriba = np.abs(rng.normal(18, 9, n)) + 2
    abajo = np.abs(rng.normal(18, 9, n)) + 2
    marco = pd.DataFrame({
        "Open": cierre,
        "High": cierre + arriba,
        "Low": cierre - abajo,
        "Close": cierre,
        "Volume": np.abs(rng.normal(1_000_000, 150_000, n)),
    }, index=idx)

    # Fibonacci apagado (con él puesto no hay señales que empatar) y barreras
    # muy estrechas frente al rango de la barra: así casi toda operación toca
    # objetivo y stop dentro de la MISMA vela, que es el caso a comprobar.
    r = nqe.calcular(
        marco, "TEST",
        nqe.Parametros(usar_fib=False, gate_estricto=False, r_mult=0.3),
    )
    cerradas = [s for s in r["historial"]["senales"] if s["resultado"] in ("ganada", "perdida")]
    assert cerradas, "esta serie tenía que generar operaciones cerradas"
    empates = [s for s in cerradas if s["cierre_motivo"] == "stop (empate intrabar)"]
    assert empates, "con barras de rango enorme tiene que haber empates intrabar"
    assert all(s["resultado"] == "perdida" for s in empates)


def test_operacion_no_dura_mas_que_el_horizonte(df):
    r = nqe.calcular(df, "TEST", nqe.Parametros(horizonte=12, usar_fib=False, gate_estricto=False))
    for s in r["historial"]["senales"]:
        if s["barras_abierta"] is not None:
            assert s["barras_abierta"] <= 12


def test_objetivo_y_stop_son_simetricos(df):
    """Asimetrizarlos infla el acierto y hunde la esperanza. Se mantienen."""
    r = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    assert r["historial"]["senales"], "sin señales no se comprueba nada"
    for s in r["historial"]["senales"]:
        arriba = abs(s["objetivo"] - s["precio"])
        abajo = abs(s["precio"] - s["stop"])
        assert arriba == pytest.approx(abajo, rel=1e-9)


def test_direccion_coherente(df):
    """Una venta con el objetivo por encima de la entrada es geometría rota."""
    r = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    assert r["historial"]["senales"], "sin señales no se comprueba nada"
    for s in r["historial"]["senales"]:
        if s["direccion"] == "compra":
            assert s["objetivo"] > s["precio"] > s["stop"]
        else:
            assert s["objetivo"] < s["precio"] < s["stop"]


# ==============================================================================
# Gate
# ==============================================================================

def test_el_gate_estricto_no_inventa_senales(df):
    """Con gate, las validadas son un subconjunto de las crudas."""
    crudo = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    estricto = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=True))
    assert crudo["historial"]["validadas"] > 0, "sin señales crudas no se compara nada"
    assert estricto["embudo"]["tras_filtros"] == crudo["embudo"]["tras_filtros"]
    assert estricto["historial"]["validadas"] <= crudo["historial"]["validadas"]


def test_gate_cerrado_con_muestra_insuficiente(df):
    """Muestra por debajo del mínimo → gate cerrado, sin excepciones."""
    r = nqe.calcular(df, "TEST", nqe.Parametros(min_n=100000))
    assert r["gate"]["largo"]["abierto"] is False
    assert r["gate"]["corto"]["abierto"] is False
    assert r["historial"]["validadas"] == 0
    assert any("Muestra corta" in a for a in r["avisos"])


def test_wilson_del_gate_no_supera_al_acierto(df):
    r = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    assert r["gate"]["largo"]["muestra"] > 0, "sin muestra no se comprueba nada"
    for lado in ("largo", "corto"):
        g = r["gate"][lado]
        if g["acierto"] is not None and g["muestra"] > 0:
            assert g["wilson"] <= g["acierto"] + 1e-9


# ==============================================================================
# Filtros
# ==============================================================================

def test_el_preset_agresivo_apaga_los_filtros(df):
    r = nqe.calcular(df, "TEST", nqe.Parametros(preset="agresivo"))
    assert r["parametros"]["usar_ut"] is False
    assert r["parametros"]["usar_st"] is False
    assert r["parametros"]["usar_fib"] is False
    assert r["parametros"]["thr_pct"] == 75.0


def test_conservador_dispara_menos_que_agresivo(df):
    """Percentil 92 contra 75 y tres filtros más: tiene que salir menos."""
    conservador = nqe.calcular(df, "TEST", nqe.Parametros(preset="conservador", gate_estricto=False))
    agresivo = nqe.calcular(df, "TEST", nqe.Parametros(preset="agresivo", gate_estricto=False))
    assert conservador["embudo"]["tras_filtros"] <= agresivo["embudo"]["tras_filtros"]


def test_fibonacci_estrangula_el_embudo(df):
    """El filtro de Fibonacci deja el embudo en CERO. Medido, no supuesto.

    Es la propiedad más importante del indicador y la más fácil de leer como
    avería: con el preset «Equilibrado» —los tres filtros puestos— no sale una
    sola señal, ni aquí ni sobre AAPL/TSLA/NVDA en 5.082 barras horarias
    reales. El motivo es estructural, no estadístico: `crossUp` exige un
    estallido de momento al alza, y `fibOKL` exige estar a mitad de un
    retroceso del 23,6-78,6 %. Las dos cosas casi nunca ocurren en la misma
    barra.

    Esta prueba está para que, si alguien «arregla» el cero cambiando el
    motor, salte y obligue a decidirlo a propósito.
    """
    con = nqe.calcular(df, "TEST", nqe.Parametros(gate_estricto=False))
    sin = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    assert con["embudo"]["con_flujo_y_liquidez"] > 30, "sin cruces no se prueba nada"
    assert con["embudo"]["tras_filtros"] == 0
    assert sin["embudo"]["tras_filtros"] > 30


def test_el_embudo_es_monotono(df):
    """Cada paso del embudo sólo puede quitar. Si crece, está mal contado."""
    r = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    e = r["embudo"]
    assert e["cruces"] >= e["con_flujo_y_liquidez"] >= e["tras_filtros"]
    assert e["validadas"] + e["bloqueadas_por_gate"] == r["historial"]["total"]


# ==============================================================================
# UT Bot — equivalencia con «UT Bot Alerts» (Pine v4)
# ==============================================================================

def _ut_bot_alerts(df: pd.DataFrame, key: float = 1.0, periodo: int = 10):
    """Reimplementación LITERAL del script «UT Bot Alerts», línea a línea.

    Se escribe aparte, a propósito, sin reutilizar nada de `nqe`: si compartiera
    código con el motor, comparar los dos no demostraría nada. La traducción
    conserva incluso lo redundante (`ema(src, 1)`, el `src > stop` de `buy`)
    para que la equivalencia sea el RESULTADO de la prueba y no una decisión
    tomada al escribirla.
    """
    src = df["Close"].to_numpy(float)
    n = len(src)
    x_atr = nqe._atr(df["High"].to_numpy(float), df["Low"].to_numpy(float), src, periodo)
    n_loss = key * x_atr

    stop = np.zeros(n)
    for i in range(n):
        previo = stop[i - 1] if i > 0 else 0.0
        if not np.isfinite(n_loss[i]):
            stop[i] = previo
            continue
        src_previo = src[i - 1] if i > 0 else np.nan
        if src[i] > previo and np.isfinite(src_previo) and src_previo > previo:
            stop[i] = max(previo, src[i] - n_loss[i])
        elif src[i] < previo and np.isfinite(src_previo) and src_previo < previo:
            stop[i] = min(previo, src[i] + n_loss[i])
        elif src[i] > previo:
            stop[i] = src[i] - n_loss[i]
        else:
            stop[i] = src[i] + n_loss[i]

    ema = src.copy()  # ema(src, 1) es el propio src
    arriba = np.zeros(n, dtype=bool)
    abajo = np.zeros(n, dtype=bool)
    arriba[1:] = (ema[1:] > stop[1:]) & (ema[:-1] <= stop[:-1])
    abajo[1:] = (stop[1:] > ema[1:]) & (stop[:-1] <= ema[:-1])

    compra = (src > stop) & arriba
    venta = (src < stop) & abajo

    pos = np.zeros(n, dtype=int)
    actual = 0
    for i in range(n):
        if i > 0 and src[i - 1] < stop[i - 1] and src[i] > stop[i - 1]:
            actual = 1
        elif i > 0 and src[i - 1] > stop[i - 1] and src[i] < stop[i - 1]:
            actual = -1
        pos[i] = actual

    return stop, compra, venta, pos


def test_ut_bot_equivale_al_script_de_alertas(df):
    """Las marcas de UT Bot del NQE son las de «UT Bot Alerts», exactamente.

    Es la prueba que sostiene la afirmación. La sensibilidad (1) y el periodo
    de ATR (10) por defecto del NQE son ya los del script, así que la
    comparación se hace sin tocar nada.
    """
    _, compra_ref, venta_ref, _ = _ut_bot_alerts(df)
    r = nqe.calcular(
        df, "TEST",
        nqe.Parametros(usar_fib=False, gate_estricto=False, barras_serie=len(df)),
    )
    marcas = r["serie"]["ut_marcas"]

    esperadas = sorted(
        [(int(i), "buy") for i in np.flatnonzero(compra_ref)]
        + [(int(i), "sell") for i in np.flatnonzero(venta_ref)]
    )
    obtenidas = sorted((m["i"], m["tipo"]) for m in marcas)
    assert esperadas, "sin cruces no se prueba nada"
    assert obtenidas == esperadas


def test_ut_bot_trailing_identico_al_script(df):
    """Y el trailing stop, barra a barra."""
    stop_ref, _, _, _ = _ut_bot_alerts(df)
    r = nqe.calcular(
        df, "TEST",
        nqe.Parametros(usar_fib=False, gate_estricto=False, barras_serie=len(df)),
    )
    obtenido = r["serie"]["ut_stop"]
    # El motor deja NaN durante el calentamiento del ATR; el script arrastra
    # ceros. Se comparan sólo las barras donde el motor ya tiene lectura.
    comparadas = 0
    for i, v in enumerate(obtenido):
        if v is None:
            continue
        assert v == pytest.approx(stop_ref[i], rel=1e-9)
        comparadas += 1
    assert comparadas > len(obtenido) * 0.9


def test_ut_bot_sensibilidad_cambia_las_marcas(df):
    """Subir el «Key Value» tiene que dar MENOS cruces. Si no, no hace nada."""
    def marcas(key):
        r = nqe.calcular(
            df, "TEST",
            nqe.Parametros(ut_key=key, usar_fib=False, gate_estricto=False,
                           barras_serie=len(df)),
        )
        return len(r["serie"]["ut_marcas"])

    assert marcas(3.0) < marcas(1.0)


def test_ut_pos_no_inventa_posicion_inicial(df):
    """`pos` vale 0 hasta el primer cruce.

    Pintar «largo» desde la primera barra sería dibujar una entrada que nunca
    ocurrió, y con una cinta de estado eso se lee como una operación real.
    """
    r = nqe.calcular(
        df, "TEST",
        nqe.Parametros(usar_fib=False, gate_estricto=False, barras_serie=len(df)),
    )
    pos = r["serie"]["ut_pos"]
    marcas = sorted(m["i"] for m in r["serie"]["ut_marcas"])
    primera = marcas[0]
    assert all(v == 0 for v in pos[:primera])
    assert pos[primera] != 0


def test_ut_marcas_alternan(df):
    """Compra, venta, compra… Dos compras seguidas serían un cruce fantasma."""
    r = nqe.calcular(
        df, "TEST",
        nqe.Parametros(usar_fib=False, gate_estricto=False, barras_serie=len(df)),
    )
    tipos = [m["tipo"] for m in sorted(r["serie"]["ut_marcas"], key=lambda m: m["i"])]
    for a, b in zip(tipos, tipos[1:]):
        assert a != b, "dos marcas seguidas del mismo lado"


def test_ut_marcas_separadas_de_las_del_nqe(df):
    """Las dos listas son independientes: un módulo no manda una operación."""
    r = nqe.calcular(
        df, "TEST",
        nqe.Parametros(usar_fib=False, gate_estricto=False, barras_serie=len(df)),
    )
    assert "ut_marcas" in r["serie"] and "marcas" in r["serie"]
    assert r["serie"]["ut_marcas"] is not r["serie"]["marcas"]


# ==============================================================================
# Serie del gráfico
# ==============================================================================

def test_serie_alineada(df):
    """Todas las líneas del gráfico tienen que ir barra a barra con las velas.

    Si una se desalinea, el SuperTrend queda dibujado sobre la vela de al lado
    y nadie lo nota: la curva sigue teniendo buena pinta.
    """
    r = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    serie = r["serie"]
    n = len(serie["barras"])
    assert n == min(180, r["barras"])
    for clave in ("ut_stop", "supertrend", "vwap", "score", "umbral"):
        assert len(serie[clave]) == n, f"{clave} no está alineada con las velas"


def test_serie_es_la_cola(df):
    """La última vela de la serie es la última barra del histórico."""
    r = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    ultima = r["serie"]["barras"][-1]
    assert ultima["c"] == pytest.approx(float(df["Close"].iloc[-1]))
    assert ultima["h"] == pytest.approx(float(df["High"].iloc[-1]))


def test_marcas_caen_en_su_vela(df):
    """Una marca de compra tiene que apuntar a la vela cuyo cierre la disparó.

    Es el error silencioso más caro de un gráfico de señales: el triángulo se
    dibuja una vela a la derecha y la señal parece anticiparse al movimiento.
    """
    r = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    serie = r["serie"]
    barras = serie["barras"]
    assert serie["marcas"], "sin marcas no se comprueba nada"
    for m in serie["marcas"]:
        assert 0 <= m["i"] < len(barras), "marca fuera de la ventana dibujada"
        assert barras[m["i"]]["c"] == pytest.approx(m["precio"]), (
            "la marca no coincide con el cierre de su vela"
        )


def test_marcas_coherentes_con_el_historial(df):
    """Toda marca de la ventana existe también en el historial, y al revés."""
    r = nqe.calcular(
        df, "TEST",
        nqe.Parametros(usar_fib=False, gate_estricto=False, max_senales=10_000),
    )
    desde = r["serie"]["desde_indice"]
    del_historial = sorted(
        s["indice"] for s in r["historial"]["senales"] if s["indice"] >= desde
    )
    de_la_serie = sorted(m["i"] + desde for m in r["serie"]["marcas"])
    assert del_historial == de_la_serie


def test_serie_sin_nan(df):
    """Un NaN en la serie rompe la escala del SVG y deja el panel en blanco."""
    import math
    r = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    for clave in ("ut_stop", "supertrend", "vwap", "score", "umbral"):
        for x in r["serie"][clave]:
            assert x is None or math.isfinite(x)


def test_serie_recortada_no_recorta_el_analisis(df):
    """Pedir menos barras para el gráfico NO puede cambiar la señal.

    El gráfico es una ventana de dibujo; el motor sigue leyendo la serie
    entera. Confundir las dos cosas convertiría el tamaño del panel en un
    parámetro del indicador.
    """
    corta = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, barras_serie=40))
    larga = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, barras_serie=180))
    assert corta["senal"] == larga["senal"]
    assert corta["embudo"] == larga["embudo"]
    assert len(corta["serie"]["barras"]) == 40
    assert len(larga["serie"]["barras"]) == 180


# ==============================================================================
# Contrato de la respuesta
# ==============================================================================

def test_respuesta_serializable(df):
    """Ningún NaN ni infinito: uno solo tumba la respuesta entera."""
    import json
    r = nqe.calcular(df, "TEST")
    texto = json.dumps(r, allow_nan=False)
    assert "NaN" not in texto and "Infinity" not in texto


def test_historial_ordenado_de_reciente_a_antiguo(df):
    r = nqe.calcular(df, "TEST", nqe.Parametros(usar_fib=False, gate_estricto=False))
    assert r["historial"]["senales"], "sin señales no se comprueba nada"
    indices = [s["indice"] for s in r["historial"]["senales"]]
    assert indices == sorted(indices, reverse=True)


def test_historico_corto_es_error_explicito():
    """Menos barras de las necesarias: se dice, no se rellena con respaldos."""
    with pytest.raises(ValueError, match="insuficiente"):
        nqe.calcular(serie(120), "TEST")


def test_pronostico_declara_su_muestra(df):
    r = nqe.calcular(df, "TEST")
    p = r["pronostico"]
    assert p["disponible"] == (p["muestra"] >= p["muestra_minima"])
    if not p["disponible"]:
        assert any("Pronóstico sin muestra" in a for a in r["avisos"])


def test_estructura_sin_impulso_no_inventa_niveles():
    """Sin swing confirmado, los niveles son None, no un número plausible."""
    n = 700
    idx = pd.date_range("2024-01-02 09:30", periods=n, freq="1h", tz="America/New_York")
    plano = pd.DataFrame({
        "Open": np.full(n, 100.0), "High": np.full(n, 100.0),
        "Low": np.full(n, 100.0), "Close": np.full(n, 100.0),
        "Volume": np.full(n, 1_000_000.0),
    }, index=idx)
    r = nqe.calcular(plano, "TEST")
    assert r["estructura"]["retroceso"] is None
    assert r["estructura"]["fib_618"] is None
    assert r["estructura"]["zona"] == "sin impulso"
