# Weekly operating cost

Planning baseline: five posts, for example three Reels and two carousels. Quality and full QA remain mandatory; extra iterations are allowed. None of the numbers below are a bill for an unrun week.

| Item | Weekly expectation / known cost |
|---|---|
| Research + make agent | Two crew tasks at maximum supported effort, plus their QA work. Default is Codex; Craveto usage is **zero unless ENGINE_AGENT=claude-craveto**. Craveto subscription quota consumption cannot be converted into dollars from this repo. This run used Codex, not Craveto, and no Craveto quota was measured. |
| Built-in imagegen | Usage of the selected account's image allowance. This run generated two assets for one carousel. No separately configured image API was charged by engine code. Actual subscription allowance and marginal image price are not exposed here; do not describe image generation as unconditionally free. |
| Kokoro + Remotion rendering | Local CPU/GPU time and electricity; no per-voice-line or per-render API charge from this engine. Verify Remotion licence eligibility for the organisation before expanding the team. |
| Instagram Content Publishing / insights | No per-post fee specified by the API integration; account/permission access and limits still apply. |
| YouTube uploads / statistics | Quota-limited API calls, with no per-upload fee charged by this engine. Three Reel uploads per week stay far below the documented current upload-call allowance. [Google quota documentation](https://developers.google.com/youtube/v3/determine_quota_cost) |
| GitHub Actions publisher | Standard hosted runners for a public repository are free under [GitHub's billing terms](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions). Private-repo minutes depend on Parth's plan. Delayed/dropped crons are possible. |
| R2 Standard | Likely **$0 incremental/week while within the shared account's 10 GB-month, 1M Class A and 10M Class B monthly free allowances**. Egress is free. Above the allowance: $0.015/GB-month plus operations, not a flat weekly fee. [Cloudflare pricing](https://developers.cloudflare.com/r2/pricing/) |
| Telegram approval bot | No paid broadcast feature is used. Separate bot setup is needed because the existing product bot has a webhook. |

Known incremental infrastructure/API planning estimate: **about $0/week within the stated free allowances**, plus the existing agent/image subscription, local compute, and any R2/Actions overage. This is not a guarantee and excludes unknown plan pricing. Exact all-in weekly cost is not computable without account billing and actual agent/image usage.

Do not run a third-party trend scraper or an unconfigured model API to fill that gap. Record actual crew session IDs, token/allowance deltas available in the dashboard, image generations, retries, R2 usage and runner minutes after the first complete week. Research and video generation were not run as a paid Craveto batch here.
