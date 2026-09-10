"""
================================================================================
Retrocesos de Fibonacci — port del «Fib Retracement» (Pine v4) con correcciones
================================================================================
Traducción del script del usuario, más los arreglos de los sesgos que tiene.
Todos van declarados aquí, no escondidos en el código, porque cambian lo que
sale en pantalla respecto al original.

Qué se conserva tal cual
------------------------
* El ancla por LOOKBACK: máximo y mínimo de las últimas N velas.
* La dirección se decide por RECENCIA: si el mínimo es más reciente que el
  máximo, el 0 % va abajo y se mide hacia arriba. Es el `revfibs` del script.
* La fórmula: `revfibs ? bajo + rango*n : alto - rango*n`, y el retroceso
  actual `revfibs ? (close-bajo)/rango : (alto-close)/rango`.
* El interruptor de invertir, y los niveles extra 0.886 / 1.113.

Sesgos del original y qué se ha hecho con cada uno
--------------------------------------------------
1. **El máximo y el mínimo se toman POR SEPARADO.** `highest(N)` y `lowest(N)`
   no tienen por qué pertenecer al mismo impulso: en un rango largo salen el
   techo de hace 95 velas y el suelo de hace 3, y eso se dibuja como un
   «impulso» que ningún operador trazaría. Se añade el modo `pivotes`, que usa
   swings CONFIRMADOS (los mismos de `nqe._pivotes`, que no repintan), y se
   deja el modo `lookback` como opción para poder comparar.

2. **El impulso puede ser un artefacto de la ventana.** Si el extremo más
   antiguo cae justo en el borde, lo que define el «impulso» es el número que
   has escrito en «velas», no el mercado. Se detecta y se avisa.

3. **La dirección puede ser un empate.** Si los dos extremos están casi a la
   misma distancia temporal, `revfibs` se decide por una o dos velas y toda la
   escala se da la vuelta. Se detecta y se avisa.

4. **Bug real del script**, en la rama del mínimo manual:

       Flow = ... : FIBS == 2 and High != -1 ? Low : na
                                 ^^^^

   comprueba `High` donde debería comprobar `Low`. Como `High` tiene
   `minval = 0`, la condición es siempre cierta y el fallo queda tapado. Aquí
   no se reproduce el modo de precio manual, así que no aplica, pero conviene
   saberlo si se porta algún día.

5. **La conversión de días a velas del original está mal calibrada**: usa 28
   días por mes y trata los días de calendario como sesiones (100 días
   naturales son ~69 sesiones). Aquí se trabaja SÓLO en velas, que es el modo
   por defecto del propio script y no necesita conversión.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from nqe import _f, _pivotes

MODO_LOOKBACK = "lookback"
MODO_PIVOTES = "pivotes"
MODOS = (MODO_LOOKBACK, MODO_PIVOTES)

# Los siete del script, en orden. 0 y 1 son los extremos del impulso.
RATIOS_BASE = (0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0)
RATIOS_EXTRA = (0.886, 1.113)
RATIOS_EXTENSION = (1.272, 1.618, 2.0, 2.618)


def _etiqueta(ratio: float) -> str:
    """`0.618`, `1.0`… sin ceros de más ni notación científica."""
    return f"{ratio:.3f}".rstrip("0").rstrip(".") or "0"


def _ancla_lookback(
    alto: np.ndarray, bajo: np.ndarray, ventana: int
) -> Tuple[int, int]:
    """Máximo y mínimo de las últimas `ventana` velas, cada uno por su lado.

    Es literalmente `highest(N)` / `lowest(N)` del script, con `argmax` sobre
    la cola. Devuelve índices absolutos dentro de la serie completa.
    """
    n = len(alto)
    inicio = max(0, n - ventana)
    i_alto = inicio + int(np.nanargmax(alto[inicio:]))
    i_bajo = inicio + int(np.nanargmin(bajo[inicio:]))
    return i_alto, i_bajo


def _ancla_pivotes(
    alto: np.ndarray, bajo: np.ndarray, piv: int
) -> Optional[Tuple[int, int]]:
    """Último swing CONFIRMADO: el par de pivotes más recientes.

    Un pivote se confirma `piv` velas después del extremo, así que aparece
    tarde pero ya no se mueve. Ese retraso es exactamente lo que hace que el
    nivel dibujado hoy siga estando donde estaba mañana.

    Devuelve `None` cuando no hay todavía un pivote de cada lado: es una
    respuesta legítima, y mucho mejor que caer al máximo y mínimo del rango
    para tener algo que dibujar.
    """
    ph = _pivotes(alto, piv, piv, alto=True)
    pl = _pivotes(bajo, piv, piv, alto=False)
    idx_h = np.flatnonzero(np.isfinite(ph))
    idx_l = np.flatnonzero(np.isfinite(pl))
    if not len(idx_h) or not len(idx_l):
        return None
    # El pivote confirmado EN i corresponde al extremo de la vela i-piv.
    i_alto = int(idx_h[-1]) - piv
    i_bajo = int(idx_l[-1]) - piv
    if i_alto < 0 or i_bajo < 0 or alto[i_alto] <= bajo[i_bajo]:
        return None
    return i_alto, i_bajo


def calcular(
    df: pd.DataFrame,
    ticker: str,
    marco: str = "1d",
    modo: str = MODO_PIVOTES,
    ventana: int = 100,
    piv: int = 8,
    invertir: bool = False,
    extras: bool = False,
    extensiones: bool = True,
    barras_serie: int = 180,
) -> Dict[str, Any]:
    """Calcula el impulso vigente y sus niveles de Fibonacci."""

    columnas = {"Open", "High", "Low", "Close"}
    if df is None or df.empty or not columnas.issubset(set(df.columns)):
        raise ValueError("Se necesitan barras OHLC completas.")

    df = df.dropna(subset=["Close"]).copy()
    n = len(df)
    if n < 30:
        raise ValueError(f"Histórico insuficiente: {n} velas, hacen falta al menos 30.")

    a = df["High"].to_numpy(dtype=float)
    b = df["Low"].to_numpy(dtype=float)
    c = df["Close"].to_numpy(dtype=float)
    idx = df.index

    ventana = max(10, min(int(ventana), n))
    modo = modo if modo in MODOS else MODO_PIVOTES
    avisos: List[str] = []

    ancla = None
    if modo == MODO_PIVOTES:
        ancla = _ancla_pivotes(a, b, piv)
        if ancla is None:
            # Se DICE que se ha caído al otro modo. Un cambio silencioso de
            # método deja al usuario leyendo una cosa creyendo que es otra.
            avisos.append(
                f"Sin swing confirmado por pivotes (±{piv} velas): se dibuja el "
                f"máximo y el mínimo de las últimas {ventana} velas."
            )
            modo_efectivo = MODO_LOOKBACK
            ancla = _ancla_lookback(a, b, ventana)
        else:
            modo_efectivo = MODO_PIVOTES
    else:
        modo_efectivo = MODO_LOOKBACK
        ancla = _ancla_lookback(a, b, ventana)

    i_alto, i_bajo = ancla
    p_alto = float(a[i_alto])
    p_bajo = float(b[i_bajo])
    rango = p_alto - p_bajo
    if not np.isfinite(rango) or rango <= 0:
        raise ValueError("El máximo y el mínimo del tramo coinciden: no hay impulso.")

    # `revfibs` del script: si el mínimo es MÁS RECIENTE que el máximo, el
    # tramo va a la baja y el 0 % se ancla abajo.
    revfibs = (i_bajo > i_alto) if not invertir else (i_bajo < i_alto)
    direccion = "bajista" if revfibs else "alcista"

    def nivel(ratio: float) -> float:
        return p_bajo + rango * ratio if revfibs else p_alto - rango * ratio

    ratios = list(RATIOS_BASE)
    if extras:
        ratios += [RATIOS_EXTRA[0]]
    ratios = sorted(set(ratios))
    if extensiones:
        ratios += list(RATIOS_EXTENSION)
        if extras:
            ratios.append(RATIOS_EXTRA[1])
        ratios = sorted(set(ratios))

    cierre = float(c[-1])
    niveles = [
        {
            "ratio": ratio,
            "etiqueta": _etiqueta(ratio),
            "precio": _f(nivel(ratio)),
            "tipo": "retroceso" if ratio <= 1.0 else "extension",
            # El color en el script depende de si el precio está por encima o
            # por debajo: un nivel por debajo es soporte, por encima resistencia.
            "papel": "soporte" if cierre > nivel(ratio) else "resistencia",
        }
        for ratio in ratios
    ]

    actual = (cierre - p_bajo) / rango if revfibs else (p_alto - cierre) / rango
    zona = (
        "extendiendo" if actual < 0.0
        else "superficial" if actual <= 0.382
        else "zona áurea" if actual <= 0.618
        else "profundo" if actual <= 1.0
        else "impulso roto"
    )

    # ── Diagnóstico de los sesgos del método ────────────────────────────────
    inicio_ventana = max(0, n - ventana)
    mas_antiguo = min(i_alto, i_bajo)
    separacion = abs(i_alto - i_bajo)

    if modo_efectivo == MODO_LOOKBACK:
        if mas_antiguo <= inicio_ventana + 1:
            avisos.append(
                "El extremo más antiguo cae en el borde de la ventana: el «impulso» "
                "lo está definiendo el tamaño elegido, no el mercado. Cambia las "
                "velas de lookback y verás cambiar el tramo entero."
            )
        if separacion <= max(2, ventana // 20):
            avisos.append(
                f"Máximo y mínimo están a sólo {separacion} velas uno del otro: la "
                "dirección de la escala se decide por muy poco y puede darse la "
                "vuelta con una vela más."
            )

    if actual > 1.0:
        avisos.append(
            "El precio ha rebasado el 100 % del tramo: el impulso está roto y estos "
            "niveles ya describen una estructura que cambió de bando."
        )
    elif actual < 0.0:
        avisos.append(
            "El precio está fuera del tramo por el lado del 0 %: se está extendiendo, "
            "no retrocediendo."
        )

    # ── Serie para el gráfico ───────────────────────────────────────────────
    # Sólo la cola: con 5.000 velas en 400 px no hay gráfico, hay una mancha.
    ventana_serie = min(max(int(barras_serie), 20), n)
    desde_serie = n - ventana_serie

    def _ms(i: int) -> int:
        try:
            return int(idx[i].timestamp() * 1000)
        except Exception:
            return int(i)

    barras = [
        {
            "t": _ms(i),
            "o": _f(df["Open"].to_numpy(dtype=float)[i]),
            "h": _f(a[i]),
            "l": _f(b[i]),
            "c": _f(c[i]),
            "v": _f(df["Volume"].to_numpy(dtype=float)[i]) if "Volume" in df.columns else None,
        }
        for i in range(desde_serie, n)
    ]

    if min(i_alto, i_bajo) < desde_serie:
        avisos.append(
            f"El tramo empieza antes de las {ventana_serie} velas dibujadas: los "
            "niveles son correctos, pero su origen queda fuera del gráfico."
        )

    return {
        "ticker": ticker,
        "marco": marco,
        "barras": int(n),
        "desde": str(idx[0])[:19],
        "hasta": str(idx[-1])[:19],
        "modo": modo_efectivo,
        "modo_pedido": modo,
        "ventana": ventana,
        "pivote": piv,

        "impulso": {
            "alto": _f(p_alto),
            "bajo": _f(p_bajo),
            "rango": _f(rango),
            "direccion": direccion,
            "invertido": bool(invertir),
            "indice_alto": int(i_alto),
            "indice_bajo": int(i_bajo),
            # Índices DENTRO de la ventana dibujada, ya trasladados, o `null`
            # si el extremo queda fuera. Que el frontend reste offsets es la
            # clase de aritmética que desalinea una marca sin que se note.
            "i_alto_serie": int(i_alto - desde_serie) if i_alto >= desde_serie else None,
            "i_bajo_serie": int(i_bajo - desde_serie) if i_bajo >= desde_serie else None,
            "fecha_alto": str(idx[i_alto])[:19],
            "fecha_bajo": str(idx[i_bajo])[:19],
            "separacion_velas": int(separacion),
        },

        "niveles": niveles,

        "actual": {
            "precio": _f(cierre),
            "ratio": _f(actual),
            "zona": zona,
        },

        "serie": {"barras": barras, "desde_indice": int(desde_serie)},
        "avisos": avisos,
    }
