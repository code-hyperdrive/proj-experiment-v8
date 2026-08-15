import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { checkRateLimit } from '../../src/lib/ratelimit';

// Calls checkRateLimit() directly against Miniflare's real KV emulation —
// not through HTTP/Hono — so this exercises exactly this module's logic
// in isolation. Each test uses a unique key (crypto.randomUUID()) so
// tests can't interfere with each other regardless of storage isolation
// guarantees between test cases.

describe('checkRateLimit', () => {
  it('allows requests under the limit', async () => {
    const key = crypto.randomUUID();
    for (let i = 0; i < 5; i++) {
      const { allowed } = await checkRateLimit({ kv: env.RATE_LIMIT_KV, key, limit: 5, windowSeconds: 60 });
      expect(allowed).toBe(true);
    }
  });

  it('denies the request that would exceed the limit', async () => {
    const key = crypto.randomUUID();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit({ kv: env.RATE_LIMIT_KV, key, limit: 5, windowSeconds: 60 });
    }
    const { allowed } = await checkRateLimit({ kv: env.RATE_LIMIT_KV, key, limit: 5, windowSeconds: 60 });
    expect(allowed).toBe(false);
  });

  it('continues denying subsequent requests once over the limit', async () => {
    const key = crypto.randomUUID();
    for (let i = 0; i < 6; i++) {
      await checkRateLimit({ kv: env.RATE_LIMIT_KV, key, limit: 5, windowSeconds: 60 });
    }
    const { allowed } = await checkRateLimit({ kv: env.RATE_LIMIT_KV, key, limit: 5, windowSeconds: 60 });
    expect(allowed).toBe(false);
  });

  it('tracks different keys independently', async () => {
    const keyA = crypto.randomUUID();
    const keyB = crypto.randomUUID();

    for (let i = 0; i < 5; i++) {
      await checkRateLimit({ kv: env.RATE_LIMIT_KV, key: keyA, limit: 5, windowSeconds: 60 });
    }
    const exhaustedA = await checkRateLimit({ kv: env.RATE_LIMIT_KV, key: keyA, limit: 5, windowSeconds: 60 });
    const freshB = await checkRateLimit({ kv: env.RATE_LIMIT_KV, key: keyB, limit: 5, windowSeconds: 60 });

    expect(exhaustedA.allowed).toBe(false);
    expect(freshB.allowed).toBe(true);
  });

  it('allows exactly `limit` requests, not limit-1 or limit+1', async () => {
    const key = crypto.randomUUID();
    const results: boolean[] = [];
    for (let i = 0; i < 7; i++) {
      const { allowed } = await checkRateLimit({ kv: env.RATE_LIMIT_KV, key, limit: 3, windowSeconds: 60 });
      results.push(allowed);
    }
    expect(results).toEqual([true, true, true, false, false, false, false]);
  });

  it('resets the count in a new time window', async () => {
    const key = crypto.randomUUID();
    for (let i = 0; i < 2; i++) {
      await checkRateLimit({ kv: env.RATE_LIMIT_KV, key, limit: 2, windowSeconds: 1 });
    }
    const withinWindow = await checkRateLimit({ kv: env.RATE_LIMIT_KV, key, limit: 2, windowSeconds: 1 });
    expect(withinWindow.allowed).toBe(false);

    // Wait past the 1-second window boundary.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const nextWindow = await checkRateLimit({ kv: env.RATE_LIMIT_KV, key, limit: 2, windowSeconds: 1 });
    expect(nextWindow.allowed).toBe(true);
  });
});
