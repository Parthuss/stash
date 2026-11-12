# Skwirl ideas backlog

Research run: 12 Nov 2026, refreshed from the recovered branch. See [signals and sources](research/2026-11-12-signals.md), [repo survey](research/repos.md). The local stash MCP was queried for real; raw private input stays in ignored `promo/out/engine/inputs/`. No posts were published and no performance is available. These are editorial hypotheses, not predictions of virality.

Learning: zero measured posts, so there is nothing to call a winner. After connecting accounts, compare shares/reach, saves/reach and actual watch metrics at comparable ages. Do not derive hold from an unverified skip-rate scale.

Scores: Hook 1-5, feature Fit 1-5, Ease 1-5 (5 is easiest, equivalent to inverse effort), Fresh 0-2. Total = 2H + 2F + Ease + Fresh, max 27. Fresh is zero throughout: no current trend was validated with creator performance. Quality is never reduced to improve Ease. The top five balance audiences and avoid last week's topics, rather than blindly sorting totals.

## Top five recommended: week beginning Monday 23 November

All slots are drafts at **22:30 Asia/Kolkata**, never approvals. The earlier attempt incorrectly called 24 Nov a Monday.

| Rank | Idea and frame-zero hook | Format | Score | Suggested slot | Reason |
|---|---|---|---|---|---|
| 1 | I-01: The reel you saved can disappear. | 6-slide carousel | 24 | Mon 23 Nov | Concrete loss, then the written-note payoff. Sample built and QA reviewed this run; not staged. |
| 2 | I-02: Send me that pasta reel? | Reel, about 22 s | 23 | Wed 25 Nov | A friend's request makes retrieval useful, rather than another app tour. |
| 3 | I-05: Before you save another reel, give it a next step. | Carousel, 6 slides | 22 | Thu 26 Nov | A useful habit first, then the product's Next step field. |
| 4 | I-13: What was that movie the reel recommended? | Reel, about 22 s | 22 | Fri 27 Nov | Lists, a strong feature payoff outside the recipe niche. |
| 5 | I-14: You saved the place. Now remember its name. | Reel, about 22 s | 21 | Sun 29 Nov | Places extracted into Lists. At least a week after the week-17 Tokyo draft. |

Before producing a week: confirm what Parth actually posted from the existing batch. Move slots if those drafts went out later. Recipe posts are separated by over five days from the previous recipe draft. Do not publish the same creative as both a static and a carousel.

## Fifteen live ideas

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
