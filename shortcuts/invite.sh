#!/bin/sh
# Mint a pilot user. The Shortcut is generic (worker/public/Stash.shortcut) and asks
# for the token on install, so all an invite needs is the token and the link.
#   shortcuts/invite.sh ann
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NAME=${1:?usage: invite.sh <name>}
env_value() { grep -E "^$1=" "$REPO/.env" | cut -d= -f2- | grep -v '^$' | tail -1; }
URL=$(env_value STASH_WORKER_URL); URL=${URL%/}
SECRET=$(env_value STASH_SECRET)

TOKEN=$(curl -fsS -X POST "$URL/admin/users" -H "X-Stash-Secret: $SECRET" \
  -H 'content-type: application/json' -d "{\"name\":\"$NAME\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

cat <<MSG

Invited $NAME. Send them this (the token is shown once — it is not recoverable):

  1. Open  $URL  and paste this token:  $TOKEN
  2. Tap "Set up" inside the app — it walks them through the iPhone Shortcut,
     connecting Claude, and (optionally) their own Groq key.
MSG
