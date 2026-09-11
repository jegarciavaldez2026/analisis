"""
Pruebas del procesador de señales del robot.

Las fixtures reproducen la FORMA REAL de las respuestas de `/pivots`, `/nqe`,
`/overton` y `/mtf` —claves copiadas del `return` de cada módulo, no inventadas
de memoria—. Ese es exactamente el fallo que en este proyecto ya vació cuatro
paneles: nombres de campo plausibles que no dan error, dan guiones.

    cd backend && python -m pytest test_simulacion_senales.py -q
"""

from __future__ import annotations

import pytest

import simulacion as sim
import simulacion_senales as ss


# ==============================================================================
# Fixtures con la forma real de cada endpoint
# ==============================================================================

TS_BARRA_MS = 1_760_000_000_000  # milisegundos, como los sirve pivots._serie()


def pivotes(
    veredicto="LONG",
    entrada=100.0,
    stop=97.0,
    objetivo1=106.0,
    operable=True,
    cumplidas=6,
    acuerdo_pct=48.0,
) -> dict:
    """Forma de `pivots.calcular()`, verificada contra su `return`."""
    condiciones = [
        {"texto": "Precio sobre el PP", "cumplida": True, "detalle": "100,00 vs 98,40"},
        {"texto": "Precio sobre el VWAP", "cumplida": True, "detalle": "100,00 vs 99,10"},
        {"texto": "SuperTrend a favor", "cumplida": True, "detalle": "alcista desde 6 velas"},
        {"texto": "Ruptura de estructura", "cumplida": cumplidas >= 4, "detalle": "máx. 99,80 roto"},
        {"texto": "Retroceso a la zona PP/VWAP", "cumplida": cumplidas >= 5, "detalle": "98,90"},
        {"texto": "Vela de rechazo", "cumplida": cumplidas >= 6, "detalle": "cierre en el 78 % del rango"},
    ]
    return {
        "ticker": "PBF",
        "marco": "1h",
        "periodo": "diario",
        "senal": {
            "veredicto": veredicto,
            "condiciones": condiciones,
            "condiciones_cumplidas": cumplidas,
            "lado_auditado": "long",
            "ultima_senal": None,
            "direccion": "compra",
            "disparo": veredicto is not None,
            "operable": operable,
            "motivo_no_operable": None if operable else "El objetivo está más cerca que el stop",
            "entrada": entrada,
            "stop": stop,
            "objetivo1": objetivo1,
            "objetivo2": 112.0,
            "riesgo_beneficio": 2.0,
            "marcas_totales": 14,
        },
        "fase": {"numero": 4, "nombre": "Rechazo", "direccion": "compra",
                 "barras_en_fase": 1, "caducidad": 12},
        "colinealidad": {"acuerdo_pct": acuerdo_pct, "muestra": 480},
        "precio": {"actual": entrada, "sobre_pp": True, "sobre_vwap": True, "atr": 1.4},
        "serie": {
            "barras": [{"t": TS_BARRA_MS, "o": 99.0, "h": 100.5, "l": 98.6, "c": 100.0, "v": 1e6}],
            "vwap": [99.1], "supertrend": [97.5], "marcas": [], "desde_indice": 0,
        },
        "avisos": [],
    }


def overton(accion="buy", score=72.0, etiqueta="COMPRAR") -> dict:
    """Sólo las claves que el filtro usa, con los nombres de `/overton`."""
    return {"overton_action": accion, "score_100": score, "accion": etiqueta,
            "stop_loss": 95.6, "target1": 105.0}


def nqe(abierto_largo=True, abierto_corto=False, sesgo="alcista") -> dict:
    return {
        "senal": {"accion": "compra", "sesgo": sesgo, "stop": 97.0, "objetivo": 106.0},
        "gate": {
            "estricto": True, "umbral_wilson": 0.65, "muestra_minima": 30,
            "largo": {"abierto": abierto_largo, "muestra": 79, "acierto": 0.506,
                      "wilson": 0.42, "esperanza": -0.03},
            "corto": {"abierto": abierto_corto, "muestra": 61, "acierto": 0.48,
                      "wilson": 0.38, "esperanza": -0.05},
        },
        "embudo": {"cruces": 255, "con_flujo_y_liquidez": 199, "tras_filtros": 0,
                   "validadas": 0, "bloqueadas_por_gate": 0},
    }


def mtf(consenso="alcista") -> dict:
    return {"ticker": "PBF", "consenso": consenso,
            "detalle_consenso": "5 de 7 marcos con precio sobre su media de 20"}


# ==============================================================================
# Identidad de la señal
# ==============================================================================

def test_el_id_de_senal_depende_de_la_barra_no_de_la_hora_de_consulta():
    """
    Lo que hace estructural el «una entrada por vela».

    El robot puede evaluar veinte veces dentro de la misma vela horaria: las
    veinte producen el mismo identificador y sólo la primera pasa.
    """
    a = ss.id_senal("pivots", "PBF", "1h", "long", 1_760_000_000)
    b = ss.id_senal("pivots", "PBF", "1h", "long", 1_760_000_000)
    assert a == b

    # La vela siguiente sí es otra señal.
    c = ss.id_senal("pivots", "PBF", "1h", "long", 1_760_003_600)
    assert c != a


def test_el_id_distingue_direccion_simbolo_marco_y_fuente():
    base = dict(fuente="pivots", simbolo="PBF", marco="1h",
                direccion="long", ts_barra=1_760_000_000)
    ref = ss.id_senal(**base)
    assert ss.id_senal(**{**base, "direccion": "short"}) != ref
    assert ss.id_senal(**{**base, "simbolo": "AAPL"}) != ref
    assert ss.id_senal(**{**base, "marco": "4h"}) != ref
    assert ss.id_senal(**{**base, "fuente": "nqe"}) != ref


def test_el_simbolo_se_normaliza_a_mayusculas():
    assert ss.id_senal("pivots", "pbf", "1h", "long", 1) == \
           ss.id_senal("pivots", "PBF", "1h", "long", 1)


def test_el_timestamp_de_barra_se_convierte_de_milisegundos_a_segundos():
    """
    `pivots._serie()` sirve `t` en MILISEGUNDOS. El clásico factor 1000
    convertiría una vela de hoy en una de 1970 sin romper nada.
    """
    d = ss.decision_desde_pivots(pivotes(), "PBF", "1h")
    assert d.ts_barra == TS_BARRA_MS // 1000
    # Del orden de 2025-2026, no de 1970 ni del año 57000.
    assert 1_600_000_000 < d.ts_barra < 2_000_000_000


# ==============================================================================
# Disparo desde /pivots
# ==============================================================================

def test_sin_veredicto_no_hay_intencion_y_se_dice_cuantas_faltan():
    d = ss.decision_desde_pivots(pivotes(veredicto=None, cumplidas=4), "PBF", "1h")
    assert d.direccion == "ninguna"
    assert d.intencion is None
    assert "4 de 6" in d.motivo_no_operar
    # Las razones se conservan igualmente: es lo que explica el «no».
    assert len(d.razones) == 6


def test_veredicto_long_produce_intencion_con_los_niveles_del_pivote():
    d = ss.decision_desde_pivots(pivotes(), "PBF", "1h")
    assert d.direccion == "long"
    assert d.intencion is not None
    assert d.intencion.precio_referencia == pytest.approx(100.0)
    assert d.intencion.stop_loss == pytest.approx(97.0)
    assert d.intencion.take_profit == pytest.approx(106.0)
    assert d.intencion.origen == "robot"
    assert d.intencion.signal_id == d.signal_id


def test_veredicto_short_produce_niveles_coherentes():
    """
    El corto de `/pivots` tiene el stop ARRIBA y el objetivo ABAJO, como debe
    ser. Es lo que lo hace utilizable donde `/overton` no lo es.
    """
    p = pivotes(veredicto="SHORT", entrada=100.0, stop=103.0, objetivo1=94.0)
    d = ss.decision_desde_pivots(p, "PBF", "1h")

    assert d.direccion == "short"
    assert d.intencion.stop_loss > d.intencion.precio_referencia
    assert d.intencion.take_profit < d.intencion.precio_referencia

    # Y el motor de simulación lo acepta sin rechazos de coherencia.
    e = sim.Estado(capital_inicial=100_000.0)
    d.intencion.cantidad = 10
    fallos = sim.validar(e, d.intencion)
    codigos = {f.codigo for f in fallos}
    assert "STOP_AL_OTRO_LADO" not in codigos
    assert "OBJETIVO_AL_OTRO_LADO" not in codigos


def test_las_razones_traen_su_medida_no_solo_el_check():
    """Un ✓ sin cifra detrás no se puede auditar. Es el punto 11 del encargo."""
    d = ss.decision_desde_pivots(pivotes(), "PBF", "1h")
    assert all(r.valor for r in d.razones)
    assert any("98,40" in r.valor for r in d.razones)
    assert any("vs" in r.valor for r in d.razones)


def test_senal_no_operable_se_veta_con_su_motivo():
    d = ss.evaluar("PBF", "1h", pivotes(operable=False), balance=100_000)
    assert not d.opera
    assert any("NO OPERABLE" in v for v in d.vetos)
    assert "más cerca que el stop" in " ".join(d.vetos)


def test_veredicto_sin_niveles_no_opera():
    d = ss.decision_desde_pivots(pivotes(objetivo1=None), "PBF", "1h")
    assert d.intencion is None
    assert "niveles completos" in d.motivo_no_operar


def test_colinealidad_alta_se_anota():
    """
    Por encima del 85 % el PP y el VWAP son la misma lectura contada dos veces.
    Es una nota, no un veto: la medida vale en las dos direcciones.
    """
    d = ss.decision_desde_pivots(pivotes(acuerdo_pct=91.0), "PBF", "1h")
    assert any("misma evidencia" in n for n in d.notas)
    assert not d.vetos


# ==============================================================================
# /overton veta, no dispara
# ==============================================================================

def test_overton_contrario_veta_el_long():
    d = ss.evaluar("PBF", "1h", pivotes(), overton=overton("sell", 22.0, "VENDER"),
                   balance=100_000)
    assert not d.opera
    assert any("VENDER" in v for v in d.vetos)


def test_overton_en_espera_reduce_el_tamano_a_la_mitad():
    d = ss.evaluar("PBF", "1h", pivotes(), overton=overton("hold", 50.0, "MANTENER"),
                   balance=100_000, capital_pct=100, riesgo_pct=1.0)
    assert d.opera
    assert d.factor_tamano == pytest.approx(0.5)
    # 1 % de 100.000 = 1.000 de riesgo / 3 puntos de stop = 333 → la mitad.
    assert d.intencion.cantidad == 166


def test_overton_nunca_aporta_sus_propios_niveles():
    """
    Fija el hallazgo de la auditoría: `/overton` es LARGO POR CONSTRUCCIÓN
    (`stop = precio − ATR·2,2`). Ni siquiera en un largo se usan sus niveles,
    porque entonces nadie se acordaría al montar el corto. La entrada, el stop
    y el objetivo salen SIEMPRE de `/pivots`.
    """
    o = overton("buy", 80.0, "COMPRAR")
    d = ss.evaluar("PBF", "1h", pivotes(), overton=o, balance=100_000)
    assert d.intencion.stop_loss == pytest.approx(97.0)      # el del pivote
    assert d.intencion.stop_loss != pytest.approx(o["stop_loss"])
    assert d.intencion.take_profit != pytest.approx(o["target1"])


def test_sin_overton_se_opera_pero_se_dice():
    d = ss.evaluar("PBF", "1h", pivotes(), balance=100_000)
    assert d.opera
    assert any("Sin lectura de /overton" in n for n in d.notas)


# ==============================================================================
# /nqe matiza, no apaga el robot
# ==============================================================================

def test_el_nqe_sin_senales_no_bloquea_el_robot():
    """
    Con el preset por defecto el embudo del NQE da CERO señales sobre 5.082
    barras — medido, con prueba propia en `test_nqe.py`. Exigir su acuerdo
    sería apagar el robot y llamarlo filtro.
    """
    sin_senales = nqe(abierto_largo=False)
    sin_senales["embudo"]["tras_filtros"] = 0
    d = ss.evaluar("PBF", "1h", pivotes(), nqe=sin_senales, balance=100_000)
    assert d.opera                       # opera igualmente
    assert d.factor_tamano <= 0.5        # pero con menos tamaño
    assert any("gate del NQE" in n for n in d.notas)


def test_el_gate_cerrado_aparece_en_las_razones_con_sus_cifras():
    d = ss.evaluar("PBF", "1h", pivotes(), nqe=nqe(abierto_largo=False), balance=100_000)
    gate = next(r for r in d.razones if r.etiqueta.startswith("Gate NQE"))
    assert gate.cumplida is False
    assert "Wilson 0.42" in gate.valor and "0.65" in gate.valor


def test_el_gate_del_corto_es_el_que_se_mira_en_un_corto():
    p = pivotes(veredicto="SHORT", entrada=100.0, stop=103.0, objetivo1=94.0)
    d = ss.evaluar("PBF", "1h", p, nqe=nqe(abierto_largo=True, abierto_corto=True,
                                           sesgo="bajista"), balance=100_000)
    gate = next(r for r in d.razones if r.etiqueta.startswith("Gate NQE"))
    assert "corto" in gate.etiqueta
    assert gate.cumplida is True


# ==============================================================================
# /mtf y la contra-tendencia
# ==============================================================================

def test_conflicto_de_marcos_no_es_senal_debil_es_contra_tendencia():
    """
    La regla que el usuario puso por escrito: un rebote alcista dentro de una
    estructura semanal bajista no es un STRONG BUY flojo, es otra operación —y
    lo que cambia es el TAMAÑO, no la etiqueta de fuerza.
    """
    d = ss.evaluar("PBF", "1h", pivotes(), mtf=mtf("bajista"),
                   balance=100_000, capital_pct=100, riesgo_pct=1.0)
    assert d.opera
    assert d.factor_tamano == pytest.approx(0.25)
    assert any("CONTRA-TENDENCIA" in n for n in d.notas)
    assert d.intencion.cantidad == 83      # 333 × 0,25


def test_marcos_mixtos_recortan_al_75():
    d = ss.evaluar("PBF", "1h", pivotes(), mtf=mtf("mixto"), balance=100_000)
    assert d.factor_tamano == pytest.approx(0.75)


def test_marcos_alineados_no_recortan():
    d = ss.evaluar("PBF", "1h", pivotes(), mtf=mtf("alcista"), balance=100_000)
    assert d.factor_tamano == pytest.approx(1.0)


def test_los_recortes_no_se_multiplican_entre_si():
    """
    Se toma el MÍNIMO, no el producto. Tres filtros tibios multiplicándose
    (0,75 × 0,5 × 0,5) dejarían el tamaño en el 19 % y el robot no operaría de
    hecho, sin que ningún mensaje lo dijera.
    """
    d = ss.evaluar(
        "PBF", "1h", pivotes(), mtf=mtf("mixto"),
        overton=overton("hold", 50.0, "MANTENER"), nqe=nqe(abierto_largo=False),
        balance=100_000,
    )
    assert d.factor_tamano == pytest.approx(0.5)


# ==============================================================================
# Tamaño
# ==============================================================================

def test_el_tamano_usa_la_misma_formula_que_la_pantalla():
    # 25 % de 100.000 = 25.000 de capital ; 0,5 % = 125 de riesgo ;
    # stop a 3 puntos → 41 acciones.
    d = ss.evaluar("PBF", "1h", pivotes(), balance=100_000,
                   capital_pct=25, riesgo_pct=0.5)
    assert d.intencion.cantidad == 41
    assert d.intencion.cantidad == sim.tamano_por_riesgo(25_000, 0.5, 100.0, 97.0)


def test_la_liquidez_puede_mandar_sobre_el_riesgo_y_se_dice_cual():
    d = ss.evaluar("PBF", "1h", pivotes(), balance=100_000, capital_pct=100,
                   riesgo_pct=1.0, max_acciones_liquidez=50)
    assert d.intencion.cantidad == 50
    tam = next(r for r in d.razones if r.etiqueta == "Tamaño")
    assert "liquidez" in tam.valor


def test_el_riesgo_manda_cuando_es_el_mas_restrictivo():
    d = ss.evaluar("PBF", "1h", pivotes(), balance=100_000, capital_pct=25,
                   riesgo_pct=0.5, max_acciones_liquidez=10_000)
    assert d.intencion.cantidad == 41
    tam = next(r for r in d.razones if r.etiqueta == "Tamaño")
    assert "riesgo" in tam.valor


def test_tamano_cero_se_veta_con_su_motivo():
    d = ss.evaluar("PBF", "1h", pivotes(), balance=100.0, capital_pct=1, riesgo_pct=0.1)
    assert not d.opera
    assert any("cero" in v for v in d.vetos)


# ==============================================================================
# El registro completo
# ==============================================================================

def test_el_registro_se_guarda_tambien_cuando_no_se_opera():
    """
    «¿Por qué no entró?» es tan legítimo como «¿por qué entró?». Un registro
    que sólo existe cuando hay operación no contesta la mitad de las preguntas.
    """
    d = ss.evaluar("PBF", "1h", pivotes(veredicto=None, cumplidas=3), balance=100_000)
    bruto = d.a_dict()
    assert bruto["opera"] is False
    assert bruto["motivo_no_operar"]
    assert len(bruto["razones"]) == 6
    assert bruto["direccion"] == "ninguna"


def test_los_filtros_se_aplican_todos_aunque_ya_haya_veto():
    """
    Un registro que se corta en el primer «no» hace creer que lo demás estaba
    bien. Se recorre entero y se enseña la fotografía completa.
    """
    d = ss.evaluar(
        "PBF", "1h", pivotes(), overton=overton("sell", 20.0, "VENDER"),
        nqe=nqe(abierto_largo=False), mtf=mtf("bajista"), balance=100_000,
    )
    etiquetas = {r.etiqueta for r in d.razones}
    assert "Confluencia Overton" in etiquetas
    assert "Consenso multi-marco" in etiquetas
    assert any(e.startswith("Gate NQE") for e in etiquetas)
    assert not d.opera


def test_resumen_legible():
    d = ss.evaluar("PBF", "1h", pivotes(), balance=100_000)
    texto = ss.resumen_legible(d)
    assert texto.startswith("LONG")
    assert "SL" in texto and "TP" in texto

    sin = ss.evaluar("PBF", "1h", pivotes(veredicto=None, cumplidas=2), balance=100_000)
    assert "2 de 6" in ss.resumen_legible(sin)


def test_un_diccionario_vacio_no_revienta():
    """Yahoo falla, el endpoint devuelve algo incompleto, y aun así no se cae."""
    d = ss.evaluar("PBF", "1h", {}, balance=100_000)
    assert d.intencion is None
    assert d.motivo_no_operar
