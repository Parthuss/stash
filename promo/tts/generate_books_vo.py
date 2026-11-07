"""Voiceover for piece 7, "40 book reels. 0 books read." (Kokoro-82M, af_heart). "Squirrel" = Skwirl."""
import numpy as np, soundfile as sf
from kokoro import KPipeline

VOICE = "af_heart"
LINES = [
    ("b-1", "I've saved forty 'books that changed my life' reels.", 1.0),
    ("b-2", "Read? Zero. Name one? I can't.", 0.95),
    ("b-3", "So I let Squirrel watch them for me.", 1.0),
    ("b-4", "Every book, movie and place they mentioned. In one list.", 1.0),
    ("b-5", "Finished one? Tick it off.", 0.95),
    ("b-6a", "Squirrel.", 0.95),
    ("b-6b", "Every book your feed ever recommended, finally in one place. Link in bio.", 1.03),
]
if __name__ == "__main__":
    pipe = KPipeline(lang_code="a")
    for name, text, speed in LINES:
        audio = np.concatenate([c.audio.numpy() if hasattr(c.audio, "numpy") else c.audio for c in pipe(text, voice=VOICE, speed=speed)])
        sf.write(f"../public/insta/{name}.wav", audio, 24000)
        print(name)
