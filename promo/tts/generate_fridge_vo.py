"""Voiceover for "11:40pm. Fridge open." v2 (Kokoro-82M, af_heart, same voice as the launch video).
"Squirrel" is how Kokoro says Skwirl; captions spell it right. The name is its own clip (f2-7a)
so the video can leave a real pause before the closing line."""
import numpy as np, soundfile as sf
from kokoro import KPipeline

VOICE = "af_heart"
LINES = [
    ("f2-1", "Eleven forty. I'm starving. And I know I saved a pasta recipe.", 1.0),
    ("f2-2", "It's somewhere in here. Between four hundred gym reels... and memes.", 1.0),
    ("f2-3", "Saving it felt like doing something. It wasn't.", 0.95),
    ("f2-4", "Good thing I'd sent it to Squirrel.", 1.0),
    ("f2-5a", "Oh.", 0.9),
    ("f2-5b", "There it is.", 0.95),
    ("f2-6", "Ingredients, steps, even what to do next.", 1.0),
    ("f2-7a", "Squirrel.", 0.95),
    ("f2-7b", "Every reel you save, back as a note you can use. Link in bio.", 1.02),
]
if __name__ == "__main__":
    pipe = KPipeline(lang_code="a")
    for name, text, speed in LINES:
        audio = np.concatenate([c.audio.numpy() if hasattr(c.audio, "numpy") else c.audio for c in pipe(text, voice=VOICE, speed=speed)])
        sf.write(f"../public/insta/{name}.wav", audio, 24000)
        print(f"{name}: {len(audio)/24000:.2f}s")
