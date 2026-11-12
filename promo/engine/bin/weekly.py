#!/usr/bin/env python3
"""Start the weekly content tasks as crew sessions on the Craveto Claude account.

  weekly.py research | make | auto      (auto: Friday -> research, Saturday -> make, other days nothing)

Run by launchd (bin/com.skwirl.content-engine.plist, Fri + Sat 10:00). If the Mac was asleep, launchd runs it on wake.
Never uses Parth's main account.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1]
REPO = Path(os.environ.get("STASH_MAIN", Path.home() / "Work/Experiment/stash"))
CREW = Path(os.environ.get("CREW_DIR", Path.home() / "Work/Experiment/crew"))
HOME = Path(os.environ.get("ENGINE_HOME", REPO / "promo/out/engine"))


def main() -> int:
    job = sys.argv[1] if len(sys.argv) > 1 else "auto"
    if job == "auto":
        job = {4: "research", 5: "make"}.get(datetime.now().weekday(), "")
        if not job:
            return 0
    if job not in ("research", "make"):
        print(__doc__)
        return 2
    HOME.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d")
    marker = HOME / f".started-{job}-{stamp}"
    if marker.exists():  # launchd can fire twice (wake + schedule): one task per job per day
        return 0
    prompt = (ENGINE / "prompts" / f"{job}.md").read_text()
    prompt = f"ENGINE_HOME={HOME}\n\n" + prompt
    sys.path.insert(0, str(CREW))
    import crew  # noqa: E402  (crew.py, the agent orchestrator)

    m = crew.start("claude-craveto", str(REPO), prompt, name=f"Content engine: {job} {stamp}",
                   effort="high" if job == "make" else "medium")
    marker.write_text(m["id"])
    print(f"started {job}: crew task {m['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
