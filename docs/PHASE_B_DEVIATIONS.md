# Phase B Deviation Register

This document tracks implementation deviations from the original Phase B brief specification. It serves as the source of truth for cumulative deviations across phases, providing visibility into the deltas between the brief and the actual runtime implementation.

## 1. CalendarEntry Status Enum vs Boolean

The implementation of the `CalendarEntry` model introduces a richer state model than originally specified in the brief.

| Attribute | Details |
| :--- | :--- |
| **Brief Specification** | The brief specified a simple boolean `available` field for calendar entries. |
| **Implementation Deviation** | The `CalendarEntry` Prisma model uses a four-state enum `status` (`AVAILABLE`, `BLOCKED`, `BOOKED`, `MAINTENANCE`). |
| **Rationale** | This is an intentional internal enrichment. It allows the host UI to distinguish between "blocked by host", "already booked", and "under maintenance" without losing the binary available/unavailable signal that Coastal Corridor needs. |
| **Date of Deviation** | 2026-05-05 |
| **Adapter Mapping** | The Coastal Corridor adapter deterministically maps this back to the required boolean shape: `available: !e.status || e.status === 'AVAILABLE'`. |
| **Future Consideration** | This richer state model should be considered for codifying in the next brief revision, as it provides better UX for hosts. |

## 2. CalendarEntry RateOverride vs Single Rate

The pricing model has been adapted to better reflect standard hospitality industry practices.

| Attribute | Details |
| :--- | :--- |
| **Brief Specification** | The brief specified a single `rate` field for pricing. |
| **Implementation Deviation** | The implementation uses `Room.pricePerNight` as the base rate and `CalendarEntry.rateOverride` for per-date pricing overrides. |
| **Rationale** | This model (base rate + per-date override) is closer to how hospitality pricing works in practice, allowing hosts to set a default price and only specify overrides for specific dates (e.g., weekends or holidays). |
| **Date of Deviation** | 2026-05-05 |
| **Adapter Mapping** | The adapter handles this seamlessly: `rate: e.rateOverride ?? parseFloat(room.pricePerNight.toString())`. If `rateOverride` is null, the room's base `pricePerNight` is sent. Coastal Corridor always receives a concrete `rate` value. |
| **Future Consideration** | This pricing model should be considered for codifying in the next brief revision. |
