"""
================================================================================
Ficha «Rendimiento»: descargas de Yahoo y composición de la respuesta
================================================================================
Los cálculos están en `rendimiento.py` (puros y con pruebas). Aquí sólo se
descarga en paralelo y se compone. Lo que la ficha NO inventa, y dice que falta:

· **Puntuaciones propietarias** (Sentiment, Value, Growth, Quality y los
  percentiles de predictibilidad): son de Stock Rover y no hay forma honesta de
  replicarlas con datos públicos.
· **La columna «Industria»** es la MEDIANA de hasta ocho empresas de la misma
  industria con capitalización parecida, no el agregado de la industria entera.
  Se dice cuántas son.
· **La columna «S&P 500»** sale del SPY: rentabilidades y beta sí; múltiplos
  sólo el PER si Yahoo lo publica para el fondo.
· **Crecimiento sin industria**: el de la empresa sale de sus estados anuales y
  el resumen de los competidores sólo trae la variación trimestral interanual.
  Mezclar las dos definiciones en una columna la haría mentir.
· **5 años de crecimiento**: Yahoo da cuatro ejercicios. Con cuatro sale la tasa
  a 3 años; la de 5 no existe y va en hueco.
"""

from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

import pandas as pd
import yfinance as yf

import rendimiento as rd

INDICE = "SPY"
N_COMPETIDORES = 8
TTL_FICHA_S = 900
TTL_ESTADOS_S = 12 * 3600
TTL_PARES_S = 12 * 3600


class YahooLimitado(Exception):
    """Yahoo está devolviendo 429: no se pide nada hasta que pase la ventana."""


class Dependencias:
    """Lo que la ficha necesita de `server.py`, sin importarlo (evita el ciclo)."""

    def __init__(self, *, cache_get: Callable, cache_put: Callable, info_de: Callable,
                 ratios_analisis_de: Callable, yahoo_limitado: Callable):
        self.cache_get = cache_get
        self.cache_put = cache_put
        self.info_de = info_de
        self.ratios_analisis_de = ratios_analisis_de
        self.yahoo_limitado = yahoo_limitado


# ══════════════════════════════════════════════════════════════════════════════
# Descargas (bloqueantes: siempre desde un hilo)
# ══════════════════════════════════════════════════════════════════════════════

def descargar(tickers: List[str], periodo: str = "6y") -> Dict[str, pd.DataFrame]:
    """Velas diarias AJUSTADAS (dividendos y splits) de varios valores en una sola petición."""
    tickers = [t for t in dict.fromkeys(tickers) if t]
    if not tickers:
        return {}
    datos = yf.download(
        tickers=" ".join(tickers), period=periodo, interval="1d", group_by="ticker",
        auto_adjust=True, actions=False, progress=False, threads=True,
    )
    salida: Dict[str, pd.DataFrame] = {}
    if datos is None or datos.empty:
        return salida
    if isinstance(datos.columns, pd.MultiIndex):
        nivel = set(datos.columns.get_level_values(0))
        for t in tickers:
            if t in nivel:
                marco = datos[t].dropna(how="all")
                if not marco.empty:
                    salida[t] = marco
    else:
        salida[tickers[0]] = datos.dropna(how="all")
    return salida


def _estados(ticker: str) -> Dict[str, Any]:
    tk = yf.Ticker(ticker)
    salida: Dict[str, Any] = {}
    for nombre in ("income_stmt", "balance_sheet", "dividends", "calendar",
                   "earnings_history", "growth_estimates", "revenue_estimate"):
        try:
            salida[nombre] = getattr(tk, nombre)
        except Exception as e:  # noqa: BLE001 — un bloque que falta no tumba la ficha
            logging.info(f"Rendimiento {ticker}: sin {nombre}: {e}")
            salida[nombre] = None
    return salida


def _cotizaciones_industria(valor_industria: str, region: str) -> List[dict]:
    EQ = yf.EquityQuery
    partes = [EQ("eq", ["industry", valor_industria]), EQ("eq", ["region", region])]
    if region == "us":
        partes.append(EQ("is-in", ["exchange", "NMS", "NGM", "NCM", "NYQ", "ASE"]))
    consulta = EQ("and", partes)
    # Por los DOS extremos. Pidiendo sólo de mayor a menor, las 250 primeras de
    # una industria de 671 dejaban fuera a todas las pequeñas: con MNDO (21 M) el
    # competidor «más parecido» salía seis veces más grande.
    grandes = yf.screen(consulta, sortField="intradaymarketcap", sortAsc=False, size=250).get("quotes", [])
    pequenas = yf.screen(consulta, sortField="intradaymarketcap", sortAsc=True, size=250).get("quotes", [])
    vistos: set = set()
    salida: List[dict] = []
    for q in grandes + pequenas:
        if q.get("symbol") and q["symbol"] not in vistos:
            vistos.add(q["symbol"])
            salida.append(q)
    return salida


# ══════════════════════════════════════════════════════════════════════════════
# Utilidades de composición
# ══════════════════════════════════════════════════════════════════════════════

def _fecha(v: Any, milisegundos: bool = False) -> Optional[str]:
    """Epoch (s o ms), fecha o datetime → «AAAA-MM-DD»."""
    if v is None:
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()[:10]
    n = rd.num(v)
    if n is None or n <= 0:
        return None
    try:
        return datetime.fromtimestamp(n / 1000 if milisegundos else n, tz=timezone.utc).date().isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def _pct(v: Any) -> Optional[float]:
    n = rd.num(v)
    return n * 100.0 if n is not None else None


def _positivo(v: Any) -> Optional[float]:
    n = rd.num(v)
    return n if n is not None and n > 0 else None


def _cociente(a: Any, b: Any) -> Optional[float]:
    x, y = rd.num(a), rd.num(b)
    return x / y if x is not None and y and y > 0 else None


def _precio(info: dict) -> Optional[float]:
    return _positivo((info or {}).get("regularMarketPrice")) or _positivo((info or {}).get("currentPrice"))


def _trio(valor: Any, industria: List[Any], sp500: Any = None) -> Dict[str, Any]:
    return {"valor": rd.num(valor), "industria": rd.mediana(industria), "sp500": rd.num(sp500)}


def _anual(tabla: Any, filas: List[str]) -> Dict[int, float]:
    if not isinstance(tabla, pd.DataFrame) or tabla.empty:
        return {}
    for fila in filas:
        if fila in tabla.index:
            return {pd.Timestamp(c).year: rd.num(v) for c, v in tabla.loc[fila].items() if rd.num(v) is not None}
    return {}


def _por_fecha(tabla: Any, filas: List[str]) -> Dict[pd.Timestamp, float]:
    if not isinstance(tabla, pd.DataFrame) or tabla.empty:
        return {}
    for fila in filas:
        if fila in tabla.index:
            return {pd.Timestamp(c): rd.num(v) for c, v in tabla.loc[fila].items() if rd.num(v) is not None}
    return {}


def _limpiar(obj: Any) -> Any:
    """NaN e infinitos fuera: uno solo rompe el JSON entero."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _limpiar(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_limpiar(v) for v in obj]
    return obj


def _rangos_historicos(cierre: Optional[pd.Series], estados: Dict[str, Any], actuales: Dict[str, Any]) -> Dict[str, Any]:
    """PER, P/VC y P/Ventas en cada cierre de ejercicio que publica Yahoo (normalmente 4)."""
    income, balance = estados.get("income_stmt"), estados.get("balance_sheet")
    serie = rd._serie(cierre) if cierre is not None else pd.Series(dtype=float)
    if serie.empty:
        return {}
    bpa = _por_fecha(income, ["Diluted EPS", "Basic EPS"])
    ventas = _por_fecha(income, ["Total Revenue"])
    acciones_medias = _por_fecha(income, ["Diluted Average Shares", "Basic Average Shares"])
    patrimonio = _por_fecha(balance, ["Stockholders Equity", "Common Stock Equity"])
    acciones = _por_fecha(balance, ["Ordinary Shares Number", "Share Issued"])

    def precio_en(fecha: pd.Timestamp) -> Optional[float]:
        previos = serie[serie.index <= fecha.normalize()]
        return float(previos.iloc[-1]) if not previos.empty else None

    per, pb, ps = [], [], []
    for fecha in set(bpa) | set(ventas) | set(patrimonio):
        p = precio_en(fecha)
        if p is None:
            continue
        per.append(_cociente(p, bpa.get(fecha)))
        pb.append(_cociente(p, _cociente(patrimonio.get(fecha), acciones.get(fecha))))
        ps.append(_cociente(p, _cociente(ventas.get(fecha), acciones_medias.get(fecha))))

    salida = {}
    for clave, valores in (("per", per), ("pb", pb), ("ps", ps)):
        r = rd.rango(valores)
        if r:
            r["actual"] = rd.num(actuales.get(clave))
            salida[clave] = r
    return salida


# ══════════════════════════════════════════════════════════════════════════════
# Ficha
# ══════════════════════════════════════════════════════════════════════════════

async def ficha(ticker: str, dep: Dependencias) -> Dict[str, Any]:
    t = (ticker or "").upper().strip()
    if not t:
        raise KeyError(ticker)
    clave = f"rendimiento:{t}"
    cacheado = dep.cache_get(clave)
    if cacheado is not None:
        return cacheado
    if dep.yahoo_limitado():
        raise YahooLimitado()

    avisos: List[str] = []

    async def info_fresca() -> Optional[dict]:
        k = f"rendimiento:info:{t}"
        guardado = dep.cache_get(k)
        if guardado is not None:
            return guardado
        info = await asyncio.to_thread(lambda: yf.Ticker(t).info)
        if info:
            dep.cache_put(k, info, TTL_FICHA_S)
        return info

    async def estados() -> Dict[str, Any]:
        k = f"rendimiento:estados:{t}"
        guardado = dep.cache_get(k)
        if guardado is not None:
            return guardado
        valor = await asyncio.to_thread(_estados, t)
        dep.cache_put(k, valor, TTL_ESTADOS_S)
        return valor

    info, precios = await asyncio.gather(info_fresca(), asyncio.to_thread(descargar, [t, INDICE]))
    marco = precios.get(t)
    if not info or (_precio(info) is None and marco is None):
        raise KeyError(t)

    async def pares() -> List[dict]:
        from yfinance.const import EQUITY_SCREENER_EQ_MAP as MAPA

        valor = rd.valor_industria_yahoo(info.get("industry"), MAPA.get("industry", {}))
        region = (info.get("region") or "us").lower()
        if not valor or region not in set(MAPA.get("region", [])):
            return []
        k = f"rendimiento:pares:{valor}:{region}"
        cotizaciones = dep.cache_get(k)
        if cotizaciones is None:
            cotizaciones = await asyncio.to_thread(_cotizaciones_industria, valor, region)
            dep.cache_put(k, cotizaciones, TTL_PARES_S)
        return rd.elegir_competidores(cotizaciones, t, info.get("marketCap"), N_COMPETIDORES)

    resultados = await asyncio.gather(estados(), dep.ratios_analisis_de(t), dep.info_de(INDICE), pares(),
                                      return_exceptions=True)
    nombres = ("estados financieros", "ROIC de Análisis", "resumen del SPY", "competidores")
    for nombre, r in zip(nombres, resultados):
        if isinstance(r, Exception):
            logging.warning(f"Rendimiento {t}: sin {nombre}: {r}")
            avisos.append(f"No se pudieron obtener los {nombre}.")
    est, analisis, spy_info, competidores = (None if isinstance(r, Exception) else r for r in resultados)
    est = est or {}
    competidores = competidores or []

    simbolos = [q["symbol"] for q in competidores]
    infos_pares: List[Optional[dict]] = []
    precios_pares: Dict[str, pd.DataFrame] = {}
    if simbolos:
        infos_r, precios_r = await asyncio.gather(
            asyncio.gather(*(dep.info_de(s) for s in simbolos)),
            asyncio.to_thread(descargar, simbolos),
            return_exceptions=True,
        )
        infos_pares = [] if isinstance(infos_r, Exception) else [i for i in infos_r if i]
        precios_pares = {} if isinstance(precios_r, Exception) else precios_r

    cierre = marco["Close"] if marco is not None and "Close" in marco else None
    cierre_spy = precios[INDICE]["Close"] if INDICE in precios else None
    precio = _precio(info) or (float(rd._serie(cierre).iloc[-1]) if cierre is not None else None)
    previo = rd.num(info.get("regularMarketPreviousClose")) or rd.num(info.get("previousClose"))
    ahora = datetime.now(timezone.utc)

    # ── Rentabilidades frente a industria y SPY ─────────────────────────────
    r_valor = rd.rentabilidades(cierre)
    r_spy = rd.rentabilidades(cierre_spy)
    r_pares = [rd.rentabilidades(m["Close"]) for m in precios_pares.values() if "Close" in m]
    rentabilidades = {k: _trio(r_valor[k], [p[k] for p in r_pares], r_spy[k]) for k in r_valor}
    beta_pares = [rd.beta(m["Close"], cierre_spy) for m in precios_pares.values() if "Close" in m]

    # ── Valoración ──────────────────────────────────────────────────────────
    def multiplos(i: dict) -> Dict[str, Optional[float]]:
        fcf = _positivo(i.get("freeCashflow"))
        return {
            "per": _positivo(i.get("trailingPE")),
            "ps": _positivo(i.get("priceToSalesTrailing12Months")),
            "p_fcf": _cociente(i.get("marketCap"), fcf),
            "pb": _positivo(i.get("priceToBook")),
            "ev_ebitda": _positivo(i.get("enterpriseToEbitda")),
            "ev_fcf": _cociente(_positivo(i.get("enterpriseValue")), fcf),
        }

    m_valor = multiplos(info)
    m_pares = [multiplos(i) for i in infos_pares]
    tangible = _por_fecha(est.get("balance_sheet"), ["Tangible Book Value"])
    tangible_ultimo = tangible[max(tangible)] if tangible else None
    valoracion = {k: _trio(v, [p[k] for p in m_pares]) for k, v in m_valor.items()}
    valoracion["per"]["sp500"] = _positivo((spy_info or {}).get("trailingPE"))
    valoracion["p_tangible"] = _trio(_cociente(info.get("marketCap"), tangible_ultimo), [])

    # ── Crecimiento (sólo la empresa; ver cabecera) ─────────────────────────
    income = est.get("income_stmt")
    ventas = rd.crecimientos(_anual(income, ["Total Revenue"]))
    bpa = rd.crecimientos(_anual(income, ["Diluted EPS", "Basic EPS"]))
    ebitda = rd.crecimientos(_anual(income, ["EBITDA", "Normalized EBITDA"]))
    ventas_prox = bpa_prox = None
    try:
        tabla = est.get("revenue_estimate")
        if isinstance(tabla, pd.DataFrame) and "+1y" in tabla.index and "growth" in tabla.columns \
                and (rd.num(tabla.loc["+1y"].get("numberOfAnalysts")) or 0) > 0:
            ventas_prox = _pct(tabla.loc["+1y", "growth"])
        tabla = est.get("growth_estimates")
        if isinstance(tabla, pd.DataFrame) and "+1y" in tabla.index and "stockTrend" in tabla.columns:
            bpa_prox = _pct(tabla.loc["+1y", "stockTrend"])
    except Exception:  # noqa: BLE001
        pass
    crecimiento = {
        "ventas_prox_anio": ventas_prox, "ventas_1a": ventas["1a"], "ventas_3a": ventas["3a"],
        "bpa_prox_anio": bpa_prox, "bpa_1a": bpa["1a"], "bpa_3a": bpa["3a"],
        "ebitda_1a": ebitda["1a"], "ebitda_3a": ebitda["3a"],
    }

    # ── Rentabilidad sobre ventas y capital ─────────────────────────────────
    campos_rent = {"margen_bruto": "grossMargins", "margen_operativo": "operatingMargins",
                   "margen_neto": "profitMargins", "roa": "returnOnAssets", "roe": "returnOnEquity"}
    rentabilidad = {k: _trio(_pct(info.get(c)), [_pct(i.get(c)) for i in infos_pares]) for k, c in campos_rent.items()}
    roic = rd.num((analisis or {}).get("roic"))
    rentabilidad["roic"] = _trio(roic if roic else None, [])

    # ── Dividendos ──────────────────────────────────────────────────────────
    dividendos = est.get("dividends")
    ttm = None
    ultimo_pago = None
    hoy = pd.Timestamp(ahora.replace(tzinfo=None))
    if isinstance(dividendos, pd.Series) and not dividendos.empty and precio:
        d = dividendos.copy()
        indice = pd.DatetimeIndex(pd.to_datetime(d.index))
        d.index = indice.tz_localize(None) if indice.tz is not None else indice
        ttm = float(d[d.index > hoy - pd.DateOffset(years=1)].sum())
        ultimo_pago = d.index.max()

    def rent_div(i: dict) -> Optional[float]:
        return _cociente(_positivo(i.get("dividendRate")), _precio(i))

    prevista = _pct(rent_div(info))
    # Yahoo conserva `dividendRate` aunque la empresa haya dejado de pagar. Medido
    # con MNDO: 0,22 USD «previstos» (un 21 %) y el último pago en marzo de 2025.
    if prevista and ttm == 0 and ultimo_pago is not None and (hoy - ultimo_pago).days > 400:
        avisos.append(
            f"Yahoo mantiene un dividendo anual de {info.get('dividendRate')} {info.get('currency') or ''}, pero el último "
            f"pago fue el {ultimo_pago.date().isoformat()} y en los últimos 12 meses no ha pagado: la rentabilidad "
            "prevista se deja en hueco."
        )
        prevista = None

    crec_div = rd.crecimiento_dividendos(dividendos if isinstance(dividendos, pd.Series) else None, ahora.year)
    dividendos_bloque = {
        "rent_prevista": _trio(prevista, [_pct(rent_div(i)) for i in infos_pares]),
        "payout": _trio(_pct(info.get("payoutRatio")), [_pct(i.get("payoutRatio")) for i in infos_pares]),
        "rent_ttm": _trio(ttm / precio * 100.0 if ttm is not None and precio else None, []),
        "dividendo_accion": _trio(_positivo(info.get("dividendRate")), []),
        "crec_1a": _trio(crec_div["1a"], []),
        "crec_3a": _trio(crec_div["3a"], []),
        "crec_5a": _trio(crec_div["5a"], []),
    }

    # ── Estimaciones ────────────────────────────────────────────────────────
    sorpresa = None
    historial = est.get("earnings_history")
    if isinstance(historial, pd.DataFrame) and not historial.empty and {"epsActual", "epsEstimate"} <= set(historial.columns):
        ultimo = historial.sort_index().iloc[-1]
        fecha = pd.Timestamp(historial.sort_index().index[-1])
        if (pd.Timestamp(ahora.replace(tzinfo=None)) - fecha.tz_localize(None) if fecha.tz else
                pd.Timestamp(ahora.replace(tzinfo=None)) - fecha).days <= 200:
            sorpresa = rd.variacion_pct(ultimo.get("epsActual"), ultimo.get("epsEstimate"))
    objetivo = _positivo(info.get("targetMeanPrice"))
    recomendacion = info.get("recommendationKey")
    estimaciones = {
        "precio_objetivo": objetivo,
        "potencial_pct": rd.variacion_pct(objetivo, precio) if objetivo and precio else None,
        "per": m_valor["per"],
        "per_adelantado": _positivo(info.get("forwardPE")),
        "sorpresa_bpa_pct": sorpresa,
        "recomendacion": recomendacion if recomendacion and recomendacion != "none" else None,
        "recomendacion_media": rd.num(info.get("recommendationMean")),
        "analistas": rd.num(info.get("numberOfAnalystOpinions")),
    }

    # ── Perfil ──────────────────────────────────────────────────────────────
    calendario = est.get("calendar") if isinstance(est.get("calendar"), dict) else {}
    fechas_resultados = calendario.get("Earnings Date") or []
    proximos = _fecha(fechas_resultados[0]) if fechas_resultados else _fecha(info.get("earningsTimestampStart"))
    if proximos and proximos < ahora.date().isoformat():
        proximos = None
    sede = ", ".join(x for x in (info.get("city"), info.get("country")) if x)
    perfil = {
        "sector": info.get("sector"),
        "industria": info.get("industry"),
        "capitalizacion": rd.num(info.get("marketCap")),
        "pct_corto": _pct(info.get("shortPercentOfFloat")),
        "empleados": rd.num(info.get("fullTimeEmployees")),
        "ventas": rd.num(info.get("totalRevenue")),
        "acciones": rd.num(info.get("sharesOutstanding")),
        "primera_cotizacion": _fecha(info.get("firstTradeDateMilliseconds"), milisegundos=True),
        "ex_dividendo": _fecha(info.get("exDividendDate")),
        "ultimo_trimestre": _fecha(info.get("mostRecentQuarter")),
        "proximos_resultados": proximos,
        "sede": sede or None,
        "web": info.get("website"),
        "moneda_cuentas": info.get("financialCurrency"),
    }

    # ── Competidores ────────────────────────────────────────────────────────
    fila_propia = {
        "ticker": t, "nombre": info.get("longName") or info.get("shortName") or t,
        "capitalizacion": rd.num(info.get("marketCap")), "per": m_valor["per"],
        "cambio_pct": rd.variacion_pct(precio, previo) if precio and previo else None, "propio": True,
    }
    tabla_competidores = [fila_propia] + [
        {
            "ticker": q["symbol"], "nombre": q.get("longName") or q.get("shortName") or q["symbol"],
            "capitalizacion": rd.num(q.get("marketCap")), "per": _positivo(q.get("trailingPE")),
            "cambio_pct": rd.num(q.get("regularMarketChangePercent")), "propio": False,
        }
        for q in competidores
    ]

    if not competidores:
        avisos.append("Sin competidores: Yahoo no devolvió empresas de la misma industria y región, "
                      "así que la columna «Industria» queda en hueco.")
    if marco is None:
        avisos.append("Sin histórico de cotizaciones: rentabilidades y técnicos quedan en hueco.")

    rango_dia = {"min": rd.num(info.get("regularMarketDayLow") or info.get("dayLow")),
                 "max": rd.num(info.get("regularMarketDayHigh") or info.get("dayHigh"))}
    resultado = {
        "ticker": t,
        "nombre": info.get("longName") or info.get("shortName") or t,
        "moneda": info.get("currency") or "USD",
        "bolsa": info.get("fullExchangeName") or info.get("exchange"),
        "precio": {
            "actual": precio,
            "cambio": precio - previo if precio and previo else None,
            "cambio_pct": rd.variacion_pct(precio, previo) if precio and previo else None,
            "hora": (datetime.fromtimestamp(rd.num(info.get("regularMarketTime")), tz=timezone.utc).isoformat()
                     if rd.num(info.get("regularMarketTime")) else None),
            "rango_52s": {"min": rd.num(info.get("fiftyTwoWeekLow")), "max": rd.num(info.get("fiftyTwoWeekHigh"))},
            "rango_dia": rango_dia,
        },
        "perfil": perfil,
        "descripcion": info.get("longBusinessSummary"),
        "estimaciones": estimaciones,
        "industria": {"nombre": info.get("industry"), "muestra": len(infos_pares)},
        "rentabilidades": rentabilidades,
        "beta_1a": _trio(rd.beta(cierre, cierre_spy), beta_pares, 1.0 if cierre_spy is not None else None),
        "valoracion": valoracion,
        "rangos_historicos": _rangos_historicos(cierre, est, m_valor),
        "crecimiento": crecimiento,
        "rentabilidad": rentabilidad,
        "tecnicos": rd.tecnicos(marco),
        "salud": {
            "ratio_corriente": rd.num(info.get("currentRatio")),
            "ratio_rapido": rd.num(info.get("quickRatio")),
            "precio": precio,
            "caja_neta_accion": (
                (rd.num(info.get("totalCash")) or 0.0) - (rd.num(info.get("totalDebt")) or 0.0)
            ) / rd.num(info.get("sharesOutstanding"))
            if rd.num(info.get("sharesOutstanding")) and (info.get("totalCash") is not None or info.get("totalDebt") is not None)
            else None,
            "patrimonio_accion": rd.num(info.get("bookValue")),
            "deuda_capital": rd.num(info.get("debtToEquity")),
        },
        "dividendos": dividendos_bloque,
        "competidores": tabla_competidores,
        "avisos": avisos,
        "no_disponible": [
            "Puntuaciones Sentiment, Value, Growth y Quality y percentiles de predictibilidad: son propias de "
            "Stock Rover y no se replican con datos públicos.",
            "Crecimiento a 5 años: Yahoo publica cuatro ejercicios.",
        ],
        "actualizado": ahora.isoformat(),
    }
    resultado = _limpiar(resultado)
    dep.cache_put(clave, resultado, TTL_FICHA_S)
    return resultado
