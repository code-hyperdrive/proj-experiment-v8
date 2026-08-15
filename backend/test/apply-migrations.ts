import { applyD1Migrations, env } from 'cloudflare:test';

// Runs once before the test suite — applies the same migrations/0001_init.sql
// used by local dev to a fresh, isolated D1 instance the test runner
// manages (Miniflare's own storage, not .wrangler/state — never touches
// anything outside the test process).
//
// `TEST_MIGRATIONS` isn't part of our real Env (it's a test-only binding
// injected via vitest.config.ts's miniflare.bindings) — hence the `any`
// here rather than extending the production Env type for it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await applyD1Migrations(env.DB, (env as any).TEST_MIGRATIONS);
