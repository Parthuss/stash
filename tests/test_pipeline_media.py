import sqlite3
from pathlib import Path

from stash import pipeline
from stash.fetch import MediaBundle, MediaItem
from stash.frames import FrameRequest
from stash.transcribe import Transcript


FIELDS = {
    "title": "Ordered carousel",
    "summary": "Summary",
    "topic": "tooling",
    "tools": [],
    "why_saved": "Useful",
    "next_step": "Try it",
    "difficulty": "trivial",
    "relevance": [],
    "frame_notes": "Slides in order",
}


def test_pipeline_preserves_mixed_carousel_order(tmp_path, monkeypatch):
    first = tmp_path / "first.jpg"
    video = tmp_path / "second.mp4"
    third = tmp_path / "third.jpg"
    video_frame = tmp_path / "second-frame.jpg"
    for path in (first, video, third, video_frame):
        path.write_bytes(b"media")

    bundle = MediaBundle(
        items=[
            MediaItem(1, "image", path=first),
            MediaItem(2, "video", path=video, duration=5),
            MediaItem(3, "image", path=third),
        ],
        via="yt-dlp",
        title="Post title",
        uploader="creator",
        caption="metadata caption",
    )
    seen = {}

    monkeypatch.setattr(pipeline.fetch, "fetch", lambda **kwargs: bundle)
    monkeypatch.setattr(
        pipeline.transcribe,
        "transcribe",
        lambda path: Transcript(text="video words", via="groq"),
    )
    monkeypatch.setattr(
        pipeline.frames,
        "plan_frames",
        lambda transcript, duration: [FrameRequest(timestamp=2, reason="title card")],
    )
    monkeypatch.setattr(
        pipeline.frames, "extract", lambda path, plan, out_dir: [video_frame]
    )

    def fake_extract(**kwargs):
        seen.update(kwargs)
        return FIELDS

    monkeypatch.setattr(pipeline.extract, "extract", fake_extract)
    monkeypatch.setattr(pipeline.vault, "render", lambda *args, **kwargs: "note")
    monkeypatch.setattr(pipeline.vault, "note_path", lambda title: tmp_path / "note.md")
    monkeypatch.setattr(pipeline.vault, "write", lambda content, path: path)
    monkeypatch.setattr(pipeline.db, "upsert_note", lambda conn, data: None)

    capture = {
        "id": "capture-1",
        "permalink": "https://instagram.com/p/example/",
        "permalink_ok": 1,
        "media_url": None,
        "note": None,
        "caption": "",
        "source": "shortcut",
    }
    result = pipeline.process(sqlite3.connect(":memory:"), capture, verbose=False)

    assert seen["frames"] == [first, video_frame, third]
    assert seen["frame_reasons"] == [
        "Slide 1 — static image",
        "Slide 2 at 2s — title card",
        "Slide 3 — static image",
    ]
    assert seen["caption"] == "metadata caption"
    assert seen["transcript_text"] == "[Slide 2 video]\nvideo words"
    assert result.frames_used == 3
