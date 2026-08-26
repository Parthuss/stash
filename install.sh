#!/usr/bin/env bash
# Collapses the terminal-heavy part of setup: Homebrew deps, venv, pip
# install, .env scaffold, a Groq key if you have one handy. Ends by running
# `stash doctor`, which already knows how to report what's still missing —
# this script doesn't re-implement that.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> Homebrew deps (ffmpeg, yt-dlp)"
command -v ffmpeg >/dev/null || brew install ffmpeg
command -v yt-dlp >/dev/null || brew install yt-dlp

echo "==> Python venv"
# pyproject.toml requires >=3.11; take the newest available rather than
# hardcoding one version (the old README pinned 3.12 at an Apple-Silicon-only
# path and broke on Intel).
PY=""
for v in python3.13 python3.12 python3.11 python3; do
  command -v "$v" >/dev/null && { PY="$v"; break; }
done
[ -n "$PY" ] || { echo "No python3.11+ found. Install one (brew install python@3.12) and re-run." >&2; exit 1; }
[ -d .venv ] || "$PY" -m venv .venv

echo "==> pip install"
.venv/bin/pip install -q -e ".[mcp]"

echo "==> .env"
[ -f .env ] || cp .env.example .env

if ! grep -q '^GROQ_API_KEY=.\+' .env; then
  read -rp "Groq key (console.groq.com/keys), or Enter to add it later: " key
  [ -n "${key:-}" ] && sed -i.bak "s|^GROQ_API_KEY=.*|GROQ_API_KEY=$key|" .env && rm .env.bak
fi

echo "==> doctor"
.venv/bin/python -m stash doctor
