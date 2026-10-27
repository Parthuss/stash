# Getting Stash its first 100 users

Written 2026-10-27. Straight answer first: the product works. What stopped anyone from
using it was the front door. Until tonight a stranger landing on the site saw a token box
and "invite-only", with no word on what Stash is. That's fixed. The rest of this page covers
who to go after, where, in what order, and what only you can do.

## What changed tonight (live on stash.parthakholkar.com)

| Before | Now |
|---|---|
| A token box and "invite-only" | A landing page: what it does, example notes, how it works, Claude, FAQ |
| You needed a code to join | Anyone types a first name and is in. Capped at 50 accounts (`MAX_JOIN`), 8 tries per 10 min and 20 per day per network |
| Lose your browser data, lose your stash | A "Save my sign-in link" banner until they do, plus a button in Your account. On a phone it opens the share sheet (Notes, email to self) |
| Notes were private dead ends | **Share** on any note makes a public page (`/n/<id>`) with the cover, summary, recipe and mentions, plus a "Start your own stash" button. **Stop sharing** kills the link. The page never shows "why you saved it", the user's own note, the caption or the transcript |
| No link preview | Link previews (Open Graph) with an image (`/og.png`), so pasting the link in WhatsApp, iMessage or X shows a proper card. Shared notes preview with their own cover |
| 200 saves a day for everyone on your shared Groq key | 30 a day on the shared key, 200 with their own key. The limit message tells them how to get more |

Close open joining: delete the `[vars] OPEN_JOIN = "1"` lines from `worker/wrangler.local.toml`
and run `worker/deploy.sh`. It falls back to invite-code only (`JOIN_CODE`).

## The market, honestly

"Save a reel, get a note" is crowded, and most of it is recipes:
- **Recipe apps:** Pestle, ReciMe, SousChef AI, Simmr. Share a reel, get ingredients and steps.
- **General reel savers:** ReelSave, InstaSave, Recall, Stashr, Rescroll.

Recipe extraction alone won't win. Two things none of them do together:
1. **It reads the whole reel.** Audio, on-screen text, caption and top comments, for any
   kind of post. Stashr, for one, doesn't process the video.
2. **Claude can read your saves.** You connect it once, then ask "what was that pasta thing" or
   "what tools have I saved for video editing" from any Claude chat. Nobody else has this.

**Pitch:** "The reels you save, finally useful. And Claude can read them."
**Who to go after first:** people who already use Claude and save a lot of reels. They get
the differentiator straight away, they're easy to find (r/ClaudeAI, Claude Discord, AI
Twitter/X), and the connector is the part that makes them come back. Recipe people come
second, through shared notes.

## Order of operations

Do these in order. Don't go to Product Hunt until people are still using it in week 2. A
launch spike into a product nobody comes back to is wasted.

### Week 1: 10 people you know (DMs, not posts)
- Pick friends who save lots of reels. Food and fitness people, and anyone who uses Claude.
- Send them the message below. Ask them to share **three reels this week**, nothing more.
- On day 3, check Admin. Anyone with 0 saves got stuck in setup. Ask them where, then fix
  that step.

> I built a thing: you share a reel to it and it turns into a note you can actually search.
> Recipes come out as ingredients + steps, books and movies land in a list, and Claude can
> read all of it. Free. Takes 3 minutes to set up:
> https://stash.parthakholkar.com
> Save 3 reels this week and tell me what's annoying about it.

### Week 2: Claude communities
- **r/ClaudeAI** (and r/ClaudeCode, r/mcp): a "show what I built" post. Reddit is where most
  indie apps get their first users, as long as the post reads like a member talking and not
  an ad. Draft below.
- **X/Threads:** a 30-second screen recording. Save a reel, the note appears, then ask
  Claude about it. The `promo/` Remotion project is already set up for this.
- **Instagram/TikTok:** make a reel about saving reels. Your audience is literally the
  people who share reels.

Reddit draft (r/ClaudeAI):
> **I gave Claude access to every reel I've saved**
>
> I save a lot of reels (recipes, tools, book recs) and never look at them again, so I built
> Stash. You share a reel to it, it transcribes the audio, reads the on-screen text and
> the top comments, and writes a short note. Recipes come out as ingredients + steps.
>
> The part I actually use: it's an MCP connector. I ask Claude "what was that Remotion
> tip I saved" or "what books have I saved" and it searches them.
>
> Free, no signup beyond a first name: https://stash.parthakholkar.com
> Would love to hear what breaks.

### Week 3+: only if week-2 numbers hold
The go/no-go from `docs/PILOT.md` still applies: at least 60% still saving in week 2 and at
least 20% of notes reopened. If that holds, launch on Product Hunt with the promo video,
then start the Expo app. If it doesn't, read each person's row in Admin before building
anything new.

## What breaks first when people show up

1. **Speed for friends.** Friends' saves run on GitHub Actions. Without `GH_DISPATCH_TOKEN`
   they wait for GitHub's timer, which fires every 2–5 hours. Someone's first save taking
   hours is the most likely reason they never come back. **This is the #1 thing to set up**
   (5 minutes, steps in `docs/PILOT.md`).
2. **The shared Groq key.** The free tier handles a few saves a minute. Around 20–30 active
   people it starts queueing. The daily cap is 30 per person, and the "slow" banner points
   people to their own free key. If it's still tight, Groq's paid tier costs about $0.01 a save.
3. **YouTube from the cloud runner.** YouTube blocks GitHub's IPs. Friends' YouTube Shorts
   fail unless your Mac processes them. Instagram works from the cloud. TikTok hasn't been
   tested from the cloud yet; check one before posting on TikTok.
4. **Cap of 50 accounts.** Raise it with `MAX_JOIN = "200"` under `[vars]` in
   `wrangler.local.toml` once the queue copes.

## Only you can do these

1. **Set `GH_DISPATCH_TOKEN`.** See above; steps in `docs/PILOT.md`.
2. **Phone test, 10 minutes.** On your iPhone, open the site signed out, join as a test
   name, add the Shortcut, share a reel, then delete the account. Borrow an Android and do
   the same through Install app. Nothing has been tested on a real phone since the landing page.
3. **Add a contact email** to `worker/public/privacy.html` and `terms.html`. Anyone joining
   from Reddit needs a way to reach you, and both stores require one later.
4. **Pick the name before Product Hunt.** Stashr is live and close. A domain costs about
   $10 a year and makes the link look less like a side project. Not needed for weeks 1–2.
5. **Post.** Use the drafts above, in your own voice.

Sources for the market and channel notes: [TechCrunch on Pestle](https://techcrunch.com/2024/07/08/pestles-app-can-now-save-recipes-from-reels-using-on-device-ai),
[SousChef AI](https://apps.apple.com/app/id6761611403), [ReelSave](https://mwm.ai/apps/reelsave-smart-bookmark/6758552015),
[Recall](https://docs.recall.it/use-cases/content-type/social/instagram), [InstaSave](https://www.producthunt.com/p/instasave/instasave-2),
[indie-hacker channel notes](https://claudeskills.info/skills/kostja94/marketing-skills/indie-hacker-strategy/).
