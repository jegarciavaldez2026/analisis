"""
================================================================================
Screener: los ratios principales de Análisis como filtros
================================================================================
Cada ratio lleva el MISMO nombre y el MISMO umbral orientativo que su fila en
la pantalla de Análisis (`_add(..., "P/E Ratio (Precio/Beneficio)", ..., "< 25")`
en `server.py`), para que un filtro «P/E < 25» signifique lo mismo aquí y allí.

--------------------------------------------------------------------------
Dos fuentes, y por qué
--------------------------------------------------------------------------
· **Resumen de Yahoo (`info`)**: una petición por valor, con caché. Llega en
  segundos para los treinta valores. Es de donde salen PER, PEG, ROE, ROA,
  márgenes, liquidez, dividendo… Análisis calcula esos mismos ratios con los
  estados financieros, así que pueden diferir en unas décimas.
· **Cálculo de Análisis (`calculate_ratios`)**: ROIC, ROCE, CROIC, deuda neta,
  EV/EBIT, WACC, Altman, Piotroski, Montier. El resumen no los trae. Son ~2 s
  por valor (medido: KO 2,1 s, NVDA 1,5 s), así que se calculan en SEGUNDO
  PLANO con caché de 12 h y la búsqueda no los espera más de unos segundos: lo
  que falte se cuenta como «pendiente» y la pantalla repite la búsqueda sola.

--------------------------------------------------------------------------
El cero que no es un dato
--------------------------------------------------------------------------
`calculate_ratios` devuelve 0 cuando no puede calcular: ROIC con capital
invertido ≤ 0, ROE sin patrimonio, WACC sin deuda ni patrimonio, deuda neta sin
deuda ni caja… Ese 0 pasaría un filtro de MÁXIMO («deuda neta/EBIT < 1») sin
tener dato ninguno. Por eso cada ratio de Análisis declara si su cero es hueco.
La excepción es el C-Score de Montier: cero señales es un valor real.

--------------------------------------------------------------------------
Lo que la pantalla tiene que avisar (`nota`)
--------------------------------------------------------------------------
WACC, Piotroski y Montier se calculan en Análisis con simplificaciones que
cambian su lectura. Van tal cual —son los números de Análisis— pero con una
nota junto al filtro. La del Montier es la importante: su umbral en Análisis
va al revés de lo que calcula.

Un valor SIN el dato no pasa un filtro sobre ese ratio, y se cuenta cuántos
quedaron fuera por eso: un «0 resultados» no puede leerse como «ninguno
cumple» cuando lo que faltaba era el dato.

Módulo puro: recibe `info` y los ratios de Análisis ya descargados.
"""

from __future__ import annotations

import math
import re
from typing import Any, Callable, Dict, List, Optional, Tuple


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _pct(clave: str) -> Callable[[dict], Optional[float]]:
    """Campo de Yahoo en tanto por uno → porcentaje."""
    def leer(info: dict) -> Optional[float]:
        v = _num(info.get(clave))
        return v * 100.0 if v is not None else None
    return leer


def _campo(clave: str) -> Callable[[dict], Optional[float]]:
    return lambda info: _num(info.get(clave))


def _positivo(clave: str) -> Callable[[dict], Optional[float]]:
    """Múltiplos de valoración: con denominador negativo no significan nada."""
    def leer(info: dict) -> Optional[float]:
        v = _num(info.get(clave))
        return v if v is not None and v > 0 else None
    return leer


def _fcf_yield(info: dict) -> Optional[float]:
    fcf, cap = _num(info.get("freeCashflow")), _num(info.get("marketCap"))
    return fcf / cap * 100.0 if fcf is not None and cap and cap > 0 else None


def _p_fcf(info: dict) -> Optional[float]:
    fcf, cap = _num(info.get("freeCashflow")), _num(info.get("marketCap"))
    return cap / fcf if fcf and fcf > 0 and cap else None


def _margen_fcf(info: dict) -> Optional[float]:
    fcf, ventas = _num(info.get("freeCashflow")), _num(info.get("totalRevenue"))
    return fcf / ventas * 100.0 if fcf is not None and ventas and ventas > 0 else None


def _deuda_neta_ebitda(info: dict) -> Optional[float]:
    deuda, caja, ebitda = (_num(info.get(k)) for k in ("totalDebt", "totalCash", "ebitda"))
    if deuda is None or ebitda is None or ebitda <= 0:
        return None
    return (deuda - (caja or 0.0)) / ebitda


def _peg(info: dict) -> Optional[float]:
    v = _num(info.get("trailingPegRatio"))
    if v is None:
        v = _num(info.get("pegRatio"))
    return v if v is not None and v > 0 else None


def _capitalizacion(info: dict) -> Optional[float]:
    v = _num(info.get("marketCap"))
    return v / 1e9 if v else None


RESUMEN = "resumen"
ANALISIS = "analisis"

NOTA_WACC = (
    "En Análisis el coste del capital propio está fijo en el 10 % y el tipo impositivo en el 21 %: "
    "el WACC depende sobre todo de la mezcla de deuda y capital, no del riesgo propio del valor."
)
NOTA_PIOTROSKI = (
    "Versión simplificada de Análisis: usa umbrales del último ejercicio en vez de las variaciones "
    "interanuales del original, y un punto (acciones en circulación > 0) se suma siempre."
)
NOTA_MONTIER = (
    "Ojo: en Análisis cuenta 3 señales de CALIDAD (flujo > beneficio, Beneish < −2,22, flujo y "
    "beneficio positivos), así que ALTO es mejor. Su umbral «≤ 2» va al revés de ese cálculo: "
    "para quedarte con las cuentas más limpias, filtra por mínimo 3."
)
NOTA_ALTMAN = "Fórmula original para empresas industriales; en bancos y aseguradoras no es aplicable."


HISTORICO = "historico"

NOTA_RENTABILIDAD = (
    "Rentabilidad total acumulada (no anualizada) con precios ajustados por dividendos y splits, "
    "medida por fecha desde el cierre de hace ese periodo."
)


def _def(clave, nombre, grupo, unidad, umbral, *, resumen=None, analisis=None, historico=None,
         cero_es_hueco=True, escala=1.0, nota=None) -> Dict[str, Any]:
    fuente = ANALISIS if analisis else HISTORICO if historico else RESUMEN
    return {
        "clave": clave, "nombre": nombre, "grupo": grupo, "unidad": unidad,
        "umbral_analisis": umbral, "fuente": fuente,
        "lector": resumen, "clave_analisis": analisis, "clave_historico": historico,
        "cero_es_hueco": cero_es_hueco, "escala": escala, "nota": nota,
    }


# El orden es el de la pantalla: grupos en este orden y ratios dentro de cada uno.
# `dividend_yield` no tiene lector: lo calcula el endpoint con
# `_rentabilidad_dividendo`, que resuelve el cambio de unidad de yfinance.
RATIOS: List[Dict[str, Any]] = [
    _def("per", "P/E Ratio (Precio/Beneficio)", "Valoración", "x", "< 25", resumen=_positivo("trailingPE")),
    _def("peg", "PEG Ratio", "Valoración", "x", "< 0.5", resumen=_peg),
    _def("ev_ebitda", "EV/EBITDA", "Valoración", "x", "< 12x", resumen=_positivo("enterpriseToEbitda")),
    _def("ev_ebit", "EV/EBIT", "Valoración", "x", "< 15", analisis="ev_ebit"),
    _def("ps", "P/S Ratio (Precio/Ventas)", "Valoración", "x", "< 2", resumen=_positivo("priceToSalesTrailing12Months")),
    _def("pb", "P/B Ratio (Precio/Valor en Libros)", "Valoración", "x", "< 3x", resumen=_positivo("priceToBook")),
    _def("p_fcf", "P/FCF (Precio / FCF)", "Valoración", "x", "< 20x", resumen=_p_fcf),
    _def("fcf_yield", "FCF Yield (FCF / Capitalización)", "Valoración", "%", "> 5%", resumen=_fcf_yield),
    _def("dividend_yield", "Dividend Yield", "Valoración", "%", "> 1%"),
    _def("payout", "Payout Ratio", "Valoración", "%", "< 60%", resumen=_pct("payoutRatio")),

    _def("roe", "ROE (Return on Equity)", "Rentabilidad", "%", "> 15%", resumen=_pct("returnOnEquity")),
    _def("roa", "ROA (Return on Assets)", "Rentabilidad", "%", "> 5%", resumen=_pct("returnOnAssets")),
    _def("roic", "ROIC (Return on Invested Capital)", "Rentabilidad", "%", "> 15%", analisis="roic"),
    _def("roce", "ROCE (Return on Capital Employed)", "Rentabilidad", "%", "> 15%", analisis="roce"),
    _def("croic", "CROIC (Cash ROIC)", "Rentabilidad", "%", "> 10%", analisis="croic"),
    _def("margen_bruto", "Margen Bruto (Gross Margin)", "Rentabilidad", "%", "> 40%", resumen=_pct("grossMargins")),
    _def("margen_operativo", "Margen Operativo (Operating Margin)", "Rentabilidad", "%", "> 15%", resumen=_pct("operatingMargins")),
    _def("margen_neto", "Margen Neto (Net Margin)", "Rentabilidad", "%", "> 10%", resumen=_pct("profitMargins")),
    _def("margen_ebitda", "EBITDA Margin", "Rentabilidad", "%", "> 20%", resumen=_pct("ebitdaMargins")),

    _def("wacc", "WACC", "Creación de valor", "%", "< 12%", analisis="wacc", nota=NOTA_WACC),
    _def("spread_roic_wacc", "ROIC vs WACC Spread", "Creación de valor", "%", "> 0%", analisis="roic_wacc_spread",
         cero_es_hueco=False),

    _def("margen_fcf", "Margen FCF (FCF Margin)", "Flujo de caja", "%", "> 15%", resumen=_margen_fcf),

    _def("ratio_corriente", "Ratio Corriente (Current Ratio)", "Liquidez", "x", "1.2 - 2.0", resumen=_campo("currentRatio")),
    _def("ratio_rapido", "Ratio Rápido (Quick Ratio)", "Liquidez", "x", "> 1.0", resumen=_campo("quickRatio")),

    _def("deuda_capital", "Deuda/Capital (Debt-to-Equity)", "Apalancamiento", "%", "< 50%", resumen=_campo("debtToEquity")),
    # En la divisa en que la empresa presenta cuentas, no siempre dólares.
    _def("deuda_neta", "Deuda Neta (Net Debt)", "Apalancamiento", "B", "< 0 (más efectivo que deuda)",
         analisis="net_debt", escala=1e-9),
    _def("deuda_neta_ebit", "Deuda Neta / EBIT", "Apalancamiento", "x", "< 1", analisis="net_debt_ebit"),
    _def("deuda_neta_ebitda", "Net Debt / EBITDA", "Apalancamiento", "x", "< 3x", resumen=_deuda_neta_ebitda),

    _def("altman_z", "Altman Z-Score", "Calidad contable", "z", "> 2.99", analisis="altman_z_score", nota=NOTA_ALTMAN),
    _def("piotroski", "Piotroski F-Score", "Calidad contable", "pts", ">= 7", analisis="piotroski_f_score",
         nota=NOTA_PIOTROSKI),
    _def("montier", "Montier C-Score", "Calidad contable", "pts", "<= 2", analisis="montier_c_score",
         cero_es_hueco=False, nota=NOTA_MONTIER),

    _def("crecimiento_ventas", "Crecimiento de ingresos (interanual)", "Crecimiento", "%", "> 0%", resumen=_pct("revenueGrowth")),
    _def("crecimiento_bpa", "Crecimiento del beneficio (interanual)", "Crecimiento", "%", "> 0%", resumen=_pct("earningsGrowth")),
    _def("beta", "Beta", "Riesgo", "x", "—", resumen=_campo("beta")),
    # En la divisa de COTIZACIÓN: dólares en EE. UU., euros en Madrid, libras en
    # Londres. Konami salía con «2.810 B$» porque eran yenes.
    _def("capitalizacion", "Capitalización (miles de millones, divisa de cotización)", "Tamaño", "B", "—",
         resumen=_capitalizacion),

    # Cotizaciones diarias de 6 años (una descarga para todos los valores). Las
    # mismas funciones que la pantalla Rendimiento (`rendimiento.py`).
    _def("rent_5d", "Rentabilidad 5 días", "Rentabilidad bursátil", "%", "—", historico="rent_5d", nota=NOTA_RENTABILIDAD),
    _def("rent_1m", "Rentabilidad 1 mes", "Rentabilidad bursátil", "%", "—", historico="rent_1m"),
    _def("rent_ytd", "Rentabilidad en el año (YTD)", "Rentabilidad bursátil", "%", "—", historico="rent_ytd"),
    _def("rent_1a", "Rentabilidad 1 año", "Rentabilidad bursátil", "%", "—", historico="rent_1a"),
    _def("rent_3a", "Rentabilidad 3 años (acumulada)", "Rentabilidad bursátil", "%", "—", historico="rent_3a"),
    _def("rent_5a", "Rentabilidad 5 años (acumulada)", "Rentabilidad bursátil", "%", "—", historico="rent_5a"),
    _def("beta_1a", "Beta 1 año (diaria frente al S&P 500)", "Rentabilidad bursátil", "x", "—", historico="beta_1a",
         nota="Rendimientos diarios del último año frente al SPY, cruzados por fecha. La «Beta» de Riesgo es la de Yahoo (5 años, mensual)."),
    _def("rsi_14", "RSI (14 sesiones)", "Técnicos", "pts", "30 - 70", historico="rsi_14"),
    _def("vs_max_52s", "Precio vs máximo de 52 semanas", "Técnicos", "%", "—", historico="vs_max_52s",
         nota="100 = en máximos. 80 = un 20 % por debajo del máximo."),
    _def("vs_min_52s", "Precio vs mínimo de 52 semanas", "Técnicos", "%", "—", historico="vs_min_52s",
         nota="100 = en mínimos. 150 = un 50 % por encima del mínimo."),
    _def("vs_sma_50", "Precio vs media de 50 sesiones", "Técnicos", "%", "—", historico="vs_sma_50",
         nota="Por encima de 100, el precio está sobre su media."),
    _def("vs_sma_120", "Precio vs media de 120 sesiones", "Técnicos", "%", "—", historico="vs_sma_120"),
]

CLAVES = [r["clave"] for r in RATIOS]
_POR_CLAVE = {r["clave"]: r for r in RATIOS}


# ══════════════════════════════════════════════════════════════════════════════
# Búsqueda en todo el mercado (screener de Yahoo)
# ══════════════════════════════════════════════════════════════════════════════
#
# Yahoo filtra en SUS servidores sobre miles de empresas y devuelve la lista,
# no los valores de los ratios. Los filtros que admite se le mandan; de lo que
# devuelve se descargan el resumen y, si hace falta, el cálculo de Análisis, y
# se vuelven a comprobar TODOS los filtros aquí. Así lo que se enseña y lo que
# se filtra sale de la misma fuente, y los que Yahoo no admite (margen
# operativo, FCF, ROIC, Altman…) también se aplican.
#
# Unidades comprobadas el 13 sep 2026 poniendo un umbral en el servidor y
# leyendo `info` de lo devuelto: ROE, ROA, márgenes, dividendo, deuda/capital y
# crecimiento de ingresos van en PORCENTAJE, como en este módulo («ROE > 30»
# devolvió NVDA con un 117 %).
CAMPOS_YAHOO: Dict[str, Tuple[str, float]] = {
    "per": ("peratio.lasttwelvemonths", 1.0),
    "peg": ("pegratio_5y", 1.0),
    "ev_ebitda": ("lastclosetevebitda.lasttwelvemonths", 1.0),
    "ev_ebit": ("lastclosetevebit.lasttwelvemonths", 1.0),
    "ps": ("lastclosemarketcaptotalrevenue.lasttwelvemonths", 1.0),
    "pb": ("pricebookratio.quarterly", 1.0),
    "dividend_yield": ("forward_dividend_yield", 1.0),
    "roe": ("returnonequity.lasttwelvemonths", 1.0),
    "roa": ("returnonassets.lasttwelvemonths", 1.0),
    "margen_bruto": ("grossprofitmargin.lasttwelvemonths", 1.0),
    "margen_neto": ("netincomemargin.lasttwelvemonths", 1.0),
    "margen_ebitda": ("ebitdamargin.lasttwelvemonths", 1.0),
    "ratio_corriente": ("currentratio.lasttwelvemonths", 1.0),
    "ratio_rapido": ("quickratio.lasttwelvemonths", 1.0),
    "deuda_capital": ("totaldebtequity.lasttwelvemonths", 1.0),
    "deuda_neta_ebitda": ("netdebtebitda.lasttwelvemonths", 1.0),
    "crecimiento_ventas": ("totalrevenues1yrgrowth.lasttwelvemonths", 1.0),
    "beta": ("beta", 1.0),
    "capitalizacion": ("intradaymarketcap", 1e9),
}

# Dónde buscar: empresas con SEDE en el universo, no cualquier cosa que cotice
# en sus bolsas. Medido el 13 sep 2026:
# · Sin limitar bolsas, «EE. UU.» devolvía Tencent y Samsung duplicadas en el
#   mercado OTC (PNK), y «Europa» cada británica dos veces (Londres y Cboe, .XC).
# · Con las bolsas, «Europa» seguía trayendo NVIDIA en Xetra (NVD.DE), Microsoft
#   en la línea internacional de Londres (0QYP.L) y Konami (KNM.L), y «EE. UU.»
#   los ADR de SK hynix, Novo Nordisk o Petrobras. Ocupaban los primeros puestos
#   por capitalización y desplazaban a las empresas de verdad del universo.
# Por eso hay dos filtros: uno barato sobre la lista de Yahoo (divisa en que
# presenta cuentas, `financialCurrency`) y el definitivo con el país de la sede
# del resumen (`pais_permitido`).
_EUROPEAS = {"EUR", "GBP", "GBp", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF"}
UNIVERSOS: Dict[str, Dict[str, Any]] = {
    "app": {"nombre": "los valores de la app"},
    "us": {
        "nombre": "EE. UU.", "regiones": ["us"], "bolsas": ["NMS", "NGM", "NCM", "NYQ", "ASE"],
        "divisas": {"USD"}, "paises": {"United States"},
    },
    "es": {
        "nombre": "España", "regiones": ["es"], "bolsas": ["MCE"],
        "divisas": _EUROPEAS | {"USD"}, "paises": {"Spain"},
    },
    "europa": {
        "nombre": "Europa",
        "regiones": ["es", "gb", "de", "fr", "it", "nl", "ch"],
        "bolsas": ["MCE", "LSE", "GER", "PAR", "MIL", "AMS", "EBS"],
        "divisas": _EUROPEAS,
        # Shell, BHP o ArcelorMittal presentan cuentas en dólares y son de aquí:
        # en Londres y Madrid se admite también el USD. En Xetra no: allí el USD
        # es casi siempre una empresa estadounidense (NVD.DE).
        "divisas_por_bolsa": {"LSE": _EUROPEAS | {"USD"}, "MCE": _EUROPEAS | {"USD"}},
        "paises": {
            "Spain", "United Kingdom", "Germany", "France", "Italy", "Netherlands", "Switzerland",
            "Ireland", "Belgium", "Luxembourg", "Portugal", "Austria", "Sweden", "Norway", "Denmark",
            "Finland", "Jersey", "Guernsey", "Isle of Man", "Greece", "Poland",
        },
    },
}


def pais_permitido(info: dict, universo: str) -> bool:
    """
    La sede está en el universo. Sin país declarado se admite: descartar por
    un campo vacío sacaría de la lista empresas perfectamente válidas.
    """
    paises = UNIVERSOS.get(universo, {}).get("paises")
    pais = (info or {}).get("country")
    return not paises or not pais or pais in paises


def condiciones_yahoo(filtros: Dict[str, Dict[str, float]]) -> List[Tuple[str, str, str, List[float]]]:
    """
    `(clave, operador, campo de Yahoo, valores)` de los filtros que admite su
    screener, en orden estable (es parte de la clave de caché).

    Se usan `gt`/`lt` y no `≥`/`≤`: un valor exactamente en el límite lo
    pierde el servidor. Es despreciable, y lo que sí llega se vuelve a comprobar
    aquí con el límite incluido.
    """
    salida = []
    for clave in sorted(filtros):
        if clave not in CAMPOS_YAHOO:
            continue
        campo, escala = CAMPOS_YAHOO[clave]
        mn, mx = filtros[clave].get("min"), filtros[clave].get("max")
        if mn is not None and mx is not None:
            salida.append((clave, "btwn", campo, [mn * escala, mx * escala]))
        elif mn is not None:
            salida.append((clave, "gt", campo, [mn * escala]))
        elif mx is not None:
            salida.append((clave, "lt", campo, [mx * escala]))
    return salida


def _nombre_normalizado(cotizacion: dict) -> str:
    nombre = cotizacion.get("longName") or cotizacion.get("shortName") or cotizacion.get("symbol") or ""
    return re.sub(r"[^a-z0-9]", "", nombre.lower())


def limpiar_candidatos(cotizaciones: List[dict], universo: str, maximo: int) -> List[str]:
    """
    Símbolos a revisar, en el orden de Yahoo (mayor capitalización primero).

    · Sólo acciones de las bolsas principales del universo.
    · Sin Latibex: en la Bolsa de Madrid los tickers que empiezan por X son
      empresas latinoamericanas (XPBR.MC es Petrobras), no españolas.
    · Una sola línea por empresa: GOOGL/GOOG, BRK-A/BRK-B y las preferentes de
      un banco comparten nombre y son la misma compañía.
    · Sin líneas internacionales de Londres: los símbolos que empiezan por
      cifra (0QYP.L es Microsoft) son acciones extranjeras.
    · Cuentas en una divisa del universo (`financialCurrency`). Si Yahoo no la
      da, se admite: el país de la sede lo comprueba luego `pais_permitido`.
    """
    u = UNIVERSOS[universo]
    bolsas = set(u.get("bolsas", []))
    vistos: set = set()
    salida: List[str] = []
    for q in cotizaciones:
        simbolo = q.get("symbol")
        if not simbolo or q.get("quoteType", "EQUITY") != "EQUITY":
            continue
        bolsa = q.get("exchange")
        if bolsas and bolsa not in bolsas:
            continue
        if bolsa == "MCE" and simbolo.startswith("X"):
            continue
        if simbolo[0].isdigit():
            continue
        divisas = u.get("divisas_por_bolsa", {}).get(bolsa) or u.get("divisas")
        divisa = q.get("financialCurrency")
        if divisas and divisa and divisa not in divisas:
            continue
        nombre = _nombre_normalizado(q)
        if nombre in vistos:
            continue
        vistos.add(nombre)
        salida.append(simbolo)
        if len(salida) >= maximo:
            break
    return salida


def definiciones() -> List[Dict[str, Any]]:
    campos = ("clave", "nombre", "grupo", "unidad", "umbral_analisis", "fuente", "nota")
    return [{c: r[c] for c in campos} for r in RATIOS]


def claves_de_analisis() -> List[str]:
    """Claves de `calculate_ratios` que usa el screener: lo único que se cachea."""
    return sorted({r["clave_analisis"] for r in RATIOS if r["clave_analisis"]} | {"roic", "wacc"})


def necesita_analisis(filtros: Dict[str, Dict[str, float]]) -> bool:
    return any(_POR_CLAVE[c]["fuente"] == ANALISIS for c in filtros if c in _POR_CLAVE)


def necesita_historico(filtros: Dict[str, Dict[str, float]]) -> bool:
    return any(_POR_CLAVE[c]["fuente"] == HISTORICO for c in filtros if c in _POR_CLAVE)


def extraer(
    info: dict,
    rentabilidad_dividendo: Optional[float],
    analisis: Optional[Dict[str, Any]] = None,
    historico: Optional[Dict[str, Any]] = None,
) -> Dict[str, Optional[float]]:
    """
    Ratios de un valor. `analisis` son los ratios de `calculate_ratios` e
    `historico` las métricas de `rendimiento.metricas_historicas`; con `None`
    los ratios de esa fuente quedan en hueco.
    """
    salida: Dict[str, Optional[float]] = {}
    for r in RATIOS:
        clave = r["clave"]
        if r["fuente"] == HISTORICO:
            v = _num(historico.get(r["clave_historico"])) if historico else None
        elif r["fuente"] == ANALISIS:
            v = _num(analisis.get(r["clave_analisis"])) if analisis else None
            if v is not None:
                if r["cero_es_hueco"] and v == 0:
                    v = None
                else:
                    v *= r["escala"]
        elif clave == "dividend_yield":
            v = _num(rentabilidad_dividendo)
        else:
            try:
                v = r["lector"](info) if r["lector"] else None
            except Exception:  # noqa: BLE001 — un campo raro no tumba el valor entero
                v = None
        salida[clave] = round(v, 2) if v is not None else None

    # El spread es ROIC − WACC. Si cualquiera de los dos era el 0 de «sin dato»,
    # la resta sale como un número y no lo es.
    if analisis:
        roic, wacc = _num(analisis.get("roic")), _num(analisis.get("wacc"))
        if not roic or not wacc:
            salida["spread_roic_wacc"] = None
    return salida


# Filtros del screener anterior → nuevo formato. `max_debt_equity` venía en
# veces (1 = 100 %) porque el código viejo dividía el campo de Yahoo entre 100.
_ANTIGUOS = {
    "min_pe": ("per", "min", 1.0),
    "max_pe": ("per", "max", 1.0),
    "min_roe": ("roe", "min", 1.0),
    "max_roe": ("roe", "max", 1.0),
    "min_dividend_yield": ("dividend_yield", "min", 1.0),
    "max_debt_equity": ("deuda_capital", "max", 100.0),
    "min_market_cap": ("capitalizacion", "min", 1.0),
}


def normalizar_filtros(nuevos: Optional[Dict[str, Dict[str, Any]]], antiguos: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
    """
    `{clave: {"min": x, "max": y}}` limpio. Un 0 ES un filtro: el screener de
    antes usaba `if filtros.min_roe:` y un «ROE mínimo 0» no filtraba nada.
    """
    salida: Dict[str, Dict[str, float]] = {}
    for campo, (clave, lado, factor) in _ANTIGUOS.items():
        v = _num(antiguos.get(campo))
        if v is not None:
            salida.setdefault(clave, {})[lado] = v * factor
    for clave, limites in (nuevos or {}).items():
        if clave not in _POR_CLAVE or not isinstance(limites, dict):
            continue
        for lado in ("min", "max"):
            v = _num(limites.get(lado))
            if v is not None:
                salida.setdefault(clave, {})[lado] = v
    return salida


def evaluar(
    ratios: Dict[str, Optional[float]],
    filtros: Dict[str, Dict[str, float]],
    analisis_listo: bool = True,
) -> Tuple[bool, List[str], List[str]]:
    """
    (cumple, claves sin dato, claves pendientes de cálculo).

    Un ratio de Análisis que aún no se ha calculado no es «sin dato»: es
    «pendiente», y la pantalla lo dice y vuelve a preguntar.
    """
    sin_dato: List[str] = []
    pendientes: List[str] = []
    cumple = True
    for clave, limites in filtros.items():
        v = ratios.get(clave)
        if v is None:
            if not analisis_listo and _POR_CLAVE.get(clave, {}).get("fuente") == ANALISIS:
                pendientes.append(clave)
            else:
                sin_dato.append(clave)
            cumple = False
            continue
        if "min" in limites and v < limites["min"]:
            cumple = False
        if "max" in limites and v > limites["max"]:
            cumple = False
    return cumple, sin_dato, pendientes
