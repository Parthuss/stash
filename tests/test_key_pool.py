from types import SimpleNamespace

from stash import config


def test_rotates_past_a_spent_shared_key(monkeypatch):
    monkeypatch.setattr(config, "_spent_until", {})
    cfg = SimpleNamespace(groq_api_key="a", groq_api_keys=("a", "b", "c"))
    assert config.groq_key(cfg) == "a"
    assert config.next_shared_key(cfg, 3600) is True
    assert config.groq_key(cfg) == "b"
    assert config.next_shared_key(cfg, 3600) is True
    assert config.next_shared_key(cfg, 3600) is False  # all three spent: fail, queue retries later
    with config.using_groq_key("own"):
        assert config.groq_key(cfg) == "own"
        assert config.next_shared_key(cfg, 3600) is False  # never rotates someone's own key


def test_single_key_still_works(monkeypatch):
    monkeypatch.setattr(config, "_spent_until", {})
    cfg = SimpleNamespace(groq_api_key="only")
    assert config.groq_key(cfg) == "only"
    assert config.next_shared_key(cfg, 60) is False


def test_plus_lane_uses_openrouter_until_it_fails(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-x")
    monkeypatch.setattr(config, "_openrouter_down_until", [0.0])
    assert config.openrouter_key() == ""  # not a Plus save
    with config.plus_lane(True):
        assert config.openrouter_key() == "sk-or-x"
        config.openrouter_failed(600)
        assert config.openrouter_key() == ""  # back on the free keys for a while
