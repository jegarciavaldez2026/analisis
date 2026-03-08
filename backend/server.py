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
import asyncio
from emergentintegrations.llm.chat import LlmChat, UserMessage

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
        
        # Sharpe Ratio calculation
        # Get historical price data for 1 year
        try:
            history_1y = yf.Ticker(ticker_data.ticker).history(period="1y")
            if not history_1y.empty and len(history_1y) > 20:
                # Calculate daily returns
                daily_returns = history_1y['Close'].pct_change().dropna()
                
                # Annualized return
                mean_daily_return = daily_returns.mean()
                annualized_return = (1 + mean_daily_return) ** 252 - 1  # 252 trading days
                
                # Annualized volatility (standard deviation)
                daily_std = daily_returns.std()
                annualized_volatility = daily_std * np.sqrt(252)
                
                # Risk-free rate (using 10-year treasury yield approximation)
                risk_free_rate = 0.04  # 4% assumption
                
                # Sharpe Ratio = (Return - Risk Free Rate) / Volatility
                sharpe_ratio = (annualized_return - risk_free_rate) / annualized_volatility if annualized_volatility > 0 else 0
            else:
                sharpe_ratio = 0
                annualized_return = 0
                annualized_volatility = 0
        except Exception as e:
            logging.warning(f"Sharpe ratio calculation error: {str(e)}")
            sharpe_ratio = 0
            annualized_return = 0
            annualized_volatility = 0
        
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
        
        # Springate Model (S-Score)
        # S = 1.03A + 3.07B + 0.66C + 0.4D
        try:
            a_spring = safe_divide(working_capital, total_assets, 0)
            b_spring = safe_divide(ebit, total_assets, 0)
            c_spring = safe_divide(ebit, current_liabilities, 0) if current_liabilities > 0 else 0
            d_spring = safe_divide(total_revenue, total_assets, 0)
            
            springate_score = 1.03*a_spring + 3.07*b_spring + 0.66*c_spring + 0.4*d_spring
        except:
            springate_score = 0
        
        # CA-SCORE (Credit Analysis Score - Revisión del Altman)
        # CA = 3.107 + 6.38*X1 + 2.84*X2 + 3.05*X3 + 1.02*X4
        try:
            x1_ca = safe_divide(current_assets - current_liabilities, total_assets, 0)
            x2_ca = safe_divide(net_income, total_assets, 0)
            x3_ca = safe_divide(retained_earnings, total_assets, 0)
            x4_ca = safe_divide(ebit, total_liabilities, 0) if total_liabilities > 0 else 0
            
            ca_score = 3.107 + 6.38*x1_ca + 2.84*x2_ca + 3.05*x3_ca + 1.02*x4_ca
        except:
            ca_score = 0
        
        # Kanitz Score (Termômetro de Insolvência)
        # K = 0.05*X1 + 1.65*X2 + 3.55*X3 - 1.06*X4 - 0.33*X5
        try:
            x1_k = safe_divide(net_income, total_assets, 0)
            x2_k = safe_divide(current_assets - cash - balance.get('Short Term Investments', 0), current_liabilities, 0) if current_liabilities > 0 else 0
            x3_k = safe_divide(current_assets - current_liabilities, total_debt, 0) if total_debt > 0 else 0
            x4_k = safe_divide(current_assets, current_liabilities, 0) if current_liabilities > 0 else 0
            x5_k = safe_divide(total_debt, total_assets, 0)
            
            kanitz_score = 0.05*x1_k + 1.65*x2_k + 3.55*x3_k - 1.06*x4_k - 0.33*x5_k
        except:
            kanitz_score = 0
        
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
            
            # Risk-Adjusted Returns
            'sharpe_ratio': sharpe_ratio,
            'annualized_return': annualized_return * 100,  # Convert to percentage
            'annualized_volatility': annualized_volatility * 100,
            
            # Scores
            'altman_z_score': altman_z,
            'piotroski_f_score': f_score,
            'beneish_m_score': beneish_m_score,
            'montier_c_score': c_score,
            'zmijewski_score': zmijewski_score,
            'ohlson_o_score': ohlson_o,
            'fulmer_h_score': fulmer_h,
            'springate_score': springate_score,
            'ca_score': ca_score,
            'kanitz_score': kanitz_score,
            'tobins_q': tobins_q,
            'sloan_ratio': sloan_ratio,
            
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
    
    # Category 7: Risk & Capital Structure
    risk_metrics = []
    
    # Sharpe Ratio
    sharpe_val = ratios.get('sharpe_ratio', 0)
    sharpe_passed = sharpe_val > 1.0
    risk_metrics.append(RatioMetric(
        name="Sharpe Ratio",
        value=sharpe_val,
        threshold="> 1.0 (buen retorno ajustado por riesgo)",
        passed=sharpe_passed,
        interpretation="Retorno por unidad de riesgo (>1 bueno, >2 excelente)",
        display_value=f"{sharpe_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if sharpe_passed else 0
    
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
    
    # Sloan Ratio
    sloan_val = ratios.get('sloan_ratio', 0)
    sloan_passed = -0.1 <= sloan_val <= 0.1
    quality_metrics.append(RatioMetric(
        name="Sloan Ratio (Accruals)",
        value=sloan_val,
        threshold="-0.1 a 0.1 (accruals normales)",
        passed=sloan_passed,
        interpretation="Detecta manipulación contable via accruals",
        display_value=f"{sloan_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if sloan_passed else 0
    
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
    
    # Ohlson O-Score
    ohlson_val = ratios.get('ohlson_o_score', 0)
    ohlson_passed = ohlson_val < 0.5
    quality_metrics.append(RatioMetric(
        name="Ohlson O-Score",
        value=ohlson_val,
        threshold="< 0.5 (bajo riesgo quiebra)",
        passed=ohlson_passed,
        interpretation="Predicción de quiebra a 2 años",
        display_value=f"{ohlson_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if ohlson_passed else 0
    
    # Altman Z-Score
    altman_val = ratios.get('altman_z_score', 0)
    altman_passed = altman_val > 2.99
    quality_metrics.append(RatioMetric(
        name="Altman Z-Score",
        value=altman_val,
        threshold="> 2.99 (zona segura)",
        passed=altman_passed,
        interpretation="Predicción de quiebra (>2.99 segura, <1.81 peligro)",
        display_value=f"{altman_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if altman_passed else 0
    
    # Fulmer H-Score
    fulmer_val = ratios.get('fulmer_h_score', 0)
    fulmer_passed = fulmer_val > 0
    quality_metrics.append(RatioMetric(
        name="Fulmer H-Score",
        value=fulmer_val,
        threshold="> 0 (empresa sólida)",
        passed=fulmer_passed,
        interpretation="Solidez financiera general",
        display_value=f"{fulmer_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if fulmer_passed else 0
    
    # Piotroski F-Score
    piotroski_val = ratios.get('piotroski_f_score', 0)
    piotroski_passed = piotroski_val >= 7
    quality_metrics.append(RatioMetric(
        name="Piotroski F-Score",
        value=piotroski_val,
        threshold=">= 7 (empresa fuerte)",
        passed=piotroski_passed,
        interpretation="Solidez financiera (0-9, 7+ es fuerte)",
        display_value=f"{int(piotroski_val)}"
    ))
    total_metrics += 1
    favorable += 1 if piotroski_passed else 0
    
    # Montier C-Score
    montier_val = ratios.get('montier_c_score', 0)
    montier_passed = montier_val <= 2
    quality_metrics.append(RatioMetric(
        name="Montier C-Score",
        value=montier_val,
        threshold="<= 2 (bajo riesgo)",
        passed=montier_passed,
        interpretation="Riesgo de manipulación contable (0-3)",
        display_value=f"{int(montier_val)}"
    ))
    total_metrics += 1
    favorable += 1 if montier_passed else 0
    
    # Springate Score
    springate_val = ratios.get('springate_score', 0)
    springate_passed = springate_val > 0.862
    quality_metrics.append(RatioMetric(
        name="Springate S-Score",
        value=springate_val,
        threshold="> 0.862 (financieramente sana)",
        passed=springate_passed,
        interpretation="Modelo alternativo de predicción de quiebra",
        display_value=f"{springate_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if springate_passed else 0
    
    # CA-SCORE
    ca_val = ratios.get('ca_score', 0)
    ca_passed = ca_val > -0.3
    quality_metrics.append(RatioMetric(
        name="CA-SCORE",
        value=ca_val,
        threshold="> -0.3 (bajo riesgo crédito)",
        passed=ca_passed,
        interpretation="Credit Analysis Score (riesgo crediticio)",
        display_value=f"{ca_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if ca_passed else 0
    
    # Kanitz Score
    kanitz_val = ratios.get('kanitz_score', 0)
    kanitz_passed = kanitz_val > 0
    quality_metrics.append(RatioMetric(
        name="Kanitz Score",
        value=kanitz_val,
        threshold="> 0 (solvente)",
        passed=kanitz_passed,
        interpretation="Termómetro de Insolvencia (<-3 peligro, >0 solvente)",
        display_value=f"{kanitz_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if kanitz_passed else 0
    
    # Tobin's Q
    tobins_q_val = ratios.get('tobins_q', 0)
    tobins_q_passed = tobins_q_val < 1
    quality_metrics.append(RatioMetric(
        name="Tobin's Q Ratio",
        value=tobins_q_val,
        threshold="< 1 (subvalorada)",
        passed=tobins_q_passed,
        interpretation="Valor de mercado vs valor libro (<1 subvalorada)",
        display_value=f"{tobins_q_val:.2f}"
    ))
    total_metrics += 1
    favorable += 1 if tobins_q_passed else 0
    
    categories.append(RatioCategory(
        category="📋 Calidad Contable y Salud Financiera",
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
    
    # Category 11: Valoración según Benjamin Graham
    graham_metrics = []
    
    # Valor Intrínseco Graham
    vi_graham = ratios.get('intrinsic_value_graham', 0)
    current_price_val = info.get('currentPrice', info.get('regularMarketPrice', 0))
    graham_metrics.append(RatioMetric(
        name="Valor Intrínseco (Graham)",
        value=vi_graham,
        threshold="Referencia",
        passed=True,
        interpretation="Valor justo calculado por fórmula de Graham",
        display_value=f"${vi_graham:.2f}"
    ))
    
    # Margen de Seguridad Graham
    mos_graham = ratios.get('margin_of_safety_graham', 0)
    mos_graham_passed = mos_graham >= 20
    graham_metrics.append(RatioMetric(
        name="Margen de Seguridad (Graham)",
        value=mos_graham,
        threshold=">= 20% (subvalorada)",
        passed=mos_graham_passed,
        interpretation="Descuento del precio actual vs valor intrínseco",
        display_value=f"{mos_graham:.1f}%"
    ))
    total_metrics += 1
    favorable += 1 if mos_graham_passed else 0
    
    # Target Price Conservative
    target_cons = ratios.get('target_price_conservative', 0)
    graham_metrics.append(RatioMetric(
        name="Precio Objetivo Conservador",
        value=target_cons,
        threshold="75% del VI (25% margen)",
        passed=current_price_val <= target_cons if target_cons > 0 else False,
        interpretation="Precio de compra con margen de seguridad",
        display_value=f"${target_cons:.2f}"
    ))
    
    # Target Price Moderate
    target_mod = ratios.get('target_price_moderate', 0)
    graham_metrics.append(RatioMetric(
        name="Precio Objetivo Moderado",
        value=target_mod,
        threshold="100% del VI (valor justo)",
        passed=current_price_val <= target_mod if target_mod > 0 else False,
        interpretation="Valor intrínseco sin descuento",
        display_value=f"${target_mod:.2f}"
    ))
    
    categories.append(RatioCategory(
        category="💰 Valoración Graham",
        metrics=graham_metrics
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
        # DCF Method
        "intrinsic_value_dcf": ratios.get('intrinsic_value', 0),
        "margin_of_safety_dcf": ratios.get('margin_of_safety', 0),
        "upside_potential_dcf": ratios.get('upside_potential', 0),
        
        # Benjamin Graham Method
        "intrinsic_value_graham": ratios.get('intrinsic_value_graham', 0),
        "intrinsic_value_graham_simple": ratios.get('intrinsic_value_graham_simple', 0),
        "margin_of_safety_graham": ratios.get('margin_of_safety_graham', 0),
        "graham_recommendation": ratios.get('graham_recommendation', 'N/A'),
        
        # Target Prices
        "target_price_conservative": ratios.get('target_price_conservative', 0),
        "target_price_moderate": ratios.get('target_price_moderate', 0),
        "target_price_aggressive": ratios.get('target_price_aggressive', 0),
        
        # Current Price & Comparison
        "current_price": info.get('currentPrice', info.get('regularMarketPrice', 0)),
        
        # Value Creation
        "creates_value": ratios.get('creates_value', False),
        "value_creation_category": ratios.get('value_creation_category', 'N/A'),
        "roic": ratios.get('roic', 0),
        "wacc": ratios.get('wacc', 0),
        "spread": ratios.get('value_creation_spread', 0),
        
        # Growth assumption
        "estimated_growth_rate": ratios.get('estimated_growth_rate', 5.0),
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
        
        # Solana - REMOVED per user request
        
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
async def get_watchlist():
    """Get all watchlist items with current prices"""
    try:
        items = await db.watchlist.find().sort("added_date", -1).to_list(100)
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
async def add_to_watchlist(item: WatchlistItemCreate):
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
        
        await db.watchlist.insert_one(watchlist_item.dict())
        return watchlist_item
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error adding to watchlist: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al agregar a watchlist: {str(e)}")

@api_router.put("/watchlist/{item_id}", response_model=WatchlistItem)
async def update_watchlist_item(item_id: str, update: WatchlistItemUpdate):
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
async def check_watchlist_alerts():
    """Check all watchlist items for price alerts"""
    try:
        items = await db.watchlist.find().to_list(100)
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
    ticker: str
    company_name: str
    transaction_type: str  # "buy" or "sell"
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

@api_router.get("/portfolio", response_model=PortfolioSummary)
async def get_portfolio():
    """Get portfolio summary with current values, metrics, and sector allocation"""
    try:
        transactions = await db.portfolio.find().sort("transaction_date", -1).to_list(1000)
        
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
        
        for ticker, data in holdings_map.items():
            if data["total_shares"] <= 0:
                continue  # Skip if sold all shares
            
            # Get current price, beta, sector, and industry
            sector = "Otros"
            industry = "N/A"
            curr_price = 0
            stock_beta = 1.0
            
            try:
                stock = yf.Ticker(ticker)
                info = stock.info
                curr_price = info.get('currentPrice', info.get('regularMarketPrice', 0)) or 0
                stock_beta = info.get('beta', 1.0) or 1.0
                sector = info.get('sector', 'Otros') or 'Otros'
                industry = info.get('industry', 'N/A') or 'N/A'
                
                # Only fetch historical data if we have more than 3 holdings (skip for performance)
                if len(holdings_map) <= 3:
                    hist = stock.history(period="6mo")  # Reduced from 1y
                    if not hist.empty and len(hist) > 20:
                        daily_returns = hist['Close'].pct_change().dropna()
                        
                        # Calculate max drawdown
                        cumulative = (1 + daily_returns).cumprod()
                        running_max = cumulative.cummax()
                        drawdown = (cumulative - running_max) / running_max
                        max_dd = drawdown.min() * 100
                        
                        returns_data.append({
                            'ticker': ticker,
                            'returns': daily_returns,
                            'mean_return': daily_returns.mean() * 252,
                            'volatility': daily_returns.std() * np.sqrt(252),
                            'max_drawdown': max_dd,
                            'beta': stock_beta
                        })
            except Exception as e:
                logging.warning(f"Error fetching data for {ticker}: {str(e)}")
                # Use last known cost as fallback
                if data["total_shares"] > 0 and data["total_cost"] > 0:
                    curr_price = data["total_cost"] / data["total_shares"]
            
            curr_value_stock = data["total_shares"] * curr_price
            avg_cost = data["total_cost"] / data["total_shares"] if data["total_shares"] > 0 else 0
            profit_loss = curr_value_stock - data["total_cost"]
            profit_loss_pct = (profit_loss / data["total_cost"]) * 100 if data["total_cost"] > 0 else 0
            
            # Track gains and losses for Gain-Loss Ratio
            if profit_loss >= 0:
                gains.append(profit_loss)
            else:
                losses.append(abs(profit_loss))
            
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
        cash_movements = await db.cash_movements.find().to_list(1000)
        total_deposits = sum(m['amount'] for m in cash_movements if m['movement_type'] == 'deposit')
        total_withdrawals = sum(m['amount'] for m in cash_movements if m['movement_type'] == 'withdrawal')
        
        # Calculate cash used in purchases and received from sales
        cash_used_in_buys = sum(
            tx['total_amount'] + tx.get('commission', 0) 
            for tx in transactions 
            if tx['transaction_type'] == 'buy'
        )
        cash_from_sells = sum(
            tx['total_amount'] - tx.get('commission', 0) 
            for tx in transactions 
            if tx['transaction_type'] == 'sell'
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
async def add_portfolio_transaction(tx: PortfolioTransactionCreate):
    """Add a transaction to portfolio"""
    try:
        ticker = tx.ticker.upper().strip()
        
        # Fetch stock info
        stock = yf.Ticker(ticker)
        info = stock.info
        
        if not info or 'symbol' not in info:
            raise HTTPException(status_code=404, detail=f"No se encontró el ticker {ticker}")
        
        transaction = PortfolioTransaction(
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
async def delete_portfolio_transaction(transaction_id: str):
    """Delete a portfolio transaction"""
    try:
        result = await db.portfolio.delete_one({"id": transaction_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Transacción no encontrada")
        return {"message": "Transacción eliminada"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar transacción: {str(e)}")

@api_router.get("/portfolio/transactions", response_model=List[PortfolioTransaction])
async def get_portfolio_transactions():
    """Get all portfolio transactions"""
    try:
        transactions = await db.portfolio.find().sort("transaction_date", -1).to_list(1000)
        return [PortfolioTransaction(**tx) for tx in transactions]
    except Exception as e:
        logging.error(f"Error fetching transactions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener transacciones: {str(e)}")

# ============================================
# CASH MOVEMENTS (DEPOSITS/WITHDRAWALS)
# ============================================

@api_router.post("/portfolio/cash", response_model=CashMovement)
async def add_cash_movement(movement: CashMovementCreate):
    """Add a deposit or withdrawal"""
    try:
        if movement.movement_type not in ['deposit', 'withdrawal']:
            raise HTTPException(status_code=400, detail="Tipo debe ser 'deposit' o 'withdrawal'")
        
        if movement.amount <= 0:
            raise HTTPException(status_code=400, detail="El monto debe ser positivo")
        
        cash_doc = CashMovement(
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
async def get_cash_movements():
    """Get all cash movements"""
    try:
        movements = await db.cash_movements.find().sort("movement_date", -1).to_list(1000)
        return [CashMovement(**m) for m in movements]
    except Exception as e:
        logging.error(f"Error fetching cash movements: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener movimientos: {str(e)}")

@api_router.delete("/portfolio/cash/{movement_id}")
async def delete_cash_movement(movement_id: str):
    """Delete a cash movement"""
    try:
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
async def get_cash_summary():
    """Get cash balance summary"""
    try:
        movements = await db.cash_movements.find().to_list(1000)
        
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

@api_router.get("/portfolio/evolution", response_model=PortfolioEvolution)
async def get_portfolio_evolution():
    """Get portfolio value evolution over time"""
    try:
        # Get all transactions sorted by date
        transactions = await db.portfolio.find().sort("transaction_date", 1).to_list(1000)
        cash_movements = await db.cash_movements.find().sort("movement_date", 1).to_list(1000)
        
        if not transactions and not cash_movements:
            return PortfolioEvolution(
                history=[],
                current_value=0,
                total_change=0,
                total_change_percent=0
            )
        
        # Determine date range
        all_dates = []
        if transactions:
            all_dates.extend([tx['transaction_date'] for tx in transactions])
        if cash_movements:
            all_dates.extend([m['movement_date'] for m in cash_movements])
        
        if not all_dates:
            return PortfolioEvolution(
                history=[],
                current_value=0,
                total_change=0,
                total_change_percent=0
            )
        
        start_date = min(all_dates)
        end_date = datetime.utcnow()
        
        # Generate monthly data points
        history = []
        current_date = start_date.replace(day=1)
        
        # Get unique tickers
        tickers = list(set(tx['ticker'] for tx in transactions)) if transactions else []
        
        # Fetch historical prices for all tickers
        ticker_prices = {}
        for ticker in tickers:
            try:
                stock = yf.Ticker(ticker)
                hist = stock.history(period="5y")
                if not hist.empty:
                    ticker_prices[ticker] = hist['Close']
            except:
                pass
        
        while current_date <= end_date:
            # Calculate holdings at this date
            holdings_at_date = {}
            invested_at_date = 0
            
            for tx in transactions:
                if tx['transaction_date'].replace(tzinfo=None) <= current_date.replace(tzinfo=None):
                    ticker = tx['ticker']
                    if ticker not in holdings_at_date:
                        holdings_at_date[ticker] = {'shares': 0, 'cost': 0}
                    
                    if tx['transaction_type'] == 'buy':
                        holdings_at_date[ticker]['shares'] += tx['shares']
                        holdings_at_date[ticker]['cost'] += tx['total_amount']
                        invested_at_date += tx['total_amount']
                    else:
                        holdings_at_date[ticker]['shares'] -= tx['shares']
                        holdings_at_date[ticker]['cost'] -= tx['total_amount']
                        invested_at_date -= tx['total_amount']
            
            # Calculate cash balance at this date
            cash_at_date = 0
            for m in cash_movements:
                if m['movement_date'].replace(tzinfo=None) <= current_date.replace(tzinfo=None):
                    if m['movement_type'] == 'deposit':
                        cash_at_date += m['amount']
                    else:
                        cash_at_date -= m['amount']
            
            # Calculate portfolio value at this date
            portfolio_value = cash_at_date
            for ticker, holding in holdings_at_date.items():
                if holding['shares'] > 0 and ticker in ticker_prices:
                    # Find closest price to current_date
                    prices = ticker_prices[ticker]
                    try:
                        closest_date = prices.index.asof(current_date)
                        if pd.notna(closest_date):
                            price = prices.loc[closest_date]
                            portfolio_value += holding['shares'] * price
                    except:
                        # Use cost as fallback
                        portfolio_value += holding['cost']
            
            # Calculate profit/loss
            total_invested_with_cash = invested_at_date + cash_at_date
            profit_loss = portfolio_value - total_invested_with_cash if total_invested_with_cash > 0 else 0
            profit_loss_pct = (profit_loss / total_invested_with_cash * 100) if total_invested_with_cash > 0 else 0
            
            history.append(PortfolioHistoryPoint(
                date=current_date.strftime('%Y-%m-%d'),
                total_value=round(portfolio_value, 2),
                invested_value=round(invested_at_date, 2),
                cash_balance=round(cash_at_date, 2),
                profit_loss=round(profit_loss, 2),
                profit_loss_percent=round(profit_loss_pct, 2)
            ))
            
            # Move to next month
            if current_date.month == 12:
                current_date = current_date.replace(year=current_date.year + 1, month=1)
            else:
                current_date = current_date.replace(month=current_date.month + 1)
        
        # Calculate current totals
        current_value = history[-1].total_value if history else 0
        first_value = history[0].total_value if history else 0
        total_change = current_value - first_value
        total_change_pct = (total_change / first_value * 100) if first_value > 0 else 0
        
        return PortfolioEvolution(
            history=history,
            current_value=current_value,
            total_change=round(total_change, 2),
            total_change_percent=round(total_change_pct, 2)
        )
        
    except Exception as e:
        logging.error(f"Error getting portfolio evolution: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al obtener evolución: {str(e)}")

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
    """Generate a detailed system prompt for financial analysis"""
    
    # Extract metadata
    metadata = stock_data.get('metadata', {})
    summary_flags = stock_data.get('summary_flags', {})
    
    # Safe formatting helper
    def safe_format(value, format_type='str'):
        if value is None or value == 'N/A':
            return 'N/A'
        try:
            if format_type == 'money':
                return f"${float(value):,.0f}"
            elif format_type == 'percent':
                return f"{float(value):.1f}%"
            elif format_type == 'price':
                return f"${float(value):.2f}"
            else:
                return str(value)
        except:
            return str(value) if value else 'N/A'
    
    # Format summary flags
    flags_text = ""
    if summary_flags:
        flags_list = []
        flag_labels = {
            'profitable': ('Rentable', '✅' if summary_flags.get('profitable') else '❌'),
            'positive_fcf': ('Flujo de Caja Positivo', '✅' if summary_flags.get('positive_fcf') else '❌'),
            'low_debt': ('Deuda Baja', '✅' if summary_flags.get('low_debt') else '❌'),
            'good_margins': ('Buenos Márgenes', '✅' if summary_flags.get('good_margins') else '❌'),
            'healthy_liquidity': ('Liquidez Sana', '✅' if summary_flags.get('healthy_liquidity') else '❌'),
            'strong_roe': ('ROE Fuerte', '✅' if summary_flags.get('strong_roe') else '❌'),
        }
        for key, (label, icon) in flag_labels.items():
            if key in summary_flags:
                flags_list.append(f"{icon} {label}")
        flags_text = " | ".join(flags_list)
    
    # Get values safely
    current_price = stock_data.get('current_price') or metadata.get('current_price')
    market_cap = metadata.get('market_cap')
    pe_ratio = metadata.get('pe_ratio')
    div_yield = metadata.get('dividend_yield')
    week_high = metadata.get('fifty_two_week_high')
    week_low = metadata.get('fifty_two_week_low')
    fav_pct = stock_data.get('favorable_percentage')
    
    return f"""Eres un analista financiero experto y amigable especializado en análisis de acciones. Tu nombre es "FinBot". 
Estás analizando la acción {ticker} ({stock_data.get('company_name', ticker)}).

═══════════════════════════════════════════════════
📊 DATOS DE LA EMPRESA
═══════════════════════════════════════════════════
- Ticker: {ticker}
- Nombre: {stock_data.get('company_name', 'N/A')}
- Sector: {metadata.get('sector', 'N/A')}
- Industria: {metadata.get('industry', 'N/A')}
- Precio Actual: {safe_format(current_price, 'price')}
- Market Cap: {safe_format(market_cap, 'money')}
- P/E Ratio: {safe_format(pe_ratio)}
- Dividend Yield: {safe_format(div_yield, 'percent') if div_yield else 'N/A'}
- 52 Week High: {safe_format(week_high, 'price')}
- 52 Week Low: {safe_format(week_low, 'price')}

═══════════════════════════════════════════════════
🎯 RESULTADO DEL ANÁLISIS
═══════════════════════════════════════════════════
- Recomendación: {stock_data.get('recommendation', 'N/A')}
- Nivel de Riesgo: {stock_data.get('risk_level', 'N/A')}
- Métricas Favorables: {stock_data.get('favorable_metrics', 'N/A')} de {stock_data.get('total_metrics', 'N/A')} ({safe_format(fav_pct, 'percent') if fav_pct else 'N/A'})

INDICADORES CLAVE:
{flags_text if flags_text else 'No disponibles'}

═══════════════════════════════════════════════════
📈 RATIOS FINANCIEROS DETALLADOS
═══════════════════════════════════════════════════
{format_ratios_for_prompt(stock_data.get('ratios', {}))}

═══════════════════════════════════════════════════
💡 INSTRUCCIONES PARA TI (FinBot)
═══════════════════════════════════════════════════
1. SIEMPRE responde en español de forma clara y concisa
2. Tienes TODOS los datos del análisis arriba - ¡úsalos para dar respuestas informativas!
3. Sé conversacional y amigable, pero profesional
4. Usa emojis apropiados (📈 📉 💰 ⚠️ ✅ 💡 🎯 📊)
5. Cuando des recomendaciones, menciona que no es asesoría financiera profesional
6. Ofrece perspectivas tanto alcistas como bajistas
7. Explica términos técnicos de forma simple
8. Cuando el usuario pregunte sobre métricas específicas, cita los valores exactos que tienes arriba
9. Si el usuario pregunta "¿qué datos tienes?" - enumérale los ratios que tienes disponibles

IMPORTANTE: Mantén respuestas concisas (máximo 250 palabras) a menos que el usuario pida más detalle."""


def format_ratios_for_prompt(ratios: Dict[str, Any]) -> str:
    """Format ratios dictionary into readable string for the prompt"""
    if not ratios:
        return "No hay datos de ratios disponibles"
    
    lines = []
    for key, value in ratios.items():
        if isinstance(value, dict):
            status = "✅ Favorable" if value.get('is_favorable', False) else "⚠️ No favorable"
            lines.append(f"- {key}: {value.get('value', 'N/A')} ({status})")
        else:
            lines.append(f"- {key}: {value}")
    
    return "\n".join(lines) if lines else "Sin datos de ratios"


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
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="LLM API key not configured")
        
        session_id = request.session_id or str(uuid.uuid4())
        
        # Create new chat instance with financial system prompt
        system_prompt = get_financial_system_prompt(request.ticker, request.stock_data)
        
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_prompt
        ).with_model("openai", "gpt-4o-mini")
        
        # Store the session
        ai_chat_sessions[session_id] = chat
        
        # Generate initial analysis
        init_message = UserMessage(
            text=f"""Proporciona un análisis inicial breve y conversacional de {request.ticker}. 
            
Incluye:
1. Tu primera impresión general (1-2 oraciones)
2. Un punto fuerte destacado
3. Una posible preocupación
4. Una invitación a que el usuario haga preguntas

Mantén el tono amigable y accesible. Usa 2-3 emojis apropiados."""
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
            api_key = os.environ.get('EMERGENT_LLM_KEY')
            if not api_key:
                raise HTTPException(status_code=500, detail="LLM API key not configured")
            
            basic_prompt = """Eres FinBot, un analista financiero experto y amigable. 
Responde siempre en español de forma clara y concisa.
Si no tienes contexto de una acción específica, ofrece información general sobre inversiones y análisis financiero.
Usa emojis ocasionalmente para hacer la conversación más amena.
Recuerda mencionar que no proporcionas asesoría financiera profesional."""
            
            chat = LlmChat(
                api_key=api_key,
                session_id=session_id,
                system_message=basic_prompt
            ).with_model("openai", "gpt-4o-mini")
            
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
