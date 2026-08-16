# Running the daemon at login

```bash
sh stash/launchd/install.sh
```

Requires `STASH_WORKER_URL` and `STASH_SECRET` already set in `.env` — the
daemon exits immediately without a deployed Worker to poll, and installing it
first would just make launchd crash-loop it forever.

What it does: renders `com.stash.daemon.plist.template` with your actual
Python and repo paths, installs it to `~/Library/LaunchAgents/`, and loads it.
From then on `stash daemon` starts at login and restarts automatically if it
ever exits — the two properties (`RunAtLoad` + `KeepAlive`) that fix "I thought
it was running," which is the specific way capture broke before this existed.

**Check it's actually alive:**

```bash
stash status   # or: stash doctor
```

Both read the daemon's heartbeat file (`.stash-daemon-state.json`, pid + last
poll time) rather than just checking whether *some* process is running — so a
hung daemon that hasn't exited still gets flagged, not just a dead one.

**Logs:** `tail -f .stash-daemon.log`

**Uninstall:**

```bash
launchctl bootout gui/$(id -u)/com.stash.daemon
rm ~/Library/LaunchAgents/com.stash.daemon.plist
```

**Re-run `install.sh` after editing the template** — the installed copy in
`~/Library/LaunchAgents/` is a rendered snapshot, not a symlink; edits to the
template here don't take effect until you reinstall.
