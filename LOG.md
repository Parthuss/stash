# 2026-11-13 — Reddit / LinkedIn capture

Task worktree: `crew/1113-100834-6b58`. Main checkout: `/Users/parthus/Work/Experiment/stash`.

Implemented source adapters, worker/Python allowlists and URL normalization, source-aware extraction, source-specific errors, and URL/text input in the rebuilt signed iPhone Shortcut. App and llms copy changes stay small. The landing Works with chips were left alone because `worker/public/index.html` is claimed; `HANDOFF.md` has another worktree's uncommitted edits, so this log is the handoff.

**Availability:** Reddit and LinkedIn automatic fetching is disabled by default. Reddit's official current rules require approved OAuth access, which conflicts with this task's no-platform-credentials requirement. LinkedIn requires express permission for automated access, including public pages. See `docs/SOCIAL_SOURCES.md` for primary sources, switch semantics, retention conditions, and exact parser limits. No successful live post extraction or same-quality claim is made. Private, login-gated, removed, denied, and preview-only document posts are unsupported.

**Verification before integration:** complete Python suite passed (198 tests at that point); after adding rate/cookie regressions the social module passed 51 tests. `node tests/social_urls.cjs`, `node --check worker/public/app.js`, Worker TypeScript check, Shortcut build/sign and eight structural checks on its extracted signed artifact, and `git diff --check` passed. Parser fixtures are explicitly representative examples, not captured live responses. No iPhone device test.

Deployment, live denial smoke, and account cleanup results will be appended after integration. No platform access flags will be enabled for smoke testing. Existing promo WIP and other worktrees' edits must remain untouched.
