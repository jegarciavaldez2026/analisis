#!/usr/bin/env python3
"""
Comprehensive Backend Testing for Financial Analysis Application
Tests all API endpoints and validates financial calculations
"""

import requests
import json
import time
from datetime import datetime
import sys

# Get backend URL from frontend .env
BACKEND_URL = "https://fintech-hub-196.preview.emergentagent.com/api"

class FinancialAnalysisAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name, passed, details="", error_msg=""):
        """Log test results"""
        result = {
            "test": test_name,
            "passed": passed,
            "details": details,
            "error": error_msg,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if error_msg:
            print(f"   Error: {error_msg}")
        print()
        
    def test_analyze_endpoint_valid_tickers(self):
        """Test POST /api/analyze with valid tickers"""
        test_tickers = ["AAPL", "MSFT", "GOOGL", "TSLA", "AMZN"]
        
        for ticker in test_tickers:
            try:
                payload = {"ticker": ticker}
                response = self.session.post(f"{self.base_url}/analyze", json=payload, timeout=30)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Validate response structure
                    required_fields = [
                        "id", "ticker", "company_name", "analysis_date", 
                        "recommendation", "favorable_percentage", "risk_level",
                        "total_metrics", "favorable_metrics", "unfavorable_metrics",
                        "ratios", "metadata", "summary_flags"
                    ]
                    
                    missing_fields = [field for field in required_fields if field not in data]
                    if missing_fields:
                        self.log_test(f"Analyze {ticker} - Structure", False, 
                                    error_msg=f"Missing fields: {missing_fields}")
                        continue
                    
                    # Validate ticker matches
                    if data["ticker"] != ticker:
                        self.log_test(f"Analyze {ticker} - Ticker Match", False,
                                    error_msg=f"Expected {ticker}, got {data['ticker']}")
                        continue
                    
                    # Validate recommendation logic
                    fav_pct = data["favorable_percentage"]
                    recommendation = data["recommendation"]
                    expected_rec = "COMPRAR" if fav_pct >= 60 else "MANTENER" if fav_pct >= 40 else "VENDER"
                    
                    if recommendation != expected_rec:
                        self.log_test(f"Analyze {ticker} - Recommendation Logic", False,
                                    error_msg=f"Expected {expected_rec} for {fav_pct}%, got {recommendation}")
                        continue
                    
                    # Validate ratios structure
                    if not isinstance(data["ratios"], list) or len(data["ratios"]) != 10:
                        self.log_test(f"Analyze {ticker} - Ratios Structure", False,
                                    error_msg=f"Expected 10 ratio categories, got {len(data.get('ratios', []))}")
                        continue
                    
                    # Validate ratio categories
                    expected_categories = ["📊 Rentabilidad", "💧 Liquidez", "⚖️ Apalancamiento", 
                                         "💰 Valoración", "💵 Flujo de Caja", "⚠️ Riesgo y Capital",
                                         "🔬 Métricas Avanzadas", "📋 Calidad Contable y Salud Financiera",
                                         "📊 Rendimiento de Precio", "💰 Valoración Graham"]
                    actual_categories = [cat["category"] for cat in data["ratios"]]
                    
                    if set(actual_categories) != set(expected_categories):
                        self.log_test(f"Analyze {ticker} - Categories", False,
                                    error_msg=f"Category mismatch. Expected: {expected_categories}, Got: {actual_categories}")
                        continue
                    
                    # Validate metrics count
                    total_calculated = sum(len(cat["metrics"]) for cat in data["ratios"])
                    if data["total_metrics"] != total_calculated:
                        self.log_test(f"Analyze {ticker} - Metrics Count", False,
                                    error_msg=f"Total metrics mismatch: reported {data['total_metrics']}, calculated {total_calculated}")
                        continue
                    
                    # Validate favorable + unfavorable = total
                    if data["favorable_metrics"] + data["unfavorable_metrics"] != data["total_metrics"]:
                        self.log_test(f"Analyze {ticker} - Metrics Sum", False,
                                    error_msg=f"Favorable ({data['favorable_metrics']}) + Unfavorable ({data['unfavorable_metrics']}) != Total ({data['total_metrics']})")
                        continue
                    
                    self.log_test(f"Analyze {ticker}", True, 
                                f"Company: {data['company_name']}, Recommendation: {recommendation} ({fav_pct:.1f}%)")
                    
                else:
                    self.log_test(f"Analyze {ticker}", False, 
                                error_msg=f"HTTP {response.status_code}: {response.text}")
                    
            except Exception as e:
                self.log_test(f"Analyze {ticker}", False, error_msg=str(e))
                
    def test_analyze_endpoint_invalid_tickers(self):
        """Test POST /api/analyze with invalid tickers"""
        invalid_tickers = ["INVALID123", "NOTREAL", ""]
        
        for ticker in invalid_tickers:
            try:
                payload = {"ticker": ticker}
                response = self.session.post(f"{self.base_url}/analyze", json=payload, timeout=15)
                
                if response.status_code == 404:
                    self.log_test(f"Invalid Ticker '{ticker}'", True, 
                                "Correctly returned 404 for invalid ticker")
                elif response.status_code == 422 and ticker == "":
                    self.log_test(f"Empty Ticker", True, 
                                "Correctly returned 422 for empty ticker")
                else:
                    self.log_test(f"Invalid Ticker '{ticker}'", False,
                                error_msg=f"Expected 404/422, got {response.status_code}: {response.text}")
                    
            except Exception as e:
                self.log_test(f"Invalid Ticker '{ticker}'", False, error_msg=str(e))
    
    def test_history_endpoint(self):
        """Test GET /api/history"""
        try:
            response = self.session.get(f"{self.base_url}/history", timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                
                if not isinstance(data, list):
                    self.log_test("History Endpoint", False, 
                                error_msg="Response should be a list")
                    return
                
                # If we have data, validate structure
                if data:
                    first_item = data[0]
                    required_fields = ["id", "ticker", "company_name", "analysis_date", 
                                     "recommendation", "favorable_percentage"]
                    
                    missing_fields = [field for field in required_fields if field not in first_item]
                    if missing_fields:
                        self.log_test("History Endpoint", False,
                                    error_msg=f"Missing fields in history item: {missing_fields}")
                        return
                
                self.log_test("History Endpoint", True, 
                            f"Retrieved {len(data)} analysis records")
            else:
                self.log_test("History Endpoint", False,
                            error_msg=f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_test("History Endpoint", False, error_msg=str(e))
    
    def test_specific_analysis_endpoint(self):
        """Test GET /api/analysis/{id}"""
        # First, create an analysis to test with
        try:
            # Create analysis
            payload = {"ticker": "AAPL"}
            response = self.session.post(f"{self.base_url}/analyze", json=payload, timeout=30)
            
            if response.status_code != 200:
                self.log_test("Specific Analysis - Setup", False,
                            error_msg="Could not create analysis for testing")
                return
            
            analysis_data = response.json()
            analysis_id = analysis_data["id"]
            
            # Test retrieving the specific analysis
            response = self.session.get(f"{self.base_url}/analysis/{analysis_id}", timeout=15)
            
            if response.status_code == 200:
                retrieved_data = response.json()
                
                # Validate it's the same analysis
                if retrieved_data["id"] != analysis_id:
                    self.log_test("Specific Analysis", False,
                                error_msg=f"ID mismatch: expected {analysis_id}, got {retrieved_data['id']}")
                    return
                
                if retrieved_data["ticker"] != "AAPL":
                    self.log_test("Specific Analysis", False,
                                error_msg=f"Ticker mismatch: expected AAPL, got {retrieved_data['ticker']}")
                    return
                
                self.log_test("Specific Analysis", True,
                            f"Successfully retrieved analysis for {retrieved_data['ticker']}")
            else:
                self.log_test("Specific Analysis", False,
                            error_msg=f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_test("Specific Analysis", False, error_msg=str(e))
    
    def test_nonexistent_analysis(self):
        """Test GET /api/analysis/{id} with non-existent ID"""
        try:
            fake_id = "nonexistent-id-12345"
            response = self.session.get(f"{self.base_url}/analysis/{fake_id}", timeout=15)
            
            if response.status_code == 404:
                self.log_test("Non-existent Analysis", True,
                            "Correctly returned 404 for non-existent analysis")
            else:
                self.log_test("Non-existent Analysis", False,
                            error_msg=f"Expected 404, got {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_test("Non-existent Analysis", False, error_msg=str(e))
    
    def test_ratio_calculations_sample(self):
        """Test that ratio calculations are reasonable for a known stock"""
        try:
            payload = {"ticker": "AAPL"}
            response = self.session.post(f"{self.base_url}/analyze", json=payload, timeout=30)
            
            if response.status_code != 200:
                self.log_test("Ratio Calculations", False,
                            error_msg="Could not get AAPL data for ratio testing")
                return
            
            data = response.json()
            
            # Check that we have reasonable values for key ratios
            issues = []
            
            # Find profitability metrics
            profitability_cat = next((cat for cat in data["ratios"] if "Rentabilidad" in cat["category"]), None)
            if not profitability_cat:
                issues.append("Missing profitability category")
            else:
                # Check ROE exists and is reasonable for AAPL (should be positive)
                roe_metric = next((m for m in profitability_cat["metrics"] if "ROE" in m["name"]), None)
                if not roe_metric:
                    issues.append("Missing ROE metric")
                elif roe_metric["value"] is None or roe_metric["value"] < 0:
                    issues.append(f"ROE seems unreasonable: {roe_metric['value']}")
            
            # Find liquidity metrics
            liquidity_cat = next((cat for cat in data["ratios"] if "Liquidez" in cat["category"]), None)
            if not liquidity_cat:
                issues.append("Missing liquidity category")
            else:
                # Check current ratio exists
                cr_metric = next((m for m in liquidity_cat["metrics"] if "Corriente" in m["name"]), None)
                if not cr_metric:
                    issues.append("Missing current ratio metric")
                elif cr_metric["value"] is None or cr_metric["value"] < 0:
                    issues.append(f"Current ratio seems unreasonable: {cr_metric['value']}")
            
            if issues:
                self.log_test("Ratio Calculations", False,
                            error_msg=f"Issues found: {'; '.join(issues)}")
            else:
                self.log_test("Ratio Calculations", True,
                            "Key ratios appear to be calculated correctly")
                
        except Exception as e:
            self.log_test("Ratio Calculations", False, error_msg=str(e))

    def test_technical_analysis_valid_tickers(self):
        """Test GET /api/technical/{ticker} with valid tickers"""
        test_tickers = ["AAPL", "MSFT", "GOOGL"]
        
        for ticker in test_tickers:
            try:
                response = self.session.get(f"{self.base_url}/technical/{ticker}", timeout=30)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Validate response structure
                    required_fields = [
                        "ticker", "current_price", "analysis_date",
                        "fibonacci_levels", "current_fibonacci_zone", "fibonacci_interpretation",
                        "swing_high", "swing_low", "trend_direction",
                        "moving_averages", "ma_summary", "ma_trend_signal", 
                        "golden_cross", "death_cross",
                        "camarilla_pivots", "current_camarilla_zone", "camarilla_interpretation",
                        "technical_score", "technical_recommendation", "key_levels"
                    ]
                    
                    missing_fields = [field for field in required_fields if field not in data]
                    if missing_fields:
                        self.log_test(f"Technical Analysis {ticker} - Structure", False, 
                                    error_msg=f"Missing fields: {missing_fields}")
                        continue
                    
                    # Validate ticker matches
                    if data["ticker"] != ticker:
                        self.log_test(f"Technical Analysis {ticker} - Ticker Match", False,
                                    error_msg=f"Expected {ticker}, got {data['ticker']}")
                        continue
                    
                    # Validate fibonacci_levels structure
                    if not isinstance(data["fibonacci_levels"], list) or len(data["fibonacci_levels"]) == 0:
                        self.log_test(f"Technical Analysis {ticker} - Fibonacci Levels", False,
                                    error_msg=f"Fibonacci levels should be non-empty list")
                        continue
                    
                    # Check each fibonacci level has required fields
                    fib_issues = []
                    for level in data["fibonacci_levels"]:
                        required_fib_fields = ["level", "price", "is_support", "distance_percent"]
                        missing_fib_fields = [field for field in required_fib_fields if field not in level]
                        if missing_fib_fields:
                            fib_issues.append(f"Missing fields in fibonacci level: {missing_fib_fields}")
                    
                    if fib_issues:
                        self.log_test(f"Technical Analysis {ticker} - Fibonacci Structure", False,
                                    error_msg="; ".join(fib_issues))
                        continue
                    
                    # Validate moving_averages structure (should have MA 20, 50, 200)
                    if not isinstance(data["moving_averages"], list) or len(data["moving_averages"]) != 3:
                        self.log_test(f"Technical Analysis {ticker} - Moving Averages Count", False,
                                    error_msg=f"Expected 3 moving averages, got {len(data.get('moving_averages', []))}")
                        continue
                    
                    # Check each MA has required fields and correct periods
                    ma_issues = []
                    expected_periods = [20, 50, 200]
                    actual_periods = [ma["period"] for ma in data["moving_averages"]]
                    if actual_periods != expected_periods:
                        ma_issues.append(f"Expected periods {expected_periods}, got {actual_periods}")
                    
                    for ma in data["moving_averages"]:
                        required_ma_fields = ["period", "value", "signal", "price_position", "distance_percent"]
                        missing_ma_fields = [field for field in required_ma_fields if field not in ma]
                        if missing_ma_fields:
                            ma_issues.append(f"Missing fields in MA: {missing_ma_fields}")
                        
                        # Validate signal values
                        if ma["signal"] not in ["ALCISTA", "BAJISTA", "NEUTRAL"]:
                            ma_issues.append(f"Invalid MA signal: {ma['signal']}")
                    
                    if ma_issues:
                        self.log_test(f"Technical Analysis {ticker} - Moving Averages Structure", False,
                                    error_msg="; ".join(ma_issues))
                        continue
                    
                    # Validate camarilla_pivots structure
                    if not isinstance(data["camarilla_pivots"], list) or len(data["camarilla_pivots"]) == 0:
                        self.log_test(f"Technical Analysis {ticker} - Camarilla Pivots", False,
                                    error_msg=f"Camarilla pivots should be non-empty list")
                        continue
                    
                    # Check each camarilla pivot has required fields
                    cam_issues = []
                    for pivot in data["camarilla_pivots"]:
                        required_cam_fields = ["level", "price", "significance"]
                        missing_cam_fields = [field for field in required_cam_fields if field not in pivot]
                        if missing_cam_fields:
                            cam_issues.append(f"Missing fields in camarilla pivot: {missing_cam_fields}")
                    
                    if cam_issues:
                        self.log_test(f"Technical Analysis {ticker} - Camarilla Structure", False,
                                    error_msg="; ".join(cam_issues))
                        continue
                    
                    # Validate technical_score range (0-100)
                    if not (0 <= data["technical_score"] <= 100):
                        self.log_test(f"Technical Analysis {ticker} - Technical Score Range", False,
                                    error_msg=f"Technical score {data['technical_score']} not in range 0-100")
                        continue
                    
                    # Validate technical_recommendation values
                    if data["technical_recommendation"] not in ["COMPRAR", "VENDER", "MANTENER"]:
                        self.log_test(f"Technical Analysis {ticker} - Recommendation", False,
                                    error_msg=f"Invalid recommendation: {data['technical_recommendation']}")
                        continue
                    
                    # Validate trend_direction values
                    if data["trend_direction"] not in ["ALCISTA", "BAJISTA", "LATERAL"]:
                        self.log_test(f"Technical Analysis {ticker} - Trend Direction", False,
                                    error_msg=f"Invalid trend direction: {data['trend_direction']}")
                        continue
                    
                    # Validate current_price is reasonable
                    if data["current_price"] <= 0:
                        self.log_test(f"Technical Analysis {ticker} - Current Price", False,
                                    error_msg=f"Invalid current price: {data['current_price']}")
                        continue
                    
                    # Validate key_levels structure
                    if not isinstance(data["key_levels"], dict) or len(data["key_levels"]) == 0:
                        self.log_test(f"Technical Analysis {ticker} - Key Levels", False,
                                    error_msg=f"Key levels should be non-empty dict")
                        continue
                    
                    self.log_test(f"Technical Analysis {ticker}", True, 
                                f"Score: {data['technical_score']}, Recommendation: {data['technical_recommendation']}, Trend: {data['trend_direction']}")
                    
                else:
                    self.log_test(f"Technical Analysis {ticker}", False, 
                                error_msg=f"HTTP {response.status_code}: {response.text}")
                    
            except Exception as e:
                self.log_test(f"Technical Analysis {ticker}", False, error_msg=str(e))

    def test_technical_analysis_invalid_ticker(self):
        """Test GET /api/technical/{ticker} with invalid ticker"""
        try:
            response = self.session.get(f"{self.base_url}/technical/XXXXX", timeout=15)
            
            if response.status_code == 404:
                self.log_test("Technical Analysis Invalid Ticker", True,
                            "Correctly returned 404 for invalid ticker XXXXX")
            else:
                self.log_test("Technical Analysis Invalid Ticker", False,
                            error_msg=f"Expected 404, got {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_test("Technical Analysis Invalid Ticker", False, error_msg=str(e))

    def test_technical_analysis_detailed_validation(self):
        """Test detailed validation of technical analysis components for AAPL"""
        try:
            response = self.session.get(f"{self.base_url}/technical/AAPL", timeout=30)
            
            if response.status_code != 200:
                self.log_test("Technical Analysis Detailed Validation", False,
                            error_msg=f"Could not get AAPL technical data: {response.status_code}")
                return
            
            data = response.json()
            issues = []
            
            # Validate Fibonacci levels contain expected percentages
            fib_levels = [level["level"] for level in data["fibonacci_levels"]]
            expected_fib_levels = ["0%", "23.6%", "38.2%", "50%", "61.8%", "78.6%", "100%"]
            missing_fib_levels = [level for level in expected_fib_levels if level not in fib_levels]
            if missing_fib_levels:
                issues.append(f"Missing Fibonacci levels: {missing_fib_levels}")
            
            # Validate swing high > swing low
            if data["swing_high"] <= data["swing_low"]:
                issues.append(f"Swing high ({data['swing_high']}) should be > swing low ({data['swing_low']})")
            
            # Validate MA values are in ascending order (MA20 should be most recent)
            ma_values = [ma["value"] for ma in data["moving_averages"] if ma["value"] > 0]
            if len(ma_values) == 3:
                # In most cases, shorter period MAs react faster to price changes
                # but we won't enforce strict ordering as it depends on market conditions
                pass
            
            # Validate Camarilla pivot levels
            camarilla_levels = [pivot["level"] for pivot in data["camarilla_pivots"]]
            expected_cam_levels = ["R4", "R3", "R2", "R1", "PP", "S1", "S2", "S3", "S4"]
            missing_cam_levels = [level for level in expected_cam_levels if level not in camarilla_levels]
            if missing_cam_levels:
                issues.append(f"Missing Camarilla levels: {missing_cam_levels}")
            
            # Validate current price is within reasonable range of swing high/low
            price_range = data["swing_high"] - data["swing_low"]
            extended_high = data["swing_high"] + price_range
            extended_low = data["swing_low"] - price_range
            if not (extended_low <= data["current_price"] <= extended_high):
                issues.append(f"Current price ({data['current_price']}) outside reasonable range")
            
            # Validate interpretation fields are not empty
            if not data["fibonacci_interpretation"].strip():
                issues.append("Fibonacci interpretation is empty")
            if not data["camarilla_interpretation"].strip():
                issues.append("Camarilla interpretation is empty")
            if not data["ma_summary"].strip():
                issues.append("MA summary is empty")
            
            if issues:
                self.log_test("Technical Analysis Detailed Validation", False,
                            error_msg=f"Issues found: {'; '.join(issues)}")
            else:
                self.log_test("Technical Analysis Detailed Validation", True,
                            "All technical analysis components validated successfully")
                
        except Exception as e:
            self.log_test("Technical Analysis Detailed Validation", False, error_msg=str(e))
    
    def run_all_tests(self):
        """Run all tests"""
        print(f"🧪 Starting Financial Analysis API Tests")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Test valid tickers
        print("📊 Testing Valid Tickers...")
        self.test_analyze_endpoint_valid_tickers()
        
        # Test invalid tickers
        print("🚫 Testing Invalid Tickers...")
        self.test_analyze_endpoint_invalid_tickers()
        
        # Test history endpoint
        print("📚 Testing History Endpoint...")
        self.test_history_endpoint()
        
        # Test specific analysis endpoint
        print("🔍 Testing Specific Analysis Endpoint...")
        self.test_specific_analysis_endpoint()
        
        # Test non-existent analysis
        print("❓ Testing Non-existent Analysis...")
        self.test_nonexistent_analysis()
        
        # Test ratio calculations
        print("🧮 Testing Ratio Calculations...")
        self.test_ratio_calculations_sample()
        
        # Test technical analysis endpoints
        print("📈 Testing Technical Analysis - Valid Tickers...")
        self.test_technical_analysis_valid_tickers()
        
        print("🚫 Testing Technical Analysis - Invalid Ticker...")
        self.test_technical_analysis_invalid_ticker()
        
        print("🔍 Testing Technical Analysis - Detailed Validation...")
        self.test_technical_analysis_detailed_validation()
        
        # Summary
        print("=" * 60)
        print("📋 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["passed"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if total - passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["passed"]:
                    print(f"  - {result['test']}: {result['error']}")
        
        return passed == total

if __name__ == "__main__":
    tester = FinancialAnalysisAPITester(BACKEND_URL)
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n💥 Some tests failed!")
        sys.exit(1)