# Open-source survey for the Skwirl content engine

Date: 2026-11-12. Stars, licence and last push read from the GitHub API today. Code was not inspected beyond repo listings, so "what it does" comes from READMEs and descriptions. Items marked (memory) are from prior knowledge, not re-verified.

## Table

| Repo | Stars | Licence | Last push | What it is | Verdict |
|---|---|---|---|---|---|
| gitroomhq/postiz-app | 41.4k | AGPL-3.0 | 2026-11-12 | Self-hosted social scheduler (IG, YT, 20+ networks), Next.js + Nest + Postgres + Temporal/Redis | BORROW IDEA (skip running it) |
| gitroomhq/postiz-agent | 568 | other | 2026-11-05 | CLI/agent wrapper to drive Postiz | SKIP (needs Postiz) |
| inovector/mixpost | 3.9k | MIT | 2026-03-16 | Self-hosted Laravel scheduler; Pro features paywalled (memory) | SKIP |
| RayVentura/ShortGPT | 8.2k | MIT | 2025-02-10 | LLM script + TTS + stock footage editing engine | SKIP (stale, stock footage) |
| FujiwaraChoki/MoneyPrinter | 14.2k | MIT | 2026-03-26 | Topic to stock-footage video with TTS, YT upload | SKIP (slop by design) |
| harry0703/MoneyPrinterTurbo | 142.7k | MIT | 2026-11-12 | Same idea, bigger: WebUI, many LLM/TTS providers, subtitles | SKIP (slop, huge); maybe skim subtitle timing |
| gyoridavid/short-video-maker | 1.5k | MIT | 2025-06-21 | Remotion + Kokoro + Whisper captions + Pexels, REST and MCP | BORROW IDEA (closest to our stack; already surpassed) |
| remotion-dev/template-tiktok | 308 | none stated | 2026-11-09 | Official Remotion TikTok template, Whisper word-level captions | BORROW IDEA (caption component) |
| hexgrad/kokoro, remsky/Kokoro-FastAPI | 10.1k / 5.7k | Apache-2.0 | 2025-08 / 2026-11 | Kokoro TTS model, plus OpenAI-compatible server | REUSE only if we want a long-running TTS server; otherwise keep current local call |
| AgriciDaniel/claude-shorts | 378 | MIT | 2026-07-11 | Claude skill: long video to shorts via FFmpeg (10 steps) | BORROW IDEA (skill structure) |
| mutonby/openshorts | 7.9k | MIT | 2026-11-12 | Self-hosted clipper: long video to 9:16 clips, FastAPI + FFmpeg | SKIP (we have no long source video) |
| Anil-matcha/AI-Youtube-Shorts-Generator | 6.0k | MIT | 2026-11-10 | Clips highlights out of long YouTube videos | SKIP (same reason) |
| elebumm/RedditVideoMakerBot | 12.6k | GPL-3.0 | 2026-10-30 | Reddit post read over gameplay | SKIP (slop, GPL) |
| htekdev/vidpipe | 236 | none stated | 2026-10-03 | AI video editor pipeline (blog launch) | SKIP (no licence, clipper) |
| googleapis/google-api-python-client | 9.0k | Apache-2.0 | 2026-11-10 | Official Google client | REUSE (videos.insert resumable, youtube.reports/analytics) |
| youtube/api-samples (upload_video.py) | 6.0k | none stated | 2024-06 (archived) | Official sample, resumable upload with retry | BORROW IDEA (retry/resume loop; write our own) |
| tokland/youtube-upload | 2.2k | none stated | 2024-04 | CLI uploader, old oauth flow | SKIP (stale) |
| instagrapi (subzeroid) | 7.1k | other | 2026-11-12 | Private-API IG client (fake mobile app login) | SKIP (ToS risk, ban risk, not Graph API) |
| Instagram Graph libs (imakashsahu 42 stars, 2020; pystagram 8, 2024; clinstagram 15, 2026-11) | tiny | mixed | mostly stale | Thin wrappers over a 3-call API | SKIP (write ~80 lines ourselves) |
| n8n templates (IG/YT shorts workflows) | n/a | n8n is Sustainable Use | n/a | Visual workflows calling the same APIs | SKIP (see notes) |
| GeneralMills/pytrends | 3.7k | other | 2024-08 | Unofficial Google Trends client | SKIP (archived, reportedly 404s now) |
| sdil87/trendspy | 124 | MIT | 2024-12-25 | pytrends successor, covers new trending feed | BORROW IDEA (fallback only; stale-ish) |
| flack0x/trendspyg | 65 | MIT | 2026-10-01 | Newer pytrends alternative, async, caching, release Jul 2026 | TRY, optional (scraping, may break) |
| praw-dev/praw | 4.3k | BSD-2 | 2026-11-09 | Official-style Reddit API wrapper | REUSE (question mining) |
| lefttree/reddit-pain-points | 8 | MIT | 2026-02-04 | Reddit pain-point miner | BORROW IDEA (prompt only) |
| jdepoix/youtube-transcript-api | 8.6k | MIT | 2026-11-09 | Pull transcripts of public videos | REUSE (competitor/hook research, cheap) |

## Verdicts, short notes

### The publisher: own it, tiny
Nothing here beats a ~150 line Python module. Two flows:

- Instagram (Instagram Login, host graph.instagram.com): POST /{ig-id}/media with media_type=REELS, video_url, caption, share_to_feed; poll GET /{container-id}?fields=status_code until FINISHED; POST /{ig-id}/media_publish. Needs a public HTTPS URL for the mp4 (or the resumable upload route), so host renders on R2/S3/Supabase storage with a signed URL. Insights: GET /{media-id}/insights?metric=... at +48h. Verify the current metric names (views, reach, saved, shares, likes, comments, total_interactions) against Meta docs before coding; they changed in 2025 (memory).
- YouTube: google-api-python-client, videos.insert with MediaFileUpload(resumable=True). Shorts need no special flag: vertical, <=60s (check current limit; Google raised it in 2024-25 to 3 min for new uploads, memory), "#Shorts" in title/description is optional. Gotcha (memory): uploads from an unaudited API project are forced private until the project passes the compliance audit, and each insert costs ~1600 quota units of the 10k daily default. Plan to apply for the audit early or publish via the Studio scheduling fallback. Analytics later via the YouTube Analytics API (separate scope) or videos.list statistics.
- Scheduling: a SQLite table (id, platform, video_path, caption, publish_at, status, remote_id) plus a cron/launchd tick every 5 min. Telegram approval just flips status to approved. That is the whole "scheduler".
- Token refresh: IG long-lived tokens last 60 days and must be refreshed (GET /refresh_access_token) before expiry; add a weekly job. YT uses a refresh token that does not expire unless the app is in Testing mode (7 day expiry, memory), so set the OAuth consent screen to In production.

### Postiz: BORROW IDEA, do not run
Very active, 41k stars, works, has an API and MCP. But AGPL-3.0 (fine for private self-hosting, a trap if we ever expose a modified version), and the stack is Postgres + Redis + Temporal + Next.js + Nest, all for two accounts. It also would not do our approval or insights loop. Worth reading its integration providers (apps/backend, instagram and youtube provider files) to see how they handle the container polling, the "media not ready" retries and the token refresh edge cases. Read, do not copy (AGPL). Postiz needs its own Meta app review either way, so it saves nothing on the hardest part.

### Mixpost: SKIP
MIT, but Laravel/PHP, and the useful bits (analytics, more networks) sit in the paid tiers (memory). No gain over our script.

### ShortGPT / MoneyPrinter / MoneyPrinterTurbo: SKIP
All are "LLM script, TTS, stock clips, burned subtitles". That is exactly the slop we are avoiding, and viewers recognise it. ShortGPT is stale (Feb 2025). Turbo has 142k stars, mostly from the Chinese-language community, with a large provider matrix we do not need. Only possible takeaway: its subtitle chunking heuristics, but Remotion's captions package covers this.

### short-video-maker (gyoridavid): BORROW IDEA
Same core stack as ours (Remotion, Kokoro, Whisper.cpp captions, MCP server) and MIT. But it is Pexels background footage and a generic scene schema, stale since June 2025. We already beat it on design quality. Useful only to compare how it aligns Kokoro audio to caption timing (Whisper on the TTS output to get word timestamps). If our captions are not already word-synced, copy that approach.

### Remotion template-tiktok: BORROW IDEA
Official, current, shows word-by-word highlighted captions from Whisper. No licence file on the repo itself, but Remotion's own licence terms apply to usage (company licence needed above 3 people, memory); Parth as a solo creator is fine. Use as reference for the caption component only.

### n8n templates: SKIP
Typical templates chain Google Sheets, an AI video SaaS (HeyGen, Creatomate, etc.), and an HTTP node to Graph API. They hide the hard bits (polling, token refresh) inside nodes and add a server to babysit. n8n itself is a fair-code licence. Our Telegram approval plus SQLite is simpler than any of them. Not individually inspected; I found no popular IG/YT template repo worth listing.

### IG Graph API Python libs: SKIP
Everything found is tiny or stale (2020 to 2024). clinstagram (Nov 2026, 15 stars) is new but unproven; do not trust it with a production token. instagrapi is the opposite problem: huge, active, but it logs in as the private mobile app, which breaks Instagram ToS and risks the account. Do not use for an account we want to grow.

### Trend and ideation tools
- pytrends is archived (Apr 2025) and unreliable. trendspy (stale since Dec 2024) and trendspyg (Oct 2026, 65 stars) scrape unofficial endpoints, so treat them as best-effort, wrap every call in try/except and never block the pipeline on it. Honest take: Google Trends is low value for a niche like "save reels into notes". Skip unless cheap.
- Reddit mining: praw plus a prompt is enough. Target subs where the pain shows up (r/Notion, r/ObsidianMD, r/productivity, r/PKMS, r/Instagram saved-posts complaints). The OSS "pain point miner" repos are 0 to 8 star weekend projects; none worth reusing. GummySearch-style OSS does not really exist at quality (the closed tool itself was shutting down in 2025, memory).
- AnswerThePublic-like: no maintained OSS found. Substitute: Google/YouTube autocomplete endpoint (undocumented, unauthenticated; fragile but free) and Reddit titles.
- Competitor and hook research: youtube-transcript-api to pull transcripts of top Shorts in our niche, then have Claude extract hook patterns. This is the best research asset found. Hook "prompt libraries" on GitHub are low-star marketing dumps (0 to a few stars); write our own hook taxonomy from real top performers.

### Newer 2025-2026 things
- OpenShorts, AI-Youtube-Shorts-Generator, AutoShorts, clip-pipe: all long-to-short clippers. Wrong problem for us (we generate original explainers).
- claude-shorts (AgriciDaniel, MIT, Jul 2026): a Claude Code skill that orchestrates the pipeline. Confirms our "Claude Code makes the video" approach is mainstream; the structure of its steps may help as a checklist. Not worth installing.
- Postiz MCP / agent: lets an agent schedule posts. Nice, but needs Postiz running.

## What to do
1. Write `publish_ig.py` and `publish_yt.py` ourselves; copy only the retry/resumable loop pattern from Google's sample.
2. Use google-api-python-client, praw and youtube-transcript-api as dependencies. Nothing else.
3. Put the YouTube API audit and the Meta app mode (Live vs Development, Instagram tester roles) on the critical path; these block publishing, not code.
4. Read Postiz's IG and YT provider code once for edge cases, without copying.
5. Optionally add trendspyg as a non-blocking research input.
