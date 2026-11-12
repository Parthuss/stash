# Build verification and handoff

12 Nov 2026. Branch: `crew/1112-162347-e589`. Base: `00aa873`. Reused committed prior work `beb59a1` and `6b15273` from the stopped branch by cherry-picking into this worktree; no uncommitted work was copied, merged or overwritten. No merge or push.

## What actually ran

| Check | Actual result |
|---|---|
| `scripts/whatsup`, Git/worktree state | Read before starting. Own BOARD claim added; claimed handbook and other agents' product/promo work preserved. |
| Read existing pipeline | Handbook, content-qa skill, source fonts/colours, week17 script and output QA/README read. Week17 is in crew/1111-203445-cabf, absent in main. No changes to those files. |
| `research/gather.py` | Ran first with local CLI reads, then successfully with local stash MCP over stdio. Nine concept queries. Private raw outputs under ignored promo/out/engine/inputs. |
| Public source research | Live Reddit web results, GitHub READMEs and six repository API records; curated sources in research/. No current viral format or performance winner claimed. |
| Built-in imagegen | Two distinct images generated, inspected and imported into samples/disappearing/art. Exact prompts in post.json. |
| HTML still renderer | Final six PNGs 1080x1350, browser fonts loaded, no overflow/overlaps. cover.png equals 01.png. Contact sheet plus full-size slide 5 inspected. |
| Applicable content-qa | PASS for stills, self-reviewed per task override. QA.md records scope and repair rounds. No video/audio checks claimed. |
| Changed-render QA smoke | Cloned sample to ignored engine-render-qa-smoke, changed copy, rendered; previous PASS became PENDING with prior report retained. Original sample unchanged. |
| Python mocked API suite | **49 passed** via `/Users/parthus/Work/Experiment/stash/.venv/bin/python -m pytest promo/engine/tests -q`. |
| Schedule validation | Original sample `content_engine validate promo/out/engine-sample`: OK. Not staged. Draft slot 23 Nov, 22:30 IST. |
| Syntax and config | `python3 -m compileall -q promo/engine`, `node --check promo/engine/bin/render-stills.cjs`, both workflow YAMLs parsed with PyYAML, `git diff --check`: passed. YAML parse is not a hosted Actions execution. |
| Scope/secret spot check | No changes under worker/, stash/, promo/src/ or claimed handbook. Token-pattern filename-only scan returned no hits. This is a spot check, not a formal secret audit. |

Mock suite covers approval ownership, stale Telegram taps, missed slots, pause/dry-run, per-platform caps, post isolation, replay/recovery, token refresh, metrics fallback, 48 h / 7 d learning, statics/carousels, immutable staging, QA changes, configurable runner, persisted YouTube sessions, Retry-After and private R2 configuration. These are simulated service contracts, not live platform verification.

## Architecture corrections to recovered work

- Weekly agent configurable, Codex default, maximum supported effort; no Claude-only delegation assumed.
- Generated-art static/carousel pipeline added with editable text, real brand fonts/tokens, mechanical checks and manual QA.
- Tick/insights serialize because both rewrite post records. Insights also run after ticks to survive replacement of a pending daily run.
- Existing staged IDs cannot be rewritten, including awaiting items. New content requires a fresh ID/approval.
- YouTube saves session URI before bytes and probes/resumes it after interruption. Ambiguous legacy/expired uploads stop for inspection rather than guessing a fresh upload is safe.
- R2 public-base option rejected: queue and refreshed tokens share the bucket, so it must stay private. Only individual media gets presigned URLs.
- Remote QA bypass disabled. Generated still hashes detect edits; a changed render invalidates the old human verdict.
- AUTO_APPROVE in Actions now works for waiting staged items as well as local auto-approved staging. Skipped/missed/failed records remain untouched.
- Rate-limit Retry-After and exponential delay respected. Unsupported/null insights remain missing; raw skip rate not converted without scale verification.
- Setup helper has explicit short-to-long IG exchange and shell-safe local env persistence. No helper was used to enter real credentials.

## Boundaries and remaining owner work

No accounts/apps/bots/buckets created; no credentials entered; no uploads, Telegram messages, social posts, Reddit comments, live workflow dispatch, launchd install, worker deployment or secret changes. No videos made this run. The two artwork calls used the built-in image tool; no separately configured image API was called.

Parth must create/connect the Meta app + Creator grant, Google project/OAuth channel grant, dedicated approval bot and private R2 bucket, set Actions secrets, then separately authorise an account-level live check and activation. Meta documentation rechecks were blocked by 429/unavailable; version, permissions, metrics and public-fetch behaviour remain unverified with the account. Exact steps are in SETUP.md.

Research/production still require a production machine with crew, the vault, Remotion/Kokoro/Whisper and imagegen access. Publishing/learning are Mac-independent after staging. A runner lacking imagegen stops with an explicit missing capability. No claim of reliable blind content quality or exact cron timing is made.

Weekly cost: see COSTS.md. Expected infrastructure increment can be near zero within free allowances; actual subscription quota and image usage are account-dependent. Craveto usage was zero in this run. No exact all-in weekly price is supported.
