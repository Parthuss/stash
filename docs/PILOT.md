# Pilot runbook

Goal: find out whether people actually save to Stash *and come back to it*, before
building the store apps. Full reasoning: the plan in `~/.claude/plans/` and `DESIGN.md`.

## Run it
1. Keep the Mac daemon running (`stash status` → daemon ALIVE). Processing happens
   on your home IP, which Instagram doesn't block; captures queue safely when the Mac is off.
2. Invite someone: `shortcuts/invite.sh ann` mints their token and prints what to send:
   the site URL + the token. On first sign-in the app opens a **Set up** guide with
   visuals, copy buttons and redirects for each step:
   - **iPhone:** "Get the Shortcut" (one generic signed file at `/Stash.shortcut`; iOS asks
     for the token when it's added). Rebuild it with `shortcuts/build.sh` if the Worker URL changes.
   - **Android:** Chrome menu → *Install app*; Stash then appears in the share sheet.
   - **Claude:** copy the connector link → claude.ai/settings/connectors → add custom
     connector (or the `claude mcp add` command for Claude Code).
   - **Groq key (optional):** they paste their own key; it's validated, encrypted, and their
     saves then run on it instead of the shared free-tier quota.
3. Watch it: 
   ```bash
   curl -s -H "X-Stash-Secret: $STASH_SECRET" $STASH_WORKER_URL/admin/stats
   ```
   per user: `saves`, `saves_7d`, `notes`, `opened` (notes read in full, in-app or by
   Claude), `used`, `mcp_calls` (0 = never connected Claude), `last_save`.

## Go / no-go (decided before starting, so we can't move the goalposts)
After 2–3 weeks with 15–30 people:
- **≥ 60%** of invited users still saving in week 2 (`saves_7d > 0`), and
- **≥ 20%** of notes opened at least once (`opened / notes`).

Pass → build the Expo app against this same API. Fail → read the per-user rows for *why*
(never saved? saved once and left? saved but never came back?) before deciding anything.

## Known limits (deliberate, for the pilot)
- Search is keyword (FTS5) on the hosted side; the local vault still has hybrid/vector.
- Connector auth is a secret URL, not OAuth.
- No quotas or billing. Groq's free tier (~3–4 images/min) is the throughput ceiling —
  put the pilot on Groq's paid tier if more than a handful of people save at once.
- One failed capture pauses the queue until the next poll (head-of-line blocking).
