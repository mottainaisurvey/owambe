# Owambe Platform — QA & Testing Handoff Document

**Version:** 1.0.6 | **Date:** April 9, 2026 | **Prepared by:** Engineering Team

---

## 1. Platform Overview

Owambe is a multi-sided event management platform for the Nigerian market. It connects **Event Planners**, **Vendors** (venues, caterers, photographers, etc.), and **Consumers** (ticket buyers and attendees). The platform ships as four distinct surfaces, all sharing a single API backend.

| Surface | Technology | Status |
| :--- | :--- | :--- |
| Web Application | Next.js 14 (App Router) | ✅ 43 pages — Ready for testing |
| Mobile Application | React Native / Expo (Android + iOS) | ✅ 24 screens — APK v1.0.6 available |
| White-label Portal | Next.js 14 | ✅ 5 pages — Ready for testing |
| API Backend | Node.js / Express + PostgreSQL | ✅ 22 routes, ~95 endpoints |

---

## 2. Environments & Access

### 2.1 Live URLs

| Environment | URL |
| :--- | :--- |
| API Backend | `https://owambe-api-production.up.railway.app/api` |
| Web App | Vercel deployment URL (confirm with DevOps) |
| White-label Portal | Vercel deployment URL — wildcard `*.owambe.com` |

### 2.2 Mobile APK

The Android APK for v1.0.6 is available for direct download and sideloading:

- **Direct Download:** https://expo.dev/artifacts/eas/tR8nTZZdn4p5suTG89ke3q.apk
- **EAS Build ID:** `e182bc30-4dd6-4e8c-adee-5c39465605b8`
- **EAS Logs:** https://expo.dev/accounts/owambeeventflow/projects/owambe/builds/e182bc30-4dd6-4e8c-adee-5c39465605b8

To install: enable "Install from unknown sources" on your Android device, download the APK, and tap to install.

---

## 3. Test Accounts

The database has been seeded with the following accounts. All accounts have verified email status and are ready to use immediately.

### 3.1 Core Accounts

| Role | Email | Password | Plan / Status |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@owambe.com` | `Admin@Owambe2026!` | Full platform access |
| **Planner** | `planner@test.com` | `Planner123!` | Growth Plan (AO Events Lagos) |

### 3.2 Vendor Accounts

All vendor accounts use the password `Vendor123!`. Vendor emails follow the pattern `[businessname]@owambe-vendor.com`.

| Vendor Name | Category | Email | Instant Book |
| :--- | :--- | :--- | :--- |
| Eko Hotel & Suites | Venue | `ekohotelsuites@owambe-vendor.com` | No |
| Balmoral Convention Center | Venue | `balmoralconventioncenter@owambe-vendor.com` | No |
| Mama Cass Catering | Catering | `mamacasscatering@owambe-vendor.com` | Yes |
| Spice Route Catering | Catering | `spiceroutecatering@owambe-vendor.com` | Yes |
| Clicks & Flicks Photography | Photography/Video | `clicksflicksphotography@owambe-vendor.com` | Yes |
| SoundWave AV Productions | AV Production | `soundwaveavproductions@owambe-vendor.com` | Yes |
| Petals & Blooms Décor | Décor & Florals | `petalsblomsdc@owambe-vendor.com` | Yes |
| Asa Entertainment | Entertainment | `asaentertainment@owambe-vendor.com` | No |
| Glow Up Studio | Makeup Artist | `glowupstudio@owambe-vendor.com` | Yes |
| Dr. Chidi Okeke | Speaker | `drchidiokeke@owambe-vendor.com` | No |

### 3.3 Sample Event (Pre-seeded)

A sample event is available for testing attendee and check-in flows:

- **Event Name:** Lagos Tech Summit 2026
- **URL Slug:** `lagos-tech-summit-2026`
- **Ticket Types:** General Admission (₦25,000), VIP Pass (₦75,000), Startup Founder (₦15,000)

---

## 4. Feature Coverage by Plan Tier

The platform enforces feature access based on the planner's subscription plan. Testers should verify that features are correctly gated.

| Feature | Starter | Growth | Scale |
| :--- | :---: | :---: | :---: |
| Events & Ticketing | ✅ | ✅ | ✅ |
| Vendor Bookings | ✅ | ✅ | ✅ |
| AI Event Planning | ✅ | ✅ | ✅ |
| Instalment Payments | ✅ | ✅ | ✅ |
| Email Campaigns | — | ✅ | ✅ |
| Contracts & E-Signature | — | ✅ | ✅ |
| Market Intelligence Analytics | — | ✅ | ✅ |
| White-label Portal | — | — | ✅ |
| CRM Sync (Salesforce/HubSpot) | — | — | ✅ |

*The test planner account (`planner@test.com`) is on the **Growth** plan. To test Scale-only features, the plan must be upgraded via the Admin panel or directly in the database.*

---

## 5. Test Cases by Surface

### 5.1 Authentication (All Platforms)

| # | Scenario | Steps | Expected Result |
| :--- | :--- | :--- | :--- |
| AUTH-01 | Register as a new Planner | Go to `/register`, fill in details, select role "Planner" | Account created, redirected to `/dashboard` |
| AUTH-02 | Register as a new Vendor | Go to `/register`, fill in details, select role "Vendor" | Account created, redirected to `/vendor` |
| AUTH-03 | Login as Planner | Go to `/login`, enter planner credentials | Redirected to `/dashboard` |
| AUTH-04 | Login as Vendor | Go to `/login`, enter vendor credentials | Redirected to `/vendor` |
| AUTH-05 | Login as Admin | Go to `/login`, enter admin credentials | Redirected to `/admin` |
| AUTH-06 | Forgot Password | Click "Forgot Password", enter email | Password reset email received |
| AUTH-07 | Mobile Login (Planner) | Open app, tap Login, enter planner credentials | App loads Planner tabs — **does not crash** |
| AUTH-08 | Mobile Login (Vendor) | Open app, tap Login, enter vendor credentials | App loads Vendor tabs |

### 5.2 Planner Dashboard (Web)

| # | Scenario | Steps | Expected Result |
| :--- | :--- | :--- | :--- |
| PLAN-01 | Create a new event | Navigate to `/dashboard/events/new`, fill all fields | Event saved as DRAFT, visible in events list |
| PLAN-02 | Publish an event | Open a DRAFT event, click "Publish" | Event status changes to PUBLISHED, visible on public `/events/[slug]` |
| PLAN-03 | Add ticket types | Open event, go to Tickets tab, add Free + Paid tickets | Tickets saved with correct prices and capacities |
| PLAN-04 | Add speakers | Navigate to `/dashboard/speakers`, add a speaker with bio and photo | Speaker appears in the list |
| PLAN-05 | Add sponsors | Navigate to `/dashboard/sponsors`, add a Bronze/Silver/Gold sponsor | Sponsor appears in the correct tier column |
| PLAN-06 | Set sponsorship goal | On Sponsors page, click "+ Set sponsorship goal", enter ₦5,000,000 | Goal bar appears and shows % achieved |
| PLAN-07 | View analytics | Navigate to `/dashboard/analytics` | Charts render with real data (ticket sales, revenue) |
| PLAN-08 | Send email campaign | Navigate to `/dashboard/emails`, create and send a campaign | Campaign queued, status updates to "Sent" |
| PLAN-09 | Create a contract | Navigate to `/dashboard/contracts/new`, select a template | Contract created with correct planner details |
| PLAN-10 | Send contract for e-sign | Open a contract, click "Send for Signature" | Signing link generated; vendor receives email |
| PLAN-11 | Manage instalment plan | Navigate to `/dashboard/instalments`, create a plan for a booking | Instalment schedule created with correct dates and amounts |
| PLAN-12 | AI event planning | Navigate to `/plan`, enter event details and click "Generate Plan" | AI returns a structured event plan with vendor suggestions |

### 5.3 Vendor Dashboard (Web)

| # | Scenario | Steps | Expected Result |
| :--- | :--- | :--- | :--- |
| VEN-01 | View overview | Login as vendor, navigate to `/vendor` | Dashboard shows upcoming bookings and earnings summary |
| VEN-02 | Update profile | Navigate to `/vendor/settings`, update bio and pricing | Changes saved and reflected on public profile |
| VEN-03 | Set availability | Navigate to `/vendor/availability`, block out dates | Blocked dates shown on calendar; unavailable for booking |
| VEN-04 | Receive booking request | Planner sends a booking request; vendor navigates to `/vendor/bookings` | Booking appears with PENDING status |
| VEN-05 | Send a quote | Open a PENDING booking, enter a quote amount | Quote sent to planner; booking status updates |
| VEN-06 | View market intelligence | Navigate to `/vendor/analytics` | Charts show market demand, competitor pricing, and trends |
| VEN-07 | Respond to a message | Navigate to `/vendor/messages`, reply to a planner message | Message delivered; thread updated |

### 5.4 Consumer Experience (Web & Mobile)

| # | Scenario | Steps | Expected Result |
| :--- | :--- | :--- | :--- |
| CON-01 | Browse vendors | Navigate to `/vendors`, apply category filter | Vendor cards filtered correctly |
| CON-02 | View vendor profile | Click a vendor card | Vendor detail page loads with portfolio, packages, and reviews |
| CON-03 | Browse public events | Navigate to `/events/lagos-tech-summit-2026` | Event page loads with ticket types and registration form |
| CON-04 | Purchase a ticket | Select a ticket type, click "Buy Ticket", complete Paystack checkout | Booking confirmed; confirmation email received |
| CON-05 | View ticket (Mobile) | Login on mobile app, navigate to Bookings tab | Purchased ticket visible with QR code |
| CON-06 | Use AI plan builder | Navigate to `/plan`, describe an event | AI generates a plan with budget breakdown and vendor suggestions |
| CON-07 | Save a plan | On the plan results page, click "Save Plan" | Plan saved and visible at `/plan/saved` |

### 5.5 Admin Panel (Web)

| # | Scenario | Steps | Expected Result |
| :--- | :--- | :--- | :--- |
| ADM-01 | View platform overview | Login as admin, navigate to `/admin` | Overview tab shows total users, revenue, and active events |
| ADM-02 | Review vendor queue | Navigate to the "Vendor Queue" tab | Pending vendors listed; approve/reject buttons functional |
| ADM-03 | Approve a vendor | Click "Approve" on a PENDING vendor | Vendor status changes to VERIFIED |
| ADM-04 | View disputes | Navigate to the "Disputes" tab | Real DISPUTED bookings fetched from API (not mock data) |
| ADM-05 | Issue a full refund | On a disputed booking, click "Full Refund" | Refund processed via Paystack; booking status updated |
| ADM-06 | Issue a partial refund | On a disputed booking, click "Partial Refund", enter amount | Partial refund processed; booking notes updated |
| ADM-07 | View user list | Navigate to the "Users" tab | All registered users listed with role and plan info |
| ADM-08 | View commission report | Navigate to the "Commission" tab | Commission earned per booking displayed correctly |

### 5.6 Mobile Application (Android APK v1.0.6)

| # | Scenario | Steps | Expected Result |
| :--- | :--- | :--- | :--- |
| MOB-01 | App launch | Open the app | Splash screen shows, then Welcome screen — **no crash** |
| MOB-02 | Planner login (critical) | Login with planner credentials | Planner tabs load correctly — **no crash** |
| MOB-03 | Browse events | Tap "Browse Events" on home tab | Public events list loads |
| MOB-04 | View event details | Tap on an event | Event detail screen with ticket types loads |
| MOB-05 | Browse vendors | Navigate to Vendors tab | Vendor list with category filters loads |
| MOB-06 | View vendor profile | Tap on a vendor | Vendor profile with packages and availability loads |
| MOB-07 | AI plan builder | Navigate to Plan tab | AI planning interface loads and accepts input |
| MOB-08 | View bookings | Navigate to Bookings tab | Planner's bookings listed with status badges |
| MOB-09 | QR Check-in (Planner) | Navigate to Check-in screen | Camera opens and scans QR codes |
| MOB-10 | Day-of tools | Navigate to Day-of screen | Day-of event management tools load |
| MOB-11 | Vendor overview | Login as vendor, view home tab | Vendor dashboard with earnings and bookings |
| MOB-12 | Vendor calendar | Navigate to Calendar tab | Availability calendar renders correctly |

### 5.7 White-label Portal

| # | Scenario | Steps | Expected Result |
| :--- | :--- | :--- | :--- |
| WL-01 | Access portal | Navigate to a tenant subdomain (e.g., `aoevents.owambe.com`) | Portal loads with tenant branding |
| WL-02 | View events list | On the home page | Tenant's published events listed |
| WL-03 | View event details | Click on an event | Event detail page with registration form loads |
| WL-04 | Register for event | Complete the registration form | Booking confirmed; redirected to ticket confirmation page |
| WL-05 | Ticket confirmation | After registration | Ticket reference, attendee details, and QR code displayed |
| WL-06 | View speakers | Navigate to `/speakers` | Speakers from all tenant events listed |
| WL-07 | View about page | Navigate to `/about` | Organiser info, stats, and contact details displayed |

---

## 6. Payment Testing (Paystack Test Mode)

All payment flows use Paystack in **Test Mode**. Use the following test card details:

| Field | Value |
| :--- | :--- |
| Card Number | `4084 0840 8408 4081` |
| Expiry | Any future date (e.g., `12/28`) |
| CVV | `408` |
| PIN | `0000` |
| OTP | `123456` |

For bank transfer testing, use Paystack's test bank details available in the Paystack dashboard.

---

## 7. API Endpoint Reference

The following table summarises the 22 API route modules for backend testing. All routes are prefixed with `/api`.

| Route Module | Key Endpoints |
| :--- | :--- |
| `/auth` | `POST /register`, `POST /login`, `POST /logout`, `GET /me`, `POST /forgot-password`, `POST /reset-password/:token` |
| `/events` | `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `GET /public/:slug` |
| `/vendors` | `GET /`, `GET /:slug`, `POST /`, `PUT /:id`, `GET /categories` |
| `/bookings` | `GET /`, `POST /`, `GET /:id`, `PUT /:id/status`, `POST /:id/quote` |
| `/payments` | `POST /initialize`, `GET /verify/:ref`, `POST /refund` |
| `/tickets` | `GET /event/:eventId`, `POST /`, `GET /:ref/validate` |
| `/attendees` | `GET /event/:eventId`, `POST /check-in`, `GET /stats` |
| `/contracts` | `GET /`, `POST /`, `GET /:id`, `POST /:id/send`, `GET /sign/:token`, `POST /sign/:token` |
| `/instalments` | `GET /`, `POST /`, `GET /:id`, `POST /cron/charge-due` |
| `/emails` | `GET /campaigns`, `POST /campaigns`, `POST /campaigns/:id/send` |
| `/ai` | `POST /plan`, `POST /generate-copy`, `POST /vendor-bio` |
| `/admin` | `GET /stats`, `GET /vendors`, `PUT /vendors/:id/status`, `GET /bookings`, `POST /bookings/:id/refund` |
| `/analytics` | `GET /overview`, `GET /revenue`, `GET /attendees`, `GET /vendors` |
| `/crm` | `POST /connect`, `GET /status`, `POST /sync` |
| `/tenants` | `GET /`, `POST /`, `GET /:domain`, `PUT /:id` |
| `/notifications` | `GET /`, `PUT /:id/read`, `PUT /read-all` |
| `/messages` | `GET /threads`, `POST /`, `GET /threads/:id` |
| `/speakers` | `GET /event/:eventId`, `POST /event/:eventId`, `PUT /:id`, `DELETE /:id` |
| `/sponsors` | `GET /event/:eventId`, `POST /event/:eventId`, `PUT /:id`, `DELETE /:id` |
| `/promos` | `GET /`, `POST /`, `POST /validate` |
| `/waitlist` | `GET /event/:eventId`, `POST /`, `POST /:id/notify` |
| `/upload` | `POST /image`, `POST /pdf` |

---

## 8. Fixes Verified in v1.0.6

The following items were resolved in this build and **must be explicitly verified** by the QA team:

1. **Mobile App Launch Crash (Critical):** The app previously crashed immediately after a Planner logged in, caused by two orphaned `Stack.Screen` registrations (`plan` and `payment`) in the root navigation layout. These have been removed. Verify by logging in as a Planner on the mobile app — the app must load without crashing.

2. **Admin Disputes — Real Data:** The Disputes tab in the Admin Panel previously displayed hardcoded mock data. It now fetches live `DISPUTED` bookings from the API. Verify by navigating to the Admin Disputes tab and confirming the data is live and the refund buttons trigger API calls.

3. **Sponsorship Goal — Editable:** The Sponsors page previously calculated the goal as `totalRaised × 1.35` (a nonsensical mock). It is now a user-editable field. Verify by clicking "+ Set sponsorship goal" on the Sponsors page and entering a custom amount.

4. **White-label Pages — Complete:** The white-label portal previously had only 2 pages. Three new pages have been added: Ticket Confirmation (`/ticket/[ref]`), Speakers (`/speakers`), and About (`/about`). Verify all 5 pages render correctly.

---

## 9. Bug Reporting Protocol

Log all bugs in the project management tool. Each report must include:

- **Surface:** Web / Mobile Android / Mobile iOS / API
- **Test Case ID:** (e.g., PLAN-05)
- **Severity:** Critical / High / Medium / Low
- **Steps to Reproduce:** Numbered, clear steps starting from a logged-out state
- **Expected Behaviour:** What should have happened
- **Actual Behaviour:** What actually happened
- **Evidence:** Screenshots or screen recordings are mandatory for UI issues

**Severity Definitions:**

| Severity | Definition |
| :--- | :--- |
| **Critical** | App crash, data loss, payment failure, or security vulnerability |
| **High** | Core feature broken, blocking user journey |
| **Medium** | Feature works but with incorrect data or poor UX |
| **Low** | Visual/cosmetic issue, minor copy error |

---

## 10. Out-of-Scope for This Testing Cycle

The following items are **not in scope** for the current testing cycle and should not be raised as bugs:

- iOS build (TestFlight setup pending)
- Google OAuth login (requires production domain configuration)
- CRM sync with live Salesforce/HubSpot credentials (requires Scale-tier account and OAuth tokens)
- Push notifications (requires FCM configuration in production environment)
