# Stash — handoff

Written 2026-08-20, last updated 2026-11-09. Everything in this file was checked
live against the running system, not recalled from memory. Commands to
re-verify each claim are included.

**Also read `CASE_STUDY.md`** if you want the narrative version — same project,
written for a human audience (or a GitHub repo/portfolio), covering the problem,
the architecture, and five real bugs with before/after evidence. This file is
the terse operational one; that one is the story.

## What this project is

You (the user) send Instagram reels/posts to a share-sheet Shortcut on your
phone. They get downloaded, transcribed, vision-analyzed, and turned into a
searchable markdown note — so the thing you saved with the intention of coming
back to it later is actually findable later, and Claude surfaces it on its own
when it's relevant instead of waiting to be asked.

That's the whole point: **capture that survives you forgetting, recall that
doesn't wait to be asked.**

## 2026-11-09 (late): recall that actually fires, Claude Code plugin (START HERE)

- Finding: with the connector + stash-recall skill loaded, fresh Claude Code sessions NEVER searched
  saves on their own (tested blind, strong matches existed). Recall is now pushed, not pulled.
- Owner's Mac: `stash/recall_hook.py` is a UserPromptSubmit hook in ~/.claude/settings.json (local
  vault, bge-small, distance <= 0.80, ~0.3s). Backup of settings: ~/.claude/settings.json.bak-recall.
- Everyone else: Claude Code plugin in `plugin/` (+ `.claude-plugin/marketplace.json`). Hook is one curl
  to `POST /v1/recall` (worker/src/recall.ts, bge-m3 score >= 0.58, jokes skipped, prompts never
  stored). Auth: `cc_key` (skc_..., migration 0030), valid only for /v1/recall and /mcp/<key>, revoked
  on rotate/delete. Set up card "Copy install command" mints the key and copies
  `claude plugin install skwirl --marketplace Parthuss/stash --config key=...` (verified from GitHub).
- Also merged the Craveto-clone session's work (commit 0545e3e): better connector instructions, local
  search floor 0.82, softened "Claude checks your saves while you work" landing copy, prefs line in Set up.
- NOT yet verified: a real Claude Code session with the plugin (CLI login had expired). After
  `claude /login`, test on a non-owner account that the hook's ${user_config.key} substitution works.
- Gotcha: `d1 execute --file` once silently didn't run (printed only the account banner). Always
  re-check with `SELECT name FROM sqlite_master WHERE name='...'` before deploying.

## 2026-11-08 to 09: audit fixes, skwirl.app, categories, payments setup

**State (9 Nov):** live at https://skwirl.app (old skwirl.parthakholkar.com kept for signed-in users and
installed apps; see the 9 Nov DOMAIN note below). Everything below is deployed and pushed; detailed
per-change notes are the "9 Nov" bullets further down this file.

**Users:** Jacinda (AU, occupational therapist, found us via Google, 506 imports crawling on her free
Groq key). She replied by email 9 Nov: "honestly perfect", would pay for a faster option, sorts saves by
therapy goal, OK to quote her (first name + "occupational therapist"). Custom categories were built for
her and shipped the same day. Parth's reply email to her is drafted in chat (send after Email Routing
works; middle paragraph says categories are live). Steve (PK) has an owner_msg card waiting, never
returned. Nobody has paid yet; Plus is still waitlist-only.

**Shipped 8-9 Nov:** the audit (docs/audit/2026-11-08/, untracked) fixes from Claude and Codex merged and
live (migrations 0027, 0028); rate-limit waste fix (imports wait for a whole note's worth of Groq
allowance); skwirl.app domain move; landing fixes (email field shows with the name field, regional
pricing in app.js `PRICES`, last "stash" copy); custom categories (migration 0029); content handbook
`promo/CONTENT_HANDBOOK.md` for content-only chats; license switched to **FSL-1.1-MIT** (README explains;
pre-9-Nov versions stay MIT; never call it "open source" now); refund policy page /refunds + Plus
section in /terms; robots/sitemap/llms/IndexNow/guides SEO pass.

**Pricing agreed (not live, no checkout yet):** Plus $4.99/mo or $39/yr; local: India ₹299/₹2,499, UK
£3.99/£31, EU €4.99/€39, Canada C$6.99/C$54, Australia A$7.99/A$59, NZ NZ$8.99/NZ$65. Up to 500 reels a
month. Real cost about 1.1 cents a note (measured: ~8.1k input + ~1k output tokens on qwen3.8-27b at
$0.80/$4.00 per M, plus Whisper turbo). Parth's rule: never cut note quality to save cost.

**Payments (in progress):** Dodo Payments chosen (Polar is the backup). Parth signed up as an
**individual**, business name "Skwirl", category SaaS/AI, payout **Local** to his HDFC account;
verification **submitted for review 9 Nov**. Ask Dodo support which currency Local payouts to India
arrive in and whether e-FIRA is provided. The official Dodo Claude Code plugin is installed (user scope,
`dodopayments@dodopayments`); its API MCP server needs Parth to authorise via `/mcp` (pick Skwirl + Test
mode).

**Next, in order:**
1. After `/mcp` auth: create the two **test-mode** products (monthly $4.99, yearly $39, local prices above).
2. Parth creates a test API key and a webhook endpoint `https://skwirl.app/webhooks/dodo` in Dodo, then
   `cd worker && npx wrangler secret put DODO_API_KEY -c wrangler.local.toml` (and `DODO_WEBHOOK_SECRET`).
   Never paste keys in chat.
3. Build Plus (use the Dodo plugin skills: checkout-integration, webhook-integration,
   subscription-integration, localized-pricing, testing-and-go-live): user.plan + plan_until + Dodo ids
   (migration), POST /v1/plus/checkout (server-side session, metadata user_id), /webhooks/dodo
   (Standard Webhooks signature on the raw body, idempotent on webhook-id), customer portal link, Plus
   users first in /claim and on a paid Groq key (Parth must create a paid Groq account), 500/month cap
   with a soft slow-down (not a hard stop), Get Plus buttons replacing Notify me, Plus status in Me/Set up.
   Test every path with Dodo test cards before live.
4. Email Routing for skwirl.app: support@skwirl.app -> pakholkar@gmail.com (Parth doing it 9 Nov; the
   refund page already lists the address). The same setup can then carry OWNER_MAIL alerts.
5. Open from the audit: none blocking. Pending owner items: Search Console + Bing for skwirl.app, update
   the Instagram bio link to skwirl.app, test the token-free iPhone Shortcut and push on a real iPhone.

**Local setup notes:** `claude` CLI shim at /opt/homebrew/bin/claude was fixed 9 Nov (backup at
~/Work/Experiment/claude-shim.backup); the Claude Craveto / Claude BN desktop launchers don't use it.
A second worktree `../stash-claude` (branches audit-fixes-claude, audit-integration, skwirl-app-domain)
is merged and can be removed with `git worktree remove ../stash-claude`.

## 2026-11-06 to 07: first real users, outage fix, growth plumbing

**Users (7 Nov eve):** Jacinda (AU, invite, 506 IG imports, ~29 done, own Groq key; visits several
times a day, saw the push card 7 Nov 16:02 IST, not tapped). Steve (PK, came from the Instagram bio
link 7 Nov 14:23 IST, no email, 0 saves, signed up inside IG's in-app browser so his account may be
stranded). Aleisha (30 Oct, never returned). Plus waitlist: 0.
Query live data: `cd worker && npx wrangler d1 execute stash --remote -c wrangler.local.toml --json --command "..."`
(the bare wrangler.toml has `REPLACE_ME` as the DB id). Tables: `user`, `capture`, `note`, `visit`, `ui_event`.

**6 Nov outage:** claim query did a correlated COUNT with no index, read 31.5M rows, hit D1's free
read limit. Fixed: index `capture_claimed` (migration 0017), live and import claims split, an
`imports_idle` back-off in `alert_state`. Groq 429/503 now refunds the attempt and parks the
capture 30 min (`pause:<user>`); Python spills to the shared key on TPD.

**Built (migrations 0017 to 0024, all applied):** feedback card with consented email; login recovery
(`/login`, device tokens, one-time `login_code`; email login needs Workers Paid, Telegram `/login` works);
import-done ping + Sunday digest (cron `0 4 * * SUN`); first-party analytics (`public/track.js` →
`POST /e` → `visit`/`ui_event`, dashboard at `/analytics`, owner excluded); Web Push hand-rolled
(`src/push.ts`, `VAPID_JWK` secret; untested on a real iPhone); "how did you find us" card
(`found_via`); Plus waitlist with regional prices (`/waitlist`); profile page `#me`; "Your setup" hub;
read-only offline mode + outbox; cron kicks the GH runner when saves wait (Mac asleep is fine);
owner alerts by email via `src/notify.ts` (needs Email Routing, `docs/OWNER_TODO.md` §000).
The owner wants no Telegram pings, only email/WhatsApp.

**7 Nov (commit 8e77cff):** fonts self-hosted (`public/fonts.css`, `public/fonts/`; CSP is font-src 'self'),
qrcode.js lazy-loaded on desktop only, `paint_ms` tracked; new signups land on a welcome card in the
library (paste a reel link, 3-step checklist) instead of the setup page; IG/FB in-app browser
warning on sign-up (Android intent to Chrome) and on the welcome card; cards drop "Unused", show
only "Tried ✓"; chip "to try"; button "I tried this". "Used" is set only by that button or the
`mark_stash_used` MCP tool.

**Open / next:**
- Done 7 Nov (a0d2097): Facebook reels/videos accepted (facebook.com, fb.watch). Verified fetch + transcribe on the runner.
- Fixed 7 Nov (950de3e and the apt follow-up): GitHub's ubuntu-latest dropped ffmpeg; the runner's check passed silently through `| head`. Now apt-installs ffmpeg+ffprobe and fails loudly.
- 9 Nov CATEGORIES (b90110c): your own categories. Tables category / category_set (version bumps on change) / note_category (source ai|manual, state 1/0) + note.cat_version (migration 0029, applied). New notes: /claim carries categories + cat_version, extract.py adds an enum `categories` field to the same extraction call, /note stores them. Existing notes: daemon calls pipeline.sort_categories() after each drain -> POST /sort/claim (8 notes, own key, skips paused owners) -> extract.sort_into_categories (same model, full note text up to 4k chars) -> /sort/result (ignored if version changed). Manual ticks never overwritten. UI: Set up -> Your categories, library chips (cat:<name>), note chips. Not yet: MCP/Claude filter by category, Instagram saved-collections import (need a real export to confirm saved_collections.json format), free-vs-Plus limit (all 20 free for now).
- 9 Nov DOMAIN: Skwirl moved to https://skwirl.app (Cloudflare Registrar; Worker custom domains skwirl.app + www.skwirl.app, old skwirl.parthakholkar.com + stash.parthakholkar.com kept). PUBLIC_URL var = https://skwirl.app in wrangler.local.toml. Canonical/sitemap/OG/llms/IndexNow point to skwirl.app. public/move.js sends NOT-signed-in, NOT-installed visitors on the old host to the same URL on skwirl.app (keeps ?url= and #t=/#login=); signed-in devices and installed PWAs stay on the old host (their token/push/icon are per-origin). Old host still serves OAuth/MCP connectors, old Shortcuts (they bounce via move.js), share pages and the processors (STASH_WORKER_URL in .env and the GitHub secret still use the old host; fine). Static assets bypass the Worker, so old-host SEO relies on canonical tags, not 301s.
- 9 Nov AUDIT FIXES SHIPPED (master 82239a8): full audit in docs/audit/2026-11-08/ (untracked). 7 Claude fixes (claim lease + fenced /complete and /note, full account erasure, scheduled-push claim/retry, token reset revokes pending grants + atomic OAuth/Telegram redemption, sign-in link verification + outbox kept on forced sign-out + stale-response fence, analytics daily row budget + feedback rate limit, Groq key edge cases, OAuth consent destination) merged with Codex's 19 (pipeline P1-P8, C2, C3, frontend races/nav/a11y/copy, B13/B14). Migrations 0027 (capture.lease) + 0028 (daily_counter) applied to prod BEFORE deploy. Tests: 141 pytest, tests/worker_audit_fixes.cjs, tests/frontend_fixes.cjs (needs PLAYWRIGHT_MODULE + AXE_PATH). Worktree ../stash-claude (branches audit-fixes-claude, audit-integration) can be removed.
- 8 Nov SEO pass (same as the portfolio): landing visible without JS (boot.js hides it pre-paint for signed-in devices), keyword title/description, canonical, OG/Twitter, JSON-LD (WebApplication + FAQPage, FAQ visible on page), 3 guides in public/guides/ (search saved reels, recipes from reels, export saved posts) linked from the landing footer, llms.txt, sitemap + robots, noindex on analytics/authorize, IndexNow (`node worker/scripts/indexnow.mjs` after deploys; Bing feeds ChatGPT search). Owner todo: Search Console + Bing Webmaster, submit sitemap.
- 8 Nov 09:00 Sydney (22:00 UTC 7 Nov): personal push to Jacinda queued in `scheduled_push` (id 1), asking what she hoped Skwirl would do; tapping opens `/?reply=` (feedback form as "Reply to Parth"). Her answer lands in `feedback`. Send more with POST /admin/push/user {user, body, title, url, at?}.
- 7 Nov: owner_msg = a one-off banner to one user (`UPDATE user SET owner_msg='...' WHERE name='...'`), cleared when tapped. Steve has one waiting. GOTCHA: `wrangler d1 migrations apply --remote` silently waits for a y/n when piped, so run the migration file with `d1 execute --remote --file` BEFORE `./deploy.sh`, or new code queries a missing column.
- Jacinda (7 Nov): turned push on, answered found_via=search, dismissed the feedback card, opened Help twice, saves via the + paste box (no Share-sheet setup yet). She's reachable by push only. Nobody has given an email (the optional join field has existed since 3 Nov).
- Fixed 7 Nov (b8ce5f9): imports no longer spill onto the shared Groq key when the user's own key hits its daily cap (Jacinda's drip took 122k of our 200k that day). Imports now wait for her key's reset (her key alone did ~65 Groq calls/day; only 29 imports finished in 2 days, so 469 pending could take weeks); live saves still spill.
- Done 7 Nov (51ea4c4): iPhone Shortcut is token-free. It opens `/?url=…&src=shortcut` in Safari; the signed-in web app saves it (signed-out shares wait through sign-in). Needs one real-iPhone test. Old token Shortcuts still work.
- Check tomorrow's `paint_ms` / `load_ms` in `ui_event` to confirm the speedup.
- Owner todos: Email Routing → OWNER_MAIL binding; test push on a real iPhone; optional Workers Paid.
- Instagram: all content state lives in `promo/CONTENT_HANDBOOK.md` (read it first). 9 Nov: "girl, zoom in"
  carousel (piece 11) built and AirDropped, to post by ~18 Nov; "No. No. No. Yes." Reel scripted. Launch Reel
  planned Wed 11 Nov. Content rules: memory `content-max-effort.md`.
- Never stage the owner's own uncommitted promo files (`promo/src/Root.tsx`, `CaptureScene.tsx`,
  `MetaPromo.tsx`, `ReceiptsPromo.tsx`, `promo/public/meta-source.mp4`, `vo-*.wav`).
- Local preview: `.claude/launch.json` ("skwirl-worker", wrangler dev on 8787, untracked).

## 2026-11-03: matching Stashr AI, still free

Fonts: Recursive Casual for display, Rethink Sans for UI. Added: OAuth 2.1 for the connector at `POST /mcp`
(`worker/src/oauth.ts`; consent page `public/authorize.html` reuses the web sign-in token;
`/mcp/<token>` still works), a `save_link` MCP tool, Instagram export import (`POST /v1/import`;
the app unzips on-device; imports queue behind live saves at 5/day per person on the shared key,
150 with their own), meaning-based search (`worker/src/embed.ts`, Workers AI bge-m3 int8 vectors
in `note_vec`, fused with FTS; the `[ai]` binding is in both wrangler files), and a Telegram bot
(`worker/src/telegram.ts`, hidden until `TELEGRAM_BOT_TOKEN` is set). Migrations 0013-0016 are
applied to prod. `worker/smoke.py` covers all of it (start flags in its docstring). What's left
for the owner: `docs/OWNER_TODO.md` §0.

## 2026-10-27: opened to the public

The site root is now a landing page, and joining is open (first name only), with these limits:
`OPEN_JOIN = "1"` in `worker/wrangler.local.toml` `[vars]`, the `MAX_JOIN` cap of 50, and
8 tries per 10 min / 20 per day per IP. Other changes: a "save your sign-in link" banner
(there's no password, so the link is the only way back in), public share pages for a note
at `/n/<share_id>` (migration 0012, `worker/src/share.ts`; only the summary, next step,
recipe and mentions go public), Open Graph previews (`public/og.png`), and a 30/day cap
on the shared Groq key (200/day with their own key). Plan for getting users, and what
only the owner can do: `docs/LAUNCH.md`. smoke.py covers the share page, including that
private sections and HTML never leak.

Later the same day: the site moved to **stash.parthakholkar.com** (Worker custom domain; the
workers.dev URL still works). The landing page was redesigned (animated phone loop, before/after,
pricing shown as "after the beta"), there's a pastel app icon, and a "home screen" guide
in Set up. On an iPhone, a home-screen copy starts signed out (iOS keeps its storage separate),
so it shows "Paste my sign-in link". Forks can run the cloud runner (`STASH_ENABLED` repo
variable). Docs: `docs/PRODUCT.md` (name, pricing, payments plan), `docs/SELF_HOST.md`.
**GH_DISPATCH_TOKEN is set but GitHub answers 401 "Bad credentials"**: re-create the token.
`kickRunner` now logs non-204 responses, so check with `npx wrangler tail`.

## Current state (verified 2026-09-30)

Stash is now a multi-user pilot, not just a personal tool. Friends join with an
invite code, save from their phone, browse in a web app, and connect Claude.

```
tests:     126 python (.venv/bin/python -m pytest tests/ -q)
           + worker/smoke.py against a local worker (tenancy, MCP, covers, lists, deletion)
web app:   https://stash.parthakholkar.com (old https://stash.parthus.workers.dev still works)  (worker/public/: index.html + app.js)
worker:    D1 migrations 0001-0012 all applied to prod
vault:     63 notes (owner), all with cover images in D1, 0 duplicates, 0 marked used
queue:     empty; 1 dead letter (DbdUqK3Fvh5, Instagram refuses it: private/deleted)
pilot:     NO friends have joined yet (admin overview: users 0). Invite code is the
           JOIN_CODE worker secret; see docs/PILOT.md. A full friend run (join ->
           save 2 reels -> Mac processes -> note with cover -> delete account) passed
           on prod 2026-09-27 and left nothing behind.
secrets:   worker has STASH_SECRET, JOIN_CODE, NTFY_TOPIC. GH_DISPATCH_TOKEN is NOT set
           yet, so the instant cloud trigger is built but off (docs/PILOT.md).
daemon:    launchd com.stash.daemon, claims everyone's saves while the Mac is on
cloud:     .github/workflows/process.yml drains friends' saves when the Mac is off.
           GitHub cron is "every 5 min" on paper, every 2-5 HOURS in practice (measured).
alerts:    worker cron every 30 min -> ntfy (stuck queue, failures, new joins)
mcp:       remote /mcp/<token> has 6 tools incl. list_stash_mentions; the local
           stash-recall skill (repo copy == ~/.claude/skills copy) knows about it
```

## Friends vs. owner: what differs in processing

Keep these guest rules intact, each was a real bug found by testing on prod:
- **Prompt:** a guest save runs under `config.guest_run(True)`: neutral persona, no
  project list, `relevance` forced empty. Before this, friends' notes said "fits your
  automation work" and listed the owner's local project folders.
- **Storage:** a guest note never touches `vault/`, `stash.sqlite`, or iMessage alerts;
  it lives only in D1. Its downloaded media is deleted from the machine afterwards
  (`pipeline._forget_media`), and its link never goes in the daemon log.
- **Groq key:** the guest's own key (if set in the app) is used via `using_groq_key`.

Re-verify:
```bash
cd /Users/parthus/Work/Experiment/stash
.venv/bin/python -m pytest tests/ -q
.venv/bin/python -m stash doctor && .venv/bin/python -m stash status
curl -s https://stash.parthakholkar.com/health
gh run list -R Parthuss/stash --workflow process --limit 5
```

## Deploying the Worker

`worker/wrangler.toml` keeps `REPLACE_ME` as the D1 id on purpose (public repo;
forks deploy their own). The owner's real config is `worker/wrangler.local.toml`
(gitignored). Deploy with `worker/deploy.sh`; apply a new migration with
`worker/deploy.sh migrate migrations/00NN_x.sql` (ALTERs aren't idempotent, so
only name the new file). Smoke-test first:

```bash
cd worker
npx wrangler dev -c wrangler.local.toml --local --persist-to .wrangler/smoke --port 8799 \
  --var STASH_SECRET:adm --var JOIN_CODE:letmein     # after applying migrations/*.sql --local
../.venv/bin/python smoke.py                          # must print ALL OK
```

## Gotcha: which GitHub account pushes

`gh`'s active account may be switched to another project (seen: `itbharatnavya`),
and then `git push` to Parthuss/stash fails with 403. Don't flip the global
account; push this repo as Parthuss for one command:
```bash
git -c credential.helper= -c 'credential.helper=!f() { echo username=Parthuss; echo "password=$(gh auth token -u Parthuss)"; }; f' push origin master
```

## Gotcha: `stash reindex` used to destroy data

Before 2026-09-27 reindex rebuilt the index from markdown alone and dropped
`capture_id`, `used` status and recipe/list fields. The next cloud sync then
duplicated 40 notes in D1 (repaired). Fixed and regression-tested, but if you
ever change reindex, keep the snapshot/restore in `cli._reindex`.

## ⚠️ The one operational gotcha that will bite you

**The daemon does not pick up code changes automatically.** It's a long-running
Python process; imports happen once at process start. Edit `stash/*.py`, and the
running daemon keeps executing the *old* code until restarted — launchd's
`KeepAlive` only restarts it on crash, never on file change.

This already caused a real, silent bug once: the hybrid-search code (chunks,
embeddings) was committed two days after the daemon process had started, so the
daemon kept writing notes with zero vector chunks — no error, no warning, just
quietly degraded search for every capture in that window. Caught by chance
while writing this handoff, not by any alarm.

**After editing anything under `stash/`, always:**
```bash
launchctl kickstart -k gui/$(id -u)/com.stash.daemon
```

There is no automated check for "is the running daemon's code stale relative to
git HEAD." If you build one, that's a good use of five minutes.

## Architecture

```
 Phone: iOS Shortcut (worker/public/Skwirl.shortcut, token-free since 7 Nov: opens Skwirl in Safari)
        or Android installed web app (manifest share_target)
        or the web app's + button
        │  POST /v1/ingest  (bearer token; only instagram/tiktok/youtube/x/threads https links)
        ▼
 Cloudflare Worker (worker/src/: index.ts routes + admin, v1.ts per-user API, mcp.ts)
        │  D1: user, capture (queue), note (+FTS), thumb, mention_done, usage_event
        ▼
 Processor: Mac daemon (all saves) or GitHub Actions runner (--guests-only --quiet)
   fetch.py       → yt-dlp, anonymous, + top 8 comments for single reels
   transcribe.py  → Groq whisper-large-v3
   frames.py      → confidence-gated frame selection
   extract.py     → Groq qwen/qwen3.8-27b: summary, next step, topic, tools,
                     ingredients/steps (topic=food), mentions [{type,name}]
   pipeline.py    → cover thumbnail, POST /note to the Worker; a friend's media
                     is deleted from the machine afterwards
        │
        ├─ owner only: vault/*.md (source of truth) + stash.sqlite (hybrid index)
        ▼
 Recall
   web app        → library (covers), search, Lists (books/movies/places, tick done),
                     recipe checklist, Set up guide, Admin (owner only)
   /mcp/<token>   → remote MCP for Claude (6 tools incl. list_stash_mentions)
   stash/mcp_server.py + ~/.claude/skills/stash-recall/ → owner's local recall
```

## Hard-won findings — do not re-litigate these without re-measuring

Every one of these was arrived at by testing against the real system, not by
assumption, and every "obvious" first guess was wrong at least once. If you're
tempted to change one of these, re-run the measurement, don't just reason about
it.

1. **Instagram reels download anonymously.** No cookies needed for public
   posts — verified against real saved posts, both metadata and full
   video+audio. `STASH_COOKIES_FILE`/`STASH_COOKIES_FROM_BROWSER` ship blank on
   purpose. Setting a cookie source when you don't need one can *cause*
   failures (a `--cookies-from-browser chrome` keychain prompt going
   unanswered kills the download that would have worked anonymously).

2. **`reasoning_effort` must be `"default"`, not `"none"`.** This was the
   actual cause of a real quality regression (see git log:
   `66fa089`). Groq's Qwen models only accept `"none"` or `"default"` — `"none"`
   is fast/non-thinking mode, and it measurably could not read dense on-screen
   text (a GitHub repo's file tree) that `"default"` read correctly and
   repeatably, twice.

3. **Vision batch size is 1, not the API's max of 3.** Batching 2+ images into
   one JSON response measurably compresses per-item detail — verified on the
   same frame, same resolution, same reasoning setting: alone it read all 10
   file/folder names, batched with one other image it read zero. Not a
   token-budget problem (`finish_reason: stop`, budget to spare); a
   shared-response-shape problem.

4. **Vision image resolution is 512px, not larger.** Counter-intuitive but
   measured twice (before and after the reasoning fix): 512px reads dense text
   *better* than 1024px. Token cost is flat across resolution on Groq's API, so
   there's no cost trade being made here — larger is simply worse.

5. **Whisper model is `whisper-large-v3` (full), not `-turbo`.** Groq's free
   tier gives both models the *identical* quota (2,000 req/day, 7,200
   audio-sec/hour), so turbo's speed/cost trade buys literally nothing at this
   call volume. Free accuracy upgrade, no downside.

6. **Hybrid search RRF vector weight is 0.8, not the textbook 0.5.**
   Unweighted RRF is rank-only and blind to confidence — it let a
   lead-generation post outrank the two notes actually about video generation
   for the query "how do I make videos automatically." Swept 0.5→0.9 by hand;
   0.75-0.9 all give the correct top-3, so 0.8 ships from the middle of that
   band. See `stash/db.py`'s `_VECTOR_WEIGHT` comment for the full numbers.

7. **BGE query prefix is applied manually, not via fastembed's `query_embed`.**
   Read the installed fastembed source: for `bge-small-en-v1.5`, `query_embed`
   is a bare alias to `embed()` — no prefix applied. A/B tested the prefix
   directly; it widens the margin over off-target results, so `stash/embed.py`
   applies it explicitly.

8. **Large sustained downloads over Node's HTTP/2 client fail on this
   machine; plain `curl` over HTTP/1.1 doesn't.** Hit this getting whisper.cpp's
   1.5GB model — Node's undici reset the connection with `ECONNRESET` at
   30-50% three times in a row, while `curl --http1.1` pulled the same URL in
   100MB chunks at ~6MB/s with zero resets. Not whisper-specific — this is
   about the runtime's HTTP client on this machine, not the file. If any
   future large download (another model, a big asset) starts failing
   partway through in Node, don't assume the server or the file is bad —
   try `curl -L --http1.1 -C -` to the same URL before spending time
   elsewhere.

## What's real vs. what's legacy in the file tree

**Primary path (this is what's actually running):**
- `stash/daemon.py` + `stash/remote.py` — polls the Cloudflare Worker, this is
  what launchd runs
- `worker/src/index.ts` — deployed, durable capture, survives Mac being asleep
- `shortcuts/Stash.cherri.template` → built via `shortcuts/build.sh` → the
  actual `Stash` shortcut on your phone

**Legacy / fallback, still wired but not the recommended path:**
- `stash/watch.py` (`stash watch` CLI command) — watches an iCloud Drive text
  file. Predates the Worker. Works, but has no durability story (depends on
  the Mac being awake at share-time).
- `stash/local_receiver.py` (`stash receive` CLI command) — LAN-only HTTP
  receiver. Predates the Worker, superseded because it required phone and Mac
  on the same Wi-Fi.
- `shortcuts/Stash-icloud.cherri`, `shortcuts/.stash-local.cherri` — the
  shortcut variants for the two paths above. Not what's installed on the phone
  now (Stash.cherri.template is).

Neither legacy path is broken, and both have real tests
(`tests/test_local_receiver.py`). They're just not what real captures flow
through today. Safe to ignore unless you're specifically working on
resilience-without-a-Worker.

## promo/ — the demo video

A separate Remotion project living inside this repo (`promo/`), not part of
the capture/recall pipeline. Built this session, 37s vertical (1080×1920),
final render at `promo/out/stash-promo.mp4` (gitignored — regenerate, don't
expect it to exist after a fresh clone).

**What's real vs. composed**, in order:
1. First ~10s is an actual screen recording (`promo/public/capture.mp4`) of
   sharing a real reel to Stash — contacts and faces blurred with ffmpeg
   before the footage touched anything else. The unblurred original never
   left the machine it was recorded on and isn't in git.
2. Voiceover is [Kokoro-82M](https://github.com/hexgrad/kokoro), run fully
   local (`promo/tts/generate_voiceover.py`), one WAV per scene so narration
   timing tracks the cut regardless of how fast a line reads.
3. Captions are word-level whisper.cpp timestamps
   (`promo/captions/transcribe.mjs`) rendered through Remotion's own
   `@remotion/captions`, same approach as their official `template-tiktok`.
   Only 3 of 5 scenes carry them — the other 2 already show on-screen text
   that says nearly the same thing the narration does, so captions there
   would just duplicate it.
4. The Claude Code terminal, notification banners, and the recall moment are
   Remotion components built to match the real UI, not screen-recorded —
   they show something that hasn't happened yet (a future recall), so they
   can't be.

**Rebuilding it from a fresh clone:**
```bash
cd promo && npm install
npm run dev                                    # scrub in Remotion Studio
npx remotion render StashPromo out/stash-promo.mp4
```
Voiceover and captions do NOT regenerate as part of a normal render — the
generated output already lives in `promo/public/*.wav` and
`promo/src/captions-data/*.json`, both tracked in git. Only touch
`generate_voiceover.py` / `transcribe.mjs` if you're changing the actual
script.

No new secrets anywhere in this — Kokoro and whisper.cpp both run fully
local, no API key involved.

## Credentials — what's set, where, how to check without exposing values

Everything lives in `stash/.env` (gitignored). Names, not values:

| Variable | Purpose | Set? |
|---|---|---|
| `GROQ_API_KEY` | transcription + vision + extraction | yes |
| `CLAUDE_CODE_OAUTH_TOKEN` | unused by the current pipeline (extraction moved to Groq) — harmless to leave, could be removed | yes |
| `STASH_WORKER_URL` | `https://stash.parthus.workers.dev` | yes |
| `STASH_SECRET` | shared secret between phone/Worker/daemon | yes |
| `STASH_NOTIFY` | `imessage` — **verified working end to end** (switched 2026-08-20; ntfy was silently undeliverable because the ntfy app was never installed on the phone — the server accepted every push with HTTP 200 but had no device to deliver to) | yes |
| `STASH_NOTIFY_IMESSAGE_TO` | your phone number, target for the iMessage notify backend — **verified working end to end**, no Automation permission prompt was needed (already granted) | yes |
| `STASH_NTFY_TOPIC` | unused now that `STASH_NOTIFY=imessage`; left set in case of rollback | yes |
| `STASH_COOKIES_FILE` / `STASH_COOKIES_FROM_BROWSER` | intentionally blank — see finding #1 above | no (by design) |

Check without printing secrets: `grep -oE "^[A-Z_]+=" stash/.env`

The Cloudflare Worker also holds `STASH_SECRET` as a Cloudflare secret
(`wrangler secret put`) — that copy is separate from the `.env` copy and must
match it. If capture ever starts silently failing auth, check both are still
in sync.

## Known gaps — real, not hypothetical TODOs

**Current (2026-09-27), most important first:**

- **Nothing has been tested on a real phone.** The iOS Shortcut builds, is signed
  and served with the right content type; the Android install/share-target path
  needs Chrome on a real device (the in-app browser pane can't register service
  workers). Test both before inviting anyone.
- **Friends' saves can wait hours when the Mac is off, until GH_DISPATCH_TOKEN is set.**
  The GitHub cron runner fires every 2-5 h in practice. The Worker now calls
  `workflow_dispatch` on every friend's save (debounced to 3 min), verified end to
  end on 2026-09-27; it only needs a fine-grained token (Actions read/write, this
  repo only) as the `GH_DISPATCH_TOKEN` Worker secret. Steps in docs/PILOT.md.
- **Shared Groq free tier ≈ 25-30 reels/day for everyone combined.** Friends can
  add their own key in Set up; the app nudges them when saves are slow.
- **App name is undecided.** "Stashr" (stashr.me) is live in the same category;
  a rename was discussed, no name picked. Closest real competitor found:
  Rescroll / thesecondbrain.io (also transcribes reels, aimed at creators).
- **Privacy/terms pages are plain-language and not lawyer-reviewed**, and have no
  contact address (add one before a store launch).
- **Carousel posts never get comments** (yt-dlp limitation, see DESIGN.md).

**Older:**

0. ~~Fresh clone was actually broken.~~ **Resolved 2026-08-26** —
   `worker/wrangler.toml` had the author's real D1 `database_id` hardcoded
   (anyone deploying got pointed at a database they couldn't access), and
   `stash-recall/` — the whole point of the project — was referenced in the
   README but never committed, so recall couldn't be set up by anyone but
   the original author. Both fixed. Also added `install.sh` (collapses
   Homebrew/venv/pip/`.env`/Groq-key setup into one command) and split the
   README into a 5-minute try-it path vs. the phone-capture section, since
   18 manual steps up front was losing people before they saw it work.

1. **Phase 2 (Instagram DM webhook) is code-complete but not activated.**
   `worker/src/index.ts` has `/webhook/ig` fully implemented (HMAC-verified,
   handles Meta's subscription challenge) but needs `IG_VERIFY_TOKEN` and
   `IG_APP_SECRET` from a registered Meta app — neither is set. Today, capture
   only happens via the explicit share-sheet Shortcut, not by DMing yourself a
   reel the way the original idea envisioned. As of 2026-08-21 the README no
   longer documents this as a setup step — it was pulled deliberately
   (repo is public now; documenting an inactive feature as ready-to-configure
   was misleading). The code stays, still commented `(Phase 2)` inline. Add
   the README section back when this actually gets activated, not before.

2. **Weekly digest was planned, never built.** No code exists for it. The
   `mcp__scheduled-tasks__create_scheduled_task` tool was the intended
   mechanism; nothing wired.

3. **Reranking has a documented trigger, not actual code.** The plan at
   `~/.claude/plans/is-there-any-way-replicated-ember.md` says: revisit when
   the vault passes ~5,000 notes, or when a spot-check of 10 real queries
   misses the right note in the top 3 more than twice. No `rerank()` function
   or hook exists yet — `search_notes` in `db.py` would need a stage inserted
   after RRF fusion.

4. **An open question from the last session, never answered:** vector search
   returns its full candidate depth regardless of match strength (no
   similarity cutoff), so a narrow single-word query like `remotion` now
   returns up to `limit` results even though only one is a strong match.
   Ranking is correct; result-*count* padding is the open question. Worth
   asking the user directly before changing it — it's a real design choice,
   not a bug.

5. ~~iMessage notify backend is unverified.~~ **Resolved 2026-08-20** — switched
   to it after discovering `ntfy` completion pushes were never reaching the
   phone (the ntfy app was never installed, so the server-side HTTP 200s were
   silently undeliverable — the "queued" alert the user saw was always the
   Shortcut's own local notification, never the completion push). `stash
   notify` confirmed delivery end-to-end; no Automation permission dialog was
   needed.

6. **Backfill from the Instagram data export only ran on the `Work` collection
   (9 posts).** The full export (1,215 posts across all collections) was
   deliberately not imported — most collections are personal (cooking, travel,
   quotes), not dev-relevant. If asked to "import everything," check with the
   user first; this was a considered choice, not an oversight.

7. **The promo video has no background music, on purpose.** Discussed adding
   an instrumental bed ducked under the Kokoro voiceover; user decided
   against it after hearing one candidate track. Not a gap to silently fix —
   if this comes up again, it was a considered no, not an oversight.

8. **Repo went public 2026-08-21** at github.com/Parthuss/stash. Distribution
   (Instagram post, cross-posting, a comment-to-DM funnel via ManyChat) was
   discussed but not built — the video and repo exist, nothing has been
   posted publicly yet as of this writing.

## How to resume work in a new session

1. Run the verification block at the top of this file. If anything's red, fix
   that first — don't build on top of a broken state.
2. `git log --oneline` for the real history; commit messages are written to
   carry full context (why, not just what) since several bugs and design
   decisions are only documented there, not in code comments.
3. Check `.stash-daemon.log` (tail -30) if anything about capture seems off —
   it's the daemon's own stdout, most recent activity at the bottom.
4. If you change anything under `stash/`, **restart the daemon** (see the
   gotcha above) before concluding a fix works — otherwise you'll be testing
   against stale in-memory code and drawing wrong conclusions.
5. The MCP tools (`mcp__stash__*`) are live in this Claude Code session
   already if you're reading this from within one — `search_stash`,
   `get_stash_note`, `recent_stash`, `list_stash_topics`, `mark_stash_used`.
   Use `recent_stash` first to see what's actually in the vault right now
   rather than trusting this document's snapshot.
6. Working in `promo/`: `node_modules`, the whisper.cpp build + model
   (~2GB), and the Python venv under `promo/tts/` are all gitignored —
   `npm install` first, and if you need to regenerate captions, see the
   curl-vs-Node-HTTP/2 finding above before you burn time on a mysterious
   download failure.
