# Stash — handoff

Written 2026-08-20, last updated 2026-09-27. Everything in this file was checked
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

## Current state (verified 2026-09-27)

Stash is now a multi-user pilot, not just a personal tool. Friends join with an
invite code, save from their phone, browse in a web app, and connect Claude.

```
tests:     125 python (.venv/bin/python -m pytest tests/ -q)
           + worker/smoke.py against a local worker (tenancy, MCP, covers, lists, deletion)
web app:   https://stash.parthus.workers.dev  (worker/public/: index.html + app.js)
worker:    D1 migrations 0001-0011 all applied to prod
vault:     61 notes (owner), all with cover images in D1, 0 duplicates
pilot:     NO friends have joined yet (admin overview: users 0). Invite code is the
           JOIN_CODE worker secret; see docs/PILOT.md.
daemon:    launchd com.stash.daemon, claims everyone's saves while the Mac is on
cloud:     .github/workflows/process.yml drains friends' saves when the Mac is off.
           GitHub cron is "every 5 min" on paper, every 2-5 HOURS in practice (measured).
alerts:    worker cron every 30 min -> ntfy (stuck queue, failures, new joins)
```

Re-verify:
```bash
cd /Users/parthus/Work/Experiment/stash
.venv/bin/python -m pytest tests/ -q
.venv/bin/python -m stash doctor && .venv/bin/python -m stash status
curl -s https://stash.parthus.workers.dev/health
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
 Phone: iOS Shortcut (worker/public/Stash.shortcut, asks for the token on install)
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
- **Friends' saves can wait hours when the Mac is off.** The GitHub cron runner
  fires every 2-5 h in practice. Fix = have the Worker call `workflow_dispatch`
  on a guest ingest, which needs a fine-grained GitHub token (actions:write on
  this repo only) set as a Worker secret. Not done: needs the owner to create it.
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
