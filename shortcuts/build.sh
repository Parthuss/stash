#!/bin/sh
# Render Stash.cherri.template with the real Worker URL + secret from .env,
# compile it with cherri, and sign it so iOS will import it.
#
# The rendered .cherri and the compiled .shortcut both contain the shared
# secret, so both are gitignored — only the template is committed.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO/shortcuts"
RENDERED="$OUT_DIR/.Stash.rendered.cherri"

if ! command -v cherri >/dev/null 2>&1; then
  echo "cherri not installed — brew install cherri (or see cherrilang.org)" >&2
  exit 1
fi

# Last non-empty wins: .env accumulates duplicate keys as it gets edited, and
# taking every match would splice newlines into the sed pattern below.
env_value() {
  grep -E "^$1=" "$REPO/.env" 2>/dev/null | cut -d= -f2- | grep -v '^$' | tail -1 || true
}

WORKER_URL=$(env_value STASH_WORKER_URL)
SECRET=$(env_value STASH_SECRET)

if [ -z "${WORKER_URL:-}" ] || [ -z "${SECRET:-}" ]; then
  cat >&2 <<'MSG'
STASH_WORKER_URL and STASH_SECRET must both be set in .env first.

Deploy the Worker, then put its URL and the secret you set with
`wrangler secret put STASH_SECRET` into .env:

  cd worker
  npx wrangler login
  npx wrangler d1 create stash        # paste the id into wrangler.toml
  npx wrangler d1 migrations apply stash --remote
  npx wrangler secret put STASH_SECRET
  npx wrangler deploy
MSG
  exit 1
fi

WORKER_URL=${WORKER_URL%/}

sed -e "s|{{WORKER_URL}}|$WORKER_URL|g" -e "s|{{SECRET}}|$SECRET|g" \
  "$OUT_DIR/Stash.cherri.template" > "$RENDERED"

cherri "$RENDERED" -o "$OUT_DIR/Stash.shortcut"

echo
echo "built $OUT_DIR/Stash.shortcut  (points at $WORKER_URL)"
echo
echo "To install: AirDrop it to your iPhone, or open it on a Mac signed into"
echo "the same Apple ID and it syncs. Then DELETE every older Stash shortcut —"
echo "sharing to a stale one that points at a dead endpoint is how this broke before."
