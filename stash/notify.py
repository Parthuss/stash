"""Telling the phone whether a save actually worked.

The gap this closes: the Shortcut's "stashed" notification only ever meant
"the HTTP request left the phone". A share could show that and still produce
nothing — which is exactly what happened when the LAN receiver was quietly not
running. Confirmation has to come from the end of the pipeline, after a note
exists, or it is confirming the wrong thing.

Two backends, both free:

``imessage``
    ``osascript`` tells Messages to send you a normal iMessage. No app to
    install, no third party, arrives anywhere you have data. The catch is that
    it needs a one-time Automation permission grant, and Apple has been
    steadily tightening Messages scripting — so this is written to fail
    loudly and fall back rather than fail silently.

``ntfy``
    A POST to ntfy.sh, whose iOS app is free and open source. Needs an app
    install, but no permissions and no scripting APIs that might disappear.
    Worth knowing: topics on the public server are unauthenticated, so the
    topic name *is* the credential — use a long random one — and note titles
    pass through someone else's server.

Failures are notified too. A silent failure is the thing this module exists to
prevent, so a delivery backend that itself fails logs loudly rather than
swallowing the error.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass

import httpx

from .config import CONFIG


@dataclass
class Notification:
    ok: bool
    title: str
    detail: str = ""
    url: str = ""

    def as_text(self) -> str:
        mark = "✅" if self.ok else "❌"
        lines = [f"{mark} {self.title}"]
        if self.detail:
            lines.append(self.detail)
        if self.url:
            lines.append(self.url)
        return "\n".join(lines)


class NotifyError(RuntimeError):
    pass


def _applescript_escape(text: str) -> str:
    r"""Escape for embedding in an AppleScript string literal.

    Backslash first — escaping quotes first would then double-escape the
    backslashes this step introduces. Note titles come from a model and
    routinely contain quotes ("5 Illegal Repos"), so this is load-bearing, not
    defensive: an unescaped quote turns into an osascript syntax error and a
    lost notification.
    """
    return text.replace("\\", "\\\\").replace('"', '\\"')


def send_imessage(message: str, to: str) -> None:
    """Send yourself an iMessage. Raises NotifyError with the real reason."""
    if not to:
        raise NotifyError("STASH_NOTIFY_IMESSAGE_TO is not set")

    script = f'''
    tell application "Messages"
        set targetService to 1st service whose service type = iMessage
        set targetBuddy to buddy "{_applescript_escape(to)}" of targetService
        send "{_applescript_escape(message)}" to targetBuddy
    end tell
    '''
    proc = subprocess.run(
        ["osascript", "-e", script], capture_output=True, text=True, timeout=30
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        # -1743 is the TCC denial. Worth naming explicitly because the generic
        # AppleScript error text gives no hint that the fix is a checkbox in
        # System Settings rather than anything wrong with the code.
        if "-1743" in stderr or "not authorised" in stderr or "not authorized" in stderr:
            raise NotifyError(
                "Messages automation is not permitted. Grant it in System Settings → "
                "Privacy & Security → Automation → (your terminal) → Messages, "
                "or switch to STASH_NOTIFY=ntfy."
            )
        raise NotifyError(f"osascript failed: {stderr[:300]}")


def send_ntfy(notification: Notification, topic: str, server: str) -> None:
    if not topic:
        raise NotifyError("STASH_NTFY_TOPIC is not set")

    response = httpx.post(
        f"{server.rstrip('/')}/{topic}",
        content=notification.as_text().encode("utf-8"),
        headers={
            "Title": ("Stash: saved" if notification.ok else "Stash: failed"),
            "Tags": "white_check_mark" if notification.ok else "x",
            "Priority": "default" if notification.ok else "high",
        },
        timeout=15,
    )
    if response.status_code >= 300:
        raise NotifyError(f"ntfy {response.status_code}: {response.text[:200]}")


def notify(notification: Notification, *, verbose: bool = True) -> bool:
    """Deliver via the configured backend, falling back to the other one.

    Returns whether anything was delivered. Never raises: a broken notifier
    must not fail a capture that otherwise succeeded — the note is already on
    disk by this point and losing it to a notification bug would be absurd.
    """
    backend = (CONFIG.notify_backend or "none").lower()
    if backend == "none":
        return False

    order = [backend] + [b for b in ("imessage", "ntfy") if b != backend]
    errors: list[str] = []

    for candidate in order:
        try:
            if candidate == "imessage":
                send_imessage(notification.as_text(), CONFIG.notify_imessage_to)
            elif candidate == "ntfy":
                send_ntfy(notification, CONFIG.ntfy_topic, CONFIG.ntfy_server)
            else:
                continue
            if verbose and candidate != backend:
                # The primary backend didn't just get skipped — it threw. That's
                # worth seeing even though delivery still succeeded, or the next
                # person to debug "why is it always falling back" has nothing to
                # go on but a guess (see notify.py's own module docstring).
                print(f"  notified via {candidate} (fallback) — primary failed: "
                      f"{'; '.join(errors)}", flush=True)
            return True
        except Exception as exc:  # noqa: BLE001 — try the next backend
            errors.append(f"{candidate}: {exc}")

    if verbose:
        # Loud, because a confirmation system that fails quietly is worse than
        # none at all — you would trust a notification that never comes.
        print(f"  NOTIFY FAILED — {' | '.join(errors)}", flush=True)
    return False


def for_success(title: str, topic: str = "", tools: list[str] | None = None,
                url: str = "") -> Notification:
    detail = topic
    if tools:
        detail = f"{topic} · {', '.join(tools[:3])}" if topic else ", ".join(tools[:3])
    return Notification(ok=True, title=title, detail=detail, url=url)


def for_failure(label: str, error: str, url: str = "") -> Notification:
    return Notification(ok=False, title=label, detail=error[:200], url=url)
