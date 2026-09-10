"""
Riesgo de mercado: lo que el panel de análisis no medía.

Por qué existe este módulo
──────────────────────────
De las ~110 métricas del análisis, la categoría «Riesgo y Capital» tenía seis,
y dos de ellas —WACC y el diferencial ROIC-WACC— no son riesgo de mercado sino
coste del capital. El riesgo real se resumía en tres números: Sharpe,
volatilidad anualizada y beta.

Para un analista de fondos eso es insuficiente, y no por gusto académico:

1. **No había máximo drawdown.** Es el número que decide si un partícipe
   aguanta la posición o vende en el peor momento. Una acción con un Sharpe
   excelente y una caída del 60 % por el camino es, en la práctica, una
   posición que nadie mantiene hasta el final.
2. **Sharpe castiga la volatilidad al alza**, que no es riesgo. Dos valores con
   el mismo Sharpe pueden tener perfiles opuestos: uno que sube a saltos y otro
   que cae a saltos. Sortino separa las dos cosas.
3. **La volatilidad y el VaR suponen normalidad**, y los rendimientos de una
   acción tienen colas gruesas. Por eso viajan aquí la asimetría, la curtosis
   y el CVaR: si el CVaR es mucho peor que el VaR, la distribución tiene cola y
   la desviación típica está mintiendo sobre el riesgo.
4. **Una beta sola esconde la asimetría.** Dos valores con beta 1,00 no son
   iguales si uno captura el 120 % de las caídas y el 80 % de las subidas. Las
   capturas alcista y bajista lo dicen; la beta las promedia y lo tapa.
5. **No había nada frente al índice.** Sin R², alfa, tracking error ni ratio de
   información no se puede contestar la pregunta de cartera: ¿esto aporta algo
   que el índice no dé ya más barato?

Ventana de cálculo
──────────────────
**Cinco años, y va escrito en el nombre de cada métrica.** El Sharpe que ya
existía se calcula sobre un año; se deja como está porque está rotulado «1Y» y
puede haber quien lo mire, pero un Sharpe de 252 observaciones lo domina lo que
haya hecho el valor en los últimos doce meses y no debería decidir nada. Se
añade un Sharpe a cinco años junto al Sortino para que la comparación entre los
dos sea válida —comparar un Sortino de 5 años con un Sharpe de 1 no dice nada—,
y el contraste entre ambos Sharpe es en sí mismo información: uno excelente a
un año con otro mediocre a cinco es suerte reciente, no calidad.

Todo se calcula con rendimientos diarios y se anualiza con 252 sesiones.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

SESIONES = 252
"""Sesiones bursátiles por año. Es la convención; 365 anualizaría de más."""

CONFIANZA = 0.95
"""Nivel del VaR y del CVaR. El 95 % es el estándar de riesgo de mercado."""


def _limpio(v: Any) -> Optional[float]:
    """Float utilizable o None. Un NaN o un infinito no son una medida."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _rendimientos(precios: pd.Series) -> pd.Series:
    """Rendimientos diarios simples, sin huecos."""
    if precios is None or len(precios) < 2:
        return pd.Series(dtype=float)
    s = pd.Series(precios).astype(float).dropna()
    s = s[s > 0]
    return s.pct_change().dropna()


# ══════════════════════════════════════════════════════════════════════════════
# Caídas
# ══════════════════════════════════════════════════════════════════════════════

def _drawdowns(precios: pd.Series) -> Dict[str, Any]:
    """
    Máxima caída de pico a valle, caída actual, tiempo de recuperación y Ulcer.

    Se calcula sobre los PRECIOS y no sobre los rendimientos: encadenar
    rendimientos para reconstruir la curva introduce error de redondeo y, sobre
    todo, invita a confundir «la peor racha de días negativos» con «la mayor
    distancia entre un máximo y el valle posterior», que es otra cosa y es la
    que importa.

    El **Ulcer Index** es la raíz de la media de los cuadrados de la caída
    porcentual diaria respecto al máximo previo. Mide profundidad Y duración a
    la vez: dos valores con el mismo máximo drawdown no son igual de duros de
    sostener si uno lo recupera en un mes y el otro tarda tres años.
    """
    s = pd.Series(precios).astype(float).dropna()
    if len(s) < 2:
        return {}

    maximo = s.cummax()
    caida = (s / maximo - 1.0) * 100.0          # porcentaje, negativo o cero

    i_valle = int(np.argmin(caida.values))
    max_dd = float(caida.iloc[i_valle])
    # El pico del que arranca esa caída: el último máximo anterior al valle.
    tramo = s.iloc[: i_valle + 1]
    i_pico = int(np.argmax(tramo.values))

    # ¿Se recuperó? Primer día posterior al valle que vuelve al nivel del pico.
    nivel_pico = float(s.iloc[i_pico])
    posterior = s.iloc[i_valle + 1 :]
    recuperado = posterior[posterior >= nivel_pico]
    if len(recuperado):
        i_rec = s.index.get_loc(recuperado.index[0])
        sesiones_recuperacion = int(i_rec - i_valle)
        recuperada = True
    else:
        sesiones_recuperacion = int(len(s) - 1 - i_valle)
        recuperada = False

    ulcer = float(np.sqrt(np.mean(np.square(caida.values))))

    return {
        "max_drawdown": max_dd,
        "drawdown_actual": float(caida.iloc[-1]),
        "sesiones_caida": int(i_valle - i_pico),
        "sesiones_recuperacion": sesiones_recuperacion,
        "drawdown_recuperado": recuperada,
        "ulcer_index": ulcer,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Rendimiento ajustado al riesgo
# ══════════════════════════════════════════════════════════════════════════════

def _desviacion_bajista(r: pd.Series, objetivo_diario: float) -> Optional[float]:
    """
    Desviación bajista anualizada respecto a un objetivo (MAR).

    **El error clásico está aquí y es silencioso:** dividir la suma de los
    cuadrados entre el número de observaciones POR DEBAJO del objetivo en vez
    de entre el total. Hacerlo así infla el Sortino de cualquier valor que baje
    pocas veces pero mucho — justo el perfil que la métrica debería penalizar.
    Se divide entre el total, que es la definición de Sortino y Satchell.
    """
    if len(r) < 2:
        return None
    faltas = np.minimum(r.values - objetivo_diario, 0.0)
    md = float(np.sqrt(np.sum(np.square(faltas)) / len(r)))
    return md * math.sqrt(SESIONES) if md > 0 else 0.0


def _tail(r: pd.Series) -> Dict[str, Any]:
    """VaR histórico, CVaR y forma de la distribución."""
    if len(r) < 30:
        return {}
    q = float(np.quantile(r.values, 1.0 - CONFIANZA))
    cola = r.values[r.values <= q]
    # CVaR = media de lo que ocurre EN la cola, no el punto de corte. Es la
    # diferencia entre «este es mi peor día normal» y «cuando va mal, cuánto
    # pierdo de media». La segunda es la que se usa para dimensionar.
    cvar = float(np.mean(cola)) if len(cola) else q
    return {
        "var_95": q * 100.0,
        "cvar_95": cvar * 100.0,
        # Asimetría negativa = las sorpresas grandes son a la baja.
        "asimetria": float(pd.Series(r).skew()),
        # Curtosis EN EXCESO: 0 es la normal. Por encima de 3, colas muy
        # gruesas y la volatilidad se queda corta describiendo el riesgo.
        "curtosis": float(pd.Series(r).kurtosis()),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Frente al índice
# ══════════════════════════════════════════════════════════════════════════════

def _frente_al_indice(r: pd.Series, rm: pd.Series, rf_diario: float) -> Dict[str, Any]:
    """
    Beta, R², alfa de Jensen, capturas, tracking error y ratio de información.

    **Las dos series se alinean por fecha antes de nada.** Es la trampa de este
    cálculo: los índices y los valores no comparten calendario exacto (festivos
    distintos, suspensiones, cotizadas nuevas), y emparejar por posición produce
    una beta perfectamente plausible y completamente falsa. Aquí se cruza por
    índice y se exigen 60 sesiones comunes.
    """
    if r is None or rm is None or len(r) < 2 or len(rm) < 2:
        return {}
    par = pd.concat([pd.Series(r).rename("a"), pd.Series(rm).rename("m")], axis=1).dropna()
    if len(par) < 60:
        return {}
    a = par["a"].values
    m = par["m"].values

    var_m = float(np.var(m, ddof=1))
    if var_m <= 0:
        return {}
    beta = float(np.cov(a, m, ddof=1)[0, 1] / var_m)
    corr = float(np.corrcoef(a, m)[0, 1])

    # Alfa de Jensen anualizada: lo que rinde por encima de lo que su beta
    # explica. Un alfa positivo con R² bajo dice además que no es el índice
    # disfrazado.
    ra = float(np.mean(a)) * SESIONES
    rm_a = float(np.mean(m)) * SESIONES
    rf_a = rf_diario * SESIONES
    alfa = (ra - (rf_a + beta * (rm_a - rf_a))) * 100.0

    # ── Capturas alcista y bajista ─────────────────────────────────────────
    #
    # Se calculan sobre rendimientos MENSUALES, que es la convención del sector
    # (Morningstar), y no por capricho: **con datos diarios la métrica se
    # rompe**. Componer los ~690 días bajistas de cinco años lleva la serie a
    # −99,96 %, y la del mismo índice apalancado x2 a −99,99998 %; el cociente
    # sale 100,04 % para los dos. Es decir, saturado en 100 % pasara lo que
    # pasara — un número perfectamente creíble que no mide nada. Medido, no
    # supuesto: hay prueba.
    #
    # Y tampoco vale promediar el cociente día a día: el índice cierra casi
    # plano la mitad de las sesiones y esas divisiones por casi cero dominan
    # la media.
    try:
        # Componer dentro del mes: producto de (1+r) y restar 1. Escrito así y
        # no con `.apply(lambda x: (1+x).prod()-1)`, que sobre un DataFrame no
        # compone por columna y devuelve otra cosa sin quejarse.
        comp = (1.0 + par[["a", "m"]]).resample("ME").prod() - 1.0
    except (TypeError, ValueError):
        comp = None

    def _tasa_mensual(x: pd.Series) -> Optional[float]:
        """Media GEOMÉTRICA mensual de un conjunto de meses."""
        total = float((1.0 + x).prod())
        if total <= 0 or len(x) == 0:
            return None
        return total ** (1.0 / len(x)) - 1.0

    def captura(alcista: bool) -> Optional[float]:
        """
        Cociente de las TASAS MENSUALES medias, no de los acumulados.

        Es la definición de Morningstar y hace falta: componer los 38 meses
        alcistas de cinco años no mide la diferencia, la multiplica. Medido
        sobre el índice apalancado x2 —cuya captura alcista debe rondar el
        200 %— el cociente de acumulados da **432 %**; el de tasas medias, 200.
        """
        if comp is None or comp.empty:
            return None
        sel = comp[comp["m"] > 0] if alcista else comp[comp["m"] < 0]
        # Ocho meses es el mínimo para que el cociente no lo decida un mes
        # suelto. Por debajo, hueco.
        if len(sel) < 8:
            return None
        ga = _tasa_mensual(sel["a"])
        gm = _tasa_mensual(sel["m"])
        if ga is None or gm is None or gm == 0:
            return None
        return (ga / gm) * 100.0

    diferencia = a - m
    te = float(np.std(diferencia, ddof=1)) * math.sqrt(SESIONES) * 100.0

    return {
        "beta_5a": beta,
        "r_cuadrado": corr * corr * 100.0,
        "alfa_jensen": alfa,
        "captura_alcista": captura(True),
        "captura_bajista": captura(False),
        "tracking_error": te,
        # Ratio de información: exceso de rendimiento por unidad de riesgo
        # ACTIVO. Es la pregunta de cartera —¿compensa desviarse del índice?—
        # y no la de riesgo total, que contesta el Sharpe.
        "ratio_informacion": ((ra - rm_a) * 100.0 / te) if te > 0 else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Entrada pública
# ══════════════════════════════════════════════════════════════════════════════

def metricas(
    precios: pd.Series,
    referencia: Optional[pd.Series] = None,
    tasa_sin_riesgo: float = 0.04,
) -> Dict[str, Any]:
    """
    Panel de riesgo de mercado a partir de la serie de precios.

    `tasa_sin_riesgo` es anual y en tanto por uno (0,04 = 4 %). Entra en el
    Sharpe, el Sortino y el alfa: los tres miden exceso sobre el activo sin
    riesgo, y usar un 0 los infla justo cuando los tipos están altos.

    Devuelve `{}` si no hay serie suficiente. Un hueco es honesto; un cero se
    leería como «sin riesgo», que es la afirmación contraria.
    """
    r = _rendimientos(precios)
    if len(r) < 60:
        return {}

    rf_diario = tasa_sin_riesgo / SESIONES
    salida: Dict[str, Any] = {"sesiones": int(len(r)), "anios": round(len(r) / SESIONES, 1)}

    # Rendimiento anualizado GEOMÉTRICO, no la media diaria compuesta. Con
    # colas gruesas los dos se separan bastante, y el geométrico es el que un
    # partícipe se lleva de verdad.
    total = float(np.prod(1.0 + r.values))
    cagr = (total ** (SESIONES / len(r)) - 1.0) * 100.0
    vol = float(np.std(r.values, ddof=1)) * math.sqrt(SESIONES) * 100.0
    salida["retorno_5a"] = cagr
    salida["volatilidad_5a"] = vol
    salida["sharpe_5a"] = (cagr - tasa_sin_riesgo * 100.0) / vol if vol > 0 else None

    db = _desviacion_bajista(r, rf_diario)
    salida["desviacion_bajista"] = db * 100.0 if db is not None else None
    salida["sortino"] = (
        (cagr - tasa_sin_riesgo * 100.0) / (db * 100.0) if db else None
    )

    salida.update(_drawdowns(precios))
    md = salida.get("max_drawdown")
    # Calmar: rendimiento por unidad de la PEOR caída sufrida, no de la
    # volatilidad media. Es la lectura que hace quien tiene que explicar la
    # posición cuando ya ha caído.
    salida["calmar"] = (cagr / abs(md)) if md else None

    salida.update(_tail(r))
    if referencia is not None:
        salida.update(_frente_al_indice(r, _rendimientos(referencia), rf_diario))

    return {k: (_limpio(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v)
            for k, v in salida.items()}
