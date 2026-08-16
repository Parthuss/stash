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
