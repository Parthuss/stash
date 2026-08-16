"""Notification delivery and, importantly, its failure behaviour.

A confirmation system that fails quietly is worse than none — you end up
trusting a notification that never comes, which is the exact trap the previous
"stashed" notification set. So the contract under test is: try the configured
backend, fall back to the other, never raise into the pipeline, and complain
loudly when nothing got through.
"""

from __future__ import annotations

import dataclasses
import subprocess

import httpx
import pytest

from stash import notify
from stash.config import CONFIG


def _configure(monkeypatch, **overrides):
    patched = dataclasses.replace(notify.CONFIG, **overrides)
    monkeypatch.setattr(notify, "CONFIG", patched)


# --- message shape ---------------------------------------------------------

def test_success_message_leads_with_the_title():
    text = notify.for_success("video-shotcraft plugin", topic="tooling",
                              tools=["claude code", "github"]).as_text()
    assert text.startswith("✅ video-shotcraft plugin")
    assert "tooling · claude code, github" in text


def test_failure_message_carries_the_reason():
    text = notify.for_failure("reel/DbKk4D5", "rate limited").as_text()
    assert text.startswith("❌ reel/DbKk4D5")
    assert "rate limited" in text


def test_success_tools_are_capped_so_the_notification_stays_glanceable():
    text = notify.for_success("t", topic="tooling",
                              tools=["a", "b", "c", "d", "e"]).as_text()
    assert "d" not in text.split("·")[1]


# --- AppleScript escaping --------------------------------------------------

def test_applescript_escaping_handles_quotes_in_titles():
    '''Model-written titles routinely contain quotes ("5 Illegal Repos"), and an
    unescaped one is an osascript syntax error — a silently lost notification.'''
    assert notify._applescript_escape('"5 Illegal Repos"') == r'\"5 Illegal Repos\"'


def test_applescript_escaping_does_backslashes_before_quotes():
    """Order matters: escaping quotes first would then double-escape the
    backslashes that step introduces."""
    assert notify._applescript_escape(r'a\b"c') == r'a\\b\"c'


# --- backend selection and fallback ---------------------------------------

def test_backend_none_delivers_nothing(monkeypatch):
    _configure(monkeypatch, notify_backend="none")
    assert notify.notify(notify.for_success("t")) is False


def test_ntfy_posts_to_the_topic(monkeypatch):
    seen = {}

    def fake_post(url, **kwargs):
        seen["url"] = url
        seen["body"] = kwargs["content"].decode()
        seen["headers"] = kwargs["headers"]
        return httpx.Response(200)

    _configure(monkeypatch, notify_backend="ntfy", ntfy_topic="secret-topic",
               ntfy_server="https://ntfy.sh")
    monkeypatch.setattr(httpx, "post", fake_post)

    assert notify.notify(notify.for_success("a note", topic="tooling")) is True
    assert seen["url"] == "https://ntfy.sh/secret-topic"
    assert "a note" in seen["body"]
    assert seen["headers"]["Title"] == "Stash: saved"


def test_ntfy_failure_notification_is_high_priority(monkeypatch):
    seen = {}

    def fake_post(url, **kwargs):
        seen["headers"] = kwargs["headers"]
        return httpx.Response(200)

    _configure(monkeypatch, notify_backend="ntfy", ntfy_topic="t")
    monkeypatch.setattr(httpx, "post", fake_post)

    notify.notify(notify.for_failure("reel/X", "boom"))
    assert seen["headers"]["Priority"] == "high"


def test_imessage_failure_falls_back_to_ntfy(monkeypatch):
    """The scenario this fallback exists for: Apple tightens Messages scripting
    and the no-app-install backend stops working."""
    calls = []

    def failing_imessage(message, to):
        calls.append("imessage")
        raise notify.NotifyError("Messages automation is not permitted")

    def fake_post(url, **kwargs):
        calls.append("ntfy")
        return httpx.Response(200)

    _configure(monkeypatch, notify_backend="imessage",
               notify_imessage_to="+1555", ntfy_topic="t")
    monkeypatch.setattr(notify, "send_imessage", failing_imessage)
    monkeypatch.setattr(httpx, "post", fake_post)

    assert notify.notify(notify.for_success("a note")) is True
    assert calls == ["imessage", "ntfy"]


def test_all_backends_failing_returns_false_and_says_so_loudly(monkeypatch, capsys):
    def boom(*a, **k):
        raise notify.NotifyError("nope")

    _configure(monkeypatch, notify_backend="imessage",
               notify_imessage_to="+1555", ntfy_topic="t")
    monkeypatch.setattr(notify, "send_imessage", boom)
    monkeypatch.setattr(notify, "send_ntfy", boom)

    assert notify.notify(notify.for_success("a note")) is False
    assert "NOTIFY FAILED" in capsys.readouterr().out


def test_notify_never_raises_into_the_pipeline(monkeypatch):
    """The note is already written by the time we notify. Losing a successful
    capture to a notification bug would be absurd."""
    def explode(*a, **k):
        raise RuntimeError("something completely unexpected")

    _configure(monkeypatch, notify_backend="ntfy", ntfy_topic="t")
    monkeypatch.setattr(notify, "send_ntfy", explode)
    assert notify.notify(notify.for_success("a note"), verbose=False) is False


# --- iMessage error translation -------------------------------------------

def test_imessage_names_the_tcc_denial_specifically(monkeypatch):
    """AppleScript's generic error gives no hint the fix is a System Settings
    checkbox rather than a code bug."""
    def fake_run(*a, **k):
        return subprocess.CompletedProcess(
            a, returncode=1, stdout="", stderr="execution error: Not authorised (-1743)"
        )

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(notify.NotifyError, match="System Settings"):
        notify.send_imessage("hi", "+1555")


def test_imessage_without_a_recipient_is_a_config_error(monkeypatch):
    with pytest.raises(notify.NotifyError, match="STASH_NOTIFY_IMESSAGE_TO"):
        notify.send_imessage("hi", "")
