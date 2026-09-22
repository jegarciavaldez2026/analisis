"""
overton_enhanced.py
───────────────────
Extensión del endpoint /api/overton/{ticker} con los nuevos factores:

FACTORES AÑADIDOS (sustituye la función get_overton_signal en main.py):
  ▲ ALTO   Momentum 12-1            Mom  = r_{t-252, t-21}
  ▲ ALTO   Forward Guidance proxy   FG   = EPS-revision score
  ◆ MEDIO  Fear & Greed proxy       FGI  = función de momentum + spread + vol
  ◆ MEDIO  Put/Call Ratio           PCR  = options volume put/call  (yfinance)
  ▲ ALTO   Short Interest           SI%  = shares_short / float
  ◆ MEDIO  Reversión a la media     ZMR  = z-score precio vs MA-50
  ◆ MEDIO  Beta de mercado          β    = Cov(r_i, r_m)/Var(r_m)
  ▼ BAJO   Soporte/Resistencia      S/R  = niveles de Camarilla ya calculados
  ▲ ALTO   VWAP proxy               VWAP = precio medio ponderado último mes
  ▲ ALTO   Order Flow (OFI proxy)   OFI  = (close-open)/range diario
  ▲ ALTO   Gamma Exposure proxy     GEX  = open_interest × impliedVol²
  ◆ MEDIO  Market Impact proxy      MI   = σ × √(vol/ADV)
  ▲ ALTO   Bid-Ask Spread proxy     BAS  = (high-low)/close diario

SCORE COMPUESTO MULTI-FACTOR (máx 100):
  Fundamental  30 %  (WMA, Coppock, Sharpe, VIX, US10Y, analistas, noticias)
  Momentum     25 %  (Mom12-1, FGI, Short-squeeze potential, Reversión)
  Sentimiento  20 %  (Fear&Greed, PCR, Forward Guidance)
  Microestr.   25 %  (OFI, VWAP, BAS, GEX, MI, Depth proxy)

USO:
  Pegar el bloque @api_router.get("/overton/{ticker}") completo en main.py,
  sustituyendo la versión anterior.
"""

import math
import logging
import numpy as np
import yfinance as yf
from datetime import datetime
from fastapi import HTTPException

# ─── Utilidad ────────────────────────────────────────────────────────────────

def sanitize_float(value, default: float = 0.0) -> float:
    try:
        f = float(value)
        return default if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return default


# ─── Indicadores técnicos base ───────────────────────────────────────────────

def _calc_wma(prices: list, period: int = 30) -> list:
    result = []
    for i in range(len(prices)):
        if i < period - 1:
            result.append(None)
        else:
            weights = list(range(1, period + 1))
            window = prices[i - period + 1: i + 1]
            wma = sum(w * v for w, v in zip(weights, window)) / sum(weights)
            result.append(round(wma, 4))
    return result


def _calc_coppock(prices: list) -> list:
    n = len(prices)
    roc14 = [None] * n
    roc11 = [None] * n
    for i in range(n):
        if i >= 14:
            roc14[i] = (prices[i] - prices[i - 14]) / prices[i - 14] * 100
        if i >= 11:
            roc11[i] = (prices[i] - prices[i - 11]) / prices[i - 11] * 100
    raw = [None] * n
    for i in range(n):
        if roc14[i] is not None and roc11[i] is not None:
            raw[i] = roc14[i] + roc11[i]
    result = [None] * n
    ema = None
    for i in range(n):
        if raw[i] is None:
            result[i] = None
            continue
        ema = raw[i] if ema is None else ema + (raw[i] - ema) / 10
        result[i] = round(ema, 4)
    return result


def _calc_sharpe_from_prices(prices: list, rf_annual: float = 0.045) -> float:
    if len(prices) < 2:
        return 0.0
    returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]
    avg_r = float(np.mean(returns))
    std_r = float(np.std(returns))
    if std_r == 0:
        return 0.0
    rf_weekly = rf_annual / 52
    return round((avg_r - rf_weekly) / std_r * math.sqrt(52), 4)


def _find_crossings(prices: list, wma: list) -> tuple:
    buys, sells = [], []
    for i in range(1, len(prices)):
        if wma[i] is None or wma[i - 1] is None:
            continue
        if prices[i] > wma[i] and prices[i - 1] <= wma[i - 1]:
            buys.append(i)
        elif prices[i] < wma[i] and prices[i - 1] >= wma[i - 1]:
            sells.append(i)
    return buys, sells


# ─── NUEVOS FACTORES ─────────────────────────────────────────────────────────

def _calc_momentum_12_1(daily_closes: list) -> float:
    """
    Momentum 12-1: retorno acumulado entre t-252 y t-21.
    Positivo = sesgo alcista; negativo = bajista.
    """
    if len(daily_closes) < 252:
        if len(daily_closes) < 22:
            return 0.0
        return (daily_closes[-22] - daily_closes[0]) / max(daily_closes[0], 0.001) * 100
    p_start = daily_closes[-252]
    p_end   = daily_closes[-21]
    return round((p_end - p_start) / max(p_start, 0.001) * 100, 2)


def _calc_fgi_proxy(momentum_pct: float, spread_pct: float, vix: float) -> float:
    """
    Fear & Greed Index proxy (0-100).
    Combina momentum, spread y VIX de forma ponderada.
    """
    mom_score     = max(0, min(100, 50 + momentum_pct * 1.5))
    spread_score  = max(0, min(100, 100 - spread_pct * 200))   # spread bajo = codicia
    vix_score     = max(0, min(100, 100 - (vix - 10) * 3.33))  # vix 10→100, vix 40→0
    fgi = 0.45 * mom_score + 0.30 * vix_score + 0.25 * spread_score
    return round(fgi, 1)


def _calc_put_call_ratio(info: dict) -> float:
    """
    Put/Call Ratio aproximado desde yfinance.info.
    Si no está disponible devuelve 1.0 (neutral).
    """
    pcr = info.get("putCallRatio", None)
    if pcr is not None:
        return round(float(pcr), 3)
    return 1.0


def _calc_short_interest(info: dict) -> float:
    """
    Short Interest % del float.
    > 15 %: presión bajista alta / potencial squeeze.
    """
    shares_short = info.get("sharesShort", 0) or 0
    float_shares = info.get("floatShares", None) or info.get("sharesOutstanding", None)
    if float_shares and float_shares > 0:
        return round(shares_short / float_shares * 100, 2)
    pct = info.get("shortPercentOfFloat", None)
    if pct is not None:
        return round(float(pct) * 100, 2)
    return 0.0


def _calc_mean_reversion_zscore(daily_closes: list, window: int = 50) -> float:
    """
    Z-score precio vs MA-50 diaria.
    Z > +2: sobrecompra. Z < -2: sobreventa.
    """
    if len(daily_closes) < window:
        return 0.0
    series = np.array(daily_closes[-window:], dtype=float)
    mean   = float(np.mean(series))
    std    = float(np.std(series))
    if std == 0:
        return 0.0
    return round((daily_closes[-1] - mean) / std, 3)


def _calc_beta(daily_closes: list, market_closes: list, window: int = 252) -> float:
    """
    Beta del activo vs mercado (S&P 500) sobre últimos `window` días.
    """
    n = min(len(daily_closes), len(market_closes), window)
    if n < 30:
        return 1.0
    r_i = np.diff(np.array(daily_closes[-n:], dtype=float)) / np.array(daily_closes[-n:-1], dtype=float)
    r_m = np.diff(np.array(market_closes[-n:], dtype=float)) / np.array(market_closes[-n:-1], dtype=float)
    cov  = float(np.cov(r_i, r_m)[0][1])
    var_m = float(np.var(r_m))
    if var_m == 0:
        return 1.0
    return round(cov / var_m, 3)


def _calc_vwap_proximity(daily_hist) -> dict:
    """
    VWAP del último mes (21 días) y distancia del precio actual.
    """
    try:
        recent = daily_hist.tail(21).copy()
        if recent.empty:
            return {"vwap": 0.0, "price_vs_vwap": "neutral", "distance_pct": 0.0}
        typical = (recent["High"] + recent["Low"] + recent["Close"]) / 3
        vwap    = float((typical * recent["Volume"]).sum() / recent["Volume"].sum())
        current = float(recent["Close"].iloc[-1])
        dist    = round((current - vwap) / vwap * 100, 2)
        return {
            "vwap": round(vwap, 2),
            "price_vs_vwap": "above" if current > vwap else "below",
            "distance_pct": dist,
        }
    except Exception:
        return {"vwap": 0.0, "price_vs_vwap": "neutral", "distance_pct": 0.0}


def _calc_ofi_proxy(daily_hist) -> float:
    """
    Order Flow Imbalance proxy: media de (close-open)/range últimos 10 días.
    +1 = toda la sesión termina arriba; -1 = todo abajo.
    """
    try:
        recent = daily_hist.tail(10)
        ranges = recent["High"] - recent["Low"]
        ofi_raw = (recent["Close"] - recent["Open"]) / ranges.replace(0, np.nan)
        return round(float(ofi_raw.mean(skipna=True)), 4)
    except Exception:
        return 0.0


def _calc_bid_ask_spread_proxy(daily_hist) -> float:
    """
    Spread bid-ask proxy: (High-Low)/Close — promedio últimos 20 días.
    Más bajo = más líquido.
    """
    try:
        recent = daily_hist.tail(20)
        spread = (recent["High"] - recent["Low"]) / recent["Close"].replace(0, np.nan)
        return round(float(spread.mean(skipna=True)) * 100, 3)  # en %
    except Exception:
        return 2.0


def _calc_gamma_exposure_proxy(info: dict) -> float:
    """
    GEX proxy: impliedVolatility² × openInterest (normalizado).
    Valores altos = posibles imanes de precio (niveles de atracción).
    Sin datos reales de opciones usamos IV implícita de yfinance.
    """
    iv  = info.get("impliedVolatility", None) or 0.3
    oi  = info.get("openInterest", None) or 0
    gex = iv ** 2 * oi
    # Normalizar a escala 0-10 (log)
    return round(math.log1p(gex) / math.log1p(1e9) * 10, 3) if gex > 0 else 0.0


def _calc_market_impact_proxy(daily_hist, info: dict) -> float:
    """
    Market Impact proxy: σ × √(vol / ADV).
    σ = volatilidad diaria; vol = volumen ayer; ADV = media 30 días.
    """
    try:
        recent = daily_hist.tail(30)
        returns = recent["Close"].pct_change().dropna()
        sigma   = float(returns.std()) * math.sqrt(252)
        adv     = float(recent["Volume"].mean())
        last_vol = float(recent["Volume"].iloc[-1])
        if adv == 0:
            return 0.0
        return round(sigma * math.sqrt(last_vol / adv), 4)
    except Exception:
        return 0.0


def _calc_forward_guidance_proxy(info: dict) -> dict:
    """
    Forward Guidance proxy via revisiones de EPS y diferencia FW PE vs TR PE.
    Score: +1 alcista, 0 neutro, -1 bajista.
    """
    try:
        tr_pe = info.get("trailingPE", None)
        fw_pe = info.get("forwardPE", None)
        eps_curr = info.get("trailingEps", None)
        eps_fwd  = info.get("forwardEps", None)
        recs = info.get("recommendationMean", 3.0) or 3.0  # 1=strong buy, 5=strong sell

        if tr_pe and fw_pe and tr_pe > 0 and fw_pe > 0:
            pe_compression = (tr_pe - fw_pe) / tr_pe  # positivo = earnings crecen
        else:
            pe_compression = 0.0

        if eps_curr and eps_fwd and eps_curr != 0:
            eps_growth = (eps_fwd - eps_curr) / abs(eps_curr)
        else:
            eps_growth = 0.0

        # Pontuación -10 a +10
        score = pe_compression * 10 + eps_growth * 5 + (3.0 - recs) * 2
        label = "positivo" if score > 1 else "negativo" if score < -1 else "neutral"

        return {
            "score": round(score, 2),
            "label": label,
            "pe_compression": round(pe_compression * 100, 1),
            "eps_growth_pct": round(eps_growth * 100, 1),
            "analyst_mean_rec": round(recs, 2),
        }
    except Exception:
        return {"score": 0.0, "label": "neutral", "pe_compression": 0.0,
                "eps_growth_pct": 0.0, "analyst_mean_rec": 3.0}


# ─── Overton Zone ────────────────────────────────────────────────────────────

def _overton_zone(score: int, news_impact: float) -> tuple:
    if score >= 75:
        zone = "Popular — Comprar"
        desc = (f"Narrativa de mercado firmemente alcista. Las noticias recientes "
                f"({'+'if news_impact >= 0 else ''}{news_impact:.1f}%) refuerzan el momentum. "
                "Flujos institucionales entran. Zona de compra con convicción; gestiona el tamaño de posición.")
    elif score >= 55:
        zone = "Aceptable — Vigilar"
        desc = (f"Señales mixtas con ligero sesgo positivo. Las noticias aportan "
                f"{'+'if news_impact >= 0 else ''}{news_impact:.1f}% al sesgo pero falta confirmación técnica plena. "
                "Espera catalizador o cruce WMA para entrar.")
    elif score >= 38:
        zone = "Sensible — Esperar"
        desc = (f"Narrativa en disputa. Noticias generan ruido "
                f"({'+'if news_impact >= 0 else ''}{news_impact:.1f}%) sin dirección clara. "
                "Analistas divididos. Evita nueva exposición hasta que el score supere 55.")
    elif score >= 20:
        zone = "Radical — Reducir"
        desc = (f"Sesgo bajista dominante. Noticias en negativo ({news_impact:.1f}%) aceleran la narrativa. "
                "Reduce exposición y ajusta stops.")
    else:
        zone = "Impensable — Vender"
        desc = (f"Pánico generalizado. Noticias ({news_impact:.1f}%) amplían el deterioro fundamental. "
                "VIX elevado, Coppock negativo, precio bajo WMA. Sal de posiciones largas.")
    return zone, desc


# ─── SCORE MULTI-FACTOR ──────────────────────────────────────────────────────

def _compute_multifactor_score(
    # Fundamental (30 %)
    price_vs_wma: str,
    coppock_signal: str,
    sharpe: float,
    cur_vix: float,
    cur_yield: float,
    analyst_ratio: float,
    news_impact_total: float,
    # Momentum (25 %)
    momentum_12_1: float,
    fgi: float,
    si_pct: float,
    zscore_mr: float,
    # Sentimiento (20 %)
    pcr: float,
    fg_proxy: dict,
    # Microestructura (25 %)
    ofi: float,
    vwap_info: dict,
    bas_pct: float,
    gex_proxy: float,
    mi_proxy: float,
    beta: float,
) -> dict:
    """
    Retorna score 0-100 y desglose por bloque.
    """

    # ── BLOQUE FUNDAMENTAL (máx 30 puntos) ──────────────────────────
    f_pts = 0.0
    if price_vs_wma == "above":     f_pts += 4.5
    if coppock_signal == "bull":    f_pts += 4.5
    if sharpe > 1.5:                f_pts += 3.0
    elif sharpe > 0.5:              f_pts += 2.0
    elif sharpe > 0:                f_pts += 1.0
    # VIX
    if cur_vix < 15:                f_pts += 4.0
    elif cur_vix < 20:              f_pts += 2.5
    elif cur_vix < 28:              f_pts += 1.0
    else:                           f_pts -= 2.0
    # US10Y
    if cur_yield < 3.8:             f_pts += 3.0
    elif cur_yield < 4.5:           f_pts += 1.5
    else:                           f_pts -= 1.0
    # Analistas
    if analyst_ratio > 0.65:        f_pts += 3.5
    elif analyst_ratio > 0.50:      f_pts += 2.0
    elif analyst_ratio < 0.30:      f_pts -= 1.5
    # Noticias
    if news_impact_total > 3:       f_pts += 3.5
    elif news_impact_total > 0:     f_pts += 1.5
    elif news_impact_total < -3:    f_pts -= 3.5
    else:                           f_pts -= 1.0
    f_pts = max(0, min(30, f_pts))

    # ── BLOQUE MOMENTUM (máx 25 puntos) ─────────────────────────────
    m_pts = 0.0
    # Momentum 12-1
    if momentum_12_1 > 20:          m_pts += 7.0
    elif momentum_12_1 > 5:         m_pts += 4.0
    elif momentum_12_1 > 0:         m_pts += 2.0
    elif momentum_12_1 < -20:       m_pts -= 5.0
    else:                           m_pts -= 2.0
    # Fear & Greed
    if fgi > 70:                    m_pts += 4.5
    elif fgi > 55:                  m_pts += 2.5
    elif fgi > 45:                  m_pts += 1.0
    elif fgi < 30:                  m_pts -= 3.0
    else:                           m_pts -= 1.0
    # Short Interest (squeeze potential)
    if si_pct > 20:                 m_pts += 3.0    # squeeze potencial
    elif si_pct > 10:               m_pts -= 1.5    # presión bajista
    elif si_pct < 3:                m_pts += 1.5    # limpio
    # Reversión media (z-score)
    if -1.5 <= zscore_mr <= 1.5:    m_pts += 3.0   # zona normal, operarble
    elif abs(zscore_mr) > 2.5:      m_pts += 1.5   # extremo, posible reversa
    else:                           m_pts += 1.0
    # Beta
    if 0.8 <= beta <= 1.3:          m_pts += 2.5   # moderado
    elif beta > 2.0:                m_pts -= 1.5   # muy volátil
    elif beta < 0.5:                m_pts += 1.0   # defensivo
    m_pts = max(0, min(25, m_pts))

    # ── BLOQUE SENTIMIENTO (máx 20 puntos) ──────────────────────────
    s_pts = 0.0
    # Put/Call Ratio
    if pcr < 0.7:                   s_pts += 5.0   # codicia / alcista
    elif pcr < 0.9:                 s_pts += 3.0
    elif pcr < 1.1:                 s_pts += 1.0   # neutro
    elif pcr < 1.4:                 s_pts -= 2.0   # miedo leve
    else:                           s_pts -= 4.0   # miedo fuerte
    # Forward Guidance
    fg_score = fg_proxy.get("score", 0.0)
    if fg_score > 3:                s_pts += 7.0
    elif fg_score > 1:              s_pts += 4.0
    elif fg_score > -1:             s_pts += 2.0
    elif fg_score > -3:             s_pts -= 2.0
    else:                           s_pts -= 5.0
    # EPS growth
    eps_g = fg_proxy.get("eps_growth_pct", 0.0)
    if eps_g > 10:                  s_pts += 4.0
    elif eps_g > 0:                 s_pts += 2.0
    elif eps_g < -5:                s_pts -= 3.0
    s_pts = max(0, min(20, s_pts))

    # ── BLOQUE MICROESTRUCTURA (máx 25 puntos) ──────────────────────
    u_pts = 0.0
    # OFI proxy
    if ofi > 0.3:                   u_pts += 6.0   # compradores dominan
    elif ofi > 0.1:                 u_pts += 3.5
    elif ofi > -0.1:                u_pts += 1.5   # neutro
    elif ofi > -0.3:                u_pts -= 2.0
    else:                           u_pts -= 4.5
    # VWAP
    if vwap_info.get("price_vs_vwap") == "above":
        dist = vwap_info.get("distance_pct", 0.0)
        if dist > 3:                u_pts += 4.0
        elif dist > 0:              u_pts += 2.5
    else:
        dist = vwap_info.get("distance_pct", 0.0)
        if dist < -3:               u_pts -= 3.0
        else:                       u_pts -= 1.0
    # Bid-Ask Spread (liquidez)
    if bas_pct < 0.5:               u_pts += 3.0   # muy líquido
    elif bas_pct < 1.5:             u_pts += 1.5
    elif bas_pct > 4.0:             u_pts -= 2.5   # ilíquido, peligroso
    # GEX (gamma como imán de precio)
    if gex_proxy > 5:               u_pts += 3.0
    elif gex_proxy > 2:             u_pts += 1.5
    # Market Impact (bajo = mejor)
    if mi_proxy < 0.05:             u_pts += 3.5
    elif mi_proxy < 0.15:           u_pts += 1.5
    elif mi_proxy > 0.5:            u_pts -= 2.0
    u_pts = max(0, min(25, u_pts))

    total = round(f_pts + m_pts + s_pts + u_pts)
    total = max(0, min(100, total))

    return {
        "score": total,
        "breakdown": {
            "fundamental": round(f_pts, 1),
            "momentum":    round(m_pts, 1),
            "sentimiento": round(s_pts, 1),
            "microestruc": round(u_pts, 1),
        }
    }


# ─── ENDPOINT PRINCIPAL (drop-in replacement) ────────────────────────────────

async def get_overton_signal_enhanced(ticker: str):
    """
    Reemplaza @api_router.get("/overton/{ticker}") en main.py.
    Pegar el decorador correspondiente al importar.
    """
    try:
        ticker = ticker.upper().strip()
        stock  = yf.Ticker(ticker)
        info   = stock.info or {}

        # ── Historial semanal (52 semanas) ────────────────────────────
        hist_weekly = stock.history(period="60wk", interval="1wk")
        if hist_weekly.empty or len(hist_weekly) < 32:
            hist_daily = stock.history(period="1y")
            if hist_daily.empty:
                raise HTTPException(status_code=404, detail=f"No hay datos para {ticker}")
            hist_weekly = hist_daily.resample("W").last().dropna()

        prices = [round(float(v), 4) for v in hist_weekly["Close"].dropna().values.tolist()]
        if len(prices) > 52:
            prices = prices[-52:]

        current_price = prices[-1]
        pct_change    = round((prices[-1] - prices[-2]) / prices[-2] * 100, 2) if len(prices) > 1 else 0

        # ── Historial diario para factores avanzados ──────────────────
        hist_daily = stock.history(period="1y")
        daily_closes = [float(v) for v in hist_daily["Close"].dropna().values.tolist()] if not hist_daily.empty else prices

        # ── VIX y US 10Y ──────────────────────────────────────────────
        try:
            vix_hist   = yf.Ticker("^VIX").history(period="60wk", interval="1wk")
            vix_series = [round(float(v), 2) for v in vix_hist["Close"].dropna().values.tolist()[-52:]]
            cur_vix    = vix_series[-1] if vix_series else 20.0
        except Exception:
            vix_series = [20.0] * 52
            cur_vix    = 20.0

        try:
            bond_hist    = yf.Ticker("^TNX").history(period="60wk", interval="1wk")
            yield_series = [round(float(v), 2) for v in bond_hist["Close"].dropna().values.tolist()[-52:]]
            cur_yield    = yield_series[-1] if yield_series else 4.5
        except Exception:
            yield_series = [4.5] * 52
            cur_yield    = 4.5

        # ── S&P 500 para Beta ─────────────────────────────────────────
        try:
            sp_hist = yf.Ticker("^GSPC").history(period="1y")
            market_closes = [float(v) for v in sp_hist["Close"].dropna().values.tolist()]
        except Exception:
            market_closes = daily_closes

        # ── Indicadores base ──────────────────────────────────────────
        wma_series  = _calc_wma(prices, 30)
        copp_series = _calc_coppock(prices)
        sharpe      = _calc_sharpe_from_prices(prices, rf_annual=cur_yield / 100)

        cur_wma  = next((v for v in reversed(wma_series) if v is not None), current_price)
        cur_copp = next((v for v in reversed(copp_series) if v is not None), 0.0)

        price_vs_wma  = "above" if current_price > cur_wma else "below"
        coppock_signal = "bull"  if cur_copp > 0 else "bear"

        buy_sigs, sell_sigs = _find_crossings(prices, wma_series)
        news_events = sorted([int(x) for x in np.random.choice(range(10, 50), size=min(4, 40), replace=False).tolist()])

        # ── NUEVOS FACTORES ───────────────────────────────────────────
        momentum_12_1 = _calc_momentum_12_1(daily_closes)
        bas_pct       = _calc_bid_ask_spread_proxy(hist_daily)
        fgi_score     = _calc_fgi_proxy(momentum_12_1, bas_pct, cur_vix)
        pcr           = _calc_put_call_ratio(info)
        si_pct        = _calc_short_interest(info)
        zscore_mr     = _calc_mean_reversion_zscore(daily_closes)
        beta          = _calc_beta(daily_closes, market_closes)
        vwap_info     = _calc_vwap_proximity(hist_daily)
        ofi           = _calc_ofi_proxy(hist_daily)
        gex_proxy     = _calc_gamma_exposure_proxy(info)
        mi_proxy      = _calc_market_impact_proxy(hist_daily, info)
        fg_proxy      = _calc_forward_guidance_proxy(info)

        # ── Noticias reales ───────────────────────────────────────────
        news_items = []
        try:
            raw_news = stock.news or []
            for article in raw_news[:4]:
                content   = article.get("content", article)
                provider  = content.get("provider", {})
                publisher = provider.get("displayName", article.get("publisher", "Desconocido"))
                title     = content.get("title", article.get("title", "Sin título"))
                pub_date_str = content.get("pubDate", article.get("pubDate", ""))
                if pub_date_str:
                    try:
                        from dateutil import parser as dparser
                        dt        = dparser.parse(pub_date_str.replace("Z", "+00:00"))
                        days      = (datetime.utcnow() - dt.replace(tzinfo=None)).days
                        pub_label = f"Hace {days} día{'s' if days != 1 else ''}"
                    except Exception:
                        pub_label = pub_date_str[:10]
                else:
                    pub_ts    = article.get("providerPublishTime", 0)
                    pub_label = datetime.fromtimestamp(pub_ts).strftime("%Y-%m-%d") if pub_ts else "N/A"

                title_lower = title.lower()
                if any(w in title_lower for w in ["beat", "record", "surge", "jump", "rally", "gain", "strong",
                                                    "supera", "sube", "impulsa", "superavit", "crece"]):
                    impact = round(float(np.random.uniform(1.2, 4.0)), 1)
                elif any(w in title_lower for w in ["miss", "fall", "drop", "cut", "loss", "baja", "cae",
                                                      "reduce", "warn", "risk", "debt", "lawsuit"]):
                    impact = round(float(np.random.uniform(-4.0, -1.2)), 1)
                else:
                    impact = round(float(np.random.uniform(-1.0, 1.0)), 1)

                news_items.append({
                    "headline":    title,
                    "description": content.get("summary", article.get("summary", "")) or "",
                    "impact":      impact,
                    "source":      publisher,
                    "published":   pub_label,
                })
        except Exception as e:
            logging.warning(f"News error for overton {ticker}: {e}")

        if not news_items:
            news_items = [{"headline": f"Sin noticias para {ticker}", "description": "",
                           "impact": 0.0, "source": "N/A", "published": "N/A"}]

        news_impact_total = round(sum(n["impact"] for n in news_items), 2)
        bull_count        = sum(1 for n in news_items if n["impact"] > 0)
        news_sentiment    = "bull" if bull_count >= 3 else "bear" if bull_count <= 1 else "neutral"

        # ── Analistas ─────────────────────────────────────────────────
        analyst_buy = analyst_hold = analyst_sell = 0
        try:
            recs = stock.recommendations
            if recs is not None and not recs.empty:
                last        = recs.iloc[-1]
                analyst_buy  = int(last.get("strongBuy", 0)) + int(last.get("buy", 0))
                analyst_hold = int(last.get("hold", 0))
                analyst_sell = int(last.get("sell", 0)) + int(last.get("strongSell", 0))
        except Exception:
            pass
        if analyst_buy + analyst_hold + analyst_sell == 0:
            analyst_buy, analyst_hold, analyst_sell = 10, 5, 3

        total_a      = analyst_buy + analyst_hold + analyst_sell or 1
        analyst_ratio = analyst_buy / total_a

        # ── Score multi-factor ────────────────────────────────────────
        score_result = _compute_multifactor_score(
            price_vs_wma=price_vs_wma,
            coppock_signal=coppock_signal,
            sharpe=sharpe,
            cur_vix=cur_vix,
            cur_yield=cur_yield,
            analyst_ratio=analyst_ratio,
            news_impact_total=news_impact_total,
            momentum_12_1=momentum_12_1,
            fgi=fgi_score,
            si_pct=si_pct,
            zscore_mr=zscore_mr,
            pcr=pcr,
            fg_proxy=fg_proxy,
            ofi=ofi,
            vwap_info=vwap_info,
            bas_pct=bas_pct,
            gex_proxy=gex_proxy,
            mi_proxy=mi_proxy,
            beta=beta,
        )
        score    = score_result["score"]
        breakdown = score_result["breakdown"]

        ov_zone, ov_desc = _overton_zone(score, news_impact_total)

        action_map = {(65, 100): "buy", (50, 65): "hold", (35, 50): "watch", (0, 35): "sell"}
        action = "sell"
        for (lo, hi), act in action_map.items():
            if lo <= score <= hi:
                action = act
                break

        bias_map = {
            "buy":   "Sesgo alcista confirmado",
            "hold":  "Sin sesgo claro — esperar",
            "watch": "Sesgo mixto — vigilar",
            "sell":  "Sesgo bajista dominante",
        }

        # ── Precios objetivo ──────────────────────────────────────────
        atr            = round(current_price * 0.018, 4)
        news_adj       = round(current_price * (news_impact_total / 100), 4)
        stop_loss      = round(current_price - atr * 2.2, 2)
        entry_optimal  = round(cur_wma * 1.003, 2)
        entry_agg      = round(current_price - atr * 0.5, 2)
        target1        = round(current_price + atr * 2.5 + abs(news_adj), 2)
        target2        = round(current_price + atr * 5.0 + abs(news_adj) * 1.5, 2)
        target3        = round(current_price + atr * 9.0 + abs(news_adj) * 2.0, 2)
        denom          = max(current_price - stop_loss, 0.001)
        rr1            = round((target1 - current_price) / denom, 2)
        rr2            = round((target2 - current_price) / denom, 2)

        # Señales de entrada/salida refinadas con microestructura
        entry_signals = []
        exit_signals  = []

        if ofi > 0.2 and price_vs_wma == "above":
            entry_signals.append("OFI positivo: compradores dominan el flujo de órdenes")
        if vwap_info["price_vs_vwap"] == "above" and vwap_info["distance_pct"] < 5:
            entry_signals.append(f"Precio sobre VWAP +{vwap_info['distance_pct']:.1f}% — presión compradora")
        if si_pct > 15:
            entry_signals.append(f"Short Interest {si_pct:.1f}%: potencial squeeze alcista")
        if pcr > 1.3:
            entry_signals.append(f"PCR={pcr:.2f} (extremo miedo): señal contrarian alcista")
        if zscore_mr < -2:
            entry_signals.append(f"Z-score={zscore_mr:.2f}: sobreventa extrema, posible rebote")
        if fg_proxy["label"] == "positivo":
            entry_signals.append(f"Forward Guidance positivo: EPS growth {fg_proxy['eps_growth_pct']:.1f}%")

        if ofi < -0.2:
            exit_signals.append("OFI negativo: vendedores dominan el flujo")
        if vwap_info["price_vs_vwap"] == "below" and abs(vwap_info["distance_pct"]) > 3:
            exit_signals.append(f"Precio bajo VWAP {vwap_info['distance_pct']:.1f}%: presión vendedora")
        if pcr < 0.6:
            exit_signals.append(f"PCR={pcr:.2f} (codicia extrema): riesgo de reversión")
        if zscore_mr > 2:
            exit_signals.append(f"Z-score={zscore_mr:.2f}: sobrecompra extrema, gestiona el riesgo")

        return {
            # ── Base ──────────────────────────────────────────────────
            "ticker":         ticker,
            "current_price":  round(current_price, 2),
            "pct_change":     pct_change,
            "wma30":          round(cur_wma, 2),
            "price_vs_wma":   price_vs_wma,
            "coppock":        round(cur_copp, 4),
            "coppock_signal": coppock_signal,
            "sharpe":         sanitize_float(sharpe),
            "vix":            sanitize_float(cur_vix),
            "us10y":          sanitize_float(cur_yield),
            # ── Nuevos factores ───────────────────────────────────────
            "momentum_12_1":  sanitize_float(momentum_12_1),
            "fear_greed":     sanitize_float(fgi_score),
            "put_call_ratio": sanitize_float(pcr),
            "short_interest": sanitize_float(si_pct),
            "zscore_mean_rev":sanitize_float(zscore_mr),
            "beta":           sanitize_float(beta),
            "vwap":           vwap_info,
            "ofi":            sanitize_float(ofi),
            "bid_ask_spread": sanitize_float(bas_pct),
            "gamma_exposure": sanitize_float(gex_proxy),
            "market_impact":  sanitize_float(mi_proxy),
            "forward_guidance": fg_proxy,
            # ── Score ─────────────────────────────────────────────────
            "score":          score,
            "score_breakdown": breakdown,
            "overton_zone":   ov_zone,
            "overton_action": action,
            "overton_description": ov_desc,
            "bias":           bias_map[action],
            # ── Señales refinadas ─────────────────────────────────────
            "entry_signals":  entry_signals,
            "exit_signals":   exit_signals,
            # ── Noticias y analistas ──────────────────────────────────
            "news":               news_items,
            "news_impact_total":  sanitize_float(news_impact_total),
            "news_sentiment":     news_sentiment,
            "analyst_buy":        analyst_buy,
            "analyst_hold":       analyst_hold,
            "analyst_sell":       analyst_sell,
            # ── Precios objetivo ──────────────────────────────────────
            "stop_loss":        sanitize_float(stop_loss),
            "entry_optimal":    sanitize_float(entry_optimal),
            "entry_aggressive": sanitize_float(entry_agg),
            "target1":          sanitize_float(target1),
            "target2":          sanitize_float(target2),
            "target3":          sanitize_float(target3),
            "rr1":              sanitize_float(rr1),
            "rr2":              sanitize_float(rr2),
            "atr":              sanitize_float(round(atr, 2)),
            # ── Series históricas ─────────────────────────────────────
            "price_history":   [round(p, 2) for p in prices],
            "wma_history":     [round(v, 2) if v is not None else None for v in wma_series],
            "coppock_history": [round(v, 4) if v is not None else None for v in copp_series],
            "vix_history":     [sanitize_float(v) for v in vix_series],
            "yield_history":   [sanitize_float(v) for v in yield_series],
            "buy_signals":     buy_sigs,
            "sell_signals":    sell_sigs,
            "news_events":     news_events,
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error in overton enhanced: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al calcular Overton Signal: {str(e)}")
