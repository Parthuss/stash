# stash

Turn the Instagram posts you save into notes Claude finds on its own.

You already capture reliably — share, tap your own account, done. What fails is
everything after: a URL tells you nothing about what was in the post, so you
never triage it, and nothing surfaces it when it would be useful. This is not a
bookmarking tool. It transcribes what you saved and hands it back unprompted
while you work.

```
share sheet ─┐
IG DM webhook ┼─► /ingest ─► queue ─► fetch ─► transcribe ─► frame gate ─► extract ─► vault/*.md + FTS5
data export ─┘                                                                              │
                                                            Claude Code skill · MCP · weekly digest ◄┘
```

## Setup

```bash
cd stash
/opt/homebrew/bin/python3.12 -m venv .venv
.venv/bin/pip install -e ".[mcp]"
cp .env.example .env
.venv/bin/python -m stash doctor
```

`doctor` names anything missing and the exact command to fix it. Three things
matter:

**1. `brew install ffmpeg yt-dlp`**

**2. A Groq key.** Get one at
[console.groq.com/keys](https://console.groq.com/keys) and put it in `.env`.
Groq Whisper transcribes reel/video audio; `qwen/qwen3.6-27b` reads static posts,
carousel slides, and selected reel frames, then returns the final JSON note.
No Claude call is made while processing. For transcription only, the offline
alternative remains `.venv/bin/pip install -e ".[local-whisper]"`.

**3. Instagram cookies — you probably don't need any.** Both cookie settings
ship blank on purpose. Public reels download fine anonymously; measured on real
saved posts in August 2026, metadata and full video+audio both came back with no
session at all.

This contradicts a lot of writing on the subject, including several open yt-dlp
issues, so check before believing either side:

```bash
yt-dlp --skip-download --print "%(id)s | %(uploader)s" "https://www.instagram.com/reel/XXXX/"
```

Setting a cookie source when you don't need one is actively worse than leaving it
blank — `--cookies-from-browser chrome` triggers a keychain prompt, and an
unanswered prompt fails the download that would otherwise have succeeded.

If you do hit login walls (private accounts, sustained rate limiting), add a
session then, cheapest first:

- **`STASH_COOKIES_FILE`** — a cookies.txt scoped to instagram.com, exported with
  the "Get cookies.txt LOCALLY" extension, `chmod 600`. yt-dlp gets your Instagram
  session and nothing else.
- **`STASH_COOKIES_FROM_BROWSER=firefox`** — no keychain grant needed on macOS.
- **`=chrome`** — last resort. Chrome's cookies are AES-encrypted with a login
  keychain key that decrypts *every* site you are signed into, not just Instagram.
  Standing permission for an unattended worker to use that is a far wider blast
  radius than this task warrants.

A cookies file is your Instagram login in plain text. Keep it out of git; revoke
it from Instagram → Settings → Security → where you're logged in.

Static posts use one vision image. Carousels preserve slide order and send every
slide; Groq's per-request image limit is handled automatically in ordered
batches. Mixed carousels also transcribe each video slide. Reels keep the
existing Whisper plus selective-frame path.

## Use it

```bash
.venv/bin/python -m stash add "https://www.instagram.com/reel/..." -n "why I saved it"
.venv/bin/python -m stash process
.venv/bin/python -m stash search "agent memory"
.venv/bin/python -m stash status
```

Notes land in `vault/` as markdown with YAML frontmatter. That's the durable
artifact — the SQLite index is derived and `stash reindex` rebuilds it from disk.

## Capture from your phone

The included `Stash` Shortcut appears in the iOS share sheet and accepts URLs:

```
Receive URL from Share Sheet
  → Ask for Input      "note?"
  → Text               <Shortcut Input> | <Provided Input>
  → Append File        Shortcuts/stash-inbox.txt in iCloud Drive
  → Show Notification  "stashed"
```

Run the local watcher on the Mac:

```bash
.venv/bin/python -m stash watch
```

Three taps, same as DMing yourself — and it also catches TikTok, YouTube, X, and
any web page. The Mac can be asleep when you share: iCloud holds the line and the
watcher processes it when the Mac next wakes and the watcher runs.

The Shortcut source and signed import live in `shortcuts/`. Rebuild with Cherri:

```bash
cherri shortcuts/Stash.cherri --derive-uuids --skip-sign --output=shortcuts/Stash-unsigned.shortcut
shortcuts sign --mode anyone --input shortcuts/Stash_unsigned.shortcut --output shortcuts/Stash.shortcut
```

For capture that processes immediately while the Mac is offline, replace the
Append File step with the Worker POST described in the next section.

## The always-on half

The Worker exists so a capture is never lost when the laptop is asleep, and so
Instagram's expiring CDN URLs get grabbed the moment they arrive.

```bash
cd worker && npm install
npx wrangler d1 create stash          # paste the id into wrangler.toml
npx wrangler r2 bucket create stash-media
npx wrangler d1 migrations apply stash --remote
npx wrangler secret put STASH_SECRET  # same value goes in ../.env
npx wrangler deploy
```

Then set `STASH_WORKER_URL` and `STASH_SECRET` in `.env` and the Mac worker polls
the Worker instead of the local queue. Notes still land locally either way.

Free tier throughout: Workers 100k req/day, D1 5 GB, R2 10 GB.

## Instagram DMs (Phase 2)

**You do not need App Review.** Review exists so an app can serve *other
people's* accounts. You are the only user, so a Meta app in **Development Mode**
with your own creator account as owner/tester delivers live `messages` webhooks
indefinitely on Standard Access. No business verification, no Facebook Page —
Instagram Login hasn't needed one since 2024.

1. Receiving account → Professional/Creator.
2. Meta app → **Instagram API with Instagram Login**.
3. Permissions: `instagram_business_basic`, `instagram_business_manage_messages`.
4. Webhook field `messages`, callback `https://<worker>.workers.dev/webhook/ig`.
5. `wrangler secret put IG_VERIFY_TOKEN` and `IG_APP_SECRET`.

The Worker verifies `X-Hub-Signature-256` on every POST — the endpoint is public,
so an unsigned body must not be able to write to your queue.

One sharp edge worth knowing: Meta's docs say only the media URL is included when
someone shares a post, so you often get **no permalink**. The Worker reconstructs
one from the media id and records `permalink_verified: false` in the note rather
than pretending it's authoritative.

## Backfilling your existing saves

No API has ever exposed Instagram Saved collections. The data export is the only
route, and Meta takes hours to days to produce it — request it now:

> Accounts Center → Your information and permissions → Export your information →
> **JSON**

```bash
.venv/bin/python scripts/import_export.py ~/Downloads/instagram-export --dry-run
.venv/bin/python scripts/import_export.py ~/Downloads/instagram-export
```

Then drain slowly. Pushing a few hundred permalinks through yt-dlp back-to-back
is the fastest way to get rate-limited, which breaks live capture too:

```bash
while .venv/bin/python -m stash process --limit 1 | grep -q wrote; do sleep 45; done
```

## Recall

This is the part that decides whether you still use it in a month.

**MCP server** — `.venv/bin/python -m stash.mcp_server`. Register it and Claude
gets `search_stash`, `get_stash_note`, `list_stash_topics`, `recent_stash`,
`mark_stash_used`.

**Claude Code skill** — `../.claude/skills/stash-recall/`, already in place. It's
written to fire when you *start* technical work, not when you ask it to search,
because you will never think to ask.

**`mark_stash_used`** looks optional and isn't. `used` vs `unused` is the only
measure of whether this is a knowledge base or a graveyard. If nothing is ever
marked used after a month, change how recall works rather than filing more notes.

## How the frame gate works

Whisper is mandatory on Instagram — reels have auto-captions in the app but
Instagram doesn't expose them to downloaders
([yt-dlp#15874](https://github.com/yt-dlp/yt-dlp/issues/15874)), so the
subtitles-first shortcut other tools lead with never fires here.

Given a transcript, frames are pulled **only** where the audio stopped being
self-sufficient — segments Whisper was unsure about, and phrases like "run this
command" or "link in bio" that point at the screen. Idea borrowed from
[media-mcp](https://github.com/woosal1337/media-mcp). A talking head gets one
frame; a screen recording gets frames at the moments that matter; a silent reel
falls back to even sampling. Capped at 5 — frames dominate token cost.

```bash
.venv/bin/python -m pytest tests/ -q
```

## Layout

```
stash/
  config.py       env + paths
  db.py           capture queue + FTS5 note index
  fetch.py        CDN direct / yt-dlp / cobalt
  transcribe.py   groq or faster-whisper, with per-segment confidence
  frames.py       the confidence gate
  extract.py      claude CLI (subscription) or API fallback
  vault.py        markdown + frontmatter
  pipeline.py     orchestration
  remote.py       Worker-backed queue
  mcp_server.py   recall tools
worker/           Cloudflare Worker + D1 + R2
scripts/          data-export backfill
```
