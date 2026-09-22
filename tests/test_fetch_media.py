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
