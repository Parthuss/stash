import json
from pathlib import Path
from types import SimpleNamespace

from stash import extract


def test_visual_batches_are_one_image_each():
    """VISION_BATCH_SIZE is 1 even though the API allows up to 3 per request —
    measured: batching 2+ images into one JSON response compresses per-item
    detail (a dense frame's full file listing dropped to a generic one-liner)
    even with reasoning on and tokens to spare. See extract.py's comment."""
    paths = [Path(f"slide-{number}.jpg") for number in range(11)]
    assert [
        len(batch) for batch in extract._chunks(paths, extract.VISION_BATCH_SIZE)
    ] == [1] * 11


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
    assert seen["json"]["reasoning_effort"] == "default"
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
    """Documents the API's own ceiling — a 4th image returns HTTP 400 'This
    model supports up to 3 images', verified against the live API. Not the
    same number as VISION_BATCH_SIZE (1): we choose to send fewer than the
    ceiling allows, for quality, not because the ceiling moved."""
    assert extract.MAX_IMAGES_PER_REQUEST == 3


def test_vision_batch_size_is_one_despite_the_higher_ceiling():
    """The regression this pipeline actually had: a shared 2-image response
    dropped a dense frame's full file listing to a one-line generic
    description, even with reasoning on and completion tokens to spare
    (finish_reason: stop, ~1300/1800 used). The same frame sent alone read
    every folder and file name correctly, twice. Batching compresses
    per-item detail; it is not a token-budget problem raising max_tokens
    would fix."""
    assert extract.VISION_BATCH_SIZE == 1


def test_vision_resolution_stays_at_the_measured_optimum():
    """Counter-intuitive, so pinned: bigger is WORSE here.

    Token cost is flat across resolution (Groq normalises images to a fixed
    budget), but on a dense GitHub-screenshot frame 512px transcribed 1328
    chars including "MIT license" while 1024px managed 653-748 and garbled
    text the smaller version read correctly. This held before the reasoning
    fix and was re-verified after it — 512px + reasoning "default" + one
    image per request is what reliably reads a dense frame completely.
    Raising this looks free and is not."""
    assert extract.VISION_IMAGE_PX == 512


def test_reasoning_is_on_by_default():
    """The actual root cause of the OCR regression, isolated: same frame,
    same 512px resolution, same single-image request — reasoning_effort
    "none" produced a vague description with zero folder names; reasoning
    "default" (the model's own thinking mode) read all ten correctly. Groq's
    Qwen models only accept "none" or "default" — there is no "low"/"medium"
    to fall back to if this ever needs dialing down."""
    assert extract.REASONING_EFFORT == "default"


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


def test_empty_generation_400_is_retried(monkeypatch):
    """Observed live: an occasional 400 with an empty failed_generation that
    succeeds on immediate retry — a transient hiccup, not a bad request."""
    calls = {"n": 0}

    class Empty400:
        status_code = 400
        text = '{"error":{"failed_generation":""}}'
        @staticmethod
        def json():
            return {"error": {"failed_generation": ""}}
        headers = {}

    class OK:
        status_code = 200
        text = ""
        headers = {}
        @staticmethod
        def json():
            return {"choices": [{"message": {"content": '{"title": "ok"}'}}]}

    def fake_post(url, **kwargs):
        calls["n"] += 1
        return Empty400() if calls["n"] == 1 else OK()

    monkeypatch.setattr(extract.httpx, "post", fake_post)
    monkeypatch.setattr(
        extract, "CONFIG", SimpleNamespace(groq_api_key="k", extract_model="m")
    )
    result = extract._groq_request([{"role": "user", "content": "x"}], max_tokens=10)
    assert result == {"title": "ok"}
    assert calls["n"] == 2


def test_real_json_validation_failure_is_not_retried(monkeypatch):
    """A 400 that DOES carry failed_generation is a genuine schema mismatch —
    retrying would just waste the same mistake twice."""
    calls = {"n": 0}

    class Bad400:
        status_code = 400
        text = '{"error":{"failed_generation":"not json"}}'
        headers = {}
        @staticmethod
        def json():
            return {"error": {"failed_generation": "not json"}}

    def fake_post(url, **kwargs):
        calls["n"] += 1
        return Bad400()

    monkeypatch.setattr(extract.httpx, "post", fake_post)
    monkeypatch.setattr(
        extract, "CONFIG", SimpleNamespace(groq_api_key="k", extract_model="m")
    )
    try:
        extract._groq_request([{"role": "user", "content": "x"}], max_tokens=10)
        assert False, "should have raised"
    except extract.ExtractError:
        pass
    assert calls["n"] == 1
