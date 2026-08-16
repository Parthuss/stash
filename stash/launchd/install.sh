#!/bin/sh
# Install the stash daemon as a launchd user agent: starts at login, restarts
# on crash. Run once, after STASH_WORKER_URL/STASH_SECRET are set in .env —
# the daemon exits immediately without them, and launchd would just restart
# it in a crash loop forever if it were loaded before that's true.
set -eu

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON="$REPO/.venv/bin/python"
LABEL="com.stash.daemon"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -x "$PYTHON" ]; then
  echo "no venv at $PYTHON — set one up first (see README.md)" >&2
  exit 1
fi
if ! grep -q '^STASH_WORKER_URL=.\+' "$REPO/.env" 2>/dev/null; then
  echo "STASH_WORKER_URL is not set in $REPO/.env — deploy the Worker first" >&2
  exit 1
fi

# Resolve Homebrew's bin from a tool we actually need, rather than hardcoding a
# path — Apple Silicon uses /opt/homebrew/bin, Intel /usr/local/bin.
YTDLP="$(command -v yt-dlp || true)"
if [ -z "$YTDLP" ]; then
  echo "yt-dlp not on PATH — brew install yt-dlp first (the daemon cannot fetch without it)" >&2
  exit 1
fi
BREW_BIN="$(dirname "$YTDLP")"

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s|{{PYTHON}}|$PYTHON|g" -e "s|{{REPO}}|$REPO|g" -e "s|{{BREW_BIN}}|$BREW_BIN|g" \
  "$REPO/stash/launchd/com.stash.daemon.plist.template" > "$DEST"

# bootout is allowed to fail (nothing loaded yet, first install) — the -q hides that.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
launchctl enable "gui/$(id -u)/$LABEL"

echo "installed $DEST"
echo "check it:  stash status"
echo "logs:      tail -f $REPO/.stash-daemon.log"
echo "uninstall: launchctl bootout gui/$(id -u)/$LABEL && rm $DEST"
