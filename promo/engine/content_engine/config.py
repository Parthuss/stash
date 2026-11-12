"""Settings come from the environment only (GitHub secrets in CI, a local .env that is never committed)."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field


def _flag(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Config:
    tz: str = "Asia/Kolkata"
    default_time: str = "22:30"
    auto_approve: bool = False          # AUTO_APPROVE=1: staged posts are approved without asking
    dry_run: bool = False               # ENGINE_DRY_RUN=1: never call the publishing APIs
    late_window_h: float = 12.0         # approved but this late: ask again instead of posting at 4 am
    max_posts_per_day: int = 2          # per platform, a safety cap on top of the API limits
    max_attempts: int = 3

    # Instagram API with Instagram Login (graph.instagram.com)
    ig_user_id: str = ""
    ig_token: str = ""                  # bootstrap long-lived token; refreshed copies live in the state store
    ig_api_version: str = "v27.0"

    # YouTube Data API v3
    yt_client_id: str = ""
    yt_client_secret: str = ""
    yt_refresh_token: str = ""
    yt_privacy: str = "public"
    yt_category: str = "28"             # Science & Technology
    yt_max_uploads_per_day: int = 3     # well under any videos.insert quota (see research/api-facts.md)

    # Telegram (a dedicated bot, not the stash worker's bot: that one uses a webhook)
    tg_token: str = ""
    tg_chat: str = ""
    tg_owner_user: str = ""             # your Telegram user id if tg_chat is a group; defaults to tg_chat

    # State + media store
    local_store: str = ""               # ENGINE_LOCAL_STORE=/path: use a folder (tests, dry runs)
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""
    media_public_base: str = ""         # optional public base URL; otherwise media goes out as 1 h presigned URLs

    secrets: list[str] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "Config":
        e = os.environ.get
        c = cls(
            tz=e("ENGINE_TZ", "Asia/Kolkata"),
            default_time=e("ENGINE_DEFAULT_TIME", "22:30"),
            auto_approve=_flag("AUTO_APPROVE"),
            dry_run=_flag("ENGINE_DRY_RUN"),
            late_window_h=float(e("ENGINE_LATE_WINDOW_H", "12")),
            max_posts_per_day=int(e("ENGINE_MAX_POSTS_PER_DAY", "2")),
            ig_user_id=e("IG_USER_ID", ""),
            ig_token=e("IG_ACCESS_TOKEN", ""),
            ig_api_version=e("IG_API_VERSION", "v27.0"),
            yt_client_id=e("YT_CLIENT_ID", ""),
            yt_client_secret=e("YT_CLIENT_SECRET", ""),
            yt_refresh_token=e("YT_REFRESH_TOKEN", ""),
            yt_privacy=e("YT_PRIVACY", "public"),
            yt_category=e("YT_CATEGORY", "28"),
            tg_token=e("TG_ENGINE_BOT_TOKEN", ""),
            tg_chat=e("TG_OWNER_CHAT_ID", ""),
            tg_owner_user=e("TG_OWNER_USER_ID", ""),
            local_store=e("ENGINE_LOCAL_STORE", ""),
            r2_account_id=e("R2_ACCOUNT_ID", ""),
            r2_access_key_id=e("R2_ACCESS_KEY_ID", ""),
            r2_secret_access_key=e("R2_SECRET_ACCESS_KEY", ""),
            r2_bucket=e("R2_BUCKET", ""),
            media_public_base=e("MEDIA_PUBLIC_BASE", ""),
        )
        c.secrets = [s for s in (c.ig_token, c.yt_client_secret, c.yt_refresh_token, c.tg_token,
                                 c.r2_secret_access_key) if s]
        return c

    @property
    def has_instagram(self) -> bool:
        return bool(self.ig_user_id and self.ig_token)

    @property
    def has_youtube(self) -> bool:
        return bool(self.yt_client_id and self.yt_client_secret and self.yt_refresh_token)

    @property
    def has_telegram(self) -> bool:
        return bool(self.tg_token and self.tg_chat)


_SIGNED = re.compile(r"(X-Amz-(?:Signature|Credential|Security-Token)|upload_id|access_token)=[^&\s\"']+", re.I)


def redact(text: str, secrets: list[str]) -> str:
    """Strip every secret from a string before it reaches a log (the repo is public, so are Actions logs)."""
    text = _SIGNED.sub(lambda m: m.group(1) + "=***", text)
    for s in secrets:
        if s and len(s) >= 6:
            text = text.replace(s, "***")
    return text
