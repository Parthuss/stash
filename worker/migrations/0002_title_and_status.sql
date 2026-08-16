-- The phone previously had no way to ask "did my share actually finish?" — it
-- only knew the POST reached Cloudflare. `title` lets /status/:id answer with
-- something a human can read once the Mac has processed the capture.
ALTER TABLE capture ADD COLUMN title TEXT;
