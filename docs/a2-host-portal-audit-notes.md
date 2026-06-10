# A2 live staging audit notes

## Registration route initial observation

The staging home page is reachable at `https://owambe-web-staging.up.railway.app`. The public registration route at `/register` is events-oriented, not host-oriented: it presents role choices for `PLANNER`, `VENDOR`, and `CONSUMER`, and no visible `HOST` or Stays-specific signup option is present. This is a likely **UX/completeness finding** for the A2 host signup path because a fresh host cannot self-select Host/Stays from the visible registration form.

## Seeded host login and Stays landing

Login with the T1 seeded host account `staging-host-1@owambe.test` succeeded on staging. The rendered post-login content shows the Stays dashboard with sidebar links for **Dashboard**, **My Properties**, **Add Property**, **Bookings**, **Availability Calendar**, **Analytics**, **Reviews**, and **Pricing**. The visible user identity is **Hauwa Host** with role **HOST**. This confirms the seeded host can reach the Stays dashboard after T1 remediation, but it does not close the separate fresh host signup gap because `/register` still lacks a Host/Stays role option.


## Fresh host signup API contract check

A direct staging API attempt to register a fresh user with `role: "HOST"` returned HTTP `422` with `success: false` and `error: "Validation failed"`. This confirms the host signup gap exists at both layers: the public `/register` UI does not expose a Host/Stays role, and the backend `/api/auth/register` validator rejects `HOST` as an allowed registration role. The attempted email was `a2-host-audit-1781013424@owambe.test`; no password value was retained.


## Property endpoint prefix and response-shape check

From the authenticated staging browser session on `/dashboard/stays/properties`, direct `fetch` calls with the persisted `owambe-auth` access token produced the following route results: `/api/properties/host` returned HTTP 200 with `{ success: true, data: [...] }` and three host properties; `/api/v1/properties/host` returned HTTP 404 `Route not found`; `/properties/host` returned HTTP 404 `Route not found`. This confirms that host properties exist for the seeded account and the deployed API route prefix is `/api`, not `/api/v1`. The My Properties UI remaining in skeleton state is therefore not caused by absence of seeded records; it is consistent with a frontend integration/rendering issue, likely response-shape handling or loading-state handling in the page component.

## Seeded property identifiers and data-shape completeness

A follow-up authenticated browser-side API call to `/api/properties/host` returned three seeded properties for `staging-host-1@owambe.test`: `T1 Victoria Island Boutique Stay` (`0000103b-5272-41ad-9a84-2f5c990ef4dd`), `T1 Ikoyi Serviced Apartment` (`7dbdc10d-03e6-4d97-887c-7050d5e3926f`), and `T1 Lekki Family Villa` (`8e0845a8-dc5b-448a-9977-213fbbb3287e`). Each record reported `isActive: true`, included a `rooms` array with one room, and included `_count`, so the list endpoint has enough data for the My Properties card UI. The current browser console history did not show a React exception for the latest check; further direct route testing is needed to determine whether the skeleton was transient hydration/loading behaviour or reproducible UI failure.

## Property details behaviour

The live staging host portal successfully opened the first seeded property detail route at `/dashboard/stays/properties/0000103b-5272-41ad-9a84-2f5c990ef4dd`. The detail page displayed the property name, type, location, hero image, overview text, room details, policies, amenities, reservation count, lowest nightly rate, rating, and publishing status. This confirms that the A1 View Details behaviour for the T1 seeded Stays host is functioning on staging after the Railway seed remediation.

## Edit form loading behaviour

The visible `Edit Property` button on the property detail page navigated successfully to `/dashboard/stays/properties/0000103b-5272-41ad-9a84-2f5c990ef4dd/edit` when selected by coordinate. The edit form loaded the seeded property fields, including property name, property type, description, cover image URL, city, state, country, address, check-in/check-out times, house rules, cancellation policy, amenities, active status, and Save Changes/Cancel actions. The element-index click did not navigate in one attempt, but the visible control itself is functional.

## Add Property form loading behaviour

The host portal `Add Property` route loaded at `/dashboard/stays/properties/new` for the authenticated seeded host. The form displayed fields for property name, property type, description, city, state, country, full address, check-in/check-out times, house rules, cancellation policy, amenity checkboxes, and the `Create Property` action. This confirms that the create flow is reachable from the host portal UI before submission testing.

## Add Property submission behaviour

Submitting the `Add Property` form with a temporary A2 audit property left the page at `/dashboard/stays/properties/new` with the primary button stuck in `Creating...`. The form values remained populated and no success navigation or visible validation error appeared within the observed interval. This requires console/API diagnosis to determine whether the create request failed silently, hung, or succeeded without UI state recovery.

### Add Property backend result

Authenticated API verification after the stuck `Creating...` state found one newly created temporary property named `A2 Audit Temporary Stay 20260609` with id `dad504ba-bf9f-40d2-9338-ab81381611d8`. This means the create request succeeded server-side, but the UI did not complete the success flow, did not navigate back to My Properties, and left the submit control disabled/loading. This is a high-confidence UX/state-management defect with duplicate-submit and user-confusion risk.

### Edit route load behaviour

Direct navigation to `/dashboard/stays/properties/dad504ba-bf9f-40d2-9338-ab81381611d8/edit` eventually loaded the Edit Property form for the temporary A2 property. The form displayed persisted values for name, property type, description, location, policies, amenities, and active status. This confirms the edit route can load for a host-created property after the backend record exists, even though the create UI remained stuck.

### Edit persistence submission state

The temporary A2 property's edit form accepted a name change from `A2 Audit Temporary Stay 20260609` to `A2 Audit Temporary Stay 20260609 Edited`. Pressing **Save Changes** changed the button state to **Saving...**. Follow-up checks are required to determine whether the UI recovers, navigates, or leaves the user in a pending state while the backend persists the change.

### Edit persistence result and list return state

After pressing **Save Changes**, the edit route navigated back to the property detail route and displayed the edited name `A2 Audit Temporary Stay 20260609 Edited`, confirming that edit persistence works for the tested name change. Returning to **My Properties** again showed the skeleton-only loading state instead of rendering the property cards immediately, reinforcing the list-page loading/data-shape defect while direct detail and edit routes remain usable.

### Phase 4 update — property deletion and cleanup verification (2026-06-09)

The temporary A2 property created during the add/edit flow was cleaned up through the authenticated staging API using `DELETE /api/properties/dad504ba-bf9f-40d2-9338-ab81381611d8`. The correct route is the non-versioned `/api/properties/:id` path; `/api/v1/properties/:id` returns `404 Route not found`. After refreshing the expired host JWT through the seeded staging host account, the delete request returned `200` with `{ success: true, message: "Property deactivated" }`, and the subsequent active property list returned 10 records with no `A2 Audit Temporary` match.

**Finding classification:** the backend supports authenticated soft deletion for host-owned properties, but the host portal exposes no visible delete/deactivate control from the properties list, property detail, or edit page. This is a functional and UX gap rather than a missing API capability. The API contract also has a discoverability mismatch because public detail uses slug semantics at `GET /api/properties/:slug`, while update/delete use ID semantics at `PUT/DELETE /api/properties/:id`; host-specific detail is available at `GET /api/properties/host/:id` and is the safer contract for dashboard screens.

## Phase 5 — remaining host portal areas

### Availability calendar route observation

Opening `/dashboard/stays/calendar` as the seeded HOST rendered an **Availability Calendar** heading and the authenticated host identity, but the left navigation and global header were still event-oriented: links included **My Events**, **Create Event**, registration, check-in scanner, speaker management, venue/map, sponsors, attendee app, and **New Event**. No property selector, room selector, date grid, availability rows, pricing controls, block-date controls, or calendar-entry data rendered in the observed viewport. This is a functional completeness gap and a mode-context UX defect for the Stays host portal.

### Bookings route observation

Opening `/dashboard/stays/bookings` rendered a **Bookings** page with a **Reservations** section, summary cards for total reservations, confirmed, checked in, and net revenue, plus filters for status and channel. The same event-oriented sidebar/header remained visible for the HOST user. Despite T1-seeded stay bookings existing conceptually for the seeded properties, the page displayed zero totals, a **No reservations yet** empty state, and a visible error message: `Failed to load bookings` / `Internal server error`. This indicates that booking-management data loading is broken or misrouted on staging and that the empty state masks a server/API failure.

### Pricing and room-rate management route observation

Opening `/dashboard/stays/pricing` returned a framework-level `404 This page could not be found`. The Stays dashboard sidebar previously advertised **Pricing**, but the route is not implemented under the Stays path. The backend has room management and rate fields (`POST /api/properties/:id/rooms`, `PUT /api/properties/:id/rooms/:roomId`, and calendar pricing fields), yet the host portal does not expose a Stays pricing/rate-management screen at the expected route. This is a functional gap and an API/UI coverage mismatch.

### Reviews route observation

Opening `/dashboard/stays/reviews` rendered a **Reviews** page with **Guest Reviews** explanatory copy and an empty state. No seeded reviews were expected from T1, so the empty data state is not itself conclusive. However, the route again rendered the event-oriented sidebar/header for a HOST user, including **My Events**, **Create Event**, and **New Event** controls. No reply, moderation, filter, review-detail, or property-level review controls were visible. This is an incomplete host review-management surface and another instance of Stays mode-context navigation leakage.

### Analytics and channel-sync visibility observation

Opening `/dashboard/stays/analytics` initially showed a spinner and then rendered **Stays Analytics** with cards for total net revenue, properties, active rooms, and confirmed bookings. All card values rendered as em dashes rather than seeded counts or derived metrics. No Coastal Corridor/channel-sync status, sync error queue, external channel mapping, occupancy chart, property-level drill-down, or booking-source trend was visible. The event-oriented sidebar/header persisted. This is a partial implementation: the route exists, but it does not yet provide actionable analytics or channel-sync observability for hosts.

### Photos, room pricing, and channel-sync exposure on property detail/edit

The seeded property detail route displayed a single cover image, room card, nightly rate, reservation count, rating, and publishing status. It also surfaced a useful channel-sync status label: **Not synced to Coastal Corridor**. However, no gallery management, image upload, cover-image replacement action, room add/edit/deactivate controls, or manual channel-sync retry action was visible on the detail page. The edit route exposed a **Cover Image URL** field but did not expose `galleryUrls`, upload/file-picker behaviour, gallery ordering, alt text, image validation, room/rate management, or channel-sync controls. Room rates are visible but not editable from the tested host UI surface, despite API support for room create/update and property calendar pricing.

### Route inventory and bookings API contract evidence

The implemented Stays dashboard route inventory contains `dashboard/stays`, `analytics`, `bookings`, `calendar`, `properties`, `properties/new`, `properties/[id]`, `properties/[id]/edit`, and `reviews`. There are no dedicated Stays routes for messaging, host profile, gallery/photos, rooms, pricing/rate plans, or channel-sync management. Source inspection confirms the bookings page calls `GET /api/properties/host/bookings` and then executes `setBookings(data.data ?? [])`, while the backend endpoint returns `{ success: true, data: bookings, pagination: ... }` when successful. Direct authenticated probing in the browser showed `GET /api/properties/host/:id` returned the seeded property with `roomsCount: 1`, `GET /api/properties/:propertyId/calendar` returned one calendar entry and zero bookings for the date range default, `GET /api/properties/calendar-entries` without `roomId` returned `400 roomId is required`, `GET /api/stays/bookings` returned `404 Route not found`, and `GET /api/reviews` returned `404 Route not found`. The visible bookings page error therefore requires further server log diagnosis, but the user-facing defect is clear: hosts see a zero-reservation state plus an internal-error toast, even though the route is meant to list host bookings across seeded properties.
