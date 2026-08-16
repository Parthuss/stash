"""Parsing Meta's data export.

The fixtures here mirror the *real* 2026 export schema, confirmed against a live
151-post / 1,234-collection-item download. It is not the ``string_map_data``
shape most write-ups describe: both files are top-level lists, fields arrive as
``label_values: [{label, value, href}]``, and collections nest their posts under
a recursive ``{"dict": [...], "title": ...}`` key.

Worth testing properly because the export is a one-shot artifact — Meta takes a
day or two to produce one, so a parser bug is expensive to discover.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location(
    "import_export", ROOT / "scripts" / "import_export.py"
)
import_export = importlib.util.module_from_spec(_spec)
sys.modules["import_export"] = import_export
_spec.loader.exec_module(import_export)


def _write(root: Path, name: str, payload) -> Path:
    directory = root / "your_instagram_activity" / "saved"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _post(url: str, caption: str = "") -> dict:
    """One saved-post entry in the real shape."""
    return {
        "timestamp": 1783422723,
        "media": [],
        "label_values": [
            {"label": "URL", "value": url, "href": url},
            {"label": "Caption", "value": caption},
            {"label": "Title", "value": ""},
        ],
        "fbid": "1784" + "0" * 13,
    }


def _collection(name: str, posts: list[dict]) -> dict:
    """One collection entry, with its posts nested two levels deep."""
    return {
        "timestamp": 1783422723,
        "media": [],
        "label_values": [
            {"label": "Name", "value": name},
            {"label": "Type", "value": "Default"},
            {"label": "Privacy", "value": "Private"},
            {"label": "Update time", "timestamp_value": 0},
            {"title": "Media", "dict": [
                {"title": "", "dict": p["label_values"]} for p in posts
            ]},
        ],
        "fbid": "1784" + "0" * 12,
    }


def test_saved_posts_yields_url_and_caption(tmp_path):
    path = _write(tmp_path, "saved_posts.json", [
        _post("https://www.instagram.com/reel/AAA111/", "agent memory tricks"),
        _post("https://www.instagram.com/p/BBB222/", "cooking"),
    ])
    got = import_export.harvest(path)
    assert [(s.url, s.caption) for s in got] == [
        ("https://www.instagram.com/reel/AAA111/", "agent memory tricks"),
        ("https://www.instagram.com/p/BBB222/", "cooking"),
    ]


def test_collection_posts_inherit_the_collection_name(tmp_path):
    """The mapping that makes the backfill worth doing at all."""
    path = _write(tmp_path, "saved_collections.json", [
        _collection("Work", [
            _post("https://www.instagram.com/reel/CCC333/", "agentic workflow"),
            _post("https://www.instagram.com/reel/DDD444/", "github repos"),
        ]),
    ])
    got = import_export.harvest(path)
    assert {s.collection for s in got} == {"Work"}
    assert len(got) == 2


def test_hashtag_blocks_do_not_masquerade_as_collections(tmp_path):
    """Nested groups also carry a `Name` label — letting one win would file the
    post under a hashtag instead of its collection."""
    post = _post("https://www.instagram.com/reel/EEE555/", "cool")
    post["label_values"].append({"title": "Hashtags", "dict": [
        {"title": "", "dict": [{"label": "Name", "value": "trendingreels"}]},
    ]})
    path = _write(tmp_path, "saved_collections.json", [_collection("Learning", [post])])
    got = import_export.harvest(path)
    assert [s.collection for s in got] == ["Learning"]


def test_bio_and_profile_links_are_not_saves(tmp_path):
    """Entries embed the creator's profile and bio links. Counting those turned a
    1,234-item export into 2,136 phantom saves."""
    post = _post("https://www.instagram.com/reel/FFF666/", "recipe")
    post["label_values"].append({"title": "Profile", "dict": [
        {"title": "", "dict": [
            {"label": "URL", "value": "https://www.instagram.com/cheffatty/",
             "href": "https://www.instagram.com/cheffatty/"},
            {"label": "Name", "value": "cheffatty"},
        ]},
        {"title": "", "dict": [
            {"label": "URL", "value": "http://www.cheffatty.com",
             "href": "http://www.cheffatty.com"},
        ]},
        {"title": "", "dict": [
            {"label": "URL", "value": "https://youtube.com/@crafti_master",
             "href": "https://youtube.com/@crafti_master"},
        ]},
    ]})
    path = _write(tmp_path, "saved_posts.json", [post])
    got = import_export.harvest(path)
    assert [s.url for s in got] == ["https://www.instagram.com/reel/FFF666/"]


def test_post_url_pattern_is_anchored():
    """A bio link that merely contains instagram.com must not match."""
    assert import_export.POST_URL.match("https://instagram.com/reel/AAA111/")
    assert import_export.POST_URL.match("https://www.instagram.com/p/AAA111/")
    assert import_export.POST_URL.match("https://www.instagram.com/tv/AAA111/")
    assert not import_export.POST_URL.match("https://www.instagram.com/someuser/")
    assert not import_export.POST_URL.match("http://redirect.me/?u=instagram.com/p/X/")
    assert not import_export.POST_URL.match("https://youtube.com/@someone")


def test_find_files_survives_a_moved_export_layout(tmp_path):
    odd = tmp_path / "some" / "new" / "place"
    odd.mkdir(parents=True)
    (odd / "saved_posts.json").write_text("[]", encoding="utf-8")
    assert [p.name for p in import_export.find_files(tmp_path)] == ["saved_posts.json"]


def test_unreadable_file_is_reported_not_fatal(tmp_path, capsys):
    """One corrupt file must not abandon the rest of the export."""
    path = _write(tmp_path, "saved_posts.json", [])
    path.write_text("{not json", encoding="utf-8")
    assert import_export.harvest(path) == []
    assert "could not read" in capsys.readouterr().out


def test_demojibake_repairs_metas_latin1_mangling():
    """95 of 154 real captions arrived corrupted this way."""
    assert import_export.demojibake(
        "Whatâ\x80\x99s your favorite dish?"
    ) == "What’s your favorite dish?"


def test_demojibake_is_a_noop_on_clean_text():
    """Must not touch captions that are already correct, emoji included."""
    for clean in ["plain ascii", "already fine — em dash",
                  "emoji \U0001f9e0 ok", ""]:
        assert import_export.demojibake(clean) == clean


def test_captions_are_repaired_during_harvest(tmp_path):
    path = _write(tmp_path, "saved_posts.json", [
        _post("https://www.instagram.com/reel/GGG777/",
              "comment â\x80\x9crepoâ\x80\x9d for the link"),
    ])
    assert import_export.harvest(path)[0].caption == "comment “repo” for the link"
