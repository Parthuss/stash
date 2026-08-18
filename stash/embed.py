"""Local embeddings for the vector half of hybrid search.

Runs entirely on the Mac: no API key, no network, no rate limit competing with
the Groq budget the enrichment pipeline already spends, and it keeps working
if the daemon processes a capture while you're offline. Model is
BAAI/bge-small-en-v1.5 via fastembed (ONNX, no PyTorch) — 384 dimensions, ~65MB
on disk, downloaded once on first use and cached by huggingface_hub.

BGE models are trained asymmetrically: a query and the passage that answers it
are not expected to look alike as raw text, so queries get an instruction
prefix documents don't. This is NOT handled by fastembed's ``query_embed`` for
this model — verified by reading the installed source, ``query_embed`` is a
bare alias for ``embed()`` here, because fastembed's own model metadata calls
the prefix "not so necessary" for v1.5 (unlike v1, where it says
"necessary"). "Not so necessary" is not "does nothing": A/B tested on the
actual regression case this module exists to fix (query "how do I make videos
automatically" against the real vault), the prefixed query scored the two
target notes at 0.671/0.660 cosine similarity versus 0.653/0.640 unprefixed —
both configurations already fixed the ranking, but the prefix gave a wider
margin over the next-best result, matches BAAI's own model card guidance for
retrieval, and costs nothing to include. So: prefix on the query, nothing on
the document, applied explicitly here rather than trusted to the library.
"""

from __future__ import annotations

MODEL_NAME = "BAAI/bge-small-en-v1.5"
DIM = 384

#: BAAI's own instruction for retrieval queries against this model family.
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

_model = None


class EmbeddingUnavailable(RuntimeError):
    """fastembed is not installed, or the model could not be loaded.

    Callers should treat this as "fall back to FTS5-only", not as a reason to
    fail a capture — search infrastructure must never be able to break the
    thing that writes notes.
    """


def _get_model():
    global _model
    if _model is not None:
        return _model
    try:
        from fastembed import TextEmbedding
    except ImportError as exc:
        raise EmbeddingUnavailable(
            "fastembed is not installed (pip install fastembed)"
        ) from exc
    try:
        _model = TextEmbedding(model_name=MODEL_NAME)
    except Exception as exc:  # noqa: BLE001 - any load failure means "no vectors"
        raise EmbeddingUnavailable(f"could not load {MODEL_NAME}: {exc}") from exc
    return _model


def available() -> bool:
    try:
        _get_model()
        return True
    except EmbeddingUnavailable:
        return False


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embed chunk text as it will be searched, no instruction prefix."""
    if not texts:
        return []
    model = _get_model()
    return [vec.tolist() for vec in model.embed(texts)]


def embed_query(text: str) -> list[float]:
    """Embed a search query, with the BGE retrieval-query instruction."""
    model = _get_model()
    return next(iter(model.embed([QUERY_PREFIX + text]))).tolist()


def serialize(vector: list[float]) -> bytes:
    """Pack floats the way sqlite-vec's vec0 columns expect them.

    Delegates to sqlite_vec's own serializer rather than reimplementing the
    same one-line struct.pack — verified byte-identical, no reason to fork it.
    """
    import sqlite_vec

    return sqlite_vec.serialize_float32(vector)
