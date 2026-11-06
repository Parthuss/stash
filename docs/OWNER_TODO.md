# What needs you (Skwirl, formerly Stash)

Updated 2026-11-03. Everything here needs your judgement, your phone, your money or your
accounts. The rest has been done. Order: top to bottom.

## 00. New on 6 Nov (after the D1 outage)

- [x] **Fixed the cloud runner's GitHub token (6 Nov, expires in a year; test with POST /admin/runner/kick).** Was: The last 40 runs were all on the timer and none came from the Worker, so `GH_DISPATCH_TOKEN` isn't working, and friends' saves wait 4 to 7 hours whenever the Mac sleeps. GitHub → Settings → Developer settings → Fine-grained tokens → Generate: repository `Parthuss/stash` only, permission Actions: Read and write. Then, in `worker/`: `npx wrangler secret put GH_DISPATCH_TOKEN -c wrangler.local.toml` and paste it.
- [ ] **Connect your owner account to @skwirl_bot** (sign in as owner → Set up → Save from Telegram → Connect). Health alerts (DB failing, queue stuck, new user) now go there. Then ask Claude to copy your chat id into the `OWNER_TELEGRAM_CHAT` secret, so alerts still arrive when D1 itself is down.
- [ ] **Optional, $5/month: Workers Paid.** Raises D1 from 5M reads/day to 25B/month (no repeat of 6 Nov) and turns on email sign-in links. To switch email on after upgrading:
  1. Cloudflare dashboard → Email Service → onboard `parthakholkar.com` (it adds the DNS records).
  2. Add to `worker/wrangler.local.toml`: `[[send_email]]` with `name = "EMAIL"`, and under `[vars]` `EMAIL_FROM = "hello@parthakholkar.com"` (any address on that domain).
  3. `./deploy.sh`. The "Email me a link" form appears under Sign in by itself (`/join` reports `email_login: true`).

## 0. New on 3 Nov: closing the gap with Stashr AI (do these first, ~30 min)

Built and live: connector for any AI app (sign in + Allow), `save_link` from chat, Instagram
export import, meaning-based search, Telegram bot (hidden until you do step 2), free-only pricing.

- [ ] **Try the connector in ChatGPT and Claude** with your own account. Address:
      `https://skwirl.parthakholkar.com/mcp`. ChatGPT: Settings → Apps & Connectors → Advanced →
      Developer mode → Create → paste, OAuth. Claude: Settings → Connectors → Add custom connector.
      You should land on Skwirl's Allow page. Then ask "what recipes have I saved?" and paste a
      reel link with "save this to Skwirl". Tell me what breaks (menu names may differ from these).
- [x] **Telegram bot: done 2026-11-04** (@skwirl_bot, webhook set, description and commands set). Left: optional profile picture via @BotFather `/setuserpic`. Original steps, for a fork: In Telegram, message @BotFather → `/newbot` → name
      "Skwirl", username e.g. `skwirl_save_bot` → copy the token. Then:
      ```
      cd worker && npx wrangler secret put TELEGRAM_BOT_TOKEN -c wrangler.local.toml
      curl -X POST https://skwirl.parthakholkar.com/admin/telegram/setup -H "X-Stash-Secret: <STASH_SECRET>"
      ```
      "Save from Telegram" then appears in everyone's Set up. Optional in @BotFather: `/setuserpic`
      with `design/logo`, `/setdescription` "Send me a reel link and I'll save it to Skwirl."
- [ ] **Try the import** with your real Instagram export (it's yours, so no cap).
- [ ] **Instagram DM and WhatsApp saving: only if you want to go further.** Both need a Meta
      business app that Meta reviews (business verification, privacy policy URL, a screencast).
      Instagram: a professional (Creator/Business) account for @skwirl, a Meta app with Instagram
      messaging, `instagram_manage_messages` approved in App Review, then set `IG_APP_SECRET`,
      `IG_VERIFY_TOKEN`, `IG_ACCESS_TOKEN`. The webhook in `worker/src/index.ts` already verifies
      and queues DMs, but only for the owner today; tell me when Meta approves and I'll add the
      per-person link step (same as Telegram's). WhatsApp Cloud API: Meta Business account plus a
      phone number not on WhatsApp already; first 1,000 conversations a month are free.
      Realistically 1-3 weeks of Meta back-and-forth. Telegram covers "send it to a chat" now.

## 1. Check on your phone (15 min, do this first)

Nothing has been tested on a real phone since the redesign. On https://skwirl.parthakholkar.com:

- [ ] **Landing page on iPhone.** Does the phone animation play smoothly? Is the sticky
      frosted header readable over the pricing cards and the phone?
- [ ] **Join → Shortcut → share a reel.** Join as "Test", add the Shortcut, share one
      Instagram reel. Do you get the "Saved to Stash" alert? Does the note show up?
- [ ] **Home screen on iPhone.** Set up → *Put Stash on your home screen*. Follow the steps,
      open it from the home screen, tap *Paste my sign-in link*. Are you in?
- [ ] **Android (borrow one).** Chrome → *Install app*, then share a reel and pick Stash.
- [ ] **The app after today's fixes** (list below). Anything that feels off, screenshot it.
- [ ] Delete the test account afterwards (Set up → Your account → Delete my account).

## 2. Decisions only you can make

- [x] **Name: Skwirl** (decided 2026-10-29). Live at `skwirl.parthakholkar.com`; the old
      `stash.parthakholkar.com` keeps working for existing users. Still to do: trademark search
      (USPTO and India's IP office, class 9/42), then buy `skwirl.app` (~$15/yr on Cloudflare)
      when you're ready for Product Hunt or the stores.
- [x] **Pricing: free only** (decided 2026-11-03). The landing page shows Free and Free with
      your own Groq key, no paid plan. The real limit is the shared Groq key (~25-30 reels a day
      for everyone); see "Groq paid tier" below if it starts queueing.
- [ ] **Contact email** for `worker/public/privacy.html` and `terms.html`. Pick one you're
      happy to have public (a new Gmail or `hi@parthakholkar.com`). Needed before Reddit and
      for any app store. Give me the address and I'll add it.
- [ ] **Android: which route** (see §4). Recommendation: keep the free install-from-Chrome
      route for the pilot, pay the $25 Play fee only once the pilot passes.

## 3. Things to do (accounts and posting)

- [ ] **Invite 10 friends** with the DM in `docs/LAUNCH.md` (week 1). On day 3, check Admin
      for anyone with 0 saves and ask them where they got stuck.
- [ ] **Post on r/ClaudeAI** in week 2 with the draft in `docs/LAUNCH.md`, in your voice.
- [ ] **Renew `GH_DISPATCH_TOKEN` before 26 Nov 2026.** It's what makes friends' saves
      process in seconds instead of hours. Steps in `docs/PILOT.md`.
- [ ] **Raise the 50-account cap** when it fills: `MAX_JOIN = "200"` under `[vars]` in
      `worker/wrangler.local.toml`, then `worker/deploy.sh`.
- [ ] **Groq paid tier** if the shared key starts queueing (about 20–30 active people). Roughly
      1¢ per save.
- [ ] Payments: **not yet.** Only once ~30 people use it weekly. The build plan is in
      `docs/PRODUCT.md` §3.
- [ ] Optional: install the marketing skills (`npx skills add coreyhaines31/marketingskills`).

## 4. Android: can we publish for free?

Short answer: **you can get Stash onto Android phones for free today, and already do. A Play
Store listing costs $25 once, and new personal accounts must first run a 2-week test with 12
people.**

| Route | Cost | What it takes | Verdict |
|---|---|---|---|
| **Install from Chrome (what we have)** | $0 | Nothing more. Chrome → *Install app* gives a real app icon, and Stash appears in the Android share menu (the manifest's `share_target`). | Good enough for the pilot. Already live |
| **Google Play** | **$25 once** (not yearly, unlike Apple's $99/yr) | Google account, government ID check. **Personal accounts made after Nov 2023 must run a closed test: at least 12 testers opted in for 14 days in a row**, then apply for production (review is about a week). Organisation accounts (need a D-U-N-S number) skip the test | Do it after the pilot. Your pilot friends become the 12 testers |
| **APK you hand out yourself** | $0 | Build an APK from the website (below) and share the file | Fine for a few friends, but Google is rolling out developer verification for sideloaded apps: Brazil, Indonesia, Singapore and Thailand from 30 Sep 2026, everywhere in 2027. A free "hobbyist" account is planned with a device limit. Not worth it when Chrome install is free |
| F-Droid | $0 | Open-source only, built from source. F-Droid itself is fighting the verification rules | Doesn't fit: Stash is a hosted service, F-Droid users expect self-contained apps |

**How the Play app would be built, with no new code:** wrap the existing site as a *Trusted Web
Activity* using **PWABuilder** (pwabuilder.com, free, point it at the URL) or Google's
**Bubblewrap** CLI. It produces the `.aab` file Play wants, and the app is just Stash full-screen
with no browser bar. Same app, same updates (you deploy the website, the app updates). Check
on a real device that the share-menu entry survives the wrap; Bubblewrap has a share-target
setting for this.

The plan:
1. Pilot on Chrome-install (free, now).
2. Pilot passes → pay $25, register (ID check takes a few days), generate the TWA with
   PWABuilder, upload it to a closed test, invite 12+ pilot users by email, wait 14 days.
3. Apply for production. Store listing needs: icon (have it), screenshots (have them in
   `worker/public/shots/`), a privacy policy URL with a contact email (§2), a data-safety form.

Sources: [12 testers / 14 days rule](https://www.testfi.app/blog/google-play-closed-testing-requirement-explained),
[closed testing requirements 2026](https://www.testerscommunity.com/blog/google-play-closed-testing-requirements-2026),
[Android developer verification (Google)](https://support.google.com/android-developer-console/answer/16561738?hl=en),
[how verification works](https://www.androidauthority.com/how-android-app-verification-works-3603559/),
[F-Droid's open letter](https://f-droid.org/en/2026/02/24/open-letter-opposing-developer-verification.html),
[PWA in Play codelab](https://developers.google.com/codelabs/pwa-in-play).

## 5. What the UI audit fixed today (so you know what to look at)

Checked every screen at 320px, 375px and desktop: library, note, Lists, Set up, the add
sheet, the public share page, the landing page.

- **Header buttons were too small to tap** (30px). Now 36px, same as the filter chips. On
  very small phones (under 360px) the "5 unused" pill hides so *Set up* no longer drops to a
  second line.
- **Set up cards didn't look tappable.** "Good to know" and "Your account" had no badge and
  no arrow. Every card now has a chevron that flips when open.
- **Note buttons wrapped badly:** "Share" sat alone on a second row. On phones the main
  action (*I made this* / *Mark as used*) is now full width, with *Open original* and *Share*
  side by side under it.
- **Back button scrolled away** on long notes and Set up. It now floats at the top (frosted,
  like the landing header).
- **Marking a note as used didn't update its "Unused" tag** until you reopened it. Fixed.
- **Signing out could lose your account.** There's no password, so if you never saved your
  sign-in link, sign-out was a one-way door. It now warns first.
- **Search had no icon**, and the filter row gave no hint it scrolls sideways. Added a
  magnifier and a fade on the right edge.
- **Lowercase labels everywhere** ("all", "food", "travel"). Filters, card topics and the share
  page now use capitals.
- **Lists said** `book · from "5 books that change…` with a dangling quote. Now
  `Book · 5 books that changed…`.
- **The add sheet** now closes with Escape on a computer.
- **Set up said "Three things to set up"** above four cards. Now "A few minutes, once."

Left alone on purpose: Delete account and Reset token use the browser's own confirm boxes
(ugly but clear, and they work everywhere). The detector's other flags were false positives.
