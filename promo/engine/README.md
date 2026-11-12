# Skwirl content engine

Research -> make -> review -> approve -> publish -> learn. Built for Instagram Creator (Reels, carousels, statics) and YouTube Shorts (Reels only). **Inactive until Parth connects accounts and explicitly enables Actions.** Nothing was posted or staged by this build.

Read [SETUP.md](SETUP.md), [first 15 ideas](ideas.md), [sample carousel](samples/disappearing/README.md), [cost boundaries](COSTS.md), and [build verification](VERIFICATION.md).

| Step | Runtime | Implementation |
|---|---|---|
| Research | Weekly crew task, default Codex; ENGINE_AGENT can select claude-craveto | `bin/weekly.py`, `prompts/research.md`, `research/gather.py`: local stash MCP, performance, made-content inventory, optional YouTube/Reddit reads + agent web research |
| Make | Weekly agent with local production tools | `prompts/make.md`; existing Remotion + Kokoro + Whisper + beat-cut music/SFX for Reels; `content_engine.stills` + built-in imagegen + HTML for 1080x1350 stills |
| Content QA | Before staging | Existing content-qa skill; manual visual/truth/viewer pass plus checks; generated still copy/media hashes checked at validation |
| Approve | Dedicated Telegram bot, or local CLI intent | Owner-only Approve / Skip. AUTO_APPROVE=1 approves waiting items on the next tick; skipped/missed/failed records stay untouched. Existing product bot remains untouched because it already has a webhook. |
| Publish | GitHub Actions roughly every 15 min | Approved due records in private R2; Instagram create/poll/publish; YouTube persisted resumable sessions. No Mac needed after staging. |
| Learn | Same serialized Actions job, 48 h and 7 d snapshots | Supported IG metrics + YouTube statistics -> private performance.json -> pull-perf -> next research |

## Important behaviour

- One private R2 bucket contains media, queue and token state. Keep it private. Media gets expiring presigned URLs; never attach a public bucket domain. MEDIA_PUBLIC_BASE is local-test only.
- Tick and insights serialize in one Actions concurrency group; insight reads also happen after ticks so a replaced pending daily run does not lose the measurement opportunity.
- Post IDs are immutable. Repeated stage skips an existing ID even if awaiting approval. Revised copy/art needs a new ID and approval. Keep one staging producer per batch; do not stage the same new ID concurrently from multiple machines.
- Containers and resumable upload sessions are persisted. Interrupted YouTube uploads probe the same session and resume remaining bytes. Expired/ambiguous uploads stop for inspection. Exactly-once behaviour across remote API failures is not promised.
- Missing credentials leave clear disconnected/waiting states. No token or account is fabricated. Three publishing failures stop an item; Retry-After and retry delays are honoured. Instagram quota and per-platform daily caps apply.
- More than 12 h late without starting: ask again. /pause stops publishing. GitHub cron is best effort, not exact delivery at 22:30.
- Code rejects prohibited caption copy and missing QA. Manual truth review remains essential: a regex cannot prove a product claim. Remote staging cannot bypass QA with --no-qa.
- Research and generation are agent jobs, not a template factory. They require a running/waking production machine in this version. The runner start marker is not evidence of completion. A runner without imagegen access must stop with prompts, not substitute junk.
- Reddit has no automated write path. No product code or claimed handbook was changed.

## Local verification

From the repo root with dependencies installed:

```sh
promo/engine/.venv/bin/python -m pytest promo/engine/tests -q
PYTHONPATH=promo/engine promo/engine/.venv/bin/python -m content_engine.stills render \
  promo/engine/samples/disappearing/post.json --out promo/out/engine-sample/01-disappearing
```

The render produces a mechanical report only. A reviewer must inspect and write `qa/report.md` before validation/staging. See the committed sample QA for what was actually checked in this run. Generated PNGs/HTML remain in ignored promo/out; original art, editable script and preview are committed.

Repos: no upstream code copied. Keep existing Skwirl production tooling; reuse Postiz's adapter/approval separation and the official YouTube resumable protocol as architectural references. ShortGPT/MoneyPrinter stock assembly and archived trend scraping were not adopted. [Survey](research/repos.md).
