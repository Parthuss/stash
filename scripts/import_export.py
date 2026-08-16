#!/usr/bin/env python3
"""Import an Instagram data export into the queue.

This is the only route to your existing Saved collection. No Instagram API has
ever exposed saved posts and none is going to, so the official data export is
it.

  Instagram -> Accounts Center -> Your information and permissions
            -> Export your information -> Create export -> Download to device
            -> Format: JSON

Request it early: Meta takes anywhere from a few hours to a couple of days.

Then, from the unzipped export directory:

    python scripts/import_export.py ~/Downloads/instagram-export --dry-run
    python scripts/import_export.py ~/Downloads/instagram-export

Throttling is not optional. A few hundred permalinks pushed through yt-dlp
back-to-back is the fastest way to get your session rate-limited, which breaks
the live capture path too. The default is deliberately slow; run it overnight.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from stash import db  # noqa: E402
from stash.config import CONFIG  # noqa: E402

#: Meta has moved these around between export versions, so match on shape
#: rather than trusting one path.
CANDIDATES = [
    "saved_posts.json",
    "saved_collections.json",
    "your_instagram_activity/saved/saved_posts.json",
    "your_instagram_activity/saved/saved_collections.json",
    "saved/saved_posts.json",
    "saved/saved_collections.json",
]


def find_files(root: Path) -> list[Path]:
    found = [root / name for name in CANDIDATES if (root / name).exists()]
    if not found:
        # Fall back to a scan; export layouts drift between versions.
        found = [p for p in root.rglob("saved*.json") if p.is_file()]
    return found


#: A saved item is a post, reel, or IGTV permalink — nothing else.
#:
#: Entries also embed the creator's profile URL and whatever they put in their
#: bio (a YouTube channel, a personal site). Those are attributes *of* the post,
#: not things that were saved, and taking them pushed a 1,234-item export up to
#: 2,136 "saves". Anchored so a bio link that merely mentions instagram.com
#: cannot slip through.
POST_URL = re.compile(
    r"^https?://(?:www\.)?instagram\.com/(?:p|reel|reels|tv)/[\w-]+", re.IGNORECASE
)


@dataclass
class Saved:
    url: str
    caption: str = ""
    collection: str = ""


def demojibake(text: str) -> str:
    """Undo Meta's UTF-8-written-as-latin-1 mangling.

    The export stores captions with each UTF-8 byte re-encoded as a separate
    latin-1 character, so a curly apostrophe arrives as ``â`` and an emoji as
    a run of four. Measured on the real download: 95 of 154 captions affected.

    Round-tripping through latin-1 reverses it. Guarded two ways so clean text
    is never touched — a marker-character check first, then a try/except, since
    genuinely clean captions containing real emoji cannot encode to latin-1 at
    all and would otherwise raise.
    """
    if not text or not any(ch in text for ch in "ÂÃâð"):
        return text
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def _labels(items: list) -> dict[str, tuple[str, str]]:
    """Flatten a list of ``{label, value, href}`` dicts into ``{label: (value, href)}``."""
    out: dict[str, tuple[str, str]] = {}
    for item in items:
        if isinstance(item, dict) and "label" in item:
            out[item["label"]] = (
                demojibake(item.get("value") or ""),
                item.get("href") or "",
            )
    return out


def harvest(path: Path) -> list[Saved]:
    """Pull saved posts out of Meta's export.

    The real schema is not the ``string_map_data`` shape older write-ups
    describe. Both files are a top-level *list*, and each entry carries a
    ``label_values`` list of ``{label, value, href}``. Collections nest their
    posts under a recursive ``{"dict": [...], "title": ...}`` key, several levels
    deep, with the same nesting reused for unrelated things like hashtags — so
    the walk has to be recursive but careful about what it treats as a
    collection name.

    Captions come along for free here, which matters more than it sounds: a
    caption gives a usable note even when the download later fails, and with
    yt-dlp against Instagram some of them will.
    """
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        print(f"  ! could not read {path.name}: {exc}")
        return []

    out: list[Saved] = []

    def walk(node, collection: str) -> None:
        if isinstance(node, list):
            for item in node:
                walk(item, collection)
            return
        if not isinstance(node, dict):
            return

        # Two spellings of "a group of labelled fields": the top level of an
        # entry uses `label_values`, nested groups use `dict`.
        group = node.get("label_values")
        nested = node.get("dict")
        items = group if isinstance(group, list) else (nested if isinstance(nested, list) else None)

        if items is None:
            for value in node.values():
                walk(value, collection)
            return

        labels = _labels(items)

        # Only a top-level entry names a collection. Nested groups also carry a
        # "Name" label — hashtags and creator blocks do — and letting those win
        # would file posts under a hashtag.
        if isinstance(group, list):
            name = labels.get("Name", ("", ""))[0]
            if name:
                collection = name

        value, href = labels.get("URL", ("", ""))
        link = (href or value).strip()
        if POST_URL.match(link):
            out.append(Saved(
                url=link,
                caption=labels.get("Caption", ("", ""))[0],
                collection=collection,
            ))

        for child in items:
            walk(child, collection)

    walk(data, "")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("export_dir", type=Path)
    parser.add_argument("--dry-run", action="store_true",
                        help="parse and count, write nothing")
    parser.add_argument("--delay", type=float, default=0.0,
                        help="seconds between queue writes (queueing is cheap; "
                             "the throttle that matters is on `stash process`)")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--collection", default="",
                        help="comma-separated collection names to import; "
                             "omit to take everything")
    args = parser.parse_args()

    root = args.export_dir.expanduser()
    if not root.is_dir():
        print(f"not a directory: {root}")
        return 1

    files = find_files(root)
    if not files:
        print(f"no saved*.json found under {root}")
        print("Check you exported as JSON rather than HTML.")
        return 1

    print(f"found {len(files)} file(s):")
    harvested: list[Saved] = []
    for path in files:
        found = harvest(path)
        print(f"  {path.relative_to(root)} -> {len(found)} link(s)")
        harvested.extend(found)

    # A URL shows up in both files and can sit in more than one collection.
    # Keep the richest record: a collection name beats none, a caption beats none.
    seen: dict[str, Saved] = {}
    for item in harvested:
        current = seen.get(item.url)
        if current is None:
            seen[item.url] = item
            continue
        if item.collection and not current.collection:
            current.collection = item.collection
        if item.caption and not current.caption:
            current.caption = item.caption

    items = list(seen.values())
    if args.collection:
        wanted = {c.strip().lower() for c in args.collection.split(",")}
        items = [i for i in items if i.collection.strip().lower() in wanted]
    if args.limit:
        items = items[: args.limit]

    counts: dict[str, int] = {}
    for item in seen.values():
        counts[item.collection or "(uncollected)"] = counts.get(
            item.collection or "(uncollected)", 0) + 1

    print(f"\n{len(seen)} unique permalink(s), "
          f"{sum(1 for i in seen.values() if i.caption)} with captions")
    print("collections:")
    for name, count in sorted(counts.items(), key=lambda x: -x[1]):
        mark = " <-" if args.collection and name.strip().lower() in {
            c.strip().lower() for c in args.collection.split(",")} else ""
        print(f"  {count:>5}  {name}{mark}")

    if args.collection:
        print(f"\nfiltered to {len(items)} item(s)")

    if args.dry_run:
        print("\ndry run — nothing queued")
        for item in items[:5]:
            print(f"  {item.url}")
            print(f"        [{item.collection or 'uncollected'}] "
                  f"{item.caption[:70].replace(chr(10), ' ') or '(no caption)'}")
        return 0

    CONFIG.ensure_dirs()
    conn = db.connect(CONFIG.db_path)
    added = skipped = 0
    for item in items:
        note = f"saved to collection: {item.collection}" if item.collection else None
        _, created = db.add_capture(
            conn, source="backfill", permalink=item.url,
            note=note, caption=item.caption,
        )
        added += created
        skipped += not created
        if args.delay:
            time.sleep(args.delay)

    print(f"\nqueued {added}, already present {skipped}")
    print("\nNow drain it slowly — overnight, not in one go:")
    print("  while .venv/bin/python -m stash process --limit 1 | grep -q wrote; "
          "do sleep 45; done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
