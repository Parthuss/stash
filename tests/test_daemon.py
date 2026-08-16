"""The daemon's heartbeat and backoff — the two things `stash doctor` and the
launchd job depend on being correct.

The failure this module exists to prevent was invisible: a receiver process
had quietly exited and nothing said so. `is_alive` has to catch three distinct
broken states, not just "no process" — a stale/never-started heartbeat, a pid
that's gone, and a pid that's alive but stopped polling (hung).
"""

from __future__ import annotations

import dataclasses
import os
import time

import pytest

from stash import daemon
from stash.config import CONFIG


@pytest.fixture(autouse=True)
def _isolated_state(tmp_path, monkeypatch):
    # Config is a frozen dataclass, so swap the module-level CONFIG each module
    # actually reads rather than mutating the shared instance in place.
    patched = dataclasses.replace(CONFIG, daemon_state_path=tmp_path / "state.json")
    monkeypatch.setattr(daemon, "CONFIG", patched)


def test_is_alive_with_no_heartbeat_file():
    alive, reason = daemon.is_alive()
    assert not alive
    assert "never started" in reason


def test_is_alive_when_pid_is_this_process_and_recent():
    state = daemon.State(pid=os.getpid(), started_at=time.time(), last_poll_at=time.time())
    daemon._write_state(state)
    alive, reason = daemon.is_alive()
    assert alive
    assert str(os.getpid()) in reason


def test_is_alive_false_for_a_dead_pid():
    """A pid this large is never a real process — this is the 'quietly exited
    and nothing said so' case."""
    state = daemon.State(pid=999_999, started_at=time.time(), last_poll_at=time.time())
    daemon._write_state(state)
    alive, reason = daemon.is_alive()
    assert not alive
    assert "not running" in reason


def test_is_alive_false_when_heartbeat_is_stale():
    """Process technically alive but stopped polling ages ago — a hang, not a
    crash, and the more dangerous failure mode because a naive pid-only check
    would report this as healthy."""
    stale = time.time() - daemon.HEARTBEAT_STALE_AFTER - 60
    state = daemon.State(pid=os.getpid(), started_at=stale, last_poll_at=stale)
    daemon._write_state(state)
    alive, reason = daemon.is_alive()
    assert not alive
    assert "hung" in reason


def test_is_alive_reports_last_error_when_last_poll_failed():
    state = daemon.State(
        pid=os.getpid(), started_at=time.time(), last_poll_at=time.time(),
        last_result="error", last_error="Worker unreachable: connection refused",
    )
    daemon._write_state(state)
    alive, reason = daemon.is_alive()
    # Still "alive" — the process is up and retrying — but the reason surfaces
    # the failure rather than silently reporting healthy.
    assert alive
    assert "Worker unreachable" in reason


def test_state_roundtrips_through_read_state(tmp_path):
    state = daemon.State(pid=123, started_at=1.0, last_poll_at=2.0, interval=45)
    daemon._write_state(state)
    loaded = daemon.read_state()
    assert loaded["pid"] == 123
    assert loaded["interval"] == 45


def _configure_remote(monkeypatch, **overrides):
    """dataclasses.replace on the module-level daemon.CONFIG the daemon actually
    reads — Config is frozen, so this is the only way to point it at a fake
    Worker for a test."""
    patched = dataclasses.replace(
        daemon.CONFIG,
        worker_url=overrides.pop("worker_url", "https://stash.example.workers.dev"),
        worker_secret=overrides.pop("worker_secret", "testsecret"),
        **overrides,
    )
    monkeypatch.setattr(daemon, "CONFIG", patched)


def test_run_without_worker_configured_raises_immediately(monkeypatch):
    """A daemon with nothing to poll must fail loudly and instantly, not sit
    there doing nothing — that's exactly the silent-failure shape this module
    exists to eliminate."""
    _configure_remote(monkeypatch, worker_url="", worker_secret="")
    with pytest.raises(RuntimeError, match="STASH_WORKER_URL"):
        daemon.run(conn=None, once=True)


def test_run_once_empty_poll_updates_heartbeat_without_sleeping(monkeypatch):
    _configure_remote(monkeypatch)
    monkeypatch.setattr("stash.pipeline.drain", lambda conn, verbose=True: [])

    daemon.run(conn=None, once=True)

    state = daemon.read_state()
    assert state["last_result"] == "empty"
    assert state["consecutive_empty"] == 1


def test_run_once_with_results_resets_backoff(monkeypatch):
    class FakeResult:
        title = "a saved reel"

    _configure_remote(monkeypatch)
    monkeypatch.setattr("stash.pipeline.drain", lambda conn, verbose=True: [FakeResult()])

    daemon.run(conn=None, once=True, min_interval=30)

    state = daemon.read_state()
    assert state["last_result"] == "ok"
    assert state["consecutive_empty"] == 0
    assert state["interval"] == 30


def test_run_once_network_error_backs_off_and_does_not_raise(monkeypatch):
    """The whole point of the daemon: a Cloudflare blip degrades the poll
    interval, it does not take the process down."""
    def boom(conn, verbose=True):
        raise RuntimeError("Worker unreachable: connection refused")

    _configure_remote(monkeypatch)
    monkeypatch.setattr("stash.pipeline.drain", boom)

    daemon.run(conn=None, once=True, min_interval=30)  # must not raise

    state = daemon.read_state()
    assert state["last_result"] == "error"
    assert "unreachable" in state["last_error"]
    assert state["interval"] == 60  # doubled from min_interval


def test_backoff_only_kicks_in_after_a_few_empty_polls(monkeypatch):
    """A share landing mid-cycle shouldn't wait a full backoff period just
    because the tick before it happened to be quiet."""
    _configure_remote(monkeypatch)
    monkeypatch.setattr(daemon, "_sleep", lambda seconds: None)

    calls = {"n": 0}

    def counting_drain(conn, verbose=True):
        calls["n"] += 1
        if calls["n"] >= 4:
            raise SystemExit(0)  # stop the otherwise-infinite loop
        return []

    monkeypatch.setattr("stash.pipeline.drain", counting_drain)
    with pytest.raises(SystemExit):
        daemon.run(conn=None, min_interval=30, max_interval=300)

    state = daemon.read_state()
    assert state["interval"] == 60  # backed off once, after the 3rd empty poll
