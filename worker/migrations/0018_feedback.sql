-- Feedback people send from the library card. Email (with consent) goes on user.email.
CREATE TABLE IF NOT EXISTS feedback (user_id TEXT, at TEXT NOT NULL, message TEXT NOT NULL);
