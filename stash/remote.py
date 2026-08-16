"""Talking to the Cloudflare Worker instead of the local SQLite queue.

Presents the same three operations the local queue does — claim, finish, add —
so :mod:`stash.pipeline` never learns which one it is working against. Switching
between them is a matter of setting two variables in ``.env``.

Captures come back as plain dicts wrapped to quack like ``sqlite3.Row``, because
that is the shape the pipeline already reads.
"""

from __future__ import annotations

from typing import Any

import httpx

from .config import CONFIG


class RemoteError(RuntimeError):
    pass


class Row(dict):
    """dict that also supports ``row["key"]`` semantics for missing keys.

    ``sqlite3.Row`` raises on unknown columns; the Worker may legitimately omit
    a nullable field, and the pipeline should read that as None rather than
    crash mid-capture.
    """

    def __getitem__(self, key: str) -> Any:
        return self.get(key)


def _headers() -> dict[str, str]:
    if not CONFIG.uses_remote_queue:
        raise RemoteError("STASH_WORKER_URL and STASH_SECRET are not both set")
    return {"X-Stash-Secret": CONFIG.worker_secret, "content-type": "application/json"}


def add_capture(
    *, source: str, permalink: str | None = None, note: str | None = None
) -> tuple[str, bool]:
    response = httpx.post(
        f"{CONFIG.worker_url}/ingest",
        headers=_headers(),
        json={"source": source, "url": permalink, "note": note},
        timeout=30,
    )
    if response.status_code not in (200, 202):
        raise RemoteError(f"ingest {response.status_code}: {response.text[:200]}")
    body = response.json()
    return body["id"], bool(body.get("created"))


def claim_next() -> Row | None:
    response = httpx.post(f"{CONFIG.worker_url}/claim", headers=_headers(), timeout=30)
    if response.status_code != 200:
        raise RemoteError(f"claim {response.status_code}: {response.text[:200]}")
    capture = response.json().get("capture")
    return Row(capture) if capture else None


def finish_capture(capture_id: str, *, ok: bool, error: str | None = None) -> None:
    response = httpx.post(
        f"{CONFIG.worker_url}/complete",
        headers=_headers(),
        json={"id": capture_id, "ok": ok, "error": error},
        timeout=30,
    )
    if response.status_code != 200:
        raise RemoteError(f"complete {response.status_code}: {response.text[:200]}")


def media_url_for(capture: Row) -> str | None:
    """Prefer the R2 copy over the CDN link, which will already have expired.

    The Worker grabbed the media inside the webhook request precisely so this
    would still be available whenever the Mac next wakes up.
    """
    key = capture["media_key"]
    if key:
        return f"{CONFIG.worker_url}/media/{key}"
    return capture["media_url"]


def pending(limit: int = 20) -> list[Row]:
    response = httpx.get(
        f"{CONFIG.worker_url}/pending", headers=_headers(),
        params={"limit": limit}, timeout=30,
    )
    if response.status_code != 200:
        raise RemoteError(f"pending {response.status_code}: {response.text[:200]}")
    return [Row(c) for c in response.json().get("captures", [])]


def health() -> bool:
    try:
        return httpx.get(f"{CONFIG.worker_url}/health", timeout=10).status_code == 200
    except httpx.HTTPError:
        return False
