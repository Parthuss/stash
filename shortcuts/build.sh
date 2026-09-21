#!/bin/sh
# Build the ONE generic Stash iOS Shortcut and put it where the Worker serves it
# (worker/public/Stash.shortcut, deployed at <worker>/Stash.shortcut).
#
# It holds no secret: iOS asks for the user's token when they add it. Signed with
# `-s=anyone` so it imports on any iPhone. Needs macOS + `brew install cherri`.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
RENDERED="$REPO/shortcuts/.Stash.rendered.cherri"
OUT="$REPO/worker/public/Stash.shortcut"

command -v cherri >/dev/null 2>&1 || { echo "cherri not installed — brew install cherri" >&2; exit 1; }

# Last non-empty wins: .env accumulates duplicate keys as it gets edited.
WORKER_URL=$(grep -E "^STASH_WORKER_URL=" "$REPO/.env" 2>/dev/null | cut -d= -f2- | grep -v '^$' | tail -1 || true)
[ -n "${WORKER_URL:-}" ] || { echo "STASH_WORKER_URL must be set in .env" >&2; exit 1; }
WORKER_URL=${WORKER_URL%/}

sed -e "s|{{WORKER_URL}}|$WORKER_URL|g" "$REPO/shortcuts/Stash.cherri.template" > "$RENDERED"
# cherri names its output after `#define name` and writes it next to the source
# (it ignores -o's directory), so build in place, then move it into the Worker's assets.
cherri "$RENDERED" -s=anyone
mv "$REPO/shortcuts/Stash.shortcut" "$OUT"

echo
echo "built $OUT  (points at $WORKER_URL, no secret inside)"
echo "Deploy the Worker to publish it at $WORKER_URL/Stash.shortcut"
