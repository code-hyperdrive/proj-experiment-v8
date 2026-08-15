-- Adds Google sign-in support alongside the existing anonymous sessions.
-- `email`/`provider_user_id` are both nullable — anonymous accounts leave
-- them null rather than getting a fabricated email (deliberate choice,
-- see the plan doc: don't invent data that looks real but isn't). Once a
-- user signs in with Google, either an existing anonymous row gets these
-- filled in *in place* (same id — see lib/db.ts's linkAnonymousUserToProvider,
-- which is how favorites/history carry over with zero migration), or a
-- brand-new row is created directly with them already set.

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN provider_user_id TEXT;

-- Partial unique indexes — only enforced when the column is actually set,
-- so anonymous rows (both null) never collide with each other.
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_provider_identity ON users(sign_in_provider, provider_user_id) WHERE provider_user_id IS NOT NULL;
