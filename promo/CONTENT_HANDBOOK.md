# Skwirl content handbook

**For a fresh chat that plans or makes Skwirl content (Instagram Reels, carousels, Stories, captions).**
Start the chat in `~/Work/Experiment/stash` and say: *"Read promo/CONTENT_HANDBOOK.md, then [task]."*

Last updated: 9 Nov 2026. When anything here changes (a piece posts, a fact changes, a lesson is learned),
update this file in the same session. It is the single source of truth for content; `INSTAGRAM_PLAN.md`
is the original 4 Nov brief and is still right about voice, look, formats and craft, but some product
facts in it are outdated. **Where they disagree, this file wins.**

Reading order for a new chat:
1. This file (all of it).
2. `promo/INSTAGRAM_PLAN.md` §0 (voice, look, format specs, research), §3 (how to produce), then the
   brief for whichever piece you're working on.
3. The relevant script in `promo/scripts/` (05-fridge-v2.md and 07-booklist.md show the expected
   script-then-evaluate format).
4. Memories for this folder load automatically (content at max effort, VO must read naturally,
   quality over cost). Follow them.

---

## 1. What Skwirl is today (the only claims content may make)

As of 9 Nov 2026, live at **https://skwirl.app** (the old address skwirl.parthakholkar.com still works
for existing users; never use it in new content).

- Share a reel or post to Skwirl and a couple of minutes later it's a **note**: title, short summary, a
  **next step**, the transcript; recipes get an **ingredient checklist and numbered steps**.
- Books, movies, shows, places and podcasts named in reels collect into **Lists**, with Read? / Watched?
  / Been? ticks.
- It reads the **audio, the text on screen, the caption and the top comments**. This depth is the whole
  point (see §3).
- Works with **Instagram, Facebook, YouTube and X** links. **Never claim TikTok or Threads.**
- **Search by meaning**: "dinner idea tonight" finds the pasta note.
- Notes start as **To try**; "I tried this" marks one **Tried**. (The old "Unused"/"Used" wording is gone.
  Don't use it.)
- **Claude** can search your saves through Skwirl's connector. **ChatGPT**: the connector exists, but
  [CONFIRM with Parth that it's been tested end to end] before any piece shows ChatGPT.
- **How you save:** iPhone Shortcut in the share sheet (no token or code to paste since 7 Nov), Android
  (install from Chrome, then it's in the share menu), paste a link in the app, or the Telegram bot.
- **Import old saves** from Instagram's data export. It's a batch a day; don't promise a speed or a
  number per day (the free AI allowance varies).
- **Free.** No card. The code is public (FSL-1.1-MIT since 9 Nov 2026, so "source-available", **not
  "open source"**: never say open source or use #opensource. INSTAGRAM_PLAN.md piece 10 still does;
  change it if that piece gets built).
- **Skwirl Plus is "coming soon" (waitlist only).** $4.99/month or $39/year (shown in local currency on
  the site, e.g. ₹299, A$7.99): no keys, your saves read first, up to 500 reels a month. Never say you
  can buy it yet.
- **Your own categories (live since 9 Nov):** name the categories you think in (e.g. "Fine motor",
  "Handwriting", "Emotional regulation", or "Weeknight dinners") in Set up, and Skwirl files every save
  into the ones that fit, old saves included; tap a category on a note to fix it. Real-model test: it
  filed OT-style activity notes correctly (a tweezer game under Fine motor, an animal-walk course under
  Gross motor and Executive function). This is the core of the "your saved reels are your work library"
  angle.

Never claim: an App Store / Play Store app, instant processing, unlimited saves, user counts, any
statistic about how many saves people never revisit (no such study exists), or anything on the
"never claim" list in INSTAGRAM_PLAN.md §0. Never name a competitor.

## 2. What's been made and posted

| # | Piece | Built | Posted | Files |
|---|---|---|---|---|
| 1 | Launch video, portrait (31s) | 4 Nov | Yes, around 4 Nov (Parth asked for its caption that day) [CONFIRM the date] | `out/instagram/01-launch/` |
| 3 | "Your Saved folder is a graveyard" carousel (8 slides) + a reel version | 7 Nov | Yes, 7 Nov morning | `out/instagram/03-graveyard/` |
| 5 | "11:40pm. Fridge open." POV Reel v2 (34.6s) | 7 Nov | Yes, 7 Nov | `out/instagram/05-fridge/`, `src/insta/FridgePOV.tsx`, `scripts/05-fridge-v2.md` |
| 7 | "40 book reels. 0 books read." Lists Reel (31.8s) | 7 Nov; VO redone 8-9 Nov (v3) | [CONFIRM: probably not yet, the VO was redone after the planned post time] | `out/instagram/07-books/`, `src/insta/BookList.tsx`, `scripts/07-booklist.md` |
| 11 | "girl, zoom in" carousel (6 slides, v2) | 9 Nov | No. AirDropped to Parth 9 Nov; post by ~18 Nov | `out/instagram/11-zoom-in/`, `src/insta/ZoomIn.tsx`, `scripts/11-zoom-in.md` |
| 2, 4, 6, 8, 9, 10 | See INSTAGRAM_PLAN.md §2 | Not built | No | |

Parth's own work in progress (NOT ours; never edit, stage or commit): `promo/src/MetaPromo.tsx` ("made
by Claude Code" reel), `promo/src/ReceiptsPromo.tsx` (search-ranking numbers), changes in
`promo/src/Root.tsx` and `promo/src/components/CaptureScene.tsx`, and `promo/public/meta-source.mp4`,
`vo-meta.wav`, `vo-receipts.wav`. Register new compositions in `promo/src/insta/` + `src/insta/index.ts`
instead of `src/Root.tsx`.

There was also a "launch Reel on Wed 11 Nov" on the calendar. [CONFIRM with Parth what that is: a
re-post of piece 1, or a new launch piece for skwirl.app.]

Keep this table current: when Parth says something posted, record the date here.

## 3. What we've learned (use this, it's real)

**Users so far (9 Nov):** about 3 real users. Don't put numbers in content.
- **Jacinda, Australia, occupational therapist.** Found Skwirl through **Google search**. Imported 506
  saved Instagram posts. She saves reels as ideas for therapy sessions, had tried to log them in a giant
  spreadsheet and gave up at 5%. She sorts her Instagram saved folders **by therapy goal** (fine motor,
  gross motor, executive function, emotional regulation, handwriting). She said she'd pay for a faster
  option and would tell her co-workers.
- **Steve, Pakistan.** Came from the Instagram bio link (7 Nov) and hasn't saved anything yet.

**What this means for content:**
1. **Professionals who save reels for work** are a real audience, not just "people with too many saved
   recipes": therapists, teachers, trainers, chefs, designers, marketers. "Your saved reels are your
   work library" is a strong angle. Jacinda's story is the proof.
2. **Depth is the differentiator.** Cheaper apps just bookmark the link and caption. Skwirl actually
   watches the reel (speech, on-screen text, frames). Show that, never race on price.
3. **Search matters:** a real user found Skwirl on Google. The site has 3 guides (search saved reels,
   save recipes from reels, export your saved posts) that can be turned into carousels.
4. **The Saved folder pain is still the hook:** no search, no notes, nothing tells you what a save was
   without rewatching.

**The one testimonial we may use** (Parth has Jacinda's permission, given by email 9 Nov 2026). Quote her
words exactly, attribute as **"Jacinda, occupational therapist"** (first name only, no surname, no city,
no account details, no import numbers unless Parth asks her):

> "Skwirl is honestly perfect - I couldn't believe how perfect it was when I found it haha! I'll
> definitely be letting my co-workers know about Skwirl, since it has revolutionised therapy planning
> for me."

Shorter cut that's fine: "It has revolutionised therapy planning for me." (Her own words; the banned-word
rule in INSTAGRAM_PLAN.md §0 is about our copy, not a customer's quote.)

**Lessons from piece 11 (Parth's review, 9 Nov):**
- **Every slide must set up the next one.** v1 failed: a hunt with no target, a challenge on a blurred
  slide, and "type what you remember" before Skwirl was introduced. Order that works: task up front,
  the hunt, the answer (never make people swipe back), introduce Skwirl, show the feature, CTA.
- **Don't hand-draw illustrations from scratch in SVG.** Start from an open-licence reference (e.g.
  Microsoft Fluent Emoji, MIT, github.com/microsoft/fluentui-emoji) and restyle it: brand colours plus an
  ink outline. Piece 11's 🤏 hand is done this way in `ZoomIn.tsx`.
- Centre lone visuals and footnote pills on card slides; left-aligned leftovers look unfinished.
- `tools/demo/shots.cjs` now hides the prompt cards (the "How did you find Skwirl?" card shows TikTok) and
  also takes `search-pasta.png`. Re-take screenshots before a piece; old ones said "Unused".
- AirDrop to Parth's phone: a tiny Swift script with `NSSharingService(named: .sendViaAirDrop)` works
  from Bash (opens the picker, he picks the iPhone).

**Parth's preferences (from feedback across sessions):**
- **Max effort from the first draft.** Every Reel gets voiceover, music cut to the beat, sound design and
  real motion. Never a silent slideshow or "add a sound in-app" placeholder.
- **The voiceover must sound like natural English.** Split Kokoro clips only at sentence ends, never at
  commas or quotes; give ambiguous words a phoneme override (e.g. `[read](/ɹˈɛd/)`); print and read
  Kokoro's phonemes before rendering; no lines that only work with human intonation. The book Reel
  needed three voiceover passes because of this; `tts/generate_books_vo.py` is the reference pattern.
- **Mix properly:** voice about -16 LUFS, music ducked about 9 LU under the voice while she speaks
  (BookList.tsx `duck()` is the reference), final master **-14 LUFS** with the cover on frame 0.
- **Script first, then evaluate against the checklist, then build.** See `scripts/07-booklist.md`.
- **Quality over cost** applies to the product too: never suggest a cheaper or worse pipeline.
- **Draft only.** Never post, DM, email or publish anything for Parth. Hand over the files and caption.
- **No em dashes anywhere** (captions, on-screen text, VO scripts).
- Parth writes casually and fast; everything external must be polished.

## 4. What's next (content backlog, in priority order)

1. **Post or confirm piece 7** (book Reel v3, VO fixed and mastered). Caption is in `07-books/caption.txt`.
2. **A skwirl.app moment:** a Story or short Reel marking the new address. Update the Instagram bio link
   to `skwirl.app` (Parth's job) and every new caption says "link in bio".
3. **The professional angle:** "A therapist's 500 saved reels, sorted by goal" or "Your saved reels are
   your work library". Categories are live, so this can be built now, with Jacinda's quote. A version for
   teachers and trainers can follow. **Parked (9 Nov, Parth): build after the launch video and once there's
   some traction.** Hook to use: "A therapist's saved reels, from this to this" (transformation). Needs an
   OT-flavoured demo account in `tools/demo/seed.py` (categories via `PUT /v1/categories`).
3b. **Two trend pieces from the Nov 2026 trend lists:** `scripts/11-zoom-in.md` ("girl, zoom in" carousel, BUILT
   9 Nov, v2, ready to post by ~18 Nov) and `scripts/12-no-no-yes.md` ("No. No. No. Yes." Reel, scripted, NOT
   built; next piece to build).
   Both picked from the Nov 2026 trend lists to fill the relatable/demo buckets.
4. **Remaining pieces from INSTAGRAM_PLAN.md:** 4 (Ask Claude), 8 (Import tutorial), 2 ("1,215"),
   6 (Stop saving like this), 9 (2-tap loop), 10 (founder story). Re-check each brief's facts against §1
   before building. Piece 8 especially: the import limits in the brief are outdated.
5. **Guides to carousels:** the 3 site guides at skwirl.app/guides/ become saveable carousels.
6. **Plus waitlist push:** only once Parth has payments set up. Until then Plus is "coming soon,
   waitlist".

## 5. How to make a piece (the workflow)

1. **Brief:** read the piece's brief (INSTAGRAM_PLAN.md or this backlog). Check every claim against §1.
2. **Script:** `promo/scripts/NN-slug.md` with time, picture, VO line, on-screen text per beat, then an
   evaluation table (hook in 2s, one idea, open loop paid off, real UI, readable timing, CTA, music grid,
   different from earlier pieces). Show Parth the script before building if it's a new format.
3. **Build:** Remotion composition in `promo/src/insta/<Piece>.tsx`, registered in `src/insta/index.ts`.
   Reuse the kit (`src/launch/kit.tsx`: `C`, `D`, `ui`, `Ground`, `Kinetic`, `Mark`, `Phone`, `Tap`,
   `prog`, `lift`) and helpers from `FridgePOV.tsx` (`vo`, `sfx`, `Header`, `StatusBar`, `BottomNav`).
4. **Real app screens:** `promo/tools/demo/demo.sh` starts a seeded local copy (demo account "Maya") on
   http://localhost:8799. `node promo/tools/demo/shots.cjs <out dir>` takes 390x844 screenshots. Never
   show a real user's data, a real creator's reel, or anyone's face or username except Parth's own.
5. **Voice:** a new `promo/tts/generate_<piece>_vo.py` copying `generate_books_vo.py` (Kokoro-82M, voice
   `af_heart`, "Squirrel" spelling for Skwirl, per-sentence clips with pauses, phoneme print, slot
   check). Captions: `node captions/transcribe.mjs insta/<clip> ...` (pads 1s so whisper keeps the last
   words), then write the script's exact words onto whisper's timings and spell "Skwirl" correctly.
6. **Music and sound:** `public/launch/music-vol1.mp3` (Sascha Ende, CC BY 4.0, credit in the caption:
   "Music: Sascha Ende, ende.app (CC BY 4.0)"), Kenney SFX in `public/insta/`. Cut on the 120 BPM grid
   (15 frames a beat). Duck the music under the voice.
7. **Render and master:**
   `npx remotion render src/insta/index.ts <Comp> out/instagram/<NN-slug>/raw.mp4`, cover still on
   frame 0, then `ffmpeg ... -af "loudnorm=I=-14:TP=-1:LRA=9" -c:a aac -b:a 192k -movflags +faststart`
   (full command in INSTAGRAM_PLAN.md §3). Never start two renders into the same output.
8. **QA (all of it, every time):** INSTAGRAM_PLAN.md §3 checklist, plus: measure loudness per section
   (`ffmpeg -af ebur128`), check VO phonemes, look at stills of every scene, confirm captions match the
   VO word for word.
9. **Hand over:** the mp4, cover, `caption.txt` (with music credit and 3-5 hashtags), the posting time,
   and a contact sheet. Send the video to Parth with SendUserFile. Parth posts it himself.

## 6. Posting and measuring

- Posting time: 7-9pm IST (audience was assumed India-first, but the first real users are in Australia
  and Pakistan; check Instagram Insights and move to what works).
- Reply to every comment in the first hour.
- Watch **sends per reach** and the 3-second hold rate. The real metric is sign-ups.
- **Where sign-ups come from:** Skwirl's admin (owner signed in on skwirl.app → Set up → Open admin) and
  skwirl.app/analytics show visits, referrers, countries and the in-app "How did you find Skwirl?"
  answers (`found_via`). Note each post's date in `promo/out/instagram/results.md` and compare.

## 7. Hard rules for a content chat

- Don't change product code (`worker/`, `stash/`) from a content chat. If content needs a product
  change, write it down and tell Parth; it's done in a product session.
- Never stage or commit Parth's uncommitted promo files (§2). Stage your own files by name, never
  `git add -A` or `git commit -a`.
- Outputs in `promo/out/` are gitignored; scripts, compositions, VO generators and caption JSON are
  committed.
- Pushing uses Parth's GitHub account (see `HANDOFF.md`). Commit messages end with the co-author line
  the session gives you.
- Update §2 and §4 of this file before you finish.
