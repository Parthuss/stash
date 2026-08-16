"""The always-running half of the durable capture path.

``stash watch`` and ``stash receive`` both require the Mac to be on the same
network as the phone at the moment of the share. This does not: it polls the
Cloudflare Worker's queue, which the phone can reach from anywhere — cellular,
someone else's Wi-Fi, wherever. The trade this makes deliberately is that
*capture* stops depending on the Mac; *processing* still needs it to be awake
at some point afterwards. A save is never lost; it just waits.

Two things this module is careful about, because the failure mode that
prompted it was invisible:

1. **A heartbeat file, not just a log line.** ``stash doctor`` has to be able
   to answer "is the daemon actually running?" without the person remembering
   which terminal tab it was in. Every tick — success, empty poll, or network
   failure — updates :data:`CONFIG.daemon_state_path` with the PID and a
   timestamp. ``doctor`` calls :func:`read_state` and checks both the PID is
   alive and the timestamp is recent; a daemon that's hung but not exited
   would still show a stale heartbeat and get flagged.
2. **Backoff that isn't silence.** An idle inbox backs the poll interval off
   from ``min_interval`` towards ``max_interval`` so a quiet daemon isn't
   hammering Cloudflare every 30 seconds all day. A network error does the
   same — the Worker being briefly unreachable should degrade gracefully, not
   spin or crash.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from . import pipeline
from .config import CONFIG

#: How stale a heartbeat can be before `doctor` calls the daemon dead. Set well
#: above `max_interval` so a normal backoff cycle never trips a false alarm.
HEARTBEAT_STALE_AFTER = 900  # 15 minutes


@dataclass
class State:
    pid: int
    started_at: float
    last_poll_at: float = 0.0
    last_result: str = "starting"  # starting | ok | empty | error
    last_error: str = ""
    consecutive_empty: int = 0
    interval: int = 30


def _write_state(state: State) -> None:
    tmp = CONFIG.daemon_state_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(asdict(state)), encoding="utf-8")
    tmp.replace(CONFIG.daemon_state_path)  # atomic — doctor never sees a half-written file


def read_state() -> dict | None:
    if not CONFIG.daemon_state_path.exists():
        return None
    try:
        return json.loads(CONFIG.daemon_state_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def is_alive(state: dict | None = None) -> tuple[bool, str]:
    """``(alive, reason)``. Used by ``stash doctor``; not by the daemon itself."""
    state = state if state is not None else read_state()
    if state is None:
        return False, "never started (no heartbeat file)"

    pid = state.get("pid")
    try:
        os.kill(pid, 0)  # signal 0: existence check, doesn't actually signal anything
    except (ProcessLookupError, TypeError):
        return False, f"heartbeat exists but pid {pid} is not running"
    except PermissionError:
        pass  # process exists, just owned by someone else — fine, it's ours

    age = time.time() - state.get("last_poll_at", 0)
    if age > HEARTBEAT_STALE_AFTER:
        return False, f"pid {pid} alive but last poll was {int(age)}s ago (hung?)"

    last_result = state.get("last_result", "?")
    if last_result == "error":
        return True, f"running, but last poll failed: {state.get('last_error', '')[:120]}"
    return True, f"running, pid {pid}, last poll {int(age)}s ago ({last_result})"


def run(
    conn: sqlite3.Connection,
    *,
    min_interval: int = 30,
    max_interval: int = 300,
    once: bool = False,
) -> None:
    """Poll the Worker forever (or once, for tests and manual runs)."""
    if not CONFIG.uses_remote_queue:
        raise RuntimeError(
            "stash daemon needs STASH_WORKER_URL and STASH_SECRET set in .env — "
            "it has nothing to poll without a deployed Worker. `stash watch` or "
            "`stash receive` are the local-only alternatives."
        )

    state = State(pid=os.getpid(), started_at=time.time(), interval=min_interval)
    _write_state(state)
    print(f"stash daemon: polling {CONFIG.worker_url}")
    print(f"heartbeat: {CONFIG.daemon_state_path}")
    print(f"interval: {min_interval}s idle -> backs off to {max_interval}s — ctrl-c to stop\n")

    while True:
        state.last_poll_at = time.time()
        try:
            # drain() claims and processes everything currently pending, so a
            # separate /pending pre-check would just be a second round trip
            # asking the same question. Its own return value tells us whether
            # this tick was worth doing.
            results = pipeline.drain(conn, verbose=True)
        except Exception as exc:  # noqa: BLE001 — a transient Cloudflare blip must not kill this
            state.last_result = "error"
            state.last_error = str(exc)
            state.interval = min(max_interval, (state.interval or min_interval) * 2)
            print(f"  poll failed: {exc}  (retrying in {state.interval}s)", flush=True)
            _write_state(state)
            if once:
                return
            _sleep(state.interval)
            continue

        if results:
            for result in results:
                print(f"  -> {result.title}", flush=True)
            state.last_result = "ok"
            state.last_error = ""
            state.consecutive_empty = 0
            state.interval = min_interval
            print(flush=True)
        else:
            state.last_result = "empty"
            state.consecutive_empty += 1
            # Back off after a few consecutive empty polls rather than the
            # first one — a share that lands mid-cycle shouldn't wait a full
            # backoff period just because the poll before it was quiet too.
            if state.consecutive_empty >= 3:
                state.interval = min(max_interval, state.interval * 2)

        _write_state(state)
        if once:
            return
        _sleep(state.interval)


def _sleep(seconds: int) -> None:
    try:
        time.sleep(seconds)
    except KeyboardInterrupt:
        print("\nstopped")
        raise SystemExit(0)
