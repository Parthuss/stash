#!/bin/sh
# Deploy the Worker. Uses wrangler.local.toml (the real database id, gitignored)
# when it exists, so wrangler.toml can stay a template for anyone forking this.
#   ./deploy.sh              deploy
#   ./deploy.sh migrate      apply every migration to the remote D1 first (safe to repeat? no: ALTERs
#                            fail on re-run, so this applies only the file(s) you name after it)
set -eu
cd "$(dirname "$0")"
CONFIG=wrangler.toml; [ -f wrangler.local.toml ] && CONFIG=wrangler.local.toml
if [ "${1:-}" = "migrate" ]; then
  shift
  for f in "$@"; do npx wrangler d1 execute stash --remote -c "$CONFIG" --file "$f"; done
fi
npx wrangler deploy -c "$CONFIG"
