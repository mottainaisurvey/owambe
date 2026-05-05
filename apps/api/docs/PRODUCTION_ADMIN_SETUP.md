# Production Admin Account Creation

## Overview

The Owambe seed script (`src/database/seed.ts`) is **blocked in production** (`NODE_ENV=production`). Production admin accounts must be created manually by the founder or designated technical lead. This document describes the process.

## Why Manual Creation?

Seeded admin credentials in source control create three security risks:

1. **Credential exposure** — anyone with repository access (current or future engineers, contractors, AI-assisted tools, build systems) can read the password.
2. **Predictable patterns** — seed passwords follow discoverable patterns; production passwords must be cryptographically random.
3. **Weak test accounts** — test accounts (e.g., `planner@test.com / Planner123!`) must never exist in production.

## Prerequisites

- Access to the production Railway environment variables panel.
- A password manager (1Password, Bitwarden, or equivalent) to generate and store the password.
- The production API base URL: `https://owambe-api-production.up.railway.app`

## Step 1 — Generate a Strong Password

Use your password manager to generate a random password with the following constraints:

- **Length:** 24+ characters
- **Character set:** uppercase, lowercase, digits, symbols
- **No dictionary words**

Example generation (do not use this exact password):
```
K#9mPqR2vX7nLwE4hJdF6sBt
```

Store the password in your password manager under `Owambe Production Admin`.

## Step 2 — Create the Admin Account via API

Call the registration endpoint directly against production:

```bash
curl -s -X POST https://owambe-api-production.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-real-email@yourdomain.com",
    "password": "<your-generated-password>",
    "firstName": "Your",
    "lastName": "Name",
    "role": "PLANNER"
  }'
```

> **Note:** The registration endpoint creates a `PLANNER` role by default. The role must be elevated to `ADMIN` in Step 3.

## Step 3 — Elevate Role to ADMIN

Connect to the production database using the Railway database proxy or a one-time migration script, and run:

```sql
UPDATE users
SET role = 'ADMIN'
WHERE email = 'your-real-email@yourdomain.com';
```

Alternatively, if a temporary admin account already exists (e.g., from an earlier manual creation), use the admin API endpoint:

```bash
curl -s -X PATCH https://owambe-api-production.up.railway.app/api/admin/users/<user-id>/role \
  -H "Authorization: Bearer <existing-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"role": "ADMIN"}'
```

## Step 4 — Verify Login

```bash
curl -s -X POST https://owambe-api-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-real-email@yourdomain.com",
    "password": "<your-generated-password>"
  }'
```

A successful response returns `{"success": true, "accessToken": "..."}`.

## Step 5 — Remove Any Seeded Accounts

If the seed script was ever run in production (it should not have been, but verify), remove any seeded accounts:

```sql
-- Check for seeded accounts
SELECT id, email, role, created_at FROM users
WHERE email IN ('admin@owambe.com', 'planner@test.com')
   OR email LIKE '%@owambe-vendor.com';

-- Remove them if found
DELETE FROM users
WHERE email IN ('admin@owambe.com', 'planner@test.com')
   OR email LIKE '%@owambe-vendor.com';
```

## Credential Storage Policy

| Item | Storage Location | Access |
|---|---|---|
| Production admin email | Password manager | Founder + Technical Lead only |
| Production admin password | Password manager | Founder + Technical Lead only |
| Staging admin credentials | This repository (`seed.ts`) | Engineering team |
| Production DB connection string | Railway environment variables | Founder + Technical Lead only |

## Rotation Policy

Production admin passwords should be rotated:
- Immediately when any person with access leaves the team
- Every 6 months as a standard practice
- Immediately if a credential leak is suspected

## Handoff to Technical Lead (Hire 1)

When the first technical lead joins:

1. Share the production admin email and password via password manager (not Slack, email, or any plaintext channel).
2. Have them change the password immediately upon first login.
3. They should create their own admin account following this process and you should then remove the founder admin account.

---

*This document is part of the Owambe production operations runbook. Last updated: Phase A.5.*
