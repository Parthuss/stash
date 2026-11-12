# Quality research: source notes (Haiku helper, 12 Nov 2026)

Scope: short-form hooks, retention, scripts, carousels, and n8n/Make ops for the Skwirl content engine. Helper pass: seven searches, two batched GitHub runs and four batched stash runs (one retried after a wrong argument). No pages were opened in full (no WebFetch), so every claim below comes from search snippets. Treat each one as a lead to verify, not a citation.

**Superseded leads, not the final playbook.** Primary sources were subsequently opened by the main agent; see `2026-11-12-quality-playbook.md` and the independently refreshed `quality-repo-verified.json`. The narrow script-repo search below was unsuccessful; the main pass found Vyral content-skills, HookCraft and youtube-workflows. Pricing was not adopted or used.

## Evidence grades

- **Primary (platform-stated):** Meta / Instagram statements. Only described second-hand in search results so far.
- **Secondary (vendor blog, aggregator):** most of what came back. Directional only.
- **Anecdote:** single-creator data. Do not use as a benchmark.

## Hype vs. what is actually supported

| Claim circulating | Grade | Verdict |
|---|---|---|
| "Hook rate" benchmarks: >50% excellent, >60% functional, >80% strong | Secondary, conflicting | **Hype.** Sources disagree with each other. Judge against your own retention curve over time. |
| First 3 seconds decide the reel; put a hook (speech, on-screen text, or visual change) in the first 1-2 s | Consistent across vendors, no primary study | **Reasonable working rule**, not a proven law. Matches the skip-rate concept below. |
| Human speech in the first 3 s gives +25% 10-second retention (Emplifi) | Secondary, undated | **Unverified.** Do not cite until the Emplifi source is opened. |
| 0.84 correlation between 3-second retention and overall performance (120 videos) | Anecdote, one developer | **Discard as evidence.** Small self-selected sample. |
| Curiosity-gap hooks average 68% 3-second retention | Anecdote | **Discard as evidence.** |
| "85% of viewers watch muted" | Unsourced, repeated across blogs | **Hype. Do not use.** |
| Instagram replaced View Rate with Skip Rate (announced Aug 2025 via @creators, per coverage) | Secondary attribution; the announcement itself is platform-stated | **Supported in outline.** Skip rate = share of views where the viewer leaves in the first 3 seconds. Mosseri is not the source of the skip-rate change; he is linked to the earlier Views shift (Aug 2024). Do not attribute skip rate to him. |
| Retention chart, skip rate, share rate, views-over-time added to Insights (one source says April 2026; another says the rollout began in 2025) | Secondary, dates do not reconcile | **Feature exists per multiple sources.** Check dates before quoting them. Skip and share rate reportedly available only per post and per Reel. |
| Carousel engagement: mixed image+video 2.33% vs image-only 1.80%; 1.92% average; 3.1-4.2% for carousels | Vendor benchmarks, not comparable with each other | **Hype / unusable as benchmarks.** Different denominators and samples. |
| "Cover slide carries ~80% of the weight" | Vendor claim | **Plausible, unverified.** Treat as a design heuristic, not a number. |
| 7 vs 10 slides optimal | Conflicting vendor advice | **No consensus.** Let our own saves/shares data decide. |
| Carousel "1.4x more reach" attributed to Instagram leadership | Secondary citation of a secondary citation | **Do not use** until Meta's own statement is found. |
| One aspect ratio across all slides (4:5 preferred) | Vendor recommendation, consistent with common practice | **Low-risk** design rule. |
| 25 API-published posts per 24 h | Meta's 2021 launch post | **Outdated.** Meta's current docs (as reported) say 50 per rolling 24 h; a carousel counts as one post. One third-party source claims 100 in one section, which conflicts. Confirm per account via the `content_publishing_limit` endpoint before building around any number. |
| Carousel max 10 images (API); app allows 20 | Third-party docs | **Unverified** on Meta's side. Confirm before building. |
| Unpublished containers expire after 24 h | Meta guide per one source | **Plausible**, verify in the Meta page before relying on it. |
| Instagram ToS forbids scraping without written permission | Vendor blogs only; ToS text not read | **Likely true in outline, not verified.** Read Instagram's current Terms directly before any scraping decision. |

## Automation ops (n8n vs Make)

- **Pricing models (secondary):** Make bills per operation (each module step); n8n bills per execution (one whole workflow run). For a 10-step workflow run 1,000 times a month, Make counts about 10,000 operations and n8n counts 1,000 executions. Make's Core tier was cited at about $10.59/mo for 10k ops, and n8n Starter at roughly €20-24 for 1-2.5k executions. These figures disagree across sources and the official pricing pages were not reached. **Verify on make.com/pricing and n8n.io/pricing before deciding.**
- **Approval loops:** n8n has public templates for Telegram approve/reject before publishing, and a webhook-based wait node resumes the flow after the decision. No Make-specific Telegram approval template was found. Relevant to the existing Telegram approval step in the engine.
- **Publishing:** Neither tool posts to social media alone. Both need a publisher node or an API. Our engine already has its own publisher adapters; n8n or Make would be an orchestration option, not a required layer.
- **Ops judgement:** For our case (a single operator, few steps, approval loop, low volume), the stack we already have is enough. Adding n8n adds a hosted or self-hosted service with a non-OSI license (see repo audit) and no measured gain. Only revisit if the approval flow grows beyond what the current runner handles.

## Repositories

See `quality-repo-audit.json` for URLs, HEAD SHAs, SPDX, and reuse decisions. Headline points:

- yt-dlp (Unlicense), instaloader (MIT), praw (BSD-2), promptfoo (MIT), deepeval (Apache-2.0) are permissively licensed. Reuse is legal, but **only instaloader and yt-dlp touch scraping, which is a policy and ToS question first.** Our rule is to use official APIs.
- n8n and Baserow are "Other"/NOASSERTION (fair-code / source-available). Do not embed their code.
- Postiz is AGPL-3.0. Reuse the idea only, as the existing `repos.md` says.
- snscrape: the active repo found is JustAnotherArchivist/snscrape, GPL-3.0. Upstream appears to have been unmaintained for some time; treat as a reference only.
- The hook-generator repo found (Peter365-star/short-video-hook-generator) has no license and 0 stars. **Do not reuse.**
- The caption-generator repos are small, old, and mostly unlicensed; the one MIT repo is stale (2025). Not worth adopting.

## Gaps

1. No primary Meta or Instagram page was opened. The skip-rate, carousel-limit, and ToS claims need a WebFetch of the official pages before they go into any public copy.
2. The Emplifi +25% figure has no date and no primary source.
3. Official Make and n8n pricing pages were not reached.
4. No credible open-source script-generation repo turned up in the search (`gh search` returned none with a license). Nothing to evaluate.
5. Reddit and YouTube data were out of scope for this pass.

## Stash notes used as inputs

Curated in `quality-stash-notes.md`. None were marked used.
