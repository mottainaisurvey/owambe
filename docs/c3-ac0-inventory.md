# OWB-C3 AC-0 Verify-First Inventory

## AC-0.1 Working Copy
- Branch: staging, HEAD: 2130026 (post-C2 AC-5 smoke docs)
- C2 closure commit 03cf5ac confirmed in history
- Working tree: clean

## AC-0.2 Consumer Conventions
- Consumer pages exist at: /stays, /events/[slug], /vendors/[slug], /plan
- NO /experiences consumer page exists yet — must be created
- Auth convention: AUTHENTICATED. Stays uses `router.use(authenticate)` on all booking routes. The stays consumer page shows "Sign in to continue" for unauthenticated users. Events consumer page fetches public event data server-side but registration form requires auth.
- Consumer entry point pattern: top-level route (e.g., /experiences) with a client component
- Payment callback: /payment/callback/page.tsx exists (shared)

## AC-0.3 ExperienceBooking Model (FOUND)
Fields: id, reference (unique), experienceId, slotId, guestUserId, guestId, guestName, guestEmail, guestPhone, guestCount (default 1), totalAmount, currency (default NGN), status (ExperienceBookingStatus, default PENDING), paymentStatus (PaymentStatus, default PENDING), paystackRef, specialRequests, cancellationReason, cancelledAt, confirmedAt, completedAt
Channel fields: channelOrigin, channelId, externalRef, externalExperienceId, channelCommissionAmount, channelCommissionPercent, netToOperator, paystackReference, numberOfParticipants, participantNames, pickupRequested, pickupAddress, depositAmount (default 0)
createdAt, updatedAt

ExperienceBookingStatus enum: PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW, REFUNDED
PaymentStatus enum: PENDING, DEPOSIT_PAID, PARTIALLY_PAID, PAID, PARTIALLY_REFUNDED, REFUNDED, FAILED

GAPS FOUND:
- No `confirmedAt` population in the booking creation handler
- No Paystack initialization in the existing booking creation handler (CRITICAL GAP — must add)
- bookedCount increment uses `prisma.$transaction([create, update])` — NOT atomic conditional update (C3-c concurrency decision needed)
- No publication condition check (isActive && isApproved) in the booking creation handler
- No meetingDetails disclosure logic

## AC-0.4 Paystack Surface
- `initializeTransaction` from `apps/api/src/services/paystack.service.ts`
- Pattern: validate → persist booking → try { initializeTransaction } catch { throw AppError(502, PAYSTACK_INITIALIZATION_FAILED) }
- Stays precedent: booking persisted FIRST, then Paystack init; if Paystack fails, booking row exists but payment not initialized
- Seat-release on Paystack failure: Stays does NOT release the seat — booking row persists with status PENDING, paymentStatus PENDING
- Response shape: { success: true, data: booking, payment: { authorizationUrl, reference, depositAmount, balanceAmount } }

## AC-0.5 Postmark Patterns
- `sendEmail` from `apps/api/src/services/email.service.ts`
- Templates relevant to C3:
  - `operator-new-booking`: operator notification of new experience booking (ALREADY EXISTS, fully implemented)
  - `experience-approved`: operator notification of approval (exists, not C3)
  - `booking-confirmed`: generic vendor booking confirmation (exists, different domain)
  - `guest-stay-reservation-pending`: stay guest notification (pattern reference)
- NO guest experience booking confirmation template exists yet
- ESCALATION NEEDED: No `guest-experience-booking-confirmed` template exists. Per C3 brief: "confirmation email ONLY by pattern-match to existing Postmark booking-confirmation patterns found at AC-0.5 — if no pattern exists, escalate rather than invent."
- HOWEVER: `operator-new-booking` template exists and is fully implemented for the operator notification side
- DECISION: Guest confirmation email — no existing pattern. Will escalate per brief. Operator notification (operator-new-booking template) IS available and will be used.

## AC-0.6 §8 Switch Evidence — BETA QUALIFYING
- `POST /api/admin/experiences/:id/approve` EXISTS in admin.ts (line 1148)
- `POST /api/admin/experiences/:id/revoke` EXISTS in admin.ts (line 1170)
- Both are covered by `e2ApprovalStateModel.test.ts` (lines 245-280)
- Admin route gated by `authenticate + requireRole('ADMIN')`
- The E2 admin-approval surface ALREADY supports Experience isApproved administration
- This is NOT a trivial extension — it is ALREADY IMPLEMENTED
- §8 SWITCH: (β) path activated. The existing admin approval surface covers Experience entities. No staging SQL data operation needed. The AC-5 smoke will use POST /api/admin/experiences/:id/approve with an ADMIN token.
- REPORT IMMEDIATELY per brief instruction.

## AC-0.7 Test Infrastructure
- Jest (API), Vitest (web)
- 13 existing test suites in apps/api/src/__tests__/
- Pattern: real Prisma client + CI Postgres + jest.mock for email/auth middleware
- New test file: c3ExperienceCustomerBooking.test.ts

## Existing Booking Route State
- POST /api/experience-bookings: EXISTS but INCOMPLETE
  - Uses prisma.$transaction([create, update]) — not atomic conditional
  - No publication condition check
  - No Paystack initialization
  - No meetingDetails disclosure
  - requireMode('EXPERIENCES') — this will block non-OPERATOR/non-EXPERIENCES users
  - CRITICAL: requireMode('EXPERIENCES') on POST is wrong for consumers — consumers don't have EXPERIENCES mode. Must remove or change to allow any authenticated user.
- GET /api/experience-bookings: EXISTS (list my bookings)
- GET /api/experience-bookings/operator: EXISTS (operator view)
- GET /api/experience-bookings/:id: EXISTS (booking detail)
- GET /api/experiences: EXISTS (public listing — needs publication condition check)
- GET /api/experiences/:slug: EXISTS (public detail)
- GET /api/experience-slots/:experienceId: EXISTS (C2)

## Consumer Discovery Routes (existing)
- GET /api/experiences — public listing (check publication condition enforcement)
- GET /api/experiences/:slug — public detail
- GET /api/experience-slots/:experienceId — slot listing (C2, public)
