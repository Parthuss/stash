# 2026-11-13 — Reddit / LinkedIn capture

Task worktree: `crew/1113-100834-6b58`. Main checkout: `/Users/parthus/Work/Experiment/stash`.

Implemented source adapters, worker/Python allowlists and URL normalization, source-aware extraction, source-specific errors, and URL/text input in the rebuilt signed iPhone Shortcut. App and llms copy changes stay small. The landing Works with chips were left alone because `worker/public/index.html` is claimed; `HANDOFF.md` has another worktree's uncommitted edits, so this log is the handoff.

**Availability:** Reddit and LinkedIn automatic fetching is disabled by default. Reddit's official current rules require approved OAuth access, which conflicts with this task's no-platform-credentials requirement. LinkedIn requires express permission for automated access, including public pages. See `docs/SOCIAL_SOURCES.md` for primary sources, switch semantics, retention conditions, and exact parser limits. No successful live post extraction or same-quality claim is made. Private, login-gated, removed, denied, and preview-only document posts are unsupported.

**Verification before integration:** final complete Python suite passed (200 tests, including 51 social tests). `node tests/social_urls.cjs`, `node --check worker/public/app.js`, Worker TypeScript check, Shortcut build/sign and eight structural checks on its extracted signed artifact, and `git diff --check` passed. Parser fixtures are explicitly representative examples, not captured live responses. No iPhone device test.

**Integrated and deployed:** fast-forwarded master and pushed through `000646d`; `cd worker && ./deploy.sh` succeeded on its first attempt, Worker version `c15e3d85-b279-4f39-8164-7fd140228472`. No migrations or source access flags were applied. Processor flags now have optional GitHub variable plumbing, also off when unset.

**Live denial smoke:** exactly one ingest submission per candidate: Reddit text, Reddit native video, LinkedIn text+image, LinkedIn native video. All four returned HTTP 422 with the source's approval-required reason. Each was also passed once to the actual guest `pipeline.process` and stopped at the permission check. Zero source network requests, zero saves, zero notes. Created throwaway account via the authenticated admin endpoint, checked its counts, deleted via `/v1/account`, and verified the token returned 401. Evidence: `docs/social-smoke-2026-11-13.json`. This is **not** four successful public fetches: source accessibility, actual media completeness, authorized recorded fixtures, and live extraction quality are still untested.

**Live deployment verification:** `/health` returned 200; deployed `app.js`, `llms.txt`, and signed `Skwirl.shortcut` match committed bytes. All 33 baselined unrelated dirty-file hashes in main were preserved. Evidence: `docs/social-live-verification-2026-11-13.json`.

**Needs Parth/external approval:** resolve the no-platform-credentials requirement against Reddit's OAuth requirement and retention/deletion rules; secure LinkedIn's express automated-access permission. Do not turn on flags to bypass these requirements. Then obtain authorized real fixtures and repeat the four success/quality smoke cases. Real iPhone runtime testing and claimed landing/HANDOFF updates remain pending. No other worktree's uncommitted changes were merged or overwritten.
