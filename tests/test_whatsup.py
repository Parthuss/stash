"""scripts/whatsup against a throwaway repo with two worktrees."""
import json
import os
import shutil
import subprocess
import uuid
from pathlib import Path

SCRIPT = Path(__file__).parent.parent / "scripts" / "whatsup"


def sh(cwd, *args):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True)


def test_hook_names_other_worktrees_edit_once(tmp_path):
    main, other = tmp_path / "main", tmp_path / "other"
    main.mkdir()
    sh(main, "git", "init", "-b", "master")
    (main / "shared.txt").write_text("a\n")
    sh(main, "git", "add", "shared.txt")
    sh(main, "git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", "first")
    sh(main, "git", "worktree", "add", "-b", "other-branch", str(other))
    (main / "scripts").mkdir()
    shutil.copy(SCRIPT, main / "scripts" / "whatsup")

    session = uuid.uuid4().hex
    def hook():
        r = subprocess.run([str(main / "scripts" / "whatsup"), "--hook"], cwd=main, text=True,
                           capture_output=True, input=json.dumps({"session_id": session}))
        assert r.returncode == 0
        return r.stdout

    try:
        (other / "shared.txt").write_text("edited\n")
        first = json.loads(hook())["hookSpecificOutput"]
        assert first["hookEventName"] == "UserPromptSubmit"
        assert "other-branch: shared.txt" in first["additionalContext"]
        assert hook() == ""  # nothing changed, nothing injected

        (other / ".agents").mkdir()
        (other / ".agents" / "BOARD.md").write_text("- [codex] fix: shared.txt, started 9 Nov\n")
        assert "[codex] fix" in json.loads(hook())["hookSpecificOutput"]["additionalContext"]
    finally:
        os.remove(f"/tmp/whatsup-{session}")
