import json
from pathlib import Path
from types import SimpleNamespace

from stash import extract


def test_visual_batches_follow_the_model_limit():
    paths = [Path(f"slide-{number}.jpg") for number in range(11)]
    assert [
        len(batch) for batch in extract._chunks(paths, extract.MAX_IMAGES_PER_REQUEST)
    ] == [3, 3, 3, 2]


def test_groq_vision_payload_uses_ordered_images_and_json_mode(tmp_path, monkeypatch):
    first = tmp_path / "first.jpg"
    second = tmp_path / "second.jpg"
    first.write_bytes(b"first")
    second.write_bytes(b"second")
    seen = {}

    class Response:
        status_code = 200
        text = ""

        @staticmethod
        def json():
            return {
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "items": [
                                {"label": "Slide 1", "description": "one"},
                                {"label": "Slide 2", "description": "two"},
                            ]
                        })
                    }
                }]
            }

    def fake_post(url, **kwargs):
        seen["url"] = url
        seen["json"] = kwargs["json"]
        return Response()

    monkeypatch.setattr(extract.httpx, "post", fake_post)
    monkeypatch.setattr(
        extract, "CONFIG", SimpleNamespace(groq_api_key="test-key", extract_model="test-model")
    )

    notes = extract._describe_batch(
        [first, second], ["Slide 1", "Slide 2"], start=1
    )

    assert notes == ["Slide 1: one", "Slide 2: two"]
    assert seen["json"]["response_format"] == {"type": "json_object"}
    assert seen["json"]["reasoning_effort"] == "none"
    content = seen["json"]["messages"][0]["content"]
    assert [part["type"] for part in content] == ["text", "image_url", "image_url"]
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert content[1]["image_url"]["detail"] == "low"


def test_groq_structured_result_is_coerced(monkeypatch):
    class Response:
        status_code = 200
        text = ""

        @staticmethod
        def json():
            return {
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "title": "Useful post",
                            "summary": "A useful summary.",
                            "topic": "not-real",
                            "tools": "Groq, yt-dlp",
                            "why_saved": "It fits the workflow.",
                            "next_step": "Run the parser.",
                            "difficulty": "unknown",
                            "relevance": [],
                            "frame_notes": "Slide text.",
                        })
                    }
                }]
            }

    monkeypatch.setattr(extract.httpx, "post", lambda *args, **kwargs: Response())
    monkeypatch.setattr(
        extract,
        "CONFIG",
        SimpleNamespace(
            groq_api_key="test-key",
            extract_model="test-model",
            media_dir=Path("/definitely/missing/stash/media"),
        ),
    )

    result = extract._extract_groq(
        permalink="https://example.com/post",
        user_note=None,
        transcript_text="",
        caption="caption",
        transcript_reason="static post",
        frames=[],
        frame_reasons=[],
        meta={},
    )

    assert result["topic"] == "other"
    assert result["difficulty"] == "afternoon"
    assert result["tools"] == ["groq", "yt-dlp"]


def test_max_images_per_request_is_the_models_hard_limit():
    """Not a tuning knob: a 4th image returns HTTP 400 'This model supports up
    to 3 images'. Verified against the live API. Raising this to save round
    trips would break every carousel."""
    assert extract.MAX_IMAGES_PER_REQUEST == 3


def test_vision_resolution_is_not_shrunk_for_token_reasons():
    """Measured on the live API: one image costs 804 prompt tokens at 512px,
    768px and 1024px identically — Groq normalises images to a flat cost. So
    downscaling buys nothing but lost OCR, and OCR is the point of the vision
    pass."""
    assert extract.VISION_IMAGE_PX >= 1024


def test_rate_limit_logging_warns_only_when_budget_is_low(capsys):
    class Response:
        def __init__(self, remaining):
            self.headers = {
                "x-ratelimit-remaining-tokens": str(remaining),
                "x-ratelimit-limit-tokens": "8000",
                "x-ratelimit-reset-tokens": "12s",
            }

    extract._log_rate_limit(Response(7000))
    assert capsys.readouterr().out == ""

    extract._log_rate_limit(Response(500))
    out = capsys.readouterr().out
    assert "groq tokens low" in out
    assert "500/8000" in out


def test_rate_limit_logging_never_breaks_on_an_odd_response(capsys):
    """Observability must not be able to fail a capture."""
    class NoHeaders:
        pass

    class JunkHeaders:
        headers = {"x-ratelimit-remaining-tokens": "not-a-number",
                   "x-ratelimit-limit-tokens": "8000"}

    extract._log_rate_limit(NoHeaders())   # must not raise
    extract._log_rate_limit(JunkHeaders())  # must not raise
    assert capsys.readouterr().out == ""
