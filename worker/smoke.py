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
print("ALL OK")
