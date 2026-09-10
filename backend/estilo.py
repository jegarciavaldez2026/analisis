"""
================================================================================
Estilo de la empresa — Value / Blend / Growth
================================================================================
Clasifica una acción sobre el eje valor-crecimiento a partir de los ratios que
ya calcula `calculate_ratios()`. Devuelve una puntuación 0-100 y una etiqueta.

    100 ─┐ VALUE          barata respecto a lo que gana y a lo que crece
     70 ─┤ VALUE / MIXTO
     55 ─┤ MIXTO
     40 ─┤ CRECIMIENTO / MIXTO
     25 ─┤ CRECIMIENTO    el mercado paga por lo que va a ganar, no por lo que gana
      0 ─┘

Por qué no basta con el PER
---------------------------
«PER < 15 = Value, PER > 30 = Growth» produce dos errores caros y opuestos:

* Una empresa con PER 10 y beneficios cayendo un 20 % no es barata: es una
  **trampa de valor**. El precio ha bajado porque el beneficio va a bajar.
* Una con PER 30, EPS +35 % y ROIC 30 % puede estar cara y aun así ser
  crecimiento auténtico.

Por eso el peso mayor no lo lleva el PER sino la relación entre **precio y
crecimiento** (PEG), y hay una detección explícita de trampa de valor que se
publica junto a la etiqueta en vez de esconderse en la puntuación.

Los seis factores y sus pesos
-----------------------------
    Valoración      25 %   PER, EV/EBITDA, P/FCF, PEG
    Crecimiento     25 %   CAGR de ingresos, de EPS y de FCF
    Rentabilidad    15 %   ROIC, ROE, margen operativo
    Flujo de caja   15 %   FCF yield y margen de FCF
    Balance         10 %   deuda/EBITDA, cobertura de intereses, corriente
    Momento         10 %   rendimiento del precio a 6 y 12 meses

Cada factor puntúa 0-100 en dirección VALOR: 100 = muy value, 0 = muy growth.
Un factor sin datos **no se inventa**: se excluye y los pesos se renormalizan
sobre los que sí hay. `cobertura` dice qué proporción del peso total se pudo
evaluar, y por debajo de 0,6 la etiqueta se marca como poco fiable.

Lo que esto NO hace, y hay que saberlo
--------------------------------------
Los umbrales son **absolutos**, no relativos al sector. Un PER de 25 es caro
para un banco y barato para software de alto crecimiento, así que lo correcto
sería comparar cada múltiplo contra la mediana de su sector y contra la propia
historia de la empresa. No está hecho porque **no hay dataset de comparables**:
haría falta descargar y cachear los múltiplos de los pares de cada sector, y
un umbral sectorial inventado a ojo sería peor que uno absoluto declarado.
Está declarado en la respuesta (`base_umbrales: "absolutos"`) para que nadie
lo lea como si fuera relativo.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

# ── Bandas de la etiqueta ────────────────────────────────────────────────────
BANDAS: Tuple[Tuple[float, str, str], ...] = (
    (70.0, "value", "Value"),
    (55.0, "value_mixto", "Value / Mixto"),
    (40.0, "mixto", "Mixto"),
    (25.0, "crecimiento_mixto", "Crecimiento / Mixto"),
    (0.0, "crecimiento", "Crecimiento"),
)

PESOS = {
    "valoracion": 25.0,
    "crecimiento": 25.0,
    "rentabilidad": 15.0,
    "flujo_caja": 15.0,
    "balance": 10.0,
    "momento": 10.0,
}


def _num(v: Any) -> Optional[float]:
    """Float utilizable, o None. Un NaN o un infinito no son un dato."""
    if v is None or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _escala(valor: Optional[float], barato: float, caro: float) -> Optional[float]:
    """
    Lleva un valor a 0-100 en dirección VALOR, interpolando linealmente.

    `barato` es el extremo que puntúa 100 y `caro` el que puntúa 0. Funciona
    en los dos sentidos: si `barato < caro` la métrica es del tipo «cuanto
    menor, más value» (PER); si `barato > caro`, del tipo «cuanto mayor, más
    value» (FCF yield).
    """
    if valor is None:
        return None
    if barato == caro:
        return 50.0
    t = (valor - caro) / (barato - caro)
    return max(0.0, min(100.0, t * 100.0))


def _media(puntos: List[Optional[float]]) -> Optional[float]:
    """Media de los sub-indicadores que sí tienen dato."""
    vivos = [p for p in puntos if p is not None]
    return sum(vivos) / len(vivos) if vivos else None


# ── Los seis factores ────────────────────────────────────────────────────────
#
# Cada umbral va escrito aquí y viaja en la respuesta. Son los del criterio
# acordado: PER 15-18 abajo, FCF yield 5-6 %, ingresos y EPS por encima del
# 15-20 % arriba. Que estén a la vista es lo que permite discutirlos.

def _f_valoracion(r: Dict[str, Any]) -> Tuple[Optional[float], List[Dict[str, Any]]]:
    per = _num(r.get("pe_ratio"))
    peg = _num(r.get("peg_ratio"))
    evb = _num(r.get("ev_ebitda"))
    pfcf = _num(r.get("price_to_fcf"))

    # PER y P/FCF negativos no son «baratísimos»: son pérdidas. Se descartan.
    per = per if (per is not None and per > 0) else None
    pfcf = pfcf if (pfcf is not None and pfcf > 0) else None
    evb = evb if (evb is not None and evb > 0) else None
    # Un PEG negativo significa beneficio decreciente; se trata aparte, en la
    # trampa de valor, no como si fuera una ganga.
    peg = peg if (peg is not None and peg > 0) else None

    detalle = [
        {"clave": "PER", "valor": per, "barato": 12.0, "caro": 32.0},
        {"clave": "PEG", "valor": peg, "barato": 1.0, "caro": 3.0},
        {"clave": "EV/EBITDA", "valor": evb, "barato": 8.0, "caro": 22.0},
        {"clave": "P/FCF", "valor": pfcf, "barato": 12.0, "caro": 35.0},
    ]
    for d in detalle:
        d["puntos"] = _escala(d["valor"], d["barato"], d["caro"])
    # El PEG pesa doble: es lo que relaciona precio con crecimiento, que es
    # justo lo que un PER solo no distingue.
    puntos = [d["puntos"] for d in detalle]
    if detalle[1]["puntos"] is not None:
        puntos.append(detalle[1]["puntos"])
    return _media(puntos), detalle


def _f_crecimiento(r: Dict[str, Any]) -> Tuple[Optional[float], List[Dict[str, Any]]]:
    # Los CAGR llegan en fracción (0,16 = 16 %).
    ing = _num(r.get("cagr_revenue_4y"))
    eps = _num(r.get("cagr_eps_4y"))
    fcf = _num(r.get("cagr_fcf_4y"))
    a_pct = lambda v: None if v is None else v * 100.0

    detalle = [
        {"clave": "CAGR ingresos", "valor": a_pct(ing), "barato": 2.0, "caro": 20.0},
        {"clave": "CAGR EPS", "valor": a_pct(eps), "barato": 3.0, "caro": 25.0},
        {"clave": "CAGR FCF", "valor": a_pct(fcf), "barato": 3.0, "caro": 25.0},
    ]
    for d in detalle:
        d["puntos"] = _escala(d["valor"], d["barato"], d["caro"])
    return _media([d["puntos"] for d in detalle]), detalle


def _f_rentabilidad(r: Dict[str, Any]) -> Tuple[Optional[float], List[Dict[str, Any]]]:
    # ROIC alto es rasgo de compounder de crecimiento, así que puntúa BAJO en
    # el eje valor. No es un juicio de calidad: es una posición en el eje.
    detalle = [
        {"clave": "ROIC", "valor": _num(r.get("roic")), "barato": 6.0, "caro": 25.0},
        {"clave": "ROE", "valor": _num(r.get("roe")), "barato": 8.0, "caro": 35.0},
        {"clave": "Margen operativo", "valor": _num(r.get("operating_margin")), "barato": 6.0, "caro": 30.0},
    ]
    for d in detalle:
        d["puntos"] = _escala(d["valor"], d["barato"], d["caro"])
    return _media([d["puntos"] for d in detalle]), detalle


def _f_flujo(r: Dict[str, Any]) -> Tuple[Optional[float], List[Dict[str, Any]]]:
    # FCF yield alto = value; margen de FCF alto = negocio de crecimiento.
    detalle = [
        {"clave": "FCF yield", "valor": _num(r.get("fcf_yield")), "barato": 8.0, "caro": 2.0},
        {"clave": "Rentabilidad por dividendo", "valor": _num(r.get("dividend_yield")), "barato": 4.0, "caro": 0.0},
        {"clave": "Margen FCF", "valor": _num(r.get("fcf_margin")), "barato": 5.0, "caro": 28.0},
    ]
    for d in detalle:
        d["puntos"] = _escala(d["valor"], d["barato"], d["caro"])
    return _media([d["puntos"] for d in detalle]), detalle


def _f_balance(r: Dict[str, Any]) -> Tuple[Optional[float], List[Dict[str, Any]]]:
    # Un balance sólido inclina hacia value: es lo que el inversor de valor
    # compra cuando compra margen de seguridad.
    detalle = [
        {"clave": "Deuda neta / EBITDA", "valor": _num(r.get("net_debt_ebitda")), "barato": 0.5, "caro": 4.0},
        {"clave": "Cobertura de intereses", "valor": _num(r.get("interest_coverage")), "barato": 15.0, "caro": 2.0},
        {"clave": "Ratio corriente", "valor": _num(r.get("current_ratio")), "barato": 2.5, "caro": 0.8},
    ]
    for d in detalle:
        d["puntos"] = _escala(d["valor"], d["barato"], d["caro"])
    return _media([d["puntos"] for d in detalle]), detalle


def _f_momento(r: Dict[str, Any]) -> Tuple[Optional[float], List[Dict[str, Any]]]:
    # Un precio que ya ha corrido mucho es rasgo de growth; uno rezagado, de
    # value. Es el factor más débil de los seis y por eso pesa un 10 %.
    # Las claves son las que existen de verdad en `calculate_ratios`, no las
    # que uno esperaría: `price_performance_6m` no existe y el factor quedaba
    # siempre en `None`, es decir, muerto. Un factor que nunca puntúa no es un
    # factor, es un peso perdido.
    detalle = [
        # Lejos del máximo de 52 semanas = rezagada = rasgo de value.
        {"clave": "% bajo el máximo de 52 s.", "valor": _num(r.get("pct_below_52w_high")), "barato": 35.0, "caro": 2.0},
        # Muy por encima del mínimo = ya ha corrido = rasgo de growth.
        {"clave": "% sobre el mínimo de 52 s.", "valor": _num(r.get("pct_above_52w_low")), "barato": 10.0, "caro": 80.0},
        {"clave": "Rentabilidad anualizada", "valor": _num(r.get("annualized_return")), "barato": -5.0, "caro": 35.0},
    ]
    for d in detalle:
        d["puntos"] = _escala(d["valor"], d["barato"], d["caro"])
    return _media([d["puntos"] for d in detalle]), detalle


FACTORES = (
    ("valoracion", "Valoración", _f_valoracion),
    ("crecimiento", "Crecimiento", _f_crecimiento),
    ("rentabilidad", "Rentabilidad", _f_rentabilidad),
    ("flujo_caja", "Flujo de caja", _f_flujo),
    ("balance", "Balance", _f_balance),
    ("momento", "Momento", _f_momento),
)


def _trampa_de_valor(r: Dict[str, Any]) -> Optional[str]:
    """
    ¿Barata, o barata por un motivo?

    Es la comprobación que separa una acción de valor de una en declive: PER
    bajo con beneficio cayendo no es una ganga, es el mercado descontando que
    va a ganar menos. Se publica aparte de la puntuación porque cambia por
    completo cómo se lee la etiqueta.
    """
    per = _num(r.get("pe_ratio"))
    eps = _num(r.get("cagr_eps_4y"))
    ing = _num(r.get("cagr_revenue_4y"))
    if per is None or per <= 0 or per >= 15:
        return None
    if eps is not None and eps < -0.05:
        return (
            f"PER de {per:.1f} con el BPA cayendo un {abs(eps) * 100:.1f} % anual. "
            "Barata no es lo mismo que infravalorada: el precio puede estar "
            "descontando que va a ganar menos."
        )
    if ing is not None and ing < -0.03 and (eps is None or eps < 0.02):
        return (
            f"PER de {per:.1f} con los ingresos cayendo un {abs(ing) * 100:.1f} % anual. "
            "Conviene mirar si el múltiplo bajo es descuento o deterioro."
        )
    return None


def clasificar(r: Dict[str, Any]) -> Dict[str, Any]:
    """Sitúa la empresa en el eje valor-crecimiento. Devuelve etiqueta y prueba."""
    factores: List[Dict[str, Any]] = []
    suma = 0.0
    peso_vivo = 0.0

    for clave, nombre, fn in FACTORES:
        puntos, detalle = fn(r)
        peso = PESOS[clave]
        if puntos is not None:
            suma += puntos * peso
            peso_vivo += peso
        factores.append({
            "clave": clave,
            "nombre": nombre,
            "peso": peso,
            "puntos": round(puntos, 1) if puntos is not None else None,
            "detalle": [
                {
                    "clave": d["clave"],
                    "valor": round(d["valor"], 2) if d["valor"] is not None else None,
                    "puntos": round(d["puntos"], 1) if d["puntos"] is not None else None,
                    "umbral_value": d["barato"],
                    "umbral_growth": d["caro"],
                }
                for d in detalle
            ],
        })

    peso_total = sum(PESOS.values())
    cobertura = peso_vivo / peso_total if peso_total else 0.0
    if peso_vivo == 0:
        return {
            "disponible": False,
            "motivo": "No hay ni un factor con datos suficientes para clasificar.",
            "cobertura": 0.0,
            "factores": factores,
            "base_umbrales": "absolutos",
        }

    puntuacion = suma / peso_vivo
    clave, etiqueta = "mixto", "Mixto"
    for corte, k, txt in BANDAS:
        if puntuacion >= corte:
            clave, etiqueta = k, txt
            break

    trampa = _trampa_de_valor(r)
    peg = _num(r.get("peg_ratio"))

    return {
        "disponible": True,
        "puntuacion": round(puntuacion, 1),
        "clave": clave,
        "etiqueta": etiqueta,
        # La escala viaja con la cifra: un «38» suelto no significa nada.
        "escala": "0 = crecimiento puro · 100 = value puro",
        "cobertura": round(cobertura, 2),
        "fiable": cobertura >= 0.6,
        "peg": round(peg, 2) if peg is not None else None,
        "trampa_de_valor": trampa,
        "factores": factores,
        "base_umbrales": "absolutos",
        "nota_umbrales": (
            "Umbrales absolutos, no relativos al sector. Un PER de 25 es caro para un "
            "banco y barato para software de alto crecimiento; comparar contra la mediana "
            "sectorial sería mejor, pero exige un dataset de comparables que este "
            "proyecto no tiene, y un umbral sectorial inventado sería peor que uno "
            "absoluto declarado."
        ),
    }
