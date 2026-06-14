# V-REFUND-CC-2-G1 Verification Report

**Date:** 2026-06-14
**Status:** CLOSED (Lightweight Owambe-side Verification)
**Target:** `refund_amount` unit at `booking.refunded` dispatch payload construction site

## 1. Executive Summary

The V-REFUND-CC-2-G1 lightweight verification cycle has been executed to determine the unit of the `refund_amount` field at the Owambe-side `booking.refunded` dispatch payload construction site.

**Key Finding:** The Owambe-side implementation currently dispatches the refund amount in **kobo (integer)** via a field explicitly named `refund_amount_kobo`, rather than `refund_amount`. This deviates from the CC-side expectation of a `refund_amount` field (which CC stores directly as a Decimal without `/100` conversion).

## 2. Verification Anchors

### 2.1 (verification-anchor-1) `refund_amount` unit at Owambe-side dispatch payload construction site

**Location:** `apps/api/src/routes/channel.ts:1469-1478` (inside the `booking.refunded` inbound webhook handler)

**Observation:**
The Owambe-side dispatch payload construction site does **not** use the field name `refund_amount`. Instead, it explicitly uses `refund_amount_kobo` and performs a `* 100` conversion if the inbound data provided a major currency unit.

```typescript
// channel.ts:1469-1478
const refundAmountKobo = data?.refund_amount_kobo
  ?? (data?.refund_amount != null ? Math.round(Number(data.refund_amount) * 100) : null);

await dispatchWebhookEvent({
  eventType: 'booking.refunded',
  idempotencyKey: `booking.refunded.${bookingRefund.id}`,
  data: {
    // Amendment 009 Rev 3 § 3.3 — booking.refunded canonical payload
    booking_id: bookingRefund.id,
    external_ref: bookingRefund.externalRef ?? null,
    refund_amount_kobo: refundAmountKobo ?? null,
    // ...
```

**Conclusion:** The Owambe-side dispatch sends the value in **kobo (integer)**, but under the key `refund_amount_kobo`, not `refund_amount`.

### 2.2 (verification-anchor-2) `refund_amount` source data scope at Owambe internal layer

**Location:** `apps/api/prisma/schema.prisma:737` (ExperienceBooking model)

**Observation:**
At the database layer, Owambe stores financial amounts (including `totalAmount` and `refundAmount`) as `Decimal(12, 2)`. This indicates that internally, Owambe stores values in **major currency units (e.g., NGN)**, not kobo.

```prisma
// schema.prisma:737
totalAmount     Decimal                 @db.Decimal(12, 2)
// ...
refundAmount    Decimal?          @db.Decimal(12, 2)
```

When Owambe constructs the `booking.created` outbound payload (`channel.ts:1068`), it explicitly converts the `totalAmount` Decimal to kobo:
`total_amount_kobo: Math.round(parseFloat(booking.totalAmount.toString()) * 100)`

**Conclusion:** The internal source data is in major currency units (Decimal), but the outbound dispatch layer explicitly converts it to kobo (integer) for transmission.

### 2.3 (verification-anchor-3) `refund_amount` test payload context

**Location:** `apps/api/src/__tests__/bookingEventDispatch.test.ts:482, 532, 554`

**Observation:**
The integration tests simulate an inbound `booking.refunded` webhook from CC containing `refund_amount: 15000` (major unit, NGN). The test then asserts that the outbound dispatch payload contains `refund_amount_kobo: 1500000`.

```typescript
// bookingEventDispatch.test.ts:554
expect(data).toMatchObject({
  booking_id: booking.id,
  external_ref: ccId,
  refund_amount_kobo: 1500000,  // 15000 NGN × 100 = 1500000 kobo
  // ...
});
```

**Conclusion:** The test context confirms that `15000` represents ₦15,000 (major unit), and the system intentionally converts this to `1500000` kobo for the outbound `refund_amount_kobo` field.

## 3. Synthesis & Forward Operational Sequence

The verification reveals a **field name and unit mismatch** between the Owambe implementation and the CC expectation:

1.  **CC Expectation:** Expects a field named `refund_amount` and stores it directly as a Decimal (implying it expects major currency units, e.g., `15000` for ₦15,000).
2.  **Owambe Implementation:** Dispatches a field named `refund_amount_kobo` containing the value in kobo (e.g., `1500000` for ₦15,000).

This confirms the V-REFUND-CC-2-G1 operational gap. If CC were to read `refund_amount_kobo` (or if Owambe renamed it to `refund_amount` without changing the unit), CC would store `1500000` as the Decimal value, resulting in a 100x financial reconciliation error.

Per the lightweight scope discipline, no implementation changes have been made. This report is delivered to inform the (resolution-γ) beat-2 specification clarification cycle at the CC strategic anchor scope.
