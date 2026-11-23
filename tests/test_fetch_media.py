from pathlib import Path

from stash.fetch import MediaItem, _items_from_metadata


def test_carousel_entries_keep_instagram_order():
    meta = {
        "_type": "playlist",
        "entries": [
            {"id": "one", "thumbnail": "https://cdn/one.jpg", "formats": []},
            {"id": "two", "thumbnail": "https://cdn/two.jpg", "formats": []},
            {"id": "three", "thumbnail": "https://cdn/three.jpg", "formats": []},
        ],
    }

    items = _items_from_metadata(meta)

    assert [(item.position, item.kind, item.source_url) for item in items] == [
        (1, "image", "https://cdn/one.jpg"),
        (2, "image", "https://cdn/two.jpg"),
        (3, "image", "https://cdn/three.jpg"),
    ]


def test_mixed_carousel_distinguishes_video_from_image():
    meta = {
        "_type": "playlist",
        "entries": [
            {"thumbnail": "https://cdn/cover.jpg", "formats": []},
            {
                "thumbnail": "https://cdn/video-cover.jpg",
                "formats": [
                    {
                        "url": "https://cdn/clip.mp4",
                        "vcodec": "h264",
                        "acodec": "aac",
                        "height": 1080,
                    }
                ],
                "duration": 7.5,
            },
        ],
    }

    items = _items_from_metadata(meta)

    assert items[0].kind == "image"
    assert items[1].kind == "video"
    assert items[1].source_url == "https://cdn/clip.mp4"
    assert items[1].duration == 7.5


def test_media_item_path_is_filled_only_after_download():
    item = MediaItem(position=1, kind="image", source_url="https://cdn/image.jpg")
    assert item.path is None
    item.path = Path("slide.jpg")
    assert item.path.name == "slide.jpg"


def test_top_comments_sorted_by_likes_and_capped():
    from stash.fetch import MAX_COMMENTS, _top_comments

    raw = [{"text": f"c{i}", "like_count": i} for i in range(MAX_COMMENTS + 5)]
    raw.append({"text": "  "})       # blank: dropped
    raw.append({"not_text": "x"})    # malformed: dropped
    top = _top_comments(raw)
    assert len(top) == MAX_COMMENTS
    assert top[0] == f"c{MAX_COMMENTS + 4}"  # highest like_count first


def test_top_comments_handles_missing_or_malformed_input():
    from stash.fetch import _top_comments

    assert _top_comments(None) == []
    assert _top_comments("not a list") == []
    assert _top_comments([]) == []


def test_playlist_video_falls_back_to_yt_dlp_when_cdn_refuses(tmp_path, monkeypatch):
    """X serves tweets as playlists and its CDN 403s a bare GET; yt-dlp itself gets through."""
    import stash.fetch as f

    meta = {"_type": "playlist", "title": "t", "entries": [
        {"formats": [{"url": "https://video.twimg.com/v.mp4", "vcodec": "h264", "acodec": "aac", "height": 720}]},
        {"formats": [{"url": "https://video.twimg.com/w.mp4", "vcodec": "h264", "acodec": "aac", "height": 720}]},
    ]}
    monkeypatch.setattr(f.shutil, "which", lambda _: "/bin/yt-dlp")
    monkeypatch.setattr(f, "_metadata", lambda _: meta)
    import dataclasses
    monkeypatch.setattr(f, "CONFIG", dataclasses.replace(f.CONFIG, media_dir=tmp_path))

    def refuse(*_a, **_k):
        raise RuntimeError("403 Unauthorized")

    def fake_run(argv, **_k):
        pos = int(argv[argv.index("-I") + 1])
        (tmp_path / f"k-{pos:03d}.mp4").write_bytes(b"video")
        return type("P", (), {"returncode": 0, "stderr": "", "stdout": ""})()

    monkeypatch.setattr(f, "_download", refuse)
    monkeypatch.setattr(f.subprocess, "run", fake_run)
    bundle = f._yt_dlp("https://x.com/a/status/1", "k")
    assert [i.path.name for i in bundle.items] == ["k-001.mp4", "k-002.mp4"]


def test_video_cache_ignores_partial_audio_and_fragments(tmp_path, monkeypatch):
    import dataclasses
    from stash import fetch
    monkeypatch.setattr(fetch, "CONFIG", dataclasses.replace(fetch.CONFIG, media_dir=tmp_path))
    for name in ("key.mp4.part", "key.wav", "key.f137.mp4", "key.json", "key.mp4.ytdl"):
        (tmp_path / name).write_bytes(b"unfinished")
    assert fetch._cached("key") is None
    complete = tmp_path / "key.webm"
    complete.write_bytes(b"finished")
    assert fetch._cached("key") == complete


def test_download_only_publishes_on_success(tmp_path, monkeypatch):
    import contextlib
    from stash import fetch
    target = tmp_path / "video.mp4"
    class Response:
        def raise_for_status(self): pass
        def iter_bytes(self, size):
            yield b"first"
            assert not target.exists()
            yield b"second"
    @contextlib.contextmanager
    def stream(*args, **kwargs): yield Response()
    monkeypatch.setattr(fetch.httpx, "stream", stream)
    fetch._download("https://cdn.example/video", target)
    assert target.read_bytes() == b"firstsecond"
    assert list(tmp_path.iterdir()) == [target]


def test_failed_download_preserves_existing_file_and_cleans_partial(tmp_path, monkeypatch):
    import contextlib
    import httpx
    import pytest
    from stash import fetch
    target = tmp_path / "video.mp4"
    class Response:
        def raise_for_status(self): pass
        def iter_bytes(self, size):
            yield b"partial"
            raise httpx.ReadError("interrupted")
    @contextlib.contextmanager
    def stream(*args, **kwargs): yield Response()
    monkeypatch.setattr(fetch.httpx, "stream", stream)
    for existing in (False, True):
        if existing: target.write_bytes(b"original")
        with pytest.raises(httpx.ReadError): fetch._download("https://cdn.example/video", target)
        assert sorted(p.name for p in tmp_path.iterdir()) == ([target.name] if existing else [])
        if existing: assert target.read_bytes() == b"original"


def test_download_caps_stream_and_limits_runner_credentials_to_worker(tmp_path, monkeypatch):
    import contextlib
    from types import SimpleNamespace

    import pytest
    from stash import fetch, remote

    config = SimpleNamespace(uses_remote_queue=True, worker_url="https://queue.example", worker_secret="fixture")
    monkeypatch.setattr(remote, "CONFIG", config)
    monkeypatch.setattr(fetch, "MAX_MEDIA_BYTES", 5)
    requests = []

    class Response:
        def raise_for_status(self): pass
        def iter_bytes(self, size):
            yield b"first"
            yield b"other"

    @contextlib.contextmanager
    def stream(_method, url, **kwargs):
        requests.append((url, kwargs))
        yield Response()

    monkeypatch.setattr(fetch.httpx, "stream", stream)
    target = tmp_path / "video.mp4"
    for url in ("https://queue.example/media/ig/123-0123456789abcdef.mp4", "https://video.cdninstagram.com/example.mp4"):
        with pytest.raises(fetch.FetchError, match="too large"):
            fetch._download(url, target)
    assert not list(tmp_path.iterdir())
    assert [kwargs["follow_redirects"] for _, kwargs in requests] == [False, False]
    assert requests[0][1]["headers"]["X-Stash-Secret"] == "fixture"
    assert "X-Stash-Secret" not in requests[1][1]["headers"]


def test_runner_decodes_a_normal_local_video_with_restricted_media_options(tmp_path):
    import shutil
    import subprocess

    import pytest
    from stash import pipeline, transcribe

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("FFmpeg tools are needed for this local fixture")
    target = tmp_path / "sample.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=blue:s=64x64:r=24",
        "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2", "-c:v", "mpeg4",
        "-c:a", "aac", str(target),
    ], check=True, capture_output=True, timeout=15)
    wav = transcribe.extract_audio(target)
    assert wav and transcribe.probe_audio(wav)[0] >= 1.9
    assert pipeline.thumbnail([MediaItem(1, "video", path=target)]).startswith(b"\xff\xd8\xff")
