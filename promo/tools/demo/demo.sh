#!/bin/sh
# Fresh local Skwirl with the demo account "Maya", for screenshots and screen recordings.
#   promo/tools/demo/demo.sh          -> worker on http://localhost:8799, token in promo/tools/demo/.demotok
# Stop it with: pkill -f "wrangler dev"
set -eu
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../../.." && pwd)
cd "$ROOT/worker"
CONFIG=wrangler.toml; [ -f wrangler.local.toml ] && CONFIG=wrangler.local.toml
pkill -f "wrangler dev" 2>/dev/null || true; sleep 1
rm -rf .wrangler/demo
for f in migrations/*.sql; do npx wrangler d1 execute stash --local -c "$CONFIG" --persist-to .wrangler/demo --file "$f" >/dev/null 2>&1; done
(npx wrangler dev -c "$CONFIG" --local --persist-to .wrangler/demo --port 8799 --var STASH_SECRET:adm --var OPEN_JOIN:1 > "$HERE/.dev.log" 2>&1 &)
i=0; until curl -s localhost:8799/health >/dev/null; do i=$((i+1)); [ $i -gt 60 ] && { echo "worker didn't start, see $HERE/.dev.log"; exit 1; }; sleep 1; done
"$ROOT/.venv/bin/python" "$HERE/seed.py" > "$HERE/.demotok"
echo "Demo ready at http://localhost:8799 (token in $HERE/.demotok)"
