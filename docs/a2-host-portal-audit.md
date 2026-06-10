# A2 Host Portal Audit — Railway Staging

**Author:** Manus AI  
**Audit date:** 9 June 2026  
**Environment:** Railway staging web app and API  
**Branch:** `investigate/A2-host-portal-audit`  
**Scope:** Host signup, Stays dashboard access, property lifecycle, availability, bookings, photos, pricing/rooms, analytics, reviews, channel-sync visibility, and route/API contract coverage.

## Executive summary

This audit verified the A2 Stays host portal against the deployed Railway staging environment and the current repository implementation. The seeded host account can authenticate and reach the Stays dashboard, and direct property detail/edit pages are usable for seeded records. However, the portal is not yet complete enough for a real host operations workflow. The most significant problems are **fresh host signup rejection**, **event-mode navigation leaking into Stays pages**, **property list/create state-management failures**, **broken booking loading**, and **missing host-facing management surfaces for pricing, rooms, photo galleries, messaging, profile, and channel sync**.[1] [2]

The backend contains several capabilities that are not yet exposed coherently in the host UI. For example, host-owned properties can be listed, edited, and soft-deactivated through authenticated API calls, and property detail responses include rooms, gallery metadata, booking counts, and Coastal Corridor sync fields. The host portal nonetheless lacks visible delete/deactivate controls, gallery management, room/rate editing, sync retry/status operations, and a reliable bookings page. The result is a portal that demonstrates foundational Stays data access but falls short of an end-to-end host management product.[3] [4]

| Priority | Area | Severity | Status | Coordinator decision needed |
|---|---:|---:|---|---|
| P0 | Host signup | Critical | UI omits HOST; API rejects `role: HOST` | Decide whether public hosts may self-register now or require invitation/admin provisioning. |
| P0 | Stays navigation shell | Critical | Stays routes render event-oriented sidebar/header after direct route refresh | Assign dashboard shell ownership and mode-detection fix before more Stays screens are added. |
| P1 | Properties list/create | High | Create succeeds server-side but UI stays on `Creating...`; list intermittently remains skeleton-only | Fix response handling/loading-state recovery and add regression tests. |
| P1 | Bookings | High | Page shows zero totals plus `Failed to load bookings` / internal error | Diagnose staging API error and align booking response contract, empty states, and toast handling. |
| P1 | Pricing/rooms/photos | High | No dedicated pricing/room/gallery route; `/dashboard/stays/pricing` is 404 | Define minimum host property-management surface for launch. |
| P2 | Calendar/analytics/reviews | Medium | Routes exist but are partial, empty, or non-actionable | Decide launch gating versus “coming soon” presentation. |
| P2 | Delete/deactivate | Medium | Backend soft delete works; no visible UI control | Add controlled host-facing deactivate flow with confirmation and recovery copy. |

## Methodology

The audit combined browser-based staging verification with source and API contract inspection. Testing was performed only against staging endpoints and seeded staging data. Temporary A2 data created during the property lifecycle test was cleaned up through authenticated soft deletion and verified absent from the active property list. No production environment was accessed, and no password or secret value is recorded in this report.

> **Working definition used for classification:** A finding is considered functional when a host cannot complete a required workflow, data/API when the deployed contract or response state is inconsistent, UX when the workflow is misleading or confusing despite partial functionality, and security/operational when the defect may cause accidental data exposure, duplicate submission, irreversible action without controls, or coordination risk.

| Audit dimension | Verification method | Result summary |
|---|---|---|
| Functional correctness | Browser route tests and authenticated API probes | Several core host workflows are missing or fail to recover after backend success. |
| Data and API integrity | Direct `fetch` calls from authenticated staging session and source inspection | Multiple API capabilities exist, but frontend routing and response handling are incomplete. |
| User experience | Rendered UI inspection across Stays routes | Stays pages frequently render event-oriented navigation and misleading empty states. |
| Security and operations | Deletion cleanup, route semantics, and secret-handling review | No secrets were committed, but destructive actions need explicit UI controls and route semantics need clearer separation. |

## Verified positive behaviours

The seeded host account can log into staging and reach the Stays dashboard. The dashboard initially presents Stays-oriented links for **Dashboard**, **My Properties**, **Add Property**, **Bookings**, **Availability Calendar**, **Analytics**, **Reviews**, and **Pricing**. This confirms that the T1 seeded host can reach the intended product area after the staging seed remediation.[1]

Seeded property detail and edit routes work for direct host-owned records. The first seeded property detail page rendered the property name, type, location, hero image, overview, room card, policies, amenities, reservation count, lowest nightly rate, rating, and publishing status. The edit page loaded persisted fields for basic information, location, policies, amenities, active state, and cover image URL, and the temporary edit-persistence test successfully changed a property name and returned to the detail page.[1]

| Capability | Evidence | Launch interpretation |
|---|---|---|
| Seeded host login | Browser verification as the documented staging host | Authentication and role assignment are viable for seeded accounts. |
| Property detail | Direct route rendered rich property and room details | Read-only host property details are mostly functional. |
| Property edit | Name edit persisted and returned to detail page | Basic property edit path is usable after record exists. |
| Backend soft delete | `DELETE /api/properties/:id` returned success and deactivated the temporary audit property | API capability exists, but UI exposure is missing. |
| Host property API | `/api/properties/host` returned active host properties and room/count metadata | Backend data is present when the frontend list fails to render. |

## Prioritized findings

### P0-01 — Fresh host signup is blocked in both UI and API

The public registration route is events-oriented and presents role choices for planner, vendor, and consumer; no visible Host or Stays signup option is available. A direct staging API registration attempt using `role: "HOST"` returned HTTP 422 with a validation failure. This confirms the gap at both layers: the public UI does not permit host self-selection, and the backend validator rejects host registration.[1]

| Dimension | Assessment |
|---|---|
| Functional correctness | A new host cannot self-register into the Stays portal. |
| Data/API integrity | UI and backend agree in rejecting HOST, but this conflicts with the A2 host-portal objective. |
| UX | Prospective hosts are forced into event roles or abandon signup. |
| Security/operations | If host creation must be invitation-only, the product needs explicit copy and admin workflow; otherwise support teams will face ambiguous onboarding failures. |

**Recommendation:** Product should decide whether A2 supports public host registration or only admin/invitation provisioning. If public signup is in scope, add `HOST` to the registration role model, validation schema, onboarding copy, and post-registration Stays mode selection. If it is intentionally gated, replace the silent absence with a host waitlist, “contact sales,” or invite-code path.

### P0-02 — Stays pages render the event dashboard shell after direct route access

Multiple Stays routes rendered a HOST identity but displayed an event-oriented sidebar and header, including **My Events**, **Create Event**, registration, check-in scanner, speaker management, venue/map, sponsors, attendee app, and **New Event**. This was observed on bookings, reviews, analytics, property detail, property edit, and calendar routes during the authenticated staging session.[1]

| Dimension | Assessment |
|---|---|
| Functional correctness | Stays workflows are mixed with event workflows, increasing misnavigation risk. |
| Data/API integrity | The authenticated role is HOST, so the shell mismatch appears to be frontend mode/shell selection rather than identity absence. |
| UX | Hosts are shown irrelevant event controls and may create events instead of managing stays. |
| Security/operations | Cross-mode leakage complicates authorization expectations and support triage, even if backend role checks remain intact. |

**Recommendation:** Centralize dashboard shell selection by role and active product mode. Stays routes under `/dashboard/stays/**` should render Stays navigation consistently after direct URL entry, browser refresh, and post-login redirect. Add route-level regression tests that assert Stays navigation labels and absence of event-only controls for HOST sessions.

### P1-03 — My Properties data is available through the API but the list page can remain skeleton-only

Authenticated API probing showed `/api/properties/host` returned host properties with rooms and counts, including the seeded T1 records. Earlier list-page observations showed a skeleton-only loading state despite data being available, while direct detail/edit routes loaded correctly. This indicates a frontend response-shape or loading-state defect rather than missing data.[1] [3]

| Dimension | Assessment |
|---|---|
| Functional correctness | Hosts may be unable to discover or open properties from the list despite records existing. |
| Data/API integrity | The API response contains enough data for list cards. |
| UX | Persistent skeletons provide no error, retry, or empty-state distinction. |
| Security/operations | Operators may incorrectly reseed data or investigate database state when the failure is frontend rendering. |

**Recommendation:** Audit the properties list component for API response handling, loading-state finalization, and error-state presentation. The page should distinguish loading, empty, failed, and populated states and should render direct retry guidance when the API call fails.

### P1-04 — Add Property succeeds server-side but leaves the UI stuck on `Creating...`

Submitting a temporary A2 property left the create page at `/dashboard/stays/properties/new` with the primary button stuck on `Creating...`, no navigation, and no visible success or validation error. Authenticated API verification later confirmed that the property was created server-side. This creates duplicate-submit risk and misleads the host into thinking the action failed.[1]

| Dimension | Assessment |
|---|---|
| Functional correctness | Create completes in the database but not in the user workflow. |
| Data/API integrity | Backend success is not translated into client success state. |
| UX | The user receives neither confirmation nor redirection and may retry. |
| Security/operations | Duplicate properties and support cleanup work are likely without idempotency or clear recovery. |

**Recommendation:** Fix the create mutation success handler, normalize API response expectations, and navigate to the created property detail or properties list after success. Disable repeated submissions only while the request is in flight, then recover on success or failure with explicit toast and inline error states.

### P1-05 — Bookings page displays zero reservations and an internal-error toast

The bookings route rendered reservation summary cards and filters, but staging displayed zero totals, a “No reservations yet” empty state, and a visible `Failed to load bookings` / `Internal server error` message. Source inspection shows the page calls `GET /api/properties/host/bookings`, and the backend endpoint is intended to return host bookings with pagination. Direct probing confirmed other booking-related routes such as `/api/stays/bookings` are not valid, while `/api/bookings` returned an unrelated response shape.[1] [4]

| Dimension | Assessment |
|---|---|
| Functional correctness | Hosts cannot reliably view reservations across properties. |
| Data/API integrity | The failing host-bookings endpoint needs server-log diagnosis; the UI also masks failure with an empty state. |
| UX | Empty-state copy conflicts with an internal-error condition. |
| Security/operations | Booking visibility failures can cause missed check-ins, payout disputes, and support escalation. |

**Recommendation:** Diagnose the staging server error for `GET /api/properties/host/bookings`, verify `requireMode('STAYS')` context, and add API integration tests around seeded host bookings. The UI should show an error panel rather than “No reservations yet” when the request fails.

### P1-06 — Pricing, room management, and gallery management are not exposed as host workflows

The property detail page displayed one room and nightly rate, and the edit page exposed a cover image URL field. However, there was no host-facing control to add, edit, deactivate, or price rooms; no gallery upload or gallery URL management; and no dedicated pricing page. Direct navigation to `/dashboard/stays/pricing` returned a framework-level 404 even though Stays dashboard navigation previously advertised Pricing.[1] [2]

| Dimension | Assessment |
|---|---|
| Functional correctness | Hosts cannot maintain inventory, rates, or photo galleries through the portal. |
| Data/API integrity | Backend models expose rooms, rates, gallery URLs, and calendar pricing concepts that the UI does not surface. |
| UX | A visible Pricing navigation entry leads to a 404, reducing trust. |
| Security/operations | Manual database/API interventions may become necessary for basic host setup. |

**Recommendation:** Define a launch-minimum property management surface: room CRUD, nightly/base pricing, availability overrides, cover image management, gallery list management, and validation. Until implemented, hide or relabel the Pricing link to avoid a 404.

### P2-07 — Availability calendar is a placeholder rather than an operational calendar

The availability calendar route rendered a heading but did not show a property selector, room selector, date grid, availability rows, pricing controls, block-date controls, or calendar entries in the observed viewport. Direct API probing showed the seeded property calendar endpoint can return calendar entries, so the UI is not yet operational.[1] [3]

| Dimension | Assessment |
|---|---|
| Functional correctness | Hosts cannot view or manage availability from the calendar page. |
| Data/API integrity | Calendar data can exist in the API but is not rendered into a host workflow. |
| UX | The route appears present but lacks actionable content. |
| Security/operations | Inability to block dates or verify availability raises double-booking risk once channels are live. |

**Recommendation:** Implement property/room selection, date-grid rendering, status legend, blocked-date workflow, and pricing override workflow. The page should also show API errors and no-data states distinctly.

### P2-08 — Analytics route exists but does not provide actionable metrics or channel-sync observability

The analytics route eventually rendered **Stays Analytics** cards for total net revenue, properties, active rooms, and confirmed bookings, but all values rendered as em dashes. No Coastal Corridor sync status, sync error queue, external channel mapping, occupancy chart, property-level drill-down, or booking-source trend was visible.[1]

| Dimension | Assessment |
|---|---|
| Functional correctness | Hosts cannot assess property performance or sync health. |
| Data/API integrity | Metrics are not populated from seeded data or available dashboard stats. |
| UX | Placeholder dashes may be interpreted as missing business performance rather than incomplete analytics. |
| Security/operations | Missing sync observability will slow incident response for channel integration failures. |

**Recommendation:** Wire analytics to `/api/properties/host/dashboard-stats` or a dedicated analytics endpoint and include channel-sync health. If analytics are not in launch scope, show a “coming soon” card rather than metric placeholders.

### P2-09 — Reviews page is a non-actionable empty state

The reviews route rendered explanatory copy and a no-reviews empty state. No seeded reviews were expected, so the empty data itself is not a defect. The page nonetheless lacks reply controls, moderation state, filters, review details, property selection, and any visible API route for reviews; direct probing of `/api/reviews` returned 404.[1]

| Dimension | Assessment |
|---|---|
| Functional correctness | Review operations are not yet implemented beyond static presentation. |
| Data/API integrity | There is no obvious deployed reviews API endpoint for the host UI to consume. |
| UX | The empty state is acceptable only if reviews are intentionally future-scope. |
| Security/operations | Low immediate risk, but post-stay reputation management cannot be supported. |

**Recommendation:** Either mark reviews as future-scope in the UI or implement review listing, property filters, reply/moderation actions, and an explicit API contract.

### P2-10 — Delete/deactivate is API-capable but absent from the host UI

The temporary A2 audit property was cleaned up with authenticated `DELETE /api/properties/:id`, which returned success and the message `Property deactivated`. The follow-up active list did not include the temporary audit property. However, no visible delete/deactivate control was found on the property list, detail, or edit page.[1] [3]

| Dimension | Assessment |
|---|---|
| Functional correctness | Hosts cannot self-serve property deactivation through the UI. |
| Data/API integrity | The backend uses soft deletion/deactivation, which is appropriate for host inventory. |
| UX | The lack of a control forces support intervention. |
| Security/operations | A destructive action should have confirmation, consequence copy, and recovery guidance before exposure. |

**Recommendation:** Add a guarded deactivate flow with confirmation, audit copy, and clear effect on public listings and channels. Continue using soft delete/deactivation rather than hard deletion for operational safety.

### P3-11 — Messaging and host profile management routes are absent from the Stays dashboard inventory

The implemented Stays dashboard route inventory includes only landing, analytics, bookings, calendar, properties, property create/detail/edit, and reviews. There are no dedicated Stays routes for guest messaging, host profile/business settings, payout profile, tax/compliance fields, or support preferences.[2]

| Dimension | Assessment |
|---|---|
| Functional correctness | Important host operations are not currently represented. |
| Data/API integrity | No UI contract could be validated for these areas. |
| UX | Hosts have no discoverable place to manage communication or business identity. |
| Security/operations | Missing profile/payout/compliance flows should remain gated until design and authorization are complete. |

**Recommendation:** Confirm whether messaging and host profile management are A2 launch requirements. If not, remove them from launch acceptance criteria; if yes, add explicit route/API designs before implementation.

## Cross-cutting root-cause themes

The largest pattern is **mode-shell inconsistency**. Stays pages know enough to render host-specific content headings, but the shared dashboard shell can fall back to event navigation. This should be fixed centrally rather than page by page. A second pattern is **API/UI contract drift**: backend endpoints return useful Stays data, while frontend pages either do not consume the endpoint, mis-handle response shape, or do not transition out of loading states. A third pattern is **placeholder route exposure**: links and headings imply support for bookings, pricing, calendar, analytics, and reviews before the workflows are operational.[1] [2] [3]

| Theme | Examples | Recommended owner |
|---|---|---|
| Mode-shell inconsistency | Event sidebar on Stays bookings, reviews, analytics, property detail/edit, calendar | Web platform/dashboard shell owner |
| API/UI contract drift | Property list skeleton despite `/api/properties/host`; create stuck after backend success; bookings internal error | Full-stack Stays owner |
| Placeholder exposure | Pricing link routes to 404; analytics dashes; calendar no grid | Product plus frontend owner |
| Missing host operations | No gallery, room/rate management, messaging, profile, channel-sync management | Product scope owner |

## Recommended remediation sequence

The first remediation block should address launch blockers: host signup policy, dashboard shell mode selection, properties list loading, create success recovery, and bookings API failure. These fixes will turn the current seeded-host proof of access into a coherent basic portal. The second block should add minimum viable host inventory controls: property deactivate, room/rate CRUD, cover/gallery management, and calendar availability. The third block should decide whether analytics, reviews, messaging, host profile, and channel-sync management are launch features or clearly labelled post-launch areas.

| Sequence | Fix set | Exit criteria |
|---|---|---|
| 1 | Host signup policy, Stays shell, properties list, create recovery, bookings loading | A seeded and/or newly provisioned host can log in, see Stays navigation, list properties, create a property, and view bookings without contradictory empty/error states. |
| 2 | Deactivate flow, room/rate CRUD, gallery/cover management, operational calendar | A host can maintain publishable inventory without support or database intervention. |
| 3 | Analytics, reviews, messaging, host profile, channel-sync management | Remaining screens are either operational or explicitly hidden/marked as future-scope. |

## Suggested acceptance tests

The next implementation pass should add automated tests that cover direct URL entry as well as navigation clicks. Direct route access is important because many of the observed shell defects appeared after opening `/dashboard/stays/**` paths directly in an authenticated browser session.[1]

| Test | Expected result |
|---|---|
| Register with `role: HOST`, or host invitation flow if gated | Either creates a host account and redirects to Stays, or shows an intentional gated-host onboarding path. |
| Load `/dashboard/stays/properties` as HOST | Renders Stays sidebar, property cards, no endless skeleton, and no event creation controls. |
| Submit `/dashboard/stays/properties/new` | Backend creates the property, UI exits loading, and user lands on detail or list. |
| Save `/dashboard/stays/properties/:id/edit` | UI persists changes and shows confirmation or navigates predictably. |
| Deactivate property from UI | Confirmation appears, API soft-deactivates, active list removes the property, and inactive state is recoverable or documented. |
| Load `/dashboard/stays/bookings` with seeded bookings | Renders reservations, stats, filters, and error state only on real failure. |
| Load `/dashboard/stays/calendar` | Renders property/room selector, calendar entries, availability states, and block/update actions. |
| Load `/dashboard/stays/pricing` or remove link | Pricing route exists and is operational, or the navigation link is hidden. |
| Load all Stays routes directly | All routes show Stays shell and no event-only navigation. |

## Cleanup and data safety

One temporary audit property was created during the test flow and then cleaned up through the authenticated staging API. The cleanup used the non-versioned route `DELETE /api/properties/:id`, returned `Property deactivated`, and follow-up active-list verification found no `A2 Audit Temporary` property. No production routes were accessed, no secrets were committed, and the report intentionally omits any password value.[1]

## References

[1]: ./a2-host-portal-audit-notes.md "Live A2 staging audit notes captured during browser and API verification"  
[2]: ../apps/web/src/app/dashboard/stays "Stays dashboard route inventory in the web application"  
[3]: ../apps/api/src/routes/properties.ts "Properties API routes, including host property, calendar, bookings, rooms, and delete/deactivate endpoints"  
[4]: ../apps/web/src/app/dashboard/stays/bookings/page.tsx "Stays bookings page implementation and API consumption"
