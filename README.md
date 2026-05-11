# Owambe.com — Event Management Platform

Nigeria's AI-powered event management SaaS. Built with Next.js, Node.js, PostgreSQL, Paystack and OpenAI.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Cache | Redis |
| Payments | Paystack (Nigerian gateway) |
| AI | OpenAI GPT-4o |
| Storage | AWS S3 (af-south-1) |
| Email | SendGrid |
| SMS | Twilio |
| Auth | JWT + Refresh tokens + OAuth2 |
| Real-time | Socket.io |
| Hosting | Vercel (web) + Railway (API) |
| CI/CD | GitHub Actions |

---

## Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ with PostGIS extension
- Redis 7+

### 1. Clone & Install
```bash
git clone https://github.com/mottainaisurvey/owambe.git
cd owambe
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your actual credentials
```

### 3. Database Setup
```bash
# Start PostgreSQL and enable PostGIS
psql -U postgres -c "CREATE DATABASE owambe;"
psql -U postgres -d owambe -c "CREATE EXTENSION postgis; CREATE EXTENSION uuid-ossp;"

# Run migrations
npm run db:migrate

# Seed with Lagos test data
npm run db:seed
```

### 4. Run Development Servers
```bash
npm run dev
# Web: http://localhost:3000
# API: http://localhost:4000
```

---

## Test Credentials (after seed)

| Role | Email | Password |
|---|---|---|
| Admin | admin@owambe.com | Admin@Owambe2026! |
| Planner | planner@test.com | Planner123! |

---

## Project Structure

```
owambe/
├── apps/
│   ├── api/                    # Express REST API
│   │   ├── prisma/
│   │   │   └── schema.prisma   # Database schema (24 tables)
│   │   └── src/
│   │       ├── controllers/    # Request handlers
│   │       ├── routes/         # Express routers
│   │       ├── services/       # Business logic
│   │       │   ├── ai.service.ts         # GPT-4o integration
│   │       │   ├── paystack.service.ts   # Payment processing
│   │       │   ├── email.service.ts      # SendGrid emails
│   │       │   └── upload.service.ts     # S3 image upload
│   │       ├── middleware/     # Auth, validation, errors
│   │       ├── database/       # Prisma client + seed
│   │       ├── utils/          # Helpers
│   │       └── socket.ts       # Real-time events
│   └── web/                    # Next.js frontend
│       └── src/
│           ├── app/
│           │   ├── dashboard/  # All 13 planner screens
│           │   ├── login/      # Auth pages
│           │   └── layout.tsx  # Root layout
│           ├── components/     # Shared UI components
│           ├── lib/
│           │   ├── api.ts      # Axios client + all API calls
│           │   └── utils.ts    # Formatters, helpers
│           └── store/
│               └── auth.store.ts  # Zustand auth state
├── .github/
│   └── workflows/
│       └── ci-cd.yml           # GitHub Actions pipeline
├── railway.json                # API deployment config
├── vercel.json                 # Web deployment config
└── .env.example                # All required env vars
```

---

## API Endpoints

### Auth
| Method | Route | Description |
|---|---|---|
| POST | /api/auth/register | Register planner, vendor, or consumer |
| POST | /api/auth/login | Login and receive JWT |
| POST | /api/auth/logout | Invalidate refresh token |
| POST | /api/auth/refresh | Rotate access token |
| GET | /api/auth/me | Get current user profile |

### Events
| Method | Route | Description |
|---|---|---|
| POST | /api/events | Create new event |
| GET | /api/events | List planner's events |
| GET | /api/events/:id | Get event details |
| PUT | /api/events/:id | Update event |
| POST | /api/events/:id/publish | Publish event live |
| GET | /api/events/public/:slug | Public event page |
| POST | /api/events/public/:slug/register | Register attendee |

### Vendors
| Method | Route | Description |
|---|---|---|
| GET | /api/vendors/search | Geo-search vendors |
| GET | /api/vendors/profile/:slug | Public vendor profile |
| POST | /api/vendors/me | Create vendor profile |
| PUT | /api/vendors/me/availability | Set availability calendar |
| POST | /api/vendors/me/bank-account | Connect Paystack subaccount |

### Bookings
| Method | Route | Description |
|---|---|---|
| POST | /api/bookings/instant | Instant book a vendor |
| POST | /api/bookings/rfq | Submit RFQ to venue |
| POST | /api/bookings/:id/confirm | Vendor confirms booking |
| POST | /api/bookings/:id/quote | Vendor submits quote |

### Payments
| Method | Route | Description |
|---|---|---|
| POST | /api/payments/webhook/paystack | Paystack webhook (deposit/balance) |
| POST | /api/payments/balance/:bookingId | Initialize balance payment |

### Mode
| Method | Route | Description |
|---|---|---|
| GET | /api/mode | Get current user's active mode and available modes |
| POST | /api/mode/switch | Switch active mode (must be in availableModes) |
| POST | /api/mode/unlock | Unlock modes using a cohort code |

**POST /api/mode/unlock — error responses**

All error responses carry `{ success: false, error: "<human-readable message>", errorCode: "<machine-readable code>" }`.

| HTTP Status | `errorCode` | Meaning |
|---|---|---|
| 400 | — | `code` field missing or not a string |
| 404 | `COHORT_CODE_INVALID` | Code does not exist in the database |
| 409 | `COHORT_CODE_EXHAUSTED` | Code has reached its maximum redemption count (already used) |
| 410 | `COHORT_CODE_INACTIVE` | Code was administratively deactivated |
| 410 | `COHORT_CODE_EXPIRED` | Code has passed its expiry date |

### AI
| Method | Route | Description |
|---|---|---|
| POST | /api/ai/event-copy | Generate event name + description |
| POST | /api/ai/plan/intake | Extract event details from natural language |
| POST | /api/ai/plan/generate | Generate 3 vendor packages within budget |

---

## Deployment

### API → Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link [project-id]
railway up
```

Set these environment variables in Railway dashboard:
- DATABASE_URL (PostgreSQL addon)
- REDIS_URL (Redis addon)
- JWT_SECRET
- PAYSTACK_SECRET_KEY
- PAYSTACK_WEBHOOK_SECRET
- OPENAI_API_KEY
- AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_S3_BUCKET
- SENDGRID_API_KEY

### Web → Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Set these in Vercel project settings:
- NEXT_PUBLIC_API_URL=https://api.owambe.com
- NEXT_PUBLIC_APP_URL=https://owambe.com

### Paystack Webhook
Set your webhook URL in Paystack dashboard:
```
https://api.owambe.com/api/payments/webhook/paystack
```
Events to enable: `charge.success`, `transfer.success`, `refund.processed`

---

## Key Business Rules

1. **Vendor commission**: Deducted at payout, not at charge time
2. **Escrow**: 30% deposit charged at booking. Balance released 24h after event date
3. **Launch bonus**: New vendors pay 0% commission for first 90 days
4. **Vendor search scoring**: `0.4 * distance + 0.3 * rating + 0.2 * response_rate + 0.1 * bookings`
5. **RFQ flow**: Planner sends brief → Vendor quotes → Planner accepts → Deposit charged
6. **Instant book**: Vendor must have `isInstantBook = true` and `paystackSubAccountCode` set

---

## Phase Completion Status

- [x] Phase 0 — Foundation (schema, env, project structure)
- [x] Phase 1 — Core Backend (auth, events, vendors, bookings, Paystack, AI)
- [x] Phase 2 — Planner Dashboard (all 13 screens)
- [ ] Phase 3 — Vendor Dashboard (onboarding, bookings, availability)
- [ ] Phase 4 — B2C AI App (mobile + web conversational planner)
- [ ] Phase 5 — Admin Dashboard
- [ ] Phase 6 — QA + Security + Load testing
- [ ] Phase 7 — Launch (Lagos) → Scale

---

Built by the Owambe team · Lagos, Nigeria 🇳🇬
