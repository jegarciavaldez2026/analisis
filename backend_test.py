#!/usr/bin/env python3
"""
Backend API Testing for Financial Analysis App
Tests the new endpoints requested in the review:
1. GET /api/news/{ticker} - Stock news endpoint
2. GET /api/market-news - Global market news
3. POST /api/ai-assistant/init - Initialize AI assistant
4. POST /api/ai-assistant/chat - Chat with AI
5. GET /api/technical/{ticker} - Verify Fibonacci support/resistance logic
"""

import requests
import json
import time
from datetime import datetime
from typing import Dict, Any, List

class BackendTester:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.results = {}
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })

    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")

    def test_endpoint(self, method: str, endpoint: str, data: Dict = None, expected_status: int = 200) -> Dict[str, Any]:
        """Test a single endpoint and return results"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            self.log(f"Testing {method} {endpoint}")
            
            if method.upper() == "GET":
                response = self.session.get(url, timeout=30)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, timeout=30)
            else:
                return {"success": False, "error": f"Unsupported method: {method}"}
            
            # Check status code
            if response.status_code != expected_status:
                return {
                    "success": False,
                    "status_code": response.status_code,
                    "expected_status": expected_status,
                    "error": f"Expected status {expected_status}, got {response.status_code}",
                    "response_text": response.text[:500]
                }
            
            # Try to parse JSON
            try:
                json_data = response.json()
            except json.JSONDecodeError:
                return {
                    "success": False,
                    "error": "Response is not valid JSON",
                    "response_text": response.text[:500]
                }
            
            return {
                "success": True,
                "status_code": response.status_code,
                "response": json_data,
                "response_size": len(response.text)
            }
            
        except requests.exceptions.Timeout:
            return {"success": False, "error": "Request timeout"}
        except requests.exceptions.ConnectionError:
            return {"success": False, "error": "Connection error"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def validate_stock_news_response(self, response: Dict[str, Any]) -> List[str]:
        """Validate stock news response structure"""
        issues = []
        
        required_fields = ["ticker", "company_name", "news", "last_updated"]
        for field in required_fields:
            if field not in response:
                issues.append(f"Missing required field: {field}")
        
        if "news" in response:
            if not isinstance(response["news"], list):
                issues.append("'news' should be a list")
            else:
                for i, article in enumerate(response["news"]):
                    article_required = ["title", "publisher", "link", "published_date"]
                    for field in article_required:
                        if field not in article:
                            issues.append(f"News article {i}: Missing field '{field}'")
        
        return issues

    def validate_market_news_response(self, response: Dict[str, Any]) -> List[str]:
        """Validate market news response structure"""
        issues = []
        
        required_fields = ["news", "last_updated"]
        for field in required_fields:
            if field not in response:
                issues.append(f"Missing required field: {field}")
        
        if "news" in response:
            if not isinstance(response["news"], list):
                issues.append("'news' should be a list")
            else:
                for i, article in enumerate(response["news"]):
                    article_required = ["title", "publisher", "link", "published_date"]
                    for field in article_required:
                        if field not in article:
                            issues.append(f"News article {i}: Missing field '{field}'")
        
        return issues

    def validate_ai_init_response(self, response: Dict[str, Any]) -> List[str]:
        """Validate AI init response structure"""
        issues = []
        
        required_fields = ["session_id", "initial_analysis", "suggested_questions"]
        for field in required_fields:
            if field not in response:
                issues.append(f"Missing required field: {field}")
        
        if "suggested_questions" in response:
            if not isinstance(response["suggested_questions"], list):
                issues.append("'suggested_questions' should be a list")
        
        return issues

    def validate_ai_chat_response(self, response: Dict[str, Any]) -> List[str]:
        """Validate AI chat response structure"""
        issues = []
        
        required_fields = ["response", "session_id", "suggested_questions"]
        for field in required_fields:
            if field not in response:
                issues.append(f"Missing required field: {field}")
        
        if "suggested_questions" in response:
            if not isinstance(response["suggested_questions"], list):
                issues.append("'suggested_questions' should be a list")
        
        return issues

    def validate_fibonacci_logic(self, response: Dict[str, Any]) -> List[str]:
        """Validate Fibonacci support/resistance logic"""
        issues = []
        
        if "fibonacci_levels" not in response:
            issues.append("Missing fibonacci_levels")
            return issues
        
        if "current_price" not in response:
            issues.append("Missing current_price")
            return issues
        
        current_price = response["current_price"]
        fibonacci_levels = response["fibonacci_levels"]
        
        for level in fibonacci_levels:
            if "price" not in level or "is_support" not in level:
                issues.append(f"Fibonacci level missing price or is_support: {level}")
                continue
            
            level_price = level["price"]
            is_support = level["is_support"]
            
            # Fibonacci logic validation:
            # If current_price > fibonacci_level.price then is_support should be true
            # If current_price < fibonacci_level.price then is_support should be false (it's resistance)
            if current_price > level_price and not is_support:
                issues.append(f"ERROR: Current price ({current_price}) > Fibonacci price ({level_price}) but is_support=False. Should be True (support).")
            elif current_price < level_price and is_support:
                issues.append(f"ERROR: Current price ({current_price}) < Fibonacci price ({level_price}) but is_support=True. Should be False (resistance).")
        
        return issues

    def test_stock_news_endpoint(self):
        """Test GET /api/news/{ticker}"""
        self.log("=== Testing Stock News Endpoint ===")
        
        test_tickers = ["AAPL", "MSFT"]
        
        for ticker in test_tickers:
            result = self.test_endpoint("GET", f"/api/news/{ticker}")
            
            if result["success"]:
                # Validate response structure
                validation_issues = self.validate_stock_news_response(result["response"])
                
                if validation_issues:
                    self.log(f"❌ {ticker} - Validation issues: {'; '.join(validation_issues)}", "ERROR")
                    result["validation_issues"] = validation_issues
                    result["success"] = False
                else:
                    news_count = len(result["response"].get("news", []))
                    company_name = result["response"].get("company_name", "Unknown")
                    self.log(f"✅ {ticker} - Got {news_count} news articles for {company_name}")
            else:
                self.log(f"❌ {ticker} - {result.get('error', 'Unknown error')}", "ERROR")
            
            self.results[f"stock_news_{ticker}"] = result
            time.sleep(1)  # Rate limiting

    def test_market_news_endpoint(self):
        """Test GET /api/market-news"""
        self.log("=== Testing Market News Endpoint ===")
        
        result = self.test_endpoint("GET", "/api/market-news")
        
        if result["success"]:
            # Validate response structure
            validation_issues = self.validate_market_news_response(result["response"])
            
            if validation_issues:
                self.log(f"❌ Market News - Validation issues: {'; '.join(validation_issues)}", "ERROR")
                result["validation_issues"] = validation_issues
                result["success"] = False
            else:
                news_count = len(result["response"].get("news", []))
                self.log(f"✅ Market News - Got {news_count} market news articles")
        else:
            self.log(f"❌ Market News - {result.get('error', 'Unknown error')}", "ERROR")
        
        self.results["market_news"] = result

    def test_ai_assistant_endpoints(self):
        """Test POST /api/ai-assistant/init and POST /api/ai-assistant/chat"""
        self.log("=== Testing AI Assistant Endpoints ===")
        
        # Test 1: Initialize AI assistant
        init_data = {
            "session_id": "test-session-1",
            "ticker": "AAPL",
            "stock_data": {
                "company_name": "Apple Inc.",
                "current_price": 250.0,
                "recommendation": "MANTENER",
                "favorable_percentage": 50,
                "ratios": {}
            }
        }
        
        init_result = self.test_endpoint("POST", "/api/ai-assistant/init", init_data)
        
        if init_result["success"]:
            # Validate response structure
            validation_issues = self.validate_ai_init_response(init_result["response"])
            
            if validation_issues:
                self.log(f"❌ AI Init - Validation issues: {'; '.join(validation_issues)}", "ERROR")
                init_result["validation_issues"] = validation_issues
                init_result["success"] = False
            else:
                session_id = init_result["response"].get("session_id")
                analysis_length = len(init_result["response"].get("initial_analysis", ""))
                suggestions_count = len(init_result["response"].get("suggested_questions", []))
                self.log(f"✅ AI Init - Session: {session_id}, Analysis: {analysis_length} chars, Suggestions: {suggestions_count}")
                
                # Test 2: Chat with AI assistant
                chat_data = {
                    "session_id": session_id,
                    "message": "¿Cuál es tu análisis general?"
                }
                
                chat_result = self.test_endpoint("POST", "/api/ai-assistant/chat", chat_data)
                
                if chat_result["success"]:
                    # Validate response structure
                    chat_validation_issues = self.validate_ai_chat_response(chat_result["response"])
                    
                    if chat_validation_issues:
                        self.log(f"❌ AI Chat - Validation issues: {'; '.join(chat_validation_issues)}", "ERROR")
                        chat_result["validation_issues"] = chat_validation_issues
                        chat_result["success"] = False
                    else:
                        response_length = len(chat_result["response"].get("response", ""))
                        chat_suggestions = len(chat_result["response"].get("suggested_questions", []))
                        self.log(f"✅ AI Chat - Response: {response_length} chars, Suggestions: {chat_suggestions}")
                else:
                    self.log(f"❌ AI Chat - {chat_result.get('error', 'Unknown error')}", "ERROR")
                
                self.results["ai_chat"] = chat_result
        else:
            self.log(f"❌ AI Init - {init_result.get('error', 'Unknown error')}", "ERROR")
        
        self.results["ai_init"] = init_result

    def test_technical_analysis_fibonacci(self):
        """Test GET /api/technical/{ticker} and verify Fibonacci logic"""
        self.log("=== Testing Technical Analysis Fibonacci Logic ===")
        
        test_tickers = ["AAPL"]
        
        for ticker in test_tickers:
            result = self.test_endpoint("GET", f"/api/technical/{ticker}")
            
            if result["success"]:
                # Validate Fibonacci support/resistance logic
                validation_issues = self.validate_fibonacci_logic(result["response"])
                
                if validation_issues:
                    self.log(f"❌ {ticker} - Fibonacci logic issues:", "ERROR")
                    for issue in validation_issues:
                        self.log(f"  • {issue}", "ERROR")
                    result["validation_issues"] = validation_issues
                    result["success"] = False
                else:
                    current_price = result["response"].get("current_price", 0)
                    fib_levels_count = len(result["response"].get("fibonacci_levels", []))
                    technical_score = result["response"].get("technical_score", 0)
                    recommendation = result["response"].get("technical_recommendation", "N/A")
                    
                    self.log(f"✅ {ticker} - Current: ${current_price}, Fibonacci levels: {fib_levels_count}, Score: {technical_score}, Rec: {recommendation}")
                    
                    # Log some Fibonacci levels for verification
                    for level in result["response"].get("fibonacci_levels", [])[:5]:
                        support_status = "SUPPORT" if level.get("is_support") else "RESISTANCE"
                        self.log(f"  📊 {level.get('level', 'N/A')}: ${level.get('price', 0):.2f} ({support_status})")
            else:
                self.log(f"❌ {ticker} - {result.get('error', 'Unknown error')}", "ERROR")
            
            self.results[f"technical_analysis_{ticker}"] = result
            time.sleep(1)  # Rate limiting

    def run_all_tests(self):
        """Run all endpoint tests"""
        self.log("🚀 Starting Backend API Tests for New Endpoints")
        self.log(f"Base URL: {self.base_url}")
        
        start_time = time.time()
        
        try:
            # Test 1: Stock news endpoints
            self.test_stock_news_endpoint()
            
            # Test 2: Market news endpoint
            self.test_market_news_endpoint()
            
            # Test 3: AI Assistant endpoints
            self.test_ai_assistant_endpoints()
            
            # Test 4: Technical analysis with Fibonacci validation
            self.test_technical_analysis_fibonacci()
            
        except Exception as e:
            self.log(f"Critical error during testing: {str(e)}", "ERROR")
        
        end_time = time.time()
        duration = end_time - start_time
        
        self.log(f"🏁 All tests completed in {duration:.2f} seconds")
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        self.log("\n" + "="*50)
        self.log("TEST SUMMARY")
        self.log("="*50)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for result in self.results.values() if result["success"])
        failed_tests = total_tests - passed_tests
        
        self.log(f"Total Tests: {total_tests}")
        self.log(f"Passed: {passed_tests} ✅")
        self.log(f"Failed: {failed_tests} ❌")
        
        if failed_tests > 0:
            self.log("\nFAILED TESTS:")
            for test_name, result in self.results.items():
                if not result["success"]:
                    self.log(f"❌ {test_name}: {result.get('error', 'Unknown error')}")
                    if "validation_issues" in result:
                        for issue in result["validation_issues"]:
                            self.log(f"   • {issue}")
        
        self.log("\nSUCCESSFUL TESTS:")
        for test_name, result in self.results.items():
            if result["success"]:
                self.log(f"✅ {test_name}")


def main():
    # Use the backend URL from the environment
    BASE_URL = "https://wealth-hub-69.preview.emergentagent.com/api"
    
    tester = BackendTester(BASE_URL)
    tester.run_all_tests()


if __name__ == "__main__":
    main()