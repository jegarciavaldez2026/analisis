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
    valuation_summary: Dict[str, Any] = Field(default_factory=dict)

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
        
        # ROCE (Return on Capital Employed)
        capital_employed = total_assets - current_liabilities if current_liabilities else total_assets
        roce = safe_divide(ebit, capital_employed, 0) * 100 if capital_employed > 0 else 0
        
        # Calculate invested capital and ROIC
        invested_capital = (total_equity + total_debt) if total_equity and total_debt else 0
        nopat = ebit * 0.79  # Assuming 21% tax rate
        roic = safe_divide(nopat, invested_capital, 0) * 100 if invested_capital > 0 else 0
        nopat_margin = safe_divide(nopat, total_revenue, 0) * 100 if total_revenue > 0 else 0
        
        # CROIC (Cash Return on Invested Capital)
        croic = safe_divide(operating_cf, invested_capital, 0) * 100 if invested_capital > 0 else 0
        
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
        
        # NEW RATIOS
        # Beta
        beta = info.get('beta', 0)
        
        # Interest Coverage Ratio
        interest_expense = abs(income.get('Interest Expense', income.get('Interest Expense Non Operating', 0)))
        interest_coverage = safe_divide(ebit, interest_expense) if interest_expense > 0 else 0
        
        # Capex / Depreciation & Amortization
        depreciation = abs(cf.get('Depreciation And Amortization', cf.get('Depreciation', 0)))
        capex_to_da = safe_divide(capex, depreciation) if depreciation > 0 else 0
        
        # Goodwill in Assets
        goodwill = balance.get('Goodwill', 0)
        goodwill_to_assets = safe_divide(goodwill, total_assets, 0) * 100
        
        # Cash Flow to Debt Ratio
        cash_flow_to_debt = safe_divide(operating_cf, total_debt, 0) * 100 if total_debt > 0 else 0
        
        # WACC approximation (simplified)
        cost_of_equity = 0.10  # Assumed 10%
        cost_of_debt = safe_divide(interest_expense, total_debt, 0.05) if total_debt > 0 else 0.05
        tax_rate = 0.21  # Assumed corporate tax rate
        total_capital = total_equity + total_debt if total_equity > 0 and total_debt > 0 else 1
        weight_equity = safe_divide(total_equity, total_capital, 0)
        weight_debt = safe_divide(total_debt, total_capital, 0)
        wacc = (weight_equity * cost_of_equity + weight_debt * cost_of_debt * (1 - tax_rate)) * 100
        
        # ROIC vs WACC spread
        roic_wacc_spread = roic - wacc
        
        # EV/CI (Enterprise Value / Capital Invested)
        ev_ci = safe_divide(enterprise_value, invested_capital) if invested_capital > 0 else None
        
        # FCF/EBITDA
        ebitda = ebit + depreciation if depreciation > 0 else ebit
        fcf_to_ebitda = safe_divide(free_cash_flow, ebitda, 0) * 100 if ebitda != 0 else 0
        
        # KTO (Capital de Trabajo Operativo neto sobre ventas)
        accounts_receivable = balance.get('Accounts Receivable', 0)
        inventory = balance.get('Inventory', 0)
        accounts_payable = balance.get('Accounts Payable', 0)
        operating_working_capital = accounts_receivable + inventory - accounts_payable
        kto = safe_divide(operating_working_capital, total_revenue, 0) if total_revenue > 0 else 0
        
        # 52-Week High/Low metrics
        fifty_two_week_high = info.get('fiftyTwoWeekHigh', current_price)
        fifty_two_week_low = info.get('fiftyTwoWeekLow', current_price)
        pct_below_52w_high = ((fifty_two_week_high - current_price) / fifty_two_week_high) * 100 if fifty_two_week_high > 0 else 0
        pct_above_52w_low = ((current_price - fifty_two_week_low) / fifty_two_week_low) * 100 if fifty_two_week_low > 0 else 0
        
        # Beneish M-Score (simplified - only some variables)
        try:
            if income_prev and balance_sheet.shape[1] > 1:
                balance_prev = balance_sheet.iloc[:, -1].to_dict()
                
                revenue_prev = income_prev.get('Total Revenue', 0)
                accounts_receivable_prev = balance_prev.get('Accounts Receivable', 1)
                total_assets_prev = balance_prev.get('Total Assets', 1)
                
                # DSRI (Days Sales Receivables Index)
                dsri = safe_divide(
                    safe_divide(accounts_receivable, total_revenue, 0),
                    safe_divide(accounts_receivable_prev, revenue_prev, 1),
                    0
                )
                
                # AQI (Asset Quality Index)
                current_assets_prev = balance_prev.get('Current Assets', 1)
                ppe = balance.get('Net PPE', balance.get('Property Plant Equipment', 0))
                ppe_prev = balance_prev.get('Net PPE', balance_prev.get('Property Plant Equipment', 1))
                
                non_current_assets = total_assets - current_assets if current_assets else total_assets
                non_current_assets_prev = total_assets_prev - current_assets_prev if current_assets_prev else total_assets_prev
                
                aqi = safe_divide(
                    safe_divide(non_current_assets - ppe, total_assets, 0),
                    safe_divide(non_current_assets_prev - ppe_prev, total_assets_prev, 1),
                    0
                )
                
                # GMI (Gross Margin Index)
                gross_profit_prev = income_prev.get('Gross Profit', 1)
                gmi = safe_divide(
                    safe_divide(gross_profit_prev, revenue_prev, 0),
                    safe_divide(gross_profit, total_revenue, 1),
                    0
                )
                
                # Simplified Beneish M-Score (using available variables)
                beneish_m_score = -4.84 + 0.92*dsri + 0.528*aqi + 0.404*gmi
            else:
                beneish_m_score = 0
        except:
            beneish_m_score = 0
        
        # Montier C-Score (simplified)
        c_score = 0
        # Based on accruals and cash flow quality
        if operating_cf > net_income:
            c_score += 1
        if beneish_m_score < -2.22:
            c_score += 1
        if operating_cf > 0 and net_income > 0:
            c_score += 1
        
        # Additional important ratios
        
        # PEG Ratio
        earnings_growth = 0  # Would need historical EPS data
        peg_ratio = safe_divide(pe_ratio, earnings_growth) if earnings_growth > 0 and pe_ratio else None
        
        # P/B Ratio (Price to Book)
        book_value_per_share = safe_divide(total_equity, shares_outstanding) if shares_outstanding > 0 else 0
        pb_ratio = safe_divide(current_price, book_value_per_share) if book_value_per_share > 0 else None
        
        # Dividend Yield
        dividend_rate = info.get('dividendRate', 0)
        dividend_yield = safe_divide(dividend_rate, current_price, 0) * 100 if current_price > 0 else 0
        
        # Payout Ratio
        dividends_paid = abs(cf.get('Cash Dividends Paid', 0))
        payout_ratio = safe_divide(dividends_paid, net_income, 0) * 100 if net_income > 0 else 0
        
        # Long-Term Debt to Capitalization
        long_term_debt = balance.get('Long Term Debt', total_debt)
        total_cap = long_term_debt + total_equity if total_equity > 0 else 1
        lt_debt_to_cap = safe_divide(long_term_debt, total_cap, 0)
        
        # Inventory Turnover
        inventory = balance.get('Inventory', 0)
        cogs = income.get('Cost Of Revenue', 0)
        inventory_turnover = safe_divide(cogs, inventory, 0) if inventory > 0 else 0
        
        # Operating Expense Ratio
        operating_expenses = income.get('Operating Expense', 0)
        operating_expense_ratio = safe_divide(operating_expenses, total_revenue, 0) if total_revenue > 0 else 0
        
        # Sloan Ratio (Accruals / Average Assets)
        accruals = net_income - operating_cf
        sloan_ratio = safe_divide(accruals, total_assets, 0) if total_assets > 0 else 0
        
        # Accrual Ratio
        accrual_ratio = safe_divide(operating_cf, net_income, 0) if net_income != 0 else 0
        
        # Tobin's Q
        tobins_q = safe_divide(market_cap + total_liabilities, total_assets, 0) if total_assets > 0 else 0
        
        # EV/CFO
        ev_cfo = safe_divide(enterprise_value, operating_cf) if operating_cf > 0 else None
        
        # EV/FCF
        ev_fcf = safe_divide(enterprise_value, free_cash_flow) if free_cash_flow > 0 else None
        
        # EV/Gross Profit
        ev_gross_profit = safe_divide(enterprise_value, gross_profit) if gross_profit > 0 else None
        
        # EBIT/FCF
        ebit_to_fcf = safe_divide(ebit, free_cash_flow) if free_cash_flow != 0 else None
        
        # Net Debt / EBIT
        net_debt_to_ebit = safe_divide(net_debt, ebit) if ebit != 0 else None
        
        # Zmijewski Score (bankruptcy prediction)
        try:
            x1_z = -4.3 - 4.5 * safe_divide(net_income, total_assets, 0)
            x2_z = 5.7 * safe_divide(total_liabilities, total_assets, 0)
            x3_z = -0.004 * safe_divide(current_assets, current_liabilities, 0)
            zmijewski_score = x1_z + x2_z + x3_z
        except:
            zmijewski_score = 0
        
        # Ohlson O-Score
        try:
            size = np.log(total_assets) if total_assets > 0 else 0
            tlta = safe_divide(total_liabilities, total_assets, 0)
            wcta = safe_divide(working_capital, total_assets, 0)
            clca = safe_divide(current_liabilities, current_assets, 0) if current_assets > 0 else 0
            nita = safe_divide(net_income, total_assets, 0)
            
            ohlson_o = -1.32 - 0.407*size + 6.03*tlta - 1.43*wcta + 0.0757*clca - 2.37*nita
        except:
            ohlson_o = 0
        
        # Fulmer H-Score
        try:
            v1 = safe_divide(retained_earnings, total_assets, 0)
            v2 = safe_divide(total_revenue, total_assets, 0)
            v3 = safe_divide(net_income, total_equity, 0) if total_equity > 0 else 0
            v4 = safe_divide(operating_cf, total_liabilities, 0) if total_liabilities > 0 else 0
            v5 = safe_divide(total_liabilities, total_assets, 0)
            v6 = safe_divide(current_liabilities, total_assets, 0)
            
            fulmer_h = 5.528*v1 + 0.212*v2 + 0.073*v3 + 1.270*v4 - 0.120*v5 + 2.335*v6 + 0.575
        except:
            fulmer_h = 0
        
        # Benjamin Graham Valuation
        # Graham's formula: Intrinsic Value = EPS × (8.5 + 2g)
        # Revised: IV = (EPS × (8.5 + 2g) × 4.4) / Y
        # Where Y = current yield of AAA corporate bonds (we'll use 10-year treasury as proxy)
        
        try:
            # Get EPS
            graham_eps = eps if eps > 0 else safe_divide(net_income, shares_outstanding, 0) if shares_outstanding > 0 else 0
            
            # Estimate growth rate (conservative approach)
            # Use historical EPS growth or default to conservative 5%
            estimated_growth = 5.0  # Conservative 5% annual growth
            
            # AAA corporate bond yield (approximation using 10-year treasury + spread)
            # Typical spread is 1-2%, we'll use 5% as reasonable assumption for AAA bonds
            aaa_yield = 5.0
            
            # Graham's original formula (simple)
            intrinsic_value_graham_simple = graham_eps * (8.5 + (2 * estimated_growth))
            
            # Graham's revised formula (with bond yield adjustment)
            intrinsic_value_graham = (graham_eps * (8.5 + (2 * estimated_growth)) * 4.4) / aaa_yield if aaa_yield > 0 else intrinsic_value_graham_simple
            
            # Ensure reasonable values
            if intrinsic_value_graham < 0 or intrinsic_value_graham > current_price * 10:
                # If unreasonable, use the simpler formula
                intrinsic_value_graham = intrinsic_value_graham_simple
            
            # Benjamin Graham's Margin of Safety
            # Formula: (Intrinsic Value - Current Price) / Intrinsic Value × 100
            if intrinsic_value_graham > 0 and current_price > 0:
                margin_of_safety_graham = ((intrinsic_value_graham - current_price) / intrinsic_value_graham) * 100
            else:
                margin_of_safety_graham = 0
            
            # Target Price calculations
            # Conservative: IV with 25% margin of safety (buy at 75% of IV)
            target_price_conservative = intrinsic_value_graham * 0.75
            
            # Moderate: Full intrinsic value
            target_price_moderate = intrinsic_value_graham
            
            # Aggressive: IV + 20% upside potential
            target_price_aggressive = intrinsic_value_graham * 1.20
            
            # Current recommended action based on Graham's margin
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
            intrinsic_value_graham = 0
            intrinsic_value_graham_simple = 0
            margin_of_safety_graham = 0
            target_price_conservative = 0
            target_price_moderate = 0
            target_price_aggressive = 0
            graham_recommendation = "N/A"
        # Simplified DCF model
        try:
            # Estimate growth rate (conservative: use lower of industry avg or historical)
            growth_rate = 0.05  # Conservative 5% growth assumption
            
            # Terminal growth rate (long-term GDP growth)
            terminal_growth = 0.025  # 2.5%
            
            # Discount rate = WACC
            discount_rate = wacc / 100 if wacc > 0 else 0.10
            
            # Project 5 years of FCF
            projected_fcf = []
            current_fcf = free_cash_flow if free_cash_flow > 0 else operating_cf * 0.7  # Use 70% of OCF if FCF negative
            
            for year in range(1, 6):
                projected_fcf.append(current_fcf * ((1 + growth_rate) ** year))
            
            # Calculate present value of projected FCF
            pv_fcf = sum([fcf / ((1 + discount_rate) ** (i+1)) for i, fcf in enumerate(projected_fcf)])
            
            # Terminal value
            terminal_fcf = projected_fcf[-1] * (1 + terminal_growth)
            terminal_value = terminal_fcf / (discount_rate - terminal_growth) if discount_rate > terminal_growth else 0
            pv_terminal_value = terminal_value / ((1 + discount_rate) ** 5)
            
            # Enterprise value from DCF
            enterprise_value_dcf = pv_fcf + pv_terminal_value
            
            # Equity value = EV - Net Debt
            equity_value_dcf = enterprise_value_dcf - net_debt
            
            # Price per share
            intrinsic_value_per_share = safe_divide(equity_value_dcf, shares_outstanding, 0) if shares_outstanding > 0 else 0
            
            # Margin of safety
            if current_price > 0 and intrinsic_value_per_share > 0:
                margin_of_safety = ((intrinsic_value_per_share - current_price) / intrinsic_value_per_share) * 100
            else:
                margin_of_safety = 0
            
            # Upside potential
            upside_potential = ((intrinsic_value_per_share - current_price) / current_price) * 100 if current_price > 0 else 0
            
        except Exception as e:
            logging.warning(f"DCF calculation error: {str(e)}")
            intrinsic_value_per_share = 0
            margin_of_safety = 0
            upside_potential = 0
            enterprise_value_dcf = 0
        
        # Value Creation Analysis (ROIC vs WACC)
        creates_value = roic > wacc
        value_creation_spread = roic - wacc
        
        # Categorize value creation
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
            'roce': roce,
            'roc': roic,  # Using ROIC as proxy for ROC
            'croic': croic,
            'gross_margin': gross_margin,
            'net_margin': net_margin,
            'operating_margin': operating_margin,
            'ebit_margin': ebit_margin,
            'nopat_margin': nopat_margin,
            
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
            'ev_ci': ev_ci,
            
            # Cash Flow
            'free_cash_flow': free_cash_flow,
            'fcf_margin': fcf_margin,
            'operating_cf': operating_cf,
            'operating_cf_to_sales': operating_cf_to_sales,
            'capex_to_revenue': capex_to_revenue,
            'capex_to_ocf': capex_to_ocf,
            'fcf_to_ebitda': fcf_to_ebitda,
            'cash_flow_to_debt': cash_flow_to_debt,
            
            # Efficiency & Operations
            'retained_earnings': retained_earnings,
            'asset_turnover': asset_turnover,
            'eps': eps,
            'capex_to_da': capex_to_da,
            'goodwill_to_assets': goodwill_to_assets,
            'kto': kto,
            
            # Risk & Capital
            'beta': beta,
            'wacc': wacc,
            'roic_wacc_spread': roic_wacc_spread,
            'interest_coverage': interest_coverage,
            
            # Price Performance
            'fifty_two_week_high': fifty_two_week_high,
            'fifty_two_week_low': fifty_two_week_low,
            'pct_below_52w_high': pct_below_52w_high,
            'pct_above_52w_low': pct_above_52w_low,
            
            # Scores
            'altman_z_score': altman_z,
            'piotroski_f_score': f_score,
            'beneish_m_score': beneish_m_score,
            'montier_c_score': c_score,
            'zmijewski_score': zmijewski_score,
            'ohlson_o_score': ohlson_o,
            'fulmer_h_score': fulmer_h,
            
            # DCF Valuation
            'intrinsic_value': intrinsic_value_per_share,
            'margin_of_safety': margin_of_safety,
            'upside_potential': upside_potential,
            'enterprise_value_dcf': enterprise_value_dcf,
            
            # Benjamin Graham Valuation
            'intrinsic_value_graham': intrinsic_value_graham,
            'intrinsic_value_graham_simple': intrinsic_value_graham_simple,
            'margin_of_safety_graham': margin_of_safety_graham,
            'target_price_conservative': target_price_conservative,
            'target_price_moderate': target_price_moderate,
            'target_price_aggressive': target_price_aggressive,
            'graham_recommendation': graham_recommendation,
            'estimated_growth_rate': estimated_growth,
            
            # Value Creation
            'creates_value': creates_value,
            'value_creation_spread': value_creation_spread,
            'value_creation_category': value_creation_category,
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
    
    # Category 7: Risk & Capital Structure
    risk_metrics = []
    
    # Beta
    beta_val = ratios.get('beta', 0)
    beta_passed = 0.8 <= beta_val <= 1.2
    risk_metrics.append(RatioMetric(
        name="Beta",
        value=beta_val,
        threshold="0.8 - 1.2 (moderado)",
        passed=beta_passed,
        interpretation="Volatilidad del activo vs mercado",
        display_value=f"{beta_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if beta_passed else 0
    
    # WACC
    wacc_val = ratios.get('wacc', 0)
    wacc_passed = wacc_val < 12
    risk_metrics.append(RatioMetric(
        name="WACC (Costo Promedio Ponderado)",
        value=wacc_val,
        threshold="< 12%",
        passed=wacc_passed,
        interpretation="Costo de capital de la empresa",
        display_value=f"{wacc_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if wacc_passed else 0
    
    # ROIC vs WACC Spread
    spread_val = ratios.get('roic_wacc_spread', 0)
    spread_passed = spread_val > 0
    risk_metrics.append(RatioMetric(
        name="ROIC vs WACC Spread",
        value=spread_val,
        threshold="> 0% (creación de valor)",
        passed=spread_passed,
        interpretation="Diferencia entre retorno y costo de capital",
        display_value=f"{spread_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if spread_passed else 0
    
    # Interest Coverage
    ic_val = ratios.get('interest_coverage', 0)
    ic_passed = ic_val > 2.5
    risk_metrics.append(RatioMetric(
        name="Cobertura de Intereses",
        value=ic_val,
        threshold="> 2.5",
        passed=ic_passed,
        interpretation="Capacidad para cubrir pagos de intereses",
        display_value=f"{ic_val:.2f}x"
    ))
    total_metrics += 1
    favorable += 1 if ic_passed else 0
    
    categories.append(RatioCategory(
        category="⚠️ Riesgo y Capital",
        metrics=risk_metrics
    ))
    
    # Category 8: Advanced Metrics
    advanced_metrics = []
    
    # EV/CI
    ev_ci_val = ratios.get('ev_ci')
    ev_ci_passed = ev_ci_val is not None and ev_ci_val > 1
    advanced_metrics.append(RatioMetric(
        name="EV/CI (Valor Empresa/Capital Invertido)",
        value=ev_ci_val,
        threshold="> 1",
        passed=ev_ci_passed,
        interpretation="Valoración vs capital invertido",
        display_value=f"{ev_ci_val:.2f}" if ev_ci_val else "N/A"
    ))
    total_metrics += 1
    favorable += 1 if ev_ci_passed else 0
    
    # FCF/EBITDA
    fcf_ebitda_val = ratios.get('fcf_to_ebitda', 0)
    fcf_ebitda_passed = fcf_ebitda_val > 50
    advanced_metrics.append(RatioMetric(
        name="FCF/EBITDA",
        value=fcf_ebitda_val,
        threshold="> 50%",
        passed=fcf_ebitda_passed,
        interpretation="Conversión de EBITDA a flujo de caja",
        display_value=f"{fcf_ebitda_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if fcf_ebitda_passed else 0
    
    # Capex/DA
    capex_da_val = ratios.get('capex_to_da', 0)
    capex_da_passed = capex_da_val > 1
    advanced_metrics.append(RatioMetric(
        name="Capex/Depreciación",
        value=capex_da_val,
        threshold="> 1",
        passed=capex_da_passed,
        interpretation="Inversión vs depreciación de activos",
        display_value=f"{capex_da_val:.2f}x"
    ))
    total_metrics += 1
    favorable += 1 if capex_da_passed else 0
    
    # Goodwill to Assets
    goodwill_val = ratios.get('goodwill_to_assets', 0)
    goodwill_passed = goodwill_val < 20
    advanced_metrics.append(RatioMetric(
        name="Goodwill/Activos",
        value=goodwill_val,
        threshold="< 20%",
        passed=goodwill_passed,
        interpretation="Proporción de activos intangibles",
        display_value=f"{goodwill_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if goodwill_passed else 0
    
    # Cash Flow to Debt
    cf_debt_val = ratios.get('cash_flow_to_debt', 0)
    cf_debt_passed = cf_debt_val > 20
    advanced_metrics.append(RatioMetric(
        name="Flujo de Caja/Deuda",
        value=cf_debt_val,
        threshold="> 20%",
        passed=cf_debt_passed,
        interpretation="Capacidad de pago de deuda con flujo operativo",
        display_value=f"{cf_debt_val:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if cf_debt_passed else 0
    
    # KTO
    kto_val = ratios.get('kto', 0)
    kto_passed = kto_val < 0.15
    advanced_metrics.append(RatioMetric(
        name="KTO (Capital Trabajo Operativo/Ventas)",
        value=kto_val,
        threshold="< 15%",
        passed=kto_passed,
        interpretation="Eficiencia en gestión de capital de trabajo",
        display_value=f"{kto_val*100:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if kto_passed else 0
    
    categories.append(RatioCategory(
        category="🔬 Métricas Avanzadas",
        metrics=advanced_metrics
    ))
    
    # Category 9: Quality Scores
    quality_metrics = []
    
    # Beneish M-Score
    beneish_val = ratios.get('beneish_m_score', 0)
    beneish_passed = beneish_val < -2.22
    quality_metrics.append(RatioMetric(
        name="Beneish M-Score",
        value=beneish_val,
        threshold="< -2.22 (sin manipulación)",
        passed=beneish_passed,
        interpretation="Detección de manipulación contable",
        display_value=f"{beneish_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if beneish_passed else 0
    
    # Montier C-Score
    montier_val = ratios.get('montier_c_score', 0)
    montier_passed = montier_val <= 2
    quality_metrics.append(RatioMetric(
        name="Montier C-Score",
        value=montier_val,
        threshold="<= 2",
        passed=montier_passed,
        interpretation="Bajo riesgo de manipulación (0-3 escala)",
        display_value=f"{int(montier_val)}"
    ))
    total_metrics += 1
    favorable += 1 if montier_passed else 0
    
    categories.append(RatioCategory(
        category="📋 Calidad Contable",
        metrics=quality_metrics
    ))
    
    # Category 10: Price Performance
    price_metrics = []
    
    # 52-Week High
    high_52w = ratios.get('fifty_two_week_high', 0)
    price_metrics.append(RatioMetric(
        name="Máximo 52 Semanas",
        value=high_52w,
        threshold="Referencia",
        passed=True,
        interpretation="Precio más alto en el último año",
        display_value=f"${high_52w:.2f}"
    ))
    
    # 52-Week Low
    low_52w = ratios.get('fifty_two_week_low', 0)
    price_metrics.append(RatioMetric(
        name="Mínimo 52 Semanas",
        value=low_52w,
        threshold="Referencia",
        passed=True,
        interpretation="Precio más bajo en el último año",
        display_value=f"${low_52w:.2f}"
    ))
    
    # % Below 52W High
    below_high = ratios.get('pct_below_52w_high', 0)
    below_high_passed = below_high < 20
    price_metrics.append(RatioMetric(
        name="% Bajo Máximo 52S",
        value=below_high,
        threshold="< 20% (cerca del máximo)",
        passed=below_high_passed,
        interpretation="Distancia del precio máximo anual",
        display_value=f"-{below_high:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if below_high_passed else 0
    
    # % Above 52W Low
    above_low = ratios.get('pct_above_52w_low', 0)
    above_low_passed = above_low > 20
    price_metrics.append(RatioMetric(
        name="% Sobre Mínimo 52S",
        value=above_low,
        threshold="> 20% (lejos del mínimo)",
        passed=above_low_passed,
        interpretation="Distancia del precio mínimo anual",
        display_value=f"+{above_low:.2f}%"
    ))
    total_metrics += 1
    favorable += 1 if above_low_passed else 0
    
    categories.append(RatioCategory(
        category="📊 Rendimiento de Precio",
        metrics=price_metrics
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
        "strong_roe": ratios.get('roe', 0) > 15,
        "creates_value": ratios.get('creates_value', False),
        "undervalued": ratios.get('margin_of_safety', 0) > 20,
    }
    
    # Valuation summary
    valuation_summary = {
        "intrinsic_value": ratios.get('intrinsic_value', 0),
        "current_price": info.get('currentPrice', info.get('regularMarketPrice', 0)),
        "margin_of_safety": ratios.get('margin_of_safety', 0),
        "upside_potential": ratios.get('upside_potential', 0),
        "creates_value": ratios.get('creates_value', False),
        "value_creation_category": ratios.get('value_creation_category', 'N/A'),
        "roic": ratios.get('roic', 0),
        "wacc": ratios.get('wacc', 0),
        "spread": ratios.get('value_creation_spread', 0),
    }
    
    return categories, favorable_pct, recommendation, risk_level, total_metrics, favorable, summary_flags, valuation_summary

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
        categories, favorable_pct, recommendation, risk_level, total_metrics, favorable_count, summary_flags, valuation_summary = evaluate_ratios(ratios, stock_info)
        
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
            summary_flags=summary_flags,
            valuation_summary=valuation_summary
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
