# Content engine setup (Parth, about 45 minutes once)

Everything secret goes through `bin/connect.py` in your own terminal: hidden prompts, saved to
`~/.config/skwirl-engine/env` (chmod 600), pushed to GitHub with `gh secret set` reading stdin. **Never paste a token
into a Claude chat.** No `wrangler secret put` is needed: publishing runs on GitHub Actions, and the product worker is
untouched.

All commands run from `~/Work/Experiment/stash` after this branch is merged. Python = `.venv/bin/python`.

```
.venv/bin/pip install boto3 pillow      # once: staging uploads to R2 and converts slides to JPEG
cd promo/engine
```

## 1. Telegram approvals bot (5 min)

A new bot just for approvals. The Skwirl bot can't be reused: it has a webhook, and Telegram blocks polling while one is set.

1. Telegram > @BotFather > `/newbot` > name "Skwirl Posts" (any username). Copy the token.
2. `../../.venv/bin/python bin/connect.py telegram` > paste the token at the hidden prompt > send `/start` to the new bot > Enter.
   You get "Connected." in Telegram. Only taps and commands from you count. (Using a group instead of the private chat?
   Also add a `TG_OWNER_USER_ID='<your user id>'` line to the env file so only you can approve.)

## 2. Instagram (Creator account, Instagram API with Instagram Login) (15 min)

1. https://developers.facebook.com/apps > **Create app** > use case **"Manage messaging & content on Instagram"**
   (type Business). Name it "Skwirl Publisher". No Facebook Page needed.
2. In the app: **Instagram > API setup with Instagram login**.
   - **Add the permissions** (step 1 on that page): `instagram_business_basic`, `instagram_business_content_publish`,
     `instagram_business_manage_insights`.
   - **Generate access tokens** > **Add account** > log in as the Skwirl Instagram account > allow. Copy the token it
     shows (long-lived, 60 days).
   - If it asks for a role: App roles > Roles > add the Instagram account as an **Instagram tester**, accept the invite in
     Instagram (Settings > Website permissions > Apps and websites > Tester invites), then generate again.
3. `../../.venv/bin/python bin/connect.py instagram` > paste at the hidden prompt. It checks the token and saves
   `IG_USER_ID` too.
4. You don't need App Review: Standard Access covers accounts you own. Leave the app in Development mode.

**Token refresh is automatic.** The cron job refreshes it every 7 days (it must be at least 24 h old; it lasts 60 days)
and keeps the fresh copy in the private R2 bucket. If refreshes keep failing you get a Telegram message ~10 days before
it expires; then repeat step 2.2 and 2.3 and `push-secrets` (a new token in the secret always wins).

## 3. YouTube (Shorts) (15 min)

1. https://console.cloud.google.com > new project "Skwirl Publisher".
2. **APIs & Services > Library** > enable **YouTube Data API v3**.
3. **OAuth consent screen** (Google Auth Platform): External, app name "Skwirl Publisher", your email. Scopes:
   `youtube.upload`, `youtube.readonly`. Test users: the Google account that owns the Skwirl channel.
4. **Publish the app: Audience > Publish app > In production.** Important: in Testing mode the refresh token dies after
   7 days. Unverified production is fine for your own account (you'll click "Advanced > Go to Skwirl Publisher").
5. **Credentials > Create credentials > OAuth client ID > Desktop app**. Keep the client ID and secret open.
6. `../../.venv/bin/python bin/connect.py youtube` > client ID, then the secret at the hidden prompt > a browser opens >
   pick the channel's account > allow. It prints the channel name.

Notes: per Google's revision history (2 Nov 2026) uploads from unverified API projects are no longer forced to private,
so no audit is needed. The engine reads back the privacy YouTube actually applied and messages you if it isn't public.
In YouTube Studio > Settings > Upload defaults, make sure visibility isn't set to Private.

## 4. Cloudflare R2 (private media + queue bucket) (5 min)

1. Cloudflare dashboard > **R2** > (first time: subscribe to R2; it's free up to 10 GB, Cloudflare may ask for a card)
   > **Create bucket** `skwirl-content`. Leave public access **off**: Instagram gets 1-hour presigned links.
2. R2 > **Manage API tokens > Create API token**: permission **Object Read & Write**, only bucket `skwirl-content`.
   Copy the Access Key ID and Secret Access Key. Your account ID is on the R2 overview page.
3. `../../.venv/bin/python bin/connect.py r2` > it writes a test object and checks a presigned link loads.

## 5. Turn on the cron (2 min)

```
../../.venv/bin/python bin/connect.py status          # all "set"?
../../.venv/bin/python bin/connect.py push-secrets    # gh secret set, values via stdin
gh variable set ENGINE_DRY_RUN --body 1               # first day: dry run, nothing posts
gh variable set ENGINE_ENABLED --body 1
gh workflow run content-engine -f command=queue       # Actions tab should show a green run
```
When a dry-run tick looks right (Actions log: "DRY RUN, would publish ..."), `gh variable delete ENGINE_DRY_RUN`.

Optional later: `gh variable set AUTO_APPROVE --body 1` makes staged posts go out without asking (you still get each
one on Telegram and can `/pause`). Default is one-tap approval.

## 6. Weekly research + make tasks on your Mac (2 min)

```
cp bin/com.skwirl.content-engine.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.skwirl.content-engine.plist
```
Fri 10:00: research task (crew, Craveto account) rewrites the backlog. Sat 10:00: make task builds the top 5, runs
content-qa, stages them, and you get each on Telegram. Asleep Mac: runs on wake. Stop: `launchctl unload` the same path.

Optional research keys (add as lines to `~/.config/skwirl-engine/env`, not GitHub):
- `YT_API_KEY=...` Google Cloud > Credentials > API key (restrict to YouTube Data API v3): top Shorts per niche.
- `REDDIT_CLIENT_ID=...` / `REDDIT_CLIENT_SECRET=...` https://www.reddit.com/prefs/apps > "script" app: real questions.
  Read-only; Reddit replies stay by hand.

## Day to day

- Telegram: each staged post arrives with the video (or slides) and **Approve / Skip**. Approved posts go out at their
  slot (default 22:30 IST), within ~15 min. Missed by more than 12 h: it asks again with **Post now / Skip**.
- Commands to the bot: `/queue`, `/pause`, `/resume`.
- You get "Posted ..." with links, and a message if anything fails after 3 tries.
- From the Mac: `python -m content_engine queue | approve ID | skip ID` (with the env file sourced).

## Limits respected
Instagram: 100 API posts per 24 h (checked via `content_publishing_limit` before each post); the engine also caps itself
at 2 posts per platform per day. YouTube: max 3 uploads a day. Telegram polling every 15 min. GitHub Actions: free on a
public repo; the repo is public, so its Actions logs are public: the engine prints only post ids and states, never
captions, URLs or tokens.
