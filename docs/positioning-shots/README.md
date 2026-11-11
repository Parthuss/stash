# Landing repositioning: for Parth to approve (11 Nov 2026)

Branch `crew/1111-150130-d3fd`. Not deployed. Pricing/Plus markup untouched.
Balance: the work use case is in the hero and has its own section; recipes, lists, search, the
recipe demo, the screenshots and the ChatGPT/Claude connector all stay where they were.

Shots: `before-*` = master 85847dc, `after-*` = this branch (390 and 1280 wide, system Chrome,
reduced motion so the hero phone shows its final frame). Re-shoot with
`node docs/positioning-shots/shoot.cjs <worker/public> <outdir> <prefix>`.

## Copy: before / after

| Where | Before | After |
|---|---|---|
| h1 | The reels you save, finally useful. | Everything you save, actually useful. |
| Lede | Share a reel to Skwirl. A couple of minutes later it's a note you can search: recipes come back as ingredients and steps, books and movies land in a list, tips come with the next step. And Claude can check your saves while you work. | Share a reel to Skwirl and a couple of minutes later it's a note you can search: recipes come back as ingredients and steps, books, films and places land in your lists. **And it comes back while you work: Claude Code pulls in the save that fits what you're building.** (own line, ink, semibold) |
| NEW section (after How it works) | n/a | **Your saves, back while you work.** That tutorial you saved months ago, right when you sit down to build. With the Skwirl plugin, Claude Code checks your saves on every message and brings in the one that fits. If nothing fits, you see nothing. Left: Claude Code card with the real 9 Nov test (prompt, "Checked Skwirl" chip, end of Claude's reply verbatim, caption "The end of Claude's reply in a real test, 9 November 2026. The prompt never mentioned Skwirl."). Right: Building / Planning sessions (therapists and teachers, own categories) / Making content, each with an example save chip. Buttons: Start free, How to set it up (guide). Fine print: "Only Claude Code checks on its own. ChatGPT and the Claude app can search your saves too: ask them to check Skwirl." |
| Ask your AI: text | ...look through your saves on your phone or computer. Claude can also check your saves while you work, for that design idea, Claude skill or GitHub repo you meant to try. Paste it a reel link... | ...look through your saves on your phone or computer. Paste it a reel link and it saves that too. (work moved to its own section) |
| Ask your AI: chats | 1) "Check my Skwirl, then help me build a landing page" (made-up "Hero sections that work" save) 2) pasta | 1) pasta 2) "Which books have I saved but not read yet?" (keeps this section about everyday saves; the real work proof is now in the new section) |
| FAQ: What is Skwirl? (visible + JSON-LD) | ...ChatGPT and Claude can read your notes too. It's free. | ...Your saves also come back while you work: with the Skwirl plugin, Claude Code checks them on every message and brings in the one that fits, and ChatGPT or the Claude app can search them when you ask. It's free. |
| FAQ: Can Claude use my saves while I work? (visible + JSON-LD) | Connect Skwirl to Claude and it can check... | In Claude Code, the Skwirl plugin checks your saves on every message... In the Claude app and ChatGPT... They may not check every time... + link "How to set it up" (visible only) |
| meta description | ...books and films in one list. Works with ChatGPT and Claude. Free. | ...books, films and places in lists. Claude Code brings the right save into your work. Free. |
| og/twitter title | Skwirl: the reels you save, finally useful | Skwirl: everything you save, actually useful |
| og/twitter description | ...Recipes, books, movies, tips, all in one place, and ChatGPT or Claude can read it. | ...Recipes, books, films and places in one place, and back while you work: Claude Code pulls in the save that fits. |
| JSON-LD | LifestyleApplication; "...readable by ChatGPT and Claude." | ProductivityApplication; "...ChatGPT and Claude can search them, and the Claude Code plugin brings in a save that fits while you work." |
| Footer | 3 guides | + "Use your saves in Claude" (guide `/guides/use-saved-reels-in-claude`, cherry-picked from the 9 Nov session, already in sitemap + llms.txt) |

## Decide
- h1: "Everything you save" drops the word "reels" from the h1 (the title tag still has it for SEO). Revert to "The reels you save, actually useful." if you prefer.
- The three example save chips (4 Web Animation Patterns is real from the test; "Fine motor games with pegs" and "3 hooks that stop the scroll" are illustrative, like the pasta/books mocks).
- "Start free" in the new section scrolls to the join box (signed-out visitors can't open Set up); "How to set it up" goes to the guide.

## After approval
Deploy, then `node worker/scripts/indexnow.mjs`, add a HANDOFF bullet, and add "While you work" as a pillar in promo/CONTENT_HANDBOOK.md (left alone here: that file has uncommitted work in the content-handbook worktree).
