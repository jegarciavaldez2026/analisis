from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime, timedelta
import yfinance as yf
import numpy as np
import pandas as pd

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

class HistoryItem(BaseModel):
    id: str
    ticker: str
    company_name: str
    analysis_date: datetime
    recommendation: str
    favorable_percentage: float

# Helper Functions for Financial Calculations
def safe_divide(numerator, denominator, default=None):
    """Safely divide two numbers, return default if division fails"""
    try:
        if denominator == 0 or denominator is None or numerator is None:
            return default
        result = numerator / denominator
        if np.isnan(result) or np.isinf(result):
            return default
        return result
    except:
        return default

def get_cagr(start_value, end_value, periods, default=None):
    """Calculate Compound Annual Growth Rate"""
    try:
        if start_value <= 0 or end_value <= 0 or periods <= 0:
            return default
        cagr = (pow(end_value / start_value, 1 / periods) - 1) * 100
        if np.isnan(cagr) or np.isinf(cagr):
            return default
        return cagr
    except:
        return default

def calculate_ratios(ticker_data):
    """Calculate all financial ratios"""
    try:
        # Get financial statements
        income_stmt = ticker_data.income_stmt
        balance_sheet = ticker_data.balance_sheet
        cash_flow = ticker_data.cash_flow
        info = ticker_data.info
        
        # Convert to dict for easier access (most recent is first column)
        if not income_stmt.empty:
            income = income_stmt.iloc[:, 0].to_dict() if income_stmt.shape[1] > 0 else {}
            income_prev = income_stmt.iloc[:, -1].to_dict() if income_stmt.shape[1] > 1 else {}
        else:
            income = {}
            income_prev = {}
            
        if not balance_sheet.empty:
            balance = balance_sheet.iloc[:, 0].to_dict() if balance_sheet.shape[1] > 0 else {}
        else:
            balance = {}
            
        if not cash_flow.empty:
            cf = cash_flow.iloc[:, 0].to_dict() if cash_flow.shape[1] > 0 else {}
        else:
            cf = {}
        
        # Extract key financial data with safe fallbacks
        total_revenue = income.get('Total Revenue', info.get('totalRevenue', 0))
        gross_profit = income.get('Gross Profit', 0)
        operating_income = income.get('Operating Income', 0)
        ebit = income.get('EBIT', operating_income)
        net_income = income.get('Net Income', info.get('netIncomeToCommon', 0))
        
        total_assets = balance.get('Total Assets', info.get('totalAssets', 0))
        current_assets = balance.get('Current Assets', 0)
        total_liabilities = balance.get('Total Liabilities Net Minority Interest', 0)
        current_liabilities = balance.get('Current Liabilities', 0)
        total_equity = balance.get('Total Equity Gross Minority Interest', balance.get('Stockholders Equity', info.get('totalStockholderEquity', 0)))
        cash = balance.get('Cash And Cash Equivalents', 0)
        retained_earnings = balance.get('Retained Earnings', 0)
        total_debt = balance.get('Total Debt', info.get('totalDebt', 0))
        
        operating_cf = cf.get('Operating Cash Flow', cf.get('Total Cash From Operating Activities', 0))
        capex = abs(cf.get('Capital Expenditure', cf.get('Capital Expenditures', 0)))
        free_cash_flow = operating_cf - capex
        
        # Market data
        market_cap = info.get('marketCap', 0)
        enterprise_value = info.get('enterpriseValue', market_cap)
        current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))
        shares_outstanding = info.get('sharesOutstanding', 0)
        
        # PE ratio and EPS
        pe_ratio = info.get('trailingPE', safe_divide(current_price * shares_outstanding, net_income) if net_income > 0 else None)
        eps = info.get('trailingEps', safe_divide(net_income, shares_outstanding) if shares_outstanding > 0 else 0)
        
        # Calculate net debt
        net_debt = total_debt - cash
        
        # Calculate margins
        gross_margin = safe_divide(gross_profit, total_revenue, 0) * 100
        net_margin = safe_divide(net_income, total_revenue, 0) * 100
        operating_margin = safe_divide(operating_income, total_revenue, 0) * 100
        ebit_margin = safe_divide(ebit, total_revenue, 0) * 100
        
        # Calculate profitability ratios
        roe = safe_divide(net_income, total_equity, 0) * 100 if total_equity > 0 else 0
        roa = safe_divide(net_income, total_assets, 0) * 100
        
        # Calculate invested capital and ROIC
        invested_capital = (total_equity + total_debt) if total_equity and total_debt else 0
        nopat = ebit * 0.79  # Assuming 21% tax rate
        roic = safe_divide(nopat, invested_capital, 0) * 100 if invested_capital > 0 else 0
        
        # Calculate liquidity ratios
        current_ratio = safe_divide(current_assets, current_liabilities, 0)
        quick_assets = current_assets - balance.get('Inventory', 0)
        quick_ratio = safe_divide(quick_assets, current_liabilities, 0)
        cash_ratio = safe_divide(cash, current_liabilities, 0)
        
        # Calculate leverage ratios
        debt_to_equity = safe_divide(total_liabilities, total_equity, 0) * 100 if total_equity > 0 else 0
        debt_ratio = safe_divide(total_liabilities, total_assets, 0)
        
        # Calculate valuation ratios
        ev_ebit = safe_divide(enterprise_value, ebit) if ebit != 0 else None
        ev_sales = safe_divide(enterprise_value, total_revenue) if total_revenue > 0 else None
        price_to_sales = safe_divide(market_cap, total_revenue) if total_revenue > 0 else None
        earning_yield = safe_divide(ebit, enterprise_value, 0) * 100 if enterprise_value > 0 else 0
        
        # Calculate cash flow ratios
        fcf_margin = safe_divide(free_cash_flow, total_revenue, 0) * 100
        operating_cf_to_sales = safe_divide(operating_cf, total_revenue, 0) * 100
        capex_to_revenue = safe_divide(capex, total_revenue, 0) * 100
        capex_to_ocf = safe_divide(capex, operating_cf, 0) * 100 if operating_cf != 0 else 0
        
        # Calculate other important ratios
        working_capital = current_assets - current_liabilities
        asset_turnover = safe_divide(total_revenue, total_assets, 0)
        equity_multiplier = safe_divide(total_assets, total_equity, 0) if total_equity > 0 else 0
        
        # Altman Z-Score (simplified for public companies)
        x1 = safe_divide(working_capital, total_assets, 0)
        x2 = safe_divide(retained_earnings, total_assets, 0)
        x3 = safe_divide(ebit, total_assets, 0)
        x4 = safe_divide(market_cap, total_liabilities, 0) if total_liabilities > 0 else 0
        x5 = safe_divide(total_revenue, total_assets, 0)
        altman_z = 1.2*x1 + 1.4*x2 + 3.3*x3 + 0.6*x4 + 1.0*x5
        
        # Piotroski F-Score (simplified)
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
        
        # Build ratio results
        ratios = {
            # Growth metrics
            'revenue_growth_5y': 0,  # Would need historical data
            'fcf_growth_5y': 0,
            'eps_growth_5y': 0,
            
            # Profitability
            'roe': roe,
            'roa': roa,
            'roic': roic,
            'gross_margin': gross_margin,
            'net_margin': net_margin,
            'operating_margin': operating_margin,
            'ebit_margin': ebit_margin,
            
            # Liquidity
            'current_ratio': current_ratio,
            'quick_ratio': quick_ratio,
            'cash_ratio': cash_ratio,
            'working_capital': working_capital,
            
            # Leverage
            'debt_to_equity': debt_to_equity,
            'debt_ratio': debt_ratio,
            'net_debt': net_debt,
            'equity_multiplier': equity_multiplier,
            
            # Valuation
            'pe_ratio': pe_ratio,
            'ev_ebit': ev_ebit,
            'ev_sales': ev_sales,
            'price_to_sales': price_to_sales,
            'earning_yield': earning_yield,
            
            # Cash Flow
            'free_cash_flow': free_cash_flow,
            'fcf_margin': fcf_margin,
            'operating_cf': operating_cf,
            'operating_cf_to_sales': operating_cf_to_sales,
            'capex_to_revenue': capex_to_revenue,
            'capex_to_ocf': capex_to_ocf,
            
            # Other
            'retained_earnings': retained_earnings,
            'asset_turnover': asset_turnover,
            'eps': eps,
            
            # Scores
            'altman_z_score': altman_z,
            'piotroski_f_score': f_score,
        }
        
        return ratios, info
        
    except Exception as e:
        logging.error(f"Error calculating ratios: {str(e)}")
        raise

def evaluate_ratios(ratios, info):
    """Evaluate ratios against thresholds and create recommendations"""
    categories = []
    total_metrics = 0
    favorable = 0
    
    # Category 1: Profitability Metrics
    profitability_metrics = []
    
    # ROE
    roe_val = ratios.get('roe', 0)
    roe_passed = roe_val > 15
    profitability_metrics.append(RatioMetric(
        name="ROE (Return on Equity)",
        value=roe_val,
        threshold="> 15%",
        passed=roe_passed,
        interpretation="Mide la rentabilidad sobre el capital de los accionistas",
        display_value=f"{roe_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if roe_passed else 0
    
    # ROA
    roa_val = ratios.get('roa', 0)
    roa_passed = roa_val > 5
    profitability_metrics.append(RatioMetric(
        name="ROA (Return on Assets)",
        value=roa_val,
        threshold="> 5%",
        passed=roa_passed,
        interpretation="Mide la eficiencia en el uso de activos",
        display_value=f"{roa_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if roa_passed else 0
    
    # ROIC
    roic_val = ratios.get('roic', 0)
    roic_passed = roic_val > 15
    profitability_metrics.append(RatioMetric(
        name="ROIC (Return on Invested Capital)",
        value=roic_val,
        threshold="> 15%",
        passed=roic_passed,
        interpretation="Retorno sobre el capital invertido",
        display_value=f"{roic_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if roic_passed else 0
    
    # Gross Margin
    gm_val = ratios.get('gross_margin', 0)
    gm_passed = gm_val > 40
    profitability_metrics.append(RatioMetric(
        name="Margen Bruto (Gross Margin)",
        value=gm_val,
        threshold="> 40%",
        passed=gm_passed,
        interpretation="Rentabilidad después de costos de producción",
        display_value=f"{gm_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if gm_passed else 0
    
    # Net Margin
    nm_val = ratios.get('net_margin', 0)
    nm_passed = nm_val > 10
    profitability_metrics.append(RatioMetric(
        name="Margen Neto (Net Margin)",
        value=nm_val,
        threshold="> 10%",
        passed=nm_passed,
        interpretation="Rentabilidad final después de todos los gastos",
        display_value=f"{nm_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if nm_passed else 0
    
    # Operating Margin
    om_val = ratios.get('operating_margin', 0)
    om_passed = om_val > 15
    profitability_metrics.append(RatioMetric(
        name="Margen Operativo (Operating Margin)",
        value=om_val,
        threshold="> 15%",
        passed=om_passed,
        interpretation="Rentabilidad de operaciones principales",
        display_value=f"{om_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if om_passed else 0
    
    categories.append(RatioCategory(
        category="📊 Rentabilidad",
        metrics=profitability_metrics
    ))
    
    # Category 2: Liquidity Metrics
    liquidity_metrics = []
    
    # Current Ratio
    cr_val = ratios.get('current_ratio', 0)
    cr_passed = 1.2 <= cr_val <= 2.0
    liquidity_metrics.append(RatioMetric(
        name="Ratio Corriente (Current Ratio)",
        value=cr_val,
        threshold="1.2 - 2.0",
        passed=cr_passed,
        interpretation="Capacidad para pagar obligaciones a corto plazo",
        display_value=f"{cr_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if cr_passed else 0
    
    # Quick Ratio
    qr_val = ratios.get('quick_ratio', 0)
    qr_passed = qr_val > 1.0
    liquidity_metrics.append(RatioMetric(
        name="Ratio Rápido (Quick Ratio)",
        value=qr_val,
        threshold="> 1.0",
        passed=qr_passed,
        interpretation="Liquidez inmediata sin inventarios",
        display_value=f"{qr_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if qr_passed else 0
    
    # Cash Ratio
    cash_r_val = ratios.get('cash_ratio', 0)
    cash_r_passed = cash_r_val > 0.5
    liquidity_metrics.append(RatioMetric(
        name="Ratio de Efectivo (Cash Ratio)",
        value=cash_r_val,
        threshold="> 0.5",
        passed=cash_r_passed,
        interpretation="Capacidad de pago inmediata con efectivo",
        display_value=f"{cash_r_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if cash_r_passed else 0
    
    categories.append(RatioCategory(
        category="💧 Liquidez",
        metrics=liquidity_metrics
    ))
    
    # Category 3: Leverage Metrics
    leverage_metrics = []
    
    # Debt to Equity
    dte_val = ratios.get('debt_to_equity', 0)
    dte_passed = dte_val < 50
    leverage_metrics.append(RatioMetric(
        name="Deuda/Capital (Debt-to-Equity)",
        value=dte_val,
        threshold="< 50%",
        passed=dte_passed,
        interpretation="Nivel de apalancamiento financiero",
        display_value=f"{dte_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if dte_passed else 0
    
    # Debt Ratio
    dr_val = ratios.get('debt_ratio', 0)
    dr_passed = dr_val < 0.5
    leverage_metrics.append(RatioMetric(
        name="Ratio de Deuda (Debt Ratio)",
        value=dr_val,
        threshold="< 0.5",
        passed=dr_passed,
        interpretation="Proporción de activos financiados con deuda",
        display_value=f"{dr_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if dr_passed else 0
    
    # Net Debt
    nd_val = ratios.get('net_debt', 0)
    nd_passed = nd_val < 0
    leverage_metrics.append(RatioMetric(
        name="Deuda Neta (Net Debt)",
        value=nd_val,
        threshold="< 0 (más efectivo que deuda)",
        passed=nd_passed,
        interpretation="Deuda total menos efectivo disponible",
        display_value=f"${nd_val:,.0f}"
    ))
    total_metrics += 1
    favorable += 1 if nd_passed else 0
    
    categories.append(RatioCategory(
        category="⚖️ Apalancamiento",
        metrics=leverage_metrics
    ))
    
    # Category 4: Valuation Metrics
    valuation_metrics = []
    
    # P/E Ratio
    pe_val = ratios.get('pe_ratio')
    pe_passed = pe_val is not None and 0 < pe_val < 25
    valuation_metrics.append(RatioMetric(
        name="P/E Ratio (Precio/Beneficio)",
        value=pe_val,
        threshold="< 25",
        passed=pe_passed,
        interpretation="Valoración del mercado vs beneficios",
        display_value=f"{pe_val:.2f}" if pe_val else "N/A"
    ))
    total_metrics += 1
    favorable += 1 if pe_passed else 0
    
    # EV/EBIT
    ev_ebit_val = ratios.get('ev_ebit')
    ev_ebit_passed = ev_ebit_val is not None and 0 < ev_ebit_val < 15
    valuation_metrics.append(RatioMetric(
        name="EV/EBIT",
        value=ev_ebit_val,
        threshold="< 15",
        passed=ev_ebit_passed,
        interpretation="Valoración empresarial vs EBIT",
        display_value=f"{ev_ebit_val:.2f}" if ev_ebit_val else "N/A"
    ))
    total_metrics += 1
    favorable += 1 if ev_ebit_passed else 0
    
    # Earning Yield
    ey_val = ratios.get('earning_yield', 0)
    ey_passed = ey_val > 8
    valuation_metrics.append(RatioMetric(
        name="Earning Yield (EBIT/EV)",
        value=ey_val,
        threshold="> 8%",
        passed=ey_passed,
        interpretation="Retorno operativo vs valor empresarial",
        display_value=f"{ey_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if ey_passed else 0
    
    # P/S Ratio
    ps_val = ratios.get('price_to_sales')
    ps_passed = ps_val is not None and ps_val < 2
    valuation_metrics.append(RatioMetric(
        name="P/S Ratio (Precio/Ventas)",
        value=ps_val,
        threshold="< 2",
        passed=ps_passed,
        interpretation="Valoración del mercado vs ventas",
        display_value=f"{ps_val:.2f}" if ps_val else "N/A"
    ))
    total_metrics += 1
    favorable += 1 if ps_passed else 0
    
    categories.append(RatioCategory(
        category="💰 Valoración",
        metrics=valuation_metrics
    ))
    
    # Category 5: Cash Flow Metrics
    cashflow_metrics = []
    
    # Free Cash Flow
    fcf_val = ratios.get('free_cash_flow', 0)
    fcf_passed = fcf_val > 0
    cashflow_metrics.append(RatioMetric(
        name="Flujo de Caja Libre (FCF)",
        value=fcf_val,
        threshold="> 0",
        passed=fcf_passed,
        interpretation="Efectivo generado después de inversiones",
        display_value=f"${fcf_val:,.0f}"
    ))
    total_metrics += 1
    favorable += 1 if fcf_passed else 0
    
    # FCF Margin
    fcf_m_val = ratios.get('fcf_margin', 0)
    fcf_m_passed = fcf_m_val > 15
    cashflow_metrics.append(RatioMetric(
        name="Margen FCF (FCF Margin)",
        value=fcf_m_val,
        threshold="> 15%",
        passed=fcf_m_passed,
        interpretation="FCF como % de las ventas",
        display_value=f"{fcf_m_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if fcf_m_passed else 0
    
    # Operating CF to Sales
    ocf_s_val = ratios.get('operating_cf_to_sales', 0)
    ocf_s_passed = ocf_s_val > 15
    cashflow_metrics.append(RatioMetric(
        name="OCF/Ventas",
        value=ocf_s_val,
        threshold="> 15%",
        passed=ocf_s_passed,
        interpretation="Conversión de ventas a flujo de caja",
        display_value=f"{ocf_s_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if ocf_s_passed else 0
    
    # Capex to Revenue
    capex_r_val = ratios.get('capex_to_revenue', 0)
    capex_r_passed = capex_r_val < 20
    cashflow_metrics.append(RatioMetric(
        name="Capex/Ventas",
        value=capex_r_val,
        threshold="< 20%",
        passed=capex_r_passed,
        interpretation="Inversión en activos vs ventas",
        display_value=f"{capex_r_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if capex_r_passed else 0
    
    categories.append(RatioCategory(
        category="💵 Flujo de Caja",
        metrics=cashflow_metrics
    ))
    
    # Category 6: Financial Health Scores
    scores_metrics = []
    
    # Altman Z-Score
    z_val = ratios.get('altman_z_score', 0)
    z_passed = z_val > 2.99
    scores_metrics.append(RatioMetric(
        name="Altman Z-Score",
        value=z_val,
        threshold="> 2.99 (zona segura)",
        passed=z_passed,
        interpretation="Probabilidad de quiebra (>2.99 = baja)",
        display_value=f"{z_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if z_passed else 0
    
    # Piotroski F-Score
    f_val = ratios.get('piotroski_f_score', 0)
    f_passed = f_val >= 7
    scores_metrics.append(RatioMetric(
        name="Piotroski F-Score",
        value=f_val,
        threshold=">= 7",
        passed=f_passed,
        interpretation="Solidez financiera (0-9, 7+ es fuerte)",
        display_value=f"{int(f_val)}"
    ))
    total_metrics += 1
    favorable += 1 if f_passed else 0
    
    categories.append(RatioCategory(
        category="🏥 Salud Financiera",
        metrics=scores_metrics
    ))
    
    # Calculate recommendation
    favorable_pct = (favorable / total_metrics) * 100
    
    if favorable_pct >= 60:
        recommendation = "COMPRAR"
        risk_level = "Bajo"
    elif favorable_pct >= 40:
        recommendation = "MANTENER"
        risk_level = "Moderado"
    else:
        recommendation = "VENDER"
        risk_level = "Alto"
    
    # Summary flags
    summary_flags = {
        "profitable": ratios.get('net_margin', 0) > 0,
        "positive_fcf": ratios.get('free_cash_flow', 0) > 0,
        "low_debt": ratios.get('debt_ratio', 1) < 0.5,
        "good_margins": ratios.get('gross_margin', 0) > 40,
        "healthy_liquidity": ratios.get('current_ratio', 0) > 1.2,
        "strong_roe": ratios.get('roe', 0) > 15
    }
    
    return categories, favorable_pct, recommendation, risk_level, total_metrics, favorable, summary_flags

# Routes
@api_router.post("/analyze", response_model=AnalysisResponse)
async def analyze_stock(request: AnalyzeRequest):
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
        categories, favorable_pct, recommendation, risk_level, total_metrics, favorable_count, summary_flags = evaluate_ratios(ratios, stock_info)
        
        # Prepare metadata
        metadata = {
            "sector": stock_info.get('sector', 'N/A'),
            "industry": stock_info.get('industry', 'N/A'),
            "market_cap": stock_info.get('marketCap', 0),
            "current_price": stock_info.get('currentPrice', stock_info.get('regularMarketPrice', 0)),
            "currency": stock_info.get('currency', 'USD'),
            "exchange": stock_info.get('exchange', 'N/A'),
            "country": stock_info.get('country', 'N/A'),
            "website": stock_info.get('website', ''),
            "description": stock_info.get('longBusinessSummary', '')[:200] + '...' if stock_info.get('longBusinessSummary') else ''
        }
        
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
            summary_flags=summary_flags
        )
        
        # Save to database
        await db.analyses.insert_one(analysis.dict())
        
        return analysis
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error analyzing stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al analizar la acción: {str(e)}")

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
