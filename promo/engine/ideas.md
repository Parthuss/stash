# Skwirl ideas backlog

Re-ranked 12-13 November 2026 with the **audience pain first** rule. Codex's truth, style, structure and recency gates and its heuristic scores are unchanged; ranking now puts the viewer's frustration first. Machine run: [pain-first ideate](research/quality-run-pain-first-2026-11-12.json). Curated plan: [plan](research/quality-plan-pain-first-2026-11-12.json). [Independent editor reports, rubric v2](research/quality-judges-pain-first-2026-11-12.json). Sources and the earlier refresh: [quality playbook](research/2026-11-12-quality-playbook.md). Maker contract: [INTEGRATION.md](playbooks/INTEGRATION.md).

These are **draft plans, not approved or posted content**. No new video or carousel was rendered in this pass. No media/viewer PASS is claimed and no performance data supports calling any of these a winner.

## Ranking rule: audience pain first

- A lead hook must name a real viewer frustration or desire (a lost or forgotten save, can't find that reel, never actually used what you saved, a cooking, travel, watching or learning moment) **before** any feature or the product name. Enforced in `hooks.pain_first`, `ideation.generate_ideas` / `rank_drafts`, `quality_judge.pain_first_errors` and the refine prompt.
- The judge's first and highest-weighted dimension is `scroll_stop`: would a stranger who has never heard of Skwirl stop? (weight 3, hook strength 2, the rest 1; every dimension still needs at least 4/5).
- Niche or admin features (export, public link or revoking it, offline cache, category fixes, categories) are **support-only**. They can be a supporting beat behind a pain-led primary payoff (I-02 sends a note link) or an FAQ-slot post. They are never a top-ranked lead.

## Current top five

Order is by stranger scroll-stop, then variety. Keep a week between pieces that share a feature or overlap a built reel (notes below). Use the ID as schedule.json's idea_id.

The editor ran four rounds (rounds 1-3 kept as `research/quality-judges-pain-first-round{1,2,3}-2026-11-12.json`). Its verdicts vary run to run: I-01 passed twice and failed once on the same idea. Every remaining FAIL is a list of concrete fixes, mostly originality against posted pieces, not a pain-first or truth failure. Apply the fixes, then let staging re-run the editor.

| Rank | ID | Best hook | Format | Payoff (approved feature) | Made? | Editor (round 4) |
|---|---|---|---|---|---|---|
| 1 | I-01 | The reel you saved can disappear. | Carousel, 7 slides | Note still readable after the post is gone; recipe written down | Yes, sample | FAIL |
| 2 | I-02 | Your friend wants that dumpling reel. You saved it. Now what? | Reel, 25s | Search by meaning, then send a public note link back (note_share as a supporting beat) | No | PASS |
| 3 | I-16 | At the shop. Which saved reel had the ingredients? | Reel, 24s | Search what you remember, then the recipe note checklist and steps | No | FAIL |
| 4 | I-17 | You saved a stretch routine for Monday. It is Friday. | Carousel, 7 slides | Note with a next step, then a Tried tick | No | FAIL |
| 5 | I-14 | You're in the right city. What was that cafe called? | Reel, 23s | Places mentioned in saves collect into Lists | No | FAIL |

### I-01

**Audience:** people with a big Saved folder. **Question (editorial hypothesis):** What happens to your save when the creator deletes the reel?

**Format:** `loss-then-keep`, Carousel, 7 slides. **Claims:** `notes`, `recipes` (exact copy and limits in [features.json](playbooks/features.json)). **Already made:** carousel v2 sample in `samples/disappearing/` (rendered PNGs and QA under `promo/out/engine-sample/01-disappearing/`). Made, not approved or posted. This script differs from the sample: the editor asked for a proof slide (note beside the Reel unavailable tile) and the search slide is dropped. Update the sample to match, then run the full gate on it.

**Best three hooks:**

- The reel you saved can disappear.
- Reel unavailable. The recipe went with it.
- Saving a reel is not the same as keeping it.

| Slide | Job | Exact text | Bridge to next slide | Visual / proof to capture |
|---|---|---|---|---|
| 1 | hook | The reel you saved can disappear. | Creators can delete or hide posts, and your save goes too. | Seeded demo Saved grid with one tile showing Reel unavailable (built sample slide 1). |
| 2 | problem | Deleted post. Lost recipe. A save is only a link to their post. | So keep the useful part yourself. | Diagram: your save points at their post, which is deleted. |
| 3 | switch | Turn a shared reel into a note with a summary and a next step. | Now delete the post. | Demo pasta reel, Share arrow, the real note screen in a phone frame (demo account). |
| 4 | proof | Reel unavailable. The note is still here. | And the useful part is in it. | Split frame, demo data: left, the Saved tile showing Reel unavailable; right, the same pasta note open and readable in Skwirl. |
| 5 | payoff | Recipe notes include ingredient checklists and numbered steps when the source provides them. | Now the honest limit. | Zoom-ins on that demo note Ingredients and Steps. |
| 6 | limit | It keeps the note. Not the video. Share the reel while it is still up. | Worth doing today. | Type only on ink. |
| 7 | cta | Try Skwirl. Link in bio. |  | Skwirl mark on lavender, send-to-a-friend line. |

**Caption**

```text
Turn a shared reel into a note with a summary and a next step. It keeps the note, not the video.
Send this to the friend who saves every useful reel. Try Skwirl. Link in bio.
#Skwirl #savedreels #recipes
```

**Notes:** Loss beats novelty: a stranger instantly fears losing a save. Space it at least a week from the posted "graveyard" carousel (#3, 7 Nov), which is about never revisiting saves, not losing them.

**Gate status:** copy/style/structure/pain-first/recency PASS. Independent Sonnet editor, rubric v2, round 4: **FAIL** (scroll_stop 4, hook_strength 4, clarity_2s 4, payoff 3, originality 3, brand_fit 4). History: PASS in rounds 1 and 3, FAIL in round 4. Fix before staging (staging re-runs the editor):

- Originality: the hook and core idea duplicate I-01 in promo/out/engine/ideas.md, a reel with the same hook, Saved-grid-to-unavailable beat and note payoff. The carousel format alone is not a distinct structure. Pick a different angle or a differentiated hook and proof.
- Payoff: no feature evidence supports 'The note is still here' after the source post is deleted. Either add verified evidence that a processed note stays readable independent of the source post, or reword to approved copy plus the limit.
- Slide 4 is a staged split frame with a drawn unavailable tile. Label it as a demo or illustration, and do not present it as a captured live deletion.
- Slide 1 bridge ('your save goes too') is an unsourced platform claim and conflicts with the slide 4 visual. Rewrite or remove it.
- Slide 4 bridge 'And the useful part is in it.' is an unsupported outcome claim. Tie it to the recipe copy limit 'when the source provides them'.
- The hook is a statement. A question form or one of the stronger unselected candidates would open a sharper gap.


### I-02

**Audience:** people who save recipe reels and get asked for them. **Question (audience report):** How do I send a friend that reel I saved?

**Format:** `friend-asks-search`, Reel, 25s. **Claims:** `search`, `note_share` (exact copy and limits in [features.json](playbooks/features.json)). Not made.

**Best three hooks:**

- Your friend wants that dumpling reel. You saved it. Now what?
- Send me that dumpling reel?
- Stop scrolling your Saved grid while a friend waits.

| Seconds | Beat | Voiceover | On-screen text | Shot / proof to capture |
|---|---|---|---|---|
| 0-4 | hook | Your friend wants that dumpling reel. You saved it. Now what? | Your friend wants that dumpling reel. You saved it. Now what? | Staged demo message "send me that dumpling reel?" on a phone from a fictional friend, labelled demo. No real names or chat app branding. |
| 4-7 | re-hook | You shared it to Skwirl weeks ago. Now find it. | Shared to Skwirl. Now find it. | Text card over the waiting message: shared to Skwirl weeks ago. No product capture in this beat. |
| 7-13 | payoff | Type what you remember about the dish. Search your saved notes by meaning. | Search by what you remember | Real capture in the seeded demo Skwirl library: type a few words about the dumplings and show the real matching note. Seed a dumpling recipe reel in the demo account first (pasta is already in reels 05, 11 and 12) and let Skwirl process it for real. |
| 13-19 | handoff | Create a public link to a Skwirl note. They get the note, not the video. | They get the note, not the video | Real Share control on the matching demo note; paste the generated link into the staged reply, then show the public note page the friend opens, signed out. Keep sign-in tokens out of frame. |
| 19-22 | limit | Anyone with the link can read that shared note. | Anyone with the link can read it | Hold on the sent reply with the link. Neutral, no leaked-data drama. |
| 22-25 | cta | Try Skwirl. Link in bio. | Try Skwirl. Link in bio. | Skwirl wordmark. |

**Caption**

```text
Search your saved notes by meaning. Create a public link to a Skwirl note. Anyone with the link can read that shared note.
Send this to the friend who always asks for that reel. Try Skwirl. Link in bio.
#Skwirl #savedreels #recipes
```

**Notes:** Was "Send me that pasta reel?". Switched to dumplings because the editor flagged pasta in reels 05, 11 and 12; needs a dumpling recipe reel seeded in the demo account and processed for real. "Send me that dumpling reel?" is kept as hook two. Overlap warning: reel 12 ("No/No/Yes", rendered, posting status unconfirmed) already uses "that pasta thing" and the friend-asks-you-to-find-it line in its caption. Run I-02 at least a week after 12 posts, and type different dish words in the demo search.

**Gate status:** copy/style/structure/pain-first/recency PASS. Independent Sonnet editor, rubric v2, round 4: **PASS** (scroll_stop 4, hook_strength 4, clarity_2s 4, payoff 4, originality 4, brand_fit 4). History: FAIL in rounds 1-3 (old pasta/send version), PASS in round 4. Final media/viewer gates pending.


### I-16

**Audience:** cook. **Question (editorial hypothesis):** Which saved reel had the ingredients I need right now?

**Format:** `how-to`, Reel, 24s. **Claims:** `recipes`, `search` (exact copy and limits in [features.json](playbooks/features.json)). Not made. New from the pain-first Sonnet run (cooking moment). Supersedes I-04 and I-06 (`supersedes` field), so the judge did not compare it with them.

**Best three hooks:**

- At the shop. Which saved reel had the ingredients?
- Stop rewatching a reel to catch the ingredients.
- POV: the reel is saved, the ingredients are not.

| Seconds | Beat | Voiceover | On-screen text | Shot / proof to capture |
|---|---|---|---|---|
| 0-3 | hook | At the shop. Which saved reel had the ingredients? | At the shop. Which saved reel had the ingredients? | Staged first-person shot in a shop aisle; thumb scrolling the Instagram Saved grid (demo tiles, labelled demo) and getting nowhere. |
| 3-9 | re-hook | Shared it to Skwirl? Skip the scroll. Search your saved notes by meaning. | Shared to Skwirl? Search what you remember | Real capture in the seeded demo Skwirl library: type a few words about the dish and the demo pasta note comes up. Matches are not guaranteed; show the real result. |
| 9-16 | payoff | Recipe notes include ingredient checklists and numbered steps when the source provides them. | Ingredient checklist. Numbered steps. | Open that demo note: scroll from the ingredient checklist to the numbered steps. Quantities exactly as the seeded source gave them. |
| 16-21 | limit | If the reel left out amounts, the note will too. | Only what the source gave | Back in the aisle: the checklist open on the phone, one line with no amount because the demo source gave none. No shopping-list screen or integration. |
| 21-24 | cta | Try Skwirl. Link in bio. | Try Skwirl. Link in bio. | Skwirl wordmark over the aisle scene, softened. |

**Caption**

```text
Search your saved notes by meaning. Recipe notes include ingredient checklists and numbered steps when the source provides them.
Send this to the friend who cooks from reels. Try Skwirl. Link in bio.
#Skwirl #savedreels #recipeideas
```

**Notes:** Space from the posted fridge POV reel (#5, 7 Nov, also a recipe moment) and from I-01, which also shows a recipe note. Quantities only as the seeded source gave them.

**Gate status:** copy/style/structure/pain-first/recency PASS. Independent Sonnet editor, rubric v2, round 4: **FAIL** (scroll_stop 4, hook_strength 4, clarity_2s 4, payoff 4, originality 3, brand_fit 4). History: FAIL rounds 2-4, originality 3 each time. Fix before staging (staging re-runs the editor):

- Originality is 3. The concept, an Instagram Saved grid scroll leading to Skwirl search and then a recipe checklist and steps, substantially duplicates the posted 'fridge open' POV reel and drafts I-02 and I-04. Changing the setting to a shop is not a distinct structure. Rework with a new angle or demonstration, or differentiate more clearly from the posted fridge reel.
- Minor: the hook says the viewer cannot recall which reel, but the demo search relies on remembering the dish. Make the scenario consistent, for example by having the viewer remember only part of the dish.
- 'Skip the scroll' should only ship if the captured search really returns the demo note. Show the actual result.


### I-17

**Audience:** workout savers. **Question (editorial hypothesis):** How do I actually start a stretch routine I saved?

**Format:** `how-to`, Carousel, 7 slides. **Claims:** `notes`, `tried` (exact copy and limits in [features.json](playbooks/features.json)). Not made. New from the pain-first Sonnet run (never used what you saved). Supersedes I-05 and I-11.

**Best three hooks:**

- You saved a stretch routine for Monday. It is Friday.
- POV: it is Friday and your Monday stretch routine is still a tile.
- Stop saving routines you have no plan to start.

| Slide | Job | Exact text | Bridge to next slide | Visual / proof to capture |
|---|---|---|---|---|
| 1 | hook | You saved a stretch routine for Monday. It is Friday. | Here is one way to start it today. | Large type on lavender with a small calendar on Friday and the seeded demo mobility tile. |
| 2 | problem | The reel is still saved. Saving it was the easy part. | So open it as a note. | The demo mobility tile in a Saved grid, untouched. |
| 3 | payoff | Turn a shared reel into a note with a summary and a next step. | Here is the next step it gave. | Real capture of the seeded demo mobility note: summary at the top. |
| 4 | proof | One small next step. Do only that, today. | Then close the loop. | Zoom on the real Next step line of that demo note, exactly as written. |
| 5 | payoff | Mark a note as Tried after you try it. It is your tick, not a tracker. | That is it. | Real capture of the same demo note with the Tried state showing. |
| 6 | turn | Friday. Started. Still counts. | Your turn. | Calendar card: Friday ticked, labelled illustration. |
| 7 | cta | Try Skwirl. Link in bio. |  | Skwirl wordmark on lavender. |

**Caption**

```text
Turn a shared reel into a note with a summary and a next step. Mark a note as Tried after you try it.
Send this to a friend with a plan for Monday. Try Skwirl. Link in bio.
#Skwirl #savedreels #stretching
```

**Notes:** Built on the seeded mobility demo note. Tried is a manual tick, not a tracker. No invented counts. Overlaps the posted graveyard carousel theme (saving is not doing), so keep the concrete Friday demo, not an argument.

**Gate status:** copy/style/structure/pain-first/recency PASS. Independent Sonnet editor, rubric v2, round 4: **FAIL** (scroll_stop 4, hook_strength 4, clarity_2s 4, payoff 4, originality 4, brand_fit 4). History: FAIL rounds 2-4; round 4 scored 4 on every dimension but listed fixes. Fix before staging (staging re-runs the editor):

- Slide 2 bridge 'So open it as a note.' implies a saved reel opens as a note without being shared to Skwirl. Approved copy says 'shared reel' and no slide shows the share step. Reword (for example 'So share it to Skwirl.') or add a share beat so the saved-to-note path is honest.
- The hook says 'saved' while the demonstration needs the reel shared to Skwirl. Make the share step explicit somewhere on slides 2 or 3 so a stranger understands what to do.
- Confirm at capture that the real Next step line on the seeded demo note is genuinely small and does not read as a guarantee, since slide 4 frames it as 'One small next step'.


### I-14

**Audience:** people who save travel and food spots. **Question (editorial hypothesis):** What was the name of that place I saved?

**Format:** `list-payoff`, Reel, 23s. **Claims:** `lists` (exact copy and limits in [features.json](playbooks/features.json)). Not made.

**Best three hooks:**

- You're in the right city. What was that cafe called?
- The cafe was in a reel. The name was said once.
- Stop screenshotting cafe names you never look at again.

| Seconds | Beat | Voiceover | On-screen text | Shot / proof to capture |
|---|---|---|---|---|
| 0-3 | hook | You're in the right city. What was that cafe called? | You're in the right city. What was that cafe called? | Staged street shot, phone in hand; on screen the seeded demo Tokyo reel tile. The forgotten-name problem is in the on-screen text from frame zero. No real venue branding. |
| 3-8 | re-hook | It was in a reel you shared to Skwirl. The name was said once. | Said once. Never written down. | Scrub a demo travel reel whose audio names the cafe; caption that exact name. Label the frame Demo account. The Places entry must come from Skwirl processing that reel for real, never hand-edited. |
| 8-15 | payoff | Books, movies, shows, podcasts and places mentioned in saves collect into Lists. | There it is, in Places | Real capture of the seeded demo Lists screen, Places section, with the SAME cafe name visible that the reel said. |
| 15-20 | limit | No maps or bookings. Just the names you saved. | No maps. Just the names. | Hold on the real Places list. No map pins, opening hours or reservation UI. |
| 20-23 | cta | Try Skwirl. Link in bio. | Try Skwirl. Link in bio. | Skwirl wordmark. |

**Caption**

```text
Books, movies, shows, podcasts and places mentioned in saves collect into Lists. No maps or bookings, just the names you saved. Demo account shown.
Send this to your travel friend. Try Skwirl. Link in bio.
#Skwirl #savedreels #travel
```

**Notes:** Lists overlap: the books Lists reel (#7) was built; confirm whether it posted and keep a week between them. The reel and the Places list must show the same cafe name. Do not show "Been?" or tap-through links until verified in the current UI; they are not approved copy.

**Gate status:** copy/style/structure/pain-first/recency PASS. Independent Sonnet editor, rubric v2, round 4: **FAIL** (scroll_stop 4, hook_strength 4, clarity_2s 4, payoff 4, originality 3, brand_fit 4). History: FAIL rounds 2-4; originality 3 in rounds 3-4. Fix before staging (staging re-runs the editor):

- Originality is a 3: the Lists list-payoff structure overlaps the posted '40 book reels. 0 books read' reel (07-books) and the retained drafts I-13 and I-14 (places list from travel reels). The script needs a distinctly different structure or angle, or a clear schedule gap and differentiation from I-14, to earn a 4.
- The payoff voiceover recites the generic books, movies, shows and podcasts sentence while the story is about one cafe. Consider a place-led framing within approved copy so the payoff answers the hook more directly.
- Staging note: the street shot labelled 'right city' paired with a demo Tokyo reel tile must read as one coherent scenario, with no real venue branding.

## FAQ slot (demoted from the earlier top five)

Codex's 12 Nov refresh is kept for FAQ-style posts or supporting beats, never as a lead. Full scripts, hooks and editor reports: [quality-run](research/quality-run-2026-11-12.json), [judges](research/quality-judges-2026-11-12.json). Those reviews were rubric v1, so they need a fresh rubric v2 review before staging.

| ID | Hook | Primary feature | Use as |
|---|---|---|---|
| quality-01 | Sending a Skwirl note link? Check what the reader sees. | note_share | FAQ post, or the handoff beat in I-02 |
| quality-02 | You shared a note link. Can you take it back? | stop_sharing | FAQ post |
| quality-03 | Can you take your notes out of Skwirl? | export_notes | FAQ post, or the honest-limit beat for trust |
| quality-04 | Signal dropped. Can you still read your note? | offline_notes | FAQ post, or a travel beat after I-14 |
| quality-05 | Skwirl Plus demo: wrong category? Fix it on the note. | correct_category | FAQ post for Plus users |

**Next up after the top five:** I-03 "You remember the idea. Not the creator." (meaning search: hold until after I-02 and reel 12, since all three use search from memory) and I-13 "What was that movie the reel recommended?" (Lists: hold a week after I-14 and the books reel). Both pass the pain-first rule.

## Retained prior work

The following fifteen ideas remain as earlier drafts and history, with their existing holds and caveats. I-01, I-02 and I-14 are promoted into the current top five above; I-04/I-06 are superseded by I-16 and I-05/I-11 by I-17. Existing posts remain governed by the read-only handbook posted table.

## Earlier backlog: I-01 to I-15 (I-01, I-02, I-14 promoted above)

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
