# OWAMBE-DOT-COM-PLACEHOLDER-01 Completion Report

## Executive Summary

The `OWAMBE-DOT-COM-PLACEHOLDER-01` task has been successfully completed. The substantive placeholder homepage has been deployed to Railway production, replacing the pre-launch "Event Planning" page. The CI/CD pipeline failures have been resolved by migrating the web deployment steps from Vercel to Railway, aligning the web infrastructure with the API infrastructure. All Acceptance Criteria (AC-1 through AC-7) have been verified on the live production environment.

## Deployment Status

The placeholder is now live on the Railway production environment.

*   **Production URL:** [https://owambe-web-production.up.railway.app](https://owambe-web-production.up.railway.app)
*   **Staging URL:** [https://owambe-web-staging.up.railway.app](https://owambe-web-staging.up.railway.app) (Note: Staging requires a branch sync to reflect the latest `main` branch changes, specifically the AC-7 `noindex` fix).

## Resolution of CI/CD Pipeline Failures

The CI/CD pipeline was failing at the "Deploy Web to Production (Vercel)" step due to missing GitHub Actions secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).

**Investigation Findings:**
1.  The API was already being deployed to Railway (`deploy-api-production` step).
2.  The web application was configured to deploy to Vercel in the workflow, but the founder confirmed the web application is actually hosted on Railway.
3.  The Vercel deployment steps were stale and incorrectly configured for the current infrastructure.

**Applied Fix:**
The `.github/workflows/ci-cd.yml` file was updated to replace the Vercel deployment steps with Railway deployment steps. The workflow now uses the existing `RAILWAY_TOKEN` and `RAILWAY_TOKEN_STAGING` secrets to deploy both the API and the Web application to Railway.

*   Commit: `397d1e2`
*   CI/CD Run: `26583254379` (All jobs passed successfully).

## Acceptance Criteria Verification

All spot-checks were performed against the live Railway production URL.

| Criteria | Description | Status | Verification Detail |
| :--- | :--- | :--- | :--- |
| **AC-1** | Page loads with HTTP 200 | **Passed** | Verified via `curl -s -o /dev/null -w "%{http_code}"`. Returned `200`. |
| **AC-2** | Title contains 'Owambe' | **Passed** | Verified `<title>Owambe — Nigeria's Platform for Events, Stays & Experiences</title>`. |
| **AC-3** | Four mode cards present | **Passed** | Verified presence of "Owambe Events", "Owambe Stays", "Owambe Experiences", and "Vendors Marketplace". |
| **AC-4** | Coastal Corridor cohort section present | **Passed** | Verified presence of the "Coastal Corridor cohort — exclusive offer" section. |
| **AC-5** | Interest capture form present | **Passed** | Verified presence of the email input field and the `/api/cohort/interest` endpoint integration. |
| **AC-6** | `/login` and `/register` links present | **Passed** | Verified presence of both navigation links. |
| **AC-7** | `noindex` meta tag present | **Passed** | Verified `<meta name="robots" content="noindex, nofollow"/>`. This required converting `page.tsx` to a Server Component wrapper to export metadata, as Next.js 14 App Router does not support metadata exports from Client Components. |

## DNS Migration Preparation (owambe.com Cutover)

To complete the cutover and point the `owambe.com` custom domain to the new Railway production deployment, the following DNS changes are required at your domain registrar (e.g., GoDaddy, Namecheap, Cloudflare).

**Required DNS Records:**

1.  **CNAME Record (for www)**
    *   **Type:** CNAME
    *   **Name/Host:** `www`
    *   **Value/Target:** `owambe-web-production.up.railway.app` (or the specific custom domain target provided in the Railway dashboard under the `owambe-web` service settings).
    *   **TTL:** Auto or 3600 (1 hour)

2.  **A Records (for root domain - if Railway provides IP addresses)**
    *   *Note: Railway typically prefers CNAME flattening or ALIAS records at the root. If your DNS provider supports ALIAS/ANAME, use that to point the root `@` to the Railway URL. If they only support A records, you must obtain the specific IP addresses from the Railway dashboard.*
    *   **Type:** ALIAS / ANAME (Preferred)
    *   **Name/Host:** `@` (or leave blank)
    *   **Value/Target:** `owambe-web-production.up.railway.app`

**Important:** Before updating the DNS records, ensure that the custom domain `owambe.com` and `www.owambe.com` are added to the `owambe-web` service in the Railway dashboard. Railway will provision the necessary SSL certificates once the domain is added and the DNS records propagate.

## Next Steps

1.  **Founder Review:** Review the live placeholder at [https://owambe-web-production.up.railway.app](https://owambe-web-production.up.railway.app).
2.  **Railway Dashboard Configuration:** Add `owambe.com` and `www.owambe.com` to the `owambe-web` service in the Railway dashboard.
3.  **DNS Update:** Update the DNS records at your registrar using the values provided above.
4.  **Staging Sync:** Merge `main` into `staging` to ensure the staging environment reflects the AC-7 `noindex` fix.
