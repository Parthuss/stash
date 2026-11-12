Weekly Skwirl content research (content engine step 1). Work in ~/Work/Experiment/stash.

Read first: promo/engine/README.md, promo/CONTENT_HANDBOOK.md (section 1 is the only list of claims content may
make; read-only if another worktree claims it), the live backlog $ENGINE_HOME/ideas.md (default
~/Work/Experiment/stash/promo/out/engine/ideas.md; if missing, start from promo/engine/ideas.md).

1. Inputs: run `.venv/bin/python promo/engine/research/gather.py` from the main checkout
   (~/Work/Experiment/stash). It pulls Parth's saves about content, our post performance, what's already made,
   top Shorts (if YT_API_KEY) and Reddit questions (if REDDIT_* keys) into $ENGINE_HOME/inputs/<date>.md.
   Before that, refresh performance: `cd promo/engine && python -m content_engine pull-perf --out $ENGINE_HOME/performance.json`
   (skip quietly if the store isn't configured).
2. Outside signals: hand the web sweep to ONE sonnet subagent (WebSearch + WebFetch, read-only, never log in, post or
   comment): what changed this week in Instagram/YouTube Shorts formats and text trends, Instagram product changes
   touching saving, new competitors' messaging (never name them in content). Every claim with a URL, unverified ones
   marked. Save to $ENGINE_HOME/inputs/<date>-signals.md.
3. Learn from performance: which hooks/formats got the best shares per reach, saves per reach and 3 s hold
   (1 - reels_skip_rate)? Write 3-5 bullet "what worked / what didn't" at the top of ideas.md. With fewer than 3 posts
   measured, say so and don't over-read noise.
4. Rewrite the backlog: keep good unbuilt ideas (re-score them: trends age), add new ones, retire stale ones, aim for 15
   live ideas with the scoring in ideas.md (2 x Hook + 2 x Fit + Effort + Fresh). Each idea: hook (frame 0, under 15
   words), format, pillar, payoff feature, signal with source, send trigger, truth notes. Pick the top 5 for next week
   with suggested 22:30 IST slots, spread across pillars, never two of the same niche within 5 days, and nothing that
   repeats a piece in "Already made".
5. Rules: only claims on the handbook truth list; never claim TikTok/Threads, "open source", unlimited, instant, store
   apps, user counts or statistics nobody measured; only Claude Code does things "on its own"; Jacinda only as
   "Jacinda, occupational therapist" with her exact words; no em dashes anywhere; never name a competitor in content.
   Reddit is reading only; posting or commenting there is by hand, never automated.
6. Save the backlog to $ENGINE_HOME/ideas.md AND copy it to promo/engine/ideas.md in your worktree; commit only that
   file on your branch ("Content engine: research run <date>"). Don't merge.
7. Telegram: if TG_ENGINE_BOT_TOKEN and TG_OWNER_CHAT_ID are set, send Parth a 6-line summary (top 5 hooks + one line on
   what performance taught us) with a plain Bot API sendMessage call (never print the token).

End with SUMMARY (top 5, what changed vs last week, gaps).
