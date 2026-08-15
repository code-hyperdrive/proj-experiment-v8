import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { env } from 'cloudflare:test';
import { requireAuth } from '../../src/lib/auth';
import { createAnonymousUserWithSession, findSessionByTokenHash } from '../../src/lib/db';
import { hashToken } from '../../src/lib/session';
import type { Env, Vars } from '../../src/types';

/** A minimal throwaway app with just the middleware under test, not the full route tree in src/index.ts. */
function buildTestApp() {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();
  app.use('*', requireAuth());
  app.get('/', (c) => c.json({ uid: c.get('uid'), tokenHash: c.get('tokenHash') }));
  return app;
}

/** Creates a session directly via the DB layer for a caller-chosen raw token, returning its userId. */
async function createSession(rawToken: string, expiresAt = Date.now() + 1_000_000): Promise<string> {
  const userId = crypto.randomUUID();
  const tokenHash = await hashToken(rawToken);
  await createAnonymousUserWithSession(env.DB, { userId, tokenHash, now: Date.now(), expiresAt });
  return userId;
}

describe('requireAuth middleware', () => {
  it('401s with no Authorization header at all', async () => {
    const app = buildTestApp();
    const res = await app.request('/', {}, env);
    expect(res.status).toBe(401);
    const body = await res.json<any>();
    expect(body.error).toMatch(/Authorization header/i);
  });

  it('401s when the header has no "Bearer" prefix', async () => {
    const app = buildTestApp();
    const res = await app.request('/', { headers: { Authorization: 'sometoken' } }, env);
    expect(res.status).toBe(401);
  });

  it('401s when "Bearer" has no token after it', async () => {
    const app = buildTestApp();
    const res = await app.request('/', { headers: { Authorization: 'Bearer' } }, env);
    expect(res.status).toBe(401);
  });

  it('401s when "Bearer " is followed only by whitespace', async () => {
    const app = buildTestApp();
    const res = await app.request('/', { headers: { Authorization: 'Bearer    ' } }, env);
    expect(res.status).toBe(401);
  });

  it('401s for a well-formed but never-issued token', async () => {
    const app = buildTestApp();
    const res = await app.request('/', { headers: { Authorization: 'Bearer never-issued-token' } }, env);
    expect(res.status).toBe(401);
    const body = await res.json<any>();
    expect(body.error).toMatch(/Invalid or expired session/i);
  });

  it('accepts a valid token and sets uid on context', async () => {
    const token = 'a-valid-raw-token-' + crypto.randomUUID();
    const userId = await createSession(token);

    const app = buildTestApp();
    const res = await app.request('/', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.uid).toBe(userId);
  });

  it('is case-insensitive on the "Bearer" scheme name', async () => {
    const token = 'case-test-' + crypto.randomUUID();
    await createSession(token);

    const app = buildTestApp();
    const res = await app.request('/', { headers: { Authorization: `bearer ${token}` } }, env);
    expect(res.status).toBe(200);
  });

  it('401s for an expired session', async () => {
    const token = 'expiring-token-' + crypto.randomUUID();
    await createSession(token, Date.now() - 1000); // already expired

    const app = buildTestApp();
    const res = await app.request('/', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(401);
  });

  it('slides the session expiry forward on a successful request', async () => {
    const token = 'sliding-token-' + crypto.randomUUID();
    const originalExpiry = Date.now() + 1000; // about to expire soon
    await createSession(token, originalExpiry);

    const app = buildTestApp();
    const res = await app.request('/', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);

    const tokenHash = await hashToken(token);
    const session = await findSessionByTokenHash(env.DB, tokenHash);
    expect(session!.expiresAt).toBeGreaterThan(originalExpiry);
  });
});
