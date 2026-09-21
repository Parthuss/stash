-- Bring-your-own Groq key, AES-GCM encrypted (key derived from STASH_SECRET).
-- Captures for a user with a key are processed on that key, off the shared quota.
ALTER TABLE user ADD COLUMN groq_key_enc TEXT;
