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

## Proposed identity (to react to, not sourced)
- **Feel:** a quiet personal library, not a feed. Stash's whole point is coming back to things, so density and calm over engagement bait.
- **Surfaces:** near-white and near-black themes, one accent used only for "unused / needs attention", since the unused count is the product's core metric.
- **Type:** one neutral grotesque for UI, one mono for tool names, commands and timestamps (notes are full of both).
- **Cards:** thumbnail-led masonry; title, topic chip, status dot (processing / ready / failed). Two radii total (cards, chips).
- **Empty / onboarding:** the only place for texture (dither or gradient) and larger motion.

## Open questions for you
1. Which existing app's *feel* do you want (Simmr, Things, Raycast, Are.na)? A single "like this" reference beats any adjective list.
2. Accent color: any strong preference or a color you want to avoid?
3. Do you want a mascot/wordmark, or type only?
