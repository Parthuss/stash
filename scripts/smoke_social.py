#!/usr/bin/env python3
"""One live denial smoke per source/type; deletes the throwaway user in finally.

Usage: python scripts/smoke_social.py /path/to/.env output.json
This deliberately cannot attest to source/media success while access is disabled.
No platform credentials are used. Skwirl admin credentials stay in memory.
"""
import dataclasses
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stash import config, fetch, pipeline, remote
from stash.fetch import FetchError

POSTS = [
    ("Reddit", "text", "https://www.reddit.com/r/learnpython/comments/1vwda97/new_to_programming_what_do_you_learn/"),
    ("Reddit", "video", "https://www.reddit.com/r/aww/comments/90bu6w/heat_index_was_110_degrees_so_we_offered_him_a/"),
    ("LinkedIn", "text+image", "https://www.linkedin.com/posts/github_at-github-universe-we-announced-github-as-activity-7393712835454889984-RLfD"),
    ("LinkedIn", "video", "https://www.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7"),
]


def main():
    config._load_dotenv(Path(sys.argv[1]))
    if any(os.environ.get("STASH_" + source.upper() + "_PUBLIC_ACCESS") == "approved" for source in ("Reddit", "LinkedIn")):
        raise SystemExit("This is a denial smoke; do not run with platform access enabled.")
    output = Path(sys.argv[2])
    cfg = dataclasses.replace(config.CONFIG, worker_url=os.environ["STASH_WORKER_URL"].rstrip("/"), worker_secret=os.environ["STASH_SECRET"])
    report = {"at": datetime.now(timezone.utc).isoformat(), "worker": cfg.worker_url, "source_network_calls": 0, "notes_created": 0, "checks": [], "account_deleted": False}
    with tempfile.TemporaryDirectory(prefix="skwirl-social-smoke-") as tmp, httpx.Client(timeout=45) as client:
        cfg = dataclasses.replace(cfg, media_dir=Path(tmp) / "media", vault_dir=Path(tmp) / "vault")
        pipeline.CONFIG = fetch.CONFIG = remote.CONFIG = cfg
        admin_headers = {"X-Stash-Secret": cfg.worker_secret}
        response = client.post(cfg.worker_url + "/admin/users", headers=admin_headers, json={"name": "Social denial smoke (delete)"})
        response.raise_for_status()
        user = response.json()
        user_headers = {"Authorization": "Bearer " + user["token"]}
        try:
            for source, kind, url in POSTS:
                response = client.post(cfg.worker_url + "/v1/ingest", headers=user_headers, json={"url": url, "source": "web"})
                response_body = response.json()
                assert response.status_code == 422, (source, response.status_code)
                row = remote.Row(id="not-queued-smoke", user_id=user["id"], permalink=url, permalink_ok=1, media_url=None, caption="", note=None, source="web")
                try:
                    with config.guest_run(True):
                        pipeline.process(sqlite3.connect(":memory:"), row, verbose=False)
                except FetchError as exc:
                    assert source in str(exc) and "approval" in str(exc)
                    reason = str(exc)
                else:
                    raise AssertionError("Denied source unexpectedly created a note")
                report["checks"].append({"source": source, "kind": kind, "url": url, "ingest_status": response.status_code, "ingest_error": response_body.get("error"), "pipeline": reason, "result": "permission-denied; source fetch and note quality untested"})
            status = client.get(cfg.worker_url + "/v1/me", headers=user_headers)
            status.raise_for_status()
            report["account_counts"] = {key: value for key, value in status.json().items() if key in ("saves", "notes", "pending", "done", "failed")}
        finally:
            deleted = client.request("DELETE", cfg.worker_url + "/v1/account", headers=user_headers, json={"confirm": "delete"})
            deleted.raise_for_status()
            unauthorized = client.get(cfg.worker_url + "/v1/me", headers=user_headers)
            report["account_deleted"] = unauthorized.status_code == 401
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(report, indent=2) + "\n")
            assert report["account_deleted"], "Deleted account token still accepted"
    print(json.dumps({"checks": len(report["checks"]), "account_deleted": report["account_deleted"], "notes_created": 0, "report": str(output)}))


if __name__ == "__main__":
    main()
