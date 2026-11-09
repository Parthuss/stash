"""Talking to the Cloudflare Worker instead of the local SQLite queue.

Presents the same three operations the local queue does — claim, finish, add —
so :mod:`stash.pipeline` never learns which one it is working against. Switching
between them is a matter of setting two variables in ``.env``.

Captures come back as plain dicts wrapped to quack like ``sqlite3.Row``, because
that is the shape the pipeline already reads.
"""

from __future__ import annotations

from typing import Any

import base64
import os

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
    # STASH_CLAIM_SCOPE=guests is how the cloud runner says "not the owner's saves".
    scope = os.environ.get("STASH_CLAIM_SCOPE")
    # STASH_CLAIM_SKIP=tiktok.com leaves hosts this machine can't reach (TikTok is blocked in
    # India) to the cloud runner instead of failing them here three times.
    skip = os.environ.get("STASH_CLAIM_SKIP")
    params = {k: v for k, v in (("scope", scope), ("skip", skip)) if v}
    response = httpx.post(
        f"{CONFIG.worker_url}/claim", headers=_headers(), params=params or None, timeout=30,
    )
    if response.status_code != 200:
        raise RemoteError(f"claim {response.status_code}: {response.text[:200]}")
    capture = response.json().get("capture")
    if capture and capture.get("lease"):
        _leases[capture["id"]] = capture["lease"]
    return Row(capture) if capture else None


#: capture id -> lease from /claim, sent back with /note and /complete so the Worker can ignore a
#: report from a processor whose claim went stale and was handed to another runner.
_leases: dict[str, str] = {}


def finish_capture(
    capture_id: str, *, ok: bool, error: str | None = None, title: str | None = None,
    usage: list | None = None,
) -> None:
    """Report a capture done or failed. ``title`` is what makes ``/status/:id``
    (and the phone notification that reads it) show something a human can
    recognize instead of just a status word."""
    response = httpx.post(
        f"{CONFIG.worker_url}/complete",
        headers=_headers(),
        json={"id": capture_id, "ok": ok, "error": error, "title": title, "usage": usage or [],
              "lease": _leases.pop(capture_id, None)},
        timeout=30,
    )
    if response.status_code != 200:
        raise RemoteError(f"complete {response.status_code}: {response.text[:200]}")


def status_of(capture_id: str) -> dict[str, Any] | None:
    """``{"status": "pending"|"claimed"|"done"|"failed", "title", "error"}``.

    ``None`` for an id the Worker has never seen — distinct from a capture that
    exists but hasn't finished, which is why this returns Optional rather than
    a default dict.
    """
    response = httpx.get(
        f"{CONFIG.worker_url}/status/{capture_id}", headers=_headers(), timeout=15
    )
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise RemoteError(f"status {response.status_code}: {response.text[:200]}")
    return response.json()


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


def push_note(
    capture: Row, fields: dict[str, Any], markdown: str, permalink: str | None,
    thumb: bytes | None = None,
) -> None:
    """Hand a finished note to the Worker so the app and the Claude connector
    can read it without this Mac being awake. Idempotent per capture."""
    response = httpx.post(
        f"{CONFIG.worker_url}/note",
        headers=_headers(),
        json={
            "capture_id": capture["id"],
            "user_id": capture["user_id"],
            "title": fields["title"],
            "summary": fields["summary"],
            "topic": fields["topic"],
            "tools": fields["tools"],
            "mentions": fields.get("mentions", []),
            "categories": fields.get("categories", []),
            "cat_version": capture["cat_version"],
            "thumb": base64.b64encode(thumb).decode("ascii") if thumb else None,
            "permalink": permalink,
            "markdown": markdown,
            "lease": _leases.get(capture["id"]),
        },
        timeout=30,
    )
    if response.status_code != 200:
        raise RemoteError(f"note {response.status_code}: {response.text[:200]}")


def sort_claim() -> dict[str, Any] | None:
    """Next batch of notes to file into their owner's own categories, or None."""
    scope = os.environ.get("STASH_CLAIM_SCOPE")
    response = httpx.post(f"{CONFIG.worker_url}/sort/claim", headers=_headers(),
                          params={"scope": scope} if scope else None, timeout=30)
    if response.status_code != 200:
        raise RemoteError(f"sort claim {response.status_code}: {response.text[:200]}")
    return response.json().get("batch")


def sort_result(user_id: str | None, version: int, results: list[dict[str, Any]]) -> None:
    response = httpx.post(f"{CONFIG.worker_url}/sort/result", headers=_headers(),
                          json={"user_id": user_id, "version": version, "results": results}, timeout=30)
    if response.status_code != 200:
        raise RemoteError(f"sort result {response.status_code}: {response.text[:200]}")


def dead() -> list[dict[str, Any]]:
    """Captures that exhausted their attempts and stopped being offered."""
    response = httpx.get(f"{CONFIG.worker_url}/dead", headers=_headers(), timeout=30)
    if response.status_code != 200:
        raise RemoteError(f"dead {response.status_code}: {response.text[:200]}")
    return response.json().get("dead", [])


def health() -> bool:
    try:
        return httpx.get(f"{CONFIG.worker_url}/health", timeout=10).status_code == 200
    except httpx.HTTPError:
        return False
