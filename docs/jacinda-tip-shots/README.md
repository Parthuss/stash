# Plus first, then the Shortcut tip (iPhone, 390 px)

Seeded local test account set up like Jacinda: early tier, email on file, owner note `#gPlus ...`,
owner tip `shortcut`, no Shortcut saves. Driven by a Playwright script that asserts each step.

1. `01-first-open-plus.png`: first open. The Plus owner note is the only ask. No tip, push, source or feedback card (the note claims that visit's prompt slot).
2. `02-plus-section.png`: after tapping See Plus. Same visit: the tip stays queued.
3. `03-next-open-tip.png`: next app open. The note is gone, the tip card shows once and is cleared server-side as it shows.
4. `04-shortcut-setup.png`: after tapping Set it up: Save from your phone, iPhone tab, badge "To do" (on iPhone only Shortcut saves count).

A third open shows no tip. Fallback: if she ignores the Plus note, on a later visit the note is no longer "fresh", so the tip can show below it.
