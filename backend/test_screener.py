"""
Pruebas de screener.py.

    cd backend && python -m pytest test_screener.py -q
"""
from __future__ import annotations

import screener as scr

INFO = {
    "trailingPE": 28.4, "enterpriseToEbitda": 20.1, "priceToSalesTrailing12Months": 7.9,
    "priceToBook": 45.0, "trailingPegRatio": 2.1, "freeCashflow": 100e9, "marketCap": 3000e9,
    "totalRevenue": 400e9, "payoutRatio": 0.15, "returnOnEquity": 1.52, "returnOnAssets": 0.22,
    "grossMargins": 0.46, "operatingMargins": 0.31, "profitMargins": 0.24, "ebitdaMargins": 0.34,
    "currentRatio": 0.9, "quickRatio": 0.8, "debtToEquity": 150.0, "totalDebt": 100e9,
    "totalCash": 60e9, "ebitda": 130e9, "revenueGrowth": 0.05, "earningsGrowth": -0.02, "beta": 1.2,
}

# Valores reales de calculate_ratios para KO (13 sep 2026)
ANALISIS_KO = {
    "roic": 17.48, "roce": 21.13, "croic": 9.29, "net_debt": 35222000000.0, "net_debt_ebit": 1.995,
    "ev_ebit": 23.22, "wacc": 5.93, "roic_wacc_spread": 11.55, "altman_z_score": 5.43,
    "piotroski_f_score": 5, "montier_c_score": 2,
}


def test_unidades_del_resumen_como_en_analisis():
    r = scr.extraer(INFO, 0.45)
    assert r["roe"] == 152.0            # fracción → %
    assert r["margen_bruto"] == 46.0
    assert r["deuda_capital"] == 150.0  # Yahoo ya lo da en %; NO se divide
    assert r["fcf_yield"] == 3.33       # 100 / 3000
    assert r["p_fcf"] == 30.0
    assert r["margen_fcf"] == 25.0
    assert r["deuda_neta_ebitda"] == 0.31
    assert r["capitalizacion"] == 3000.0
    assert r["dividend_yield"] == 0.45
    assert r["crecimiento_bpa"] == -2.0


def test_ratios_de_analisis_con_su_escala():
    r = scr.extraer(INFO, None, ANALISIS_KO)
    assert r["roic"] == 17.48 and r["croic"] == 9.29
    assert r["deuda_neta"] == 35.22     # dólares → miles de millones
    assert r["deuda_neta_ebit"] == 2.0 and r["ev_ebit"] == 23.22
    assert r["wacc"] == 5.93 and r["spread_roic_wacc"] == 11.55
    assert r["altman_z"] == 5.43 and r["piotroski"] == 5 and r["montier"] == 2


def test_sin_calculo_de_analisis_esos_ratios_son_hueco_y_el_resto_sigue():
    r = scr.extraer(INFO, None, None)
    assert r["roic"] is None and r["altman_z"] is None and r["montier"] is None
    assert r["per"] == 28.4


def test_el_cero_de_sin_dato_de_analisis_es_hueco():
    """calculate_ratios devuelve ROIC 0 con capital invertido ≤ 0, deuda neta 0
    sin deuda ni caja… Ese 0 pasaría un filtro de máximo sin tener dato."""
    vacio = {"roic": 0, "roce": 0, "net_debt": 0, "net_debt_ebit": 0, "wacc": 0,
             "roic_wacc_spread": 0, "altman_z_score": 0, "piotroski_f_score": 0, "montier_c_score": 0}
    r = scr.extraer(INFO, None, vacio)
    assert r["roic"] is None and r["deuda_neta"] is None and r["wacc"] is None
    assert r["altman_z"] is None and r["piotroski"] is None
    assert r["spread_roic_wacc"] is None   # 0 − 0 no es un spread
    assert r["montier"] == 0               # cero señales SÍ es un valor
    assert scr.evaluar(r, {"deuda_neta_ebit": {"max": 1}}) == (False, ["deuda_neta_ebit"], [])


def test_spread_hueco_si_roic_o_wacc_eran_sin_dato():
    r = scr.extraer(INFO, None, {**ANALISIS_KO, "wacc": 0, "roic_wacc_spread": 17.48})
    assert r["spread_roic_wacc"] is None
    # Contraprueba: un spread negativo real se conserva
    r2 = scr.extraer(INFO, None, {**ANALISIS_KO, "roic": 4.0, "roic_wacc_spread": -1.93})
    assert r2["spread_roic_wacc"] == -1.93


def test_pendiente_no_es_sin_dato():
    r = scr.extraer(INFO, None, None)
    assert scr.evaluar(r, {"roic": {"min": 15}}, analisis_listo=False) == (False, [], ["roic"])
    assert scr.evaluar(r, {"roic": {"min": 15}}, analisis_listo=True) == (False, ["roic"], [])
    # Un ratio del resumen nunca queda pendiente
    assert scr.evaluar(r, {"per": {"max": 30}}, analisis_listo=False) == (True, [], [])


def test_necesita_analisis():
    assert scr.necesita_analisis({"altman_z": {"min": 3}}) is True
    assert scr.necesita_analisis({"per": {"max": 20}}) is False


def test_multiplos_con_denominador_negativo_son_hueco():
    r = scr.extraer({"trailingPE": -12.0, "freeCashflow": -5e9, "marketCap": 10e9}, None)
    assert r["per"] is None
    assert r["p_fcf"] is None
    assert r["fcf_yield"] == -50.0  # el rendimiento sí existe, y es negativo


def test_nombres_umbrales_y_fuentes():
    d = {x["clave"]: x for x in scr.definiciones()}
    assert d["per"]["nombre"] == "P/E Ratio (Precio/Beneficio)" and d["per"]["umbral_analisis"] == "< 25"
    assert d["roic"]["nombre"] == "ROIC (Return on Invested Capital)" and d["roic"]["fuente"] == "analisis"
    assert d["per"]["fuente"] == "resumen"
    assert d["piotroski"]["umbral_analisis"] == ">= 7"
    # El Montier va con su aviso: el umbral de Análisis va al revés del cálculo
    assert "ALTO es mejor" in d["montier"]["nota"]
    assert set(scr.claves_de_analisis()) >= {"roic", "wacc", "altman_z_score", "montier_c_score", "net_debt"}


def test_min_max_y_valor_sin_dato():
    ratios = scr.extraer(INFO, None)
    assert scr.evaluar(ratios, {"roe": {"min": 15}}) == (True, [], [])
    assert scr.evaluar(ratios, {"per": {"max": 25}}) == (False, [], [])
    assert scr.evaluar(ratios, {"dividend_yield": {"min": 1}}) == (False, ["dividend_yield"], [])


def test_un_cero_es_un_filtro():
    """El screener de antes usaba `if filtros.min_roe:` y 0 no filtraba."""
    f = scr.normalizar_filtros({"crecimiento_bpa": {"min": 0}}, {})
    assert f == {"crecimiento_bpa": {"min": 0.0}}
    assert scr.evaluar(scr.extraer(INFO, None), f)[0] is False


def test_filtros_antiguos_se_traducen_con_su_unidad():
    f = scr.normalizar_filtros(None, {"max_pe": 15, "max_debt_equity": 1, "min_market_cap": 100})
    assert f == {"per": {"max": 15.0}, "deuda_capital": {"max": 100.0}, "capitalizacion": {"min": 100.0}}


def test_claves_desconocidas_se_ignoran():
    assert scr.normalizar_filtros({"inventado": {"min": 1}, "roe": {"min": None}}, {}) == {}


def test_condiciones_yahoo_con_su_escala_y_operador():
    f = {"capitalizacion": {"min": 100}, "per": {"min": 5, "max": 15}, "deuda_capital": {"max": 50}, "roic": {"min": 15}}
    assert scr.condiciones_yahoo(f) == [
        ("capitalizacion", "gt", "intradaymarketcap", [100e9]),   # miles de millones → dólares
        ("deuda_capital", "lt", "totaldebtequity.lasttwelvemonths", [50]),
        ("per", "btwn", "peratio.lasttwelvemonths", [5, 15]),
    ]  # ROIC no lo admite Yahoo: se comprueba aquí, sobre lo que devuelva


def test_limpiar_candidatos_quita_otc_duplicados_preferentes_y_etf():
    cot = [
        {"symbol": "TCEHY", "exchange": "PNK", "longName": "Tencent Holdings Ltd", "quoteType": "EQUITY"},
        {"symbol": "GOOGL", "exchange": "NMS", "longName": "Alphabet Inc.", "quoteType": "EQUITY"},
        {"symbol": "GOOG", "exchange": "NMS", "longName": "Alphabet Inc.", "quoteType": "EQUITY"},
        {"symbol": "BAC", "exchange": "NYQ", "longName": "Bank of America Corporation", "quoteType": "EQUITY"},
        {"symbol": "BAC-PB", "exchange": "NYQ", "longName": "Bank of America Corporation", "quoteType": "EQUITY"},
        {"symbol": "SPY", "exchange": "PCX", "longName": "SPDR S&P 500 ETF", "quoteType": "ETF"},
        {"symbol": "JNJ", "exchange": "NYQ", "longName": "Johnson & Johnson", "quoteType": "EQUITY"},
    ]
    assert scr.limpiar_candidatos(cot, "us", 10) == ["GOOGL", "BAC", "JNJ"]
    assert scr.limpiar_candidatos(cot, "us", 2) == ["GOOGL", "BAC"]


def test_espana_sin_latibex():
    es = [
        {"symbol": "SAN.MC", "exchange": "MCE", "longName": "Banco Santander, S.A.", "quoteType": "EQUITY"},
        {"symbol": "XPBR.MC", "exchange": "MCE", "longName": "Petróleo Brasileiro S.A.", "quoteType": "EQUITY"},
        {"symbol": "ITX.MC", "exchange": "MCE", "longName": "Industria de Diseño Textil, S.A.", "quoteType": "EQUITY"},
    ]
    assert scr.limpiar_candidatos(es, "es", 10) == ["SAN.MC", "ITX.MC"]


def test_fuera_las_lineas_extranjeras_de_las_bolsas_europeas():
    """Medido: NVIDIA en Xetra, Microsoft en la línea internacional de Londres y
    Konami ocupaban los primeros puestos de «Europa»."""
    eu = [
        {"symbol": "NVD.DE", "exchange": "GER", "longName": "NVIDIA Corporation", "financialCurrency": "USD"},
        {"symbol": "0QYP.L", "exchange": "LSE", "longName": "Microsoft Corporation", "financialCurrency": "USD"},
        {"symbol": "KNM.L", "exchange": "LSE", "longName": "Konami Group Corporation", "financialCurrency": "JPY"},
        {"symbol": "SHEL.L", "exchange": "LSE", "longName": "Shell plc", "financialCurrency": "USD"},
        {"symbol": "SAP.DE", "exchange": "GER", "longName": "SAP SE", "financialCurrency": "EUR"},
        {"symbol": "MTS.MC", "exchange": "MCE", "longName": "ArcelorMittal S.A.", "financialCurrency": "USD"},
    ]
    # Shell (Londres, USD) y ArcelorMittal (Madrid, USD) son de aquí y se quedan
    assert scr.limpiar_candidatos(eu, "europa", 10) == ["SHEL.L", "SAP.DE", "MTS.MC"]


def test_adr_extranjeros_fuera_de_ee_uu():
    us = [
        {"symbol": "SKHY", "exchange": "NMS", "longName": "SK hynix Inc.", "financialCurrency": "KRW"},
        {"symbol": "NVO", "exchange": "NYQ", "longName": "Novo Nordisk A/S", "financialCurrency": "DKK"},
        {"symbol": "JPM", "exchange": "NYQ", "longName": "JPMorgan Chase & Co.", "financialCurrency": "USD"},
    ]
    assert scr.limpiar_candidatos(us, "us", 10) == ["JPM"]


def test_pais_de_la_sede():
    assert scr.pais_permitido({"country": "United States"}, "us") is True
    assert scr.pais_permitido({"country": "United Kingdom"}, "us") is False   # Shell ADR en dólares
    assert scr.pais_permitido({"country": "Spain"}, "europa") is True
    assert scr.pais_permitido({"country": "Luxembourg"}, "es") is False
    assert scr.pais_permitido({}, "europa") is True                           # sin dato: no se descarta
    assert scr.pais_permitido({"country": "Japan"}, "app") is True            # la app no filtra por país


def test_universos_declarados():
    assert set(scr.UNIVERSOS) == {"app", "us", "es", "europa"}
    assert "PNK" not in scr.UNIVERSOS["us"]["bolsas"]
    assert "CXE" not in scr.UNIVERSOS["europa"]["bolsas"]
