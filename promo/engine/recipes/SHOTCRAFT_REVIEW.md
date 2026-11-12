# Review: github.com/Vincentwei1021/video-shotcraft (12 Nov 2026)

Parth saved this three times. Read from a shallow clone with nothing executed. As of 12 Nov 2026 the GitHub API showed about 18.9k stars and a last push on 11 Nov 2026.

## What it is
- It is a Claude Code skill plugin: `.claude-plugin/plugin.json` points at one root `SKILL.md`.
- The recipe cards are 124 markdown files in `references/shots/<category>/`, not the 106 the README says. They are written mostly in Chinese.
- Each card has:
  - frontmatter fields: name, one-liner, use case, duration, energy, tag
  - sections for intent, motion core, a parameter table (value plus what feels wrong when it's off), pitfalls, and a pointer to a reference Remotion TSX in `demos/`
- Claude scans the frontmatter, picks cards along an energy curve, then reads the full card plus its TSX and adapts the code.
- It renders with Remotion at 30 fps. Every card targets **1920x1080 landscape**, with desktop-web pixel values.
- Category counts:

| Category | Cards |
|---|---|
| typography | 22 |
| ui-entrance | 21 |
| effects | 15 |
| transition | 15 |
| interaction | 11 |
| opening | 11 |
| camera | 10 |
| rhythm | 8 |
| outro | 6 |
| data | 5 |

## Licence
- **Apache-2.0** (`LICENSE`). `references/shots/ATTRIBUTION.md` says the effects were re-implemented from public promo videos and include no original assets.
- Remotion has its own licence, which we already operate under. Check that the company tier applies if the team grows.

## Verdict: adopt the pattern, don't vendor the repo
**Useful:**
- The parameter tables and pitfall notes. They give real timing numbers and name the failure mode, for example:
  - a crash zoom lasts 6 frames; at more than 10 it reads as an ordinary push-in
  - the overshoot is 3-6%; much more reads as a spring toy
  - shake is about 14px·e^(-t/1.8); above 20px it reads as a glitch
- The idea of a catalog that Claude chooses from, so motion is picked deliberately for each beat instead of improvised.
- The camera, transition, rhythm and interaction cards carry over to phone UI.

**Junk for us:**
- Most of the typography, outro and data-viz cards.
- Brand-specific cards, such as Ink Press and white-flash-logo.
- Landscape-only browser-window and grid effects.
- The workbench, gallery, Jianying export and publish scripts.
- The heavy three-mode process in SKILL.md.

**Risk:** low.
- There are no postinstall scripts.
- There are two opt-in network calls, both needing API keys: Freesound in `sfx-source.py` and upload-post.com in `publish/upload_post.py`.
- The `.git` folder is 55 MB.

## What we built instead
- **Our own library**, about 10 cards in English, 9:16, mapped to our kit:
  - cards in `recipes/cards/`
  - the catalog and selection rules in `recipes/INDEX.md`
  - our own components in `promo/src/recipes/shots.tsx`
  - a demo composition in `promo/src/recipes/RecipeDemo.tsx`
- **Parameters re-derived for 1080x1920.** The shotcraft card each one is based on is credited in its `source:` field.
- **No shotcraft files copied** into the repo.

The make step plans a shot list that names one card per beat, then builds with these components (`prompts/make.md` step 3).
