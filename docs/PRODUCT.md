# Turning Stash into a product: name, pricing, how people run it

Written 2026-10-27. Straight answers first, reasoning after.

- **Name:** **Skwirl** (decided 2026-10-29, live at skwirl.parthakholkar.com). Squirrels stash things for later; that is the product. It's free on
  the App Store, `skwirl.app` is unregistered, and a web search finds no app by that name.
- **Pricing:** free during the beta. After that: Free, Free with your own key, and **Pro at
  $5/month or $40/year**. It's already on the landing page as "after the beta", so nobody is
  surprised later.
- **"Run it without me":** that exists today in two ways. (1) Hosted, with their own Groq
  key, so you cover only near-zero hosting. (2) Fully self-hosted from the open-source repo,
  written up in `docs/SELF_HOST.md`. Pro is for everyone else: people who won't make a Groq
  account and will happily pay $5 not to.
- **Don't build payments yet.** Build checkout once 30 people use it weekly, or once people
  keep hitting the free limit. It's about a day of work at that point (below).

## 1. What a save actually costs (from your own usage log)

Admin shows about **4,200 AI tokens and 56 seconds of audio per save**. At Groq's listed
prices ($0.111 per hour for Whisper; the Qwen vision model is in preview at about $0.80 in
and $4 out per million tokens, so recheck it), that comes to:

| | Per save | 100 saves/month | 300 saves/month |
|---|---|---|---|
| AI (Groq) | ~$0.007–0.01 | ~$1 | ~$3 |
| Hosting (Cloudflare free tier, GitHub Actions free on a public repo) | ~$0 | ~$0 | ~$0 |

So a heavy Pro user costs about $1–3 a month. At $5 a month, minus about 10% for the payment
provider, you keep roughly $1.50–3.50 per Pro user. The annual plan is better for you: one
payment fee, and less churn.

## 2. Plans

| Plan | Price | What you get | Who it's for |
|---|---|---|---|
| **Free** | $0 | Everything (notes, recipes, lists, search, Claude connector). After the beta, about **30 saves a month** on the shared AI | Trying it, light savers |
| **Free, own key** | $0 | 200 saves a day; they paste a free Groq key | Techy people, and anyone who won't pay |
| **Pro** | **$5/mo or $40/yr** | Unlimited saves (fair use around 500 a month), no key needed, processed first | Normal people who save a lot |
| **Self-host** | $0 | Their own copy on their own free accounts | Developers, privacy people |

Why these numbers:
- **Category price:** ReciMe, a reel-to-recipe app, charges $39.99 a year. $40 a year fits
  what people already pay for this kind of app, and Stash does more than recipes.
- **Not $1.99:** the pricing skill below warns that ultra-low prices bring signups that never
  pay, and are hard to raise later. $5 is the normal price for a personal tool.
- **Limit saves, not features.** The Claude connector stays free. It's the reason people come
  back, so hiding it would kill the habit that leads them to pay. Volume is the thing that
  costs you money, so volume is what you charge for.
- **Keep the own-key plan.** It costs you nothing, it makes "open source, run it yourself"
  real, and the people who use it were never going to pay anyway.

## 3. Payments, when it's time

**Web first.** Use a merchant of record: it sells on your behalf and handles sales tax and
VAT in every country, so you don't register for tax anywhere. Options: Lemon Squeezy, Paddle,
Polar, Dodo Payments. Pick the one that pays out to your bank in India with the lowest fee;
check each one's payout countries before signing up.

The build, about a day:
1. Migration: `ALTER TABLE user ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'`, plus `plan_until`.
2. An "Upgrade" button in Set up opens the provider's hosted checkout, with the user id attached.
3. `/billing/webhook` in the Worker checks the provider's signature and sets `plan`.
4. The quota check in `v1.ts` `/v1/ingest` reads `plan`, the same way it already reads `own_key`.
5. Pro saves get claimed first: add `ORDER BY` on plan in `/claim`.

**Store apps later.** Apple and Google make you sell digital subscriptions through in-app
purchase. Apple takes 15% under its small-business programme. RevenueCat handles both stores
and links to the same `plan` column. Check Apple's current rules on linking out to web
checkout before deciding.

## 4. Order of work

1. **Now (done tonight):** landing page with pricing shown as "after the beta", the self-host
   guide, the home-screen guide, the new icon.
2. **Weeks 1–3:** get users (`docs/LAUNCH.md`). Watch who hits the 30-a-day cap.
3. **About 30 weekly users:** rename to Skwirl and buy `skwirl.app`. Build checkout. Turn the
   free tier into 30 a month, keep current beta users on unlimited for their first month,
   then email or announce in the app.
4. **Pilot passes (`docs/PILOT.md` go/no-go):** the Expo app, with in-app purchase through
   RevenueCat.

## 5. Name: what was actually checked

Checked on 2026-10-27 against the App Store search API, RDAP domain records and a web search.
Almost every short `.com` is taken, so judge names on the app stores and `.app` domains.

| Name | App Store | .com | .app | Notes |
|---|---|---|---|---|
| **Skwirl** | free | taken | **free** | Best fit: squirrels stash for later. Easy to say, Simmr-style spelling |
| Squirr | free | taken | free | Same idea, but harder to say |
| Snaggl | "Snaggle" games exist | taken | free | "Snag it". Different category, but a similar name exists |
| Magpi | several "Magpie" apps, one a notes app | taken | free | A good metaphor (magpies collect shiny things), but crowded |
| Stashd, Keepr, Kept, Latr, Reelr, Savd, Nestd | taken | taken | taken | Out |

Before you commit: do a trademark search (USPTO TESS and India's IP office) for "Skwirl"
in class 9/42 (software), then buy `skwirl.app` (about $15 a year on Cloudflare). Until then
`stash.parthakholkar.com` works fine; a subdomain like `skwirl.parthakholkar.com` is free.

## 6. What you need, and what it costs

| Thing | When | Cost |
|---|---|---|
| Domain (`skwirl.app`) | at rename | ~$15/yr |
| A contact email on privacy and terms | before Reddit | free |
| Groq paid tier | when the shared key queues | pay as you go, ~1¢ a save |
| Merchant-of-record account | at checkout | ~5–10% of each sale |
| Apple Developer / Google Play | store apps | $99/yr, $25 once |
| RevenueCat | store apps | free until $2.5k/month in revenue |
| Lawyer look at privacy and terms | before taking money | one-off |

## 7. A planning toolkit for Claude (GitHub)

**[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)** (MIT,
about 57k stars, updated this week). It's a set of Claude Code skills for exactly this. The
relevant ones are `pricing`, `paywalls`, `launch`, `aso` (app store listing), `onboarding`,
`referrals`, `product-marketing` and `competitors`. I used its pricing and launch skills for
this doc (the "avoid ultra-low pricing" rule and the ready-to-launch checklist). Install:
```bash
npx skills add coreyhaines31/marketingskills
```
Already installed for you: `product-strategist`, `product-manager-toolkit`,
`competitive-teardown`, `market-research` and `experiment-designer`. Ask for one by name,
e.g. "use market-research to size this".

Sources: [ReciMe pricing](https://recime.app/help/en/articles/11630592-how-much-does-the-recime-subscription-cost),
[Groq Whisper pricing](https://console.groq.com/docs/model/whisper-large-v3),
[Groq price list (third-party, preview models)](https://www.morphllm.com/groq-pricing),
[marketingskills](https://github.com/coreyhaines31/marketingskills).
