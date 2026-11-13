-- A one-time tip the owner queues for one user (a preset key such as 'shortcut'). The app shows it
-- as a small card on a later visit than any fresh owner message, once, then clears it.
ALTER TABLE user ADD COLUMN owner_tip TEXT;
