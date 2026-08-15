-- Adds a nullable avatar_url column, populated only from a real Google
-- sign-in (the id_token's `picture` claim) — never fabricated for
-- anonymous accounts, same principle as email in 0003_google_auth.sql.
-- The frontend shows this image in place of the initials placeholder
-- once it's set.

ALTER TABLE users ADD COLUMN avatar_url TEXT;
