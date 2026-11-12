Weekly Skwirl content batch (content engine step 2). Work in ~/Work/Experiment/stash. Max effort: this goes out
under Parth's name.

Read first: promo/engine/README.md, promo/CONTENT_HANDBOOK.md (all of it), .claude/skills/content-qa/SKILL.md,
promo/scripts/week17-batch.md (the expected script-then-evaluate format and quality bar; if it isn't on master yet, it
is on branch crew/1111-203445-cabf), and the backlog $ENGINE_HOME/ideas.md (default
~/Work/Experiment/stash/promo/out/engine/ideas.md).

1. Pick the backlog's top 5 (default N=5; drop to 4 if one can't be made truthfully or needs Parth's face/recording).
   The batch covers next Mon-Sun. Week folder: ~/Work/Experiment/stash/promo/out/week-<DDmon of the Monday>/ (main
   checkout, so staging finds it after your worktree is gone).
2. For each: script first (promo/scripts/<week>-batch.md, beats table + evaluation table as in week17-batch.md), check
   every claim against handbook section 1, then build: Remotion compositions in promo/src/insta/<week>/ with their own
   entry (never touch src/Root.tsx or Parth's uncommitted files), Kokoro VO (af_heart, "Squirrel" spelling, split only
   at sentence ends, print phonemes), captions on whisper timings, music on the 120 BPM grid with the drop on the turn,
   ducked under every line, SFX, real motion, master -14 LUFS, cover on frame 0. Carousels: every slide sets up the next.
3. QA: run the content-qa skill on every piece (haiku for mechanical checks, sonnet for the visual and first-time
   viewer passes). Max 3 fix rounds. qa/report.md must start with "Verdict: PASS" or the piece is not staged.
4. Per piece folder: the mp4 (or 01.png..NN.png), cover.png, caption.txt (1-2 lines, send trigger, "Free to try, link
   in bio.", music credit, 3-5 hashtags, no em dashes), qa/.
5. Schedule: `cd promo/engine && python -m content_engine init-schedule <week dir> --start <Monday> --every 1`, then
   edit schedule.json: real times (default 22:30 IST, spread per the backlog's slots), a YouTube title (under 70
   characters reads best, no emoji) and description per Reel (caption body + "skwirl.app" + "#Shorts"), "idea_id" set to
   the backlog id. Carousels stay Instagram-only. Run `python -m content_engine validate <week dir>` until it says OK.
6. Stage: `python -m content_engine stage <week dir>` (needs the R2 + Telegram env from ~/.config/skwirl-engine/env;
   source it first). Parth gets each post on Telegram with Approve / Skip. If staging isn't configured yet, stop after
   validate and say so.
7. Move the used ideas to "Done / retired" in $ENGINE_HOME/ideas.md with their post ids. Write the week's README.md
   (slots table like week-17nov/README.md). Commit scripts, compositions, VO generators and caption JSON on your branch
   (stage files by name, never git add -A). Don't merge.

End with SUMMARY: pieces, QA verdicts, slots, anything imperfect.
