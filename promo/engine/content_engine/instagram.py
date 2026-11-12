"""Instagram API with Instagram Login (graph.instagram.com): Reels, image carousels, insights, token refresh.

Publishing is two steps: create a media container (Instagram fetches the media from a URL), wait until its
status_code is FINISHED, then media_publish it. The container id is saved before waiting, so a retry after a
crash resumes instead of creating a second post.
"""
from __future__ import annotations

import time
from typing import Callable

from .http import ApiError, Http

REEL_METRICS = ["views", "reach", "saved", "shares", "likes", "comments", "total_interactions",
                "ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "reels_skip_rate"]
CAROUSEL_METRICS = ["views", "reach", "saved", "shares", "likes", "comments", "total_interactions"]


class Instagram:
    def __init__(self, user_id: str, token: str, version: str, http: Http, sleep: Callable[[float], None] = time.sleep):
        self.uid, self.token, self.http, self.sleep = user_id, token, http, sleep
        self.base = f"https://graph.instagram.com/{version}"

    def _get(self, path: str, **params) -> dict:
        return self.http.json("GET", f"{self.base}/{path}", params={**params, "access_token": self.token})

    def _post(self, path: str, **data) -> dict:
        return self.http.json("POST", f"{self.base}/{path}", data={**data, "access_token": self.token})

    # containers
    def create_reel(self, video_url: str, caption: str, cover_url: str | None = None) -> str:
        data = {"media_type": "REELS", "video_url": video_url, "caption": caption, "share_to_feed": "true"}
        if cover_url:
            data["cover_url"] = cover_url
        return self._post(f"{self.uid}/media", **data)["id"]

    def create_carousel_item(self, image_url: str) -> str:
        return self._post(f"{self.uid}/media", image_url=image_url, is_carousel_item="true")["id"]

    def create_carousel(self, children: list[str], caption: str) -> str:
        return self._post(f"{self.uid}/media", media_type="CAROUSEL", children=",".join(children),
                          caption=caption)["id"]

    def status(self, container_id: str) -> str:
        return self._get(container_id, fields="status_code").get("status_code", "")

    def wait(self, container_id: str, timeout: float = 600, every: float = 30) -> str:
        waited = 0.0
        while True:
            s = self.status(container_id)
            if s in ("FINISHED", "PUBLISHED", "ERROR", "EXPIRED"):
                return s
            if waited >= timeout:
                return s or "IN_PROGRESS"
            self.sleep(every)
            waited += every

    def publish(self, container_id: str) -> str:
        return self._post(f"{self.uid}/media_publish", creation_id=container_id)["id"]

    def permalink(self, media_id: str) -> str:
        return self._get(media_id, fields="permalink").get("permalink", "")

    def recent_media(self, limit: int = 10) -> list[dict]:
        return self._get(f"{self.uid}/media", fields="id,caption,timestamp,permalink", limit=limit).get("data", [])

    def publishing_quota(self) -> tuple[int, int]:
        """(used in the last 24 h, allowed)."""
        d = self._get(f"{self.uid}/content_publishing_limit", fields="quota_usage,config").get("data", [{}])[0]
        return int(d.get("quota_usage", 0)), int((d.get("config") or {}).get("quota_total", 100))

    # insights
    def insights(self, media_id: str, kind: str) -> dict:
        metrics = list(REEL_METRICS if kind == "reel" else CAROUSEL_METRICS)
        while metrics:
            try:
                d = self._get(f"{media_id}/insights", metric=",".join(metrics))
            except ApiError as e:  # Meta retires metric names now and then: drop the one it names and retry
                bad = next((m for m in metrics if m in str(e)), None)
                if e.status == 400 and bad:
                    metrics.remove(bad)
                    continue
                raise
            out = {}
            for row in d.get("data", []):
                vals = row.get("values") or [{}]
                out[row["name"]] = row.get("total_value", {}).get("value", vals[0].get("value"))
            return out
        return {}

    # token
    def refresh_token(self) -> str:
        d = self.http.json("GET", "https://graph.instagram.com/refresh_access_token",
                           params={"grant_type": "ig_refresh_token", "access_token": self.token})
        self.token = d["access_token"]
        return self.token
