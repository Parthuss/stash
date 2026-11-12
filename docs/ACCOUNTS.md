# Accounts: email + code, or Google

Written 12 Nov 2026 on branch `crew/1112-121225-d392`. Not merged or deployed. This replaces the device-code/QR plan on `crew/1112-120240-1dc4`. Don't merge that branch; both touch the same files.

## How it works

- **Create account:** first name + email, then a 6-digit code we email you. The account is created once the code comes back, so every address on file has been proven.
- **Sign in:** email, then the code. If that address has no account, the code still works and the page asks for a first name to create one. This tells the person nothing they couldn't already learn, because they've just proven the inbox is theirs.
- **Continue with Google:** shown only when `GOOGLE_CLIENT_ID` is set. The ID token is checked on the server against Google's JWKS: RS256 signature, `iss`, `aud`, `exp`/`iat` (5 min skew) and `email_verified`. The account is found by Google id first, then by email, and the two are linked from then on. Linking happens only once: an account already tied to a different Google account is never taken over (for example a reassigned work address). That person gets a 409 and can use an email code instead.
- **Codes:** 10 minutes, single use (spent atomically), 5 tries.
  - Each attempt first spends a try on every live code for the address in one `UPDATE … RETURNING`, so parallel guesses can't share a try.
  - Up to 3 codes are live per address. Asking again doesn't cancel the one you're typing, so a stranger can't block your sign-in by requesting codes. Signing in spends them all. At rest the address is hashed (`email_hash`) and the code is an HMAC keyed with `STASH_SECRET`.
- **Rate limits:**
  - per network: 10 codes an hour and 30 code attempts an hour
  - per address: 5 codes an hour from one network, 15 an hour in total
  - per signed-in account adding an email: 10 an hour
  - Google: 20 tries per 10 minutes per network
  - The existing join limits (8 per 10 minutes, 20 a day per network, `MAX_JOIN`, invite code) apply to every way of creating an account.
- **No probing:** `/auth/email/start` gives the same answer whether or not the address has an account. With an invite code required, a wrong code gets the same 403 for known and unknown addresses. The only difference is inside the email itself: "to sign in" or "to create your account".
- **Each sign-in mints a device token.** The phone Shortcut, AI apps, Telegram and other signed-in devices keep working. Resetting the token in Profile still signs every device out.
- **Signed out?** Every way of landing signed out opens the Sign in dialog with the email box: forced sign-out, signing out yourself, a device that was signed in before, the home-screen app, a bad `#login=` link, and `skwirl.app/#signin`. "Sign in" is in the header, under the Create account form and at the bottom of the landing page.
- **Old ways in still work:** pasting a sign-in link or token ("Have a sign-in link instead?"), `#t=` links and Telegram `/login` links.

### Existing users (5 accounts, 1 with an email)

- On their next open, accounts with no email get **"Add your email"** with a **Not now** button. Tapping it is recorded on the server (`email_skip_at`). From the next open on, the prompt has no Not now, and Esc can't close it.
- Adding the email sends a code; the address is saved once the code is entered.
- **No lockout.** Once a code has gone out, a **Finish later** link appears, and the token keeps working the whole time. If adding fails (offline, address taken, send error, too many tries), **Finish later** appears right away. A failed send saves nothing: otherwise anyone could park an address they don't own by using up the sender's daily quota.
- The owner account is asked too (once, with **Not now**; never required). See "The owner's email" below.
- Until an account has an email, the app shows an "Add your email" banner (after Not now) instead of the old "save your sign-in link" one. With an email, no banner. Profile has an Email row (address + Change, or Add email) for everyone, owner included.
- Changing your email in Profile also goes through a code, and it can't be blanked.

### The owner's email (12 Nov, migration 0033)

The owner has no user row (STASH_SECRET is the owner token), so it had no email to sign in with. Now:

- The owner adds an address from the dialog or Profile → Email → Add email. A code goes to it; the address is saved in `owner_login` (one row) only once the code comes back. An address another account has proven can't be added, and once it's the owner's, no account can add it.
- Signing in with that address (code, or Google for a Gmail address only: Google vouches for its own addresses, not for others on a Google account) mints an owner device token `sto_…`. It's stored as an HMAC keyed with STASH_SECRET, so **rotating STASH_SECRET signs every owner device out**. The stored address is bound to the secret the same way (HMAC), so rotating also drops the owner email: a stolen owner session can't park its own address to get back in. Re-add the email after a rotation. Owner tokens don't expire on their own. It works for `/v1/*`, admin pages and `/mcp/<token>`, but not for the `X-Stash-Secret` routes (daemon, admin setup), which still need the secret itself.
- Extra caps for the owner address on top of everyone's: 6 codes and 10 guesses a day from all networks together (about 0.4% a year to guess a code under nonstop attack, and every attempt mails the owner a code). Trade-off: someone can burn the day's tries, so email sign-in to the owner is blocked until tomorrow; the secret link and signed-in devices keep working.
- The owner address can't be one any account already has on file (even unproven), since it signs in ahead of accounts.
- Every owner sign-in, and every owner email change, pings the owner (Telegram/email via notifyOwner) with the country and IP.

### Before the email sender is set up (today)

`GET /join` returns `email_login:false`. In that state:

- Create account still works straight away, but email is now **required**. Those addresses are stored unverified.
- The Sign in dialog shows a "switching on soon" note and the sign-in-link box.
- Once `RESEND_API_KEY` + `EMAIL_FROM` are set, everything switches over by itself. No redeploy is needed for that part: secrets take effect when they're set.

### Names

Accounts are keyed by `user.id`. Sign-in finds an account by `email` (verified owner first) or `google_sub`, never by name. I checked every `FROM user` and `UPDATE user` in worker/src, and the test suite asserts that no query finds a user by name. Two people called Sam get two accounts (test 6).

Feedback and Plus-waitlist addresses no longer get copied onto the account. The feedback reply address is stored with the message (`feedback.reply_to`).

One known edge case: an address typed in **without** proof is trusted the first time its owner proves it, by code or by Google. Once the sender is live, that can only come from the pre-sender window (email-off `/join` and add-email). So if someone typed another person's address into their own account before launch, that person would sign in to it. Only the 1 existing email and any typed during the pre-sender window are affected.

## Email sender: Resend free plan (recommended)

| Option | Plan needed | Cost at ~500/mo | Notes |
|---|---|---|---|
| **Resend** | Free: 3,000/mo, 100/day, 3 domains | $0 | A plain `fetch` call, so it works on Workers Free (our plan). DNS records go on `send.` and `resend._domainkey`, so the apex MX that Email Routing uses for support@skwirl.app is left alone. |
| Cloudflare Email Sending | **Workers Paid**, $5/mo (3,000 included, then $0.35 per 1,000) | $5 | Sending to arbitrary recipients needs Workers Paid. The code supports it anyway: add a `[[send_email]] name = "EMAIL"` binding and set `EMAIL_FROM`. |

Checked 12 Nov 2026: resend.com/pricing, resend.com/docs/api-reference/emails/send-email, resend.com/docs/dashboard/domains/cloudflare, developers.cloudflare.com/email-service and its pricing page. Not confirmed: whether Resend's signup asks for a card. Its pricing page doesn't say.

## Setup steps for Parth

### A. Resend (about 15 min)

1. Sign up at https://resend.com on the **Free** plan. If it asks for a card, stop and tell me.
2. Go to **Domains → Add domain**, enter `skwirl.app` and pick a region (us-east-1 is fine).
3. Add the DNS records. The easiest way is **Auto configure**, which signs in to Cloudflare and adds them for you. To add them by hand instead, go to Cloudflare → skwirl.app → DNS and copy the exact values Resend shows. All of them must be **DNS only** (grey cloud):
   - `MX` named `send` → `feedback-smtp.<region>.amazonses.com`, priority 10
   - `TXT` named `send` → `v=spf1 include:amazonses.com ~all`
   - `TXT` named `resend._domainkey` → `p=…` (the long DKIM key)
   - If there's no DMARC record yet: `TXT` named `_dmarc` → `v=DMARC1; p=none;`

   None of these touch the apex MX/TXT records that Email Routing uses.
4. Wait for the domain to show **Verified**.
5. Go to **API Keys → Create API key**, with permission **Sending access** and domain `skwirl.app`. Copy the key, and don't paste it into any chat.
6. Set the secrets:
   ```
   cd ~/Work/Experiment/stash/worker
   npx wrangler secret put RESEND_API_KEY -c wrangler.local.toml   # paste the key
   npx wrangler secret put EMAIL_FROM -c wrangler.local.toml       # type: signin@skwirl.app
   ```
   `deploy.sh` deploys with `wrangler.local.toml`, so the secrets go on that config too.

### B. Google sign-in (about 10 min, optional, can come later)

1. Go to https://console.cloud.google.com and create a project named "Skwirl" (or reuse one).
2. Open **Google Auth Platform → Branding**. Set the app name to `Skwirl`, the support email to yours, and the logo is optional. Add `skwirl.app` under authorised domains. Set the privacy policy to `https://skwirl.app/privacy` and the terms to `https://skwirl.app/terms`.
3. Under **Audience**, choose **External** and then **Publish app** (so the status is "In production"). We only ask for the basic `openid email profile` scopes, so Google doesn't need to review it.
4. Go to **Clients → Create client**, type **Web application**, named "Skwirl web".
   - **Authorised JavaScript origins:** `https://skwirl.app`. Also add `https://skwirl.parthakholkar.com` if you want the old domain to show the button.
   - **Authorised redirect URIs:** leave empty. We use the popup flow, which has no redirect.
5. Copy the **Client ID** (`….apps.googleusercontent.com`). It's public, not a secret, but set it like the others:
   ```
   npx wrangler secret put GOOGLE_CLIENT_ID -c wrangler.local.toml
   ```

### C. Deploy (after merging this branch)

1. Apply the migration and deploy in one go. This repo applies migrations by file, not with `migrations apply`:
   ```
   cd ~/Work/Experiment/stash/worker
   ./deploy.sh migrate migrations/0032_accounts.sql
   ```
   Run it once only: the ALTERs fail on a re-run. Use plain `./deploy.sh` for later deploys.
2. Check that it actually ran. The handoff notes that `d1 execute --file` once silently didn't:
   ```
   npx wrangler d1 execute stash --remote -c wrangler.local.toml --command "SELECT name FROM sqlite_master WHERE name='email_code'"
   ```
3. Verify:
   - `curl -s https://skwirl.app/join` should show `"email_login":true` (and your `google_client_id` if set).
   - In a private window, go to skwirl.app → Sign in, enter your email, and the code should arrive (check spam the first time) and sign you in.
   - Optional: Create account with a throwaway address, then delete it in Profile.
4. Privacy page (your call, it's policy text): add "Sign-in codes are emailed through Resend, which sees your email address and the message" and, if Google is on, "If you continue with Google, Google tells us your name and email address."

## Tests

`node tests/signin_otp.cjs` runs 23 checks against a real SQLite database built from every migration. They cover:

- normalisation
- sign-up with the name prompt
- single use and hashing at rest
- same-name accounts
- expiry and the 5-try limit
- 3 live codes per address
- a burst of parallel guesses
- per-address and per-network limits
- no probing
- invite gating
- email off/on
- the add-email ask (skippable, then required)
- profile email change
- a failed send or a feedback address never puts an unproven email on an account
- Google tokens: valid; wrong aud, wrong iss, expired, future iat, unverified email, forged signature, alg none, tampered; JWKS cache and refetch
- /auth/google creating, re-finding and linking accounts (no re-link to a second Google account)
- no user lookups by name

The Resend and Google JWKS stubs are local, so nothing leaves the machine.

Screenshots in docs/signin-shots/ (phone 390 px and desktop 1280 px) were taken with the API mocked. The Google button in `01b`/`02` is a lookalike stub, because the real one is drawn by Google's script.
