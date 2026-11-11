from types import SimpleNamespace

from stash import config


def test_rotates_past_a_spent_shared_key(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEYS", "a, b,c")
    monkeypatch.setattr(config, "_spent_until", {})
    cfg = SimpleNamespace(groq_api_key="a")
    assert config.groq_key(cfg) == "a"
    assert config.next_shared_key(cfg, 3600) is True
    assert config.groq_key(cfg) == "b"
    assert config.next_shared_key(cfg, 3600) is True
    assert config.next_shared_key(cfg, 3600) is False  # all three spent: fail, queue retries later
    with config.using_groq_key("own"):
        assert config.groq_key(cfg) == "own"
        assert config.next_shared_key(cfg, 3600) is False  # never rotates someone's own key


def test_single_key_still_works(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEYS", raising=False)
    monkeypatch.setattr(config, "_spent_until", {})
    cfg = SimpleNamespace(groq_api_key="only")
    assert config.groq_key(cfg) == "only"
    assert config.next_shared_key(cfg, 60) is False
