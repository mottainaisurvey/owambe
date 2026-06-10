# A3a-1 Host Self-Registration Investigation

**Prepared for:** Owambe coordinator territory  
**Branch:** `investigate/A3a-1-host-self-registration`  
**Date:** 2026-06-10  
**Scope:** Preparatory investigation only. This document identifies the current state and required implementation work for the public host self-registration sub-feature. It does **not** implement code changes and should not be merged to staging without explicit founder/coordinator authorization.

## Executive summary

The current public registration flow does **not** support direct Host/Stays self-registration. The deployed staging web UI at `/register` exposes only `PLANNER`, `VENDOR`, and `CONSUMER` account choices, and the backend `/api/auth/register` validator rejects `HOST` submissions.[1] [2] The database schema already contains the `HOST` role, the `Host` profile model, and Stays mode infrastructure, so the blocker is not schema absence.[3] The blocker is that the public registration contract, role-specific profile creation, mode defaults, and post-registration hydration/redirect logic are still event-centric.

The most important implementation conclusion is that adding `HOST` to the frontend selector and backend validator would be **insufficient**. A usable Host self-registration path must create a `User` with `role: HOST`, create the related `Host` row, set `activeMode` to `STAYS`, set `availableModes` to include `STAYS`, hydrate host profile data in `/auth/me` and login responses, and route the user into the Stays dashboard after sign-in.[3] [4] [5] [6] Otherwise, a newly created Host may either be rejected, be accepted without a host profile, or land in the wrong Events-mode dashboard shell.

## Evidence matrix

| Area | Current evidence | Product consequence |
|---|---|---|
| Staging public web UI | `/register` on Railway staging renders “Event Planner”, “Vendor / Business”, and “Planning My Own Event”; no Host, Stays, property, apartment, or property-manager option is visible. | Hosts cannot discover or select a self-registration path from the public registration page. |
| Web registration source | `apps/web/src/app/register/page.tsx` defines `role: z.enum(['PLANNER', 'VENDOR', 'CONSUMER'])` and a `ROLES` array containing only those three values.[1] | The web client blocks HOST selection at both UI and form-schema layers. |
| Backend register validator | `apps/api/src/routes/auth.ts` validates `body('role').isIn(['PLANNER', 'VENDOR', 'CONSUMER'])`.[2] | Even a crafted request with `role: 'HOST'` is rejected before controller execution. |
| Backend register controller | `apps/api/src/controllers/auth.controller.ts` creates Planner and Consumer profile rows, leaves Vendor to complete later, and has no `HOST` branch.[4] | If validation were widened alone, a Host user could be created without a corresponding row in `hosts`. |
| Schema readiness | `apps/api/prisma/schema.prisma` includes `UserRole.HOST`, `PlatformMode.STAYS`, `User.host`, and `model Host`.[3] | The data model can support host accounts, but registration must deliberately populate host-specific state. |
| Mode defaults | The `User` model defaults `activeMode` to `EVENTS` and `availableModes` to `[EVENTS]`.[3] | A naive HOST registration would inherit Events mode and fail to behave like a Stays host. |
| Login redirect | `apps/web/src/app/login/page.tsx` redirects `user.role === 'HOST'` to `/dashboard/stays`.[5] | The login page has a HOST route branch, but it depends on the backend returning a coherent HOST user and mode state. |
| Dashboard shell | `apps/web/src/app/dashboard/layout.tsx` chooses navigation from `activeMode`, not directly from `role`; if `activeMode` remains `EVENTS`, the shell renders Events navigation even on Stays pages.[6] | HOST registration must set/preserve `activeMode: STAYS`; role-only routing is not enough. |
| Mode API | `apps/api/src/routes/mode.ts` only allows switching to modes present in `availableModes`.[7] | A Host whose `availableModes` lacks `STAYS` cannot reliably recover through the mode switcher. |
| `/auth/me` hydration | `getMe` selects planner, vendor, and consumer relations, but not host or operator.[4] | Refreshed HOST sessions would not hydrate the host profile expected by the frontend auth store. |
| Mobile registration | `apps/mobile/app/(auth)/register.tsx` also exposes only `PLANNER`, `VENDOR`, and `CONSUMER`.[8] | Public self-registration would remain inconsistent across web and mobile if only the web page changes. |

## Current-state assessment

The web registration page is hard-coded around the Events-side platform experience. Its page copy says “Free forever for event planners” and “Join 200+ vendors and planners on Owambe.” Its role selector offers only event-planning and event-vendor personas. The form schema enforces the same limitation with a `z.enum` that excludes `HOST`, so the absence of Host is not only a missing visual card; it is part of the client-side validation contract.

The backend is equally restrictive. The `/auth/register` route accepts only `PLANNER`, `VENDOR`, and `CONSUMER` in its validator. The controller then creates a base `User` and selectively creates profile records for `PLANNER` and `CONSUMER`, while `VENDOR` is deferred to later profile completion. There is no branch for `HOST`, no host business/profile data mapping, and no explicit Stays mode assignment.

The schema confirms that Host accounts are a supported concept elsewhere in the platform. `UserRole` already includes `HOST`, the `User` model has a one-to-one `host` relation, and `model Host` contains fields such as `businessName`, `city`, `state`, `country`, `phone`, `bio`, verification status, banking fields, and host rating metadata. This means A3a-1 can be implemented without inventing a new role model, but it must still define the registration-time profile semantics.

The strongest cross-cutting issue is mode state. New users currently default to `activeMode: EVENTS` and `availableModes: [EVENTS]`. The dashboard layout selects navigation from `activeMode`; therefore, a Host user with the wrong active mode can still see the Events sidebar and event-oriented shell even if the login page routes them to `/dashboard/stays`. The mode API further enforces that a user can only switch into a mode present in `availableModes`, so `availableModes` must include `STAYS` at registration time for a self-registered host.

## Required implementation changes

| Layer | Required change | Notes |
|---|---|---|
| Web public registration UI | Add a Host/Stays role option with property-manager-oriented copy and update the form schema to accept `HOST`. | The current event-centric header and supporting copy should be adjusted so the page does not imply that registration is only for planners and event vendors. |
| Web registration payload | Include any minimum host profile fields needed at creation time, or intentionally allow profile completion after first login. | If profile completion is deferred, the controller still needs to create the `Host` row with safe defaults where required. |
| Backend validation | Add `HOST` to the `/auth/register` role allow-list. | This is necessary but not sufficient. |
| Backend registration controller | Add a `role === 'HOST'` branch that creates the `Host` relation and sets Stays mode state on the user. | Recommended user data: `role: 'HOST'`, `activeMode: 'STAYS'`, `availableModes: { set: ['STAYS'] }` or `['EVENTS','STAYS']` depending on product policy. The branch should create `tx.host.create({ data: { userId: u.id, businessName/companyName?, country: 'NG', ... } })`. |
| Auth response hydration | Include `host` in login and `/auth/me` profile selection/response handling. | The frontend auth store already defines `user.host`, but the current API responses do not populate it. |
| Post-registration UX | Decide whether successful registration remains email-verification-first or offers a Host-specific next step. | Current web and mobile flows show “Check your email” and route to login. If that remains, the login path must land hosts in `/dashboard/stays` with Stays navigation after verification/sign-in. |
| Dashboard/mode consistency | Ensure created Host users have `activeMode: STAYS` and `availableModes` including `STAYS`. | Without this, HOST login routing can still produce event-mode navigation leakage. |
| Mobile registration | Mirror the Host option and contract if public self-registration includes mobile. | Otherwise, web and mobile public account creation surfaces will diverge. |
| Tests | Add API validation/controller tests plus at least one web registration test for Host visibility and payload submission. | Tests should assert both role acceptance and mode/profile side effects. |

## Recommended registration contract

A3a-1 should explicitly define the self-registration contract before implementation. The minimum viable Host self-registration contract should be:

| Field | Source | Purpose |
|---|---|---|
| `firstName` | Existing register form | Required user identity. |
| `lastName` | Existing register form | Required user identity. |
| `email` | Existing register form | Required login and verification identity. |
| `password` | Existing register form | Required email-auth credential. |
| `role: 'HOST'` | New role option | Creates a Host account rather than an event planner/vendor/consumer account. |
| `businessName` or `companyName` | New or reused optional field | Seeds `Host.businessName`; can remain optional if host profile completion is deferred. |
| `phone`, `city`, `state` | Optional follow-on fields | Useful for host onboarding but not strictly required by the current `Host` schema. |

The backend should treat this as a Stays account at creation time. A self-registered Host should receive `activeMode: STAYS` and `availableModes` containing `STAYS`. Whether `EVENTS` remains available to a Host should be a product decision. From a defect-prevention standpoint, omitting `STAYS` is unacceptable; including only `EVENTS` would reproduce the mode-context leakage seen in the A2 audit.

## Redirect and onboarding implications

Current web login logic already contains a direct branch for `HOST` users: it calls `router.replace('/dashboard/stays')` when `user.role === 'HOST'`. That is directionally correct for A3a-1. However, the dashboard shell selects its sidebar and page context from `activeMode`, not from `role`. Therefore, the post-login experience is correct only if the backend also returns `activeMode: STAYS` and `availableModes` including `STAYS`.

The current registration success state does not automatically log the user in; it asks the user to check email and then sign in. This can remain acceptable for A3a-1 if the subsequent login sends the user to `/dashboard/stays`. If the product wants an immediate Host onboarding wizard, that would be a separate UX decision and should be scoped deliberately rather than hidden inside the role-enablement change.

## Risk assessment

| Risk | Severity | Explanation | Mitigation |
|---|---:|---|---|
| Validator-only change creates unusable Host accounts | High | A HOST user could be accepted but lack a `Host` profile and Stays mode access. | Implement registration, profile creation, mode assignment, and auth hydration together. |
| Events-mode leakage after HOST login | High | Dashboard navigation is active-mode driven; defaults currently point to Events. | Set `activeMode: STAYS` and include `STAYS` in `availableModes` for self-registered hosts. |
| Inconsistent web/mobile signup | Medium | Mobile registration duplicates the same three-role event-only selector. | Include mobile in A3a-1 or explicitly defer it with a documented product decision. |
| Host profile data absent after refresh | Medium | `/auth/me` does not select `host`, so refresh can drop host context. | Add `host: true` to auth hydration responses. |
| Ambiguous businessName/companyName semantics | Low to Medium | The existing web form only shows company name for planners. | Rename/reuse as “Business or property brand name” for Host, or defer to profile completion. |

## Suggested acceptance criteria for the formal A3a-1 cycle

A formal implementation cycle should be considered complete only when all of the following are true:

1. The public web registration page presents a clear Host/Stays signup option.
2. Submitting the Host option sends `role: 'HOST'` to `/api/auth/register` without client-side schema rejection.
3. The backend validator accepts `HOST` and rejects only unsupported roles.
4. A successful Host registration creates a `User` with `role: HOST`, creates the related `Host` profile row, and sets Stays mode access.
5. Login after registration returns the Host account with `activeMode: STAYS`, `availableModes` including `STAYS`, and host profile data available to the frontend.
6. A Host login lands on `/dashboard/stays` and renders the Stays dashboard shell, not the Events dashboard shell.
7. `/auth/me` continues to hydrate the Host profile and mode state after refresh.
8. Mobile public registration either exposes the same Host path or has an explicit documented deferral.
9. Automated tests cover backend role validation, host profile creation, mode assignment, and at least one frontend Host option rendering/submission path.

## Conclusion

A3a-1 is a contained but multi-layer feature. The platform already has the core Host role and data model, so the work is primarily to connect public registration to that model correctly. The implementation should not be reduced to adding a role card. The correct unit of work is **Host self-registration as a usable Stays account creation flow**, including backend role acceptance, host profile creation, Stays mode assignment, auth hydration, and mode-consistent post-login routing.

## References

[1]: ../apps/web/src/app/register/page.tsx "Web public registration page"
[2]: ../apps/api/src/routes/auth.ts "Backend auth route validator"
[3]: ../apps/api/prisma/schema.prisma "API Prisma schema role, mode, user, and host models"
[4]: ../apps/api/src/controllers/auth.controller.ts "Backend auth controller register, login, and me handlers"
[5]: ../apps/web/src/app/login/page.tsx "Web login redirect logic"
[6]: ../apps/web/src/app/dashboard/layout.tsx "Dashboard mode-aware layout"
[7]: ../apps/api/src/routes/mode.ts "Mode switching API"
[8]: ../apps/mobile/app/(auth)/register.tsx "Mobile public registration screen"
