# Skwirl recipe catalog (read this first in the make step)

Components: `promo/src/recipes/shots.tsx`. Cards: `cards/<name>.md`. Demo: `npx remotion render src/recipes/index.ts RecipeDemo out/recipes/demo.mp4`. 30 fps, 1080x1920, 120 BPM = 15 frames per beat. Use `beats(n)` for frames.

| name | energy | frames | use for |
|---|---|---|---|
| PushIn | low | 45-75 push, hold >= 45 | opening a scene, pointing at a card or title |
| FocusRing | med | 28 build, hold >= 45 | naming one button or field |
| TypeIn | med | 12 + 3/char + 18, hold >= 45 | search and recall demo |
| CrashZoom | high | 18 total, hold >= 45 | the one payoff field |
| BeatPunch | high | cuts on 2 beats, hold >= 35 | rhythmic build, hook |
| Parallax | med | 45 + lift 12, hold >= 20 | hook or outro depth |
| WhipPan | high | 14 | high-energy scene change |
| HiddenCut | med | 14 (cut at 7) | unrelated scene change |
| FlashCut | med | 4 | cover a beat-aligned hard cut |

## Selection rules (20-45 s reel)
- Energy arc: hook in the first 2 s is high (BeatPunch, WhipPan or Parallax); demo is medium (PushIn, FocusRing, TypeIn); payoff is exactly one CrashZoom; outro is calm (PushIn or a still hold).
- Max 2 CrashZoom per reel, and never mix bounce and slam.
- Every cut and transition midpoint lands on the beat grid (multiples of 15 frames).
- Never two identical recipes back to back.
- Hold at least 45 frames on any UI text the viewer must read (35 for a BeatPunch close-up).
- Motion points at the field that matters: pass the exact UI rect (css px of the 390-wide screen), not the whole screen.
- Match the transition to the energy: whip high to high, hidden cut for a change of subject, flash for a same-subject cut.

## Avoid
- Gratuitous shake: slam shake only on one CrashZoom, 6 frames.
- Blur on readable text: blur only on moving frames.
- Rotating 3D for its own sake.
- Zoom past 2.8x on the 3x captures: they go soft.
- Labels over the field you are pointing at.

Pattern after github.com/Vincentwei1021/video-shotcraft (Apache-2.0). No files copied; parameters re-derived for 1080x1920.

## Known pitfalls with our captures

- The demo captures have no iOS status bar, so the kit Phone's notch/island sits on top of the app's top
  row (wordmark, Back, Lists). In a wide phone shot either crop the capture's top 40 px under the island or
  frame the shot so the island isn't over a word the viewer needs.
- Labels and chips are for orientation in the demo; in a real reel every label is a claim. Only label what
  the product really does (e.g. "Tick it when you make it" for the I made this button), never invent a benefit.
- Zoom past 2.8x on a 3x capture goes soft: capture with `SHOTS_DSF=3` and keep CrashZoom at 2.4-2.8.
