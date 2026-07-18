# Auth Platform - Tally CodeBrewers Hackathon

A secure, full-stack authentication platform that balances security, usability, and flexibility. Built to serve three personas equally: bank customers (security-focused), students (speed-focused), and startups (integration-focused).

## Features

### Core Authentication
- **Passwordless login** via WebAuthn/Passkeys - biometric authentication with hardware-backed security
- **TOTP fallback** - authenticator app support with QR code setup
- **Adaptive risk scoring** - real-time risk assessment for every login attempt
- **Session management** - secure JWT tokens with refresh rotation

### Approval Workflows
- **Configurable policies** - single approver, N-of-M quorum, weighted approvals
- **Cryptographic signatures** - non-repudiable approval records bound to exact action payloads
- **Escalation chains** - timeout-based handoff to backup approvers
- **Dispute resolution** - verifiable proof of every approval decision

### Resilience & Failover
- **Circuit breaker pattern** - automatic failover when providers fail
- **Kill switch controls** - manual override for simulating/handling outages
- **Multi-provider redundancy** - passkey → push → TOTP → SMS → email fallback chain
- **Health monitoring** - real-time system status dashboard

### Risk Engine
- **Multi-factor scoring** - device trust, IP reputation, time-based analysis
- **Graduated responses** - allow → notify → step-up → restrict → block
- **Plain-English explanations** - human-readable risk assessments
- **Audit logging** - hash-chained tamper-evident logs

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone and navigate to the project
cd auth-platform

# Install backend dependencies
cd backend
npm install

# Generate Prisma client and create database
npx prisma generate
npx prisma db push

# Seed the database with demo data
npm run db:seed

# Start the backend server
npm run dev
```

In a new terminal:

```bash
# Install frontend dependencies
cd frontend
npm install

# Start the frontend dev server
npm run dev
```

### Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Demo Credentials

All demo users use password: `demo123`

| User | Email | Role |
|------|-------|------|
| Alice | alice@example.com | Regular user |
| Bob | bob@example.com | Approver |
| Charlie | charlie@example.com | Approver |
| Admin | admin@example.com | Super approver |

### Approval Policies

| Policy | Action Type | Required Weight |
|--------|-------------|-----------------|
| Production Deploy | deploy_production | 2 (Bob+Charlie or Admin) |
| High-Value Transaction | approve_transaction | 3 (Admin alone) |
| Data Deletion | delete_data | 2 (Charlie+Admin or Admin) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│   Login screen · Passkey/TOTP UI · Approval inbox · Admin panel  │
└───────────────────────────┬───────────────────────────────────────┘
                             │ REST API
┌───────────────────────────▼───────────────────────────────────────┐
│                       BACKEND API (Node/Express)                  │
│                                                                     │
│  ┌───────────────┐  ┌────────────────┐  ┌───────────────────┐    │
│  │  AUTH SERVICE  │  │ APPROVAL SERVICE│  │  RISK SERVICE      │    │
│  │ - WebAuthn     │  │ - Policy engine  │  │ - Login scoring    │    │
│  │ - TOTP         │  │ - Quorum logic   │  │ - Anomaly detection │    │
│  │ - Sessions     │  │ - Signed records │  │ - Explanations      │    │
│  │ - Failover     │  │ - Escalation     │  │                     │    │
│  └───────────────┘  └────────────────┘  └───────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                             │
      ┌──────────────────────▼──────────────────────┐
      │              DATABASE (SQLite/Prisma)         │
      │  users · devices · sessions · passkeys ·      │
      │  approvals · risk_events · audit_logs         │
      └───────────────────────────────────────────────┘
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Password login
- `POST /api/auth/verify-totp` - Verify TOTP code
- `POST /api/auth/refresh` - Refresh tokens
- `GET /api/auth/me` - Get current user

### Passkeys
- `POST /api/passkey/register/options` - Get registration options
- `POST /api/passkey/register/verify` - Complete registration
- `POST /api/passkey/authenticate/options` - Get auth options
- `POST /api/passkey/authenticate/verify` - Complete authentication

### Approvals
- `POST /api/approval/request` - Create approval request
- `POST /api/approval/requests/:id/vote` - Submit vote
- `GET /api/approval/requests/:id/verify` - Verify proof
- `GET /api/approval/pending` - List pending approvals

### Risk Assessment
- `POST /api/risk/assess/login` - Assess login risk
- `POST /api/risk/assess/action` - Assess action risk
- `GET /api/risk/history` - Get risk event history

### Admin
- `GET /api/admin/system/status` - Get system status
- `POST /api/admin/killswitch/:provider/activate` - Activate kill switch
- `POST /api/admin/killswitch/:provider/deactivate` - Deactivate kill switch

## Demo Script

1. **Normal Passkey Login**: Register a passkey, then use it for fast passwordless login
2. **Sensitive Action Approval**: Request a production deploy, watch it require approvals
3. **Quorum Approval**: Second approver signs, action executes with proof
4. **Kill Switch Demo**: Simulate SMS outage, see automatic TOTP fallback
5. **Risk Assessment**: Login from "new device" to trigger risk warnings

## Security Design

### Threat Model (STRIDE)
- **Spoofing**: Mitigated by WebAuthn device attestation, cryptographic signatures
- **Tampering**: Hash-chained audit logs, signed approval payloads
- **Repudiation**: Non-repudiable signatures on all approvals
- **Information Disclosure**: Short-lived tokens, encrypted storage
- **Denial of Service**: Rate limiting, circuit breakers
- **Elevation of Privilege**: Role-based approvals, device trust verification

### Defense in Depth
1. Password hashing (bcrypt, 12 rounds)
2. WebAuthn for passwordless (hardware-backed keys)
3. TOTP as fallback (time-based, 30-second window)
4. Session tokens (JWT, 15-minute access, 7-day refresh)
5. Device fingerprinting and trust scoring
6. Risk-based authentication challenges

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Auth | @simplewebauthn/server, otplib |
| Database | SQLite, Prisma ORM |
| Resilience | opossum (circuit breaker) |
| Tokens | jsonwebtoken |

## Project Structure

```
auth-platform/
├── backend/
│   ├── src/
│   │   ├── services/       # Business logic
│   │   ├── routes/         # API endpoints
│   │   ├── middleware/     # Auth middleware
│   │   └── utils/          # Crypto, JWT helpers
│   └── prisma/
│       ├── schema.prisma   # Database schema
│       └── seed.js         # Demo data
├── frontend/
│   ├── src/
│   │   ├── pages/          # Route components
│   │   ├── components/     # Shared UI
│   │   ├── hooks/          # Custom hooks
│   │   ├── contexts/       # Auth state
│   │   └── utils/          # API client
│   └── public/
└── README.md
```

## What's Next

If we had more time:
- Threshold cryptography (Shamir's Secret Sharing)
- Behavioral biometrics (typing patterns)
- External hash anchoring for audit logs
- ML-based anomaly detection
- Push notification service integration
- OAuth2/OIDC provider mode

---

Built for Tally CodeBrewers Hackathon 2026
