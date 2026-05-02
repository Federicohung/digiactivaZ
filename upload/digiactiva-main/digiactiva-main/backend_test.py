import requests
import sys
import json
from datetime import datetime

class DigiactivaAPITester:
    def __init__(self, base_url="https://digiactiva-chile.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def test_api_root(self):
        """Test API root endpoint"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            success = response.status_code == 200
            details = f"Status: {response.status_code}, Response: {response.json() if success else response.text}"
            self.log_test("API Root Endpoint", success, details)
            return success
        except Exception as e:
            self.log_test("API Root Endpoint", False, str(e))
            return False

    def test_create_lead(self):
        """Test creating a new lead via contact form"""
        test_lead = {
            "nombre": "Test Usuario",
            "email": "test@example.com",
            "telefono": "+56912345678",
            "mensaje": "Mensaje de prueba para testing",
            "servicio_interes": "gestion"
        }
        
        try:
            response = requests.post(
                f"{self.api_url}/leads",
                json=test_lead,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            success = response.status_code == 200
            if success:
                data = response.json()
                # Verify response structure
                required_fields = ['id', 'nombre', 'email', 'telefono', 'created_at', 'status']
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    success = False
                    details = f"Missing fields in response: {missing_fields}"
                else:
                    details = f"Lead created successfully with ID: {data.get('id')}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text}"
            
            self.log_test("Create Lead (Contact Form)", success, details)
            return success, response.json() if success else None
            
        except Exception as e:
            self.log_test("Create Lead (Contact Form)", False, str(e))
            return False, None

    def test_get_leads(self):
        """Test retrieving leads"""
        try:
            response = requests.get(f"{self.api_url}/leads", timeout=10)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                details = f"Retrieved {len(data)} leads"
                # Verify it's a list
                if not isinstance(data, list):
                    success = False
                    details = "Response is not a list"
            else:
                details = f"Status: {response.status_code}, Response: {response.text}"
            
            self.log_test("Get Leads", success, details)
            return success
            
        except Exception as e:
            self.log_test("Get Leads", False, str(e))
            return False

    def test_lead_validation(self):
        """Test lead validation with invalid data"""
        invalid_leads = [
            {
                "nombre": "",  # Empty name
                "email": "test@example.com",
                "telefono": "+56912345678"
            },
            {
                "nombre": "Test User",
                "email": "invalid-email",  # Invalid email
                "telefono": "+56912345678"
            },
            {
                "nombre": "Test User",
                "email": "test@example.com",
                "telefono": "123"  # Too short phone
            }
        ]
        
        validation_passed = 0
        for i, invalid_lead in enumerate(invalid_leads):
            try:
                response = requests.post(
                    f"{self.api_url}/leads",
                    json=invalid_lead,
                    headers={'Content-Type': 'application/json'},
                    timeout=10
                )
                
                # Should return 422 for validation errors
                if response.status_code == 422:
                    validation_passed += 1
                    print(f"  ✅ Validation test {i+1}: Correctly rejected invalid data")
                else:
                    print(f"  ❌ Validation test {i+1}: Expected 422, got {response.status_code}")
                    
            except Exception as e:
                print(f"  ❌ Validation test {i+1}: Exception - {str(e)}")
        
        success = validation_passed == len(invalid_leads)
        details = f"Passed {validation_passed}/{len(invalid_leads)} validation tests"
        self.log_test("Lead Validation", success, details)
        return success

    def test_status_endpoints(self):
        """Test status check endpoints"""
        # Test creating status check
        try:
            status_data = {"client_name": "test_client"}
            response = requests.post(
                f"{self.api_url}/status",
                json=status_data,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            create_success = response.status_code == 200
            if create_success:
                data = response.json()
                required_fields = ['id', 'client_name', 'timestamp']
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    create_success = False
                    create_details = f"Missing fields: {missing_fields}"
                else:
                    create_details = "Status check created successfully"
            else:
                create_details = f"Status: {response.status_code}, Response: {response.text}"
            
            self.log_test("Create Status Check", create_success, create_details)
            
            # Test getting status checks
            response = requests.get(f"{self.api_url}/status", timeout=10)
            get_success = response.status_code == 200
            
            if get_success:
                data = response.json()
                get_details = f"Retrieved {len(data)} status checks"
            else:
                get_details = f"Status: {response.status_code}, Response: {response.text}"
            
            self.log_test("Get Status Checks", get_success, get_details)
            
            return create_success and get_success
            
        except Exception as e:
            self.log_test("Status Endpoints", False, str(e))
            return False

    def test_cors_headers(self):
        """Test CORS headers are present"""
        try:
            response = requests.options(f"{self.api_url}/leads", timeout=10)
            headers = response.headers
            
            cors_headers = [
                'Access-Control-Allow-Origin',
                'Access-Control-Allow-Methods',
                'Access-Control-Allow-Headers'
            ]
            
            present_headers = [header for header in cors_headers if header in headers]
            success = len(present_headers) >= 1  # At least one CORS header should be present
            details = f"CORS headers present: {present_headers}"
            
            self.log_test("CORS Headers", success, details)
            return success
            
        except Exception as e:
            self.log_test("CORS Headers", False, str(e))
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Digiactiva Backend API Tests")
        print("=" * 50)
        
        # Test API connectivity first
        if not self.test_api_root():
            print("❌ API is not accessible. Stopping tests.")
            return False
        
        # Run all tests
        self.test_create_lead()
        self.test_get_leads()
        self.test_lead_validation()
        self.test_status_endpoints()
        self.test_cors_headers()
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

def main():
    tester = DigiactivaAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    results = {
        "timestamp": datetime.now().isoformat(),
        "total_tests": tester.tests_run,
        "passed_tests": tester.tests_passed,
        "success_rate": f"{(tester.tests_passed/tester.tests_run)*100:.1f}%" if tester.tests_run > 0 else "0%",
        "test_details": tester.test_results
    }
    
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())