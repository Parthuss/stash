# Carousel and static standard

The brief and checklist every Skwirl carousel or static meets before it is staged. The make step
(prompts/make.md) reads this first. `content_engine.stills` enforces the machine-checkable rows and
fails closed; content-qa judges the rest by looking at the render. Reference build: `samples/disappearing/`.

Why this exists: the first engine sample used one template for every slide (eyebrow, headline, line,
picture, footer), generic 3D-clay stock art that didn't carry the story, the same picture on several
slides, small body text, and never showed the product. Its copy and story order were fine.

## The brief

1. **Story first.** Write the slides as a story before any layout: hook, problem, the switch to Skwirl,
   the feature that pays it off, the honest limit if there is one, the CTA. Every slide sets up the next
   (`bridge` in the script says why the viewer swipes). Never make people swipe back for an answer.
2. **One idea per slide.** A headline of 12 words or fewer (the hook 10 or fewer), at most one short
   body line (28 words max, aim for under 15). If a slide needs two ideas, it is two slides.
3. **Each slide does a different job and looks different.** No two neighbours share a layout or a
   background colour; a carousel uses at least four layouts. Layouts:
   - `hook`: the scroll-stopper. Huge type plus a picture of the pain (e.g. a Saved grid with a reel gone).
   - `statement`: the problem as a simple diagram (e.g. a save pointing at a deleted post).
   - `phone`: the real app in a phone frame, optionally with the reel it came from and an arrow.
   - `zoom`: crops of the exact field that matters, `collage` (overlapping, tilted) or `flow`
     (query, arrow, result).
   - `promise`: dark slide for the honest limit or the key promise.
   - `cta`: the mark, the line, who to send it to, "Free to try. Link in bio."
4. **Show the real product as the hero.** Real Skwirl screens captured from the seeded demo app, never
   a mockup or a redrawn UI. Use phone frames for context and zoom-ins on the exact field the slide is
   about (the ingredient list, the search box, the next step). A carousel must show the product at least once.
5. **Illustration only where it adds meaning, never repeated.** Prefer the product, a diagram, or type.
   If a picture is needed: an open-licence reference restyled to the brand (Microsoft Fluent Emoji, MIT:
   brand colours plus an ink outline), or generated art (agent imagegen, no text in the image). No
   freehand SVG illustration, no stock-art filler, no 3D clay. The same picture never appears on two
   slides; demo reel covers (`thumb`) may recur as a story prop (the pasta reel that gets deleted is the
   same reel Skwirl turns into a note).
6. **Big readable type.** IG shows a 1080 px slide about 390 pt wide, so everything is read at roughly a
   third of its size. Headlines 96-116 px, body 44 px, labels and chips 30 px or more, nothing under 30 px
   except the small brand/count row (26 px+).
7. **Brand, not slop.** Real brand fonts (Recursive Casual 800, Rethink Sans) and flat brand colours
   (lilac #f8f7ff, lavender #dcd8ff, mint #cdf3e1, peach #ffd8cb, ink #1d1b2e, accent #ff7a59 from the
   mark). No decorative gradients, glows, emoji confetti or "AI" sparkle. Ink outlines and chips are the look.
8. **Truth.** Only real features, demo data (account "Maya"), exact authorised quotes ("Jacinda,
   occupational therapist"). No invented numbers, no unlimited, no instant, no "recovers deleted reels".
   No em dashes anywhere. Captions: 1-2 lines, 3-5 hashtags, "link in bio".

## How to build one

```sh
promo/tools/demo/demo.sh                               # seeded local Skwirl on :8799 (stops only that port)
SHOTS_DSF=3 node promo/tools/demo/shots.cjs /tmp/shots   # 1170 px wide captures: library, search-*, note, note-full, lists
```

Need a screen shots.cjs doesn't take? Add it to shots.cjs (seed what it needs in seed.py). Copy the
captures you use into the post folder (`ui/`), covers into `thumbs/`, then write `post.json` (schema:
`samples/disappearing/post.json`; field reference in the `content_engine/stills.py` docstring). Crops are
`[x, y, w, h]` in the 390 px CSS space of the capture.

```sh
cd promo/engine
python -m content_engine.stills render POST.json --out OUTDIR   # HTML + 01..NN.png + cover.png + qa/checks.json
python bin/contact-sheet.py OUTDIR                            # OUTDIR/preview.jpg at feed size
```

`render` refuses scripts that break the rules below and fails the render if the browser finds clipped
or tiny text or anything sitting on the headline. Generated art: `stills prompts` exports prompts,
`stills import-art` brings each image in (never overwrites).

## Checklist (content-qa for stills)

| # | Check | Enforced by |
|---|---|---|
| 1 | Hook slide stops the scroll at feed size: a pain you recognise in under a second | content-qa |
| 2 | Story flows: each slide answers the last and sets up the next; no swipe back | content-qa (+ `bridge` required) |
| 3 | One idea per slide; title <= 12 words, hook <= 10, body <= 28 | renderer + content-qa |
| 4 | Neighbours differ in layout and background; 4+ layouts | renderer |
| 5 | Real product shown (ui captures from the demo app), zoomed on the field that matters | renderer (presence) + content-qa (right field) |
| 6 | No hero visual repeated; illustrations only with meaning, licensed or generated with prompt | renderer + content-qa |
| 7 | Text >= 30 px (meta 26 px), inside 48 px margins, nothing clipped, nothing on the headline | render-stills.cjs |
| 8 | Brand fonts and colours, no slop gradients | renderer (tokens) + content-qa |
| 9 | Truth: features, numbers, quotes, demo data only; no em dash; banned claims | renderer (copy rules) + content-qa |
| 10 | Caption: 1-2 lines + 3-5 hashtags + link in bio, matches caption.txt | schedule validate + content-qa |
| 11 | Contact sheet viewed at feed size AND every slide viewed full size | content-qa |
| 12 | qa/report.md starts `Verdict: PASS` only after that review; hashes bind it | render-stills.cjs + schedule validate |
