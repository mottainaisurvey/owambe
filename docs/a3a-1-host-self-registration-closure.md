# A3a-1 Host Self-Registration Implementation Closure

**Author:** Manus AI  
**Date:** 2026-06-10  
**Branch:** `fix/A3a-1-host-self-registration`  
**Status:** Ready for coordinator review; **not merged to `staging`** pending founder authorization.

## Executive Summary

A3a-1 implemented the authorized **web-only Host self-registration cycle** for Owambe Stays. The public web registration page now exposes a Host / Property Manager option, permits `HOST` in the client-side schema, and collects an optional host business name that is sent through the existing registration payload.[^web-register] The backend registration validator now accepts `HOST`, and the registration controller creates a user with Stays-mode defaults plus a linked Host profile in the same transaction.[^auth-route] [^auth-register]

The implementation also closes the post-registration and post-login hydration gap identified during the A3a-1 investigation. Host users now receive `activeMode: 'STAYS'`, `availableModes: ['STAYS']`, and Host profile hydration during login; `/auth/me` also includes the host relation so existing mode and dashboard logic can identify the account as a Stays host.[^auth-login] [^auth-me] Automated API coverage was added for Host registration defaults, Host profile creation, and Host login hydration.[^api-tests]

## Scope Boundaries

This change intentionally limits the production code implementation to the **web registration surface and backend registration/authentication contract**. It does not introduce mobile registration changes, property onboarding changes, seeded data changes, or any staging merge. The coordinator instruction separated web completion from the later mobile follow-up, so mobile parity remains deferred as **A3a-1b**.

| Area | Outcome | Notes |
|---|---:|---|
| Web public registration | Completed | Host / Property Manager is now a selectable account type and `HOST` is accepted by the client schema.[^web-register] |
| Backend `/auth/register` validator | Completed | `HOST` is now included in the allowed registration role list.[^auth-route] |
| Backend Host user creation | Completed | Host registrations set Stays mode defaults and create a linked Host profile in a database transaction.[^auth-register] |
| Login hydration | Completed | Host login returns the resolved profile and an explicit `host` alias for frontend compatibility.[^auth-login] |
| `/auth/me` hydration | Completed | The authenticated user response now selects the host relation.[^auth-me] |
| Automated API coverage | Completed | Targeted tests cover Host registration and Host login hydration.[^api-tests] |
| Mobile registration | Deferred | Mobile public self-registration remains out of scope for A3a-1 and should be handled under A3a-1b. |
| Merge to `staging` | Deferred | The feature branch must not be merged until founder authorization is given. |

## Implementation Detail

The web registration form was updated in `apps/web/src/app/register/page.tsx`. The Zod schema now includes `HOST`, the role selection cards include a Host / Property Manager option, and the optional organization input adapts its label and placeholder for Host signups. This keeps the public web registration flow consistent with the existing form model while opening a Stays-specific account creation path.[^web-register]

On the API side, `apps/api/src/routes/auth.ts` now permits `HOST` in the registration validator. The controller changes in `apps/api/src/controllers/auth.controller.ts` preserve the existing planner, vendor, and consumer behavior, while adding a Host branch. When the role is `HOST`, the user create payload assigns `activeMode: 'STAYS'` and `availableModes: ['STAYS']`, and the same transaction creates a Host profile with the optional `companyName` saved as `businessName`.[^auth-route] [^auth-register]

The authentication hydration changes were kept intentionally narrow. During login, the controller now resolves `prisma.host.findUnique({ where: { userId: user.id } })` for Host users and returns that profile both through the existing `profile` field and a `host` alias. The alias was added to protect existing frontend assumptions that may inspect role-specific relation keys rather than the generic profile field.[^auth-login] The `/auth/me` selection now includes `host: true`, making the authenticated session response compatible with Stays mode checks after a token refresh or page reload.[^auth-me]

## Validation Evidence

A local CI-equivalent database-backed validation environment was created in the sandbox because the repository API tests require PostgreSQL, Redis, and a generated Prisma client. The test database used the same shape as the CI workflow: PostgreSQL database `owambe_test`, user `owambe`, password `testpass`, plus Redis on localhost. Prisma migrations were deployed before running the targeted API test file.

| Validation | Command | Result |
|---|---|---:|
| Prisma migrations for API test database | `cd apps/api && DATABASE_URL='postgresql://owambe:testpass@localhost:5432/owambe_test' npx prisma migrate deploy` | Passed |
| Targeted API regression suite | `cd apps/api && DATABASE_URL='postgresql://owambe:testpass@localhost:5432/owambe_test' REDIS_URL='redis://localhost:6379' JWT_SECRET='test-jwt-secret-minimum-32-characters-long' NODE_ENV=test OPENAI_API_KEY='sk-test-placeholder-not-used-in-tests' COASTAL_CORRIDOR_SHARED_SECRET='test-cc-shared-secret-placeholder' COASTAL_CORRIDOR_WEBHOOK_SECRET='test-cc-webhook-secret-placeholder' npm test -- --runInBand src/__tests__/api.test.ts` | Passed: 54 tests, 1 suite |

The targeted API run completed successfully with the new Host-specific assertions included. The test output reported `PASS src/__tests__/api.test.ts`, `Test Suites: 1 passed, 1 total`, and `Tests: 54 passed, 54 total`.[^test-output]

## Acceptance Criteria Mapping

| Acceptance Criterion | Evidence | Status |
|---|---|---:|
| Public web users can choose Host/Stays during signup. | The web registration schema and role card list now include `HOST` and a Host / Property Manager option.[^web-register] | Met |
| API accepts Host registration payloads. | `/auth/register` validator includes `HOST` in the allowed role set.[^auth-route] | Met |
| Host registrations receive Stays mode defaults. | The registration controller assigns `activeMode: 'STAYS'` and `availableModes: ['STAYS']` for Host users.[^auth-register] | Met |
| Host registrations create a Host profile. | The registration transaction creates `tx.host.create({ data: { userId: u.id, businessName: companyName } })`.[^auth-register] | Met |
| Host login hydrates Host profile data. | Login resolves the Host profile and returns it as both `profile` and `host` for Host users.[^auth-login] | Met |
| `/auth/me` supports Host session hydration. | The authenticated user selection now includes `host: true`.[^auth-me] | Met |
| Automated regression coverage exists. | API tests include Host registration and Host login hydration coverage; targeted suite passes locally.[^api-tests] [^test-output] | Met |
| Mobile registration is not changed in this cycle. | No mobile production file was modified in the current diff. | Met / Deferred to A3a-1b |
| Feature branch remains unmerged. | Work is on `fix/A3a-1-host-self-registration`; merge to `staging` is pending founder authorization. | Met |

## A3a-1b Mobile Deferral

Mobile self-registration should be handled as a separate A3a-1b work item. The deferred scope should update the mobile registration role selection, payload schema, and any post-registration mobile routing expectations to match the web and API contract completed here. Until that follow-up lands, Host self-registration should be treated as **web-supported only**.

## Coordinator Notes

The branch is ready for review after commit and push. The coordinator should verify that the implementation branch is reviewed against `staging` and that no merge is performed until explicit founder authorization is received. The intended review focus is narrow: Host account creation, Stays mode defaults, Host profile hydration, and regression safety for existing planner, vendor, and consumer registration paths.

## References

[^web-register]: `apps/web/src/app/register/page.tsx` — web registration schema, role selection, and Host business-name input updates.
[^auth-route]: `apps/api/src/routes/auth.ts` — `/auth/register` validator role allow-list update.
[^auth-register]: `apps/api/src/controllers/auth.controller.ts` lines 23-62 — Host registration defaults and Host profile creation in the registration transaction.
[^auth-login]: `apps/api/src/controllers/auth.controller.ts` lines 115-149 — Host login profile resolution and `host` response alias.
[^auth-me]: `apps/api/src/controllers/auth.controller.ts` lines 260-273 — `/auth/me` user selection including the Host relation.
[^api-tests]: `apps/api/src/__tests__/api.test.ts` — targeted Host registration defaults, profile creation, and login hydration regression coverage.
[^test-output]: `/home/ubuntu/terminal_full_output/2026-06-10_14-37-05_287351_3356.txt` — local targeted API test output showing the updated suite passing with 54 tests.
