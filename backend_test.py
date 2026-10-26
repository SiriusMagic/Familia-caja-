#!/usr/bin/env python3
"""
AhorroFamiliar Backend API Testing
Tests all authentication, admin, payment, and loan endpoints
"""

import os
import requests
import sys
import json
from datetime import datetime

class AhorroFamiliarAPITester:
    def __init__(self, base_url="https://family-safe-login.preview.emergentagent.com"):
        self.base_url = base_url
        self.admin_token = None
        self.user_token = None
        self.test_user_id = None
        self.test_payment_id = None
        self.test_loan_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
            self.failed_tests.append({"test": name, "error": details})

    def make_request(self, method, endpoint, data=None, token=None, files=None):
        """Make HTTP request with proper headers"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        if files:
            headers.pop('Content-Type', None)  # Let requests set multipart headers
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    response = requests.post(url, data=data, files=files, headers=headers)
                else:
                    response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            
            return response
        except Exception as e:
            return None

    def test_admin_login(self):
        """Test admin login"""
        print("\n🔐 Testing Admin Authentication...")
        
        response = self.make_request('POST', 'auth/login', {
            'email': os.environ.get('ADMIN_EMAIL', 'admin@ahorrofamiliar.com'),
            'password': os.environ.get('ADMIN_PASSWORD', '')
        })
        
        if response and response.status_code == 200:
            data = response.json()
            if 'access_token' in data and data.get('user', {}).get('role') == 'admin':
                self.admin_token = data['access_token']
                self.log_test("Admin login", True)
                return True
            else:
                self.log_test("Admin login", False, "Missing token or role")
        else:
            self.log_test("Admin login", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_user_registration(self):
        """Test user registration"""
        print("\n👤 Testing User Registration...")
        
        timestamp = datetime.now().strftime("%H%M%S")
        test_email = f"test{timestamp}@test.com"
        
        response = self.make_request('POST', 'auth/register', {
            'email': test_email,
            'password': 'Test123!',
            'name': f'Test User {timestamp}',
            'cedula': f'12345{timestamp}',
            'phone': '555-1234'
        })
        
        if response and response.status_code == 200:
            data = response.json()
            if data.get('status') == 'pending':
                self.test_user_email = test_email
                self.log_test("User registration", True)
                return True
            else:
                self.log_test("User registration", False, "Status not pending")
        else:
            self.log_test("User registration", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_pending_user_login(self):
        """Test login with pending user (should fail)"""
        print("\n🚫 Testing Pending User Login...")
        
        response = self.make_request('POST', 'auth/login', {
            'email': self.test_user_email,
            'password': 'Test123!'
        })
        
        if response and response.status_code == 403:
            data = response.json()
            if 'aprobacion' in data.get('detail', '').lower():
                self.log_test("Pending user login blocked", True)
                return True
            else:
                self.log_test("Pending user login blocked", False, "Wrong error message")
        else:
            self.log_test("Pending user login blocked", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_admin_dashboard(self):
        """Test admin dashboard"""
        print("\n📊 Testing Admin Dashboard...")
        
        response = self.make_request('GET', 'admin/dashboard', token=self.admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            required_fields = ['caja_total', 'prestamos_activos', 'socios_pendientes', 'total_socios']
            if all(field in data for field in required_fields):
                self.log_test("Admin dashboard", True)
                return True
            else:
                self.log_test("Admin dashboard", False, "Missing required fields")
        else:
            self.log_test("Admin dashboard", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_pending_users_list(self):
        """Test getting pending users"""
        print("\n📋 Testing Pending Users List...")
        
        response = self.make_request('GET', 'admin/pending-users', token=self.admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                # Find our test user
                for user in data:
                    if user.get('email') == self.test_user_email:
                        self.test_user_id = user['_id']
                        break
                self.log_test("Pending users list", True)
                return True
            else:
                self.log_test("Pending users list", False, "Response not a list")
        else:
            self.log_test("Pending users list", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_approve_user(self):
        """Test approving a user"""
        print("\n✅ Testing User Approval...")
        
        if not self.test_user_id:
            self.log_test("User approval", False, "No test user ID")
            return False
        
        response = self.make_request('POST', f'admin/users/{self.test_user_id}/approve', token=self.admin_token)
        
        if response and response.status_code == 200:
            self.log_test("User approval", True)
            return True
        else:
            self.log_test("User approval", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_approved_user_login(self):
        """Test login with approved user"""
        print("\n🔓 Testing Approved User Login...")
        
        response = self.make_request('POST', 'auth/login', {
            'email': self.test_user_email,
            'password': 'Test123!'
        })
        
        if response and response.status_code == 200:
            data = response.json()
            if 'access_token' in data and data.get('user', {}).get('role') == 'socio':
                self.user_token = data['access_token']
                self.log_test("Approved user login", True)
                return True
            else:
                self.log_test("Approved user login", False, "Missing token or wrong role")
        else:
            self.log_test("Approved user login", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_user_summary(self):
        """Test user financial summary"""
        print("\n💰 Testing User Summary...")
        
        response = self.make_request('GET', 'users/me/summary', token=self.user_token)
        
        if response and response.status_code == 200:
            data = response.json()
            required_fields = ['savings', 'debt', 'available']
            if all(field in data for field in required_fields):
                self.log_test("User summary", True)
                return True
            else:
                self.log_test("User summary", False, "Missing required fields")
        else:
            self.log_test("User summary", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_create_payment(self):
        """Test creating a payment"""
        print("\n💳 Testing Payment Creation...")
        
        # Create form data for multipart request
        data = {
            'amount': '100.50',
            'type': 'ahorro',
            'note': 'Test payment'
        }
        
        response = self.make_request('POST', 'payments', data=data, token=self.user_token)
        
        if response and response.status_code == 200:
            data = response.json()
            if 'payment_id' in data:
                self.test_payment_id = data['payment_id']
                self.log_test("Payment creation", True)
                return True
            else:
                self.log_test("Payment creation", False, "No payment ID returned")
        else:
            self.log_test("Payment creation", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_pending_payments(self):
        """Test getting pending payments"""
        print("\n📋 Testing Pending Payments...")
        
        response = self.make_request('GET', 'admin/payments/pending', token=self.admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                self.log_test("Pending payments list", True)
                return True
            else:
                self.log_test("Pending payments list", False, "Response not a list")
        else:
            self.log_test("Pending payments list", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_approve_payment(self):
        """Test approving a payment"""
        print("\n✅ Testing Payment Approval...")
        
        if not self.test_payment_id:
            self.log_test("Payment approval", False, "No test payment ID")
            return False
        
        response = self.make_request('POST', f'payments/{self.test_payment_id}/approve', token=self.admin_token)
        
        if response and response.status_code == 200:
            self.log_test("Payment approval", True)
            return True
        else:
            self.log_test("Payment approval", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_create_loan(self):
        """Test creating a loan request"""
        print("\n🏦 Testing Loan Creation...")
        
        response = self.make_request('POST', 'loans', {
            'amount': 500.0,
            'purpose': 'salud',
            'description': 'Test loan for medical expenses'
        }, token=self.user_token)
        
        if response and response.status_code == 200:
            data = response.json()
            if 'loan_id' in data:
                self.test_loan_id = data['loan_id']
                self.log_test("Loan creation", True)
                return True
            else:
                self.log_test("Loan creation", False, "No loan ID returned")
        else:
            self.log_test("Loan creation", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_list_loans(self):
        """Test listing loans"""
        print("\n📋 Testing Loans List...")
        
        response = self.make_request('GET', 'loans', token=self.user_token)
        
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                self.log_test("Loans list", True)
                return True
            else:
                self.log_test("Loans list", False, "Response not a list")
        else:
            self.log_test("Loans list", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_members_list(self):
        """Test members list (admin only)"""
        print("\n👥 Testing Members List...")
        
        response = self.make_request('GET', 'users', token=self.admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                self.log_test("Members list", True)
                return True
            else:
                self.log_test("Members list", False, "Response not a list")
        else:
            self.log_test("Members list", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def test_logout(self):
        """Test logout"""
        print("\n🚪 Testing Logout...")
        
        response = self.make_request('POST', 'auth/logout', token=self.user_token)
        
        if response and response.status_code == 200:
            self.log_test("Logout", True)
            return True
        else:
            self.log_test("Logout", False, f"Status: {response.status_code if response else 'No response'}")
        return False

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting AhorroFamiliar Backend API Tests")
        print(f"🌐 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Authentication tests
        if not self.test_admin_login():
            print("❌ Admin login failed - stopping tests")
            return False
        
        # Registration and approval flow
        if self.test_user_registration():
            self.test_pending_user_login()
            if self.test_pending_users_list():
                if self.test_approve_user():
                    self.test_approved_user_login()
        
        # Admin dashboard
        self.test_admin_dashboard()
        
        # User functionality
        if self.user_token:
            self.test_user_summary()
            if self.test_create_payment():
                self.test_pending_payments()
                self.test_approve_payment()
            
            if self.test_create_loan():
                self.test_list_loans()
        
        # Admin functionality
        self.test_members_list()
        
        # Logout
        if self.user_token:
            self.test_logout()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for test in self.failed_tests:
                print(f"  - {test['test']}: {test['error']}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = AhorroFamiliarAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())