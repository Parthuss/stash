# Skwirl ideas backlog

Refreshed 12 November 2026 from a real ideation, twelve-hook-per-idea, structured-script and independent-editor run. Sources, ten takeaways and repo decisions: [quality playbook](research/2026-11-12-quality-playbook.md). Machine drafts: [quality-run](research/quality-run-2026-11-12.json). [Independent editor reports](research/quality-judges-2026-11-12.json). Maker contract: [INTEGRATION.md](playbooks/INTEGRATION.md).

These are **draft plans, not approved or posted content**. Five pass copy/style/structure/lexical recency; the separate Sonnet editor scored each at least4/5 on hook strength, two-second clarity, payoff, originality and brand fit. No video or carousel was rendered. No media/viewer PASS is claimed. Before staging, the Maker must capture the real controlled demo and pass the complete quality gate. No performance data supports calling any of these a winner.

The first generated set was rejected as derivative. Source review then uncovered underused features: public note links, revocation, JSON export, cached-note rereading and manual category correction. Earlier drafts and failed reviews remain in research for audit. Audience questions below are editorial hypotheses, not invented user interviews.

## Current top five

The ranking balances distinct questions and useful demonstrations, not predicted reach. No slots are scheduled. The two public-link pieces should run in different weeks. Keep professional campaigns parked. Use the draft id as schedule.json's idea_id so the recency reader can exclude its own brief while retaining other drafts/posts.

| ID | Rank | Best hook | Format | Grounded payoff |
|---|---|---|---|---|
| quality-01 | 1 | Sending a Skwirl note link? Check what the reader sees. | Reel, 25s | Actual public read-only note page, viewed signed out |
| quality-02 | 2 | You shared a note link. Can you take it back? | Carousel, 6 slides | Revoke the public link; copies already kept remain |
| quality-03 | 3 | Can you take your notes out of Skwirl? | Reel, 29s | Me > Account > Export my notes produces JSON |
| quality-04 | 4 | Signal dropped. Can you still read your note? | Carousel, 7 slides | Only notes cached on this device, with Skwirl kept open |
| quality-05 | 5 | Skwirl Plus demo: wrong category? Fix it on the note. | Reel, 29s | Manually correct existing category chips, with Plus |

### quality-01

**Audience:** friends who swap tips and plans. **Question (editorial hypothesis):** What does the public note page show to a reader who is signed out?

**Format:** `how-to`. **Claims:** `note_share`. Code paths, exact copy and limits are in [features.json](playbooks/features.json).

**Top three hooks** (selected editorially; candidate scores in the JSON are heuristic ranks):

- Sending a Skwirl note link? Check what the reader sees.
- Watch a shared note open in a private window.
- Private message. Public note link. Know the difference.

All twelve distinct candidates and their framework/heuristic scores are retained in the machine draft. These are alternates; changing the selected hook requires new review.

| Seconds | Beat | Voiceover | On-screen text | Shot / proof to capture |
|---|---|---|---|---|
| 0-4 | hook | Sending a Skwirl note link? Check what the reader sees. | Sending a Skwirl note link? Check what the reader sees. | Real seeded demo note in the owner view, with the Share control visible. No private-window preview yet. Controlled demo, no chat reenactment. |
| 4-9 | re-hook | Create a public link to a Skwirl note. | Create the public note link | Click the real Share control. Show the generated public note URL; keep sign-in tokens and connector URLs out of frame. |
| 9-15 | payoff | Anyone with this link can read this note. | Anyone with this link can read it | Open that generated note URL in a signed-out private window. Show the actual public read-only note page and its content. |
| 15-21 | limit | Keep that in mind before you send it. A link can be passed on. | Share the link on purpose | Stay on the real public note page. The permission warning is neutral, with no fictional leaked-data animation. |
| 21-25 | cta | Try Skwirl. Link in bio. | Try Skwirl. Link in bio. | Wordmark. |

**Caption**

```text
Create a public link to a Skwirl note. Anyone with the link can read that shared note.
Try Skwirl. Link in bio.
#Skwirl #savedreels #notes
```

**Gate status:** copy/style/structure/lexical recency PASS at generation; independent editor 4/5 on every dimension, no outstanding editorial issues. Final media/viewer gates pending. The editor reviews the next actual Maker artifact again at staging.


### quality-02

**Audience:** people who share notes by link. **Question (editorial hypothesis):** If you shared a note link, can you switch it off, and what can it not undo?

**Format:** `do-dont`. **Claims:** `note_share`, `stop_sharing`. Code paths, exact copy and limits are in [features.json](playbooks/features.json).

**Top three hooks** (selected editorially; candidate scores in the JSON are heuristic ranks):

- You shared a note link. Can you take it back?
- Two facts about stopping a shared note.
- Stopping a share is not the same as erasing it.

All twelve distinct candidates and their framework/heuristic scores are retained in the machine draft. These are alternates; changing the selected hook requires new review.

| Slide | Job | Exact text | Bridge to next slide | Visual / proof to capture |
|---|---|---|---|---|
| 1 | hook | You shared a note link. Can you take it back? | Yes for the link. Not for everything. | Bold type on calm lavender with a simple link icon. |
| 2 | problem | Create a public link to a Skwirl note. Anyone with the link can read it. | So you need a way to turn it off. | Seeded demo note in its shared state, labelled demo, no real names. |
| 3 | action | Open the note and stop sharing it. | Here is the result. | Real capture of the seeded demo note as the stop sharing control is used, in the current UI. |
| 4 | payoff | Stop sharing a Skwirl note so its old public link no longer works. | Now the honest part. | Real capture of the in-app message after stopping, then the old link opened in a browser. Show what the page truly displays. |
| 5 | limit | The limit: it cannot reach copies or screenshots someone already kept. Share only what you are fine with them keeping. | Use the link on purpose. | Editorial two-card illustration: link switched off, a copy still on a friend's phone. |
| 6 | cta | Try Skwirl. Link in bio. |  | Skwirl wordmark on calm lavender. |

**Caption**

```text
Stop sharing a Skwirl note so its old public link no longer works. Copies or screenshots someone already kept stay with them.
Try Skwirl. Link in bio.
#notetaking #sharing #savedreels
```

**Gate status:** copy/style/structure/lexical recency PASS at generation; independent editor 4/5 on every dimension, no outstanding editorial issues. Final media/viewer gates pending. The editor reviews the next actual Maker artifact again at staging.


### quality-03

**Audience:** people who want a copy of their own notes. **Question (editorial hypothesis):** Can you take your own notes out of Skwirl, and what does the file look like?

**Format:** `how-to`. **Claims:** `export_notes`. Code paths, exact copy and limits are in [features.json](playbooks/features.json).

**Top three hooks** (selected editorially; candidate scores in the JSON are heuristic ranks):

- Can you take your notes out of Skwirl?
- This is what your Skwirl export file looks like.
- One download. One JSON file. Your notes.

All twelve distinct candidates and their framework/heuristic scores are retained in the machine draft. These are alternates; changing the selected hook requires new review.

| Seconds | Beat | Voiceover | On-screen text | Shot / proof to capture |
|---|---|---|---|---|
| 0-3 | hook | Can you take your notes out of Skwirl? | Can you take your notes out of Skwirl? | Actual seeded Skwirl library in the signed-in account. Start at Me, with no personal data or sign-in links visible. |
| 3-7 | re-hook | No copy-paste. Use Export my notes. | Me > Account > Export my notes | Real screen capture: open Me, expand Account (gData), select Export my notes (exportBtn). Mask all private sign-in link and token controls. |
| 7-13 | payoff | Download your Skwirl notes as a JSON file. | JSON file | Click Export my notes in Account and show the real skwirl-export.json download. No simulated progress bar or invented app integration. |
| 13-19 | other | The JSON export contains your note titles, summaries and note text. | Title. Summary. Note text. | Open the actual JSON download in a text editor. Highlight title, summary and markdown on one controlled demo note. These are verified fields from worker/src/v1.ts NOTE_COLUMNS and export SELECT. |
| 19-25 | limit | Keep this file. It is a copy of your notes, not your videos. | A downloaded copy of your notes | Hold on the real JSON file. No PDF, video, scheduled backup or universal import icons. |
| 25-29 | cta | Try Skwirl. Link in bio. | Try Skwirl. Link in bio. | Skwirl wordmark on calm lavender. |

**Caption**

```text
Download your Skwirl notes as a JSON file. Keep the downloaded JSON file. It contains notes, not videos.
Try Skwirl. Link in bio.
#notes #productivity #savedreels
```

**Gate status:** copy/style/structure/lexical recency PASS at generation; independent editor 4/5 on every dimension, no outstanding editorial issues. Final media/viewer gates pending. The editor reviews the next actual Maker artifact again at staging.


### quality-04

**Audience:** people who read saved notes while travelling or on weak signal. **Question (editorial hypothesis):** If your signal drops, can you still read a note you were already looking at?

**Format:** `myth-bust`. **Claims:** `offline_notes`. Code paths, exact copy and limits are in [features.json](playbooks/features.json).

**Top three hooks** (selected editorially; candidate scores in the JSON are heuristic ranks):

- Signal dropped. Can you still read your note?
- Stop closing Skwirl when your signal drops.
- What can you read in Skwirl with no signal?

All twelve distinct candidates and their framework/heuristic scores are retained in the machine draft. These are alternates; changing the selected hook requires new review.

| Slide | Job | Exact text | Bridge to next slide | Visual / proof to capture |
|---|---|---|---|---|
| 1 | hook | Signal dropped. Can you still read your note? | Sometimes. Here are the conditions. | Phone with one weak signal bar over a note, editorial illustration. |
| 2 | belief | The belief: no signal means no notes. | Not always. Look at this case. | Bold type with the belief struck through. |
| 3 | condition | It depends on whether the note is already on this device. | Here is what that looks like. | Simple diagram: one note on a phone, other notes not stored on this device. |
| 4 | payoff | While Skwirl stays open, you can read notes already cached on this device if the connection drops. | Now the limits, in plain words. | Real capture on a seeded demo account: a note open, connection turned off, the cached note still readable. Show the real result only. |
| 5 | scope limit | Only notes already kept on this signed-in device. Not your whole library. | And Skwirl has to stay open. | Card showing one note on the phone, other notes greyed out, labelled illustration. |
| 6 | open limit | Do not count on it starting from scratch with no signal, or on new saves processing. | That is the whole story. | Two small crossed icons: app closed, new save waiting. |
| 7 | cta | Try Skwirl. Link in bio. |  | Skwirl wordmark on calm lavender. |

**Caption**

```text
While Skwirl stays open, you can read notes already cached on this device if the connection drops. Do not expect it to start fresh with no signal, or new saves to process.
Try Skwirl. Link in bio.
#notes #savedreels #productivity
```

**Gate status:** copy/style/structure/lexical recency PASS at generation; independent editor 4/5 on every dimension, no outstanding editorial issues. Final media/viewer gates pending. The editor reviews the next actual Maker artifact again at staging.


### quality-05

**Audience:** Skwirl Plus users who organise their notes. **Question (editorial hypothesis):** If a note is in the wrong category, can you fix it yourself in Skwirl Plus?

**Format:** `do-dont`. **Claims:** `correct_category`. Code paths, exact copy and limits are in [features.json](playbooks/features.json).

**Top three hooks** (selected editorially; candidate scores in the JSON are heuristic ranks):

- Skwirl Plus demo: wrong category? Fix it on the note.
- Skwirl Plus: you get the last word on a note's category.
- Skwirl Plus: remove one category, add one.

All twelve distinct candidates and their framework/heuristic scores are retained in the machine draft. These are alternates; changing the selected hook requires new review.

| Seconds | Beat | Voiceover | On-screen text | Shot / proof to capture |
|---|---|---|---|---|
| 0-3 | hook | Skwirl Plus demo: wrong category? Fix it on the note. | Skwirl Plus demo: wrong category? Fix it on the note. | Frame zero: a controlled demo craft note with an intentionally assigned Food category, plainly labelled demo. Show the craft title and the mismatched category together. This is a staged example, not a claimed model error. |
| 3-7 | re-hook | Keep the note. Change the category. | With Skwirl Plus: change the category | Hold on the actual category chips of that demo note. Open only the existing category selector; do not delete or re-import the note. |
| 7-14 | payoff | With Skwirl Plus, tap a category on a note to add or remove it. | Skwirl Plus: tap to add or remove | Real capture: tap the wrong category to remove it, then tap the right existing category to add it. Two taps shown clearly, in the current UI. |
| 14-19 | other | Now the note carries the category you chose. | Skwirl Plus: your category | Stay on the actual note while the category chips update after a successful server response. Show Food removed and Crafts present. Do not promise a separate category view in this shot. |
| 19-25 | limit | With Skwirl Plus, choose from categories you already named. This is a manual fix. | With Skwirl Plus. Manual fix. | Simple card: existing categories, manual correction. Do not say Plus only; early accounts have different entitlements. |
| 25-29 | cta | Try Skwirl. Link in bio. | Try Skwirl. Link in bio. | Wordmark and CTA. If mentioning access, say With Skwirl Plus, not Plus only. |

**Caption**

```text
With Skwirl Plus, tap a category on a note to add or remove it. It needs categories that already exist, and it is a manual fix.
Try Skwirl. Link in bio.
#skwirlplus #notes #organising
```

**Gate status:** copy/style/structure/lexical recency PASS at generation; independent editor 4/5 on every dimension, no outstanding editorial issues. Final media/viewer gates pending. The editor reviews the next actual Maker artifact again at staging.

## Retained prior work

The following fifteen ideas remain as earlier drafts and history, with their existing holds and caveats. They are not the refreshed top five. Existing posts remain governed by the read-only handbook posted table.

## Earlier backlog: I-01 to I-15 (retained, not the current top five)

| ID | One-line hook | Format | Payoff | H | F | Ease | Fresh | Total |
|---|---|---|---|---|---|---|---|---|
| I-01 | The reel you saved can disappear. | Carousel | Processed note retained in library | 5 | 5 | 4 | 0 | 24 |
| I-02 | Send me that pasta reel? | Reel | Search by meaning | 5 | 5 | 3 | 0 | 23 |
| I-03 | You remember the idea. Not the creator. | Reel | Find a note by what it was about | 4 | 5 | 3 | 0 | 21 |
| I-04 | Saved dinner. Still don't know what to buy? | Static | Ingredient checklist | 4 | 5 | 3 | 0 | 21 |
| I-05 | Before you save another reel, give it a next step. | Carousel | Note's Next step | 4 | 5 | 4 | 0 | 22 |
| I-06 | The recipe wasn't in the video. | Reel | Caption and top-comment reading | 4 | 5 | 3 | 0 | 21 |
| I-07 | Your old saves deserve more than another folder. | Carousel | Export import into notes | 4 | 5 | 3 | 0 | 21 |
| I-08 | A useful reel has four places to hide the details. | Carousel | Audio, on-screen text, caption, top comments | 4 | 5 | 3 | 0 | 21 |
| I-09 | A faster lane for the saves you want to use. | Static | Plus processing priority | 3 | 4 | 4 | 0 | 18 |
| I-10 | Your saved activities could be a work library. | Reel | Categories + meaning search | 4 | 5 | 2 | 0 | 20 |
| I-11 | What was the last save you actually tried? | Static | To try -> Tried | 4 | 5 | 3 | 0 | 21 |
| I-12 | Claude Code found a save I had forgotten. | Reel | Recall hook and connector | 4 | 5 | 2 | 0 | 20 |
| I-13 | What was that movie the reel recommended? | Reel | Movies List, Watched? | 4 | 5 | 4 | 0 | 22 |
| I-14 | You saved the place. Now remember its name. | Reel | Places List, Been? | 4 | 5 | 3 | 0 | 21 |
| I-15 | A screenshot remembers the frame. What about the explanation? | Carousel | Transcript alongside summary | 4 | 5 | 3 | 0 | 21 |

## Production briefs

**I-01, relatable loss / depth.** Start with a saved tile disappearing, explain the bookmark dependency, introduce sharing to Skwirl, show what the note contains, state the limit, CTA. Signal: deletion is already a competitor angle, not a unique discovery; the native collection is a bookmark. Send trigger: a friend with useful saved reels. Truth: only a completed written note, no video backup or recovery after deletion. Source: signals' product-storage check and competitive source. **Built sample:** `samples/disappearing/post.json`, two generated artwork assets; rendered PNGs and QA under `promo/out/engine-sample/01-disappearing/`. Status is made, not approved or published.

**I-02, everyday search.** A message asks for the pasta reel. The person remembers the dish but not the account. Search the same words in a seeded Skwirl library, open the note, send the original link if still available. Signal: [friend-sharing retrieval question](https://www.reddit.com/r/Instagram/comments/1sempu1/instagram_should_make_it_easier_to_access_your/), plus the saved curiosity-gap framework. Send trigger is literally the plot. Truth: this is a scripted demo, not a genuine customer conversation; do not invent native messaging or a share feature without checking current UI.

**I-03, meaning search.** Ask for a saved DIY idea by what it does, not its creator. Payoff must be a real matching note. Signal: [November old-save retrieval question](https://www.reddit.com/r/Instagram/comments/1xpt1qy/does_anyone_else_wish_the_saved_section_had_a/). Send to the friend who remembers fragments. Truth: no promised date filter, OCR search UI, perfect recall or guaranteed match. Alternative to I-02 in a later week, not alongside it.

**I-04, recipes static.** Generated food still life + editable headline, then a real demo ingredient checklist inset. Signal: week-17 recipe brief and Parth's saved static-ad formats. Send to the cooking friend. Truth: quantities come from a real seeded note; no invented nutrition or shopping-list integration. Hold until five days after any recipe post.

**I-05, useful habit.** Sequence: what did you want from the reel? -> name one action -> keep the context -> turn the shared reel into a note -> find the Next step -> try one thing. Signal: Parth's saved four content buckets and current product note schema. Send to the friend who keeps saving tutorials. Truth: no claim that saving alone completes the action; no invented personal count like "500".

**I-06, depth.** A visually simple recipe clip, then the missing detail in its caption or top comment, then the matching note. Signal: current extraction pipeline; this is a feature story rather than measured creator success. Send to the recipe friend. Truth: use licensed/demo source material with the detail actually present. Do not imply Skwirl reads every comment or guarantees correctness.

**I-07, import.** A folder is still a list of links; Instagram export can be brought into Skwirl for processing. Signal: existing site export guide and week-17 batch. Send to the friend organising old saves. Truth: **defer**, since a full export tutorial is already built. If revisited, verify current menus and free/Plus limits; do not claim saved-collection hierarchy import or a completion time.

**I-08, depth carousel.** Set a small task, reveal one clue from each input, then show how they combine into a note. Signal: Parth's saved transformation hooks plus extraction code. Send to someone who misses instructions buried in captions. Truth: use a controlled example, label it as a demo; no promise of exhaustive comments or perfect transcription.

**I-09, Plus static.** A calm brand post about processing priority, with generated still art and exact editable copy. Signal: current HANDOFF.md and Plus implementation, not the handbook's older waitlist wording. Truth: **hold until current public tier and limits are rechecked**; never imply unlimited or instant. No pricing in the proposed hook.

**I-10, professional library.** Activities filed by goal, then a search task. Signal: handbook's real professional-use feedback. Truth: keep the professional campaign parked until Parth reopens it. If using the authorised quote, attribute only "Jacinda, occupational therapist" and reproduce exactly: "It has revolutionised therapy planning for me." No import count, user data or clinical outcome. Send trigger: a colleague, without invented participation by teachers or trainers.

**I-11, action static.** One To try card becomes Tried after the person does the activity. Signal: actual product state and the saved concrete-task hook framework. Send to a friend with a project backlog. Truth: this is a status tick, not activity tracking or proof of completion; use current UI wording.

**I-12, Claude Code.** Reuse the proven recall sequence only after confirming original evidence. Signal: real 9 Nov trace cited in week-17 script. Truth: only Claude Code may act automatically. No automatic ChatGPT promise. **Defer** because two existing drafts overlap this story; do not repeat next week.

**I-13, Lists.** Someone recognises the movie scene but not the title; share a controlled reel mentioning the movie; show the extracted Movies List, then Watched?. Signal: current Lists feature and saved tutorial/comparison frameworks. Send to your movie-night friend. Truth: use licensed/demo footage, exact mentioned title, no streaming availability claim or movie recommendation engine.

**I-14, places.** A travel buddy asks for the cafe name; several place mentions become one list with links to source notes; Been? closes the story. Signal: real Places feature and week-17 travel format as a reference. Truth: no maps, live opening hours, reservations, route optimisation or itinerary generator. Delay if the Tokyo draft is posted late.

**I-15, context.** Compare a screenshot of one instruction with the explanation that made it useful; the note contains both a short summary and transcript. Signal: Parth's saved comparison and myth-bust hooks, actual note fields. Send to someone saving tutorials as screenshots. Truth: compare only what the controlled example shows; do not assert screenshots are always useless or sell a feature for importing arbitrary screenshots.

## Gaps to fill next run

- Authenticate own IG Insights and YouTube stats, then collect 48 h snapshots. performance.json is deliberately empty now.
- Optional read-only YouTube key for candidates; short-duration search is not proof that a video is a Short. Optional Reddit app credentials need current Reddit approval/access conditions checked by Parth. Public web research remains a fallback.
- Watch recent niche creators directly and record evidence of a format working; do not describe an unmeasured format as trending.
- Confirm posted versus merely rendered items before producing the next batch.
