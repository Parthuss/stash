-- Structured mentions (books/movies/shows/etc), same idea as `tools`: a JSON
-- array so "what movies have I saved" is a real query, not a markdown grep.
ALTER TABLE note ADD COLUMN mentions TEXT NOT NULL DEFAULT '[]';
