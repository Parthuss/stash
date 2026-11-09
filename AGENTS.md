# Working alongside other agents

Several agents work on this repo at once, each in its own worktree. None of them can see the others unless you look.

- Run `scripts/whatsup` before starting a task, and whenever someone asks what other agents are doing.
- Claim before editing: add one line to `.agents/BOARD.md` in your own worktree (`mkdir -p .agents` first; the file is gitignored and `whatsup` reads every worktree's copy). Format: `- [agent/app] task: files touched, started <date>`. Remove the line when you're done or have committed.
- Commit small and often.
- Never apply, merge or overwrite another agent's uncommitted work without asking Parth.
- If a file you need is claimed, say so instead of editing it.
