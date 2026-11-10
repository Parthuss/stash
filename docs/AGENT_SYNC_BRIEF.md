# Brief: keep every agent on this repo in sync (Claude main app, Claude Craveto app, Codex)

Written 9 Nov 2026 by the main-app session. Build this in the Craveto app; Parth wants the main
app's usage kept for Pherrus work.

## Problem
Several agents work on `~/Work/Experiment/stash` at once (two Claude desktop apps on different
accounts, plus Codex), each in its own worktree. None of them knows what the others are doing.
On 9 Nov the main session and a Craveto session edited `worker/src/mcp.ts` in parallel, and the
main session only found the Craveto edits when Parth asked. Claude sessions can already message
each other (ListAgents / SendMessage see sessions from both apps), but nobody checks.

## Build (smallest version that works)
1. `scripts/whatsup` (Python stdlib or shell, no deps, < 1s). Prints, compactly:
   - every `git worktree list` entry with uncommitted changes: branch + changed file names;
   - commits on master in the last 24h (`git log --since=24.hours --format='%h %an %ar %s'`);
   - open claims from the board (below). Prints nothing when there's nothing to report.
2. `AGENTS.md` at the repo root (Codex reads it automatically). Rules, short:
   - Run `scripts/whatsup` before starting a task.
   - Claim before editing: add one line to `.agents/BOARD.md`
     (`- [agent/app] task: files touched, started <date>`), remove it when done or committed.
   - Commit small and often; never apply, merge or overwrite another agent's uncommitted work
     without asking Parth. If a file you need is claimed, say so instead of editing it.
   Then make the repo `CLAUDE.md` point to it (one line: `@AGENTS.md`), so Claude gets the same rules.
3. Claude hook: UserPromptSubmit that runs `scripts/whatsup` and passes its output as
   `additionalContext` (same JSON shape as `stash/recall_hook.py`; never fail the prompt, exit 0).
   Only inject when the output changed since the last prompt in this session (store a hash in
   `/tmp/whatsup-<session_id>`), so it costs nothing on most messages.
   Register it in the **project** `.claude/settings.json` of the repo, so both apps get it without
   touching either account's user settings. (Check `.claude/` is not gitignored for that file;
   don't commit `.claude/worktrees/`.)

## Test
- Make an uncommitted edit in one worktree, then in a session in another worktree send a prompt:
  the injected context must name that file. Second prompt with no change: nothing injected.
- `codex` (if installed) in the repo: ask "what are other agents doing?" and check it runs whatsup.

## Rules for this repo (from HANDOFF.md, still apply)
- Stage files by name; never `git add -A` / `commit -a`. Never stage Parth's promo work in
  progress (`promo/src/Root.tsx`, `promo/src/components/CaptureScene.tsx`, `promo/src/MetaPromo.tsx`,
  `promo/src/ReceiptsPromo.tsx`, `promo/public/*.wav|mp4`).
- Don't touch `~/.claude/settings.json` (the main app's recall hook lives there) or `~/.claude-bn`.
- Push as Parthuss (see HANDOFF.md). Commit messages end with the Co-Authored-By line.
- Report back to Parth in plain words: what was built, what the test showed.
