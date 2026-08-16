"""Writing the durable artifact.

Markdown on disk is the source of truth; the SQLite index is derived and can be
rebuilt from it with ``stash reindex``. That ordering is deliberate — the notes
should outlive this project, stay readable in any editor, and open in Obsidian
without a plugin.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from .config import CONFIG

FRONTMATTER_KEYS = [
    "title", "source", "url", "permalink_verified", "topic", "tools",
    "difficulty", "relevance", "status", "captured", "creator", "transcript_via",
]


def slugify(text: str, *, limit: int = 60) -> str:
    text = re.sub(r"[^\w\s-]", "", (text or "").lower()).strip()
    text = re.sub(r"[\s_]+", "-", text)
    return (text[:limit].rstrip("-")) or "untitled"


def note_path(title: str, when: date | None = None) -> Path:
    stamp = (when or date.today()).isoformat()
    base = f"{stamp}-{slugify(title)}"
    candidate = CONFIG.vault_dir / f"{base}.md"
    counter = 2
    while candidate.exists():
        candidate = CONFIG.vault_dir / f"{base}-{counter}.md"
        counter += 1
    return candidate


def render(
    fields: dict[str, Any],
    *,
    permalink: str | None,
    permalink_ok: bool,
    source: str,
    transcript_text: str,
    transcript_reason: str,
    transcript_via: str,
    creator: str = "",
    user_note: str | None = None,
    caption: str = "",
    frame_reasons: list[str] | None = None,
) -> str:
    front = {
        "title": fields.get("title", ""),
        "source": source,
        "url": permalink or "",
        "permalink_verified": bool(permalink_ok and permalink),
        "topic": fields.get("topic", "other"),
        "tools": fields.get("tools", []),
        "difficulty": fields.get("difficulty", ""),
        "relevance": fields.get("relevance", []),
        "status": "unused",
        "captured": date.today().isoformat(),
        "creator": creator,
        "transcript_via": transcript_via or transcript_reason or "none",
    }

    body = [
        "---",
        yaml.safe_dump(front, sort_keys=False, allow_unicode=True).strip(),
        "---",
        "",
        f"# {fields.get('title', 'Untitled')}",
        "",
        fields.get("summary", ""),
        "",
        "## Next step",
        "",
        fields.get("next_step", ""),
        "",
        "## Why you probably saved this",
        "",
        fields.get("why_saved", ""),
    ]

    if user_note:
        body += ["", "## Your note at capture", "", f"> {user_note}"]

    if caption:
        body += ["", "## Caption", "", "> " + caption.strip().replace("\n", "\n> ")]

    if fields.get("frame_notes"):
        body += ["", "## On screen", "", fields["frame_notes"]]
        if frame_reasons:
            body += ["", "<sub>frames chosen: " + "; ".join(frame_reasons) + "</sub>"]

    body += ["", "## Transcript", ""]
    body.append(transcript_text.strip() or f"*(none — {transcript_reason or 'unavailable'})*")

    if permalink and not permalink_ok:
        body += [
            "", "---",
            "",
            "<sub>URL reconstructed from a media id rather than received directly — "
            "may not resolve.</sub>",
        ]

    return "\n".join(body).rstrip() + "\n"


def write(content: str, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def read_frontmatter(path: Path) -> dict[str, Any]:
    """Parse a note back out of the vault. Used by ``stash reindex``."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {}
    _, _, rest = text.partition("---\n")
    raw, _, body = rest.partition("\n---")
    try:
        front = yaml.safe_load(raw) or {}
    except yaml.YAMLError:
        return {}
    front["_body"] = body.strip()
    return front


def extract_section(body: str, heading: str) -> str:
    """Pull one ``## Heading`` section out of a rendered note."""
    pattern = re.compile(
        rf"^##\s+{re.escape(heading)}\s*$(.*?)(?=^##\s|\Z)", re.MULTILINE | re.DOTALL
    )
    match = pattern.search(body)
    return match.group(1).strip() if match else ""
