"""
================================================================================
Puntos pivote de Woodie + VWAP anclado + señal de confluencia
================================================================================
Implementa lo que pedía el texto del usuario, con los errores técnicos
corregidos y declarados. Todos van aquí arriba porque cambian lo que sale en
pantalla respecto a lo que el texto describía.

────────────────────────────────────────────────────────────────────────────
ERROR 1 — La fórmula de Woodie del texto no es la de Woodie
────────────────────────────────────────────────────────────────────────────
El texto dice:

    Woodie:  PP = (H + L + 2C) / 4     «da más peso al CIERRE anterior»

La fórmula original de Woodie, y la que usa TradingView en «Pivot Points
Standard», es:

    Woodie:  PP = (H_ant + L_ant + 2 × APERTURA_actual) / 4

El doble peso NO va al cierre anterior: va a la **apertura del periodo en
curso**. Y ahí está justo el motivo de que Woodie «reaccione más rápido», que
el texto atribuye al cierre: es el único pivote clásico que incorpora
información del periodo que se está operando.

La consecuencia práctica invierte otra afirmación del texto. Su tabla puntúa a
Woodie igual que a Traditional en «mercados con gaps» (⭐⭐⭐⭐). Es al revés:

* con la apertura, un hueco de apertura entra en el cálculo y los niveles se
  desplazan con él — que es exactamente lo que quieres cuando hay gap;
* con el cierre anterior doble, el hueco se ignora por completo y el mapa de
  niveles queda anclado a un precio que el mercado ya ha abandonado.

Aquí se calculan **las dos variantes**, `apertura` (la real, por defecto) y
`cierre` (la del texto), para que la diferencia se pueda ver en vez de
discutirla.

────────────────────────────────────────────────────────────────────────────
ERROR 2 — «PP + VWAP + Supertrend» no son tres confirmaciones independientes
────────────────────────────────────────────────────────────────────────────
El texto propone exigir precio > PP **y** precio > VWAP **y** SuperTrend verde,
y presenta eso como triple confirmación. Los tres son medias de precio
reciente: cuando el precio está por encima de una, suele estarlo de las otras.
Contar la misma evidencia tres veces no la hace más fuerte, sólo lo parece.

Este proyecto ya se topó con lo mismo y lo dejó escrito: con SuperTrend a
factor 1 el acuerdo con UT Bot subía al 93,8 % y «ahí deja de confirmar nada».

Así que aquí **se mide**: `colinealidad` devuelve el porcentaje de barras en
que el lado del PP y el lado del VWAP coinciden. Si sale 90 %, la tarjeta lo
dice y el usuario decide qué hacer con esa «confluencia».

────────────────────────────────────────────────────────────────────────────
ERROR 3 — La secuencia del texto es temporal, no simultánea
────────────────────────────────────────────────────────────────────────────
El texto enumera: precio > PP → precio > VWAP → SuperTrend verde → ruptura de
estructura → retroceso a PP/VWAP → vela de rechazo → entrada.

Eso NO es una conjunción de condiciones: es una secuencia con orden. Evaluarlo
como un `and` de booleanos casi nunca dispara, porque «ruptura» y «retroceso»
son estados opuestos que no pueden ser ciertos en la misma barra. Es
literalmente el fallo que dejó el embudo del NQE en cero.

Se implementa como una **máquina de estados** de cuatro fases que avanza barra
a barra, y la tarjeta enseña en qué fase está.

────────────────────────────────────────────────────────────────────────────
MEJORA 1 — Cuántas veces se toca cada nivel, medido
────────────────────────────────────────────────────────────────────────────
El texto reparte estrellas: R1/S1 ⭐⭐⭐⭐⭐, R3/S3 ⭐⭐⭐. Son opiniones. Aquí
cada nivel viaja con su **tasa de toque histórica**: de los últimos N periodos,
en cuántos el precio llegó de verdad a ese nivel. Un R3 con 4 % de toques se
lee solo.

────────────────────────────────────────────────────────────────────────────
MEJORA 2 — El VWAP se ancla al periodo del pivote
────────────────────────────────────────────────────────────────────────────
«VWAP» sin más es ambiguo. El institucional es el de SESIÓN, que se reinicia
cada día. Un VWAP rodante de N barras —como el que usa `nqe.py`— es otra cosa
y no sirve para esto.

Aquí el VWAP se ancla **al inicio del periodo del pivote**: con pivotes
diarios es el VWAP de sesión de toda la vida; con pivotes semanales, el
anclado al lunes; con mensuales, al día 1. Así el VWAP y los niveles hablan
siempre del mismo tramo de tiempo, que es lo que hace comparable la lectura.

────────────────────────────────────────────────────────────────────────────
MEJORA 3 — Un objetivo más cerca que el stop no es una operación
────────────────────────────────────────────────────────────────────────────
El texto entra y pone «R1 como primer objetivo». Si la entrada cae a un 0,2 %
de R1 y el stop está a un 1 %, la relación es 1:5 EN CONTRA. La señal se
calcula igual, pero se marca como no operable y se dice por qué.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from nqe import _atr, _f

# Periodo del que salen los niveles, según el marco del gráfico. Es la práctica
# estándar: los pivotes se calculan SIEMPRE sobre un periodo mayor que la vela
# que se está mirando. Con pivotes diarios, 5m y 1H enseñan los MISMOS niveles
# —y así debe ser—; lo que cambia con el marco es la señal, no el mapa.
PERIODO_POR_MARCO = {
    "5m": "diario",
    "15m": "diario",
    "1h": "diario",
    "4h": "diario",
    "1d": "semanal",
    "1w": "mensual",
}

# Regla de reagrupación de pandas para cada periodo de pivote.
# «W» son semanas ISO (lunes a domingo). Ojo con «W-MON», que agrupa de martes
# a lunes y mezcla dos semanas de calendario.
REGLA_PERIODO = {"diario": "D", "semanal": "W", "mensual": "MS"}

VARIANTE_APERTURA = "apertura"
VARIANTE_CIERRE = "cierre"


@dataclass
class Parametros:
    """Mandos de la tarjeta."""

    variante: str = VARIANTE_APERTURA
    periodo: Optional[str] = None
    #: Periodos hacia atrás para medir la tasa de toque de cada nivel.
    muestra_toques: int = 60
    #: Distancia máxima al PP/VWAP para considerar que hay retroceso, en ATR.
    zona_atr: float = 0.6
    #: Barras que puede durar cada fase antes de caducar la secuencia.
    caducidad: int = 30
    st_factor: float = 3.0
    st_len: int = 10
    len_atr: int = 14
    #: Distancia máxima entre el PP de Woodie y el clásico para llamarlo
    #: confluencia, en porcentaje del precio.
    umbral_confluencia_pct: float = 0.15
    barras_serie: int = 180


# ==============================================================================
# Niveles
# ==============================================================================

def niveles_pivote(
    alto: float, bajo: float, cierre: float, apertura_actual: Optional[float],
    variante: str = VARIANTE_APERTURA,
) -> Dict[str, float]:
    """Woodie: PP y sus tres resistencias y soportes.

    `alto`, `bajo` y `cierre` son los del periodo ANTERIOR. `apertura_actual`
    es la del periodo en curso, y es lo que distingue al Woodie de verdad: sin
    ella se cae a la variante del cierre doble, que es la que circula por ahí
    pero ignora los huecos de apertura.

    R1/S1 y R2/S2 son los mismos que en el pivote clásico; lo único que cambia
    es el PP del que cuelgan. R3/S3 son los de suelo (floor pivots).
    """
    if variante == VARIANTE_APERTURA and apertura_actual is not None and math.isfinite(apertura_actual):
        pp = (alto + bajo + 2.0 * apertura_actual) / 4.0
    else:
        pp = (alto + bajo + 2.0 * cierre) / 4.0
    rango = alto - bajo
    return {
        "pp": pp,
        "r1": 2.0 * pp - bajo,
        "s1": 2.0 * pp - alto,
        "r2": pp + rango,
        "s2": pp - rango,
        "r3": alto + 2.0 * (pp - bajo),
        "s3": bajo - 2.0 * (alto - pp),
    }


def niveles_tradicional(alto: float, bajo: float, cierre: float) -> Dict[str, float]:
    """Pivote clásico. Se calcula para poder medir la confluencia con Woodie,
    que es lo que el texto proponía al final y sí es una idea buena."""
    pp = (alto + bajo + cierre) / 3.0
    rango = alto - bajo
    return {
        "pp": pp,
        "r1": 2.0 * pp - bajo,
        "s1": 2.0 * pp - alto,
        "r2": pp + rango,
        "s2": pp - rango,
        "r3": alto + 2.0 * (pp - bajo),
        "s3": bajo - 2.0 * (alto - pp),
    }


CLAVES = ("r3", "r2", "r1", "pp", "s1", "s2", "s3")


# ==============================================================================
# VWAP anclado
# ==============================================================================

def vwap_anclado(df: pd.DataFrame, regla: str) -> np.ndarray:
    """VWAP que se reinicia al empezar cada periodo.

    Con `regla='D'` es el VWAP de sesión de toda la vida. No es un VWAP
    rodante de N barras: aquél no se reinicia nunca y no se puede comparar con
    unos niveles que sí son del día.
    """
    hlc3 = (df["High"] + df["Low"] + df["Close"]) / 3.0
    vol = df["Volume"].astype(float).fillna(0.0)
    # `to_period` descarta la zona horaria y avisa. Se quita antes a propósito:
    # el agrupado tiene que hacerse en la hora LOCAL DEL MERCADO, que es la que
    # trae el índice, no en UTC — si no, la sesión de Nueva York se partiría en
    # dos «días» a las 19:00.
    marcas_tiempo = df.index.tz_localize(None) if df.index.tz is not None else df.index
    grupo = marcas_tiempo.to_period("M" if regla == "MS" else regla)
    pv = (hlc3 * vol).groupby(grupo).cumsum()
    v = vol.groupby(grupo).cumsum()
    with np.errstate(invalid="ignore", divide="ignore"):
        salida = np.where(v.to_numpy() > 0, pv.to_numpy() / v.to_numpy(), np.nan)
    return salida


# ==============================================================================
# SuperTrend (mismo cálculo que en `nqe.py`, sin importar su motor entero)
# ==============================================================================

def _supertrend(
    alto: np.ndarray, bajo: np.ndarray, cierre: np.ndarray, factor: float, periodo: int
) -> Tuple[np.ndarray, np.ndarray]:
    n = len(cierre)
    atr = _atr(alto, bajo, cierre, periodo)
    medio = (alto + bajo) / 2.0
    sup = np.full(n, np.nan)
    inf = np.full(n, np.nan)
    direccion = np.ones(n, dtype=int)
    actual = 1
    for i in range(n):
        a = atr[i]
        sup_prev = sup[i - 1] if i > 0 else np.nan
        inf_prev = inf[i - 1] if i > 0 else np.nan
        if not np.isfinite(a):
            direccion[i] = actual
            continue
        arriba = medio[i] + factor * a
        abajo = medio[i] - factor * a
        c_prev = cierre[i - 1] if i > 0 else np.nan
        sup[i] = arriba if (not np.isfinite(sup_prev) or arriba < sup_prev
                            or (np.isfinite(c_prev) and c_prev > sup_prev)) else sup_prev
        inf[i] = abajo if (not np.isfinite(inf_prev) or abajo > inf_prev
                           or (np.isfinite(c_prev) and c_prev < inf_prev)) else inf_prev
        if actual == -1 and np.isfinite(sup_prev) and cierre[i] > sup_prev:
            actual = 1
        elif actual == 1 and np.isfinite(inf_prev) and cierre[i] < inf_prev:
            actual = -1
        direccion[i] = actual
    linea = np.where(direccion == 1, inf, sup)
    return direccion, linea


# ==============================================================================
# Motor
# ==============================================================================

def calcular(
    df: pd.DataFrame,
    base: pd.DataFrame,
    ticker: str,
    marco: str = "1h",
    p: Optional[Parametros] = None,
) -> Dict[str, Any]:
    """
    `df`   — velas del marco que se mira (5m, 15m, 1h, 4h, 1d o 1w).
    `base` — velas del periodo del pivote (diarias, semanales o mensuales),
             de donde salen los niveles.
    """
    p = p or Parametros()
    periodo = p.periodo or PERIODO_POR_MARCO.get(marco, "diario")
    regla = REGLA_PERIODO[periodo]

    columnas = {"Open", "High", "Low", "Close", "Volume"}
    if df is None or df.empty or not columnas.issubset(set(df.columns)):
        raise ValueError("Se necesitan barras OHLCV completas.")
    if base is None or len(base) < 3:
        raise ValueError("No hay suficientes periodos para calcular los pivotes.")

    df = df.dropna(subset=["Close"]).copy()
    base = base.dropna(subset=["Close"]).copy()
    n = len(df)
    if n < 40:
        raise ValueError(f"Histórico insuficiente: {n} velas, hacen falta al menos 40.")

    a = df["High"].to_numpy(dtype=float)
    b = df["Low"].to_numpy(dtype=float)
    c = df["Close"].to_numpy(dtype=float)
    o = df["Open"].to_numpy(dtype=float)
    idx = df.index

    avisos: List[str] = []

    # ── El periodo anterior y la apertura del actual ─────────────────────────
    anterior = base.iloc[-2]
    en_curso = base.iloc[-1]
    ant_alto = float(anterior["High"])
    ant_bajo = float(anterior["Low"])
    ant_cierre = float(anterior["Close"])
    apertura_actual = float(en_curso["Open"])

    if not (math.isfinite(ant_alto) and math.isfinite(ant_bajo) and ant_alto > ant_bajo):
        raise ValueError("El periodo anterior no tiene rango: no hay pivotes que calcular.")

    woodie = niveles_pivote(ant_alto, ant_bajo, ant_cierre, apertura_actual, p.variante)
    woodie_cierre = niveles_pivote(ant_alto, ant_bajo, ant_cierre, None, VARIANTE_CIERRE)
    clasico = niveles_tradicional(ant_alto, ant_bajo, ant_cierre)

    precio = float(c[-1])

    # ── Confluencia Woodie / clásico ─────────────────────────────────────────
    dist_pp = abs(woodie["pp"] - clasico["pp"])
    dist_pp_pct = dist_pp / precio * 100.0 if precio else float("nan")
    hay_confluencia = bool(dist_pp_pct <= p.umbral_confluencia_pct)

    # El hueco de apertura, que es lo que separa las dos variantes de Woodie.
    hueco_pct = (apertura_actual - ant_cierre) / ant_cierre * 100.0 if ant_cierre else 0.0
    desvio_variantes_pct = abs(woodie["pp"] - woodie_cierre["pp"]) / precio * 100.0 if precio else 0.0

    # ── VWAP anclado al periodo del pivote ───────────────────────────────────
    vwap_serie = vwap_anclado(df, regla)
    vwap = _f(vwap_serie[-1])
    if vwap is None:
        avisos.append("Sin volumen en el periodo: el VWAP no se puede calcular.")

    # ── SuperTrend y ATR sobre el marco que se mira ──────────────────────────
    st_dir, st_linea = _supertrend(a, b, c, p.st_factor, p.st_len)
    atr = _atr(a, b, c, p.len_atr)
    atr_actual = _f(atr[-1])

    # ── Colinealidad PP / VWAP ───────────────────────────────────────────────
    # El texto vende «precio > PP y precio > VWAP» como doble confirmación. Se
    # mide en cuántas barras las dos dicen lo mismo. Si es casi siempre, no son
    # dos confirmaciones: es una contada dos veces.
    lado_pp = np.sign(c - woodie["pp"])
    lado_vwap = np.sign(c - np.nan_to_num(vwap_serie, nan=np.inf))
    valido = np.isfinite(vwap_serie) & (lado_pp != 0) & (lado_vwap != 0)
    muestra_col = int(valido.sum())
    acuerdo = float((lado_pp[valido] == lado_vwap[valido]).mean()) if muestra_col else float("nan")
    if muestra_col and acuerdo >= 0.85:
        avisos.append(
            f"PP y VWAP coinciden en el {acuerdo * 100:.0f} % de las barras: exigir los dos "
            "no es doble confirmación, es la misma lectura contada dos veces."
        )

    # ── Tasa de toque de cada nivel, medida ──────────────────────────────────
    toques = _tasa_de_toques(base, p)

    # ── Estructura: último máximo y mínimo de referencia ─────────────────────
    ventana_estructura = min(20, max(5, n // 10))
    max_previo = float(np.max(a[-ventana_estructura - 1:-1])) if n > ventana_estructura else float(np.max(a[:-1]))
    min_previo = float(np.min(b[-ventana_estructura - 1:-1])) if n > ventana_estructura else float(np.min(b[:-1]))

    # ── Señal por máquina de estados ─────────────────────────────────────────
    senal, marcas, fase_actual = _secuencia(
        a, b, c, o, vwap_serie, st_dir, atr, woodie, p,
    )

    # ── Niveles con su distancia y su tasa de toque ──────────────────────────
    lista_niveles = []
    for clave in CLAVES:
        v = woodie[clave]
        lista_niveles.append({
            "clave": clave.upper(),
            "precio": _f(v),
            "papel": "soporte" if v < precio else "resistencia",
            "distancia_pct": _f((v - precio) / precio * 100.0) if precio else None,
            "toques_pct": _f(toques.get(clave)),
            "toques_muestra": toques.get("_muestra", 0),
            "clasico": _f(clasico[clave]),
        })

    # Nivel más cercano al precio: la lectura que se busca al abrir la tarjeta.
    cercano = min(lista_niveles, key=lambda x: abs(x["distancia_pct"] or 1e9))

    if atr_actual and atr_actual > 0:
        holgura = abs(woodie["r1"] - woodie["pp"]) / atr_actual
        if holgura < 0.5:
            avisos.append(
                f"R1 está a sólo {holgura:.2f} ATR del PP: en este periodo el mapa de niveles "
                "es más estrecho que el ruido de una vela."
            )

    return {
        "ticker": ticker,
        "marco": marco,
        "periodo": periodo,
        "variante": p.variante,
        "barras": int(n),
        "desde": str(idx[0])[:19],
        "hasta": str(idx[-1])[:19],

        "base": {
            "alto": _f(ant_alto),
            "bajo": _f(ant_bajo),
            "cierre": _f(ant_cierre),
            "apertura_actual": _f(apertura_actual),
            "hueco_pct": _f(hueco_pct),
            "fecha": str(base.index[-2])[:19],
        },

        "niveles": lista_niveles,
        "nivel_cercano": cercano["clave"],

        "confluencia": {
            "pp_woodie": _f(woodie["pp"]),
            "pp_clasico": _f(clasico["pp"]),
            "pp_woodie_cierre": _f(woodie_cierre["pp"]),
            "distancia_pct": _f(dist_pp_pct),
            "umbral_pct": p.umbral_confluencia_pct,
            "hay_confluencia": hay_confluencia,
            "desvio_variantes_pct": _f(desvio_variantes_pct),
        },

        "vwap": {
            "valor": vwap,
            "anclaje": periodo,
            "precio_sobre": bool(vwap is not None and precio > vwap),
            "distancia_pct": _f((precio - vwap) / precio * 100.0) if (vwap and precio) else None,
            "nota": (
                "VWAP anclado al inicio del periodo del pivote, no rodante: así habla "
                "del mismo tramo de tiempo que los niveles."
            ),
        },

        "supertrend": {
            "alcista": bool(st_dir[-1] == 1),
            "nivel": _f(st_linea[-1]),
            "factor": p.st_factor,
        },

        "estructura": {
            "max_previo": _f(max_previo),
            "min_previo": _f(min_previo),
            "ventana": int(ventana_estructura),
        },

        "colinealidad": {
            "acuerdo_pct": _f(acuerdo * 100.0) if muestra_col else None,
            "muestra": muestra_col,
        },

        "precio": {
            "actual": _f(precio),
            "sobre_pp": bool(precio > woodie["pp"]),
            "sobre_vwap": bool(vwap is not None and precio > vwap),
            "atr": atr_actual,
        },

        "senal": senal,
        "fase": fase_actual,

        "serie": _serie(df, vwap_serie, st_linea, marcas, p.barras_serie),
        "avisos": avisos,
    }


def _tasa_de_toques(base: pd.DataFrame, p: Parametros) -> Dict[str, Any]:
    """De los últimos N periodos, en cuántos llegó el precio a cada nivel.

    Los niveles de cada periodo se calculan con el anterior y se comprueban
    contra el máximo y el mínimo del periodo en curso — nunca con datos del
    propio periodo que se está midiendo.
    """
    resultado: Dict[str, Any] = {}
    alto = base["High"].to_numpy(dtype=float)
    bajo = base["Low"].to_numpy(dtype=float)
    cierre = base["Close"].to_numpy(dtype=float)
    apertura = base["Open"].to_numpy(dtype=float)
    n = len(base)
    # El último periodo está en curso: no cuenta, su máximo y mínimo aún pueden
    # crecer y contarlo inflaría la tasa a la baja.
    fin = n - 1
    inicio = max(1, fin - p.muestra_toques)
    muestra = max(0, fin - inicio)
    if muestra == 0:
        return {"_muestra": 0}

    contadores = {k: 0 for k in CLAVES}
    for i in range(inicio, fin):
        niv = niveles_pivote(alto[i - 1], bajo[i - 1], cierre[i - 1], apertura[i], p.variante)
        for k in CLAVES:
            v = niv[k]
            if bajo[i] <= v <= alto[i]:
                contadores[k] += 1
    for k in CLAVES:
        resultado[k] = contadores[k] / muestra
    resultado["_muestra"] = muestra
    return resultado


def _secuencia(
    a: np.ndarray, b: np.ndarray, c: np.ndarray, o: np.ndarray,
    vwap: np.ndarray, st_dir: np.ndarray, atr: np.ndarray,
    niv: Dict[str, float], p: Parametros,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]]:
    """La secuencia del texto, implementada como MÁQUINA DE ESTADOS.

    Fases, en orden y con caducidad:

        0. Sin sesgo.
        1. Sesgo: precio del mismo lado de PP y de VWAP, y SuperTrend a favor.
        2. Ruptura de estructura en la dirección del sesgo.
        3. Retroceso a la zona PP/VWAP.
        4. Vela de rechazo -> SEÑAL.

    Evaluarlas como un `and` simultáneo no dispararía nunca: «ruptura» y
    «retroceso» son estados opuestos que no coexisten en una barra.
    """
    n = len(c)
    pp = niv["pp"]
    marcas: List[Dict[str, Any]] = []

    fase = 0
    direccion = 0
    barra_fase = 0
    max_ruptura = np.nan
    min_ruptura = np.nan
    bajo_retroceso = np.nan
    alto_retroceso = np.nan

    ventana = 20

    for i in range(ventana, n):
        v = vwap[i]
        at = atr[i]
        if not (np.isfinite(v) and np.isfinite(at) and at > 0):
            continue

        sobre = c[i] > pp and c[i] > v and st_dir[i] == 1
        bajo_de = c[i] < pp and c[i] < v and st_dir[i] == -1
        nuevo_sesgo = 1 if sobre else -1 if bajo_de else 0

        # La fase caduca: una secuencia que lleva treinta barras a medias ya no
        # describe lo que está pasando.
        if fase > 0 and (i - barra_fase) > p.caducidad:
            fase, direccion = 0, 0

        # Perder el sesgo tumba la secuencia entera.
        if fase > 0 and nuevo_sesgo != direccion:
            fase, direccion = 0, 0

        if fase == 0:
            if nuevo_sesgo != 0:
                fase, direccion, barra_fase = 1, nuevo_sesgo, i
            continue

        if fase == 1:
            techo = float(np.max(a[i - ventana:i]))
            suelo = float(np.min(b[i - ventana:i]))
            if direccion == 1 and c[i] > techo:
                fase, barra_fase, max_ruptura = 2, i, techo
            elif direccion == -1 and c[i] < suelo:
                fase, barra_fase, min_ruptura = 2, i, suelo
            continue

        if fase == 2:
            zona = max(pp, v) if direccion == 1 else min(pp, v)
            cerca = abs(c[i] - zona) <= p.zona_atr * at
            if cerca:
                fase, barra_fase = 3, i
                bajo_retroceso = b[i]
                alto_retroceso = a[i]
            continue

        if fase == 3:
            bajo_retroceso = min(bajo_retroceso, b[i])
            alto_retroceso = max(alto_retroceso, a[i])
            cuerpo = abs(c[i] - o[i])
            rango = a[i] - b[i]
            if rango <= 0:
                continue
            mecha_inf = min(c[i], o[i]) - b[i]
            mecha_sup = a[i] - max(c[i], o[i])
            zona = max(pp, v) if direccion == 1 else min(pp, v)
            if direccion == 1:
                rechazo = c[i] > o[i] and mecha_inf >= cuerpo * 0.8 and c[i] > zona
            else:
                rechazo = c[i] < o[i] and mecha_sup >= cuerpo * 0.8 and c[i] < zona
            if rechazo:
                # El stop va al extremo del retroceso, no a una distancia fija:
                # es el precio que, si se pierde, invalida el rechazo que acaba
                # de dar la entrada. Medio ATR de colchón para no morir en la
                # mecha de la propia vela de señal.
                stop_marca = (
                    bajo_retroceso - 0.5 * at if direccion == 1
                    else alto_retroceso + 0.5 * at
                )
                marcas.append({
                    "i": int(i),
                    "direccion": "compra" if direccion == 1 else "venta",
                    "precio": _f(c[i]),
                    "stop": _f(stop_marca),
                })
                fase, direccion = 0, 0
            continue

    # ── Estado actual y plan ────────────────────────────────────────────────
    precio = float(c[-1])
    at = _f(atr[-1]) or 0.0
    v = _f(vwap[-1])
    dir_actual = 1 if (precio > pp and v is not None and precio > v and st_dir[-1] == 1) else \
                 -1 if (precio < pp and v is not None and precio < v and st_dir[-1] == -1) else 0

    disparo = bool(marcas and marcas[-1]["i"] == n - 1)
    disparo_pendiente = disparo

    # Los objetivos son los SIGUIENTES niveles en la dirección del viaje, no
    # R1 y R2 a ciegas. El texto decía «R1 como primer objetivo», y eso sólo
    # vale si el precio aún no ha llegado a R1: si ya está por encima, R1
    # queda por detrás y el «objetivo» apunta hacia atrás.
    escalera = sorted(niv[k] for k in ("s3", "s2", "s1", "pp", "r1", "r2", "r3"))
    sin_recorrido = False
    if dir_actual == 1:
        entrada, stop = precio, min(pp, v if v is not None else pp) - 0.5 * at
        arriba = [x for x in escalera if x > precio]
        objetivo1 = arriba[0] if arriba else None
        objetivo2 = arriba[1] if len(arriba) > 1 else None
        sin_recorrido = not arriba
    elif dir_actual == -1:
        entrada, stop = precio, max(pp, v if v is not None else pp) + 0.5 * at
        abajo = [x for x in escalera if x < precio][::-1]
        objetivo1 = abajo[0] if abajo else None
        objetivo2 = abajo[1] if len(abajo) > 1 else None
        sin_recorrido = not abajo
    else:
        entrada = stop = objetivo1 = objetivo2 = None

    riesgo = abs(entrada - stop) if (entrada and stop) else None
    recorrido = abs(objetivo1 - entrada) if (entrada and objetivo1) else None
    rb = (recorrido / riesgo) if (riesgo and riesgo > 0 and recorrido is not None) else None

    operable = bool(rb is not None and rb >= 1.0)
    motivo_no_operable = None
    if sin_recorrido:
        motivo_no_operable = (
            "El precio ha rebasado el último nivel del mapa: no queda objetivo que medir. "
            "Fuera de la escalera, estos pivotes ya no dicen nada."
        )
    elif rb is not None and rb < 1.0:
        motivo_no_operable = (
            f"El primer objetivo está más cerca que el stop (R/B {rb:.2f}). Entrar aquí "
            "arriesga más de lo que puede ganar aunque acierte la dirección."
        )

    NOMBRES = {
        0: "sin sesgo",
        1: "sesgo establecido",
        2: "estructura rota",
        3: "retroceso a la zona",
    }

    # ── Las seis condiciones, en el orden en que las pidió el usuario ───────
    #
    # Las tres primeras se leen en la barra actual. Las tres últimas son
    # ESTADOS DE LA SECUENCIA, no propiedades de la vela de hoy: «se rompió un
    # máximo» es algo que pasó y quedó registrado, no algo que se comprueba
    # mirando el cierre. Por eso salen de la fase alcanzada y no de una
    # comparación puntual.
    #
    # El lado que se audita: si hay secuencia viva, el suyo; si no, el que
    # sugiere el precio contra el PP. Enseñar la lista del lado imposible
    # —«precio > PP» en rojo con el precio claramente debajo— no informa de
    # nada, sólo llena de cruces.
    lado = direccion if fase > 0 else (1 if precio > pp else -1)
    largo = lado == 1
    techo_ref = float(np.max(a[max(0, n - 1 - ventana):n - 1])) if n > ventana else None
    suelo_ref = float(np.min(b[max(0, n - 1 - ventana):n - 1])) if n > ventana else None
    zona_ref = (max(pp, v) if largo else min(pp, v)) if v is not None else pp

    def _cond(texto, cumplida, detalle):
        return {"texto": texto, "cumplida": bool(cumplida), "detalle": detalle}

    condiciones = [
        _cond(
            f"Precio {'>' if largo else '<'} PP",
            (precio > pp) if largo else (precio < pp),
            f"{precio:.2f} vs {pp:.2f}",
        ),
        _cond(
            f"Precio {'>' if largo else '<'} VWAP",
            v is not None and ((precio > v) if largo else (precio < v)),
            f"{precio:.2f} vs {v:.2f}" if v is not None else "VWAP no disponible",
        ),
        _cond(
            f"SuperTrend {'verde' if largo else 'rojo'}",
            (st_dir[-1] == 1) if largo else (st_dir[-1] == -1),
            "alcista" if st_dir[-1] == 1 else "bajista",
        ),
        _cond(
            f"Rompe un {'máximo' if largo else 'mínimo'} anterior",
            fase >= 2 and direccion == lado,
            (f"referencia {techo_ref:.2f}" if largo and techo_ref is not None
             else f"referencia {suelo_ref:.2f}" if (not largo and suelo_ref is not None)
             else "—"),
        ),
        _cond(
            "Retroceso hacia PP/VWAP",
            fase >= 3 and direccion == lado,
            f"zona {zona_ref:.2f} ± {p.zona_atr:g} ATR",
        ),
        _cond(
            f"Vela de rechazo {'alcista' if largo else 'bajista'}",
            disparo_pendiente,
            # Corto a propósito: la fila lo recorta a una línea.
            "mecha contra la zona",
        ),
    ]

    # El veredicto SÓLO existe cuando la secuencia se ha completado entera.
    # El sesgo direccional es otra cosa y ya viaja en `direccion`: confundirlos
    # convertiría «el precio está por encima del PP» en una orden de compra,
    # que es exactamente lo que el texto original advertía de no hacer.
    todas = all(x["cumplida"] for x in condiciones)
    veredicto = ("LONG" if largo else "SHORT") if (disparo and todas) else None

    ultima = marcas[-1] if marcas else None
    ultima_senal = None
    if ultima is not None:
        ultima_senal = {
            "direccion": ultima["direccion"],
            "veredicto": "LONG" if ultima["direccion"] == "compra" else "SHORT",
            "precio": ultima["precio"],
            "stop": ultima.get("stop"),
            "barras_atras": int(n - 1 - ultima["i"]),
        }

    senal = {
        "veredicto": veredicto,
        "condiciones": condiciones,
        "condiciones_cumplidas": sum(1 for x in condiciones if x["cumplida"]),
        "lado_auditado": "long" if largo else "short",
        "ultima_senal": ultima_senal,
        "direccion": "compra" if dir_actual == 1 else "venta" if dir_actual == -1 else "ninguna",
        "disparo": disparo,
        "operable": operable,
        "motivo_no_operable": motivo_no_operable,
        "entrada": _f(entrada),
        "stop": _f(stop),
        "objetivo1": _f(objetivo1),
        "objetivo2": _f(objetivo2),
        "riesgo_beneficio": _f(rb),
        "marcas_totales": len(marcas),
    }
    estado_fase = {
        "numero": int(fase),
        "nombre": NOMBRES.get(fase, "—"),
        "direccion": "compra" if direccion == 1 else "venta" if direccion == -1 else "ninguna",
        "barras_en_fase": int(n - 1 - barra_fase) if fase > 0 else None,
        "caducidad": p.caducidad,
    }
    return senal, marcas, estado_fase


def _serie(
    df: pd.DataFrame, vwap: np.ndarray, st_linea: np.ndarray,
    marcas: List[Dict[str, Any]], cuantas: int,
) -> Dict[str, Any]:
    n = len(df)
    ventana = min(max(int(cuantas), 20), n)
    desde = n - ventana
    a = df["High"].to_numpy(dtype=float)
    b = df["Low"].to_numpy(dtype=float)
    c = df["Close"].to_numpy(dtype=float)
    o = df["Open"].to_numpy(dtype=float)
    v = df["Volume"].to_numpy(dtype=float)
    idx = df.index

    def _ms(i: int) -> int:
        try:
            return int(idx[i].timestamp() * 1000)
        except Exception:
            return int(i)

    return {
        "barras": [
            {"t": _ms(i), "o": _f(o[i]), "h": _f(a[i]), "l": _f(b[i]),
             "c": _f(c[i]), "v": _f(v[i])}
            for i in range(desde, n)
        ],
        "vwap": [_f(vwap[i]) for i in range(desde, n)],
        "supertrend": [_f(st_linea[i]) for i in range(desde, n)],
        "marcas": [
            {"i": m["i"] - desde, "direccion": m["direccion"], "precio": m["precio"]}
            for m in marcas if m["i"] >= desde
        ],
        "desde_indice": int(desde),
    }
