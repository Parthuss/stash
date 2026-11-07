"""Voiceover for the "11:40pm. Fridge open." POV Reel (Kokoro-82M, same voice as the launch video).
"Squirrel" is how Kokoro says Skwirl; captions spell it right."""
import numpy as np, soundfile as sf
from kokoro import KPipeline

VOICE = "af_heart"
LINES = [
    ("fp-1", "Eleven forty. I know I saved a pasta recipe.", 0.95),
    ("fp-2", "It's in here. Somewhere.", 0.95),
    ("fp-3", "Oh.", 0.9),
    ("fp-4", "Squirrel. Every saved reel, back as a note. Link in bio.", 1.1),
]
if __name__ == "__main__":
    pipe = KPipeline(lang_code="a")
    for name, text, speed in LINES:
        audio = np.concatenate([c.audio.numpy() if hasattr(c.audio, "numpy") else c.audio for c in pipe(text, voice=VOICE, speed=speed)])
        sf.write(f"../public/insta/{name}.wav", audio, 24000)
        print(f"{name}: {len(audio)/24000:.2f}s")
