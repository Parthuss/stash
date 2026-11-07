"""Voiceover for piece 7, "40 book reels. 0 books read." (Kokoro-82M, af_heart). "Squirrel" = Skwirl.

v2 (7 Nov): Kokoro barely pauses at ? and . inside one clip, so v1 ran "Read? Zero. Name one? I can't."
together with a single 0.14s gap. Each line is now built from phrases rendered separately, edge-trimmed,
and joined with the silence written after it (seconds). Every line must fit its slot in BookList.tsx
(VO start frames: b1 8, b2 125, b3 255, b4 380, b5 600, b6a 735, b6b 780; end 950 at 30fps).
"""
import numpy as np, soundfile as sf
from kokoro import KPipeline

VOICE, SR = "af_heart", 24000
# (clip, [(phrase, speed, pause_after_s), ...])
LINES = [
    ("b-1", [("I've saved forty", 0.95, 0.16), ("'books that changed my life'", 0.95, 0.10), ("reels.", 0.95, 0)]),
    ("b-2", [("Read?", 0.9, 0.38), ("Zero.", 0.85, 0.62), ("Name one?", 0.92, 0.34), ("I can't.", 0.88, 0)]),
    ("b-3", [("So,", 0.95, 0.22), ("I let Squirrel watch them for me.", 1.0, 0)]),
    ("b-4", [("Every book,", 0.98, 0.12), ("movie,", 0.98, 0.10), ("and place they mentioned.", 0.98, 0.45), ("In one list.", 0.92, 0)]),
    ("b-5", [("Finished one?", 0.95, 0.34), ("Tick it off.", 0.92, 0)]),
    ("b-6a", [("Squirrel.", 0.95, 0)]),
    ("b-6b", [("Every book your feed ever recommended,", 1.02, 0.18), ("finally in one place.", 0.98, 0.5), ("Link in bio.", 0.98, 0)]),
]


def trim(a, thresh=0.008, pad=0.03):
    """Cut leading/trailing silence so the written pauses are the real pauses."""
    loud = np.where(np.abs(a) > thresh)[0]
    if not len(loud):
        return a
    p = int(pad * SR)
    return a[max(0, loud[0] - p): loud[-1] + p]


if __name__ == "__main__":
    pipe = KPipeline(lang_code="a")
    for name, phrases in LINES:
        parts = []
        for text, speed, pause in phrases:
            audio = np.concatenate([c.audio.numpy() if hasattr(c.audio, "numpy") else c.audio for c in pipe(text, voice=VOICE, speed=speed)])
            parts += [trim(audio), np.zeros(int(pause * SR), dtype=np.float32)]
        out = np.concatenate(parts)
        sf.write(f"../public/insta/{name}.wav", out, SR)
        print(f"{name}  {len(out) / SR:.2f}s")
