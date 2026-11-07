-- A one-off note from the owner to one user, shown as a banner on their next visit until they tap it.
ALTER TABLE user ADD COLUMN owner_msg TEXT;
