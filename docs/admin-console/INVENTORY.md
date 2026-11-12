# Owner surfaces and data inventory

Baseline: `00aa873`, 12 November 2026. Inventory is source-backed; implementation and live verification are recorded separately.

| Existing surface | Source / data | Consolidation target |
| --- | --- | --- |
| `/analytics` and `/analytics.html` | `worker/public/analytics.html`, `analytics.js`: overview metrics, traffic dimensions, funnel, large users table, recent visits, waitlist, user / visitor journey overlay | Redirect to `/owner`; all owner reporting lives there |
| Signed-in app Admin view (`#admin` / Admin button) | `worker/public/index.html` Admin section; `app.js` `openAdmin()`: health, six statistics, user cards; links out to `/analytics` | Owner entry opens `/owner`; remove embedded renderer |
| `/admin` | No separate HTML file or explicit GET UI route at baseline; falls through owner processor auth | Redirect GET entry to `/owner` |
| `/v1/admin/overview` | `v1.ts` `adminOverview()`: people, queue, recent usage | Compatibility API, not a second console |
| `/v1/admin/analytics`, `/v1/admin/journey` | `analytics.ts`: visitor / user dimensions, UI events, cohorts, user journey | Compatibility APIs; journey may power the console drawer |
| `/admin/stats`, `/pending`, `/dead` | `index.ts`: JSON operator diagnostics (not independent dashboard HTML) | Keep machine API compatibility; meaningful diagnostics in `/owner` |
| `/admin/push/user`, `/admin/push/test`, `/admin/runner/kick`, `/requeue`, `/admin/users`, revoke route | `index.ts`: existing operator mutation APIs | Preserve machine endpoints; console actions must use an owner bearer gate |
| Owner Telegram / email summaries | `notify.ts`, `telegram.ts`, cron alert text | Explicitly out of scope |

## Authorization

- Public dashboard HTML is a shell. Existing `/v1/*` requires a bearer token resolved by `userFromBearer`; owner means resolved user id is exactly `null`. Normal users get 404 from owner data endpoints; missing / invalid tokens get 401 before them.
- Owner credentials include constant-time comparison with `STASH_SECRET` and verified owner device tokens (`sto_`); owner email login is already protected by code limits and owner sign-in notifications.
- Legacy operator mutation routes sit below `authorized()` and require `X-Stash-Secret`; an owner device token cannot call them directly. New console action wrappers must preserve the owner-only bearer gate and must never expose the raw secret.
- No owner-message write endpoint exists at baseline; the app already reads `user.owner_msg` and acknowledges it with `/v1/owner-msg/seen`.

## Data definitions and limits

- Traffic: first-party `visit` and `ui_event`; bots and owner sessions are excluded; retention 180 days. Country, device, OS, browser, referrer / UTM source, landing path, active time, and event names are already stored. No IP addresses or typed/search text are retained.
- Users already exposed to owner: name, joined / last-seen timestamps, email in old embedded Admin, counts, source, feedback, key-present boolean. New default table can use email yes/no; never return key ciphertext or tokens.
- `last_seen` is one mutable timestamp, so it cannot establish historical daily activity; derive period activity from retained visits / usage events and describe the definition.
- Capture lifecycle includes pending / claimed / done and failed pending rows at three attempts; saves and imports should be distinguished where they answer different questions.
- Queue size is a present state; historical queue comparisons require reconstructing from capture and completion timestamps and are estimates after deletion / requeue. Do not invent past state.
- Plus is active when `plan = 'plus'` and `plan_until` is in the future. No payment-amount or immutable subscription-history ledger exists; actual revenue / historical subscriber deltas cannot be calculated faithfully from current user rows.
- Usage logs contain model, key type, tokens, and audio seconds. They support provider usage and explicitly estimated cost, not an invoice. Actual OpenRouter credit requires a server-side provider query; missing credentials / provider failure must show unavailable, not zero.
- Full visit → signup identity continuity and plan-conversion time are not guaranteed. A cohort funnel needs explicit scope and a visible break / caveat for the anonymous traffic step.

## Verification tooling / deployment

- `tests/frontend_fixes.cjs` demonstrates Playwright routing, Chrome channel, 390px viewport, reduced motion, and blocked service workers; `PLAYWRIGHT_MODULE` can point at an existing installation.
- Worker check: `cd worker && npm run typecheck`; JS check: `node --check <changed.js>`.
- Main checkout owns ignored `worker/wrangler.local.toml`; deploy using `cd worker && ./deploy.sh`. Copy only that ignored config into the isolated worktree if necessary, never stage it or promo WIP. No migration is needed for a read-only aggregation console.
