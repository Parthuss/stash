# Skwirl content engine

Research ideas, make the posts, publish them to Instagram (Creator) and YouTube Shorts, learn from the numbers.
Parth's only job: tap **Approve** or **Skip** on Telegram (or nothing at all, with `AUTO_APPROVE=1`).
Setup: [SETUP.md](SETUP.md).

```
 Fri 10:00 (Mac, launchd)            Sat 10:00 (Mac, launchd)                 every 15 min (GitHub Actions)     daily
 crew task, Craveto account          crew task, Craveto account
 ┌───────────────┐   ideas.md    ┌──────────────────────────────┐ stage  ┌──────────────────────────────┐  ┌──────────┐
 │ 1 RESEARCH    │ ────────────> │ 2 MAKE  top 5 -> scripts ->   │ ─────> │ 4 PUBLISH  Telegram taps ->   │  │ 5 LEARN  │
 │ gather.py +   │               │ Remotion + Kokoro + music ->  │  R2 +  │ approved + due -> IG Reel /   │  │ 48 h, 7 d│
 │ web sweep +   │ <───────────┐ │ content-qa (must PASS) ->     │ Tele-  │ carousel + YouTube Short ->   │  │ insights │
 │ performance   │ performance │ │ schedule.json -> validate     │ gram   │ "Posted" message              │  │          │
 └───────────────┘   .json     │ └──────────────────────────────┘        └──────────────────────────────┘  └────┬─────┘
                               └──────────────────────────────────────────────────────────────────────────────────┘
                                          3 APPROVE: Approve / Skip on Telegram (default), or AUTO_APPROVE=1
```

| Step | Where it runs | Code |
|---|---|---|
| 1 Research | crew task on claude-craveto, Fri | `prompts/research.md`, `research/gather.py` (Parth's saves via the stash vault, performance, what's made, top Shorts, Reddit questions) |
| 2 Make | crew task on claude-craveto, Sat | `prompts/make.md` (the existing Remotion + Kokoro pipeline and the content-qa skill), `content_engine init-schedule / validate / stage` |
| 3 Approve | Telegram bot (polled), or `AUTO_APPROVE=1` | `content_engine/telegram.py`, `publisher.handle_telegram` |
| 4 Publish | GitHub Actions cron, no Mac needed | `.github/workflows/content-engine.yml` -> `content_engine tick` (`publisher.py`, `instagram.py`, `youtube.py`) |
| 5 Learn | GitHub Actions, daily | `content_engine insights` -> `performance.json` in R2 -> `pull-perf` for research |

## Design choices
- **Publishing never touches the Mac or the product worker.** Media and the queue live in one private R2 bucket;
  Instagram fetches media through 1-hour presigned links (Instagram Login has no direct upload, so media must be at a
  URL); YouTube uploads stream from R2 inside the Action.
- **No double posts.** Every step saves its state before the next (container id before waiting, "publishing" before
  media_publish, "uploading" before the YouTube PUT). A rerun after a crash checks the container's status or the
  channel's latest uploads and records what already went out instead of posting again. One Action runs at a time.
- **Nothing unapproved goes out.** Only posts with status `approved` publish; only taps from Parth's chat count; a slot
  missed by more than 12 h asks again; `/pause` stops everything.
- **Rules enforced in code, not just prompts:** `validate` blocks em dashes, "open source", TikTok/Threads,
  "unlimited", "instant", store-app claims, missing files, caption/title limits, and any piece whose
  `qa/report.md` doesn't say `Verdict: PASS`.
- **Secrets stay out of logs.** The repo is public, so are Actions logs: errors are redacted, only post ids and states
  are printed. Secrets enter through hidden prompts (`bin/connect.py`) and `gh secret set` via stdin.

## Files
```
content_engine/   config, store (R2 / local), http (redacting), instagram, youtube, telegram,
                  schedule (schedule.json + rule checks), stage, publisher (tick), insights, cli
tests/            35 tests against a fake Instagram + YouTube + Telegram (httpx.MockTransport)
research/         gather.py, repos.md (repo survey), api-facts.md (checked 12 Nov 2026), signals for run 1
prompts/          research.md, make.md (the weekly crew task prompts)
bin/              connect.py (accounts), weekly.py + launchd plist (weekly tasks)
examples/         week-17nov.schedule.json (the real week-17 batch as a schedule)
ideas.md          the backlog (committed snapshot; live copy in promo/out/engine/ideas.md)
performance.json  pulled numbers (empty until posts go out through the engine)
```

## Repos reviewed (full notes: research/repos.md)
Reused as code: none wholesale. We own a ~600-line publisher instead of running a platform. Borrowed: Google's
`upload_video.py` resumable-upload/retry pattern (written from scratch on httpx), Postiz's container-poll-publish
flow for Instagram (idea only, AGPL), `praw`-style app-only Reddit reads (plain HTTP in `gather.py`).
Skipped: ShortGPT, MoneyPrinter/MoneyPrinterTurbo, short-video-maker (stock-footage slideshows: the slop we don't make),
Mixpost (Laravel, paid features), n8n templates, `instagrapi` (private API, ban risk), `tokland/youtube-upload` (stale),
pytrends (archived).

## Run it by hand
```
cd promo/engine
python -m content_engine init-schedule ../out/week-24nov --start 2026-11-24 --every 1
python -m content_engine validate ../out/week-24nov
set -a; . ~/.config/skwirl-engine/env; set +a
python -m content_engine stage ../out/week-24nov
python -m content_engine queue
python -m pytest tests -q
```
