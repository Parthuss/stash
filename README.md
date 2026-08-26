# stash

Turn the Instagram posts you save into notes Claude finds on its own.

You already capture reliably — share, tap your own account, done. What fails is
everything after: a URL tells you nothing about what was in the post, so you
never triage it, and nothing surfaces it when it would be useful. This is not a
bookmarking tool. It transcribes what you saved and hands it back unprompted
while you work.

https://github.com/user-attachments/assets/14edb1e5-5f7a-46ea-96dd-a7c2c51c223e

```
share sheet ─┐
             ├─► /ingest ─► queue ─► fetch ─► transcribe ─► frame gate ─► extract ─► vault/*.md + FTS5
data export ─┘                                                                              │
                                                            Claude Code skill · MCP · weekly digest ◄┘
```

## Try it (5 minutes)

The whole pipeline, no phone and no Cloudflare required yet — just a free
[Groq key](https://console.groq.com/keys) (Groq Whisper transcribes
reel/video audio; `qwen/qwen3.6-27b` reads posts, carousels, and reel frames
into the final JSON note; no Claude call happens while processing).

```bash
git clone https://github.com/Parthuss/stash && cd stash
bash install.sh   # Homebrew deps, venv, pip install, .env, prompts for the Groq key
```

Skipped the key prompt? Add `GROQ_API_KEY=...` to `.env` and re-run
`.venv/bin/python -m stash doctor` — it names anything still missing and the
exact command to fix it. For transcription-only offline (no vision/extraction
fallback), `.venv/bin/pip install -e ".[local-whisper]"`.

```bash
.venv/bin/python -m stash add "https://www.instagram.com/reel/..." -n "why I saved it" --process
.venv/bin/python -m stash search "agent memory"
```

Notes land in `vault/` as markdown with YAML frontmatter — that's the durable
artifact, `stash.sqlite` is a derived index `stash reindex` rebuilds from disk.

Then wire up recall so Claude finds these on its own instead of you having to
search:

```bash
claude mcp add --scope user stash -- /path/to/stash/.venv/bin/python -m stash.mcp_server
cp -r stash-recall ~/.claude/skills/stash-recall
```

User scope on both, not project scope — connected in every Claude Code
session regardless of which repo you're in. Gives Claude `search_stash`,
`get_stash_note`, `list_stash_topics`, `recent_stash`, `mark_stash_used`, and
the skill fires proactively when you *start* related work, not only when you
ask it to search — see [Recall](#recall) below for how that's built.

That's the whole loop: save something, ask Claude about it later, watch it
already know. Everything past here is optional — capturing from your phone
instead of `stash add`, and the internals if you want them.

### Instagram cookies — you probably don't need any

Both cookie settings
ship blank on purpose. Public reels download fine anonymously; measured on real
saved posts in August 2026, metadata and full video+audio both came back with no
session at all.

Verify it yourself before trusting this:

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

`add` without `--process` just queues — run `stash process` whenever, and
`stash status` for queue/vault health.

## Capture from your phone

Three pieces: a Shortcut that posts to Cloudflare, a Worker that holds the
queue, and a daemon on the Mac that drains it. Set up in that order.

### 1. Deploy the Worker

This is what makes capture independent of your Mac — the phone talks to
Cloudflare over HTTPS from anywhere: cellular, a café, lid shut.

```bash
cd worker && npm install
npx wrangler login                    # browser, free account, no card
npx wrangler d1 create stash          # paste the id into wrangler.toml
npx wrangler d1 migrations apply stash --remote
npx wrangler secret put STASH_SECRET  # any long random string
npx wrangler deploy
```

Put the deployed URL and the same secret into `.env` as `STASH_WORKER_URL` and
`STASH_SECRET`. Everything downstream switches to the remote queue on its own.

Free tier throughout: Workers 100k req/day, D1 5 GB. **No R2 and therefore no
payment method** — R2 is the one product here that asks for a card, and
nothing currently running needs it, so it is left unconfigured.

### 2. Build and install the Shortcut

```bash
sh shortcuts/build.sh
```

Renders `shortcuts/Stash.cherri.template` with your Worker URL and secret,
compiles it with [Cherri](https://cherrilang.org), and signs it. AirDrop the
resulting `Stash.shortcut` to your phone, or open it on a Mac on the same Apple
ID and it syncs.

**Delete every older Stash shortcut.** Several near-identical entries in the
share sheet, some pointing at endpoints that no longer exist, is how this
silently broke before.

The Shortcut says **"Queued"**, not "saved" — deliberately. It only knows the
request reached Cloudflare. Confirmation that a note actually exists comes
separately, from step 4.

### 3. Run the daemon

```bash
sh stash/launchd/install.sh   # starts at login, restarts on crash
```

Or `stash daemon` in a terminal to watch it work. Either way:

```bash
stash status    # says ALIVE/DOWN, checking pid liveness AND heartbeat age
```

That check exists because a receiver process once died quietly and nothing
said so. A hung-but-not-exited daemon is reported down too, not just a dead one.

### 4. Turn on confirmation

```bash
stash notify          # sends a test; --fail for the failure shape
```

Set `STASH_NOTIFY` to `ntfy` or `imessage` in `.env` first — see the comments
there. Both are free; `ntfy` is verified working, `imessage` needs no app
install but does need a one-time Automation grant, so test it before trusting it.

### What still needs the Mac

Processing. A save is never lost — it sits in D1 — but the note appears when the
Mac is next awake with the daemon running. Capture is the part that no longer
depends on anything.

The old iCloud-file path (`shortcuts/Stash-icloud.cherri` + `stash watch`) still
works and needs no accounts at all, if you'd rather have zero infrastructure.

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

This is the part that decides whether you still use it in a month. Both
pieces get installed in [Try it](#try-it-5-minutes) above — this is what
they actually do.

**MCP server** — `stash/mcp_server.py`, user scope: connected in every
Claude Code session regardless of which repo you're in, not only inside this
one. Gives Claude `search_stash`, `get_stash_note`, `list_stash_topics`,
`recent_stash`, `mark_stash_used`. `search_stash` returns compact hits (short
id, title, one-line summary, tools) to keep it cheap to call often;
`get_stash_note` pulls full detail — transcript, next step, permalink — for
whichever hit turns out to matter.

**Claude Code skill** — `stash-recall/`, also user scope and for the same
reason: the material in the vault isn't specific to any one project, so the
skill needs to fire wherever you happen to be working. It's written to
trigger when you *start* technical work, not when you ask it to search,
because you will never think to ask.

**`mark_stash_used`** looks optional and isn't. `used` vs `unused` is the only
measure of whether this is a knowledge base or a graveyard. If nothing is ever
marked used after a month, change how recall works rather than filing more notes.

**Search is hybrid** — FTS5 (exact tokens: a repo name, a product name) fused
with local vector search (meaning) via weighted Reciprocal Rank Fusion. Plain
keyword search alone missed things by paraphrase: *"how do I make videos
automatically"* ranked the two notes actually about generating video 6th and
8th, behind a WhatsApp chatbot, because BM25 has no notion that "automatically"
and "generation" are related ideas. Embeddings run locally via
[fastembed](https://github.com/qdrant/fastembed) + `BAAI/bge-small-en-v1.5` (no
API key, no network, no PyTorch) and RRF fusion runs through
[sqlite-vec](https://github.com/asg017/sqlite-vec) inside the same SQLite file
as everything else — no separate vector database. Degrades to keyword-only,
with a one-time warning, if either is unavailable; a capture can never fail
over search infrastructure. `stash doctor` reports vector status and flags if
stored vectors were embedded under a different model than the one currently
configured.

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

Two vision limits worth knowing before you tune anything, both measured against
the live API rather than assumed:

- **3 images per request is a hard API cap**, not a choice. A 4th returns
  HTTP 400. `_describe_visuals` batches around it.
- **512px is the optimum, and bigger is worse.** Token cost is flat across
  resolution (Groq normalises images to a fixed budget), but on a dense
  screenshot 512px transcribed 1328 chars including "MIT license" while 1024px
  managed ~700 and garbled text the smaller version read correctly. Raising it
  looks free and isn't.

```bash
.venv/bin/python -m pytest tests/ -q
```

## Layout

```
install.sh        Homebrew deps, venv, pip install, .env, Groq key prompt
stash-recall/     the Claude Code skill — copy to ~/.claude/skills/
stash/
  config.py       env + paths
  db.py           capture queue + FTS5 note index
  fetch.py        CDN direct / yt-dlp / cobalt
  transcribe.py   groq or faster-whisper, with per-segment confidence
  frames.py       the confidence gate
  extract.py      groq vision + structured JSON
  vault.py        markdown + frontmatter
  pipeline.py     orchestration
  remote.py       Worker-backed queue client
  daemon.py       poll loop + heartbeat (the durable capture path)
  notify.py       iMessage / ntfy confirmation
  local_receiver.py  LAN receiver (superseded by the Worker)
  watch.py        iCloud-file watcher (zero-infrastructure fallback)
  mcp_server.py   recall tools
  launchd/        run the daemon at login
worker/           Cloudflare Worker + D1 (no R2 — see above)
shortcuts/        Cherri source for the iOS Shortcut
scripts/          data-export backfill
```
