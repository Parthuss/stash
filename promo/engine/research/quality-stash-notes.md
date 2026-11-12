# Quality research: curated stash notes (12 Nov 2026)

Source: stash MCP (`recent_stash`, `search_stash`, `get_stash_note`) run from the main checkout. Read-only. **Nothing marked used.** Only ids, titles, source URLs, and a one-line teaching are kept here. No transcripts.

Queries run: hooks reels short form; content strategy; carousel storytelling (no matches); remotion video; viral format; retention script (no matches); instagram reels; n8n automation.

## Strongest saves (curated, 8)

| Note id | Title | Source URL | Teaching for the engine | Confidence |
|---|---|---|---|---|
| 448e6dbc597c4859 | 7 Short-Form Video Hook Structures (Tutorial, Comparison, Myth-Bust, Do/Don't, Tip, Transformation, Challenge) | https://www.instagram.com/reel/Dbq8RMnB9lK/ | Seven hook templates can be filled with a specific topic to generate several angles. Good input for ideation: pick a template, then fill it with a real product fact. | Medium (creator demo, no data) |
| e98a5f551dbd4369 | The 'Duh' Test: Rewriting Truism Hooks into Curiosity Gaps | https://www.instagram.com/reel/DalXaSJP6RV/ | Flag hooks that state an identity or a truism; rewrite with a specific value contrast so there is an open question. A usable lint rule for the hook validator. | Medium (framework, no measured lift) |
| 2ef3025f7a634a53 | 4-Bucket Content Strategy: Problem, Educational, Brand, Relatable | https://www.instagram.com/reel/DUnetgzEvVh/ | Balance each week's posts across four buckets so the feed doesn't stall on one type. Maps to the weekly plan's bucket field. | Medium |
| 23718d65cfa74095 | 5-Role Claude Content Team Workflow (Strategist, Director, Copywriter, AI Director, Editor) | https://www.instagram.com/p/DaydOp3jdX0/ | Separate roles per stage: strategy, direction, copy, visual direction, and edit. Reinforces the research > make > review split. Conceptual only; do not copy the multi-agent setup, which is heavier than needed. | Low (conceptual, no evidence) |
| 29b810c9bac64209 | Ad-research agent that scrapes competitor video ads and extracts creative patterns (idea only) | https://www.instagram.com/reel/DalMazPMVvY/ | Summarising recurring hook/format patterns across many competitor videos is a sound method. Scraping Instagram or TikTok conflicts with the official-API rule; use the Meta Ad Library API or manual sampling instead. | Low (concept, not shown) |
| 6b2ba71495db4dbc | GitHub repository of ready-made n8n automation workflows | https://www.instagram.com/reel/Dbx_RdVi_r_/ | Pre-built n8n templates exist, but the repo is unverified; treat as reference only, not adoption. | Low |
| f7afa46d5e8e4252 | 8 Static Ad Formats for Facebook Ads (Fake Tweet, Grid Dump, Forwarded Email) | https://www.instagram.com/reel/DbHjteVSKyc/ | Formats that mimic organic content. Useful as a carousel-format checklist for the design lane, not as a claim about performance. | Low-medium |
| 56dd124b48584e7d | Claude Code + Remotion for AI-generated motion graphics | https://www.instagram.com/reel/DZSJJ9DoPnF/ | Promotional claim with no setup detail. Confirms the pattern we already use (Remotion for motion), gives no new method. Do not treat the capability claim as proven. | Low (promo) |

## Hype check on these saves

- None of the 8 carries measured performance data. They are creator frameworks, not evidence. Use them to generate hypotheses, then test against our own performance (`performance.json`).
- The hook structures and the 'Duh' test are the most directly usable for `hooks.py`. The 4-bucket and 5-role notes are better used as planning checklists.
- Two searches (carousel storytelling, retention script) returned no matches. Our carousel and retention knowledge is thin in the vault, so it has to come from the web research in `quality-source-notes.md`.

## Not used

Several recent saves were off-topic for quality (SEO, App Store grids, Substack lists, WhatsApp bots). Excluded.
