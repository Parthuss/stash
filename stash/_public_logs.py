"""Limit the automation process to status messages it constructs itself."""

from __future__ import annotations

import os
from typing import TextIO

_status_output: TextIO | None = None


def in_ci() -> bool:
    return any(
        os.environ.get(name, "").lower() not in ("", "0", "false")
        for name in ("CI", "GITHUB_ACTIONS")
    )


def local_debug_enabled() -> bool:
    return os.environ.get("STASH_DEBUG_PROCESS_LOGS") == "1" and not in_ci()


def report_status(message: str) -> None:
    """Emit a fixed status or a count computed by the daemon."""
    print(message, file=_status_output, flush=True)


def run_public_process(argv: list[str]) -> int:
    """Capture and discard both streams for the rest of the CLI process."""
    global _status_output
    # Save non-inheritable descriptors for trusted output. Redirect the actual
    # standard descriptors before importing the CLI so child tools, native code,
    # logging handlers and shutdown hooks all write to the same sink.
    _status_output = os.fdopen(os.dup(1), "w")
    with os.fdopen(os.dup(2), "w") as error_output, open(os.devnull, "w") as sink:
        os.dup2(sink.fileno(), 1)
        os.dup2(sink.fileno(), 2)
        try:
            from .cli import main

            code = main(argv)
        except SystemExit as exc:
            code = exc.code if isinstance(exc.code, int) else int(exc.code is not None)
        except KeyboardInterrupt:
            code = 130
        except Exception:
            code = 1

        if code:
            print("stash process failed", file=error_output, flush=True)
    return code
