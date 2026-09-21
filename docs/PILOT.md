# Pilot runbook

Goal: find out whether people actually save to Stash *and come back to it*, before
building the store apps. Full reasoning: the plan in `~/.claude/plans/` and `DESIGN.md`.

## Run it
1. Keep the Mac daemon running (`stash status` → daemon ALIVE). Processing happens
   on your home IP, which Instagram doesn't block; captures queue safely when the Mac is off.
2. **Self-serve joining:** friends open the site, type their name and the shared invite code
   (or you send `https://<worker>/#code=<CODE>` and it's prefilled) and are signed in.
   Change or close it any time:
   ```bash
   cd worker && npx wrangler secret put JOIN_CODE      # new code
   cd worker && npx wrangler secret delete JOIN_CODE   # close joining entirely
   ```
   It's throttled (8 wrong tries / 10 min / IP) and capped at 50 joins (`MAX_JOIN`).
   Prefer to hand-pick? Use the per-person invite below.
   Invite someone individually: `shortcuts/invite.sh ann` mints their token and prints what to send:
   the site URL + the token. On first sign-in the app opens a **Set up** guide with
   visuals, copy buttons and redirects for each step:
   - **iPhone:** "Get the Shortcut" (one generic signed file at `/Stash.shortcut`; iOS asks
     for the token when it's added). Rebuild it with `shortcuts/build.sh` if the Worker URL changes.
   - **Android:** Chrome menu → *Install app*; Stash then appears in the share sheet.
   - **Claude:** copy the connector link → claude.ai/settings/connectors → add custom
     connector (or the `claude mcp add` command for Claude Code).
   - **Groq key (optional):** they paste their own key; it's validated, encrypted, and their
     saves then run on it instead of the shared free-tier quota.
3. **Dashboard:** sign in as yourself and tap **Admin** in the header. It shows every person
   (joined, last active, saves this week, notes, reopened %, used, Claude connected, own key,
   waiting/failed) plus queue health. It's owner-only; everyone else gets a 404 for it.
   **Alerts:** a Cloudflare cron runs every 30 min and pings your ntfy topic (`NTFY_TOPIC` secret)
   when the oldest waiting save is over an hour old, when saves give up after 3 tries, or when
   someone new joins. Each problem alerts at most once per 6 hours.
   Raw numbers, if you prefer curl: 
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
