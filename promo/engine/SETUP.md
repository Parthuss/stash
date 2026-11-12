# Content engine setup for Parth

Nothing is enabled or connected by this branch. No developer account, Meta/Google app, OAuth grant, bot or bucket was created in this run. No credentials were entered. Merge/deployment is a separate decision. Work on branch `crew/1112-162347-e589` is committed only.

The engine has two runtimes: weekly research/make through a configurable crew agent on a machine with the production tools; approved publishing and 48 h / 7 d measurement in GitHub Actions, with no Mac dependency once staged. Default approval is one tap. Reddit stays manual comments only.

## 0. Install locally after review

From the repo root, use its existing Python environment or a dedicated engine environment:

```sh
python3 -m venv promo/engine/.venv
promo/engine/.venv/bin/pip install -r promo/engine/requirements.txt
npm ci --prefix promo/engine
cd promo/engine
.venv/bin/python -m pytest tests -q
```

Node >=20 and Google Chrome are needed for HTML still renders. Reels use the existing promo Remotion + Kokoro + Whisper setup. Carousels use real app captures from the seeded demo app (`promo/tools/demo/demo.sh`, then `SHOTS_DSF=3 node promo/tools/demo/shots.cjs DIR`), so no image generation is needed. Generated art is optional: only an agent with a built-in image tool makes it; otherwise the make step uses an open-licence illustration or none, never stock art or an unapproved paid API. Rerendering the sample needs nothing but Chrome and playwright-core.

Secrets go only into terminal hidden prompts in `bin/connect.py`, a local chmod-600 file at `~/.config/skwirl-engine/env`, and GitHub Actions secrets. Never paste them in chat, commit them, put them in a command-line argument, or screenshot them. Do not source a file from an unknown author.

<a id="instagram"></a>

## 1. Instagram Creator account: Instagram API with Instagram Login

1. In [Meta's developer dashboard](https://developers.facebook.com/apps/), create your own app for managing Instagram content. Use the Instagram business-login/API use case, and Business app type if asked. Dashboard labels change; choose **Instagram API with Instagram Login**, not the Facebook Login/Page flow. A linked Facebook Page is not required for this path.
2. In the app's Instagram API setup, add:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
   - `instagram_business_manage_insights`
3. Add the Skwirl Creator account to the app's owned/test accounts. If the dashboard asks for an Instagram tester role, accept the invitation from that Instagram account under its Apps and websites / tester-invite settings.
4. Generate an access token for that account, with all three permissions granted. Standard Access is intended for owned/managed accounts added to the app; broader use needs the access/review level Meta requests. Verify the permissions in your dashboard. Do not request unrelated messaging/comment permissions.
5. If the dashboard provides a long-lived token, run `.venv/bin/python bin/connect.py instagram` and enter it at the hidden prompt. The helper reads `/me`, stores `IG_USER_ID` and `IG_ACCESS_TOKEN` locally, and prints only account identity.
6. If it supplies a short-lived token instead, run `.venv/bin/python bin/connect.py instagram-exchange`. Enter that token and the app secret at hidden prompts. The helper exchanges it server-side at `graph.instagram.com/access_token` using `ig_exchange_token`; it does not store the app secret. Then it checks `/me` and stores the long-lived result.
7. Long-lived tokens normally last 60 days. The publisher refreshes an unexpired token after seven days, using `ig_refresh_token`; tokens must be at least 24 hours old to refresh. The new token stays in private R2 state. Reauthorise after expiry or revocation. Re-running the helper and pushing a different bootstrap secret replaces the cached token on the next tick.
8. Default Graph API version is `v27.0`. Confirm the supported version in the app dashboard; `gh variable set IG_API_VERSION --body v27.0` selects it for Actions. Metrics unsupported by the granted account/API are omitted, never invented. A raw reels skip metric is not automatically a 0-1 hold rate.

Official references: [login/token lifecycle](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login), [publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing), [insights](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights). Meta returned 429/unavailable on rechecking these pages in this run; the recovered API notes are implementation references, and the exact dashboard labels/version/permission availability still need confirming during your connection. No live Meta contract test has been run.

<a id="youtube"></a>

## 2. Google project + YouTube OAuth refresh token

1. Open [Google Cloud Console](https://console.cloud.google.com/), create a project, and enable **YouTube Data API v3** in APIs & Services > Library.
2. Configure Google Auth Platform / OAuth consent screen: External, app name, your support email, and your channel-owning account as a test user. Request the full scope URLs `https://www.googleapis.com/auth/youtube.upload` and `https://www.googleapis.com/auth/youtube.readonly`.
3. For ongoing unattended use, set the consent app's Audience / publishing status to **In production**. External apps in Testing with these scopes get seven-day refresh tokens. For your personal account, follow Google's unverified-app flow where allowed; comply with any verification the console actually requires.
4. Create an OAuth client, type **Desktop app**. Keep the client ID and secret private.
5. Run `.venv/bin/python bin/connect.py youtube`. Supply ID/secret in your terminal; it opens the Google sign-in page using loopback OAuth with state and PKCE. Select the account/channel that owns Skwirl's YouTube channel. The helper requests offline access and stores `YT_REFRESH_TOKEN`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`; it prints the channel name.
6. Google now documents public uploads from unverified projects as allowed. The publisher explicitly requests public and checks the returned privacy value. A private response is reported; it is never represented as a public success. Verify actual channel behaviour during a separately authorised live test.

References: [upload privacy and fields](https://developers.google.com/youtube/v3/docs/videos/insert), [resumable upload recovery](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol), [OAuth token expiry](https://developers.google.com/identity/protocols/oauth2). A Short is classified by YouTube from duration/aspect; `#Shorts` is not an API guarantee. The Make task must produce eligible vertical videos.

<a id="r2"></a>

## 3. Private R2 storage

1. In Cloudflare > R2, enable R2 billing/subscription if needed; create a **Standard** bucket such as `skwirl-content`.
2. **Keep public access OFF. Do not attach a public custom domain or r2.dev endpoint.** This same bucket holds private approval state and refreshed access tokens. Only individual media objects are shared through one-hour S3 presigned URLs, which Meta can fetch without a login. The code rejects MEDIA_PUBLIC_BASE for R2.
3. Create an R2 S3 API token scoped to Object Read & Write for this bucket. Note the account ID, access key ID and secret key.
4. Run `.venv/bin/python bin/connect.py r2`; enter the values in your terminal. It tests write and presigned read. It stores `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
5. Keep media available until container processing has finished. URL fetchability is an authenticated account integration check still pending. Restrict bucket credentials and keep the state objects after any media cleanup.

<a id="telegram"></a>

## 4. One-tap approval

The product's current Telegram bot has a webhook. Telegram disallows getUpdates polling while that webhook is active. This engine uses a separate approval bot so it can avoid changing the claimed product worker or taking over the existing bot.

1. Manually ask @BotFather for a new bot and enter its token into `.venv/bin/python bin/connect.py telegram` at the hidden prompt.
2. Send `/start` to the bot from your private owner account, then continue the helper. It stores `TG_ENGINE_BOT_TOKEN` and `TG_OWNER_CHAT_ID`. In a group, also set `TG_OWNER_USER_ID` to your actual sender ID. A private owner chat is simpler.
3. Each staged post arrives with a preview and **Approve / Skip**. Commands: `/queue`, `/pause`, `/resume`. Cron polling can take about 15 minutes. Old callback answers may expire, but valid owner approvals are still processed and acknowledged by a message.
4. Staged post IDs are immutable. To change a caption or asset, use a new post ID and fresh approval. Re-running stage cannot replace what an existing approval refers to.

This bot must be created by you. No Telegram message was sent by this run. If you prefer the existing product bot, integration must later be built into its webhook explicitly; do not delete that webhook.

<a id="engine"></a>

## 5. Secrets and GitHub Actions

After connecting the four services in your own terminal:

```sh
.venv/bin/python bin/connect.py status
.venv/bin/python bin/connect.py push-secrets
```

`push-secrets` uses `gh secret set NAME` with each value on stdin, never on the command line. It sets the following Actions secrets in this repository:

| Service | Secrets |
|---|---|
| Instagram | IG_USER_ID, IG_ACCESS_TOKEN |
| YouTube | YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN |
| Approval | TG_ENGINE_BOT_TOKEN, TG_OWNER_CHAT_ID, TG_OWNER_USER_ID (group only) |
| R2 | R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY |

There are **no `wrangler secret put` steps** in this design. No worker is deployed and no product-worker secrets are reused. Putting publishing tokens in the existing worker would not connect this GitHub runner.

Keep publishing disabled while reviewing. After merge to the default branch, to inspect without posting:

```sh
gh variable set ENGINE_DRY_RUN --body 1
gh variable set ENGINE_ENABLED --body 1
gh workflow run content-engine -f command=queue
```

Run a tick dry-run only after you have deliberately staged test drafts. Dry run prevents publishing API calls, but can read Telegram, process approval intents, refresh tokens and write state. It is not a read-only simulation. `queue` is the inspection command.

When you separately authorise live posting, delete ENGINE_DRY_RUN. Do not do that during this task. Default `AUTO_APPROVE` is unset. Weeks later, `gh variable set AUTO_APPROVE --body 1` approves awaiting items on the next tick as well as newly staged items. Skipped, missed and failed items stay untouched; review the queue before switching it on. Disable all jobs with `gh variable set ENGINE_ENABLED --body 0`.

Tick and insights share one concurrency group because both update post records. GitHub cron is best effort, can be delayed/dropped, runs only on the default branch, and public-repo schedules can be disabled after 60 days of inactivity. 22:30 IST means eligible at that time, typically processed on the next cron, not an exact delivery guarantee. Keep /pause as the immediate queue control.

## 6. Weekly research and production

Set these non-secret settings in your local engine env file:

```sh
# Defaults, only set these to change them:
ENGINE_RESEARCH_AGENT=codex          # research: Codex, xhigh effort
ENGINE_MAKE_AGENT=claude-craveto     # make (reels, carousels, statics): Claude on the Craveto account, max effort
# ENGINE_RESEARCH_EFFORT / ENGINE_MAKE_EFFORT / ENGINE_EFFORT override effort; ENGINE_AGENT is a fallback for both jobs
```

Agent names are crew agents (`~/.crew/agents.json`: claude-craveto, claude-main, codex). The make step uses Craveto Claude quota every Saturday; claude-main stays locked unless Parth says otherwise. Don't set ENGINE_AGENT unless you want one agent for both jobs. The crew runner and the existing local stash MCP/vault must be available. If the main checkout is elsewhere set STASH_MAIN; if crew is elsewhere set CREW_DIR.

Manual launch: `python3 bin/weekly.py research` or `python3 bin/weekly.py make`. The runner prevents repeat launches for a job/date using a marker under ENGINE_HOME; if a crew task failed, inspect its dashboard result and remove only that failed task's `.started-*` marker before retrying. A marker means started, never completed.

Optional Mac schedule, **only after review**:

```sh
cp bin/com.skwirl.content-engine.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.skwirl.content-engine.plist
```

The supplied schedule is Friday/Saturday at 10:00 in the Mac's local timezone. Research and production need a running/waking machine. They are not cloud jobs in this version. The publishing/learning cron needs only staged R2 objects and credentials.

Optional research keys live locally, not in Actions: YT_API_KEY restricted to YouTube Data API v3; REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET only if you already have permitted API access. Reddit's access/approval terms can change; no developer account or app was created for research here. Without them, the agent uses public web sources and records the gap. `gather.py` is read-only on Reddit.

## 7. Batch commands and first live check

```sh
# From promo/engine, after making and reviewing a batch
.venv/bin/python -m content_engine init-schedule ../out/week-23nov --start 2026-11-23 --every 1
.venv/bin/python -m content_engine validate ../out/week-23nov
set -a
. ~/.config/skwirl-engine/env
set +a
# This uploads media AND sends approval messages, so run only when deliberately ready:
.venv/bin/python -m content_engine stage ../out/week-23nov
```

Make produces platform captions/titles, cover, schedule and QA. Only approved due posts publish. More than 12 hours late without starting: ask again. Max two posts per platform per local day, plus Instagram's reported API quota. Retry-After and exponential retry delay are respected; three failures stop an item and notify. YouTube session URIs are persisted and resumed; expired/ambiguous sessions stop for inspection rather than blindly duplicating an upload. A lost container-create response can leave an unpublished orphan container; no exact-once remote API guarantee is claimed.

48 h and 7 d snapshots go to private R2 performance.json. `python -m content_engine pull-perf --out "$ENGINE_HOME/performance.json"` refreshes the research copy; set ENGINE_HOME first. Unsupported/null metrics are left missing. Late collection records its actual timestamp. No signup attribution is inferred from views.

Before enabling live, separately review one real Reel on both accounts and one carousel/static on Instagram: token refresh, presigned fetch, actual public visibility, approval ownership and returned insights. These account-specific checks cannot be completed with mocks. Cost and usage boundaries: [COSTS.md](COSTS.md).


<a id="dry_run"></a>

## How to use it day to day

Open **[skwirl.app/owner#content](https://skwirl.app/owner#content)** while signed in as the owner. Content has the setup checklist, scored ideas, draft previews/captions/gate findings, scheduled dates and posted 48-hour/7-day measurements. Before connection it shows the five curated ideas and a clearly labeled local carousel sample. Missing metrics mean not measured, not zero. Credential presence means configured, not a verified healthy account.

1. **Research, then make.** The buttons appear after both the private R2 binding and dedicated dispatch token exist. They dispatch `content-engine.yml` in dry run, enqueue a private request, and the configured Mac launch agent picks it up within about 15 minutes while awake. GitHub does not run Claude or render video. The existing crew research/make tasks use Codex and Claude Craveto; inspect their completion in crew. Research syncs curated `ideas.json`; make stages only after independent gates. To publish a local read model manually: `python -m content_engine sync-dashboard --ideas "$ENGINE_HOME/ideas.json"`.
2. **Review each draft.** Inspect every slide/video, cover, caption and gate findings. Approve/Skip queues a hash-bound command for the next tick. The engine rechecks the current post, report, policy and actual uploaded media through the same `apply_action` as Telegram. Changed drafts need another review. A queued command is not approval or a post. Final PASS reports cannot be hand-written.
3. **Telegram is the same queue.** Preview messages contain the quality report and approval buttons; `/queue`, `/pause`, `/resume` still work. Either surface updates the shared state. Console pause/resume keeps a persistent dry-run lock; Telegram resume preserves it.
4. **Watch scheduled and posted.** Dates are UTC in the console; the draft keeps its scheduling timezone. Metrics appear after 48 hours and 7 days when the platform provides them. No signup attribution is inferred.

### Connect the owner console

Keep the engine bucket private. Add the following binding to the Worker's **active** `worker/wrangler.local.toml` (template comments also live in `wrangler.toml`), using the same bucket as the engine's `R2_BUCKET`, then deploy normally. No D1 migration is needed.

```toml
[[r2_buckets]]
binding = "CONTENT_ENGINE"
bucket_name = "YOUR_PRIVATE_ENGINE_BUCKET"
```

Set **CONTENT_GH_TOKEN** with `npx wrangler secret put CONTENT_GH_TOKEN -c wrangler.local.toml` from `worker/`. Use a fine-grained GitHub token restricted to this repository with Actions write permission. Never paste it into chat or commit it. It is separate from the capture runner token. Without it, workflow buttons stay hidden; setup/ideas/previews still work. All Content routes and private media require the console's existing owner bearer auth.

The engine writes `dashboard/summary.json`, curated `dashboard/ideas.json`, and consumes `commands/pending/`; it records command receipts in `commands/results/`. The Worker never rewrites post records. Mac research/make requests use `state/jobs/pending/`; `weekly.py auto` starts them once and moves them to `state/jobs/started/`. A started job is not completed. The launch plist checks every 15 minutes in addition to the weekly slots; use the engine venv and set `ENGINE_ENABLED=1` in the private local env only when deliberately ready. Do not load it before setup.

### Stay safe until the live check

`ENGINE_ENABLED` is currently unset in GitHub, so the publishing job is skipped before checkout or API clients. `bin/workflow.py` independently exits without opening state when it is unset. Manual Actions defaults to dry run; every console workflow request forces dry run. Console actions also persist `dry_run: true` in private `state/paused.json`, which subsequent scheduled ticks honor. Resume does not enable the GitHub variable or live posting.

After separately reviewing real-account smoke tests, deliberately configure `ENGINE_DRY_RUN`, `ENGINE_ENABLED`, and clear the private state's dry-run lock only when ready for live publishing. Keep `AUTO_APPROVE` unset for manual review. Nothing in this merge creates credentials, enables the engine, sends approval messages or posts.
