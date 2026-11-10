# Brief: reposition Skwirl around "your saves, used while you work"

Written 9 Nov 2026 by the main-app session. Run `scripts/whatsup` and follow AGENTS.md first.

## Why
The site and content sell Skwirl as a recipe/books/movies saver. That category is crowded. The thing
nobody else does: the reels you saved come back to your AI at the moment they're useful. As of 9 Nov
that is real and proven:
- **Claude Code (automatic, verified end to end):** the Skwirl plugin (Set up → Connect ChatGPT or
  Claude → "Copy install command") checks saves on every message. Test transcript, verbatim:
  prompt "Help me add a scroll-driven parallax hero to a landing page. Short plan only." → Claude opened
  the user's saved "4 Web Animation Patterns" reel unprompted and ended its plan with: *Your saved post
  "4 Web Animation Patterns" (Web Pros, link) lists parallax, scrub and pin + transform as scroll
  patterns. This plan does the parallax.* An unrelated git question brought up nothing.
- **Claude app / ChatGPT (connector):** they can search saves; with the connector instructions and the
  one line in Claude's preferences (Set up) they usually check during work tasks. Not guaranteed.
- Real work users exist: an Australian occupational therapist uses it to plan therapy sessions from
  reels (never name her; "an OT in Australia" at most, and only with Parth's OK).

## Honesty rules (hard)
- Only Claude Code is "automatic". For the Claude app and ChatGPT say "can check" / "searches your
  saves when you work", never "always" or "automatically".
- No invented testimonials, numbers or users. No "open source" (license is FSL). No em dashes.

## Plan
1. **Hero** (worker/public/index.html): lead with work, keep recipes as the easy second example.
   Direction (refine the words, keep the meaning): h1 "Save it on Instagram. Claude brings it back when
   you need it." Lede: share a reel, it becomes a note; Claude Code pulls the right one in while you
   build; recipes, books and places land in lists too. Eyebrow can stay "Free · works with ChatGPT and
   Claude". Keep the existing share-to-note animation.
2. **New section "While you work"** (after How it works): three short cases, each one line + a tiny
   example save: building (Claude skills, GitHub repos, design ideas), session planning (therapists,
   teachers: activity ideas sorted into your own categories), content (hooks and formats). Then the
   Claude Code install pitch with a "Set it up" button that opens Set up → Connect ChatGPT or Claude.
3. **Proof**: put the real exchange above in the "Ask your AI" section as the first chat (Claude Code
   styling: the user's prompt, a "Skwirl" context chip, Claude's reply citing the save). The pasta chat
   stays second. If Parth records a real screen capture later, it replaces this.
4. **Meta**: `<meta name=description>`, og/twitter descriptions, JSON-LD description and
   `applicationCategory` (ProductivityApplication), and the "What is Skwirl?" FAQ (visible + JSON-LD)
   all mention the work use. Keep them truthful per the rules above.
5. **Guide page** `worker/public/guides/use-saved-reels-in-claude.html`, same template as the other
   guides: what it does, Claude Code plugin install (the one-line command, key from Set up), Claude app
   and ChatGPT connector + the preferences line, what is sent (each Claude Code message is compared
   with your saves, then dropped, never stored). Add it to sitemap.xml, llms.txt, the footer guide
   links, then run `node worker/scripts/indexnow.mjs`.
6. **Content handbook** (promo/CONTENT_HANDBOOK.md): add "While you work" as a main pillar with 3-4
   reel ideas. Don't edit promo files another session has uncommitted (check whatsup; the
   content-handbook worktree owns script 13 "Claude found it"); message that session instead.

## Coordination (important)
The Plus/Dodo session is editing worker/public/index.html and app.js right now. Claim this task on
`.agents/BOARD.md`. Do the guide page and handbook first; touch index.html only after the Plus work is
merged to master (or coordinate with that session via SendMessage), then rebase. Keep edits to the
landing sections; leave pricing/Plus markup to the Plus session.

## Verify, then ask before deploying
- Screenshots at 390px and 1280px wide (system Chrome via Playwright, see HANDOFF.md local notes) of
  the hero, the new section, the proof chat and the guide page. No overflow, no clipped text.
- Signed-in app still loads (landing hidden), and existing tests pass.
- Show Parth the screenshots and the new copy, and deploy only after he says yes (it's the public site).
- Commit by file name, push as Parthuss, update HANDOFF.md in one short bullet.
