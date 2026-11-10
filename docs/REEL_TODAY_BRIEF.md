# Brief: build today's Instagram Reel (piece 13, "Claude used a reel I forgot I saved")

Written 10 Nov 2026 by the main-app session. Run `scripts/whatsup` and follow AGENTS.md first.
Model: Opus 5.5 (check `/model`). Parth posts this today, so finish it end to end.

## Read first
- `promo/CONTENT_HANDBOOK.md` (on master) — the content source of truth: voice, brand, formats.
- The script, owned by the "Content handbook and next reel" session, uncommitted in its worktree. READ
  it, don't edit it there: `.claude/worktrees/content-handbook-next-reel-e71a8a/promo/scripts/13-claude-found-it.md`.
  Copy what you need into your own worktree. Its status line says "do not build until the recording
  exists": that blocker is now solvable, see below.
- `docs/WORK_POSITIONING_BRIEF.md` "Why" section: what is proven and the honesty rules.

## Step 1: the real recording (the reel's whole claim rests on it)
Since 9 Nov, Claude Code on Parth's Mac brings up his saves on its own (a UserPromptSubmit hook,
`stash/recall_hook.py`, on his main account). Record a real run:
- In an empty scratch folder, run Parth's normal account, not Craveto (the Craveto account has no
  Skwirl). If you are running as "Claude (Craveto)", your environment points `claude` at the Craveto
  login, so clear it explicitly:
  `env -u CLAUDE_CONFIG_DIR /opt/homebrew/bin/claude -p "<task prompt>" --output-format stream-json --verbose --include-hook-events < /dev/null`
  Check the transcript's hook output contains "Skwirl: the user saved these". The prompt must NOT
  mention saves or Skwirl.
- Try the script's prompt first (a landing page that shouldn't look AI-made, aiming at the "18 visual
  tells of AI-generated UI" save). If the hook doesn't surface that save or Claude doesn't use it, use
  the verified one: "Help me add a scroll-driven parallax hero to a landing page. Short plan only."
  (on 9 Nov Claude opened the "4 Web Animation Patterns" save and cited it), and adapt the script.
- Keep the raw transcript file. The reel shows ONLY what really happened: same prompt, same reply
  wording (you may trim, never invent), same save title. A faithful on-screen replay of the real
  transcript is fine; a made-up exchange is not.

## Step 2: build the Reel (Remotion, in promo/)
Parth's standing content rules (he set these; they are not optional):
- Max effort from the first draft: voiceover, beat-cut music, SFX, real motion. Never a static slideshow.
- Voiceover (Kokoro af_heart, see promo/tts/): every line must read naturally out loud. Split clips only
  at sentence ends, never mid-sentence; check tense with the phoneme print (e.g. "read" past tense);
  no lines that only work with a particular intonation. Spell the brand "Squirrel" for the voice.
- Music ducked under the voice, master at -14 LUFS. Captions from the real VO (captions/transcribe.mjs).
- 1080×1920, 30fps, ~30s, hook moving from frame 0. No em dashes in on-screen text or the caption.
- Honesty: only Claude Code is "automatic". Don't name Jacinda. No "open source".
- Quality over cost: never cut frames or use a cheaper model to save time.

## Step 3: check, then hand over
- Watch the full render yourself (extract frames at each cut, listen to the VO) before calling it done.
- Deliver: the final MP4, a 1-2 line caption with 3-5 hashtags, and a cover frame. Put them in
  `promo/out/` and tell Parth the paths.
- Commit the source by file name (never the other session's files, never `git add -A`), push as
  Parthuss (see HANDOFF.md), and report in plain words: what the recording showed, and anything you
  changed from the script and why.
