"""Small authenticated HTTP receiver for the iPhone Shortcut on the local network."""

from __future__ import annotations

import hmac
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from . import db, pipeline

MAX_BODY_BYTES = 16_384


def parse_capture(body: bytes) -> tuple[str, str | None]:
    """Validate a Shortcut JSON payload before it enters the queue."""
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("body must be JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("body must be a JSON object")

    url = payload.get("url")
    if not isinstance(url, str) or urlparse(url.strip()).scheme not in {"http", "https"}:
        raise ValueError("url must be an http(s) link")
    note = payload.get("note")
    if note is not None and not isinstance(note, str):
        raise ValueError("note must be text")
    return url.strip(), note.strip()[:2_000] if note else None


def serve(db_path, secret: str, port: int) -> None:
    """Run until interrupted. Each accepted capture is processed in the background."""

    class Receiver(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                self._send(200, {"ok": True})
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/ingest":
                self._send(404, {"error": "not found"})
                return
            if not hmac.compare_digest(self.headers.get("X-Stash-Secret", ""), secret):
                self._send(401, {"error": "unauthorized"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BODY_BYTES:
                    raise ValueError("invalid request size")
                url, note = parse_capture(self.rfile.read(size))
            except ValueError as exc:
                self._send(400, {"error": str(exc)})
                return

            conn = db.connect(db_path)
            try:
                capture_id, created = db.add_capture(
                    conn, source="shortcut", permalink=url, note=note
                )
            finally:
                conn.close()
            if created:
                threading.Thread(target=_process_one, args=(db_path,), daemon=True).start()
            self._send(201 if created else 200, {"queued": created, "id": capture_id})

        def _send(self, status: int, payload: dict) -> None:
            encoded = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

    server = ThreadingHTTPServer(("0.0.0.0", port), Receiver)
    print(f"Stash receiver listening on http://Parths-MacBook-Air.local:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def _process_one(db_path) -> None:
    conn = db.connect(db_path)
    try:
        pipeline.drain(conn, limit=1, verbose=True)
    finally:
        conn.close()
