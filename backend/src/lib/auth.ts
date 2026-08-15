import type { MiddlewareHandler } from 'hono';
import type { Env, Vars } from '../types';
import { hashToken, SESSION_TTL_MS } from './session';
import { findSessionByTokenHash, touchSession } from './db';

/**
 * Verifies the request's `Authorization: Bearer <sessionToken>` header by
 * hashing it and looking up the hash in the `sessions` table (D1) — no
 * signature/cryptographic verification, no external identity provider,
 * no secret key anywhere. On a valid, unexpired match, sets `uid` (from
 * the session's `user_id` — never from the request body/query) on the
 * Hono context for downstream handlers, and slides the session's expiry
 * forward so actively-used sessions stay alive.
 */
export function requireAuth(): MiddlewareHandler<{ Bindings: Env; Variables: Vars }> {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      return c.json({ error: 'Missing or malformed Authorization header' }, 401);
    }

    const tokenHash = await hashToken(match[1]);
    const session = await findSessionByTokenHash(c.env.DB, tokenHash);
    if (!session || session.expiresAt < Date.now()) {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    c.set('uid', session.userId);
    c.set('tokenHash', tokenHash);
    await touchSession(c.env.DB, tokenHash, Date.now() + SESSION_TTL_MS);

    await next();
  };
}
