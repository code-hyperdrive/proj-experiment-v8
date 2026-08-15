import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { env } from 'cloudflare:test';
import { corsMiddleware } from '../../src/lib/cors';
import type { Env, Vars } from '../../src/types';

function buildTestApp() {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();
  app.use('*', corsMiddleware());
  app.get('/', (c) => c.json({ ok: true }));
  return app;
}

// env.ALLOWED_ORIGINS in the test environment (wrangler.toml's [vars]) is
// "http://localhost:8080,http://127.0.0.1:8080,https://radio.rathore.club".

describe('corsMiddleware', () => {
  it('echoes back an allowed origin', async () => {
    const app = buildTestApp();
    const res = await app.request('/', { headers: { Origin: 'http://localhost:8080' } }, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8080');
  });

  it('echoes back the real production origin', async () => {
    const app = buildTestApp();
    const res = await app.request('/', { headers: { Origin: 'https://radio.rathore.club' } }, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://radio.rathore.club');
  });

  it('does not echo a disallowed origin', async () => {
    const app = buildTestApp();
    const res = await app.request('/', { headers: { Origin: 'https://evil.example.com' } }, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeFalsy();
  });

  it('never returns a wildcard origin', async () => {
    const app = buildTestApp();
    const res = await app.request('/', { headers: { Origin: 'https://radio.rathore.club' } }, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('handles a request with no Origin header at all without error', async () => {
    const app = buildTestApp();
    const res = await app.request('/', {}, env);
    expect(res.status).toBe(200);
  });

  it('responds to an OPTIONS preflight with the allowed methods/headers', async () => {
    const app = buildTestApp();
    const res = await app.request(
      '/',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:8080',
          'Access-Control-Request-Method': 'PATCH',
          'Access-Control-Request-Headers': 'Authorization, Content-Type',
        },
      },
      env
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8080');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('is case-sensitive / exact-match on origin (a substring is not enough)', async () => {
    const app = buildTestApp();
    const res = await app.request('/', { headers: { Origin: 'http://localhost:8080.evil.com' } }, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeFalsy();
  });
});
