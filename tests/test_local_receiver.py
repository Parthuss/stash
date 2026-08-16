import pytest

from stash.local_receiver import parse_capture


def test_parse_capture_accepts_a_link_and_optional_note():
    url, note = parse_capture(b'{"url":"https://instagram.com/reel/example", "note":" ideas "}')
    assert url == "https://instagram.com/reel/example"
    assert note == "ideas"


@pytest.mark.parametrize("payload", [b"not json", b"[]", b'{"url":"file:///tmp/a"}', b'{"url": 2}'])
def test_parse_capture_rejects_invalid_payloads(payload):
    with pytest.raises(ValueError):
        parse_capture(payload)
