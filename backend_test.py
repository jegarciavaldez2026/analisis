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
BACKEND_URL = "https://finratio-hub-1.preview.emergentagent.com/api"

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
                    if not isinstance(data["ratios"], list) or len(data["ratios"]) != 6:
                        self.log_test(f"Analyze {ticker} - Ratios Structure", False,
                                    error_msg=f"Expected 6 ratio categories, got {len(data.get('ratios', []))}")
                        continue
                    
                    # Validate ratio categories
                    expected_categories = ["📊 Rentabilidad", "💧 Liquidez", "⚖️ Apalancamiento", 
                                         "💰 Valoración", "💵 Flujo de Caja", "🏥 Salud Financiera"]
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