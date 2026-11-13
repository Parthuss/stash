# Reddit and LinkedIn capture: public access findings

Checked 13 November 2026. This separates what a public payload can contain from permission to fetch it automatically. No logged-in sessions, credentials, CAPTCHA bypasses, proxy rotation, private APIs, or access-control workarounds were used in this research. Search-indexed public post previews and downloader-maintainer fixtures identify smoke candidates; they do not prove that those URLs remain anonymously fetchable today.

## Deployment decision

Anonymous accessibility does **not** establish permission. Keep new source fetching disabled by default until the operator has the required platform permission and can meet its conditions. Skwirl is a commercial product. Do not advertise reliable Reddit or LinkedIn capture while that permission and live success remain unproven. Do not turn on a permission flag simply to make smoke tests pass.

## Reddit

The [current official Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki), updated 11 May 2026, requires registered OAuth clients, says unauthenticated traffic will be blocked, and permits throttling unidentified users. Its 100 requests/minute allowance applies to eligible OAuth clients, averaged over ten minutes; it is not an anonymous JSON allowance. It requires a truthful descriptive User-Agent with platform, app identifier, version, and contact. Monitor X-Ratelimit-Used/Remaining/Reset and honor Retry-After. Stop on denial rather than switching domains or identities. The same guidance requires removal of material deleted on Reddit, including derived retained content, and recommends routinely deleting stored data within 48 hours. A permanent note archive needs an agreed retention/deletion design.

The [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/16471395473812-Moderation-Bots-Tooling) requires approval before API access; commercial access needs written approval. The [Data API Terms](https://redditinc.com/policies/data-api-terms) likewise require a separate agreement for commercial uses. These requirements rule out presenting anonymous `.json` as an approved production integration merely because an endpoint responds.

[Reddit robots.txt](https://www.reddit.com/robots.txt) disallows JSON paths for general search crawlers. The API Wiki explicitly distinguishes those search-engine instructions from approved API access.

### Payload behavior if access is authorized

A comments permalink's JSON response has a post listing and a comment listing. It can carry title, selftext, author, ordered gallery media IDs and media metadata, native video DASH/HLS/fallback URLs, and top-level comments. Request a small top-sorted comment set; skip deleted/removed comments and avoid recursive `more` expansion. Treat comment claims as attributed discussion, not confirmed facts. Empty-media self posts are valid extraction inputs.

Native v.redd.it video can have separate video and audio representations. Use the supplied DASH manifest to obtain and mux both streams; fallback video-only MP4 must not silently be described as a fully transcribed video. Use only Reddit-hosted media URLs from the permitted response. Crossposts need deliberate source selection. Private, quarantined, age-gated, deleted, removed, and denied posts are unsupported without crossing the task's access boundary.

The [yt-dlp maintainer's Reddit extractor](https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/yt_dlp/extractor/reddit.py) is primary implementation evidence for media fields and historical video fixtures, not a grant of access permission. Its session-cookie, age-gate opt-in, and impersonation paths are outside this task and should not be reused.

### Candidate smoke links (not live-success claims)

- Text/selftext: [New to programming. What do you learn?](https://www.reddit.com/r/learnpython/comments/1vwda97/new_to_programming_what_do_you_learn/). Public search preview includes the question body and replies. No JSON request made in this research.
- Native video: [Heat index was 110 degrees...](https://www.reddit.com/r/aww/comments/90bu6w/heat_index_was_110_degrees_so_we_offered_him_a/). Historical yt-dlp fixture declares a 14-second Reddit-hosted MP4. No live media request made in this research.

## LinkedIn

[LinkedIn's visibility help](https://www.linkedin.com/help/linkedin/answer/a523141) explains that Anyone posts can appear off LinkedIn, while connections-only and group posts have restricted audiences. Public-profile settings can also affect visibility. This is public **viewing**, not an anonymous download API guarantee.

The [User Agreement](https://www.linkedin.com/legal/user-agreement), section 8.2, prohibits scraping/copying the service and unauthorized automated access. The [prohibited software help](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions) applies those restrictions to crawlers and bots. [robots.txt](https://www.linkedin.com/robots.txt) expressly requires permission for automated access and names whitelist-crawl@linkedin.com for permission inquiries. The [official Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) is authenticated and permission-scoped, not a public anonymous post lookup endpoint.

### Payload behavior if access is authorized

Public `/posts/...` pages can expose post-body HTML, Open Graph title/description/image, structured data, ordered image elements, and native `<video data-sources=...>` URLs. Read actual post text before OG descriptions: OG text may be abbreviated. Do not confuse author avatars or a generic login-page image with post media. An authwall, checkpoint, sign-in page without post content, 401/403/429, or missing public media is a clear failure, never a reason to request credentials. `/feed/update/urn:li:activity:...` and `lnkd.in` can redirect; constrain every redirect to permitted LinkedIn hosts and supported post paths.

The [yt-dlp maintainer's LinkedIn extractor](https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/yt_dlp/extractor/linkedin.py) documents public post URL patterns and native video `data-sources`, plus historical video fixtures. This is parsing evidence only. Native video access may disappear independently of public text.

[LinkedIn document guidance](https://www.linkedin.com/help/linkedin/answer/a519831) permits viewers who are members to download visible document posts as PDF. The [document FAQ](https://www.linkedin.com/help/linkedin/answer/a519826) describes the fullscreen download control. Neither guarantees anonymous access to every document. A guest page may expose carousel preview pages or a direct PDF; use only those public URLs if authorized. Missing pages or a missing PDF must be disclosed rather than inventing content or using authenticated Voyager/document endpoints. Preserve page order in extraction. LinkedIn Learning and live-event APIs are separate, authenticated products and are excluded.

### Candidate smoke links (not live-success claims)

- Text plus image: [GitHub Agent HQ demos](https://www.linkedin.com/posts/github_at-github-universe-we-announced-github-as-activity-7393712835454889984-RLfD). Public search preview includes post text and an image marker; it does not prove full image access today.
- Native video: [MathWorks: What Is MathWorks Cloud Center?](https://www.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7). Historical yt-dlp fixture includes native MP4 and captions. No live post/media request made in this research.

## Share target and copy audit

- `worker/public/manifest.webmanifest` accepts `url`, `text`, and `title` with a GET share target to `/`, without a platform filter. `worker/public/app.js` handles a URL inside shared text.
- `shortcuts/Stash.cherri.template` now accepts URL and text inputs, detects URLs in shared text (including a title plus URL), takes the first URL, encodes it, and opens `https://skwirl.app/?url=…&src=shortcut`. Input with no URL shows a message and stops. The rebuilt signed `worker/public/Skwirl.shortcut` was decrypted locally using the public key in its bundled signing certificate and extracted with Apple's `aea`/`aa`: eight structural assertions passed, including `WFURLContentItem` + `WFStringContentItem`, ActionExtension, URL detection/first-item/encoding/open order, first-item selection, encoding mode and variable, canonical destination, and stop action. Built with Cherri 2.3.0 using `shortcuts/build.sh`; the worktree had no `.env`, so the build used a temporary URL-only `.env` for `https://skwirl.app`, removed immediately afterward. No iPhone runtime/device test was run.
- `worker/public/index.html` is claimed by another agent for landing sections/footer. Leave its Works with chips untouched in this task; add LinkedIn/Reddit only after approval and live support are established. `HANDOFF.md` also has another worktree's uncommitted edits; use `LOG.md` for this task's handoff. Preserve the other worktree's pending `app.js`, `index.html`, `llms.txt`, and `mcp.ts` edits.

## Fixture provenance

Parser fixtures should be explicitly labeled sanitized representative payloads unless a real response was recorded with permission. These research notes did not record real Reddit JSON, LinkedIn page HTML, or downloaded media. An offline parser test is not a live accessibility test, source permission, or note-quality acceptance.

## Implementation and enablement boundary

The shipped worker recognizes and normalizes Reddit comment/share links, `redd.it`, LinkedIn posts/activity links, and `lnkd.in`. Both `/v1/ingest` and legacy `/ingest` return HTTP 422 before queue/quota writes while source access is disabled. The processor repeats this check before contacting either platform. Existing Instagram/TikTok/YouTube/X/Facebook paths retain their extractors.

`REDDIT_PUBLIC_ACCESS=approved` / `LINKEDIN_PUBLIC_ACCESS=approved` are Worker-side switches; `STASH_REDDIT_PUBLIC_ACCESS=approved` / `STASH_LINKEDIN_PUBLIC_ACCESS=approved` are processor-side switches. All default off. These switches are operator attestations, **not approval mechanisms**. Do not set them without written permission covering this product, anonymous automated access, media retrieval, and note retention. Ordinary Reddit API approval still requires OAuth and therefore cannot enable this credential-free adapter. A retention/deletion agreement or implementation remains necessary. Flags alone do not satisfy platform rules.

Conditional adapters use a truthful Skwirl User-Agent, empty cookie jar on every request, host-checked redirects, bounded bodies, 2-second request spacing, rate-limit reset headers, and terminal denial handling. Native Reddit DASH downloads both available audio/video representations locally before muxing; unsupported audio fails explicitly. LinkedIn accepts actual body HTML, ordered post images, native MP4 sources (one encoding per video), and explicit public PDF links. Documents render every page in numeric order, up to 40 pages; larger/incomplete documents fail explicitly. Preview-only documents do not masquerade as complete saves. `ffmpeg`, `ffprobe`, `pdfinfo`, and `pdftoppm` are required for these media paths; the cloud runner installs FFmpeg and Poppler.

Text-only posts reach the same structured extractor without transcription. Reddit guidance preserves attribution and disagreement in top comments; LinkedIn guidance combines the body and document pages without inventing member-only content. This is tested format support, **not demonstrated live note quality**. Fixtures are hand-authored representative examples; authorized recorded source fixtures and successful live extraction remain pending.

`scripts/smoke_social.py` runs exactly one live Skwirl ingest request and one actual `pipeline.process` denial check for each of four candidate source/type pairs. It creates an admin-issued throwaway Skwirl account, checks that no saves/notes were created, deletes it in `finally`, and verifies its token is rejected. It never overrides platform permission flags or contacts either platform while disabled. Its JSON report distinguishes this denial smoke from source-fetch success.

## Live verification on 13 November 2026

Deployment succeeded (Worker `c15e3d85-b279-4f39-8164-7fd140228472`). The four candidate submissions each returned 422 from live Skwirl; the actual pipeline separately rejected each before any source request. No notes or saves were created. The throwaway account was deleted and its token rejected with 401. See `social-smoke-2026-11-13.json`. Live health and asset-byte checks passed; see `social-live-verification-2026-11-13.json`. These results verify safe disabled behavior, not anonymous source access or Instagram-equivalent note quality.
