# AhorroFamiliar - PRD (Product Requirements Document)

## Problem Statement
Build "AhorroFamiliar" - a family savings box (caja familiar) web application with Role-Based Access Control (RBAC) supporting Admin and Socio roles. Single login for all users with conditional UI rendering based on roles.

## Architecture
- **Backend**: FastAPI (Python) with MongoDB (motor async driver)
- **Frontend**: React 19 with Tailwind CSS + Shadcn/ui components
- **Auth**: JWT (Bearer tokens) + bcrypt password hashing
- **Storage**: Base64 in MongoDB for receipt images (Cloudinary integration ready for production)
- **i18n**: Spanish (default) + English toggle

## User Personas
1. **Admin (Administrador)**: Manages the family savings box. Approves/rejects user registrations, payments, and can change roles. Can also request loans like any member.
2. **Socio (Member)**: Family member who contributes savings, can request loans (voted by majority), and uploads payment receipts.

## Core Requirements
- Single login screen (email + password)
- Registration with automatic "pending" status → Admin manual approval
- Role-based conditional UI (Admin Dashboard vs Socio Dashboard)
- JWT authentication with bcrypt password encryption
- Brute force protection (5 attempts = 15 min lockout)
- Admin can: approve/reject users, approve/reject payments, change roles, reset passwords
- Socio can: view savings/debt summary, upload payment receipts, request loans
- Loan voting system: majority of active users must vote "for" to approve
- Spanish/English language toggle

## What's Been Implemented (April 13, 2026)
### MVP - Complete
- [x] JWT Auth (register, login, logout, me, refresh)
- [x] Admin seeding on startup
- [x] RBAC with conditional UI rendering
- [x] Registration with pending status + admin approval
- [x] Admin Dashboard (caja total, active loans, pending members, pending payments)
- [x] Admin Action Alerts (approve/reject payments and registrations)
- [x] Socio Dashboard (Tu Saldo, Deuda, Disponible)
- [x] Payment submission with receipt upload (Subir Comprobante)
- [x] Payment approval/rejection by admin
- [x] Loan request with purpose categories (vanidad, salud, educacion, emergencia, negocio, otro)
- [x] Loan voting system (A Favor / En Contra) with automatic majority approval/rejection
- [x] Members management (list, change roles, reset passwords)
- [x] Bottom navigation (Inicio, Socios, Prestamos, Seguros, Perfil)
- [x] Language toggle (Spanish ↔ English)
- [x] Profile page
- [x] Brute force login protection
- [x] Mobile-first responsive design matching mockup

## Prioritized Backlog
### P0 (Critical)
- None remaining

### P1 (High Priority)
- Cloudinary integration for receipt images (credentials needed from user)
- "Forgot password" via email (SendGrid/Resend integration)
- Insurance section (Seguros) - currently placeholder

### P2 (Medium Priority)
- Loan payment tracking (partial payments, interest calculation)
- Push notifications for new actions
- Financial reports/charts
- Export data to PDF/Excel

### P3 (Nice to Have)
- Biometric login (FaceID/fingerprint)
- Dark mode
- Multi-family support (multiple cajas)

## Next Tasks
1. User to provide Cloudinary credentials for image upload
2. Implement email-based password reset
3. Build Insurance (Seguros) module
4. Add financial charts/reports on dashboard
