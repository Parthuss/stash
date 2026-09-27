# Stash — design direction

Synthesized from the design reels in the stash itself (ids in brackets; `get_stash_note` for the source).
Sources are mostly tool roundups and animation checklists, not finished visual identities, so **what's
sourced is marked as such and the visual identity below is a proposal to react to**, not a decision.

## Principles (sourced)

1. **Motion is feedback, not decoration.** "Good animation isn't decoration. It's feedback." Every tap gets a response; if an animation carries no information, don't add it. [4 Web Animation Patterns]
2. **Kill the "AI slop" look.** Small, boring rules done consistently beat flourishes: border-radius logic, text spacing, button press feel, when *not* to animate. [Craft skill] [5 Free Tools]
3. **Steal the polish, don't build from scratch.** Use established libraries; pin them in `CLAUDE.md` so the agent stops reinventing them. [Curated library list] [5 UI Resources]
4. **Study before drawing.** Look at real product hierarchy (Mobbin for apps) before laying out a screen. [5 UI Reference Sites]

## Motion vocabulary (from the 4-pattern reel, mapped to native)

| Pattern | Web term | Stash use (React Native / Reanimated) |
|---|---|---|
| Reveal | fade + lift, stagger | Library cards enter with 8–10px lift + opacity, 30–40ms stagger; not on every scroll |
| Click | press + spring, state change | Every pressable scales ~0.97 with spring; save button morphs idle → saving → saved |
| Hover | magnetic CTA, image zoom | Web pilot only; on mobile becomes long-press preview |
| Scroll | parallax, scrub, pin | Skip, except a collapsing header. Notes are for reading, not spectacle |

Rule: nothing over ~250ms; respect Reduce Motion; no animation on the share extension beyond the "Saved ✓" confirmation.

## Reference sources to study
- App layouts: Mobbin (Simmr's onboarding, library and detail screens are the closest analog; same "save from social" flow)
- Layout/pricing/typography: Landbook, Godly, SiteInspire, Awwwards [5 UI Reference Sites]
- Motion / component polish: SmoothUI, Bencho, Amicro, Inspora, bestdesignsonx.com [5 UI Resources]
- Visual texture: Dither (pixel/ASCII treatment), Prism (gradient/glass), Not Your Type (typefaces) [Dither…] — candidates for the landing page and empty states only

## Tooling to install for the build
- **Craft** (`npx skills add gustavo-furtado`): design-engineering rules for Claude. [Craft]
- **Impeccable**, **Taste**, **Awesome Design**: already in your Claude skill list / named in two reels. [5 Free Tools] [5 Claude Code Plugins…]
- **Playwright CLI**: screenshot every screen of the web pilot so the design gets checked against the render, not the code. [5 Free Tools]
- Library pins for `CLAUDE.md` (web pilot side): motion, lenis, cmdk, sonner, lucide, recharts, date-fns. React Native side: Reanimated, FlashList, expo-image, lucide-react-native. [Curated library list]

## Identity (decided 2026-09-21)
Reference feel: **Simmr** (save from social → tidy tinted card library, floating "+" to add), in the
visual language of the portfolio's "ethereal" theme (`portfolio-v2/components/ethereal-portfolio.tsx`).
- **Light mode only.** Ground `#f8f7ff`, soft drifting lavender/peach orbs behind content.
- **Pastels:** lavender `#dcd8ff`, mint `#cdf3e1`, peach `#ffd8cb`, sky `#d6ebff`, butter `#fff0c4`. Each topic gets a fixed tint; cards lead with a big serif initial until real thumbnails exist.
- **Peach means "unused"** (the badge and counter). It's the one semantic colour: the unused count is the product's core metric.
- **Type:** Gloock (display serif) for the wordmark, titles and section heads; Familjen Grotesk for UI and body.
- **Shape:** generous radii (cards 24px, hero 32px, sheets 28px, everything interactive is a pill), soft low-alpha elevation instead of borders.
- **Motion:** cards rise + fade with a short stagger, press = scale .97, bottom sheet slides in; all disabled under reduced-motion.
- **Add flow:** floating + button → bottom sheet, mirroring Simmr's share/add pattern.
Implemented in `worker/public/index.html`.

## Recipe support (2026-09-22)
Modeled on Simmr: a save can now come back as ingredients + steps, not just a summary.
- `topic: food` is a new topic; when set, the note gets an **Ingredients** (bulleted, real
  quantities) and **Steps** (numbered) section, pulled from wherever the recipe actually is:
  audio, on-screen text, the caption, or comments.
- **Comments are fetched** (`stash/fetch.py`, yt-dlp `--write-comments`) for single
  reels/videos, top 8 by like count, fed into the same extraction prompt as the caption.
  Creators write "full recipe in the comments" more often than they read it aloud.
- **Carousel posts (`/p/...` with multiple images) never get comments.** Verified against
  yt-dlp 2026.7.4's Instagram extractor: it hardcodes `get_comments=False` for the carousel
  path regardless of flags. Only single-video/reel posts return real comment text. If a
  future yt-dlp version changes this, re-check before assuming it's fixed.
- Ingredients render as a tap-to-tick checklist (remembered per device), steps as a
  numbered list, and the note's button reads "I made this".
- Ingredient search works through normal search (ingredients are indexed); there's no
  separate ingredient filter.

## Lists (2026-09-27)
Books, movies, shows, podcasts, places, products and people named in any save become
`mentions: [{type, name}]`. The **Lists** screen shows them deduped across posts ("in 3
posts"), filterable by type, each with a tick ("Read?", "Watched?", "Been?") synced to the
server, done items sorted last and struck through. Tapping one opens the post it came from.

## Covers (2026-09-27)
Cards lead with a real cover: a 360px JPEG from the first image or 1s into the video,
served from D1 at `/t/<id>`. The serif initial stays underneath as the fallback.

## Still open
1. Collections beyond auto-topics.
2. Wordmark and name: currently "Stash" set in Gloock; a rename is being considered.
