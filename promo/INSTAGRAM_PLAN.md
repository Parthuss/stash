# Skwirl on Instagram: the first 10 pieces

This is a production brief. Whoever builds these (human or model) follows it exactly. Where it says
**[CONFIRM]**, stop and ask Parth before publishing; those are facts only he can verify. Where it says
**Director's note**, that is the reason behind a choice. Don't "improve" a choice without that reason
changing.

Written 2026-11-04. Product facts are as of commit `f52c48c`.

---

## 0. Read this first: the rules every piece follows

### What Skwirl is (the only claims you may make)
- You share a reel or post to Skwirl (iPhone Shortcut in the share sheet, Android app from Chrome,
  the web app's + button, or the Telegram bot @skwirl_bot). A few minutes later it's a note.
- The note has: a title, a short summary, a **next step** ("Make it tonight..."), the transcript, and
  for recipes an **ingredient checklist and numbered steps**. Books, movies, places and products named
  in the reel go into **Lists**.
- It reads the audio, the text on screen, the caption and the top comments.
- Works with Instagram, YouTube and X links (tested 2026-11-05). TikTok is accepted but only the cloud
  runner can read it (TikTok is blocked in India) and that path is untested: **don't claim TikTok or
  Threads anywhere.** The launch video's swarm shows TikTok/YouTube/X/Threads labels as illustration;
  it's already published, leave it, but new pieces must not show TikTok or Threads.
- **Search by meaning**: "dinner idea tonight" finds the pasta note even though it never says "dinner".
- **ChatGPT and Claude** (and other AI apps with connectors) can search your saves and save links you
  paste into the chat. **[CONFIRM] ChatGPT has actually been tested end to end before any piece shows
  ChatGPT.** Until then, show Claude only.
- **Import old saves** from Instagram's data export (Set up → Bring in your old Instagram saves). Up to
  100 on the free shared allowance, read about 5 a day; up to 1,000 at 150 a day with your own free
  Groq key.
- "I made this" / Used: marks a note as acted on. Notes you haven't used are labelled **Unused**.
- **Free.** No paid plan, no card. Open source. Site: `skwirl.parthakholkar.com`.

Never claim: an iOS/Android store app (it's a Shortcut + web app), instant processing (it's "a few
minutes", sometimes hours), unlimited saves, any user numbers, any testimonial, any statistic about
"how many saves people never revisit" (no such study exists; we checked). Never name Stashr or any
competitor. Never show a real person's account or someone else's reel without permission: use the
demo account and the illustrated reels from the launch video.

**Real numbers you can use:** Parth's own Instagram export had **1,215 saved posts** (counted when the
import feature was built). Most are reels, so the hooks say "saved reels"; **[CONFIRM]** Parth is fine
with that wording, otherwise say "saved posts". Everything else in a piece is either demo data (the account "Maya") or
illustration, and must look like it.

### Voice
- Talk like a friend who saves too many reels, not like a SaaS ad. Short sentences. Specific nouns
  ("garlic butter pasta", "Past Lives", "Senso-ji") beat category words ("recipes", "content").
- One idea per piece. If a piece needs "and also", cut the "also".
- Light, a bit self-mocking about the Saved folder. Never smug, never "game-changer", "revolutionize",
  "unlock", "supercharge", "seamless", "effortless", "AI-powered" in copy. Never "Are you tired of",
  "You won't believe", "Here's what nobody tells you", "Common belief: X. Reality: Y" (these read as
  AI-written and are burned out in 2026).
- **No em dashes anywhere in captions or on-screen text.** Use a full stop, a comma, or a colon.
- Write "Skwirl" exactly like that. In voiceover use the spelling "Squirrel" (see §3, Kokoro reads
  "Skwirl" wrong) and correct it back to "Skwirl" in captions.

### Look (the brand kit already exists, reuse it)
- Code: `promo/src/launch/kit.tsx`. Import `C` (colours), `D` (display font style), `ui` (UI font),
  `Ground` (the lavender/peach drifting orbs), `Kinetic` (word-by-word captions on voice timing),
  `Mark` (the logo, with the tail-draw animation), `Pill`, `Phone`, `Tap`, `prog`, `lift`.
- Colours: ink `#1d1b2e`, background `#f8f7ff`, lavender `#dcd8ff`, mint `#cdf3e1`, peach `#ffd8cb`,
  sky `#d6ebff`, butter `#fff0c4`, coral `#ff7a59` (the acorn; use sparingly, for one accent per
  frame).
- Type: **Recursive Casual 800** (`...D`) for headlines and big words; **Rethink Sans** (`ui`) for
  everything small. Never use Recursive for small text, never use any other font.
- Dark moments use ink `#1d1b2e` as the background with white text (see the "reads" scene in the
  launch video). Use dark for at most one beat per piece; it's the contrast that makes it land.

### Format specs (Instagram, Nov 2026)
- **Reels:** 1080×1920, 30fps, H.264, AAC, `-movflags +faststart`. Keep it 7-35 seconds unless the
  brief says otherwise.
- **Reel safe zone:** keep all text and key UI between **y = 250 and y = 1500**, and **x = 60 to 960**.
  The top has the "Reels" header, the bottom ~420px has the caption, username and audio line, the
  right ~120px has the like/comment/share buttons.
- **Profile grid crop is 3:4.** The middle 1080×1440 of the cover frame (y 240 to 1680) must read on its
  own: headline + one visual. Design every cover with that crop in mind.
- **Carousels:** 1080×1350 (4:5) PNG, 6-10 slides. Slide 1 is the hook and has to work as a single
  image in the feed. The last slide is the CTA.
- **On-screen text is mandatory** on every Reel: most people watch muted. The `Kinetic` component does
  this from the voice timestamps.
- **First frame:** the hook text is visible in frame 0 (not faded in). People decide in about one
  second. The launch video's poster-on-frame-0 trick (§3) does this.

### What the research says is working right now (Nov 2026), and how this plan uses it
Sources are mostly marketing blogs, so treat numbers as directional. The consistent signals:
1. **Instagram ranks on watch time, likes per reach and sends per reach** (Adam Mosseri, still the
   stated top signals in 2026). Sends (DM shares) matter a lot for reaching non-followers. So every
   piece has a reason to be **sent to a specific friend** ("the friend who saves recipes and never
   cooks"). That's the CTA on most pieces, not "follow for more".
2. **Reels reach more non-followers; carousels get more saves and engagement from people who already
   follow you.** Plan mix: 7 Reels, 3 carousels.
3. **Completion and rewatches drive Reels.** Short (7-15s) loopable pieces complete more; 20-35s pieces
   need a reason to stay (a list, a reveal, a payoff at the end). Pieces 9 and 10 are built to loop.
4. **Raw beats polished for relatability, but demos must be crisp.** Founder-voice and "POV" pieces can
   be lo-fi; product demos use the real app, sharp, no fake UI.
5. **Hook patterns that are working:** specific-scene cold open ("11:40pm. Fridge open."), a number
   that demands explanation ("1,215."), direct address with a stake, tease and reveal, list promise,
   and "send this to [specific person]". Keep spoken hooks under ~8 seconds, written hooks under 15
   words.
6. **Original content only.** Since April 2026 Instagram pulls accounts that mostly repost others'
   content out of recommendations. Everything here is original; never screen-record someone else's
   reel.
7. **Instagram now has a Reels watch history** (late 2025). Don't claim "Instagram has no way to find a
   reel again". The true pain is different: the Saved folder has no search, no notes, and nothing
   tells you what's inside a save without rewatching it. Say that.
8. **Trial Reels** (shown only to non-followers first) are the cheap way to test hooks. Use them for
   the A/B hooks in pieces 2 and 5 (§5).
9. **Holiday audio is rising from November.** Don't chase it for product pieces, but piece 5 can ride a
   trending sound if one fits (choose in-app at posting time, not baked into the file).

---

## 1. The account (do this before piece 1)

- **Profile picture:** `promo/out/instagram/skwirl-pfp.png` (lavender, main). Alternative for later:
  `skwirl-pfp-dark.png`. Both are 1080×1080, mark centred inside the circle crop.
- **Name field** (searchable, so put the keyword in it): `Skwirl · saved reels, finally useful`
- **Username:** **[CONFIRM]** which handle Parth registered. Write it in every caption as `@{HANDLE}`.
- **Bio** (150 chars max):
  ```
  Share a reel. Get a note you can use.
  Recipes → steps. Books & movies → lists.
  Ask ChatGPT or Claude what you saved. Free.
  ```
  (If ChatGPT isn't confirmed yet, last line: `Claude can search it. Free, no card.`)
- **Link:** `https://skwirl.parthakholkar.com`
- **Account type:** Creator, not Business. **[CONFIRM]** Business accounts get a smaller music library,
  which matters for piece 5.
- **Story highlights** (make after pieces 1, 4, 8 are posted; covers are lavender circles with one white
  emoji): `How it works` (piece 1), `Ask AI` (piece 4), `Import` (piece 8), `Recipes`, `Lists`.
- **Pinned posts (top 3 of the grid):** piece 1 (launch), piece 4 (ask AI), piece 3 (graveyard
  carousel).

---

## 2. The 10 pieces

Order is the posting order (§4). Each one says: format, length, goal, hook, script, shot list, on-screen
text, audio, cover, caption, and how to build it.

---

### Piece 1: Launch video, portrait cut (Reel, 31s)

**Status: DONE (2026-11-04).** Built as the `SkwirlLaunchVertical` composition (same component as the
landscape cut; layout branches on `tall` inside `SkwirlLaunch.tsx`). Output:
`promo/out/instagram/01-launch/skwirl-launch-vertical.mp4` + `cover.jpg` + `caption.txt`. The brief below
is kept as the record of how; skip to piece 2.

**Goal:** the pinned explainer. Everything else points back to it.
**Source:** the existing landscape `SkwirlLaunch` (`promo/src/launch/SkwirlLaunch.tsx`, 1920×1080,
930 frames). Same voiceover clips, same captions JSON, same music and SFX timings, same scene timings
(`S` and `VO` constants). **Do not re-time anything.** This is a re-layout, not a re-edit.

**Build:** create `promo/src/launch/SkwirlLaunchVertical.tsx` and register
`<Composition id="SkwirlLaunchVertical" component={SkwirlLaunchVertical} durationInFrames={930} fps={30} width={1080} height={1920} />`
in `promo/src/Root.tsx`. **Root.tsx has Parth's own uncommitted changes (MetaPromo, ReceiptsPromo):
add one line, touch nothing else, and don't commit his other files.**

Cleanest approach: refactor the scene components to read the frame size from `useVideoConfig()` and
branch layout on `const tall = height > width`. If that gets messy, copy the file and edit the copy.
Either is fine; a working copy beats a clever refactor.

Per-scene layout for 1080×1920 (centre x = 540; safe zone y 250-1500):

| Scene (frames) | Landscape today | Portrait layout |
|---|---|---|
| 1. Hook wall (0-126) | 12-column tilted wall, headline 132px centred | Wall: 6 columns, tiles same size, wall width ~1400 so it overflows both sides, same tilt. Headline 112px, centred at y≈760, `breakAfter={[3]}` stays ("You save a reel, / then you never see it again."). Check the second line fits in 960px; if not, drop to 100px. |
| 2. Reveal (120-210) | Mark 280 + wordmark 250px in a row | **Stack vertically**: mark 340px centred at y≈700, "Skwirl" 210px centred below it at y≈1000. The wordmark wipe (clipPath) stays; the sideways slide becomes a slide up (translateY instead of translateX). |
| 3. Share (210-362) | Reel card 520×924 centred, headline at top, swarm into mark at (960,640) | Reel card **640×1138** centred at (540, 960); it fills most of the frame, which is the point. Headline at top y≈260, 104px, two lines: `breakAfter={[1]}` ("Share any / reel to it."). Mark position `MX=540, MY=900`. Swarm radius 1250 still works. "Saved to Skwirl" pill at y≈1180. Iris from (540, 900). |
| 4. Reads (360-545) | Layer stack centre (960,640), labels to the right of each layer | Stack centred at (540, 980), cards 380×676. There's no room for labels to the right, so **rotate the stack the other way** (`rotateY(+38deg)`, layers fan to the right) and put each label **to the left of its layer**, right-aligned to the layer's edge, starting at x≈60. Note card 640 wide, top at y≈520. Headlines at y≈260, 96px, part 2 `breakAfter={[2, 5]}` ("and hands you / a note you can / actually use."). |
| 5. Lists (540-690) | 5 fanned step cards in a row; 6 covers on a shelf | Step cards 260×350, fan **tighter**: `x = k * 150`, rotate `k * 9`. Covers: **2 rows of 3** on two shelves at y 1000 and 1360 (the second shelf sits just inside the safe zone), cover size 260×380, gap 30. Keep the drop-and-bounce, staggered so the first row lands on "land" (frame ~636) and the second row 6 frames later. Headline at top, 104px, `breakAfter={[2]}` for part 2. Count pill at y≈1450. |
| 6. Claude (690-780) | Chat window 1180 wide | Chat window **960 wide**, top at y≈560, text 34px, answer box minHeight 260. Headline at y≈300, 96px, `breakAfter={[2]}` ("And Claude can / search all of it."). |
| 7. Outro (780-930) | Logo row, line, URL pill | Mark 220 above wordmark 180 (stacked), line at 76px wrapped to 2 lines, URL pill at y≈1300. |

**Cover / frame 0:** render a still at frame **905** (the outro) exactly like the landscape pipeline,
and overlay it on frame 0. In the 3:4 grid crop the logo + line must be inside y 240-1680 (they are, if
you follow the table).

**Render** (from `promo/`):
```bash
npx remotion render SkwirlLaunchVertical out/instagram/01-launch/raw.mp4
npx remotion still SkwirlLaunchVertical out/instagram/01-launch/cover.jpg --frame=905 --image-format=jpeg
ffmpeg -i out/instagram/01-launch/raw.mp4 -i out/instagram/01-launch/cover.jpg -filter_complex "[0:v][1:v]overlay=enable='eq(n,0)'[v]" -map "[v]" -map 0:a -c:v libx264 -crf 18 -pix_fmt yuv420p -af "loudnorm=I=-14:TP=-1:LRA=9" -c:a aac -b:a 192k -movflags +faststart out/instagram/01-launch/skwirl-launch-vertical.mp4
```
Then delete `raw.mp4`. **Never start a second render into the same output while one is running**
(it corrupts the file; this happened once).

**QA:** render stills at frames 60, 170, 250, 300, 400, 470, 600, 650, 740, 900 at `--scale=0.5`, tile
them, and check every text block is inside the safe zone and nothing clips. The book covers' titles
("Four Thousand Weeks") must not wrap to 4 lines; shrink to 32px if they do.

**Audio:** the baked-in music is "Business Moves Vol. 1" by Sascha Ende, CC BY 4.0: the caption **must**
credit it (below). Don't add Instagram audio on top.

**Caption:**
```
You save a reel. Then you never see it again.

Skwirl reads the reels you save and turns each one into a note you can actually use: recipes become steps, books and movies land in a list, and Claude can search all of it.

Free, no card. Link in bio.

Send this to the friend whose Saved folder is 900 recipes deep.

Music: Sascha Ende, ende.app (CC BY 4.0)
#savedreels #instagramtips #productivityapp #recipeideas #booklist
```

---

### Piece 2: "1,215" (Reel, founder voice, 18-22s)

**Goal:** the human origin story in one number. Builds trust, gets follows.
**Hook pattern:** number that demands explanation.
**[CONFIRM] with Parth:** (a) the 1,215 figure is fine to share, (b) the line "I'd cooked maybe two of
the recipes" is true (replace with his real version), (c) face on camera or faceless.

**Script (voiceover, Parth's own voice if he'll record it on his phone; Kokoro `af_heart` if not):**
```
1,215.
That's how many reels I had saved on Instagram.
I'd cooked maybe two of the recipes.
So I built something that watches them for me,
and writes down the part I actually needed.
Now I just search it. Or ask Claude.
It's called Skwirl. It's free.
```

**Shot list (faceless version, build in Remotion, 1080×1920):**
| Time | Picture | On-screen text |
|---|---|---|
| 0.0-1.5s | Black ink background. Giant counter "1,215" in Recursive 800, 300px, coral. It's already at 1,215 on frame 0 (hook visible immediately), with a tiny number-roll flicker on the last two digits. | `1,215` |
| 1.5-4.0s | The counter shrinks to the top (y≈300); below it, the illustrated reel wall from the launch hook (reuse `Wall` from `SkwirlLaunch.tsx`, portrait version from piece 1) scrolls up endlessly. | `saved reels.` (Kinetic) |
| 4.0-6.5s | Wall goes grey (the existing "dead" effect). One tile, the 🍝 one, stays in colour and pulses. | `I'd cooked maybe 2 of the recipes.` |
| 6.5-11s | Hard cut to background `#f8f7ff` + `Ground`. The 🍝 tile flies to centre and flips into the real note screenshot (`out/instagram/shots/note.png`) in a rounded card, no phone frame. Scroll it to the ingredients. | `So I built something that watches them for me` |
| 11-14s | Search bar types "dinner idea tonight" (use `search-dinner.png`) and the pasta card is the result. | `Now I just search it.` |
| 14-17s | The Claude chat card from the launch (reuse `Claude` component layout, portrait size). | `Or ask Claude.` |
| 17-20s | Outro: mark + "Skwirl" stacked, "Free. Link in bio." pill. | `It's called Skwirl. It's free.` |

**Face version:** Parth, phone propped at eye level, natural light, saying the script in one take,
with the same on-screen text burned in and the screenshots as B-roll cut-ins (picture-in-picture,
lower half). Lo-fi is right for this one. **Director's note:** founder-face pieces build more trust than
any animation; if he's willing, do the face version and keep the faceless one as a backup.

**Audio:** voice up front; a quiet bed under it (Sascha Ende track from `public/launch/music-vol1.mp3`
at -24 LUFS under the voice, credit in caption) or no music and add a calm Instagram track in-app at
10% volume.

**Hook A/B (post as Trial Reels first, §5):**
- A: `1,215 saved reels. I'd cooked 2 of the recipes.`
- B: `I counted my saved reels. Big mistake.`

**Caption:**
```
1,215 saved reels. I'd cooked maybe 2 of the recipes.

So I built Skwirl: share a reel to it and a few minutes later it's a note. The recipe as a checklist. The book it mentioned in a list. Searchable, and Claude can read it too.

It's free. Link in bio.

How many are in your Saved folder? Guess before you check.
#savedreels #buildinpublic #indiehacker #instagramtips
```
**Director's note:** the closing question is there to drive comments with a number in them; reply to
every comment in the first hour.

---

### Piece 3: "Your Saved folder is a graveyard" (Carousel, 8 slides)

**Status: DONE (2026-11-07).** `src/insta/Carousels.tsx` (own entry `src/insta/index.ts`, so `src/Root.tsx` is untouched); output `out/instagram/03-graveyard/01-08.png` + `caption.txt`. Render: `npx remotion still src/insta/index.ts C3-1 out/instagram/03-graveyard/01.png`. Posted first (7 Nov) as the low-stakes test; the launch Reel moved to Wed 11 Nov.

**Goal:** relatable + saves. The carousel people send to friends.
**Format:** 8 PNGs, 1080×1350. Build as Remotion `<Still>` compositions in a new file
`promo/src/insta/Carousels.tsx` (one composition per slide, ids `C3-1` ... `C3-8`), render with
`npx remotion still C3-1 out/instagram/03-graveyard/01.png` etc.

**Design system for all carousels:** background `#f8f7ff` with `Ground`; a lavender rounded rectangle
"card" 940×1190 centred; headline Recursive 800 at 88-110px; body Rethink Sans 40px, ink at 80%; a small
`Mark` 56px + "Skwirl" 36px at the bottom-left of every slide (y≈1260) and a slide counter "3/8" at the
bottom-right in Rethink Sans 30px muted. One emoji or one illustration per slide, never more.

| # | Headline | Body / visual |
|---|---|---|
| 1 | `Your Saved folder is a graveyard.` | The illustrated reel tiles (from the launch hook) in a grid, desaturated, with tiny 🪦 on three of them. This slide must work alone in the feed: big type, dead-simple. |
| 2 | `The pasta you saved in March.` | One tile, 🍝, "Saved 8 months ago". Body: `Still haven't made it. Can't find it either.` |
| 3 | `The 5 books "that changed my life".` | Five little book spines in pastel. Body: `You remember there were five. You remember zero titles.` |
| 4 | `That café in Tokyo.` | 📍 tile. Body: `Somewhere between a gym reel and a meme.` |
| 5 | `Saving feels like doing.` | Plain slide, big type, ink background, white text. Body: `It isn't. It's a bookmark you'll never open.` **Director's note:** this is the turn; dark slide = the one beat of contrast. |
| 6 | `What if every save came back as a note?` | The real note screenshot (`note.png`), cropped to the top ~60%, in a rounded card with a soft shadow. |
| 7 | `Recipes become steps. Books land in a list.` | Two screenshots side by side, slightly overlapping: the ingredient checklist (crop of `note-full.png`) and `lists.png`. |
| 8 | `Skwirl. Free. Link in bio.` | Mark 260px + wordmark. Body: `Send this to the friend with 900 saved recipes.` |

**Caption:**
```
Saving feels like doing. It isn't.

Skwirl turns each reel you save into a note: recipes as steps, books and movies in a list, all searchable. Free, link in bio.

Send this to the friend whose Saved folder needs a funeral.
#savedreels #instagramtips #productivity #recipeideas
```

---

### Piece 4: "I asked Claude what I saved" (Reel, screen recording, 15-20s)

**Goal:** the "wow" demo. The single most differentiating thing we have.
**Hook pattern:** tease and reveal.
**Format:** a **real** screen recording, not an animation. **[CONFIRM]** which app: Claude by default;
ChatGPT only after Parth has tested the connector.

**Setup (Parth does this on a computer, or a model with computer access):**
1. Run `promo/tools/demo/demo.sh` (local demo account Maya with 6 notes) **or** use Parth's real
   account if he's happy to show it **[CONFIRM]**. The demo is safer.
2. For a local demo the connector address is `http://localhost:8799/mcp`, which Claude.ai can't reach.
   So for this piece use **Parth's real account** on `https://skwirl.parthakholkar.com/mcp`, after he
   saves a few clean, shareable reels (a recipe, a book list, a travel tip) so the answers look good.
3. Record the Claude **phone app** with iOS screen recording (portrait, no cropping needed), or the
   desktop app with Screen Studio / QuickTime and crop to 1080×1920 later.

**Script (what to type, exactly):**
- Prompt 1: `What was that pasta recipe I saved?` Let it search Skwirl and answer. Keep the "Searched
  Skwirl" tool chip visible.
- Prompt 2 (optional, only if it fits in 20s): `Make me a shopping list for it.`

**Edit (Remotion, 1080×1920):** put the screen recording in the centre at 92% width with rounded
corners; `Ground` behind; speed up the waiting parts to 2-3× but **never fake the answer**. Add a
`Tap` ring on the send button.

| Time | On-screen text (top, y≈280, Recursive 800, 72px, ink on a white pill) |
|---|---|
| 0-2s | `I forgot what I saved. So I asked Claude.` (on frame 0) |
| 2-8s | (none; let the typing play) |
| 8-14s | `It searched my saved reels.` (when the tool chip appears) |
| 14-18s | `Free. Link in bio.` |

**Audio:** no voiceover. Soft keyboard clicks (`public/launch/sfx-click_001.ogg`), one `sfx-select_008`
when the answer lands, plus a calm Instagram track added in-app.

**Caption:**
```
I couldn't remember the recipe. Claude could.

Skwirl turns your saved reels into notes, and Claude (or ChatGPT) can search them for you. Set up takes 2 minutes, it's free. Link in bio.

Send this to someone who screenshots recipes and never finds them.
#claudeai #aitools #savedreels #productivityapp
```

---

### Piece 5: "11:40pm. Fridge open." (Reel, POV skit, 9-12s, loop)

**Status: DONE (2026-11-07), v2 (34.6s).** Script + evaluation: `scripts/05-fridge-v2.md`. Build: `src/insta/FridgePOV.tsx` (composition `FridgePOV` in `src/insta/index.ts`), VO `tts/generate_fridge_vo.py` (name is its own clip, for the pause), captions `src/insta/captions/f2-*.json` (hand-fixed). Output `out/instagram/05-fridge/fridge-pov.mp4` (-14 LUFS) + `cover.jpg` + `caption.txt` (music credit required).

**Goal:** pure relatable reach. Trend-friendly, sends.
**Hook pattern:** specific-scene cold open / POV.
**Format:** lo-fi. Either Parth films it on his phone (preferred), or faceless with text over a
fridge-light video **[CONFIRM]**.

**Beat sheet (filmed version):**
| Time | Picture | On-screen text |
|---|---|---|
| 0-2s | Dark kitchen, fridge door opens, face lit by fridge light, staring. | `11:40pm. I know I saved a pasta recipe.` |
| 2-6s | Close-up of thumb frantically scrolling the Instagram Saved grid (**record Parth's own Saved folder only, blur any other creators' faces/usernames**, or use the illustrated tiles composited over a phone). | `Scrolling past 400 gym reels` |
| 6-8s | Gives up, opens Skwirl, types "pasta". The pasta card appears. | `...` then `oh.` |
| 8-10s | Fridge closes. Cut back to frame 0 so it loops. | `Skwirl. Link in bio.` |

**Audio:** this one should ride a trending sound. At posting time pick a currently trending
"realisation / relief" sound from Instagram's audio tab (check it's available for the account type).
No voiceover.

**Hook A/B (Trial Reels):** A `11:40pm. I know I saved a pasta recipe.` / B `POV: you finally want to
cook something you saved`.

**Caption:**
```
It was 3 months ago. Somewhere between a gym reel and a meme.

Skwirl turns saved reels into notes you can search. Free, link in bio.

Tag the friend who does this every night.
#relatable #savedreels #midnightsnack #recipeideas
```

---

### Piece 6: "Stop saving reels like this" (Carousel, 7 slides, educational)

**Goal:** authority + saves. Useful even to people who never use Skwirl, which is why it gets saved.
**Hook pattern:** direct address with a stake (myth-bust/do-don't angle).
**Build:** same carousel system as piece 3 (`C6-1` ... `C6-7`).

| # | Headline | Body |
|---|---|---|
| 1 | `Stop saving reels like this.` | Visual: a phone with the Saved folder grid, a big red ✕ (coral). |
| 2 | `1. Save it with a reason.` | `Before you tap save, say why: "make Sunday", "gift idea for Riya". A save without a reason is a save you'll skip.` |
| 3 | `2. One home, not ten collections.` | `Collections feel organised. You won't remember which one you used.` |
| 4 | `3. Pull out the one useful part.` | `The recipe, the book title, the café name. That's what you needed, not the 40-second video.` |
| 5 | `4. Give it a next step.` | `"Buy parmesan." "Book the table." A save with a next step gets used.` |
| 6 | `Or let Skwirl do 1 to 4.` | Screenshot of the note's "Next step" section + "I made this" button (crop of `note.png`). `Share the reel. It writes the summary, the steps, the list and the next step for you.` |
| 7 | `Free. Link in bio.` | `Save this so you actually use it.` (yes, the joke is intentional) |

**Caption:**
```
4 habits that make saved reels actually useful (the last slide does them for you).

Save this, then send it to the friend with 800 saved recipes.
#instagramtips #productivitytips #savedreels #organisation
```

---

### Piece 7: "Every book from every reel, one list" (Reel, 12-15s, product demo)

**Status: DONE (2026-11-07), as "40 book reels. 0 books read." (31.8s).** Script + evaluation: `scripts/07-booklist.md`. Build: `src/insta/BookList.tsx` (composition `BookList`), VO `tts/generate_books_vo.py`, captions `src/insta/captions/b-*.json`. Output `out/instagram/07-books/book-list.mp4` + `cover.jpg` + `caption.txt`.

**Goal:** show Lists, the feature people don't expect. Book and film audiences share lists a lot.
**Hook pattern:** list promise / satisfying reveal.

**Build (Remotion, 1080×1920):** a vertical "rain" of the illustrated reel tiles (books/movies themed:
📚 🎬 📖 🍿) falls from the top; each tile, as it passes the middle, drops out a book or movie cover
(reuse the `COVERS` style from the launch's ListScene) that lands on a growing shelf. At the end, cut to
the real `lists.png` screenshot full-height in a rounded card, slow push-in.

| Time | On-screen text |
|---|---|
| 0-2s | `Every "books that changed my life" reel you saved.` (frame 0) |
| 2-8s | `In one list.` (as the shelf fills) |
| 8-12s | `Tick them off as you read.` (show a check appearing on Atomic Habits in the screenshot; it's already ticked in the demo data) |
| 12-15s | `Skwirl. Free. Link in bio.` |

**Audio:** Kokoro VO optional: "Every book from every reel you saved. In one list." Otherwise music
only (Sascha Ende track, credit), plus `sfx-drop_002` on each landing at low volume.

**Caption:**
```
Every book and movie from every reel you saved, in one list. Skwirl pulls the titles out for you.

Free, link in bio. Send this to your reading buddy.
#booktok #bookstagram #booklist #movielist #savedreels
```

---

### Piece 8: "Get back every reel you ever saved" (Reel, tutorial, 25-30s)

**Goal:** utility + sends. This is the most "save this for later" piece.
**Hook pattern:** direct address + tutorial.
**Format:** real screen recordings, step by step, on Parth's iPhone **[CONFIRM]** (the Instagram export
steps change between app versions; record what the current app actually shows, and fix the text if
the menu names differ).

| Time | Picture | On-screen text (top pill) |
|---|---|---|
| 0-2s | Instagram Saved grid scrolling fast (Parth's own) | `Your saved reels are stuck in here. Here's how to get them out.` |
| 2-10s | Recording: profile → ☰ → Accounts Center → Your information and permissions → Export your information → Create export → Export to device → Customize information: only **Saved** → Format **JSON** → Start | Step numbers 1-5 in coral circles as each tap happens |
| 10-13s | The "your export is ready" email/notification (blur the email address) | `Instagram sends it in a few hours.` |
| 13-22s | Skwirl → Set up → Bring in your old Instagram saves → Choose export file → pick the ZIP → "Added 100 old saves" | `Drop the file into Skwirl.` |
| 22-28s | Library filling with notes (use a time-lapse of real notes appearing, or the demo library) | `They come back as notes. Searchable.` |

**Honesty rule:** say "they come back over the next days" if asked in comments; on the free shared
allowance it's about 5 a day (faster with a free Groq key). Don't imply instant.

**Caption:**
```
How to get every reel you ever saved out of Instagram (and make them useful).

1. Accounts Center → Your information and permissions → Export your information
2. Pick only "Saved", format JSON
3. Drop the ZIP into Skwirl (Set up → Bring in your old Instagram saves)

They come back as searchable notes. Free, link in bio.
Save this for when the export email arrives.
#instagramtips #instagramhacks #savedreels #techtips
```

---

### Piece 9: "Save in 2 taps" (Reel, 7-8s, perfect loop)

**Goal:** completion rate + rewatches. A tiny satisfying loop.
**Hook pattern:** satisfying / "wait for it".

**Build (Remotion, 1080×1920, 240 frames):** reuse the share scene from piece 1 but cut to the bone:
reel fills frame (0-1s) → share sheet up (1-2s) → tap Skwirl (2s) → reel shrinks into the mark with
the swarm (2-4s) → mark pops, the note card unfolds from it (4-6.5s) → the note folds back into a
reel tile and the tile **becomes frame 0's reel** (6.5-8s). The last frame must match frame 0 exactly
so it loops invisibly.

On-screen text: just one line on frame 0, kept the whole time: `2 taps. Then it's a note.`

**Audio:** SFX only (`sfx-click_001` on tap, `sfx-select_008` on save, `sfx-drop_002` on unfold) and a
trending sound added in-app. No voice.

**Caption:**
```
Share. Tap. That's it. A few minutes later it's a note.
Skwirl, free, link in bio.
#savedreels #satisfying #productivityapp
```

---

### Piece 10: "I built this alone, and it's free" (Reel or carousel, founder story, 25-35s)

**Goal:** the brand piece. Why it's free, who made it, what's next. Turns viewers into fans.
**Format:** **[CONFIRM]** Parth talking to camera (best), or a 6-slide carousel if he won't.

**Script (talking head, one take, Ahmedabad setting is a plus, don't hide it):**
```
I'm Parth. I built Skwirl alone, over a few weekends, because my Saved folder had 1,215 reels and I'd used almost none.
It reads every reel you share to it, the audio, the text on screen, even the comments, and writes you a note.
It's free. There's no paid plan, and you don't need a card.
It's open source too, so if you're a developer you can run your own.
If you try it, tell me what's broken. I read every DM.
```
**[CONFIRM]** "over a few weekends" (replace with the true timeframe) and "I read every DM" (only if he
will).

On-screen text: key phrases only, top pill: `Built by one person` → `Reads the whole reel` → `Free. No
card.` → `Open source` → `DM me what's broken`. B-roll cut-ins (lower third, rounded): the GitHub repo
page, the note screenshot, the library.

**Carousel fallback (6 slides):** 1 `I built an app alone. It's free.` (photo of Parth, or the logo on
ink) · 2 `Why: 1,215 saved reels, almost none used.` · 3 `What it does` (note screenshot) · 4 `Why it's
free` (`It runs on free tiers. No ads, no data sold.`) · 5 `Open source` (repo screenshot) · 6 `Try it,
then tell me what's broken. Link in bio.`

**Caption:**
```
I built Skwirl alone because my Saved folder had 1,215 reels in it.

It reads the reels you share to it and gives you notes you can use: recipes as steps, books in a list, searchable, and Claude can read them. It's free and open source.

If you try it, DM me what's broken. I read every one.
#buildinpublic #indiehacker #madeinindia #savedreels #opensource
```

---

## 3. How to produce (tools already in this repo)

### Real app screenshots
```bash
promo/tools/demo/demo.sh                                   # local Skwirl + demo account "Maya", 6 notes
node promo/tools/demo/shots.cjs promo/out/instagram/shots  # library, search-dinner, note, note-full, lists (390x844 @2x)
pkill -f "wrangler dev"                                     # when done
```
To show different content, edit `promo/tools/demo/seed.py` (titles, summaries, ingredients, mentions)
and its covers (`promo/tools/demo/covers/*.jpg`, 360×270 emoji-on-gradient). Keep the demo content
plausible and generic; never use a real creator's name or reel.

### Voiceover (free, local)
- Kokoro-82M: copy `promo/tts/generate_launch_vo.py` to a new script per piece, voice `af_heart`, speed
  1.05. Spell the name "Squirrel". Output 24 kHz WAV into `promo/public/insta/`.
- Normalise each clip to -16 LUFS: `ffmpeg -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=7 out.wav`.
- Word timings: `CLIP_DIR=insta OUT_DIR=src/insta/captions node captions/transcribe-launch.mjs <clip names>`
  (whisper.cpp medium.en), then hand-fix "Squirrel" → "Skwirl" in the JSON.
- Feed the JSON into `Kinetic` exactly like `SkwirlLaunch.tsx` does (`voAt` = the frame the clip starts).

### Video
- New Reels go in `promo/src/insta/` (one file per piece) and are registered in `promo/src/Root.tsx`
  (add your lines only; Root.tsx has Parth's uncommitted work in it).
- 1080×1920, 30fps. Every scene starts on a beat of the 120 BPM music grid (15 frames) if music is
  baked in.
- Final pass always: overlay the cover still on frame 0, `loudnorm=I=-14:TP=-1:LRA=9`, H.264 CRF 18,
  `+faststart` (command in piece 1).
- Outputs go in `promo/out/instagram/<NN-slug>/` (gitignored): the mp4, `cover.jpg`, and
  `caption.txt` with the exact caption text.

### Carousels
- `promo/src/insta/Carousels.tsx`, one `<Still>` per slide, 1080×1350, rendered with
  `npx remotion still <id> out/instagram/<NN-slug>/<nn>.png`.

### QA before handing anything to Parth (every piece)
- [ ] Frame 0 shows the hook text.
- [ ] All text inside the safe zone (Reels: y 250-1500, x 60-960). Cover readable in the 3:4 crop.
- [ ] Only Recursive Casual (big) and Rethink Sans (small). No other fonts, no Recursive below ~40px.
- [ ] No em dashes in on-screen text or caption. No banned words (§0 Voice).
- [ ] Every claim is on the §0 list. Every **[CONFIRM]** is resolved or flagged in your handoff note.
- [ ] Music credit in the caption if the Sascha Ende track is used.
- [ ] No real person's reel, face or username that isn't Parth's own.
- [ ] Contact sheet of 8-12 stills sent with the video, so Parth can review in 10 seconds.

---

## 4. Posting schedule (3 weeks, start the day the account is set up)

Post at **7-9pm IST** (Parth's audience is India-first); check Insights after week 1 and move to the
best hour. Reply to every comment in the first hour: early engagement matters most (about 70% of a
Reel's views come in its first 72 hours).

| Day | Piece | Why here |
|---|---|---|
| 1 | 1. Launch (portrait) | Pin it. Everything links back to it. |
| 2 | 3. Graveyard carousel | Relatable, gets the first saves and sends from friends. |
| 4 | 2. "1,215" | The human story while people are still curious. |
| 6 | 4. Ask Claude | The wow demo once people know what Skwirl is. Pin it. |
| 8 | 7. Books list | Book/film audiences, a new circle. |
| 10 | 6. Stop saving like this | Educational, saveable. |
| 12 | 8. Import tutorial | Best when people already like the idea. |
| 14 | 5. Fridge POV | Pure reach, trend sound. |
| 16 | 9. 2-taps loop | Short, loops, completion. |
| 19 | 10. Founder story | Closes the first run, invites DMs. |

Between posts: 1-2 Stories a day (behind the scenes, a poll "how many saved reels do you have?", reshare
each new post to Stories with a "new" sticker).

## 5. Testing and measuring

- **Trial Reels** for pieces 2 and 5: post hook A as a Trial Reel, hook B as another Trial Reel the
  same evening; after 24h, publish the winner to followers (Instagram lets you share a trial reel to
  followers afterwards). Winner = higher 3-second hold rate, then sends.
- **Read per piece after 72h:** views, 3-second hold rate (aim ≥ 50%), average watch time vs length,
  **sends per reach** (the one to optimise), saves, profile visits, link taps.
- **The real metric is sign-ups.** Skwirl's admin page shows new users; note each post's date next to
  sign-up spikes in `promo/out/instagram/results.md`.
- After piece 10, write one paragraph in `results.md`: which hook pattern won, which format, which
  topic. Make the next 10 from the winners.

---

Sources for §0 research (Nov 2026): [Napoleon Cat, Reels trends](https://napoleoncat.com/blog/instagram-reels-trends/),
[SocialPilot, trending audio](https://www.socialpilot.co/blog/instagram-reels-trends),
[Buffer, algorithm guide](https://buffer.com/resources/instagram-algorithms/),
[Reeldrop, confirmed ranking signals](https://www.reeldrop.io/learn/instagram-algorithm),
[Creatorhouse, 6 hook patterns](https://creatorhouse.app/blog/instagram-reel-hooks-2026),
[Blitzcut, hooks that drive shares](https://blitzcutai.com/blog/best-instagram-reels-hooks-2026),
[Metricool, Reels guide](https://metricool.com/instagram-reels-guide/),
[Beebom, Reels watch history](https://beebom.com/instagram-now-saves-reels-watch-history-never-lose-a-recipe-or-meme/).
