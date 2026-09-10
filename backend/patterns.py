"""
Detección de patrones de precio sobre datos reales.

Sustituye a los paneles que fabricaban ondas aplicando proporciones de
Fibonacci a números aleatorios sembrados con el ticker. La diferencia
fundamental no es la precisión: es que **estas funciones pueden no encontrar
nada**, y devolver «sin patrón» es una respuesta legítima y frecuente. Un
detector que siempre encuentra un conteo perfecto no está detectando.

Dos etapas:

1. `zigzag` reduce la serie a sus pivotes significativos. El umbral va en
   múltiplos de ATR y no en un porcentaje fijo, porque un movimiento del 3 %
   es ruido en una acción volátil y una señal en un valor tranquilo.
2. Los detectores leen esos pivotes y comprueban las reglas duras del patrón.
   Si una regla falla, se dice cuál — el motivo del descarte es tan útil como
   el hallazgo.
"""

from __future__ import annotations

from typing import List, Optional, Dict, Any
import math

import numpy as np
import pandas as pd


# ──────────────────────────────────────────────────────────────────────────
# Utilidades
# ──────────────────────────────────────────────────────────────────────────

def _atr(df: pd.DataFrame, periodo: int = 14) -> float:
    """ATR de Wilder. Devuelve 0 si no hay barras suficientes."""
    if df is None or len(df) < periodo + 1:
        return 0.0
    alto = df["High"].astype(float)
    bajo = df["Low"].astype(float)
    cierre = df["Close"].astype(float)
    cierre_prev = cierre.shift(1)
    tr = pd.concat(
        [alto - bajo, (alto - cierre_prev).abs(), (bajo - cierre_prev).abs()],
        axis=1,
    ).max(axis=1)
    valor = tr.rolling(periodo).mean().iloc[-1]
    return float(valor) if pd.notna(valor) else 0.0


def zigzag(df: pd.DataFrame, umbral_atr: float = 2.0) -> List[Dict[str, Any]]:
    """Pivotes alternos (máximo, mínimo, máximo…) de la serie de cierres.

    Un pivote se confirma cuando el precio se aleja del extremo provisional
    más de `umbral_atr` veces el ATR. Así el filtro se adapta a la
    volatilidad del valor en lugar de aplicar el mismo porcentaje a todo.
    """
    if df is None or len(df) < 20:
        return []

    atr = _atr(df)
    if atr <= 0:
        return []
    umbral = atr * umbral_atr

    cierres = df["Close"].astype(float).values
    fechas = df.index

    pivotes: List[Dict[str, Any]] = []
    idx_ext = 0
    precio_ext = float(cierres[0])
    # None hasta que el primer movimiento decida si venimos de subida o bajada.
    direccion: Optional[int] = None

    for i in range(1, len(cierres)):
        precio = float(cierres[i])

        if direccion is None:
            if abs(precio - precio_ext) >= umbral:
                direccion = 1 if precio > precio_ext else -1
                pivotes.append({
                    "idx": idx_ext,
                    "precio": precio_ext,
                    "tipo": "min" if direccion == 1 else "max",
                    "fecha": str(fechas[idx_ext])[:10],
                })
                idx_ext, precio_ext = i, precio
            elif (precio > precio_ext) != (precio_ext > float(cierres[0])):
                idx_ext, precio_ext = i, precio
            continue

        if direccion == 1:
            # Buscando máximo: se extiende mientras suba.
            if precio > precio_ext:
                idx_ext, precio_ext = i, precio
            elif precio_ext - precio >= umbral:
                pivotes.append({
                    "idx": idx_ext, "precio": precio_ext, "tipo": "max",
                    "fecha": str(fechas[idx_ext])[:10],
                })
                direccion = -1
                idx_ext, precio_ext = i, precio
        else:
            if precio < precio_ext:
                idx_ext, precio_ext = i, precio
            elif precio - precio_ext >= umbral:
                pivotes.append({
                    "idx": idx_ext, "precio": precio_ext, "tipo": "min",
                    "fecha": str(fechas[idx_ext])[:10],
                })
                direccion = 1
                idx_ext, precio_ext = i, precio

    # El extremo en curso se añade como pivote provisional: es el que da el
    # contexto de «dónde estamos ahora», aunque aún pueda extenderse.
    pivotes.append({
        "idx": idx_ext,
        "precio": precio_ext,
        "tipo": "max" if direccion == 1 else "min",
        "fecha": str(fechas[idx_ext])[:10],
        "provisional": True,
    })
    return pivotes


def _fib(a: float, b: float, c: float) -> Optional[float]:
    """Proporción |c-b| / |b-a|, la lectura habitual de un retroceso."""
    base = abs(b - a)
    return abs(c - b) / base if base > 1e-9 else None


# ──────────────────────────────────────────────────────────────────────────
# Elliott — impulso 1-2-3-4-5
# ──────────────────────────────────────────────────────────────────────────

def _evaluar_elliott(p) -> Dict[str, Any]:
    """Valida una ventana de seis pivotes como impulso 1-2-3-4-5."""
    y = [float(q["precio"]) for q in p]
    p0, p1, p2, p3, p4, p5 = y
    alcista = p1 > p0
    sg = 1 if alcista else -1

    o1, o2, o3, o4, o5 = (abs(p1 - p0), abs(p2 - p1), abs(p3 - p2),
                          abs(p4 - p3), abs(p5 - p4))

    r2 = _fib(p0, p1, p2)
    ok1 = r2 is not None and r2 < 1.0 and ((p2 > p0) if alcista else (p2 < p0))
    ok2 = (p4 > p1) if alcista else (p4 < p1)
    ok3 = not (o3 < o1 and o3 < o5)
    # La 3 debe superar el extremo de la 1: si no, no es un impulso.
    ok4 = (p3 > p1) if alcista else (p3 < p1)

    reglas = [
        {"regla": "La onda 2 no retrocede más del 100 % de la onda 1",
         "cumple": bool(ok1), "valor": f"{r2*100:.1f} %" if r2 is not None else "—"},
        {"regla": "La onda 4 no solapa el territorio de la onda 1",
         "cumple": bool(ok2), "valor": f"{p4:.2f} frente a {p1:.2f}"},
        {"regla": "La onda 3 no es la más corta",
         "cumple": bool(ok3), "valor": f"O1 {o1:.2f} · O3 {o3:.2f} · O5 {o5:.2f}"},
        {"regla": "La onda 3 supera el extremo de la onda 1",
         "cumple": bool(ok4), "valor": f"{p3:.2f} frente a {p1:.2f}"},
    ]
    aciertos = sum(1 for r in reglas if r["cumple"])
    if aciertos < 4:
        return {"valido": False, "reglas": reglas, "aciertos": aciertos}

    prop = {
        "onda_2_vs_1": round(o2 / o1, 3) if o1 > 1e-9 else None,
        "onda_3_vs_1": round(o3 / o1, 3) if o1 > 1e-9 else None,
        "onda_4_vs_3": round(o4 / o3, 3) if o3 > 1e-9 else None,
        "onda_5_vs_1": round(o5 / o1, 3) if o1 > 1e-9 else None,
        "onda_5_vs_3": round(o5 / o3, 3) if o3 > 1e-9 else None,
    }

    def cerca(valor, objetivo, tol=0.12):
        return valor is not None and abs(valor - objetivo) <= tol

    # Detalle por onda, con la referencia canónica de cada una.
    detalle = [
        {"onda": "1", "tipo": "Impulso", "precio": round(p1, 2),
         "referencia": "100 % (referencia)", "medido": "—",
         "cumple": True,
         "senal": "Origen del conteo; sirve de patrón de medida."},
        {"onda": "2", "tipo": "Corrección", "precio": round(p2, 2),
         "referencia": "50 – 61.8 % de la onda 1",
         "medido": f"{prop['onda_2_vs_1']*100:.1f} %" if prop["onda_2_vs_1"] else "—",
         "cumple": bool(prop["onda_2_vs_1"] and 0.38 <= prop["onda_2_vs_1"] <= 0.786),
         "senal": "Zona habitual de entrada a favor de la tendencia."},
        {"onda": "3", "tipo": "Impulso extendido", "precio": round(p3, 2),
         "referencia": "161.8 % de la onda 1",
         "medido": f"{prop['onda_3_vs_1']*100:.1f} %" if prop["onda_3_vs_1"] else "—",
         "cumple": bool(prop["onda_3_vs_1"] and prop["onda_3_vs_1"] >= 1.0),
         "senal": "Tramo más rentable; mantener con stop dinámico."},
        {"onda": "4", "tipo": "Corrección", "precio": round(p4, 2),
         "referencia": "23.6 – 38.2 % de la onda 3",
         "medido": f"{prop['onda_4_vs_3']*100:.1f} %" if prop["onda_4_vs_3"] else "—",
         "cumple": bool(prop["onda_4_vs_3"] and prop["onda_4_vs_3"] <= 0.618),
         "senal": "Última corrección antes del tramo final."},
        {"onda": "5", "tipo": "Impulso final", "precio": round(p5, 2),
         "referencia": "61.8 – 100 % de la onda 1",
         "medido": f"{prop['onda_5_vs_1']*100:.1f} %" if prop["onda_5_vs_1"] else "—",
         "cumple": bool(prop["onda_5_vs_1"] and 0.5 <= prop["onda_5_vs_1"] <= 1.618),
         "senal": "Salida; preparar corrección A-B-C."},
    ]

    # Proyecciones de la onda 5 medidas desde el final de la 4.
    proyecciones = [
        {"nivel": "61.8 % de la onda 1", "precio": round(max(0.0, p4 + sg * o1 * 0.618), 2)},
        {"nivel": "100 % de la onda 1", "precio": round(max(0.0, p4 + sg * o1 * 1.000), 2)},
        {"nivel": "161.8 % de la onda 1", "precio": round(max(0.0, p4 + sg * o1 * 1.618), 2)},
    ]

    # Retrocesos de la corrección A-B-C que sigue al impulso completo.
    recorrido_total = abs(p5 - p0)
    retrocesos = [
        {"nivel": "38.2 % del impulso", "precio": round(max(0.0, p5 - sg * recorrido_total * 0.382), 2)},
        {"nivel": "50 % del impulso", "precio": round(max(0.0, p5 - sg * recorrido_total * 0.500), 2)},
        {"nivel": "61.8 % del impulso", "precio": round(max(0.0, p5 - sg * recorrido_total * 0.618), 2)},
    ]

    # Calidad: cuánto se acercan las proporciones a las canónicas.
    puntos_fib = sum([
        1.0 if cerca(prop["onda_2_vs_1"], 0.618, 0.18) else 0.0,
        1.0 if cerca(prop["onda_3_vs_1"], 1.618, 0.45) else 0.0,
        1.0 if cerca(prop["onda_4_vs_3"], 0.382, 0.22) else 0.0,
        1.0 if cerca(prop["onda_5_vs_1"], 1.000, 0.45) else 0.0,
    ]) / 4.0
    extension_3 = min(1.0, (prop["onda_3_vs_1"] or 0) / 1.618)
    calidad = round((puntos_fib * 0.65 + extension_3 * 0.35) * 100)

    # Onda actual: si el último pivote sigue formándose, estamos en la 5.
    en_curso = bool(p[-1].get("provisional"))
    onda_actual = "5 (en curso)" if en_curso else "5 (completada) — corrección A-B-C esperada"

    # El plan depende de EN QUÉ onda estamos, y esto la versión anterior lo
    # ignoraba: proponía comprar en el punto 5 con objetivo en el propio punto
    # 5, de modo que el recorrido era cero.
    #
    # Con la onda 5 en curso todavía queda tramo y se opera a favor. Con la 5
    # ya completada el impulso ha terminado: lo que viene es la corrección
    # A-B-C, así que la lectura es de salida, no de entrada.
    if en_curso:
        sentido = "Compra" if alcista else "Venta"
        entrada = p4
        # El stop va en el nivel que invalida el conteo: la regla dice que la
        # onda 4 no puede solapar el territorio de la onda 1, así que si el
        # precio cruza el extremo de la 1 el impulso deja de existir. Poner el
        # stop en la onda 3 lo dejaría al otro lado de la entrada.
        stop = p1
        objetivo = proyecciones[1]["precio"]
        objetivo2 = proyecciones[2]["precio"]
        nota_plan = "Onda 5 en curso: se opera a favor del impulso hasta la proyección."
    else:
        # Corrección esperada: la operación es contraria al impulso.
        sentido = "Venta" if alcista else "Compra"
        entrada = p5
        stop = round(max(0.0, p5 + sg * abs(p5 - p4) * 0.25), 2)
        objetivo = retrocesos[0]["precio"]
        objetivo2 = retrocesos[2]["precio"]
        nota_plan = ("Impulso completado: lo que sigue es la corrección A-B-C. "
                     "La lectura es de salida o de operación contraria, no de continuación.")

    riesgo = abs(entrada - stop)
    recorrido = abs(objetivo - entrada)

    return {
        "valido": True,
        "encontrado": True,
        "direccion": "alcista" if alcista else "bajista",
        "reglas": reglas,
        "aciertos": aciertos,
        "ondas": [{"n": str(i), "precio": round(y[i], 4), "fecha": p[i]["fecha"],
                   "idx": int(p[i]["idx"])} for i in range(6)],
        "detalle": detalle,
        "proporciones": prop,
        "proyecciones": proyecciones,
        "retrocesos": retrocesos,
        "objetivos": {
            "onda_3_161": round(max(0.0, p2 + sg * o1 * 1.618), 2),
            "onda_5_100_o1": proyecciones[1]["precio"],
            "onda_5_618_o1": proyecciones[0]["precio"],
        },
        "calidad": calidad,
        "calidad_etiqueta": ("Alta" if calidad >= 70 else "Aceptable" if calidad >= 50 else "Baja"),
        "onda_actual": onda_actual,
        "estructura": "1-2-3-4-5",
        "tipo_patron": "Impulsivo",
        "plan": {
            "sentido": sentido,
            "entrada": round(entrada, 2),
            "stop_loss": round(stop, 2),
            "objetivo_1": objetivo,
            "objetivo_2": objetivo2,
            "riesgo": round(riesgo, 2),
            "recorrido": round(recorrido, 2),
            "riesgo_beneficio": round(recorrido / riesgo, 2) if riesgo > 0 else 0.0,
            "nota": nota_plan,
        },
        "provisional": en_curso,
    }


def detectar_elliott(df: pd.DataFrame, umbral_atr: Optional[float] = None) -> Dict[str, Any]:
    """Impulso de cinco ondas, buscado en todo el histórico y a varias escalas.

    Mismo arreglo que en Wolfe: antes solo se evaluaban los seis últimos
    pivotes, de modo que un impulso perfectamente válido formado un poco antes
    se descartaba sin mirarlo. Ahora se recorren todas las ventanas, de la más
    reciente hacia atrás, a tres escalas de ZigZag.

    Y los mismos dos filtros: un conteo cuya onda 5 terminó hace meses ya no
    es operable, y con decenas de ventanas revisadas hace falta un mínimo de
    calidad para distinguir un impulso de una coincidencia.
    """
    escalas = [umbral_atr] if umbral_atr is not None else [2.0, 1.5, 1.0]
    mejor_fallo = None
    total_ventanas = 0
    pivotes_max = []
    descartados = {"antiguo": 0, "baja_calidad": 0}

    for u in escalas:
        pivotes = zigzag(df, u)
        if len(pivotes) > len(pivotes_max):
            pivotes_max = pivotes
        if len(pivotes) < 6:
            continue

        for inicio in range(len(pivotes) - 6, -1, -1):
            total_ventanas += 1
            r = _evaluar_elliott(pivotes[inicio:inicio + 6])
            if not r["valido"]:
                if mejor_fallo is None or r["aciertos"] > mejor_fallo["aciertos"]:
                    mejor_fallo = r
                continue

            barras = len(df)
            antiguedad = barras - 1 - r["ondas"][5]["idx"]
            if antiguedad > max(30, int(barras * 0.15)):
                descartados["antiguo"] += 1
                continue
            if r["calidad"] < 50:
                descartados["baja_calidad"] += 1
                continue

            r["escala_atr"] = u
            r["pivotes"] = pivotes
            r["ventanas_examinadas"] = total_ventanas
            r["antiguedad_barras"] = int(antiguedad)
            r["descartados"] = dict(descartados)
            r.pop("valido", None)
            return r

    if not pivotes_max:
        return {"encontrado": False,
                "motivo": "No hay pivotes significativos: la serie es demasiado plana o corta.",
                "pivotes": []}
    if mejor_fallo is None:
        return {"encontrado": False,
                "motivo": f"Solo {len(pivotes_max)} pivotes; un impulso necesita 6.",
                "pivotes": pivotes_max}

    fallidas = [r["regla"] for r in mejor_fallo["reglas"] if not r["cumple"]]
    return {
        "encontrado": False,
        "motivo": (
            f"Ninguna de las {total_ventanas} ventanas examinadas da un conteo operable. "
            + (f"Descartados por antigüedad: {descartados['antiguo']}; "
               f"por calidad insuficiente: {descartados['baja_calidad']}. "
               if any(descartados.values()) else "")
            + f"El más aproximado cumple {mejor_fallo['aciertos']} de 4 reglas; "
              f"falla en: {'; '.join(fallidas)}."),
        "reglas": mejor_fallo["reglas"],
        "ventanas_examinadas": total_ventanas,
        "descartados": dict(descartados),
        "pivotes": pivotes_max,
    }


# ──────────────────────────────────────────────────────────────────────────
# Wolfe — patrón de cinco puntos
# ──────────────────────────────────────────────────────────────────────────

def _evaluar_wolfe(p) -> Dict[str, Any]:
    """Valida una ventana concreta de cinco pivotes. No busca: solo juzga."""
    x = [q["idx"] for q in p]
    y = [float(q["precio"]) for q in p]
    p1, p2, p3, p4, p5 = y

    bajista = p[4]["tipo"] == "max"
    if bajista:
        c1 = p1 > p2 and p3 > p2 and p3 > p1
        c2 = p4 < p3 and p4 > p2
        c3 = p5 > p3
    else:
        c1 = p1 < p2 and p3 < p2 and p3 < p1
        c2 = p4 > p3 and p4 < p2
        c3 = p5 < p3

    reglas = [
        {"regla": "Alternancia 1-2-3 correcta", "cumple": bool(c1),
         "valor": f"P1 {p1:.2f} · P2 {p2:.2f} · P3 {p3:.2f}"},
        {"regla": "El punto 4 queda dentro del canal 2-3", "cumple": bool(c2),
         "valor": f"P4 {p4:.2f} entre {min(p2, p3):.2f} y {max(p2, p3):.2f}"},
        {"regla": "El punto 5 supera al punto 3", "cumple": bool(c3),
         "valor": f"P5 {p5:.2f} frente a P3 {p3:.2f}"},
    ]
    if not (c1 and c2 and c3) or x[3] == x[0] or x[2] == x[0]:
        return {"valido": False, "reglas": reglas,
                "aciertos": sum(1 for r in reglas if r["cumple"])}

    def recta(i, j):
        m = (y[j] - y[i]) / (x[j] - x[i])
        return m, y[i] - m * x[i]

    m13, b13 = recta(0, 2)
    m24, b24 = recta(1, 3)
    m14, b14 = recta(0, 3)

    ancho = max(1, x[4] - x[0])
    x_epa = x[4] + ancho
    epa = max(0.0, float(m14 * x_epa + b14))
    entrada = p5
    coherente = (epa < entrada) if bajista else (epa > entrada)

    recorrido = abs(entrada - epa)
    signo = -1 if bajista else 1
    extensiones = [
        {"nivel": "100 % (EPA)", "precio": round(max(0.0, entrada + signo * recorrido * 1.000), 2)},
        {"nivel": "127.2 %", "precio": round(max(0.0, entrada + signo * recorrido * 1.272), 2)},
        {"nivel": "161.8 %", "precio": round(max(0.0, entrada + signo * recorrido * 1.618), 2)},
        {"nivel": "200 %", "precio": round(max(0.0, entrada + signo * recorrido * 2.000), 2)},
    ]

    amp_23 = abs(p3 - p2)
    amp_45 = abs(p5 - p4)
    simetria = max(0.0, entrada + signo * amp_23)
    ratio_sim = (min(amp_23, amp_45) / max(amp_23, amp_45)) if max(amp_23, amp_45) > 0 else 0.0

    exceso_5 = abs(p5 - (m13 * x[4] + b13))
    exceso_rel = min(1.0, exceso_5 / recorrido) if recorrido > 0 else 0.0

    colchon = max(abs(p5 - p4) * 0.20, abs(entrada) * 0.005)
    stop = max(0.0, entrada + colchon if bajista else entrada - colchon)
    riesgo = abs(stop - entrada)
    rr = (recorrido / riesgo) if riesgo > 0 else 0.0
    rr_norm = min(1.0, rr / 3.0)

    calidad = round((ratio_sim * 0.40 + exceso_rel * 0.25 + rr_norm * 0.35) * 100)

    return {
        "valido": True,
        "encontrado": True,
        "direccion": "bajista" if bajista else "alcista",
        "reglas": reglas,
        "aciertos": 3,
        "puntos": [{"n": f"P{i+1}", "precio": round(y[i], 4),
                    "fecha": p[i]["fecha"], "idx": int(x[i])} for i in range(5)],
        "rectas": {
            "linea_1_3": {"pendiente": round(m13, 6), "ordenada": round(b13, 4)},
            "linea_2_4": {"pendiente": round(m24, 6), "ordenada": round(b24, 4)},
            "linea_1_4": {"pendiente": round(m14, 6), "ordenada": round(b14, 4)},
        },
        "entrada": round(entrada, 2),
        "epa": round(epa, 2),
        "epa_idx": int(x_epa),
        "extensiones": extensiones,
        "simetria": {"amplitud_2_3": round(amp_23, 2), "amplitud_4_5": round(amp_45, 2),
                     "estimacion": round(simetria, 2), "ratio": round(ratio_sim, 3)},
        "calidad": calidad,
        "calidad_etiqueta": ("Alta" if calidad >= 70 else "Aceptable" if calidad >= 50 else "Baja"),
        "calidad_detalle": {"simetria": round(ratio_sim * 100),
                            "ruptura_linea_1_3": round(exceso_rel * 100),
                            "riesgo_beneficio": round(rr, 2)},
        "plan": {"sentido": "Venta" if bajista else "Compra",
                 "entrada": round(entrada, 2), "stop_loss": round(stop, 2),
                 "objetivo_1": round(epa, 2), "objetivo_2": extensiones[2]["precio"],
                 "riesgo": round(riesgo, 2), "recorrido": round(recorrido, 2),
                 "riesgo_beneficio": round(rr, 2)},
        "objetivo_coherente": bool(coherente),
        "aviso": None if coherente else (
            "El objetivo proyectado queda al otro lado de la entrada: el patrón "
            "no es operable en esta lectura."),
        "provisional": bool(p[-1].get("provisional")),
    }


def detectar_wolfe(df: pd.DataFrame, umbral_atr: Optional[float] = None) -> Dict[str, Any]:
    """Patrón de Wolfe de cinco puntos, buscado en todo el histórico.

    Dos cosas que la versión anterior hacía mal y explican por qué casi nunca
    encontraba nada:

    1. **Solo miraba los cinco últimos pivotes.** Con 16 pivotes en un año hay
       doce ventanas posibles; se descartaban once sin mirarlas. Ahora se
       recorren todas, de la más reciente hacia atrás, y se devuelve la
       primera válida — la más reciente es la que importa para operar.

    2. **Un único umbral de ZigZag.** Los patrones existen a distintas
       escalas: lo que a 2 ATR es ruido, a 1 ATR es una onda. Se prueban
       varios, de mayor a menor, porque un patrón sobre pivotes grandes es
       más significativo que el mismo dibujo sobre oscilaciones menores.
    """
    escalas = [umbral_atr] if umbral_atr is not None else [2.0, 1.5, 1.0]
    mejor_fallo = None
    total_ventanas = 0
    pivotes_max = []
    descartados = {"antiguo": 0, "baja_calidad": 0, "incoherente": 0}

    for u in escalas:
        pivotes = zigzag(df, u)
        if len(pivotes) > len(pivotes_max):
            pivotes_max = pivotes
        if len(pivotes) < 5:
            continue

        # De la ventana más reciente hacia atrás.
        for inicio in range(len(pivotes) - 5, -1, -1):
            total_ventanas += 1
            r = _evaluar_wolfe(pivotes[inicio:inicio + 5])
            if not r["valido"]:
                if mejor_fallo is None or r["aciertos"] > mejor_fallo["aciertos"]:
                    mejor_fallo = r
                continue

            # ── Vigencia ──
            # Un patrón cuyo punto 5 se formó hace meses es historia, no una
            # señal: la entrada ya pasó. Solo cuenta si el 5 cae en el último
            # tramo de la serie.
            barras = len(df)
            antiguedad = barras - 1 - r["puntos"][4]["idx"]
            if antiguedad > max(30, int(barras * 0.15)):
                descartados["antiguo"] += 1
                continue

            # ── Calidad mínima ──
            # Con decenas de ventanas revisadas a tres escalas, encontrar
            # alguna que cumpla tres reglas laxas es casi seguro. Exigir una
            # calidad mínima es lo que separa un patrón de una coincidencia.
            if r["calidad"] < 50:
                descartados["baja_calidad"] += 1
                continue

            if not r["objetivo_coherente"]:
                descartados["incoherente"] += 1
                continue

            r["escala_atr"] = u
            r["pivotes"] = pivotes
            r["ventanas_examinadas"] = total_ventanas
            r["antiguedad_barras"] = int(antiguedad)
            r["descartados"] = dict(descartados)
            r.pop("valido", None)
            return r

    if not pivotes_max:
        return {"encontrado": False,
                "motivo": "No hay pivotes significativos: la serie es demasiado plana o corta.",
                "pivotes": []}

    if mejor_fallo is None:
        return {"encontrado": False,
                "motivo": f"Solo {len(pivotes_max)} pivotes; el patrón necesita 5.",
                "pivotes": pivotes_max}

    fallidas = [r["regla"] for r in mejor_fallo["reglas"] if not r["cumple"]]
    return {
        "encontrado": False,
        "motivo": (
            f"Ninguna de las {total_ventanas} ventanas examinadas da un patrón operable. "
            + (f"Descartados por antigüedad: {descartados['antiguo']}; "
               f"por calidad insuficiente: {descartados['baja_calidad']}; "
               f"por objetivo incoherente: {descartados['incoherente']}. "
               if any(descartados.values()) else "")
            + f"La más aproximada cumple {mejor_fallo['aciertos']} de 3 reglas; "
              f"falla en: {'; '.join(fallidas)}."),
        "descartados": dict(descartados),
        "reglas": mejor_fallo["reglas"],
        "ventanas_examinadas": total_ventanas,
        "pivotes": pivotes_max,
    }
