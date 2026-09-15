"""
================================================================================
Rendimiento: cálculos puros de la ficha de un valor
================================================================================
Rentabilidades por periodo, beta, técnicos, crecimientos y competidores. Lo usan
la pantalla «Rendimiento» (`rendimiento_api.py`) y los filtros de rentabilidad y
técnicos del Screener. Sin red: recibe series y diccionarios ya descargados.

Tres trampas que este módulo evita a propósito, y hay prueba de cada una:

1. **Las rentabilidades de 1 mes a 5 años se miden por FECHA, no por número de
   sesiones.** «Un año» son las sesiones que haya habido desde la misma fecha
   del año anterior; contar 252 posiciones hacia atrás se desplaza con cada
   festivo y cada suspensión. Sólo «5 días» son sesiones, porque así se define.
   Si la serie no llega a la fecha de inicio, el resultado es `None`: una
   rentabilidad «a 5 años» de una empresa que cotiza desde hace tres sería
   inventada.

2. **La beta cruza las dos series por fecha antes de calcular nada.** Es la
   misma lección que `riesgo.py`: emparejar por posición da una beta creíble y
   sin significado.

3. **Los dividendos crecen por AÑOS COMPLETOS.** El año en curso va a medias;
   compararlo con el anterior entero da una caída que no existe.
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, Iterable, List, Optional

import numpy as np
import pandas as pd

MIN_SESIONES_BETA = 120
"""Por debajo de medio año de sesiones comunes, la beta es ruido."""


def num(v: Any) -> Optional[float]:
    """Float utilizable o None. NaN e infinito no son un dato."""
    if v is None or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _serie(valores: Any) -> pd.Series:
    """Serie de precios limpia: índice de fechas sin zona, ordenado y sin ceros."""
    if valores is None:
        return pd.Series(dtype=float)
    s = pd.Series(valores).astype(float)
    s = s[np.isfinite(s.values)]
    s = s[s > 0]
    if s.empty:
        return s
    indice = pd.DatetimeIndex(pd.to_datetime(s.index))
    if indice.tz is not None:
        indice = indice.tz_localize(None)
    s.index = indice.normalize()
    s = s[~s.index.duplicated(keep="last")]
    return s.sort_index()


# ══════════════════════════════════════════════════════════════════════════════
# Rentabilidades
# ══════════════════════════════════════════════════════════════════════════════

def rentabilidad_sesiones(cierres: Any, sesiones: int) -> Optional[float]:
    s = _serie(cierres)
    if len(s) <= sesiones:
        return None
    return (float(s.iloc[-1]) / float(s.iloc[-1 - sesiones]) - 1.0) * 100.0


def rentabilidad_desde(cierres: Any, inicio: pd.Timestamp) -> Optional[float]:
    """Del último cierre en o antes de `inicio` al último cierre de la serie."""
    s = _serie(cierres)
    if s.empty or s.index[0] > inicio:
        return None
    base = s[s.index <= inicio]
    if base.empty:
        return None
    return (float(s.iloc[-1]) / float(base.iloc[-1]) - 1.0) * 100.0


def rentabilidades(cierres: Any) -> Dict[str, Optional[float]]:
    """5 días, 1 mes, en el año, 1, 3 y 5 años. Acumuladas, no anualizadas."""
    s = _serie(cierres)
    claves = ("5d", "1m", "ytd", "1a", "3a", "5a")
    if s.empty:
        return {k: None for k in claves}
    ultimo = s.index[-1]
    return {
        "5d": rentabilidad_sesiones(s, 5),
        "1m": rentabilidad_desde(s, ultimo - pd.DateOffset(months=1)),
        # Base del año: el último cierre del año anterior, no el primero de este.
        "ytd": rentabilidad_desde(s, pd.Timestamp(year=ultimo.year - 1, month=12, day=31)),
        "1a": rentabilidad_desde(s, ultimo - pd.DateOffset(years=1)),
        "3a": rentabilidad_desde(s, ultimo - pd.DateOffset(years=3)),
        "5a": rentabilidad_desde(s, ultimo - pd.DateOffset(years=5)),
    }


def beta(cierres: Any, cierres_indice: Any, sesiones: int = 252) -> Optional[float]:
    """Beta de rendimientos diarios del último año, con las series cruzadas por fecha."""
    r = _serie(cierres).pct_change()
    rm = _serie(cierres_indice).pct_change()
    df = pd.concat([r.rename("v"), rm.rename("i")], axis=1, join="inner").dropna().tail(sesiones)
    if len(df) < MIN_SESIONES_BETA:
        return None
    varianza = float(df["i"].var())
    if not varianza:
        return None
    return float(df["v"].cov(df["i"])) / varianza


# ══════════════════════════════════════════════════════════════════════════════
# Técnicos
# ══════════════════════════════════════════════════════════════════════════════

def rsi(cierres: Any, periodo: int = 14) -> Optional[float]:
    """RSI de Wilder: medias sembradas con la media simple y suavizadas 1/n."""
    s = _serie(cierres)
    if len(s) <= periodo:
        return None
    d = s.diff().dropna().values
    subidas = np.clip(d, 0, None)
    bajadas = np.clip(-d, 0, None)
    media_sube = subidas[:periodo].mean()
    media_baja = bajadas[:periodo].mean()
    for i in range(periodo, len(d)):
        media_sube = (media_sube * (periodo - 1) + subidas[i]) / periodo
        media_baja = (media_baja * (periodo - 1) + bajadas[i]) / periodo
    if media_baja == 0:
        return 100.0 if media_sube > 0 else 50.0
    return 100.0 - 100.0 / (1.0 + media_sube / media_baja)


def mfi(alto: Any, bajo: Any, cierre: Any, volumen: Any, periodo: int = 14) -> Optional[float]:
    """Money Flow Index: el RSI del flujo de dinero (precio típico × volumen)."""
    df = pd.concat(
        [pd.Series(alto, dtype=float), pd.Series(bajo, dtype=float),
         pd.Series(cierre, dtype=float), pd.Series(volumen, dtype=float)],
        axis=1, keys=["h", "l", "c", "v"],
    ).dropna()
    if len(df) <= periodo:
        return None
    tipico = (df["h"] + df["l"] + df["c"]) / 3.0
    flujo = tipico * df["v"]
    direccion = tipico.diff()
    ventana = slice(len(df) - periodo, len(df))
    positivo = float(flujo[direccion > 0].reindex(df.index).fillna(0).iloc[ventana].sum())
    negativo = float(flujo[direccion < 0].reindex(df.index).fillna(0).iloc[ventana].sum())
    if positivo + negativo == 0:
        return None
    if negativo == 0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + positivo / negativo)


def bollinger_pct(cierres: Any, periodo: int = 20, desviaciones: float = 2.0) -> Optional[float]:
    """%B: 0 en la banda inferior, 100 en la superior. Sale de ese rango a propósito."""
    s = _serie(cierres)
    if len(s) < periodo:
        return None
    ventana = s.tail(periodo)
    media = float(ventana.mean())
    sd = float(ventana.std(ddof=0))
    if sd == 0:
        return None
    inferior = media - desviaciones * sd
    superior = media + desviaciones * sd
    return (float(s.iloc[-1]) - inferior) / (superior - inferior) * 100.0


def precio_vs_media(cierres: Any, periodo: int) -> Optional[float]:
    s = _serie(cierres)
    if len(s) < periodo:
        return None
    return float(s.iloc[-1]) / float(s.tail(periodo).mean()) * 100.0


def precio_vs_extremos(cierres: Any, alto: Any = None, bajo: Any = None, sesiones: int = 252) -> Dict[str, Optional[float]]:
    """Precio como % del máximo y del mínimo de 52 semanas (con máximos y mínimos intradía si los hay)."""
    s = _serie(cierres)
    if s.empty:
        return {"vs_max_52s": None, "vs_min_52s": None}
    maximo = _serie(alto).tail(sesiones).max() if alto is not None and not _serie(alto).empty else s.tail(sesiones).max()
    minimo = _serie(bajo).tail(sesiones).min() if bajo is not None and not _serie(bajo).empty else s.tail(sesiones).min()
    ultimo = float(s.iloc[-1])
    return {
        "vs_max_52s": ultimo / float(maximo) * 100.0 if maximo else None,
        "vs_min_52s": ultimo / float(minimo) * 100.0 if minimo else None,
    }


def _columna(marco: Optional[pd.DataFrame], nombre: str) -> Optional[pd.Series]:
    if marco is None or not isinstance(marco, pd.DataFrame) or nombre not in marco.columns:
        return None
    return marco[nombre]


def tecnicos(marco: Optional[pd.DataFrame]) -> Dict[str, Optional[float]]:
    """RSI, MFI, Bollinger 20/50, medias de 50/120 y distancia a los extremos de 52 semanas."""
    cierre = _columna(marco, "Close")
    if cierre is None:
        return {k: None for k in ("rsi_14", "mfi_14", "bollinger_20", "bollinger_50",
                                   "vs_sma_50", "vs_sma_120", "vs_max_52s", "vs_min_52s")}
    alto, bajo, volumen = (_columna(marco, c) for c in ("High", "Low", "Volume"))
    salida = {
        "rsi_14": rsi(cierre),
        "mfi_14": mfi(alto, bajo, cierre, volumen) if alto is not None and volumen is not None else None,
        "bollinger_20": bollinger_pct(cierre, 20),
        "bollinger_50": bollinger_pct(cierre, 50),
        "vs_sma_50": precio_vs_media(cierre, 50),
        "vs_sma_120": precio_vs_media(cierre, 120),
    }
    salida.update(precio_vs_extremos(cierre, alto, bajo))
    return salida


def metricas_historicas(marco: Optional[pd.DataFrame], cierres_indice: Any) -> Dict[str, Optional[float]]:
    """Lo que filtra el Screener: rentabilidades, beta de 1 año y técnicos, en claves planas."""
    cierre = _columna(marco, "Close")
    if cierre is None or _serie(cierre).empty:
        return {}
    r = rentabilidades(cierre)
    t = tecnicos(marco)
    return {
        "rent_5d": r["5d"], "rent_1m": r["1m"], "rent_ytd": r["ytd"],
        "rent_1a": r["1a"], "rent_3a": r["3a"], "rent_5a": r["5a"],
        "beta_1a": beta(cierre, cierres_indice),
        "rsi_14": t["rsi_14"], "vs_max_52s": t["vs_max_52s"], "vs_min_52s": t["vs_min_52s"],
        "vs_sma_50": t["vs_sma_50"], "vs_sma_120": t["vs_sma_120"],
    }


# ══════════════════════════════════════════════════════════════════════════════
# Crecimiento
# ══════════════════════════════════════════════════════════════════════════════

def variacion_pct(actual: Any, anterior: Any) -> Optional[float]:
    """Variación sobre el valor ABSOLUTO del anterior: de −2 a −1 es mejorar, +50 %."""
    a, b = num(actual), num(anterior)
    if a is None or b is None or b == 0:
        return None
    return (a - b) / abs(b) * 100.0


def cagr_pct(inicial: Any, final: Any, anios: float) -> Optional[float]:
    """Tasa anual compuesta. Con un extremo negativo no existe: no se inventa."""
    a, b = num(inicial), num(final)
    if a is None or b is None or a <= 0 or b <= 0 or anios <= 0:
        return None
    return ((b / a) ** (1.0 / anios) - 1.0) * 100.0


def crecimientos(por_anio: Dict[int, Any]) -> Dict[str, Optional[float]]:
    """Variación del último ejercicio y tasa anual de los tres últimos."""
    limpios = {int(k): num(v) for k, v in (por_anio or {}).items() if num(v) is not None}
    if not limpios:
        return {"1a": None, "3a": None}
    ultimo = max(limpios)
    return {
        "1a": variacion_pct(limpios.get(ultimo), limpios.get(ultimo - 1)),
        "3a": cagr_pct(limpios.get(ultimo - 3), limpios.get(ultimo), 3),
    }


def crecimiento_dividendos(dividendos: Any, anio_actual: int) -> Dict[str, Optional[float]]:
    """Crecimiento del dividendo por años naturales COMPLETOS (el año en curso no cuenta)."""
    s = pd.Series(dividendos, dtype=float) if dividendos is not None else pd.Series(dtype=float)
    s = s.dropna()
    if s.empty:
        return {"1a": None, "3a": None, "5a": None}
    indice = pd.DatetimeIndex(pd.to_datetime(s.index))
    if indice.tz is not None:
        indice = indice.tz_localize(None)
    por_anio = s.groupby(indice.year).sum()
    ultimo = anio_actual - 1

    def en(anio: int) -> Optional[float]:
        v = por_anio.get(anio)
        return float(v) if v is not None and v > 0 else None

    return {
        "1a": variacion_pct(en(ultimo), en(ultimo - 1)),
        "3a": cagr_pct(en(ultimo - 3), en(ultimo), 3),
        "5a": cagr_pct(en(ultimo - 5), en(ultimo), 5),
    }


def rango(valores: Iterable[Any]) -> Optional[Dict[str, Any]]:
    """Mínimo y máximo de los valores positivos. Un múltiplo negativo no forma parte del rango."""
    buenos = [v for v in (num(x) for x in valores) if v is not None and v > 0]
    if not buenos:
        return None
    return {"min": min(buenos), "max": max(buenos), "n": len(buenos)}


def mediana(valores: Iterable[Any]) -> Optional[float]:
    buenos = [v for v in (num(x) for x in valores) if v is not None]
    return float(np.median(buenos)) if buenos else None


# ══════════════════════════════════════════════════════════════════════════════
# Competidores
# ══════════════════════════════════════════════════════════════════════════════

def _normalizar(texto: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (texto or "").lower())


def valor_industria_yahoo(industria: Optional[str], mapa: Dict[str, Iterable[str]]) -> Optional[str]:
    """
    El nombre de industria que acepta el screener de Yahoo.

    `info` escribe «Software - Application» y el screener sólo admite
    «Software—Application» (raya). Medido el 14 sep 2026: con el guion
    responde «Invalid EQ value».
    """
    objetivo = _normalizar(industria or "")
    if not objetivo:
        return None
    for valores in (mapa or {}).values():
        for v in valores:
            if _normalizar(v) == objetivo:
                return v
    return None


# Mercados OTC: líneas extranjeras y valores sin cotización viva. Medido con MNDO
# el 14 sep 2026: DOUUF, NEOJF o DLEXY entraban como competidores con variación
# 0,0 % (precio sin actualizar) y arrastraban la mediana de la industria a cero.
BOLSAS_OTC = {"PNK", "OQB", "OQX", "OBB", "OEM", "OGM"}


def elegir_competidores(cotizaciones: List[dict], ticker: str, capitalizacion: Any, n: int = 8) -> List[dict]:
    """
    Los `n` de la misma industria con la capitalización más PARECIDA.

    Los más grandes de una industria no son competidores de una empresa de 20
    millones: se ordena por distancia logarítmica al tamaño del valor. Fuera
    las líneas OTC (ver `BOLSAS_OTC`).
    """
    cap = num(capitalizacion)
    vistos = {_normalizar(ticker)}
    candidatos = []
    for q in cotizaciones or []:
        simbolo = q.get("symbol")
        mc = num(q.get("marketCap"))
        if not simbolo or simbolo.upper() == ticker.upper() or not mc or mc <= 0:
            continue
        if q.get("quoteType", "EQUITY") != "EQUITY" or q.get("exchange") in BOLSAS_OTC:
            continue
        nombre = _normalizar(q.get("longName") or q.get("shortName") or simbolo)
        if nombre in vistos:
            continue
        vistos.add(nombre)
        candidatos.append(q)
    if cap and cap > 0:
        candidatos.sort(key=lambda q: abs(math.log(num(q.get("marketCap")) / cap)))
    return candidatos[:n]
