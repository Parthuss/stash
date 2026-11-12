# Sample: I-01 "The reel you saved can disappear." (carousel, v2)

The reference build for [CAROUSEL_STANDARD.md](../../CAROUSEL_STANDARD.md). Seven 1080x1350 slides, each
with its own job and layout, built on real Skwirl screens from the seeded demo app.

| # | Job | Layout | Picture |
|---|---|---|---|
| 1 | Hook | `hook` (lilac) | A Saved grid with one reel gone ("Reel unavailable") |
| 2 | Problem | `statement` (peach) | Diagram: your save points at their post, which is deleted |
| 3 | The switch | `phone` (lavender) | The pasta reel, Share arrow, the real note screen in a phone frame |
| 4 | Payoff | `zoom` collage (mint) | Zoom-ins on the real note's Ingredients and Steps |
| 5 | Later | `zoom` flow (lilac) | Real search box "that pasta thing", arrow, the matching note card |
| 6 | Honest limit | `promise` (ink) | Type only: it keeps the note, not the video |
| 7 | CTA | `cta` (lavender) | Skwirl mark, send-to-a-friend line, Free to try. Link in bio. |

The copy and story order are Codex's from v1 where they worked (hook line, "Deleted post. Lost recipe.",
"Share it to Skwirl. Get a note.", the honest limit on slide 6, the CTA line, the caption). What changed:
v1 used one template for every slide, generic 3D-clay art repeated across slides (1-2 and 3/4/6), small
body text, and never showed the product.

Assets (all beside `post.json`):
- `ui/`: captures of the demo account "Maya" (`promo/tools/demo/demo.sh`, then
  `SHOTS_DSF=3 node promo/tools/demo/shots.cjs DIR`), 1170 px wide. No real user data.
- `thumbs/`: the demo reel covers from `promo/tools/demo/covers/`.
- No generated or licensed illustration: the product, a diagram and type carry this story.

Render and preview (needs Chrome and playwright-core; set PLAYWRIGHT_MODULE if it isn't installed here):

```sh
cd promo/engine
python -m content_engine.stills render samples/disappearing/post.json --out ../out/engine/samples/i01-disappearing-v2
python bin/contact-sheet.py ../out/engine/samples/i01-disappearing-v2
```

`preview.jpg` here is the contact sheet of the reviewed render. QA record: [QA.md](QA.md).
Status: made, QA passed (see QA.md), not staged, not approved, not posted.
