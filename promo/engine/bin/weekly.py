#!/usr/bin/env python3
"""Start weekly content tasks through crew.

  weekly.py research | make | auto      (auto: Friday -> research, Saturday -> make, other days nothing)

Run by launchd (bin/com.skwirl.content-engine.plist, Fri + Sat 10:00). If the Mac was asleep, launchd runs it on wake.

Which agent runs each job (crew agent names from ~/.crew/agents.json):
  research  ENGINE_RESEARCH_AGENT, default codex
  make      ENGINE_MAKE_AGENT, default claude-craveto (reels, carousels and statics; Claude makes the posts)
ENGINE_AGENT is a fallback for both when the job-specific variable is unset.
Effort: ENGINE_<JOB>_EFFORT, then ENGINE_EFFORT, then xhigh for codex and max for Claude agents.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1]
REPO = Path(os.environ.get("STASH_MAIN", Path.home() / "Work/Experiment/stash"))
CREW = Path(os.environ.get("CREW_DIR", Path.home() / "Work/Experiment/crew"))
OUTPUT = Path(os.environ.get("ENGINE_HOME", REPO / "promo/out/engine"))


DEFAULT_AGENTS = {"research": "codex", "make": "claude-craveto"}


def agent_for(job: str) -> str:
    e = os.environ.get
    return (e(f"ENGINE_{job.upper()}_AGENT") or e("ENGINE_AGENT") or DEFAULT_AGENTS[job]).strip()


def effort_for(job: str, agent: str) -> str:
    e = os.environ.get
    return e(f"ENGINE_{job.upper()}_EFFORT") or e("ENGINE_EFFORT") or ("xhigh" if agent == "codex" else "max")


def main() -> int:
    job = sys.argv[1] if len(sys.argv) > 1 else "auto"
    if job == "auto":
        job = {4: "research", 5: "make"}.get(datetime.now().weekday(), "")
        if not job:
            return 0
    if job not in ("research", "make"):
        print(__doc__)
        return 2
    OUTPUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d")
    marker = OUTPUT / f".started-{job}-{stamp}"
    if marker.exists():  # launchd can fire twice (wake + schedule): one task per job per day
        return 0
    prompt = (ENGINE / "prompts" / f"{job}.md").read_text()
    prompt = f"ENGINE_HOME={OUTPUT}\n\n" + prompt
    sys.path.insert(0, str(CREW))
    import crew  # noqa: E402  (crew.py, the agent orchestrator)

    agent = agent_for(job)
    m = crew.start(agent, str(REPO), prompt, name=f"Content engine: {job} {stamp}",
                   effort=effort_for(job, agent))
    marker.write_text(m["id"])
    print(f"started {job}: crew task {m['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
