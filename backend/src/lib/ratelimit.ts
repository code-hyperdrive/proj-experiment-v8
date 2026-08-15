import type { Context, MiddlewareHandler } from 'hono';
import type { Env, Vars } from '../types';

type AppContext = Context<{ Bindings: Env; Variables: Vars }>;

/**
 * Fixed-window counter in KV. Simpler and more portable than Cloudflare's
 * native Workers Rate Limiting binding (which is plan/account-gated) —
 * this works identically under `wrangler dev --local`'s KV emulation and
 * once actually deployed, with no account-feature dependency. Swap for
 * the native binding later if desired; the call site (rateLimit() below)
 * is the only thing that would need to change.
 */
export async function checkRateLimit(opts: {
  kv: KVNamespace;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean }> {
  const windowId = Math.floor(Date.now() / (opts.windowSeconds * 1000));
  const storageKey = `rl:${opts.key}:${windowId}`;

  const currentRaw = await opts.kv.get(storageKey);
  const current = currentRaw ? parseInt(currentRaw, 10) : 0;

  if (current >= opts.limit) {
    return { allowed: false };
  }

  // TTL of 2 windows is enough for the key to expire itself once the
  // window has fully passed — no separate cleanup needed. Clamped to 60s
  // because Cloudflare KV hard-rejects any expirationTtl below that
  // (confirmed by a real test failure, not documentation-reading) — every
  // current call site uses windowSeconds >= 60 so this never bites today,
  // but a future caller configuring a shorter burst window would
  // otherwise get a raw KV put() failure instead of working rate limiting.
  await opts.kv.put(storageKey, String(current + 1), {
    expirationTtl: Math.max(60, opts.windowSeconds * 2),
  });
  return { allowed: true };
}

/**
 * Hono middleware wrapping checkRateLimit(). `keyFn` decides what's being
 * limited together — e.g. per authenticated uid for the private routes,
 * per source IP for the public /stats route. Must run after requireAuth()
 * when keying by uid, since that's what sets it on the context.
 */
export function rateLimit(opts: {
  limit: number;
  windowSeconds: number;
  keyFn: (c: AppContext) => string;
}): MiddlewareHandler<{ Bindings: Env; Variables: Vars }> {
  return async (c, next) => {
    const { allowed } = await checkRateLimit({
      kv: c.env.RATE_LIMIT_KV,
      key: opts.keyFn(c),
      limit: opts.limit,
      windowSeconds: opts.windowSeconds,
    });
    if (!allowed) {
      return c.json({ error: 'Rate limit exceeded, try again shortly' }, 429);
    }
    await next();
  };
}
