# AhorroFamiliar Auth Testing Playbook

## Step 1: Verify admin seeded
```bash
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@ahorrofamiliar.com","password":"***ELIMINADO***"}'
```

## Step 2: Register a test user
```bash
curl -s -X POST "$API_URL/api/auth/register" -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"Test123!","name":"Test User","cedula":"12345","phone":"555-1234"}'
```
Expected: status "pending"

## Step 3: Try login with pending user
```bash
curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"Test123!"}'
```
Expected: 403 error "Tu cuenta espera aprobacion del administrador"

## Step 4: Admin approves user
```bash
# First get admin token
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@ahorrofamiliar.com","password":"***ELIMINADO***"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
# Get pending users
curl -s "$API_URL/api/admin/pending-users" -H "Authorization: Bearer $TOKEN"
# Approve user (replace USER_ID)
curl -s -X POST "$API_URL/api/admin/users/USER_ID/approve" -H "Authorization: Bearer $TOKEN"
```

## Step 5: Test user can now login
```bash
curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"Test123!"}'
```
Expected: 200 with access_token
