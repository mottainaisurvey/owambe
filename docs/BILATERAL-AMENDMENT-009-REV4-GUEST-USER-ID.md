# Bilateral Contract — Amendment 009 Rev 4 (Guest User ID Extension)

**Document type:** Amendment to the Owambe ↔ Coastal Corridor bilateral contract  
**Amendment number:** 009  
**Revision:** 4 (supersedes Rev 3)  
**Authored by:** Thread-2 (Owambe developer)  
**Date authored:** 2026-07-25  
**Routing:** Owambe coordinator → CC strategic anchor (code review + handler-confirmation append)  
**Wire-shape change gate:** BLOCKED pending CC strategic anchor handler-confirmation (§ 5)  
**Governing cycle:** OWB-C-GUEST-CHECKOUT-01 (G-6 work item)

---

## 1. Context and Motivation

Amendment 009 Rev 3 defines the `booking.*` event family payload shape for the Experiences/Events vertical. The current Rev 3 payload for `booking.created` does not carry a `user_id` field, because at the time of Rev 3 authorship all Owambe experience bookings required prior authentication — every booking had a known `guestUserId`.

OWB-C-GUEST-CHECKOUT-01 introduces guest checkout for the Experiences vertical: a consumer may complete a booking and payment without prior registration or sign-in. In this path, `ExperienceBooking.guestUserId` is `NULL` at booking creation. The field is already nullable in the Owambe schema (`String? @db.Uuid`, confirmed at AC-0), but the outbound `booking.created` payload currently does not expose it, meaning CC cannot distinguish a guest booking from an authenticated booking.

This revision adds `user_id: string | null` to the `booking.created` payload, using Amendment 012 Rev 2's `guest_owambe_user_id: reservation.guestUserId ?? null` treatment as the direct null-guest precedent.

---

## 2. Change Summary

| Item | Rev 3 (current) | Rev 4 (this revision) |
| :--- | :--- | :--- |
| `booking.created` payload field count | 11 fields | 12 fields |
| `user_id` field | **absent** | `string \| null` — Owambe user UUID when booking is authenticated; `null` when booking is guest (unauthenticated) |
| `booking.cancelled` payload | unchanged | unchanged |
| `booking.refunded` payload | unchanged | unchanged |

---

## 3. Revised Payload Specification

### 3.1 `booking.created` — Rev 4 canonical payload (12 fields)

All fields are snake_case. The `user_id` field is the only addition over Rev 3.

| Field | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `booking_id` | `string` (UUID) | No | Owambe internal booking UUID |
| `external_ref` | `string \| null` | Yes | CC booking ID, if CC-origin |
| `experience_id` | `string` (UUID) | No | Owambe experience UUID |
| `external_experience_id` | `string \| null` | Yes | CC experience ID, if CC-origin |
| `time_slot_id` | `string` (UUID) | No | Owambe slot UUID |
| `guest_count` | `integer` | No | Number of participants |
| `booking_date` | `string` (ISO date) | No | Date of booking creation (`YYYY-MM-DD`) |
| `guest_details` | `object` | No | `{ primary_guest_name, primary_guest_email, primary_guest_phone? }` |
| `total_amount_kobo` | `integer` | No | Total charge in kobo |
| `currency` | `string` | No | ISO 4217 currency code (default `"NGN"`) |
| `created_at` | `string` (ISO 8601) | No | Booking creation timestamp |
| **`user_id`** | `string \| null` | **Yes** | **NEW (Rev 4).** Owambe user UUID when the booking was made by an authenticated user; `null` when the booking was made via guest checkout (unauthenticated path). |

### 3.2 Owambe dispatch-site mapping

The `user_id` field maps from `ExperienceBooking.guestUserId ?? null` at the `booking.created` dispatch site in `apps/api/src/routes/channel.ts`.

This is identical in treatment to Amendment 012 Rev 2 § 3.3's `guest_owambe_user_id: reservation.guestUserId ?? null` on the `reservation.created` payload.

### 3.3 Unchanged payloads

`booking.cancelled` and `booking.refunded` payloads are unchanged from Rev 3. No `user_id` is added to these payloads in this revision.

---

## 4. Null-Guest Precedent Reference (Amendment 012 Rev 2)

Amendment 012 Rev 2 § 3.3 established the null-guest treatment for the `reservation.created` event:

```
guest_owambe_user_id: reservation.guestUserId ?? null
```

The CC-side handler for `reservation.created` was implemented to accept this field as `string | null`. This revision applies the same treatment to the `booking.created` event under the `booking.*` family.

**Review question for CC strategic anchor:** Was the null-guest handling in the CC `reservation.created` handler implemented as a generalised pattern across the CC dispatcher/handler layer (making this change handler-transparent for the `booking.created` case), or was it reservation-specific? If reservation-specific, any required small CC refactor to handle `user_id: null` in the `booking.created` handler should be registered as a dormant CC forward artefact — it does not block this cycle.

---

## 5. Handler-Confirmation Gate

**The Owambe wire-shape change (adding `user_id` to the `booking.created` dispatch site) is BLOCKED until this section is completed by the CC strategic anchor.**

The CC strategic anchor should:
1. Review the existing CC `booking.created` handler against the Amendment 012 null-guest pattern.
2. Determine whether the null-guest treatment is already generalised (handler-transparent) or reservation-specific.
3. Append the outcome below and sign.

---

### § 5 — CC Strategic Anchor Handler-Confirmation (TO BE COMPLETED)

> **Anchor review outcome:** [PENDING]
>
> **Handler-transparent?** [YES / NO]
>
> **If NO — dormant CC forward artefact registered:** [description if applicable]
>
> **Confirmation:** The Owambe wire-shape change (adding `user_id: string | null` to `booking.created` payload) may proceed.
>
> **Signed:** [CC strategic anchor]  
> **Date:** [date]

---

## 6. Owambe Implementation Note (post-confirmation)

Once the handler-confirmation is appended, the Owambe dispatch site change is:

```typescript
// apps/api/src/routes/channel.ts — booking.created dispatch (post-G-6 confirmation)
data: {
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
  // Amendment 009 Rev 4 — G-6 addition (post-handler-confirmation only)
  user_id: booking.guestUserId ?? null,
},
```

This change is NOT applied to the codebase until the handler-confirmation in § 5 is completed.

---

*Authored: Thread-2 — 2026-07-25*  
*Routing: Owambe coordinator → CC strategic anchor for code review and § 5 completion*
