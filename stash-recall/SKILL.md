---
name: stash-recall
description: Search the user's stash of saved Instagram reels and social posts for material relevant to the work at hand. Use PROACTIVELY at the start of any build, design, writing, or planning task (websites and landing pages, UI, apps, agents, automation, AI tooling, prompting, copy, content, marketing, research), before proposing an approach or writing code or loading a more specific skill, and whenever the user describes wanting to build, try, or learn something. Skip only trivial edits. The user saves material intending to use it later and reliably forgets it exists, so they will almost never ask for this by name. Trigger on the topic, not on a request. Applies in every project, not just the one the stash pipeline lives in.
---

# Stash recall

The user collects developer and AI content on Instagram by DMing it to themselves.
It gets transcribed, enriched, and indexed into a local vault. The entire point of
that pipeline is this moment: surfacing a save at the time it is useful, without
being asked.

This skill lives at user scope (`~/.claude/skills/`), not inside the stash project
itself, precisely so it fires everywhere — the material in the vault is general
developer/AI content, not specific to whatever repo you're editing when it becomes
relevant.

## When to run

Search **before** you propose an approach, not after. By the time you have written
a plan, a saved note that contradicts it is an annoyance rather than an input.

Run it when the user:

- starts building, designing, writing, or planning anything: a site, a landing page, UI,
  an app, an agent, an automation, copy, content, a campaign, research
- says they want to build, try, explore, or learn something
- asks "how should I…" about anything in those areas
- opens a project that matches a note's `relevance` field

Run it before reaching for a more specific skill: a design skill does not know what
this user saved. Do **not** run it for trivial edits: a typo, a one-line CSS fix, a git
question, a rename. A search that returns nothing three times in a row is noise, and
noise gets the skill ignored.

## How to run

The `stash` MCP server is registered at **user** scope (`claude mcp add --scope user
stash ...`), so it is connected in every Claude Code session regardless of which
project you're in — there is no local/CLI fallback to fall back to, and none is
needed:

- `search_stash(query, topic?, status?, limit?)` — compact hits: short id, date,
  title, one-line summary, tools. Returns *candidates to look at*, not the full
  picture — see below.
- `get_stash_note(note_id)` — full detail for one note: transcript, on-screen text,
  next step, why it was saved, the permalink. Call this before relying on anything
  specific from a search hit.
- `list_stash_topics()`
- `list_stash_mentions(kind?)` — every book, movie, show, podcast, place, product or
  person named across all saves (kind narrows it, e.g. `"book"`). Use this for "what
  books/movies have I saved", not search. Recipe saves also carry ingredients and
  steps inside `get_stash_note`.
- `recent_stash(limit?, status?)`
- `mark_stash_used(note_id, where)`

If the `stash` tool is ever not connected (check with the results of a tool call,
not by asking the user), say so plainly rather than silently doing nothing — that
usually means the MCP registration broke, not that the vault is empty.

Search with the *concepts*, not the user's exact phrasing — the transcript is
spoken language, so "how do I keep state between runs" should be searched as
`agent memory persistence state checkpoint`. Search is hybrid (keyword + semantic),
so a close paraphrase still works, but keywords the note actually uses still help.
Never search the task as typed: "build a landing page that doesn't look AI-made" should
be `AI-generated UI tells` or `UI design anti slop`. If the first query is weak, try a
second one with different concepts. Results now have a relevance floor, so an empty
result means nothing close was saved.

## How to report what you find

`search_stash` gives you enough to judge relevance, not enough to cite specifics —
its summaries are truncated. Call `get_stash_note` on whichever hit looks like the
best match before you say anything concrete about it; the compact summary is a
model's further-compressed paraphrase and can be wrong about details the full
transcript gets right.

Weave what you find in; do not paste a list. One or two sentences, naming the
concrete thing:

> You saved a reel on this in June — it uses a Redis checkpointer on the LangGraph
> loop, and the note's suggested next step was adding one to `notes-agent/loop.py`.
> Want me to start there?

Then keep going with the actual task. If nothing relevant comes back, say nothing
at all — do not announce an empty search.

## Closing the loop

When a save actually influences the work — code written, a library chosen, an
approach adopted — call `mark_stash_used(note_id, where)`.

This matters more than it looks. `used` versus `unused` is the only measure of
whether the vault is worth maintaining. If nothing is ever marked used, the right
response is to change how recall works, not to keep filing notes into a graveyard.
