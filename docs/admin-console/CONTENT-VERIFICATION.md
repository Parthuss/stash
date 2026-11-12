# Content engine integration verification — 12 November 2026

Completed in isolated worktree `crew/1112-224648-d30e`, integrated into master without staging Parth's promo WIP.

## Merge history

1. `80d711d` — `--no-ff` engine base, crew/1112-162347-e589. Base engine snapshot: **49 passed**.
2. `04ddb9d` — `--no-ff` Claude Maker, crew/1112-165200-8149. **50 passed**. Claude SETUP/COSTS/README and renderer standard retained.
3. `dc5bb04` — `--no-ff` mandatory quality/ideation, crew/1112-171228-quality-engine. **99 passed** before integration additions.

The requested `crew/1112-171228-dc1f` branch points to old master; the specified worktree's actual quality branch was `crew/1112-171228-quality-engine` at `ee65ed5`. All test-function names from all three source branches are retained; two replaced base cases were restored using the Maker assets schema.

## Final checks actually run

- Engine pytest: **118 passed**, Python 3.12 fresh venv from requirements.txt; also 118 passed on Python 3.14.
- Maker integration includes actual Chrome still rendering, DOM-measured text evidence, ffprobe dimensions and full report validation with explicitly synthetic test-only independent reviews. This is test evidence, never editorial approval of production content.
- `node tests/content_console.cjs`: **14 checks**; `node tests/admin_console.cjs`: **16 checks**.
- `tests/content_console_browser.cjs`: **6 groups** across desktop/phone, actual private image decode and video frame, deployed CSP, queued actions, gate/hash binding, stale errors, session clearing and hostile copy. All API calls intercepted.
- `tests/admin_console_browser.cjs`: **12 groups** passed, including owner account switching and private DOM clearing.
- `node --check` on console.js, render-stills.cjs and browser/live test scripts; `sh -n` make-reel.sh; Worker `npm run typecheck`; `git diff --check`.
- Workflow read: the entire publishing job requires `vars.ENGINE_ENABLED == '1'`. Live GitHub variable inspection found ENGINE_ENABLED and ENGINE_DRY_RUN unset. Disabled local `bin/workflow.py tick` returned before opening state; no state folder was created. Seven parametrized tests cover every disabled command without constructing clients.
- Protected-path committed diff from `73622bc`: empty for Parth's Root/CaptureScene/MetaPromo/ReceiptsPromo and the other agent's app.js/index.html/llms.txt/mcp.ts. Main checkout's original dirty/untracked promo files remain present.

## Deployment and live verification

Ran `cd worker && ./deploy.sh`, without migrations. Version **41475100-3766-4a09-8781-01d507660bf1** is deployed on skwirl.app.

Read-only `tests/content_console_live.cjs` passed against https://skwirl.app/owner at **1440px and 390px**: actual sample image decoded, six setup rows, five ideas, sample approval disabled, workflow actions hidden, no page errors or horizontal overflow. Owner API returns no-store; missing auth is denied. Production CSP permits the authenticated blob previews. First capture attempt waited on a lazy image before scrolling; the corrected check scrolls and asserts image count and decode, then passes.

Live screenshots: [desktop](content-live-1440.png), [phone](content-live-390.png). These capture only the Content section and seeded local sample; customer tables and private account data are outside the crop. Provenance: browser screenshots of the deployed /owner using this repository's read-only live-check script. No AI-generated imagery was created for the console.

Independent scoped UI review: [CONTENT-REVIEW.md](CONTENT-REVIEW.md), disposition **ship** after valid decoded-media desktop/phone captures. This is layout/interaction review, not publication approval.

## CI runner dependency repair

The first pushed GitHub run failed because Ubuntu no longer includes ffprobe (116 passed, one optional render skipped, one media-measurement test failed). The workflow now installs FFmpeg explicitly, installs the locked Playwright package and Chromium, and supplies their paths so the real render case runs in CI rather than skipping. It uses the complete requirements.txt and checks the browser executable before pytest. This changes only the test workflow; the publishing workflow remains disabled. The repaired [GitHub run](https://github.com/Parthuss/stash/actions/runs/43270701264) passed all 118 tests, including the real still render (no skips).

## What is live and what remains

The owner sees setup, curated ideas and the local sample now. Real drafts, scheduled items and 48h/7d results populate from the same private R2 engine state after configuration. Approve/Skip queues a displayed-content hash; the serialized engine applies the same full report/policy/uploaded-byte gate as Telegram. Missing, failed, changed or stale reports refuse approval and publishing.

Parth still needs the Instagram and YouTube accounts/OAuth, private R2 credentials/bucket plus Worker CONTENT_ENGINE binding, dedicated Telegram bot, dedicated CONTENT_GH_TOKEN and Mac launch agent per SETUP.md. Research/make buttons dispatch a dry-run workflow request to private storage; the awake Mac picks it up within about 15 minutes. Nothing enables GitHub ENGINE_ENABLED, AUTO_APPROVE or live publishing. Console actions keep a persistent dry-run lock; clearing it is a separate deliberate live setup step.

No accounts, credentials, secrets, migrations, Telegram messages or social posts were created by this integration.
