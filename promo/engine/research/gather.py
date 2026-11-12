#!/usr/bin/env python3
"""Collect this week's research inputs into one markdown file for the research task to think over.

  python promo/engine/research/gather.py [--out FILE]

Sources (each optional; a missing key just skips that section and says so):
  1. Parth's own saves (local stash vault via `python -m stash search --json`): content, marketing, hooks.
  2. Our own post performance (ENGINE_HOME/performance.json, written by `content_engine pull-perf`).
  3. What's already been made (CONTENT_HANDBOOK section 2 + every promo/out/week-*/README.md), so ideas don't repeat.
  4. YouTube Shorts doing well in the niche right now (YT_API_KEY, search.list: 100 units a query).
  5. Reddit questions (REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET, app-only read access). Reading only: Reddit
     posting and commenting stay by hand, never automated.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

MAIN = Path(os.environ.get("STASH_MAIN", Path.home() / "Work/Experiment/stash"))
ENGINE_HOME = Path(os.environ.get("ENGINE_HOME", MAIN / "promo/out/engine"))
UA = "skwirl-content-research/0.1"

SAVE_QUERIES = [
    "instagram reel hook content ideas", "short form video hooks", "content strategy posting",
    "carousel design storytelling", "viral marketing launch", "first users distribution",
    "saved reels organize", "ai tools productivity", "claude code tips",
]
SHORTS_QUERIES = [
    "instagram saved posts hack", "organize saved reels", "second brain notes app", "claude code tips",
    "recipe from reel", "travel planning saved reels", "teacher resources instagram", "productivity app shorts",
]
REDDIT_QUERIES = [
    "find a reel I saved", "organize instagram saved posts", "too many saved posts instagram",
    "save recipes from instagram reels", "search saved reels", "export instagram saved posts",
    "instagram saved collections", "reels to notes",
]


def saves_cli() -> str:
    py = MAIN / ".venv/bin/python"
    seen, out = set(), []
    for q in SAVE_QUERIES:
        try:
            r = subprocess.run([str(py), "-m", "stash", "search", *q.split(), "--limit", "6", "--json"],
                               cwd=MAIN, capture_output=True, text=True, timeout=120)
            items = json.loads(r.stdout or "[]")
        except Exception as e:  # vault missing / not on the Mac
            return f"_skipped: stash vault not readable ({type(e).__name__})_"
        for it in items if isinstance(items, list) else items.get("results", []):
            key = it.get("path") or it.get("title")
            if key in seen:
                continue
            seen.add(key)
            out.append(f"- **{it.get('title', '?')}** ({it.get('topic', '')}, {str(it.get('path', ''))[:10]}): "
                       f"{(it.get('summary') or '')[:240]}")
    return "\n".join(out) or "_no matching saves_"


async def saves_mcp() -> str:
    """Use the same local MCP surface as the connected stash tool, read-only.

    MCP isn't exposed as a connected tool in every runner. Starting its stdio
    server preserves its retrieval contract without needing an account token.
    """
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    params = StdioServerParameters(command=str(MAIN / ".venv/bin/python"),
                                  args=["-m", "stash.mcp_server"], cwd=str(MAIN))
    chunks = []
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            for query in SAVE_QUERIES:
                result = await session.call_tool("search_stash", {"query": query, "limit": 5})
                if getattr(result, "is_error", getattr(result, "isError", False)):
                    raise RuntimeError("stash MCP search failed")
                chunks.append(f"### {query}\n" + "\n".join(getattr(c, "text", "") for c in result.content))
    return "\n\n".join(chunks)


def saves() -> str:
    try:
        return asyncio.run(saves_mcp())
    except Exception:
        return "_MCP unavailable; local CLI fallback._\n\n" + saves_cli()


def performance() -> str:
    p = ENGINE_HOME / "performance.json"
    if not p.exists():
        return "_no posts measured yet (Instagram/YouTube not connected, or nothing posted through the engine)_"
    perf = json.loads(p.read_text())
    rows = ["| post | kind | hook | IG reach | IG shares/reach | IG saves/reach | skip rate | YT views |", "|" + "---|" * 8]
    for r in perf.get("posts", []):
        ig = r.get("instagram") or {}
        m = ig.get("d7") or ig.get("h48") or {}
        yt = (r.get("youtube") or {})
        ym = yt.get("d7") or yt.get("h48") or {}
        rows.append(f"| {r['id']} | {r['kind']} | {(r.get('hook') or '')[:60]} | {m.get('reach', '')} | "
                    f"{ig.get('shares_per_reach', '')} | {ig.get('saves_per_reach', '')} | {m.get('reels_skip_rate', '')} | "
                    f"{ym.get('viewCount', '')} |")
    return "\n".join(rows)


def made() -> str:
    out = []
    hb = MAIN / "promo/CONTENT_HANDBOOK.md"
    if hb.exists():
        m = re.search(r"## 2\. What's been made and posted(.*?)\n## 3", hb.read_text(), re.S)
        if m:
            out.append(m.group(1).strip())
    for readme in sorted(MAIN.glob("promo/out/week-*/README.md")) + sorted(MAIN.glob(".crew/wt/*/promo/out/week-*/README.md")):
        rows = [l for l in readme.read_text().splitlines() if l.startswith("| ") and "`" in l]
        if rows:
            out.append(f"From {readme.parent.name}:\n" + "\n".join(rows))
    return "\n\n".join(out) or "_nothing found_"


def shorts() -> str:
    key = os.environ.get("YT_API_KEY")
    if not key:
        return "_skipped: set YT_API_KEY (a plain API key, read-only) to see top Shorts per niche query_"
    after = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = []
    with httpx.Client(timeout=30) as c:
        for q in SHORTS_QUERIES:
            s = c.get("https://www.googleapis.com/youtube/v3/search", params={
                "part": "snippet", "q": q, "type": "video", "videoDuration": "short", "order": "viewCount",
                "publishedAfter": after, "maxResults": 8, "key": key}).json()
            ids = [i["id"]["videoId"] for i in s.get("items", [])]
            if not ids:
                continue
            v = c.get("https://www.googleapis.com/youtube/v3/videos",
                      params={"part": "statistics,snippet", "id": ",".join(ids), "key": key}).json()
            out.append(f"**{q}** (last 30 days, by views)")
            for it in v.get("items", []):
                out.append(f"- {int(it['statistics'].get('viewCount', 0)):,} views: {it['snippet']['title'][:90]} "
                           f"(https://youtube.com/shorts/{it['id']})")
    return "\n".join(out) or "_no results_"


def reddit() -> str:
    cid, sec = os.environ.get("REDDIT_CLIENT_ID"), os.environ.get("REDDIT_CLIENT_SECRET")
    if not (cid and sec):
        return ("_skipped: Reddit blocks anonymous reads. Set REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET (a free 'script' "
                "app, read-only) to pull real questions._")
    with httpx.Client(timeout=30, headers={"User-Agent": UA}) as c:
        tok = c.post("https://www.reddit.com/api/v1/access_token", auth=(cid, sec),
                     data={"grant_type": "client_credentials"}).json()["access_token"]
        c.headers["Authorization"] = f"Bearer {tok}"
        seen, out = set(), []
        for q in REDDIT_QUERIES:
            d = c.get("https://oauth.reddit.com/search", params={"q": q, "sort": "relevance", "t": "year", "limit": 8}).json()
            for ch in d.get("data", {}).get("children", []):
                p = ch["data"]
                if p["id"] in seen:
                    continue
                seen.add(p["id"])
                out.append(f"- r/{p['subreddit']}: \"{p['title'][:120]}\" ({p['num_comments']} comments) "
                           f"https://www.reddit.com{p['permalink']}")
    return "\n".join(out) or "_no results_"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    today = datetime.now().date().isoformat()
    out = a.out or ENGINE_HOME / "inputs" / f"{today}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    sections = [("Parth's saves about content and growth", saves), ("Our post performance", performance),
                ("Already made (don't repeat)", made), ("Top Shorts in the niche, last 30 days", shorts),
                ("Reddit questions", reddit)]
    parts = [f"# Research inputs, {today}\n"]
    for title, fn in sections:
        try:
            body = fn()
        except Exception as e:
            body = f"_failed: {type(e).__name__}: {str(e)[:200]}_"
        parts.append(f"## {title}\n\n{body}\n")
    out.write_text("\n".join(parts))
    print(out)


if __name__ == "__main__":
    main()
