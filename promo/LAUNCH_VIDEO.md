# Skwirl launch video

`SkwirlLaunch`: 31 seconds, 1920×1080, 30fps. Rendered file: `out/launch/skwirl-launch.mp4`
(poster `out/launch/skwirl-launch.jpg`, post text `out/launch/share-copy.txt`). Both are gitignored, so re-render them as below.

## Story (cuts on the music's 120 BPM grid, 15 frames a beat)

| Time | Scene | What's real |
|---|---|---|
| 0–4s | A wall of saved reels piles up, then goes grey: "You save a reel, then you never see it again." | Illustration |
| 4–7s | The tail draws itself along its own centreline, the acorn drops in, "Skwirl" wipes on | The real logo geometry (`design/logo`) |
| 7–12s | A reel → iPhone share sheet → tap Skwirl → "Saved to Skwirl" | Rebuilt UI; the alert text is the Shortcut's real wording |
| 12–18s | The note scrolls to the ingredients. "Audio / On-screen text / Caption / Top comments" | Real app screenshot (demo account) |
| 18–23s | Lists screen, with Deep Work / Senso-ji / Perfect Days cards | Real app screenshot (demo account) |
| 23–27s | Claude: "What was that pasta recipe I saved?" → "Searched Skwirl" → the answer | Rebuilt chat, answer text from the demo note |
| 27–31s | Logo, "The reels you save, finally useful.", the URL, "Free while in beta" | |

Headlines appear word by word on the voice's own word timestamps, so the video reads with the sound off.

## Free tools used

- **Remotion** for the video (React, every frame a pure function of time).
- **Kokoro-82M** for the voiceover (`tts/generate_launch_vo.py`, voice `af_heart`). The lines spell the name
  "Squirrel" because Kokoro reads "Skwirl" as "es-quirrel".
- **whisper.cpp** (medium.en) for word timestamps (`captions/transcribe-launch.mjs`), hand-corrected for the name.
- **Music and sound effects** from [latent-spaces/brag](https://github.com/latent-spaces/brag): "Happy Beats / Business
  Moves Vol. 1" by Sascha Ende (CC BY 4.0, **credit required**: "Music: Sascha Ende, ende.app (CC BY 4.0)") and
  Kenney UI sounds (CC0). The creative rules (hook first, show the real thing, every frame postable) follow brag's
  `/brag-slim` skill.
- Mix: voice normalised to -16 LUFS, music about 9 dB under it, final master -14 LUFS (social platforms' level).

## Rebuild

```bash
cd promo
(cd tts && .venv/bin/python generate_launch_vo.py)          # only if the lines change
CLIP_DIR=launch OUT_DIR=src/launch/captions node captions/transcribe-launch.mjs lv-1-hook lv-2-meet lv-3-share lv-4-note lv-5-lists lv-6-claude lv-7-outro
npx remotion render SkwirlLaunch out/launch/raw.mp4
npx remotion still SkwirlLaunch out/launch/skwirl-launch.jpg --frame=905 --image-format=jpeg
ffmpeg -i out/launch/raw.mp4 -i out/launch/skwirl-launch.jpg -filter_complex "[0:v][1:v]overlay=enable='eq(n,0)'[v]" \
  -map "[v]" -map 0:a -c:v libx264 -crf 18 -pix_fmt yuv420p -af "loudnorm=I=-14:TP=-1:LRA=9" -c:a aac -b:a 192k \
  -movflags +faststart out/launch/skwirl-launch.mp4
```
After regenerating the voice, re-run the `loudnorm=I=-16` pass on `public/launch/lv-*.wav` (see git history) and
re-apply the caption fixes (Squirrel → Skwirl).
