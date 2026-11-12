# API facts for the publisher (checked 12 Nov 2026)

Method: fetched official doc pages; fetched text is summarised by a tool, so quote-level exactness is not guaranteed. Items not seen in the fetched text are marked UNVERIFIED.

## Instagram API with Instagram Login (host graph.instagram.com)

- Version: current is v27.0. Examples use https://graph.instagram.com/v27.0/me. Changelog lists v27.0 as latest, v26.0 expiry TBD.
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
  https://developers.facebook.com/docs/graph-api/changelog
- Scopes: instagram_business_basic, instagram_business_content_publish, instagram_business_manage_comments, instagram_business_manage_messages. Insights needs instagram_business_manage_insights (plus basic). Old names (business_basic etc.) are deprecated.
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
  https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights
- Account types: professional accounts, business or creator. Instagram Login does not need a Facebook Page. The account_type field returns "Business" or "Media_Creator". App must be a Business-type app.
  https://developers.facebook.com/docs/instagram-platform/overview
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
- Access levels: Standard Access (default) is enough if the app serves only accounts you own or manage and have added to the app in the dashboard. Advanced Access (App Review + Business Verification) only for accounts you do not own/manage. So no App Review for the owner's own account. "Instagram testers" / Development mode behaviour: UNVERIFIED (not mentioned on fetched pages; adding your account via App Dashboard / app roles is the documented route).
  https://developers.facebook.com/docs/instagram-platform/overview
- OAuth authorize: GET https://www.instagram.com/oauth/authorize ; params client_id, redirect_uri, response_type=code, scope (comma/space list), optional state, enable_fb_login, force_reauth. Code valid 1 hour, single use.
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- Short-lived token: POST https://api.instagram.com/oauth/access_token with client_id, client_secret, grant_type=authorization_code, redirect_uri, code. Returns access_token, user_id, permissions. Short-lived token lasts 1 hour (get-started page).
- Long-lived token: GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=...&access_token=<short>. Valid 60 days (expires_in ~5183944). Server side only.
- Refresh: GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<long>. Token must be >= 24h old, unexpired, and user granted instagram_business_basic. Expired tokens cannot be refreshed. (Refresh returns a new 60-day token. Publisher should refresh weekly, store the new token.)
  Same business-login URL as above.
- Publish flow: POST /<IG_ID>/media -> container id; poll GET /<CONTAINER_ID>?fields=status_code; POST /<IG_ID>/media_publish with creation_id.
  https://developers.facebook.com/docs/instagram-platform/content-publishing
- status_code values: EXPIRED (not published within 24h), ERROR, FINISHED, IN_PROGRESS, PUBLISHED. Docs advise polling once a minute, max 5 minutes.
- REELS container: media_type=REELS, video_url (public). Optional: caption, share_to_feed (true = feed + Reels tab), cover_url (JPEG, <=8 MB, sRGB, ideally 9:16, wins over thumb_offset), thumb_offset (ms, default 0), audio_name (renameable once), collaborators (up to 3 usernames), location_id, user_tags, trial_params (graduation_strategy MANUAL or SS_PERFORMANCE), is_ai_generated.
  https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
- Carousel: children items are POST /media with is_carousel_item=true and image_url (image) or video_url + media_type=VIDEO (video). Reels cannot be children. Parent: media_type=CAROUSEL, children=<comma ids, max 20>, caption. Caption/location/product tags not allowed on children. Carousel images are cropped to first image's aspect ratio (default 1:1). Carousel video-child spec not stated separately: UNVERIFIED.
- Image: JPEG only (MPO, JPS unsupported), <=8 MB, aspect 4:5 to 1.91:1, width 320-1440 px.
- Reel video spec: MOV or MP4, moov atom at front, no edit lists; HEVC or H.264, progressive, closed GOP, 4:2:0; 23-60 FPS; max 1920 px horizontal; aspect 0.01:1 to 10:1 (9:16 recommended); video VBR max 25 Mbps; audio AAC <=48 kHz mono/stereo, 128 kbps; duration 3 s to 15 min; file <= 300 MB.
- Limits: 100 API-published posts per 24h moving window, carousel = 1 post, enforced at media_publish; check GET /<IG_ID>/content_publishing_limit. The same page also says "50" in the carousel section (conflict, stay under 50 to be safe). 400 containers per 24h. Containers expire after 24h. Caption max 2,200 chars, 30 hashtags, 20 mentions.
- Resumable upload (rupload.facebook.com): NOT available with Instagram Login. upload_type=resumable is "only for apps that have implemented Facebook Login for Business". So video must be at a public URL (Meta fetches it at publish attempt). Redirect handling: UNVERIFIED (not documented; use a direct, non-redirecting, ASCII-only URL such as R2 custom domain).
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
- Insights: GET /<MEDIA_ID>/insights?metric=... (host graph.instagram.com).
  REELS metrics: views, reach, likes, comments, saved, shares, reposts, total_interactions, ig_reels_avg_watch_time, ig_reels_video_view_total_time, reels_skip_rate, crossposted_views, facebook_views, total_likes, total_comments, total_views.
  FEED metrics: views, reach, likes, comments, saved, shares, reposts, follows, profile_visits, profile_activity, total_interactions, impressions (deprecated for media created after 2 Jul 2024), facebook_views.
  CAROUSEL: the doc says insights are not available for media within an album (UNVERIFIED for the parent carousel via this host; the metric table has no CAROUSEL column. Test live; feed list likely applies to the parent).
  plays: not listed (treat as removed, use views).
  reels_skip_rate = % of views skipped within first 3 seconds, REELS only, estimated, "in development".
  Data can lag up to 48h.
  https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights
- permalink field: standard media field (GET /<MEDIA_ID>?fields=permalink,media_product_type). Not seen on a fetched page this session: UNVERIFIED. Note published reels report media_type VIDEO; use media_product_type.

## YouTube Data API v3

- Default quota: 10,000 units/day for all other endpoints, plus separate granular buckets of 100 videos.insert calls/day and 100 search.list calls/day (June 2026 change). videos.insert costs 1 unit from the upload bucket. Resets midnight Pacific. thumbnails.set 50 units, videos.list 1, channels.list 1.
  https://developers.google.com/youtube/v3/determine_quota_cost
  https://developers.google.com/youtube/v3/getting-started
  https://developers.google.com/youtube/v3/docs/videos/insert
  Revision history: Dec 4 2025 upload cost cut from ~1600 to ~100 units; Jun 1 2026 granular buckets.
  https://developers.google.com/youtube/v3/revision_history
- Private lock: the 28 Jul 2020 rule was REMOVED. Revision history (2 Nov 2026): uploads from unverified API projects are no longer restricted to private; default privacyStatus is public if unset, though creator account settings can still default some uploads to private. The insert reference says the same. So no audit needed for uploads. Audit (YouTube API Services Audit and Quota Extension Form) is only for quota increases beyond defaults.
  https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
  Practical: still set status.privacyStatus explicitly and read it back after upload.
- Upload: POST https://www.googleapis.com/upload/youtube/v3/videos, uploadType=resumable; max file 256 GB; MIME video/* or application/octet-stream. Use chunk size multiple of 256 KB on flaky links; retry 500/502/503/504 with backoff.
  https://developers.google.com/youtube/v3/guides/uploading_a_video
- Scopes: videos.insert accepts any of youtube.upload, youtube, youtubepartner, youtube.force-ssl (full URLs https://www.googleapis.com/auth/<name>). youtube.upload is upload-only for the user's channel.
- Scheduling: status.publishAt is settable (time format and the requirement that privacyStatus=private is not stated on the insert page: UNVERIFIED here; documented elsewhere as RFC 3339/ISO 8601 with private status).
- Shorts: up to 3 minutes, vertical upload, max 1080p. The Shorts help page does not mention #Shorts or an aspect ratio rule. No API flag for Shorts (aspect ratio and length decide; square/vertical). #Shorts optional: UNVERIFIED beyond the help page not mentioning it.
  https://support.google.com/youtube/answer/10059070
- Shorts view counting: each start or replay counts, no minimum watch time (from 31 Mar 2025).
- OAuth Testing mode: external app in Testing: authorization/refresh tokens expire 7 days after consent; max 100 test users. Avoid by setting publishing status to In production. Exceptions to 7-day expiry only for name/email/profile scopes.
  https://support.google.com/cloud/answer/15549945
  https://developers.google.com/identity/protocols/oauth2
  Refresh tokens also die if unused 6 months or revoked; 100 refresh tokens per account per client ID.
- Verification: In production with sensitive/restricted scopes and no verification shows an "Unverified apps" warning, and a lifetime cap of 100 new users after the unverified screen. For one personal account that is fine (click Advanced > continue). Whether youtube.upload is classed "sensitive": UNVERIFIED (scopes page fetched was truncated before YouTube).
  https://support.google.com/cloud/answer/13463073
- videos.list?part=statistics&id=... gives viewCount, likeCount, commentCount (1 unit). A newer videos.batchGetStats (1 unit, own bucket, from 3 Jun 2026) exists.
- YouTube Analytics API: GET https://youtubeanalytics.googleapis.com/v2/reports. Scopes: yt-analytics.readonly (reports) with youtube.readonly (page says required). Metrics: views, estimatedMinutesWatched, averageViewDuration, averageViewPercentage, likes, subscribersGained.
  https://developers.google.com/youtube/analytics/reference/reports/query
- Related: thumbnails.set supports Shorts custom thumbnails from 3 Nov 2026 (revision history).

## Telegram Bot API (current: 10.4, 9 Nov 2026)

https://core.telegram.org/bots/api
- getUpdates does not work while an outgoing webhook is set. Use deleteWebhook (optional drop_pending_updates) first.
- Updates stored until received but not longer than 24 hours.
- offset: returns updates with id > offset. Calling getUpdates with offset > update_id confirms that update (so pass last_update_id + 1). Negative offset counts from end. limit 1-100 (default 100). timeout default 0 (short poll), use e.g. 25-30 for long polling. allowed_updates empty = all except chat_member, message_reaction, message_reaction_count.
- CallbackQuery fields: id, from, message (optional), inline_message_id, chat_instance, data.
- InlineKeyboardButton.callback_data is 1-64 bytes.
- answerCallbackQuery: callback_query_id (required), text (0-200 chars), show_alert, url, cache_time. Call it even with no text, otherwise the client shows a progress bar. Returns True.
- editMessageReplyMarkup params: UNVERIFIED this session (section not reached). Standard: chat_id + message_id (or inline_message_id) + reply_markup; omit/empty reply_markup to remove the keyboard.
- sendVideo/sendPhoto upload limits (50 MB / 10 MB on the cloud Bot API): UNVERIFIED this session. Download via getFile limit 20 MB. Local Bot API server allows uploads to 2000 MB.

## Cloudflare R2

- Payment: "You need a Cloudflare account with an R2 subscription", obtained via a checkout flow in the dashboard; "free to get started with included free monthly usage". Page does not explicitly say a card is required, but expect to add one (UNVERIFIED on the card point).
  https://developers.cloudflare.com/r2/get-started/
- Free tier (Standard storage only): 10 GB-month, 1M Class A ops, 10M Class B ops per month. Egress free.
  https://developers.cloudflare.com/r2/pricing/
- r2.dev public URL: "rate-limited and should only be used for development purposes", "intended for non-production traffic", no WAF/caching/access control. Custom domain: domain must be a zone in the same Cloudflare account (or partial CNAME setup), enables caching. Enable in bucket Settings.
  https://developers.cloudflare.com/r2/buckets/public-buckets/
- S3 endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com ; EU jurisdiction https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com. Region value "auto": UNVERIFIED on the fetched page (commonly used).
- S3 keys: R2 > Overview > API Tokens > Manage; account-owned or user-owned token; permission Admin R/W, Admin Read, Object R/W, Object Read (optionally scoped to buckets); Access Key ID + Secret shown once.
  https://developers.cloudflare.com/r2/api/s3/tokens/

## GitHub Actions

- schedule: shortest interval 5 minutes; delays under load especially at the start of each hour (jobs may be dropped); pick an off-minute. Runs only on the default branch, workflow file must exist there; UTC by default (IANA timezone string now allowed).
  https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Public repos: scheduled workflows auto-disabled after 60 days without repository activity; can be re-enabled.
- Secrets: masked in logs; non-secret values need ::add-mask::VALUE; secrets not passed to fork workflows (except GITHUB_TOKEN) or Dependabot events; >48 KB needs gpg workaround. Structured data (JSON blobs) masking caveat: not described, so register derived values with add-mask.
  https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
- Logs public on public repos / retention days: UNVERIFIED (fetched page did not say; general knowledge is that anyone can read run logs of a public repo). Use a private repo for the publisher.
