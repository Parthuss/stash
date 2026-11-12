#!/usr/bin/env python3
"""Connect the content engine's accounts without pasting a secret anywhere but your own terminal.

  python connect.py telegram      bot token (hidden prompt) + your chat id (send /start to the bot)
  python connect.py instagram     long-lived token from the Meta dashboard (hidden prompt); finds IG_USER_ID
  python connect.py youtube       browser sign-in (loopback OAuth, PKCE); stores the refresh token
  python connect.py r2            R2 account id, bucket, S3 key pair (hidden prompt); checks write + presign
  python connect.py push-secrets  copies everything to GitHub Actions secrets with `gh secret set` (stdin)
  python connect.py status        which keys are set (names only, never values)

Everything lands in ~/.config/skwirl-engine/env (chmod 600). Nothing is printed, logged or sent to Claude.
"""
from __future__ import annotations

import base64
import getpass
import hashlib
import http.server
import os
import secrets
import subprocess
import sys
import threading
import urllib.parse
import webbrowser
from pathlib import Path

import httpx

ENV = Path.home() / ".config/skwirl-engine/env"
SECRET_NAMES = ["IG_USER_ID", "IG_ACCESS_TOKEN", "YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN",
                "TG_ENGINE_BOT_TOKEN", "TG_OWNER_CHAT_ID", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID",
                "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]


def read_env() -> dict[str, str]:
    out = {}
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip("'\"")
    return out


def write_env(**kv: str) -> None:
    env = read_env()
    env.update({k: v for k, v in kv.items() if v})
    ENV.parent.mkdir(parents=True, exist_ok=True)
    ENV.touch(mode=0o600)
    os.chmod(ENV, 0o600)
    ENV.write_text("".join(f"{k}='{v}'\n" for k, v in sorted(env.items())))
    print(f"saved {', '.join(k for k, v in kv.items() if v)} to {ENV}")


def telegram() -> None:
    print("1. In Telegram, open @BotFather, send /newbot, name it e.g. 'Skwirl Posts', copy the token.")
    token = getpass.getpass("Bot token (hidden): ").strip()
    me = httpx.get(f"https://api.telegram.org/bot{token}/getMe", timeout=20).json()
    if not me.get("ok"):
        sys.exit("That token didn't work.")
    print(f"2. Open t.me/{me['result']['username']} and send it /start, then press Enter here.")
    input()
    ups = httpx.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=20).json().get("result", [])
    chats = [u["message"]["chat"]["id"] for u in ups if "message" in u]
    if not chats:
        sys.exit("No message seen yet. Send /start to the bot and run this again.")
    write_env(TG_ENGINE_BOT_TOKEN=token, TG_OWNER_CHAT_ID=str(chats[-1]))
    httpx.post(f"https://api.telegram.org/bot{token}/sendMessage",
               json={"chat_id": chats[-1], "text": "Connected. Posts to approve will show up here."}, timeout=20)


def instagram() -> None:
    print("Meta app dashboard > Instagram > API setup with Instagram login > Generate access tokens > your account.")
    token = getpass.getpass("Instagram access token (hidden): ").strip()
    r = httpx.get("https://graph.instagram.com/me", params={"fields": "user_id,username,account_type",
                                                            "access_token": token}, timeout=20)
    if r.status_code != 200:
        sys.exit(f"Instagram said {r.status_code}. Generate the token again.")
    me = r.json()
    write_env(IG_ACCESS_TOKEN=token, IG_USER_ID=str(me.get("user_id") or me.get("id")))
    print(f"connected @{me.get('username')} ({me.get('account_type')})")


def youtube() -> None:
    env = read_env()
    cid = env.get("YT_CLIENT_ID") or input("OAuth client ID (Desktop app): ").strip()
    secret = env.get("YT_CLIENT_SECRET") or getpass.getpass("OAuth client secret (hidden): ").strip()
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    got: dict[str, str] = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query))
            if q.get("state") == state:
                got.update(q)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Done. You can close this tab.")

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    redirect = f"http://127.0.0.1:{srv.server_port}/"
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": redirect, "response_type": "code", "access_type": "offline",
        "prompt": "consent", "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
        "scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"})
    print("Opening Google sign-in. Pick the Skwirl YouTube channel's account.")
    webbrowser.open(url)
    t = threading.Thread(target=srv.handle_request)
    t.start()
    t.join(timeout=300)
    if "code" not in got:
        sys.exit("No sign-in came back (5 min timeout).")
    tok = httpx.post("https://oauth2.googleapis.com/token", data={
        "client_id": cid, "client_secret": secret, "code": got["code"], "code_verifier": verifier,
        "grant_type": "authorization_code", "redirect_uri": redirect}, timeout=30).json()
    if "refresh_token" not in tok:
        sys.exit("Google returned no refresh token. Remove the app at myaccount.google.com/permissions and retry.")
    ch = httpx.get("https://www.googleapis.com/youtube/v3/channels", params={"part": "snippet", "mine": "true"},
                   headers={"Authorization": f"Bearer {tok['access_token']}"}, timeout=30).json()
    name = ((ch.get("items") or [{}])[0].get("snippet") or {}).get("title", "?")
    write_env(YT_CLIENT_ID=cid, YT_CLIENT_SECRET=secret, YT_REFRESH_TOKEN=tok["refresh_token"])
    print(f"connected YouTube channel: {name}")


def r2() -> None:
    acct = input("Cloudflare account ID: ").strip()
    bucket = input("Bucket name [skwirl-content]: ").strip() or "skwirl-content"
    key = input("R2 Access Key ID: ").strip()
    sec = getpass.getpass("R2 Secret Access Key (hidden): ").strip()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from content_engine.store import R2Store

    s = R2Store(acct, key, sec, bucket)
    s.put_json("state/connect-check.json", {"ok": True})
    url = s.media_url("state/connect-check.json", 120)
    ok = httpx.get(url, timeout=20).status_code == 200
    print("R2 write + presigned read OK" if ok else "R2 write worked but the presigned URL didn't load")
    write_env(R2_ACCOUNT_ID=acct, R2_BUCKET=bucket, R2_ACCESS_KEY_ID=key, R2_SECRET_ACCESS_KEY=sec)


def push_secrets() -> None:
    env = read_env()
    repo_root = Path(__file__).resolve().parents[3]
    for name in SECRET_NAMES:
        if env.get(name):
            subprocess.run(["gh", "secret", "set", name], input=env[name], text=True, check=True, cwd=repo_root)
            print(f"set {name}")
        else:
            print(f"skipped {name} (not connected yet)")


def status() -> None:
    env = read_env()
    for n in SECRET_NAMES:
        print(f"{'set    ' if env.get(n) else 'missing'}  {n}")


if __name__ == "__main__":
    cmds = {"telegram": telegram, "instagram": instagram, "youtube": youtube, "r2": r2,
            "push-secrets": push_secrets, "status": status}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(__doc__)
        sys.exit(2)
    cmds[sys.argv[1]]()
