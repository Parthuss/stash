"""stash.remote's contract with the Worker.

The live routes were exercised end-to-end under `wrangler dev` (status
lifecycle, title-on-complete, the dead-letter transition, and /media/:key
correctly 501ing with no R2 binding). These tests pin the Python side of that
contract with httpx's MockTransport so a change to the request shape here
fails immediately, rather than only being caught the next time someone happens
to run the Worker locally.
"""

from __future__ import annotations

import dataclasses

import httpx
import pytest

from stash import remote
from stash.config import CONFIG


@pytest.fixture(autouse=True)
def _remote_configured(monkeypatch):
    # Config is a frozen dataclass (deliberately — see config.py), so swap the
    # module-level instance `remote.CONFIG` points at rather than mutating it.
    patched = dataclasses.replace(
        CONFIG, worker_url="https://stash.example.workers.dev", worker_secret="testsecret"
    )
    monkeypatch.setattr(remote, "CONFIG", patched)


def _patch_client(monkeypatch, handler):
    """Route both httpx.get/post through a MockTransport for this test."""
    transport = httpx.MockTransport(handler)

    def fake_request(method, url, **kwargs):
        with httpx.Client(transport=transport) as client:
            return client.request(method, url, **kwargs)

    monkeypatch.setattr(httpx, "get", lambda url, **kw: fake_request("GET", url, **kw))
    monkeypatch.setattr(httpx, "post", lambda url, **kw: fake_request("POST", url, **kw))


def test_finish_capture_sends_title_on_success(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["secret"] = request.headers.get("X-Stash-Secret")
        seen["body"] = httpx.Request("POST", "http://x").content  # placeholder
        import json

        seen["json"] = json.loads(request.content)
        return httpx.Response(200, json={"ok": True})

    _patch_client(monkeypatch, handler)
    remote.finish_capture("abc123", ok=True, title="video-shotcraft plugin")

    assert seen["url"].endswith("/complete")
    assert seen["secret"] == "testsecret"
    assert seen["json"] == {
        "id": "abc123", "ok": True, "error": None, "title": "video-shotcraft plugin",
    }


def test_finish_capture_raises_on_non_200(monkeypatch):
    _patch_client(monkeypatch, lambda r: httpx.Response(500, text="boom"))
    with pytest.raises(remote.RemoteError, match="complete 500"):
        remote.finish_capture("abc123", ok=False, error="whatever")


def test_status_of_unknown_id_returns_none_not_a_default_dict(monkeypatch):
    """None means 'the Worker has never heard of this id' — distinct from a
    capture that exists but hasn't finished, which is a real dict."""
    _patch_client(monkeypatch, lambda r: httpx.Response(404, json={"error": "unknown id"}))
    assert remote.status_of("nonexistent") is None


def test_status_of_returns_the_worker_shape(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/status/abc123"
        return httpx.Response(
            200, json={"status": "done", "title": "video-shotcraft plugin", "error": None}
        )

    _patch_client(monkeypatch, handler)
    result = remote.status_of("abc123")
    assert result == {"status": "done", "title": "video-shotcraft plugin", "error": None}


def test_status_of_dead_letter_is_reported_as_failed(monkeypatch):
    """Mirrors the Worker's own dead-letter transition (pending + attempts
    exhausted -> 'failed'), verified live against /status/:id."""
    _patch_client(
        monkeypatch,
        lambda r: httpx.Response(
            200, json={"status": "failed", "title": None, "error": "cookies expired"}
        ),
    )
    result = remote.status_of("abc123")
    assert result["status"] == "failed"
    assert "cookies" in result["error"]


def test_row_returns_none_for_missing_keys_instead_of_raising():
    """sqlite3.Row raises KeyError on an unknown column; the Worker's JSON can
    legitimately omit a nullable field, so Row must read that as None."""
    row = remote.Row({"id": "abc123", "permalink": "https://x/1"})
    assert row["media_key"] is None
    assert row["permalink"] == "https://x/1"
