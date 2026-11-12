"""One small HTTP layer for every API, so tests can swap in httpx.MockTransport and errors never leak tokens."""
from __future__ import annotations

from typing import Any

import httpx

from .config import redact


class ApiError(RuntimeError):
    def __init__(self, service: str, status: int, message: str, retryable: bool):
        super().__init__(f"{service} {status}: {message}")
        self.service, self.status, self.retryable = service, status, retryable


class Http:
    def __init__(self, service: str, secrets: list[str], client: httpx.Client | None = None, timeout: float = 60):
        self.service = service
        self.secrets = secrets
        self.client = client or httpx.Client(timeout=timeout, follow_redirects=False)

    def request(self, method: str, url: str, **kw: Any) -> httpx.Response:
        try:
            r = self.client.request(method, url, **kw)
        except httpx.HTTPError as e:  # network trouble: the message can contain the URL, so redact it
            raise ApiError(self.service, 0, redact(type(e).__name__ + ": " + str(e), self.secrets), True) from None
        if r.status_code >= 400:
            raise ApiError(self.service, r.status_code, redact(_error_text(r), self.secrets),
                           r.status_code in (408, 429) or r.status_code >= 500)
        return r

    def json(self, method: str, url: str, **kw: Any) -> dict:
        r = self.request(method, url, **kw)
        if not r.content:
            return {}
        try:
            return r.json()
        except ValueError:
            raise ApiError(self.service, r.status_code, "response wasn't JSON", True) from None


def _error_text(r: httpx.Response) -> str:
    try:
        body = r.json()
    except ValueError:
        return r.text[:300]
    err = body.get("error") if isinstance(body, dict) else None
    if isinstance(err, dict):
        return str(err.get("message") or err)[:300]
    if isinstance(body, dict) and "description" in body:  # Telegram
        return str(body["description"])[:300]
    return str(err or body)[:300]
