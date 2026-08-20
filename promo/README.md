# stash promo

A 37-second vertical promo built with [Remotion](https://remotion.dev). Not a screen-recorded demo end to end: the first 10 seconds are a real censored screen recording of sharing an actual reel to Stash, the rest (the Claude Code recall moment, the outro) is composed in code because it's a future moment that can't be recorded yet.

Voiceover is [Kokoro-82M](https://github.com/hexgrad/kokoro), run locally, free. Captions are word-level whisper.cpp transcription rendered through Remotion's own `@remotion/captions` helper, same approach as their official `template-tiktok`.

## What's real vs. composed

- `public/capture.mp4` — actual screen recording, contacts and faces blurred with ffmpeg before anything else touched it. The working directory it came from (`real-footage/`, including the unblurred original) is gitignored entirely and never leaves this machine.
- `public/vo-*.wav` — Kokoro output, one clip per scene so narration timing tracks the cut regardless of how fast a line reads.
- `src/captions-data/*.json` — whisper.cpp word timestamps, hand-corrected in two spots where it misheard the voiceover ("Clod" → "Claude").
- The Claude Code terminal, the notification banners, the recall card: all Remotion components, built to match the real UI, not screen-recorded.

## Rebuilding it

```bash
npm install
npm run dev          # scrub the composition in Remotion Studio
npx remotion render StashPromo out/stash-promo.mp4
```

Regenerating the voiceover or captions needs their own setup (`tts/` for Kokoro, `captions/transcribe.mjs` for whisper.cpp) — see the comments in each script. Neither runs as part of a normal render; the generated output already lives in `public/` and `src/captions-data/`.
