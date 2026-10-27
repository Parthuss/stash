# Run your own Stash

Your own copy, on your own free accounts. Nothing goes through anyone else's server or AI
key. About 20 minutes, and you'll need a computer with Node.js. No Mac needed.

What it runs on (all free tiers):
- **Cloudflare Workers + D1:** the app, the API, the Claude connector and the database.
- **GitHub Actions:** downloads and reads each reel, in your fork.
- **Groq:** the AI that transcribes and reads the reel. Free key, no card.

## 1. Get the pieces
1. Fork this repo on GitHub (top right, **Fork**).
2. Get a Groq key at https://console.groq.com/keys. It starts with `gsk_`. Keep it handy.
3. Make a free Cloudflare account at https://dash.cloudflare.com/sign-up.

## 2. Put the app on Cloudflare
```bash
git clone https://github.com/<you>/stash && cd stash/worker
npm install
npx wrangler login
npx wrangler d1 create stash        # prints a database_id
```
Paste that id into `worker/wrangler.toml` in place of `REPLACE_ME`. Then:
```bash
npx wrangler d1 migrations apply stash --remote
openssl rand -hex 32                # your admin secret: copy it, keep it private
npx wrangler secret put STASH_SECRET   # paste the secret
npx wrangler secret put JOIN_CODE      # any word; you'll type it to make your account
npx wrangler deploy                 # prints your URL, like https://stash.<you>.workers.dev
```

## 3. Turn on processing (GitHub Actions in your fork)
In your fork on GitHub: **Settings → Secrets and variables → Actions**.
- **Secrets:** `STASH_WORKER_URL` (your URL from step 2), `STASH_SECRET` (same secret),
  `GROQ_API_KEY` (your `gsk_` key).
- **Variables:** `STASH_ENABLED` = `true`.

Then open the **Actions** tab and click **I understand, enable workflows**. Saves are now
picked up every few minutes (GitHub's timer is often late, sometimes by hours).

**Optional: process saves within a minute.** Make a fine-grained token at
https://github.com/settings/personal-access-tokens/new with access to only your fork
and **Actions: Read and write**, then:
```bash
npx wrangler secret put GH_DISPATCH_TOKEN
```
and add `GH_REPO = "<you>/stash"` under a `[vars]` section in `wrangler.toml`, and deploy again.

## 4. Use it
Open your URL, type your name and, when it asks for an invite code, use your `JOIN_CODE`. Then follow **Set up** in the app:
Android install, the Claude connector, and the home screen.

**iPhone Shortcut:** the Shortcut has your URL built in, so it has to be rebuilt for your
copy. That needs a Mac: `brew install cherri`, put `STASH_WORKER_URL=<your url>` in a
`.env` file at the repo root, run `shortcuts/build.sh`, then deploy again. No Mac? Use the
**+** button in the web app, or Add to Home Screen and paste links.

## Good to know
- **YouTube blocks GitHub's servers**, so YouTube Shorts fail in the cloud. Instagram works.
  Running the local daemon on a Mac at home (README → "Try it") gets around this.
- **Updating:** pull from this repo into your fork, run
  `npx wrangler d1 migrations apply stash --remote`, then `npx wrangler deploy`.
- **Your data is yours:** it lives in your D1 database, and Set up → Export gives you all of it.
