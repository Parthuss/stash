"""Skwirl launch video voiceover: Kokoro-82M, local and free. The name is spelled "Squirrel" in the lines
because Kokoro reads "Skwirl" as "es-quirrel"; captions are corrected back to Skwirl. One clip per scene so each
line is placed on its scene's first beat in SkwirlLaunch.tsx."""
import numpy as np, soundfile as sf
from kokoro import KPipeline

VOICE = "af_heart"
LINES = [
    ("lv-1-hook", "You save a reel. Then you never see it again."),
    ("lv-2-meet", "Meet Squirrel."),
    ("lv-3-share", "Share any reel to it."),
    ("lv-4-note", "It reads the whole thing, and hands you a note you can actually use."),
    ("lv-5-lists", "Recipes become steps. Books and movies land in a list."),
    ("lv-6-claude", "And Claude can search all of it."),
    ("lv-7-outro", "Squirrel. The reels you save, finally useful."),
]
if __name__ == "__main__":
    pipe = KPipeline(lang_code="a")
    for name, text in LINES:
        audio = np.concatenate([c.audio.numpy() if hasattr(c.audio, "numpy") else c.audio for c in pipe(text, voice=VOICE, speed=1.05)])
        sf.write(f"../public/launch/{name}.wav", audio, 24000)
        print(f"{name}: {len(audio)/24000:.2f}s")
