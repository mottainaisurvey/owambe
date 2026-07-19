# OWB-C-CONSUMER-ENTRY-01 — AC-0 Facts

## Baseline SHA
`a99a38add4488592117982d8d2a3066ceed8b90f`

## Pre-change: Registration Chooser (register/page.tsx lines 24-30)
```typescript
const ROLES = [
  { value: 'PLANNER', label: '📋 Event Planner', desc: 'I manage events for clients or my company' },
  { value: 'VENDOR', label: '🏢 Vendor / Business', desc: 'I offer services for events (venue, catering, etc.)' },
  { value: 'HOST', label: '🏠 Host / Property Manager', desc: 'I list and manage short-stay properties on Owambe Stays' },
  { value: 'OPERATOR', label: '🌍 Hosting Experiences / Tours', desc: 'I offer cultural tours, food tastings, workshops, and other guest experiences' },
  { value: 'CONSUMER', label: '🎉 Planning My Own Event', desc: 'I want to plan a personal event using AI' },
];
```

## Pre-change: Auth Controller Hydration Block (auth.controller.ts lines 42-53)
```typescript
          ...(role === 'HOST'
            ? {
                activeMode: 'STAYS',
                availableModes: ['STAYS'],
              }
            : role === 'OPERATOR'
            ? {
                activeMode: 'EXPERIENCES',
                availableModes: ['EXPERIENCES'],
              }
            : {}),
```
CONSUMER falls into `{}` → Prisma defaults: `activeMode: 'EVENTS'`, `availableModes: ['EVENTS']`

## Pre-change: Dashboard Routing (dashboard/page.tsx lines 222-228)
```typescript
export default function DashboardPage() {
  const { activeMode } = useAuthStore();
  if (activeMode === 'EXPERIENCES') {
    return <ExperiencesDashboard />;
  }
  return <EventsDashboard />;
}
```
No CONSUMER role check. No redirect. Renders operator/business surface for all non-EXPERIENCES modes.

## Pre-change: Login Page Routing (login/page.tsx lines 35-43)
```typescript
      if (user?.role === 'ADMIN') router.replace('/admin');
      else if (user?.role === 'VENDOR') router.replace('/vendor');
      else if (user?.role === 'HOST') router.replace('/dashboard/stays');
      else {
        const activeMode = useAuthStore.getState().activeMode;
        if (activeMode === 'STAYS') router.replace('/dashboard/stays');
        else router.replace('/dashboard');
      }
```
CONSUMER routes to `/dashboard` (no special handling).

## Pre-change: Dashboard Layout Auth Guard (dashboard/layout.tsx line 179)
```typescript
    if (_hasHydrated && !isAuthenticated) router.replace('/login');
```
No CONSUMER-specific redirect. No `?redirect=` param passed.

## Pre-change: Stays Booking Login Redirect Pattern
```typescript
href={`/login?redirect=${encodeURIComponent(...)}`}
```
The Stays booking client already uses `?redirect=` param in the login link.
The login page does NOT currently read the `?redirect=` param — no `useSearchParams` in login/page.tsx.

## E-4: AI Event Builder Facts
- Route: `/plan` (public, no auth guard on the page)
- Renders: Full AI Event Planner chat interface ("Plan your perfect event")
- Auth posture: Page accessible without login; backend `/api/ai/*` uses `authenticate` middleware (hard 401)
- The `authenticate` middleware blocks unauthenticated API calls but the page renders
- Conclusion: `/plan` is a valid destination for the "plan a personal event" consumer intent
- E-4 disposition: NOT ADVERSE — no HALT

## Experiences Booking Auth State
- `ExperiencesBookingClient.tsx` has NO auth check before the Book button
- On 401 from API: sets error state "Please log in to book this experience."
- No redirect to login with `?redirect=` param — just an inline error message
- This is the gap E-3 addresses

## Test Files Available
- `apps/api/src/__tests__/` contains 16 test files
- New test file needed: `consumerEntry01.test.ts` (or similar)
- Tests needed: role mapping, intent-derived mode hydration, dashboard redirect, redirect continuity

## Implementation Plan
### E-1: Two-tier registration surface (register/page.tsx)
- Tier 1: 4 supply/business identities (PLANNER, HOST, OPERATOR, VENDOR) — unchanged roles
- Tier 2: 3 consumer intents (CONSUMER role):
  - "Book a Stay" → STAYS mode → /stays catalogue
  - "Book an Experience" → EXPERIENCES mode → /experiences catalogue  
  - "Attend an Event" → EVENTS mode → /events catalogue
  - "Plan a Personal Event" → EVENTS mode → /plan (AI Event Builder)
- PMOE removed as peer business identity
- Consumer intents create no workspace (same CONSUMER role, different mode)
- New field: `consumerIntent` to pass to API for mode hydration

### E-2: D-7 correction (auth.controller.ts + dashboard/page.tsx)
- API: Add CONSUMER intent → mode mapping in registration handler
  - 'STAY' intent → activeMode: 'STAYS', availableModes: ['STAYS']
  - 'EXPERIENCE' intent → activeMode: 'EXPERIENCES', availableModes: ['EXPERIENCES']
  - 'EVENT'/'PERSONAL_EVENT' intent → activeMode: 'EVENTS', availableModes: ['EVENTS']
- Dashboard: CONSUMER role → redirect to appropriate consumer destination, never render operator surface
  - STAYS mode CONSUMER → /stays
  - EXPERIENCES mode CONSUMER → /experiences
  - EVENTS/PERSONAL_EVENT mode CONSUMER → /plan or /events

### E-3: Sign-in redirect continuity (login/page.tsx + ExperiencesBookingClient.tsx)
- Login page: read `?redirect=` param and use it after successful login
- Experiences booking: when 401 received, redirect to `/login?redirect=/experiences` (or with slot context)
- CONSUMER post-login: never → /dashboard, always → redirect target or appropriate consumer surface
