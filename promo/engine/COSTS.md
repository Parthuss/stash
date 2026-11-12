# Weekly operating cost

Planning baseline: five posts, for example three Reels and two carousels. Quality and full QA remain mandatory; extra iterations are allowed. None of the numbers below are a bill for an unrun week.

| Item | Weekly expectation / known cost |
|---|---|
| Research agent | One weekly Codex crew task at xhigh effort (ENGINE_RESEARCH_AGENT). Codex subscription usage only. |
| Make agent | One weekly **claude-craveto** crew task at max effort (ENGINE_MAKE_AGENT): five posts with scripts, VO, renders and content-qa rounds. This is the largest cost: it uses the Craveto Claude subscription quota every week (subagents on haiku/sonnet for mechanical checks and frame review keep it down). Quota use cannot be converted into dollars from this repo; record the session usage from the crew dashboard after the first full week. Set ENGINE_MAKE_AGENT=codex to move it off Craveto. |
| Illustrations | Carousels are built on real app captures (local demo app, no cost). Generated art is optional and only made by an agent with a built-in image tool (that account's allowance); open-licence art (Fluent Emoji, MIT) is free. No image API is called by engine code. |
| Kokoro + Remotion rendering | Local CPU/GPU time and electricity; no per-voice-line or per-render API charge from this engine. Verify Remotion licence eligibility for the organisation before expanding the team. |
| Instagram Content Publishing / insights | No per-post fee specified by the API integration; account/permission access and limits still apply. |
| YouTube uploads / statistics | Quota-limited API calls, with no per-upload fee charged by this engine. Three Reel uploads per week stay far below the documented current upload-call allowance. [Google quota documentation](https://developers.google.com/youtube/v3/determine_quota_cost) |
| GitHub Actions publisher | Standard hosted runners for a public repository are free under [GitHub's billing terms](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions). Private-repo minutes depend on Parth's plan. Delayed/dropped crons are possible. |
| R2 Standard | Likely **$0 incremental/week while within the shared account's 10 GB-month, 1M Class A and 10M Class B monthly free allowances**. Egress is free. Above the allowance: $0.015/GB-month plus operations, not a flat weekly fee. [Cloudflare pricing](https://developers.cloudflare.com/r2/pricing/) |
| Telegram approval bot | No paid broadcast feature is used. Separate bot setup is needed because the existing product bot has a webhook. |

Known incremental infrastructure/API planning estimate: **about $0/week within the stated free allowances**, plus the existing agent/image subscription, local compute, and any R2/Actions overage. This is not a guarantee and excludes unknown plan pricing. Exact all-in weekly cost is not computable without account billing and actual agent/image usage.

Do not run a third-party trend scraper or an unconfigured model API to fill that gap. Record actual crew session IDs, token/allowance deltas available in the dashboard, image generations, retries, R2 usage and runner minutes after the first complete week. Research and video generation were not run as a paid Craveto batch here.
