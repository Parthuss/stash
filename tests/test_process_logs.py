"""Canary tests for the public runner and its provider diagnostics."""

import os
import subprocess
import sys
from pathlib import Path
from textwrap import dedent

import httpx
import pytest

import stash
from stash import extract, transcribe


URL = "https://canary.invalid/private-save"
TITLE = "Saved title canary"
TOKEN = "processor_token_canary_4f85"
CANARIES = (URL, TITLE, TOKEN)
RUNNER = Path(stash.__file__).resolve().parent.parent


@pytest.mark.parametrize(
    ("ci", "debug"), [(False, False), (True, True), (False, True)],
)
def test_provider_fallback_and_reset_header_logs(tmp_path, monkeypatch, capsys, ci, debug):
    monkeypatch.setenv("CI", "true" if ci else "false")
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setenv("STASH_DEBUG_PROCESS_LOGS", "1" if debug else "0")
    for provider in (transcribe, extract):
        monkeypatch.setattr(provider, "openrouter_key", lambda: TOKEN)
        monkeypatch.setattr(provider, "openrouter_failed", lambda _: None)

    detail = " ".join(CANARIES)

    def post(url, **kwargs):
        if "openrouter.ai" in url:
            raise httpx.ConnectError(detail)
        if url == transcribe.GROQ_URL:
            return httpx.Response(200, json={"text": TITLE})
        assert url == extract.GROQ_CHAT_URL
        return httpx.Response(200, headers={
            "x-ratelimit-remaining-tokens": "2",
            "x-ratelimit-limit-tokens": "100",
            "x-ratelimit-reset-tokens": detail,
        }, json={"choices": [{"message": {"content": '{"title": "' + TITLE + '"}'}}]})

    monkeypatch.setattr(httpx, "post", post)
    wav = tmp_path / "mock.wav"
    wav.write_bytes(b"canary audio fixture")

    assert transcribe._groq(wav).text == TITLE
    assert extract._groq_request([], max_tokens=100)["title"] == TITLE

    output = capsys.readouterr()
    assert "openrouter transcription unavailable" in output.out
    assert "openrouter unavailable" in output.out
    assert "groq tokens low" in output.out
    assert output.err == ""
    for canary in CANARIES:
        assert output.out.count(canary) == (3 if debug and not ci else 0)


@pytest.mark.parametrize(
    ("scenario", "ci", "status", "stdout", "stderr"),
    [
        ("success", False, 0, "sorted 2 note(s) into categories\nprocessed 1\n", ""),
        ("success", True, 0, "sorted 2 note(s) into categories\nprocessed 1\n", ""),
        ("poll_failure", True, 0, "  poll failed\n", ""),
        ("exception", True, 1, "", "stash process failed\n"),
        ("explicit_exit", True, 17, "", "stash process failed\n"),
    ],
)
def test_public_process_discards_both_streams(
    tmp_path, scenario, ci, status, stdout, stderr,
):
    # Seed an offline queue and noisy child before invoking the actual module CLI.
    # This simulates Python logging, writes to OS descriptors and other programs
    # inheriting both streams, including those with status-like output.
    (tmp_path / "sitecustomize.py").write_text(dedent("""\
        import atexit
        import os
        import subprocess
        import sys
        from dataclasses import replace
        from pathlib import Path
        from types import SimpleNamespace

        from stash import cli, daemon, pipeline

        canaries = os.environ["PROCESS_TEST_CANARIES"]
        scenario = os.environ["PROCESS_TEST_SCENARIO"]
        config = replace(
            cli.CONFIG, worker_url="https://worker.invalid", worker_secret="test-key",
            db_path=Path("test.sqlite"), vault_dir=Path("vault"), media_dir=Path("media"),
            daemon_state_path=Path("heartbeat.json"),
        )
        cli.CONFIG = daemon.CONFIG = config

        def noisy_output():
            print(canaries, flush=True)
            print(canaries, file=sys.stderr, flush=True)
            os.write(1, (canaries + "\\n").encode())
            os.write(2, (canaries + "\\n").encode())
            code = "import sys; print(sys.argv[1]); print(sys.argv[1], file=sys.stderr)"
            subprocess.run([sys.executable, "-c", code, canaries + "\\nprocessed 999"],
                           env={"PATH": os.defpath}, check=True)

        def connect(_):
            if scenario == "exception":
                noisy_output()
                raise ValueError(canaries)

        def drain(conn, **kwargs):
            assert os.environ["STASH_CLAIM_SCOPE"] == "guests"
            noisy_output()
            if scenario == "poll_failure":
                raise RuntimeError(canaries)
            if scenario == "explicit_exit":
                raise SystemExit(17)
            return [SimpleNamespace(title=canaries)]

        cli.db.connect = connect
        pipeline.drain = drain
        pipeline.sort_categories = lambda **kwargs: 2
        atexit.register(lambda: print(canaries, file=sys.stderr, flush=True))
        """))

    env = {
        **os.environ,
        "CI": "true" if ci else "false",
        "GITHUB_ACTIONS": "false",
        "PYTHONPATH": os.pathsep.join((str(tmp_path), str(RUNNER))),
        "PROCESS_TEST_CANARIES": " ".join(CANARIES),
        "PROCESS_TEST_SCENARIO": scenario,
        "STASH_DEBUG_PROCESS_LOGS": "1" if ci else "0",
    }
    result = subprocess.run(
        [sys.executable, "-m", "stash", "daemon", "--once", "--guests-only", "--quiet"],
        cwd=tmp_path, env=env, capture_output=True, text=True, timeout=15,
    )

    assert result.returncode == status
    for stream in (result.stdout, result.stderr):
        for canary in CANARIES:
            assert canary not in stream
    assert result.stdout == stdout
    assert result.stderr == stderr


def test_actions_guard_applies_before_cli_import(tmp_path):
    env = {
        **os.environ,
        "CI": "false",
        "GITHUB_ACTIONS": "true",
        "PYTHONPATH": str(RUNNER),
        "STASH_DEBUG_PROCESS_LOGS": "1",
        # The configuration parser's ValueError would quote this input.
        "STASH_LOCAL_PORT": " ".join(CANARIES),
    }
    result = subprocess.run(
        [sys.executable, "-m", "stash", "daemon", "--once", "--guests-only"],
        cwd=tmp_path, env=env, capture_output=True, text=True, timeout=15,
    )
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr == "stash process failed\n"
