# OWB-F1-NEW-REFACTOR-02 Implementation Report

**Cycle ID:** OWB-F1-NEW-REFACTOR-02
**Status:** CLOSED at staging-first four-dimension shape
**Executed:** 2026-06-13
**Executed by:** Thread-1 (Owambe Manus developer)

## 1. Cycle Execution Summary

The OWB-F1-NEW-REFACTOR-02 cycle has been substantively executed and closed at the staging-first four-dimension shape per AC-5. The Owambe-side `reservation.created` dispatch payload has been successfully expanded from the Rev 1 minimum scope (`{ reservation_id }` only) to the Rev 2 § 3.3 9-field canonical scope.

All 8 new fields were successfully mapped to the `StayBooking` model without requiring any Brief Amendment 01 prophylactic triggers. The `reservation.cancelled` and `reservation.refunded` payloads were preserved at their Rev 1 canonical scope per the bounded scope discipline.

## 2. AC-0: Field Source Mapping Verification

The canonical construction site was verified at `apps/api/src/routes/channel.ts` (lines 375-405). The `StayBooking` model (`apps/api/prisma/schema.prisma`, lines 571-633) was verified to contain all necessary source fields.

| Rev 2 § 3.3 Field | StayBooking Source Field | Transformation / Notes |
| :--- | :--- | :--- |
| `reservation_id` | `id` | Preserved from Refactor-01 |
| `property_id` | `propertyId` | Direct mapping |
| `room_id` | `roomId` | Direct mapping |
| `check_in_date` | `checkInDate` | `.toISOString().split('T')[0]` |
| `check_out_date` | `checkOutDate` | `.toISOString().split('T')[0]` |
| `number_of_guests` | `numberOfGuests` / `guestCount` | `numberOfGuests ?? guestCount` |
| `total_amount_kobo` | `totalAmount` | `Math.round(parseFloat(totalAmount.toString()) * 100)` |
| `currency` | `currency` | `currency ?? 'NGN'` |
| `guest_owambe_user_id` | `guestUserId` | `guestUserId ?? null` |

## 3. AC-1: Dispatch Helper Update

The `dispatchWebhookEvent` call at the `reservation.created` case in `channel.ts` was updated to construct the 9-field payload.

**File:** `apps/api/src/routes/channel.ts`
**Modification:**
```typescript
    // ─── A012-REFACTOR-02 AC-1: Dispatch reservation.created outbound event ─────
    // Amendment 012 Rev 2 canonical: reservation.created with 9-field payload
    // per § 3.3 (expanded from Rev 1 minimum-scope {reservation_id} only).
    // Fired asynchronously (fire-and-forget) so the 201 response is not delayed
    // by delivery latency. reservation.* events are not gated by feature flag.
    setImmediate(async () => {
      try {
        await dispatchWebhookEvent({
          eventType: 'reservation.created',
          idempotencyKey: `reservation.created.${reservation.id}`,
          data: {
            // Amendment 012 Rev 2 § 3.3 — reservation.created 9-field canonical payload
            reservation_id: reservation.id,
            property_id: reservation.propertyId,
            room_id: reservation.roomId,
            check_in_date: reservation.checkInDate.toISOString().split('T')[0],
            check_out_date: reservation.checkOutDate.toISOString().split('T')[0],
            number_of_guests: reservation.numberOfGuests ?? reservation.guestCount,
            total_amount_kobo: Math.round(parseFloat(reservation.totalAmount.toString()) * 100),
            currency: reservation.currency ?? 'NGN',
            guest_owambe_user_id: reservation.guestUserId ?? null,
          },
        });
```

## 4. AC-2: Integration Test Update

The integration test was updated to assert the presence and correctness of all 9 fields at the `reservation.created` scope.

**File:** `apps/api/src/__tests__/reservationEventDispatch.test.ts`
**Modification:**
```typescript
    it('reservation.created payload contains Amendment 012 Rev 2 §3.3 9-field canonical fields', async () => {
      // ... setup ...
      // Amendment 012 Rev 2 §3.3 — reservation.created 9-field canonical payload
      expect(data).toMatchObject({
        reservation_id: freshId,
        property_id: testPropertyId,
        room_id: testRoomId,
        check_in_date: '2026-09-10',
        check_out_date: '2026-09-14',
        number_of_guests: 2,
        total_amount_kobo: 20000000,  // 200000 NGN × 100 = 20000000 kobo
        currency: 'NGN',
        guest_owambe_user_id: null,   // CC-origin guest has no Owambe account
      });
      // Confirm all 9 fields are present
      expect(Object.keys(data)).toHaveLength(9);
      // Confirm no legacy booking-family fields are present
      expect(data).not.toHaveProperty('owambe_reservation_id');
      expect(data).not.toHaveProperty('cc_reservation_id');
      expect(data).not.toHaveProperty('booking_type');
    });
```

## 5. AC-5: Staging-First Four-Dimension Closure

The cycle was closed at the staging-first four-dimension shape per established discipline.

| Dimension | Status | Evidence |
| :--- | :--- | :--- |
| **(dim-1) Merge integrity** | PASS | `feature/f1-new-refactor-02` merged to `staging` via no-fast-forward merge (commit `5516f94`). |
| **(dim-2) CI/CD success** | PASS | GitHub Actions PASS (Lint, Type Check, Tests, Build). Railway staging deploy SUCCESS. |
| **(dim-3) Functional verification** | PASS | Live staging probes passed. `reservation.created` returned HTTP 201. Field source verification confirmed all 9 fields present on the live `StayBooking` record. |
| **(dim-4) Boundary discipline** | PASS | Vocabulary linter PASS. `reservation.cancelled` and `reservation.refunded` payloads preserved at Rev 1 canonical scope. |

## 6. Forward Operational State

- **Track 2 Parallel-Track:** The CC-side full handler implementation (CC-PHASE-F2.5-BRIEF-1-Rev2) is substantively parallel-track. This Owambe-side dispatch expansion unblocks the F3 bilateral end-to-end verification at the `reservation.created` scope once Track 2 is closed.
- **Production Deploy Authorisation:** Gated at a separate founder direction window per the Discipline 3 staging-first → production-second pattern. The `main` branch remains at the Refactor-01 baseline until authorisation is granted.
