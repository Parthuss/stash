# Owner console — delivery and verification

Delivered 12 November 2026 from `crew/1112-164026-bbf0`, based on `00aa873`. Latest deployed source: `92d8221`. Cloudflare version: `efa48a50-1109-41f2-83fb-98ba33f101f3`.

## What moved where

- **One workspace:** https://skwirl.app/owner now contains overview, funnel, users and their action drawer, processing health, traffic, and recent user activity.
- **Old entry points:** `/analytics`, `/analytics.html`, `/admin`, and `/admin.html` permanently redirect to `/owner`. The app's Admin entry and `#admin` open `/owner`; the embedded renderer and old analytics assets were removed. Existing authenticated machine APIs remain compatible.
- **Signed-in website access:** the header Skwirl menu exposes About, Pricing, Help, Sign out, and an owner-only console link. Profile has About and Pricing list rows. The existing site-visit mode and Back to saves preserve the session.
- **Users:** click a row/name for details and recent journey; send push, save/clear an owner message, or requeue that person's terminal failures. Message/push/requeue wrappers use the same owner bearer check as the previous owner APIs, including verified owner device credentials.

## Screenshots

- [Desktop, 1440px](desktop-1440.png)
- [Phone, 390px](phone-390.png)

These are full-page captures of the deployed console with **live metrics**. Customer names are replaced with `User N`; email addresses, owner messages, source answers, and failure-example titles are removed or masked in the intercepted screenshot response. Counts, timestamps, plans, traffic dimensions, and chart values are preserved. The production UI/API is unchanged by this masking. No credentials appear in the screenshots or report. Earlier visual review used explicitly synthetic fixtures; its scope is recorded in [REVIEW.md](REVIEW.md).

## Checks actually run

- `node tests/admin_console.cjs`: 16 checks, real migrated SQLite fixture, owner gates, periods, deduplication, failures, cohort counts, scoped actions, model-specific cost coverage, empty data, and D1 compound-query compatibility.
- `node tests/signin_otp.cjs`: all 27 existing sign-in checks passed.
- `PLAYWRIGHT_MODULE=/tmp/pwshots/node_modules/playwright-core node tests/admin_console_browser.cjs`: 1440/390 layout and chart sizing, filters, drawer focus/Escape, intercepted actions, 401/404, signed-out/empty/error/retry states, stale period responses, cross-tab/silent storage changes, and escaped untrusted data passed. Later logic-only reruns set `SKIP_SCREENSHOTS=1`.
- `PLAYWRIGHT_MODULE=/tmp/pwshots/node_modules/playwright-core node tests/site_navigation.cjs`: 390px user and 1440px owner menu/Profile/Help/Pricing/back/sign-out and legacy-admin navigation passed.
- `npm run typecheck --prefix worker`, `node --check` for changed browser JS and all four new test scripts, and `git diff --check` passed.
- Local Wrangler served `/owner` with 200 and legacy routes with 301. The actual 19 aggregation queries were also replayed read-only against production D1: 7,785 rows read, zero written, 11.7ms recorded SQL time.
- `./deploy.sh` run from `worker/` with the main checkout's ignored local config copied into this worktree. No migration was added or run. No D1 10021 retry was needed.
- `tests/admin_console_live.cjs`: live legacy redirects, missing/invalid auth denial, authenticated Today/7/30 API data with `no-store`, 1440/390 captures without page errors or horizontal overflow, and real signed-in Pricing → Back to saves passed. [Machine-readable result](live-verification.json).
- Visual review checked both fixture sizes and selected text-token contrast pairs; all examined enabled pairs met 4.5:1. The design detector ran in degraded regex-only mode and is not treated as an automated accessibility pass.

## Production issue found and resolved

The first deployment exposed D1's five-term compound SELECT limit, which ordinary SQLite does not enforce by default. Split the seven-source query into smaller aggregations while keeping active-user deduplication intact. A regression now prepares actual console SQL with SQLite's compound-select limit set to five; all emitted queries subsequently passed production D1 and live HTTP verification. The final deployment also excludes provider-call chatter from Recent activity; provider usage stays in Processing.

## Data limits / remaining dependencies

- Queue and active Plus counts are current snapshots; historical deltas/sparklines are unavailable rather than invented.
- Revenue needs a payment-amount/currency ledger; OpenRouter credit needs provider access that the Worker does not have. Both show unavailable.
- The funnel distinguishes anonymous reach from the signup cohort. Downstream stages are current milestones, not proof of purchase chronology.
- Cost is a sourced list-price planning estimate with coverage and routing assumptions, not actual charges. See [API.md](API.md).
- Provider pool size reflects configured capacity; individual key health is not recorded. The users list is bounded to the newest 500 accounts and says so when truncated.
- Existing journey API is unchanged. Current live maximum was 17 visits per user; its unbounded bind list could need pagination as usage grows.
- Live verification sent no messages, push notifications, or requeue mutations. Those paths were tested against fixtures; actual delivery depends on registered devices and provider availability.

Promo WIP and other worktrees were not staged, merged, or modified. The claimed `index.html` was left untouched; app navigation changes are scoped to `app.js`. All delivery commits are pushed on the task branch.
