# Placeholder CTA Audit — Pre-Implementation Baseline

Generated: 2026-05-29 (before path-Z dead-link fix)

---

## verify-1: owambe.com/ — All clickable links/CTAs

| Element | Target Route | Status |
|---|---|---|
| Logo (nav) | `/` | 200 ✓ |
| Nav: Browse Vendors | `/vendors` | **404 DEAD** |
| Nav: For Hosts | `/stays` | **404 DEAD** |
| Nav: CC Cohort Offer | `/coastal-corridor-cohort` | 200 ✓ |
| Nav: Sign in | `/login` | **404 DEAD** |
| Nav: Get started | `/register` | **404 DEAD** |
| Hero CTA: Get early access | `/register` | **404 DEAD** |
| Hero CTA: Browse vendors | `/vendors` | **404 DEAD** |
| Events mode card CTA: Start planning | `/login` | **404 DEAD** |
| Stays mode card CTA: Learn about Stays | `/stays` | **404 DEAD** |
| Experiences mode card CTA: Register interest | `/login` | **404 DEAD** |
| Vendors mode card CTA: Browse vendors | `/vendors` | **404 DEAD** |
| Cohort section: See the full cohort offer details | `/coastal-corridor-cohort` | 200 ✓ |
| Footer: hello@owambe.com | `mailto:hello@owambe.com` | N/A (email) |
| Footer: Terms | `/terms` | **404 DEAD** |
| Footer: Privacy | `/privacy` | **404 DEAD** |

**Dead-link count on /: 10 dead CTAs**

---

## verify-2: owambe.com/coastal-corridor-cohort — All clickable links/CTAs

| Element | Target Route | Status |
|---|---|---|
| Logo (nav) | `/` | 200 ✓ |
| Nav: Sign in | `/login` | **404 DEAD** |
| Nav: Get started | `/register` | **404 DEAD** |
| Interest form (top): Register interest | POST `/api/cohort/interest` | 200 ✓ |
| Interest form (bottom): Register interest | POST `/api/cohort/interest` | 200 ✓ |
| Footer: Privacy | `/privacy` | **404 DEAD** |
| Footer: Terms | `/terms` | **404 DEAD** |
| Footer: Contact | `/contact` | **404 DEAD** |
| Footer: Stays | `/stays` | **404 DEAD** |

**Dead-link count on /coastal-corridor-cohort: 6 dead CTAs**

---

## verify-3: Total dead-link count

- Homepage (`/`): **10 dead CTAs**
- Cohort page (`/coastal-corridor-cohort`): **6 dead CTAs**
- **Total: 16 dead CTAs across both pages**

---

## path-Z fix scope

Per founder direction:
- Nav links routing to dead routes → anchor-links to page sections OR removed
- Mode card CTAs → "Launching soon — Notify me" scroll-to-form pattern
- Hero CTAs → scroll-to-form pattern
- Footer dead links (/terms, /privacy, /contact, /stays) → removed or replaced with mailto
- /coastal-corridor-cohort nav (Sign in / Get started) → removed or scroll-to-form
- /coastal-corridor-cohort footer dead links → removed
