"""YouTube Data API v3: upload a Short (resumable upload), read view counts.

Auth is an OAuth refresh token for Parth's channel (scopes youtube.upload + youtube.readonly), exchanged for a
short-lived access token on every run. Shorts are just vertical videos up to 3 minutes; "#Shorts" in the
description is a hint, not a requirement.
"""
from __future__ import annotations

import json

from .http import ApiError, Http

TOKEN_URL = "https://oauth2.googleapis.com/token"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
API = "https://www.googleapis.com/youtube/v3"


class YouTube:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str, http: Http):
        self.cid, self.secret, self.refresh, self.http = client_id, client_secret, refresh_token, http
        self._token: str | None = None

    def token(self) -> str:
        if not self._token:
            d = self.http.json("POST", TOKEN_URL, data={"client_id": self.cid, "client_secret": self.secret,
                                                        "refresh_token": self.refresh, "grant_type": "refresh_token"})
            self._token = d["access_token"]
            self.http.secrets.append(self._token)
        return self._token

    def _h(self, **extra) -> dict:
        return {"Authorization": f"Bearer {self.token()}", **extra}

    def upload(self, video: bytes, title: str, description: str, tags: list[str], privacy: str = "public",
               category: str = "28", session: str | None = None, on_session=None,
               contains_synthetic_media: bool = False) -> tuple[str, str]:
        """Returns (video id, the privacy YouTube actually applied): channel defaults can force private."""
        meta = {
            "snippet": {"title": title[:100], "description": description[:5000], "tags": tags[:30],
                        "categoryId": category},
            "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False,
                       "containsSyntheticMedia": contains_synthetic_media},
        }
        start = 0
        if session:
            self.http.secrets.append(session)
            # Probe the saved session before retrying bytes. Completed sessions return
            # the original resource, including when the successful response was lost.
            probe = self.http.request("PUT", session, headers=self._h(**{"Content-Range": f"bytes */{len(video)}"}),
                                      content=b"")
            if probe.status_code in (200, 201):
                done = probe.json()
                return done["id"], (done.get("status") or {}).get("privacyStatus", "")
            if probe.status_code != 308:
                raise ApiError("youtube", probe.status_code, "unexpected resumable status", False)
            last = probe.headers.get("range", "")
            start = int(last.rsplit("-", 1)[-1]) + 1 if last else 0
            if start >= len(video):
                raise ApiError("youtube", 308, "waiting for upload completion", True)
        else:
            r = self.http.request("POST", UPLOAD_URL, params={"uploadType": "resumable", "part": "snippet,status"},
                              headers=self._h(**{"Content-Type": "application/json; charset=UTF-8",
                                                 "X-Upload-Content-Type": "video/mp4",
                                                 "X-Upload-Content-Length": str(len(video))}),
                                  content=json.dumps(meta).encode())
            session = r.headers.get("location")
            if not session:
                raise ApiError("youtube", r.status_code, "no upload session returned", True)
            self.http.secrets.append(session)
            if on_session:
                on_session(session)  # persist BEFORE sending media bytes
        headers = self._h(**{"Content-Type": "video/mp4"})
        if start:
            headers["Content-Range"] = f"bytes {start}-{len(video)-1}/{len(video)}"
        response = self.http.request("PUT", session, headers=headers, content=video[start:])
        if response.status_code == 308:
            raise ApiError("youtube", 308, "upload incomplete; resume next tick", True)
        done = response.json()
        return done["id"], (done.get("status") or {}).get("privacyStatus", "")

    def recent_uploads(self, limit: int = 15) -> list[dict]:
        """The channel's latest uploads as {id, title, published_at} (2 quota units), to avoid double uploads."""
        ch = self.http.json("GET", f"{API}/channels", params={"part": "contentDetails", "mine": "true"},
                            headers=self._h())
        items = ch.get("items") or []
        if not items:
            return []
        pl = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]
        d = self.http.json("GET", f"{API}/playlistItems",
                           params={"part": "snippet", "playlistId": pl, "maxResults": limit}, headers=self._h())
        return [{"id": i["snippet"]["resourceId"]["videoId"], "title": i["snippet"].get("title", ""),
                 "published_at": i["snippet"].get("publishedAt")} for i in d.get("items", [])]

    def stats(self, video_id: str) -> dict:
        d = self.http.json("GET", f"{API}/videos", params={"part": "statistics", "id": video_id}, headers=self._h())
        items = d.get("items") or []
        s = items[0].get("statistics", {}) if items else {}
        return {k: int(v) for k, v in s.items() if str(v).isdigit()}
