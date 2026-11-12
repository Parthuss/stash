# Owner console API

`GET /v1/admin/console?days=1|7|30` uses the existing owner Bearer authentication (`STASH_SECRET` or a valid owner device token). Other accounts get 404; invalid/missing credentials get the existing 401. Responses use `Cache-Control: no-store`. No migration or new tracking is required.

## Period and metric semantics

`period` contains `days`, `since`, `until`, `previous_since`, `previous_until`, `bucket` (`hour` or `day`) and `timezone: "UTC"`.

- `1`: UTC midnight until request time; comparison is yesterday midnight through the same elapsed time.
- `7`, `30`: rolling days ending at request time; comparison is the immediately preceding equal interval.
- All date intervals include the start and exclude the end. Unsupported days default to 7.
- `kpis` contains `{key,label,value,previous,series:[{at,value}],historical,note}`. Keys: `signups`, `active`, `saves`, `processed`, `queue`, `plus`, `visitors`.
- Active users are distinct non-owner accounts with a recorded browser visit, API event or save; they are counted once across sources. First-party visits exclude all sessions from known owner browser IDs, including sessions before owner sign-in.
- Saves and processed counts include imports and the owner. Processing is counted at `processed_at`, not capture time.
- Queue includes pending/processing captures across all accounts, imports and owner; explicit failed status and exhausted non-done rows are failures. `queue` and `plus` are current snapshots, so `previous: null`, `series: []`, `historical: false`.
- Plus requires `plan = plus` and an unexpired `plan_until`; non-Plus accounts created before `TIERS_FROM` retain the `early` plan, others are `free`. The console and access enforcement share that cutoff in `worker/src/tiers.ts`. No payment amount/currency ledger exists, so revenue is not inferred.

## Response objects

- `funnel: {steps:[{key,label,value}],note}`: site visitors, signups, first save, 5+ saves, Plus. Downstream counts follow accounts created during the chosen interval; imports count as saves. Visitors are separate reach, not an attributed signup conversion. Cross-device users and blocked tracking cannot be linked reliably. These are current cohort milestones, not a verified chronological purchase path; subscription start times are not stored.
- `users`: newest 500 accounts, each `{id,name,created_at,last_seen,email,has_email,plan,plan_until,found_via,own_key,owner_msg,total,done,pending,failed,push_devices}`. Email is already exposed by the previous owner overview. No password hashes, device tokens, provider keys or subscription/customer IDs are returned. `users_total` exposes truncation.
- `health.states: [{state,n}]`: `pending`, `processing`, `done`, `failed`; absent states may have no row.
- `health.failures: [{reason,n,examples:[{id,title}]}]`: static error categories, up to three recent example save titles. Raw provider errors are withheld because they can contain credential-bearing URLs.
- `health.providers: {groq_keys,own_keys,usage,openrouter_credit:null,note}`: `usage` rows contain `{provider,model,action,calls,prompt_tokens,completion_tokens,audio_seconds,billed_audio_seconds}` (grouped by provider/model/action). Groq pool size is configured runner capacity, not measured key health. `openrouter:` model prefixes distinguish recorded paid-provider calls; runner credentials/credit are not available in the Worker.
- `health.cost: {estimated_usd,priced_calls,unpriced_calls,rates_as_of,note}`: list-price estimate for recognized recorded model calls; null when none can be priced. Coverage and assumptions are explicit, and this is not actual spend or an invoice. See pricing basis below.
- `traffic: {daily,sources,countries,landing,devices}`: daily `{day,visits,visitors}`, dimensions `{k,n}` (distinct browser visitors; up to 12 groups each). Groups may overlap when a visitor uses multiple dimensions. Daily counts are calendar UTC days clipped to the selected interval; sparse days may have no row.
- `activity: [{at,kind,action,name,user_id}]`: at most 40 recorded user API actions in the interval. Provider calls are excluded so processing chatter cannot bury user behavior. No typed search text, note content or raw errors.
- `limitations: string[]`: explains current snapshots, absent revenue, coverage/retention and any user-table bound.

`GET /v1/admin/journey?user=<id>` remains available with its existing owner gate for the user drawer.

## User actions

All new action routes use the same owner gate and require an existing user ID. IDs are matched as 1–80 ASCII letters, digits, `_` or `-`; normal users get 404. No owner action can target another user's rows accidentally through an omitted filter.

- `POST /v1/admin/users/:id/message`, JSON `{message}`. At most 500 characters; whitespace-only clears. Messages are plain text in the signed-in app. Stored with the existing `#gSave ` navigation prefix so a leading `#` in owner input cannot become an arbitrary selector. Returns `{ok:true}`.
- `POST /v1/admin/users/:id/requeue`, JSON `{}`. Resets only that user's terminal failures (explicit failed or non-done attempts ≥3), clears error/lease/claimed timestamp, preserves completed saves. Returns `{requeued}`. Does not send messages or touch other users.
- `POST /v1/admin/users/:id/push`, JSON `{body,title?}`. Body 1–240 characters, title at most 60, default `Skwirl`. Sends to at most 50 existing subscriptions. Requires configured VAPID, else 409. Returns `{devices,sent,failed}`; never returns subscription endpoints or raw delivery exceptions.

## Verification

`node tests/admin_console.cjs`: real SQLite built from every migration. Covers UTC comparisons and gaps, zero-filled hourly series, owner exclusion/deduplication, import/owner queue accounting, terminal states, signup-cohort denominator, provider classification, no raw errors/secrets, user-scoped actions, validation, empty data, owner-secret and owner-device authentication, and regular-user denial.

## Cost estimate pricing basis (verified 2026-11-12)

- [Groq model catalog](https://console.groq.com/docs/models): Qwen `qwen/qwen3.8-27b`, $0.80 per million input / $4 output tokens.
- [Groq speech pricing](https://console.groq.com/docs/speech-to-text): Whisper v3 $0.111/hour; turbo $0.04/hour; minimum 10 seconds per call. SQL sums the minimum-adjusted duration for each call rather than applying the minimum to an aggregate. The runner currently uses v3.
- [OpenRouter Qwen endpoint pricing](https://openrouter.ai/api/v1/models/qwen/qwen3.8-27b/endpoints): Nebius $0.45/$3 per million tokens. This is the configured first preference in `stash/extract.py`; actual selected provider is not recorded. Other preferred providers currently list DeepInfra $0.15/$1.875 and Parasail $0.24/$2.2, so routing affects actual charges.
- [OpenRouter Whisper endpoint pricing](https://openrouter.ai/api/v1/models/openai/whisper-large-v3/endpoints): assume DeepInfra $0.0000075/second for recorded OpenRouter v3 audio. This is the lowest currently listed option; actual routing is not recorded.

The estimate prices only recognized model/action combinations. Unknown models contribute to `unpriced_calls`, never a guessed total. Current list prices are applied to the selected period for planning; historical rate changes, actual provider selection, free-tier allowances, caching discounts, credits, image/accounting differences, taxes, and unrecorded failures/retries can change actual spend. Groq list-price equivalents include user keys and the shared free pool: they are not asserted to be charges paid by Skwirl. No credentials are used to obtain these public rates, and the console makes no external pricing request at render time.

## D1 compatibility regression

D1 limits a compound SELECT to five terms, below native SQLite defaults. The owner console therefore runs five separately aggregated metric streams (the active-user stream retains three sources for deduplication), with 19 read queries total per request. The regression test prepares actual emitted queries under `SQLITE_LIMIT_COMPOUND_SELECT = 5`. All 19 current queries were also executed read-only against production D1 after the fix (7,785 rows read, zero written).
