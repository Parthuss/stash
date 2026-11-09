"""Your own categories: the model may only ever file a note under names the person chose."""

from __future__ import annotations

import json

from stash import extract


CATS = ["Fine motor", "Handwriting", "Emotional regulation"]


def test_only_the_persons_own_names_survive_in_their_order():
    raw = ["handwriting", "Fine Motor", "Gross motor", "Handwriting", 42, None]
    assert extract._coerce_categories(raw, CATS) == ["Fine motor", "Handwriting"]
    assert extract._coerce_categories("Fine motor", CATS) == []   # not a list
    assert extract._coerce_categories(["Fine motor"], []) == []   # no categories set


def test_prompt_lists_categories_and_requires_them_only_when_set():
    base = dict(permalink=None, user_note=None, transcript_text="t", transcript_reason="", visual_notes=[], meta={})
    without = extract.build_prompt(**base)
    assert "Their own categories" not in without and '"categories"' not in without
    with_cats = extract.build_prompt(**base, categories=CATS)
    assert "- Handwriting" in with_cats
    schema = json.loads(with_cats.split("Required JSON schema:\n", 1)[1])
    assert schema["properties"]["categories"]["items"]["enum"] == CATS
    assert "categories" in schema["required"]
    assert "categories" not in extract.SCHEMA["properties"]   # the shared schema isn't mutated


def test_sorting_existing_notes_keeps_valid_picks_per_note(monkeypatch):
    sent = {}

    def fake_request(messages, *, max_tokens):
        sent["prompt"] = messages[1]["content"]
        return {"notes": [
            {"id": "a", "categories": ["fine motor", "Cooking"]},
            {"id": "b", "categories": []},
            {"id": 7, "categories": ["Handwriting"]},
        ]}

    monkeypatch.setattr(extract, "_groq_request", fake_request)
    notes = [{"id": "a", "title": "Pegboard game", "summary": "s", "markdown": "x" * 5000},
             {"id": "b", "title": "Pasta", "summary": "s", "markdown": "m"}]
    picks = extract.sort_into_categories(notes, CATS)
    assert picks == {"a": ["Fine motor"], "b": []}
    assert "x" * 4001 not in sent["prompt"]          # each note is capped at 4k chars
    assert "- Emotional regulation" in sent["prompt"]
    assert extract.sort_into_categories([], CATS) == {}
