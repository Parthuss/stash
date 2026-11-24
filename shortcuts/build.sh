#!/bin/sh
# Build and sign the Skwirl iOS Shortcut on macOS (`brew install cherri`).
# The share sheet opens the configured web app in Safari using its sign-in.
# Pass an output file to place the build in a separate deployment checkout.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
RENDERED="$REPO/shortcuts/.Skwirl.rendered.cherri"
BUILT="$REPO/shortcuts/Skwirl.shortcut"
OUT="${1:-$BUILT}"

[ "$#" -le 1 ] || { echo "usage: $0 [output.shortcut]" >&2; exit 1; }
[ ! -d "$OUT" ] || { echo "output must be a file path" >&2; exit 1; }

command -v cherri >/dev/null 2>&1 || { echo "cherri not installed — brew install cherri" >&2; exit 1; }

# Last non-empty wins: .env accumulates duplicate keys as it gets edited.
WORKER_URL=$(grep -E "^STASH_WORKER_URL=" "$REPO/.env" 2>/dev/null | cut -d= -f2- | grep -v '^$' | tail -1 || true)
[ -n "${WORKER_URL:-}" ] || { echo "STASH_WORKER_URL must be set in .env" >&2; exit 1; }
WORKER_URL=${WORKER_URL%/}

sed -e "s|{{WORKER_URL}}|$WORKER_URL|g" "$REPO/shortcuts/Stash.cherri.template" > "$RENDERED"
# cherri names its output after `#define name` and writes it next to the source
# (it ignores -o's directory), so build in place before handling a custom path.
cherri "$RENDERED" -s=anyone
if [ ! "$BUILT" -ef "$OUT" ]; then
  mv "$BUILT" "$OUT"
fi

echo
echo "built $OUT (opens $WORKER_URL in Safari)"
