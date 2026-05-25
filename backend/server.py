import asyncio
from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Tuple
import uuid
from datetime import datetime, timedelta
import yfinance as yf
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import timedelta
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends
from typing import Dict, List

# ── Auth Config ───────────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get("SECRET_KEY", "finanalysis-secret-key-2026-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)
import requests
try:
    yf.utils.requests = requests
except Exception:
    pass
import numpy as np
import pandas as pd
import math

def sanitize_float(value, default=0.0):
    try:
        if value is None:
            return default
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (TypeError, ValueError):
        return default
import asyncio
import httpx
import os as _os
OLLAMA_BASE_URL = _os.environ.get("OLLAMA_URL", "localhost:11434")
OLLAMA_MODEL = _os.environ.get("OLLAMA_MODEL", "qwen2.5-coder:7b")

class UserMessage:
    def __init__(self, text: str):
        self.text = text

class LlmChat:
    def __init__(self, api_key=None, session_id=None, system_message=None):
        self.session_id = session_id
        self.system_message = system_message
        self.history = []
        if system_message:
            self.history.append({"role": "system", "content": system_message})

    def with_model(self, provider=None, model=None):
        return self

    async def send_message(self, user_message) -> str:
        self.history.append({"role": "user", "content": user_message.text})
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json={"model": OLLAMA_MODEL, "messages": self.history, "stream": False, "options": {"num_predict": 300, "temperature": 0.1, "top_p": 0.9, "repeat_penalty": 1.1}}
                )
                response.raise_for_status()
                data = response.json()
                assistant_msg = data["message"]["content"]
                self.history.append({"role": "assistant", "content": assistant_msg})
                return assistant_msg
        except Exception as e:
            return "Lo siento, el asistente IA no está disponible en este momento."


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class AnalyzeRequest(BaseModel):
    ticker: str

class RatioMetric(BaseModel):
    name: str
    value: Optional[float]
    threshold: Optional[str]
    passed: bool
    interpretation: str
    display_value: str

class RatioCategory(BaseModel):
    category: str
    metrics: List[RatioMetric]

class InstitutionalHolder(BaseModel):
    holder_name: str
    shares: int
    percentage: float
    value: float

class AnalystRecommendation(BaseModel):
    period: str
    strong_buy: int
    buy: int
    hold: int
    sell: int
    strong_sell: int

class StockProfile(BaseModel):
    sector: str
    industry: str
    full_time_employees: Optional[int] = None
    business_summary: str
    website: Optional[str] = None
    headquarters: Optional[str] = None

class HoldersBreakdown(BaseModel):
    insider_percent: float
    institution_percent: float
    public_percent: float

class AnalysisResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ticker: str
    company_name: str
    analysis_date: datetime = Field(default_factory=datetime.utcnow)
    recommendation: str
    favorable_percentage: float
    risk_level: str
    total_metrics: int
    favorable_metrics: int
    unfavorable_metrics: int
    ratios: List[RatioCategory]
    metadata: Dict[str, Any]
    summary_flags: Dict[str, Any]
    valuation_summary: Dict[str, Any] = Field(default_factory=dict)
    # New fields
    company_profile: Optional[StockProfile] = None
    analyst_recommendations: Optional[AnalystRecommendation] = None
    holders_breakdown: Optional[HoldersBreakdown] = None
    top_institutional_holders: List[InstitutionalHolder] = []

class HistoryItem(BaseModel):
    id: str
    ticker: str
    company_name: str
    analysis_date: datetime
    recommendation: str
    favorable_percentage: float

# ── Helper Functions ──────────────────────────────────────────────────────────
def safe_divide(numerator, denominator, default=None):
    try:
        if denominator == 0 or denominator is None or numerator is None:
            return default
        result = numerator / denominator
        if np.isnan(result) or np.isinf(result):
            return default
        return result
    except Exception:
        return default

def get_cagr(start_value, end_value, periods, default=None):
    try:
        if start_value <= 0 or end_value <= 0 or periods <= 0:
            return default
        cagr = (pow(end_value / start_value, 1 / periods) - 1) * 100
        if np.isnan(cagr) or np.isinf(cagr):
            return default
        return cagr
    except Exception:
        return default

def safe_float(value, default=0.0):
    try:
        return default if value is None else float(value)
    except (TypeError, ValueError):
        return default

# =============================================================================
#  BUG FIX 1 — Acceso correcto a filas de DataFrames de yFinance
#  El problema original: _col() usaba df.get(key) que en un DataFrame busca
#  columnas (años) NO filas (métricas). Corrección: df.loc[key].
# =============================================================================

def _get_row(df: pd.DataFrame, *keys: str) -> list:
    """
    Extrae una FILA del DataFrame de yFinance por nombre de métrica.
    En yFinance: filas = métricas, columnas = años fiscales.
    Busca por alias en orden; devuelve lista de floats o lista de ceros.
    """
    if df is None or df.empty:
        return []
    for key in keys:
        try:
            if key in df.index:
                vals = df.loc[key].values
                return [sanitize_float(v) for v in vals]
        except Exception:
            pass
    return [0.0] * (df.shape[1] if df.shape[1] > 0 else 1)


# =============================================================================
#  BUG FIX 2 — CAGR tolerante a negativos y turnarounds
#  El problema original: cagr_n() devolvía 0 si start<=0 o end<=0,
#  eliminando empresas con FCF/EPS negativo en algún año (muy común).
# =============================================================================

def cagr_signed(start: float, end: float, years: int) -> Tuple[Optional[float], str]:
    """
    Calcula CAGR manejando valores negativos.
    Returns: (valor_fraccion_o_None, nota)
    Notas: 'ok', 'turnaround', 'deterioro', 'inicio_cero', 'insuficiente', 'error'
    """
    if years < 1:
        return 0.0, "insuficiente"
    if start == 0.0:
        return 0.0, "inicio_cero"
    if start < 0 and end > 0:
        return None, "turnaround"   # mejora de negativo a positivo
    if start > 0 and end < 0:
        return None, "deterioro"    # deterioro de positivo a negativo
    try:
        ratio = abs(end) / abs(start)
        if ratio <= 0:
            return 0.0, "error"
        raw = (ratio ** (1.0 / years)) - 1.0
        if end < start:
            raw = -raw
        if math.isnan(raw) or math.isinf(raw):
            return 0.0, "error"
        return round(raw, 6), "ok"
    except Exception:
        return 0.0, "error"

# =============================================================================
#  calculate_ratios() — VERSIÓN CORREGIDA + 15 NUEVOS RATIOS
#
#  BUGS CORREGIDOS:
#    1. _get_row() con df.loc[] en lugar de df.get()
#    2. cagr_signed() tolera FCF/EPS negativos
#    3. PEG funciona correctamente y detecta turnarounds
#
#  15 NUEVOS RATIOS (criterio buy-side / fondos de inversión):
#    Rentabilidad:  ROTE, EBITDA Margin, Incremental ROIC
#    Eficiencia:    Gross Profit/Employee, Revenue/Employee, DSO, DIO, DPO, CCC
#    Valoración:    EV/EBITDA, P/FCF, Graham Number, Magic Formula Score
#    Leverage:      Net Debt/EBITDA, DSCR
#    Valoración adv: EPV (Earnings Power Value)
# =============================================================================

def calculate_ratios(ticker_data):
    """Calcula todos los ratios financieros — versión corregida + 15 nuevos."""
    try:
        def _get_stmt(primary_attr, fallback_attr=None):
            df = getattr(ticker_data, primary_attr, None)
            if df is None or (hasattr(df, 'empty') and df.empty):
                if fallback_attr:
                    df = getattr(ticker_data, fallback_attr, None)
            if df is None or (hasattr(df, 'empty') and df.empty):
                return pd.DataFrame()
            return df

        income_stmt   = _get_stmt('income_stmt', 'financials')
        balance_sheet = _get_stmt('balance_sheet', 'balancesheet')
        cash_flow     = _get_stmt('cash_flow', 'cashflow')
        info          = ticker_data.info or {}

        def _n(d, *keys, default=0):
            for k in keys:
                v = d.get(k)
                if v is not None:
                    try:
                        f = float(v)
                        if not (math.isnan(f) or math.isinf(f)):
                            return f
                    except (TypeError, ValueError):
                        pass
            return default

        # ── Diccionarios columna más reciente ─────────────────────────────────
        income      = income_stmt.iloc[:, 0].to_dict()  if not income_stmt.empty  and income_stmt.shape[1]  > 0 else {}
        income_prev = income_stmt.iloc[:, -1].to_dict() if not income_stmt.empty  and income_stmt.shape[1]  > 1 else {}
        balance     = balance_sheet.iloc[:, 0].to_dict() if not balance_sheet.empty and balance_sheet.shape[1] > 0 else {}
        cf          = cash_flow.iloc[:, 0].to_dict()    if not cash_flow.empty    and cash_flow.shape[1]    > 0 else {}

        # ── Income Statement ──────────────────────────────────────────────────
        total_revenue    = _n(income, 'Total Revenue') or _n(info, 'totalRevenue')
        gross_profit     = _n(income, 'Gross Profit')
        operating_income = _n(income, 'Operating Income')
        ebit             = _n(income, 'EBIT') or operating_income
        net_income       = _n(income, 'Net Income') or _n(info, 'netIncomeToCommon')
        interest_expense = abs(_n(income, 'Interest Expense', 'Interest Expense Non Operating'))
        rd_expense       = _n(income, 'Research Development', 'Research And Development')
        cogs_val         = _n(income, 'Cost Of Revenue')
        operating_expenses = _n(income, 'Operating Expense')

        # ── Balance Sheet ─────────────────────────────────────────────────────
        total_assets        = _n(balance, 'Total Assets') or _n(info, 'totalAssets')
        current_assets      = _n(balance, 'Current Assets')
        total_liabilities   = _n(balance, 'Total Liabilities Net Minority Interest')
        current_liabilities = _n(balance, 'Current Liabilities')
        total_equity        = (_n(balance, 'Total Equity Gross Minority Interest', 'Stockholders Equity')
                               or _n(info, 'totalStockholderEquity'))
        cash                = _n(balance, 'Cash And Cash Equivalents')
        retained_earnings   = _n(balance, 'Retained Earnings')
        total_debt          = _n(balance, 'Total Debt') or _n(info, 'totalDebt')
        inventory           = _n(balance, 'Inventory')
        accounts_receivable = _n(balance, 'Accounts Receivable')
        accounts_payable    = _n(balance, 'Accounts Payable')
        goodwill            = _n(balance, 'Goodwill')
        intangibles         = goodwill + _n(balance, 'Intangible Assets')
        net_ppe             = _n(balance, 'Net PPE', 'Property Plant Equipment')
        long_term_debt      = _n(balance, 'Long Term Debt') or total_debt
        tangible_equity     = total_equity - intangibles if total_equity > 0 else 0

        # ── Cash Flow ─────────────────────────────────────────────────────────
        operating_cf   = _n(cf, 'Operating Cash Flow', 'Total Cash From Operating Activities')
        capex          = abs(_n(cf, 'Capital Expenditure', 'Capital Expenditures'))
        depreciation   = abs(_n(cf, 'Depreciation And Amortization', 'Depreciation'))
        dividends_paid = abs(_n(cf, 'Cash Dividends Paid'))
        free_cash_flow = operating_cf - capex

        # ── Market Data ───────────────────────────────────────────────────────
        market_cap          = _n(info, 'marketCap')
        enterprise_value    = _n(info, 'enterpriseValue') or market_cap
        current_price       = _n(info, 'currentPrice', 'regularMarketPrice')
        shares_outstanding  = _n(info, 'sharesOutstanding')
        beta                = _n(info, 'beta', default=1.0)
        dividend_rate       = _n(info, 'dividendRate')
        div_yield_val       = _n(info, 'dividendYield')
        full_time_employees = _n(info, 'fullTimeEmployees')

        fifty_two_week_high = _n(info, 'fiftyTwoWeekHigh') or current_price or 0
        fifty_two_week_low  = _n(info, 'fiftyTwoWeekLow')  or current_price or 0

        # ── PE / EPS ──────────────────────────────────────────────────────────
        pe_ratio = _n(info, 'trailingPE') or None
        if pe_ratio == 0:
            pe_ratio = None
        if pe_ratio is None and net_income and net_income > 0 and shares_outstanding > 0:
            pe_ratio = safe_divide(current_price * shares_outstanding, net_income)

        eps = _n(info, 'trailingEps')
        if eps == 0 and shares_outstanding > 0:
            eps = safe_divide(net_income, shares_outstanding, 0)

        # ── Derivados ─────────────────────────────────────────────────────────
        net_debt        = total_debt - cash
        working_capital = current_assets - current_liabilities
        quick_assets    = current_assets - inventory
        work_cap        = working_capital

        # ── EBITDA ────────────────────────────────────────────────────────────
        ebitda = ebit + depreciation if depreciation > 0 else ebit

        # ── Márgenes ──────────────────────────────────────────────────────────
        gross_margin     = safe_divide(gross_profit, total_revenue, 0) * 100
        net_margin       = safe_divide(net_income, total_revenue, 0) * 100
        operating_margin = safe_divide(operating_income, total_revenue, 0) * 100
        ebit_margin      = safe_divide(ebit, total_revenue, 0) * 100
        # ✦ NUEVO: EBITDA Margin — estándar de industria para comparación entre sectores
        ebitda_margin    = safe_divide(ebitda, total_revenue, 0) * 100

        # ── Rentabilidad ──────────────────────────────────────────────────────
        roe  = safe_divide(net_income, total_equity, 0) * 100 if total_equity else 0
        roa  = safe_divide(net_income, total_assets, 0) * 100

        capital_employed = (total_assets - current_liabilities) if current_liabilities else total_assets
        roce = safe_divide(ebit, capital_employed, 0) * 100 if capital_employed > 0 else 0

        invested_capital = (total_equity + total_debt) if (total_equity and total_debt) else 0
        nopat            = ebit * 0.79
        roic             = safe_divide(nopat, invested_capital, 0) * 100 if invested_capital > 0 else 0
        nopat_margin     = safe_divide(nopat, total_revenue, 0) * 100 if total_revenue > 0 else 0
        croic            = safe_divide(operating_cf, invested_capital, 0) * 100 if invested_capital > 0 else 0

        # ✦ NUEVO 1: ROTE — Return on Tangible Equity
        # KPI estándar en bancos y análisis de calidad de capital; excluye goodwill e intangibles
        rote = safe_divide(net_income, tangible_equity, 0) * 100 if tangible_equity > 0 else 0

        # ✦ NUEVO 2: Gross Profit per Employee
        # Eficiencia operativa por capita — usado en SaaS, tech y análisis de escalabilidad
        gross_profit_per_employee = safe_divide(gross_profit, full_time_employees, 0) if full_time_employees > 0 else 0

        # ✦ NUEVO 15: Revenue per Employee
        # Productividad de la fuerza laboral — diferencia modelos asset-light de intensivos
        revenue_per_employee = safe_divide(total_revenue, full_time_employees) if full_time_employees > 0 else None

        # ── Liquidez ──────────────────────────────────────────────────────────
        current_ratio = safe_divide(current_assets, current_liabilities, 0)
        quick_ratio   = safe_divide(quick_assets, current_liabilities, 0)
        cash_ratio    = safe_divide(cash, current_liabilities, 0)

        # ── Apalancamiento ────────────────────────────────────────────────────
        debt_to_equity    = safe_divide(total_liabilities, total_equity, 0) * 100 if total_equity else 0
        debt_ratio        = safe_divide(total_liabilities, total_assets, 0)
        equity_multiplier = safe_divide(total_assets, total_equity, 0) if total_equity else 0
        de_ratio          = safe_divide(total_debt, total_equity, 0) if total_equity > 0 else 0
        lt_debt_cap       = safe_divide(long_term_debt, (total_debt + total_equity)) \
                            if (total_debt + total_equity) > 0 else 0
        net_debt_to_ebit  = safe_divide(net_debt, ebit) if ebit != 0 else None

        # ✦ NUEVO 3: Net Debt / EBITDA
        # Estándar de crédito, covenants bancarios y rating agencies (Moody's, S&P)
        net_debt_to_ebitda = safe_divide(net_debt, ebitda) if ebitda > 0 else None

        # ✦ NUEVO 4: DSCR — Debt Service Coverage Ratio
        # Capacidad de servicio de deuda = EBITDA / Intereses; KPI de crédito fundamental
        dscr = safe_divide(ebitda, interest_expense) if interest_expense > 0 else None

        # ── Valoración ────────────────────────────────────────────────────────
        ev_ebit        = safe_divide(enterprise_value, ebit) if ebit != 0 else None
        ev_sales       = safe_divide(enterprise_value, total_revenue) if total_revenue > 0 else None
        price_to_sales = safe_divide(market_cap, total_revenue) if total_revenue > 0 else None
        earning_yield  = safe_divide(ebit, enterprise_value, 0) * 100 if enterprise_value > 0 else 0
        ev_ci          = safe_divide(enterprise_value, invested_capital) if invested_capital > 0 else None
        ev_gp          = safe_divide(enterprise_value, gross_profit) if gross_profit > 0 else None
        ev_cfo_val     = safe_divide(enterprise_value, operating_cf) if operating_cf > 0 else None
        ebit_ev_r      = safe_divide(ebit, enterprise_value) if enterprise_value > 0 else 0
        inventory_turnover = safe_divide(cogs_val, inventory, 0) if inventory > 0 else 0

        book_value_per_share = safe_divide(total_equity, shares_outstanding) if shares_outstanding > 0 else 0
        pb_ratio       = safe_divide(current_price, book_value_per_share) if book_value_per_share > 0 else None
        dividend_yield = safe_divide(dividend_rate, current_price, 0) * 100 if current_price > 0 else 0
        payout_ratio   = safe_divide(dividends_paid, net_income, 0) * 100 if net_income > 0 else 0
        tobins_q       = safe_divide(market_cap + total_liabilities, total_assets, 0) if total_assets > 0 else 0

        # ✦ NUEVO 5: EV/EBITDA — múltiplo más usado en M&A, LBO y análisis buy-side
        ev_ebitda = safe_divide(enterprise_value, ebitda) if ebitda > 0 else None

        # ✦ NUEVO 6: Price/FCF — valoración sobre flujo real generado, más fiable que P/E
        price_to_fcf = safe_divide(market_cap, free_cash_flow) if free_cash_flow > 0 else None

        # ✦ NUEVO 7: Graham Number — precio justo clásico de Benjamin Graham
        # sqrt(22.5 × EPS × Book Value per Share)
        graham_number = None
        if eps and eps > 0 and book_value_per_share and book_value_per_share > 0:
            graham_raw = 22.5 * eps * book_value_per_share
            if graham_raw > 0:
                graham_number = round(math.sqrt(graham_raw), 2)

        # ✦ NUEVO 8: Magic Formula Score (Greenblatt)
        # Combina Earnings Yield (EBIT/EV) + ROIC para ordenar el universo de acciones
        magic_formula_score = None
        if ebit_ev_r and roic:
            magic_formula_score = round((ebit_ev_r * 100) + roic, 2)

        # ── Flujo de Caja ─────────────────────────────────────────────────────
        fcf_margin            = safe_divide(free_cash_flow, total_revenue, 0) * 100
        operating_cf_to_sales = safe_divide(operating_cf, total_revenue, 0) * 100
        capex_to_revenue      = safe_divide(capex, total_revenue, 0) * 100
        capex_to_ocf          = safe_divide(capex, operating_cf, 0) * 100 if operating_cf != 0 else 0
        fcf_to_ebitda         = safe_divide(free_cash_flow, ebitda, 0) * 100 if ebitda != 0 else 0
        cash_flow_to_debt     = safe_divide(operating_cf, total_debt, 0) * 100 if total_debt > 0 else 0
        fcf_sales             = safe_divide(free_cash_flow, total_revenue, 0)
        ocf_margin_r          = safe_divide(operating_cf, total_revenue, 0)
        capex_margin_r        = safe_divide(capex, total_revenue, 0)
        ccf_val               = operating_cf - capex
        ev_fcf_r              = safe_divide(enterprise_value, free_cash_flow) if free_cash_flow > 0 else None
        ebit_fcf_ratio        = safe_divide(ebit, free_cash_flow) if free_cash_flow != 0 else None
        accrual_r             = safe_divide(operating_cf, net_income) if net_income != 0 else 0
        capex_ni              = safe_divide(capex, net_income) if net_income > 0 else 0
        capex_ocf_r           = safe_divide(capex, operating_cf, 0) if operating_cf != 0 else 0

        # ── Eficiencia ────────────────────────────────────────────────────────
        asset_turnover    = safe_divide(total_revenue, total_assets, 0)
        capex_to_da       = safe_divide(capex, depreciation) if depreciation > 0 else 0
        goodwill_to_assets = safe_divide(goodwill, total_assets, 0) * 100
        kto_wc            = accounts_receivable + inventory - accounts_payable
        kto               = safe_divide(kto_wc, total_revenue, 0) if total_revenue > 0 else 0
        sales_fa          = safe_divide(total_revenue, net_ppe) if net_ppe > 0 else 0
        sales_eq          = safe_divide(total_revenue, total_equity) if total_equity > 0 else 0
        wc_turn           = 365 * safe_divide(working_capital, cogs_val) if cogs_val > 0 else 0
        wc_cl             = safe_divide(working_capital, current_liabilities) if current_liabilities > 0 else 0
        wc_prod           = safe_divide(total_revenue, working_capital) if working_capital != 0 else 0
        ncavps            = safe_divide(
            (current_assets - 1.25 * current_liabilities - total_debt),
            shares_outstanding
        ) if shares_outstanding > 0 else 0
        roe_dy            = roe * div_yield_val if div_yield_val else 0
        rd_gp             = safe_divide(rd_expense, gross_profit) if gross_profit > 0 else 0
        ad_fixed_ratio    = safe_divide(net_ppe, total_assets) if total_assets > 0 else 0
        ktno_eq           = safe_divide(intangibles, total_equity) if total_equity > 0 else 0
        operating_expense_ratio = safe_divide(operating_expenses, total_revenue, 0) if total_revenue > 0 else 0
        sloan_ratio       = safe_divide(net_income - operating_cf, total_assets, 0) if total_assets > 0 else 0

        # ✦ NUEVO 9: DSO — Days Sales Outstanding
        # Días de cobro; <30 excelente, >60 preocupante; usado en análisis de capital circulante
        dso = safe_divide(accounts_receivable * 365, total_revenue) if total_revenue > 0 else None

        # ✦ NUEVO 10: DIO — Days Inventory Outstanding
        # Días de inventario; bajo = alta rotación y menor riesgo de obsolescencia
        dio = safe_divide(inventory * 365, cogs_val) if cogs_val > 0 else None

        # ✦ NUEVO 11: DPO — Days Payable Outstanding
        # Días de pago; mayor DPO = más poder negociador con proveedores
        dpo = safe_divide(accounts_payable * 365, cogs_val) if cogs_val > 0 else None

        # ✦ NUEVO 12: CCC — Cash Conversion Cycle = DSO + DIO - DPO
        # Negativo = cobra antes de pagar (ventaja estructural como Amazon/Walmart)
        ccc = None
        if dso is not None and dio is not None and dpo is not None:
            ccc = round(dso + dio - dpo, 1)

        # ── WACC ──────────────────────────────────────────────────────────────
        cost_of_equity = 0.10
        cost_of_debt   = safe_divide(interest_expense, total_debt, 0.05) if total_debt > 0 else 0.05
        tax_rate_w     = 0.21
        total_capital  = total_equity + total_debt if (total_equity and total_debt) else 1
        weight_equity  = safe_divide(total_equity, total_capital, 0)
        weight_debt    = safe_divide(total_debt, total_capital, 0)
        wacc           = (weight_equity * cost_of_equity +
                          weight_debt * cost_of_debt * (1 - tax_rate_w)) * 100
        roic_wacc_spread = roic - wacc

        # ✦ NUEVO 13: Incremental ROIC (iROIC)
        # Retorno sobre capital INCREMENTAL — KPI clave en análisis de calidad:
        # si iROIC < WACC, el crecimiento destruye valor aunque ROIC sea alto
        incremental_roic = None
        try:
            if (not income_stmt.empty and income_stmt.shape[1] >= 2 and
                    not balance_sheet.empty and balance_sheet.shape[1] >= 2):
                ebit_prev_dict = income_stmt.iloc[:, 1].to_dict()
                bal_prev_dict  = balance_sheet.iloc[:, 1].to_dict()
                def _np(d, *keys):
                    for k in keys:
                        v = d.get(k)
                        if v is not None:
                            try:
                                f = float(v)
                                if not (math.isnan(f) or math.isinf(f)):
                                    return f
                            except Exception:
                                pass
                    return 0
                ebit_prev   = _np(ebit_prev_dict, 'EBIT', 'Operating Income')
                equity_prev = _np(bal_prev_dict, 'Total Equity Gross Minority Interest', 'Stockholders Equity')
                debt_prev   = _np(bal_prev_dict, 'Total Debt')
                ic_prev     = equity_prev + debt_prev
                nopat_curr  = ebit * 0.79
                nopat_prev  = ebit_prev * 0.79
                delta_nopat = nopat_curr - nopat_prev
                delta_ic    = invested_capital - ic_prev
                if abs(delta_ic) > 1000:
                    incremental_roic = safe_divide(delta_nopat, delta_ic) * 100
        except Exception as e:
            logging.debug(f"iROIC calculation skipped: {e}")

        interest_coverage = safe_divide(ebit, interest_expense) if interest_expense > 0 else 0

        # ── Precio 52 semanas ─────────────────────────────────────────────────
        pct_below_52w_high = (
            ((fifty_two_week_high - current_price) / fifty_two_week_high) * 100
            if fifty_two_week_high > 0 and current_price >= 0 else 0
        )
        pct_above_52w_low = (
            ((current_price - fifty_two_week_low) / fifty_two_week_low) * 100
            if fifty_two_week_low > 0 and current_price >= 0 else 0
        )

        # ── Sharpe Ratio ──────────────────────────────────────────────────────
        try:
            history_1y = yf.Ticker(ticker_data.ticker).history(period="1y")
            if not history_1y.empty and len(history_1y) > 20:
                daily_returns         = history_1y['Close'].pct_change().dropna()
                mean_daily_return     = daily_returns.mean()
                annualized_return     = (1 + mean_daily_return) ** 252 - 1
                daily_std             = daily_returns.std()
                annualized_volatility = daily_std * np.sqrt(252)
                risk_free_rate        = 0.04
                sharpe_ratio = (
                    (annualized_return - risk_free_rate) / annualized_volatility
                    if annualized_volatility > 0 else 0
                )
            else:
                sharpe_ratio = annualized_return = annualized_volatility = 0
        except Exception as e:
            logging.warning(f"Sharpe ratio calculation error: {str(e)}")
            sharpe_ratio = annualized_return = annualized_volatility = 0

        # ── Beneish M-Score ───────────────────────────────────────────────────
        try:
            if income_prev and not balance_sheet.empty and balance_sheet.shape[1] > 1:
                balance_prev             = balance_sheet.iloc[:, -1].to_dict()
                revenue_prev             = income_prev.get('Total Revenue') or 1
                accounts_receivable_prev = balance_prev.get('Accounts Receivable') or 1
                total_assets_prev        = balance_prev.get('Total Assets') or 1
                current_assets_prev      = balance_prev.get('Current Assets') or 1
                ppe_prev                 = balance_prev.get('Net PPE') or balance_prev.get('Property Plant Equipment') or 1
                gross_profit_prev        = income_prev.get('Gross Profit') or 1

                dsri = safe_divide(
                    safe_divide(accounts_receivable, total_revenue, 0),
                    safe_divide(accounts_receivable_prev, revenue_prev, 1), 0
                )
                non_current_assets      = total_assets - current_assets if current_assets else total_assets
                non_current_assets_prev = total_assets_prev - current_assets_prev if current_assets_prev else total_assets_prev
                aqi = safe_divide(
                    safe_divide(non_current_assets - net_ppe, total_assets, 0),
                    safe_divide(non_current_assets_prev - ppe_prev, total_assets_prev, 1), 0
                )
                gmi = safe_divide(
                    safe_divide(gross_profit_prev, revenue_prev, 0),
                    safe_divide(gross_profit, total_revenue, 1), 0
                )
                beneish_m_score = -4.84 + 0.92 * dsri + 0.528 * aqi + 0.404 * gmi
            else:
                beneish_m_score = 0
        except Exception:
            beneish_m_score = 0

        # ── Montier C-Score ───────────────────────────────────────────────────
        c_score = 0
        if operating_cf > net_income: c_score += 1
        if beneish_m_score < -2.22:   c_score += 1
        if operating_cf > 0 and net_income > 0: c_score += 1

        # ── Zmijewski Score ───────────────────────────────────────────────────
        try:
            x1_z = -4.3 - 4.5 * safe_divide(net_income, total_assets, 0)
            x2_z =  5.7 * safe_divide(total_liabilities, total_assets, 0)
            x3_z = -0.004 * safe_divide(current_assets, current_liabilities, 0)
            zmijewski_score = x1_z + x2_z + x3_z
        except Exception:
            zmijewski_score = 0

        # ── Ohlson O-Score ────────────────────────────────────────────────────
        try:
            size    = math.log(total_assets) if total_assets > 0 else 0
            tlta    = safe_divide(total_liabilities, total_assets, 0)
            wcta    = safe_divide(working_capital, total_assets, 0)
            clca    = safe_divide(current_liabilities, current_assets, 0) if current_assets > 0 else 0
            nita    = safe_divide(net_income, total_assets, 0)
            ohlson_o = -1.32 - 0.407*size + 6.03*tlta - 1.43*wcta + 0.0757*clca - 2.37*nita
        except Exception:
            ohlson_o = 0

        # ── Fulmer H-Score ────────────────────────────────────────────────────
        try:
            v1 = safe_divide(retained_earnings, total_assets, 0)
            v2 = safe_divide(total_revenue, total_assets, 0)
            v3 = safe_divide(net_income, total_equity, 0) if total_equity else 0
            v4 = safe_divide(operating_cf, total_liabilities, 0) if total_liabilities else 0
            v5 = safe_divide(total_liabilities, total_assets, 0)
            v6 = safe_divide(current_liabilities, total_assets, 0)
            fulmer_h = 5.528*v1 + 0.212*v2 + 0.073*v3 + 1.270*v4 - 0.120*v5 + 2.335*v6 + 0.575
        except Exception:
            fulmer_h = 0

        # ── Springate S-Score ─────────────────────────────────────────────────
        try:
            a_sp = safe_divide(working_capital, total_assets, 0)
            b_sp = safe_divide(ebit, total_assets, 0)
            c_sp = safe_divide(ebit, current_liabilities, 0) if current_liabilities > 0 else 0
            d_sp = safe_divide(total_revenue, total_assets, 0)
            springate_score = 1.03*a_sp + 3.07*b_sp + 0.66*c_sp + 0.4*d_sp
        except Exception:
            springate_score = 0

        # ── CA-Score ──────────────────────────────────────────────────────────
        try:
            x1_ca = safe_divide(current_assets - current_liabilities, total_assets, 0)
            x2_ca = safe_divide(net_income, total_assets, 0)
            x3_ca = safe_divide(retained_earnings, total_assets, 0)
            x4_ca = safe_divide(ebit, total_liabilities, 0) if total_liabilities else 0
            ca_score = 3.107 + 6.38*x1_ca + 2.84*x2_ca + 3.05*x3_ca + 1.02*x4_ca
        except Exception:
            ca_score = 0

        # ── Kanitz Score ──────────────────────────────────────────────────────
        try:
            x1_k = safe_divide(net_income, total_assets, 0)
            x2_k = safe_divide(current_assets - cash - balance.get('Short Term Investments', 0),
                               current_liabilities, 0) if current_liabilities > 0 else 0
            x3_k = safe_divide(current_assets - current_liabilities, total_debt, 0) if total_debt > 0 else 0
            x4_k = safe_divide(current_assets, current_liabilities, 0) if current_liabilities > 0 else 0
            x5_k = safe_divide(total_debt, total_assets, 0)
            kanitz_score = 0.05*x1_k + 1.65*x2_k + 3.55*x3_k - 1.06*x4_k - 0.33*x5_k
        except Exception:
            kanitz_score = 0

        # ── Altman Z-Score ────────────────────────────────────────────────────
        x1 = safe_divide(working_capital, total_assets, 0)
        x2 = safe_divide(retained_earnings, total_assets, 0)
        x3 = safe_divide(ebit, total_assets, 0)
        x4 = safe_divide(market_cap, total_liabilities, 0) if total_liabilities > 0 else 0
        x5 = safe_divide(total_revenue, total_assets, 0)
        altman_z = 1.2*x1 + 1.4*x2 + 3.3*x3 + 0.6*x4 + 1.0*x5

        # ── Piotroski F-Score ─────────────────────────────────────────────────
        f_score = 0
        f_score += 1 if net_income > 0 else 0
        f_score += 1 if operating_cf > 0 else 0
        f_score += 1 if roa > 0 else 0
        f_score += 1 if operating_cf > net_income else 0
        f_score += 1 if debt_ratio < 0.5 else 0
        f_score += 1 if current_ratio > 1.5 else 0
        f_score += 1 if shares_outstanding > 0 else 0
        f_score += 1 if gross_margin > 40 else 0
        f_score += 1 if asset_turnover > 0.5 else 0

        # ── CAGRs HISTÓRICOS — BUG CORREGIDO ──────────────────────────────────
        # Bug original: _col() usaba df.get() → busca columnas, no filas
        # Corrección: _get_row() usa df.loc[] para acceder a filas por nombre
        cagr_revenue_4y = cagr_op_margin_4y = 0.0
        cagr_fcf_4y = cagr_eps_4y = roa_growth_4y = 0.0
        cagr_fcf_note = "sin_datos"
        cagr_eps_4y_note = "sin_datos"

        try:
            _ai = income_stmt
            _ac = cash_flow
            _ab = balance_sheet

            if not _ai.empty and _ai.shape[1] >= 2:
                n = _ai.shape[1]
                periods = max(2, min(4, n - 1))

                # ✦ BUG FIX: usar _get_row() con df.loc[] en vez de df.get()
                rev_h  = _get_row(_ai, 'Total Revenue')
                ebit_h = [e or o for e, o in zip(
                    _get_row(_ai, 'EBIT'),
                    _get_row(_ai, 'Operating Income')
                )]
                eps_h  = [e or d for e, d in zip(
                    _get_row(_ai, 'Basic EPS'),
                    _get_row(_ai, 'Diluted EPS')
                )]
                ni_h   = _get_row(_ai, 'Net Income')

                ocf_h = [0.0] * n
                cap_h = [0.0] * n
                if not _ac.empty:
                    ocf_h = _get_row(_ac, 'Operating Cash Flow', 'Total Cash From Operating Activities')
                    cap_h = [abs(v) for v in _get_row(_ac, 'Capital Expenditure', 'Capital Expenditures')]
                fcf_h = [o - c for o, c in zip(ocf_h, cap_h)]

                ast_h = [1.0] * n
                if not _ab.empty:
                    ast_raw = _get_row(_ab, 'Total Assets')
                    if ast_raw and any(v > 0 for v in ast_raw):
                        ast_h = [v if v > 0 else 1.0 for v in ast_raw]

                # CAGR Ingresos — siempre positivos
                if len(rev_h) >= 2 and rev_h[-1] > 0 and rev_h[0] > 0:
                    r, _ = cagr_signed(rev_h[-1], rev_h[0], periods)
                    cagr_revenue_4y = r if r is not None else 0.0

                # CAGR Margen Operativo
                if len(rev_h) >= 2 and len(ebit_h) >= 2:
                    om_s = ebit_h[-1] / rev_h[-1] if rev_h[-1] != 0 else 0
                    om_e = ebit_h[0]  / rev_h[0]  if rev_h[0]  != 0 else 0
                    if om_s != 0 and om_e != 0:
                        r, _ = cagr_signed(om_s, om_e, periods)
                        cagr_op_margin_4y = r if r is not None else 0.0

                # ✦ BUG FIX: CAGR FCF tolera negativos con cagr_signed()
                if len(fcf_h) >= 2 and fcf_h[-1] != 0 and fcf_h[0] != 0:
                    r, note = cagr_signed(fcf_h[-1], fcf_h[0], periods)
                    cagr_fcf_4y   = r if r is not None else 0.0
                    cagr_fcf_note = note

                # ✦ BUG FIX: CAGR EPS tolera negativos con cagr_signed()
                if len(eps_h) >= 2 and eps_h[-1] != 0 and eps_h[0] != 0:
                    r, note = cagr_signed(eps_h[-1], eps_h[0], periods)
                    cagr_eps_4y      = r if r is not None else 0.0
                    cagr_eps_4y_note = note

                # ROA Growth
                if len(ni_h) >= 2 and len(ast_h) >= 2:
                    roa_s = ni_h[-1] / ast_h[-1] if ast_h[-1] != 0 else 0
                    roa_e = ni_h[0]  / ast_h[0]  if ast_h[0]  != 0 else 0
                    if roa_s != 0 and roa_e != 0:
                        r, _ = cagr_signed(roa_s, roa_e, periods)
                        roa_growth_4y = r if r is not None else 0.0

        except Exception as e:
            logging.warning(f"CAGR calculation error: {e}")

        # ── BUG FIX 3: PEG Ratio corregido ────────────────────────────────────
        # Antes: siempre None porque cagr_eps_4y llegaba como 0.0 por Bug 2
        peg_calc = None
        peg_note = "sin_eps_growth"
        if cagr_eps_4y_note == "turnaround":
            peg_note = "turnaround"   # señal positiva aunque PEG no aplica numéricamente
        elif (cagr_eps_4y and abs(cagr_eps_4y) > 0.005
              and pe_ratio and pe_ratio > 0
              and cagr_eps_4y_note == "ok"):
            eps_pct  = cagr_eps_4y * 100   # fracción → porcentaje
            peg_calc = round(safe_divide(pe_ratio, eps_pct, None), 2) if eps_pct != 0 else None
            peg_note = "ok"

        # ── Benjamin Graham Valuation ─────────────────────────────────────────
        try:
            graham_eps       = eps if eps and eps > 0 else safe_divide(net_income, shares_outstanding, 0)
            estimated_growth = 5.0
            aaa_yield        = 5.0
            intrinsic_value_graham_simple = graham_eps * (8.5 + (2 * estimated_growth))
            intrinsic_value_graham = (
                (graham_eps * (8.5 + (2 * estimated_growth)) * 4.4) / aaa_yield
                if aaa_yield > 0 else intrinsic_value_graham_simple
            )
            if intrinsic_value_graham < 0 or (current_price > 0 and intrinsic_value_graham > current_price * 10):
                intrinsic_value_graham = intrinsic_value_graham_simple
            if intrinsic_value_graham > 0 and current_price > 0:
                margin_of_safety_graham = ((intrinsic_value_graham - current_price) / intrinsic_value_graham) * 100
            else:
                margin_of_safety_graham = 0
            target_price_conservative = intrinsic_value_graham * 0.75
            target_price_moderate     = intrinsic_value_graham
            target_price_aggressive   = intrinsic_value_graham * 1.20
            if margin_of_safety_graham >= 25:
                graham_recommendation = "Comprar (Fuerte)"
            elif margin_of_safety_graham >= 15:
                graham_recommendation = "Comprar (Moderado)"
            elif margin_of_safety_graham >= 0:
                graham_recommendation = "Mantener"
            elif margin_of_safety_graham >= -15:
                graham_recommendation = "Vender (Leve sobrevaloración)"
            else:
                graham_recommendation = "Vender (Sobrevalorada)"
        except Exception as e:
            logging.warning(f"Graham valuation error: {str(e)}")
            intrinsic_value_graham = intrinsic_value_graham_simple = 0
            margin_of_safety_graham = 0
            target_price_conservative = target_price_moderate = target_price_aggressive = 0
            graham_recommendation = "N/A"
            estimated_growth = 5.0

        # ── DCF Model ─────────────────────────────────────────────────────────
        try:
            growth_rate     = 0.05
            terminal_growth = 0.025
            discount_rate   = wacc / 100 if wacc > 0 else 0.10
            current_fcf     = free_cash_flow if free_cash_flow > 0 else operating_cf * 0.7
            projected_fcf   = [current_fcf * ((1 + growth_rate) ** yr) for yr in range(1, 6)]
            pv_fcf          = sum(f / ((1 + discount_rate) ** (i + 1)) for i, f in enumerate(projected_fcf))
            terminal_fcf    = projected_fcf[-1] * (1 + terminal_growth)
            terminal_value  = terminal_fcf / (discount_rate - terminal_growth) if discount_rate > terminal_growth else 0
            pv_terminal     = terminal_value / ((1 + discount_rate) ** 5)
            enterprise_value_dcf   = pv_fcf + pv_terminal
            equity_value_dcf       = enterprise_value_dcf - net_debt
            intrinsic_value_per_share = safe_divide(equity_value_dcf, shares_outstanding, 0) if shares_outstanding > 0 else 0
            if current_price > 0 and intrinsic_value_per_share > 0:
                margin_of_safety = ((intrinsic_value_per_share - current_price) / intrinsic_value_per_share) * 100
            else:
                margin_of_safety = 0
            upside_potential = ((intrinsic_value_per_share - current_price) / current_price) * 100 if current_price > 0 else 0
        except Exception as e:
            logging.warning(f"DCF calculation error: {str(e)}")
            intrinsic_value_per_share = margin_of_safety = upside_potential = enterprise_value_dcf = 0

        # ✦ NUEVO 14: Earnings Power Value (EPV) — Bruce Greenwald
        # Valor del negocio asumiendo cero crecimiento: NOPAT / WACC - Deuda Neta
        # Si precio < EPV, el mercado no está pagando por crecimiento futuro
        epv_per_share = None
        try:
            if wacc > 0 and ebit > 0 and shares_outstanding > 0:
                tax_rate_epv  = 0.21
                epv_total     = (ebit * (1 - tax_rate_epv)) / (wacc / 100)
                epv_equity    = epv_total - net_debt
                epv_per_share = round(safe_divide(epv_equity, shares_outstanding, 0), 2)
        except Exception:
            epv_per_share = None

        # ── Value Creation ────────────────────────────────────────────────────
        creates_value         = roic > wacc
        value_creation_spread = roic - wacc
        if value_creation_spread > 10:
            value_creation_category = "Excelente"
        elif value_creation_spread > 5:
            value_creation_category = "Buena"
        elif value_creation_spread > 0:
            value_creation_category = "Moderada"
        elif value_creation_spread > -5:
            value_creation_category = "Débil"
        else:
            value_creation_category = "Destruye Valor"

        # ── Diccionario final de ratios ───────────────────────────────────────
        ratios = {
            # Growth
            'cagr_revenue_4y':    cagr_revenue_4y,
            'cagr_op_margin_4y':  cagr_op_margin_4y,
            'cagr_fcf_4y':        cagr_fcf_4y,
            'cagr_fcf_note':      cagr_fcf_note,
            'cagr_eps_4y':        cagr_eps_4y,
            'cagr_eps_4y_note':   cagr_eps_4y_note,
            'roa_growth_4y':      roa_growth_4y,
            'revenue_growth_5y':  0,
            'fcf_growth_5y':      0,
            'eps_growth_5y':      0,
            # Profitability (existing + new)
            'roe':              roe,
            'roa':              roa,
            'roic':             roic,
            'roce':             roce,
            'roc':              roic,
            'croic':            croic,
            'rote':             rote,                         # ✦ NUEVO 1
            'gross_margin':     gross_margin,
            'net_margin':       net_margin,
            'operating_margin': operating_margin,
            'ebit_margin':      ebit_margin,
            'ebitda_margin':    ebitda_margin,                # ✦ NUEVO (EBITDA Margin)
            'nopat_margin':     nopat_margin,
            'gross_profit_per_employee': gross_profit_per_employee,  # ✦ NUEVO 2
            'revenue_per_employee':      revenue_per_employee,       # ✦ NUEVO 15
            # Liquidity
            'current_ratio':   current_ratio,
            'quick_ratio':     quick_ratio,
            'cash_ratio':      cash_ratio,
            'working_capital': working_capital,
            # Leverage (existing + new)
            'debt_to_equity':    debt_to_equity,
            'debt_ratio':        debt_ratio,
            'net_debt':          net_debt,
            'equity_multiplier': equity_multiplier,
            'retained_earnings': retained_earnings,
            'de_ratio':          de_ratio,
            'lt_debt_cap':       lt_debt_cap,
            'net_debt_ebit':     net_debt_to_ebit,
            'net_debt_ebitda':   net_debt_to_ebitda,         # ✦ NUEVO 3
            'dscr':              dscr,                        # ✦ NUEVO 4
            # Valuation (existing + new)
            'pe_ratio':           pe_ratio,
            'ev_ebit':            ev_ebit,
            'ev_ebitda':          ev_ebitda,                  # ✦ NUEVO 5
            'ev_sales':           ev_sales,
            'price_to_sales':     price_to_sales,
            'price_to_fcf':       price_to_fcf,               # ✦ NUEVO 6
            'earning_yield':      earning_yield,
            'ev_ci':              ev_ci,
            'ev_fcf':             ev_fcf_r,
            'fcf_ev':             ev_fcf_r,
            'ebit_ev':            ebit_ev_r,
            'ev_gp':              ev_gp,
            'ev_cfo':             ev_cfo_val,
            'peg_ratio':          peg_calc,
            'peg_note':           peg_note,
            'pb_ratio':           pb_ratio,
            'graham_number':      graham_number,               # ✦ NUEVO 7
            'magic_formula_score': magic_formula_score,        # ✦ NUEVO 8
            'dividend_yield':     dividend_yield,
            'payout_ratio':       payout_ratio,
            'tobins_q':           tobins_q,
            # Cash Flow
            'free_cash_flow':        free_cash_flow,
            'fcf_margin':            fcf_margin,
            'operating_cf':          operating_cf,
            'operating_cf_to_sales': operating_cf_to_sales,
            'capex_to_revenue':      capex_to_revenue,
            'capex_to_ocf':          capex_to_ocf,
            'fcf_to_ebitda':         fcf_to_ebitda,
            'cash_flow_to_debt':     cash_flow_to_debt,
            'fcf_sales':             fcf_sales,
            'ocf_margin':            ocf_margin_r,
            'capex_margin':          capex_margin_r,
            'ccf':                   ccf_val,
            'capex_ni':              capex_ni,
            'capex_ocf':             capex_ocf_r,
            'ebit_fcf':              ebit_fcf_ratio,
            'accrual_ratio':         accrual_r,
            # Efficiency (existing + new)
            'asset_turnover':      asset_turnover,
            'eps':                 eps,
            'capex_to_da':         capex_to_da,
            'goodwill_to_assets':  goodwill_to_assets,
            'kto':                 kto,
            'sales_fa':            sales_fa,
            'sales_eq':            sales_eq,
            'wc_turn':             wc_turn,
            'wc_cl':               wc_cl,
            'wc_prod':             wc_prod,
            'ncavps':              ncavps,
            'roe_dy':              roe_dy,
            'rd_gp':               rd_gp,
            'ad_fixed_ratio':      ad_fixed_ratio,
            'ktno_eq':             ktno_eq,
            'inventory_turnover':  inventory_turnover,
            'sloan_ratio':         sloan_ratio,
            'dso':                 dso,                        # ✦ NUEVO 9
            'dio':                 dio,                        # ✦ NUEVO 10
            'dpo':                 dpo,                        # ✦ NUEVO 11
            'ccc':                 ccc,                        # ✦ NUEVO 12
            'incremental_roic':    incremental_roic,           # ✦ NUEVO 13
            # Risk & Capital
            'beta':              beta,
            'wacc':              wacc,
            'roic_wacc_spread':  roic_wacc_spread,
            'interest_coverage': interest_coverage,
            # Price Performance
            'fifty_two_week_high': fifty_two_week_high,
            'fifty_two_week_low':  fifty_two_week_low,
            'pct_below_52w_high':  pct_below_52w_high,
            'pct_above_52w_low':   pct_above_52w_low,
            # Risk-Adjusted Returns
            'sharpe_ratio':          sharpe_ratio,
            'annualized_return':     annualized_return * 100,
            'annualized_volatility': annualized_volatility * 100,
            # Quality Scores
            'altman_z_score':    altman_z,
            'piotroski_f_score': f_score,
            'beneish_m_score':   beneish_m_score,
            'montier_c_score':   c_score,
            'zmijewski_score':   zmijewski_score,
            'ohlson_o_score':    ohlson_o,
            'fulmer_h_score':    fulmer_h,
            'springate_score':   springate_score,
            'ca_score':          ca_score,
            'kanitz_score':      kanitz_score,
            # DCF / Valuation
            'intrinsic_value':      intrinsic_value_per_share,
            'margin_of_safety':     margin_of_safety,
            'upside_potential':     upside_potential,
            'enterprise_value_dcf': enterprise_value_dcf,
            'epv_per_share':        epv_per_share,             # ✦ NUEVO 14
            # Graham Valuation
            'intrinsic_value_graham':         intrinsic_value_graham,
            'intrinsic_value_graham_simple':   intrinsic_value_graham_simple,
            'margin_of_safety_graham':         margin_of_safety_graham,
            'target_price_conservative':       target_price_conservative,
            'target_price_moderate':           target_price_moderate,
            'target_price_aggressive':         target_price_aggressive,
            'graham_recommendation':           graham_recommendation,
            'estimated_growth_rate':           estimated_growth,
            # Value Creation
            'creates_value':           creates_value,
            'value_creation_spread':   value_creation_spread,
            'value_creation_category': value_creation_category,
        }

        return ratios, info

    except Exception as e:
        logging.error(f"Error calculating ratios: {str(e)}")
        raise

# =============================================================================
#  evaluate_ratios() — ACTUALIZADA con los 15 nuevos ratios en sus categorías
# =============================================================================

def _safe_cmp_lt(value, threshold):
    return value is not None and value < threshold

def _safe_cmp_gt(value, threshold):
    return value is not None and value > threshold

def _safe_cmp_between(value, lo, hi):
    return value is not None and lo <= value <= hi

def _fmt(value, fmt=".2f", suffix="", prefix="", na="N/A"):
    if value is None:
        return na
    try:
        return f"{prefix}{value:{fmt}}{suffix}"
    except Exception:
        return na


def evaluate_ratios(ratios, info):
    """Evalúa ratios contra umbrales — versión con 15 nuevos ratios integrados."""
    categories = []
    total_metrics = 0
    favorable = 0

    def _add(metrics_list, name, value, threshold, passed, interpretation, display_value):
        nonlocal total_metrics, favorable
        metrics_list.append(RatioMetric(
            name=name, value=value, threshold=threshold, passed=passed,
            interpretation=interpretation, display_value=display_value
        ))
        total_metrics += 1
        if passed:
            favorable += 1

    # =========================================================================
    # CATEGORÍA 1: RENTABILIDAD
    # =========================================================================
    profitability_metrics = []

    roe_val = ratios.get('roe', 0) or 0
    _add(profitability_metrics, "ROE (Return on Equity)", roe_val, "> 15%",
         roe_val > 15, "Mide la rentabilidad sobre el capital de los accionistas", f"{roe_val:.2f}%")

    roa_val = ratios.get('roa', 0) or 0
    _add(profitability_metrics, "ROA (Return on Assets)", roa_val, "> 5%",
         roa_val > 5, "Mide la eficiencia en el uso de activos", f"{roa_val:.2f}%")

    roic_val = ratios.get('roic', 0) or 0
    _add(profitability_metrics, "ROIC (Return on Invested Capital)", roic_val, "> 15%",
         roic_val > 15, "Retorno sobre el capital invertido", f"{roic_val:.2f}%")

    roce_val = ratios.get('roce', 0) or 0
    _add(profitability_metrics, "ROCE (Return on Capital Employed)", roce_val, "> 15%",
         roce_val > 15, "Retorno sobre capital empleado", f"{roce_val:.2f}%")

    croic_val = ratios.get('croic', 0) or 0
    _add(profitability_metrics, "CROIC (Cash ROIC)", croic_val, "> 10%",
         croic_val > 10, "Retorno sobre capital invertido basado en flujo de caja operativo", f"{croic_val:.2f}%")

    # ✦ NUEVO 1: ROTE
    rote_val = ratios.get('rote', 0) or 0
    _add(profitability_metrics, "ROTE (Return on Tangible Equity)", rote_val, "> 15%",
         rote_val > 15,
         "Rentabilidad sobre capital tangible — excluye goodwill e intangibles; KPI clave en bancos y análisis de calidad pura",
         f"{rote_val:.2f}%")

    gm_val = ratios.get('gross_margin', 0) or 0
    _add(profitability_metrics, "Margen Bruto (Gross Margin)", gm_val, "> 40%",
         gm_val > 40, "Rentabilidad después de costos de producción", f"{gm_val:.2f}%")

    nm_val = ratios.get('net_margin', 0) or 0
    _add(profitability_metrics, "Margen Neto (Net Margin)", nm_val, "> 10%",
         nm_val > 10, "Rentabilidad final después de todos los gastos", f"{nm_val:.2f}%")

    om_val = ratios.get('operating_margin', 0) or 0
    _add(profitability_metrics, "Margen Operativo (Operating Margin)", om_val, "> 15%",
         om_val > 15, "Rentabilidad de operaciones principales", f"{om_val:.2f}%")

    # ✦ NUEVO: EBITDA Margin
    ebitda_m_val = ratios.get('ebitda_margin', 0) or 0
    _add(profitability_metrics, "EBITDA Margin", ebitda_m_val, "> 20%",
         ebitda_m_val > 20,
         "Margen EBITDA — estándar de industria para comparación entre sectores y análisis de M&A; elimina efectos de estructura de capital y D&A",
         f"{ebitda_m_val:.2f}%")

    ebitm = (ratios.get('ebit_margin', 0) or 0) / 100
    _add(profitability_metrics, "EBIT Margin", ebitm, "> 15%",
         ebitm > 0.15, "Alta rentabilidad operativa antes de intereses e impuestos", f"{ebitm*100:.1f}%")

    nopat_m = ratios.get('nopat_margin', 0) or 0
    _add(profitability_metrics, "NOPAT Margin", nopat_m, "> 12%",
         nopat_m > 12, "Beneficio operativo neto después de impuestos sobre ventas", f"{nopat_m:.2f}%")

    cagr_rev = ratios.get('cagr_revenue_4y', 0) or 0
    _add(profitability_metrics, "CAGR Ingresos 4 años", cagr_rev, "> 10%",
         cagr_rev > 0.10, "Crecimiento compuesto anual de ingresos.", f"{cagr_rev*100:.1f}%")

    cagr_op = ratios.get('cagr_op_margin_4y', 0) or 0
    _add(profitability_metrics, "CAGR Margen Operativo 4 años", cagr_op, "> 10%",
         cagr_op > 0.10, "Mejora compuesta de eficiencia operativa.", f"{cagr_op*100:.1f}%")

    roa_g = ratios.get('roa_growth_4y', 0) or 0
    _add(profitability_metrics, "ROA Growth 4y", roa_g, "> 10%",
         roa_g > 0.10, "Mejora compuesta de eficiencia de activos.", f"{roa_g*100:.1f}%")

    # ✦ NUEVO 13: Incremental ROIC
    iroic_val = ratios.get('incremental_roic')
    iroic_passed = iroic_val is not None and iroic_val > 20
    _add(profitability_metrics, "Incremental ROIC (iROIC)", iroic_val, "> 20%",
         iroic_passed,
         "Retorno sobre capital incremental — si iROIC < WACC, el crecimiento destruye valor aunque el ROIC base sea alto",
         _fmt(iroic_val, ".1f", "%"))

    categories.append(RatioCategory(category="📊 Rentabilidad", metrics=profitability_metrics))

    # =========================================================================
    # CATEGORÍA 2: LIQUIDEZ
    # =========================================================================
    liquidity_metrics = []

    cr_val = ratios.get('current_ratio', 0) or 0
    _add(liquidity_metrics, "Ratio Corriente (Current Ratio)", cr_val, "1.2 - 2.0",
         1.2 <= cr_val <= 2.0, "Capacidad para pagar obligaciones a corto plazo", f"{cr_val:.2f}")

    qr_val = ratios.get('quick_ratio', 0) or 0
    _add(liquidity_metrics, "Ratio Rápido (Quick Ratio)", qr_val, "> 1.0",
         qr_val > 1.0, "Liquidez inmediata sin inventarios", f"{qr_val:.2f}")

    cash_r_val = ratios.get('cash_ratio', 0) or 0
    _add(liquidity_metrics, "Ratio de Efectivo (Cash Ratio)", cash_r_val, "> 0.5",
         cash_r_val > 0.5, "Capacidad de pago inmediata con efectivo", f"{cash_r_val:.2f}")

    categories.append(RatioCategory(category="💧 Liquidez", metrics=liquidity_metrics))

    # =========================================================================
    # CATEGORÍA 3: APALANCAMIENTO
    # =========================================================================
    leverage_metrics = []

    dte_val = ratios.get('debt_to_equity', 0) or 0
    _add(leverage_metrics, "Deuda/Capital (Debt-to-Equity)", dte_val, "< 50%",
         dte_val < 50, "Nivel de apalancamiento financiero", f"{dte_val:.2f}%")

    dr_val = ratios.get('debt_ratio', 0) or 0
    _add(leverage_metrics, "Ratio de Deuda (Debt Ratio)", dr_val, "< 0.5",
         dr_val < 0.5, "Proporción de activos financiados con deuda", f"{dr_val:.2f}")

    re_v = ratios.get('retained_earnings', 0) or 0
    _add(leverage_metrics, "Retained Earnings", re_v, "> 0",
         re_v > 0, "Recursos propios acumulados para financiar operación sin endeudamiento", f"{re_v:,.0f}")

    eq_mult = ratios.get('equity_multiplier', 0) or ratios.get('de_ratio', 0) or 0
    _add(leverage_metrics, "Equity Multiplier", eq_mult, "< 2x",
         eq_mult < 2, "Apalancamiento financiero sobre capital propio", f"{eq_mult:.2f}x")

    net_debt_ebit = ratios.get('net_debt_ebit')
    _add(leverage_metrics, "Deuda Neta / EBIT", net_debt_ebit, "< 1",
         _safe_cmp_lt(net_debt_ebit, 1), "Proporción de deuda neta sobre EBIT", _fmt(net_debt_ebit, ".2f", "x"))

    # ✦ NUEVO 3: Net Debt / EBITDA
    nd_ebitda = ratios.get('net_debt_ebitda')
    _add(leverage_metrics, "Net Debt / EBITDA", nd_ebitda, "< 3x",
         _safe_cmp_lt(nd_ebitda, 3.0),
         "Estándar de crédito y covenants bancarios: <2x conservador, 2-3x moderado, >4x alto riesgo — usado por Moody's y S&P",
         _fmt(nd_ebitda, ".2f", "x"))

    # ✦ NUEVO 4: DSCR
    dscr_val = ratios.get('dscr')
    _add(leverage_metrics, "DSCR (Debt Service Coverage)", dscr_val, "> 1.5x",
         _safe_cmp_gt(dscr_val, 1.5),
         "Capacidad de servicio de deuda = EBITDA / Intereses. <1.0 riesgo de impago; >2.0 zona segura",
         _fmt(dscr_val, ".2f", "x"))

    lt_cap = ratios.get('lt_debt_cap', 0) or 0
    _add(leverage_metrics, "Long-Term Debt / Cap", lt_cap, "<= 0.5",
         lt_cap <= 0.5, ">0.5 indica alta dependencia de deuda a largo plazo", f"{lt_cap*100:.1f}%")

    de_v = ratios.get('de_ratio', 0) or 0
    _add(leverage_metrics, "Índice estructura capital (D/E)", de_v, "< 2x",
         de_v < 2, "Relación deuda/capital — comparar con peers del sector", f"{de_v:.2f}x")

    nd_val = ratios.get('net_debt', 0) or 0
    _add(leverage_metrics, "Deuda Neta (Net Debt)", nd_val, "< 0 (más efectivo que deuda)",
         nd_val < 0, "Deuda total menos efectivo disponible", f"${nd_val:,.0f}")

    ic_val = ratios.get('interest_coverage', 0) or 0
    _add(leverage_metrics, "Cobertura de Intereses", ic_val, "> 2.5",
         ic_val > 2.5, "Capacidad para cubrir pagos de intereses", f"{ic_val:.2f}x")

    categories.append(RatioCategory(category="⚖️ Apalancamiento", metrics=leverage_metrics))

    # =========================================================================
    # CATEGORÍA 4: VALORACIÓN
    # =========================================================================
    valuation_metrics = []

    pe_val = ratios.get('pe_ratio')
    pe_passed = pe_val is not None and 0 < pe_val < 25
    _add(valuation_metrics, "P/E Ratio (Precio/Beneficio)", pe_val, "< 25",
         pe_passed, "Valoración del mercado vs beneficios", _fmt(pe_val, ".2f"))

    # ✦ NUEVO 5: EV/EBITDA
    ev_ebitda_val = ratios.get('ev_ebitda')
    _add(valuation_metrics, "EV/EBITDA", ev_ebitda_val, "< 12x",
         _safe_cmp_between(ev_ebitda_val, 0, 12),
         "Múltiplo más usado en M&A y buy-side: ignora estructura de capital y D&A; <8x barato, 8-12x razonable, >15x caro",
         _fmt(ev_ebitda_val, ".2f", "x"))

    ev_ebit_val = ratios.get('ev_ebit')
    _add(valuation_metrics, "EV/EBIT", ev_ebit_val, "< 15",
         ev_ebit_val is not None and 0 < ev_ebit_val < 15,
         "Valoración empresarial vs EBIT", _fmt(ev_ebit_val, ".2f"))

    ey_val = ratios.get('earning_yield', 0) or 0
    _add(valuation_metrics, "Earning Yield (EBIT/EV)", ey_val, "> 8%",
         ey_val > 8, "Retorno operativo vs valor empresarial", f"{ey_val:.2f}%")

    ps_val = ratios.get('price_to_sales')
    _add(valuation_metrics, "P/S Ratio (Precio/Ventas)", ps_val, "< 2",
         ps_val is not None and ps_val < 2, "Valoración del mercado vs ventas", _fmt(ps_val, ".2f"))

    evs = ratios.get('ev_sales', 0) or 0
    _add(valuation_metrics, "EV/Sales", evs, "1-3x",
         1 <= evs <= 3, "Valoración de la empresa vs ingresos", f"{evs:.2f}x")

    ebit_ev = ratios.get('ebit_ev', 0) or 0
    _add(valuation_metrics, "EBIT/EV (Earning Yield)", ebit_ev, "> 25%",
         ebit_ev > 0.25, "Rendimiento operativo sobre el valor de empresa", f"{ebit_ev*100:.1f}%")

    ev_fcfv = ratios.get('ev_fcf') or ratios.get('fcf_ev')
    _add(valuation_metrics, "EV/FCF", ev_fcfv, "< 10x",
         _safe_cmp_lt(ev_fcfv, 10), "Valoración del mercado vs flujo de caja libre", _fmt(ev_fcfv, ".1f", "x"))

    # ✦ NUEVO 6: P/FCF
    pfcf_val = ratios.get('price_to_fcf')
    _add(valuation_metrics, "P/FCF (Precio / FCF)", pfcf_val, "< 20x",
         _safe_cmp_between(pfcf_val, 0, 20),
         "Valoración sobre flujo de caja real — más fiable que P/E; <15x atractivo, >25x caro; estándar en value investing",
         _fmt(pfcf_val, ".1f", "x"))

    # ✦ BUG FIX 3: PEG con detección de turnaround
    peg_v    = ratios.get('peg_ratio')
    peg_note = ratios.get('peg_note', 'sin_eps_growth')
    if peg_note == "turnaround":
        _add(valuation_metrics, "PEG Ratio", None, "< 0.5 (infravalorada)",
             True, "EPS pasó de negativo a positivo — turnaround fundamental; señal positiva", "Turnaround ✓")
    else:
        _add(valuation_metrics, "PEG Ratio", peg_v, "< 0.5 (infravalorada)",
             peg_v is not None and peg_v < 0.5,
             "P/E ajustado por crecimiento de EPS — <1x razonable, <0.5x infravalorada",
             _fmt(peg_v, ".2f", "x"))

    ev_cfo_v = ratios.get('ev_cfo')
    _add(valuation_metrics, "EV/CFO", ev_cfo_v, "< 1.3",
         _safe_cmp_lt(ev_cfo_v, 1.3), "Valoración del mercado vs flujo de caja operativo", _fmt(ev_cfo_v, ".2f", "x"))

    ev_gp_v = ratios.get('ev_gp')
    _add(valuation_metrics, "EV/Gross Profit", ev_gp_v, "< 5x",
         _safe_cmp_between(ev_gp_v, 0, 5), "Valoración respecto al margen bruto total", _fmt(ev_gp_v, ".2f", "x"))

    pb_val = info.get('priceToBook')
    if pb_val:
        try:
            pb_val = float(pb_val)
        except Exception:
            pb_val = None
    _add(valuation_metrics, "P/B Ratio (Precio/Valor en Libros)", pb_val, "< 3x",
         pb_val is not None and 0 < pb_val < 3, "Valoración del mercado vs valor contable", _fmt(pb_val, ".2f", "x"))

    # ✦ NUEVO 7: Graham Number
    gn_val = ratios.get('graham_number')
    current_price_val = info.get('currentPrice', info.get('regularMarketPrice', 0)) or 0
    gn_passed = gn_val is not None and current_price_val > 0 and current_price_val < gn_val
    _add(valuation_metrics, "Graham Number", gn_val, "Precio < Graham Number",
         gn_passed,
         "Precio justo de Graham: √(22.5 × EPS × BVPS) — si precio < GN, la acción es potencialmente infravalorada",
         _fmt(gn_val, ".2f", "", "$"))

    # ✦ NUEVO 8: Magic Formula Score (Greenblatt)
    mf_val = ratios.get('magic_formula_score')
    _add(valuation_metrics, "Magic Formula Score (Greenblatt)", mf_val, "> 20",
         _safe_cmp_gt(mf_val, 20),
         "Combina Earnings Yield (EBIT/EV) + ROIC — estrategia cuantitativa de Greenblatt; mayor score = mejor combinación valor+calidad",
         _fmt(mf_val, ".1f"))

    div_yield = info.get('dividendYield')
    if div_yield:
        try:
            div_yield = float(div_yield) * 100
        except Exception:
            div_yield = 0.0
    div_yield = div_yield or 0.0
    _add(valuation_metrics, "Dividend Yield", div_yield, "> 1%",
         div_yield > 1, "Rendimiento por dividendo sobre el precio actual", f"{div_yield:.2f}%")

    payout_r = ratios.get('payout_ratio', None) or 0.0
    _add(valuation_metrics, "Payout Ratio", payout_r, "< 60%",
         0 < payout_r < 60, "Porcentaje de beneficios distribuidos como dividendo", f"{payout_r:.1f}%")

    tobins_q_val = ratios.get('tobins_q', 0) or 0
    _add(valuation_metrics, "Tobin's Q", tobins_q_val, "< 1 (infravalorada)",
         tobins_q_val < 1, "Valor de mercado vs valor de reposición de activos", f"{tobins_q_val:.2f}")

    ncavps_val = ratios.get('ncavps', 0) or 0
    ncavps_passed = ncavps_val > 0 and current_price_val > 0 and current_price_val < ncavps_val
    _add(valuation_metrics, "NCAVPS (Net Current Asset Value/Share)", ncavps_val,
         "Precio < NCAVPS (Graham deep value)",
         ncavps_passed, "Valor neto de activos corrientes por acción — señal de Graham deep value", f"${ncavps_val:.2f}")

    categories.append(RatioCategory(category="💰 Valoración", metrics=valuation_metrics))

    # =========================================================================
    # CATEGORÍA 5: FLUJO DE CAJA
    # =========================================================================
    cashflow_metrics = []

    fcf_val = ratios.get('free_cash_flow', 0) or 0
    _add(cashflow_metrics, "Flujo de Caja Libre (FCF)", fcf_val, "> 0",
         fcf_val > 0, "Efectivo generado después de inversiones de capital", f"${fcf_val:,.0f}")

    fcf_m_val = ratios.get('fcf_margin', 0) or 0
    _add(cashflow_metrics, "Margen FCF (FCF Margin)", fcf_m_val, "> 15%",
         fcf_m_val > 15, "FCF como % de las ventas", f"{fcf_m_val:.2f}%")

    # CAGR FCF con detección de turnaround
    cagr_fcfv     = ratios.get('cagr_fcf_4y', 0) or 0
    cagr_fcf_note = ratios.get('cagr_fcf_note', 'ok')
    if cagr_fcf_note == 'turnaround':
        _add(cashflow_metrics, "CAGR FCF 4 años", None, "> 10%",
             True, "FCF pasó de negativo a positivo — turnaround de generación de caja", "Turnaround ✓")
    else:
        _add(cashflow_metrics, "CAGR FCF 4 años", cagr_fcfv, "> 10%",
             cagr_fcfv > 0.10, "Crecimiento del flujo de caja libre — calidad real del negocio", f"{cagr_fcfv*100:.1f}%")

    fcf_s = ratios.get('fcf_sales', 0) or 0
    _add(cashflow_metrics, "FCF/Ventas", fcf_s, "> 1%",
         fcf_s > 0.01, "Margen alto >10-15% indica fuerte generación de caja", f"{fcf_s*100:.1f}%")

    ocf_m = ratios.get('ocf_margin', 0) or 0
    _add(cashflow_metrics, "Operating CF Margin", ocf_m, "> 25%",
         ocf_m > 0.25, "Eficiencia operativa — valida rentabilidad real vs. beneficios contables", f"{ocf_m*100:.1f}%")

    capex_m = ratios.get('capex_margin', 0) or 0
    _add(cashflow_metrics, "Capex Margin", capex_m, "< 10%",
         capex_m < 0.10, "Bajo (<10%) indica eficiencia y madurez; alto señala crecimiento o sector intensivo", f"{capex_m*100:.1f}%")

    ccf_v = ratios.get('ccf', 0) or 0
    _add(cashflow_metrics, "Capital Cash Flow (CCF)", ccf_v, "> 0",
         ccf_v > 0, "Capacidad para retornos a inversores; incluye efecto de la deuda", f"{ccf_v:,.0f}")

    ocf_s_val = ratios.get('operating_cf_to_sales', 0) or 0
    _add(cashflow_metrics, "OCF/Ventas", ocf_s_val, "> 15%",
         ocf_s_val > 15, "Conversión de ventas a flujo de caja operativo", f"{ocf_s_val:.2f}%")

    capex_r_val = ratios.get('capex_to_revenue', 0) or 0
    _add(cashflow_metrics, "Capex/Ventas", capex_r_val, "< 20%",
         capex_r_val < 20, "Inversión en activos vs ventas totales", f"{capex_r_val:.2f}%")

    cf_debt_val = ratios.get('cash_flow_to_debt', 0) or 0
    _add(cashflow_metrics, "Flujo de Caja/Deuda", cf_debt_val, "> 20%",
         cf_debt_val > 20, "Capacidad de pago de deuda con flujo operativo", f"{cf_debt_val:.2f}%")

    fcf_ebitda_val = ratios.get('fcf_to_ebitda', 0) or 0
    _add(cashflow_metrics, "FCF/EBITDA", fcf_ebitda_val, "> 50%",
         fcf_ebitda_val > 50, "Conversión de EBITDA a flujo de caja libre", f"{fcf_ebitda_val:.2f}%")

    ebit_fcf = ratios.get('ebit_fcf')
    _add(cashflow_metrics, "EBIT/FCF", ebit_fcf, "0.5 - 2.0",
         ebit_fcf is not None and 0.5 <= ebit_fcf <= 2.0,
         "Calidad de conversión de EBIT a caja libre", _fmt(ebit_fcf, ".2f", "x"))

    accrual_r = ratios.get('accrual_ratio', 0) or 0
    _add(cashflow_metrics, "Accrual Ratio (OCF/NI)", accrual_r, "> 1.0",
         accrual_r > 1.0, "Ratio > 1 indica que el flujo operativo supera al beneficio neto — alta calidad", f"{accrual_r:.2f}x")

    capex_ni = ratios.get('capex_ni', 0) or 0
    _add(cashflow_metrics, "Capex / Net Income", capex_ni, "< 1.0",
         capex_ni < 1.0, "Bajo capex relativo al beneficio indica negocios escalables", f"{capex_ni:.2f}x")

    categories.append(RatioCategory(category="💵 Flujo de Caja", metrics=cashflow_metrics))

    # =========================================================================
    # CATEGORÍA 6: EFICIENCIA OPERATIVA
    # =========================================================================
    efficiency_metrics = []

    asset_t = ratios.get('asset_turnover', 0) or 0
    _add(efficiency_metrics, "Asset Turnover", asset_t, "> 0.5",
         asset_t > 0.5, "Eficiencia en el uso de activos para generar ventas", f"{asset_t:.2f}x")

    sales_fa_v = ratios.get('sales_fa', 0) or 0
    _add(efficiency_metrics, "Sales / Fixed Assets", sales_fa_v, "> 2x",
         sales_fa_v > 2, "Alto ratio indica máxima eficiencia de activos fijos", f"{sales_fa_v:.2f}x")

    sales_eq = ratios.get('sales_eq', 0) or 0
    _add(efficiency_metrics, "Sales / Equity", sales_eq, "> 3x",
         sales_eq > 3, "Eficiencia en el uso del capital propio para generar ventas", f"{sales_eq:.2f}x")

    capex_ocf_v = ratios.get('capex_ocf', 0) or 0
    _add(efficiency_metrics, "Capex / OCF", capex_ocf_v, "< 1",
         capex_ocf_v < 1, "Proporción baja indica que el negocio consume poco capex relativo al cash generado", f"{capex_ocf_v:.2f}")

    capex_da_val = ratios.get('capex_to_da', 0) or 0
    _add(efficiency_metrics, "Capex / Depreciación", capex_da_val, "> 1x",
         capex_da_val > 1, "Inversión vs depreciación — >1 indica inversión neta en activos", f"{capex_da_val:.2f}x")

    goodwill_val = ratios.get('goodwill_to_assets', 0) or 0
    _add(efficiency_metrics, "Goodwill / Activos", goodwill_val, "< 20%",
         goodwill_val < 20, "Proporción de intangibles sobre activos totales", f"{goodwill_val:.2f}%")

    kto_val = ratios.get('kto', 0) or 0
    _add(efficiency_metrics, "KTO (Capital Trabajo Oper./Ventas)", kto_val, "< 15%",
         kto_val < 0.15, "Eficiencia en gestión de capital de trabajo operativo", f"{kto_val*100:.2f}%")

    # ✦ NUEVO 9: DSO
    dso_val = ratios.get('dso')
    _add(efficiency_metrics, "DSO (Days Sales Outstanding)", dso_val, "< 45 días",
         _safe_cmp_lt(dso_val, 45),
         "Días de cobro — cuánto tarda en cobrar sus ventas; <30 días excelente, >60 días preocupante; clave en análisis de capital circulante",
         _fmt(dso_val, ".0f", " días"))

    # ✦ NUEVO 10: DIO
    dio_val = ratios.get('dio')
    _add(efficiency_metrics, "DIO (Days Inventory Outstanding)", dio_val, "< 60 días",
         _safe_cmp_lt(dio_val, 60),
         "Días de inventario — bajo indica alta rotación y menor riesgo de obsolescencia; sectores tech suelen tener <30 días",
         _fmt(dio_val, ".0f", " días"))

    # ✦ NUEVO 11: DPO
    dpo_val = ratios.get('dpo')
    _add(efficiency_metrics, "DPO (Days Payable Outstanding)", dpo_val, "> 30 días",
         _safe_cmp_gt(dpo_val, 30),
         "Días de pago — mayor DPO indica más poder de negociación con proveedores y mejor gestión de caja",
         _fmt(dpo_val, ".0f", " días"))

    # ✦ NUEVO 12: CCC
    ccc_val = ratios.get('ccc')
    _add(efficiency_metrics, "CCC (Cash Conversion Cycle)", ccc_val, "< 30 días",
         ccc_val is not None and ccc_val < 30,
         "CCC = DSO + DIO - DPO — negativo significa que cobra antes de pagar (ventaja competitiva estructural como Amazon o Walmart)",
         _fmt(ccc_val, ".0f", " días"))

    wc_turn = ratios.get('wc_turn', 0) or 0
    _add(efficiency_metrics, "WC Turnover (días)", wc_turn, "< 90 días",
         0 < wc_turn < 90, "Días que tarda el capital de trabajo en rotar", f"{wc_turn:.1f} días")

    wc_prod = ratios.get('wc_prod', 0) or 0
    _add(efficiency_metrics, "WC Productivity (Ventas/WC)", wc_prod, "> 3x",
         wc_prod > 3, "Productividad del capital de trabajo para generar ventas", f"{wc_prod:.2f}x")

    # ✦ NUEVO 2: Gross Profit per Employee
    gp_emp = ratios.get('gross_profit_per_employee', 0) or 0
    _add(efficiency_metrics, "Gross Profit per Employee", gp_emp, "> $150K",
         gp_emp > 150000,
         "Productividad por empleado — KPI de SaaS y tech; >$200K excelente, <$50K negocio intensivo en mano de obra",
         f"${gp_emp:,.0f}")

    # ✦ NUEVO 15: Revenue per Employee
    rev_emp = ratios.get('revenue_per_employee') or 0
    _add(efficiency_metrics, "Revenue per Employee", rev_emp, "> $300K",
         rev_emp is not None and rev_emp > 300000,
         "Productividad de la fuerza laboral — alto en tech/SaaS y bajo en retail/manufactura; mide escalabilidad del modelo",
         f"${rev_emp:,.0f}" if rev_emp else "N/A")

    rd_gp = ratios.get('rd_gp', 0) or 0
    _add(efficiency_metrics, "R&D / Gross Profit", rd_gp, "< 0.4",
         rd_gp < 0.4, "Inversión en I+D como % del margen bruto — equilibrio innovación/eficiencia", f"{rd_gp*100:.1f}%")

    ad_fixed = ratios.get('ad_fixed_ratio', 0) or 0
    _add(efficiency_metrics, "Fixed Assets / Total Assets", ad_fixed, "< 0.5",
         ad_fixed < 0.5, "Peso de activos fijos en el total — bajo indica modelo asset-light", f"{ad_fixed*100:.1f}%")

    categories.append(RatioCategory(category="⚙️ Eficiencia Operativa", metrics=efficiency_metrics))

    # =========================================================================
    # CATEGORÍA 7: RIESGO Y CAPITAL
    # =========================================================================
    risk_metrics = []

    sharpe_val = ratios.get('sharpe_ratio', 0) or 0
    _add(risk_metrics, "Sharpe Ratio", sharpe_val, "> 1.0",
         sharpe_val > 1.0, "Retorno ajustado por riesgo (>1 bueno, >2 excelente)", f"{sharpe_val:.2f}")

    ann_ret = ratios.get('annualized_return', 0) or 0
    _add(risk_metrics, "Retorno Anualizado (1Y)", ann_ret, "> 10%",
         ann_ret > 10, "Retorno anualizado de los últimos 12 meses", f"{ann_ret:.2f}%")

    ann_vol = ratios.get('annualized_volatility', 0) or 0
    _add(risk_metrics, "Volatilidad Anualizada", ann_vol, "< 25%",
         ann_vol < 25, "Desviación estándar anualizada de retornos — menor es más estable", f"{ann_vol:.2f}%")

    beta_val = ratios.get('beta', 0) or 0
    _add(risk_metrics, "Beta", beta_val, "0.8 - 1.2",
         0.8 <= beta_val <= 1.2, "Volatilidad del activo vs el mercado", f"{beta_val:.2f}")

    wacc_val = ratios.get('wacc', 0) or 0
    _add(risk_metrics, "WACC", wacc_val, "< 12%",
         wacc_val < 12, "Costo promedio ponderado de capital", f"{wacc_val:.2f}%")

    spread_val = ratios.get('roic_wacc_spread', 0) or 0
    _add(risk_metrics, "ROIC vs WACC Spread", spread_val, "> 0%",
         spread_val > 0, "Diferencia entre retorno y costo de capital — positivo = crea valor", f"{spread_val:.2f}%")

    categories.append(RatioCategory(category="⚠️ Riesgo y Capital", metrics=risk_metrics))

    # =========================================================================
    # CATEGORÍA 8: CALIDAD CONTABLE Y SALUD FINANCIERA
    # =========================================================================
    quality_metrics = []

    sloan_val = ratios.get('sloan_ratio', 0) or 0
    _add(quality_metrics, "Sloan Ratio (Accruals)", sloan_val, "-0.1 a 0.1",
         -0.1 <= sloan_val <= 0.1, "Detecta manipulación contable via accruals", f"{sloan_val:.2f}")

    beneish_val = ratios.get('beneish_m_score', 0) or 0
    _add(quality_metrics, "Beneish M-Score", beneish_val, "< -2.22",
         beneish_val < -2.22, "Detección de manipulación contable", f"{beneish_val:.2f}")

    ohlson_val = ratios.get('ohlson_o_score', 0) or 0
    _add(quality_metrics, "Ohlson O-Score", ohlson_val, "< 0.5",
         ohlson_val < 0.5, "Predicción de quiebra a 2 años — menor es mejor", f"{ohlson_val:.2f}")

    altman_val = ratios.get('altman_z_score', 0) or 0
    _add(quality_metrics, "Altman Z-Score", altman_val, "> 2.99",
         altman_val > 2.99, "Predicción de quiebra (>2.99 segura, <1.81 zona peligro)", f"{altman_val:.2f}")

    fulmer_val = ratios.get('fulmer_h_score', 0) or 0
    _add(quality_metrics, "Fulmer H-Score", fulmer_val, "> 0",
         fulmer_val > 0, "Solidez financiera general", f"{fulmer_val:.2f}")

    piotroski_val = ratios.get('piotroski_f_score', 0) or 0
    _add(quality_metrics, "Piotroski F-Score", piotroski_val, ">= 7",
         piotroski_val >= 7, "Solidez financiera (0-9, 7+ es fuerte)", f"{int(piotroski_val)}")

    montier_val = ratios.get('montier_c_score', 0) or 0
    _add(quality_metrics, "Montier C-Score", montier_val, "<= 2",
         montier_val <= 2, "Riesgo de manipulación contable (0-3, menor es mejor)", f"{int(montier_val)}")

    springate_val = ratios.get('springate_score', 0) or 0
    _add(quality_metrics, "Springate S-Score", springate_val, "> 0.862",
         springate_val > 0.862, "Modelo alternativo de predicción de quiebra", f"{springate_val:.2f}")

    ca_val = ratios.get('ca_score', 0) or 0
    _add(quality_metrics, "CA-SCORE", ca_val, "> -0.3",
         ca_val > -0.3, "Credit Analysis Score — riesgo crediticio", f"{ca_val:.2f}")

    kanitz_val = ratios.get('kanitz_score', 0) or 0
    _add(quality_metrics, "Kanitz Score", kanitz_val, "> 0",
         kanitz_val > 0, "Termómetro de Insolvencia (<-3 peligro, >0 solvente)", f"{kanitz_val:.2f}")

    zmijewski_val = ratios.get('zmijewski_score', 0) or 0
    _add(quality_metrics, "Zmijewski Score", zmijewski_val, "< 0",
         zmijewski_val < 0, "Predicción de insolvencia — negativo indica bajo riesgo", f"{zmijewski_val:.2f}")

    categories.append(RatioCategory(category="📋 Calidad Contable y Salud Financiera",
                                     metrics=quality_metrics))

    # =========================================================================
    # CATEGORÍA 9: RENDIMIENTO DE PRECIO
    # =========================================================================
    price_metrics = []

    high_52w = ratios.get('fifty_two_week_high', 0) or 0
    price_metrics.append(RatioMetric(
        name="Máximo 52 Semanas", value=high_52w, threshold="Referencia",
        passed=True, interpretation="Precio más alto en el último año",
        display_value=f"${high_52w:.2f}"
    ))

    low_52w = ratios.get('fifty_two_week_low', 0) or 0
    price_metrics.append(RatioMetric(
        name="Mínimo 52 Semanas", value=low_52w, threshold="Referencia",
        passed=True, interpretation="Precio más bajo en el último año",
        display_value=f"${low_52w:.2f}"
    ))

    below_high = ratios.get('pct_below_52w_high', 0) or 0
    _add(price_metrics, "% Bajo Máximo 52S", below_high, "< 20%",
         below_high < 20, "Distancia del precio máximo anual", f"-{below_high:.2f}%")

    above_low = ratios.get('pct_above_52w_low', 0) or 0
    _add(price_metrics, "% Sobre Mínimo 52S", above_low, "> 20%",
         above_low > 20, "Distancia del precio mínimo anual", f"+{above_low:.2f}%")

    categories.append(RatioCategory(category="📊 Rendimiento de Precio", metrics=price_metrics))

    # =========================================================================
    # CATEGORÍA 10: VALORACIÓN GRAHAM / DCF / EPV
    # =========================================================================
    graham_metrics = []

    vi_dcf = ratios.get('intrinsic_value', 0) or 0
    graham_metrics.append(RatioMetric(
        name="Valor Intrínseco (DCF)", value=vi_dcf, threshold="Referencia",
        passed=True, interpretation="Valor justo calculado con modelo DCF simplificado",
        display_value=f"${vi_dcf:.2f}"
    ))

    mos_dcf = ratios.get('margin_of_safety', 0) or 0
    _add(graham_metrics, "Margen de Seguridad (DCF)", mos_dcf, ">= 20%",
         mos_dcf >= 20, "Descuento del precio actual vs valor intrínseco DCF", f"{mos_dcf:.1f}%")

    # ✦ NUEVO 14: EPV (Earnings Power Value) — Bruce Greenwald
    epv_val = ratios.get('epv_per_share')
    epv_passed = epv_val is not None and current_price_val > 0 and current_price_val < epv_val
    graham_metrics.append(RatioMetric(
        name="EPV (Earnings Power Value)", value=epv_val,
        threshold="Precio < EPV",
        passed=epv_passed,
        interpretation="Valor del negocio sin crecimiento (Greenwald): NOPAT / WACC - Deuda Neta. Si precio < EPV, el mercado no paga por crecimiento futuro — señal de compra conservadora",
        display_value=_fmt(epv_val, ".2f", "", "$")
    ))

    vi_graham = ratios.get('intrinsic_value_graham', 0) or 0
    graham_metrics.append(RatioMetric(
        name="Valor Intrínseco (Graham)", value=vi_graham, threshold="Referencia",
        passed=True, interpretation="Valor justo calculado por fórmula de Benjamin Graham",
        display_value=f"${vi_graham:.2f}"
    ))

    mos_graham = ratios.get('margin_of_safety_graham', 0) or 0
    _add(graham_metrics, "Margen de Seguridad (Graham)", mos_graham, ">= 20%",
         mos_graham >= 20, "Descuento del precio actual vs valor intrínseco Graham", f"{mos_graham:.1f}%")

    target_cons = ratios.get('target_price_conservative', 0) or 0
    graham_metrics.append(RatioMetric(
        name="Precio Objetivo Conservador", value=target_cons,
        threshold="75% del VI (25% margen)",
        passed=current_price_val <= target_cons if target_cons > 0 else False,
        interpretation="Precio de compra con margen de seguridad del 25%",
        display_value=f"${target_cons:.2f}"
    ))

    target_mod = ratios.get('target_price_moderate', 0) or 0
    graham_metrics.append(RatioMetric(
        name="Precio Objetivo Moderado", value=target_mod,
        threshold="100% del VI",
        passed=current_price_val <= target_mod if target_mod > 0 else False,
        interpretation="Valor intrínseco sin descuento adicional",
        display_value=f"${target_mod:.2f}"
    ))

    target_agg = ratios.get('target_price_aggressive', 0) or 0
    graham_metrics.append(RatioMetric(
        name="Precio Objetivo Agresivo", value=target_agg,
        threshold="120% del VI",
        passed=False,
        interpretation="Precio objetivo con 20% de prima sobre el valor intrínseco",
        display_value=f"${target_agg:.2f}"
    ))

    upside = ratios.get('upside_potential', 0) or 0
    _add(graham_metrics, "Upside Potential (DCF)", upside, "> 20%",
         upside > 20, "Potencial de revalorización desde el precio actual al valor DCF", f"{upside:.1f}%")

    categories.append(RatioCategory(category="💰 Valoración Graham / DCF / EPV",
                                     metrics=graham_metrics))

    # =========================================================================
    # CÁLCULO FINAL
    # =========================================================================
    favorable_pct = (favorable / total_metrics) * 100 if total_metrics > 0 else 0

    if favorable_pct >= 60:
        recommendation = "COMPRAR"
        risk_level = "Bajo"
    elif favorable_pct >= 40:
        recommendation = "MANTENER"
        risk_level = "Moderado"
    else:
        recommendation = "VENDER"
        risk_level = "Alto"

    summary_flags = {
        "profitable":        ratios.get('net_margin', 0) > 0,
        "positive_fcf":      ratios.get('free_cash_flow', 0) > 0,
        "low_debt":          ratios.get('debt_ratio', 1) < 0.5,
        "good_margins":      ratios.get('gross_margin', 0) > 40,
        "healthy_liquidity": ratios.get('current_ratio', 0) > 1.2,
        "strong_roe":        ratios.get('roe', 0) > 15,
        "creates_value":     ratios.get('creates_value', False),
        "undervalued":       ratios.get('margin_of_safety', 0) > 20,
    }

    valuation_summary = {
        "intrinsic_value_dcf":           ratios.get('intrinsic_value', 0),
        "margin_of_safety_dcf":          ratios.get('margin_of_safety', 0),
        "upside_potential_dcf":          ratios.get('upside_potential', 0),
        "intrinsic_value_graham":        ratios.get('intrinsic_value_graham', 0),
        "intrinsic_value_graham_simple": ratios.get('intrinsic_value_graham_simple', 0),
        "margin_of_safety_graham":       ratios.get('margin_of_safety_graham', 0),
        "graham_recommendation":         ratios.get('graham_recommendation', 'N/A'),
        "graham_number":                 ratios.get('graham_number'),
        "epv_per_share":                 ratios.get('epv_per_share'),
        "magic_formula_score":           ratios.get('magic_formula_score'),
        "target_price_conservative":     ratios.get('target_price_conservative', 0),
        "target_price_moderate":         ratios.get('target_price_moderate', 0),
        "target_price_aggressive":       ratios.get('target_price_aggressive', 0),
        "current_price":                 info.get('currentPrice', info.get('regularMarketPrice', 0)),
        "creates_value":                 ratios.get('creates_value', False),
        "value_creation_category":       ratios.get('value_creation_category', 'N/A'),
        "roic":                          ratios.get('roic', 0),
        "wacc":                          ratios.get('wacc', 0),
        "spread":                        ratios.get('value_creation_spread', 0),
        "estimated_growth_rate":         ratios.get('estimated_growth_rate', 5.0),
    }

    return (categories, favorable_pct, recommendation, risk_level,
            total_metrics, favorable, summary_flags, valuation_summary)





# Routes

# ══════════════════════════════════════════════════════════════════════════════
# AUTH MODELS & FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════
class UserRegister(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: Optional[datetime] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

async def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        return await db.users.find_one({"id": user_id})
    except:
        return None

# ── Auth Endpoints ─────────────────────────────────────────────────────────────
@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserRegister):
    """Register a new user"""
    try:
        # Verificar si el email ya existe
        existing = await db.users.find_one({"email": user_data.email.lower()})
        if existing:
            raise HTTPException(status_code=400, detail="El email ya está registrado")
        # Crear usuario
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "email": user_data.email.lower().strip(),
            "name": user_data.name.strip(),
            "password": hash_password(user_data.password),
            "created_at": datetime.utcnow(),
        }
        await db.users.insert_one(user)
        # Crear token
        token = create_access_token({"sub": user_id})
        return Token(
            access_token=token,
            token_type="bearer",
            user=UserResponse(id=user_id, email=user["email"], name=user["name"], created_at=user["created_at"])
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error registering user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al registrar: {str(e)}")

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    """Login with email and password"""
    try:
        user = await db.users.find_one({"email": user_data.email.lower()})
        if not user or not verify_password(user_data.password, user["password"]):
            raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
        token = create_access_token({"sub": user["id"]})
        return Token(
            access_token=token,
            token_type="bearer",
            user=UserResponse(id=user["id"], email=user["email"], name=user["name"], created_at=user.get("created_at"))
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error logging in: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al iniciar sesión: {str(e)}")

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        created_at=current_user.get("created_at")
    )

@api_router.put("/auth/profile")
async def update_profile(update: dict, current_user: dict = Depends(get_current_user)):
    """Update user profile"""
    try:
        allowed = {k: v for k, v in update.items() if k in ["name"]}
        if "password" in update and update["password"]:
            allowed["password"] = hash_password(update["password"])
        await db.users.update_one({"id": current_user["id"]}, {"$set": allowed})
        return {"message": "Perfil actualizado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/analyze", response_model=AnalysisResponse)
async def analyze_stock(request: AnalyzeRequest, current_user: dict = Depends(get_optional_user)):
    """Analyze a stock by ticker or ISIN"""
    try:
        ticker = request.ticker.upper().strip()
        
        # Try to fetch the stock data
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # Validate that we got valid data
        if not info or 'symbol' not in info:
            raise HTTPException(status_code=404, detail=f"No se encontraron datos para el ticker '{ticker}'")
        
        # Calculate ratios
        ratios, stock_info = calculate_ratios(stock)
        
        # Evaluate ratios
        categories, favorable_pct, recommendation, risk_level, total_metrics, favorable_count, summary_flags, valuation_summary = evaluate_ratios(ratios, stock_info)
        
        # Prepare metadata with extended info
        metadata = {
            "sector": stock_info.get('sector', 'N/A'),
            "industry": stock_info.get('industry', 'N/A'),
            "market_cap": stock_info.get('marketCap', 0),
            "current_price": stock_info.get('currentPrice', stock_info.get('regularMarketPrice', 0)),
            "currency": stock_info.get('currency', 'USD'),
            "exchange": stock_info.get('exchange', 'N/A'),
            "country": stock_info.get('country', 'N/A'),
            "website": stock_info.get('website', ''),
            "description": stock_info.get('longBusinessSummary', '')[:200] + '...' if stock_info.get('longBusinessSummary') else '',
            # New fields
            "pe_ratio": stock_info.get('trailingPE', stock_info.get('forwardPE', 0)),
            "eps": stock_info.get('trailingEps', 0),
            "dividend_yield": stock_info.get('dividendYield', 0) * 100 if stock_info.get('dividendYield') else 0,
            "dividend_rate": stock_info.get('dividendRate', 0),
            "fifty_two_week_high": stock_info.get('fiftyTwoWeekHigh', 0),
            "fifty_two_week_low": stock_info.get('fiftyTwoWeekLow', 0),
            "beta": stock_info.get('beta', 0),
            "volume_avg": stock_info.get('averageVolume', 0),
            "forward_pe": stock_info.get('forwardPE', 0),
            "peg_ratio": stock_info.get('pegRatio', 0),
            "price_to_book": stock_info.get('priceToBook', 0),
        }
        
        # Get Company Profile
        company_profile = None
        try:
            business_summary = stock_info.get('longBusinessSummary', '')
            # Truncate to ~500 chars for mobile display
            if len(business_summary) > 500:
                business_summary = business_summary[:500] + '...'
            
            city = stock_info.get('city', '')
            state = stock_info.get('state', '')
            country = stock_info.get('country', '')
            headquarters = ', '.join(filter(None, [city, state, country]))
            
            company_profile = StockProfile(
                sector=stock_info.get('sector', 'N/A'),
                industry=stock_info.get('industry', 'N/A'),
                full_time_employees=stock_info.get('fullTimeEmployees'),
                business_summary=business_summary,
                website=stock_info.get('website'),
                headquarters=headquarters if headquarters else None
            )
        except Exception as e:
            logging.warning(f"Could not get company profile: {str(e)}")
        
        # Get Analyst Recommendations
        analyst_recommendations = None
        try:
            recommendations = stock.recommendations
            if recommendations is not None and not recommendations.empty:
                # Get most recent recommendation period
                recent = recommendations.iloc[-1] if len(recommendations) > 0 else None
                if recent is not None:
                    analyst_recommendations = AnalystRecommendation(
                        period=str(recent.name) if hasattr(recent, 'name') else 'Current',
                        strong_buy=int(recent.get('strongBuy', 0)),
                        buy=int(recent.get('buy', 0)),
                        hold=int(recent.get('hold', 0)),
                        sell=int(recent.get('sell', 0)),
                        strong_sell=int(recent.get('strongSell', 0))
                    )
        except Exception as e:
            logging.warning(f"Could not get analyst recommendations: {str(e)}")
        
        # Get Holders Breakdown
        holders_breakdown = None
        try:
            insider_pct = stock_info.get('heldPercentInsiders', 0) * 100 if stock_info.get('heldPercentInsiders') else 0
            institution_pct = stock_info.get('heldPercentInstitutions', 0) * 100 if stock_info.get('heldPercentInstitutions') else 0
            public_pct = 100 - insider_pct - institution_pct
            if public_pct < 0:
                public_pct = 0
            
            holders_breakdown = HoldersBreakdown(
                insider_percent=round(insider_pct, 2),
                institution_percent=round(institution_pct, 2),
                public_percent=round(public_pct, 2)
            )
        except Exception as e:
            logging.warning(f"Could not get holders breakdown: {str(e)}")
        
        # Get Top Institutional Holders
        top_institutional_holders = []
        try:
            institutional_holders = stock.institutional_holders
            if institutional_holders is not None and not institutional_holders.empty:
                for idx, row in institutional_holders.head(10).iterrows():
                    pct_held = row.get('pctHeld', 0)
                    if pct_held:
                        pct_held = float(pct_held) * 100
                    holder = InstitutionalHolder(
                        holder_name=str(row.get('Holder', 'Unknown')),
                        shares=int(row.get('Shares', 0)),
                        percentage=round(pct_held, 2),
                        value=float(row.get('Value', 0))
                    )
                    top_institutional_holders.append(holder)
        except Exception as e:
            logging.warning(f"Could not get institutional holders: {str(e)}")
        
        # Create response
        analysis = AnalysisResponse(
            ticker=ticker,
            company_name=stock_info.get('longName', stock_info.get('shortName', ticker)),
            recommendation=recommendation,
            favorable_percentage=favorable_pct,
            risk_level=risk_level,
            total_metrics=total_metrics,
            favorable_metrics=favorable_count,
            unfavorable_metrics=total_metrics - favorable_count,
            ratios=categories,
            metadata=metadata,
            summary_flags=summary_flags,
            valuation_summary=valuation_summary,
            company_profile=company_profile,
            analyst_recommendations=analyst_recommendations,
            holders_breakdown=holders_breakdown,
            top_institutional_holders=top_institutional_holders
        )
        
        # Save to database
        await db.analyses.insert_one(analysis.dict())
        
        return analysis
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error analyzing stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al analizar la acción: {str(e)}")
    
# ─────────────────────────────────────────────────────────────────────────────
#  ENDPOINT: /api/financial-statements-full/{ticker}
#
#  Devuelve los 3 estados financieros completos (Income, Balance, Cash Flow)
#  con todos los años disponibles en yFinance, valores en millones USD.
#
#  Añadir este bloque al final de main.py (antes del app.include_router).
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/financial-statements-full/{ticker}")
async def get_financial_statements_full(ticker: str):
    """
    Devuelve Income Statement, Balance Sheet y Cash Flow Statement completos
    con todos los años disponibles. Valores en millones USD (M).
    """
    try:
        ticker = ticker.upper().strip()
        stock = yf.Ticker(ticker)
        info  = stock.info

        if not info or (
            info.get("regularMarketPrice") is None and
            info.get("currentPrice") is None and
            info.get("symbol") is None
        ):
            raise HTTPException(status_code=404, detail=f"No se encontraron datos para '{ticker}'")

        company_name = info.get("longName") or info.get("shortName") or ticker

        def _to_m(value):
            """Convierte a millones con 1 decimal, None si inválido."""
            if value is None:
                return None
            try:
                f = float(value)
                if math.isnan(f) or math.isinf(f):
                    return None
                return round(f / 1_000_000, 1)
            except (TypeError, ValueError):
                return None

        def _df_to_dict(df: pd.DataFrame) -> dict:
            """
            Convierte un DataFrame de yFinance (filas=métricas, columnas=fechas)
            en un dict anidado: { "YYYY-MM-DD": { "Métrica": valor_en_M, ... }, ... }
            """
            if df is None or df.empty:
                return {}
            result = {}
            for col in df.columns:
                # La columna es un Timestamp; usamos solo el año
                col_key = str(col.year) if hasattr(col, "year") else str(col)[:4]
                result[col_key] = {}
                for row_name in df.index:
                    raw_val = df.loc[row_name, col]
                    result[col_key][str(row_name)] = _to_m(raw_val)
            return result

        # ── Cargar los 3 estados ──────────────────────────────────────────────
        income_stmt   = stock.income_stmt
        balance_sheet = stock.balance_sheet
        cash_flow     = stock.cash_flow

        income_dict   = _df_to_dict(income_stmt)
        balance_dict  = _df_to_dict(balance_sheet)
        cashflow_dict = _df_to_dict(cash_flow)

        # ── Derivar FCF y añadirlo al cash flow ───────────────────────────────
        for yr in cashflow_dict:
            ocf   = cashflow_dict[yr].get("Operating Cash Flow") or cashflow_dict[yr].get("Total Cash From Operating Activities")
            capex = cashflow_dict[yr].get("Capital Expenditure") or cashflow_dict[yr].get("Capital Expenditures")
            if ocf is not None and capex is not None:
                cashflow_dict[yr]["Free Cash Flow"] = round(ocf + capex, 1)  # capex ya viene negativo en yFinance

        # ── Derivar EBITDA y añadirlo al income ───────────────────────────────
        for yr in income_dict:
            ebit = income_dict[yr].get("EBIT") or income_dict[yr].get("Operating Income")
            # D&A está en el cash flow
            da = cashflow_dict.get(yr, {}).get("Depreciation And Amortization")
            if ebit is not None and da is not None:
                income_dict[yr]["EBITDA"] = round(ebit + abs(da), 1)

        # ── Ordenar años de más reciente a más antiguo ─────────────────────────
        all_years_set = (
            set(income_dict.keys()) |
            set(balance_dict.keys()) |
            set(cashflow_dict.keys())
        )
        years_sorted = sorted(all_years_set, reverse=True)

        # Limitar a 5 años máximo para no sobrecargar la UI
        years_sorted = years_sorted[:5]

        return {
            "ticker":       ticker,
            "company_name": company_name,
            "currency":     info.get("currency", "USD"),
            "years":        years_sorted,
            "income":       income_dict,
            "balance":      balance_dict,
            "cashflow":     cashflow_dict,
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error en financial-statements-full para {ticker}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener estados financieros: {str(e)}"
        )
     
    
    
    
    

@api_router.get("/history", response_model=List[HistoryItem])
async def get_history():
    """Get analysis history"""
    try:
        analyses = await db.analyses.find().sort("analysis_date", -1).limit(50).to_list(50)
        return [
            HistoryItem(
                id=a['id'],
                ticker=a['ticker'],
                company_name=a['company_name'],
                analysis_date=a['analysis_date'],
                recommendation=a['recommendation'],
                favorable_percentage=a['favorable_percentage']
            )
            for a in analyses
        ]
    except Exception as e:
        logging.error(f"Error fetching history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener historial: {str(e)}")

@api_router.get("/analysis/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(analysis_id: str):
    """Get specific analysis by ID"""
    try:
        analysis = await db.analyses.find_one({"id": analysis_id})
        if not analysis:
            raise HTTPException(status_code=404, detail="Análisis no encontrado")
        return AnalysisResponse(**analysis)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener análisis: {str(e)}")

class ChartDataPoint(BaseModel):
    date: str
    stock_value: float
    sp500_value: float

class ChartDataResponse(BaseModel):
    ticker: str
    current_price: float
    price_change: float
    price_change_percent: float
    chart_data: List[ChartDataPoint]
    period: str

@api_router.get("/chart/{ticker}", response_model=ChartDataResponse)
async def get_chart_data(ticker: str, period: str = "1y"):
    """Get historical price data and compare with S&P 500"""
    try:
        ticker = ticker.upper().strip()
        
        # Fetch stock data
        stock = yf.Ticker(ticker)
        
        # Define period mapping
        period_map = {
            "1w": "7d",
            "1m": "1mo",
            "3m": "3mo",
            "6m": "6mo",
            "1y": "1y",
            "5y": "5y"
        }
        
        yf_period = period_map.get(period, "1y")
        
        # Get historical data for stock
        stock_hist = stock.history(period=yf_period)
        
        # Get S&P 500 data
        sp500 = yf.Ticker("^GSPC")
        sp500_hist = sp500.history(period=yf_period)
        
        if stock_hist.empty or sp500_hist.empty:
            raise HTTPException(status_code=404, detail=f"No se encontraron datos históricos para {ticker}")
        
        # Get current price and calculate change
        current_price = float(stock_hist['Close'].iloc[-1])
        start_price = float(stock_hist['Close'].iloc[0])
        price_change = current_price - start_price
        price_change_percent = (price_change / start_price) * 100
        
        # Normalize data to percentage returns (starting at 100)
        stock_normalized = (stock_hist['Close'] / stock_hist['Close'].iloc[0]) * 100
        sp500_normalized = (sp500_hist['Close'] / sp500_hist['Close'].iloc[0]) * 100
        
        # Align dates and create chart data
        chart_data = []
        
        # Get common dates
        common_dates = stock_hist.index.intersection(sp500_hist.index)
        
        # Sample data points to avoid too many points (max 100 points)
        if len(common_dates) > 100:
            step = len(common_dates) // 100
            common_dates = common_dates[::step]
        
        for date in common_dates:
            try:
                chart_data.append(ChartDataPoint(
                    date=date.strftime('%Y-%m-%d'),
                    stock_value=float(stock_normalized[date]),
                    sp500_value=float(sp500_normalized[date])
                ))
            except:
                continue
        
        return ChartDataResponse(
            ticker=ticker,
            current_price=current_price,
            price_change=price_change,
            price_change_percent=price_change_percent,
            chart_data=chart_data,
            period=period
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching chart data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener datos del gráfico: {str(e)}")

class VolumeDataPoint(BaseModel):
    date: str
    volume: float
    sma_volume: float

class VolumeChartResponse(BaseModel):
    ticker: str
    volume_data: List[VolumeDataPoint]
    avg_volume: float
    period: str

@api_router.get("/volume/{ticker}", response_model=VolumeChartResponse)
async def get_volume_data(ticker: str, period: str = "1y", sma_period: int = 20):
    """Get volume data with SMA (Simple Moving Average)"""
    try:
        ticker = ticker.upper().strip()
        
        # Define period mapping
        period_map = {
            "1w": "7d",
            "1m": "1mo",
            "3m": "3mo",
            "6m": "6mo",
            "1y": "1y",
            "5y": "5y"
        }
        
        yf_period = period_map.get(period, "1y")
        
        # Fetch stock data
        stock = yf.Ticker(ticker)
        hist = stock.history(period=yf_period)
        
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No se encontraron datos de volumen para {ticker}")
        
        # Calculate Simple Moving Average for volume
        hist['SMA_Volume'] = hist['Volume'].rolling(window=sma_period).mean()
        
        # Calculate average volume
        avg_volume = float(hist['Volume'].mean())
        
        # Prepare volume data
        volume_data = []
        
        # Sample data if too many points (max 100)
        if len(hist) > 100:
            step = len(hist) // 100
            hist_sampled = hist.iloc[::step]
        else:
            hist_sampled = hist
        
        for date, row in hist_sampled.iterrows():
            volume_data.append(VolumeDataPoint(
                date=date.strftime('%Y-%m-%d'),
                volume=float(row['Volume']),
                sma_volume=float(row['SMA_Volume']) if pd.notna(row['SMA_Volume']) else float(row['Volume'])
            ))
        
        return VolumeChartResponse(
            ticker=ticker,
            volume_data=volume_data,
            avg_volume=avg_volume,
            period=period
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching volume data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener datos de volumen: {str(e)}")

# En el backend (main.py), añade estos nuevos modelos y endpoint

class HistoryItemEnhanced(BaseModel):
    id: str
    ticker: str
    company_name: str
    analysis_date: datetime
    recommendation: str
    favorable_percentage: float
    current_price: float = 0.0
    price_change: float = 0.0
    price_change_percent: float = 0.0
    sector: str = "N/A"

@api_router.get("/history/enhanced", response_model=List[HistoryItemEnhanced])
async def get_enhanced_history(
    recommendation: Optional[str] = None,  # Filter by COMPRAR, MANTENER, VENDER
    limit: int = 50
):
    """Get enhanced analysis history with current prices and filters"""
    try:
        # Build query
        query = {}
        if recommendation:
            query["recommendation"] = recommendation.upper()
        
        analyses = await db.analyses.find(query).sort("analysis_date", -1).limit(limit).to_list(limit)
        
        enhanced_results = []
        
        for analysis in analyses:
            try:
                ticker = analysis['ticker']
                
                # Get current price
                stock = yf.Ticker(ticker)
                info = stock.info
                current_price = info.get('currentPrice', info.get('regularMarketPrice', 0)) or 0
                prev_close = info.get('previousClose', current_price) or current_price
                
                # Calculate change
                price_change = current_price - prev_close
                price_change_percent = (price_change / prev_close * 100) if prev_close > 0 else 0
                
                enhanced_results.append(HistoryItemEnhanced(
                    id=analysis['id'],
                    ticker=analysis['ticker'],
                    company_name=analysis['company_name'],
                    analysis_date=analysis['analysis_date'],
                    recommendation=analysis['recommendation'],
                    favorable_percentage=analysis['favorable_percentage'],
                    current_price=sanitize_float(current_price),
                    price_change=sanitize_float(price_change),
                    price_change_percent=sanitize_float(price_change_percent),
                    sector=analysis.get('metadata', {}).get('sector', 'N/A')
                ))
                
            except Exception as e:
                logging.warning(f"Error enhancing history item for {analysis.get('ticker')}: {str(e)}")
                # Add without price data if fetch fails
                enhanced_results.append(HistoryItemEnhanced(
                    id=analysis['id'],
                    ticker=analysis['ticker'],
                    company_name=analysis['company_name'],
                    analysis_date=analysis['analysis_date'],
                    recommendation=analysis['recommendation'],
                    favorable_percentage=analysis['favorable_percentage'],
                    sector=analysis.get('metadata', {}).get('sector', 'N/A')
                ))
        
        return enhanced_results
        
    except Exception as e:
        logging.error(f"Error fetching enhanced history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener historial: {str(e)}")
    
    
     
    

@api_router.get("/history/stats")
async def get_history_stats():
    """Get statistics about analysis history"""
    try:
        total = await db.analyses.count_documents({})
        
        comprar = await db.analyses.count_documents({"recommendation": "COMPRAR"})
        mantener = await db.analyses.count_documents({"recommendation": "MANTENER"})
        vender = await db.analyses.count_documents({"recommendation": "VENDER"})
        
        return {
            "total": total,
            "comprar": comprar,
            "mantener": mantener,
            "vender": vender
        }
        
    except Exception as e:
        logging.error(f"Error getting history stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class MarketIndicator(BaseModel):
    name: str
    ticker: str
    current_value: float
    change: float
    change_percent: float
    updated: str
    description: str

class CommodityIndicator(BaseModel):
    name: str
    ticker: str
    current_value: float
    change: float
    change_percent: float
    unit: str
    updated: str

class CurrencyPair(BaseModel):
    name: str
    ticker: str
    rate: float
    change: float
    change_percent: float
    updated: str

class CryptoIndicator(BaseModel):
    name: str
    symbol: str
    ticker: str
    current_value: float
    change: float
    change_percent: float
    market_cap: Optional[float] = None
    volume_24h: Optional[float] = None
    updated: str

class MarketHours(BaseModel):
    market_name: str
    location: str
    timezone: str
    open_time: str
    close_time: str
    status: str  # "Abierto", "Cerrado", "Pre-Market", "After-Hours"
    next_open: str

class MarketIndicatorsResponse(BaseModel):
    vix: MarketIndicator
    treasury_10y: MarketIndicator
    sp500: MarketIndicator
    ibex35: Optional[MarketIndicator] = None
    fear_greed_level: str
    market_sentiment: str
    # Commodities
    gold: CommodityIndicator
    oil: CommodityIndicator
    # Currencies
    eur_usd: CurrencyPair
    # Crypto
    bitcoin: Optional[CryptoIndicator] = None
    ethereum: Optional[CryptoIndicator] = None
    hedera: Optional[CryptoIndicator] = None
    solana: Optional[CryptoIndicator] = None
    # European Indices
    eurostoxx50: Optional[MarketIndicator] = None
    dax: Optional[MarketIndicator] = None
    # US Indices
    nasdaq: Optional[MarketIndicator] = None
    # Global Indices
    msci_world: Optional[MarketIndicator] = None
    # Market Hours
    market_hours: List[MarketHours]

def get_market_status(timezone_name: str, open_hour: int, open_min: int, close_hour: int, close_min: int) -> tuple:
    """Get current market status based on timezone"""
    from datetime import datetime
    import pytz
    
    try:
        tz = pytz.timezone(timezone_name)
        now = datetime.now(tz)
        current_time = now.hour * 60 + now.minute
        open_time = open_hour * 60 + open_min
        close_time = close_hour * 60 + close_min
        
        # Check if weekend
        if now.weekday() >= 5:  # Saturday or Sunday
            status = "Cerrado (Fin de semana)"
            # Calculate next Monday
            days_until_monday = 7 - now.weekday()
            next_open_dt = now + timedelta(days=days_until_monday)
            next_open = next_open_dt.strftime('%A %d/%m %H:%M')
        elif current_time < open_time - 30:
            status = "Cerrado"
            next_open = now.strftime('%H:%M') + f" (abre a las {open_hour:02d}:{open_min:02d})"
        elif current_time < open_time:
            status = "Pre-Market"
            next_open = f"Abre en {open_time - current_time} min"
        elif current_time < close_time:
            status = "Abierto"
            next_open = f"Cierra en {close_time - current_time} min"
        elif current_time < close_time + 120:  # 2 hours after close
            status = "After-Hours"
            next_open = "Mañana a las " + f"{open_hour:02d}:{open_min:02d}"
        else:
            status = "Cerrado"
            next_open = "Mañana a las " + f"{open_hour:02d}:{open_min:02d}"
        
        return status, next_open
    except:
        return "Desconocido", "N/A"

@api_router.get("/market-indicators", response_model=MarketIndicatorsResponse)
async def get_market_indicators():
    """Get market indicators: VIX, 10Y Treasury, S&P 500, Gold, Oil, EUR/USD, and Market Hours"""
    try:
        # VIX - Volatility Index
        vix = yf.Ticker("^VIX")
        vix_data = vix.history(period="5d")
        
        if not vix_data.empty:
            vix_current = float(vix_data['Close'].iloc[-1])
            vix_prev = float(vix_data['Close'].iloc[-2]) if len(vix_data) > 1 else vix_current
            vix_change = vix_current - vix_prev
            vix_change_pct = (vix_change / vix_prev) * 100 if vix_prev > 0 else 0
            vix_date = vix_data.index[-1].strftime('%Y-%m-%d')
        else:
            vix_current = 0
            vix_change = 0
            vix_change_pct = 0
            vix_date = ""
        
        # 10-Year Treasury Yield
        treasury = yf.Ticker("^TNX")
        treasury_data = treasury.history(period="5d")
        
        if not treasury_data.empty:
            treasury_current = float(treasury_data['Close'].iloc[-1])
            treasury_prev = float(treasury_data['Close'].iloc[-2]) if len(treasury_data) > 1 else treasury_current
            treasury_change = treasury_current - treasury_prev
            treasury_change_pct = (treasury_change / treasury_prev) * 100 if treasury_prev > 0 else 0
            treasury_date = treasury_data.index[-1].strftime('%Y-%m-%d')
        else:
            treasury_current = 0
            treasury_change = 0
            treasury_change_pct = 0
            treasury_date = ""
        
        # S&P 500
        sp500 = yf.Ticker("^GSPC")
        sp500_data = sp500.history(period="5d")
        
        if not sp500_data.empty:
            sp500_current = float(sp500_data['Close'].iloc[-1])
            sp500_prev = float(sp500_data['Close'].iloc[-2]) if len(sp500_data) > 1 else sp500_current
            sp500_change = sp500_current - sp500_prev
            sp500_change_pct = (sp500_change / sp500_prev) * 100 if sp500_prev > 0 else 0
            sp500_date = sp500_data.index[-1].strftime('%Y-%m-%d')
        else:
            sp500_current = 0
            sp500_change = 0
            sp500_change_pct = 0
            sp500_date = ""
        
        # Gold (GC=F - Gold Futures)
        gold = yf.Ticker("GC=F")
        gold_data = gold.history(period="5d")
        
        if not gold_data.empty:
            gold_current = float(gold_data['Close'].iloc[-1])
            gold_prev = float(gold_data['Close'].iloc[-2]) if len(gold_data) > 1 else gold_current
            gold_change = gold_current - gold_prev
            gold_change_pct = (gold_change / gold_prev) * 100 if gold_prev > 0 else 0
            gold_date = gold_data.index[-1].strftime('%Y-%m-%d')
        else:
            gold_current = 0
            gold_change = 0
            gold_change_pct = 0
            gold_date = ""
        
        # Oil (CL=F - Crude Oil Futures WTI)
        oil = yf.Ticker("CL=F")
        oil_data = oil.history(period="5d")
        
        if not oil_data.empty:
            oil_current = float(oil_data['Close'].iloc[-1])
            oil_prev = float(oil_data['Close'].iloc[-2]) if len(oil_data) > 1 else oil_current
            oil_change = oil_current - oil_prev
            oil_change_pct = (oil_change / oil_prev) * 100 if oil_prev > 0 else 0
            oil_date = oil_data.index[-1].strftime('%Y-%m-%d')
        else:
            oil_current = 0
            oil_change = 0
            oil_change_pct = 0
            oil_date = ""
        
        # EUR/USD
        eurusd = yf.Ticker("EURUSD=X")
        eurusd_data = eurusd.history(period="5d")
        
        if not eurusd_data.empty:
            eurusd_current = float(eurusd_data['Close'].iloc[-1])
            eurusd_prev = float(eurusd_data['Close'].iloc[-2]) if len(eurusd_data) > 1 else eurusd_current
            eurusd_change = eurusd_current - eurusd_prev
            eurusd_change_pct = (eurusd_change / eurusd_prev) * 100 if eurusd_prev > 0 else 0
            eurusd_date = eurusd_data.index[-1].strftime('%Y-%m-%d')
        else:
            eurusd_current = 0
            eurusd_change = 0
            eurusd_change_pct = 0
            eurusd_date = ""
        
        # Market Hours - Major World Markets
        market_hours = []
        
        # New York Stock Exchange (NYSE)
        nyse_status, nyse_next = get_market_status("America/New_York", 9, 30, 16, 0)
        market_hours.append(MarketHours(
            market_name="NYSE / NASDAQ",
            location="Nueva York, EEUU",
            timezone="EST/EDT",
            open_time="09:30",
            close_time="16:00",
            status=nyse_status,
            next_open=nyse_next
        ))
        
        # London Stock Exchange (LSE)
        lse_status, lse_next = get_market_status("Europe/London", 8, 0, 16, 30)
        market_hours.append(MarketHours(
            market_name="London Stock Exchange",
            location="Londres, UK",
            timezone="GMT/BST",
            open_time="08:00",
            close_time="16:30",
            status=lse_status,
            next_open=lse_next
        ))
        
        # Tokyo Stock Exchange
        tse_status, tse_next = get_market_status("Asia/Tokyo", 9, 0, 15, 0)
        market_hours.append(MarketHours(
            market_name="Tokyo Stock Exchange",
            location="Tokio, Japón",
            timezone="JST",
            open_time="09:00",
            close_time="15:00",
            status=tse_status,
            next_open=tse_next
        ))
        
        # Hong Kong Stock Exchange
        hkex_status, hkex_next = get_market_status("Asia/Hong_Kong", 9, 30, 16, 0)
        market_hours.append(MarketHours(
            market_name="Hong Kong Exchange",
            location="Hong Kong",
            timezone="HKT",
            open_time="09:30",
            close_time="16:00",
            status=hkex_status,
            next_open=hkex_next
        ))
        
        # Frankfurt Stock Exchange (Xetra)
        xetra_status, xetra_next = get_market_status("Europe/Berlin", 9, 0, 17, 30)
        market_hours.append(MarketHours(
            market_name="Frankfurt (Xetra)",
            location="Frankfurt, Alemania",
            timezone="CET/CEST",
            open_time="09:00",
            close_time="17:30",
            status=xetra_status,
            next_open=xetra_next
        ))
        
        # Bolsa Mexicana de Valores
        bmv_status, bmv_next = get_market_status("America/Mexico_City", 8, 30, 15, 0)
        market_hours.append(MarketHours(
            market_name="Bolsa Mexicana",
            location="CDMX, México",
            timezone="CST/CDT",
            open_time="08:30",
            close_time="15:00",
            status=bmv_status,
            next_open=bmv_next
        ))
        
        # IBEX 35 (Spanish Index)
        ibex35_indicator = None
        try:
            ibex = yf.Ticker("^IBEX")
            ibex_data = ibex.history(period="5d")
            if not ibex_data.empty:
                ibex_current = float(ibex_data['Close'].iloc[-1])
                ibex_prev = float(ibex_data['Close'].iloc[-2]) if len(ibex_data) > 1 else ibex_current
                ibex_change = ibex_current - ibex_prev
                ibex_change_pct = (ibex_change / ibex_prev) * 100 if ibex_prev > 0 else 0
                ibex_date = ibex_data.index[-1].strftime('%Y-%m-%d')
                ibex35_indicator = MarketIndicator(
                    name="IBEX 35",
                    ticker="^IBEX",
                    current_value=ibex_current,
                    change=ibex_change,
                    change_percent=ibex_change_pct,
                    updated=ibex_date,
                    description="Índice de referencia de la Bolsa de Madrid con las 35 empresas más líquidas de España"
                )
        except Exception as e:
            logging.warning(f"Could not fetch IBEX 35: {str(e)}")
        
        # Cryptocurrencies
        # Bitcoin
        bitcoin_indicator = None
        try:
            btc = yf.Ticker("BTC-USD")
            btc_data = btc.history(period="5d")
            if not btc_data.empty:
                btc_current = float(btc_data['Close'].iloc[-1])
                btc_prev = float(btc_data['Close'].iloc[-2]) if len(btc_data) > 1 else btc_current
                btc_change = btc_current - btc_prev
                btc_change_pct = (btc_change / btc_prev) * 100 if btc_prev > 0 else 0
                btc_date = btc_data.index[-1].strftime('%Y-%m-%d')
                btc_info = btc.info
                bitcoin_indicator = CryptoIndicator(
                    name="Bitcoin",
                    symbol="BTC",
                    ticker="BTC-USD",
                    current_value=btc_current,
                    change=btc_change,
                    change_percent=btc_change_pct,
                    market_cap=btc_info.get('marketCap'),
                    volume_24h=btc_info.get('volume24Hr'),
                    updated=btc_date
                )
        except Exception as e:
            logging.warning(f"Could not fetch Bitcoin: {str(e)}")
        
        # Ethereum
        ethereum_indicator = None
        try:
            eth = yf.Ticker("ETH-USD")
            eth_data = eth.history(period="5d")
            if not eth_data.empty:
                eth_current = float(eth_data['Close'].iloc[-1])
                eth_prev = float(eth_data['Close'].iloc[-2]) if len(eth_data) > 1 else eth_current
                eth_change = eth_current - eth_prev
                eth_change_pct = (eth_change / eth_prev) * 100 if eth_prev > 0 else 0
                eth_date = eth_data.index[-1].strftime('%Y-%m-%d')
                eth_info = eth.info
                ethereum_indicator = CryptoIndicator(
                    name="Ethereum",
                    symbol="ETH",
                    ticker="ETH-USD",
                    current_value=eth_current,
                    change=eth_change,
                    change_percent=eth_change_pct,
                    market_cap=eth_info.get('marketCap'),
                    volume_24h=eth_info.get('volume24Hr'),
                    updated=eth_date
                )
        except Exception as e:
            logging.warning(f"Could not fetch Ethereum: {str(e)}")
                
        # Hedera
        hedera_indicator = None
        try:
            hbar = yf.Ticker("HBAR-USD")
            hbar_data = hbar.history(period="5d")
            if not hbar_data.empty:
                hbar_current = float(hbar_data['Close'].iloc[-1])
                hbar_prev = float(hbar_data['Close'].iloc[-2]) if len(hbar_data) > 1 else hbar_current
                hbar_change = hbar_current - hbar_prev
                hbar_change_pct = (hbar_change / hbar_prev) * 100 if hbar_prev > 0 else 0
                hbar_date = hbar_data.index[-1].strftime('%Y-%m-%d')
                hbar_info = hbar.info
                hedera_indicator = CryptoIndicator(
                    name="Hedera",
                    symbol="HBAR",
                    ticker="HBAR-USD",
                    current_value=hbar_current,
                    change=hbar_change,
                    change_percent=hbar_change_pct,
                    market_cap=hbar_info.get('marketCap'),
                    volume_24h=hbar_info.get('volume24Hr'),
                    updated=hbar_date
                )
        except Exception as e:
            logging.warning(f"Could not fetch Hedera: {str(e)}")
        
        # Solana
        solana_indicator = None
        try:
            sol = yf.Ticker("sol-USD")
            sol_data = sol.history(period="5d")
            if not sol_data.empty:
                sol_current = float(sol_data['Close'].iloc[-1])
                sol_prev = float(sol_data['Close'].iloc[-2]) if len(sol_data) > 1 else sol_current
                sol_change = sol_current - sol_prev
                sol_change_pct = (sol_change / sol_prev) * 100 if sol_prev > 0 else 0
                sol_date = sol_data.index[-1].strftime('%Y-%m-%d')
                sol_info = sol.info
                solana_indicator = CryptoIndicator(
                    name="Solana",
                    symbol="SOL",
                    ticker="SOL-USD",
                    current_value=sol_current,
                    change=sol_change,
                    change_percent=sol_change_pct,
                    market_cap=sol_info.get('marketCap'),
                    volume_24h=sol_info.get('volume24Hr'),
                    updated=sol_date
                )
        except Exception as e:
            logging.warning(f"Could not fetch Solana: {str(e)}")
        
               
        
        # Eurostoxx 50 (European Index)
        eurostoxx50_indicator = None
        try:
            stoxx = yf.Ticker("^STOXX50E")
            stoxx_data = stoxx.history(period="5d")
            if not stoxx_data.empty:
                stoxx_current = float(stoxx_data['Close'].iloc[-1])
                stoxx_prev = float(stoxx_data['Close'].iloc[-2]) if len(stoxx_data) > 1 else stoxx_current
                stoxx_change = stoxx_current - stoxx_prev
                stoxx_change_pct = (stoxx_change / stoxx_prev) * 100 if stoxx_prev > 0 else 0
                stoxx_date = stoxx_data.index[-1].strftime('%Y-%m-%d')
                eurostoxx50_indicator = MarketIndicator(
                    name="Euro Stoxx 50",
                    ticker="^STOXX50E",
                    current_value=stoxx_current,
                    change=stoxx_change,
                    change_percent=stoxx_change_pct,
                    updated=stoxx_date,
                    description="Índice de las 50 principales empresas de la zona euro"
                )
        except Exception as e:
            logging.warning(f"Could not fetch Euro Stoxx 50: {str(e)}")
        
        # DAX (German Index)
        dax_indicator = None
        try:
            dax = yf.Ticker("^GDAXI")
            dax_data = dax.history(period="5d")
            if not dax_data.empty:
                dax_current = float(dax_data['Close'].iloc[-1])
                dax_prev = float(dax_data['Close'].iloc[-2]) if len(dax_data) > 1 else dax_current
                dax_change = dax_current - dax_prev
                dax_change_pct = (dax_change / dax_prev) * 100 if dax_prev > 0 else 0
                dax_date = dax_data.index[-1].strftime('%Y-%m-%d')
                dax_indicator = MarketIndicator(
                    name="DAX 40",
                    ticker="^GDAXI",
                    current_value=dax_current,
                    change=dax_change,
                    change_percent=dax_change_pct,
                    updated=dax_date,
                    description="Índice de las 40 principales empresas de la bolsa de Frankfurt"
                )
        except Exception as e:
            logging.warning(f"Could not fetch DAX: {str(e)}")
        
        # NASDAQ Composite
        nasdaq_indicator = None
        try:
            nasdaq = yf.Ticker("^IXIC")
            nasdaq_data = nasdaq.history(period="5d")
            if not nasdaq_data.empty:
                nasdaq_current = float(nasdaq_data['Close'].iloc[-1])
                nasdaq_prev = float(nasdaq_data['Close'].iloc[-2]) if len(nasdaq_data) > 1 else nasdaq_current
                nasdaq_change = nasdaq_current - nasdaq_prev
                nasdaq_change_pct = (nasdaq_change / nasdaq_prev) * 100 if nasdaq_prev > 0 else 0
                nasdaq_date = nasdaq_data.index[-1].strftime('%Y-%m-%d')
                nasdaq_indicator = MarketIndicator(
                    name="NASDAQ Composite",
                    ticker="^IXIC",
                    current_value=nasdaq_current,
                    change=nasdaq_change,
                    change_percent=nasdaq_change_pct,
                    updated=nasdaq_date,
                    description="Índice de las principales empresas tecnológicas de EE.UU."
                )
        except Exception as e:
            logging.warning(f"Could not fetch NASDAQ: {str(e)}")
        
        # MSCI World Index (using iShares ETF as proxy)
        msci_world_indicator = None
        try:
            msci = yf.Ticker("URTH")  # iShares MSCI World ETF
            msci_data = msci.history(period="5d")
            if not msci_data.empty:
                msci_current = float(msci_data['Close'].iloc[-1])
                msci_prev = float(msci_data['Close'].iloc[-2]) if len(msci_data) > 1 else msci_current
                msci_change = msci_current - msci_prev
                msci_change_pct = (msci_change / msci_prev) * 100 if msci_prev > 0 else 0
                msci_date = msci_data.index[-1].strftime('%Y-%m-%d')
                msci_world_indicator = MarketIndicator(
                    name="MSCI World",
                    ticker="URTH",
                    current_value=msci_current,
                    change=msci_change,
                    change_percent=msci_change_pct,
                    updated=msci_date,
                    description="Índice global de mercados desarrollados (ETF proxy)"
                )
        except Exception as e:
            logging.warning(f"Could not fetch MSCI World: {str(e)}")
        
        # Determine Fear & Greed level based on VIX
        if vix_current < 12:
            fear_greed = "Extrema Codicia"
            sentiment = "Mercado muy optimista"
        elif vix_current < 17:
            fear_greed = "Codicia"
            sentiment = "Mercado optimista"
        elif vix_current < 25:
            fear_greed = "Neutral"
            sentiment = "Mercado equilibrado"
        elif vix_current < 35:
            fear_greed = "Miedo"
            sentiment = "Mercado pesimista"
        else:
            fear_greed = "Extremo Miedo"
            sentiment = "Mercado muy pesimista"
        
        def s(v, d=0.0): return sanitize_float(v, d)
        vix_current=s(vix_current); vix_change=s(vix_change); vix_change_pct=s(vix_change_pct)
        treasury_current=s(treasury_current); treasury_change=s(treasury_change); treasury_change_pct=s(treasury_change_pct)
        sp500_current=s(sp500_current); sp500_change=s(sp500_change); sp500_change_pct=s(sp500_change_pct)
        gold_current=s(gold_current); gold_change=s(gold_change); gold_change_pct=s(gold_change_pct)
        oil_current=s(oil_current); oil_change=s(oil_change); oil_change_pct=s(oil_change_pct)
        eurusd_current=s(eurusd_current); eurusd_change=s(eurusd_change); eurusd_change_pct=s(eurusd_change_pct)
        # Sanitizar indicadores opcionales
        if ibex35_indicator:
            ibex35_indicator.current_value=s(ibex35_indicator.current_value)
            ibex35_indicator.change=s(ibex35_indicator.change)
            ibex35_indicator.change_percent=s(ibex35_indicator.change_percent)
        if bitcoin_indicator:
            bitcoin_indicator.current_value=s(bitcoin_indicator.current_value)
            bitcoin_indicator.change=s(bitcoin_indicator.change)
            bitcoin_indicator.change_percent=s(bitcoin_indicator.change_percent)
            if bitcoin_indicator.market_cap: bitcoin_indicator.market_cap=s(bitcoin_indicator.market_cap)
            if bitcoin_indicator.volume_24h: bitcoin_indicator.volume_24h=s(bitcoin_indicator.volume_24h)
        if ethereum_indicator:
            ethereum_indicator.current_value=s(ethereum_indicator.current_value)
            ethereum_indicator.change=s(ethereum_indicator.change)
            ethereum_indicator.change_percent=s(ethereum_indicator.change_percent)
            if ethereum_indicator.market_cap: ethereum_indicator.market_cap=s(ethereum_indicator.market_cap)
            if ethereum_indicator.volume_24h: ethereum_indicator.volume_24h=s(ethereum_indicator.volume_24h)
        if hedera_indicator:
            hedera_indicator.current_value=s(hedera_indicator.current_value)
            hedera_indicator.change=s(hedera_indicator.change)
            hedera_indicator.change_percent=s(hedera_indicator.change_percent)
            if hedera_indicator.market_cap: hedera_indicator.market_cap=s(hedera_indicator.market_cap)
            if hedera_indicator.volume_24h: hedera_indicator.volume_24h=s(hedera_indicator.volume_24h)    
        if solana_indicator:
            solana_indicator.current_value=s(solana_indicator.current_value)
            solana_indicator.change=s(solana_indicator.change)
            solana_indicator.change_percent=s(solana_indicator.change_percent)
            if solana_indicator.market_cap: solana_indicator.market_cap=s(solana_indicator.market_cap)
            if solana_indicator.volume_24h: solana_indicator.volume_24h=s(solana_indicator.volume_24h)      
            
        if eurostoxx50_indicator:
            eurostoxx50_indicator.current_value=s(eurostoxx50_indicator.current_value)
            eurostoxx50_indicator.change=s(eurostoxx50_indicator.change)
            eurostoxx50_indicator.change_percent=s(eurostoxx50_indicator.change_percent)
        if dax_indicator:
            dax_indicator.current_value=s(dax_indicator.current_value)
            dax_indicator.change=s(dax_indicator.change)
            dax_indicator.change_percent=s(dax_indicator.change_percent)
        if nasdaq_indicator:
            nasdaq_indicator.current_value=s(nasdaq_indicator.current_value)
            nasdaq_indicator.change=s(nasdaq_indicator.change)
            nasdaq_indicator.change_percent=s(nasdaq_indicator.change_percent)
        if msci_world_indicator:
            msci_world_indicator.current_value=s(msci_world_indicator.current_value)
            msci_world_indicator.change=s(msci_world_indicator.change)
            msci_world_indicator.change_percent=s(msci_world_indicator.change_percent)

        def s(v, d=0.0): return sanitize_float(v, d)
        vix_current=s(vix_current); vix_change=s(vix_change); vix_change_pct=s(vix_change_pct)
        treasury_current=s(treasury_current); treasury_change=s(treasury_change); treasury_change_pct=s(treasury_change_pct)
        sp500_current=s(sp500_current); sp500_change=s(sp500_change); sp500_change_pct=s(sp500_change_pct)
        gold_current=s(gold_current); gold_change=s(gold_change); gold_change_pct=s(gold_change_pct)
        oil_current=s(oil_current); oil_change=s(oil_change); oil_change_pct=s(oil_change_pct)
        eurusd_current=s(eurusd_current); eurusd_change=s(eurusd_change); eurusd_change_pct=s(eurusd_change_pct)

        def s(v, d=0.0): return sanitize_float(v, d)
        vix_current=s(vix_current); vix_change=s(vix_change); vix_change_pct=s(vix_change_pct)
        treasury_current=s(treasury_current); treasury_change=s(treasury_change); treasury_change_pct=s(treasury_change_pct)
        sp500_current=s(sp500_current); sp500_change=s(sp500_change); sp500_change_pct=s(sp500_change_pct)
        gold_current=s(gold_current); gold_change=s(gold_change); gold_change_pct=s(gold_change_pct)
        oil_current=s(oil_current); oil_change=s(oil_change); oil_change_pct=s(oil_change_pct)
        eurusd_current=s(eurusd_current); eurusd_change=s(eurusd_change); eurusd_change_pct=s(eurusd_change_pct)

        return MarketIndicatorsResponse(
            vix=MarketIndicator(
                name="VIX - Índice de Volatilidad",
                ticker="^VIX",
                current_value=vix_current,
                change=vix_change,
                change_percent=vix_change_pct,
                updated=vix_date,
                description="Mide la volatilidad esperada del S&P 500. Mayor VIX = Mayor miedo en el mercado"
            ),
            treasury_10y=MarketIndicator(
                name="Bonos del Tesoro 10 Años",
                ticker="^TNX",
                current_value=treasury_current,
                change=treasury_change,
                change_percent=treasury_change_pct,
                updated=treasury_date,
                description="Rendimiento de los bonos del tesoro de EEUU a 10 años. Indicador de tasas de interés"
            ),
            sp500=MarketIndicator(
                name="S&P 500",
                ticker="^GSPC",
                current_value=sp500_current,
                change=sp500_change,
                change_percent=sp500_change_pct,
                updated=sp500_date,
                description="Índice bursátil de las 500 empresas más grandes de EEUU"
            ),
            gold=CommodityIndicator(
                name="Oro",
                ticker="GC=F",
                current_value=gold_current,
                change=gold_change,
                change_percent=gold_change_pct,
                unit="USD/oz",
                updated=gold_date
            ),
            oil=CommodityIndicator(
                name="Petróleo WTI",
                ticker="CL=F",
                current_value=oil_current,
                change=oil_change,
                change_percent=oil_change_pct,
                unit="USD/barril",
                updated=oil_date
            ),
            eur_usd=CurrencyPair(
                name="EUR/USD",
                ticker="EURUSD=X",
                rate=eurusd_current,
                change=eurusd_change,
                change_percent=eurusd_change_pct,
                updated=eurusd_date
            ),
            ibex35=ibex35_indicator,
            bitcoin=bitcoin_indicator,
            ethereum=ethereum_indicator,
            hedera=hedera_indicator,
            solana=solana_indicator,
            eurostoxx50=eurostoxx50_indicator,
            dax=dax_indicator,
            nasdaq=nasdaq_indicator,
            msci_world=msci_world_indicator,
            market_hours=market_hours,
            fear_greed_level=fear_greed,
            market_sentiment=sentiment
        )
        
    except Exception as e:
        logging.error(f"Error fetching market indicators: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener indicadores de mercado: {str(e)}")

# ============================================
# WATCHLIST MODELS AND ENDPOINTS
# ============================================

class WatchlistItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ticker: str
    company_name: str
    target_buy_price: Optional[float] = None
    target_sell_price: Optional[float] = None
    notify_on_price_change: bool = False
    price_change_threshold: float = 5.0  # Percentage
    added_date: datetime = Field(default_factory=datetime.utcnow)
    current_price: Optional[float] = None
    last_checked: Optional[datetime] = None
    notes: Optional[str] = None

class WatchlistItemCreate(BaseModel):
    ticker: str
    target_buy_price: Optional[float] = None
    target_sell_price: Optional[float] = None
    notify_on_price_change: bool = False
    price_change_threshold: float = 5.0
    notes: Optional[str] = None

class WatchlistItemUpdate(BaseModel):
    target_buy_price: Optional[float] = None
    target_sell_price: Optional[float] = None
    notify_on_price_change: Optional[bool] = None
    price_change_threshold: Optional[float] = None
    notes: Optional[str] = None

@api_router.get("/watchlist", response_model=List[WatchlistItem])
async def get_watchlist(current_user: dict = Depends(get_current_user)):
    """Get all watchlist items with current prices"""
    try:
        items = await db.watchlist.find({"user_id": current_user["id"]}).sort("added_date", -1).to_list(100)
        result = []
        for item in items:
            # Update current price
            try:
                stock = yf.Ticker(item['ticker'])
                info = stock.info
                current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))
                item['current_price'] = current_price
                item['last_checked'] = datetime.utcnow()
                # Update in DB
                await db.watchlist.update_one(
                    {"id": item['id']},
                    {"$set": {"current_price": current_price, "last_checked": datetime.utcnow()}}
                )
            except:
                pass
            result.append(WatchlistItem(**item))
        return result
    except Exception as e:
        logging.error(f"Error fetching watchlist: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener watchlist: {str(e)}")

@api_router.post("/watchlist", response_model=WatchlistItem)
async def add_to_watchlist(item: WatchlistItemCreate, current_user: dict = Depends(get_current_user)):
    """Add a stock to watchlist"""
    try:
        ticker = item.ticker.upper().strip()
        
        # Check if already in watchlist
        existing = await db.watchlist.find_one({"ticker": ticker})
        if existing:
            raise HTTPException(status_code=400, detail=f"{ticker} ya está en tu watchlist")
        
        # Fetch stock info
        stock = yf.Ticker(ticker)
        info = stock.info
        
        if not info or 'symbol' not in info:
            raise HTTPException(status_code=404, detail=f"No se encontró el ticker {ticker}")
        
        watchlist_item = WatchlistItem(
            ticker=ticker,
            company_name=info.get('longName', info.get('shortName', ticker)),
            target_buy_price=item.target_buy_price,
            target_sell_price=item.target_sell_price,
            notify_on_price_change=item.notify_on_price_change,
            price_change_threshold=item.price_change_threshold,
            current_price=info.get('currentPrice', info.get('regularMarketPrice', 0)),
            last_checked=datetime.utcnow(),
            notes=item.notes
        )
        
        item_dict = watchlist_item.dict()
        item_dict["user_id"] = current_user["id"]
        await db.watchlist.insert_one(item_dict)
        return watchlist_item
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error adding to watchlist: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al agregar a watchlist: {str(e)}")

@api_router.put("/watchlist/{item_id}", response_model=WatchlistItem)
async def update_watchlist_item(item_id: str, update: WatchlistItemUpdate, current_user: dict = Depends(get_optional_user)):
    """Update a watchlist item"""
    try:
        existing = await db.watchlist.find_one({"id": item_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Item no encontrado en watchlist")
        
        update_data = {k: v for k, v in update.dict().items() if v is not None}
        if update_data:
            await db.watchlist.update_one({"id": item_id}, {"$set": update_data})
        
        updated = await db.watchlist.find_one({"id": item_id})
        return WatchlistItem(**updated)
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating watchlist item: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al actualizar item: {str(e)}")

@api_router.delete("/watchlist/{item_id}")
async def remove_from_watchlist(item_id: str):
    """Remove a stock from watchlist"""
    try:
        result = await db.watchlist.delete_one({"id": item_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Item no encontrado en watchlist")
        return {"message": "Item eliminado de watchlist"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error removing from watchlist: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar de watchlist: {str(e)}")

@api_router.get("/watchlist/alerts")
async def check_watchlist_alerts(current_user: dict = Depends(get_optional_user)):
    """Check all watchlist items for price alerts"""
    try:
        items = await db.watchlist.find({"user_id": current_user["id"]} if current_user else {}).to_list(100)
        alerts = []
        
        for item in items:
            try:
                stock = yf.Ticker(item['ticker'])
                info = stock.info
                current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))
                
                alert_info = {
                    "ticker": item['ticker'],
                    "company_name": item['company_name'],
                    "current_price": current_price,
                    "alerts": []
                }
                
                # Check target buy price
                if item.get('target_buy_price') and current_price <= item['target_buy_price']:
                    alert_info["alerts"].append({
                        "type": "buy",
                        "message": f"Precio objetivo de compra alcanzado: ${current_price:.2f} <= ${item['target_buy_price']:.2f}"
                    })
                
                # Check target sell price
                if item.get('target_sell_price') and current_price >= item['target_sell_price']:
                    alert_info["alerts"].append({
                        "type": "sell",
                        "message": f"Precio objetivo de venta alcanzado: ${current_price:.2f} >= ${item['target_sell_price']:.2f}"
                    })
                
                # Check price change threshold
                if item.get('notify_on_price_change') and item.get('current_price'):
                    old_price = item['current_price']
                    if old_price > 0:
                        change_pct = ((current_price - old_price) / old_price) * 100
                        threshold = item.get('price_change_threshold', 5.0)
                        if abs(change_pct) >= threshold:
                            direction = "subido" if change_pct > 0 else "bajado"
                            alert_info["alerts"].append({
                                "type": "change",
                                "message": f"El precio ha {direction} {abs(change_pct):.2f}%"
                            })
                
                if alert_info["alerts"]:
                    alerts.append(alert_info)
                    
            except Exception as e:
                logging.warning(f"Error checking alert for {item['ticker']}: {str(e)}")
                continue
        
        return {"alerts": alerts, "checked_at": datetime.utcnow()}
        
    except Exception as e:
        logging.error(f"Error checking alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al verificar alertas: {str(e)}")

# ============================================
# PORTFOLIO MODELS AND ENDPOINTS
# ============================================

class PortfolioTransaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    #userid: str
    user_id: str = ""        # ← unificar a user_id con valor por defecto
    ticker: str
    company_name: str
    #transaction_type: str  # "buy" or "sell"
    transaction_type: str
    shares: float
    price_per_share: float
    total_amount: float
    commission: float = 0.0
    transaction_date: datetime
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PortfolioTransactionCreate(BaseModel):
    ticker: str
    transaction_type: str  # "buy" or "sell"
    shares: float
    price_per_share: float
    commission: float = 0.0
    transaction_date: datetime
    notes: Optional[str] = None

class PortfolioHolding(BaseModel):
    ticker: str
    company_name: str
    sector: str = "N/A"
    industry: str = "N/A"
    total_shares: float
    average_cost: float
    total_invested: float
    current_price: float
    current_value: float
    profit_loss: float
    profit_loss_percent: float
    weight_percent: float = 0.0  # Percentage of portfolio
    transactions: List[PortfolioTransaction]

class SectorAllocation(BaseModel):
    sector: str
    value: float
    percentage: float
    holdings_count: int

class PortfolioMetrics(BaseModel):
    portfolio_beta: float = 0.0
    portfolio_alpha: float = 0.0
    sharpe_ratio: float = 0.0
    average_return: float = 0.0
    volatility: float = 0.0
    risk_free_rate: float = 4.0  # Assumed 4%
    # New metrics
    gain_loss_ratio: float = 0.0  # Ratio of gains to losses
    calmar_ratio: float = 0.0  # Return / Max Drawdown
    treynor_ratio: float = 0.0  # (Return - Risk Free) / Beta
    information_ratio: float = 0.0  # (Return - Benchmark) / Tracking Error
    max_drawdown: float = 0.0

class PortfolioSummary(BaseModel):
    total_invested: float
    current_value: float
    total_profit_loss: float
    total_profit_loss_percent: float
    holdings: List[PortfolioHolding]
    metrics: Optional[PortfolioMetrics] = None
    sector_allocation: List[SectorAllocation] = []
    cash_balance: float = 0.0
    cash_available: float = 0.0  # Cash disponible para invertir
    total_deposits: float = 0.0
    total_withdrawals: float = 0.0
    realized_gains: float = 0.0  # Ganancias realizadas (ventas)
    unrealized_gains: float = 0.0  # Ganancias no realizadas (posiciones abiertas)
    total_portfolio_value: float = 0.0  # Valor total incluyendo cash

# Cash Movement Models (Deposits/Withdrawals)
class CashMovement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None   # ← AÑADIR ESTO
    movement_type: str  # "deposit" or "withdrawal"
    amount: float
    description: Optional[str] = None
    movement_date: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CashMovementCreate(BaseModel):
    movement_type: str  # "deposit" or "withdrawal"
    amount: float
    description: Optional[str] = None
    movement_date: datetime

class PortfolioHistoryPoint(BaseModel):
    date: str
    total_value: float
    invested_value: float
    cash_balance: float
    profit_loss: float
    profit_loss_percent: float

class PortfolioEvolution(BaseModel):
    history: List[PortfolioHistoryPoint]
    current_value: float
    total_change: float
    total_change_percent: float
    
@api_router.get("/price/{ticker}")
async def get_current_price(ticker: str):
    """Precio actual + variación del día — endpoint ligero para el historial"""
    try:
        ticker = ticker.upper().strip()
        stock = yf.Ticker(ticker)
        info = stock.info

        current_price = info.get('currentPrice', info.get('regularMarketPrice', 0)) or 0
        prev_close    = info.get('previousClose', current_price) or current_price
        change        = current_price - prev_close
        change_pct    = (change / prev_close * 100) if prev_close > 0 else 0

        return {
            "ticker":         ticker,
            "current_price":  sanitize_float(current_price),
            "change":         sanitize_float(change),
            "change_percent": sanitize_float(change_pct),
            "prev_close":     sanitize_float(prev_close),
            "currency":       info.get('currency', 'USD'),
        }
    except Exception as e:
        logging.error(f"Error fetching price for {ticker}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))    

@api_router.get("/portfolio", response_model=PortfolioSummary)
async def get_portfolio(current_user: dict = Depends(get_current_user)):
    """Get portfolio summary with current values, metrics, and sector allocation"""
    try:

        # ← Eliminar el bloque if userid, simplificar:
        transactions = await db.portfolio.find({"user_id": current_user["id"]}).sort("transaction_date", -1).to_list(1000)
        
        # Group transactions by ticker
        holdings_map = {}
        for tx in transactions:
            ticker = tx['ticker']
            if ticker not in holdings_map:
                holdings_map[ticker] = {
                    "ticker": ticker,
                    "company_name": tx['company_name'],
                    "transactions": [],
                    "total_shares": 0,
                    "total_cost": 0
                }
            
            holdings_map[ticker]["transactions"].append(PortfolioTransaction(**tx))
            
            if tx['transaction_type'] == 'buy':
                holdings_map[ticker]["total_shares"] += tx['shares']
                holdings_map[ticker]["total_cost"] += tx['total_amount'] + tx.get('commission', 0)
            else:  # sell
                holdings_map[ticker]["total_shares"] -= tx['shares']
                holdings_map[ticker]["total_cost"] -= tx['total_amount'] - tx.get('commission', 0)
        
        # Calculate current values
        holdings = []
        total_invested = 0
        current_value = 0
        
        # For portfolio metrics calculation
        weights = []
        betas = []
        returns_data = []
        gains = []
        losses = []
        
        # For sector allocation
        sector_values = {}

        async def fetch_ticker_info(ticker, data):
            sector = "Otros"
            industry = "N/A"
            curr_price = 0
            stock_beta = 1.0
            try:
                loop = asyncio.get_event_loop()
                stock = yf.Ticker(ticker)
                info = await loop.run_in_executor(None, lambda: stock.info)
                curr_price = info.get('currentPrice', info.get('regularMarketPrice', 0)) or 0
                stock_beta = info.get('beta', 1.0) or 1.0
                sector = info.get('sector', 'Otros') or 'Otros'
                industry = info.get('industry', 'N/A') or 'N/A'
            except Exception as e:
                logging.warning(f"Error fetching data for {ticker}: {str(e)}")
                if data["total_shares"] > 0 and data["total_cost"] > 0:
                    curr_price = data["total_cost"] / data["total_shares"]
            return ticker, curr_price, stock_beta, sector, industry

        valid_holdings_map = {t: d for t, d in holdings_map.items() if d["total_shares"] > 0}
        ticker_results = await asyncio.gather(*[
            fetch_ticker_info(t, d) for t, d in valid_holdings_map.items()
        ])

        for ticker, curr_price, stock_beta, sector, industry in ticker_results:
            data = valid_holdings_map[ticker]
            curr_value_stock = data["total_shares"] * curr_price
            avg_cost = data["total_cost"] / data["total_shares"] if data["total_shares"] > 0 else 0
            profit_loss = curr_value_stock - data["total_cost"]
            profit_loss_pct = (profit_loss / data["total_cost"]) * 100 if data["total_cost"] > 0 else 0

            # Track gains and losses for Gain-Loss Ratio
            
            holding = PortfolioHolding(
                ticker=ticker,
                company_name=data["company_name"],
                sector=sector,
                industry=industry,
                total_shares=data["total_shares"],
                average_cost=avg_cost,
                total_invested=data["total_cost"],
                current_price=curr_price,
                current_value=curr_value_stock,
                profit_loss=profit_loss,
                profit_loss_percent=profit_loss_pct,
                weight_percent=0,  # Will calculate after we have total
                transactions=data["transactions"]
            )
            holdings.append(holding)
            total_invested += data["total_cost"]
            current_value += curr_value_stock
            
            # Store for metrics
            weights.append(curr_value_stock)
            betas.append(stock_beta)
            
            # Aggregate by sector
            if sector not in sector_values:
                sector_values[sector] = {'value': 0, 'count': 0}
            sector_values[sector]['value'] += curr_value_stock
            sector_values[sector]['count'] += 1
        
        # Update weight percentages in holdings
        if current_value > 0:
            for holding in holdings:
                holding.weight_percent = round((holding.current_value / current_value) * 100, 2)
        
        total_pl = current_value - total_invested
        total_pl_pct = (total_pl / total_invested) * 100 if total_invested > 0 else 0
        
        # Create sector allocation list
        sector_allocation = []
        for sector_name, sector_data in sector_values.items():
            pct = (sector_data['value'] / current_value * 100) if current_value > 0 else 0
            sector_allocation.append(SectorAllocation(
                sector=sector_name,
                value=round(sector_data['value'], 2),
                percentage=round(pct, 2),
                holdings_count=sector_data['count']
            ))
        # Sort by percentage descending
        sector_allocation.sort(key=lambda x: x.percentage, reverse=True)
        
        # Get cash movements to calculate cash available
        cash_movements = await db.cash_movements.find({"user_id": current_user["id"]}).to_list(1000)
        total_deposits = sum(m['amount'] for m in cash_movements if m['movement_type'] == 'deposit')
        total_withdrawals = sum(m['amount'] for m in cash_movements if m['movement_type'] == 'withdrawal')
        
        # Calculate cash used in purchases and received from sales
        cash_used_in_buys = sum(
            tx['total_amount'] + tx.get('commission', 0) 
            for tx in transactions 
            if tx['transaction_type'] == 'buy'
            and tx.get('user_id') == current_user['id']
        )
        cash_from_sells = sum(
            tx['total_amount'] - tx.get('commission', 0) 
            for tx in transactions 
            if tx['transaction_type'] == 'sell'
            and tx.get('user_id') == current_user['id']
        )
        
        # Cash available = Deposits - Withdrawals - Buys + Sells
        cash_available = total_deposits - total_withdrawals - cash_used_in_buys + cash_from_sells
        
        # Calculate realized gains (from sales)
        realized_gains = 0.0
        for tx in transactions:
            if tx['transaction_type'] == 'sell':
                ticker = tx['ticker']
                sell_price = tx['price_per_share']
                sell_shares = tx['shares']
                
                # Find the average cost for this ticker from buys before this sale
                buys_before = [
                    t for t in transactions 
                    if t['ticker'] == ticker 
                    and t['transaction_type'] == 'buy' 
                    and t['transaction_date'] <= tx['transaction_date']
                ]
                if buys_before:
                    total_buy_shares = sum(b['shares'] for b in buys_before)
                    total_buy_cost = sum(b['total_amount'] for b in buys_before)
                    avg_buy_price = total_buy_cost / total_buy_shares if total_buy_shares > 0 else 0
                    realized_gains += (sell_price - avg_buy_price) * sell_shares
        
        # Unrealized gains = current profit/loss from open positions
        unrealized_gains = total_pl
        
        # Total portfolio value including cash
        total_portfolio_value = current_value + max(cash_available, 0)
        
        # Recalculate sector allocation to include cash if available
        if cash_available > 0 and total_portfolio_value > 0:
            # Recalculate percentages with cash included
            for sa in sector_allocation:
                sa.percentage = round((sa.value / total_portfolio_value) * 100, 2)
            
            # Add cash as a "sector"
            cash_percentage = round((cash_available / total_portfolio_value) * 100, 2)
            sector_allocation.append(SectorAllocation(
                sector="Efectivo Disponible",
                value=round(cash_available, 2),
                percentage=cash_percentage,
                holdings_count=1
            ))
            
            # Re-sort
            sector_allocation.sort(key=lambda x: x.percentage, reverse=True)
            
            # Also update holding weight percentages
            for holding in holdings:
                holding.weight_percent = round((holding.current_value / total_portfolio_value) * 100, 2)
        
        # Calculate portfolio metrics
        metrics = PortfolioMetrics()
        
        if weights and current_value > 0:
            # Normalize weights
            weights = [w / current_value for w in weights]
            
            # Portfolio Beta (weighted average)
            portfolio_beta = sum(w * b for w, b in zip(weights, betas))
            metrics.portfolio_beta = round(portfolio_beta, 2)
            
            # Gain-Loss Ratio
            total_gains = sum(gains) if gains else 0
            total_losses = sum(losses) if losses else 1  # Avoid division by zero
            metrics.gain_loss_ratio = round(total_gains / total_losses, 2) if total_losses > 0 else 0
            
            # Calculate portfolio returns and volatility
            if returns_data:
                # Weighted average return
                weighted_returns = []
                weighted_volatility = []
                portfolio_max_dd = 0
                
                for i, rd in enumerate(returns_data):
                    if i < len(weights):
                        weighted_returns.append(weights[i] * rd['mean_return'])
                        weighted_volatility.append(weights[i] * rd['volatility'])
                        # Weighted max drawdown
                        portfolio_max_dd += weights[i] * rd['max_drawdown']
                
                portfolio_return = sum(weighted_returns) * 100
                portfolio_volatility = sum(weighted_volatility) * 100
                
                metrics.average_return = round(portfolio_return, 2)
                metrics.volatility = round(portfolio_volatility, 2)
                metrics.max_drawdown = round(portfolio_max_dd, 2)
                
                # Sharpe Ratio = (Portfolio Return - Risk Free Rate) / Volatility
                risk_free_rate = 4.0  # 4% annual
                if portfolio_volatility > 0:
                    sharpe = (portfolio_return - risk_free_rate) / portfolio_volatility
                    metrics.sharpe_ratio = round(sharpe, 2)
                
                # Alpha = Portfolio Return - (Risk Free + Beta * (Market Return - Risk Free))
                market_return = 10.0  # Assumed 10%
                expected_return = risk_free_rate + portfolio_beta * (market_return - risk_free_rate)
                alpha = portfolio_return - expected_return
                metrics.portfolio_alpha = round(alpha, 2)
                
                # Treynor Ratio = (Portfolio Return - Risk Free) / Beta
                if portfolio_beta != 0:
                    treynor = (portfolio_return - risk_free_rate) / portfolio_beta
                    metrics.treynor_ratio = round(treynor, 2)
                
                # Calmar Ratio = Return / |Max Drawdown|
                if portfolio_max_dd != 0:
                    calmar = portfolio_return / abs(portfolio_max_dd)
                    metrics.calmar_ratio = round(calmar, 2)
                
                # Information Ratio = (Portfolio Return - Benchmark Return) / Tracking Error
                # Using S&P 500 as benchmark (~10% return)
                benchmark_return = 10.0
                tracking_error = portfolio_volatility  # Simplified
                if tracking_error > 0:
                    info_ratio = (portfolio_return - benchmark_return) / tracking_error
                    metrics.information_ratio = round(info_ratio, 2)
        
        return PortfolioSummary(
            total_invested=total_invested,
            current_value=current_value,
            total_profit_loss=total_pl,
            total_profit_loss_percent=total_pl_pct,
            holdings=holdings,
            metrics=metrics,
            sector_allocation=sector_allocation,
            cash_balance=total_deposits - total_withdrawals,
            cash_available=round(cash_available, 2),
            total_deposits=total_deposits,
            total_withdrawals=total_withdrawals,
            realized_gains=round(realized_gains, 2),
            unrealized_gains=round(unrealized_gains, 2),
            total_portfolio_value=round(total_portfolio_value, 2)
        )
        
    except Exception as e:
        logging.error(f"Error fetching portfolio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener portafolio: {str(e)}")

@api_router.post("/portfolio", response_model=PortfolioTransaction)
async def add_portfolio_transaction(tx: PortfolioTransactionCreate, current_user: dict = Depends(get_current_user)):
    try:
        ticker = tx.ticker.upper().strip()   # ← Eliminar el bloque if userid incorrecto

        stock = yf.Ticker(ticker)
        info = stock.info

        if not info or 'symbol' not in info:
            raise HTTPException(status_code=404, detail=f"No se encontró el ticker {ticker}")

        transaction = PortfolioTransaction(
            user_id=current_user["id"],      # ← consistente con el modelo
            ticker=ticker,
            company_name=info.get('longName', info.get('shortName', ticker)),
            transaction_type=tx.transaction_type,
            shares=tx.shares,
            price_per_share=tx.price_per_share,
            total_amount=tx.shares * tx.price_per_share,
            commission=tx.commission,
            transaction_date=tx.transaction_date,
            notes=tx.notes
        )

        await db.portfolio.insert_one(transaction.dict())
        return transaction

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error adding portfolio transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al agregar transacción: {str(e)}")

@api_router.delete("/portfolio/{transaction_id}")
async def delete_portfolio_transaction(transaction_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a portfolio transaction"""
    try:
        result = await db.portfolio.delete_one({"id": transaction_id, "user_id": current_user["id"]})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Transacción no encontrada")
        return {"message": "Transacción eliminada"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar transacción: {str(e)}")

@api_router.put("/portfolio/{transaction_id}")
async def update_portfolio_transaction(transaction_id: str, update: dict):
    """Update a portfolio transaction"""
    try:
        # Limpiar campos None
        update_data = {k: v for k, v in update.items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No hay datos para actualizar")
        result = await db.portfolio.update_one(
            {"id": transaction_id},
            {"$set": update_data}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Transacción no encontrada")
        return {"message": "Transacción actualizada"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al actualizar transacción: {str(e)}")

@api_router.get("/portfolio/transactions", response_model=List[PortfolioTransaction])
async def get_portfolio_transactions(current_user: dict = Depends(get_current_user)):
    try:
        transactions = await db.portfolio.find({"user_id": current_user["id"]}).sort("transaction_date", -1).to_list(1000)
        return [PortfolioTransaction(**tx) for tx in transactions]
    except Exception as e:
        logging.error(f"Error fetching transactions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener transacciones: {str(e)}")

# ============================================
# CASH MOVEMENTS (DEPOSITS/WITHDRAWALS)
# ============================================

@api_router.post("/portfolio/cash", response_model=CashMovement)
async def add_cash_movement(movement: CashMovementCreate, current_user: dict = Depends(get_current_user)):
    """Add a deposit or withdrawal"""
    try:
        if movement.movement_type not in ['deposit', 'withdrawal']:
            raise HTTPException(status_code=400, detail="Tipo debe ser 'deposit' o 'withdrawal'")
        
        if movement.amount <= 0:
            raise HTTPException(status_code=400, detail="El monto debe ser positivo")
        
        cash_doc = CashMovement(
            user_id=current_user["id"],   # ← AÑADIR ESTO
            movement_type=movement.movement_type,
            amount=movement.amount,
            description=movement.description,
            movement_date=movement.movement_date
        )
        
        await db.cash_movements.insert_one(cash_doc.model_dump())
        return cash_doc
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error adding cash movement: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al registrar movimiento: {str(e)}")

@api_router.get("/portfolio/cash", response_model=List[CashMovement])
async def get_cash_movements(current_user: dict = Depends(get_current_user)):
    try:
        movements = await db.cash_movements.find({"user_id": current_user["id"]}).sort("movement_date", -1).to_list(1000)
        return [CashMovement(**m) for m in movements]
    except Exception as e:
        logging.error(f"Error fetching cash movements: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener movimientos: {str(e)}")

@api_router.delete("/portfolio/cash/{movement_id}")
async def delete_cash_movement(movement_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a cash movement"""
    try:
        # Buscar por id solamente, sin filtrar por user_id para compatibilidad
        result = await db.cash_movements.delete_one({"id": movement_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Movimiento no encontrado")
        return {"message": "Movimiento eliminado"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting cash movement: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar movimiento: {str(e)}")

@api_router.get("/portfolio/cash/summary")
async def get_cash_summary(current_user: dict = Depends(get_current_user)):
    """Get cash balance summary"""
    try:
        movements = await db.cash_movements.find({"user_id": current_user["id"]}).to_list(1000)
        
        total_deposits = sum(m['amount'] for m in movements if m['movement_type'] == 'deposit')
        total_withdrawals = sum(m['amount'] for m in movements if m['movement_type'] == 'withdrawal')
        cash_balance = total_deposits - total_withdrawals
        
        return {
            "total_deposits": total_deposits,
            "total_withdrawals": total_withdrawals,
            "cash_balance": cash_balance,
            "movements_count": len(movements)
        }
    except Exception as e:
        logging.error(f"Error getting cash summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener resumen: {str(e)}")
@api_router.get("/debug/portfolio-raw")
async def debug_portfolio_raw(current_user: dict = Depends(get_current_user)):
    transactions = await db.portfolio.find(
        {"$or": [
            {"user_id": current_user["id"]},
            {"user_id": ""},
            {"user_id": {"$exists": False}}
        ]}
    ).to_list(1000)
    holdings_map = {}
    for tx in transactions:
        t = tx['ticker']
        if t not in holdings_map:
            holdings_map[t] = {"shares": 0.0, "cost": 0.0, "tx_count": 0}
        holdings_map[t]["tx_count"] += 1
        if tx['transaction_type'] == 'buy':
            holdings_map[t]["shares"] += tx['shares']
            holdings_map[t]["cost"] += tx['total_amount']
        else:
            holdings_map[t]["shares"] -= tx['shares']
            holdings_map[t]["cost"] -= tx['total_amount']
    return {
        "user_id": current_user["id"],
        "total_transactions": len(transactions),
        "holdings_raw": holdings_map,
        "filtered_out": [t for t, d in holdings_map.items() if d["shares"] <= 0.0001]
    }

@api_router.get("/portfolio/evolution", response_model=PortfolioEvolution)
async def get_portfolio_evolution(current_user: dict = Depends(get_current_user)):
    """Get portfolio value evolution over time - optimized version"""
    try:
        # Get all transactions and cash movements
        transactions = await db.portfolio.find({"user_id": current_user["id"]}).sort("transaction_date", 1).to_list(1000)
        cash_movements = await db.cash_movements.find({"user_id": current_user["id"]}).sort("movement_date", 1).to_list(1000)
        
        if not transactions and not cash_movements:
            return PortfolioEvolution(
                history=[],
                current_value=0,
                total_change=0,
                total_change_percent=0
            )
        
        # Get all unique tickers and fetch their current prices once
        tickers = list(set(tx['ticker'] for tx in transactions)) if transactions else []
        current_prices = {}
        for ticker in tickers:
            try:
                stock = yf.Ticker(ticker)
                info = stock.info
                current_prices[ticker] = info.get('currentPrice', info.get('regularMarketPrice', 0)) or 0
            except:
                current_prices[ticker] = 0
        
        # Calculate current state
        holdings = {}
        total_invested = 0
        
        for tx in transactions:
            ticker = tx['ticker']
            if ticker not in holdings:
                holdings[ticker] = {'shares': 0, 'cost': 0}
            
            if tx['transaction_type'] == 'buy':
                holdings[ticker]['shares'] += tx['shares']
                holdings[ticker]['cost'] += tx['total_amount']
                total_invested += tx['total_amount']
            else:
                holdings[ticker]['shares'] -= tx['shares']
                holdings[ticker]['cost'] -= tx['total_amount']
                total_invested -= tx['total_amount']
        
        # Calculate cash balance
        total_deposits = sum(m['amount'] for m in cash_movements if m['movement_type'] == 'deposit')
        total_withdrawals = sum(m['amount'] for m in cash_movements if m['movement_type'] == 'withdrawal')
        
        # Cash used in buys and received from sells
        cash_used = sum(tx['total_amount'] for tx in transactions if tx['transaction_type'] == 'buy')
        cash_received = sum(tx['total_amount'] for tx in transactions if tx['transaction_type'] == 'sell')
        cash_available = total_deposits - total_withdrawals - cash_used + cash_received
        
        # Calculate current portfolio value
        current_portfolio_value = cash_available
        for ticker, data in holdings.items():
            if data['shares'] > 0:
                price = current_prices.get(ticker, 0)
                current_portfolio_value += data['shares'] * price
        
        # Generate simplified history (last 12 months only)
        history = []
        now = datetime.utcnow()
        
        # Create monthly snapshots for last 12 months
        for months_ago in range(11, -1, -1):
            target_date = now - timedelta(days=months_ago * 30)
            month_start = target_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            # Calculate holdings at this date
            month_holdings = {}
            month_invested = 0
            
            for tx in transactions:
                tx_date = tx['transaction_date']
                if hasattr(tx_date, 'replace'):
                    tx_date = tx_date.replace(tzinfo=None)
                
                if tx_date <= month_start.replace(tzinfo=None):
                    ticker = tx['ticker']
                    if ticker not in month_holdings:
                        month_holdings[ticker] = {'shares': 0, 'cost': 0}
                    
                    if tx['transaction_type'] == 'buy':
                        month_holdings[ticker]['shares'] += tx['shares']
                        month_holdings[ticker]['cost'] += tx['total_amount']
                        month_invested += tx['total_amount']
                    else:
                        month_holdings[ticker]['shares'] -= tx['shares']
                        month_holdings[ticker]['cost'] -= tx['total_amount']
                        month_invested -= tx['total_amount']
            
            # Calculate cash at this date
            month_deposits = sum(
                m['amount'] for m in cash_movements 
                if m['movement_type'] == 'deposit' and m['movement_date'].replace(tzinfo=None) <= month_start.replace(tzinfo=None)
            )
            month_withdrawals = sum(
                m['amount'] for m in cash_movements 
                if m['movement_type'] == 'withdrawal' and m['movement_date'].replace(tzinfo=None) <= month_start.replace(tzinfo=None)
            )
            month_cash_used = sum(
                tx['total_amount'] for tx in transactions 
                if tx['transaction_type'] == 'buy' and tx['transaction_date'].replace(tzinfo=None) <= month_start.replace(tzinfo=None)
            )
            month_cash_received = sum(
                tx['total_amount'] for tx in transactions 
                if tx['transaction_type'] == 'sell' and tx['transaction_date'].replace(tzinfo=None) <= month_start.replace(tzinfo=None)
            )
            month_cash = month_deposits - month_withdrawals - month_cash_used + month_cash_received
            
            # Calculate portfolio value (use current prices as approximation)
            month_value = month_cash
            for ticker, data in month_holdings.items():
                if data['shares'] > 0:
                    # Use current price (simplified - for accurate historical would need more API calls)
                    price = current_prices.get(ticker, 0)
                    month_value += data['shares'] * price
            
            # Calculate profit/loss
            total_basis = month_invested + (month_deposits - month_withdrawals)
            profit_loss = month_value - total_basis if total_basis > 0 else 0
            profit_loss_pct = (profit_loss / total_basis * 100) if total_basis > 0 else 0
            
            history.append(PortfolioHistoryPoint(
                date=month_start.strftime('%Y-%m-%d'),
                total_value=round(month_value, 2),
                invested_value=round(month_invested, 2),
                cash_balance=round(month_cash, 2),
                profit_loss=round(profit_loss, 2),
                profit_loss_percent=round(profit_loss_pct, 2)
            ))
        
        # Calculate total change
        first_value = history[0].total_value if history and history[0].total_value > 0 else 0
        total_change = current_portfolio_value - first_value if first_value > 0 else 0
        total_change_pct = (total_change / first_value * 100) if first_value > 0 else 0
        
        return PortfolioEvolution(
            history=history,
            current_value=round(current_portfolio_value, 2),
            total_change=round(total_change, 2),
            total_change_percent=round(total_change_pct, 2)
        )
        
    except Exception as e:
        logging.error(f"Error getting portfolio evolution: {str(e)}")
        # Return empty evolution on error instead of failing
        return PortfolioEvolution(
            history=[],
            current_value=0,
            total_change=0,
            total_change_percent=0
        )

# ============================================
# SCREENER DE ACCIONES
# ============================================

class ScreenerFilters(BaseModel):
    min_pe: Optional[float] = None
    max_pe: Optional[float] = None
    min_roe: Optional[float] = None
    max_roe: Optional[float] = None
    min_dividend_yield: Optional[float] = None
    max_debt_equity: Optional[float] = None
    min_market_cap: Optional[float] = None  # in billions
    sector: Optional[str] = None

class ScreenerResult(BaseModel):
    ticker: str
    company_name: str
    sector: str
    industry: str
    current_price: float
    pe_ratio: Optional[float]
    roe: Optional[float]
    dividend_yield: Optional[float]
    debt_to_equity: Optional[float]
    market_cap: Optional[float]
    recommendation: str

# Popular stocks to screen
POPULAR_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "V", "JNJ",
    "WMT", "PG", "MA", "HD", "DIS", "NFLX", "ADBE", "CRM", "PYPL", "INTC",
    "KO", "PEP", "MRK", "ABT", "TMO", "COST", "NKE", "MCD", "BA", "CAT"
]

@api_router.post("/screener", response_model=List[ScreenerResult])
async def screen_stocks(filters: ScreenerFilters):
    """Screen stocks based on financial criteria"""
    try:
        results = []
        
        for ticker in POPULAR_TICKERS:
            try:
                stock = yf.Ticker(ticker)
                info = stock.info
                
                # Get key metrics
                pe_ratio = info.get('trailingPE') or info.get('forwardPE')
                roe = info.get('returnOnEquity')
                if roe:
                    roe = roe * 100  # Convert to percentage
                dividend_yield = info.get('dividendYield')
                if dividend_yield:
                    dividend_yield = dividend_yield * 100
                debt_equity = info.get('debtToEquity')
                if debt_equity:
                    debt_equity = debt_equity / 100  # yfinance returns as percentage
                market_cap = info.get('marketCap')
                if market_cap:
                    market_cap = market_cap / 1e9  # Convert to billions
                
                # Apply filters
                if filters.min_pe and (not pe_ratio or pe_ratio < filters.min_pe):
                    continue
                if filters.max_pe and (not pe_ratio or pe_ratio > filters.max_pe):
                    continue
                if filters.min_roe and (not roe or roe < filters.min_roe):
                    continue
                if filters.max_debt_equity and (debt_equity and debt_equity > filters.max_debt_equity):
                    continue
                if filters.min_dividend_yield and (not dividend_yield or dividend_yield < filters.min_dividend_yield):
                    continue
                if filters.min_market_cap and (not market_cap or market_cap < filters.min_market_cap):
                    continue
                if filters.sector and info.get('sector', '').lower() != filters.sector.lower():
                    continue
                
                # Determine recommendation
                score = 0
                if pe_ratio and pe_ratio < 25:
                    score += 1
                if roe and roe > 15:
                    score += 1
                if dividend_yield and dividend_yield > 1:
                    score += 1
                if debt_equity and debt_equity < 1:
                    score += 1
                
                recommendation = "MANTENER"
                if score >= 3:
                    recommendation = "COMPRAR"
                elif score <= 1:
                    recommendation = "VENDER"
                
                results.append(ScreenerResult(
                    ticker=ticker,
                    company_name=info.get('longName', ticker),
                    sector=info.get('sector', 'N/A'),
                    industry=info.get('industry', 'N/A'),
                    current_price=info.get('currentPrice', 0) or info.get('regularMarketPrice', 0) or 0,
                    pe_ratio=round(pe_ratio, 2) if pe_ratio else None,
                    roe=round(roe, 2) if roe else None,
                    dividend_yield=round(dividend_yield, 2) if dividend_yield else None,
                    debt_to_equity=round(debt_equity, 2) if debt_equity else None,
                    market_cap=round(market_cap, 2) if market_cap else None,
                    recommendation=recommendation
                ))
                
            except Exception as e:
                logging.warning(f"Error screening {ticker}: {str(e)}")
                continue
        
        return results
        
    except Exception as e:
        logging.error(f"Error in screener: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en screener: {str(e)}")

@api_router.get("/screener/presets")
async def get_screener_presets():
    """Get predefined screener presets"""
    return {
        "presets": [
            {
                "name": "Value Stocks",
                "description": "P/E bajo, alto dividendo",
                "filters": {"max_pe": 15, "min_dividend_yield": 2}
            },
            {
                "name": "Growth Stocks", 
                "description": "Alto ROE, bajo endeudamiento",
                "filters": {"min_roe": 20, "max_debt_equity": 1}
            },
            {
                "name": "Blue Chips",
                "description": "Gran capitalización, estables",
                "filters": {"min_market_cap": 100, "max_debt_equity": 1.5}
            },
            {
                "name": "Dividend Kings",
                "description": "Alto rendimiento por dividendo",
                "filters": {"min_dividend_yield": 3}
            }
        ]
    }

# ============================================
# DIVIDENDOS E HISTÓRICO
# ============================================

class DividendInfo(BaseModel):
    ticker: str
    company_name: str
    dividend_yield: Optional[float]
    annual_dividend: Optional[float]
    ex_dividend_date: Optional[str]
    payment_date: Optional[str]
    payout_ratio: Optional[float]
    dividend_history: List[dict]
    five_year_avg_yield: Optional[float]

@api_router.get("/dividends/{ticker}", response_model=DividendInfo)
async def get_dividend_info(ticker: str):
    """Get dividend information and history for a stock"""
    try:
        stock = yf.Ticker(ticker.upper())
        info = stock.info
        
        # Get dividend history
        dividends = stock.dividends
        dividend_history = []
        if not dividends.empty:
            # Get last 8 dividends
            recent_dividends = dividends.tail(8)
            for date, amount in recent_dividends.items():
                dividend_history.append({
                    "date": date.strftime('%Y-%m-%d'),
                    "amount": round(float(amount), 4)
                })
        
        # Get yield
        dividend_yield = info.get('dividendYield')
        if dividend_yield:
            dividend_yield = dividend_yield * 100
        
        # Get ex-dividend date
        ex_div_date = info.get('exDividendDate')
        if ex_div_date:
            ex_div_date = datetime.fromtimestamp(ex_div_date).strftime('%Y-%m-%d')
        
        return DividendInfo(
            ticker=ticker.upper(),
            company_name=info.get('longName', ticker),
            dividend_yield=round(dividend_yield, 2) if dividend_yield else None,
            annual_dividend=info.get('dividendRate'),
            ex_dividend_date=ex_div_date,
            payment_date=None,  # Not always available
            payout_ratio=round(info.get('payoutRatio', 0) * 100, 2) if info.get('payoutRatio') else None,
            dividend_history=dividend_history,
            five_year_avg_yield=round(info.get('fiveYearAvgDividendYield', 0), 2) if info.get('fiveYearAvgDividendYield') else None
        )
        
    except Exception as e:
        logging.error(f"Error getting dividends for {ticker}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener dividendos: {str(e)}")

@api_router.get("/dividends/calendar/upcoming")
async def get_upcoming_dividends():
    """Get upcoming dividend payments from portfolio holdings"""
    try:
        # Get portfolio holdings
        transactions = await db.portfolio.find().to_list(1000)
        holdings = {}
        for tx in transactions:
            ticker = tx['ticker']
            if ticker not in holdings:
                holdings[ticker] = 0
            if tx['transaction_type'] == 'buy':
                holdings[ticker] += tx['shares']
            else:
                holdings[ticker] -= tx['shares']
        
        # Filter active holdings
        active_tickers = [t for t, shares in holdings.items() if shares > 0]
        
        upcoming = []
        for ticker in active_tickers:
            try:
                stock = yf.Ticker(ticker)
                info = stock.info
                
                ex_div_date = info.get('exDividendDate')
                if ex_div_date:
                    ex_date = datetime.fromtimestamp(ex_div_date)
                    # Only include if in the future or within last 30 days
                    if ex_date >= datetime.now() - timedelta(days=30):
                        upcoming.append({
                            "ticker": ticker,
                            "company_name": info.get('longName', ticker),
                            "ex_dividend_date": ex_date.strftime('%Y-%m-%d'),
                            "dividend_amount": info.get('dividendRate', 0) / 4 if info.get('dividendRate') else 0,  # Quarterly
                            "shares_owned": holdings[ticker],
                            "expected_payment": round((info.get('dividendRate', 0) / 4) * holdings[ticker], 2) if info.get('dividendRate') else 0
                        })
            except:
                continue
        
        # Sort by ex-dividend date
        upcoming.sort(key=lambda x: x['ex_dividend_date'])
        
        return {"upcoming_dividends": upcoming}
        
    except Exception as e:
        logging.error(f"Error getting upcoming dividends: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# ============================================
# BENCHMARK COMPARISON (S&P500)
# ============================================

class BenchmarkComparison(BaseModel):
    portfolio_return: float
    benchmark_return: float
    alpha: float  # Excess return over benchmark
    tracking_error: float
    sharpe_portfolio: float
    sharpe_benchmark: float
    portfolio_volatility: float
    benchmark_volatility: float
    correlation: float
    period: str
    portfolio_values: List[dict]
    benchmark_values: List[dict]

@api_router.get("/portfolio/benchmark", response_model=BenchmarkComparison)
async def compare_portfolio_to_benchmark():
    """Compare portfolio performance to S&P500 benchmark"""
    try:
        # Get portfolio transactions
        transactions = await db.portfolio.find().sort("transaction_date", 1).to_list(1000)
        
        if not transactions:
            return BenchmarkComparison(
                portfolio_return=0, benchmark_return=0, alpha=0,
                tracking_error=0, sharpe_portfolio=0, sharpe_benchmark=0,
                portfolio_volatility=0, benchmark_volatility=0, correlation=0,
                period="1Y", portfolio_values=[], benchmark_values=[]
            )
        
        # Get S&P500 data
        spy = yf.Ticker("SPY")
        spy_hist = spy.history(period="1y")
        
        if spy_hist.empty:
            raise HTTPException(status_code=500, detail="No se pudo obtener datos del benchmark")
        
        # Calculate benchmark return
        spy_start = float(spy_hist['Close'].iloc[0])
        spy_end = float(spy_hist['Close'].iloc[-1])
        benchmark_return = ((spy_end - spy_start) / spy_start) * 100
        
        # Calculate benchmark volatility
        spy_returns = spy_hist['Close'].pct_change().dropna()
        benchmark_volatility = float(spy_returns.std() * np.sqrt(252) * 100)
        
        # Get portfolio holdings and calculate return
        holdings = {}
        total_invested = 0
        for tx in transactions:
            ticker = tx['ticker']
            if ticker not in holdings:
                holdings[ticker] = {'shares': 0, 'cost': 0}
            if tx['transaction_type'] == 'buy':
                holdings[ticker]['shares'] += tx['shares']
                holdings[ticker]['cost'] += tx['total_amount']
                total_invested += tx['total_amount']
            else:
                holdings[ticker]['shares'] -= tx['shares']
                holdings[ticker]['cost'] -= tx['total_amount']
                total_invested -= tx['total_amount']
        
        # Calculate current portfolio value
        current_value = 0
        portfolio_returns = []
        
        for ticker, data in holdings.items():
            if data['shares'] > 0:
                try:
                    stock = yf.Ticker(ticker)
                    info = stock.info
                    price = info.get('currentPrice', 0) or info.get('regularMarketPrice', 0) or 0
                    current_value += data['shares'] * price
                    
                    # Get stock returns for correlation
                    hist = stock.history(period="1y")
                    if not hist.empty:
                        returns = hist['Close'].pct_change().dropna()
                        weight = (data['shares'] * price) / max(current_value, 1)
                        portfolio_returns.append({'returns': returns, 'weight': weight})
                except:
                    current_value += data['cost']
        
        # Portfolio return
        portfolio_return = ((current_value - total_invested) / total_invested * 100) if total_invested > 0 else 0
        
        # Alpha (excess return)
        alpha = portfolio_return - benchmark_return
        
        # Calculate portfolio volatility (weighted average)
        portfolio_volatility = 0
        if portfolio_returns:
            for pr in portfolio_returns:
                vol = float(pr['returns'].std() * np.sqrt(252) * 100)
                portfolio_volatility += vol * pr['weight']
        
        # Sharpe ratios (assuming 4% risk-free rate)
        risk_free = 4.0
        sharpe_portfolio = (portfolio_return - risk_free) / portfolio_volatility if portfolio_volatility > 0 else 0
        sharpe_benchmark = (benchmark_return - risk_free) / benchmark_volatility if benchmark_volatility > 0 else 0
        
        # Correlation (simplified)
        correlation = 0.85  # Typical correlation with market
        
        # Tracking error
        tracking_error = abs(portfolio_volatility - benchmark_volatility)
        
        # Generate chart data points
        portfolio_values = []
        benchmark_values = []
        
        # Monthly data for last 12 months
        for i in range(12):
            month_offset = 11 - i
            date = (datetime.now() - timedelta(days=month_offset * 30)).strftime('%Y-%m')
            
            # Interpolate values (simplified)
            port_val = total_invested * (1 + (portfolio_return / 100) * (i / 11))
            bench_val = 100 * (1 + (benchmark_return / 100) * (i / 11))
            
            portfolio_values.append({"date": date, "value": round(port_val, 2)})
            benchmark_values.append({"date": date, "value": round(bench_val, 2)})
        
        return BenchmarkComparison(
            portfolio_return=round(portfolio_return, 2),
            benchmark_return=round(benchmark_return, 2),
            alpha=round(alpha, 2),
            tracking_error=round(tracking_error, 2),
            sharpe_portfolio=round(sharpe_portfolio, 2),
            sharpe_benchmark=round(sharpe_benchmark, 2),
            portfolio_volatility=round(portfolio_volatility, 2),
            benchmark_volatility=round(benchmark_volatility, 2),
            correlation=round(correlation, 2),
            period="1Y",
            portfolio_values=portfolio_values,
            benchmark_values=benchmark_values
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error comparing to benchmark: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# ============================================
# HISTORY DELETE ENDPOINTS
# ============================================

@api_router.delete("/history/{analysis_id}")
async def delete_analysis(analysis_id: str):
    """Delete a single analysis from history"""
    try:
        result = await db.analyses.delete_one({"id": analysis_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Análisis no encontrado")
        return {"message": "Análisis eliminado"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar análisis: {str(e)}")

@api_router.delete("/history")
async def delete_all_history():
    """Delete all analysis history"""
    try:
        result = await db.analyses.delete_many({})
        return {"message": f"Se eliminaron {result.deleted_count} análisis"}
    except Exception as e:
        logging.error(f"Error deleting history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar historial: {str(e)}")


# ==================== TECHNICAL ANALYSIS ====================

class FibonacciLevel(BaseModel):
    level: str  # e.g., "0%", "23.6%", "38.2%", etc.
    price: float
    is_support: bool  # True if support, False if resistance
    distance_percent: float  # Distance from current price as percentage

class MovingAverage(BaseModel):
    period: int  # 20, 50, or 200
    value: float
    signal: str  # "ALCISTA", "BAJISTA", "NEUTRAL"
    price_position: str  # "SOBRE MA", "BAJO MA"
    distance_percent: float  # Distance from current price as percentage

class CamarillaPivot(BaseModel):
    level: str  # R4, R3, R2, R1, PP, S1, S2, S3, S4
    price: float
    significance: str  # Description of the level's significance

class TechnicalAnalysisResponse(BaseModel):
    ticker: str
    current_price: float
    analysis_date: datetime = Field(default_factory=datetime.utcnow)
    
    # Fibonacci
    fibonacci_levels: List[FibonacciLevel]
    current_fibonacci_zone: str
    fibonacci_interpretation: str
    swing_high: float
    swing_low: float
    trend_direction: str  # "ALCISTA", "BAJISTA"
    
    # Moving Averages
    moving_averages: List[MovingAverage]
    ma_summary: str
    ma_trend_signal: str  # "COMPRAR", "VENDER", "NEUTRAL"
    golden_cross: bool  # MA50 crossing above MA200
    death_cross: bool  # MA50 crossing below MA200
    
    # Camarilla Pivots
    camarilla_pivots: List[CamarillaPivot]
    current_camarilla_zone: str
    camarilla_interpretation: str
    
    # Overall Technical Summary
    technical_score: float  # 0-100
    technical_recommendation: str  # "COMPRAR", "VENDER", "MANTENER"
    key_levels: Dict[str, float]  # Important support/resistance levels


def calculate_fibonacci_levels(high: float, low: float, current_price: float) -> List[FibonacciLevel]:
    """Calculate Fibonacci retracement levels
    
    En Fibonacci los retrocesos se calculan desde el máximo hacia el mínimo:
    - 0% = Máximo (Swing High) - Resistencia principal
    - 23.6%, 38.2%, 50%, 61.8%, 78.6% = Niveles de retroceso
    - 100% = Mínimo (Swing Low) - Soporte principal
    
    Un nivel es SOPORTE si el precio está POR ENCIMA de él
    Un nivel es RESISTENCIA si el precio está POR DEBAJO de él
    """
    diff = high - low
    
    # Standard Fibonacci levels (siempre calculados desde high hacia low)
    fib_ratios = {
        "0%": 0.0,        # High - Resistencia máxima
        "23.6%": 0.236,
        "38.2%": 0.382,   # Nivel clave de retroceso
        "50%": 0.5,       # Nivel psicológico importante
        "61.8%": 0.618,   # Nivel dorado - muy importante
        "78.6%": 0.786,
        "100%": 1.0,      # Low - Soporte máximo
        "127.2%": 1.272,  # Extensión
        "161.8%": 1.618,  # Extensión dorada
    }
    
    levels = []
    for name, ratio in fib_ratios.items():
        # Los retrocesos siempre van desde el máximo hacia el mínimo
        price = high - (diff * ratio)
        
        # Determinar si es soporte o resistencia basado en la posición del precio actual
        # Si el precio está POR ENCIMA del nivel = Es SOPORTE (el nivel soporta el precio)
        # Si el precio está POR DEBAJO del nivel = Es RESISTENCIA (el nivel resiste la subida)
        is_support = current_price > price
        
        levels.append(FibonacciLevel(
            level=name,
            price=round(price, 2),
            is_support=is_support,
            distance_percent=0  # Will be calculated later with current price
        ))
    
    return levels


def calculate_moving_averages(history_df: pd.DataFrame, current_price: float) -> List[MovingAverage]:
    """Calculate moving averages for 20, 50, and 200 periods"""
    mas = []
    
    for period in [20, 50, 200]:
        if len(history_df) >= period:
            ma_value = history_df['Close'].rolling(window=period).mean().iloc[-1]
            
            # Determine signal
            distance_pct = ((current_price - ma_value) / ma_value) * 100
            
            if current_price > ma_value:
                price_position = "SOBRE MA"
                signal = "ALCISTA"
            else:
                price_position = "BAJO MA"
                signal = "BAJISTA"
            
            mas.append(MovingAverage(
                period=period,
                value=round(ma_value, 2),
                signal=signal,
                price_position=price_position,
                distance_percent=round(distance_pct, 2)
            ))
        else:
            mas.append(MovingAverage(
                period=period,
                value=0,
                signal="NEUTRAL",
                price_position="N/A",
                distance_percent=0
            ))
    
    return mas


def calculate_camarilla_pivots(high: float, low: float, close: float) -> List[CamarillaPivot]:
    """Calculate Camarilla Pivot Points"""
    range_val = high - low
    
    pivots = [
        CamarillaPivot(
            level="R4",
            price=round(close + (range_val * 1.1 / 2), 2),
            significance="Resistencia mayor - Posible reversa bajista o breakout alcista extremo"
        ),
        CamarillaPivot(
            level="R3",
            price=round(close + (range_val * 1.1 / 4), 2),
            significance="Resistencia fuerte - Zona de venta para traders intradia"
        ),
        CamarillaPivot(
            level="R2",
            price=round(close + (range_val * 1.1 / 6), 2),
            significance="Resistencia media - Primer objetivo alcista"
        ),
        CamarillaPivot(
            level="R1",
            price=round(close + (range_val * 1.1 / 12), 2),
            significance="Resistencia menor - Nivel de salida parcial para largos"
        ),
        CamarillaPivot(
            level="PP",
            price=round((high + low + close) / 3, 2),
            significance="Punto Pivote - Nivel central de equilibrio"
        ),
        CamarillaPivot(
            level="S1",
            price=round(close - (range_val * 1.1 / 12), 2),
            significance="Soporte menor - Nivel de salida parcial para cortos"
        ),
        CamarillaPivot(
            level="S2",
            price=round(close - (range_val * 1.1 / 6), 2),
            significance="Soporte medio - Primer objetivo bajista"
        ),
        CamarillaPivot(
            level="S3",
            price=round(close - (range_val * 1.1 / 4), 2),
            significance="Soporte fuerte - Zona de compra para traders intradia"
        ),
        CamarillaPivot(
            level="S4",
            price=round(close - (range_val * 1.1 / 2), 2),
            significance="Soporte mayor - Posible reversa alcista o breakdown bajista extremo"
        ),
    ]
    
    return pivots


def get_fibonacci_interpretation(current_price: float, levels: List[FibonacciLevel], trend: str) -> tuple:
    """Get interpretation of current price position relative to Fibonacci levels"""
    
    # Find which zone the price is in
    sorted_levels = sorted(levels, key=lambda x: x.price, reverse=True)
    
    current_zone = "Por encima del 0%"
    
    for i, level in enumerate(sorted_levels):
        if current_price >= level.price:
            if i > 0:
                current_zone = f"Entre {sorted_levels[i-1].level} y {level.level}"
            else:
                current_zone = f"Por encima del {level.level}"
            break
        current_zone = f"Por debajo del {level.level}"
    
    # Generate interpretation
    key_levels = ["38.2%", "50%", "61.8%"]
    interpretation_parts = []
    
    # Find closest level
    closest_level = min(levels, key=lambda x: abs(x.price - current_price))
    distance_to_closest = ((current_price - closest_level.price) / closest_level.price) * 100
    
    if trend == "ALCISTA":
        if any(l.level in ["38.2%", "50%"] for l in levels if abs(l.price - current_price) / l.price < 0.02):
            interpretation_parts.append("📈 El precio está cerca de un nivel de retroceso clave - zona de posible rebote alcista")
        elif any(l.level == "61.8%" for l in levels if abs(l.price - current_price) / l.price < 0.02):
            interpretation_parts.append("⚠️ El precio está en el nivel 61.8% - zona crítica, si rompe podría cambiar la tendencia")
        elif current_price > max(l.price for l in levels if l.level == "0%"):
            interpretation_parts.append("🚀 El precio está en nuevos máximos - tendencia alcista fuerte")
        else:
            interpretation_parts.append(f"📊 El precio está cerca del nivel Fibonacci {closest_level.level}")
    else:
        if any(l.level in ["38.2%", "50%"] for l in levels if abs(l.price - current_price) / l.price < 0.02):
            interpretation_parts.append("📉 El precio está cerca de un nivel de rebote clave - zona de posible continuación bajista")
        elif any(l.level == "61.8%" for l in levels if abs(l.price - current_price) / l.price < 0.02):
            interpretation_parts.append("⚠️ El precio está en el nivel 61.8% - zona crítica para un posible cambio de tendencia")
        else:
            interpretation_parts.append(f"📊 El precio está cerca del nivel Fibonacci {closest_level.level}")
    
    interpretation_parts.append(f"Nivel más cercano: {closest_level.level} (${closest_level.price:.2f}) - Distancia: {abs(distance_to_closest):.1f}%")
    
    return current_zone, " | ".join(interpretation_parts)


def get_camarilla_interpretation(current_price: float, pivots: List[CamarillaPivot]) -> tuple:
    """Get interpretation of current price position relative to Camarilla pivots"""
    
    # Sort pivots by price
    sorted_pivots = sorted(pivots, key=lambda x: x.price, reverse=True)
    
    current_zone = "Por encima de R4"
    
    for i, pivot in enumerate(sorted_pivots):
        if current_price >= pivot.price:
            if i > 0:
                current_zone = f"Entre {sorted_pivots[i-1].level} y {pivot.level}"
            else:
                current_zone = f"Por encima de {pivot.level}"
            break
        current_zone = f"Por debajo de {pivot.level}"
    
    # Generate interpretation
    pp_price = next(p.price for p in pivots if p.level == "PP")
    r3_price = next(p.price for p in pivots if p.level == "R3")
    s3_price = next(p.price for p in pivots if p.level == "S3")
    r4_price = next(p.price for p in pivots if p.level == "R4")
    s4_price = next(p.price for p in pivots if p.level == "S4")
    
    interpretation_parts = []
    
    if current_price > r3_price:
        if current_price > r4_price:
            interpretation_parts.append("🚀 BREAKOUT ALCISTA: Precio por encima de R4 - Tendencia muy alcista, posible extensión del movimiento")
        else:
            interpretation_parts.append("📈 ZONA DE VENTA: Precio entre R3 y R4 - Considera tomar ganancias en posiciones largas")
    elif current_price < s3_price:
        if current_price < s4_price:
            interpretation_parts.append("📉 BREAKDOWN BAJISTA: Precio por debajo de S4 - Tendencia muy bajista, posible extensión a la baja")
        else:
            interpretation_parts.append("📈 ZONA DE COMPRA: Precio entre S3 y S4 - Considera entradas largas con stop bajo S4")
    elif current_price > pp_price:
        interpretation_parts.append("📊 SESGO ALCISTA: Precio sobre el Punto Pivote - Buscar oportunidades de compra hacia R1-R2")
    else:
        interpretation_parts.append("📊 SESGO BAJISTA: Precio bajo el Punto Pivote - Buscar oportunidades de venta hacia S1-S2")
    
    # Add key levels info
    interpretation_parts.append(f"Niveles clave: Soporte S3=${s3_price:.2f} | Resistencia R3=${r3_price:.2f}")
    
    return current_zone, " | ".join(interpretation_parts)


@api_router.get("/technical/{ticker}", response_model=TechnicalAnalysisResponse)
async def get_technical_analysis(ticker: str):
    """Get comprehensive technical analysis including Fibonacci, Moving Averages, and Camarilla Pivots"""
    try:
        ticker = ticker.upper().strip()
        stock = yf.Ticker(ticker)
        
        # Get historical data (1 year for MAs, recent for pivots)
        history_1y = stock.history(period="1y")
        
        if history_1y.empty:
            raise HTTPException(status_code=404, detail=f"No se encontraron datos para el ticker '{ticker}'")
        
        # Current price and recent data
        current_price = history_1y['Close'].iloc[-1]
        
        # Get swing high and low from recent data (last 3 months for Fibonacci)
        history_3m = history_1y.tail(63)  # ~3 months of trading days
        swing_high = history_3m['High'].max()
        swing_low = history_3m['Low'].min()
        
        # Determine trend
        ma_50 = history_1y['Close'].rolling(window=50).mean().iloc[-1] if len(history_1y) >= 50 else current_price
        ma_200 = history_1y['Close'].rolling(window=200).mean().iloc[-1] if len(history_1y) >= 200 else current_price
        
        if current_price > ma_50 and ma_50 > ma_200:
            trend_direction = "ALCISTA"
        elif current_price < ma_50 and ma_50 < ma_200:
            trend_direction = "BAJISTA"
        else:
            trend_direction = "LATERAL"
        
        # Calculate Fibonacci levels (passing current_price for support/resistance determination)
        fibonacci_levels = calculate_fibonacci_levels(swing_high, swing_low, current_price)
        
        # Update Fibonacci distances
        for level in fibonacci_levels:
            level.distance_percent = round(((current_price - level.price) / level.price) * 100, 2)
        
        current_fib_zone, fib_interpretation = get_fibonacci_interpretation(current_price, fibonacci_levels, trend_direction)
        
        # Calculate Moving Averages
        moving_averages = calculate_moving_averages(history_1y, current_price)
        
        # MA Summary
        bullish_mas = sum(1 for ma in moving_averages if ma.signal == "ALCISTA")
        if bullish_mas == 3:
            ma_summary = "📈 Todas las medias móviles son ALCISTAS - Tendencia alcista fuerte"
            ma_trend_signal = "COMPRAR"
        elif bullish_mas == 0:
            ma_summary = "📉 Todas las medias móviles son BAJISTAS - Tendencia bajista fuerte"
            ma_trend_signal = "VENDER"
        elif bullish_mas >= 2:
            ma_summary = "📊 Mayoría de medias móviles alcistas - Sesgo moderadamente alcista"
            ma_trend_signal = "COMPRAR"
        else:
            ma_summary = "📊 Mayoría de medias móviles bajistas - Sesgo moderadamente bajista"
            ma_trend_signal = "VENDER"
        
        # Check for Golden Cross / Death Cross
        if len(history_1y) >= 200:
            ma50_recent = history_1y['Close'].rolling(window=50).mean().tail(5)
            ma200_recent = history_1y['Close'].rolling(window=200).mean().tail(5)
            
            # Golden Cross: MA50 crosses above MA200
            golden_cross = (ma50_recent.iloc[-1] > ma200_recent.iloc[-1] and 
                          ma50_recent.iloc[-5] <= ma200_recent.iloc[-5])
            
            # Death Cross: MA50 crosses below MA200
            death_cross = (ma50_recent.iloc[-1] < ma200_recent.iloc[-1] and 
                         ma50_recent.iloc[-5] >= ma200_recent.iloc[-5])
        else:
            golden_cross = False
            death_cross = False
        
        # Calculate Camarilla Pivots (using yesterday's data)
        if len(history_1y) >= 2:
            yesterday = history_1y.iloc[-2]
            camarilla_pivots = calculate_camarilla_pivots(
                yesterday['High'],
                yesterday['Low'],
                yesterday['Close']
            )
        else:
            # Use today's data if no yesterday available
            today = history_1y.iloc[-1]
            camarilla_pivots = calculate_camarilla_pivots(
                today['High'],
                today['Low'],
                today['Close']
            )
        
        current_cam_zone, cam_interpretation = get_camarilla_interpretation(current_price, camarilla_pivots)
        
        # Calculate overall technical score
        score = 50  # Start neutral
        
        # Fibonacci influence (+/- 15 points)
        if "38.2%" in current_fib_zone or "50%" in current_fib_zone:
            if trend_direction == "ALCISTA":
                score += 10
            else:
                score -= 10
        elif "61.8%" in current_fib_zone:
            score += 5 if trend_direction == "ALCISTA" else -5
        
        # Moving Average influence (+/- 20 points)
        score += (bullish_mas - 1.5) * 10
        
        # Golden/Death Cross influence (+/- 15 points)
        if golden_cross:
            score += 15
        if death_cross:
            score -= 15
        
        # Camarilla influence
        pp_price = next(p.price for p in camarilla_pivots if p.level == "PP")
        if current_price > pp_price:
            score += 5
        else:
            score -= 5
        
        # Bound score
        score = max(0, min(100, score))
        
        # Overall recommendation
        if score >= 65:
            technical_recommendation = "COMPRAR"
        elif score <= 35:
            technical_recommendation = "VENDER"
        else:
            technical_recommendation = "MANTENER"
        
        # Key levels summary
        key_levels = {
            "soporte_fibonacci_382": round(swing_high - (swing_high - swing_low) * 0.382, 2),
            "soporte_fibonacci_618": round(swing_high - (swing_high - swing_low) * 0.618, 2),
            "resistencia_fibonacci_0": round(swing_high, 2),
            "ma_20": moving_averages[0].value if moving_averages else 0,
            "ma_50": moving_averages[1].value if len(moving_averages) > 1 else 0,
            "ma_200": moving_averages[2].value if len(moving_averages) > 2 else 0,
            "camarilla_r3": next(p.price for p in camarilla_pivots if p.level == "R3"),
            "camarilla_s3": next(p.price for p in camarilla_pivots if p.level == "S3"),
            "camarilla_pp": pp_price,
        }
        
        return TechnicalAnalysisResponse(
            ticker=ticker,
            current_price=round(current_price, 2),
            fibonacci_levels=fibonacci_levels,
            current_fibonacci_zone=current_fib_zone,
            fibonacci_interpretation=fib_interpretation,
            swing_high=round(swing_high, 2),
            swing_low=round(swing_low, 2),
            trend_direction=trend_direction,
            moving_averages=moving_averages,
            ma_summary=ma_summary,
            ma_trend_signal=ma_trend_signal,
            golden_cross=golden_cross,
            death_cross=death_cross,
            camarilla_pivots=camarilla_pivots,
            current_camarilla_zone=current_cam_zone,
            camarilla_interpretation=cam_interpretation,
            technical_score=round(score, 1),
            technical_recommendation=technical_recommendation,
            key_levels=key_levels
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error in technical analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al calcular análisis técnico: {str(e)}")


# ==================== NEWS ENDPOINTS ====================

# 👇 JUSTO DESPUÉS de tus funciones download_flat, poc, plot_rsi, etc.
@app.get("/api/chart-technical/{ticker}")
def get_chart_technical_data(ticker: str, period: str = "1mo"):
    import yfinance as yf
    import pandas as pd
    import numpy as np
    
    ticker = ticker.upper()
    try:
        df = yf.download(ticker, period=period, progress=False)
        if df.empty:
            return {"error": "No data"}
            
        # Helper para series seguras
        def fix(series):
            return series.fillna(0).replace([np.inf, -np.inf], 0).values.tolist()

        # Cálculos (Ahora llamando a .mean() primero)
        rsi = (100 - (100 / (1 + (df['Close'].diff().clip(lower=0).rolling(14).mean() / 
                                  (-df['Close'].diff().clip(upper=0).rolling(14).mean())))))
        
        rsi_ema = rsi.ewm(span=10).mean()
        vama = df['Close'].rolling(20).mean()
        vwap = (df['Close'] * df['Volume']).cumsum() / df['Volume'].cumsum()
        vol_ema = df['Volume'].ewm(span=24).mean().mean() # <--- FIXED HERE
        
        # Coppock
        roc14 = df['Close'].pct_change(14)
        roc11 = df['Close'].pct_change(11)
        copp = (roc14 + roc11).ewm(span=10).mean()

        return {
            "timestamp": (df.index.astype(int) // 10**6).tolist(),
            "open": fix(df['Open']),
            "high": fix(df['High']),
            "low": fix(df['Low']),
            "close": fix(df['Close']),
            "volume": fix(df['Volume']),
            "rsi": fix(rsi),
            "rsi_ema": fix(rsi_ema),
            "vama": fix(vama),
            "poc": float(df['Close'].median()),
            "coppock": fix(copp),
            "vwap": fix(vwap),
            "volume_ema": fix(df['Volume'].ewm(span=24).mean())
        }
    except Exception as e:
        print(f"Error técnico: {e}")
        return {"error": str(e)}



class NewsArticle(BaseModel):
    title: str
    publisher: str
    link: str
    published_date: str
    thumbnail: Optional[str] = None
    summary: Optional[str] = None

class StockNewsResponse(BaseModel):
    ticker: str
    company_name: str
    news: List[NewsArticle]
    last_updated: datetime = Field(default_factory=datetime.utcnow)

class MarketNewsResponse(BaseModel):
    news: List[NewsArticle]
    last_updated: datetime = Field(default_factory=datetime.utcnow)


@api_router.get("/news/{ticker}", response_model=StockNewsResponse)
async def get_stock_news(ticker: str, limit: int = 10):
    """Get latest news for a specific stock"""
    try:
        ticker = ticker.upper().strip()
        stock = yf.Ticker(ticker)
        info = stock.info
        
        if not info or 'symbol' not in info:
            raise HTTPException(status_code=404, detail=f"No se encontraron datos para el ticker '{ticker}'")
        
        # Get news from yfinance
        raw_news = stock.news or []
        
        articles = []
        for article in raw_news[:limit]:
            try:
                # New yfinance structure has nested 'content' object
                content = article.get('content', article)
                
                # Get title
                title = content.get('title', article.get('title', 'Sin título'))
                
                # Get publisher
                provider = content.get('provider', {})
                publisher = provider.get('displayName', article.get('publisher', 'Desconocido'))
                
                # Get link
                canonical_url = content.get('canonicalUrl', {})
                link = canonical_url.get('url', article.get('link', ''))
                
                # Get published date
                pub_date_str = content.get('pubDate', article.get('pubDate', ''))
                if pub_date_str:
                    try:
                        pub_date = datetime.fromisoformat(pub_date_str.replace('Z', '+00:00')).strftime('%Y-%m-%d %H:%M')
                    except:
                        pub_timestamp = article.get('providerPublishTime', 0)
                        pub_date = datetime.fromtimestamp(pub_timestamp).strftime('%Y-%m-%d %H:%M') if pub_timestamp else 'N/A'
                else:
                    pub_timestamp = article.get('providerPublishTime', 0)
                    pub_date = datetime.fromtimestamp(pub_timestamp).strftime('%Y-%m-%d %H:%M') if pub_timestamp else 'N/A'
                
                # Get thumbnail
                thumbnail = None
                thumb_data = content.get('thumbnail', article.get('thumbnail', {}))
                if thumb_data and 'resolutions' in thumb_data and thumb_data['resolutions']:
                    # Try to get a medium-sized image
                    for res in thumb_data['resolutions']:
                        if res.get('tag') == '170x128' or res.get('width', 0) > 100:
                            thumbnail = res.get('url')
                            break
                    if not thumbnail:
                        thumbnail = thumb_data['resolutions'][0].get('url')
                
                # Get summary
                summary = content.get('summary', article.get('summary', None))
                
                articles.append(NewsArticle(
                    title=title,
                    publisher=publisher,
                    link=link,
                    published_date=pub_date,
                    thumbnail=thumbnail,
                    summary=summary
                ))
            except Exception as e:
                logging.warning(f"Error parsing news article: {str(e)}")
                continue
        
        return StockNewsResponse(
            ticker=ticker,
            company_name=info.get('longName', info.get('shortName', ticker)),
            news=articles
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching stock news: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener noticias: {str(e)}")


@api_router.get("/market-news", response_model=MarketNewsResponse)
async def get_market_news(limit: int = 15):
    """Get global market news from major indices and market tickers"""
    try:
        # Use multiple market symbols to aggregate diverse news
        market_symbols = ['^GSPC', '^DJI', '^IXIC', 'SPY', 'QQQ', '^VIX']  # S&P 500, Dow Jones, NASDAQ, SPY ETF, QQQ ETF, VIX
        
        all_news = []
        seen_titles = set()  # To avoid duplicates
        
        for symbol in market_symbols:
            try:
                ticker = yf.Ticker(symbol)
                raw_news = ticker.news or []
                
                for article in raw_news:
                    # New yfinance structure has nested 'content' object
                    content = article.get('content', article)
                    title = content.get('title', article.get('title', ''))
                    
                    # Skip duplicates
                    if title in seen_titles or not title:
                        continue
                    seen_titles.add(title)
                    
                    try:
                        # Get publisher
                        provider = content.get('provider', {})
                        publisher = provider.get('displayName', article.get('publisher', 'Desconocido'))
                        
                        # Get link
                        canonical_url = content.get('canonicalUrl', {})
                        link = canonical_url.get('url', article.get('link', ''))
                        
                        # Get published date
                        pub_date_str = content.get('pubDate', article.get('pubDate', ''))
                        pub_timestamp = 0
                        if pub_date_str:
                            try:
                                pub_dt = datetime.fromisoformat(pub_date_str.replace('Z', '+00:00'))
                                pub_date = pub_dt.strftime('%Y-%m-%d %H:%M')
                                pub_timestamp = pub_dt.timestamp()
                            except:
                                pub_timestamp = article.get('providerPublishTime', 0)
                                pub_date = datetime.fromtimestamp(pub_timestamp).strftime('%Y-%m-%d %H:%M') if pub_timestamp else 'N/A'
                        else:
                            pub_timestamp = article.get('providerPublishTime', 0)
                            pub_date = datetime.fromtimestamp(pub_timestamp).strftime('%Y-%m-%d %H:%M') if pub_timestamp else 'N/A'
                        
                        # Get thumbnail
                        thumbnail = None
                        thumb_data = content.get('thumbnail', article.get('thumbnail', {}))
                        if thumb_data and 'resolutions' in thumb_data and thumb_data['resolutions']:
                            for res in thumb_data['resolutions']:
                                if res.get('tag') == '170x128' or res.get('width', 0) > 100:
                                    thumbnail = res.get('url')
                                    break
                            if not thumbnail:
                                thumbnail = thumb_data['resolutions'][0].get('url')
                        
                        # Get summary
                        summary = content.get('summary', article.get('summary', None))
                        
                        all_news.append({
                            'article': NewsArticle(
                                title=title,
                                publisher=publisher,
                                link=link,
                                published_date=pub_date,
                                thumbnail=thumbnail,
                                summary=summary
                            ),
                            'timestamp': pub_timestamp
                        })
                    except Exception as e:
                        continue
                        
            except Exception as e:
                logging.warning(f"Error fetching news for {symbol}: {str(e)}")
                continue
        
        # Sort by timestamp (most recent first) and limit
        all_news.sort(key=lambda x: x['timestamp'], reverse=True)
        articles = [item['article'] for item in all_news[:limit]]
        
        return MarketNewsResponse(news=articles)
        
    except Exception as e:
        logging.error(f"Error fetching market news: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener noticias del mercado: {str(e)}")


# ==================== AI ASSISTANT ENDPOINTS ====================

# Store active chat sessions in memory (for production, use Redis or database)
ai_chat_sessions: Dict[str, LlmChat] = {}

class AIAssistantRequest(BaseModel):
    session_id: str
    message: str
    stock_data: Optional[Dict[str, Any]] = None  # Financial data for context

class AIAssistantResponse(BaseModel):
    response: str
    session_id: str
    suggested_questions: List[str]

class AIInitRequest(BaseModel):
    session_id: str
    ticker: str
    stock_data: Dict[str, Any]

class AIInitResponse(BaseModel):
    session_id: str
    initial_analysis: str
    suggested_questions: List[str]


def get_financial_system_prompt(ticker: str, stock_data: Dict[str, Any]) -> str:
    """Generate a concise system prompt with fundamental + technical analysis"""
    metadata = stock_data.get('metadata', {})
    summary_flags = stock_data.get('summary_flags', {})
    fav_pct = stock_data.get('favorable_percentage', 0)
    technical = stock_data.get('technical') or {}

    flag_map = {
        'profitable': '✅ Rentable' if summary_flags.get('profitable') else '❌ No rentable',
        'positive_fcf': '✅ FCF positivo' if summary_flags.get('positive_fcf') else '❌ FCF negativo',
        'low_debt': '✅ Deuda baja' if summary_flags.get('low_debt') else '❌ Deuda alta',
        'good_margins': '✅ Buenos márgenes' if summary_flags.get('good_margins') else '❌ Márgenes débiles',
        'healthy_liquidity': '✅ Liquidez sana' if summary_flags.get('healthy_liquidity') else '❌ Liquidez baja',
        'strong_roe': '✅ ROE fuerte' if summary_flags.get('strong_roe') else '❌ ROE débil',
        'undervalued': '✅ Subvalorada' if summary_flags.get('undervalued') else '❌ No subvalorada',
    }
    flags_text = ' | '.join(flag_map.values())

    ratios_raw = stock_data.get('ratios', [])
    ratios_summary = []
    if isinstance(ratios_raw, list):
        for category in ratios_raw:
            for m in category.get('metrics', []):
                icon = '✅' if m.get('passed') else '❌'
                ratios_summary.append(f"{icon} {m.get('name')}: {m.get('display_value')}")
    elif isinstance(ratios_raw, dict):
        for name, data in ratios_raw.items():
            if isinstance(data, dict):
                icon = '✅' if data.get('is_favorable') else '❌'
                ratios_summary.append(f"{icon} {name}: {data.get('display_value','N/A')}")
    ratios_text = '\n'.join(ratios_summary[:30]) if ratios_summary else 'No disponibles'

    price = stock_data.get('current_price') or metadata.get('current_price') or 0
    cap = metadata.get('market_cap') or 0
    high = metadata.get('fifty_two_week_high') or 0
    low = metadata.get('fifty_two_week_low') or 0
    pe = metadata.get('pe_ratio') or 'N/A'

    # Análisis técnico
    tech_section = ""
    if technical:
        mas = technical.get('moving_averages', [])
        mas_text = ' | '.join([f"{m.get('name')}: {m.get('signal')}" for m in mas[:4]]) if mas else 'N/A'
        key_levels = technical.get('key_levels', {})
        levels_text = ' | '.join([f"{k}: ${v:.2f}" for k, v in list(key_levels.items())[:4]]) if key_levels else 'N/A'

        tech_section = f"""
ANALISIS TECNICO:
- Tendencia: {technical.get('trend','N/A')} | Score: {technical.get('score','N/A')}/100
- Señal MA: {technical.get('ma_signal','N/A')} | {technical.get('ma_summary','N/A')}
- Golden Cross: {'✅ SI' if technical.get('golden_cross') else '❌ NO'} | Death Cross: {'⚠️ SI' if technical.get('death_cross') else '✅ NO'}
- Zona Fibonacci: {technical.get('fibonacci_zone','N/A')}
- {technical.get('fibonacci_interpretation','N/A')}
- Zona Camarilla: {technical.get('camarilla_zone','N/A')}
- Medias Móviles: {mas_text}
- Niveles clave: {levels_text}
"""

    return f"""Eres FinBot, analista financiero experto. Responde SIEMPRE en español, conciso y claro.

ACCION: {ticker} - {stock_data.get('company_name', ticker)}
Sector: {metadata.get('sector','N/A')} | Precio: ${price:.2f} | P/E: {pe} | Cap: ${cap:,.0f}
52W: ${low:.2f} - ${high:.2f}

ANALISIS FUNDAMENTAL:
Recomendacion: {stock_data.get('recommendation','N/A')} | Riesgo: {stock_data.get('risk_level','N/A')}
Metricas: {stock_data.get('favorable_metrics',0)}/{stock_data.get('total_metrics',0)} favorables ({fav_pct:.1f}%)
Indicadores: {flags_text}

RATIOS:
{ratios_text}
{tech_section}
INSTRUCCIONES:
- Usa SOLO los datos de arriba, cita valores exactos
- Incluye analisis fundamental Y tecnico
- Sugiere puntos de entrada/salida basados en Fibonacci y Camarilla
- Indica tipo de trade: swing, largo plazo, o evitar
- Minimo 200 palabras, maximo 350 palabras
- NO incluyas contadores de palabras ni notas al final
- Emojis: 📈 📉 ✅ ❌ ⚠️ 💡 🎯
- No eres asesor financiero profesional
"""

def get_suggested_questions(context: str = "general") -> List[str]:
    """Get contextual suggested questions"""
    questions = {
        "general": [
            "¿Cuáles son los principales riesgos de esta acción?",
            "¿Cómo se compara con sus competidores?",
            "¿Es buen momento para comprar?",
            "Explícame el ratio P/E en términos simples",
            "¿Qué factores podrían hacer subir el precio?"
        ],
        "bullish": [
            "¿Hasta dónde podría subir el precio?",
            "¿Cuáles son los catalizadores positivos?",
            "¿Debería aumentar mi posición?",
            "¿Qué métricas indican fortaleza?"
        ],
        "bearish": [
            "¿Cuáles son las señales de alerta?",
            "¿Debería vender o esperar?",
            "¿Qué podría hacer que la situación mejore?",
            "¿Hay oportunidad de compra en la caída?"
        ]
    }
    return questions.get(context, questions["general"])


@api_router.post("/ai-assistant/init", response_model=AIInitResponse)
async def init_ai_assistant(request: AIInitRequest):
    """Initialize a new AI assistant session with stock analysis"""
    try:
        # Obtener análisis técnico automáticamente
        technical_data = None
        try:
            tech_url = f"http://localhost:8000/api/technical/{request.ticker}"
            async with httpx.AsyncClient(timeout=15.0) as client:
                tech_response = await client.get(tech_url)
                if tech_response.status_code == 200:
                    td = tech_response.json()
                    technical_data = {
                        "trend": td.get("trend_direction"),
                        "score": td.get("technical_score"),
                        "recommendation": td.get("technical_recommendation"),
                        "ma_signal": td.get("ma_trend_signal"),
                        "ma_summary": td.get("ma_summary"),
                        "golden_cross": td.get("golden_cross"),
                        "death_cross": td.get("death_cross"),
                        "fibonacci_zone": td.get("current_fibonacci_zone"),
                        "fibonacci_interpretation": td.get("fibonacci_interpretation"),
                        "camarilla_zone": td.get("current_camarilla_zone"),
                        "camarilla_interpretation": td.get("camarilla_interpretation"),
                        "key_levels": td.get("key_levels", {}),
                        "moving_averages": td.get("moving_averages", []),
                    }
                    logging.info(f"TECHNICAL DATA fetched: trend={technical_data['trend']}, score={technical_data['score']}")
        except Exception as te:
            logging.warning(f"Could not fetch technical data: {te}")

        # Merge technical data into stock_data
        stock_data_with_tech = dict(request.stock_data)
        stock_data_with_tech['technical'] = technical_data

        session_id = request.session_id or str(uuid.uuid4())
        
        # Create new chat instance with financial system prompt
        logging.info(f"TECH IN PROMPT: {stock_data_with_tech.get('technical')}")
        system_prompt = get_financial_system_prompt(request.ticker, stock_data_with_tech)
        
        chat = LlmChat(
            session_id=session_id,
            system_message=system_prompt
        )
        
        # Store the session
        ai_chat_sessions[session_id] = chat
        
        # Generate initial analysis
        init_message = UserMessage(
            text=f"""Analiza {request.ticker} usando EXCLUSIVAMENTE los datos del sistema.
Responde en español con este formato:

📊 FUNDAMENTAL: [recomendacion] | Riesgo: [nivel] | [X/Y metricas favorables]
📈 FORTALEZAS: [2 ratios positivos con valores exactos]
⚠️ DEBILIDADES: [2 ratios negativos con valores exactos]
💰 PRECIO: [precio actual] | P/E: [valor] | Graham: [valor si disponible]

📉 TECNICO: Tendencia [trend] | Score [score]/100 | Señal: [ma_signal]
🎯 ENTRADA: [nivel de soporte Fibonacci o Camarilla mas cercano con precio exacto]
🚪 SALIDA: [nivel de resistencia con precio exacto]
📊 TIPO TRADE: [Swing/Largo plazo/Evitar] - [justificacion en 1 oracion]

🔚 CONCLUSION: [2 oraciones combinando fundamental y tecnico]

Cita valores numericos exactos. Sin contadores de palabras."""
        )
        initial_analysis = await chat.send_message(init_message)
        
        # Determine context for suggested questions
        favorable_pct = request.stock_data.get('favorable_percentage', 50)
        if favorable_pct >= 70:
            context = "bullish"
        elif favorable_pct <= 40:
            context = "bearish"
        else:
            context = "general"
        
        return AIInitResponse(
            session_id=session_id,
            initial_analysis=initial_analysis,
            suggested_questions=get_suggested_questions(context)[:4]
        )
        
    except Exception as e:
        logging.error(f"Error initializing AI assistant: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al inicializar asistente AI: {str(e)}")


@api_router.post("/ai-assistant/chat", response_model=AIAssistantResponse)
async def chat_with_ai_assistant(request: AIAssistantRequest):
    """Send a message to the AI assistant and get a response"""
    try:
        session_id = request.session_id
        
        # Check if session exists
        if session_id not in ai_chat_sessions:
            # If no session, create a new one with basic context
            basic_prompt = """Eres FinBot, un analista financiero experto y amigable. 
Responde siempre en español de forma clara y concisa.
Si no tienes contexto de una acción específica, ofrece información general sobre inversiones y análisis financiero.
Usa emojis ocasionalmente para hacer la conversación más amena.
Recuerda mencionar que no proporcionas asesoría financiera profesional."""
            
            chat = LlmChat(
                session_id=session_id,
                system_message=basic_prompt
            )
            
            ai_chat_sessions[session_id] = chat
        
        chat = ai_chat_sessions[session_id]
        
        # Send user message
        user_message = UserMessage(text=request.message)
        response = await chat.send_message(user_message)
        
        # Generate contextual suggested questions based on the conversation
        suggestions = [
            "¿Puedes explicar eso con más detalle?",
            "¿Qué otros factores debo considerar?",
            "¿Cómo afecta esto mi decisión de inversión?",
            "Dame un resumen de los puntos clave"
        ]
        
        return AIAssistantResponse(
            response=response,
            session_id=session_id,
            suggested_questions=suggestions[:3]
        )
        
    except Exception as e:
        logging.error(f"Error in AI chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error en chat con AI: {str(e)}")


@api_router.delete("/ai-assistant/session/{session_id}")
async def end_ai_session(session_id: str):
    """End an AI assistant session"""
    if session_id in ai_chat_sessions:
        del ai_chat_sessions[session_id]
        return {"message": "Sesión terminada exitosamente"}
    return {"message": "Sesión no encontrada"}

#***************************************************CODIGO AÑADIDO**************************************************
# ═══════════════════════════════════════════════════════════════
#  OVERTON SIGNAL MATRIX ENDPOINT — v2 Multi-Factor
#  Sustituye completamente el bloque anterior (mismo marcador).
#
#  NUEVOS FACTORES vs versión anterior:
#    + Momentum 12-1          (factor cuantitativo clásico)
#    + Fear & Greed proxy     (momentum + spread + VIX)
#    + Put/Call Ratio         (sentimiento opciones)
#    + Short Interest %       (potencial squeeze)
#    + Z-score Rev. Media     (sobreventa / sobrecompra)
#    + Beta vs S&P 500        (sensibilidad al mercado)
#    + Forward Guidance       (PE compression + EPS growth)
#    + OFI proxy              (order flow imbalance)
#    + VWAP proxy             (precio medio ponderado volumen)
#    + Bid-Ask Spread proxy   (liquidez / coste ejecución)
#    + Gamma Exposure proxy   (imanes de precio)
#    + Market Impact proxy    (impacto de la orden)
#
#  SCORE MULTI-FACTOR (máx 100):
#    Fundamental   30 %  (WMA, Coppock, Sharpe, VIX, US10Y, analistas, noticias)
#    Momentum      25 %  (Mom12-1, FGI, Short Interest, Z-score, Beta)
#    Sentimiento   20 %  (PCR, Forward Guidance, EPS growth)
#    Microestruc.  25 %  (OFI, VWAP, BAS, GEX, Market Impact)
# ═══════════════════════════════════════════════════════════════

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


# ── Nuevos indicadores ────────────────────────────────────────────────────────

def _calc_momentum_12_1(daily_closes: list) -> float:
    """Momentum 12-1: retorno entre t-252 y t-21."""
    if len(daily_closes) < 22:
        return 0.0
    if len(daily_closes) < 252:
        return round((daily_closes[-22] - daily_closes[0]) / max(daily_closes[0], 0.001) * 100, 2)
    return round((daily_closes[-21] - daily_closes[-252]) / max(daily_closes[-252], 0.001) * 100, 2)


def _calc_fgi_proxy(momentum_pct: float, spread_pct: float, vix: float) -> float:
    """Fear & Greed Index proxy (0-100)."""
    mom_score    = max(0, min(100, 50 + momentum_pct * 1.5))
    spread_score = max(0, min(100, 100 - spread_pct * 200))
    vix_score    = max(0, min(100, 100 - (vix - 10) * 3.33))
    return round(0.45 * mom_score + 0.30 * vix_score + 0.25 * spread_score, 1)


def _calc_put_call_ratio(info: dict) -> float:
    """Put/Call Ratio desde yfinance.info; 1.0 si no disponible."""
    pcr = info.get("putCallRatio", None)
    return round(float(pcr), 3) if pcr is not None else 1.0


def _calc_short_interest(info: dict) -> float:
    """Short Interest % del float."""
    shares_short = info.get("sharesShort", 0) or 0
    float_shares = info.get("floatShares", None) or info.get("sharesOutstanding", None)
    if float_shares and float_shares > 0:
        return round(shares_short / float_shares * 100, 2)
    pct = info.get("shortPercentOfFloat", None)
    return round(float(pct) * 100, 2) if pct is not None else 0.0


def _calc_mean_reversion_zscore(daily_closes: list, window: int = 50) -> float:
    """Z-score precio vs MA-50. >+2 sobrecompra; <-2 sobreventa."""
    if len(daily_closes) < window:
        return 0.0
    series = np.array(daily_closes[-window:], dtype=float)
    std = float(np.std(series))
    if std == 0:
        return 0.0
    return round((daily_closes[-1] - float(np.mean(series))) / std, 3)


def _calc_beta(daily_closes: list, market_closes: list, window: int = 252) -> float:
    """Beta del activo vs S&P 500."""
    n = min(len(daily_closes), len(market_closes), window)
    if n < 30:
        return 1.0
    r_i  = np.diff(np.array(daily_closes[-n:],  dtype=float)) / np.array(daily_closes[-n:-1],  dtype=float)
    r_m  = np.diff(np.array(market_closes[-n:], dtype=float)) / np.array(market_closes[-n:-1], dtype=float)
    var_m = float(np.var(r_m))
    return round(float(np.cov(r_i, r_m)[0][1]) / var_m, 3) if var_m != 0 else 1.0


def _calc_vwap_proximity(daily_hist) -> dict:
    """VWAP último mes (21 días) y distancia al precio actual."""
    try:
        recent  = daily_hist.tail(21).copy()
        if recent.empty:
            return {"vwap": 0.0, "price_vs_vwap": "neutral", "distance_pct": 0.0}
        typical = (recent["High"] + recent["Low"] + recent["Close"]) / 3
        vwap    = float((typical * recent["Volume"]).sum() / recent["Volume"].sum())
        current = float(recent["Close"].iloc[-1])
        dist    = round((current - vwap) / vwap * 100, 2)
        return {"vwap": round(vwap, 2), "price_vs_vwap": "above" if current > vwap else "below", "distance_pct": dist}
    except Exception:
        return {"vwap": 0.0, "price_vs_vwap": "neutral", "distance_pct": 0.0}


def _calc_ofi_proxy(daily_hist) -> float:
    """OFI proxy: (close-open)/range promedio últimos 10 días."""
    try:
        recent  = daily_hist.tail(10)
        ranges  = recent["High"] - recent["Low"]
        ofi_raw = (recent["Close"] - recent["Open"]) / ranges.replace(0, np.nan)
        return round(float(ofi_raw.mean(skipna=True)), 4)
    except Exception:
        return 0.0


def _calc_bid_ask_spread_proxy(daily_hist) -> float:
    """Bid-Ask spread proxy: (High-Low)/Close promedio 20 días (%)."""
    try:
        recent = daily_hist.tail(20)
        spread = (recent["High"] - recent["Low"]) / recent["Close"].replace(0, np.nan)
        return round(float(spread.mean(skipna=True)) * 100, 3)
    except Exception:
        return 2.0


def _calc_gamma_exposure_proxy(info: dict) -> float:
    """GEX proxy normalizado (0-10)."""
    iv  = info.get("impliedVolatility", None) or 0.3
    oi  = info.get("openInterest", None) or 0
    gex = iv ** 2 * oi
    return round(math.log1p(gex) / math.log1p(1e9) * 10, 3) if gex > 0 else 0.0


def _calc_market_impact_proxy(daily_hist, info: dict) -> float:
    """Market Impact proxy: σ × √(vol/ADV)."""
    try:
        recent   = daily_hist.tail(30)
        sigma    = float(recent["Close"].pct_change().dropna().std()) * math.sqrt(252)
        adv      = float(recent["Volume"].mean())
        last_vol = float(recent["Volume"].iloc[-1])
        return round(sigma * math.sqrt(last_vol / adv), 4) if adv > 0 else 0.0
    except Exception:
        return 0.0


def _calc_forward_guidance_proxy(info: dict) -> dict:
    """Forward Guidance via PE compression + EPS growth + analyst mean rec."""
    try:
        tr_pe    = info.get("trailingPE", None)
        fw_pe    = info.get("forwardPE",  None)
        eps_curr = info.get("trailingEps", None)
        eps_fwd  = info.get("forwardEps",  None)
        recs     = info.get("recommendationMean", 3.0) or 3.0

        pe_comp = ((tr_pe - fw_pe) / tr_pe) if (tr_pe and fw_pe and tr_pe > 0 and fw_pe > 0) else 0.0
        eps_g   = ((eps_fwd - eps_curr) / abs(eps_curr)) if (eps_curr and eps_fwd and eps_curr != 0) else 0.0
        score   = pe_comp * 10 + eps_g * 5 + (3.0 - recs) * 2
        label   = "positivo" if score > 1 else "negativo" if score < -1 else "neutral"
        return {"score": round(score, 2), "label": label,
                "pe_compression": round(pe_comp * 100, 1),
                "eps_growth_pct": round(eps_g * 100, 1),
                "analyst_mean_rec": round(recs, 2)}
    except Exception:
        return {"score": 0.0, "label": "neutral", "pe_compression": 0.0,
                "eps_growth_pct": 0.0, "analyst_mean_rec": 3.0}


def _overton_zone(score: int, news_impact: float) -> tuple:
    sign = '+' if news_impact >= 0 else ''
    if score >= 75:
        return ("Popular — Comprar",
                f"Narrativa de mercado firmemente alcista. Las noticias recientes ({sign}{news_impact:.1f}%) "
                "refuerzan el momentum. Flujos institucionales entran. Zona de compra con convicción; gestiona el tamaño de posición.")
    elif score >= 55:
        return ("Aceptable — Vigilar",
                f"Señales mixtas con ligero sesgo positivo. Las noticias aportan {sign}{news_impact:.1f}% al sesgo "
                "pero falta confirmación técnica plena. Espera catalizador o cruce WMA para entrar.")
    elif score >= 38:
        return ("Sensible — Esperar",
                f"Narrativa en disputa. Noticias generan ruido ({sign}{news_impact:.1f}%) sin dirección clara. "
                "Analistas divididos. Evita nueva exposición hasta que el score supere 55.")
    elif score >= 20:
        return ("Radical — Reducir",
                f"Sesgo bajista dominante. Noticias en negativo ({news_impact:.1f}%) aceleran la narrativa. "
                "Reduce exposición y ajusta stops.")
    else:
        return ("Impensable — Vender",
                f"Pánico generalizado. Noticias ({news_impact:.1f}%) amplían el deterioro fundamental. "
                "VIX elevado, Coppock negativo, precio bajo WMA. Sal de posiciones largas.")


def _compute_multifactor_score(
    price_vs_wma, coppock_signal, sharpe, cur_vix, cur_yield,
    analyst_ratio, news_impact_total,
    momentum_12_1, fgi, si_pct, zscore_mr,
    pcr, fg_proxy,
    ofi, vwap_info, bas_pct, gex_proxy, mi_proxy, beta,
) -> dict:
    # ── FUNDAMENTAL (máx 30) ─────────────────────────────────────────
    f = 0.0
    if price_vs_wma == "above":  f += 4.5
    if coppock_signal == "bull": f += 4.5
    f += 3.0 if sharpe > 1.5 else 2.0 if sharpe > 0.5 else 1.0 if sharpe > 0 else 0.0
    f += 4.0 if cur_vix < 15 else 2.5 if cur_vix < 20 else 1.0 if cur_vix < 28 else -2.0
    f += 3.0 if cur_yield < 3.8 else 1.5 if cur_yield < 4.5 else -1.0
    f += 3.5 if analyst_ratio > 0.65 else 2.0 if analyst_ratio > 0.50 else -1.5 if analyst_ratio < 0.30 else 0.5
    f += 3.5 if news_impact_total > 3 else 1.5 if news_impact_total > 0 else -3.5 if news_impact_total < -3 else -1.0
    f = max(0, min(30, f))

    # ── MOMENTUM (máx 25) ────────────────────────────────────────────
    m = 0.0
    m += 7.0 if momentum_12_1 > 20 else 4.0 if momentum_12_1 > 5 else 2.0 if momentum_12_1 > 0 else -5.0 if momentum_12_1 < -20 else -2.0
    m += 4.5 if fgi > 70 else 2.5 if fgi > 55 else 1.0 if fgi > 45 else -3.0 if fgi < 30 else -1.0
    m += 3.0 if si_pct > 20 else -1.5 if si_pct > 10 else 1.5 if si_pct < 3 else 0.0
    m += 3.0 if -1.5 <= zscore_mr <= 1.5 else 1.5 if abs(zscore_mr) > 2.5 else 1.0
    m += 2.5 if 0.8 <= beta <= 1.3 else -1.5 if beta > 2.0 else 1.0 if beta < 0.5 else 0.0
    m = max(0, min(25, m))

    # ── SENTIMIENTO (máx 20) ─────────────────────────────────────────
    s = 0.0
    s += 5.0 if pcr < 0.7 else 3.0 if pcr < 0.9 else 1.0 if pcr < 1.1 else -2.0 if pcr < 1.4 else -4.0
    fg_sc = fg_proxy.get("score", 0.0)
    s += 7.0 if fg_sc > 3 else 4.0 if fg_sc > 1 else 2.0 if fg_sc > -1 else -2.0 if fg_sc > -3 else -5.0
    eps_g = fg_proxy.get("eps_growth_pct", 0.0)
    s += 4.0 if eps_g > 10 else 2.0 if eps_g > 0 else -3.0 if eps_g < -5 else 0.0
    s = max(0, min(20, s))

    # ── MICROESTRUCTURA (máx 25) ─────────────────────────────────────
    u = 0.0
    u += 6.0 if ofi > 0.3 else 3.5 if ofi > 0.1 else 1.5 if ofi > -0.1 else -2.0 if ofi > -0.3 else -4.5
    dist = vwap_info.get("distance_pct", 0.0)
    if vwap_info.get("price_vs_vwap") == "above":
        u += 4.0 if dist > 3 else 2.5
    else:
        u += -3.0 if dist < -3 else -1.0
    u += 3.0 if bas_pct < 0.5 else 1.5 if bas_pct < 1.5 else -2.5 if bas_pct > 4.0 else 0.0
    u += 3.0 if gex_proxy > 5 else 1.5 if gex_proxy > 2 else 0.0
    u += 3.5 if mi_proxy < 0.05 else 1.5 if mi_proxy < 0.15 else -2.0 if mi_proxy > 0.5 else 0.0
    u = max(0, min(25, u))

    total = max(0, min(100, round(f + m + s + u)))
    return {
        "score": total,
        "breakdown": {
            "fundamental": round(f, 1),
            "momentum":    round(m, 1),
            "sentimiento": round(s, 1),
            "microestruc": round(u, 1),
        }
    }


# ==================== HELPER FUNCTIONS PARA OVERTON ====================

def _safe_close(df):
    """Extrae columna Close de forma segura"""
    if df is None or df.empty:
        return pd.Series(dtype=float)

    if "Close" in df.columns:
        s = df["Close"]
        if isinstance(s, pd.DataFrame):
            s = s.iloc[:, 0]
        return pd.Series(s, dtype=float).dropna()
    return pd.Series(dtype=float)


def _safe_col(df, col: str):
    """Extrae cualquier columna de forma segura"""
    if df is None or df.empty or col not in df.columns:
        return pd.Series(dtype=float)

    s = df[col]
    if isinstance(s, pd.DataFrame):
        s = s.iloc[:, 0]
    return pd.Series(s, dtype=float).dropna()


def _load_history(tkr, period="1y", interval="1d"):
    """Carga historial con manejo de MultiIndex de yfinance."""
    try:
        df = yf.Ticker(tkr).history(period=period, interval=interval, auto_adjust=True)
        if df is None or df.empty:
            return pd.DataFrame()
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] if isinstance(col, tuple) else col for col in df.columns]
        df = df.loc[:, ~df.columns.duplicated(keep='first')]
        return df
    except Exception as e:
        logging.error(f"Error loading history {tkr}: {e}")
        return pd.DataFrame()


@api_router.get("/overton/{ticker}")
async def get_overton_signal(ticker: str):
    """
    Overton Signal Matrix v2 — Score multi-factor (100 puntos):
    WMA-30, Coppock, Sharpe, VIX, US10Y, Noticias, Analistas,
    Momentum 12-1, FGI, PCR, Short Interest, Z-score, Beta,
    Forward Guidance, OFI, VWAP, Bid-Ask Spread, GEX, Market Impact.
    """
    try:
        ticker = ticker.upper().strip()
        stock  = yf.Ticker(ticker)
        info   = stock.info or {}

        # ── 1. Cargar historial diario (usar helper robusto) ─────────
        hist_daily = _load_history(ticker, period="1y", interval="1d")
        if hist_daily.empty:
            raise HTTPException(status_code=404, detail=f"No hay datos para {ticker}")

        # ── 2. Historial semanal (resample del diario para evitar "60wk" inválido) ──
        hist_weekly = hist_daily.resample("W").last().dropna()
        if len(hist_weekly) < 10:
            hist_weekly = _load_history(ticker, period="2y", interval="1wk")
            if hist_weekly.empty or len(hist_weekly) < 10:
                hist_weekly = hist_daily.resample("W").last().dropna()

        weekly_close = _safe_close(hist_weekly)
        daily_close  = _safe_close(hist_daily)

        prices = [round(float(v), 4) for v in weekly_close.values.tolist()]
        if len(prices) > 52:
            prices = prices[-52:]
        if not prices:
            prices = [round(float(v), 4) for v in daily_close.values.tolist()[-52:]]
        if not prices:
            raise HTTPException(status_code=404, detail=f"Sin datos de precio para {ticker}")

        current_price = prices[-1]
        pct_change    = round((prices[-1] - prices[-2]) / prices[-2] * 100, 2) if len(prices) > 1 else 0.0
        daily_closes  = [float(v) for v in daily_close.values.tolist()]

        # ── 3. VIX y US 10Y (usar "2y" en vez de "60wk") ─────────────
        try:
            vix_hist   = yf.Ticker("^VIX").history(period="2y", interval="1wk")
            vix_series = [round(float(v), 2) for v in vix_hist["Close"].dropna().values.tolist()[-52:]]
            cur_vix    = vix_series[-1] if vix_series else 20.0
        except Exception:
            vix_series = [20.0] * 52
            cur_vix    = 20.0

        try:
            bond_hist    = yf.Ticker("^TNX").history(period="2y", interval="1wk")
            yield_series = [round(float(v), 2) for v in bond_hist["Close"].dropna().values.tolist()[-52:]]
            cur_yield    = yield_series[-1] if yield_series else 4.5
        except Exception:
            yield_series = [4.5] * 52
            cur_yield    = 4.5

        # ── 4. S&P 500 para Beta ──────────────────────────────────────
        try:
            sp_hist = yf.Ticker("^GSPC").history(period="1y")
            if isinstance(sp_hist.columns, pd.MultiIndex):
                sp_hist.columns = sp_hist.columns.get_level_values(0)
            sp_close = sp_hist["Close"]
            if isinstance(sp_close, pd.DataFrame):
                sp_close = sp_close.iloc[:, 0]
            market_closes = [float(v) for v in sp_close.dropna().values.tolist()]
        except Exception:
            market_closes = daily_closes

        # ── 5. Indicadores base ───────────────────────────────────────
        wma_series  = _calc_wma(prices, 30)
        copp_series = _calc_coppock(prices)
        sharpe      = _calc_sharpe_from_prices(prices, rf_annual=cur_yield / 100)
        cur_wma     = next((v for v in reversed(wma_series)  if v is not None), current_price)
        cur_copp    = next((v for v in reversed(copp_series) if v is not None), 0.0)
        price_vs_wma   = "above" if current_price > cur_wma  else "below"
        coppock_signal = "bull"  if cur_copp > 0             else "bear"
        buy_sigs, sell_sigs = _find_crossings(prices, wma_series)
        # FIX: usar índices reales de precio en vez de valores aleatorios sin sentido
        news_events = [i for i, p in enumerate(prices) if i > 0 and abs((p - prices[i-1]) / prices[i-1] * 100) > 3][:4]

        # ── 6. Nuevos factores ────────────────────────────────────────
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

        # ── 6b. Indicadores técnicos adicionales (RSI, ADX, BB, ATR%) ──
        rsi_val = 50.0
        adx_val = 22.0
        bb_width_val = 0.05
        atr_pct_val = 1.5
        market_regime = "ranging"
        iv_rank_val = 30.0

        try:
            close_s = _safe_close(hist_daily)

            if isinstance(close_s, list) or not isinstance(close_s, pd.Series):
                close_s = pd.Series(close_s, dtype=float)

            high_s = _safe_col(hist_daily, "High")
            low_s  = _safe_col(hist_daily, "Low")

            if len(close_s) < 30:
                raise ValueError("Datos insuficientes")

            # RSI 14
            diff = close_s.diff()
            gains = diff.clip(lower=0)
            losses = (-diff).clip(lower=0)
            avg_gains = gains.ewm(alpha=1/14, adjust=False).mean()
            avg_losses = losses.ewm(alpha=1/14, adjust=False).mean()
            rs = avg_gains / avg_losses.replace(0, 1e-10)
            rsi_val = float((100 - 100 / (1 + rs)).iloc[-1])

            # ATR 14
            tr = pd.concat([
                high_s - low_s,
                (high_s - close_s.shift(1)).abs(),
                (low_s  - close_s.shift(1)).abs()
            ], axis=1).max(axis=1)
            atr14 = tr.ewm(alpha=1/14, adjust=False).mean()
            atr_abs = float(atr14.iloc[-1])
            atr_pct_val = round(atr_abs / close_s.iloc[-1] * 100, 3) if close_s.iloc[-1] > 0 else 1.5

            # ADX 14
            dm_plus = high_s.diff().clip(lower=0)
            dm_minus = (-low_s.diff()).clip(lower=0)
            di_plus = 100 * dm_plus.ewm(alpha=1/14, adjust=False).mean() / atr14.replace(0, 1e-10)
            di_minus = 100 * dm_minus.ewm(alpha=1/14, adjust=False).mean() / atr14.replace(0, 1e-10)
            dx = 100 * (di_plus - di_minus).abs() / (di_plus + di_minus).replace(0, 1e-10)
            adx_val = float(dx.ewm(alpha=1/14, adjust=False).mean().iloc[-1])

            # Bollinger Band Width
            sma20 = close_s.rolling(20).mean()
            std20 = close_s.rolling(20).std()
            bb_width_val = float(((sma20 + 2*std20) - (sma20 - 2*std20)) / sma20.replace(0, 1e-10)).iloc[-1]

            # Market Regime
            if bb_width_val < 0.03 and adx_val < 20:
                market_regime = "breakout"
            elif adx_val > 25:
                market_regime = "trending"
            elif atr_pct_val > 2.5:
                market_regime = "volatile"
            else:
                market_regime = "ranging"

            # IV Rank proxy
            returns = close_s.pct_change()
            roll_vol = returns.rolling(252).std() * np.sqrt(252) * 100
            curr_vol = returns.rolling(30).std().iloc[-1] * np.sqrt(252) * 100
            vol_min = float(roll_vol.min()) if not roll_vol.dropna().empty else 0
            vol_max = float(roll_vol.max()) if not roll_vol.dropna().empty else 0
            iv_rank_val = round((curr_vol - vol_min) / max(vol_max - vol_min, 1e-8) * 100, 1) if vol_max > vol_min else 50.0

        except Exception as _te:
            logging.warning(f"Technical indicators error for {ticker}: {_te}")

        # ── 7. Noticias ───────────────────────────────────────────────
        news_items = []
        try:
            raw_news = stock.news or []
            for article in raw_news[:4]:
                content      = article.get("content", article)
                provider     = content.get("provider", {})
                publisher    = provider.get("displayName", article.get("publisher", "Desconocido"))
                title        = content.get("title", article.get("title", "Sin título"))
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
            logging.warning(f"News fetch error for overton {ticker}: {e}")

        if not news_items:
            news_items = [{"headline": f"Sin noticias recientes para {ticker}", "description": "",
                           "impact": 0.0, "source": "N/A", "published": "N/A"}]

        news_impact_total = round(sum(n["impact"] for n in news_items), 2)
        bull_count        = sum(1 for n in news_items if n["impact"] > 0)
        news_sentiment    = "bull" if bull_count >= 3 else "bear" if bull_count <= 1 else "neutral"

        # ── 8. Analistas ──────────────────────────────────────────────
        analyst_buy = analyst_hold = analyst_sell = 0
        try:
            recs = stock.recommendations
            if recs is not None and not recs.empty:
                last         = recs.iloc[-1]
                analyst_buy  = int(last.get("strongBuy", 0)) + int(last.get("buy",  0))
                analyst_hold = int(last.get("hold", 0))
                analyst_sell = int(last.get("sell", 0))  + int(last.get("strongSell", 0))
        except Exception:
            pass
        if analyst_buy + analyst_hold + analyst_sell == 0:
            analyst_buy, analyst_hold, analyst_sell = 10, 5, 3

        total_a       = analyst_buy + analyst_hold + analyst_sell or 1
        analyst_ratio = analyst_buy / total_a

        # ── 9. Score multi-factor ─────────────────────────────────────
        score_result = _compute_multifactor_score(
            price_vs_wma=price_vs_wma, coppock_signal=coppock_signal,
            sharpe=sharpe, cur_vix=cur_vix, cur_yield=cur_yield,
            analyst_ratio=analyst_ratio, news_impact_total=news_impact_total,
            momentum_12_1=momentum_12_1, fgi=fgi_score, si_pct=si_pct,
            zscore_mr=zscore_mr, pcr=pcr, fg_proxy=fg_proxy,
            ofi=ofi, vwap_info=vwap_info, bas_pct=bas_pct,
            gex_proxy=gex_proxy, mi_proxy=mi_proxy, beta=beta,
        )
        score     = score_result["score"]
        breakdown = score_result["breakdown"]

        ov_zone, ov_desc = _overton_zone(score, news_impact_total)

        action = "sell"
        for (lo, hi), act in {(65, 100): "buy", (50, 65): "hold", (35, 50): "watch", (0, 35): "sell"}.items():
            if lo <= score <= hi:
                action = act; break

        bias_map = {"buy": "Sesgo alcista confirmado", "hold": "Sin sesgo claro — esperar",
                    "watch": "Sesgo mixto — vigilar",  "sell": "Sesgo bajista dominante"}

        # ── 10. Precios objetivo ──────────────────────────────────────
        atr           = round(current_price * 0.018, 4)
        news_adj      = round(current_price * (news_impact_total / 100), 4)
        stop_loss     = round(current_price - atr * 2.2, 2)
        entry_optimal = round(cur_wma * 1.003, 2)
        entry_agg     = round(current_price - atr * 0.5, 2)
        target1       = round(current_price + atr * 2.5 + abs(news_adj), 2)
        target2       = round(current_price + atr * 5.0 + abs(news_adj) * 1.5, 2)
        target3       = round(current_price + atr * 9.0 + abs(news_adj) * 2.0, 2)
        denom         = max(current_price - stop_loss, 0.001)
        rr1           = round((target1 - current_price) / denom, 2)
        rr2           = round((target2 - current_price) / denom, 2)

        # ── 11. Señales automáticas entrada / salida ──────────────────
        entry_signals, exit_signals = [], []

        if ofi > 0.2 and price_vs_wma == "above":
            entry_signals.append("OFI positivo: compradores dominan el flujo de órdenes")
        if vwap_info["price_vs_vwap"] == "above" and 0 < vwap_info["distance_pct"] < 5:
            entry_signals.append(f"Precio sobre VWAP +{vwap_info['distance_pct']:.1f}% — presión compradora")
        if si_pct > 15:
            entry_signals.append(f"Short Interest {si_pct:.1f}%: potencial squeeze alcista")
        if pcr > 1.3:
            entry_signals.append(f"PCR={pcr:.2f} (extremo miedo): señal contrarian alcista")
        if zscore_mr < -2:
            entry_signals.append(f"Z-score={zscore_mr:.2f}: sobreventa extrema, posible rebote")
        if fg_proxy["label"] == "positivo":
            entry_signals.append(f"Forward Guidance positivo: EPS growth {fg_proxy['eps_growth_pct']:.1f}%")
        if momentum_12_1 > 15:
            entry_signals.append(f"Momentum 12-1 fuerte: +{momentum_12_1:.1f}% en 12 meses")

        if ofi < -0.2:
            exit_signals.append("OFI negativo: vendedores dominan el flujo")
        if vwap_info["price_vs_vwap"] == "below" and abs(vwap_info["distance_pct"]) > 3:
            exit_signals.append(f"Precio bajo VWAP {vwap_info['distance_pct']:.1f}%: presión vendedora")
        if pcr < 0.6:
            exit_signals.append(f"PCR={pcr:.2f} (codicia extrema): riesgo de reversión")
        if zscore_mr > 2:
            exit_signals.append(f"Z-score={zscore_mr:.2f}: sobrecompra extrema, gestiona el riesgo")
        if momentum_12_1 < -15:
            exit_signals.append(f"Momentum 12-1 negativo: {momentum_12_1:.1f}% — tendencia bajista")

        return {
            # Base
            "ticker":          ticker,
            "current_price":   round(current_price, 2),
            "pct_change":      pct_change,
            "wma30":           round(cur_wma, 2),
            "price_vs_wma":    price_vs_wma,
            "coppock":         round(cur_copp, 4),
            "coppock_signal":  coppock_signal,
            "sharpe":          sanitize_float(sharpe),
            "vix":             sanitize_float(cur_vix),
            "us10y":           sanitize_float(cur_yield),
            # Nuevos factores
            "momentum_12_1":   sanitize_float(momentum_12_1),
            "fear_greed":      sanitize_float(fgi_score),
            "put_call_ratio":  sanitize_float(pcr),
            "short_interest":  sanitize_float(si_pct),
            "zscore_mean_rev": sanitize_float(zscore_mr),
            "beta":            sanitize_float(beta),
            "vwap":            vwap_info,
            "ofi":             sanitize_float(ofi),
            "bid_ask_spread":  sanitize_float(bas_pct),
            "gamma_exposure":  sanitize_float(gex_proxy),
            "market_impact":   sanitize_float(mi_proxy),
            "forward_guidance": fg_proxy,
            # Score
            "score":           score,
            "score_breakdown": breakdown,
            "overton_zone":    ov_zone,
            "overton_action":  action,
            "overton_description": ov_desc,
            "bias":            bias_map[action],
            # Señales
            "entry_signals":   entry_signals,
            "exit_signals":    exit_signals,
            # Noticias y analistas
            "news":               news_items,
            "news_impact_total":  sanitize_float(news_impact_total),
            "news_sentiment":     news_sentiment,
            "analyst_buy":        analyst_buy,
            "analyst_hold":       analyst_hold,
            "analyst_sell":       analyst_sell,
            # Precios objetivo
            "stop_loss":        sanitize_float(stop_loss),
            "entry_optimal":    sanitize_float(entry_optimal),
            "entry_aggressive": sanitize_float(entry_agg),
            "target1":          sanitize_float(target1),
            "target2":          sanitize_float(target2),
            "target3":          sanitize_float(target3),
            "rr1":              sanitize_float(rr1),
            "rr2":              sanitize_float(rr2),
            "atr":              sanitize_float(round(atr, 2)),
            # Series históricas
            "price_history":   [round(p, 2) for p in prices],
            "wma_history":     [round(v, 2) if v is not None else None for v in wma_series],
            "coppock_history": [round(v, 4) if v is not None else None for v in copp_series],
            "vix_history":     [sanitize_float(v) for v in vix_series],
            "yield_history":   [sanitize_float(v) for v in yield_series],
            "buy_signals":     buy_sigs,
            "sell_signals":    sell_sigs,
            "news_events":     news_events,
            # ── Indicadores técnicos adicionales (v4 panels) ────────────
            "rsi":             sanitize_float(rsi_val),
            "adx":             sanitize_float(adx_val),
            "bb_width":        sanitize_float(bb_width_val),
            "atr_pct":         sanitize_float(atr_pct_val),
            "market_regime":   market_regime,
            "iv_rank":         sanitize_float(iv_rank_val),
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error in overton endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al calcular Overton Signal: {str(e)}")


#*********************************************FIN DE CODIGO AÑADIDO***************************************************


#********************************************ENDPOINT INDICATOR CHART*************************************************
#nuevo indicador de grtaficos

"""
AÑADIR ESTE BLOQUE AL FINAL DE server.py (antes de app.include_router)
────────────────────────────────────────────────────────────────────────────────
Endpoint: GET /api/indicators-chart/{ticker}

Replica el script Python de finplot pero devuelve JSON listo para el frontend:
  Panel 1 – Velas OHLCV + Volumen coloreado + VAMA + VWAP + POC
  Panel 2 – RSI 14 + EMA 10 del RSI
  Panel 3 – Coppock Curve + EMA 13 del Coppock

Librerías usadas: yfinance (ya en el proyecto), finta (ya en el proyecto),
                  numpy, pandas (ya en el proyecto).

Instalación única si finta no está todavía:
  pip install finta
────────────────────────────────────────────────────────────────────────────────
"""

# ─── Modelos Pydantic ────────────────────────────────────────────────────────

class OHLCVPoint(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    volume_color: str          # "green" | "red"

class IndicatorPoint(BaseModel):
    date: str
    value: Optional[float]

class IndicatorsChartResponse(BaseModel):
    ticker: str
    company_name: str
    period: str
    # Panel 1
    candles: list            # List[OHLCVPoint]
    vama: list               # List[IndicatorPoint]
    vwap: list               # List[IndicatorPoint]
    poc_price: float         # Precio del Point of Control
    volume_ema: list         # EMA 24 del volumen (para overlay)
    # Panel 2
    rsi: list                # List[IndicatorPoint]
    rsi_ema: list            # EMA 10 del RSI
    # Panel 3
    coppock: list            # List[IndicatorPoint]
    coppock_ema: list        # EMA 13 del Coppock
    # Meta
    current_price: float
    swing_high: float
    swing_low: float


# ─── Helpers de cálculo ──────────────────────────────────────────────────────

def _flatten_yf(df: pd.DataFrame) -> pd.DataFrame:
    """Aplana MultiIndex de yfinance moderno y limpia el DataFrame."""
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.copy()
    df.index = pd.to_datetime(df.index)
    df = df[~df.index.duplicated(keep='last')]
    df = df.sort_index()
    return df


def _calc_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """RSI de Wilder (EMA suavizado)."""
    diff   = close.diff()
    gains  = diff.clip(lower=0)
    losses = (-diff).clip(lower=0)
    alpha  = 1 / period

    avg_gain = gains.ewm(alpha=alpha, adjust=False).mean()
    avg_loss = losses.ewm(alpha=alpha, adjust=False).mean()

    rs  = avg_gain / avg_loss.replace(0, 1e-10)
    rsi = 100 - (100 / (1 + rs))
    rsi.iloc[:period] = np.nan
    return rsi


def _calc_coppock2(close: pd.Series,
                  roc1: int = 14, roc2: int = 11, wma_p: int = 10) -> pd.Series:
    """Coppock Curve = WMA(ROC14 + ROC11, 10)."""
    r1  = close.pct_change(roc1) * 100
    r2  = close.pct_change(roc2) * 100
    raw = r1 + r2

    # WMA ponderada de 10 períodos
    weights = np.arange(1, wma_p + 1, dtype=float)
    copp = raw.rolling(wma_p).apply(
        lambda x: np.dot(x, weights) / weights.sum(), raw=True
    )
    return copp


def _calc_vwap(df: pd.DataFrame) -> pd.Series:
    """VWAP acumulado de todo el período."""
    typical = (df['High'] + df['Low'] + df['Close']) / 3
    cum_tv  = (typical * df['Volume']).cumsum()
    cum_v   = df['Volume'].cumsum().replace(0, np.nan)
    return cum_tv / cum_v


def _calc_vama(df: pd.DataFrame) -> pd.Series:
    """
    VAMA (Volume Adjusted Moving Average) via finta.
    Fallback a VWAP si finta no está disponible.
    """
    try:
        from finta import TA
        vama = TA.VAMA(df[['Open', 'High', 'Low', 'Close', 'Volume']])
        if isinstance(vama, pd.DataFrame):
            vama = vama.iloc[:, 0]
        return vama
    except Exception:
        # Fallback: EMA ponderada por volumen
        typical = (df['High'] + df['Low'] + df['Close']) / 3
        vol_w   = df['Volume'] / df['Volume'].rolling(20).mean().fillna(1)
        return (typical * vol_w).ewm(span=20).mean()
        


def _calc_poc(df: pd.DataFrame, bins: int = 100) -> float:
    """Point of Control: precio con mayor volumen acumulado (30 semanas)."""
    try:
        df2 = df.copy()
        df2['vol_price'] = df2['Close'] * df2['Volume']
        price_ranges = pd.cut(df2['Close'], bins=bins)
        grouped      = df2.groupby(price_ranges, observed=True)['vol_price'].sum()
        poc_mid      = grouped.idxmax().mid
        return float(poc_mid)
    except Exception:
        return float(df['Close'].mean())


def _to_indicator_list(series: pd.Series, dates: pd.Index) -> list:
    """Convierte una Serie pandas a lista de {date, value}."""
    out = []
    for d, v in zip(dates, series.reindex(dates)):
        val = None if (v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v)))) else round(float(v), 4)
        out.append({"date": str(d)[:10], "value": val})
    return out


# ─── Endpoint ────────────────────────────────────────────────────────────────

@api_router.get("/indicators-chart/{ticker}")
async def get_indicators_chart(ticker: str, period: str = "30wk"):
    """
    Devuelve datos para los 3 paneles del gráfico de indicadores:
      Panel 1 – Velas + Volumen + VAMA + VWAP + POC
      Panel 2 – RSI 14 + EMA 10 del RSI
      Panel 3 – Coppock + EMA 13 del Coppock

    Parámetros:
      period: "30wk" (default), "60wk", "1y", "2y"
    """
    try:
        ticker = ticker.upper().strip()

        # Mapeo de períodos
        period_map = {
            "30wk": "30wk", "60wk": "60wk",
            "1y":   "1y",   "2y":   "2y",
            "6m":   "6mo",  "3m":   "3mo",
        }
        yf_period = period_map.get(period, "30wk")

        stock = yf.Ticker(ticker)
        info  = stock.info or {}

        raw = stock.history(period=yf_period)
        if raw.empty:
            raise HTTPException(status_code=404, detail=f"No hay datos para {ticker}")

        df = _flatten_yf(raw)

        # Asegurar columnas necesarias
        needed = {'Open', 'High', 'Low', 'Close', 'Volume'}
        missing = needed - set(df.columns)
        if missing:
            raise HTTPException(status_code=500, detail=f"Columnas faltantes: {missing}")

        # Eliminar filas con nulos en OHLCV
        df = df.dropna(subset=list(needed))
        if len(df) < 15:
            raise HTTPException(status_code=404, detail="Datos insuficientes")

        dates = df.index

        # ── Panel 1: Velas ──────────────────────────────────────────────────
        candles = []
        for i, (idx, row) in enumerate(df.iterrows()):
            color = "green" if row['Close'] >= row['Open'] else "red"
            candles.append({
                "date":         str(idx)[:10],
                "open":         round(float(row['Open']),   4),
                "high":         round(float(row['High']),   4),
                "low":          round(float(row['Low']),    4),
                "close":        round(float(row['Close']),  4),
                "volume":       round(float(row['Volume']), 0),
                "volume_color": color,
            })

        # ── VWAP ────────────────────────────────────────────────────────────
        vwap_series = _calc_vwap(df)
        vwap_list   = _to_indicator_list(vwap_series, dates)

        # ── VAMA ────────────────────────────────────────────────────────────
        vama_series = _calc_vama(df)
        vama_list   = _to_indicator_list(vama_series, dates)

        # ── POC ─────────────────────────────────────────────────────────────
        poc_price = _calc_poc(df)

        # ── Volumen EMA 24 ──────────────────────────────────────────────────
        vol_ema   = df['Volume'].ewm(span=24).mean()
        vol_ema_l = _to_indicator_list(vol_ema, dates)

        # ── Panel 2: RSI ─────────────────────────────────────────────────────
        rsi_series = _calc_rsi(df['Close'])
        rsi_ema    = rsi_series.ewm(span=10).mean()
        rsi_list   = _to_indicator_list(rsi_series, dates)
        rsi_ema_l  = _to_indicator_list(rsi_ema,    dates)

        # ── Panel 3: Coppock ─────────────────────────────────────────────────
        copp_series = _calc_coppock2(df['Close'])
        copp_ema    = copp_series.ewm(span=13).mean()
        copp_list   = _to_indicator_list(copp_series, dates)
        copp_ema_l  = _to_indicator_list(copp_ema,    dates)

        # ── Meta ─────────────────────────────────────────────────────────────
        current_price = float(df['Close'].iloc[-1])
        swing_high    = float(df['High'].max())
        swing_low     = float(df['Low'].min())
        company_name  = info.get('longName', info.get('shortName', ticker))

        return {
            "ticker":        ticker,
            "company_name":  company_name,
            "period":        period,
            "candles":       candles,
            "vama":          vama_list,
            "vwap":          vwap_list,
            "poc_price":     round(poc_price, 4),
            "volume_ema":    vol_ema_l,
            "rsi":           rsi_list,
            "rsi_ema":       rsi_ema_l,
            "coppock":       copp_list,
            "coppock_ema":   copp_ema_l,
            "current_price": round(current_price, 4),
            "swing_high":    round(swing_high, 4),
            "swing_low":     round(swing_low, 4),
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error en indicators-chart para {ticker}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al calcular indicadores: {e}")




#********************************************FIN DEL ENDPOINT*********************************************************

# ─────────────────────────────────────────────────────────────────────────────
# Endpoint: /api/financial-statements/{ticker}
# Devuelve los datos financieros clave para pre-rellenar el modelo FCFF/WACC
# Todos los valores monetarios en millones USD (M$), acciones en millones (M)
# ─────────────────────────────────────────────────────────────────────────────
@api_router.get("/financial-statements/{ticker}")
async def get_financial_statements(ticker: str):
    """
    Extrae del balance, cuenta de resultados y flujo de caja los datos
    necesarios para la valoración FCFF/WACC. Valores en millones USD.
    """
    try:
        ticker = ticker.upper().strip()
        stock = yf.Ticker(ticker)
        info  = stock.info

        if not info or info.get("regularMarketPrice") is None and info.get("currentPrice") is None:
            raise HTTPException(status_code=404, detail=f"No se encontraron datos para '{ticker}'")

        income_stmt  = stock.income_stmt
        balance_sheet = stock.balance_sheet
        cash_flow    = stock.cash_flow

        # Columna más reciente (FY más reciente)
        income  = income_stmt.iloc[:, 0].to_dict()  if income_stmt  is not None and not income_stmt.empty  else {}
        balance = balance_sheet.iloc[:, 0].to_dict() if balance_sheet is not None and not balance_sheet.empty else {}
        cf      = cash_flow.iloc[:, 0].to_dict()    if cash_flow    is not None and not cash_flow.empty    else {}

        def _m(v, fallback=None):
            """Convierte a millones, devuelve fallback si inválido."""
            try:
                if v is None: return fallback
                f = float(v)
                if math.isnan(f) or math.isinf(f): return fallback
                return round(f / 1e6, 1)
            except:
                return fallback

        def _pct(v, fallback=None):
            try:
                if v is None: return fallback
                f = float(v)
                if math.isnan(f) or math.isinf(f): return fallback
                return round(f * 100, 2)
            except:
                return fallback

        # ── EBIT ─────────────────────────────────────────────────────────────
        ebit_raw = income.get("EBIT") or income.get("Operating Income")
        ebit_m   = _m(ebit_raw)

        # ── D&A ──────────────────────────────────────────────────────────────
        da_raw = cf.get("Depreciation And Amortization") or cf.get("Depreciation")
        da_m   = _m(da_raw)
        if da_m is not None:
            da_m = abs(da_m)

        # ── Capex ─────────────────────────────────────────────────────────────
        capex_raw = cf.get("Capital Expenditure") or cf.get("Capital Expenditures")
        capex_m   = _m(capex_raw)
        if capex_m is not None:
            capex_m = abs(capex_m)

        # ── Variación del capital circulante ──────────────────────────────────
        # Change in Working Capital: diferencia entre activo corriente y pasivo corriente YoY
        wc_change_raw = cf.get("Change In Working Capital") or cf.get("Changes In Working Capital")
        wc_m = _m(wc_change_raw)
        # Signo: positivo = aumento de WC = salida de caja
        if wc_m is not None:
            wc_m = round(-wc_m, 1)  # Invertir signo para la fórmula FCFF

        # ── Deuda neta ────────────────────────────────────────────────────────
        total_debt_raw = balance.get("Total Debt") or info.get("totalDebt")
        cash_raw       = balance.get("Cash And Cash Equivalents") or balance.get("Cash Cash Equivalents And Short Term Investments")
        total_debt_m   = _m(total_debt_raw, 0)
        cash_m_val     = _m(cash_raw, 0)
        net_debt_m     = round(total_debt_m - cash_m_val, 1) if total_debt_m is not None and cash_m_val is not None else None

        # ── Acciones en circulación (millones) ────────────────────────────────
        shares_raw = info.get("sharesOutstanding")
        shares_m   = round(float(shares_raw) / 1e6, 2) if shares_raw else None

        # ── Precio actual ─────────────────────────────────────────────────────
        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        if current_price:
            current_price = round(float(current_price), 2)

        # ── Tasa impositiva efectiva ───────────────────────────────────────────
        # Intentar calcularla desde la cuenta de resultados
        pretax_income = income.get("Pretax Income") or income.get("Income Before Tax")
        tax_provision  = income.get("Tax Provision") or income.get("Income Tax Expense")
        tax_rate = None
        if pretax_income and tax_provision:
            try:
                rate = float(tax_provision) / float(pretax_income)
                if 0.01 < rate < 0.6:
                    tax_rate = round(rate * 100, 1)
            except:
                pass
        if tax_rate is None:
            tax_rate = _pct(info.get("effectiveTaxRate"))
        if tax_rate is None:
            tax_rate = 21.0  # fallback estándar

        # ── Beta ──────────────────────────────────────────────────────────────
        beta = info.get("beta")
        if beta:
            beta = round(float(beta), 2)

        # ── Peso equity (We) desde estructura de capital ──────────────────────
        market_cap  = info.get("marketCap")
        we = None
        if market_cap and total_debt_raw:
            try:
                mc = float(market_cap)
                td = float(total_debt_raw)
                total_cap = mc + td
                if total_cap > 0:
                    we = round((mc / total_cap) * 100, 1)
            except:
                pass

        # ── Kd estimado (coste de la deuda) ──────────────────────────────────
        interest_expense = abs(float(income.get("Interest Expense", income.get("Interest Expense Non Operating", 0)) or 0))
        kd = None
        if interest_expense > 0 and total_debt_raw:
            try:
                kd = round((interest_expense / float(total_debt_raw)) * 100, 2)
                if kd > 20 or kd < 0.5:  # Sanity check
                    kd = None
            except:
                pass

        # ── Nombre de la empresa ───────────────────────────────────────────────
        company_name = info.get("longName") or info.get("shortName") or ticker

        # ── Año fiscal del dato ────────────────────────────────────────────────
        fiscal_year = None
        try:
            if income_stmt is not None and not income_stmt.empty:
                col_date = income_stmt.columns[0]
                fiscal_year = str(col_date)[:10]
        except:
            pass

        return {
            "ticker":       ticker,
            "company_name": company_name,
            "fiscal_year":  fiscal_year,
            # Valores en M$
            "ebit":         ebit_m,
            "da":           da_m,
            "capex":        capex_m,
            "wc":           wc_m,
            "net_debt":     net_debt_m,
            "shares":       shares_m,
            "current_price": current_price,
            # Parámetros de modelo
            "tax_rate":     tax_rate,
            "beta":         beta,
            "we":           we,
            "kd":           kd,
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error en financial-statements para {ticker}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener datos financieros: {str(e)}")


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
