import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';
import type { Env, Vars } from '../types';

/**
 * Origin allow-list, read from the ALLOWED_ORIGINS env var (comma-separated
 * — see wrangler.toml) rather than hardcoded, so local dev
 * (http://localhost:8080) and a future deployed origin
 * (https://radio.rathore.club) can differ per environment without a code
 * change. Never echoes '*' — Authorization is in play, and wildcard +
 * credentials is disallowed by browsers anyway.
 *
 * Note: this is a browser-enforced courtesy layer, not the real security
 * boundary — lib/auth.ts's JWT verification is. A non-browser client can
 * ignore CORS entirely; it still needs a valid token.
 */
export function corsMiddleware(): MiddlewareHandler<{ Bindings: Env; Variables: Vars }> {
  return cors({
    origin: (origin, c) => {
      const allowedOrigins: string = c.env.ALLOWED_ORIGINS;
      const allowed = allowedOrigins.split(',').map((s: string) => s.trim());
      return allowed.includes(origin) ? origin : '';
    },
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  });
}
