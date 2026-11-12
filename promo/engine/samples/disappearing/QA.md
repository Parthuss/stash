Verdict: PASS

Scope: seven-slide Instagram carousel, 1080x1350, script `post.json` (id i01-disappearing-v2). Still checks
from the content-qa skill; audio, VO, caption timing and motion are N/A for stills. Reviewed by the make agent
(Claude) plus two fresh-eyes viewer passes by a sonnet subagent that saw only the slides and caption.
This is content QA, not Parth's approval to publish.

| Check | Result and evidence |
|---|---|
| Format | 7 RGB PNGs 1080x1350; cover.png byte-identical to 01.png (cmp). |
| Mechanical (render-stills.cjs) | PASS: copy inside 48 px margins, nothing clipped, all copy >= 30 px (meta >= 26 px), nothing over the headline, no copy collisions. Round 2 caught the Deleted stamp over "Their post" and failed the render until fixed. |
| Standard (stills.read_script) | PASS: 6 layouts over 7 slides, no neighbours sharing layout or background, no repeated hero visual, real product on slides 3-5, cta last, hook 7 words. |
| Story | Hook (saved reel gone) -> why (a save is only a link) -> switch (share to Skwirl, get a note) -> payoff (ingredients and steps) -> later (search by what you remember) -> honest limit -> CTA. Viewer could explain Skwirl after the last slide both rounds. |
| Truth | Every UI pixel is a real capture of the local demo app (account Maya, demo covers); the "that pasta thing" search result is the real result from the demo worker (semantic search, worker/src/embed.ts). Notes keep summary, next step, ingredients, steps (seen in the capture). No recovery, unlimited, instant or open-source claims; slide 6 states the limit. Free tier exists, so "Free to try" holds. No em dashes (grep: 0 in caption.txt and copy.json). |
| Brand | Self-hosted Recursive Casual 800 and Rethink Sans, flat brand colours plus the mark accent; no gradients added (the only gradients are the app's own UI inside captures). |
| Caption | Two lines plus three hashtags, link in bio, no music (no credit needed). Codex's v1 caption kept. |

Rounds:
1. Own pass: fake dynamic island collided with the app's Back button (removed). Viewer pass 1 (PASS with fixes): hook grid looked cropped by accident, slides 1 and 2 said the same thing, the stamp hid the deleted post, slide 6 had a dead gap. Fixed: hook panel narrowed so it ends inside the slide with square tiles; hook body now the consequence ("Creators can delete or hide posts, and your save goes too."), slide 2 body the mechanism; stamp moved and image opacity raised; slide 6 text and card centred as a group.
2. Viewer pass 2 (PASS, minor): doubled border on the search crop (crop frame plus the app's focus ring), Steps card hid ingredient row ends, slide 6 light. Fixed: frameless search crop, Steps card moved so all ingredient rows read and nothing bleeds, promise card type 46 px.

Known and accepted: the phone on slide 3 deliberately bleeds off the bottom (its last visible line is cut);
the app's small button text inside the phone is small at feed size, the note title is the readable hero.
Slide 2's deleted post is a grey ghost by design.

Status: made, QA passed. Not staged, not approved, not posted.
