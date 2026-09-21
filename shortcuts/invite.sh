#!/bin/sh
# Mint a pilot user and build their personal iOS Shortcut.
#   shortcuts/invite.sh ann
# Prints everything to send them: web library, MCP connector URL, Shortcut file.
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NAME=${1:?usage: invite.sh <name>}
env_value() { grep -E "^$1=" "$REPO/.env" | cut -d= -f2- | grep -v '^$' | tail -1; }
URL=$(env_value STASH_WORKER_URL); URL=${URL%/}
SECRET=$(env_value STASH_SECRET)

TOKEN=$(curl -fsS -X POST "$URL/admin/users" -H "X-Stash-Secret: $SECRET" \
  -H 'content-type: application/json' -d "{\"name\":\"$NAME\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

"$REPO/shortcuts/build.sh" "$TOKEN" "$NAME" >/dev/null
cat <<MSG

Invited $NAME. Send them (the token is shown once — it is not recoverable):

  Web library / Android:  $URL          sign in with:  $TOKEN
  Claude connector URL:   $URL/mcp/$TOKEN     (claude.ai → Settings → Connectors → Add custom)
  iPhone Shortcut:        $REPO/shortcuts/Stash-$NAME.shortcut   (AirDrop it)
MSG
