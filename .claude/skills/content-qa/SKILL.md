---
name: content-qa
description: Verify a rendered Skwirl reel/carousel as a viewer before it reaches Parth - visuals, audio, voiceover, captions, claims - then fix and re-render until it passes. Use after every render, before handing anything over.
---

# Content QA: watch it like a viewer, fix it, then hand over

Nothing goes to Parth until this passes. You run it yourself; Parth should never be the one who finds a
broken frame or a mispronounced word. Max 3 fix rounds; if something still fails after that, hand over with
the failure listed plainly at the top.

## Model budget (token efficiency)
You (the main agent) only judge and fix. Push the heavy looking/listening to cheap subagents (Agent tool,
`model` param), one per job, each returning a short pass/fail list, never raw dumps:
- **haiku**: mechanical checks (ffprobe numbers, loudness, caption-vs-transcript diff, em-dash grep, file sizes).
- **sonnet**: the visual pass over contact sheets / frames, and the "first-time viewer" pass.
- **you (opus)**: decide what to fix, make the edits, re-render. Don't re-read whole files you already know.
Images cost tokens: look at contact sheets (many frames per image) at reduced size, and zoom into a single
frame only where a sheet shows a problem.

## 1. Extract evidence (bash, no model needed)
```
OUT=promo/out/qa; mkdir -p $OUT
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,duration -of compact <mp4>
ffmpeg -i <mp4> -af ebur128=peak=true -f null - 2>&1 | tail -12            # integrated LUFS + true peak
ffmpeg -i <mp4> -vf "fps=2,scale=270:-1,tile=6x4" $OUT/sheet-%02d.png       # contact sheets, 0.5 s apart
ffmpeg -i <mp4> -vf "select='gt(scene,0.3)',showinfo" -vsync vfr $OUT/cut-%03d.png 2>&1 | grep pts_time  # every cut
ffmpeg -i <mp4> -ar 16000 -ac 1 $OUT/audio.wav                               # for whisper
```
Transcribe `audio.wav` with the whisper setup the promo scripts already use (promo/captions/transcribe.mjs or
whisper.cpp), with word timestamps.

## 2. Checks (each must pass)
**Format**: 1080x1920, 30 fps, length matches the brief (+-1 s), no black/blank frames except intended.
**Audio**: integrated -14 LUFS (+-1), true peak <= -1 dBTP, no clipping, music ducked under every VO line
(VO clearly louder), no silence gaps > 0.6 s that aren't intended, no clicks at clip joins.
**Voiceover**: whisper transcript matches the script word for word (allow punctuation). Flag any word whisper
hears differently (often a mispronunciation), wrong tense ("read"), "Skwirl" not sounding like "squirrel",
sentences cut mid-way, robotic intonation on a line that needs emphasis.
**Captions**: every caption word matches what is said and appears within ~0.15 s of being spoken; never covers
the key UI element; never runs off-screen; max 2 lines.
**Visuals (per cut + contact sheets)**: no text clipped, overlapping or off-frame; no element half-rendered
or missing on its first frame; no placeholder/lorem/"undefined"/NaN; fonts consistent; brand colours and logo
right; UI mockups internally consistent (same title, same date, same counts across shots); safe zones kept
(top 220 px and bottom 380 px clear of key text for IG UI); motion has no jumps or stutters at cuts.
**Truth**: every on-screen claim, title, date and quote matches the source it replays (transcript, note, real
data). Nothing invented. Only Claude Code is "automatic". No user names. No "open source". No em dashes
anywhere (on screen, caption).
**Caption file**: 1-2 lines + hashtags, required music credit present, no em dashes, link-in-bio CTA.

## 3. Viewer pass (sonnet subagent, fresh eyes)
Give it ONLY the contact sheets + the whisper transcript + the caption, not the script or your intent. Ask:
"You're scrolling Instagram. What is this about after 2 seconds? After 10? Where did you get confused or
bored? Would you understand what Skwirl is? Anything that looks broken, cheap, or fake?" A hook that doesn't
land in 2 s, or a viewer who can't say what Skwirl does, is a fail.

## 4. Fix, re-render, re-check
Fix the source (never paper over in post), re-render, and rerun only the checks the fix could affect plus the
viewer pass. Log each round in `promo/out/qa/report.md`: check, result, what you changed.

## 5. Hand over
Only when everything passes (or after 3 rounds): final MP4, cover, caption.txt, and `qa/report.md` with a
one-line verdict at the top. Your SUMMARY lists the verdict and anything still imperfect.
