# Stash — handoff

Written 2026-08-20, last updated 2026-08-20. Everything in this file was checked
live against the running system, not recalled from memory — commands to
re-verify each claim are included so a new session can trust or re-check
anything here in seconds.

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

## Current state — verified 2026-08-20

```
tests:     97 passing (.venv/bin/python -m pytest tests/ -q)
git:       CASE_STUDY.md, HANDOFF.md, and docs/case-study-assets/ are staged
           but not committed — 15 commits on master otherwise, no remote configured
vault:     19 notes, all embedded (hybrid search fully indexed)
worker:    https://stash.parthus.workers.dev — healthy, deployed, current
daemon:    running under launchd (com.stash.daemon), polling every 15-90s,
           confirmed running CURRENT code as of this update (see the gotcha below)
mcp:       'stash' server registered at user scope, connected
skill:     ~/.claude/skills/stash-recall/ (global, fires in any project)
doctor:    all green (.venv/bin/python -m stash doctor)
```

Re-verify any of this:
```bash
cd /Users/parthus/Work/Experiment/stash
.venv/bin/python -m pytest tests/ -q
.venv/bin/python -m stash doctor
.venv/bin/python -m stash status
curl -s https://stash.parthus.workers.dev/health
claude mcp list
```

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
 iPhone (Instagram Share Sheet)
        │  "Stash" shortcut → shortcuts/Stash.cherri.template
        │  POST /ingest  (from anywhere: cellular, other Wi-Fi, Mac asleep)
        ▼
 Cloudflare Worker  (worker/src/index.ts, deployed, stash.parthus.workers.dev)
        │  writes to D1 (durable queue — capture never lost even if Mac is off)
        ▼
 Mac daemon  (stash/daemon.py, launchd-managed, polls /pending every 15-90s)
        │
        ▼
 Pipeline  (stash/pipeline.py)
   fetch.py       → yt-dlp, anonymous (no cookies needed — verified, see README)
   transcribe.py  → Groq whisper-large-v3 (full model, not -turbo — same free quota)
   frames.py      → confidence-gated frame selection from the transcript
   extract.py     → Groq qwen/qwen3.6-27b, vision one-image-per-request,
                     reasoning_effort="default" (NOT "none" — see below)
        │
        ▼
 vault/*.md  (markdown, source of truth)  +  stash.sqlite  (derived index)
        │
        ▼
 Recall
   stash/mcp_server.py    → 5 tools, registered at user scope
   ~/.claude/skills/stash-recall/  → fires proactively, any project
   stash/db.py search_notes()      → hybrid: FTS5 + sqlite-vec, weighted RRF
   stash/notify.py                 → ntfy push when a capture finishes (or fails)
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

1. **Phase 2 (Instagram DM webhook) is code-complete but not activated.**
   `worker/src/index.ts` has `/webhook/ig` fully implemented (HMAC-verified,
   handles Meta's subscription challenge) but needs `IG_VERIFY_TOKEN` and
   `IG_APP_SECRET` from a registered Meta app — neither is set. Today, capture
   only happens via the explicit share-sheet Shortcut, not by DMing yourself a
   reel the way the original idea envisioned.

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
