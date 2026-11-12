-- The owner (STASH_SECRET, no user row) can add a verified email too, so the owner account can be
-- signed in to on any device with an emailed code (or Google, for a Gmail address), like everyone else.
-- One row at most. The address is set only after a code sent to it comes back.
CREATE TABLE IF NOT EXISTS owner_login (
  k INTEGER PRIMARY KEY CHECK (k = 1),
  email TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  secret_fp TEXT NOT NULL      -- HMAC(STASH_SECRET, email): rotating the secret also drops the address
);
-- Owner device tokens ("sto_..."), minted by an owner email/Google sign-in. Stored as an HMAC keyed
-- with STASH_SECRET, so rotating the secret (the owner's reset) signs every one of them out.
CREATE TABLE IF NOT EXISTS owner_token (token_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL);
