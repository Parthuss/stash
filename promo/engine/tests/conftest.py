"""A fake Instagram + YouTube + Telegram behind httpx.MockTransport, so the publisher runs end to end offline."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from content_engine.config import Config  # noqa: E402
from content_engine.http import Http  # noqa: E402
from content_engine.instagram import Instagram  # noqa: E402
from content_engine.publisher import Ctx  # noqa: E402
from content_engine.store import LocalStore  # noqa: E402
from content_engine.telegram import Telegram  # noqa: E402
from content_engine.youtube import YouTube  # noqa: E402

IG_TOKEN = "IGTOKEN-secret-123456"
TG_TOKEN = "TGTOKEN-secret-123456"
OWNER = "424242"


class Fake:
    def __init__(self):
        self.calls: list[tuple[str, str, dict]] = []
        self.updates: list[dict] = []
        self.sent: list[dict] = []
        self.container_status: list[str] = []   # popped per status call; default FINISHED
        self.containers: dict[str, str] = {}
        self.n = 0
        self.fail: dict[str, int] = {}          # endpoint key -> how many times to answer 500
        self.recent_media: list[dict] = []
        self.yt_uploads: dict[str, str] = {}
        self.yt_privacy = "public"
        self.metric_reject: set[str] = set()
        self.answer_fails = False

    def _id(self, p):
        self.n += 1
        return f"{p}{self.n}"

    def _maybe_fail(self, key):
        if self.fail.get(key, 0) > 0:
            self.fail[key] -= 1
            return httpx.Response(500, json={"error": {"message": f"boom with token {IG_TOKEN}"}})
        return None

    def handler(self, req: httpx.Request) -> httpx.Response:
        url = req.url
        body = req.content.decode(errors="replace") if req.content else ""
        form = {k: v[0] for k, v in parse_qs(body).items()} if "x-www-form-urlencoded" in req.headers.get("content-type", "") else {}
        params = dict(url.params)
        self.calls.append((req.method, f"{url.host}{url.path}", {**params, **form}))
        host, path = url.host, url.path

        if host == "api.telegram.org":
            method = path.rsplit("/", 1)[-1]
            if method == "getUpdates":
                ups, self.updates = self.updates, []
                return httpx.Response(200, json={"ok": True, "result": ups})
            if method in ("sendMessage", "sendVideo", "sendPhoto", "sendMediaGroup", "sendDocument"):
                data = json.loads(body) if req.headers.get("content-type", "").startswith("application/json") else {}
                self.sent.append({"method": method, **data, "raw": body[:4000]})
                return httpx.Response(200, json={"ok": True, "result": {"message_id": len(self.sent)}})
            if method == "answerCallbackQuery" and self.answer_fails:
                return httpx.Response(400, json={"ok": False, "description": "Bad Request: query is too old"})
            return httpx.Response(200, json={"ok": True, "result": True})

        if host == "graph.instagram.com":
            if path == "/refresh_access_token":
                return httpx.Response(200, json={"access_token": "IGTOKEN-refreshed-999999", "expires_in": 5184000})
            parts = path.strip("/").split("/")[1:]  # drop version
            if parts[-1] == "media" and req.method == "POST":
                if r := self._maybe_fail("create"):
                    return r
                cid = self._id("c")
                self.containers[cid] = form.get("media_type") or ("ITEM" if form.get("is_carousel_item") else "IMAGE")
                return httpx.Response(200, json={"id": cid})
            if parts[-1] == "media" and req.method == "GET":
                return httpx.Response(200, json={"data": self.recent_media})
            if parts[-1] == "media_publish":
                if r := self._maybe_fail("publish"):
                    return r
                mid = self._id("m")
                self.recent_media.insert(0, {"id": mid, "caption": "", "permalink": f"https://www.instagram.com/reel/{mid}/"})
                return httpx.Response(200, json={"id": mid})
            if parts[-1] == "content_publishing_limit":
                return httpx.Response(200, json={"data": [{"quota_usage": 1, "config": {"quota_total": 100}}]})
            if parts[-1] == "insights":
                metrics = params["metric"].split(",")
                bad = next((i for i, m in enumerate(metrics) if m in self.metric_reject), None)
                if bad is not None:  # Meta's style: names the index, then lists valid names (which contain others)
                    return httpx.Response(400, json={"error": {"message":
                        f"(#100) metric[{bad}] must be one of the following values: reach, saved, views, shares, likes"}})
                return httpx.Response(200, json={"data": [{"name": m, "values": [{"value": 10}]} for m in metrics]})
            if params.get("fields") == "status_code":
                s = self.container_status.pop(0) if self.container_status else "FINISHED"
                return httpx.Response(200, json={"status_code": s, "id": parts[-1]})
            if params.get("fields") == "permalink":
                return httpx.Response(200, json={"permalink": f"https://www.instagram.com/reel/{parts[-1]}/"})

        if host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "ya29.fake-access", "expires_in": 3599})
        if host == "www.googleapis.com" and path.startswith("/upload/youtube/v3/videos"):
            if r := self._maybe_fail("yt"):
                return r
            meta = json.loads(body)
            self.pending_title = meta["snippet"]["title"]
            return httpx.Response(200, headers={"location": "https://upload.test/session/1"})
        if host == "upload.test":
            vid = self._id("v")
            self.yt_uploads[self.pending_title] = vid
            return httpx.Response(200, json={"id": vid, "status": {"privacyStatus": self.yt_privacy}})
        if host == "www.googleapis.com" and path.endswith("/channels"):
            return httpx.Response(200, json={"items": [{"contentDetails": {"relatedPlaylists": {"uploads": "UU1"}}}]})
        if host == "www.googleapis.com" and path.endswith("/playlistItems"):
            return httpx.Response(200, json={"items": [{"snippet": {"title": t, "resourceId": {"videoId": v}}}
                                                       for t, v in self.yt_uploads.items()]})
        if host == "www.googleapis.com" and path.endswith("/videos"):
            return httpx.Response(200, json={"items": [{"statistics": {"viewCount": "321", "likeCount": "12"}}]})
        return httpx.Response(404, json={"error": {"message": f"fake has no route {req.method} {host}{path}"}})

    def count(self, method: str, suffix: str) -> int:
        return sum(1 for m, u, _ in self.calls if m == method and u.endswith(suffix))


class Clock:
    def __init__(self, iso: str):
        self.t = datetime.fromisoformat(iso).astimezone(timezone.utc)

    def __call__(self):
        return self.t

    def set(self, iso: str):
        self.t = datetime.fromisoformat(iso).astimezone(timezone.utc)


@pytest.fixture
def fake():
    return Fake()


@pytest.fixture
def clock():
    return Clock("2026-11-16T12:00:00+05:30")


@pytest.fixture
def make_ctx(tmp_path, fake, clock):
    def _make(ig=True, yt=True, tg=True, **cfg_kw):
        cfg = Config(ig_user_id="17841400000000000", ig_token=IG_TOKEN, yt_client_id="cid",
                     yt_client_secret="ysecret-123456", yt_refresh_token="yrefresh-123456",
                     tg_token=TG_TOKEN, tg_chat=OWNER, **cfg_kw)
        cfg.secrets = [IG_TOKEN, TG_TOKEN, "ysecret-123456", "yrefresh-123456"]
        client = httpx.Client(transport=httpx.MockTransport(fake.handler))
        store = LocalStore(tmp_path / "store", "https://media.test")
        ctx = Ctx(cfg=cfg, store=store, now=clock)
        if ig:
            ctx.ig = Instagram(cfg.ig_user_id, IG_TOKEN, cfg.ig_api_version, Http("instagram", cfg.secrets, client),
                               sleep=lambda s: None)
        if yt:
            ctx.yt = YouTube("cid", "ysecret-123456", "yrefresh-123456", Http("youtube", cfg.secrets, client))
        if tg:
            ctx.tg = Telegram(TG_TOKEN, OWNER, Http("telegram", cfg.secrets, client))
        return ctx
    return _make


def write_png(path: Path, color=(240, 90, 70)):
    from PIL import Image
    Image.new("RGB", (108, 192), color).save(path)


@pytest.fixture
def week_dir(tmp_path):
    """A batch folder shaped like promo/out/week-17nov: one reel, one carousel, QA passed."""
    w = tmp_path / "week-17nov"
    reel = w / "01-pause-rewind"
    car = w / "03-export-carousel"
    for d in (reel, car):
        (d / "qa").mkdir(parents=True)
        (d / "qa" / "report.md").write_text("# QA\n\n**Verdict: PASS (round 2 of 3).**\n")
        write_png(d / "cover.png")
    (reel / "pause-rewind.mp4").write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"0" * 2000)
    (reel / "caption.txt").write_text("Pause. Rewind. \"How much butter was that?\" 🧈\nShare the reel to Skwirl.\n\n"
                                      "#recipereels #cookinghacks")
    for i in range(1, 4):
        write_png(car / f"{i:02d}.png", (i * 40, 80, 120))
    (car / "caption.txt").write_text("How to get the list of everything you ever saved on Instagram. 📦\n#instagramtips")
    return w


@pytest.fixture(autouse=True)
def stub_quality_for_legacy_publisher_fixtures(request, monkeypatch):
    """Existing publisher tests use a fake MP4 and tiny images: stub ONLY the measured
    quality boundary for those tests. Real hard gates have their own good/bad tests
    in test_quality_validators.py and never use this stub.
    """
    if request.node.path.name not in ("test_engine.py", "test_extensions.py"):
        return
    import content_engine.stage as stage_module
    from content_engine.validate import policy_digest, hashes
    def reports(schedule, week_dir, now=None):
        return {p["id"]: {"version": 1, "post_id": p["id"], "verdict": "PASS", "errors": [],
                           "policy_digest": policy_digest(),
                           "hashes": hashes(week_dir / p.get("dir", ""), p["media"] + ([p["cover"]] if p.get("cover") else []))}
                for p in schedule["posts"]}
    monkeypatch.setattr(stage_module, "stage_reports", reports)
