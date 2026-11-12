# SUMMARY: quality engine

Branch: `crew/1112-171228-quality-engine`, based directly on `49ae646` from `crew/1112-162347-e589`. No merge to master, push, deployment, secrets, rendering or posting.

## What changed

- Twelve sourced formats and a feature-specific audience-question bank; audience/question/feature remixing; twelve or more framework-diverse hook candidates with a transparent heuristic rank and editorial top three; structured timed reel beats and carousel slide jobs.
- Fifteen source-verified feature entries with eighteen current code references, approved claim text and explicit limits. New source findings make public sharing, revocation, JSON export, cached rereading and manual category correction available to ideation.
- Optional authorised-observation mining compares creator/format/age cohorts, keeps missing metrics missing and produces cited structure hypotheses rather than copied creative.
- Mandatory quality reports at stage, manual approval, auto-approval and publication. Independent editor/viewer sessions rerun at staging; reviewed sources are sealed before upload; report JSON precedes Telegram approval buttons; copy/policy/source/upload hashes prevent stale approval.
- [ideas.md](../ideas.md) now has five fresh briefs, all sixty hooks in the machine artifact, top-three hooks per brief, exact captions, timed VO/on-screen/shot plans or slide-by-slide jobs. The previous backlog is retained as history.

## Ten takeaways

1. Audience question plus demonstrable product proof beats feature-list ideation.
2. Write a truthful payoff before selecting the hook.
3. Generate different mechanisms, not synonyms.
4. Align visual, spoken and written openings.
5. Each beat/slide must advance the story.
6. Compare outliers within similar creator/format/age cohorts.
7. Remix structure; do not copy content or fabricate social proof.
8. An independent rubric is feedback, not a popularity forecast.
9. Approval belongs to particular bytes and copy.
10. A broader verified feature catalogue prevents repetitive content; measured post outcomes still decide winners.

Sources and detailed adoption/hype decisions: [quality playbook](2026-11-12-quality-playbook.md). Eight actual stash note ids are cited there and in [curated stash notes](quality-stash-notes.md).

## Repos adopted / rejected

No third-party code or new runtime dependency was adopted. Concepts were independently implemented from Vyral content-skills, HookCraft, creator playbooks, n8n/Make approval workflows and existing engine design. Eighteen repositories have live GitHub licence/SHA snapshots in [quality-repo-verified.json](quality-repo-verified.json). Unlicensed hook/script repos are rejected for reuse. Scraping additions, Postiz replacement, n8n/Baserow embedding, and redundant caption/assembly runtimes are not adopted. promptfoo/deepeval and transcription/alignment libraries remain optional future tooling, with their licences recorded.

## Validator list

- Truth: approved features/claim spans/source freshness, exact Jacinda attribution/quote, invented numbers/social proof, supported platforms, FSL, Claude Code-only automatic wording.
- Style: em dashes, slop, estimated reading grade, hook/caption/title lengths, caption lines, hashtag count, CTA and bio wording, all final editable copy including nested/unknown text leaves.
- Structure: ordered timed hook/re-hook/payoff/CTA; filmable shot notes; slide jobs/bridges.
- Media: actual ffprobe dimensions, vertical aspect, duration, codec/fps/audio sample rate, byte size; ffmpeg integrated LUFS/true peak; caption/transcript words and timing; reviewed VO equality; safe-zone boxes.
- Quality: independent 1-5 editor rubric with every dimension >=4, exact grounded claim audit, fresh-eyes two-/ten-second comprehension and production QA checks.
- Recency: configurable horizon (gate default six weeks), unknown dates conservative, drafts plus posted table plus promo/out history; lexical common product nouns removed, semantic originality independently reviewed.
- Integrity: report version/policy/copy/source/media bindings; fail-closed missing, malformed, stale or NaN evidence; no legacy/auto-approve bypass.

## Refreshed top five

1. **Sending a Skwirl note link? Check what the reader sees.** Reel: create a public note link, then inspect its signed-out reader view.
2. **You shared a note link. Can you take it back?** Carousel: stop sharing, show the old-link result, explain the copies/screenshot limit.
3. **Can you take your notes out of Skwirl?** Reel: Me > Account > Export my notes, then inspect verified fields in the actual JSON.
4. **Signal dropped. Can you still read your note?** Carousel: explain cached/device/open-page conditions without implying a full offline app.
5. **Skwirl Plus demo: wrong category? Fix it on the note.** Reel: a labelled staged mismatch, corrected manually; no false “Plus only” or model-error claim.

All five pass deterministic copy/style/structure and recency checks. All five received an independent Sonnet editor score of4/5 in every dimension, no issues, with complete supported-claim audits. Raw [final reviews](quality-judges-2026-11-12.json), rejected reviews and prior draft rounds are retained. These are **script reviews only**. No rendered asset, fresh viewer or publication approval is claimed.

## Verification and remaining boundary

Engine suite:98 tests passed, including good/bad JSON fixtures, real ffprobe on generated still fixtures and invalid media, independent-judge failures, stale/changed files, auto-approval/legacy records, no-side-effect rejection, and Telegram report ordering in mocked publishing tests. Compiler/source-reference/scope checks are recorded in the verification JSON.

A read-only ffprobe/ffmpeg smoke measurement of an existing fridge reel also ran: [measurements](quality-existing-media-smoke.json). This measured actual audio/video; it is not an overall PASS. The old file is96kHz AAC and slightly outside the new LUFS/peak targets, so it would need a compliant new render if ever reused through this gate. It was not modified.

Claude's protected MAKE files are unchanged. The next Maker run must implement [the evidence contract](../playbooks/INTEGRATION.md) and capture/validate the real demos. Until it supplies real files, captions/transcript/boxes and independently inspectable viewer evidence, staging intentionally blocks. Source-code changes require re-verifying catalogue hashes. No action or secret is needed from Parth for the committed planning/test work.
