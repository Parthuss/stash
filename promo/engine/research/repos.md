# Repository survey and reuse decision

Checked 12 Nov 2026. Primary sources are the repositories' READMEs and GitHub API metadata; `repo-snapshot.json` records the latter. No upstream source code was copied or vendored. No popularity or growth claims are used to choose content.

| Repository | Useful part | Decision |
|---|---|---|
| [Postiz](https://github.com/gitroomhq/postiz-app), AGPL-3.0 | Approval/scheduling separation and platform-specific publisher adapters | Reuse the architectural idea. Do not introduce its hosting stack or copy AGPL code into this project. Our adapters follow the official APIs. |
| [short-video-maker](https://github.com/gyoridavid/short-video-maker), MIT | Remotion, Kokoro and word-timed captions align with our existing production tools | Keep the existing Skwirl pipeline. Borrow the staged script/audio/render separation as a checklist, not stock-footage visuals. |
| [ShortGPT](https://github.com/RayVentura/ShortGPT), MIT | Explicit generation stages, useful as a failure-boundary reference | Do not adopt. Its generic video assembly does not supply Skwirl-specific truth, editable product copy or brand QA. |
| [MoneyPrinter](https://github.com/FujiwaraChoki/MoneyPrinter), MIT | Topic-to-script-to-media sequencing | Do not adopt. Volume-first stock assembly is the wrong production approach here. |
| [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo), MIT | Job/artifact separation across providers | Do not adopt its provider matrix or template output. Existing production tools already cover our needs. |
| [pytrends](https://github.com/GeneralMills/pytrends), archived | Trend scraping as a possible weak signal | Skip. An unofficial archived scraper is a fragile dependency and broad search demand does not establish a good Skwirl post. |

Implemented reuse: the existing local Remotion + Kokoro + Whisper pipeline, the stash MCP's search contract, worker/public fonts and colour tokens, plus the official [YouTube resumable protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol). Persist the session URI before bytes, probe it after interruption, then send only remaining bytes. This is an independent implementation.

Dependencies actually used by the engine: httpx, boto3, Pillow; Playwright Core for still rendering; pytest for tests. The previous survey recommended praw, google-api-python-client and youtube-transcript-api, but those are not installed or required by this implementation. Reddit is optional app-only reading over HTTP, never automated comments.

No dedicated ideation repository earns a dependency: use Parth's saved frameworks, primary audience questions and our own measured performance. The weekly agent does the synthesis. Generated still art uses the agent's built-in imagegen tool; typography is composed in HTML and stays editable. There is no generic stock-video fallback.
