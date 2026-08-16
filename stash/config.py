"""Runtime configuration, resolved once from the environment.

Everything is optional. With nothing configured at all the pipeline still runs
end-to-end locally: yt-dlp lifts cookies from your browser, transcription falls
back to whatever backend is available, and the queue lives in a local SQLite
file rather than in D1. Configuration only ever *adds* capability.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env reader. Real environment always wins over the file."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip("'\"")
        if key and value and key not in os.environ:
            os.environ[key] = value


_load_dotenv(ROOT / ".env")


def _local_receiver_secret() -> str:
    """Read the LAN receiver token without putting it in the shared .env file."""
    value = os.environ.get("STASH_LOCAL_SECRET", "")
    if value:
        return value
    path = ROOT / ".stash-local-secret"
    return path.read_text().strip() if path.exists() else ""


@dataclass(frozen=True)
class Config:
    #: Where downloaded video/audio lands. Content-addressed, safe to delete.
    media_dir: Path = ROOT / "media"
    #: The markdown vault. This is the durable artifact.
    vault_dir: Path = ROOT / "vault"
    #: Queue + search index.
    db_path: Path = ROOT / "stash.sqlite"

    groq_api_key: str = os.environ.get("GROQ_API_KEY", "")

    #: A Netscape-format cookies.txt scoped to instagram.com. Preferred over
    #: `cookies_from_browser`: reading Chrome's jar directly needs the "Chrome
    #: Safe Storage" keychain key, which decrypts cookies for *every* site you
    #: are signed into, not just Instagram. A background worker running
    #: unattended for months should not hold standing permission for that.
    cookies_file: str = os.environ.get("STASH_COOKIES_FILE", "")

    cookies_from_browser: str = os.environ.get("STASH_COOKIES_FROM_BROWSER", "")
    cobalt_url: str = os.environ.get("STASH_COBALT_URL", "")

    worker_url: str = os.environ.get("STASH_WORKER_URL", "").rstrip("/")
    worker_secret: str = os.environ.get("STASH_SECRET", "")

    #: Private LAN receiver used by the iPhone Shortcut.
    local_secret: str = _local_receiver_secret()
    local_port: int = int(os.environ.get("STASH_LOCAL_PORT", "8765"))

    #: Append-only drop file the phone Shortcut writes to, synced by iCloud.
    #: The zero-infrastructure capture path: no account, no deploy, no public
    #: endpoint. `stash watch` re-reads the whole file each tick and relies on
    #: the queue's permalink dedupe, so nothing is ever lost to a truncate race
    #: and the file doubles as a plain-text log of what you saved.
    inbox: Path = Path(
        os.environ.get(
            "STASH_INBOX",
            str(
                Path.home()
                / "Library/Mobile Documents/com~apple~CloudDocs/Shortcuts/stash-inbox.txt"
            ),
        )
    ).expanduser()

    #: Vision + structured extraction model. It supports images and JSON mode.
    extract_model: str = os.environ.get("STASH_EXTRACT_MODEL", "qwen/qwen3.6-27b")

    #: Where `stash daemon` writes its heartbeat (pid, last poll, last result).
    #: `stash doctor` reads this to answer "is it actually running?" — the
    #: question that mattered the night the LAN receiver silently wasn't.
    daemon_state_path: Path = ROOT / ".stash-daemon-state.json"

    #: How the phone learns a save finished: imessage | ntfy | none.
    #: `imessage` needs no app install but does need a one-time Automation
    #: grant; `ntfy` needs the free app but no permissions. Whichever is set,
    #: the other is tried as a fallback — see stash/notify.py.
    notify_backend: str = os.environ.get("STASH_NOTIFY", "none")
    #: Phone number or Apple ID to iMessage. Yours — this notifies you, not anyone else.
    notify_imessage_to: str = os.environ.get("STASH_NOTIFY_IMESSAGE_TO", "")
    #: ntfy topics on the public server are unauthenticated, so this string is
    #: effectively the credential. Make it long and random.
    ntfy_topic: str = os.environ.get("STASH_NTFY_TOPIC", "")
    ntfy_server: str = os.environ.get("STASH_NTFY_SERVER", "https://ntfy.sh")

    def ensure_dirs(self) -> None:
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self.vault_dir.mkdir(parents=True, exist_ok=True)

    @property
    def uses_remote_queue(self) -> bool:
        return bool(self.worker_url and self.worker_secret)


CONFIG = Config()
