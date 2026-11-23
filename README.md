# 🚀 SAHAYAK B2B — AI-Powered B2B Trading Platform

> **Smart Business. Better Connections. Stronger Trade.**

An intelligent B2B commerce platform connecting verified retailers, wholesalers, manufacturers, and logistics partners through AI-driven product discovery, autonomous price negotiation (KAEN Engine), and transparent trade intelligence.

---

## 📋 Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Role-Based Portals](#role-based-portals)
- [Demo Mode](#demo-mode)
- [API Reference](#api-reference)
- [Google OAuth Setup](#google-oauth-setup)
- [Gemini AI Setup](#gemini-ai-setup)

---

## Architecture

```
sahayak-b2b/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── server.js           # Main API: Auth, RBAC, Admin, Notifications
│   │   ├── auth/
│   │   │   └── authService.js  # Argon2id hashing, Google OAuth, session tokens
│   │   ├── ai/
│   │   │   └── geminiProvider.js  # Gemini 2.5 Flash — role-aware B2B AI
│   │   └── kaen/
│   │       └── negotiationEngine.js  # KAEN automated negotiation engine
│   └── prisma/
│       └── schema.prisma       # PostgreSQL schema (Users, Sessions, Business Profiles, etc.)
│
└── frontend/                   # Vite + Vanilla JS SPA
    ├── index.html              # Entry point
    ├── vite.config.js          # Proxy: /api → localhost:4000
    └── src/
        ├── main.js             # App bootstrap: router, auth guard, session restore
        ├── router.js           # Hash-based client-side router
        ├── store.js            # Reactive state store + demo users
        ├── api.js              # REST API client (with demo data fallbacks)
        ├── styles/
        │   ├── design-system.css   # CSS tokens, purple/white theme
        │   ├── components.css      # UI component library
        │   └── animations.css      # Keyframes & layout
        ├── components/
        │   ├── sidebar.js          # Role-aware navigation sidebar
        │   ├── ai-copilot.js       # Gemini AI assistant panel
        │   ├── kaen-room.js        # KAEN negotiation room UI
        │   └── toast.js            # Toast notifications
        └── pages/
            ├── welcome.js          # Landing page
            ├── login.js            # Auth: login + demo shortcuts
            ├── role-select.js      # Account type selection
            ├── register.js         # Role-specific registration forms
            ├── pending.js          # Verification pending status
            ├── forgot-password.js  # Password reset flow
            └── dashboard/
                ├── retailer.js     # Retailer portal
                ├── wholesaler.js   # Wholesaler/Seller portal
                ├── manufacturer.js # Manufacturer portal
                ├── logistics.js    # Logistics partner portal
                └── admin.js        # Super Admin panel
```

**Tech Stack:**
- **Frontend**: Vite 5, Vanilla JS (ES Modules), CSS Custom Properties
- **Backend**: Node.js 20+, Express 4, Prisma ORM
- **Database**: PostgreSQL 15+
- **AI**: Google Gemini 2.5 Flash (`@google/genai`)
- **Auth**: Argon2id password hashing, HttpOnly session cookies, Google OAuth 2.0
- **Negotiation**: KAEN Engine (1.35-power concession curves)

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- A Google Cloud project (for Google OAuth + Gemini API)

### 1. Clone & Install

```bash
# Install both backend and frontend dependencies
npm run install:all
```

Or manually:
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your values (see Environment Setup below)
```

### 3. Set Up Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations (creates all tables)
npm run db:migrate
```

### 4. Start Development Servers

**Terminal 1 — Backend API (port 4000):**
```bash
npm run dev:backend
```

**Terminal 2 — Frontend (port 5173):**
```bash
npm run dev:frontend
```

Open: **http://localhost:5173**

---

## Environment Setup

Edit `backend/.env`:

```env
# PostgreSQL Connection
DATABASE_URL="postgresql://sahayak_user:your_password@localhost:5432/sahayak_b2b?schema=public"

# Server
PORT=4000
NODE_ENV="development"
FRONTEND_ORIGIN="http://localhost:5173"
SESSION_SECRET="generate-with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
SESSION_TTL_HOURS=24

# Google OAuth 2.0
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:4000/api/auth/google/callback"

# Gemini AI
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
GEMINI_RATE_LIMIT_PER_MIN=30
```

---

## Database Setup

### Create PostgreSQL Database

```sql
CREATE USER sahayak_user WITH PASSWORD 'your_password';
CREATE DATABASE sahayak_b2b OWNER sahayak_user;
GRANT ALL PRIVILEGES ON DATABASE sahayak_b2b TO sahayak_user;
```

### Run Migrations

```bash
cd backend
npx prisma migrate dev --name init
```

### Create First Admin Account

After migration, create a Super Admin user directly in the database:

```sql
INSERT INTO "User" (id, email, "fullName", "passwordHash", role, status, "emailVerified", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'admin@sahayak.in',
  'Platform Admin',
  -- Generate hash with: node -e "const a = require('argon2'); a.hash('yourpassword').then(h => console.log(h));"
  '$argon2id$v=19$m=65536,t=3,p=1$...',
  'SUPER_ADMIN',
  'ACTIVE',
  true,
  NOW(),
  NOW()
);
```

> **Note**: Admin accounts cannot be registered via the public UI. They must be created directly in the database or by an existing Super Admin.

---

## Running the Application

### Development

```bash
# Backend (with file watching)
cd backend && npm run dev        # → http://localhost:4000

# Frontend (Vite HMR)
cd frontend && npm run dev       # → http://localhost:5173
```

### Production Build

```bash
cd frontend && npm run build     # Outputs to frontend/dist/
```

Serve `frontend/dist/` from any static host (Nginx, Vercel, Netlify, etc.). Set backend URL in env.

---

## Role-Based Portals

| Role | Portal | Key Features |
|------|--------|--------------|
| **Retailer / Buyer** | `/dashboard` | AI market intel, supplier discovery, KAEN negotiation, RFQ management |
| **Wholesaler / Seller** | `/dashboard` | Catalogue management, buyer enquiries, quotations, revenue analytics |
| **Manufacturer** | `/dashboard` | Production capacity, bulk orders, distributor network, supply agreements |
| **Logistics Partner** | `/dashboard` | Shipment tracking, delivery assignments, proof of delivery |
| **Admin** | `/dashboard` | User management, verification queue, audit logs, platform analytics |

---

## Demo Mode

The app automatically enters **Demo Mode** when the backend is unavailable.

**1-Click Demo Login** (available on the login page):

| Role | Demo User |
|------|-----------|
| 🛒 Retailer | Arjun Rao — Sri Balaji Textiles, Vijayawada |
| 📦 Wholesaler | Priya Krishnan — Krishna Wholesale, Hyderabad |
| 🏭 Manufacturer | Ravi Sharma — Green Horticulture Pvt Ltd, Pune |
| 🚚 Logistics | Anjali Nair — Fast Freight Solutions, Kochi |
| 🔐 Admin | Platform Admin — Super Admin |

Demo data is clearly labelled and never presented as production data.

---

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new business account |
| `POST` | `/api/auth/login` | Email + password login |
| `POST` | `/api/auth/logout` | Invalidate session |
| `GET`  | `/api/me` | Get current authenticated user |
| `POST` | `/api/auth/forgot-password` | Request password reset email |
| `POST` | `/api/auth/reset-password` | Complete password reset |
| `GET`  | `/api/auth/google/redirect` | Initiate Google OAuth flow |
| `GET`  | `/api/auth/google/callback` | Google OAuth callback |
| `POST` | `/api/auth/google` | Verify Google ID token (SPA flow) |

### AI & KAEN

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ai/chat` | Gemini AI business assistant |
| `POST` | `/api/kaen/negotiate` | KAEN negotiation round evaluation |

### Admin (requires admin role)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/admin/stats` | Platform statistics |
| `GET`  | `/api/admin/users` | User management list |
| `PATCH`| `/api/admin/users/:id/status` | Update user status |
| `GET`  | `/api/admin/verifications` | Pending verification queue |
| `POST` | `/api/admin/verifications/:id/approve` | Approve business |
| `POST` | `/api/admin/verifications/:id/reject` | Reject business |
| `GET`  | `/api/admin/audit-logs` | Tamper-evident audit log |

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/notifications` | Get user notifications |
| `POST` | `/api/notifications/:id/read` | Mark as read |
| `POST` | `/api/notifications/read-all` | Mark all as read |

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google+ API** and **Google Identity API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   - `http://localhost:4000/api/auth/google/callback` (development)
   - `https://yourdomain.com/api/auth/google/callback` (production)
7. Copy the **Client ID** and **Client Secret** into `backend/.env`

---

## Gemini AI Setup

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create an API key
3. Set `GEMINI_API_KEY` in `backend/.env`
4. The model is configured as `gemini-2.5-flash` (can be changed via `GEMINI_MODEL`)

The AI assistant is role-aware — it tailors responses for retailers, wholesalers, manufacturers, logistics partners, and admins respectively.

---

## Security

- **Passwords**: Argon2id with 64MB memory cost, 3 iterations
- **Sessions**: HttpOnly cookies, SHA-256 hashed token storage
- **RBAC**: Permission checks on every protected endpoint
- **Admin**: Cannot be created via public registration — database only
- **Rate limiting**: Auth routes (30/15min), AI (30/min), forgot-password (5/hour)
- **Audit logs**: Chained SHA-256 hashes for tamper evidence
- **Google OAuth**: ID token verified server-side via `google-auth-library`

---

## License

Private — SAHAYAK B2B Platform. All rights reserved.
