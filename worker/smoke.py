"""Tenant-isolation + MCP smoke test for the Worker.

Run against a LOCAL worker only (it mints users and writes notes):

    cd worker && wrangler dev --local --port 8799 --var STASH_SECRET:adm
    .venv/bin/python worker/smoke.py
"""
import httpx, sys
B = "http://localhost:8799"; adm = {"X-Stash-Secret": "adm"}
c = httpx.Client(base_url=B)
def user(name):
    r = c.post("/admin/users", headers=adm, json={"name": name}); r.raise_for_status(); return r.json()
def h(u): return {"Authorization": f"Bearer {u['token']}"}
ann, bob = user("ann"), user("bob")
assert c.get("/v1/notes").status_code == 401
assert c.get("/v1/notes", headers={"Authorization": "Bearer nope"}).status_code == 401
assert c.get("/v1/notes", headers={"X-Stash-Secret": "adm"}).status_code == 401  # admin secret is not a user
url = {"url": "https://www.instagram.com/reel/AAA/"}
a = c.post("/v1/ingest", headers=h(ann), json=url); assert a.status_code == 202, a.text
b = c.post("/v1/ingest", headers=h(bob), json=url); assert b.status_code == 202, b.text  # same reel, other user
assert a.json()["id"] != b.json()["id"]
d = c.post("/v1/ingest", headers=h(ann), json=url); assert d.status_code == 200 and not d.json()["created"]
cl = c.post("/claim", headers=adm).json()["capture"]; assert cl["user_id"] == ann["id"], cl
note = {"capture_id": a.json()["id"], "user_id": ann["id"], "title": "Remotion animation tips",
        "summary": "how to animate", "topic": "tooling", "tools": ["remotion"],
        "markdown": "# Remotion\nspring easing, stagger"}
n1 = c.post("/note", headers=adm, json=note).json()["id"]
n2 = c.post("/note", headers=adm, json=note).json()["id"]; assert n1 == n2  # idempotent
assert len(c.get("/v1/notes", headers=h(ann)).json()["notes"]) == 1
assert len(c.get("/v1/search", headers=h(ann), params={"q": 'stagger weird("'}).json()["notes"]) == 1
assert len(c.get("/v1/search", headers=h(ann), params={"q": "remotion"}).json()["notes"]) == 1  # no dup after re-sink
assert c.get("/v1/search", headers=h(bob), params={"q": "stagger"}).json()["notes"] == []
assert c.get(f"/v1/notes/{n1}", headers=h(bob)).status_code == 404
assert c.post(f"/v1/notes/{n1}/used", headers=h(bob)).status_code == 404
assert c.post(f"/v1/notes/{n1}/used", headers=h(ann)).status_code == 200
assert c.get("/v1/notes", headers=h(ann), params={"status": "unused"}).json()["notes"] == []
assert c.get(f"/v1/status/{a.json()['id']}", headers=h(bob)).status_code == 404


# ---- owner (STASH_SECRET as bearer) + MCP ----
own = {"Authorization": "Bearer adm"}
o = c.post("/note", headers=adm, json={"capture_id": "own-1", "title": "Owner secret sauce", "summary": "s",
     "topic": "design", "tools": ["figma"], "markdown": "# owner\nunique-owner-word"}).json()["id"]
assert [n["id"] for n in c.get("/v1/search", headers=own, params={"q": "unique-owner-word"}).json()["notes"]] == [o]
assert c.get("/v1/search", headers=h(ann), params={"q": "unique-owner-word"}).json()["notes"] == []
def mcp(token, method, params=None, id=1):
    r = c.post(f"/mcp/{token}", json={"jsonrpc": "2.0", "id": id, "method": method, "params": params or {}}); return r
assert c.post("/mcp/wrong", json={}).status_code == 401
r = mcp(ann["token"], "initialize", {"protocolVersion": "2025-03-26"}); assert r.json()["result"]["serverInfo"]["name"] == "stash"
assert c.post(f"/mcp/{ann['token']}", json={"jsonrpc": "2.0", "method": "notifications/initialized"}).status_code == 202
assert len(mcp(ann["token"], "tools/list").json()["result"]["tools"]) == 5
def call(token, name, args): return mcp(token, "tools/call", {"name": name, "arguments": args}).json()["result"]["content"][0]["text"]
assert "Remotion animation tips" in call(ann["token"], "search_stash", {"query": "remotion stagger"})
assert "No matching" in call(bob["token"], "search_stash", {"query": "remotion"})
assert "unique-owner-word" in call("adm", "get_stash_note", {"note_id": o})
assert "No note matching" in call(ann["token"], "get_stash_note", {"note_id": o})
assert "design: 1" in call("adm", "list_stash_topics", {})
assert "Marked" in call("adm", "mark_stash_used", {"note_id": o})
assert "Owner secret sauce" in call("adm", "recent_stash", {})
assert c.get(f"/v1/notes/{n1}", headers=h(ann)).status_code == 200  # counts as an open
st = {u["name"]: u for u in c.get("/admin/stats", headers=adm).json()["users"]}
assert st["ann"]["saves"] == 1 and st["ann"]["notes"] == 1 and st["ann"]["opened"] == 1 and st["ann"]["mcp_calls"] == 2, st["ann"]
assert st["owner"]["notes"] == 1 and st["owner"]["used"] == 1, st["owner"]
assert c.get("/admin/stats").status_code == 401
# ---- setup, BYO key, export ----
import os
assert c.get("/v1/setup", headers=h(ann)).json() == {"owner": False, "saved_from": {"app": 1}, "claude_connected": True, "has_groq_key": False}, c.get("/v1/setup", headers=h(ann)).text
assert c.put("/v1/settings/groq", headers=h(ann), json={"key": "hello"}).status_code == 400           # bad shape
assert c.put("/v1/settings/groq", headers=h(ann), json={"key": "gsk_" + "a" * 40}).status_code == 400  # Groq rejects it
assert c.put("/v1/settings/groq", headers=own, json={"key": "gsk_" + "a" * 40}).status_code == 400     # owner has no per-user key
real = os.environ.get("GROQ_API_KEY")
if real:  # optional: full round trip with a real key (never printed)
    assert c.put("/v1/settings/groq", headers=h(ann), json={"key": real}).status_code == 200
    su = c.get("/v1/setup", headers=h(ann)); assert su.json()["has_groq_key"] and real not in su.text
    bbb = c.post("/v1/ingest", headers=h(ann), json={"url": "https://www.instagram.com/reel/BBB/", "source": "shortcut"}).json()["id"]
    cl2 = next(x for x in (c.post("/claim", headers=adm).json()["capture"] for _ in range(5)) if x and x["id"] == bbb)
    assert cl2["user_id"] == ann["id"] and cl2["groq_key"] == real and cl2["source"] == "shortcut"
    assert c.delete("/v1/settings/groq", headers=h(ann)).status_code == 200
    assert not c.get("/v1/setup", headers=h(ann)).json()["has_groq_key"]
ex = c.get("/v1/export", headers=h(ann)); assert ex.status_code == 200 and len(ex.json()["notes"]) == 1
assert "markdown" in ex.json()["notes"][0]
# ---- /join (start the dev server with --var JOIN_CODE:letmein) ----
j = c.post("/join", json={"name": "Zed", "code": "letmein"}); assert j.status_code == 201, j.text
zed = j.json()["token"]; assert c.get("/v1/notes", headers={"Authorization": f"Bearer {zed}"}).status_code == 200
assert c.post("/join", json={"name": "", "code": "letmein"}).status_code == 400
assert c.post("/join", json={"name": "X", "code": "nope"}).status_code == 403
for _ in range(10): r = c.post("/join", json={"name": "X", "code": "nope"})
assert r.status_code == 429, r.status_code                                   # throttled after repeated misses
assert c.post("/join", json={"name": "Zed2", "code": "letmein"}).status_code == 429  # even the right code, same IP
# ---- /claim?scope=guests never hands out the owner's captures ----
c.post("/ingest", headers=adm, json={"url": "https://www.instagram.com/reel/OWNER1/"})   # owner capture (user_id NULL)
got = [c.post("/claim?scope=guests", headers=adm).json()["capture"] for _ in range(20)]
assert all(x is None or x["user_id"] for x in got), "guests scope leaked an owner capture"
# ---- hardening ----
sec = user("sec"); hs = h(sec)
for bad in ["http://www.instagram.com/reel/x/", "https://192.168.1.1/a", "https://localhost:8799/x", "https://instagram.com.evil.com/x",
            "file:///etc/passwd", "https://user:pw@instagram.com/x", "https://instagram.com:8443/x", "javascript:alert(1)", "notaurl"]:
    r = c.post("/v1/ingest", headers=hs, json={"url": bad}); assert r.status_code == 400, (bad, r.status_code)
assert c.post("/v1/ingest", headers=hs, json={"url": "https://vm.tiktok.com/abc/"}).status_code == 202
assert c.post("/v1/ingest", headers=hs, json={"url": "https://youtu.be/abc", "note": "x" * 5000}).status_code == 202
for i in range(30):
    r = c.post("/v1/ingest", headers=hs, json={"url": f"https://www.instagram.com/reel/Q{i}/"})
    if r.status_code == 429: break
assert r.status_code == 429, "queue-flood brake missing"
assert c.get("/health").headers.get("x-content-type-options") in (None, "nosniff")
r = c.get("/v1/notes", headers=hs); assert r.headers["cache-control"] == "no-store" and r.headers["x-content-type-options"] == "nosniff"
# MCP never echoes internals
e = c.post(f"/mcp/{sec['token']}", json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "nope", "arguments": {}}}).json()
assert "unknown tool" not in str(e) and e["result"]["isError"]
# rotate: old token + old connector link die, new works; owner can't rotate
nt = c.post("/v1/token/rotate", headers=hs).json()["token"]
assert c.get("/v1/notes", headers=hs).status_code == 401 and c.post(f"/mcp/{sec['token']}", json={"jsonrpc":"2.0","id":1,"method":"ping"}).status_code == 401
assert c.get("/v1/notes", headers={"Authorization": f"Bearer {nt}"}).status_code == 200
assert c.post("/v1/token/rotate", headers=own).status_code == 400
# delete account: needs confirm, then all data gone; owner can't
hn = {"Authorization": f"Bearer {nt}"}
assert c.request("DELETE", "/v1/account", headers=hn, json={}).status_code == 400
assert c.request("DELETE", "/v1/account", headers=own, json={"confirm": "delete"}).status_code == 400
assert c.request("DELETE", "/v1/account", headers=hn, json={"confirm": "delete"}).status_code == 200
assert c.get("/v1/notes", headers=hn).status_code == 401
# admin revoke wipes a user
victim = user("victim"); vh = h(victim)
c.post("/v1/ingest", headers=vh, json={"url": "https://www.instagram.com/reel/VIC/"})
assert c.post(f"/admin/users/{victim['id']}/revoke", headers=adm).json() == {"ok": True}
assert c.get("/v1/notes", headers=vh).status_code == 401
assert c.post(f"/admin/users/{victim['id']}/revoke").status_code == 401
# ---- admin overview: owner only ----
ov = c.get("/v1/admin/overview", headers=own); assert ov.status_code == 200, ov.text
body = ov.json(); assert {"overview", "users"} <= body.keys() and any(u["name"] == "owner" for u in body["users"])
assert "own_key" in body["users"][0] and "waiting" in body["overview"]
assert c.get("/v1/admin/overview", headers=h(ann)).status_code == 404     # users can't even see it exists
assert c.get("/v1/admin/overview").status_code == 401
ann_row = next(u for u in body["users"] if u["name"] == "ann"); assert ann_row["last_seen"]
# ---- stale claims come back; fresh ones don't ----
sc = c.post("/ingest", headers=adm, json={"url": "https://www.instagram.com/reel/STALE1/"}).json()["id"]
def claim_ids(n=30): return [x["id"] for x in (c.post("/claim", headers=adm).json()["capture"] for _ in range(n)) if x]
assert sc in claim_ids()                    # claimed once
assert sc not in claim_ids()                # fresh claim is not handed out again
# ---- captures list (processing/failed) + retry/remove + friendly reasons ----
cu = user("capuser"); ch = h(cu)
c1 = c.post("/v1/ingest", headers=ch, json={"url": "https://www.instagram.com/reel/PROC1/"}).json()["id"]
lst = c.get("/v1/captures", headers=ch).json()["captures"]
assert [x["id"] for x in lst] == [c1] and lst[0]["state"] == "processing"
assert c1 not in [x["id"] for x in c.get("/v1/captures", headers=h(ann)).json()["captures"]]   # isolation
burned = 0
for _ in range(80):                                                                       # burn 3 attempts with a raw error
    got = c.post("/claim", headers=adm).json()["capture"]
    if got and got["id"] == c1:
        c.post("/complete", headers=adm, json={"id": c1, "ok": False, "error": "yt-dlp: ERROR: Instagram sent an empty media response. private?"})
        burned += 1
        if burned == 3: break
assert burned == 3
lst = c.get("/v1/captures", headers=ch).json()["captures"]
assert lst[0]["state"] == "failed" and "private or deleted" in lst[0]["reason"] and "yt-dlp" not in lst[0]["reason"]
assert c.post(f"/v1/captures/{c1}/retry", headers=h(ann)).status_code == 404               # can't retry someone else's
assert c.post(f"/v1/captures/{c1}/retry", headers=ch).status_code == 200
assert c.get("/v1/captures", headers=ch).json()["captures"][0]["state"] == "processing"
assert c.request("DELETE", f"/v1/captures/{c1}", headers=h(ann)).status_code == 404
assert c.request("DELETE", f"/v1/captures/{c1}", headers=ch).status_code == 200
assert c.get("/v1/captures", headers=ch).json()["captures"] == []
# ---- usage attribution ----
u1 = c.post("/v1/ingest", headers=ch, json={"url": "https://www.instagram.com/reel/USE1/"}).json()["id"]
c.post("/complete", headers=adm, json={"id": u1, "ok": True, "title": "t", "usage": [
    {"kind": "chat", "model": "m", "prompt_tokens": 1000, "completion_tokens": 500, "key_type": "shared"},
    {"kind": "whisper", "model": "w", "seconds": 30, "key_type": "own"}]})
ov = c.get("/v1/admin/overview", headers=own).json()
row = next(u for u in ov["users"] if u["name"] == "capuser")
assert row["groq_tokens_7d"] == 1500 and ov["overview"]["shared_tokens_24h"] >= 1500 and ov["overview"]["whisper_sec_24h"] >= 30
assert any(e["name"] == "capuser" and e["kind"] == "groq" for e in ov["recent"]) and any(e["action"] == "ingest" for e in ov["recent"])
assert row["api_calls_7d"] >= 2 and row["last_api"]
print("ALL OK")
