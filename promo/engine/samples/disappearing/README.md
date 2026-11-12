# One sample carousel: I-01

Draft only. Nothing uploaded, staged, messaged or posted. [Preview](preview.jpg), [QA](QA.md), [editable script and exact image prompts](post.json).

The two original PNGs in `art/` were generated with the built-in imagegen tool in this run. They contain no copy. The renderer composes actual self-hosted Skwirl fonts, checked brand colours and editable text over them. No API key was entered and there is no third-party image-generation fallback.

From the repository root:

```sh
python -m venv promo/engine/.venv
promo/engine/.venv/bin/pip install -r promo/engine/requirements.txt
npm ci --prefix promo/engine
PYTHONPATH=promo/engine promo/engine/.venv/bin/python -m content_engine.stills render \
  promo/engine/samples/disappearing/post.json --out promo/out/engine-sample/01-disappearing
```

Requires Node >=20 and installed Google Chrome. On Linux, set CHROME_PATH to Chrome's executable. The render writes editable `slides.html`, copy, caption, PNGs, cover and mechanical/hash checks. It deliberately does not write a content-qa PASS: a reviewer must inspect the render, check claims and write `qa/report.md`. This run's actual report is also saved as QA.md here. Review again after changing any copy or artwork.

To make another static or carousel, write the same JSON shape (`kind: static` with one slide, or `carousel` with 2-10). Export `prompts`, generate each art prompt using the agent's built-in imagegen tool, then use `import-art SCRIPT --art-id ID --source PATH`. It refuses to overwrite artwork. Call `render` after all images exist. If the runner lacks imagegen access, stop with the prompts and a Needs Parth note; never replace the art with placeholders or silently call a paid API.

Script evaluation: frame-zero hook under 15 words; one idea; each slide sets up the next; useful-note payoff appears before CTA; no user names, counts or unverified feature; written note distinct from video; no em dash; no invented UI; original artwork. Stills have no VO/music/motion, while the reel pipeline retains the full audio/motion requirements.

Current local outputs: `promo/out/engine-sample/01-disappearing/01.png` through `06.png`, cover.png, caption.txt, slides.html and qa/. The week-level schedule is `promo/out/engine-sample/schedule.json`, a suggestion for 23 Nov at 22:30 IST. Outputs are gitignored; script, art, preview and this run's QA are committed for reproducibility.
