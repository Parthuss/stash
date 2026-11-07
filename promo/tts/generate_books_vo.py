"""Voiceover for piece 7, "40 book reels. 0 books read." (Kokoro-82M, af_heart). "Squirrel" = Skwirl.

Rules learned the hard way (7 Nov):
- Kokoro barely pauses at ? and . inside one clip, so sentences are rendered separately and joined
  with written silences. But NEVER split inside a sentence: that chops the intonation (v2 read
  "I've saved / books that changed my life / reels" as three fragments).
- Ambiguous words get a phoneme override, e.g. [read](/ɹˈɛd/) for the past tense; v2's bare
  "Read?" came out as present tense ("reed").
- Every run prints the phonemes Kokoro actually used. Read them before rendering: the transcript
  can't tell "reed" from "red", the phonemes can.
Every line must fit its slot in BookList.tsx (VO start frames: b1 8, b2 125, b3 255, b4 380,
b5 600, b6a 735, b6b 780; end 950 at 30fps).
"""
import numpy as np, soundfile as sf
from kokoro import KPipeline

VOICE, SR = "af_heart", 24000
# (clip, slot_seconds, [(sentence, speed, pause_after_s), ...])
LINES = [
    ("b-1", 3.9, [("I've saved forty reels about life-changing books.", 0.95, 0)]),
    ("b-2", 4.33, [("How many have I [read](/ɹˈɛd/)?", 1.0, 0.28), ("Zero.", 0.9, 0.42), ("Name one?", 0.95, 0.25), ("I can't.", 0.92, 0)]),
    ("b-3", 4.17, [("So I let Squirrel watch them for me.", 1.0, 0)]),
    ("b-4", 7.3, [("Every book, movie and place they mentioned.", 0.98, 0.42), ("In one list.", 0.95, 0)]),
    ("b-5", 4.5, [("Finished one?", 0.95, 0.3), ("Tick it off.", 0.95, 0)]),
    ("b-6a", 1.5, [("Squirrel.", 0.95, 0)]),
    ("b-6b", 5.67, [("Every book your feed ever recommended, finally in one place.", 1.0, 0.45), ("Link in bio.", 0.98, 0)]),
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
    for name, slot, sentences in LINES:
        parts = []
        for text, speed, pause in sentences:
            chunks = list(pipe(text, voice=VOICE, speed=speed))
            print(f"  {text!r:55} -> /{' '.join(c.phonemes for c in chunks)}/")
            audio = np.concatenate([c.audio.numpy() if hasattr(c.audio, "numpy") else c.audio for c in chunks])
            parts += [trim(audio), np.zeros(int(pause * SR), dtype=np.float32)]
        out = np.concatenate(parts)
        sf.write(f"../public/insta/{name}.wav", out, SR)
        secs = len(out) / SR
        print(f"{name}  {secs:.2f}s of {slot}s slot{'  << TOO LONG' if secs > slot - 0.2 else ''}")
