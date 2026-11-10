# Brief: Skwirl Plus with Dodo Payments (test mode first)

Written 9 Nov 2026 by the main-app session for the Craveto app to build. Read HANDOFF.md's top
sections first (deploy rules, migrations, push command).

## What Plus is (decided, don't re-litigate)
- $4.99/month or $39/year. Local prices: IN ₹299/₹2,499, UK £3.99/£31, EU €4.99/€39,
  CA C$6.99/C$54, AU A$7.99/A$59, NZ NZ$8.99/NZ$65 (same table as `PRICES` in worker/public/app.js).
- Plus = no Groq key needed, saves processed first, 500 saves/month soft cap (warn, don't block).
- Merchant of record: Dodo Payments, business "Skwirl", individual seller. Build and test in
  **Test mode** only. Going live is Parth's call after he sees it work.

## Setup (Parth does these; check they're done, ask if not)
1. Dodo MCP: this app needs the Dodo plugin. If `mcp__plugin_dodopayments_*` tools are missing, tell
   Parth to run `claude plugin install dodopayments@dodopayments` (marketplace
   `dodopayments/dodo-agent-plugin`), then `/mcp` → dodopayments-api → sign in → Skwirl, Test mode.
2. Dodo dashboard (Test mode): API key, and a webhook to `https://skwirl.app/webhooks/dodo`.
3. Secrets, set by Parth, never pasted in chat: from `worker/`,
   `npx wrangler secret put DODO_API_KEY -c wrangler.local.toml` and the same for `DODO_WEBHOOK_SECRET`.

## Build
Use the Dodo plugin skills (checkout-integration, webhook-integration, subscription-integration,
localized-pricing, testing-and-go-live) and the dodo-knowledge docs MCP for exact API shapes.
1. Products (via Dodo MCP, test mode): "Skwirl Plus monthly" and "Skwirl Plus yearly", with the local
   prices above. Record the product ids in wrangler.local.toml `[vars]` (not secret).
2. Migration (next number after 0030): `user.plan` ('free'|'plus'), `user.plan_until`,
   `user.dodo_customer_id`, `user.dodo_subscription_id`, and a `webhook_seen(id PRIMARY KEY, at)` table.
   Apply to production with `d1 execute --remote --file` BEFORE deploying, then confirm the table/columns
   exist with a SELECT (a --file run once silently did nothing).
3. `POST /v1/plus/checkout {interval: "month"|"year"}` → Dodo checkout session for that user
   (customer email if we have one, metadata user_id, return URL `https://skwirl.app/?plus=done`).
4. `POST /webhooks/dodo`: verify the Standard Webhooks signature over the RAW body with
   DODO_WEBHOOK_SECRET, reject stale timestamps, idempotent on `webhook-id` via webhook_seen. Handle
   subscription active/renewed (plan='plus', plan_until), cancelled/expired/failed (back to free at
   period end), and refunds.
5. `GET /v1/plus/portal` → Dodo customer portal link.
6. Processing priority: in `/claim` (worker/src/index.ts), Plus users' captures go first; Plus users
   don't need a Groq key (they use the shared key, with priority). The soft cap: past 500 saves in the
   calendar month, show a gentle note, keep processing.
7. UI (worker/public): replace the "Notify me" / waitlist Plus buttons (pricing section, `.plusnote`
   in Set up, quota/import banners that mention Plus) with "Get Plus" → checkout. Show Plus status +
   "Manage subscription" (portal) in Me and Set up. `?plus=done` → thank-you toast after refetching setup.
8. `/v1/setup` returns `plan` and `plan_until`. deleteUser should also cancel an active subscription
   (or at least clear the ids) before deleting.

## Test (test mode)
- Buy monthly with Dodo's test card → webhook flips plan to plus → app shows Plus.
- Replay the same webhook → no double processing. A bad signature → 401.
- Cancel in the portal → plan ends at period end. A failed-payment test card → stays free.
- A free user's flow is unchanged. Existing tests pass (`.venv/bin/python -m pytest -q`,
  `node tests/worker_audit_fixes.cjs`, `node tests/frontend_fixes.cjs`).

## Rules
- Stage files by name; never `git add -A` / `commit -a`; never stage promo work in progress.
- Don't touch `~/.claude/settings.json` or `~/.claude-bn`. Never print secrets or user tokens.
- No em dashes in user-facing text. Prices only through the existing `PRICES`/`priceFor` helpers.
- Commit small, push as Parthuss (HANDOFF.md), messages end with the Co-Authored-By line.
- Report to Parth in plain words: what works, what the test-card run showed, what's left for live.
