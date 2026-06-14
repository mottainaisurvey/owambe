# V-CREATE-FIELD-SURFACE Verification Report

**Date:** 2026-06-14
**Status:** CLOSED (Lightweight Owambe-side Verification)
**Target:** `booking.created` dispatch payload field surface at `channel.ts:1048`

## 1. Executive Summary

The V-CREATE-FIELD-SURFACE lightweight verification cycle has been executed to determine the exact field surface of the `booking.created` outbound webhook payload dispatched by Owambe, specifically to resolve the (possibility-α/β/γ) ambiguity regarding how the CC-side handler reads commission and net fields.

**Key Finding:** Owambe **does NOT** dispatch `channel_commission_amount_kobo`, `channel_commission_percent`, or `net_to_operator_kobo` in the `booking.created` payload. The payload strictly conforms to the Amendment 009 Rev 3 §3.1 canonical wire shape. This confirms **(possibility-β)** or **(possibility-γ)**: the CC-side handler is either reading these fields from a different source (e.g., a follow-up API call) or reading them as `undefined` from the webhook payload.

## 2. Verification Anchors

### 2.1 (verification-anchor-1) Complete Payload Field Surface

**Location:** `apps/api/src/routes/channel.ts:1056-1075` (inside the `POST /api/v1/channel/experiences/bookings` handler)

**Observation:**
The complete `data` object constructed for the `booking.created` dispatch event is as follows:

```typescript
data: {
  // Amendment 009 Rev 3 § 3.1 — booking.created canonical payload
  booking_id: booking.id,
  external_ref: booking.externalRef ?? null,
  experience_id: booking.experienceId,
  external_experience_id: booking.externalExperienceId ?? null,
  time_slot_id: booking.slotId,
  guest_count: booking.numberOfParticipants ?? booking.guestCount,
  booking_date: booking.createdAt.toISOString().split('T')[0],
  guest_details: {
    primary_guest_name: booking.guestName,
    primary_guest_email: booking.guestEmail,
    ...(booking.guestPhone ? { primary_guest_phone: booking.guestPhone } : {}),
  },
  total_amount_kobo: Math.round(parseFloat(booking.totalAmount.toString()) * 100),
  currency: booking.currency ?? 'NGN',
  created_at: booking.createdAt.toISOString(),
}
```

### 2.2 (verification-anchor-2) Comparison Against Canonical Wire Shape

The dispatched payload fields map exactly 1:1 to the Amendment 009 Rev 3 §3.1 canonical wire shape specified in the brief:

*   `booking_id` ✅
*   `external_ref` ✅
*   `experience_id` ✅
*   `external_experience_id` ✅
*   `time_slot_id` ✅
*   `guest_count` ✅
*   `booking_date` ✅
*   `guest_details` ✅
*   `total_amount_kobo` ✅
*   `currency` ✅
*   `created_at` ✅

There are **no extra fields** appended to this object.

### 2.3 (verification-anchor-3) Determination of (possibility-α/β/γ)

Based on the direct codebase verification:

*   **Is Owambe dispatching `channel_commission_amount_kobo`, `channel_commission_percent`, or `net_to_operator_kobo`?**
    **NO.** These fields are entirely absent from the `booking.created` dispatch payload.
*   **Conclusion:** This eliminates (possibility-α) (Owambe dispatching additional fields). The reality is either **(possibility-β)** (CC reads from a different code path/API) or **(possibility-γ)** (CC reads with undefined fallback).

## 3. Synthesis

The Owambe-side implementation of the `booking.created` dispatch is strictly canonical. The observation that the CC-side `handleBookingCreated` handler attempts to read `channelCommissionAmount`, `channelCommissionPercent`, and `netToOperator` indicates a CC-side implementation detail that is operating outside the bounds of the `booking.created` webhook payload itself.

Per the lightweight scope discipline, no implementation changes have been made. This report is delivered to inform the CC strategic anchor remediation cycle.
