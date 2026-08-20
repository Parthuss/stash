"""Generate the promo voiceover with Kokoro-82M (local, free, Apache-2.0).

One WAV per scene, not one continuous track — each clip gets placed at its
scene's start frame in StashPromo.tsx via <Sequence>, so narration timing
stays anchored to the actual visual beats regardless of how fast Kokoro
reads any given line.
"""

import numpy as np
import soundfile as sf
from kokoro import KPipeline

VOICE = "af_heart"

LINES = [
    ("vo-1-capture", "You save a reel, mid-scroll, telling yourself you'll come back to it."),
    ("vo-2-confirmation", "One share to Stash, and it's already transcribed, tagged, filed away."),
    ("vo-3-timeskip", "Days later —"),
    (
        "vo-4-recall",
        "you're heads-down in Claude Code on something completely different, "
        "and it just remembers. Pulls up the exact thing you saved — "
        "no searching, no scrolling through old screenshots.",
    ),
    (
        "vo-5-outro",
        "Capture that survives you forgetting. Recall that doesn't wait to be asked. That's Stash.",
    ),
]

if __name__ == "__main__":
    pipeline = KPipeline(lang_code="a")  # American English
    out_dir = "../public"

    for name, text in LINES:
        chunks = list(pipeline(text, voice=VOICE))
        full = np.concatenate(
            [c.audio.numpy() if hasattr(c.audio, "numpy") else c.audio for c in chunks]
        )
        path = f"{out_dir}/{name}.wav"
        sf.write(path, full, 24000)
        duration = len(full) / 24000
        print(f"{name}: {duration:.2f}s -> {path}")
